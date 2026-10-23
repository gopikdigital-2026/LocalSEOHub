# A3.5.3 — FACEBOOK & INSTAGRAM READ LAYER

Estado: implementado, desplegado y probado con fixtures. **No congelado**: falta el E2E real contra Meta.

---

## 1. Arquitectura

```
Navegador (/fuentes · MetaConnectionCard → MetaSyncStatus)
   │  supabase.functions.invoke('meta-read', { action: 'sync' })   (JWT del usuario)
   ▼
Edge Function meta-read  (verify_jwt = true)
   1. JWT → userId (auth.getUser)
   2. businesses(user_id) → meta_connections(user_id, business_id) → connection_id
   3. RPC meta_sync_claim(connection, user, 60 s)   → page_id / IG id / token_expires_at (server-owned)
   4. token_expires_at <= now  → reauth_required (sin llamar a Graph)
   5. RPC meta_read_token (Vault, service_role)    → token de usuario en memoria
   6. Graph v25.0 (appsecret_proof en cada llamada, timeout 10 s, paginación acotada)
   7. Normalización → contrato interno estable
   8. RPC meta_sync_apply por plataforma (valida dueño + cuenta esperada; dedup; sin payload crudo)
   ▼
Tablas meta_sync_state / meta_content_items (RLS: SELECT solo del propietario)
   ▲
Navegador lee estado con su sesión (RLS) — nunca tokens.
```

- Los IDs de Page/IG **nunca** vienen del cliente: se leen de `meta_connections` dentro del RPC con bloqueo `FOR UPDATE`. Cualquier `pageId`/`connectionId` en el body se ignora.
- Contratos A3.5.2 intactos: `meta-oauth-start`, `meta-oauth-callback`, `meta-connection`, scopes, Vault, cancel/retry/stale recovery **no se modificaron**. El callback no necesitó cambios.
- Ficheros nuevos: `supabase/functions/meta-read/{handler.ts,index.ts}`, `src/features/meta-connection/{metaSyncStatus.ts,MetaSyncStatus.tsx}`, test `a353MetaReadLayer.test.ts`. Modificados: `metaRepository.ts` (+2 funciones), `MetaConnectionCard.tsx` (inserta el bloque de estado en la rama `connected`), `supabase/config.toml` (+`[functions.meta-read]`), 5 guardarraíles de recuento de migraciones (47 → 49).

## 2. Endpoints Graph (v25.0, solo GET)

| Lógico | Endpoint | Token |
|---|---|---|
| `page_token` | `GET /{page_id}?fields=access_token` | usuario |
| `page_profile` | `GET /{page_id}?fields=id,name,about,category,link,website,fan_count,followers_count` | Page (en memoria) |
| `page_posts` | `GET /{page_id}/published_posts?fields=id,message,created_time,permalink_url,status_type,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)&limit=25` | Page |
| `page_posts_basic` (fallback) | igual sin `reactions`/`comments` — solo si el anterior devuelve error de permiso | Page |
| `ig_profile` | `GET /{ig_id}?fields=id,username,name,biography,website,followers_count,follows_count,media_count` | usuario |
| `ig_media` | `GET /{ig_id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=25` | usuario |

Sin scraping, sin escritura, sin insights, sin mensajes, sin texto de comentarios. Un test verifica que solo se usan GET y solo las aristas `/:id`, `/:id/published_posts`, `/:id/media`.

## 3. Campos leídos y contrato normalizado

Item (`meta_content_items`), idéntico para ambas plataformas:

| Campo | Facebook | Instagram | Ausente |
|---|---|---|---|
| `platform` | facebook | instagram | — |
| `account_external_id` | page_id del servidor | ig_id del servidor | — |
| `external_id` | `id` (`^\d+(_\d+)?$`) | `id` (`^\d+$`) | item descartado |
| `content_type` | status_type → photo/video/link/status/event, resto post | IMAGE→image, CAROUSEL_ALBUM→carousel, VIDEO+REELS→reel, VIDEO→video, resto other | — |
| `text_content` | `message` (≤5000) | `caption` (≤5000) | null |
| `published_at` | `created_time` → ISO | `timestamp` → ISO | null |
| `permalink` | `permalink_url` (solo https) | `permalink` (solo https) | null |
| `reaction_count` | `reactions.summary.total_count` | `like_count` | **null** |
| `comment_count` | `comments.summary.total_count` | `comments_count` | **null** |

Regla de conteos: solo se acepta un entero seguro ≥ 0 recibido de Meta. `0` real se conserva como 0; ausente, negativo, decimal, string, NaN → null. Nunca se convierte null en 0 (tests dedicados; columnas permiten NULL).

Perfil (`meta_sync_state.profile`, jsonb ≤ 8 KB): FB `name, category, about(≤500), link, website, fan_count, followers_count`; IG `username, name, biography(≤500), website, followers_count, follows_count, media_count`. Mismas reglas null.

