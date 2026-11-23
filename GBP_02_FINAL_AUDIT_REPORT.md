# LocalSEOHub.io — GBP-02 — Auditoría final de Google Business Profile

Fecha de ejecución: 23/11/2026. Modo: solo lectura de aplicación y producción; creación únicamente de entregables y una sonda local temporal, eliminada tras ejecutarla.

## 1. Veredicto ejecutivo: NO-GO

**NO-GO para declarar la integración terminada y desplegar un piloto de 20 empresas sin corregir la verificación de datos.** El camino feliz está implementado y el usuario confirma una conexión real de Gopik Digital. No se ha encontrado una vía confirmada para leer credenciales GBP de otro usuario. Esto no equivale a certificar todos los escenarios multiempresa.

Dos simulaciones adicionales reproducen que se marca como verificado un perfil con JSON inválido y que reseñas no obtenidas se presentan como conectadas con cero reseñas. Además, varios adaptadores fallan si un usuario tiene más de un negocio, aunque la base admite hasta cinco. Son defectos funcionales relevantes, no meros detalles cosméticos. No procede GO CONDICIONADO si ese término significa que solo quedan defectos menores.

No hay P0 confirmado. Hay tres P1 funcionales, cuatro P2 confirmados en código y candidatos pendientes de validación. Ninguna corrección se ha ejecutado.

## 2. Alcance, método y límites

Se revisaron OAuth, listado de ubicaciones, renovación, sincronización, desconexión, visualización de fuentes, adaptación de datos a recomendaciones y controles comerciales. Se consultó el catálogo actual de seguridad de Supabase (37 tablas, 2 vistas y 72 funciones), privilegios de columnas, triggers y definiciones de RPC GBP; son consultas de estructura, no lecturas de tokens ni de registros de empresas.

Se ejecutaron 97 archivos de pruebas existentes, dos sondas aisladas con respuestas de Google simuladas, lint, TypeScript y build. No se realizaron nuevas conexiones, lecturas autenticadas de Google, revocaciones reales, escrituras de base de datos, llamadas a IA, publicaciones ni despliegues. Tampoco se invocó `loadSources` contra producción: esta lectura de aplicación puede recuperar y persistir intentos caducados.

La evidencia real de producción es **la confirmación del usuario**, no una comprobación independiente de esta auditoría: proyecto `localseohub-500916` aprobado; API Business Information habilitada; Gopik Digital conectada y sincronizada; dos fuentes activas en `/fuentes`. Esa confirmación supera el antiguo bloqueo de configuración GBP-01. No se mantiene la hipótesis de cuota cero como bloqueo actual.

No existe aquí una comparación de versiones anteriores ni una correspondencia comprobada entre estos archivos y la versión desplegada. No se reutilizan afirmaciones históricas de hashes, despliegues o regresiones no verificadas de informes anteriores. No hubo navegador, prueba visual, carga de 20 cuentas, sesión adversarial real ni validación real de refresh/revoke.

## 3. Arquitectura y flujo real

