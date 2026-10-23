# LocalSEOHub — A2.8.1 Trust & Conversion Cleanup

Scope: a small, targeted pre-launch fix pass that follows the A2.8 audit (CONDITIONAL GO). This is not the product launch decision; F-03 remains open.

---

## A. Executive summary

A28-005 is **CLOSED**. The public landing no longer shows any testimonial, person photo, quote, testimonial result figure, the "+38% / +24% / +17%" statistics, or the "Lo que cambia en 30 días" / "What changes in 30 days" section. Both sections were removed outright and **nothing was put in their place**.

Other changes:
- Residual outcome promises were rewritten as capability language.
- The Radar and Maps demos no longer imply that real competitor or review data was fetched.
- The Tools Hub now states truthfully that all seven tools are Premium (trial included). Access logic is unchanged.
- Today's Google error state (A28-021) and analytics (A28-013) are documented only.
- All A2.8 fixes were re-verified.

Regression is green: 0 new TypeScript problems and 0 new ESLint problems (both counts went down by 1).

Result: **PASS WITH FINDINGS**.

## B. Baseline (start of A2.8.1)

| Check | Baseline | Final |
|---|---|---|
| vitest | 44 files / 1599 passed | 45 files / 1635 passed |
| TypeScript (`tsc -p tsconfig.app.json`) | 20 errors (pre-existing) | 19 |
| ESLint | 30 problems (23 errors, 7 warnings) | 29 (22 errors, 7 warnings) |
| Build | OK | OK |
| Migrations | 42 | 42 |
| Routes (`<Route path=`) | 27 | 27 |

## C. A28-005 closure

**Removed from `src/components/LandingPage.tsx`:**
- the `METRICS`, `MCLS` and `testimonials` data blocks;
- the whole "RESULTADOS" section, including `MetricCounter`;
- the whole "TESTIMONIOS" section (stars, metric chips, pexels photos, names);
- the `HCARD` constant;
- the dead `HeroDashboard`, which held fake +23% / +14% / +17% figures.

**Removed from `src/lib/i18n.tsx`, in ES and EN:**
- testimonial keys `t1_…t4_*` and `landing_t1–3_*`;
- `landing_testimonials_*`, `landing_metric_calls/visits/routes(_sub)`, `lp_results_*` and `lp_trust_*`;
- dormant fabricated-proof keys: `landing_rating` ("4.9/5"), `landing_social_proof` ("+2.400 negocios locales…"), `landing_bottom_*` (including "Únete a +2.400 negocios…"), and `landing_f2_*` ("Más clientes, menos esfuerzo").

The landing now goes straight from the demo section to pricing.

A28-005 unsupported social proof was removed from the public landing.
No fabricated testimonial replaced the removed testimonials.
No fabricated performance statistic replaced the removed statistics.

## D. Testimonials — social proof table

| LOCATION | PREVIOUS CLAIM | EVIDENCE AVAILABLE? | ACTION | FINAL STATE | TRUTHFUL? |
|---|---|---|---|---|---|
| Landing · Testimonials t1 | Named owner, photo, quote, "+3 llamadas en 48h" | No | Section removed | Absent | Yes |
| Landing · Testimonials t2 | Named owner, photo, "Del puesto 8 al 2 en Maps" | No | Section removed | Absent | Yes |
| Landing · Testimonials t3 | Named owner, photo, "4 de cada 5 respuestas de ChatGPT" | No | Section removed | Absent | Yes |
| Landing · Testimonials t4 | Named owner, photo, quote, result chip | No | Section removed | Absent | Yes |
| Landing · Testimonials header | "No lo decimos nosotros" / "We don't say it" | No | Removed | Absent | Yes |
| Landing · Results | "+38% llamadas / +24% visitas / +17% rutas" | No | Section removed | Absent | Yes |
| Landing · Results header | "Lo que cambia en 30 días" / "What changes in 30 days" | No | Removed | Absent | Yes |
| Landing · HeroDashboard (dead code) | +23% / +14% / +17% | No | Deleted | Absent | Yes |
| i18n (unrendered) | "4.9/5", "+2.400 negocios locales confían", "Únete a +2.400 negocios" | No | Keys deleted | Absent | Yes |
| i18n (unrendered) | `landing_t1–3` such as "+38% reservas directas en un mes" | No | Keys deleted | Absent | Yes |

## E. Performance statistics

Every percentage or "result" figure presented as customer evidence is gone. This is enforced by tests 2 and 4:
- no `+38%`, `+24%`, `+23%`, `+17%` or `+14%` in the landing;
- no `4.9/5`, `+2.400` or `+2,400` anywhere in i18n.

Figures that remain are clearly labelled demo values, such as "Puntuación de ejemplo".

