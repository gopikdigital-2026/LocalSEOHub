# C. Inventario de seguridad — Fase A1

**Fuentes:**
- estado de seguridad de la base de datos y avisos de Supabase (solo lectura);
- consulta de permisos por columna;
- listado de funciones desplegadas;
- nombres de los secretos (sin valores);
- lectura del código.

## 1. Tablas (esquema `public`, 25 tablas, todas con RLS activo)

- **Propietario** = `auth.uid() = user_id`.
- **+negocio** = además, el negocio debe pertenecer al usuario.
- **RESTR Premium** = política restrictiva que exige `current_user_has_premium()`.

| Tabla | Acceso del cliente (permisos efectivos + políticas) | Riesgo |
|---|---|---|
| `analytics_events` | INSERT `anon` y `authenticated` con `WITH CHECK (true)`; SELECT de los propios eventos | **F-02 (P1)**: inserción de eventos arbitrarios |
| `beta_access_requests` | INSERT `anon` con `true`; lectura, edición y borrado denegados | Spam (tabla sin uso); bajo |
| `businesses` | Lectura, inserción, edición y borrado de los propios | OK. No hay columnas de privilegio |
| `business_actions` | Lectura y borrado propios; inserción y edición propias + negocio + RESTR Premium | OK |
| `weekly_content_drafts` | Lectura propia + negocio; edición solo de `content` y `copied_at` | OK (contadores solo en servidor) |
| `business_improvement_drafts` | Igual que la anterior | OK |
| `business_improvement_usage` | Lectura propia | OK |
| `prepared_replies` | Lectura propia + negocio. Inserción de 6 columnas y edición de 3 columnas, ambas con RESTR Premium | OK |
| `prepared_reply_details` | Lectura propia + negocio. Inserción de 3 columnas y edición de 2, ambas con RESTR Premium | OK |
| `connected_sources` | Lectura sin columnas de tokens. Inserción y edición de `status`, `metadata` y `external_*`. Borrado de las propias | **F-07 (P2)**; tokens en texto plano, solo servidor (F-05) |
| `source_sync_events` | Lectura, inserción y borrado propios | Bajo (son registros del propio usuario) |
| `first_value_progress` | Lectura, inserción, edición y borrado propios | OK |
| `profiles` | Lectura propia; inserción propia; edición solo de `email` y `full_name` | OK; columnas Stripe heredadas legibles (F-31) |
| `saved_seo`, `saved_seo_results` | Lectura, inserción, edición y borrado propios | OK (herramientas heredadas) |
| `user_usage` | Lectura, inserción, edición y borrado propios | Sin uso en el control actual; un contador editable por el cliente no debe usarse como límite |
| `user_trials` | Solo lectura propia; escritura denegada | OK |
| `trial_fingerprints` | Todo denegado | OK (sin uso en `start_trial`) |
| `stripe_customers` | Lectura propia (sin borrados) | OK |
| `stripe_subscriptions`, `stripe_orders` | Lectura vía cliente propio | OK |
| `subscriptions` | Lectura propia (políticas de escritura sin permiso efectivo) | OK (heredada) |
| `stripe_webhook_events` | Todo denegado | OK |
| `edge_rate_limits`, `stripe_customer_repairs` | Sin permisos ni políticas (solo servidor) | OK (avisos 1-2) |

**Vistas:** `stripe_user_orders` y `stripe_user_subscriptions` respetan los permisos de quien consulta (`security_invoker`). OK.

## 2. Funciones SQL

| Función | Ejecuta como | `search_path` fijo | Quién puede ejecutarla | Comprobación interna | Riesgo |
|---|---|---|---|---|---|
| `billing_status()` | definer | sí | authenticated | `auth.uid()` | Aviso 5; no explotable |
| `current_user_has_premium()` | definer | sí | authenticated | `auth.uid()` | Aviso 6; no explotable |
| `start_trial()` | definer | sí | authenticated | una prueba por cuenta | **Aviso 7 / F-03**: prueba a demanda |
| `billing_state_for(uuid)` | definer | sí | solo servidor | — | OK (T10) |
| `authorize_premium_request(...)` | definer | sí | solo servidor | — | OK (T11) |
| `consume_rate_limit(...)` | definer | sí | solo servidor | — | OK |
| `apply_stripe_subscription_snapshot(...)` | definer | sí | solo servidor | rechaza instantáneas antiguas | OK |
| `reserve_`, `complete_` y `release_weekly_content` | definer | sí | solo servidor | atómicas | OK (T13) |
| `reserve_`, `complete_` y `release_business_improvement` | definer | sí | solo servidor | atómicas | OK |
| `business_improvement_key_part`, `business_improvement_rule_kind` | invoker | sí | solo servidor | — | OK |
| `get_funnel_stats()` y `get_funnel_stats(since, until)` | definer | **no** | solo servidor | ninguna | Avisos 3-4; no explotable (A4, A7) |

