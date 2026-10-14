# LOCALSEOHUB 2.0 — AUDIT PRE-LAUNCH-001

Fase exclusivamente de auditoría. No se ha modificado código, base de datos ni configuración. Los únicos artefactos añadidos son este informe y un ZIP del proyecto para revisión externa.

Convenciones de evidencia:
- **[CÓDIGO]**: verificado leyendo el código fuente del repositorio.
- **[BD-VIVA]**: verificado con consultas de solo lectura contra la base de datos Supabase del proyecto (catálogo, políticas, grants, datos agregados).
- **[EJECUTADO]**: comando ejecutado en este entorno con resultado registrado.
- **[NO VERIFICABLE]**: requiere acceso a paneles externos (Stripe, Google Cloud, Supabase Auth, hosting) o pruebas E2E reales con navegador, correo o tarjeta. No se declara validado.

Ningún secreto se reproduce en este documento; sólo se citan nombres de variables.

---

## A. Resumen ejecutivo

LocalSEOHub 2.0 tiene una base técnica sólida en los puntos más sensibles del negocio:
- RLS activo en las 27 tablas.
- Control premium aplicado en servidor: políticas RESTRICTIVE en base de datos y `requirePremium` en las funciones de IA.
- Webhook de Stripe con verificación de firma, idempotencia y relectura del estado real en Stripe.
- Checkout que valida precio, moneda, intervalo y modo live/test.
- Límites de consumo de IA por usuario: 40 por función y 80 combinados al mes, y 30 por hora.
- 614 tests unitarios en verde y un build de producción correcto.

Sin embargo, se han identificado **1 hallazgo P0** y **11 hallazgos P1** que impiden el lanzamiento a clientes reales en la UE en su estado actual:

1. **P0 (legal/RGPD-LSSI):** el píxel de Meta y Microsoft Clarity se cargan y disparan antes de cualquier consentimiento. No existe banner de cookies. La política de privacidad afirma expresamente que no se usan cookies de seguimiento ni publicidad de terceros, lo cual es falso. Además, no identifica al responsable del tratamiento ni a los encargados (OpenAI, Google, Meta, Microsoft).
2. **P1 (abuso comercial):** el alta instantánea confirma el email automáticamente y no tiene captcha. Eso anula la exigencia de email verificado para activar la prueba gratuita y permite crear pruebas ilimitadas con emails falsos, cada una con consumo de IA de pago.
3. **P1 (seguridad):** el flujo OAuth de Google Business Profile no vincula el parámetro `state` al navegador ni le pone caducidad. Esto permite un ataque de vinculación de cuenta (login CSRF).
4. **P1 (comercial):** hay 6 eventos de Stripe del 10/10/2026 ignorados permanentemente porque su cliente no existe en Supabase. Forman un ciclo de vida completo: checkout, alta, pago, fallo de pago y baja. Hay que investigarlos y no existe reintento ni alerta.
5. **P1 (funcional/UX):** la campana de notificaciones es decorativa, con un punto rojo permanente. El resumen del dashboard muestra siempre vacíos la valoración, las reseñas y las fotos. La pantalla de error de arranque no permite cerrar sesión y muestra trazas técnicas en producción. 9 de los 10 usuarios existentes nunca han iniciado prueba.

**Dictamen: NO APTO PARA LANZAMIENTO** (ver sección H). Una vez corregido el P0 y los P1 del bloque 1 del plan (sección G), el producto pasaría a **APTO CON RESERVAS** para un lanzamiento controlado.

---

## B. Arquitectura y componentes auditados

