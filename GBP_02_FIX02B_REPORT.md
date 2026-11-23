# GBP-02-FIX02B — Contrato técnico de identificación del negocio activo

Fecha: 2026-11-23 · Estado: implementado, **no desplegado**, pendiente de auditoría independiente.

## 1. Resumen

Se ha definido un único contrato tipado para resolver el negocio activo, `supabase/functions/activeBusiness.ts`. Lo reutilizan:

- los cuatro adaptadores GBP: `gbp-oauth-start`, `gbp-sync`, `gbp-disconnect` y `gbp-reviews` (handler e index);
- el contexto compartido de negocio en el navegador (`businessRepository.ts` y `BusinessContext.tsx`).

Comportamiento resultante:

- **Un negocio**: se resuelve automáticamente, igual que antes.
- **Varios negocios sin selección explícita**: se devuelve un estado controlado de selección requerida. No se elige el primero ni se crea un negocio por defecto.
- **Negocio explícito**: solo se acepta si figura en la lista de negocios del usuario autenticado, obtenida en servidor.
- **Negocio ajeno o inexistente**: se rechaza con la misma respuesta en ambos casos, de modo que no se revela su existencia.

## 2. Contrato implementado (`supabase/functions/activeBusiness.ts`)

| Elemento | Contrato |
|---|---|
| `parseRequestedBusinessId(raw)` | `undefined` o `null` → `{ok:true, businessId:null}`. Si no es texto o no cumple la forma `^[A-Za-z0-9-]{1,64}$` → `{ok:false}`. Los ID de cuenta o ubicación de Google (`accounts/…`, `locations/…`) se rechazan por su forma. |
| `ownedBusinessIds(rows)` | Devuelve los ID distintos y bien formados que salen de la consulta del servidor. Lanza un error si la respuesta no es una lista. |
| `OWNED_BUSINESS_LOOKUP_LIMIT = 6` | Límite de la consulta `businesses.eq(user_id).limit(6)`: es mayor que el máximo de 5 negocios, así que la ambigüedad nunca queda oculta. |
| `resolveActiveBusiness(owned, requested)` | Con ID explícito: si pertenece al usuario → `resolved`; si no → `forbidden`. Sin ID: 0 negocios → `no_business`; 1 → `resolved`; 2 o más → `selection_required`. |
| `ActiveBusinessError(kind)` / `businessIdOrThrow(res)` | Sirven para adaptadores que esperan `string \| null`. Lanzan el error con tipo `selection_required` o `forbidden`. |
| `BUSINESS_SELECTION_REQUIRED` | Código común del estado controlado. |

La propiedad del negocio se valida siempre en servidor con la clave de servicio y el `user_id` del token de sesión. El ID que envía el navegador solo sirve como selección: nunca se usa como prueba de propiedad.

## 3. Respuestas por ruta

| Ruta | 1 negocio, sin ID | Varios, sin ID | ID propio | ID ajeno o inexistente | ID malformado |
|---|---|---|---|---|---|
| gbp-oauth-start | 200 (igual que antes) | 409 `BUSINESS_SELECTION_REQUIRED` | 200 | 403 `FORBIDDEN` | 403 |
| gbp-sync | 200 (igual que antes) | 409 `BUSINESS_SELECTION_REQUIRED` | 200 | 403 `FORBIDDEN` | 403 |
| gbp-disconnect | 200 (igual que antes) | 409 `BUSINESS_SELECTION_REQUIRED` | 200 | 403 `FORBIDDEN` | 403 |
| gbp-reviews (list/draft) | 200 (igual que antes) | 409 `business_selection_required` | 200 | 404 `not_found` | 422 `invalid_input` |

En el estado 409 no se escribe nada, no se llama a Google y no se reserva ningún uso de IA.

## 4. Cambios por archivo

- **`supabase/functions/activeBusiness.ts`** (nuevo): el contrato puro, sin APIs de ejecución. Está fuera de una carpeta propia porque el test G4 exige que cada carpeta de `supabase/functions` sea una función con configuración de despliegue.
- **gbp-oauth-start/handler.ts e index.ts**: aceptan `businessId` del cuerpo y lo validan con el contrato. La búsqueda del negocio deja de usar `maybeSingle` por `user_id` y pasa a la consulta limitada más `resolveActiveBusiness`. El estado de selección requerida devuelve 409.
- **gbp-sync/handler.ts e index.ts**: misma resolución, con 409 o 403 controlados. Se mantiene la comprobación `sel.businessId !== null && sel.businessId !== businessId`. **F01/F02 intactos**: `parseLocationProfile`, `parseReviewsSummary` y las escrituras de fallo sin `metadata`/`last_sync_at` no cambian.
- **gbp-disconnect/handler.ts e index.ts**: resolución por contrato. Además, al desconectar, la limpieza de la fila de reseñas se limita ahora al negocio desconectado (`.eq("business_id", target.business_id)`). Antes, desconectar un negocio borraba las filas de reseñas de todos los negocios del usuario.
- **gbp-reviews/handler.ts e index.ts**: aceptan `businessId`, aplican el contrato y devuelven 409 `business_selection_required`. Premium, límites, reservas, liquidación y modelo de IA no cambian.
- **businessRepository.ts**: `resolveBusiness(userId, db, requestedBusinessId = null)` usa la consulta limitada y el contrato.
  - Con varios negocios lanza `ActiveBusinessError('selection_required')`.
  - Solo crea un negocio si el usuario no tiene ninguno y no pidió uno concreto, que es el comportamiento anterior.
