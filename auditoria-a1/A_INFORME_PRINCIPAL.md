# LocalSEOHub — Auditoría prelanzamiento · Fase A1 (diagnóstico)

Versión auditada: v0.7.3 (sin cambios de código desde `localseohub-v073.zip`).
Proyecto Supabase: `kdnrnibiwgijrejkizrk`. Fecha de ejecución: 2026-10-10.
Alcance: solo lectura. No se ha modificado código, migraciones, configuración, permisos, datos ni despliegues. No se ha llamado a OpenAI, Stripe ni Google.

> Este informe NO declara el producto listo para lanzamiento. No se ha iniciado la fase A2.

---

## 1. Resumen ejecutivo

- El núcleo de seguridad de datos es sólido. RLS está activo en las 25 tablas. Las pruebas con rol simulado (con reversión) confirman que un usuario no puede leer ni modificar el negocio, las acciones, las suscripciones ni las fuentes de otro usuario. Tampoco puede falsificar su prueba, su suscripción ni sus contadores de uso. Las funciones privilegiadas están cerradas a clientes.
- La facturación en servidor está bien diseñada:
  - precio validado contra 9,99 € / mes;
  - webhook con firma verificada y deduplicación;
  - Premium decidido solo en servidor;
  - sin redirecciones abiertas.
- No se ha encontrado ningún P0 confirmado.
- Hay 3 hallazgos P1 que considero **bloqueantes para lanzamiento**:
  1. **F-01 SSRF:** `analyze-competitor-url` descarga cualquier URL sin validación.
  2. **F-02 Analítica falsificable:** cualquiera, incluso sin sesión, puede insertar eventos arbitrarios (incluido `subscription_activated`) a nombre de cualquier usuario. Confirmado con prueba revertida.
  3. **F-03 Exposición de coste IA:** el registro no verifica el email y el límite por IP se puede saltar. Cada cuenta nueva obtiene 7 días Premium vía `start_trial` (confirmado), con acceso a unas 20 funciones IA a 30 peticiones/hora cada una. 13 de ellas no tienen `max_tokens` ni límite de entrada, y la mayoría ni siquiera las usa la interfaz actual.
- Calidad sin variación respecto a la línea base:

  | Comprobación | Resultado |
  |---|---|
  | Vitest | 423/423 |
  | Errores TS | 20 |
  | ESLint | 23 errores / 7 avisos |
  | Build | OK |
  | Avisos de seguridad | 8 |

  Los 20 errores TS y casi todos los de ESLint están en código abandonado.
- Stripe se ha revisado **solo de forma estática**. No se ha probado ningún pago real ni en modo test. Todo el bloque necesita una prueba manual autorizada antes del lanzamiento.

## 2. Estado por bloque

| Bloque | Estado | Comentario |
|---|---|---|
| 1. Arquitectura | Revisado | 14 rutas activas. 9 pantallas/landings abandonadas. 13 funciones de servidor desplegadas sin uso desde la interfaz. |
| 2. Seguridad BD | Correcto, con excepciones | Aislamiento verificado con pruebas. Excepciones: `analytics_events` (F-02) y columnas de `connected_sources` editables (F-07). |
| 2b. Edge Functions | Riesgos P1 / P2 | SSRF (F-01), coste (F-03), fugas de error (F-08), admin con fallo abierto latente (F-04). |
| 3. Stripe | Bien diseñado; no probado | Firma y deduplicación OK. Sin conciliación periódica (F-13). Vuelta del checkout sin reintento (F-12). |
| 4. Funcional | Mayormente coherente | Estados de carga, error y vacío presentes. Fricciones: F-11, F-16, F-17, F-18. |
| 5. Tres mejoras | Correctas y aisladas | Tablas, límites y funciones propias. Solo comparten el estado Premium. Sin interferencias. |
| 6. Costes | Riesgo no acotado | Las mejoras v0.7.1 / v0.7.2 tienen límites. Las funciones heredadas no (F-03). Nada medido. |
| 7. UX | Fricciones P2 / P3 | Campana falsa, textos solo en español, accesibilidad del modal y del menú móvil. |
| 8. Analítica | Incompleta y falsificable | El embudo no incluye prueba, checkout ni pago. Eventos duplicados probables (F-15). |
| 9. Calidad | Igual a la línea base | Además: 3 vulnerabilidades de dependencias (1 alta). |

