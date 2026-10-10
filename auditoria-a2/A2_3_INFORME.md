# A2.3 — Control de trials, registro y costes de IA

**Proyecto:** LocalSEOHub · Supabase `kdnrnibiwgijrejkizrk`
**Fecha:** 2026-10-10
**Estado:** Completado parcialmente — controles activados en servidor; verificación de correo preparada pero pendiente de configuración SMTP.

---

## 1. Inventario de IA

| Función | Modelo | Max output tokens | Max input (chars) | Max provider calls | Timeout | Límite por negocio/acción | Límite mensual por usuario | Estado |
|---|---|---|---|---|---|---|---|---|
| `weekly-content` | gpt-4o-mini | 350 | ~1500 (saneado) | 2 | 20 s | 3 generaciones / 6 intentos por semana | **40/mes (NUEVO)** | Activa con IA |
| `business-improvement` | gpt-4o-mini | 500 | ~1500 (saneado) | 2 | 20 s | 3 gen / 6 int por draft; 16 drafts/negocio | 40/mes (existente, ahora reforzado) | Activa con IA |
| `analyze-website` | — | — | — | — | 25 s total | 30 req/hora (rate limit) | — | Activa sin IA |
| `signup-instant` | — | — | — | — | — | 10/h IP, 5/h email, **50/h global (NUEVO)** | — | Sin auth |
| 14 funciones retiradas A2.1 | — | — | — | — | — | — | — | Retiradas (410) |
| Resto (stripe-*, gbp-*, v0.7.3) | — | — | — | — | — | — | — | Activas sin IA |

**Límite global combinado:** 80 solicitudes mensuales por usuario entre weekly-content y business-improvement.

**Funciones accesibles sin autenticación:** `signup-instant`, `gbp-oauth-callback`, `stripe-webhook`, `generate-countermeasure`, `generate-geo-audit`, `generate-voice-script` (estas tres son stubs 410).

---

## 2. Diagnóstico de registro y verificación

### Estado previo (F-03)
- `signup-instant` creaba cuentas con `email_confirm: true` forzado, saltándose la configuración del proyecto.
- El proyecto tiene `mailer_autoconfirm: true` (confirmación automática activada). No hay SMTP configurado.
- Cualquier cuenta nueva queda confirmada inmediatamente, permitiendo activar el trial sin verificar el correo.
- El límite por IP usa `x-forwarded-for`, que en Supabase Edge Functions es escrito por el proxy y no es falsificable por el cliente.
- No existía un límite global independiente de IP.
- `start_trial()` no comprobaba `email_confirmed_at`.

### Estado actual
- `signup-instant` ya NO fuerza `email_confirm: true`. Delega en la configuración del proyecto.
- Se añadió un límite global de 50 registros/hora independiente de IP.
- `start_trial()` comprueba `email_confirmed_at IS NOT NULL` antes de crear el trial.

### Pendiente (configuración manual)
1. **Activar "Confirm email"** en Supabase Auth → Providers → Email.
2. **Configurar SMTP** propio (o usar el SMTP por defecto de Supabase, que tiene límites de envío).
3. **Activar "Prevent Leaked Passwords"** en Supabase Auth.
4. **Evaluar CAPTCHA nativo de Supabase** (hCaptcha/Turnstile) — no requiere servicio externo de pago pero sí configuración en consola.

Hasta que se completen los pasos 1-2, todos los correos siguen autoconfirmados y la comprobación en `start_trial` no tiene efecto práctico.

---

## 3. Cambios realizados

### Migración `a23_ai_usage_limits_and_trial_hardening`

1. **Nueva tabla `ai_usage_monthly`**: contadores por usuario y mes UTC para weekly-content y business-improvement. PK compuesta (user_id, period_start). RLS habilitado con lectura propia y escritura denegada al cliente.

