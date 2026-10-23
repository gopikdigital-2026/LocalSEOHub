# A3.5.3.1 — META READ LAYER POST-E2E AUDIT & FREEZE

Fecha: 2026-10-22
Tipo: auditoría READ-ONLY. No se ha modificado código, esquema ni datos de producción.
Alcance: A3.5.3 Meta Read Layer (edge function `meta-read`, tablas `meta_sync_state` / `meta_content_items`, RPCs `meta_sync_claim` / `meta_sync_apply`, trigger `meta_connections_purge_content`, UI `MetaSyncStatus` en /fuentes).

---

## 1. Executive verdict

**GO — FREEZE A3.5.3**

La sincronización E2E real queda confirmada en producción. Los 4 registros persistidos (3 Facebook + 1 Instagram) proceden de Meta Graph API, pertenecen a la conexión, usuario y negocio correctos, no existen duplicados ni datos demo, los datos ausentes se conservan como `NULL`, los tokens no aparecen fuera de Vault y la suite completa (58 files / 2051 tests) y el build pasan.

No se han encontrado defectos bloqueantes. Hay observaciones de severidad baja/informativa (sección 16) que no impiden el freeze.

---

## 2. Producción E2E observada

Estado real en BD (consultado con rol privilegiado, sin leer tokens):

| Plataforma | status | error_code | item_count | pages_fetched | filas reales | last_success_at (UTC) |
|---|---|---|---|---|---|---|
| facebook | ok | NULL | 3 | 1 | 3 | 2026-10-22 17:22:26.633 |
| instagram | ok | NULL | 1 | 1 | 1 | 2026-10-22 17:22:26.696 |

- `meta_connections`: 1 fila, `status=connected`, `instagram_status=connected`, `page_name=Localseohub.io`, `instagram_username=localseohub.io`.
- `meta_sync_state.external_account_id` coincide con `meta_connections.page_id` (FB) e `instagram_account_id` (IG): **true / true**.
- `user_id` y `business_id` de cada fila coinciden con la conexión: **true** en todas.
- `sync_started_at = NULL` en ambas → la sincronización terminó (no quedó colgada).
- 17:22 UTC = **19:22 Europe/Madrid (CEST, UTC+2)**, que coincide exactamente con lo mostrado en /fuentes ("22 oct 2026, 19:22").
- `item_count` (3 / 1) = número real de filas en `meta_content_items` (3 / 1). La UI muestra exactamente esos valores.

Validación cruzada independiente: el perfil de Instagram devuelto por Meta indica `media_count = 1`, igual al número de media persistidos. En Facebook, `pages_fetched = 1` sin página siguiente: Meta devolvió el conjunto completo (3 < límite 25).

Datos demo/mock/seed: 0 filas huérfanas, 0 filas con texto sospechoso ("demo", "lorem", "mock"), todos los IDs con formato numérico de Meta (CHECK en BD), todos los permalinks en `www.facebook.com` / `www.instagram.com`. La UI de /fuentes no lee `demoData` para esta sección.

---

## 3. Facebook data validation

Recorrido: Graph API v25.0 → `meta-read` (server) → normalización/validación → `meta_sync_apply` (SECURITY DEFINER, service_role) → `meta_sync_state` / `meta_content_items` → SELECT con RLS → `MetaSyncStatus`.

Llamadas reales:
1. `GET /{page_id}?fields=access_token` (con token de usuario) → Page token en memoria, nunca persistido.
2. `GET /{page_id}?fields=id,name,about,category,link,website,fan_count,followers_count` → se exige `id === page_id`; si no, `META_ACCOUNT_MISMATCH`.
3. `GET /{page_id}/published_posts?fields=id,message,created_time,permalink_url,status_type,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)&limit=25`; si Meta deniega el permiso de los resúmenes, se repite sin campos de engagement.

Publicaciones persistidas (Página `1393994523793266` = Localseohub.io):

| external_id | content_type | published_at (UTC) | texto | permalink | reaction_count | comment_count |
|---|---|---|---|---|---|---|
| 1393994523793266_122106732081502661 | photo | 2026-10-14 22:27:37 | 707 caracteres | www.facebook.com | NULL | NULL |
| 1393994523793266_122106721107502661 | photo | 2026-10-14 22:12:35 | NULL (sin mensaje) | www.facebook.com | NULL | NULL |
| 1393994523793266_1121631013746842 | photo | 2026-10-14 22:07:47 | NULL (sin mensaje) | www.facebook.com | NULL | NULL |

