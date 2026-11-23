# LocalSEOHub.io — GBP-02-FIX01 — Informe de corrección

**Alcance:** exclusivamente GBP02-F01 (reseñas) y GBP02-F02 (perfil inválido).
**Estado:** implementado y verificado localmente. **No desplegado.** Sin llamadas reales a Google, sin migraciones, sin cambios de RLS, secretos ni credenciales.

---

## 1. Archivos y funciones modificados

| Archivo | Tipo | Cambio |
|---|---|---|
| `supabase/functions/gbp-sync/handler.ts` | Producción | Corrección F01 + F02 (único archivo de producción tocado) |
| `src/features/reality-engine/__tests__/a3422GbpRecovery.test.ts` | Test | Fixture: el perfil simulado incluye ahora `name: 'locations/456'` (campo obligatorio de un recurso Location real) |
| `src/features/reality-engine/__tests__/gbp02Fix01Verification.test.ts` | Test (nuevo) | 36 pruebas de regresión permanentes |

Funciones en `gbp-sync/handler.ts`:

- **Eliminada:** `toProfile(loc: any)` (aceptaba cualquier cuerpo, incluido `null`).
- **Nuevas (internas):** `isObject`, `optString`, `optObject`, `isStringArray`, `readJson`, `reviewsFailure`, `classifyReviewsFetch`.
- **Nuevas (exportadas, para pruebas):** `parseLocationProfile(body, locationId)`, `parseReviewsSummary(body)`, tipo `ReviewsResult`.
- **Modificada:** `createHandler` → bloque de sincronización (lectura de perfil, lectura de reseñas, escritura de la fila `reviews`, respuesta).
- **Añadido:** código `LOCATION_INVALID_RESPONSE` en `FAILURE_MESSAGES`.

Sin cambios: `parseSelection`, `classifyLocationFetch`, `fail()`, `index.ts` (adaptadores), `gbpToken.ts`, autenticación, comprobación de propiedad del negocio.

Verificación por hash contra la línea base previa a la corrección (555 archivos de `src/`, `supabase/` y raíz): **solo cambian los 2 archivos existentes listados** más el archivo de test nuevo. `sourceStatus.ts` quedó byte-idéntico (se probó un ajuste visual y se revirtió para no romper el guardián de archivos congelados).

---

## 2. Corrección F01 — Reseñas

**Antes:** `let reviewCount = 0;` y `Number(totalReviewCount) || 0`. Cualquier 401/403/429/500/503, JSON inválido o ausencia de contador terminaba en *0 reseñas*, fila `reviews` en `connected` y tarjeta “Conectada y verificada” con “0 reseñas”. Además, `verified_profile.totalReviews = 0` disparaba la recomendación falsa “Consigue tus primeras reseñas” en Hoy/Tu Semana.

**Ahora:**

1. `parseReviewsSummary` solo acepta el contador si la respuesta es HTTP 2xx, el cuerpo es JSON objeto y `totalReviewCount` es un entero seguro ≥ 0 (número o cadena de dígitos, que es como Google serializa enteros). **El cero solo se admite si Google lo devuelve explícitamente.**
2. `averageRating` solo se guarda si es un número finito entre 0 y 5 y hay al menos una reseña.
3. Clasificación de fallos:
   - 401 / 403 → `REVIEWS_PERMISSION_DENIED` (fila `reviews` en `permissions_required`)
   - 429 → `REVIEWS_QUOTA_UNAVAILABLE` (`error`)
   - 500 / 503 / otros / error de red → `REVIEWS_FETCH_FAILED` (`error`)
   - 200 con JSON inválido, sin contador o contador no válido → `REVIEWS_INVALID_RESPONSE` (`error`)
4. El perfil se sigue marcando como conectado y verificado (la consulta de reseñas es independiente).
5. Si las reseñas no se verifican:
   - `verified_profile` **no** recibe `totalReviews` ni `averageRating` → la regla `gbp_get_first_reviews` (exige `totalReviews === 0`) no se dispara.
   - La fila `reviews` se actualiza con `status` no conectado y `last_error`, **sin enviar `metadata` ni `last_sync_at`** → el contador verificado anterior y su fecha se conservan intactos (el upsert solo escribe las columnas enviadas).
   - La tarjeta de reseñas deja de mostrar “Conectada y verificada” (pasa a “Pendiente de conexión”) y no muestra ningún contador.
6. Respuesta compatible: `reviewCount` pasa a `number | null` (antes siempre número) y se añade `reviewsStatus`. Ningún código del frontend lee `reviewCount` de esta respuesta (comprobado por búsqueda).

## 3. Corrección F02 — Perfil inválido

**Antes:** `toProfile(await res.json().catch(() => null))` convertía cualquier cuerpo 200 (HTML, `null`, array, error, otra ficha) en un perfil de todo `null`, que se guardaba como verificado con nuevo `verified_at`, sustituyendo el perfil válido anterior y generando huecos falsos (“añade tu web/teléfono/horario”).

**Ahora** `parseLocationProfile` exige, antes de escribir nada:

