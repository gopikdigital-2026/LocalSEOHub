# A3.5.2 — META PAGE DISCOVERY POST-OAUTH DIAGNOSTIC

Modo: solo lectura. No se ha implementado ningún cambio.

## 1. Resumen ejecutivo

El OAuth de Meta funcionó de principio a fin: el `state` se validó, los dos canjes de token (código → corto, corto → largo) dieron 200, `/me` dio 200 y `/me/permissions` devolvió `pages_show_list` como **granted**. El fallo ocurre en el último paso de lectura: **`GET /v25.0/me/accounts?fields=id,name&limit=100` respondió con éxito (sin error de Graph) pero con `data: []`**. LocalSEOHub traduce eso, sin pérdida de información, a `NO_AUTHORIZED_PAGES`.

Meta devuelve una lista vacía porque **la app no solicita `business_management`**. Según la documentación de Meta para `/{user-id}/accounts`, si el usuario tiene páginas de empresa (páginas dentro de un portfolio empresarial / Business Suite), la app necesita `business_management` para verlas. Desde Graph v17 o superior, `/me/accounts` devuelve una lista vacía sin dar ningún error cuando solo están concedidos `pages_show_list` e `instagram_basic`. La pantalla "páginas actuales y futuras" de Meta registra la selección de activos, pero no la expone por `/me/accounts` sin ese permiso.

Escenario: **I (otro problema concreto)**, que combina A y E. Meta devuelve realmente 0 páginas porque el conjunto de permisos solicitado (`pages_show_list`, `instagram_basic`) no basta para enumerar páginas de empresa. **No** es G: no se oculta ningún error de Graph.

## 2. Cronología del último E2E (UTC, 2026-10-22)

| Hora | Evento | Fuente |
|---|---|---|
| 15:45:15 – 15:46:04 | Sesión del usuario activa en la app (eventos `login_success`) | analytics_events |
| 15:46:14.153 | `meta_begin_attempt` → status `connecting`, `attempt_started_at` | meta_connections |
| 15:46:14 | Vista de página (salida hacia Meta) | analytics_events |
| 15:46:14 → 15:47:19 | Usuario en el diálogo de Meta (~65 s): continuar como…, páginas (todas), Instagram (todas), "Se ha conectado…" | relato E2E |
| 15:47:19.395 | Callback: `NO_AUTHORIZED_PAGES` → `meta_fail_connection` → status `error` | meta_connections.last_error_at |
| 15:47:20 | Vuelta a la app (`/oauth/meta/callback` → /fuentes) | analytics_events |

El intento duró unos 65 s, muy por debajo del TTL de 10 min, así que la expiración queda descartada.

## 3. Estado real de meta_connections

Una única fila (`e85ae653-…`):

| Campo | Valor |
|---|---|
| status | `error` |
| last_error | `NO_AUTHORIZED_PAGES` |
| last_error_at | 2026-10-22 15:47:19 |
| attempt_started_at | 2026-10-22 15:46:14 |
| connected_at | null |
| created_at / updated_at | 14:55:20 / 15:47:19 |
| meta_user_id | null |
| page_id / page_name | null / null |
| instagram_account_id / instagram_status | null / null |
| available_pages | `[]` |
| granted_permissions | `[]` (no se persiste en la ruta de fallo) |
| token almacenado (`user_token_ref`) | **no**: nunca se guardó, porque el fallo es anterior a `storeAuthorization` |
| token_expires_at | null |
| revocation_status | null |

## 4. Estado de meta_oauth_states

La tabla está **vacía**. Es lo esperado: `consume_state` marcó el `state` como consumido (si no, el código sería `OAUTH_STATE_INVALID` o `_EXPIRED`) y `meta_fail_connection` borró todos los estados de la conexión al terminar.
- State válido y consumido: **sí** (deducido por la ruta de código alcanzada).
- Expirado: **no** (~65 s frente a 10 min).
- States huérfanos: **ninguno**.
- No se guardan las horas exactas de creación y consumo porque la fila se borró; la creación coincide con 15:46:14.

## 5. Resultado del token exchange

`meta-oauth-callback/handler.ts`, líneas 140–155:
- Código → token corto (`/v25.0/oauth/access_token`): **OK** (si fallara sería `TOKEN_EXCHANGE_FAILED`).
- Token corto → token largo (`grant_type=fb_exchange_token`): **OK** (mismo razonamiento).
- Tipo: **User Access Token de larga duración** (unos 60 días). No queda registro del `expires_in` porque el token nunca se persistió.
- Las llamadas posteriores usan Bearer más `appsecret_proof`, y `/me` respondió 200 con `id`. El token era válido.

## 6. Permisos solicitados (REQUESTED)