- Cliente React/TypeScript: `src/features/reality-engine/engine.ts`, `GBPCallbackPage.tsx`, `SourceManager.tsx`, repositorios y tarjetas. La aplicación autentica al usuario con Supabase; no sustituye su autenticación por la de Google.
- Inicio: `gbp-oauth-start/handler.ts` autentica JWT, resuelve negocio propio, crea/upserta una fila `google_business` en estado `connecting` y genera `state` con 32 bytes criptográficos. Solicita `business.manage`, acceso offline y consentimiento.
- Callback: `gbp-oauth-callback/handler.ts` e `index.ts` buscan la fila que contiene el `state` y está `connecting`, comprueban que el negocio pertenece al usuario de la fila, intercambian código y guardan credenciales en Vault. Devuelven al cliente IDs y nombres de cuentas; nunca tokens. La cuenta administrativa `accounts/...` no se interpreta como una ficha.
- Selección: `gbp-list-locations` autentica al llamante y usa su fuente. Obtiene ubicaciones reales `locations/...`; una ubicación se selecciona automáticamente, varias se muestran para elegir. No hay ficha ficticia `locations/default`.
- Sincronización: `gbp-sync/handler.ts` valida IDs y negocio, establece `syncing`, lee el perfil real, intenta leer el número de reseñas y persiste `verified_profile`, `verified_at`, `last_sync_at`, IDs y estado. También upserta una fuente dependiente `reviews`.
- Credenciales: las copias de `gbpToken.ts` usan los RPC `gbp_read_credentials`/`gbp_store_credentials`. Renovación al faltar token válido o quedar menos de 60 segundos; conserva refresh token si Google no devuelve uno nuevo. No se ha comprobado en Google una renovación real.
- Desconexión: `gbp-disconnect` autentica, resuelve fuente propia, intenta revocar refresh token (o access token), limpia credenciales y elimina fuente y vínculo de reseñas. Fallar la revocación remota no impide intentar limpieza local.
- Reseñas detalladas/borradores: `gbp-reviews` es un flujo distinto del contador importado por `gbp-sync`; aplica autorización premium y reserva de uso para generación. No hay evidencia de que el sync inicial importe el texto completo de todas las reseñas.

## 4. Datos importados: evidencia exacta

Evidencia: `gbp-sync/handler.ts`, `toProfile`, lectura de Business Information y líneas 195–242.

| Dato | Fuente y destino | Uso comprobado |
|---|---|---|
| Nombre | `title` → `verified_profile.name` | Contexto disponible; no prueba de que todas las pantallas lo sustituyan por el nombre manual |
| Categoría | `categories.primaryCategory.displayName` → `category` | Contexto disponible; no importación de todas las categorías secundarias |
| Dirección | `storefrontAddress`: líneas, localidad, región y código postal | Dirección compuesta; no coordenadas ni área de servicio importadas |
| Teléfono | `phoneNumbers.primaryPhone` → `phone` | Regla de teléfono faltante verificado |
| Web | `websiteUri` → `website` | Regla de web faltante verificada |
| Horarios | `regularHours.periods` → `hours` | Regla de horarios faltantes verificados; no horarios especiales acreditados |
| Número de reseñas | Reviews v4, `totalReviewCount` → `totalReviews` y metadata del vínculo | Regla de primeras reseñas solo ante `totalReviews === 0`; contador en tarjeta |
| Nota media | `averageRating` → `averageRating` | Persistida si lectura de reseñas tiene éxito; no regla específica acreditada |

Campos ausentes se convierten en `null`. No se actualiza automáticamente el registro manual `businesses` con estos valores: se conserva evidencia externa separada. El `recordCount` cuenta valores truthy del perfil antes de incorporar reseñas; no debe interpretarse como número exacto de campos completos/importados en todos los casos.

## 5. Hallazgos confirmados

### GBP02-F01 — P1 — Reseñas no obtenidas figuran como verificadas y cero

**Evidencia:** `gbp-sync/handler.ts:198–237` inicializa `reviewCount = 0`, ignora errores de la petición opcional y siempre upserta `reviews` con `status: connected`, sin error y contador cero. `sourceStatus.ts:68–71` considera verificada la fuente dependiente si el padre está conectado/verificado y la fila de reseñas conectada. `SourceCard.tsx:142–143,218–221` muestra ese número.

**Reproducción ejecutada:** perfil HTTP 200 válido + reseñas HTTP 503 → respuesta `success:true`, `reviewsStatus:connected`, `reviewCount:0`. Es una falsa afirmación de datos comprobados. Importante matiz: si la petición de reseñas falla, el perfil NO recibe `totalReviews`; por tanto la regla `gbp_first_reviews` no se activa por este fallo concreto. Sí se falsea la tarjeta. Una respuesta de reseñas 200 sin contador también se convierte en cero y sí puede alimentar la regla.

**Corrección mínima propuesta, no aplicada:** distinguir contador desconocido de cero real; no marcar reseñas verificadas si no se obtuvo una respuesta válida; conservar/etiquetar correctamente datos previos y representar el fallo parcial sin negar el éxito del perfil.

