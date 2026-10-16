# A2.6 — Billing, Trial & Premium End-to-End Audit — Informe

## A. Resumen ejecutivo

- **Alcance:** auditoría pre-lanzamiento de facturación, prueba gratuita y Premium. Read-only primero; solo se corrigieron hallazgos pequeños y seguros. Sin cambios en Stripe, Google OAuth ni SMTP.
- **Resultado:** 0 P0, 0 P1. 1 P2 abierto (F-03, requiere acción del owner: es condición de STOP por SMTP externo). 2 P3 corregidos (permisos de base de datos, defensa en profundidad). Resto P3/P4/INFO documentados.
- **Ruta principal de cobro: correcta.** Precio resuelto en servidor, cliente Stripe resuelto en servidor por `auth` del llamante, sin `customerId`/`subscriptionId`/precio/URL del cliente, firma de webhook obligatoria, idempotencia por `event_id`, guarda de orden (`last_synced_at`), tablas de facturación de solo lectura para el navegador, Premium calculado solo por `billing_state_for()`.
- **Corrección aplicada (A26-001/A26-002):** migración aditiva `a26_billing_grant_hardening` (solo privilegios, sin datos ni estructura).
- **Tests:** 1168 en verde (1045 base + 123 nuevos en `src/features/billing/__tests__/a26Billing.test.ts`, ítems 1–98).
- **Calidad:** TypeScript 20 errores (= base), ESLint 30 problemas (= base), build OK tras el último cambio. 0 problemas nuevos.
- AUTHENTICATED PRODUCTION BILLING E2E = NOT TESTED
- REAL STRIPE PAYMENT E2E = NOT TESTED
- STRIPE LIVE PRICE = NOT VERIFIED
- EMAIL AUTH = PARTIAL
- **Modo Stripe:** UNKNOWN (no se imprimieron claves).
- **A3:** no iniciado. Se espera auditoría y autorización expresa.

## B. Modelo comercial (Tabla 1)

| Concepto | Valor | Fuente de autoridad | Evidencia |
|---|---|---|---|
| Plan | Único, mensual | Backend `PLAN` | `stripe-billing/logic.ts` |
| Precio | 9,99 € / mes (EUR, 999 céntimos) | `validatePrice` rechaza cualquier otro importe/moneda/intervalo | test 1, 6 |
| Prueba | 7 días, sin tarjeta, explícita, una por usuario | `start_trial()` | tests 4, 10–15 |
| Tarjeta en prueba | No se pide | Checkout no añade `trial_period_days` | test 15 |
| Suscribirse durante la prueba | Primer cobro anclado al fin de la prueba (`billing_cycle_anchor`, sin prorrateo) | `stripe-billing` | tests 21–22 |
| Tras cancelar | Acceso hasta fin de periodo, sin segunda prueba | `billing_state_for` | tests 19, 30–31, 57 |
| Plan gratuito | No existe | — | P4 copia legada (A26-006) |
| Límites IA | wc 22, bi 18, seo 18, advisor 12, voice 10, GLOBAL 80, por mes natural UTC | `ai_usage_cap`, `reserve_ai_usage` | test 92 |

## C. Seguridad de Stripe compartido

Stripe is treated as shared GOPIK infrastructure.

- La cuenta de Stripe la comparten LocalSEOHub, ViraScript y AutoHook.
- El código filtra suscripciones por los precios del plan (`onlyPlanSubscriptions`), así que una suscripción de otro producto no cuenta como Premium ni bloquea el checkout (tests 9, 55).
- Todas las llamadas de la auditoría fueron de lectura sobre la base de datos de LocalSEOHub. Ninguna llamada a la API de Stripe.

No Stripe product was created, modified or deleted.
No Stripe price was created, modified or deleted.
No Stripe webhook configuration was modified.
No Stripe Customer Portal global configuration was modified.
No real payment was performed.

## D. Propiedad de recursos Stripe (Tabla 2)