| Capa | Tecnología | Alcance auditado |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind, supabase-js 2.57.4 | Rutas (`src/App.tsx`), shell v2 (`src/app-v2/*`), landing, `LoginModal`, onboarding (`FirstValueFlow`), dashboard (`TodayPage`, `DashboardHeader`), facturación (`src/features/billing/*`), GBP (`src/features/reality-engine/*`), i18n (`src/lib/i18n.tsx`), `index.html`, `public/` |
| Auth | Supabase Auth (email/contraseña) + función `signup-instant` | Alta, login, recuperación de contraseña (AUTH-RESET-001), sesión, `onAuthStateChange`, `returnTo` |
| Base de datos | Postgres Supabase, 27 tablas, 2 vistas | RLS, políticas, grants anon/authenticated, funciones SECURITY DEFINER, advisors de seguridad, datos agregados (sin PII en el informe) |
| Funciones de servidor | 27 Edge Functions desplegadas (todas ACTIVE) | `stripe-billing`, `stripe-webhook`, `signup-instant`, `business-improvement`, `weekly-content`, `analyze-website`, `gbp-oauth-start`, `gbp-oauth-callback`, `gbp-sync`, `gbp-list-locations`, `admin-stats` y los stubs retirados |
| Pagos | Stripe Checkout + Billing Portal + webhooks | Checkout, validación de precio, reutilización de cliente, cancelación/reanudación, portal, webhook, sincronización |
| Prueba gratuita y planes | `user_trials` + `billing_state_for()` | Estados, `start_trial`, `has_premium`, gating en BD y en funciones |
| IA | Proveedor externo vía secretos `LocalSEO_AI` / `LocalSEO_KEY` | Reservas `reserve_*` / `settle_ai_usage`, límites mensuales y por hora |
| Terceros en cliente | Meta Pixel, Microsoft Clarity | Carga en `index.html` y consentimiento |

---

## C. Matriz de funcionalidades

Estados: **Operativa** = implementación real y coherente en código, con evidencia de funcionamiento cuando existe en BD. **Parcial** = funciona con carencias. **No operativa** = simulada, vacía o sin acción. **No verificable** = el código parece correcto pero requiere prueba E2E o panel externo.

| Funcionalidad | Estado | Evidencia / comentario |
|---|---|---|
| Registro (alta instantánea) | Operativa con reservas | `signup-instant` crea usuario confirmado; sin captcha ni enlace a términos (P1-02, P1-09) |
| Login email/contraseña | Operativa | `LoginModal.tsx`; errores no traducidos en algunos casos (P2) |
| Recuperación de contraseña | No verificable | Código de AUTH-RESET-001 completo; faltan la URL de redirección `/reset-password` en Supabase y la prueba real con correo |
| Onboarding (`FirstValueFlow`) | Operativa (código) | Inicia la prueba al finalizar (`FirstValueFlow.tsx:111`); E2E no verificado |
| Inicio de prueba gratuita | Operativa (código) / no probada en producción | `start_trial()` correcto; **0 filas en `user_trials`** [BD-VIVA]: ningún usuario real ha pasado por este flujo |
| Caducidad de la prueba | Operativa (código) | `billing_state_for` calcula TRIAL_EXPIRED por fecha; sin datos reales |
| Checkout Stripe | No verificable en producción | Código sólido (`stripe-billing/index.ts`, `logic.ts:119-144`); falta pago real en modo live |
| Confirmación por webhook | Operativa | 5 eventos procesados el 08/10 con cliente mapeado [BD-VIVA]; 6 ignorados el 10/10 (P1-04) |
| Cancelación / reanudación | Operativa (código) | `cancel_at_period_end`; no probado E2E |
| Portal de cliente / método de pago | Operativa (código) | Sesión de portal creada en servidor; no probado E2E |
| Bloqueo sin suscripción | Operativa | Políticas RESTRICTIVE `current_user_has_premium()` en INSERT/UPDATE de `business_actions`, `prepared_replies` y `prepared_reply_details`; `requirePremium` en las funciones de IA [BD-VIVA][CÓDIGO] |
| Plan de mejora (IA) | Operativa | `business-improvement` con premium, reserva y límites |
| Contenido semanal (IA) | Operativa | `weekly-content` con premium, reserva y límites |
| Análisis de web | Operativa | `analyze-website` con premium y protección SSRF (`safeHttp`/`urlSafety`) |
| Respuestas preparadas | Operativa (código) | Gating por RLS; UI no recorrida E2E |
| Conexión Google Business Profile | Parcial | Funciona (1 conexión real) pero con vulnerabilidad CSRF (P1-03); verificación de la app en Google pendiente |
| Sincronización GBP | Parcial | Guarda metadatos, pero el dashboard no los muestra (P1-07) |
| Dashboard: saludo / identidad | Operativa | USER-NAME-001 aplicado |
| Dashboard: campana de notificaciones | **No operativa** | Sin acción y con punto rojo fijo (P1-06) |
| Dashboard: resumen (valoración, reseñas, fotos) | **No operativa** | Valores fijos a `null` (`TodayPage.tsx:206-208`) (P1-07) |
| Dashboard: insights / alertas | **No operativa** | Arrays vacíos fijos (`TodayPage.tsx:270,273`) (P2-08) |
| Modo demo de espacios de trabajo | Operativa (demo rotulada) | Datos rotulados como "ejemplo"/"inventadas" (`workspaces.tsx:107,214,264`) |
| Panel de administración | No operativa en UI | `legacy/AdminDashboard` sin ruta; la función `admin-stats` sigue desplegada (P1-05) |
| Landings temáticas (7) y `BetaLanding` | No operativas (código muerto) | No están enrutadas; contienen errores de TypeScript/ESLint |
| Internacionalización ES/EN | Parcial | Núcleo traducido; `LoginModal`, `AppShellV2`, `auth.tsx`, `App.tsx` y `engine.ts` con español fijo (P2-05) |
| SEO / metadatos sociales | Parcial | Imagen OG por defecto de terceros, descripción obsoleta, sin canonical (P1-10) |
| Textos legales | **No conformes** | Ver P0-01 |