## F. Residual outcome claims

| Claim (ES / EN) | Class | Action |
|---|---|---|
| `lp_howto_more` "Más clientes." / "More customers." | Outcome promise | → "Analiza. Prioriza. Mejora." / "Analyze. Prioritize. Improve." |
| `landing_step_2_title` "La IA lo optimiza todo" / "AI optimizes everything" | Overclaim | → "Recibe qué mejorar" / "See what to improve" |
| `landing_step_3_title` "Publica y consigue clientes" | Outcome promise | → "Aplica los cambios" / "Apply the changes" |
| "No lo decimos nosotros" / "We don't say it" | Social proof framing | Removed with the section |
| "Tu competencia ya usa IA. ¿Y tú?" / "Your competitors are already using AI" | Fear claim (unrendered) | Key deleted |
| `landing_howto_s2_title` "La IA lo optimiza todo" (unrendered) | Overclaim | Key deleted |
| "¿Listo para recibir más llamadas?" | Outcome promise | Already replaced in A2.8: "¿Listo para mejorar la presencia online de tu negocio?" |
| "Sin sorpresas. Sin letra pequeña." | Marketing tone, truthful | Kept |
| Advisor demo: "es habitual que los clientes potenciales acaben eligiendo a competidores mejor posicionados" | Soft generic statement | Kept; documented as A281-008 |

**Dormant claim-bearing keys that are never rendered** were documented, not deleted, to keep scope tight (A281-007):
- `landing_hero_title`, `landing_hero_title2`;
- `landing_trust_2`;
- `onb_metric_pot_sub`;
- the `mc_act*` keys.

## G. Radar demo truthfulness

- Competitor rows read "Competidor de ejemplo 1–3". They are no longer blurred, so they don't look like hidden real names.
- The header reads "vs. 3 competidores de ejemplo en {city} · en la herramienta indicas tú sus webs".
- Review counts are gone (removed in A2.8).
- Locked teasers describe only what the tool does: public website signals and improvement priorities.
- The score is labelled "Ejemplo".

**Maps demo:** a locked "Competidores cercanos" block with blurred "Competidor #1 en tu zona" and "+47 / +29 pts" was removed. The Maps tool does not compare nearby competitors, so the block implied both a capability and data the product does not have.

Nothing implies that real review or competitor data was fetched.

## H. Tools Hub Premium clarity (A28-026)

**Actual entitlement**
- `hasPremium` = `has_premium && state ∈ {TRIAL_ACTIVE, SUBSCRIPTION_ACTIVE, SUBSCRIPTION_CANCELING}`.
- Radar, Twin, GEO, Maps and Voice render a lock card linking to `/facturacion` when `!hasPremium`.
- SEO and Advisor are gated server-side by `authorize_premium_request` and return `premium_required` (403).

**Change made**
- Every card now shows a "Premium" pill next to "Disponible", using the existing pill style.
- The hub notice adds "Todas las herramientas están incluidas en Premium y en el periodo de prueba." / "All tools are included in Premium and in the trial period."
- No access, pricing or billing logic changed. The hub still has no billing code.

| TOOL | ACTUAL ACCESS MODEL | TOOLS HUB LABEL | CONSISTENT? | CHANGE MADE? | FINAL STATE |
|---|---|---|---|---|---|
| SEO Generator | Premium/trial · server `premium_required` | Premium · Disponible | Yes | Badge added | Truthful |
| Maps Scanner | Premium/trial · client lock card | Premium · Disponible | Yes | Badge added | Truthful |
| Digital Twin | Premium/trial · client lock card | Premium · Disponible | Yes | Badge added | Truthful |
| Competitor Radar | Premium/trial · client lock + server entitlement | Premium · Disponible | Yes | Badge added | Truthful |
| GEO Audit | Premium/trial · client lock card | Premium · Disponible | Yes | Badge added | Truthful |
| Business Advisor | Premium/trial · server `premium_required` | Premium · Disponible | Yes | Badge added | Truthful |
| Voice Simulator | Premium/trial · client lock + server entitlement | Premium · Disponible | Yes | Badge added | Truthful |

Before this change every card said only "Disponible", so the hub was not consistent with the access model.

## I. Today / Google error-state review (A28-021)

**Finding:** `TodayPage.tsx` (lines ~103, 119, 125–130) treats a GBP source in `error` status, and a failed sources load, the same as "not connected". Today is frozen, so this is documented only.

**Smallest future fix:**
- add a third branch for `status === 'error'`: "Hay un problema con la conexión de Google · Reconectar", linking to Fuentes;
- show a neutral "No se pudieron cargar tus fuentes" with a retry when the sources query fails, instead of "Conecta Google".