`meta-oauth-start/handler.ts:9`: `META_SCOPES = ["pages_show_list", "instagram_basic"]`.
Diálogo: `https://www.facebook.com/v25.0/dialog/oauth` con `scope`, `response_type=code` y **sin `config_id`**. Es Facebook Login clásico, no Facebook Login for Business (tampoco existe ningún secreto tipo `META_CONFIG_ID`).

**No se solicitan** `business_management`, `pages_read_engagement` ni `pages_manage_metadata`.

## 7. Permisos concedidos (GRANTED)

| Permiso | Estado | Evidencia |
|---|---|---|
| pages_show_list | **GRANTED** | Si no, el error sería `META_PERMISSION_UNAVAILABLE` (línea 166) |
| instagram_basic | probablemente GRANTED | No se comprueba ni se persiste en la ruta de fallo |
| business_management | **NO SOLICITADO** | No aparece en el scope |
| pages_read_engagement | **NO SOLICITADO** | — |
| DECLINED / EXPIRED | no determinable | La lista completa de `/me/permissions` se descarta al fallar y el token no se guarda |

Limitación: la lista exacta que devolvió `/me/permissions` no se puede recuperar. No hay registros de las funciones del servidor accesibles desde este entorno, el token se descartó y la función solo registra el código final. Solo es seguro el estado de `pages_show_list`.

### Casos de uso de Meta Developers
- "Administrar todo desde la página" (*Manage everything on your Page*): en el panel nuevo agrupa `pages_show_list`, `business_management`, `pages_read_engagement`, `pages_manage_metadata`, etc. y está pensado para trabajar con activos empresariales. Aunque el caso de uso los tenga configurados, la app **solo pide dos**, así que el token **no** incluye `business_management`. Esto es un desajuste entre (a) lo configurado y (b) lo solicitado.
- "Administrar mensajes y contenido en Instagram": según la variante, usa la API de Instagram con Instagram Login (`instagram_business_basic`, …), que es un producto distinto del `instagram_basic` vía Facebook Login que pide el código. Es un desajuste potencial para la siguiente fase y no afecta a este fallo.
- No he podido leer la configuración real del panel de Meta Developers desde aquí. Debe revisarla el propietario de la app.

## 8. Endpoint de descubrimiento de páginas

`GET https://graph.facebook.com/v25.0/me/accounts?fields=id,name&limit=100&appsecret_proof=…`, con el **User Access Token de larga duración** en la cabecera `Authorization: Bearer`. El token es el correcto para este endpoint, así que F queda descartado.

## 9. Respuesta real de Meta

No hay registro textual (no hay registros de las funciones accesibles y no se persiste el cuerpo). La rama de código alcanzada determina la respuesta con certeza:
- HTTP: **2xx** (si no, `res.ok` falso → `PAGE_DISCOVERY_FAILED` o un código clasificado)
- Cuerpo: **sin campo `error`** (ídem)
- `data`: **array** (si no, `PAGE_DISCOVERY_FAILED`, línea 169)
- Elementos válidos: **0** (línea 173). La única forma de que haya elementos y se filtren es que `id` no sea una cadena numérica, algo que no ocurre con IDs de página.
- paging: irrelevante, porque la primera página ya está vacía
- error code / subcode / user_title / user_msg / fbtrace_id: **no existen**, porque Meta no devolvió error

Conclusión: **Meta devolvió `{"data": []}`**.

## 10. Condición exacta del error visible

- Servidor: `supabase/functions/meta-oauth-callback/handler.ts`, `createHandler` → manejador, **línea 173**: `if (pages.length === 0) throw new MetaError("NO_AUTHORIZED_PAGES");` → `terminate("error", …)` → `meta_fail_connection`.
- Texto: `src/features/meta-connection/metaStatus.ts:155` (ES) / `:172` (EN).
- También se usa en `metaStatus.ts:65` para `page_selection_required` sin páginas (no aplica aquí).
- Significado: **son literalmente 0 páginas**. No está ocultando un error de Graph, porque todos los errores de Graph terminan en `PAGE_DISCOVERY_FAILED`, `META_PERMISSION_UNAVAILABLE`, `REAUTH_REQUIRED` o `META_API_RATE_LIMIT` (`classifyGraphError`, líneas 65–71). El texto es engañoso en este caso concreto: el usuario sí gestiona páginas y sí las seleccionó.

## 11. Estado de descubrimiento de Instagram

No se llegó a ejecutar. Tras elegir una página, `meta-connection/handler.ts:109` llama a `/{pageId}?fields=instagram_business_account` con el token de usuario y después a `/{igId}?fields=id,username` (línea 121).
Con la configuración actual hay un riesgo alto de que también falle o venga vacío: leer `instagram_business_account` de una página de empresa suele requerir `pages_read_engagement` y/o `business_management` además de `instagram_basic`. Recomiendo validarlo en el mismo E2E del arreglo.