2. **Nuevo RPC `reserve_ai_usage(p_user_id, p_function, p_monthly_per_fn, p_monthly_global)`**: reserva atómica con `SELECT ... FOR UPDATE`. Retorna `reserved`, `fn_limit` o `global_limit`. SECURITY DEFINER, solo service_role.

3. **Nuevo RPC `release_ai_usage(p_user_id, p_function)`**: decrementa el contador con `GREATEST(n-1, 0)` al liberar una reserva fallida. SECURITY DEFINER, solo service_role.

4. **`start_trial()` modificado**: comprueba `email_confirmed_at IS NOT NULL` antes de insertar en `user_trials`. Retorna `{state: 'email_not_verified', trial_created: false}` si no está verificado.

5. **`reserve_weekly_content()` modificado**: llama a `reserve_ai_usage` antes de la reserva del draft. Libera la reserva de IA si el draft no puede reservarse.

6. **`reserve_business_improvement()` modificado**: ídem. Mantiene el contador legacy `business_improvement_usage` para compatibilidad.

7. **Trigger `enforce_max_businesses_per_user`**: máximo 5 negocios por usuario. Previene la multiplicación de cuotas por negocio.

### Edge functions modificadas

- **`signup-instant`**: eliminado `email_confirm: true`, añadido límite global 50/h.
- **`weekly-content`**: handler acepta `fn_limit`/`global_limit` del reserve; `releaseAiUsage` en paths de error.
- **`business-improvement`**: ídem.

### Frontend

- **`BillingProvider.tsx`**: maneja `email_not_verified` del RPC `start_trial`.
- **`BillingNotices.tsx`**: muestra «Confirma tu correo para activar tu prueba gratuita».
- **`repository.ts`**: intercepta `email_not_verified` sin romper `parseBillingStatus`.

---

## 4. Situación del trial

| Control | Estado |
|---|---|
| Duración fija 7 días (CHECK constraint) | OK — existente |
| Uno por usuario (PK user_id) | OK — existente |
| Concurrencia (ON CONFLICT DO NOTHING) | OK — existente |
| No reiniciable con otro negocio | OK — clave es user_id |
| No manipulable desde cliente | OK — ends_at = now() + 7 days en servidor |
| Premium no falsificable desde navegador | OK — billing_state_for() lee tablas server-side |
| Email verificado antes de trial | PREPARADO — activo cuando se desactive autoconfirm |

---

## 5. Límites existentes y nuevos

| Capa | Límite | Origen |
|---|---|---|
| Rate limit por función Premium | 30 req/hora | Existente (authorize_premium_request) |
| weekly-content: generaciones por semana | 3 | Existente |
| weekly-content: intentos por semana | 6 | Existente |
| weekly-content: solicitudes mensuales/usuario | **40 (NUEVO)** | reserve_ai_usage |
| business-improvement: generaciones por draft | 3 | Existente |
| business-improvement: intentos por draft | 6 | Existente |
| business-improvement: drafts por negocio | 16 | Existente |
| business-improvement: solicitudes mensuales/usuario | 40 | Existente + reforzado |
| **Global combinado mensual/usuario** | **80 (NUEVO)** | reserve_ai_usage |
| Negocios por usuario | **5 (NUEVO)** | enforce_max_businesses_per_user |
| Registro: por IP | 10/hora | Existente |
| Registro: por email | 5/hora | Existente |
| Registro: global | **50/hora (NUEVO)** | signup-instant |

---

## 6. Cálculos de coste

**Supuesto documentado:** gpt-4o-mini a 0,15 $/M tokens entrada, 0,60 $/M tokens salida (precios OpenAI octubre 2026).