| RESOURCE | IDENTIFIER | OWNERSHIP | USED BY | SAFE TO MODIFY? | EVIDENCE |
|---|---|---|---|---|---|
| Cuenta Stripe | (no impresa) | Compartida GOPIK | LocalSEOHub, ViraScript, AutoHook | NO | Instrucción del owner; comentario en `logic.ts` |
| Clave secreta | secreto `STRIPE_SECRET_KEY` (solo nombre) | Compartida / UNKNOWN | Edge functions | NO | `list_edge_function_secrets` |
| Producto LocalSEOHub | UNKNOWN (no consultado) | No probada exclusiva | LocalSEOHub | NO | Sin lectura de Stripe |
| Precio mensual | secreto `STRIPE_PRICE_ID` / lookup `localseohub_monthly_eur_999` | No probada exclusiva | `stripe-billing`, `stripe-webhook` | NO | `stripe-billing/index.ts` |
| Endpoint webhook | URL de `stripe-webhook` en Stripe (no consultada) | UNKNOWN | LocalSEOHub | NO | Secreto `STRIPE_WEBHOOK_SECRET` existe |
| Configuración Customer Portal | Global de la cuenta | Compartida | Todos los productos | NO | Global por definición |
| Clientes `cus_…` | 6 filas en `stripe_customers` (2 activas) | Creados por LocalSEOHub con `metadata.userId` | LocalSEOHub | NO (objetos Stripe) | Consulta BD |
| Tablas `stripe_*`, `user_trials` | Supabase LocalSEOHub | Exclusiva LocalSEOHub | LocalSEOHub | SÍ (solo con migración aditiva) | Proyecto Supabase propio |
| Edge functions `stripe-billing`, `stripe-webhook` | Supabase LocalSEOHub | Exclusiva LocalSEOHub | LocalSEOHub | SÍ (no se cambiaron) | `supabase/functions` |

## E. Arquitectura de la prueba

- `start_trial()` (SECURITY DEFINER, `search_path` fijo): exige `auth.uid()`, actúa solo desde `TRIAL_NOT_STARTED`, exige `email_confirmed_at`, inserta `user_trials` (7 días, origen `explicit`) con `ON CONFLICT (user_id) DO NOTHING`.
- Se dispara desde el aviso de prueba (`BillingNotices`) o al terminar el onboarding (`FirstValueFlow`).
- `user_trials`: clave primaria `user_id`; el navegador solo puede leer su fila. Sin `INSERT/UPDATE/DELETE` para anon/authenticated.
- La fila de prueba nunca se borra, así que una prueba caducada o una suscripción cancelada no vuelven a `TRIAL_NOT_STARTED`.
- Datos en vivo: `user_trials` = 0 filas (ningún usuario actual ha iniciado prueba).

## F. Abuso de la prueba

- **Una por cuenta:** garantizado por la base de datos (tests 12, 19, 20).
- **Una por persona:** no garantizado. Un usuario puede crear otra cuenta con otro email.
  - Frenos actuales en `signup-instant`: 10 altas/hora por IP, 5/hora por email, 50 cuentas/hora en total.
  - El freno previsto (email verificado) no actúa porque `signup-instant` confirma el email automáticamente (F-03, A26-003).
- **Alta directa por la API pública de Supabase Auth** (saltándose `signup-instant`): depende del ajuste "Allow new users to sign up" y "Confirm email" del proyecto, que no se puede leer desde aquí (A26-004).
- **Prueba sin tarjeta:** el coste de abuso es uso de IA, acotado por los topes mensuales por usuario (global 80).

## G. Fuente de verdad de Premium

Premium entitlement is determined server-side.
Premium entitlement cannot be granted by a frontend query parameter.

- Única fuente: `billing_state_for(p_user_id)` (solo `service_role`). El navegador llama `billing_status()` / `current_user_has_premium()`, que usan `auth.uid()`.
- Las edge functions Premium usan `authorize_premium_request`, que lee `has_premium` de `billing_state_for`.
- El navegador nunca eleva un estado no Premium aunque reciba `has_premium: true` (test 38) y rechaza estados desconocidos (test 39).
- `?checkout=success` solo lanza una sincronización en servidor y refresca; no concede nada (test 61).
- Tablas legadas `subscriptions`, `profiles.stripe_*`, `user_usage`, `trial_fingerprints`: ninguna función de Premium las lee (verificado en `pg_proc`).