Campos almacenados: Meta post ID (`external_id`, prefijado con el Page ID), `published_at` (de `created_time`), `text_content` (de `message`, recortado a 5000), `permalink` (solo https), `content_type` (de `status_type`), `reaction_count`, `comment_count`, `fetched_at`.

**NULL ≠ 0 confirmado:** los recuentos de reacciones y comentarios están en `NULL` porque Meta no los entregó en esta lectura. `countOrNull` / `summaryCount` solo aceptan enteros seguros ≥ 0 recibidos de Meta; cualquier ausencia queda como `NULL`. La UI no muestra estos recuentos.

Perfil de Página guardado (`meta_sync_state.profile`): `name, category, about, link, website, fan_count, followers_count`. `fan_count` y `followers_count` = 0 son valores numéricos devueltos por Meta (si Meta no los enviara, serían `null`). `website` = null (no proporcionado por Meta).

---

## 4. Instagram data validation

Llamadas reales (token de usuario + appsecret_proof):
1. `GET /{ig_id}?fields=id,username,name,biography,website,followers_count,follows_count,media_count` → se exige `id === ig_id`.
2. `GET /{ig_id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=25`.

Media persistido (cuenta `17841462487279994`, username devuelto por Meta = `localseohub.io`):

| external_id | content_type | published_at (UTC) | caption | permalink | like_count | comments_count |
|---|---|---|---|---|---|---|
| 18144367309586214 | image | 2026-10-14 22:26:26 | 679 caracteres | www.instagram.com | 0 | 0 |

Los `0` son valores numéricos que Meta devolvió explícitamente (si Meta ocultara `like_count`, p. ej. por likes ocultos, quedaría `NULL`).

Campos realmente solicitados: los listados arriba. No se piden insights, alcance, impresiones, guardados ni comentarios individuales.

Instagram solo se sincroniza si `meta_sync_claim` devuelve `instagram_status = 'connected'` y un `instagram_account_id` numérico, ambos fijados server-side en A3.5.2 a partir del `instagram_business_account` que Meta asoció a la Página seleccionada. `meta_sync_apply` vuelve a verificarlo bajo `FOR UPDATE`; si la cuenta no está vinculada, el estado pasa a `not_linked` y se borran sus contenidos.

---

## 5. Persistencia

### `meta_sync_state`
- Finalidad: estado de la última lectura por plataforma, perfil normalizado y contadores.
- PK: `(connection_id, platform)`.
- `user_id` → `auth.users` ON DELETE CASCADE; `business_id` → `businesses` CASCADE; `connection_id` → `meta_connections` CASCADE.
- `external_account_id`: Page ID (FB) / IG Account ID (IG), CHECK numérico.
- `status` con CHECK: `never, ok, empty, not_linked, permission_unavailable, reauth_required, rate_limited, malformed, api_error`. `error_code` CHECK `^[A-Z_]{1,64}$`.
- Timestamps: `sync_started_at`, `last_attempt_at`, `last_success_at`, `updated_at` (timestamptz).
- `profile` jsonb (objeto, ≤ 8 KB, solo claves normalizadas; 0 filas con claves crudas `id/data/paging`).

### `meta_content_items`
- Finalidad: publicaciones/media recientes normalizados.
- PK: `id` uuid. UNIQUE `(connection_id, platform, external_id)`.
- `user_id`, `business_id`, `connection_id` con FK CASCADE; índice `(user_id, platform, published_at DESC)`.
- `account_external_id` (Page/IG ID), `external_id` (post/media ID) con CHECK de formato Meta.
- Campos: `content_type` (CHECK lista cerrada), `text_content` (≤ 5000), `published_at`, `permalink` (https, ≤ 1000), `reaction_count`, `comment_count` (NULL o ≥ 0), `fetched_at`.
- No hay columnas para tokens ni payload crudo.

Limpieza: trigger `meta_connections_purge_content` borra contenidos y estado al desconectar, reconectar o cambiar de Página; borra solo Instagram al cambiar la cuenta IG.

---

## 6. Idempotencia