## 4. Permisos

Solo los cuatro concedidos: `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_basic`. Ninguno nuevo; un test fija `META_SCOPES`. Si Meta deniega los resúmenes de reacciones/comentarios, se reintenta sin ellos y los conteos quedan null (no estimados).

## 5. Tablas / RPC / funciones

Migraciones: `20261022170333_a353_meta_read_layer.sql`, `20261022170523_a353_meta_sync_claim_min_interval.sql`.

- **`meta_sync_state`** PK `(connection_id, platform)`; status ∈ never | ok | empty | not_linked | permission_unavailable | reauth_required | rate_limited | malformed | api_error; `error_code ^[A-Z_]{1,64}$`; `item_count`, `pages_fetched`, `profile`, `sync_started_at`, `last_attempt_at`, `last_success_at`.
- **`meta_content_items`** UNIQUE `(connection_id, platform, external_id)` (dedup); checks de formato en ids, texto, permalink https, conteos ≥0 o null.
- RLS activada; `authenticated` solo SELECT de sus filas (`auth.uid() = user_id`); sin INSERT/UPDATE/DELETE para clientes (verificado: `has_table_privilege` = false).
- **`meta_sync_claim`**: bloquea la conexión, exige mismo usuario + `connected` + page_id, siembra estados, aplica cooldown de 60 s sobre sincronización en curso **y** último intento.
- **`meta_sync_apply`**: valida dueño, estado `connected` y que la cuenta coincida con la esperada (page_id, o IG solo si `instagram_status = connected`); `ok/empty` hace upsert + borra los ausentes + `last_success_at`; estados de error solo actualizan status/error/`last_attempt_at` conservando datos y `last_success_at`.
- **Trigger `meta_connections_purge_content`**: al desconectar/reconectar o cambiar de Page borra todo; al cambiar de IG borra solo IG.
- Todas SECURITY DEFINER, `search_path = ''`, EXECUTE solo `service_role` (verificado: anon/authenticated = false; claim con conexión inexistente → `not_connected`; apply → false).

## 6. Paginación y límites

- `limit=25` por página, máx. **4 páginas** y **100 items** por plataforma.
- `paging.next` solo se sigue si es `https://graph.facebook.com/<versión>` y la misma arista; se elimina `access_token` del enlace y se recalcula `appsecret_proof`.
- Protección de bucles: cursores vistos; un cursor repetido detiene la paginación.
- Error en una página posterior → la plataforma entera falla (no se guardan datos parciales).
- Timeout 10 s por petición (AbortController). Cooldown de 60 s entre sincronizaciones (429 `SYNC_COOLDOWN`).
- Ventana: se conservan los ≤100 contenidos más recientes; los que salen de la ventana se eliminan en la siguiente sincronización correcta.

## 7. Caducidad de token

- `token_expires_at <= now` → sin llamar a Graph: ambos estados a `reauth_required`, `meta_fail_connection(..., 'reauth_required')`, respuesta 401 `REAUTH_REQUIRED`.
- Código Graph 190 (o 102) en cualquier llamada → mismo tratamiento; se detiene la sincronización.
- Token ausente en Vault → mismo tratamiento.
- Los datos previos se conservan pero la UI los rotula “Datos de la última sincronización correcta: fecha”, nunca como sincronización reciente.
- **Sin auto-refresh.** Renovación futura: el token de usuario long-lived (~60 días) se renueva repitiendo OAuth (botón “Volver a conectar” ya existente). Opción posterior: aviso proactivo cuando falten ≤7 días, y job que re-intercambie el token mientras siga válido (`fb_exchange_token`) — requiere tocar el callback/Vault y por tanto una fase propia.

## 8. Errores

| Situación | Estado plataforma | error_code | HTTP |
|---|---|---|---|
| Sin JWT | — | NOT_AUTHENTICATED | 401 |
| Sin conexión / no `connected` | — | META_NOT_CONNECTED | 409 |
| Cooldown | — | SYNC_COOLDOWN | 429 |
| App sin configurar | — | META_APP_NOT_CONFIGURED | 503 |
| Token caducado / 190 / sin token | reauth_required | REAUTH_REQUIRED | 401 |
| 10, 200–299 | permission_unavailable | META_PERMISSION_DENIED | 200 |
| Sin Page token | permission_unavailable | PAGE_TOKEN_UNAVAILABLE | 200 |
| 4/17/32/613 | rate_limited | META_RATE_LIMITED | 200 |
| JSON no válido, `data` no array, todos los items inválidos | malformed | META_MALFORMED_RESPONSE | 200 |
| ID de perfil distinto al esperado | malformed | META_ACCOUNT_MISMATCH | 200 |
| 100 | api_error | META_UNSUPPORTED | 200 |
| 5xx / red / timeout | api_error | META_API_ERROR / META_TIMEOUT | 200 |
| Lista vacía legítima | empty | — | 200 |
| IG no vinculado | not_linked | — | 200 |
| Conexión cambiada durante la sync | conflict (no se guarda) | CONNECTION_CHANGED | 200 |