---

## D. Hallazgos

### P0 — Bloqueante crítico

#### P0-01 · Seguimiento de terceros sin consentimiento y política de privacidad falsa
- **Evidencia [CÓDIGO]:**
  - `index.html:56-64`: Meta Pixel (`fbq('init')` + `fbq('track','PageView')`) se ejecuta al cargar la página. `index.html:87-90`: versión `noscript`.
  - `index.html:67-82`: Microsoft Clarity se carga incondicionalmente.
  - No existe banner, gestor de consentimiento ni condición previa (búsqueda sin resultados de `consent`/`cookie` en `src/`).
  - `src/components/LegalModals.tsx:51-52`: "No usamos cookies de seguimiento ni publicidad de terceros". Esto contradice lo anterior.
  - `LegalModals.tsx:37` describe datos de otra versión del producto ("productos, ciudades, resultados SEO"). No se identifican el responsable del tratamiento (razón social, NIF, contacto) ni los encargados y transferencias internacionales: OpenAI/proveedor IA, Google, Meta, Microsoft, Stripe, Supabase.
- **Impacto:** incumplimiento del art. 22.2 de la LSSI y de los arts. 6, 7 y 13 del RGPD desde la primera visita. La declaración falsa agrava la responsabilidad.
- **Riesgo:** sanción de la AEPD; reclamaciones de clientes; bloqueo de cuentas publicitarias.
- **Corrección:**
  - Cargar Pixel y Clarity sólo tras un consentimiento explícito y granular (banner con aceptar, rechazar y configurar, con el mismo peso visual).
  - Reescribir la política de privacidad y la de cookies con el responsable, las finalidades, las bases legales, los encargados, las transferencias y los plazos.
  - Validación legal externa.

### P1 — Debe corregirse antes del lanzamiento

#### P1-01 · Usuarios existentes sin prueba y flujo de prueba nunca ejercido en producción
- **Evidencia [BD-VIVA]:**
  - 10 usuarios: 1 con suscripción activa y 9 en `TRIAL_NOT_STARTED`. Uno de ellos completó el onboarding y otro tiene negocio sin onboarding.
  - `user_trials` tiene 0 filas.
- **Impacto:** los usuarios previos ven funciones bloqueadas sin haber recibido nunca su prueba. El flujo `start_trial` no se ha ejecutado nunca con un usuario real.
- **Corrección:**
  - Decidir la política para las cuentas existentes: conceder la prueba con un script controlado o mostrar un CTA claro.
  - Verificar que `BillingNotices.tsx:166` ("Empezar prueba") es visible en `TRIAL_NOT_STARTED` para usuarios ya onboardeados.
  - Hacer una prueba E2E real de alta → onboarding → prueba.

#### P1-02 · El alta instantánea anula la verificación de email exigida para la prueba
- **Evidencia [CÓDIGO]:**
  - `supabase/functions/signup-instant/index.ts:84-89` crea el usuario con `email_confirm: true`.
  - `start_trial()` exige `email_confirmed_at`, que queda satisfecho siempre.
  - No hay captcha.
  - Límites: 10/h por IP, 5/h por email y 50/h global (`:23-27`). La IP se toma de `x-forwarded-for`, que el cliente puede falsificar.
