# A3.5.2.2 — META CONNECTION POST-E2E AUDIT & FREEZE

Fecha: 2026-10-22
Tipo: auditoría de solo lectura. No se ha modificado código, esquema, datos de producción, permisos Meta ni configuración externa.
Valores sensibles: ningún token, App Secret, authorization code ni appsecret_proof se ha leído, mostrado ni registrado. Los tokens solo se han verificado por existencia, formato de referencia y ubicación.

---

## 1. Estado real de producción (`public.meta_connections`)

Hay exactamente una fila en la tabla.

| Campo | Valor observado |
|---|---|
| id | `e85ae653-…-418c4ae7058a` |
| user_id | `aabe426e-…-17d9d126313e` |
| business_id | `e6014022-…-c7c55f808247` (negocio cuyo `user_id` coincide con la conexión: **sí**) |
| status | `connected` |
| page_name | `Localseohub.io` (Meta lo devuelve con "L" mayúscula, tal cual) |
| page_id | `1393994523793266` |
| instagram_status | `connected` |
| instagram_account_id | `17841462487279994` |
| instagram_username | `localseohub.io` |
| meta_user_id | presente (columna no visible para el cliente) |
| available_pages | `[]` (se vació al finalizar la selección, según diseño) |
| granted_permissions | `pages_show_list, business_management, instagram_basic, pages_read_engagement, public_profile` |
| last_error / last_error_at | `null` / `null` |
| revocation_status | `null` |
| attempt_started_at | 2026-10-22 16:49:01.82 UTC |
| secreto en Vault creado | 2026-10-22 16:49:23.21 UTC |
| connected_at = last_synced_at = updated_at | 2026-10-22 16:49:51.52 UTC |
| token_expires_at | 2026-12-21 15:45:42 UTC (token de larga duración, unos 60 días) |
| created_at | 2026-10-22 14:55:20 UTC (fila reutilizada de los intentos anteriores, A3.5.1.x y A3.5.2) |

La secuencia de tiempos es coherente con un único intento: inicio a las 16:49:01, token guardado en Vault a las 16:49:23 y conexión a las 16:49:51. La fila de error anterior (`NO_AUTHORIZED_PAGES`) se reutilizó mediante "Reintentar conexión", y `last_error` quedó limpio.

### Credenciales

- `user_token_ref` tiene el formato `vault:<uuid>` (42 caracteres), y el uuid corresponde a **1** secreto existente en `vault.secrets`.
- Ningún secreto de Vault contiene la referencia en claro (comprobado: 0).
- Desde A3.5.1 solo se ha creado **1** secreto en Vault, y está referenciado por esta conexión. No hay secretos huérfanos de los intentos fallidos.
- `meta_credential_invariant_violations()` = **0**: ninguna fila inactiva conserva credenciales.
- Triggers activos: `meta_connections_wipe_inactive` (BEFORE INSERT/UPDATE) y `meta_connections_forget_on_delete` (AFTER DELETE).
- Columnas que puede leer `authenticated`: attempt_started_at, available_pages, business_id, connected_at, created_at, granted_permissions, id, instagram_account_id, instagram_status, instagram_username, last_error, last_error_at, last_synced_at, page_id, page_name, revocation_status, status, token_expires_at, updated_at, user_id.
  - **`user_token_ref` y `meta_user_id` no están en esa lista.**
  - `anon` no tiene ningún privilegio.
- No se persiste ningún Page access token. `available_pages` solo guardaba `{id, name}`.

**Conclusión:** no hay tokens en texto plano en ninguna tabla accesible por el cliente.

---

## 2. OAuth state (`public.meta_oauth_states`)

Estado actual: **0 filas** (0 sin consumir, 0 con completion pendiente).

Esto es lo que exige el diseño. El ciclo de vida definido en las funciones desplegadas (leídas con `pg_get_functiondef`) es:

1. `meta_begin_attempt`
   - Comprueba que el negocio pertenece al usuario.
   - **Rechaza el intento si la conexión ya está `connected`** (`META_ALREADY_CONNECTED`).
   - Borra los states anteriores de esa conexión e inserta uno nuevo, con `state_hash`, `binding_hash` y `expires_at`.
2. `meta_consume_oauth_state`
   - Usa `FOR UPDATE` y devuelve `consumed` si el state ya se usó.
   - Marca `consumed_at` antes de cualquier otra comprobación.
   - Exige estado `connecting` y que el `user_id` coincida, y comprueba la expiración.
3. `meta_store_authorization` solo actúa si existe ese state con `consumed_at IS NOT NULL` y la conexión sigue en `connecting`.
4. `meta_complete_authorization`
   - Exige el mismo `user_id`, el mismo `binding_hash` del navegador que inició el flujo y un `completion_expires_at` vigente.
   - **Borra el state** tanto en el éxito como en el caso `stale`.