- Clave lógica del UPSERT: **`(connection_id, platform, external_id)`** — `INSERT … ON CONFLICT … DO UPDATE` actualiza `content_type, text_content, published_at, permalink, reaction_count, comment_count, account_external_id, fetched_at`. Métricas cambiadas se sobrescriben con el valor de Meta (incluido `NULL` si Meta deja de enviarlo).
- Tras el UPSERT se eliminan los elementos de esa conexión/plataforma que ya no aparecen en la lectura actual (ventana "recientes").
- Dedup adicional en memoria por `external_id` antes de enviar.
- Producción: 0 grupos duplicados por `(connection_id, platform, external_id)` y 0 por `(platform, external_id)`.
- Pulsaciones repetidas: `meta_sync_claim` bloquea la fila de conexión (`FOR UPDATE`) y devuelve `cooldown` si hay un `sync_started_at` o `last_attempt_at` en los últimos 60 s → la UI muestra "Acabas de sincronizar…". Dos peticiones concurrentes no pueden ejecutarse a la vez.
- Colisión entre usuarios: imposible; la unicidad incluye `connection_id`, y cada conexión pertenece a un único usuario.
- `item_count` se calcula en BD con `count(*)` tras el UPSERT, no con el número enviado.

---

## 7. User isolation

- RLS habilitado en ambas tablas. Única política: `SELECT TO authenticated USING (auth.uid() = user_id)`.
- Grants: `authenticated` solo `SELECT`; `anon` sin privilegios. No hay INSERT/UPDATE/DELETE desde el navegador.
- RPCs `meta_sync_claim`, `meta_sync_apply`, `meta_read_token`, `meta_fail_connection`: SECURITY DEFINER, `search_path=''`, EXECUTE solo `service_role` (anon/authenticated: ninguno).
- La edge function ignora cualquier ID del cliente: el body solo admite `{action:'sync'}`. El usuario se obtiene del JWT (`auth.getUser`), el negocio por `user_id` y la conexión por `user_id + business_id`.
- `meta_sync_claim` y `meta_sync_apply` verifican `v_conn.user_id = p_user_id`, `status='connected'` y que la cuenta coincida con la guardada; si no, `not_connected` / `false`.
- Resultado: un usuario A no puede leer, sincronizar, modificar ni dirigir la lectura hacia activos de B.

---

## 8. Credential security

- Token de usuario: sigue en Vault (A3.5.2); `meta_connections.user_token_ref` es una referencia opaca (no comienza por `EAA`). Se lee solo mediante `meta_read_token` (service_role).
- Page token: obtenido bajo demanda, solo en memoria de la función, nunca persistido ni devuelto.
- Tokens viajan en `Authorization: Bearer`; `access_token` se elimina de cualquier URL, incluidas las de paginación.
- `appsecret_proof`: HMAC-SHA256 calculado en servidor; se elimina de las URLs `paging.next` antes de recalcularse; nunca persistido ni registrado.
- `META_APP_SECRET`: solo `Deno.env`.
- Authorization code / OAuth state: no intervienen en A3.5.3.
- Producción: 0 coincidencias de patrones de token (`EAA…`, `access_token`, `appsecret`, `code=`, `state=`) en `meta_content_items` y `meta_sync_state`. `meta_credential_invariant_violations()` = 0.
- Respuesta al navegador: solo `{ok, facebook:{status,itemCount,errorCode}, instagram:{…}}` o `{code,error}`.
- `meta-oauth-start`, callback, Vault y la recuperación cancel/retry/stale no han sido modificados por A3.5.3.

---

## 9. Logging

Log estructurado de `meta-read` con claves fijas: `fn, platform, endpoint, pages, items, metaCode, durationMs, result`. `endpoint` es una etiqueta lógica (`page_token`, `page_profile`, `page_posts`, `page_posts_basic`, `ig_profile`, `ig_media`), no la URL.

No se registran: tokens, app secret, appsecret_proof, URLs, mensajes de error de Meta, payloads ni textos de publicaciones. Errores de RPC registran solo `error.code`; excepciones no controladas registran un mensaje fijo.

Limitación: desde este entorno no es posible leer los logs desplegados; la verificación es por revisión de código y por los tests que capturan el logger.

---

## 10. Error handling