### GBP02-F02 — P1 — Perfil inválido HTTP 200 se guarda como verificado

**Evidencia:** `gbp-sync/handler.ts:195,217–225`: parseo fallido → `null` → perfil de campos nulos → conectado y `verified_at`. No se valida que la respuesta sea un objeto de ficha coherente.

**Reproducción ejecutada:** cuerpo `not json` HTTP 200 y reseñas 503 → `success:true`, `profileName:null`, timestamp verificado. Esto puede sustituir evidencia previa y generar recomendaciones de campos faltantes pese a no haber importado un perfil válido.

**Corrección mínima propuesta:** validar respuesta externa antes de sustituir el perfil; guardar error recuperable y no afirmar verificación con JSON inválido. Campos opcionales vacíos en un perfil válido deben seguir permitidos.

### GBP02-F03 — P1 — Más de un negocio por usuario rompe operaciones GBP

**Evidencia:** `gbp-oauth-start/index.ts`, `gbp-sync/index.ts`, `gbp-disconnect/index.ts:17–23` y `gbp-reviews/index.ts:31–36` consultan `businesses` por `user_id` con `maybeSingle`, sin seleccionar el negocio solicitado. El trigger actual `businesses_max_per_user` permite cinco negocios por usuario. Una respuesta con varias filas no es un resultado único y produce error.

Afecta conexión, sincronización, desconexión y lectura premium de reseñas. No prueba una fuga entre usuarios: es un fallo de resolución/autorización para un modelo permitido. **20 usuarios distintos con un negocio cada uno no son equivalentes a un usuario con 20 negocios ni a un usuario con dos negocios.** Además, se mantiene una sola ficha GBP por negocio mediante identidad de fuente.

**Corrección mínima propuesta:** resolver por ID solicitado y propietario conjuntamente, sin seleccionar arbitrariamente el primer negocio. Hasta entonces no declarar soporte multinegocio por usuario.

### GBP02-F04 — P2 — Recomendaciones no refrescadas explícitamente al terminar OAuth

**Evidencia:** `GBPCallbackPage.tsx` sincroniza y navega a `/fuentes` sin `ensureFresh`/`refresh`; `SourceManager.tsx:35–60` carga fuentes al montar mediante `refresh`, no `refreshAll`. `ActionsProvider.tsx:113–122` depende del negocio y sus callbacks, no de un cambio de fuente en tiempo real. Su fingerprint sí reconoce timestamps nuevos cuando se invoca `run`.

Existe un camino de éxito que actualiza las tarjetas pero no solicita regenerar acciones en ese punto. Otros cambios de negocio, montaje del proveedor o consumidores que llaman `ensureFresh` pueden refrescar después; no se certifica contradicción permanente en todas las rutas. La desconexión sí llama `refreshAll`.

**Corrección mínima propuesta:** solicitar actualización de contexto tras sync desde el flujo GBP, sin rediseñar Hoy/Tu Semana. Comprobar luego el recorrido visual autorizado.

### GBP02-F05 — P2 — Diagnósticos de disponibilidad de Google demasiado amplios

**Evidencia:** `gbp-list-locations/logic.ts`, `mapGoogleError`: 403/404/501/503 se traducen a `GBP_API_UNAVAILABLE`, cuyo mensaje alude a aprobación/cuota; un 503 no prueba ese motivo. El cliente puede cancelar con `LOCATIONS_UNAVAILABLE` y perder el diagnóstico previo.

La causa real anterior fue API deshabilitada, ya resuelta por configuración externa. No se propone tocar configuración actual. **Corrección mínima:** mensajes y códigos que no atribuyan motivos no demostrados; conservar diagnóstico seguro del fallo original.

### GBP02-F06 — P2 — Limpieza de desconexión con éxito parcial no comunicado fielmente