## H. Matriz de estados Premium (Tabla 3)

| Situación | Estado | Premium | Test |
|---|---|---|---|
| Sin prueba, sin suscripción | TRIAL_NOT_STARTED | No | 23 |
| Prueba activa | TRIAL_ACTIVE | Sí | 24 |
| Prueba caducada | TRIAL_EXPIRED | No | 25 |
| `active` | SUBSCRIPTION_ACTIVE | Sí | 26 |
| `trialing` | SUBSCRIPTION_ACTIVE | Sí | 27 |
| `past_due` | SUBSCRIPTION_PAST_DUE | No | 28 |
| `unpaid` | SUBSCRIPTION_CANCELED | No | 29 |
| Cancelando, periodo vigente | SUBSCRIPTION_CANCELING | Sí | 30 |
| Cancelando, periodo terminado | SUBSCRIPTION_CANCELED | No | 31 |
| `canceled` | SUBSCRIPTION_CANCELED | No | 32 |
| `incomplete` | PAYMENT_PENDING | No | 33 |
| `incomplete_expired` | SUBSCRIPTION_CANCELED | No | 34 |
| `paused` | SUBSCRIPTION_CANCELED | No | 35 |
| `past_due` con prueba sin tarjeta aún vigente | TRIAL_ACTIVE | Sí | 36 |
| Fila `not_started` sin prueba | TRIAL_NOT_STARTED | No | 37 |

El test 40 comprueba que cada regla del espejo del test existe literalmente en la SQL de `billing_state_for`.

## I. Precios

- Landing: `9,99€` + `/mes` (ES), `€9.99` + `/mo` (EN); "7 días gratis · Cancela cuando quieras" / "7 days free · Cancel anytime".
- Facturación: `PRICE_LABEL` = `9,99 €/mes` / `€9.99/month`.
- Backend: `PLAN` = EUR, 999, mensual. Coherente.
- Copia legada no alcanzable con promesas incoherentes ("plan gratuito", "Tu tarjeta se cargará automáticamente", "Sin tarjeta hasta el día 8"): P4 (A26-006).

### Autoridad de precio (Tabla 5)

| DISPLAY | BACKEND CONFIG | STRIPE REF |
|---|---|---|
| `9,99€` / `€9.99` (landing), `9,99 €/mes` / `€9.99/month` (facturación) | `PLAN = {eur, 999, month, 1}`; `validatePrice` rechaza otro importe, moneda, intervalo, inactivo, no recurrente o modo distinto | `STRIPE_PRICE_ID` (secreto) o lookup key `localseohub_monthly_eur_999`; valor real NOT VERIFIED |

El precio que se cobra no puede diferir del mostrado: si el precio de Stripe no cumple `PLAN`, el checkout responde `billing_unavailable` y no se crea sesión (test 8).

## J. Checkout

- Acción `checkout` en `stripe-billing` (`verify_jwt = true`).
- Bloquea una segunda suscripción si hay una del plan en `active`, `trialing`, `past_due`, `unpaid` o `paused` (409 `already_subscribed`, con reconciliación).
- Reutiliza una sesión abierta del mismo precio (sin sesiones duplicadas).
- Cliente creado con clave de idempotencia `customer-{userId}`; si hay carrera, el índice único parcial `stripe_customers(user_id) WHERE deleted_at IS NULL` lo resuelve.
- En el navegador el botón queda bloqueado durante la redirección (evita doble clic) y solo se siguen URLs `https://checkout.stripe.com/` o `https://billing.stripe.com/` (test 60).

## K. Seguridad del checkout

- El cuerpo solo aporta `action`; precio, importe, `customerId`, `subscriptionId`, `userId` y URLs del cliente se ignoran (tests 50–51).
- URLs de retorno fijas `{SITE_URL origin}/facturacion?checkout=success|cancel|portal`; solo `https` (o `http://localhost`) (tests 52–53). Sin open redirect.
- La URL de éxito y la de cancelación no conceden Premium (test 61).