- **Impacto:** cualquiera puede generar cuentas con emails inventados y obtener pruebas de 7 días ilimitadas. Cada una permite hasta 80 llamadas de IA al mes, con coste real. El tope global de 50/h permite además bloquear los registros legítimos (denegación de servicio del alta).
- **Corrección:**
  - Opción 1: confirmar el email antes de `start_trial` (doble opt-in), manteniendo el acceso inmediato al onboarding.
  - Opción 2: añadir captcha (Turnstile/hCaptcha) validado en servidor y usar la IP real del proveedor en lugar de la cabecera.
  - Revisar el tope global.

#### P1-03 · OAuth de Google Business Profile vulnerable a vinculación de cuenta (CSRF)
- **Evidencia [CÓDIGO]:**
  - `gbp-oauth-callback/index.ts:68-74` resuelve el usuario sólo por `metadata->>oauth_state`.
  - `gbp-oauth-start/index.ts:140` devuelve el `state` al cliente.
  - No hay caducidad ni vinculación al navegador.
  - `src/features/reality-engine/engine.ts:133` guarda el `state` en sessionStorage "para validación CSRF", pero **ningún código lo compara**: sólo se borra (`:139-141`). Además, el callback de servidor guarda los tokens antes de volver al frontend.
- **Impacto:** un atacante inicia el OAuth en su cuenta, envía a la víctima la URL de consentimiento de Google y, si la víctima acepta, el perfil de empresa de la víctima queda vinculado a la cuenta del atacante, con lectura de sus datos y reseñas.
- **Corrección:**
  - Vincular el `state` a una cookie HttpOnly o firmar `state` con el `user_id` y una marca temporal (HMAC).
  - Aplicar una caducidad de 10 minutos y un solo uso.
  - Rechazar en el callback si no coincide.

#### P1-04 · Eventos de Stripe ignorados permanentemente
- **Evidencia [BD-VIVA]:**
  - 6 eventos del 10/10/2026 en `stripe_webhook_events` con estado ignorado: `checkout.session.completed`, `customer.subscription.created`, `.updated`, `.deleted`, `invoice.paid` e `invoice.payment_failed`.
  - Pertenecen a un cliente de Stripe que no existe en `stripe_customers`, ni activo ni borrado.
- **Evidencia [CÓDIGO]:** `supabase/functions/stripe-webhook/handler.ts:88-92` marca como ignorado cualquier evento de un cliente no mapeado, sin reintento ni alerta.
- **Impacto:** si se trata de un cliente real (por ejemplo, de un checkout creado fuera de la app o de una condición de carrera), habría cobrado sin que Supabase lo registre.
- **Riesgo:** pérdida de ingresos o un cliente que paga sin acceso.
- **Corrección:**
  - Identificar ese cliente en el panel de Stripe.
  - Si es real, mapearlo. Si es de prueba, documentarlo.
  - Añadir una alerta (email al admin) y la posibilidad de reprocesar eventos ignorados.
  - Recuperar el `user_id` desde `client_reference_id`/`metadata` de la sesión de checkout cuando falte el mapeo.

#### P1-05 · Administración basada sólo en el email
- **Evidencia [CÓDIGO]:**
  - `supabase/functions/admin-stats/index.ts:39-40` concede acceso comparando el email del JWT con `ADMIN_EMAIL`. Si la variable faltase, falla en abierto.
  - La variable está configurada [BD-VIVA: lista de secretos].
  - Combinado con P1-02, si no existe aún una cuenta con ese email, cualquiera podría registrarla sin verificar y obtener acceso a estadísticas globales.
- **[NO VERIFICABLE]:** si la cuenta del email admin existe. **Si no existe, este hallazgo pasa a P0.**
- **Corrección:**
  - Confirmar la existencia de la cuenta.
  - Usar un rol en `app_metadata` (no editable por el usuario) y fallar en cerrado si falta configuración.
  - Retirar la función si el panel legacy no se usa.

#### P1-06 · Campana de notificaciones decorativa
- **Evidencia [CÓDIGO]:** `src/features/dashboard/DashboardHeader.tsx`: el botón no tiene `onClick` y muestra un indicador rojo permanente.
- **Impacto:** da la falsa señal de que hay avisos pendientes; el botón no hace nada.
- **Corrección:** ocultar la campana hasta tener un sistema de avisos, o conectarla a avisos reales (prueba, pagos, GBP).