Evidencia del E2E: la conexión llegó a `connected` y se creó el secreto de Vault. Eso solo es posible si el state:

- se consumió (paso 3);
- pertenecía al usuario correcto (pasos 2 y 4);
- coincidió con el binding (paso 4);
- fue borrado después (paso 4).

Por eso la tabla está vacía. No queda ningún state activo ni huérfano que pueda alterar la conexión. Un replay del `state` original devuelve `unknown`, y un replay del `completion` devuelve `unknown` → `OAUTH_STATE_INVALID`.

Limitación: no hay acceso a los logs de Edge Functions desde esta auditoría. La validación del state concreto se demuestra por la cadena de precondiciones anterior y por el estado final, no por una línea de log.

---

## 3. Permisos

| Permiso | Requested (código de `meta-oauth-start`) | Granted (evidencia en BD) |
|---|---|---|
| pages_show_list | sí | **sí** |
| pages_read_engagement | sí | **sí** |
| business_management | sí | **sí** |
| instagram_basic | sí | **sí** |
| public_profile | no (Meta lo incluye por defecto) | sí |

Origen de la columna "granted":

- `granted_permissions` se rellena en `meta-oauth-callback` a partir de `GET /me/permissions`.
- Se filtra estrictamente por `status === "granted"` y por el patrón `^[a-z_]{1,64}$`.
- Los permisos `declined` y `expired` se registran en el log, pero **no** se guardan como concedidos.

Por tanto, "granted" refleja lo que Meta informó, no lo que se solicitó.

---

## 4. Descubrimiento de la Facebook Page

- `meta_finish_page_selection` solo pasa a `connected` si `p_page_id` existe en `available_pages`. A su vez, `available_pages` solo se llena desde `pending_pages`, que viene de `/me/accounts?fields=id,name` (ids filtrados por `^\d+$`).
  - Por lo tanto, `/me/accounts` devolvió al menos una Page real, y la Page persistida (`1393994523793266`) es una de ellas.
- `selectPage` en el servidor usa `page.name` tomado de esa misma lista. El cliente nunca envía el nombre.
- En este E2E se usó la selección automática: el usuario autorizó una sola Page, así que `pageCount === 1` y la selección es directa.
- No existe mock, fallback ni dato de demostración en esta ruta.
  - El servidor no tiene ninguna rama que genere Pages.
  - El modo demo de la app no toca `meta_connections`.

---

## 5. Descubrimiento de Instagram

En `meta-connection/handler.ts → selectPage`:

1. El valor inicial es `instagramStatus = "not_associated"` e `instagramId = null`. Es decir, por defecto Instagram se considera **no conectado**.
2. `GET /{pageId}?fields=instagram_business_account` (con `appsecret_proof`). Solo continúa si Meta devuelve `instagram_business_account.id` numérico.
3. `GET /{igId}?fields=id,username`. Solo si Meta responde OK con `username` de tipo string se marca `connected` y se guarda el username (truncado a 100 caracteres).
4. Ante cualquier error, el resultado es `permission_unavailable`, `unsupported` o `api_error`, y el id se anula.

Por tanto, `17841462487279994` / `localseohub.io` proceden de Meta, a través de la relación real Page → cuenta profesional de Instagram. No existe ninguna rama que fabrique un username ni un estado `connected`.

En el frontend, `instagramLabel` solo muestra `@username` si `status === 'connected'` **y** hay username. Si falta el estado, se muestra como `api_error`, nunca como conectado.

---

## 6. Seguridad (revalidación de A3.5.1 / A3.5.1.1 / A3.5.1.2 / A3.5.2.1)

