# A3.5.2.1 — META PAGE DISCOVERY PERMISSIONS HOTFIX

Origen: A3_5_2_META_PAGE_DISCOVERY_POST_OAUTH_DIAGNOSTIC.md (`/me/accounts` → `{"data":[]}` por falta de `business_management`).
Estado: **listo para el siguiente E2E real**. La integración Meta **no** está terminada.

## 1. Archivos modificados

| Archivo | Cambio |
|---|---|
| `supabase/functions/meta-oauth-start/handler.ts` | `META_SCOPES` ampliado, `auth_type=rerequest`, log seguro de los scopes solicitados |
| `supabase/functions/meta-oauth-callback/handler.ts` | `PAGE_PERMISSIONS`, `graphErrorDetail()` (lista blanca de campos), logs por etapa, clasificación veraz de la lista vacía |
| `src/features/meta-connection/metaStatus.ts` | Textos ES/EN de `NO_AUTHORIZED_PAGES`, `META_PERMISSION_UNAVAILABLE` y `PAGE_DISCOVERY_FAILED` |
| `src/features/meta-connection/__tests__/a351MetaConnection.test.ts` | Scopes esperados y permisos simulados adaptados a los cuatro permisos |
| `src/features/meta-connection/__tests__/a3521MetaPagePermissions.test.ts` | **Nuevo** |

Edge Functions desplegadas: `meta-oauth-start`, `meta-oauth-callback`. `meta-connection` no cambia.
Sin migraciones ni cambios de base de datos. No se ha tocado GBP, Meta Pixel, consentimiento, Stripe ni otras pantallas.

## 2. Scopes finales solicitados

```
pages_show_list,pages_read_engagement,business_management,instagram_basic
```
Ningún permiso de publicación, mensajes, comentarios, anuncios ni `pages_manage_*`; los tests lo comprueban.

## 3. Comportamiento de rerequest

El diálogo incluye `auth_type=rerequest` **siempre**.
- Los permisos que nunca se habían solicitado (`business_management`, `pages_read_engagement`) los pide Meta de todos modos, porque son nuevos en el scope.
- Si el usuario **rechaza** alguno, Meta no lo vuelve a mostrar en intentos posteriores salvo que se use `rerequest`. Sin ese parámetro, "Reintentar conexión" se quedaría en un bucle sin salida. Según la documentación de Meta, `rerequest` sirve exactamente para volver a pedir permisos rechazados, y no tiene efecto sobre los ya concedidos.
- Se mantiene Facebook Login clásico con `scope`: **sin `config_id`** ni Facebook Login for Business. No hace falta migrar: el código actual funciona con este modelo y Meta muestra los permisos como "Listo para prueba".

## 4. Flujo del callback

Se mantiene sin cambios: state de un solo uso → canje del token corto → token largo → `appsecret_proof` en todas las llamadas a Graph → token en Vault → aislamiento por usuario → transiciones de estado controladas por el servidor → recuperación de intentos atascados, cancelación y reintento (A3.5.1.2) → protección de conexiones válidas.

Descubrimiento de páginas (en el servidor):

| Resultado de Meta | Código | Texto visible (ES) |
|---|---|---|
| ≥ 1 página | (selección existente) | — |
| `data: []` y los 3 permisos de página concedidos | `NO_AUTHORIZED_PAGES` | Meta no devolvió ninguna página de Facebook. Comprueba que administras la página del negocio y que la marcaste al dar permiso, y vuelve a conectar. |
| `data: []` y falta o se rechazó `pages_show_list`, `pages_read_engagement` o `business_management` | `META_PERMISSION_UNAVAILABLE` | No se concedieron todos los permisos necesarios para ver tus páginas (incluido el acceso a la empresa). Vuelve a conectar y acéptalos todos. |
| Error de Graph (HTTP no 2xx o `error`) | `PAGE_DISCOVERY_FAILED` / `META_API_RATE_LIMIT` / `REAUTH_REQUIRED` / `META_PERMISSION_UNAVAILABLE` (según el código de Meta) | Meta devolvió un error al consultar tus páginas de Facebook. Espera unos minutos y vuelve a intentarlo. |
| Respuesta sin `data` | `PAGE_DISCOVERY_FAILED` | ídem |

Si Meta devuelve páginas aunque `business_management` esté rechazado (páginas personales), el flujo continúa con normalidad.