**Evidencia:** `gbp-disconnect/index.ts:36–49` devuelve `!clearError || !deleteError`, y no comprueba error al borrar reseñas. Puede informar `removed:true` aunque falle borrar la fuente si limpiar credenciales tuvo éxito. El handler informa por separado `revoked`, pero no garantiza que `removed` signifique realmente fila eliminada. La limpieza de reseñas además filtra por usuario/tipo, no negocio: barrido excesivo si se habilita el modelo multinegocio.

**Corrección mínima:** verificar el resultado que representa cada flag y limitar limpieza de vínculos al negocio seleccionado; evitar afectar fuentes de otro negocio del mismo usuario.

### GBP02-F07 — P2 — Caducidad de state depende de recuperación, no del callback

**Evidencia:** callback guarda/transporta `startedAt` pero no compara edad antes de intercambiar código. Los plazos 15/30/5 minutos existen en `gbpStatus`/recuperación, no son comprobados aquí. Un intento viejo aún `connecting` sigue siendo elegible hasta que se recupere/cancele.

No se afirma bypass CSRF ni replay consumado: el state criptográfico, asociación de fila y el código de Google siguen siendo controles reales. Es un incumplimiento del ciclo de caducidad visible. **Corrección mínima:** aplicar edad máxima en servidor antes de procesar intento, coherente con el plazo existente.

## 6. Seguridad y aislamiento: controles comprobados y límites

- RLS habilitada en `businesses` y `connected_sources`; SELECT/INSERT/UPDATE/DELETE propias con `auth.uid() = user_id`. UPDATE conserva el mismo propietario en `WITH CHECK`. Las tablas no confían en `user_metadata` para este aislamiento.
- Privilegios reales SELECT de `connected_sources` para authenticated enumeran columnas de UI; **no incluyen access_token_encrypted ni refresh_token_encrypted**. Anon no aparece con permisos de columnas en la consulta pertinente. El repositorio selecciona explícitamente solo columnas no secretas.
- Privilegios de escritura visibles no son por sí solos un bypass: trigger actual `connected_sources_server_owned_gbp` impide INSERT/UPDATE del rol cliente para `google_business` y `reviews`, incluyendo cambiar desde un tipo GBP a otro. Campos verificados tampoco aparecen en UPDATE del cliente.
- Los RPC Vault son SECURITY DEFINER con search_path definido y sin EXECUTE para roles cliente en el catálogo. Son consumidos por adaptadores administrativos después de autorizar al usuario. No se invocaron con IDs ajenos.
- Edge usa `auth.getUser(jwt)`, no decodificación sin verificación. Sync y disconnect resuelven propietario; callback comprueba negocio/usuario de la fila del state. IDs de cuenta/ubicación tienen formato acotado; no permiten inyectar host/URL arbitrario. Google autoriza el recurso pedido con el token correspondiente.
- Un accountId permitido por formato no prueba pertenencia a la ubicación: el perfil se pide por locationId, independientemente del accountId; la petición de reseñas sí usa ambos. Un par incorrecto puede dejar perfil correcto y reseñas fallidas falsas (F01). No se demuestra lectura de una ubicación no autorizada por Google ni cruce de usuarios.
- Cliente renderiza etiquetas/nombres mediante React, no HTML crudo. Búsqueda en el área reality-engine sin coincidencias de `dangerouslySetInnerHTML`, `innerHTML`, `postMessage`, `eval` o `new Function`. No se encontró una cadena de inyección explotable en este alcance.
- No hay tokens en las respuestas/URL frontend del callback; sí viajan IDs/nombres de cuentas (información comercial) en query. El código de autorización llega al callback Google por URL, como parte del protocolo. El state se almacena temporalmente en metadata/sessionStorage; no es access token. No se revisaron logs reales del host ni cabeceras efectivas de producción.
- DELETE de fuente propia permanece permitido al cliente y dispara olvido de Vault; esto no equivale a revocar Google. La UI usa Edge para desconectar. No permite borrar la fila ajena con las políticas actuales.
- `source_sync_events` tiene RLS propia, pero usuario puede insertar/eliminar eventos propios: el historial no es un log de auditoría inmutable ni prueba independiente de que Google confirmó un sync.

