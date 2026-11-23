# LocalSEOHub.io — GBP-02-FIX01 — Informe de pruebas

Todas las pruebas usan dependencias simuladas: **ninguna llamada real a Google**, sin red y sin base de datos real.

## 1. Comandos ejecutados

| Comprobación | Comando | Resultado |
|---|---|---|
| Pruebas pertinentes | `vitest run src/features/reality-engine src/features/actions src/features/billing/__tests__/a25Integration.test.ts` | 11 archivos, 332/332 aprobados |
| Suite completa | `vitest run` | 98 archivos, 3.283 tests: **3.282 aprobados, 1 fallido** |
| TypeScript | `npm run typecheck` | 20 diagnósticos (todos preexistentes) |
| Lint | `npm run lint` | 57 problemas (47 errores, 10 warnings) |
| Build | `npm run build` | Correcto |

## 2. Comparación con la referencia GBP-02

| Métrica | GBP-02 | Línea base FIX01 (antes de editar) | FIX01 | Atribución |
|---|---|---|---|---|
| Archivos de test | 97 | — | 98 | +1 archivo nuevo |
| Tests aprobados | 3.247 | — | 3.282 | +36 nuevos, −1 guardián |
| Tests fallidos | 0 | — | 1 | Guardián de hash (ver §4) |
| TypeScript | 20 | 20 | 20 | Comparación línea a línea: 0 nuevos, 0 eliminados |
| Lint errores | 48 | 48 | 47 | −1: `no-explicit-any` en `gbp-sync/handler.ts` (eliminado `toProfile(any)`) |
| Lint warnings | 10 | 10 | 10 | Sin cambios |
| Build | OK | — | OK | — |

Las comparaciones de lint y TypeScript se hicieron entrada a entrada contra los registros capturados antes de editar. Ningún diagnóstico restante se atribuye a FIX01.

## 3. Pruebas de regresión nuevas (`gbp02Fix01Verification.test.ts`, 36 tests)

| # | Escenario obligatorio | Pruebas | Qué se verifica |
|---|---|---|---|
| 1 | Perfil válido y reseñas válidas | 1 | `reviewCount: 12`, perfil con `totalReviews`/`averageRating`, fila `reviews` conectada, tarjeta verificada |
| 2 | Cero reseñas confirmado | 1 + 1 | `totalReviewCount: 0` explícito → 0 guardado; única vía que genera “primeras reseñas” |
| 3 | Reviews 503 | 1 | `REVIEWS_FETCH_FAILED`, `reviewCount: null`, sin `totalReviews`, sin `metadata`, tarjeta no verificada |
| 4 | Reviews 403 | 1 | `REVIEWS_PERMISSION_DENIED`, fila `permissions_required` |
| 5 | Reviews 429 | 1 | `REVIEWS_QUOTA_UNAVAILABLE` |
| 6 | Reviews 200 con JSON inválido | 1 | `REVIEWS_INVALID_RESPONSE` |
| 7 | Reviews 200 sin contador | 1 | `REVIEWS_INVALID_RESPONSE` (aunque traiga `averageRating`) |
| — | Extra reseñas: 500, 401, contador no numérico, negativo, array, error de red; validador unitario | 7 | Ninguno produce cero; decimales, `null` y valores fuera de rango se rechazan |
| 8 | Perfil 200 con JSON inválido | 2 | HTML y cuerpo vacío → `LOCATION_INVALID_RESPONSE` |
| 9 | Perfil 200 con objeto incompatible | 9 | `null`, array, sin `name`, otra ubicación, sobre de error, tipos erróneos en título/teléfono/horario/dirección |
| 10 | Campos opcionales vacíos | 1 + 1 | Se acepta y guarda `null`; nombres canónico y con cuenta aceptados, `locations/4567` rechazado |
| 11 | Conservación de datos verificados | 3 | Perfil inválido conserva `verified_profile`, `verified_at` y fila `reviews`; fallo de reseñas conserva `reviewCount: 30` y `last_sync_at`; una sincronización posterior válida limpia el error |
| 12 | Aislamiento usuarios/negocios | 2 | Otro negocio → 403; otro usuario → sin acceso; JWT inválido → 401; sin llamadas a Google ni escrituras; la fila `reviews` solo se escribe para usuario+negocio propios |
| 13 | Sin efectos en recomendaciones | 4 | Con el motor real (`evaluateBusinessState`): ningún fallo de reseñas genera “primeras reseñas”; perfil inválido no genera ningún hallazgo GBP; campos vacíos generan huecos reales, nunca reseñas falsas |

En todos los casos de perfil inválido se comprueba además que los registros no contienen el token de acceso, el cuerpo de la respuesta ni datos de la ficha.

El modelo de prueba simula la fusión de columnas del upsert real (solo se escriben las columnas enviadas), de modo que la conservación del contador anterior queda verificada de extremo a extremo dentro del manejador.

## 4. Test fallido — dependencia, no regresión

```
FAIL a351MetaConnection.test.ts > A3.5.1 · P. GBP regression: frozen files
     > supabase/functions/gbp-sync/handler.ts is byte-identical
```

- Hash esperado (congelado): `d0896d0e8a95eb5c56b9e65169323765c456c4b700d677f6144a531f63b407c6`
- Hash actual tras FIX01: `d71f8fde10b30e44eace976982301fc01bab3898974577cf30f612b341d7673a`

El guardián existe para que el trabajo de Meta no tocara GBP. FIX01 modifica ese archivo por mandato expreso, así que el fallo es inevitable. El test pertenece al módulo Facebook/Instagram (fuera de alcance), por lo que **no se ha editado**. Los otros 19 archivos congelados siguen idénticos. Pendiente de autorización para actualizar esa única línea.

## 5. Test existente ajustado

`a3422GbpRecovery.test.ts`: el perfil simulado por defecto pasa de `{ title, phoneNumbers }` a `{ name: 'locations/456', title, phoneNumbers }`. Google siempre devuelve `name` en un recurso Location; el ajuste hace la simulación realista. Las aserciones no cambian y sus 15-18 casos siguen pasando (incluido `reviewCount: 12`).

## 6. Registros

`/tmp/gbp-fix01-tests.log`, `/tmp/gbp-fix01-ts-before.log`, `/tmp/gbp-fix01-ts-after.log`, `/tmp/gbp-fix01-lint-before.log`, `/tmp/gbp-fix01-lint-after.log`, `/tmp/gbp-fix01-build.log` (entorno de trabajo, no incluidos en el ZIP).