| Caso | Comportamiento |
|---|---|
| Token expirado (`token_expires_at` pasado o Meta 190/102) | Ambas plataformas → `reauth_required`, conexión marcada `reauth_required`, HTTP 401 `REAUTH_REQUIRED`; la UI lanza el flujo de reconexión. Sin auto-refresh. |
| Token revocado / ausente en Vault | Igual que expirado. |
| Permiso eliminado (10, 200–299) | `permission_unavailable` / `META_PERMISSION_DENIED`; en posts FB se reintenta sin engagement. |
| Rate limit (4, 17, 32, 613) | `rate_limited` / `META_RATE_LIMITED`. |
| Graph no disponible / HTTP no-OK | `api_error` / `META_API_ERROR`. |
| Timeout (10 s) | `api_error` / `META_TIMEOUT`. |
| Página eliminada/inaccesible (100 o id distinto) | `api_error` / `META_UNSUPPORTED` o `malformed` / `META_ACCOUNT_MISMATCH`. |
| Instagram desvinculado | `not_linked`, se borran contenidos IG. |
| Respuesta malformada | `malformed` / `META_MALFORMED_RESPONSE`. |
| Conexión cambiada a mitad | `conflict` / `CONNECTION_CHANGED`, no se escribe. |
| Parcial FB OK / IG error | Cada plataforma se guarda por separado; la UI muestra FB en verde y IG en aviso. No hay mensaje global de éxito. |

En errores se conservan los datos y `last_success_at` anteriores, y la UI los etiqueta como "Datos de la última sincronización correcta: …", nunca como "Última sincronización".

Estados equivalentes: SUCCESS = `ok`/`empty`; PARTIAL = una plataforma `ok` y otra en error; ERROR = `permission_unavailable/rate_limited/malformed/api_error`; REAUTH_REQUIRED = `reauth_required`.

---

## 11. Timestamp validation

- "Última sincronización" en /fuentes procede de `meta_sync_state.last_success_at`, que solo escribe `meta_sync_apply` con `now()` tras un UPSERT correcto (`ok`/`empty`).
- Almacenamiento: `timestamptz` (UTC). Producción: 17:22:26 UTC.
- Frontend: `Intl.DateTimeFormat` con zona del navegador → 19:22 en Madrid. Correcto.
- Cargar la página no escribe nada (solo SELECT).
- Timestamps independientes por plataforma (FB 17:22:26.633, IG 17:22:26.696).
- `meta_connections.last_synced_at` (16:49 UTC) es el momento de conexión de A3.5.2 y la UI de A3.5.3 no lo muestra (ver F3).

---

## 12. Permissions

- Scopes solicitados (sin cambios): `pages_show_list, pages_read_engagement, business_management, instagram_basic`.
- Permisos concedidos en producción: esos cuatro más `public_profile` (concedido por defecto por Meta en todo login; no solicitado por la app).
- Sin permisos de publicación, gestión de posts, mensajes, comentarios, anuncios, insights ni moderación.

Datos que A3.5.3 lee realmente: perfil público de la Página, publicaciones publicadas (texto, fecha, tipo, enlace) y, cuando Meta los entrega, totales de reacciones/comentarios; perfil de la cuenta IG profesional (usuario, nombre, bio, web, seguidores, seguidos, nº de media) y media recientes (caption, tipo, fecha, enlace, likes, comentarios).

---

## 13. Truthfulness

- Nº de publicaciones/contenidos: recuento real en BD de lo devuelto por Meta.
- Timestamps: reales de la última sincronización correcta; los datos antiguos se marcan como tales.
- Likes/reactions/comments: `NULL` cuando Meta no los envía (FB en producción); `0` solo cuando Meta envía `0` (IG). No se muestran en la UI en esta fase.
- Instagram no vinculado: "Sin cuenta vinculada", sin datos.
- Ausencia de datos: "Aún no sincronizado" / "Sin datos sincronizados" / "Sin publicaciones recientes".
- No hay estimaciones ni simulaciones en esta capa.

Cumple la regla de veracidad de LocalSEOHub.

---

## 14. Regression testing

`npm test`: **58 test files, 2051 tests, todos pasan.**