**Pendientes, no vulnerabilidades confirmadas:** probar dos sesiones y manipulación de UUID con tokens reales; concurrencia de callback/reconexión/refresh/sync/desconexión. El callback no reclama state atómicamente antes de intercambio y sync no usa versión de intento en las actualizaciones; son candidatos de carrera que requieren reproducción controlada. Google consume códigos y las actualizaciones tienen controles parciales: no se declara un ataque demostrado ni se asigna severidad ficticia.

## 7. Cuotas, paginación, duplicados y datos parciales

El listado implementa límites locales de paginación: hasta diez páginas, veinte cuentas cuando las enumera el listado y cien ubicaciones por página. Puede devolver `partial` junto a ubicaciones si parte de las cuentas falla. El callback hace descubrimiento inicial de cuentas; no se acredita recorrido exhaustivo de todas las páginas en ese paso. La UI selecciona una cuenta antes de listar: múltiples ubicaciones se soportan en selección, no sincronización simultánea de todas.

No se ha demostrado que el indicador parcial siempre sea advertido visualmente. No se certifica cobertura de cuentas con más páginas ni Google Account Groups complejos en producción. El endpoint de listado es el documentado para cuenta específica; no se propone sustituirlo por `accounts/-` sin necesidad comprobada.

Se distinguen 401, permisos, not-found y 429 en sync; existen flags retryable en lógica de errores. **Eso no implementa por sí mismo backoff, retry automático, cola o presupuesto global.** No se encontró reserva por usuario/negocio para `gbp-sync` ni coordinación frente a clics simultáneos. No se presume que 20 pilotos agotarán la cuota, ni que una cuota nominal garantice preparación: falta medición de llamadas y pruebas de ráfaga autorizadas.

Índice actual único `connected_sources_user_id_business_id_source_type_key` y upsert sobre la misma identidad previenen duplicados de filas de fuente/reseñas. No impiden peticiones duplicadas ni carreras que mezclen los IDs de una operación con el perfil de otra. Eventos se insertan por intento, no son idempotentes por operación. Persistir perfil y vínculo de reseñas no es una transacción conjunta; un fallo de upsert de reseñas solo se registra en consola y sync continúa exitoso.

## 8. Hoy y Tu Semana: consumo real

`ActionsProvider.tsx:26–31` adapta GBP desde **verified_profile** y usa **verified_at** como `lastSyncAt`; otras fuentes utilizan metadata y `last_sync_at`. `rules.ts` exige GBP conectado con fecha para reglas verificadas. Se comprueba web, teléfono y horarios ausentes frente al registro manual no vacío, y `totalReviews === 0` para primeras reseñas. No hay evidencia de que nombre, dirección, categoría y nota media activen por sí solos reglas específicas en ese bloque.

El registro manual y la evidencia GBP se mantienen diferenciados. Los hallazgos verificados se resuelven con datos, no con botón manual. El motor `planSync` cierra disparadores ausentes y evita duplicados por regla; Hoy selecciona hasta tres acciones y Tu Semana usa ese mismo conjunto/ranking con foco limitado a cinco. No son dos importadores GBP distintos.

Al desconectar, las reglas verified dejan de usar GBP conectado; las acciones generales y del perfil manual siguen disponibles. Hay una ruta de refresco tras desconexión. Esto no garantiza que una cuenta sin premium persista cierres: `ActionsProvider` solo escribe con `hasPremium === true`. Su modo lectura oculta huecos resueltos de BUSINESS_PROFILE, no todos los VERIFIED_FINDING; pueden quedar recomendaciones guardadas desactualizadas en cuentas sin acceso. Es una limitación comercial/funcional existente que requiere recorrido manual, no un motivo para modificar los módulos congelados sin aprobación.

No se ejecutó un sync real seguido de visita a Hoy/Tu Semana. F04 identifica la falta de actualización explícita al concluir OAuth; no se da por superada esa prueba visual.

## 9. Suscripciones