## 3. Hallazgos priorizados

Formato: ID · severidad · ubicación · evidencia · reproducción · impacto · corrección mínima · riesgo de regresión · estado.

### P1 — Altos (bloqueantes)

**F-01 · P1 · SSRF en `supabase/functions/analyze-competitor-url/index.ts` (`fetchPageContent`, l.56-72, uso l.121-141)**
- **Evidencia:**
  - `fetch(url)` sobre la URL del cuerpo, comprobando solo que sea un texto no vacío (l.123).
  - No usa `urlSafety.ts`. No valida esquema, host ni IP. Sigue redirecciones por defecto. Lee todo el cuerpo sin límite de tamaño (l.72).
  - El contenido vuelve al cliente vía `detectedName` / `title` (l.193) y vía la salida del modelo.
- **Reproducción (no ejecutada):** con una cuenta en prueba, enviar `POST /functions/v1/analyze-competitor-url {"url":"http://<host interno>"}`.
- **Impacto:** el servidor puede usarse para sondear direcciones internas o privadas y leer su título o contenido. Además existe riesgo de agotar memoria con respuestas enormes.
- **Corrección mínima:** reutilizar `checkPublicUrl` / `fetchPublic` (ya existe en `analyze-website/urlSafety.ts`, copiado a la función) y añadir un límite de bytes. Alternativa: retirar la función, porque la interfaz no la usa.
- **Riesgo de regresión:** bajo (la interfaz no la llama).
- **Estado:** confirmado en código. Explotabilidad real en el entorno Deno de Supabase: no verificada.

**F-02 · P1 · `public.analytics_events`: política `insert_analytics_events` `WITH CHECK (true)` para `anon` y `authenticated`**
- **Evidencia:** posture de seguridad. Prueba revertida A1: como `anon`, `INSERT ('subscription_activated', session_id 'stripe-webhook', user_id = <usuario premium>)` → **OK**.
- **Reproducción:** `POST /rest/v1/analytics_events` con la clave pública y cualquier `event_name` / `user_id`.
- **Impacto:**
  - métricas comerciales falsificables (pagos, registros, embudo);
  - `admin-stats` usa estos datos (dispositivo / navegador de `register_success`);
  - crecimiento ilimitado de la tabla (24.790 filas actuales).
- **Corrección mínima:** limitar el `WITH CHECK` a una lista de eventos de cliente; `user_id IS NULL OR user_id = auth.uid()`; prohibir `session_id` reservados (`stripe-webhook`, etc.) y eventos de servidor. Opcional: límite de tamaño de `properties`.
- **Riesgo de regresión:** medio. La analítica del cliente envía `user_id` desde localStorage con la clave anónima (`src/lib/analytics.ts:66-71`), así que esos envíos fallarían. Hay que ajustar el cliente a la vez.
- **Estado:** confirmado.

**F-03 · P1 · Abuso de prueba gratuita y coste IA sin acotar**
- **Ubicación:** `signup-instant/index.ts` (l.22, 46, 65), RPC `start_trial`, `entitlement.ts` (30/h por función), 13 funciones IA heredadas.
- **Evidencia:**
  - **Registro:** `email_confirm: true` sin verificación (l.65). El límite por IP toma `x-forwarded-for`, que controla el cliente (l.22). El límite de 5 por email/hora se evita con emails distintos.
  - **Prueba gratuita:** prueba revertida T19: un usuario sin Premium llama `start_trial()` → `TRIAL_ACTIVE`, 7 días, `current_user_has_premium` = true. Las huellas de `trial_fingerprints` no se usan.
  - **Funciones heredadas:** sin `max_tokens` ni límite de entrada en audit-maps-profile, audit-reviews, execute-tip-content, generate-business-audit, generate-content-plan, generate-countermeasure, generate-gbp-description, generate-geo-audit (2 llamadas por petición), generate-seo (2 llamadas, imagen sin límite), generate-voice-script, scan-directories, simulate-campaign y analyze-competitor-url. generate-pitch tiene 700 tokens.
  - La interfaz solo usa weekly-content y business-improvement.
