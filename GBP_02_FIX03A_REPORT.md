# LocalSEOHub.io — GBP-02-FIX03A · Informe de implementación

**Alcance:** exclusivamente hallazgo H1 de PREDEPLOY-01 (cancelación / caducidad de un intento GBP en `select_location` que ya tiene credenciales).
**Modo:** implementación controlada — alcance estricto. Sin despliegues, sin migraciones, sin cambios de RLS/índices/constraints, sin re-pin de hashes.

## Veredicto

**NO-GO — BLOQUEADO PARA REVISIÓN.**
La corrección está implementada y validada, pero modifica un archivo congelado (`supabase/functions/gbp-recover-attempt/index.ts`). El guardián Meta lo detecta (99/100) y, conforme a la especificación, **no se ha actualizado el hash**. Se requiere auditoría independiente y autorización explícita.

## 1. Corrección de la premisa de H1

El informe PREDEPLOY-01 afirmó que cancelar/caducar un intento con credenciales dejaba credenciales huérfanas o violaba la CHECK. **Esa premisa era incorrecta**: no consideró el trigger vivo.

- Trigger `connected_sources_clear_on_disconnect` (BEFORE INSERT OR UPDATE, SECURITY DEFINER; migración `20261019194350_a341_gbp_security_hardening.sql`). Cuando `NEW.status='disconnected'`: llama a `gbp_vault_forget` sobre las referencias, anula access/refresh token, `token_expires_at`, `external_account_id`, `external_location_id` y elimina `metadata.oauth_state`.
- Los triggers BEFORE ROW se ejecutan antes de evaluar la CHECK `connected_sources_disconnected_no_credentials`, por lo que la transición es atómica y la CHECK se cumple.
- Simulación sin efectos persistentes (evidencia 00): con trigger → `rows=1 status=disconnected` y credenciales en NULL; otra conexión intacta. Sin trigger → `check_violation`.
- Producción (solo lectura): `invariant_violations=0`, `stuck_select_location=0`, `ended_with_creds=0`.

## 2. Defecto residual real

En el adaptador (`updateIfUnchanged`), un **error de base de datos** (p. ej. fallo de Vault dentro del trigger, caída de conexión) se trataba igual que «0 filas coincidentes» (conflicto de concurrencia). Resultado: la función respondía `200 {success:true, recovered:false, changed:true}` ante un fallo. Es decir, **se presentaba un fallo como éxito**. Los datos no quedaban inconsistentes (la sentencia se aborta), pero el cliente recibía información falsa.

## 3. Fase B · Evaluación de alternativas

| Criterio | A · RPC existente `gbp_clear_credentials` | B · Cambio transaccional en BD |
|---|---|---|
| Atomicidad | No: dos llamadas separadas (limpiar + cambiar estado) | Sí |
| Bloqueo optimista | Lo rompe: actualiza `updated_at=now()`, la actualización posterior por `updated_at` deja de coincidir | — |
| Aislamiento | Filtra solo por `id` | Depende del diseño |
| Necesidad | Redundante: el trigger ya hace la limpieza | Innecesaria por el mismo motivo |
| Permitido por la especificación | Sí, pero introduce riesgo | No (requiere migración) |

**Decisión:** no implementar A ni B y no crear rutas paralelas. La corrección mínima segura es clasificar correctamente el resultado en el adaptador.

## 4. Cambio realizado

Archivo único de producción: `supabase/functions/gbp-recover-attempt/index.ts` (`handler.ts` **sin cambios**).

```diff
       .select("id");
-    return !error && Array.isArray(data) && data.length === 1;
+    // A database error must surface as a failure; only zero matched rows is a concurrency conflict.
+    if (error || !Array.isArray(data)) throw new Error("state update failed");
+    return data.length === 1;
```

Efecto: el `catch` existente del handler responde `500 {success:false, code:"INTERNAL_ERROR"}`. Con 0 filas se mantiene la respuesta de conflicto existente `200 {success:true, recovered:false, status, changed:true}`.

| Requisito | Cumplimiento |
|---|---|
| 1. Distinguir error de BD de conflicto de concurrencia | Sí (H1-4, H1-5b) |
| 2. Nunca éxito si la operación falla | Sí (H1-3, H1-4, H1-4b) |
| 3. Cancelación con credenciales desconecta y limpia de forma atómica | Sí, mediante el trigger existente (H1-1, H1-2) |
| 4. No tocar otras conexiones / negocios / usuarios | Sí (H1-1, H1-2, H1-6, H1-7) |
| 5. Idempotencia | Sí (H1-5) |
| 6. Conservar el comportamiento sin credenciales | Sí (H1-8) |

Prueba nueva: `src/features/reality-engine/__tests__/gbp02Fix03aRecoverH1.test.ts` (11 casos, ejecuta el adaptador real de `index.ts`).

## 5. Integridad

| Archivo | Antes | Después | Estado |
|---|---|---|---|
| `gbp-recover-attempt/handler.ts` | 8467fa46… | 8467fa46… | Intacto |
| `gbp-recover-attempt/index.ts` | 3a0d378b6f71478b1c4c49dcb52aceced12b022ac2e10c97478b9f55e7f9b162 | ba0841a1e1b7aff9e9ce27261557e9501bed46d40be1b8f081806d8da0101a21 | **Modificado: requiere autorización de re-pin** |
| Resto de archivos GBP congelados y módulos Meta | — | — | Intactos (guardián 99/100; único fallo: index.ts) |

Módulos congelados (Facebook, Instagram, Tu Semana, Hoy, Stripe, Autenticación, BD/migraciones, configuración de producción), callback OAuth, sincronización y reseñas: **no tocados**.

## 6. Riesgos

- No se introduce riesgo nuevo de pérdida de credenciales ni de inconsistencia: el cambio solo afecta a la respuesta ante errores.
- Cambio observable: un fallo de BD ahora devuelve 500 en lugar de un falso 200. La interfaz ya trata los errores de esta función; no hay cambios de UI.
- `gbp-recover-attempt` **no está desplegada** con esta corrección (despliegue prohibido): producción sigue con el comportamiento anterior.
- H2–H10 de PREDEPLOY-01 quedan fuera de alcance.

## 7. Para desbloquear

1. Auditoría independiente de este informe y de las evidencias.
2. Autorización explícita para fijar el nuevo hash `ba0841a1…` de `index.ts` en el guardián.
3. Autorización explícita para desplegar `gbp-recover-attempt`.

Entregables: este informe, `GBP_02_FIX03A_TEST_REPORT.md`, evidencias en `auditoria-a2/gbp02-fix03a/evidence/` y `deliverables/localseohub-gbp02-fix03a.zip`.
