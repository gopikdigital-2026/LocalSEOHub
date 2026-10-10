# B. Matriz de pruebas — Fase A1

**Estados:**
- **OK**: superada.
- **FALLO**: confirma un hallazgo.
- **EST**: verificación solo estática, leyendo el código.
- **PEND**: pendiente; se indica el motivo.

**Usuarios de prueba**

| Alias | ID de usuario | Negocio | Situación |
|---|---|---|---|
| U-B | `48721796…` | `e1971c40…` | sin Premium |
| U-A | `5fa9559d…` | `91a0c7d4…` | Premium |

Todas las pruebas sobre la base de datos se ejecutaron dentro de un único bloque con reversión forzada (`RAISE EXCEPTION`). Después se comprobó que no quedaba ningún dato persistido: `user_trials` = 0, ningún evento falso y `prepared_replies` = 0.

## 1. Calidad automática

| # | Prueba | Resultado | Evidencia | Estado |
|---|---|---|---|---|
| Q1 | Vitest | 423 / 423 | 22 archivos superados | OK (= línea base) |
| Q2 | TypeScript (`tsconfig.app.json`) | 20 errores TS6133 | 18 en landings y admin abandonados; 1 en `App.tsx` (`useAuth` sin uso) | OK (= línea base) |
| Q3 | ESLint | 23 errores / 7 avisos | Mayoría en código abandonado; `engine.ts` (`any` ×2), `i18n.tsx` (bloque vacío), `pixel.ts` (`any`) | OK (= línea base) |
| Q4 | Build | Correcto | Vite completado | OK |
| Q5 | `npm audit` | 1 alta (`ws`), 2 moderadas (`react-router`) | Salida de `npm audit --omit=dev` | FALLO (F-19) |
| Q6 | Avisos de seguridad de Supabase | 8 | Los 8 conocidos, sin avisos nuevos | OK (= línea base) |
| Q7 | Copias de `entitlement.ts` | 17 copias idénticas | `md5sum` único `3d6cb2cb…` | OK |
| Q8 | `verify_jwt` desplegado frente a `config.toml` | Coinciden en las 27 funciones | Listado de funciones desplegadas | OK |

## 2. Aislamiento y permisos (rol simulado, revertido)

| # | Prueba | Resultado | Esperado | Estado |
|---|---|---|---|---|
| T1 | U-B lee el negocio de U-A | 0 filas | 0 | OK |
| T2 | U-B ve negocios | 1 (el suyo) | 1 | OK |
| T3 | U-B lee las acciones de U-A | 0 | 0 | OK |
| T4 | U-B ve suscripciones Stripe | 0 | 0 | OK |
| T5 | U-B ve eventos de analítica | 26 (los suyos) | solo los suyos | OK |
| T6 | U-B ve fuentes conectadas | 0 | 0 | OK |
| T7 | U-B actualiza el negocio de U-A | 0 filas afectadas | 0 | OK |
| T8 | U-B, sin Premium, crea una respuesta preparada | 42501 (denegado) | denegado | OK |
| T9 | U-B crea una acción en el negocio de U-A | 42501 | denegado | OK |
| T10 | U-B llama a `billing_state_for(U-A)` | 42501 | denegado | OK |
| T11 | U-B llama a `authorize_premium_request` | 42501 | denegado | OK |
| T12 | U-B llama a `get_funnel_stats()` | 42725 (sobrecarga ambigua; ver A7) | denegado | OK |
| T13 | U-B llama a `reserve_weekly_content` | 42501 | denegado | OK |
| T14 | U-B reinicia `generations` del contenido semanal | 42501 | denegado | OK |
| T15 | U-B reinicia `business_improvement_usage` | 42501 | denegado | OK |
| T16 | U-B se crea una prueba gratuita de 1 año | 42501 | denegado | OK |
| T17 | U-B cambia `profiles.stripe_subscription_status` | 42501 | denegado | OK |
| T18 | `current_user_has_premium` para U-B | false | false | OK |
| T19 | U-B llama a `start_trial()` directamente | `TRIAL_ACTIVE` | según diseño | FALLO de negocio (F-03) |
| T20 | Premium de U-B tras T19 | true | — | Confirma F-03 |
| A1 | Visitante sin sesión inserta `subscription_activated` a nombre de U-A | Aceptado | denegado | FALLO (F-02) |
| A2 | Visitante lee eventos de analítica | 0 | 0 | OK |
| A3 | Visitante lee negocios | 0 | 0 | OK |
| A4 | Visitante llama a `get_funnel_stats(fechas)` | 42501 | denegado | OK |
| A5 | Visitante llama a `start_trial` | 42501 | denegado | OK |
| A6 | Visitante inserta en `beta_access_requests` | Permitido por la política; solo se detuvo por un campo obligatorio vacío | — | Informativo (tabla de solicitudes sin uso) |
| A7 | U-B llama a `get_funnel_stats(fechas)` | 42501 | denegado | OK |
| A8 | Duración de la prueba creada en T19 | 7 días | 7 días | OK |
| P1 | Columnas de tokens de Google visibles para usuarios | No incluidas en el permiso de lectura | ocultas | OK (mitiga F-05) |
| P2 | Columnas de `connected_sources` editables por el usuario | `status`, `metadata`, `external_*`, `last_sync_at`, `last_error` | solo servidor | FALLO (F-07) |
| P3 | Vistas Stripe | Ambas respetan los permisos de quien consulta | sí | OK |