- **Reproducción (no ejecutada):** crear cuentas en bucle con emails distintos y cabecera XFF rotativa, iniciar sesión, llamar `start_trial` e invocar las funciones IA a 30/h cada una.
- **Impacto:** coste de OpenAI proporcional al número de cuentas falsas, sin tope global. No medido.
- **Corrección mínima:** elegir una o varias de estas opciones:
  - retirar o desactivar las 13 funciones IA sin uso;
  - añadir `max_tokens` y límites de entrada;
  - límite global diario de peticiones IA;
  - no confiar en XFF (usar la IP que da la plataforma);
  - cuota IA reducida durante la prueba.
- **Riesgo de regresión:** bajo para las funciones sin uso. Medio si se cambia el registro.
- **Estado:** confirmado (mecanismo). Coste: no verificado.

### P2 — Medios

**F-04 · P2 · `admin-stats/index.ts` l.39-40: fallo abierto si `ADMIN_EMAIL` está vacío**
- **Evidencia:** `if (adminEmail && user.email !== adminEmail)`. El secreto `ADMIN_EMAIL` existe (listado de secretos); su valor no es visible.
- **Impacto:** si el valor fuera vacío, cualquier usuario autenticado obtendría emails y nombres de todos los usuarios y el embudo.
- **Corrección mínima:** denegar si `!adminEmail`.
- **Riesgo de regresión:** nulo.
- **Estado:** confirmado en código; explotación no verificada (latente).

**F-05 · P2 · Tokens de Google en texto plano: `gbp-oauth-callback/index.ts` l.141-142**
- **Evidencia:** se guardan los tokens tal cual en `access_token_encrypted` / `refresh_token_encrypted`. Mitigación verificada: `authenticated` no tiene SELECT sobre esas columnas. Hay 1 fila con tokens.
- **Impacto:** cualquier fuga de la base de datos o de la clave de servicio expone el acceso a perfiles de Google.
- **Corrección mínima:** cifrar en reposo (pgsodium / Vault) o renombrar las columnas para no inducir a error.
- **Riesgo de regresión:** medio (afecta a gbp-sync / gbp-list-locations).
- **Estado:** confirmado.

**F-06 · P2 · OAuth Google: `state` no ligado a la sesión del navegador**
- **Ubicación:** `gbp-oauth-callback` con `verify_jwt = false`.
- **Evidencia:** el callback busca la fila por `metadata->>oauth_state` (l.64-73). El `state` es aleatorio y de un solo uso, pero no se comprueba que el navegador que vuelve sea el que lo inició.
- **Reproducción (no ejecutada):** el atacante inicia OAuth y envía a la víctima la URL de consentimiento de Google. Si la víctima acepta, sus tokens quedan en la fila del atacante.
- **Impacto:** el atacante leería datos del perfil de Google de la víctima (requiere ingeniería social).
- **Corrección mínima:** cookie o valor en sessionStorage comparado en `/oauth/google-business/callback` antes de aceptar la vinculación.
- **Riesgo de regresión:** bajo.
- **Estado:** probable.

**F-07 · P2 · `connected_sources`: `status`, `metadata`, `external_*` y `last_sync_at` editables por el usuario**
- **Evidencia:** permisos por columna (consulta de privilegios).
- **Impacto:**
  - el usuario puede marcar su propia fuente `google_business` como «Conectada y verificada» o inventar contadores de reseñas (solo en su cuenta);
  - puede escribir `metadata.oauth_state`;
  - la etiqueta «verificada» pierde valor.
- **Corrección mínima:** dejar estos campos solo para el servidor y permitir al cliente únicamente la fuente manual.
- **Riesgo de regresión:** medio (la fuente manual y la web se guardan desde el cliente: `reality-engine/engine.ts:91-96`).
- **Estado:** confirmado (permisos); explotación no ejecutada.

**F-08 · P2 · Fuga de errores del proveedor IA al cliente**
- **Evidencia:** `details: errBody` y/o `raw` en:
  - audit-maps-profile (l.103, 116);
  - generate-content-plan (l.113, 126, 138);
  - generate-seo (l.196, 216);
  - scan-directories (l.121, 134, 141).

  `err.message` con el cuerpo de OpenAI en generate-pitch (l.77→89).