## 3. Funciones de servidor (27 desplegadas)

- **CORS:** todas responden `Access-Control-Allow-Origin: *`. El impacto es bajo porque la autenticación va por token y no por cookie.
- **Premium:** todas las funciones IA y de fuentes llaman a `requirePremium`. Valida el usuario contra `/auth/v1/user`, aplica 30 peticiones/hora por función y falla en cerrado.

| Función | JWT plataforma | Autenticación en código | Premium | Límite | Llamadas externas / modelo | Usada por la interfaz | Riesgos |
|---|---|---|---|---|---|---|---|
| `weekly-content` | sí | sí | sí | 30/h + 3 versiones / 6 intentos (BD) | OpenAI `gpt-4o-mini`, 350 tokens, tiempo límite | Sí | OK |
| `business-improvement` | sí | sí | sí | 30/h + 6 por acción + 40 al mes (BD) | OpenAI `gpt-4o-mini`, 500 tokens, tiempo límite | Sí | OK |
| `analyze-website` | sí | sí | sí | 30/h | Web del usuario, con filtro SSRF | Sí (Fuentes) | F-10 |
| `gbp-oauth-start` | sí | sí | sí | 30/h | Google | Sí | F-06 |
| `gbp-oauth-callback` | **no** | `state` en BD | — | — | Google (token) | Sí (vuelta) | F-05, F-06 |
| `gbp-sync` | sí | sí | sí | 30/h | API de Google Business Profile | Sí | — |
| `gbp-list-locations` | sí | sí | sí | 30/h | API de Google Business Profile | Sí | — |
| `stripe-billing` | sí | sí | — | — | Stripe | Sí | F-12, F-14, F-26, F-27 |
| `stripe-webhook` | **no** | firma de Stripe | — | deduplicación | Stripe | — | F-13, F-25 |
| `stripe-checkout`, `stripe-cancel-subscription` | sí | — | — | — | ninguna (devuelven 410) | No | F-09 |
| `signup-instant` | **no** | — (público) | — | 10/h por IP (manipulable) y 5/h por email | Auth admin (clave de servicio) | Sí | **F-03**, F-24 |
| `admin-stats` | sí | sí + `ADMIN_EMAIL` | — | — | BD (clave de servicio) | No (admin heredado) | **F-04** |
| `analyze-competitor-url` | sí | sí | sí | 30/h | **Cualquier URL** + `gpt-4o-mini` sin tope de tokens | No | **F-01**, F-03 |
| `audit-maps-profile` | sí | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03, F-08 |
| `audit-reviews` | sí | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03 |
| `execute-tip-content` | sí | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03 |
| `generate-business-audit` | sí | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03 |
| `generate-content-plan` | sí | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03, F-08 |
| `generate-countermeasure` | **no** | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03 |
| `generate-gbp-description` | sí | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03 |
| `generate-geo-audit` | **no** | sí | sí | 30/h | `gpt-4o-mini` ×2 sin tope | No | F-03 |
| `generate-pitch` | sí | sí | sí | 30/h | `gpt-4o-mini`, 700 tokens | No | F-08 |
| `generate-seo` | sí | sí | sí | 30/h | `gpt-4o-mini` ×2 sin tope; imagen sin límite | No | F-03, F-08 |
| `generate-voice-script` | **no** | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03 |
| `scan-directories` | sí | sí | sí | 30/h | `gpt-4o-mini` sin tope (no descarga URLs) | No | F-03, F-08 |
| `simulate-campaign` | sí | sí | sí | 30/h | `gpt-4o-mini` sin tope | No | F-03 |

## 4. Secretos (solo nombres; ningún valor revisado ni expuesto)

**Configurados:**
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_JWKS`.
- OpenAI: `LocalSEO_KEY` y `LocalSEO_AI` (este último sin uso en el código).
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- Otros: `ADMIN_EMAIL`, `SITE_URL`.

**Frontend:** solo usa variables `VITE_` públicas (URL y clave anónima). No se ha encontrado ninguna clave de servicio ni clave de Stripe en `src/`. El ZIP pasa el escaneo de secretos.

## 5. Riesgos de seguridad (resumen)

| Riesgo | Hallazgos | Prioridad |
|---|---|---|
| Descarga de URLs arbitrarias desde el servidor (SSRF) | F-01 | P1 |
| SSRF residual en `analyze-website` | F-10 | P2 |
| Inserción abierta de analítica | F-02 | P1 |
| Abuso de prueba gratuita y coste IA | F-03 | P1 |
| Superficie de funciones sin uso | F-09 | P2 |
| Fallo abierto de configuración | F-04, F-14 | P2 |
| Tokens de Google y OAuth | F-05, F-06, F-07 | P2 |
| Fuga de errores del proveedor IA | F-08 | P2 |
| Dependencias vulnerables | F-19 | P2 |
| Contraseñas débiles y protección de contraseñas filtradas | F-24 | P3 |