#### P1-07 · Resumen del dashboard siempre vacío
- **Evidencia [CÓDIGO]:**
  - `src/app-v2/routes/TodayPage.tsx:206-208` fija la valoración, las reseñas y las fotos a `null`.
  - En cambio, la sincronización GBP guarda esos metadatos (`src/features/reality-engine/engine.ts:184,196`).
- **Impacto:** el cliente conecta Google y no ve sus datos en la pantalla principal; parece que no funciona.
- **Corrección:** leer los metadatos sincronizados del negocio y mostrarlos, con estado vacío explícito si no hay conexión.

#### P1-08 · Pantalla de error de arranque sin salida y con trazas técnicas
- **Evidencia [CÓDIGO]:**
  - `src/main.tsx:18-24` muestra `error.message` y la traza en producción.
  - `src/app-v2/auth.tsx:13-28`, `src/hooks/useOnboardingStatus.ts:27-29` y `App.tsx:67-68`: la pantalla de error sólo ofrece "Reintentar", sin cerrar sesión.
- **Impacto:** un usuario con la sesión corrupta queda bloqueado, y se exponen detalles internos.
- **Corrección:** mensaje genérico en producción, botón "Cerrar sesión" y registro del error.

#### P1-09 · Registro sin aceptación de términos ni enlace a la privacidad
- **Evidencia [CÓDIGO]:** `src/components/LoginModal.tsx:301-313`: el formulario de alta no enlaza términos ni privacidad.
- **Impacto:** contratación de una suscripción sin aceptación acreditable de las condiciones (LSSI/consumidores).
- **Corrección:** texto de aceptación con enlaces en el alta y en el checkout. Registrar la versión aceptada.

#### P1-10 · Metadatos sociales y SEO incorrectos
- **Evidencia [CÓDIGO]:**
  - `index.html:12,15`: la imagen Open Graph/Twitter es la genérica de la plataforma de desarrollo.
  - `index.html:9`: la descripción habla de "Etsy, Shopify, Amazon", que es la versión anterior del producto.
  - No hay `canonical` ni `og:url`.
- **Impacto:** al compartir el enlace se ve una marca ajena y una propuesta incorrecta; perjudica la captación y el SEO propio de un producto de SEO.
- **Corrección:** imagen OG propia (1200x630), descripción actual, canonical y `og:url`.

#### P1-11 · Errores de registro genéricos
- **Evidencia [CÓDIGO]:** `LoginModal.tsx:112-116` y `translateError` (`:344-350`): los errores de `signup-instant` (límite superado, email inválido) se muestran como un error genérico.
- **Impacto:** abandono en el alta sin saber por qué.
- **Corrección:** mapear los códigos devueltos por la función a mensajes claros en ES/EN.

### P2 — Mejora no bloqueante