## 5. Logs seguros (prefijo `[meta-oauth-callback]` / `[meta-oauth-start]`, JSON)

| Etapa | Campos |
|---|---|
| `authorize_url` | `scopes`, `auth_type` |
| `token_exchange` | `ok`, `long_lived`, `expires_in_s` |
| `token_exchange_short` / `_long` (fallo) | `http`, `code`, `subcode`, `type`, `fbtrace_id` |
| `me` / `permissions` / `page_discovery` (error de Graph) | `http`, `result`, `code`, `subcode`, `type`, `fbtrace_id` |
| `permissions` | `granted`, `declined`, `expired` (solo nombres `^[a-z_]+$`) |
| `page_discovery` | `endpoint: "/me/accounts"`, `returned`, `pages`, `has_next` (booleano, nunca la URL `next`, que contiene el token) |
| `page_discovery_empty` | `missing_permissions` |

Nunca se registran: tokens, App Secret, authorization code, `appsecret_proof`, state, token de finalización ni el `message` libre de Graph. Los tests lo verifican de forma explícita, incluso cuando Graph mete el token en su mensaje de error.

## 6. Instagram

Sin cambios: el callback no consulta ni guarda Instagram. Al elegir página, `meta-connection` lee `/{pageId}?fields=instagram_business_account` y parte de `not_associated`. Solo marca `connected` si Meta devuelve la cuenta y su `username`. Ahora que se solicita `pages_read_engagement`, esta lectura debería funcionar con páginas de empresa, pero hay que comprobarlo en el E2E.

## 7. Pruebas añadidas (`a3521MetaPagePermissions.test.ts`, 15)

1. El diálogo pide exactamente los cuatro scopes, con `auth_type=rerequest`, `response_type=code` y sin `config_id`.
2. Todos los `PAGE_PERMISSIONS` están en `META_SCOPES`.
3. Con páginas devueltas, el flujo existente continúa (se guarda la autorización, sin Instagram) y se registra el recuento.
4. Lista vacía con todo concedido → `NO_AUTHORIZED_PAGES`, con `returned:0` y `missing_permissions:[]` en el log.
5. Lista vacía con `business_management` rechazado → `META_PERMISSION_UNAVAILABLE`, y el log muestra el rechazo.
6. Lista vacía sin `pages_read_engagement` → `META_PERMISSION_UNAVAILABLE`.
7. `business_management` rechazado pero con páginas devueltas → la conexión continúa.
8. Un error real de Graph → `PAGE_DISCOVERY_FAILED` (nunca "sin páginas"), con code, subcode, fbtrace_id y http en el log.
9. La paginación solo se registra como indicador, sin la URL que contiene el token.
10. Una respuesta mal formada → `PAGE_DISCOVERY_FAILED`.
11. El fallo del token largo registra la etapa y el código de Meta, sin secretos.
12. `graphErrorDetail` solo deja pasar los campos de la lista blanca.
13–14. Los tres mensajes visibles son distintos en ES y en EN.
15. Instagram no se da por conectado: se sigue verificando `instagram_business_account`.

## 8. Resultado

- Suite completa: **57 archivos, 1998 tests, todos pasan.**
- `npm run build`: **OK.**
- Funciones desplegadas en producción: `meta-oauth-start` y `meta-oauth-callback`.
- La fila de producción `meta_connections` sigue en `error / NO_AUTHORIZED_PAGES`. No se ha tocado, y "Reintentar conexión" inicia un intento nuevo con los permisos nuevos.

## 9. Bloqueos externos pendientes

1. **El E2E real lo tiene que hacer el usuario**: Reintentar conexión → aceptar los cuatro permisos (incluido el acceso a la empresa) → seleccionar la página.
2. **App Review de Meta**: `business_management` y `pages_read_engagement` están "Listo para prueba". Solo funcionan con usuarios que tengan un rol en la app mientras no estén aprobados. Para usuarios reales hace falta la revisión de Meta.
3. Si Meta vuelve a devolver 0 páginas con los tres permisos concedidos, los nuevos logs (`permissions`, `page_discovery`) mostrarán el detalle exacto para el siguiente diagnóstico.
4. La política de privacidad y el borrado de datos (A3.5.1A) deberían mencionar el acceso a activos empresariales antes de abrirlo al público.
5. La lectura de Instagram con páginas de empresa queda por validar en el mismo E2E.