| Escenario | Cálculo | Coste máximo |
|---|---|---|
| Una generación weekly-content | ~1500 tok in × 0,15$/M + 350 tok out × 0,60$/M | ~0,00044 $ |
| Una generación business-improvement | ~1500 tok in × 0,15$/M + 500 tok out × 0,60$/M | ~0,00053 $ |
| Usuario Premium normal (1 negocio, uso medio) | ~20 gen/mes | ~0,01 $/mes |
| **Usuario Premium máximo (5 negocios, 80 gen/mes)** | 80 × 0,00053 $ | **~0,042 $/mes** |
| **Usuario trial máximo (7 días)** | ~20 gen × 0,00053 $ | **~0,011 $** |
| Peor caso pre-A2.3 (sin límite global) | ilimitados negocios × 3 gen/semana | Hasta ~20 $/mes |
| **Peor caso post-A2.3** | 80 gen/mes × 0,00053 $ | **0,042 $/mes** |

**Impacto en el margen de 9,99 €:** el coste máximo de IA por usuario Premium es ~0,042 $/mes, es decir ~0,4 % del precio. Margen ampliamente positivo.

---

## 7. Riesgos de abuso residuales

| Riesgo | Mitigación actual | Residuo |
|---|---|---|
| Cuentas múltiples con correos distintos | Límite global 50 reg/h, 5 negocios/usuario, 80 gen/mes | **No eliminable sin verificación de identidad.** Documentado expresamente. |
| Autoconfirm ON | `start_trial` preparado para bloquear | Pendiente de configuración SMTP + "Confirm email" |
| IP spoofing en signup | `x-forwarded-for` lo escribe el proxy Supabase, no el cliente | Bajo — el límite global 50/h protege incluso si IP no fiable |
| Abuse de rate limits | Ventana fija (no sliding window) | Aceptable; burst al inicio de ventana pero acotado |
| CAPTCHA | Supabase soporta hCaptcha/Turnstile nativamente | Pendiente de configuración manual |
| Leaked passwords | Supabase tiene "Prevent Leaked Passwords" | Pendiente de activación en consola |

---

## 8. Seguridad y RLS

### Tabla `ai_usage_monthly`
- RLS habilitado.
- SELECT: solo filas propias (`auth.uid() = user_id`).
- INSERT/UPDATE/DELETE: denegados al cliente (WITH CHECK false / USING false).
- Escritura exclusivamente vía RPCs SECURITY DEFINER restringidos a service_role.

### RPCs nuevos
- `reserve_ai_usage`, `release_ai_usage`: SECURITY DEFINER, search_path fijo, EXECUTE revocado a PUBLIC/anon/authenticated.
- `enforce_max_businesses_per_user`: trigger function, EXECUTE revocado.

### RPCs existentes (sin cambio)
- `billing_status`, `current_user_has_premium`, `start_trial`: SECURITY DEFINER, accesibles por authenticated. Advisors los reportan (diseño intencionado).

### Advisors: 8 (sin cambio respecto a A2.2)
- 2 × rls_enabled_no_policy (edge_rate_limits, stripe_customer_repairs) — tablas internas sin acceso cliente.
- 2 × function_search_path_mutable (get_funnel_stats) — función legacy.
- 3 × authenticated_security_definer_function_executable (billing_status, current_user_has_premium, start_trial) — diseño intencionado.
- 1 × auth_leaked_password_protection — pendiente de activación manual.

---

## 9. Tests

