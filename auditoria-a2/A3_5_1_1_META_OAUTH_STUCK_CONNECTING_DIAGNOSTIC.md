# A3.5.1.1 — Meta OAuth Stuck-Connecting Diagnostic

Fecha: 2026-10-22 · Modo: DIAGNÓSTICO (solo lectura) · Sin cambios en código, base de datos, secretos ni datos de producción.

---

## 1. Resumen ejecutivo

La primera prueba E2E real quedó en **Conectando...** porque:

1. `meta-oauth-start` funcionó: creó la conexión en estado `connecting` y un OAuth state válido.
2. Meta **nunca redirigió de vuelta** a `meta-oauth-callback` con ese state (el state sigue sin consumir y no hay error registrado). El usuario cerró/abandonó el diálogo, o Meta mostró una pantalla de error propia que no redirige.
3. El diseño A3.5.1 asume que siempre habrá un callback. Cuando no lo hay:
   - la tarjeta en estado `connecting` **no muestra ningún botón** (ni cancelar, ni reintentar, ni desconectar);
   - la recuperación automática solo actúa a los **15 minutos** y **solo al recargar la página** (no hay temporizador ni re-render);
   - entre el minuto 10 (expira el state) y el 15 el intento ya es irrecuperable pero sigue mostrándose como "Conectando...".

Causa raíz: **falta de una salida de usuario y de un temporizador en el estado `connecting`**, combinada con un umbral de obsolescencia (15 min) más largo que la vida del state (10 min). No es un fallo de seguridad ni de credenciales.

## 2. Estado real encontrado en producción

Consulta de solo lectura a las 15:01:55 UTC.

### meta_connections (1 fila)

| Campo | Valor |
|---|---|
| id | e85ae653-… |
| status | **connecting** |
| attempt_started_at / created_at / updated_at | 2026-10-22 14:55:20 UTC (sin cambios posteriores) |
| antigüedad del intento | 6 min 35 s |
| user_token_ref | NULL (no hay token) |
| page_id / instagram_status | NULL / NULL |
| available_pages | 0 |
| last_error / last_error_at | NULL / NULL |
| connected_at | NULL |

### meta_oauth_states (1 fila)

| Campo | Valor |
|---|---|
| connection_id | e85ae653-… (misma conexión) |
| created_at | 14:55:20 UTC |
| expires_at | 15:05:20 UTC (10 min) |
| consumed_at | **NULL** (no consumido) |
| completion_hash | ninguno |
| pending_pages / pending_meta_user_id | 0 / ninguno |
| expirado en el momento de la consulta | no (expira a las 15:05:20) |

Clasificación del state: **pendiente, no consumido, no huérfano** (está vinculado a la conexión). A partir de las 15:05:20 pasa a ser **expirado y no consumido**.

### Secretos

`META_APP_ID`, `META_APP_SECRET` y `META_REDIRECT_URI` **ya están configurados** (antes no existían). Por eso el inicio ya no devuelve `META_APP_NOT_CONFIGURED`.

## 3. ¿Llegó a ejecutarse meta-oauth-start?

**Sí, correctamente.** La fila de conexión y la del state se crearon en la misma transacción (`meta_begin_attempt`, mismo `now()` = 14:55:20.294773). Solo ocurre después de pasar la comprobación de secretos, la autenticación y la propiedad del negocio. Después, el navegador fue redirigido a `facebook.com/v25.0/dialog/oauth`.

## 4. ¿Recibió meta-oauth-callback alguna petición de Meta?

**No con este state.** La evidencia es concluyente:

- En el callback, `consumeState` (línea 109) se ejecuta **antes** de procesar `error=` (línea 122) y `code` (línea 126).
- Cualquier petición válida con este state, incluida una cancelación con `error=access_denied`, habría puesto `consumed_at` y cambiado la conexión a `disconnected` u `error`.
- `consumed_at` sigue en NULL, `last_error` en NULL y `updated_at` sin cambios desde el inicio.

