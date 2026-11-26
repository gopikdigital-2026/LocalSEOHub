# LocalSEOHub.io — GBP-02-PREDEPLOY-02 · Preparación de activación controlada

Fecha: 2026-11-26 · Modo: solo lectura · Base: GBP-02-FIX03B-IMPLEMENT (ZIP sha256 `a8f28bd7…a298`)
Operaciones realizadas: únicamente `SELECT` sobre catálogos y `connected_sources` (sin leer tokens), listados de migraciones, funciones y nombres de secretos. Ninguna escritura, migración, despliegue ni llamada a Google/Meta.

---

## 1. Estado real encontrado (producción)

### 1.1 Conexiones GBP (`connected_sources`, `source_type = 'google_business'`)

| Estado | Fase | Filas | Credenciales | Observación |
|---|---|---|---|---|
| connected | connected | 1 | access + refresh, ambos en Vault (0 en claro) | Token de acceso caducado (normal; se renueva en la próxima sincronización). Última actualización 2026-11-23 |
| disconnected | (sin fase) | 1 | ninguna | Antigua (2026-08-17) |
| disconnected | ended | 1 | ninguna | 2026-10-27 |

- **Intentos OAuth en curso: 0** (ninguna fila `connecting`, ninguna con `oauth_state` pendiente ni `oauth_state_hash`).
- **Credenciales a preservar: 1 conexión activa** (1 usuario, 1 negocio). M1 no la modifica; solo se descartan credenciales cuando ese mismo negocio inicia una reconexión (comportamiento previsto).
- Secretos en Vault: 3 en total. Otras fuentes no GBP: 2 (no afectadas).
- Disparadores activos en `connected_sources`: `clear_on_disconnect`, `forget_on_delete`, `server_owned_gbp` (los tres requeridos por FIX03B).

### 1.2 Base de datos y migraciones

- PostgreSQL **17.11** (misma versión que la BD desechable de integración). `pg_input_is_valid` y extensión Vault disponibles.
- Migraciones registradas: **61**, última `20261101230430_a3752…`. Ninguna migración FIX03B aplicada.
  - Nota: el repositorio tiene 62 ficheros; la diferencia es histórica (los dos ficheros iniciales `old_beacon`/`precious_term` figuran en producción como un único `silent_coast`). No afecta a GBP.
- Funciones GBP existentes: `gbp_clear_credentials`, `gbp_credential_invariant_violations`, `gbp_read_credentials`, `gbp_store_credentials`, `gbp_vault_forget`, `gbp_vault_put`, `gbp_vault_reveal`. Todas `SECURITY DEFINER`, `search_path=""`, EXECUTE solo `service_role` (anon/authenticated: no).
- **Las 5 funciones nuevas de M1 no existen** (correcto: pendientes).
- `gbp_store_credentials` en producción: md5 sin espacios `0a1ea0b065c265df1bc6b01e54ebcf5b` = **idéntico** al cuerpo que restaura la reversión de M1 y al usado en la integración. La reversión es exacta para este entorno.

### 1.3 Funciones Edge

- Las 5 afectadas están `ACTIVE` y en producción con la versión **anterior** a FIX03B: `gbp-oauth-callback` (verify_jwt=false), `gbp-sync`, `gbp-list-locations`, `gbp-disconnect`, `gbp-reviews` (verify_jwt=true).
- Evidencia: las RPC que usa el código FIX03B no existen en la BD, el registro de despliegue no ha cambiado desde la fase anterior y las 5 carpetas locales difieren de FIX03A-REPIN solo en los archivos FIX03B. No es posible comparar byte a byte el código desplegado sin desplegar (limitación declarada).
- `gbp-oauth-start` y `gbp-recover-attempt`: **sin cambios** respecto a la base; no se redespliegan. `gbp-oauth-start` ya genera `state` de 64 hex, `oauth_started_at` ISO UTC, `access_type=offline` y `prompt=consent` (compatible con M1).
- Secretos necesarios presentes (solo nombres): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- La herramienta de despliegue publica **todas** las funciones modificadas a la vez: hoy son exactamente estas 5 (el resto figura sin cambios). No se puede desplegar una sola.

### 1.4 Entorno de staging

- **No existe staging separado.** Solo hay un proyecto Supabase conectado (producción). La única base aislada usada fue la PostgreSQL desechable local, que ya no existe y no tiene Edge Functions ni Google.

---

## 2. Compatibilidad entre versiones

