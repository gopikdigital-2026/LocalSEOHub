# LocalSEOHub.io — GBP-02-FIX03B-IMPLEMENT · Informe final

Fecha: 2026-11-26 · Base: FIX03A-REPIN (3.347/3.347) · Diseño: FIX03B-03 aprobado
Estado: **IMPLEMENTADO Y PROBADO EN LOCAL — SIN DESPLIEGUE — PENDIENTE DE AUDITORÍA INDEPENDIENTE**

## 1. Alcance

Corrige H2 (credenciales de autorizaciones distintas mezcladas) y H3 (refresco tardío o concurrente que sobrescribe credenciales nuevas).

- El `state` OAuth se consume **una sola vez**, bajo bloqueo de fila, con ventana de 15 min y validación estricta de fecha (fechas inválidas, ausentes o futuras > 30 s ⇒ intento cerrado como `ATTEMPT_EXPIRED`).
- Al consumir se descartan las credenciales anteriores; la nueva autorización se guarda **en una única transacción** (Vault + fila + fase `select_location`) y solo si coinciden fuente, usuario, negocio, `attempt_id` y hash del `state`.
- El refresco de token es **compare-and-swap** contra el par leído: un refresco antiguo nunca sobrescribe credenciales nuevas.
- Todas las funciones nuevas: `SECURITY DEFINER`, `search_path = ''`, EXECUTE solo para `service_role`.

## 2. Archivos

Inventario completo con SHA-256 antes/después: `SHA256_INVENTARIO.tsv` (18 entradas: 10 MODIFICADO + 8 NUEVO).

Modificados (10):
- `supabase/functions/gbp-oauth-callback/handler.ts`, `index.ts`
- `supabase/functions/{gbp-sync,gbp-list-locations,gbp-disconnect,gbp-reviews}/gbpToken.ts` (4 copias idénticas, sha256 `e31f2526…0495`)
- Pruebas adaptadas: `a3422GbpRecovery`, `a341GbpSecurity`, `gbp02Fix02cDependencies`
- Guardián `a351MetaConnection.test.ts`: solo las 2 huellas congeladas del callback (repin)

Nuevos (8): prueba `gbp02Fix03bTransactional.test.ts`, 2 migraciones, 2 SQL de reversión, variante de callback de cierre seguro (`handler.ts`, `index.ts`), arnés `harness/integration.cjs`.

Sin cambios (verificado contra el ZIP FIX03A-REPIN): `supabase/migrations/`, `config.toml`, `gbp-oauth-start`, `gbp-recover-attempt`, resto de handlers GBP, Facebook, Instagram, Hoy, Tu Semana, Stripe, autenticación.

## 3. Migraciones preparadas (NO aplicadas en producción)

| Archivo | Contenido | Estado |
|---|---|---|
| `migrations/20261126120000_gbp02_fix03b_oauth_transactional.sql` | `gbp_oauth_started_at`, `gbp_consume_oauth_state`, `gbp_complete_oauth_attempt`, `gbp_fail_oauth_attempt`, `gbp_refresh_credentials`; guarda de fase en `gbp_store_credentials` | Solo BD desechable |
| `migrations/20261126120100_gbp02_fix03b_revoke_blind_store.sql` | `REVOKE EXECUTE gbp_store_credentials FROM service_role` | Solo BD desechable |
| `rollback/ROLLBACK_gbp02_fix03b_oauth_transactional.sql` | Elimina las 5 funciones nuevas y restaura `gbp_store_credentials` original (md5 sin espacios `0a1ea0b065c265df1bc6b01e54ebcf5b`) | Ensayado |
| `rollback/ROLLBACK_gbp02_fix03b_revoke_blind_store.sql` | Devuelve el GRANT a `service_role` | Ensayado |
| `rollback/gbp-oauth-callback-safe-close/` | Callback alternativo: consume el `state`, cierra el intento con `CONNECTION_TEMPORARILY_UNAVAILABLE`, nunca canjea el código | No desplegado |

Están fuera de `supabase/migrations/` a propósito para que nada las aplique por accidente.

## 4. Pruebas EJECUTADAS