Una petición con un state ausente, malformado o desconocido devuelve `OAUTH_STATE_INVALID` **sin tocar la conexión** (por diseño). No se puede descartar que hubiera alguna así, pero no afectaría a esta fila.

Logs: las herramientas de este entorno no dan acceso a los logs de invocación de Edge Functions. Para confirmarlo, revisa en el panel de Supabase, en Edge Functions → `meta-oauth-callback` → Logs/Invocations, si hubo llamadas desde las 14:55:20 UTC. El callback solo escribe códigos de error en el log, nunca tokens.

## 5. ¿Hay algún error registrado durante el callback?

No. `last_error` es NULL y no hay ningún state consumido ni completado.

## 6. Escenarios compatibles con la evidencia

| Escenario | ¿Redirige Meta al callback? | Compatible |
|---|---|---|
| Usuario cierra la pestaña o la ventana del diálogo | No | Sí |
| Usuario pulsa "Atrás" en el navegador desde Meta | No | Sí |
| Meta muestra error propio: URL de redirección no incluida en "Valid OAuth Redirect URIs" | No (Meta muestra "URL bloqueada") | Sí |
| App en modo Desarrollo y usuario sin rol en la app | No (Meta muestra "Función no disponible" / "App no activa") | Sí |
| Usuario pulsa "Cancelar" en el diálogo de Meta | Sí, con `error=access_denied` | **No** (habría consumido el state) |
| Autorización correcta | Sí, con `code` | **No** |

El usuario que hizo la prueba sabrá cuál vio. Si apareció una pantalla de error de Meta, hay que revisar la configuración en Meta Developers: la URI exacta del informe anterior y el rol del usuario de prueba.

## 7. ¿De dónde sale "Conectando..." en el frontend?

Del **estado del servidor**. La tarjeta lee `meta_connections.status` (columna permitida para el navegador por RLS) y `metaView()` lo traduce:

- `status = 'connecting'` y `attempt_started_at` hace ≤ 15 min → vista `connecting` → "Conectando..." + spinner.
- Más de 15 min → vista `error` (`OAUTH_STATE_EXPIRED`) con botón "Reintentar".

Hay un estado local adicional, `busy`, que solo pone un spinner en el botón mientras se pide la URL de inicio. Al volver con "Atrás", si el navegador restaura la página desde caché, ese spinner puede reaparecer, pero lo que se ve en producción sale del servidor.

## 8. Mecanismo actual de recuperación de intentos obsoletos

| Capa | Regla | Cuándo se ejecuta |
|---|---|---|
| Servidor (`meta-connection` action `recover`) | `connecting`/`authorized` con más de 15 min (`STALE_ATTEMPT_MS`) → `meta_fail_connection(error, OAUTH_STATE_EXPIRED)`; borra los states | **Una vez**, al montar la tarjeta (al entrar o recargar `/fuentes`) |
| Cliente (`metaView`) | Mismo umbral de 15 min (`META_STALE_ATTEMPT_MS`) → vista de error | Solo cuando la tarjeta se vuelve a pintar; **no hay temporizador** |
| Base de datos | Ninguna tarea programada | — |

Consecuencias:

- Si el usuario **se queda en la página**, ve "Conectando..." **indefinidamente**: nada vuelve a evaluar la regla de los 15 minutos.
- Si **recarga** antes del minuto 15, sigue viendo "Conectando...", porque `recover` todavía no lo considera obsoleto.
- Del minuto 10 al 15 el state ya ha expirado y el intento no puede completarse, pero sigue mostrándose como en curso.
- Al recargar pasados 15 min, el servidor lo pasa a `error` y aparece "Reintentar". En esta prueba eso habría ocurrido a partir de las **15:10:20 UTC** con una recarga.

## 9. ¿Cerrar o cancelar el OAuth deja hoy la conexión en `connecting`?