Conectar, seleccionar y sincronizar GBP autentican usuario/propiedad, **no exigen premium** en los handlers ni en el botón revisado. Por tanto no se encontró bloqueo accidental del sync por ensayo caducado. Esto describe el comportamiento existente, no certifica que conectar deba ser gratis según una política comercial externa no aportada.

`gbp-reviews/entitlement.ts` usa `authorize_premium_request`, con límite de 30 solicitudes/hora y denegaciones 401/403/429/503; listado premium y borradores son distintos del contador automático del sync. La regeneración/edición de acciones y Tu Semana conservan sus restricciones existentes. La suite completa incluye pruebas de billing/acceso; no se consultó ni alteró una suscripción real o Stripe.

## 10. Calidad y evidencia de pruebas

Detalle en `GBP_02_TEST_REPORT.md`.

- Suite existente: **97 archivos, 3.247 tests aprobados, 0 fallidos**.
- Sondas nuevas: **2 ejecutadas con assertions**, ambas reproducen los defectos esperados. Que sus assertions pasen no significa que la funcionalidad auditada sea correcta.
- TypeScript: **falla con 20 diagnósticos**, 19 de símbolos no usados y uno de `.at` en prueba GBP por lib objetivo. Ya estaban en archivos antes de escribir entregables; no hay baseline anterior que permita fechar su introducción.
- Lint: **falla con 48 errores y 10 avisos**; incluye `any` en `gbp-sync/handler.ts:83` y problemas en otras áreas. No se ejecutó autofix.
- Build: **aprobado**, 12,52 s de build. No sustituye a TypeScript ni lint verdes.

## 11. Preparación para 20 pilotos y mínimos imprescindibles

| Escenario | Estado |
|---|---|
| Un negocio y una ficha por usuario, camino feliz | Implementado, tests y confirmación real de un usuario |
| 20 usuarios independientes, uno por negocio | Arquitectura de ownership compatible; escala y recorridos reales no validados |
| Dos o más negocios del mismo usuario | Bloqueado por F03 |
| Cuenta Google con varias fichas | Selector existente; una ficha conectada por negocio; validación real pendiente |
| Reseñas con fallo/cuota/permisos | No listo: F01 falsea verificación |
| Perfil externo inválido | No listo: F02 falsea verificación |
| Hoy/Tu Semana inmediatamente tras sync | Actualización explícita ausente; prueba visual pendiente |
| Revoke/refresh/carreras en producción | No certificados |

**Propuesta exclusivamente, pendiente de autorización:** corregir F01 y F02 antes de cualquier declaración de integración final; resolver F03 si el piloto incluye usuarios con varios negocios (o limitar expresamente el piloto a un negocio por usuario); asegurar refresco de recomendaciones desde GBP (F04) y resultados fieles de desconexión (F06). Ajustar caducidad de intento y diagnóstico sin atribuir errores inventados (F07/F05). Añadir pruebas permanentes para estos casos solo tras aprobación.

Después: validación manual autorizada con dos usuarios, dos negocios de un usuario, varias ubicaciones, revocación/renovación y errores parciales, y medición controlada de llamadas. No es necesario reconfigurar Google ahora por el antiguo bloqueo ni modificar Facebook, Instagram, Stripe, autenticación o motores congelados para ejecutar esta propuesta mínima.

## 12. Entregables y protección

Se generan este informe, `GBP_02_TEST_REPORT.md` y `deliverables/localseohub-gbp02-final-audit.zip`, con manifiesto de contenido/exclusiones y comprobación de integridad. Es un paquete completo del árbol de proyecto distribuible, no una copia de producción ni de dependencias instaladas: excluye secretos, variables locales, caches, compilados, históricos ZIP y materiales detectados con credenciales. Los ZIP históricos no se anidan para evitar arrastrar secretos desconocidos. No se modifican archivos de aplicación, migraciones, configuración ni módulos congelados. El manifiesto y las comprobaciones del ZIP concretan cualquier omisión adicional.

**Detenerse aquí. No se autoriza ninguna corrección, operación externa ni despliegue.**