| Prueba | Resultado | Evidencia |
|---|---|---|
| Suite completa Vitest (102 ficheros) | **3.365/3.365 PASS** (3.347 base + 18 nuevas) | `evidence/vitest-run.log` |
| TypeScript (`tsc -p tsconfig.app.json`) | 19 errores, **todos preexistentes** (base: 20); 0 en ficheros GBP/FIX03B | `evidence/typecheck.log` |
| ESLint | 57 problemas, mismos ficheros que la base; 0 en ficheros modificados | `evidence/eslint.log` |
| Build Vite | Correcto | `evidence/build.log` |
| Integración PostgreSQL 17.11 desechable (localhost:55432, réplica de 62 migraciones) | **25/25 PASS** | `evidence/integration-results.json` |

Integración cubre: matriz de fechas (U-B); consumo único, `ALREADY_USED`, `NOT_FOUND` (I-1…I-3); bordes de caducidad (I-4); consumo concurrente con espera de bloqueo (I-5); `complete` con identidad errónea, entrada inválida, doble `complete`, caducidad tardía (I-6…I-10); intento A superado por B sin mezcla (I-11); `fail` (I-12); CAS de refresco y validación (I-13, I-21); refresco tardío tras reconexión (I-14); guarda del store heredado (I-15); refrescos concurrentes (I-16); ACL 42501 y propiedades de funciones (I-17); atomicidad Vault ante fallo forzado (I-18); aislamiento entre usuarios en BD (I-19); funciones previas intactas (I-20); reversión M1 + reaplicación (I-22); M2 y su reversión (I-23).

Nota: el entorno se reinició tras la implementación y se perdieron los registros intermedios; la suite, tipos, lint y build se **volvieron a ejecutar** el 2026-11-26 sobre el código final (sin cambios). La integración no se pudo repetir (la BD desechable ya no existe); consta su resultado guardado.

## 5. Pruebas PENDIENTES — NO EJECUTADAS

- **Staging**: aplicación de M1 y despliegue de las 5 funciones en un entorno no productivo — NO EJECUTADA.
- **Google real**: flujo OAuth completo, emisión de `refresh_token` con `prompt=consent`, refresco real, revocación — NO EJECUTADA.
- **Aislamiento manual entre negocios**: validación manual multi-tenant (RLS, autorización de Edge Functions, acceso GBP cruzado con cuentas reales) — NO EJECUTADA. I-19 solo lo cubre a nivel de BD desechable.
- Despliegue y reversión en producción — NO EJECUTADOS (prohibidos en esta fase).

## 6. Riesgos residuales y defectos

1. **Orden de despliegue obligatorio**: M1 → 5 funciones (`gbp-oauth-callback`, `gbp-sync`, `gbp-list-locations`, `gbp-disconnect`, `gbp-reviews`) → M2. Desplegar las funciones sin M1 rompe la conexión y el refresco. Aplicar M2 con consumidores antiguos rompe su refresco.
2. **Toda nueva autorización exige `refresh_token`**; si Google no lo envía, el intento falla con `CODE_EXCHANGE_FAILED` (antes se reutilizaba el anterior, que era precisamente H2). Mitigado por `access_type=offline` + `prompt=consent`, pendiente de verificar con Google real.
3. M1 es compatible hacia atrás: los consumidores antiguos siguen usando el store heredado en `select_location`/`connected`.
4. Siguen abiertos (fuera de alcance): suposición de un negocio por usuario en el flujo OAuth; fallos de lectura de reseñas mostrados como "0 verificadas"; errores TypeScript/ESLint preexistentes.
5. No se detectaron defectos nuevos en las pruebas ejecutadas.

## 7. Entregables

- `deliverables/localseohub-gbp02-fix03b-implement.zip` (copia en la raíz del proyecto).
- Excluidos del ZIP: `.env`, `node_modules/`, `dist/`, ZIP anteriores. Escaneo de secretos: ver `evidence/zip-integrity.txt`.

**Veredicto de esta fase**: implementación lista para auditoría independiente. No apta para producción hasta completar las pruebas de la sección 5.