Neither needs any data or architecture change.

## J. Analytics / payment tracking specification (A28-013, spec only)

| EVENT | TRIGGER | CLIENT/SERVER | AUTHORITATIVE SOURCE | CURRENT STATE | REQUIRED BEFORE PAID TRAFFIC? | RECOMMENDED NEXT ACTION |
|---|---|---|---|---|---|---|
| PageView | Landing / app route load | Client (Pixel) | Browser | Implemented (`pixel.ts`) | Yes | Keep; add consent gating if required by cookie policy |
| CompleteRegistration | Account created (email **and** Google) | Client + Server (CAPI) | `auth.users` insert / `onAuthStateChange` SIGNED_IN with new user | Email path only; Google signups not measured; `register_success` fires on timing guess | Yes | Fire once per new user id for both providers; mirror server-side with `event_id` dedup |
| BusinessConfigured / Activation | First business saved with name, city, category | Client (app event) | `businesses` row insert | v2 analytics activation events exist; not sent to Pixel | Recommended | Map existing activation event to a custom Pixel event |
| FirstUsefulResult | First successful tool result or first mission completed | Client (app event) | Tool success response / `actions` row resolved | `first-value` analytics exist internally; not sent to Pixel | Recommended | Forward internal first-value event as a custom event |
| InitiateCheckout | User clicks to start checkout and session is created | Server-confirmed | `stripe-billing` `checkout_started` (`handler.ts:124`) | Server event only; no Pixel event | Yes | Fire Pixel InitiateCheckout after the checkout session is created, plus server CAPI with the same `event_id` |
| Purchase | Subscription becomes paid / active | **Server** | Stripe webhook `checkout.session.completed` / `invoice.paid` → `checkout_completed`; billing state `SUBSCRIPTION_ACTIVE` | Not tracked in Pixel | Yes | Send from the webhook via Conversions API with value 9.99 EUR. **Never** from `?checkout=success` |
| StartTrial | Trial activated | Server | Billing state → `TRIAL_ACTIVE` | Not tracked in Pixel | Recommended | Server event on state transition |

Also flagged: A28-015, possible PII in analytics payloads. Review it before enabling CAPI.

## K. SEO limit verification

`seo-generator/copy.ts`:
- ES: "Has alcanzado el límite mensual de generaciones SEO."
- EN: "You've reached this month's SEO generation limit."

There is no "20" in the copy. The cap stays `WHEN 'seo-generator' THEN 18` (tests 11 and 16).

## L. Signup gate verification

Both gate buttons call `onSignupClick(businessName)` (test 12). No gate button calls login.

The email pre-fill is still lost because `App.tsx` is frozen; this is A281-011.

## M. Google callback sanitization

`GBPCallbackPage.tsx` renders only `CONNECT_FAILED_MSG`. The `error` query parameter and `result.error` are logged with `console.warn` and never rendered (test 13).

## N. Auth error escape

The session-check error screen offers "Reintentar" and "Cerrar sesión". The sign-out button runs `supabase.auth.signOut()` and then `window.location.assign('/')` (test 14).

## O. Product architecture preservation

The SHA-256 hashes of all 18 frozen files are unchanged (test 15): the engines, Action Layer, Today Intelligence, TodayPage, TodaysMissions, the mission engine, `App.tsx` and `gbp-oauth-start`.

Today remains the focus layer.
Missions remain the execution layer.
Plan remains the roadmap layer.
The A2.7.1 Action Layer remains active.
The A2.7.2 Today Intelligence layer remains active.
The A2.7.3 roadmap layer remains active.
The LocalSEOHub visual identity was preserved.
No LocalSEOHub interface redesign was performed.

## P. Tool truthfulness

The landing demos now say less than before, never more.

No Google Maps ranking claim was introduced.
No AI assistant ranking claim was introduced.
No competitor traffic, sales, customer or ranking claim was introduced.
No review management capability was introduced.
No new AI capability was introduced.
All seven LocalSEOHub tools remain available.

## Q. Billing preservation

No Stripe configuration was modified.
No pricing was modified.
No billing or Premium entitlement architecture was modified.

The Tools Hub change is wording only, and it matches the existing gates.

## R. Auth / F-03 preservation

No Google OAuth configuration was modified.
The A2.5 GBP verification trust fix remains active.
No new GBP OAuth scopes were introduced.
No SMTP configuration was modified.
Email confirmation was not enabled in A2.8.1.
No authentication architecture was changed.
F-03 remains open and separately controlled.

## S. AI limits

The caps are unchanged (test 16): weekly-content 22, business-improvement 18, seo-generator 18, business-advisor 12, voice-simulator 10.

