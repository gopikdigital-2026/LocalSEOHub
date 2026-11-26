# LocalSEOHub.io — GBP-02-FIX03A · Informe de pruebas

Prueba nueva: `src/features/reality-engine/__tests__/gbp02Fix03aRecoverH1.test.ts`. Ejecuta el **adaptador real** de `supabase/functions/gbp-recover-attempt/index.ts` (transpilado y evaluado en un sandbox, red prohibida) junto con el handler real, sobre una BD falsa que reproduce el trigger `connected_sources_clear_on_disconnect` y la CHECK `connected_sources_disconnected_no_credentials` (semántica verificada en la evidencia 00).

Las pruebas se escribieron y ejecutaron **antes** de la corrección, con `index.ts` original (hash 3a0d378b…, verificado).

## Casos H1

| Caso | Descripción | Antes | Después |
|---|---|---|---|
| H1-1 | Cancelar en select_location con credenciales: desconecta, limpia credenciales y Vault; otra conexión intacta | PASS | PASS |
| H1-2 | Caducidad (>30 min) en select_location con credenciales: igual que H1-1 con ATTEMPT_EXPIRED | PASS | PASS |
| H1-2b | Intento no caducado: sin escrituras | PASS | PASS |
| H1-3 | Fallo al limpiar credenciales (Vault): 500, nunca éxito, fila intacta | **FAIL** (200 success) | PASS |
| H1-4 | Error de BD en la actualización (cancel y recover): 500, nunca éxito | **FAIL** (200 success) | PASS |
| H1-4b | Control de premisa: sin trigger la CHECK rechaza; nunca éxito | **FAIL** (success true) | PASS |
| H1-5 | Cancelación repetida idempotente, sin más escrituras | PASS | PASS |
| H1-5b | Cambio concurrente (0 filas): conflicto, no error; sin escrituras | PASS | PASS |
| H1-6 | Intento de otro negocio: 403 en cancel y recover | PASS | PASS |
| H1-7 | Intento de otro usuario: el adaptador no lo modifica ni con id conocido | PASS | PASS |
| H1-8 | Intento sin credenciales: comportamiento de cancelación existente | PASS | PASS |

**Transparencia:** en la primera versión de las pruebas (fase original), H1-3 y H1-4 esperaban el código `STATE_UPDATE_FAILED`. Se cambió a `INTERNAL_ERROR` (el código que ya emite el handler) para no modificar `handler.ts`. Las aserciones de estado 500, `success:false` y fila intacta **no se cambiaron**. Con el código original los tres casos siguen fallando (evidencia 01), por lo que el cambio no debilita la prueba.

## Validación

| Verificación | Antes | Después |
|---|---|---|
| Pruebas H1 | 3 fallan / 8 pasan (11) | 11/11 |
| Recuperación GBP (a341, a3422, gbp02Fix02c) | — | 79/79 |
| Compatibilidad GBP (`src/features/reality-engine`, 8 archivos) | — | 242/242 |
| Guardián Meta (a351) | 100/100 | 99/100 · único fallo: «gbp-recover-attempt/index.ts is byte-identical» |
| Suite completa | 3344 pasan / 3 fallan (H1 nuevas) de 3347 | 3346 pasan / 1 falla (guardián) de 3347 |
| tsc (`npx tsc --noEmit -p tsconfig.app.json`) | 20 errores preexistentes | Idéntico (cmp), ninguno en archivos tocados |
| eslint | 57 problemas (47 errores, 10 avisos) preexistentes | Idéntico, 0 en archivos tocados |
| build | — | OK |

Mensaje del guardián:
```
AssertionError: expected 'ba0841a1e1b7aff9e9ce27261557e9501bed4…' to be '3a0d378b6f71478b1c4c49dcb52aceced12b0…'
```
Fallo esperado. **No se actualizó el hash** (prohibido); se detiene y se reporta.

## Evidencias (`auditoria-a2/gbp02-fix03a/evidence/`)

- `00_db_trigger_simulation.txt`: simulación revertida de trigger + CHECK y contadores de producción
- `01_h1_tests_PRE_FIX.log`, `02_h1_tests_POST_FIX.log`
- `03_full_suite_PRE_FIX.log`, `04_full_suite_POST_FIX.log`
- `05_gbp_recovery_POST_FIX.log`, `06_gbp_compat_POST_FIX.log`
- `07_meta_guardian_PRE_FIX.log`, `07_meta_guardian_POST_FIX.log`
- `08_tsc_PRE_FIX.log`, `08_tsc_POST_FIX.log`
- `09_eslint_PRE_FIX.log`, `09_eslint_POST_FIX.log`
- `10_build_POST_FIX.log`
- `11_index_ts.diff`, `hash_PRE_FIX.txt`, `hash_POST_FIX.txt`