| Ventana | Código desplegado | BD | Resultado |
|---|---|---|---|
| A. Hoy | antiguo | sin M1 | Funciona, con defectos H2/H3 abiertos |
| B. M1 aplicada, funciones antiguas | antiguo | M1 | **Conexiones nuevas FALLAN** de forma segura: el callback antiguo guarda credenciales en fase `authorizing`, M1 lo rechaza → `CREDENTIAL_STORE_FAILED`, intento cerrado, sin mezcla. Sincronización, reseñas, ubicaciones y desconexión de la conexión activa **siguen funcionando** (el guardado está permitido en `connected`/`select_location`) |
| C. Despliegue parcial (segundos) | mezcla | M1 | Callback nuevo + gbpToken antiguo: correcto. Callback antiguo + gbpToken nuevo: igual que B |
| D. M1 + 5 funciones nuevas | nuevo | M1 | Estado objetivo. El guardado heredado sigue concedido pero no lo usa ningún consumidor |
| E. M2 aplicada | nuevo | M1+M2 | Correcto. **Si quedara algún consumidor antiguo, su renovación de token fallaría (42501)** |
| X. Funciones nuevas SIN M1 | nuevo | sin M1 | **Prohibido**: callback y renovación fallan (RPC inexistentes) |

**Corrección al informe FIX03B §6.3:** M1 no es totalmente compatible hacia atrás. Lo es para sincronización/renovación, pero bloquea conexiones nuevas hasta desplegar el callback nuevo. Consecuencia: M1 y el despliegue deben ejecutarse **en la misma ventana, seguidos** (minutos), con la conexión de Google sin uso por clientes.

Otros puntos:
- La conexión activa existente es compatible: tras D, la primera sincronización renovará el token vía `gbp_refresh_credentials` (estado `connected`, refresh en Vault). No hace falta reconectar.
- Códigos nuevos `ALREADY_USED`, `ATTEMPT_SUPERSEDED`, `CODE_EXCHANGE_FAILED` no tienen mensaje propio en la pantalla de retorno; se muestra el mensaje genérico "No se pudo completar la conexión con Google. Puedes volver a intentarlo." Aceptable (P3), sin fuga de detalles.

---

## 3. Pruebas pendientes

Sin staging, todas las pruebas con Edge Functions o Google requieren producción. Propuesta: **canario en producción** con la cuenta interna (Gopik Digital) y dos negocios de prueba, en ventana sin clientes.

| # | Comprobación | Dónde | Cuenta real Google | Criterio de éxito |
|---|---|---|---|---|
| P1 | Conexión real de cuenta autorizada | Prod (canario) | Sí | Vuelta a la app con lista de cuentas; fila `connecting`, fase `select_location`, access+refresh `vault:`, `oauth_state` ausente, `oauth_state_hash` presente |
| P2 | Selección de ubicación | Prod (canario) | Sí | Fila `connected`, `external_location_id` informado |
| P3 | Sincronización y lectura de reseñas | Prod (canario) | Sí | Sincronización OK; reseñas mostradas; si falla la lectura debe mostrarse error, no "0 verificadas" (defecto conocido, fuera de alcance) |
| P4 | Renovación de credenciales | Prod (canario) | Sí | Con token caducado (la conexión activa actual ya lo está), una sincronización renueva: `token_expires_at` futuro, ref `vault:` nueva, secreto anterior eliminado, `gbp_credential_invariant_violations()` vacío |
| P5 | Reconexión | Prod (canario) | Sí | Credenciales anteriores eliminadas al consumir; nuevas guardadas; ningún secreto huérfano |
| P6 | Reutilizar el enlace de retorno (doble clic / atrás) | Prod (canario) | Sí (1 intento) | Segundo uso → mensaje genérico, sin cambiar credenciales |
| P7 | Desconexión | Prod (canario) | Sí | `disconnected`, ambas referencias nulas, secretos Vault eliminados |
| P8 | Aislamiento entre dos negocios | Prod (canario) | Sí (2 usuarios, 2 negocios) | Usuario B no ve ni opera la conexión/reseñas/ubicaciones de A (UI y llamadas directas con el token de B → 403/404) |
| P9 | Error de Google: denegar permisos en la pantalla de Google | Prod (canario) | Sí | `GOOGLE_CONSENT_DENIED`, sin credenciales |
| P10 | Intento caducado (esperar >15 min en Google) | Prod (canario) | Sí | `ATTEMPT_EXPIRED`, sin credenciales |
| P11 | Ventana B simulada (M1 sobre esquema actual) | BD desechable | No | Ya cubierto por I-15/I-0; no se repite |
| P12 | ACL, CAS, concurrencia, atomicidad Vault, reversión | BD desechable | No | Ya cubierto (25/25); no se repite |

