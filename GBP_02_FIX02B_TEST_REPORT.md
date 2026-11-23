# GBP-02-FIX02B — Informe de pruebas

## Resultados globales

| Comprobación | Referencia | Resultado FIX02B |
|---|---|---|
| Suite completa (vitest) | 3.283 aprobadas, 0 fallidas | **3.308 aprobadas, 8 fallidas** (3.316 en total; 99 ficheros, 1 con fallos) |
| TypeScript (`npm run typecheck`) | 20 diagnósticos | **20 diagnósticos**, ninguno nuevo |
| Lint (`npm run lint`) | 47 errores, 10 avisos | **47 errores, 10 avisos**, ninguno nuevo |
| Build (`npm run build`) | correcto | **correcto** |

Cálculo de la suite: 3.283 − 8 hashes congelados + 33 tests nuevos = 3.308.

## Fallos esperados, y solo esos (guardián de hashes, sin actualizar)

`src/features/meta-connection/__tests__/a351MetaConnection.test.ts`, en «A3.5.1 · P. GBP regression: frozen files», falla con «… is byte-identical» en estos archivos:

1. supabase/functions/gbp-disconnect/handler.ts
2. supabase/functions/gbp-disconnect/index.ts
3. supabase/functions/gbp-oauth-start/handler.ts
4. supabase/functions/gbp-oauth-start/index.ts
5. supabase/functions/gbp-reviews/handler.ts
6. supabase/functions/gbp-reviews/index.ts
7. supabase/functions/gbp-sync/handler.ts
8. supabase/functions/gbp-sync/index.ts

No hay ningún fallo funcional. Los otros 12 hashes del guardián siguen coincidiendo, entre ellos `reality-engine/engine.ts`.

Durante el desarrollo aparecieron dos fallos intermedios que se corrigieron sin tocar los tests:

- **A2.5 test 25**: exigía la comprobación `sel.businessId !== null && sel.businessId !== businessId` en gbp-sync. Se ha restaurado.
- **premiumAccess G4**: exige que cada carpeta de funciones tenga configuración de despliegue. El contrato se ha movido de `_shared/` a `supabase/functions/activeBusiness.ts`.

## Regresiones permanentes nuevas (`src/features/reality-engine/__tests__/gbp02Fix02bActiveBusiness.test.ts`, 33 tests)

| Escenario exigido | Tests |
|---|---|
| Usuario con un negocio | contrato; OAuth, sincronización, desconexión y reseñas con un negocio sin selección; contexto de negocio |
| Usuario con dos negocios | contrato; todas las rutas sin selección → 409; contexto → `selection_required` sin crear negocio |
| Negocio explícito autorizado | contrato; OAuth conecta solo B; sincronizar B; desconectar A; reseñas solo de B; contexto resuelve B |
| Negocio explícito ajeno | contrato → forbidden; OAuth, sincronización y desconexión → 403; reseñas → 404; contexto lo rechaza |
| Negocio inexistente | igual que ajeno, con una respuesta idéntica (sin revelar existencia) |
| Ausencia de selección con varios negocios | 409 en las cuatro rutas, sin escrituras, sin llamadas a Google y sin reservas |
| Conexión OAuth | 4 tests de `gbp-oauth-start`, que incluyen el rechazo de un ID de cuenta Google como negocio |
| Sincronización | 4 tests de `gbp-sync`: aislamiento de la fuente y de la fila de reseñas por negocio |
| Desconexión | 5 tests de `gbp-disconnect`, incluido el filtro `business_id` de la limpieza de reseñas en el adaptador |
| Lectura de reseñas | 5 tests de `gbp-reviews`, más 2 del lado del navegador (envío de `businessId` y textos del estado controlado) |
| Aislamiento entre empresas | sincronizar B no toca A; desconectar A no toca B; otro usuario no puede leer A |
| Compatibilidad F01/F02 | `gbp02Fix01Verification.test.ts` pasa entero; comprobación de que siguen existiendo `parseLocationProfile` y `parseReviewsSummary` |
| Contrato y adaptadores | los cuatro adaptadores usan la consulta limitada y `resolveActiveBusiness`; no hay almacenamiento persistente de la selección |

Los tests existentes que se han ejecutado siguen pasando:

- a341GbpSecurity, a3422GbpRecovery, a342ReviewsAi y gbp02Fix01Verification;
- a3512, a3521, a3741, a25Integration y premiumAccess;
- businessRepository (con el simulador ampliado con `limit`) y legacyMigration.

## Registros

Guardados en el ZIP, en la carpeta `logs/`: `fix02b-tests.log`, `fix02b-typecheck.log`, `fix02b-lint.log` y `fix02b-build.log`.