1. HTTP correcto (sin cambios: los no-2xx ya se clasificaban).
2. Cuerpo JSON válido (lectura como texto + `JSON.parse`, sin excepciones sin controlar).
3. Objeto no-array con `name` de tipo cadena igual a la ubicación solicitada (`locations/456`) o terminado en `/locations/456`. Rechaza `locations/4567`, otra ficha, sobres de error y cuerpos vacíos.
4. Tipos coherentes de campos opcionales: `title`, `websiteUri`, `primaryPhone`, `displayName` cadena; `phoneNumbers`, `storefrontAddress`, `categories`, `regularHours`, `primaryCategory` objeto; `periods` array; `addressLines` array de cadenas.
5. Campos ausentes o vacíos legítimos se aceptan y se guardan como `null` (una dirección sin partes ya no se guarda como cadena vacía).

Si falla → `fail("LOCATION_INVALID_RESPONSE")`: estado `error`, mensaje en español recuperable (“Google devolvió una respuesta no válida para tu ficha. Inténtalo de nuevo.”), **no se toca `verified_profile` ni `verified_at`**, no se consulta ni escribe `reviews`. El registro solo dice “location response rejected: not a matching Location resource”: nunca el cuerpo, el token ni datos de la ficha.

---

## 4. Evidencia resumida (detalle en `GBP_02_FIX01_TEST_REPORT.md`)

| Comprobación | Referencia GBP-02 | FIX01 | Diferencia |
|---|---|---|---|
| Tests | 3.247 aprobados (97 archivos) | 3.282 aprobados, **1 fallido** (98 archivos, 3.283 tests) | +36 nuevos; 1 guardián de hash |
| TypeScript | 20 diagnósticos | 20 diagnósticos, idénticos línea a línea | 0 nuevos |
| Lint | 48 errores, 10 warnings | 47 errores, 10 warnings | −1 (desaparece `no-explicit-any` de `toProfile`) |
| Build | OK | OK | — |

## 5. Dependencia fuera de alcance — requiere autorización

El único test fallido es `a351MetaConnection.test.ts › P. GBP regression: frozen files › supabase/functions/gbp-sync/handler.ts is byte-identical`. Es un guardián creado durante el trabajo de Meta que fija el hash SHA-256 de `gbp-sync/handler.ts` (`d0896d0e…`). Cualquier corrección de F01/F02 cambia necesariamente ese archivo, así que el guardián falla por diseño, no por regresión.

Actualizarlo implica editar un archivo de pruebas del módulo Facebook/Instagram, que está fuera del alcance autorizado. **No lo he modificado.** Para cerrarlo hace falta autorización expresa para cambiar una sola línea de ese test:

```
'supabase/functions/gbp-sync/handler.ts': 'd71f8fde10b30e44eace976982301fc01bab3898974577cf30f612b341d7673a',
```

El resto de archivos congelados de ese guardián (19) sigue byte-idéntico, incluido `sourceStatus.ts`.

## 6. Riesgos y limitaciones

1. **Cero reseñas sin contador:** si Google omitiera `totalReviewCount` para fichas sin reseñas (en lugar de devolver `0`), esas fichas aparecerán como reseñas no verificadas en vez de “0 reseñas”. Es un fallo seguro (no se inventa un cero), pero se debe confirmar con una ficha real sin reseñas antes de dar por cerrada la experiencia.
2. **Etiqueta de la tarjeta:** con reseñas no verificadas la tarjeta muestra “Pendiente de conexión”, no “No disponible”/“Error”. Mostrar un estado más preciso requiere cambiar `sourceStatus.ts`, que también está en la lista de archivos congelados; queda fuera de este ciclo.
3. **Perfil inválido → estado `error`:** igual que el resto de fallos existentes, la ficha pasa a `error` hasta reintentar. El perfil verificado anterior se conserva en base de datos, pero Hoy/Tu Semana dejan de usarlo mientras el estado sea `error` (comportamiento previo de `fail()`, no modificado).
4. **Al reintentar con éxito** el perfil nuevo sustituye al anterior; si en ese reintento fallan las reseñas, el perfil nuevo no lleva `totalReviews` (el contador anterior queda en la fila `reviews`, sin mostrarse).
5. **Nombre de recurso:** se aceptan `locations/{id}` y `…/locations/{id}`. Si Google cambiara el formato del campo `name`, la sincronización fallaría de forma segura con `LOCATION_INVALID_RESPONSE`.
6. **Producción:** la función desplegada sigue siendo la versión anterior hasta que se autorice el despliegue.

## 7. Módulos no modificados (confirmado por hash)

F03–F07 · `gbp-sync/index.ts` (incluido `getOwnBusinessId`) · `gbpToken.ts` · resto de funciones `gbp-*` · `gbp-reviews` · Facebook / Instagram / Meta (código y tests) · Stripe y suscripciones · Hoy · Tu Semana · motor de recomendaciones (`rules.ts`, `engine.ts`, `ActionsProvider`) · `sourceStatus.ts`, `SourceCard.tsx`, `gbpStatus.ts` · autenticación y permisos · migraciones, RLS, triggers, secretos.

## 8. Veredicto técnico

**GO técnico condicionado** para F01 y F02: ambos defectos están corregidos y cubiertos por 36 pruebas permanentes, sin defectos nuevos de TypeScript ni de lint (lint mejora en 1) y con build correcto.

Condición pendiente: autorizar la actualización de una línea del hash del guardián de archivos congelados en el test de Meta (sección 5) para que la suite completa quede en verde. Sin esa autorización, la suite tiene 1 fallo esperado y documentado.

No se ha desplegado nada ni se ha iniciado FIX02. Quedo a la espera de auditoría independiente y autorización expresa.