Ninguna se ejecuta en esta fase.

---

## 4. Procedimiento de activación

Cada paso marcado **[PROD]** requiere confirmación expresa del responsable antes de ejecutarse.

### Paso 0 — Comprobaciones previas (solo lectura, inmediatamente antes)

```sql
-- 0.1 Sin intentos en curso (debe ser 0)
SELECT count(*) FROM public.connected_sources
WHERE source_type='google_business' AND status='connecting';
-- 0.2 Cuerpo del guardado heredado sin cambios (debe ser 0a1ea0b065c265df1bc6b01e54ebcf5b)
SELECT md5(regexp_replace(prosrc,'\s','','g')) FROM pg_proc WHERE proname='gbp_store_credentials';
-- 0.3 Funciones FIX03B inexistentes (debe ser 0)
SELECT count(*) FROM pg_proc WHERE proname IN ('gbp_oauth_started_at','gbp_consume_oauth_state',
 'gbp_complete_oauth_attempt','gbp_fail_oauth_attempt','gbp_refresh_credentials');
-- 0.4 Invariantes de credenciales (debe estar vacío)
SELECT * FROM public.gbp_credential_invariant_violations();
-- 0.5 Foto de la conexión activa (sin tokens)
SELECT id, status, metadata->>'phase', token_expires_at,
       access_token_encrypted LIKE 'vault:%' a_v, refresh_token_encrypted LIKE 'vault:%' r_v
FROM public.connected_sources WHERE source_type='google_business';
```
Además: hashes locales = `SHA256_INVENTARIO.tsv`; solo las 5 funciones GBP figuran como modificadas; ZIP de reversión FIX03A-REPIN disponible.
**Detener si** 0.1 ≠ 0 (esperar o dejar que `gbp-recover-attempt` cierre), 0.2 distinto, 0.3 ≠ 0 o 0.4 no vacío.

### Paso 1 — [PROD] Aplicar M1
Copiar `auditoria-a2/gbp02-fix03b/migrations/20261126120000_gbp02_fix03b_oauth_transactional.sql` a `supabase/migrations/` y aplicarlo con la herramienta de migraciones (transacción única).
**Éxito:** 5 funciones nuevas existen; todas `SECURITY DEFINER`, `search_path=""`; `has_function_privilege` anon/authenticated = false, service_role = true; md5 del resto de funciones GBP sin cambios; 0.4 vacío.
**Detener si** falla la aplicación (la transacción no deja cambios) o cualquier ACL difiere → no desplegar; investigar.

### Paso 2 — [PROD] Desplegar las 5 funciones (inmediatamente después del paso 1)
Herramienta de despliegue (publica `gbp-oauth-callback`, `gbp-sync`, `gbp-list-locations`, `gbp-disconnect`, `gbp-reviews`).
**Éxito:** las 5 `ACTIVE`; `verify_jwt` sin cambios (callback false, resto true); ninguna otra función publicada.
**Detener si** alguna falla al desplegar → ir a Reversión R1 (no dejar la ventana B abierta).

### Paso 3 — [PROD] Verificación de funcionamiento (canario)
Ejecutar P4 (renovación con la conexión activa existente), después P1, P2, P3, P6, P7, P9 y P8. P5 y P10 si el tiempo lo permite.
Tras cada prueba: 0.4 vacío y número de secretos Vault coherente (2 por conexión con credenciales).
**Detener y revertir (R1) si:** se mezclan credenciales entre intentos, una renovación tardía sobrescribe credenciales nuevas, aparece un secreto huérfano, B accede a datos de A, se muestra texto técnico al usuario, o la conexión activa pierde credenciales sin reconectar.

### Paso 4 — [PROD] Aplicar M2 (solo tras paso 3 completo)
Requisitos: las 5 funciones nuevas desplegadas y verificadas; ninguna otra función llama a `gbp_store_credentials` (comprobado: solo los 5 consumidores antiguos, ya sustituidos).
Copiar `…/20261126120100_gbp02_fix03b_revoke_blind_store.sql` a `supabase/migrations/` y aplicar.
**Éxito:** `has_function_privilege('service_role','public.gbp_store_credentials(uuid,text,text,timestamptz)','EXECUTE') = false`; repetir P4 (renovación) y una sincronización: correctas.
**Detener si** cualquier renovación falla con 42501 → R2 inmediato.