- **BusinessContext.tsx**: captura el estado de selección requerida, expone `selectionRequired: boolean` y un mensaje en español en `error`, y termina la carga. No hay selector, diseño nuevo ni almacenamiento persistente.
- **reviews/repository.ts, ReviewsPage.tsx y copy.ts**:
  - `loadReviews` y `draftReply` envían `businessId` cuando el contexto lo conoce; sin él, el cuerpo es idéntico al anterior.
  - Se añade el código de error `business_selection_required`, con textos en español e inglés dentro del bloque de error existente.
  - La página espera a que termine la carga del negocio antes de pedir reseñas.
- **businessRepository.test.ts**: el simulador de base de datos incorpora `limit(n)` para reflejar la nueva consulta.
- **gbp02Fix02bActiveBusiness.test.ts** (nuevo): 33 regresiones permanentes.

## 5. Inventario de archivos modificados (hashes anteriores y posteriores)

| Archivo | SHA-256 anterior | SHA-256 posterior |
|---|---|---|
| `src/features/business-memory/BusinessContext.tsx` | `277e37aec19fc293b54179148ed96c8e445da61020721799695cbc780737ac01` | `46f88a3c7a9c2146e4edfb35738b45a9b639f4d5b70f7cc6ed199b5e6c449cb2` |
| `src/features/business-memory/__tests__/businessRepository.test.ts` | `3d83606687fb7955c62843b07f432325a9b772c01ea0d42e1840c14db3735643` | `186bfed1f7bc70c1ef4fc3a11554e62cdeab06291b9565fbb1faca02a283fc07` |
| `src/features/business-memory/businessRepository.ts` | `5e160b7d63d8e3d5f3e851d6f96e275a598a124310c48f395b27988b89872e39` | `db5be314a23a299d67fd5eea230c6574aa50f9c9589e02cf970d96c79fab7fcc` |
| `src/features/reality-engine/__tests__/gbp02Fix02bActiveBusiness.test.ts` | `(nuevo)` | `72e2452a5b57cacc0b0cb98f6df7cdd02e2086070f2fd07b6e73fd6b7293a23f` |
| `src/features/reviews/ReviewsPage.tsx` | `2157af471000104ae73bdf272434629107095aec0a37b9ea3d882f67c5608c8e` | `59b2c4c2c73bbe07f7f5d34eb5b38d3f80cadb39dcb2db3302b3c6a767f24340` |
| `src/features/reviews/copy.ts` | `84c78df5afb3acabac2c1ba1c257cca0499932bb9e94e930f8f11b8c3ba7f2f0` | `e6dfdfbbe0bf519d263f8aeaad3ae7af606cd68d7af11547e00109ce1400c128` |
| `src/features/reviews/repository.ts` | `556a5e59731b5971c0bf63d7ead773172e5565240b8c79687aa658ce255ede10` | `8cb06e7eab6f920f722ec9bb8571d6301e2bb19f54801d04943b65828234a2d1` |
| `supabase/functions/activeBusiness.ts` | `(nuevo)` | `bd5038f328c0a71430573e2e086488eb51cf420da57647ea2633d152ab24be9f` |
| `supabase/functions/gbp-disconnect/handler.ts` | `45c1acbed37364c434b9369452d93282a809699b4a7d17bcd5fa535e35b0cf83` | `e2064c2b75165c6b521cb94f523c974b81ed913cdeb83eb12a6571fb477e2f28` |
| `supabase/functions/gbp-disconnect/index.ts` | `7b28648afd40074e65a9db6d48fb417394981965ecf827edde829d507b9da948` | `457b0734e0499d3703dd78c18dcca4c1802552fcea64d0049850748257f85d55` |
| `supabase/functions/gbp-oauth-start/handler.ts` | `991438435abdc920e98fdf830215ed63227d8d2ce697c0ff6c3220bb260130b8` | `81d01feaa42c8e01f1989b96e53780a3cc8ca0930d9bf38cd7f36ef203e4d933` |
| `supabase/functions/gbp-oauth-start/index.ts` | `8cb979ce494a8ec281ec3b1035b0fa364853baf796b96a0e632ac413eb573464` | `186e6257e675dd17e598bd7215043ad2155dd0163c9b1438cfd20c9046b288a2` |
| `supabase/functions/gbp-reviews/handler.ts` | `415883be71ce38ffe72f44051f834af565babb7e27be1cc5afdc8f6ed4adfe3e` | `61e667d0f82a4e218f7a6652cb2672c2cdf553e93a167dd45992b20b25a2a16f` |
| `supabase/functions/gbp-reviews/index.ts` | `19222fb038e8f115f6aba173d96510986b9ea0744e614dd890bfecf6699792ac` | `3e72f0ada835dbd464abe5ab9cd9262881f3b4c1f7880efc04b81cfa76ef5432` |
| `supabase/functions/gbp-sync/handler.ts` | `d71f8fde10b30e44eace976982301fc01bab3898974577cf30f612b341d7673a` | `915bedc7baa97f87a00c0b675ff7c86949f202554c067cee4ef8b2534c4aef84` |
| `supabase/functions/gbp-sync/index.ts` | `fee680186b7550eeaf7903185f0a8ad6fc7866b65ff71f1ef1aa1ed9d4209ddf` | `748b7aba58828c8b481d3c2dff8f54d878cbc00bca112c38933c9a77177f8ac6` |