| Garantía | Estado | Evidencia |
|---|---|---|
| Transiciones controladas por el servidor | OK | 13 funciones `SECURITY DEFINER` con `search_path=''`, EXECUTE solo para `service_role` (`execute_roles: []` para los roles cliente). |
| Aislamiento por usuario | OK | Política única `select_own_meta_connection USING (auth.uid() = user_id)`. Ownership del negocio verificado en `meta_begin_attempt`. `wrong_user` → `SESSION_MISMATCH`. |
| Tokens en Vault | OK | Referencia `vault:<uuid>`, 1 secreto, 0 huérfanos, 0 violaciones de invariante. |
| appsecret_proof | OK | Se usa en todas las llamadas Graph de callback y connection (HMAC-SHA256). |
| State de un solo uso / anti-replay | OK | Ver §2. |
| Recuperación de intentos estancados | OK | `recover` → `meta_expire_stale_attempt` (11 min). El frontend también trata como expirado un intento de más de 11 min. |
| Cancel/retry seguros | OK | `cancel` solo actúa sobre `connecting`/`authorized`. `begin_attempt` limpia states previos. |
| Una reconexión fallida no destruye una conexión válida | OK | `begin_attempt` rechaza las filas `connected`. `store`/`complete`/`finish` exigen el estado previo exacto. `cancel` ignora `connected`. |
| El frontend no puede escribir estados sensibles | OK | Sin grants de INSERT/UPDATE/DELETE para anon/authenticated. Sin políticas de escritura. `meta_oauth_states` no tiene ningún grant. |
| Secretos Meta solo en el servidor | OK | `META_APP_SECRET` solo se lee con `deps.env` en Edge Functions. El navegador solo guarda el `binding` temporal en sessionStorage (se borra al usarlo; no es una credencial de Meta). |
| Logs seguros | OK | A3.5.2.1: solo stages, códigos, recuentos y nombres de permisos. Los tests verifican que no aparecen token, code ni proof. |

No se ha detectado ninguna regresión de seguridad.

---

## 7. Frontend

- `metaRepository` solo lee `meta_connections` con una lista fija de columnas no sensibles, bajo RLS. Todas las acciones (start, complete, select_page, cancel, recover, disconnect) pasan por Edge Functions.
- `metaView` deriva "Conectado" exclusivamente de `row.status === 'connected'`, y el estado de Instagram de `row.instagram_status`.
- El único dato del navegador es la clave `binding` en sessionStorage (se usa una vez y se elimina) y el flag de navegación `metaPick`, que solo abre el selector. Ninguno puede marcar Facebook o Instagram como conectados: sin una fila `connected` en servidor, la tarjeta no lo muestra.
- No hay localStorage en la funcionalidad Meta.

El "Facebook e Instagram — Conectado" de /fuentes procede exclusivamente del estado validado en el servidor.

---

## 8. Preparación para A3.5.3 — Read Layer (sin implementar)

La conexión es una base segura para empezar el Read Layer.

### Probablemente legible con los permisos actuales

Sujeto a las condiciones de la siguiente sección (Advanced Access).

**Facebook Page (`pages_show_list`, `pages_read_engagement`, `business_management`):**
- Datos básicos de la Page: name, about, category, link, website, fan_count, followers_count, picture.
- Publicaciones propias: `/{page}/published_posts` o `/feed`, con message, created_time y permalink_url.
- Recuentos de engagement por publicación: reactions/likes/comments `summary(total_count)` y shares.
- Lista de Pages autorizadas y su relación con el portfolio empresarial.

**Instagram (`instagram_basic` vía la Page):**
- Perfil: username, name, biography, website, profile_picture_url, followers_count, follows_count, media_count.
- Medios: `/{ig}/media` con caption, media_type, media_url/thumbnail_url, permalink, timestamp, like_count y comments_count.

### Requieren permisos adicionales (no añadidos)

| Dato | Permiso necesario |
|---|---|
| Page Insights (alcance, impresiones, métricas de audiencia) | `read_insights` |
| Texto y autores de comentarios o publicaciones de usuarios en la Page | `pages_read_user_content` |
| Responder, ocultar o moderar comentarios de Facebook | `pages_manage_engagement` |
| Publicar en la Page | `pages_manage_posts` |
| Mensajes de Messenger | `pages_messaging` |
| Instagram Insights (alcance, impresiones, demografía) | `instagram_manage_insights` |
| Leer/gestionar el contenido de comentarios de Instagram | `instagram_manage_comments` |
| Publicar en Instagram | `instagram_content_publish` |
| Mensajes directos de Instagram | `instagram_manage_messages` |
| Anuncios, Pixel, Conversions API | `ads_read` / `ads_management` (fuera de alcance) |

### Condiciones a tener en cuenta en A3.5.3 (no son defectos de A3.5.2)

1. **App Review / Advanced Access.** Hasta que Meta apruebe `pages_read_engagement`, `business_management` e `instagram_basic`, solo funcionará para usuarios con rol en la app de Meta. Es un bloqueo de lanzamiento, no de congelación.
2. **Page access token.** No se persiste. Muchos endpoints de Page lo requieren. A3.5.3 debe obtenerlo en el servidor bajo demanda (`/me/accounts?fields=access_token` o `/{page}?fields=access_token`) sin almacenarlo, o bien añadir un almacenamiento en Vault nuevo y aditivo. No debe tocar `user_token_ref`.
3. **Caducidad del token** (2026-12-21). No hay renovación automática. `recover` pasa a `reauth_required` al caducar. El Read Layer debe tratar el código 190 como `REAUTH_REQUIRED` usando las funciones existentes.
4. **Límites de uso de Graph** (4/17/32/613). El Read Layer debe usar caché y respetar `META_API_RATE_LIMIT`.
5. **Política de privacidad.** Pendiente de A3.5.1A: debe mencionar el acceso a activos empresariales (`business_management`) y los datos que se lean.