- **Cerrar, abandonar o pulsar "Atrás"**: **sí**, se queda en `connecting` hasta que se recupera al recargar pasados 15 min.
- **"Cancelar" dentro de Meta**: no, porque Meta redirige con `access_denied` y la conexión pasa a `disconnected` con el mensaje de cancelación.
- **Error propio de Meta sin redirección**: **sí**, igual que si se cierra.

## 10. ¿Hay una ruta segura en el servidor para cancelar o reiniciar?

- **Reiniciar**: `meta_begin_attempt` (llamada por `meta-oauth-start`) ya borra todos los states anteriores de la conexión e inicia uno nuevo. Es seguro, pero **la interfaz no ofrece el botón** en estado `connecting`.
- **Cancelar**: hoy no existe una acción `cancel`. `disconnect` funcionaría en el servidor, pero la tarjeta oculta el botón de desconectar en `connecting` (`canDisconnect` lo excluye).
- **Recuperar**: `recover` existe, pero solo actúa pasados 15 min.

## 11. No editar las tablas a mano

**Confirmado: NO se debe editar manualmente `meta_connections` ni `meta_oauth_states`.**

- Las transiciones son propiedad del servidor y pasan por funciones con disparadores que gestionan Vault.
- Un UPDATE manual podría dejar estados inconsistentes o saltarse la limpieza de credenciales.
- No hace falta: esta fila no tiene token ni datos sensibles. Basta con **recargar `/fuentes` a partir de las 15:10:20 UTC** y la recuperación existente la pasará a `error` con el botón "Reintentar".

## 12. Riesgo latente adicional (relevante para el hotfix)

`meta_begin_attempt` pone `status = 'connecting'` sin comprobar el estado previo. Como `connecting` no es un estado activo, el disparador `meta_connections_wipe_inactive` **borra en el acto el token de Vault, la página y la cuenta de Instagram**.

Si en el futuro se llamara a start sobre una conexión **`connected` válida** (otra pestaña, o un botón "reconectar" mal ubicado), se perdería la conexión buena aunque el nuevo OAuth se abandonara. Hoy no ocurre desde la interfaz, porque la vista `connected` no ofrece botón de conectar, pero la API lo permite. Debe corregirse en el mismo hotfix.

## 13. Causa raíz exacta

1. Meta no redirigió de vuelta (abandono o error propio de Meta): evento externo y esperable.
2. El estado `connecting` **no tiene salida en la interfaz**: sin cancelar, sin reintentar y sin desconectar.
3. La recuperación depende de **recargar la página** y de un umbral de **15 min**, más largo que la vida del state (10 min). No hay temporizador en el cliente ni limpieza en el servidor.

Resultado: el usuario queda atrapado desde el punto de vista práctico, aunque técnicamente la recuperación se produciría al recargar pasados 15 minutos.

## 14. Propuesta exacta de hotfix (A3.5.1.2, NO implementado)

### 14.1 Servidor — `meta-connection`

1. **Nueva acción `cancel`**:
   - Usuario obtenido del JWT; conexión propia (`getOwnConnection`).
   - Solo si `status IN ('connecting','authorized')`: `meta_fail_connection(id, 'disconnected', NULL)`, que borra todos sus states.
   - En `page_selection_required` / `connected` / `reauth_required` / `error`: no hace nada y devuelve el estado actual. **Nunca toca credenciales válidas.**
   - Idempotente si no hay fila.
2. **Alinear la obsolescencia con la vida del state**:
   - `STALE_ATTEMPT_MS = STATE_TTL_MS + 60 s` (11 min).
   - En `recover`, marcar también como obsoleto un intento `connecting` cuyo state más reciente ya expiró sin consumirse.

### 14.2 Base de datos — nueva migración

1. **Proteger conexiones válidas en `meta_begin_attempt`**:
   - Si `status = 'connected'` o `'page_selection_required'`, devolver un resultado `already_connected` sin modificar nada. El usuario debe desconectar antes, lo que revoca y limpia de forma explícita.
   - Desde `reauth_required`, `error`, `disconnected` y `connecting` se permite el reinicio, que ya invalida los states anteriores.
   - `meta-oauth-start` traduce `already_connected` a 409.