- **Impacto:** revela detalles de cuota, organización y modelo.
- **Corrección mínima:** respuesta genérica; el detalle solo en el log.
- **Riesgo de regresión:** nulo.
- **Estado:** confirmado.

**F-09 · P2 · Superficie muerta desplegada**
- **Evidencia:** 13 funciones IA sin referencias en `src/` siguen activas (listado de funciones), además de `stripe-checkout` / `stripe-cancel-subscription` (devuelven 410).
- **Impacto:** amplía F-01, F-03 y F-08 sin beneficio para el usuario.
- **Corrección mínima:** retirar las funciones tras confirmarlo.
- **Riesgo de regresión:** bajo.
- **Estado:** confirmado.

**F-10 · P2 · `analyze-website/urlSafety.ts`: la comprobación DNS falla en abierto (l.59, 84, 89)**
- **Evidencia:** posible rebinding DNS. Sin límite de tamaño de respuesta. Las peticiones de robots.txt y sitemap no tienen timeout (index.ts l.101, 113).
- **Impacto:** SSRF residual (menor que F-01) y riesgo de agotar memoria.
- **Corrección mínima:** fallar en cerrado si no hay DNS; añadir límite de bytes y timeouts.
- **Riesgo de regresión:** bajo.
- **Estado:** confirmado (código); explotación probable.

**F-11 · P2 · Si falla la carga de la facturación, un usuario de pago ve «necesitas una prueba o suscripción»**
- **Ubicación:** `ActionsProvider.tsx:28-29, 123, 146`.
- **Evidencia:** `canWrite = hasPremium === true`; con `hasPremium` en `null` se lanza `PremiumRequiredError` sin mostrar el aviso de bloqueo.
- **Impacto:** mensaje erróneo a clientes que pagan.
- **Corrección mínima:** con estado desconocido, mostrar «no hemos podido comprobar tu suscripción, reintentar».
- **Riesgo de regresión:** bajo.
- **Estado:** probable.

**F-12 · P2 · Vuelta del checkout: un solo `sync` sin reintento**
- **Ubicación:** `BillingPage.tsx:81-88`.
- **Evidencia:** los errores se ignoran y no hay sondeo.
- **Impacto:** tras pagar, el usuario puede seguir viendo «sin suscripción» hasta recargar.
- **Corrección mínima:** 3-5 reintentos con espera, o sondear `billing_status` durante unos segundos.
- **Riesgo de regresión:** bajo.
- **Estado:** confirmado (código); impacto no probado.

**F-13 · P2 · Sin conciliación periódica Stripe ↔ Supabase**
- **Evidencia:** no hay ninguna tarea programada. Si un webhook se pierde definitivamente, el estado queda desfasado hasta que el usuario pase por `/facturacion?checkout=success` o se ejecute `sync`.
- **Impacto:** Premium incorrecto (de más o de menos) tras cancelaciones o renovaciones perdidas. Mitigación parcial: el acceso se corta al pasar `current_period_end`.
- **Corrección mínima:** `sync` al cargar `/facturacion` o una tarea diaria.
- **Riesgo de regresión:** bajo.
- **Estado:** confirmado (ausencia).

**F-14 · P2 · Configuración del precio**
- **Ubicación:** `stripe-billing/logic.ts:33-40`, `stripe-webhook/logic.ts:42-49`.
- **Evidencia:** si `STRIPE_PRICE_ID` estuviera vacío, todas las suscripciones se filtrarían y los pagadores quedarían `not_started`. El secreto existe; su valor no es visible.
- **Impacto:** cobro sin Premium.
- **Corrección mínima:** fallar en cerrado al arrancar si está vacío, o usar el `lookup_key` como fuente única.
- **Riesgo de regresión:** bajo.
- **Estado:** no verificado (depende del valor).

**F-15 · P2 · Embudo de analítica incompleto e inconsistente**
- **Evidencia:**
  - `get_funnel_stats` no cuenta prueba, checkout, pago ni activación.
  - `hero_analysis_start`, `tool_open` y `tool_generate` no se emiten en código accesible, así que `abandonment_rate` de admin-stats siempre es 0.
  - No hay evento de clic en precio (`App.tsx:82-85`) ni de primer uso Premium.
  - `register_success` se emite una vez por instancia de `useAuth` (7 instancias en 6 archivos; mínimo 2 por registro).
  - El píxel `CompleteRegistration` no se envía en registros con Google.
  - Nombres duplicados (`first_action_completed` con dos significados, `first_recommendation(s)_generated`).