## 3. Verificaciones estáticas (solo lectura de código)

| # | Comprobación | Resultado | Evidencia | Estado |
|---|---|---|---|---|
| S1 | Funciones IA comprueban Premium antes de trabajar | Sí, en todas, incluidas las 3 sin verificación JWT de plataforma | `requirePremium` al inicio de cada función | EST OK |
| S2 | Premium falla en cerrado | Sí: cualquier error devuelve 503 | `entitlement.ts:98-101` | EST OK |
| S3 | Protección SSRF en `analyze-competitor-url` | Ausente | `index.ts:61` | EST FALLO (F-01) |
| S4 | Protección SSRF en `analyze-website` | Presente; la comprobación DNS falla en abierto | `urlSafety.ts:59,84,89` | EST FALLO parcial (F-10) |
| S5 | Firma del webhook de Stripe | `constructEventAsync` sobre el cuerpo original | `stripe-webhook/handler.ts:52-61` | EST OK |
| S6 | Deduplicación de eventos del webhook | Reclamo en `stripe_webhook_events` | `stripe-webhook/index.ts:23-55` | EST OK |
| S7 | Validación del precio (9,99 € / mes) | Divisa, importe, intervalo y modo verificados | `stripe-billing/logic.ts:119,133-144` | EST OK |
| S8 | Direcciones de vuelta del checkout | Solo desde `SITE_URL` | `logic.ts:146-159` | EST OK |
| S9 | Doble suscripción | Bloqueada salvo con estado `incomplete` | `handler.ts:102-107` | EST OK / F-27 |
| S10 | Cancelar la suscripción de otro usuario | Imposible (se usa el cliente propio) | `stripe-billing/handler.ts:95,145` | EST OK |
| S11 | Premium nunca se marca en el navegador | El navegador solo lee `billing_status` | `BillingProvider.tsx:48-67` | EST OK |
| S12 | Redirección abierta tras el login | Bloqueada | `returnTo.ts:7-20` | EST OK |
| S13 | Contenido semanal: 3 versiones, 6 intentos, reserva atómica, devolución si falla la IA | Reservar, completar o liberar en base de datos; `gpt-4o-mini`; 350 tokens; tiempo límite | `weekly-content/index.ts:33-65`, `logic.ts:6-12` | EST OK (más tests v0.7.1) |
| S14 | Mejoras: 6 intentos por acción, 40 al mes, clave semántica en servidor | `MAX_ATTEMPTS=6`, `MONTHLY_REQUESTS=40`, 500 tokens, tiempo límite | `business-improvement/logic.ts:8-14` | EST OK (más tests v0.7.2) |
| S15 | Respuestas preparadas sin IA | Sin función de servidor; solo plantillas | `prepared-replies/repository.ts` | EST OK |
| S16 | Interferencia entre las tres mejoras | Tablas y límites separados; solo comparten el estado Premium | revisión del código | EST OK |
| S17 | Error de administrador si falta `ADMIN_EMAIL` | Falla en abierto | `admin-stats/index.ts:39-40` | EST FALLO latente (F-04) |
| S18 | `state` de OAuth ligado al navegador | No | `gbp-oauth-callback:64-73` | EST FALLO probable (F-06) |
| S19 | Datos de demostración presentados como reales | No: aviso «Modo demostración» y botón opcional | `DataIntegrity.tsx:13-61`, `workspaces.tsx:107,264` | EST OK |
| S20 | Usuario sin Premium en Hoy y Plan | Aviso de bloqueo; no se escribe nada | `ActionsProvider.tsx:29,123` | EST OK |
| S21 | Facturación no disponible | Mensaje «necesitas suscripción» erróneo | `ActionsProvider.tsx:146` | EST FALLO probable (F-11) |