| ID | Hallazgo | Evidencia | Corrección |
|---|---|---|---|
| P2-01 | Tokens de Google guardados en texto plano en columnas `*_encrypted` | `gbp-oauth-callback/index.ts:131-142`. Las columnas no son legibles por el cliente gracias a los grants por columna [BD-VIVA] | Cifrar con Supabase Vault/pgsodium o una clave en un secreto |
| P2-02 | Protección de contraseñas filtradas desactivada | Advisor de seguridad [BD-VIVA] | Activarla en Supabase Auth |
| P2-03 | `analytics_events` INSERT con `check true` para anon/authenticated | Política [BD-VIVA] | Validar el tipo de evento y limitar la frecuencia, o insertar vía función |
| P2-04 | `beta_access_requests` INSERT anónimo con `check true` | Política [BD-VIVA] | Captcha o límite de frecuencia; retirar si la beta terminó |
| P2-05 | Textos en español fijos fuera de i18n | `LoginModal.tsx` (149, 168-171, 191-195, 204, 227, 232, 241, 256, 265, 312, 317-322, 345-349, además sin tildes), `AppShellV2` ("Cerrar sesion", "Abrir menu"), `auth.tsx:9,16-24`, `App.tsx:33`, `engine.ts` (23, 34-37, 46, 70, 99, 107, 129, 171, 188, 205-213) | Mover a i18n y corregir la ortografía |
| P2-06 | Detección de errores por texto en español | `engine.ts:122` | Usar códigos de error |
| P2-07 | Accesibilidad del modal de acceso | `LoginModal.tsx:175, 268` (botones sin nombre accesible) y etiquetas no asociadas (`:241`, `:256`) | `aria-label` y `htmlFor` |
| P2-08 | Insights y alertas del dashboard vacíos | `TodayPage.tsx:270,273` | Ocultar las secciones o alimentarlas |
| P2-09 | Validación de entrada en `gbp-sync` | `gbp-sync/index.ts:97,132` construye la URL de Google con `locationId`/`accountId` sin validar | Validar con regex (`^\d+$`) y comprobar la pertenencia |
| P2-10 | Funciones GBP sin límite de frecuencia | `gbp-oauth-start`, `gbp-sync`, `gbp-list-locations` | Reutilizar `edge_rate_limits` |
| P2-11 | Fallo silencioso si falta `STRIPE_PRICE_ID` | `stripe-billing/logic.ts:37-40`, `stripe-webhook/logic.ts:46-49` | Fallar en duro (500 + alerta) |
| P2-12 | Checkout sin clave de idempotencia | `stripe-billing/index.ts:112-124` | `idempotencyKey` por usuario y ventana |
| P2-13 | Sin conciliación programada Stripe → Supabase | La sincronización sólo se hace por webhook o por acción en la UI | Tarea diaria de conciliación |
| P2-14 | Informe interno publicado | `public/informe-sesion.html` (27 KB) se sirve públicamente y lista rutas internas | Eliminar de `public/` |
| P2-15 | Vulnerabilidades en dependencias de producción | `npm audit --omit=dev`: `react-router` (moderada, versiones 6.0.0-7.17.0) y `ws` (alta, 8.0.0-8.20.1) | Actualizar a versiones parcheadas tras revisar los cambios |
| P2-16 | CORS `*` en todas las funciones | Todas las Edge Functions | Restringir a los dominios propios en las funciones con sesión |
| P2-17 | `getSession` sin manejo de error | `src/hooks/useAuth.ts:15-19` | Tratar el error y cerrar la sesión |
| P2-18 | Código muerto con errores | 7 `*Landing.tsx`, `BetaLanding`, `MetaAdsLanding`, `legacy/AdminDashboard`: no enrutados, concentran los errores de TypeScript/ESLint, y algunos llaman a `signup-instant` y al píxel | Eliminar o archivar fuera de `src/` |

### P3 — Mejora futura

| ID | Hallazgo | Evidencia |
|---|---|---|
| P3-01 | 14 funciones retiradas siguen desplegadas, más `stripe-checkout` y `stripe-cancel-subscription` (410 en el repositorio; versión desplegada no verificada) | Listado de funciones [BD-VIVA] |
| P3-02 | `get_funnel_stats` (2 sobrecargas) con `search_path` mutable | Advisor [BD-VIVA]; sin permisos de ejecución para clientes |
| P3-03 | Grants completos a `anon` en tablas sin políticas anon | Inofensivo por RLS; aplicar mínimo privilegio |
| P3-04 | Tablas legacy (`user_usage`, `subscriptions`, `profiles.stripe_subscription_status`) | No intervienen en las decisiones de acceso; limpiar |
| P3-05 | `billing_state_for` usa `LIMIT 1` sin `ORDER BY` al leer suscripciones | Determinismo si un cliente tiene varias suscripciones |
| P3-06 | `gbp-oauth-start:144` devuelve `err.message` | Mensaje genérico |
| P3-07 | Evento analítico de cancelación disparado en estado `unpaid`; bloqueo de 2 minutos | `stripe-webhook` |
| P3-08 | Acciones rápidas duplicadas; `onSuccess` vacío (`App.tsx:119`); copia con `execCommand` | `TodayPage.tsx:199-202` |
| P3-09 | 3 `console.log` y 1 `catch` vacío en el código de la app | Limpieza |