---

## 5. Reversión

Principio: nunca volver al código antiguo con las conexiones nuevas abiertas, porque eso reintroduce H2. Durante la reversión, las conexiones nuevas se **cierran de forma segura** con el callback alternativo de cierre seguro: consume el `state`, cierra el intento con `CONNECTION_TEMPORARILY_UNAVAILABLE` y nunca canjea el código.

- **R2 — revertir M2** [PROD]: aplicar `rollback/ROLLBACK_gbp02_fix03b_revoke_blind_store.sql` (un solo GRANT). Sin efecto sobre datos.
- **R1 — revertir FIX03B completo** [PROD], en este orden:
  1. Si M2 está aplicada → R2.
  2. Sustituir `supabase/functions/gbp-oauth-callback/{handler,index}.ts` por `rollback/gbp-oauth-callback-safe-close/` y las 4 copias de `gbpToken.ts` por las de FIX03A-REPIN; desplegar. La variante de cierre seguro necesita M1 (usa la RPC de consumo), por eso se despliega **antes** de revertir M1.
  3. Solo si es imprescindible eliminar M1: aplicar `rollback/ROLLBACK_gbp02_fix03b_oauth_transactional.sql`. Restaura `gbp_store_credentials` exactamente (md5 `0a1ea0b0…cf5b`, verificado en producción) y elimina las funciones nuevas. Las filas en fase `exchanging` las cierra `gbp-recover-attempt` a los 15 min. **Tras este paso el callback de cierre seguro deja de funcionar**: mantener la conexión de Google desactivada (sin redesplegar el callback antiguo) hasta una nueva corrección.
- **Conexiones existentes:** ninguna reversión borra credenciales de filas `connected`; con gbpToken antiguo siguen renovándose con el guardado heredado. Riesgo residual H3 en reversión: solo afecta a una renovación tardía tras una reconexión, y en reversión no hay reconexiones posibles.
- **Restaurar el código anterior en el repositorio:** desde `deliverables/localseohub-gbp02-fix03a-repin.zip` (o el historial de versiones de Bolt).

---

## 6. Riesgos

**Bloqueantes para producción sin canario:** ninguno técnico en BD o código. Hay un **bloqueante de proceso**: no existe staging, así que P1–P10 solo pueden validarse en producción.

| Nivel | Riesgo | Mitigación |
|---|---|---|
| P1 | Sin staging: primera ejecución real en producción | Canario con cuenta interna, ventana sin clientes, R1 preparada |
| P1 | Ventana B: conexiones nuevas bloqueadas entre M1 y el despliegue | Pasos 1 y 2 seguidos; 0 intentos en curso |
| P2 | Google no devuelve refresh token → `CODE_EXCHANGE_FAILED` | `prompt=consent` + `access_type=offline` ya en producción; validar en P1 |
| P2 | M2 con un consumidor antiguo rompe la renovación | M2 solo tras paso 3; R2 es un GRANT |
| P2 | Aislamiento entre negocios no validado manualmente | P8 obligatoria antes del piloto de 20 negocios |
| P3 | Mensaje genérico para códigos nuevos | Aceptable; mejorar en fase posterior |
| P3 | Sin comparación byte a byte del código desplegado | Inferencia por RPC inexistentes y registro de despliegue |
| — | Abiertos fuera de alcance: un negocio por usuario en OAuth; reseñas "0 verificadas" ante error | Fases posteriores |

---

## 7. Orden exacto de activación

0. Comprobaciones previas (lectura) → 1. [PROD] M1 → 2. [PROD] desplegar las 5 funciones (seguido) → 3. [PROD] verificación canario P4, P1, P2, P3, P6, P7, P9, P8 → 4. [PROD] M2 → repetir P4.

## 8. Veredicto

**GO para solicitar autorización de despliegue**, condicionado a que se acepte expresamente:
1. validar en producción con un canario, porque no hay staging;
2. ejecutar los pasos 1 y 2 seguidos, en una ventana sin uso de clientes;
3. no aplicar M2 hasta completar el paso 3;
4. no empezar el piloto de 20 negocios hasta superar P8.

Sin aceptar estas condiciones: **NO-GO**.

Pruebas no repetidas en esta fase (evidencia válida previa): suite 3.365/3.365, integración 25/25, build, tipos y lint.