- **Impacto:** no se puede medir la conversión real.
- **Corrección mínima:** un único emisor de registro; añadir los eventos de servidor al embudo; un evento de clic en precio.
- **Riesgo de regresión:** bajo.
- **Estado:** confirmado (ausencias); duplicación de `register_success` probable.

**F-16 · P2 · Reseñas «verificadas» sin reseñas visibles**
- **Ubicación:** `reality-engine/engine.ts:190-197`, `sourceStatus.ts:60` y `workspaces.tsx:95-96`.
- **Evidencia:** tras `gbp-sync` la fuente de reseñas aparece «verificada» con un contador, pero la pantalla de reseñas sigue diciendo «Todavía no tenemos tus reseñas… Conecta Google Business Profile».
- **Impacto:** contradicción visible para el usuario.
- **Corrección mínima:** texto condicional en la pantalla de reseñas.
- **Riesgo de regresión:** bajo.
- **Estado:** probable (no probado con una cuenta conectada).

**F-17 · P2 · Bloqueo en el arranque**
- **Ubicación:** `useOnboardingStatus.ts:38-40` y `auth.tsx:13-28`.
- **Evidencia:** el `.then` no tiene `.catch`, así que el estado puede quedarse en «cargando» para siempre. Un error persistente deja una pantalla «Error de conexión» cuya única salida es recargar.
- **Impacto:** usuario bloqueado ante fallos de red o de la base de datos.
- **Corrección mínima:** añadir `.catch`, un botón de reintento y la opción de cerrar sesión.
- **Riesgo de regresión:** bajo.
- **Estado:** probable.

**F-18 · P2 · Campana de notificaciones falsa: `features/dashboard/DashboardHeader.tsx:41-47`**
- **Evidencia:** sin acción al pulsar y con un punto rojo permanente de «no leído».
- **Impacto:** sugiere avisos que no existen.
- **Corrección mínima:** quitar el punto o el botón.
- **Riesgo de regresión:** nulo.
- **Estado:** confirmado.