2. **Función `meta_expire_stale_attempts()`** (service_role):
   - Pasa a `error` / `OAUTH_STATE_EXPIRED` los `connecting`/`authorized` con más de 11 min y borra los states expirados.
   - La llama `recover`.
   - Opcional: programarla con `pg_cron` cada 5 min si la extensión está disponible.
3. Sin cambios en tablas, columnas, RLS ni permisos del navegador. EXECUTE solo para service_role.

### 14.3 Frontend — `MetaConnectionCard` / `metaStatus` / `metaRepository`

1. **Vista `connecting`**:
   - Mostrar "Conectando..." más dos botones: **"Cancelar"** (llama a `cancel` y refresca) y **"Reintentar"** (llama a `start`, que invalida el state anterior).
   - Mostrar "Reintentar" tras unos 20 s, o al volver a la pestaña, para no estorbar la redirección normal.
2. **Temporizador y eventos de retorno**:
   - Mientras la vista sea `connecting`, re-evaluar cada 30 s y al recibir `visibilitychange` (pestaña visible) o `pageshow` (página restaurada desde caché).
   - Al hacerlo, llamar a `recover` y refrescar.
   - Poner `busy = false` en `pageshow` para que no quede el spinner al volver con "Atrás".
3. `META_STALE_ATTEMPT_MS` alineado a 11 min.
4. Nuevos textos (ES/EN): "Cancelar"; "¿La ventana de Meta se cerró? Puedes cancelar o volver a intentarlo."

### 14.4 Garantías que se mantienen

- Toda transición sigue en el servidor. El navegador solo invoca acciones, no escribe tablas.
- Aislamiento por usuario (JWT + `getOwnConnection`), Vault, states hasheados y de un solo uso, vínculo con la sesión del navegador: sin cambios.
- `cancel` y el reinicio nunca afectan a una conexión `connected` válida (punto 14.2.1).
- No se modifica GBP, Meta Pixel, consentimiento, páginas legales, Stripe ni otras integraciones.

### 14.5 Tests a añadir

- `cancel` en `connecting`/`authorized` → `disconnected` y states borrados.
- `cancel` en `connected` → sin cambios y token intacto.
- `cancel` sobre la conexión de otro usuario → imposible (solo la propia).
- start sobre `connected` → 409 y token intacto.
- start sobre `connecting` → state anterior invalidado (el callback con el state viejo da `OAUTH_STATE_INVALID`).
- `recover` con state expirado (más de 10 min) → `error`.
- La vista `connecting` muestra "Cancelar"; el temporizador lleva a la vista de error sin recargar.
- Regresiones de GBP, Pixel y consentimiento por hash.

## 15. Acción inmediata recomendada (sin código)

1. No editar tablas.
2. Recargar `/fuentes` **a partir de las 15:10:20 UTC** del 2026-10-22: la tarjeta pasará a "No se pudo completar la conexión" con "Reintentar".
3. Antes de reintentar, confirmar en Meta Developers que:
   - la URI exacta `https://kdnrnibiwgijrejkizrk.supabase.co/functions/v1/meta-oauth-callback` está en "Valid OAuth Redirect URIs";
   - la cuenta de Facebook usada tiene rol (Administrador, Desarrollador o Tester) en la app, mientras esté en modo Desarrollo.
4. Revisar en Supabase los logs de `meta-oauth-callback` para confirmar que no hubo ninguna invocación.

## 16. Veredicto

Diagnóstico completo. Causa raíz: estado `connecting` sin salida para el usuario y con una recuperación solo al recargar y demasiado lenta. No hay fuga de credenciales ni problema de aislamiento. Hotfix A3.5.1.2 propuesto, **pendiente de aprobación**.
