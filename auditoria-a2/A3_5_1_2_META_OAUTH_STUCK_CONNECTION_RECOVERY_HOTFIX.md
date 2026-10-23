# A3.5.1.2 — META OAUTH STUCK CONNECTION RECOVERY HOTFIX

Estado: **GO** (condiciones al final). Deriva del diagnóstico aprobado A3.5.1.1.

## 1. Archivos modificados

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261022152358_a3512_meta_oauth_stuck_connection_recovery.sql` | **Nuevo.** Guard en `meta_begin_attempt`; nuevas `meta_cancel_attempt` y `meta_expire_stale_attempt`. Aplicada en producción. |
| `supabase/functions/meta-connection/handler.ts` | Nueva acción `cancel`; `recover` delega la expiración al servidor; `STALE_ATTEMPT_MS` = 11 min. |
| `supabase/functions/meta-connection/index.ts` | Deps `cancelAttempt` / `expireStaleAttempt` → RPC. |
| `supabase/functions/meta-oauth-start/handler.ts` | `ALREADY_CONNECTED` → HTTP 409, sin URL. |
| `supabase/functions/meta-oauth-start/index.ts` | Mapea la excepción SQL `META_ALREADY_CONNECTED`. |
| `src/features/meta-connection/metaRepository.ts` | `cancelMetaConnection()` (borra también el binding de sesión). |
| `src/features/meta-connection/metaStatus.ts` | Umbral 11 min, `META_POLL_MS` = 30 s, textos ES/EN nuevos, mensajes `OAUTH_CANCELLED` y `ALREADY_CONNECTED`. |
| `src/features/meta-connection/MetaConnectionCard.tsx` | UI Conectando… + Cancelar conexión, Reintentar conexión, polling, `visibilitychange`/`pageshow`. |
| `src/features/meta-connection/__tests__/a3512MetaRecovery.test.ts` | **Nuevo.** Tests obligatorios. |
| `src/features/meta-connection/__tests__/a351MetaConnection.test.ts` | Helper con las nuevas deps; sección O adaptada a 11 min; texto «Conectando…». |
| `a281TrustCleanup`, `a33DiagnosticAction`, `f03Stage2b`, `a273Roadmap`, `a272TodayIntelligence` (tests) | Guardas de nº de migraciones 46 → 47, incluyendo la migración A3.5.1.2. |

Edge Functions desplegadas: `meta-connection`, `meta-oauth-start`. `meta-oauth-callback` **no** se modificó (su comportamiento ya era correcto; se cubre con tests).

No se tocó: GBP, Meta Pixel, consentimiento/cookies, Stripe, otras integraciones, permisos Meta (`pages_show_list`, `instagram_basic`), arquitectura A3.5.1.

## 2. Funciones creadas / modificadas

### SQL (SECURITY DEFINER, `search_path=''`, EXECUTE solo `service_role` — verificado en producción: anon=false, authenticated=false, service_role=true)

- **`meta_begin_attempt` (modificada)**: tras `SELECT … FOR UPDATE`, si `status = 'connected'` → `RAISE EXCEPTION 'META_ALREADY_CONNECTED'` **antes** de borrar estados o cambiar el estado. La transacción se revierte: ni token, ni página, ni Instagram se tocan. Resto de estados: igual que antes.
- **`meta_cancel_attempt(p_connection_id)` (nueva)**: bloquea la fila; solo si `connecting`/`authorized` → `meta_fail_connection(…, 'disconnected', 'OAUTH_CANCELLED')` (borra **todos** los `meta_oauth_states` de la conexión; el trigger limpia cualquier token de un intento no finalizado). Cualquier otro estado → `false`, sin cambios.
- **`meta_expire_stale_attempt(p_connection_id, p_stale_before)` (nueva)**: solo `connecting`/`authorized`. Expira (`error`, `OAUTH_STATE_EXPIRED`, estados borrados) si el intento empezó antes de `p_stale_before`, no tiene hora de inicio, o **no tiene estado vivo**.

### Edge Functions
- `meta-connection` → acción **`cancel`** (nueva) y **`recover`** (modificada).
- `meta-oauth-start` → respuesta **409 `ALREADY_CONNECTED`**.

## 3. Comportamiento antes / después

| Situación | Antes | Después |
|---|---|---|
| Usuario cierra/abandona Meta | «Conectando...» sin botones; recuperación solo al recargar y tras 15 min | «Conectando…» + **Cancelar conexión** + texto de ayuda; re-chequeo cada 30 s y al volver a la pestaña; expiración servidor a ≤ 11 min (o antes si el estado caducó) |
| Cancelar manualmente | Imposible | Servidor → `disconnected` + `OAUTH_CANCELLED`, estados invalidados; UI muestra **Reintentar conexión** |
| Volver con «Atrás» desde Meta | Botón quedaba bloqueado (busy) | `pageshow` restablece y re-chequea |
| Iniciar OAuth estando `connected` | Destruía token, página e Instagram (vía trigger) | 409, conexión intacta |
| Callback tras cancelar | — | Estado inexistente → `OAUTH_STATE_INVALID`, conexión no se toca, no se canjea el código |
| Expiración/fallo | Botón «Reintentar» | Botón **Reintentar conexión** |

## 4. Política exacta de expiración / stale

- TTL del `state` OAuth: **10 min** (`STATE_TTL_MS`, sin cambios).
- Umbral stale: **11 min = TTL + 60 s** (servidor `STALE_ATTEMPT_MS` y cliente `META_STALE_ATTEMPT_MS`, test de igualdad).
- Un intento `connecting` se considera **vivo** solo si existe un estado no consumido con `expires_at > now()`, o consumido hace < 2 min (canje de token en curso).
- Un intento `authorized` es vivo solo si existe un estado con `completion_expires_at > now()`.
- Se expira si: sin estado vivo **o** inicio > 11 min **o** sin hora de inicio. Al expirar se borran todos los estados.
- Disparadores: al montar /fuentes, cada **30 s** mientras hay intento en curso, en `visibilitychange` (visible) y `pageshow`.
- El cliente nunca pinta «Conectando…» pasado el umbral (muestra error + Reintentar) aunque el servidor no haya respondido.

## 5. Tests añadidos (`a3512MetaRecovery.test.ts`)

1. OAuth iniciado correctamente (URL Meta + binding).
2. Cancelación manual en `connecting` (y en `authorized`; idempotente sin conexión; SQL solo actúa en connecting/authorized).
3. OAuth abandonado (> 11 min; sin hora de inicio).
4. State expirado (estado muerto a 10,5 min ⇒ expira antes del umbral; SQL comprueba el estado vivo).
5. Recuperación automática (polling 30 s, `visibilitychange`, `pageshow`, reset de busy, UI nunca muestra stale como conectando, salida visible).
6. Reintento posterior (start aceptado tras cancelar; textos «Reintentar conexión»).
7. Callback después de cancelar (`unknown`/`stale` → INVALID, sin fetch, sin escritura).
8. Callback con state expirado (→ `OAUTH_STATE_EXPIRED`, sin canje). `access_denied` sigue → `disconnected`.
9. Cancelar conexión de otro usuario (id del cliente ignorado; solo la fila propia; 401 sin sesión; grants solo `service_role`).
10. OAuth sobre conexión válida → 409 sin URL; guard SQL bajo bloqueo y antes de cualquier borrado.
11. Protección de tokens (cancel sobre `connected` no revoca, no lee token, no borra; recover sano no expira).
12. Dos pestañas / inicios concurrentes (states distintos; callback del primero rechazado sin tocar el intento vivo; cancel tardío no desconecta).
13. No borrado accidental (cancel nunca actúa sobre page_selection_required / reauth_required / error / disconnected).

## 6. Resultados

- Suite completa vitest: **56 archivos, 1983 tests — todos pasan.**
- `npm run build`: **OK.**
- Producción: migración aplicada; grants verificados; `meta-connection` y `meta-oauth-start` desplegadas.
- La fila real que quedó en `connecting` (prueba de A3.5.1.1) **no se editó manualmente**; se recuperará sola en cuanto el usuario abra /fuentes (su estado lleva caducado más de 11 min).

## 7. Limitaciones restantes

1. La reconexión explícita desde `connected` no existe: hay que **Desconectar** y volver a conectar (409 documentado con mensaje claro).
2. `page_selection_required` sí permite un nuevo inicio (el intento no está finalizado; evita un callejón sin salida con `NO_AUTHORIZED_PAGES`). Su salida sigue siendo elegir página, Desconectar o Reintentar.
3. La expiración es perezosa (al consultar), no un job programado: una fila puede quedar en `connecting` en BD mientras nadie abre /fuentes, pero la UI nunca la muestra como conectando tras 11 min y cualquier visita la corrige.
4. Inicios concurrentes: gana el último; la pestaña anterior recibe «solicitud no válida» y puede reintentar.
5. Verificación de UI realizada por lectura de código y tests; no hubo prueba en navegador real en este entorno.

## 8. Decisión

**GO.** No queda ninguna ruta conocida que deje al usuario permanentemente en `connecting` (Cancelar siempre visible + expiración servidor ≤ 11 min + vista cliente acotada), ni que destruya una conexión válida durante un OAuth fallido (guard atómico en `meta_begin_attempt`; cancel/expire limitados a connecting/authorized).