| # | Test | Resultado |
|---|---|---|
| T1 | Registro válido: no fuerza email_confirm | PASS |
| T2 | Registro con email sin verificar: delega en proyecto | PASS |
| T3 | Verificación de correo: start_trial comprueba email_confirmed_at | PASS |
| T4 | Activación del trial tras verificar | PASS |
| T5 | Trial no disponible antes de verificar | PASS |
| T6 | Doble solicitud concurrente de trial | PASS |
| T7 | Intento de reiniciar trial con otro negocio | PASS |
| T8 | Intento de manipular duración | PASS |
| T9 | Manipulación de cabeceras IP | PASS |
| T10 | Límite de registros concurrentes | PASS |
| T11 | Acceso a IA con trial válido | PASS |
| T12 | Acceso a IA con trial caducado | PASS |
| T13 | Acceso a IA con Premium válido | PASS |
| T14 | Límite específico v0.7.1 | PASS |
| T15 | Límite específico v0.7.2 | PASS |
| T16 | Límite global entre generadores | PASS |
| T17 | Concurrencia entre generadores | PASS |
| T18 | Reservas caducadas | PASS |
| T19 | Intentos fallidos | PASS |
| T20 | Reintentos del proveedor | PASS |
| T21 | Ausencia de duplicidad de consumo | PASS |
| T22 | Separación entre usuarios | PASS |
| T23 | Separación entre negocios | PASS |
| T24 | Rechazo de manipulación de costes | PASS |
| T25 | Ausencia de regresiones en Stripe | PASS |
| T26 | Ausencia de regresiones en Google | PASS |
| T27 | Ausencia de regresiones en A2.1 | PASS |
| T28 | Ausencia de regresiones en A2.2 | PASS |
| T29 | Ausencia de regresiones en v0.7.3 | PASS |
| T30 | Ausencia de nuevas llamadas a IA | PASS |

---

## 10. Comparación con A2.2

| Métrica | A2.2 (baseline) | A2.3 | Δ |
|---|---|---|---|
| Tests Vitest | 486 | 521 | +35 |
| Tests fallidos | 0 | 0 | 0 |
| Errores TypeScript | 0* | 0 | 0 |
| Errores ESLint | 23 | 23 | 0 |
| Warnings ESLint | 7 | 7 | 0 |
| Advisors seguridad | 8 | 8 | 0 |
| Build | OK | OK | — |
| Funciones retiradas (410) | 14 | 14 | 0 |
| Funciones desplegadas | 3 (A2.2) | 3 (A2.3) | — |

*A2.2 reportó 20 errores TS que luego se resolvieron a 0 al final del fix.

---

## 11. Configuración manual pendiente

Los siguientes pasos deben realizarse en la consola de Bolt/Supabase antes de considerar F-03 completamente resuelto:

1. **Auth → Providers → Email → "Confirm email"**: activar.
2. **Auth → SMTP**: configurar un proveedor de correo (Resend, SendGrid, Postmark, etc.) o usar el SMTP por defecto de Supabase.
3. **Auth → "Prevent Leaked Passwords"**: activar.
4. **Auth → CAPTCHA**: evaluar hCaptcha o Cloudflare Turnstile (soporte nativo de Supabase, sin coste de servicio externo).

Una vez completados los pasos 1-2:
- Las cuentas nuevas recibirán un correo de verificación.
- `start_trial()` bloqueará la activación del trial hasta que el correo esté verificado.
- El flujo de login tras registro fallará hasta la verificación (el frontend ya muestra el mensaje correspondiente).

---

## 12. ZIP limpio

Archivo: `localseohub-fixA23.zip`

Contenido:
- `supabase/migrations/20261010162601_a23_ai_usage_limits_and_trial_hardening.sql`
- `supabase/functions/signup-instant/index.ts`
- `supabase/functions/weekly-content/handler.ts`
- `supabase/functions/weekly-content/index.ts`
- `supabase/functions/business-improvement/handler.ts`
- `supabase/functions/business-improvement/index.ts`
- `src/features/billing/repository.ts`
- `src/features/billing/BillingProvider.tsx`
- `src/features/billing/BillingNotices.tsx`
- `src/features/billing/__tests__/a23CostControl.test.ts`
- `src/features/improvement/__tests__/improvement.test.ts` (mock actualizado)
- `src/features/improvement/__tests__/fix0721.test.ts` (expectativa actualizada)
- `src/features/weekly-content/__tests__/weeklyContent.test.ts` (mock actualizado)
- `auditoria-a2/A2_3_INFORME.md`

---

**FIN DE A2.3. No se inicia A2.4. Esperando auditoría.**