## L. Propiedad del cliente Stripe

A user cannot access another user’s Stripe customer or subscription.

- `findCustomer(user.id)` con el usuario de la sesión; nunca un id del cliente (tests 50, 82, 85, 88).
- `stripe_customers`: `customer_id` único; un solo cliente activo por usuario (índice único parcial).
- `stripe_subscriptions`: `customer_id` único.
- Lectura RLS: solo filas propias, no borradas.

## M. Arquitectura del webhook

- `stripe-webhook` (`verify_jwt = false`, protegido por firma).
- Eventos: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` (test 68). Otros: 200 sin efecto (test 69).
- No confía en el contenido del evento: vuelve a leer las suscripciones del cliente en Stripe y aplica un snapshot (tests 70–71).
- Cliente desconocido → ignorado. **No hay coincidencia por email** (test 76).

### Matriz de eventos (Tabla 6)

| INPUT | DB EFFECT | IDEMPOTENCY | ENTITLEMENT |
|---|---|---|---|
| Firma ausente/inválida | Ninguno (400) | — | Sin cambio |
| Tipo no manejado | Ninguno (200 ignored) | — | Sin cambio |
| `checkout.session.completed` (mode subscription) | Snapshot releído de Stripe; evento `checkout_completed` | `event_id` PK + claim | Según estado releído |
| `checkout.session.completed` (otro mode) | Evento marcado `ignored` | Igual | Sin cambio |
| `customer.subscription.created/updated` | Snapshot | Igual + guarda `last_synced_at` | Según estado |
| `customer.subscription.deleted` | Snapshot (`canceled`) | Igual | Pierde Premium (salvo prueba vigente) |
| `invoice.paid` | Snapshot | Igual | `active` → Premium |
| `invoice.payment_failed` | Snapshot + evento `payment_failed` | Igual | `past_due` → sin Premium |
| Cliente no mapeado | Evento `ignored` | Igual | Sin cambio |
| Duplicado | Ninguno (200) | `processed/ignored` → duplicate | Sin cambio |
| En curso (<2 min) | Ninguno (409, reintento) | `processing` → busy | Sin cambio |
| Error al procesar | Evento `failed` (500, Stripe reintenta) | Reclamable | Sin cambio |

## N. Seguridad del webhook

Stripe webhook requests require valid signature verification.

- Sin cabecera `stripe-signature` → 400 antes de leer nada (test 65).
- `constructEventAsync(cuerpo crudo, firma, STRIPE_WEBHOOK_SECRET)`; fallo → 400 genérico, sin eco del error (tests 66–67).
- `apply_stripe_subscription_snapshot` solo ejecutable por `service_role` (test 80).

## O. Idempotencia del webhook

- `stripe_webhook_events.event_id` es clave primaria (test 79); claim atómico.
- Reentrega procesada → 200 sin efecto (test 72); concurrente → 409 (test 73); fallo de claim → 500 (test 74); fallo de proceso → `failed` + 500 (test 75).
- Orden: `FOR UPDATE` sobre la fila y rechazo si `last_synced_at` existente es más reciente (test 78).
- En vivo: 13 eventos, todos `processed` o `ignored`.

## P. Ciclo de vida de la suscripción (Tabla 7)

| Paso | Acción | Quién | Resultado BD | Premium |
|---|---|---|---|---|
| Alta | `signup-instant` | Usuario | `auth.users` | No |
| Inicio de prueba | `start_trial()` | Usuario | `user_trials` (7 días) | Sí |
| Checkout | `stripe-billing checkout` | Usuario | `stripe_customers` (si no existía) | Sin cambio |
| Pago completado | Webhook + `sync` al volver | Stripe / servidor | Snapshot `active`/`trialing` | Sí |
| Fallo de pago | Webhook | Stripe | `past_due` | No (salvo prueba vigente) |
| Cancelar | `stripe-billing cancel` | Usuario | `cancel_at_period_end = true` | Sí hasta fin de periodo |
| Reactivar | `stripe-billing resume` | Usuario | `cancel_at_period_end = false` | Sí |
| Fin de periodo cancelado | Webhook `deleted` / regla de fecha | Stripe / BD | `canceled` | No |
| Volver a suscribirse | Checkout nuevo | Usuario | Nuevo snapshot | Sí tras pago; **sin segunda prueba** |

## Q. Customer Portal

- Cliente resuelto en servidor (test 82); sin cliente → 404 (test 84).
- `payment_method` usa el flujo `payment_method_update` (test 83).
- Retorno fijo `/facturacion?checkout=portal`.
- No se tocó la configuración global del portal.

## R. Cancelación / reactivación

- Solo sobre la suscripción actual del plan del propio usuario y solo si está en `active`/`trialing` (tests 85, 87).
- Repetir la misma acción es un no-op `unchanged` (test 86).
- Resuscripción tras cancelar: checkout normal sin ancla de prueba (test 57).

## S. Uso de IA frente a facturación

Starting checkout does not reset AI usage.
Canceling a subscription does not reset AI usage.

- Ni `stripe-billing` ni `stripe-webhook` mencionan las tablas de uso de IA (test 62).
- El periodo de uso es el mes natural UTC (`date_trunc('month', …)`), independiente de cobros (test 92).
- Tras A26-001 el navegador ya no tiene privilegios de escritura sobre `ai_usage_monthly` ni `ai_usage_reservations` (antes ya los bloqueaba RLS).

AI usage global limit remains 80.
Voice Simulator limit remains 10.
SEO Generator limit remains 18.
AI Business Advisor limit remains 12.
Weekly Content limit remains 22.
Business Improvement limit remains 18.

## T. Fallo de pago

- `invoice.payment_failed` → snapshot `past_due` → sin Premium; la página de facturación ofrece "actualizar método de pago".
- Fallo de Stripe en cualquier acción → 500 `billing_failed` genérico; log con claves redactadas (test 89).
- Fallo del webhook → `failed` + 500; Stripe reintenta. Al volver a `/facturacion` el usuario también fuerza `sync`.
- Nunca se usa coincidencia insegura por email.

## U. RLS / aislamiento de usuarios

Clients cannot directly mark their subscription as active.

Privilegios en vivo tras la corrección (anon / authenticated):

| Tabla | Privilegios | Política |
|---|---|---|
| `stripe_customers`, `stripe_subscriptions`, `stripe_orders` | SELECT | Solo filas propias |
| `stripe_webhook_events`, `stripe_customer_repairs`, `edge_rate_limits` | Ninguno | — |
| `user_trials` | SELECT (solo authenticated) | Solo fila propia |
| `ai_usage_monthly`, `ai_usage_reservations` | SELECT | Solo filas propias |
| `subscriptions` (legada) | SELECT | Propias |
| `trial_fingerprints` (legada) | Ninguno | Todo denegado |
| `profiles` | SELECT; INSERT (id, email, full_name, created_at); UPDATE (full_name, email); DELETE propio (authenticated) | Propias |

- Vistas `stripe_user_subscriptions` y `stripe_user_orders`: `security_invoker = true` (respetan RLS).
- Aislamiento A/B verificado en el manejador (test 88) y por política RLS.

## V. Secretos / logs

- Sin claves Stripe, `whsec_`, service role ni nombres de secretos en `src/` ni en `dist/` (test 93, ejecutado también contra el build final).
- Logs: `safeErrorMessage` redacta `sk_/rk_/whsec_/pk_`.
- No se almacenan ni registran números de tarjeta, CVC ni objetos de pago; solo marca y últimos 4 dígitos (test 94).
- Secretos configurados (solo nombres): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `SITE_URL`, Supabase, Google y otros. No se imprimió ningún valor.

## W. Email / Auth (F-03)

**EMAIL AUTH = PARTIAL**

- Alta: el formulario usa `signup-instant` (no `auth.signUp` directo; test 95), con límites por IP, email y global.
- `signup-instant` crea el usuario con `email_confirm: true` (test 96): **el email no se verifica**. Por eso la comprobación `email_confirmed_at` de `start_trial` no frena nada para estas cuentas.
- Recuperación de contraseña: usa `resetPasswordForEmail`; depende del SMTP del proyecto (no verificado).
- Google OAuth: activo; no se modificó.
- En vivo: 10 usuarios (8 email, 2 Google), todos confirmados.

**Pasos del owner (no ejecutados, condición de STOP por SMTP externo):**

1. Configurar un SMTP propio en Supabase (Authentication → Emails → SMTP) con dominio verificado (SPF/DKIM).
2. Activar "Confirm email" en Authentication → Providers → Email.
3. Revisar que la plantilla de confirmación y la URL de redirección apuntan a `SITE_URL`.
4. Autorizar después el cambio de `signup-instant` a `auth.signUp` (o enviar el email de confirmación desde ahí) para que la verificación sea real.
5. Revisar "Allow new users to sign up": si sigue activo, el alta directa por API se salta los límites de `signup-instant` (A26-004).

## X. Tests / E2E

### Resultados (Tabla 9)

| Comprobación | Resultado |
|---|---|
| Tests totales | 1168 / 1168 en verde (38 ficheros) |
| Nuevos A2.6 | 123 casos (`a26Billing.test.ts`, ítems 1–98) |
| TypeScript (`tsconfig.app.json`) | 20 errores (= base; 0 en el fichero nuevo) |
| ESLint | 30 problemas (= base; 0 en el fichero nuevo) |
| Build | OK tras el último cambio |
| Migración A2.6 | Aplicada; privilegios verificados en vivo |

Todos los datos de Stripe en tests son FIXTURE/MOCK; no hay llamada real a Stripe.

### Estado E2E real (Tabla 10)

| Flujo | Estado | Motivo |
|---|---|---|
| AUTHENTICATED PRODUCTION BILLING E2E | NOT TESTED | No hay sesión de navegador autenticada en este entorno |
| REAL STRIPE PAYMENT E2E | NOT TESTED | Prohibido cobro real; Stripe compartido |
| STRIPE LIVE PRICE | NOT VERIFIED | No se consultó Stripe; `STRIPE_PRICE_ID` existe |
| Modo Stripe | UNKNOWN | No se imprimen claves |
| EMAIL AUTH | PARTIAL | F-03 |
| Flujos con fixtures: alta→prueba, prueba caducada, pagado, cancelado | TESTED (MOCK/FIXTURE) | Tests 17–42, 48–89 |

Política E2E real recomendada (para el owner): en modo test de Stripe con tarjeta `4242…`, una cuenta nueva; comprobar prueba → checkout → webhook → Premium → cancelar → fin de periodo; sin tocar productos ni portal compartidos.

## Y. Hallazgos y correcciones (Tabla 8)

| ID | SEVERITY | AREA | DESCRIPTION | EVIDENCE | IMPACT | FIX | TEST | STATUS |
|---|---|---|---|---|---|---|---|---|
| A26-001 | P3 | RLS/grants | anon/authenticated tenían TRUNCATE/TRIGGER/REFERENCES en tablas de facturación y prueba, y escritura completa en `ai_usage_*` y `trial_fingerprints` (RLS bloqueaba las escrituras; TRUNCATE no pasa por RLS ni por la API REST) | `information_schema.role_table_grants` | Defensa en profundidad | Migración `a26_billing_grant_hardening` (solo REVOKE) | 91 | FIXED |
| A26-002 | P3 | RLS/grants | El navegador podía insertar `profiles.stripe_customer_id` / `stripe_subscription_status` (legados) | `column_privileges` | Ninguno sobre Premium (no se leen) | INSERT limitado a id, email, full_name, created_at | 91 | FIXED |
| A26-003 | P2 | Auth/F-03 | `signup-instant` confirma el email automáticamente | `email_confirm: true` | Pruebas múltiples con emails desechables (acotadas por límites de alta y de IA) | Requiere SMTP + cambio de flujo (STOP) | 96 | OPEN — OWNER |
| A26-004 | P3 | Auth | El alta directa por la API pública de Auth puede saltarse los límites de `signup-instant` según ajustes del proyecto | Ajuste no legible | Más altas sin límite | Owner revisa ajustes (sección W) | 95 | DOCUMENTED |
| A26-005 | P4 | Datos legados | `subscriptions`, `user_usage`, `trial_fingerprints`, `profiles.stripe_*` sin uso para Premium; `user_usage` sigue editable por su dueño | `pg_proc`, grep | Ninguno | — | 90 | DOCUMENTED |
| A26-006 | P4 | Copia | Claves i18n y landings no enrutadas con promesas incoherentes ("plan gratuito", "tarjeta se cargará", "día 8") | `i18n.tsx`, `*Landing.tsx` | Ninguno (no alcanzables) | Limpieza futura | — | DOCUMENTED |
| A26-007 | P3 | Legal | La página de facturación no enlaza Términos/Privacidad (solo modales en el pie de la landing; no hay rutas) | `BillingPage.tsx` | Menor claridad legal en pago | No se crean políticas nuevas | — | DOCUMENTED |
| A26-008 | INFO | Gates | SEO y Advisor no tienen pre-gate en la interfaz; dependen de `premium_required` del servidor (heredado A25-012) | Páginas | Ninguno de seguridad | — | 47 | ACCEPTED |
| A26-009 | INFO | Estado | Una suscripción `active` con periodo vencido sin webhook sigue Premium hasta que Stripe actualice | `billing_state_for` | Stripe es la autoridad; `sync` al visitar | — | 26 | ACCEPTED |
| A26-010 | INFO | Stripe | Modo y precio en vivo no verificados | Sin lectura de Stripe | Riesgo de configuración | Owner verifica en el panel | 6–8 | DOCUMENTED |
| A26-011 | P4 | Copia | EN f6 promete "English support" | `i18n.tsx` | Promesa de soporte | Confirmar con el owner | — | DOCUMENTED |
| A26-012 | INFO | Política | `past_due` quita Premium inmediatamente (salvo prueba sin tarjeta vigente) | `billing_state_for` | Decisión de producto coherente en front y back | — | 28, 36 | ACCEPTED |
| A26-013 | INFO | Datos | Una suscripción `canceled` cuyo cliente no está mapeado a usuario | Consulta BD | Ninguno | — | — | DOCUMENTED |

### Herramientas Premium (Tabla 4)

| Herramienta | Gate interfaz | Gate servidor | Notas |
|---|---|---|---|
| SEO Generator | No (muestra `premium_required`) | Sí (`seo-generator-v2`) | Tope 18 |
| AI Business Advisor | No (muestra `premium_required`) | Sí (`business-advisor-v2`) | Tope 12 |
| Voice Simulator | Sí | Sí (`voice-simulator-v2`) | Tope 10 |
| Competitor Radar | Sí | Sí (`competitor-radar-v2`) | — |
| Maps Scanner | Sí | No hay backend propio (determinista en navegador) | No se declara gate de servidor |
| GEO Audit | Sí | No hay backend propio (determinista); `analyze-website` sí tiene gate | — |
| Digital Twin | Sí | No hay backend propio (determinista) | No se declara gate de servidor |
| Weekly Content / Business Improvement | — | Sí | Topes 22 / 18 |

All seven LocalSEOHub tools remain available.
All fourteen retired legacy functions remain retired.
The A2.5 Google verification trust fix remains active.

## Z. Riesgos y pendientes pre-lanzamiento

1. **F-03 (A26-003):** activar SMTP y verificación real del email (sección W). Hasta entonces, la prueba es "una por cuenta", no "una por persona".
2. Verificar en el panel de Stripe (sin modificar nada compartido) que `STRIPE_PRICE_ID` es el precio de LocalSEOHub en EUR 9,99/mes y en el modo correcto.
3. Verificar que el endpoint de webhook de LocalSEOHub escucha los 6 eventos manejados.
4. Ejecutar un E2E en modo test de Stripe con una cuenta de prueba.
5. Añadir enlaces a Términos y Privacidad en la página de facturación (A26-007).
6. Limpiar copia legada no alcanzable (A26-006).

No Google OAuth or Google Cloud configuration was modified.
No businesses were deleted.
No connected sources were deleted.

**DO NOT START A3.** Se espera auditoría y autorización expresa.