Los errores son por plataforma: un fallo de IG no invalida FB.

## 9. Protección de credenciales

- Token de usuario solo en memoria desde Vault (`meta_read_token`, service_role). Page token pedido bajo demanda, nunca persistido ni registrado.
- Tokens siempre en cabecera `Authorization`, nunca en la URL; `access_token` se elimina de los enlaces `next`.
- `appsecret_proof` (HMAC-SHA256 con `META_APP_SECRET`) en cada llamada, calculado por token.
- Logs JSON con claves fijas: `fn, platform, endpoint, pages, items, metaCode, durationMs, result`. Sin URLs, tokens, secret, proof ni códigos OAuth (test con tres escenarios revisa respuesta, payload guardado y consola).
- Sin payloads crudos de Graph en BD: solo los 7 campos normalizados y un perfil filtrado.

## 10. Tests

`src/features/meta-connection/__tests__/a353MetaReadLayer.test.ts` — 53 tests:

- FB ok (perfil + posts + conteos reales), Page token con su propio proof, FB vacío, fallback sin conteos, sin Page token.
- IG ok, IG vacío, IG no vinculado (sin llamadas IG), IG con id pero estado no conectado, tipos de media.
- Token caducado (sin Graph), 190 a mitad (datos conservados, no frescos), token ausente.
- Permiso insuficiente por plataforma, rate limit (4/17/32/613), malformed (no array, no JSON, ids inválidos, id de cuenta distinto), 5xx, fallo de red, clasificación de códigos, formato de error_code, cooldown, app sin configurar, acciones/JWT/CORS.
- Paginación: máx. páginas, máx. items, bucle de cursor, hosts/aristas ajenos, error en página posterior.
- Null vs cero, conteos inválidos, permalinks no https, fechas, truncado, dedup en respuesta y entre syncs.
- Aislamiento: IDs del cliente ignorados, usuario sin conexión, conexión no conectada, conexión cambiada a mitad; sin tokens en respuestas/logs/payloads; claves de log; sin campos crudos.
- A3.5.2 preservado: scopes, solo GET.
- UI: ok/empty/error-con-datos-antiguos/error-sin-datos/never/not_linked.

Verificación SQL en la BD real: RPCs rechazan conexiones inexistentes; sin EXECUTE para anon/authenticated; sin escritura de tablas para authenticated.

## 11. Resultados

- Tests Meta: 4 ficheros en verde (A3.5.1, A3.5.1.2, A3.5.2.1, A3.5.3).
- Suite completa: **58 ficheros / 2051 tests, todo en verde** (antes 57 / 1998). Se actualizaron 5 guardarraíles de recuento de migraciones 47 → 49 por las dos migraciones de esta fase.
- `npm run build`: correcto.
- Typecheck: 0 errores en código Meta; persisten avisos previos ajenos (variables sin uso en landings y `Array.at` en un test GBP), no introducidos aquí.
- Edge function `meta-read` desplegada.

## 12. Limitaciones de Meta

- `like_count` puede omitirse si el propietario oculta los “me gusta” → null.
- `reactions/comments.summary` puede requerir permisos o no estar disponible para algunos posts → null.
- `published_posts` requiere Page token y `pages_read_engagement`; Pages en revisión o con restricciones pueden devolver 10/200.
- `followers_count` de Page/IG puede no devolverse según tipo de cuenta → null.
- Stories, contenido de terceros, texto de comentarios e insights quedan fuera de los permisos actuales.
- En modo Desarrollo de la app Meta solo los roles de la app pueden leer datos; Live requiere App Review de los permisos usados.
- Límites de tasa a nivel de app/usuario/Page (BUC); se respetan con cooldown y paginación acotada, sin reintento automático.

## 13. Datos disponibles para Social Intelligence

Por usuario/negocio, con fecha de última sincronización correcta y estado honesto:
- Perfil de Page (nombre, categoría, descripción, enlace, web, fans/seguidores si existen) y de IG (usuario, nombre, bio, web, seguidores, seguidos, nº de media).
- Hasta 100 publicaciones FB y 100 medias IG recientes: tipo, texto, fecha, permalink, reacciones/likes y comentarios cuando Meta los da.
- Permite: frecuencia de publicación, mezcla de formatos, recencia, engagement relativo por post (solo sobre conteos no nulos). No permite: alcance, impresiones, demografía, texto de comentarios.

---

## Veredicto

**GO — READY FOR REAL READ E2E**

Siguiente paso obligatorio: E2E real con la Page e IG de prueba (sync ok, IG no vinculado, revocar permiso, caducidad forzada). A3.5.3 **no** se declara congelado hasta completarlo.