No hay más archivos modificados en `src/` ni en `supabase/`. `src/features/reality-engine/engine.ts` (`46205263e3a5216b8e2e8d4c454a8af74da95398e78ea260392491e48a91ce20`) no se ha modificado, y tampoco GBPCallbackPage, gbpStatus, SourceCard, registry ni sourceStatus.

## 6. Guardián de integridad

El bloque «A3.5.1 · P. GBP regression: frozen files» falla en exactamente **8 comprobaciones**: el handler y el index de las cuatro rutas autorizadas. Es lo esperado. **No se han actualizado los hashes** ni se ha desactivado ningún test; su actualización queda a criterio de la auditoría.

## 7. Limitaciones y riesgos pendientes

1. **No existe selección de negocio en la interfaz.** Hasta que exista una selección explícita en la interfaz, los usuarios con varios negocios reciben el estado controlado de selección requerida:
   - en el contexto de negocio;
   - en reseñas;
   - y en conexión, sincronización y desconexión cuando la petición no incluye el negocio.
   No se simula que la selección multinegocio esté disponible.
2. **`reality-engine/engine.ts` está congelado y no se ha tocado.** Su llamada a `gbp-disconnect` envía `{}`. Para usuarios de un negocio funciona igual que antes; para usuarios con varios negocios devuelve el 409 controlado y no desconecta nada. Cambiarlo requiere autorización expresa.
3. **Rutas fuera de alcance que siguen resolviendo por `user_id` con `maybeSingle`**: `gbp-recover-attempt`, `gbp-oauth-callback` y `gbp-list-locations`. Con varios negocios, `maybeSingle` devuelve un error en lugar de elegir uno, así que fallan de forma cerrada, pero no aplican el contrato. Quedan para una fase posterior.
4. La comprobación de forma del ID es una validación sintáctica. El control real es la pertenencia en servidor.
5. Los hallazgos F04–F07 no se abordan en esta fase. Por ejemplo, `removeSource` sigue devolviendo `!clearError || !deleteError`.
6. El test 26 de A2.5 menciona un índice único por usuario en `businesses`, mientras que el límite documentado es de 5 negocios. No se han tocado migraciones ni RLS; conviene que la auditoría confirme cuál es el modelo vigente.
7. El módulo compartido está en `supabase/functions/activeBusiness.ts`, fuera de las carpetas de función. Al desplegar habrá que confirmar que el empaquetado incluye la importación relativa `../activeBusiness.ts`.

## 8. Funciones Edge modificadas y no desplegadas

`gbp-oauth-start`, `gbp-sync`, `gbp-disconnect` y `gbp-reviews`, más el módulo compartido. No se ha desplegado nada, no se ha llamado a Google, y no se han modificado migraciones, RLS, Stripe, Facebook ni Instagram.

## 9. Resultados

Ver `GBP_02_FIX02B_TEST_REPORT.md`. Suite: 3.308 aprobadas y 8 fallidas, todas del guardián de hashes. TypeScript: 20 diagnósticos, igual que la referencia. Lint: 47 errores y 10 avisos, igual que la referencia. Build correcto.

Fin de FIX02B. No se inicia FIX03; queda pendiente la auditoría independiente.