**F-19 · P2 · Dependencias con vulnerabilidades conocidas (`npm audit`)**
- **Evidencia:**
  - `ws` 8.0-8.20.1: severidad alta (memoria / DoS); llega por las dependencias de producción.
  - `react-router(-dom)` ≤ 7.17: moderada; redirección abierta con barra invertida. Mitigada en la vuelta tras login por `safeReturnPath`, que rechaza `\`.
- **Corrección mínima:** `npm audit fix`, sin `--force`, en A2 y con pruebas.
- **Riesgo de regresión:** bajo-medio.
- **Estado:** confirmado (informe de npm).

### P3 — Bajos

| ID | Ubicación | Evidencia / impacto | Corrección mínima | Estado |
|---|---|---|---|---|
| F-20 | `src/components/*Landing.tsx` (7), `legacy/components/AdminDashboard.tsx`, `first-value/BetaLanding.tsx`, `app-v2/demo/demoData.ts` | Sin importaciones en producción. Originan los 20 errores TS y la mayoría de los de ESLint. Lógica de registro copiada 5 veces. | Borrar tras confirmar | Confirmado |
| F-21 | Panel `/hoy` (DashboardHeader, BusinessHealthCard, CompetitorAlerts, AIInsights, QuickActions, GrowthTimeline) | Textos fijos en español aunque la app es ES/EN | Pasar a i18n | Confirmado |
| F-22 | `CompetitorAlerts.tsx:51`; `TodayPage.tsx:270, 273` | «Conecta tus fuentes para monitorizar la competencia»: no existe esa fuente. AIInsights siempre vacío. | Ocultar las tarjetas vacías | Probable |
| F-23 | `LoginModal.tsx:152-157, 218, 233, 245-251`; `AppShellV2.tsx:129-135, 188` | Modal sin `role=dialog`, Escape ni foco atrapado. Botones de icono sin `aria-label`. Etiquetas no asociadas. Menú móvil cerrado sigue enfocable. Texto de 10 px. | Ajustes de accesibilidad | Confirmado |
| F-24 | `signup-instant` l.46; Auth | Contraseña mínima de 6 caracteres; protección de contraseñas filtradas desactivada (aviso) | Mínimo 8 y activar HIBP | Confirmado |
| F-25 | `stripe-webhook/handler.ts:100-115` | `checkout_completed` / `payment_failed` pueden duplicarse si un reintento sigue a un fallo posterior | Registrar tras marcar el evento | Confirmado (código) |
| F-26 | `stripe-billing/index.ts:45-59` | Pasadas 24 h de la clave de idempotencia, dos peticiones simultáneas pueden crear un cliente Stripe huérfano | Bloqueo por usuario | Probable |
| F-27 | `stripe-billing/logic.ts:117` | Una suscripción `incomplete` no impide un segundo checkout | Incluir `incomplete` | Confirmado (código) |
| F-28 | `get_funnel_stats` (2 sobrecargas) | `search_path` mutable, pero sin EXECUTE para anon / authenticated (pruebas A4 / A7 → 42501): no explotable | `SET search_path = public` | Confirmado |
| F-29 | `business-memory/repository.ts:43-83` | Historial e ideas guardados solo en el navegador; no aparecen en otro dispositivo | Documentar o persistir | Confirmado |
| F-30 | `admin-stats/index.ts:206` | MRR = suscripciones × 9,99 (fijo) | Leer de Stripe | Confirmado |
| F-31 | `profiles` | Columnas heredadas `stripe_customer_id` / `stripe_subscription_status` legibles, no editables, sin uso en el control Premium | Retirar más adelante | Confirmado |

**Decisión de producto pendiente (no es defecto):** con `past_due` (Stripe reintentando el cobro) se pierde Premium de inmediato (`trial_lifecycle…sql:152-153`). Hay que confirmar si se desea un periodo de gracia.

## 4. Los 8 avisos de seguridad de Supabase

| # | Aviso | ¿Explotable? | Gravedad | Impacto | Propuesta |
|---|---|---|---|---|---|
| 1 | `edge_rate_limits`: RLS sin políticas | No. Sin permisos para clientes; solo la clave de servicio vía `consume_rate_limit` / `authorize_premium_request` | Info | Ninguno (bloqueo total intencionado) | Aceptar y documentar, o añadir una política `false` explícita para silenciar el aviso |
| 2 | `stripe_customer_repairs`: RLS sin políticas | No. Mismo patrón; tabla interna | Info | Ninguno | Igual que el 1 |
| 3-4 | `get_funnel_stats` (2 sobrecargas): `search_path` mutable | No. EXECUTE revocado a anon / authenticated (verificado: 42501). Solo `service_role` desde admin-stats | Bajo | Teórico, solo si un rol con permiso de creación en `public` lo explotara | `ALTER FUNCTION … SET search_path = public` |
| 5 | `billing_status()` SECURITY DEFINER ejecutable por authenticated | No. Intencionado; devuelve el estado del propio usuario (`auth.uid()`); `search_path` fijo | Bajo | Ninguno (no acepta un id de usuario) | Aceptar, o pasar a INVOKER con lectura de las tablas propias |
| 6 | `current_user_has_premium()` | No. Intencionado; las políticas restrictivas lo necesitan; solo para el propio usuario | Bajo | Ninguno | Aceptar |
| 7 | `start_trial()` | Sí, en sentido de abuso de negocio: cualquier cuenta nueva obtiene 7 días Premium (prueba T19). No permite repetir en la misma cuenta | Medio (incluido en F-03) | Coste IA por cuentas falsas | Exigir onboarding completado y/o email verificado, o huella `trial_fingerprints` |
| 8 | Protección de contraseñas filtradas desactivada | Indirecto: permite contraseñas comprometidas | Bajo | Robo de cuentas por credenciales reutilizadas | Activarla en Auth (cambio de configuración, no de código) |

## 5. Riesgos comerciales

1. **Coste IA sin techo** por cuentas de prueba falsas (F-03). Es el riesgo económico principal y no está medido.
2. **Métricas de conversión no fiables** (F-02, F-15). Hoy no se puede demostrar la conversión ni el pago desde el embudo.
3. **Cobro sin acceso** si `STRIPE_PRICE_ID` está mal configurado (F-14) o si se pierde un webhook (F-13). Hay que verificarlo con una compra real o de prueba autorizada.
4. **Confianza:** la campana falsa (F-18), las reseñas «verificadas» que no se ven (F-16) y el mensaje de «suscríbete» a quien ya paga (F-11).
5. **Reputación con Google:** tokens en texto plano (F-05) y OAuth sin vincular al navegador (F-06).

## 6. Bloqueos reales para lanzamiento

- F-01 (SSRF).
- F-02 (inserción de analítica abierta).
- F-03 (prueba gratuita y coste IA sin límite).
- Prueba manual autorizada del ciclo completo de Stripe: alta, renovación, cancelación y pago fallido. Hoy no se ha ejecutado.

## 7. Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| `vitest run` | 22 archivos, 423/423 OK (= línea base) |
| `tsc -p tsconfig.app.json` | 20 errores (= línea base); todos TS6133 (variables sin uso), 18 de ellos en código abandonado |
| `eslint .` | 23 errores / 7 avisos (= línea base) |
| `npm run build` | OK |
| `npm audit` | 3 vulnerabilidades (1 alta `ws`, 2 moderadas `react-router`) |
| Avisos de seguridad Supabase | 8 (= línea base) |
| Estado de seguridad (RLS, permisos, vistas, funciones) | 25 tablas con RLS; 2 vistas `security_invoker`; 17 funciones; detalle en el entregable C |
| Pruebas de rol simulado con reversión (T1-T20, A1-A8) | Ver la matriz B |
| `md5sum` de las 17 copias de `entitlement.ts` | Idénticas |
| Funciones desplegadas y secretos (solo nombres) | 27 funciones activas; `verify_jwt` coincide con `config.toml` |

**Procedimiento de las pruebas con datos:**
1. Un único bloque `DO $$ … $$` simula el usuario con `set_config('request.jwt.claims', …, true)` y `SET LOCAL ROLE authenticated|anon`.
2. Cada operación va envuelta en `BEGIN … EXCEPTION`.
3. El bloque termina siempre con `RAISE EXCEPTION 'RESULT…'`, lo que revierte toda la transacción.

No ha quedado ningún dato persistido: la prueba de prueba gratuita no dejó fila en `user_trials`, y la tabla sigue con 0 filas.

## 8. Pruebas no ejecutadas y motivo

| Prueba | Motivo |
|---|---|
| Checkout real o de test, renovación, cancelación, pago fallido, webhooks en vivo | Stripe es compartido; requiere autorización expresa |
| Llamadas reales a funciones IA (coste, latencia, `max_tokens` efectivos) | Restricción de no llamar a OpenAI |
| Explotación de SSRF (F-01, F-10) | Requiere invocar la función desplegada; fuera del alcance de diagnóstico |
| OAuth de Google (F-06), sincronización de GBP | Prohibido alterar Google OAuth / GBP |
| Registro masivo / bypass por XFF (F-03) | Crearía usuarios reales |
| Navegador (recorrido, móvil, accesibilidad real) | No hay navegador disponible; matriz manual en B |
| Valor real de `ADMIN_EMAIL` y `STRIPE_PRICE_ID` | Solo se pueden ver los nombres de los secretos |

## 9. Orden recomendado de correcciones (cada una pendiente de autorización)

1. **F-01:** validar la URL o retirar `analyze-competitor-url`. Aprovechar para retirar las funciones IA sin uso (F-09), lo que reduce F-03 y F-08.
2. **F-03:** límites de coste (`max_tokens`, límite de entrada, tope global) y endurecer `start_trial` y el registro.
3. **F-02:** restringir la inserción en `analytics_events` y ajustar el cliente.
4. **F-04 y F-14:** fallar en cerrado en la configuración (`ADMIN_EMAIL`, `STRIPE_PRICE_ID`).
5. **Facturación:** F-12 y F-13 (sincronización tras pagar y conciliación) y después la prueba manual autorizada de Stripe.
6. **Google:** F-05, F-06 y F-07.
7. **Experiencia:** F-11, F-16, F-17 y F-18.
8. **Medición:** F-15 (embudo) y F-19 (dependencias).
9. **P3**, con F-20 (código abandonado) en primer lugar, porque deja TS y ESLint casi a cero.