### Puntos verificados como correctos (no son hallazgos)
- RLS activo en las 27 tablas. Las vistas `stripe_user_orders` y `stripe_user_subscriptions` usan `security_invoker=true`.
- Las únicas funciones SECURITY DEFINER ejecutables por `authenticated` son `billing_status`, `current_user_has_premium` y `start_trial`, y todas operan sobre `auth.uid()`.
- `profiles`: el usuario sólo puede actualizar `email` y `full_name`. No puede modificar campos de plan ni de facturación.
- Los tokens de Google no son legibles desde el cliente (grants por columna).
- Webhook: firma verificada (`stripe-webhook/index.ts:10,18-21`), idempotencia por `stripe_webhook_events` y relectura de la suscripción en Stripe (tolerante al desorden de eventos).
- Checkout: usuario tomado del JWT, precio/moneda/intervalo/modo validados (`stripe-billing/logic.ts:119-144`), cliente reutilizado (`index.ts:44-61`) y fin de prueba como ancla de facturación (`handler.ts:120-123`).
- El precio es coherente en la landing, la facturación y Stripe (9,99 €/mes), y la duración de la prueba también (7 días en la landing, el modal y `start_trial`).
- `signup-instant` no permite enumerar cuentas.
- `analyze-website` protegido contra SSRF.
- Sin `dangerouslySetInnerHTML`/`innerHTML`.
- Sin secretos en el código del cliente (sólo la clave pública anon).
- `onAuthStateChange` síncrono; validación de `returnTo` correcta.
- El modo demo está claramente rotulado como ejemplo.

---

## E. Resultados de pruebas, compilación y análisis estático [EJECUTADO]

| Comprobación | Resultado | Detalle |
|---|---|---|
| Tests unitarios (vitest) | **614/614 superados**, 27 ficheros | Los tests leen código fuente y lógica pura; **no hay tests E2E ni de navegador** |
| TypeScript (`tsc -p tsconfig.app.json`) | **20 errores preexistentes** (salida distinta de cero) | `LandingPage.tsx` (11), `MetaAdsLanding.tsx` (2), `ContentGeneratorLanding.tsx` (2), `BusinessAuditLanding.tsx` (2), `DiagnosticLanding.tsx` (1), `legacy/AdminDashboard.tsx` (1), `App.tsx` (1) |
| ESLint (`eslint .`) | **30 problemas preexistentes** (23 errores, 7 avisos) | `App.tsx`, `app-v2/auth.tsx`, landings temáticas, `LandingPage.tsx`, `BusinessContext.tsx`, `GBPCallbackPage.tsx`, `engine.ts`, `legacy/AdminDashboard.tsx`, `i18n.tsx`, `pixel.ts` |
| Build de producción (`npm run build`) | **Correcto** | Vite no hace comprobación de tipos, por eso compila pese a los errores de TS |
| `npm audit --omit=dev` | **3 vulnerabilidades** (2 moderadas, 1 alta) | `react-router` (moderada), `ws` (alta) |
| Advisors de seguridad Supabase | 2 tablas con RLS sin políticas (intencional, sólo servicio), `search_path` mutable en `get_funnel_stats`, protección de contraseñas filtradas desactivada | Ver P2-02, P3-02 |

**No ejecutado (no se declara validado):** pago real en Stripe live, recepción de webhooks en producción tras el despliegue actual, correo de recuperación de contraseña, OAuth de Google con una cuenta real, navegación E2E en navegador, rendimiento (Lighthouse) y pruebas de carga.

---

## F. Configuraciones externas pendientes de comprobación

| Sistema | Qué comprobar |
|---|---|
| Supabase Auth | Site URL = dominio de producción; Redirect URLs incluyen `https://<dominio>/reset-password` (pendiente de AUTH-RESET-001); plantillas de email en ES/EN; SMTP propio (Resend) con SPF/DKIM/DMARC; protección de contraseñas filtradas activada; política de contraseñas |
| Supabase Auth (admin) | Existe la cuenta correspondiente a `ADMIN_EMAIL` (ver P1-05) |
| Stripe | Modo live activo; el precio configurado es 9,99 € EUR mensual en live; endpoint del webhook apunta a `stripe-webhook` con los eventos `checkout.session.completed`, `customer.subscription.*` e `invoice.*`; el secreto del webhook corresponde al endpoint live; portal de cliente configurado (cancelación, método de pago, facturas); identificar el cliente de los 6 eventos ignorados (P1-04); impuestos (IVA) y datos fiscales en facturas |
| Google Cloud | Pantalla de consentimiento OAuth publicada y **verificada** para el ámbito sensible `business.manage`; URIs de redirección de producción; acceso a la Business Profile API aprobado y cuota |
| Hosting | Reglas SPA (`_redirects`) para rutas profundas (`/reset-password`, `/facturacion`, callbacks); HTTPS; cabeceras de seguridad (CSP, HSTS, X-Frame-Options) |
| Meta / Microsoft | Configurar el consentimiento previo (P0-01); acuerdos de encargo de tratamiento |
| Edge Functions | Retirar las funciones obsoletas desplegadas (P3-01); comprobar que `stripe-checkout` y `stripe-cancel-subscription` desplegadas no están operativas |
| Legal | Política de privacidad, cookies, términos y aviso legal revisados por un profesional |