## 4. Pruebas manuales pendientes (no hay navegador disponible)

| # | Recorrido | Pasos | Resultado esperado | Estado |
|---|---|---|---|---|
| M1 | Visitante → registro | Abrir `/`, pulsar «Empezar», registrarse con email y contraseña | Sesión iniciada y paso a `/empezar`; evento `register_success` una sola vez | PEND (crea un usuario real) |
| M2 | Inicio de sesión con `next` | Abrir `/plan` sin sesión e iniciar sesión | Vuelve a `/plan` | PEND |
| M3 | Configuración del negocio | Completar `/empezar` | Negocio guardado, prueba de 7 días activa, paso a `/hoy` | PEND |
| M4 | Primera misión | En `/hoy`, empezar una acción y abrir `/ejecutar/:id` | Pantalla de trabajo adecuada; completar marca la acción en `/plan` e `/informes` | PEND |
| M5 | Contenido semanal | Generar, editar, copiar y regenerar hasta el límite | 3 versiones como máximo; mensaje claro al llegar al límite | PEND (usa la IA) |
| M6 | Mejora en 2 minutos | Desde una acción de perfil, generar y regenerar | 6 intentos por acción; el contador mensual baja | PEND (usa la IA) |
| M7 | Respuestas preparadas | Guardar dirección y forma de reserva, editar, copiar; cambiar datos del negocio | Aviso «desactualizada» y botón de actualizar manual | PEND |
| M8 | Usuario con la prueba vencida | Cuenta con la prueba vencida | Aviso de pago visible; las respuestas guardadas siguen copiables | PEND |
| M9 | Checkout | Desde `/facturacion`, suscribirse en modo test | Vuelta a `/facturacion?checkout=success` y Premium activo en menos de 10 s | PEND (requiere autorización de Stripe) |
| M10 | Cancelación y reactivación | Cancelar y luego reactivar | Estado «se cancelará» y fecha correcta | PEND (Stripe) |
| M11 | Pago fallido | Tarjeta de test que falla en la renovación | Estado `past_due`; pérdida de Premium (decisión de producto) | PEND (Stripe) |
| M12 | Móvil | `/hoy`, `/plan` y menú lateral a 375 px | Sin desbordes; el menú lateral cerrado no recibe foco | PEND |
| M13 | Accesibilidad | Navegación con teclado del modal de login | Escape cierra el modal, el foco queda dentro y los iconos tienen nombre | PEND (fallo esperado, F-23) |
| M14 | Fuentes | Conectar Google Business y sincronizar | La pantalla de reseñas coincide con el estado «verificada» | PEND (prohibido tocar OAuth) |
| M15 | Error de red al arrancar | Iniciar sesión sin conexión a la base de datos | Pantalla con reintento y salida | PEND (fallo esperado, F-17) |