---

## 9. Regresiones

| Comprobación | Resultado |
|---|---|
| Tests específicos Meta (3 ficheros) | **146/146 OK** |
| Suite completa (57 ficheros) | **1998/1998 OK** |
| Build de producción | **OK** |

La suite incluye los tests de GBP (a341, a3422, gbpListLocations, a342), consentimiento y Meta Pixel (a351aConsent, a3Conversion, a31PurchaseActivation), autenticación y email (a261, f03Stage2b, passwordReset), Stripe (stripeBilling, stripeWebhook, a26Billing, checkoutCta), otras fuentes (analyzeWebsiteSsrf), Hoy (a272), Plan/roadmap (a273) y Herramientas (toolsHub). Todos pasan.

A3.5.2.1 solo modificó `meta-oauth-start`, `meta-oauth-callback`, los textos de error Meta y sus tests. No tocó ninguna tabla, función SQL ni pantalla compartida.

---

## 10. Observaciones menores (no bloqueantes)

- `page_name` se guarda como `Localseohub.io`, tal como lo devuelve Meta. Si se desea mostrarlo en minúsculas, sería un ajuste solo visual.
- Sin acceso a los logs de Edge Functions desde esta auditoría. La evidencia se basa en el estado de BD, las funciones desplegadas y el código.
- La fila conserva el `created_at` de los intentos anteriores (diseño: una fila por usuario y negocio, reutilizada).

---

## VEREDICTO

# GO — FREEZE A3.5.2

### Componentes y contratos congelados

Solo se pueden cambiar con una nueva auditoría:

1. **Esquema** de `meta_connections` y `meta_oauth_states`: columnas, constraints, RLS, la política `select_own_meta_connection` y los grants por columna (sin `user_token_ref` ni `meta_user_id` para el cliente).
2. **Funciones SQL**: `meta_begin_attempt`, `meta_consume_oauth_state`, `meta_store_authorization`, `meta_complete_authorization`, `meta_finish_page_selection`, `meta_fail_connection`, `meta_cancel_attempt`, `meta_expire_stale_attempt`, `meta_disconnect`, `meta_read_token`, `meta_vault_put/reveal/forget`, `meta_credential_invariant_violations` y los triggers `meta_connections_wipe_inactive` / `meta_connections_forget_on_delete`. Incluye su semántica de estados y su EXECUTE solo para `service_role`.
3. **Máquina de estados**: `disconnected → connecting → authorized → page_selection_required → connected`, más `error` / `reauth_required`.
4. **Edge Functions** `meta-oauth-start`, `meta-oauth-callback` y `meta-connection`, con:
   - los scopes `pages_show_list, pages_read_engagement, business_management, instagram_basic`;
   - `auth_type=rerequest`;
   - OAuth clásico sin `config_id`;
   - Graph `v25.0`;
   - `appsecret_proof`;
   - el intercambio de token corto → largo;
   - state y binding con hash;
   - `STALE_ATTEMPT_MS`;
   - los códigos de error;
   - la detección de Instagram con `not_associated` por defecto.
5. **Contrato del frontend**: solo lectura de `meta_connections`, `metaView`/`instagramLabel`, y binding en sessionStorage de un solo uso.
6. **Política de logs seguros** de A3.5.2.1.

### Lo que A3.5.3 puede añadir sin alterar esta base

- Nuevas Edge Functions de lectura (por ejemplo `meta-read-page`, `meta-read-instagram`) que:
  - autentiquen al usuario;
  - localicen su fila `connected`;
  - obtengan el token con `meta_read_token` (solo `service_role`);
  - llamen a Graph con `appsecret_proof`;
  - informen de un 190 mediante `meta_fail_connection(..., 'reauth_required', 'REAUTH_REQUIRED')`.
- Obtener el Page access token bajo demanda en el servidor, sin persistirlo en `meta_connections`.
- Tablas nuevas y aditivas de caché o snapshot de datos leídos, con su propia RLS de propietario y sin columnas de credenciales.
- Nuevas pantallas o tarjetas de lectura y textos asociados.
- Añadir permisos (insights, comentarios, etc.) solo en una fase propia con App Review. Implicaría modificar los scopes congelados y, por tanto, una nueva auditoría.

**La integración Meta no se declara terminada:** quedan el Read Layer, el App Review de Meta y la actualización de la política de privacidad.