## 12. Causa raíz

**El scope de OAuth no incluye `business_management`, así que Graph v25 `/me/accounts` devuelve `data: []` para páginas gestionadas a través de un portfolio empresarial, aunque `pages_show_list` esté concedido y el usuario haya seleccionado "todas las páginas" en el diálogo.**

| Escenario | Veredicto |
|---|---|
| A. Meta devuelve 0 páginas | **Sí** (síntoma) |
| B. Falta pages_show_list | No (concedido) |
| C. Falta pages_read_engagement | No es la causa de la lista vacía, pero hará falta para Instagram |
| D. Configurados pero no concedidos | En parte: los permisos del caso de uso no se solicitan y por eso no se conceden |
| E. Endpoint incompatible | No: el endpoint es correcto, falta el permiso que Meta exige para activos de empresa |
| F. Token incorrecto | No |
| G. Error convertido en "no hay páginas" | No |
| H. Selección de activos no recuperada | Consecuencia de la causa raíz: se recupera solo con `business_management` |
| **I. Otro** | **Sí: falta `business_management` en `META_SCOPES`** |

Grado de confianza: alto para "0 páginas sin error" (lo demuestra el código). Alto para la causa, por la documentación de Meta (`/user/accounts`: *"for a user who owns any business Pages, the app must be approved for the business_management permission"*) y por casos idénticos documentados con v17 o superior. Queda por confirmar en el E2E del arreglo si la página es de empresa, ya que no hay acceso al token ni al Business Manager.

## 13. Hotfix mínimo propuesto (NO IMPLEMENTADO)

1. `meta-oauth-start/handler.ts`: `META_SCOPES = ["pages_show_list", "business_management", "pages_read_engagement", "instagram_basic"]`.
2. Meta Developers: confirmar que esos cuatro permisos están añadidos a los casos de uso, con acceso estándar. Mientras la app esté en modo desarrollo, el usuario de prueba debe tener un rol en la app. Para usuarios reales hará falta revisión de la app (App Review) para `business_management` y `pages_read_engagement`.
3. `meta-oauth-callback/handler.ts`: guardar en el registro el número de páginas y los nombres de permiso concedidos o rechazados, sin tokens. Con eso, un fallo futuro se puede diagnosticar sin suposiciones.
4. Texto de `NO_AUTHORIZED_PAGES`: añadir "Si tu página pertenece a un portfolio empresarial, vuelve a conectar y concede acceso a la empresa".
5. Opcional, más adelante: Facebook Login for Business con `config_id`, si se quiere alinear con el caso de uso. No es necesario para este arreglo.

No requiere cambios en la base de datos.

## 14. Riesgos y regresiones

- Un permiso más sensible (`business_management`) amplía el alcance que el usuario ve en el diálogo y exige App Review para producción pública.
- Si el usuario ya concedió permisos antes, Meta puede no volver a pedir los nuevos: se reciben como *declined* o no se piden. Puede hacer falta `auth_type=rerequest` en el diálogo.
- El aviso de privacidad y el borrado de datos (A3.5.1A) deben mencionar el acceso a activos empresariales.
- Los tests de A3.5.1 que fijan `META_SCOPES` tendrán que actualizarse.
- Sin cambios en tokens, estados ni la lógica de recuperación de A3.5.1.2.

## 15. Pruebas para validar el arreglo

1. Test unitario: el diálogo incluye los cuatro permisos (y `auth_type=rerequest` si se adopta).
2. Test unitario: `/me/accounts` con `data: []` sigue dando `NO_AUTHORIZED_PAGES` y queda registrado (sin token).
3. Test unitario: un error de Graph en `/me/accounts` sigue sin convertirse en `NO_AUTHORIZED_PAGES`.
4. Test unitario: si se rechaza `business_management`, el flujo no se rompe y el mensaje es claro.
5. E2E real: desconectar, volver a conectar y conceder los cuatro permisos → `/me/accounts` devuelve 1 página o más → `page_selection_required` o selección automática.
6. E2E real: elegir la página → `instagram_business_account` resuelto → `instagram_status` correcto.
7. E2E real: usuario sin páginas → `NO_AUTHORIZED_PAGES` legítimo.
8. Regresión: cancelar, expirar y el bloqueo de inicio estando `connected` (A3.5.1.2) siguen funcionando.

## Seguridad del diagnóstico

Solo se ejecutaron consultas de lectura (SELECT) sobre esquemas, `meta_connections`, `meta_oauth_states` y `analytics_events`, más la lista de nombres de secretos (sin valores). **No** se modificaron filas, **no** se borraron tokens (no existía ninguno), **no** se crearon states, **no** se inició ningún OAuth, **no** se cambiaron secretos ni permisos y **no** se modificó código (el único archivo nuevo es este informe).