Incluye: A3.5.1 (`a351MetaConnection`), A3.5.1.2 recuperación (`a3512MetaRecovery`), A3.5.2.1 permisos (`a3521MetaPagePermissions`), A3.5.3 (`a353MetaReadLayer`, 53 tests), GBP (`a341`, `a3422`, `gbpListLocations`), Meta Pixel/conversión (`a3Conversion`, `a31PurchaseActivation`), consentimiento (`a351aConsent`), auth/email (`a261*`, `f03Stage2b`, `passwordReset`), pagos (`stripeBilling`, `stripeWebhook`, `a26Billing`, `checkoutCta`), Hoy (`a272TodayIntelligence`), Plan (`a273Roadmap`), Herramientas (`toolsHub`), Fuentes/integraciones (`a25Integration`).

---

## 15. Build result

`npm run build`: **correcto** (Vite, "built in 10.96s"), sin errores.

---

## 16. Findings

No hay hallazgos bloqueantes, críticos ni de severidad alta/media.

| ID | Severidad | Archivo / objeto | Descripción | Impacto | Recomendación |
|---|---|---|---|---|---|
| F1 | Info | `meta-read/handler.ts`, datos FB | Los totales de reacciones/comentarios de FB están en `NULL` en producción (Meta no los entregó; posible reintento sin engagement). No se pueden leer los logs desplegados desde aquí para saber qué rama se usó. | Ninguno: se guarda como desconocido y no se muestra. | En A3.5.4 tratar `NULL` como "no disponible", nunca como 0. Sin hotfix. |
| F2 | Info | `meta_sync_state.profile` FB | `fan_count`/`followers_count` = 0 son valores reales de Meta (Página nueva). | Ninguno. | Ninguna. |
| F3 | Baja | `meta_connections.last_synced_at` | El nombre sugiere sincronización de contenido, pero refleja la conexión A3.5.2. No se usa en la UI de A3.5.3. | Riesgo de confusión en fases futuras. | En A3.5.4 usar `meta_sync_state.last_success_at` como única fuente. Sin hotfix. |
| F4 | Baja | `meta_sync_apply` | Ventana "recientes": se eliminan los elementos que ya no aparecen en la última lectura (máx. 100 por plataforma). | Esperado; no hay histórico. | Documentado; reconsiderar si A3.5.4 necesita historial. |
| F5 | Baja | `meta-read/index.ts` `getOwnConnectionId` | `maybeSingle()` sobre `businesses`: un usuario con varios negocios obtendría un error 500 seguro. Supuesto actual de la app: un negocio por usuario. | Fallo seguro, sin fuga. | Ninguna mientras se mantenga el supuesto. |
| F6 | Info | — | La idempotencia ante sincronizaciones repetidas en producción se garantiza por la restricción UNIQUE + UPSERT + cooldown y queda cubierta por tests; el estado actual (0 duplicados) es consistente. | Ninguno. | Ninguna. |

---

## 17. Freeze decision

**GO — FREEZE A3.5.3**

Todos los criterios se cumplen: E2E real confirmado, datos de Meta, aislamiento por usuario y plataforma, sin duplicados, idempotencia, `NULL ≠ 0`, tokens protegidos, sin regresiones, tests y build en verde.

Esta decisión congela solo el Meta Read Layer. La integración Meta completa no está terminada; la siguiente fase independiente es A3.5.4 — Social Intelligence (no implementada ni diseñada en esta auditoría).

---

## 18. Exact scope frozen

- Edge function `supabase/functions/meta-read/` (`handler.ts`, `index.ts`) y su entrada `[functions.meta-read] verify_jwt = true`.
- Migraciones `20261022170333_a353_meta_read_layer.sql` y `20261022170523_a353_meta_sync_claim_min_interval.sql`: tablas `meta_sync_state`, `meta_content_items`, sus políticas RLS/grants/constraints/índices, RPCs `meta_sync_claim`, `meta_sync_apply`, trigger `meta_connections_purge_content`.
- Frontend: `metaSyncStatus.ts`, `MetaSyncStatus.tsx`, `loadMetaSyncState` y `syncMetaContent` en `metaRepository.ts`, e integración en `MetaConnectionCard.tsx` (rama conectada).
- Tests `a353MetaReadLayer.test.ts` y los guardrails de recuento de migraciones (49).
- Contrato: Graph v25.0, appsecret_proof, campos solicitados (sección 3/4), límites (25 por página, 4 páginas, 100 elementos, 10 s timeout, 60 s cooldown), clasificación de errores y semántica `NULL ≠ 0`.

Fuera del freeze (sin cambios y ya congelado aparte): A3.5.2 (OAuth start/callback, scopes, Vault, cancel/retry/stale).