---

## G. Plan de corrección (ordenado por dependencias y riesgo)

**Bloque 1 — Bloqueantes de lanzamiento**
1. **P0-01** Consentimiento de cookies + carga condicional de Pixel/Clarity + reescritura de los textos legales. No depende de nada más.
2. **P1-05** Verificar la cuenta admin. Si no existe, crearla o retirar `admin-stats` de inmediato. Después, rol en `app_metadata` con fallo en cerrado.
3. **P1-02** Captcha y/o confirmación de email antes de la prueba en `signup-instant`. Debe ir antes de cualquier campaña de captación.
4. **P1-03** Vincular y caducar el `state` de OAuth GBP.
5. **P1-04** Investigar los eventos ignorados en Stripe, y añadir alerta y reprocesado.
6. **P1-09** Aceptación de términos en el alta (depende del punto 1 para tener los textos definitivos).

**Bloque 2 — Experiencia del cliente y conversión**
7. **P1-01** Política de prueba para las cuentas existentes y verificación del CTA "Empezar prueba".
8. **P1-08** Pantalla de error con cierre de sesión y sin trazas.
9. **P1-11** Mensajes de error del alta.
10. **P1-06 / P1-07 / P2-08** Campana real u oculta; resumen con datos GBP; ocultar los bloques vacíos.
11. **P1-10** Metadatos OG/SEO.

**Bloque 3 — Validación E2E en producción (tras los bloques 1-2)**
12. Alta → onboarding → prueba → checkout live con tarjeta real → webhook → acceso premium → cancelación → reanudación → fin de periodo.
13. Recuperación de contraseña con correo real (AUTH-RESET-001).
14. Conexión GBP con una cuenta real y verificación de los datos en el dashboard.

**Bloque 4 — Endurecimiento (P2)**
15. P2-14 (informe público) y P2-15 (dependencias), por ser rápidos.
16. P2-01, P2-09, P2-10, P2-16 (seguridad GBP y funciones).
17. P2-11, P2-12, P2-13 (robustez de Stripe).
18. P2-02, P2-03, P2-04 (configuración de Auth y políticas de inserción pública).
19. P2-05, P2-06, P2-07, P2-17 (i18n, accesibilidad, errores).
20. P2-18: eliminar el código muerto, lo que deja TypeScript y ESLint casi limpios. Después, poner `tsc` y `eslint` como paso obligatorio del build.

**Bloque 5 — P3**: limpieza de funciones retiradas, grants, tablas legacy y detalles menores.

---

## H. Dictamen

### NO APTO PARA LANZAMIENTO

**Justificación:**
- **P0-01** expone legalmente a la empresa desde la primera visita de cualquier usuario de la UE: hay seguimiento sin consentimiento y una política de privacidad que lo niega expresamente. Es incompatible con un lanzamiento a clientes reales.
- **P1-02** y **P1-03** son defectos de seguridad o de abuso explotables sin acceso privilegiado: pruebas ilimitadas con coste de IA y vinculación de perfiles de Google ajenos.
- **P1-04** indica que la sincronización Stripe/Supabase ya ha dejado sin registrar un ciclo de pago completo, y no hay alerta.
- **P1-05** puede escalar a P0 según una configuración que no se ha podido verificar.
- Los flujos comerciales críticos (prueba, pago live, recuperación de contraseña) **no se han ejercido nunca en producción**: `user_trials` vacía y AUTH-RESET-001 pendiente.

**Fortalezas que reducen el esfuerzo de corrección:** el núcleo de seguridad de datos (RLS, gating premium en servidor, webhook firmado e idempotente, validación de precio y límites de IA) está bien diseñado. Los hallazgos se concentran en capas perimetrales (consentimiento, alta, OAuth, UX), no en el modelo de datos.

**Condición para pasar a APTO CON RESERVAS:**
- cerrar el Bloque 1 completo;
- cerrar P1-01, P1-08 y P1-06/P1-07 del Bloque 2;
- completar con éxito las pruebas E2E del Bloque 3 en producción.

Los P2 y P3 pueden abordarse después del lanzamiento según el orden del plan.