AI usage global limit remains 80.
No AI usage counters were reset.

## T. Legacy retirement

All 14 legacy functions still return `status: 410` (test 17).

All fourteen retired legacy functions remain retired.

## U. Database / routes

Migrations: 42. Routes: 27 (test 18). No data was touched.

No new database migration was introduced.
No new route was introduced.
No businesses were deleted.
No connected sources were deleted.
No mission history was deleted.

## V. Regression

In this order:

1. **vitest:** 45 files, **1635 passed**, 0 failed. The new file `src/components/__tests__/a281TrustCleanup.test.ts` adds 36 tests.
2. **tsc:** **19** errors, all pre-existing (baseline 20). One was resolved by removing dead `HeroDashboard` code; none are new.
3. **eslint:** **29** problems (22 errors, 7 warnings), all pre-existing (baseline 30). None are new.
4. **build:** OK.

## W. Findings

| ID | SEVERITY | AREA | DESCRIPTION | EVIDENCE | CUSTOMER IMPACT | FIX | TEST | STATUS | LAUNCH CLASSIFICATION |
|---|---|---|---|---|---|---|---|---|---|
| A281-001 | P1 | Landing | Unsupported testimonials and performance statistics (A28-005) | Former Results/Testimonials sections | Misleading proof; ad-policy risk | Sections removed, no replacement | 1–4 | FIXED | Was blocker → closed |
| A281-002 | P2 | Landing copy | Outcome promises ("Más clientes", "Publica y consigue clientes", "La IA lo optimiza todo") | i18n `lp_howto_more`, `landing_step_*` | Overpromise | Capability wording | 5 | FIXED | — |
| A281-003 | P2 | Landing · Maps demo | Locked "Competidores cercanos" block with point gaps | MapsResult | Implied capability and data Maps lacks | Block removed | 7 | FIXED | — |
| A281-004 | P2 | Landing · Radar demo | Blurred "Competidor #n en {city}" looked like hidden real names | RadarResult | Implied fetched data | "Competidor de ejemplo n", unblurred | 6 | FIXED | — |
| A281-005 | P3 | i18n (dormant) | Fabricated "4.9/5", "+2.400 negocios", fear CTA in unused keys | i18n | None now; reintroduction risk | Keys deleted | 4, 5 | FIXED | — |
| A281-006 | P2 | Tools Hub | Cards said only "Disponible" although all tools need Premium/trial (A28-026) | ToolsPage | Surprise lock after click | Premium pill + trial note | 8–10 | FIXED | — |
| A281-007 | P3 | i18n (dormant) | Unrendered outcome keys remain (`landing_hero_title*`, `landing_trust_2`, `onb_metric_pot_sub`, `mc_act*`) | i18n | None (not rendered) | Delete in a later copy pass | — | OPEN | Not blocking |
| A281-008 | P4 | Landing copy | Soft Advisor demo line; "7 dias gratis" missing accent | LandingPage | Minor | Copy pass | — | OPEN | Not blocking |
| A281-009 | P2 | Today | GBP error and load failure shown as "not connected" (A28-021) | TodayPage.tsx:103–130 (frozen) | Wrong next step | See section I | — | OPEN (documented) | Recommended before paid traffic |
| A281-010 | P1 | Analytics | No Pixel InitiateCheckout/Purchase; Google signups unmeasured; no CAPI (A28-013) | `pixel.ts`, `stripe-billing` | Paid traffic cannot be optimised or attributed | Implement section J | — | OPEN (spec only) | **Required before paid traffic** |
| A281-011 | P3 | Signup gate | Email typed in gate is not pre-filled on signup | App.tsx (frozen) | One retype | Pass email through signup route when App.tsx unfreezes | 12 (partial) | OPEN | Not blocking |

## X. Remaining pre-launch items (before paid traffic)

1. **F-03 / A28-001:** SMTP and email confirmation. Separately controlled.
2. **A28-013 / A281-010:** implement the analytics spec in section J, at minimum:
   - CompleteRegistration for both providers;
   - InitiateCheckout;
   - server-side Purchase from the Stripe webhook.
3. **A28-031:** one live end-to-end checkout test: trial → paid → webhook → `SUBSCRIPTION_ACTIVE`.

Recommended:
- A281-009 / A28-021 (Today Google error state);
- A28-018 / A28-025 (accessibility);
- A28-015 (PII in analytics payloads).

## Y. Launch-readiness impact

The trust blocker A28-005 is closed. The public landing, demos and Tools Hub now describe only what the product actually does.

Paid traffic is still gated by F-03, analytics (A28-013) and a live checkout test (A28-031).

**Decision: PASS WITH FINDINGS** (not the product launch decision; F-03 remains open).
