# A2.8 — LocalSEOHub Pre-Launch Product & Conversion Audit

Status: DELIVERED FOR EXTERNAL REVIEW. Awaiting explicit authorisation. F-03, SMTP, A3, campaigns, review management and recurring monitoring were NOT started.

---

## A. Executive summary

A2.8 audited the full customer journey (landing → demo → signup/login → first login → business setup → Today → Missions → Plan → 7 tools → Sources → Reports → Premium → checkout → return). The core product (Today/Missions/Plan, the seven tools, Sources, Reports, billing) is functional, truthful in-app and well-gated. The material problems were concentrated on the **public landing page**, which still carried pre-pivot marketing: demos presented as real analyses, fabricated outcomes in demo output, claims of capabilities the product does not have (ChatGPT ranking measurement, Siri/Alexa simulation, Etsy/Shopify CSV export, multi-client agency use, 24/7 advisor), and a post-demo gate that opened **login** instead of **signup** and dropped the business name.

Those P1 copy and routing defects were auto-fixed (copy-only and handler-only, no redesign). Two items cannot be closed inside A2.8's mandate:

1. **F-03 / A28-001 (P0, pre-existing):** direct signup creates pre-confirmed accounts for any email address without proof of ownership.
2. **A28-005 (P1):** landing testimonials (named people, stock photos, specific results) and the "+38% / +24% / +17% in 30 days" statistics have no evidence in the repository. Removing a section requires approval; keeping them requires evidence.

Decision: **CONDITIONAL GO** (see AK).

## B. Baseline

| Item | Before A2.8 | After A2.8 |
|---|---|---|
| Test files | 43 | 44 (+`src/components/__tests__/a28Prelaunch.test.ts`) |
| Tests | 1574 | 1599 (+25) |
| TypeScript errors (`tsconfig.app.json`) | 20 (pre-existing, unused declarations) | 20 (unchanged) |
| ESLint problems | 30 | 30 (unchanged) |
| Build | passes | passes |
| Migrations | 42 | 42 |
| Routes (with `path=`) | 27 (+1 layout wrapper) | 27 (+1 layout wrapper), `App.tsx` SHA-256 unchanged |
| Edge functions returning HTTP 410 | 14 legacy + 2 retired Stripe (pre-existing) | unchanged |
| AI caps | weekly 22 / improvement 18 / SEO 18 / advisor 12 / voice 10 / global 80 | unchanged |

Files changed in A2.8 (all copy, routing-handler or error-text level):
- `src/components/LandingPage.tsx` — gate → signup, demo honesty, fabricated demo claims removed.
- `src/lib/i18n.tsx` — demo/tool showcase/pricing/FAQ/CTA copy (ES + EN).
- `src/features/seo-generator/copy.ts` — limit message no longer states "20".
- `src/app-v2/auth.tsx` — session-check error screen gains "Cerrar sesión"; accents fixed.
- `src/features/reality-engine/GBPCallbackPage.tsx` — error query parameter and raw sync errors no longer rendered.
- `src/components/__tests__/a28Prelaunch.test.ts` — new focused tests.

## C. Customer journey

| STEP | PAGE | USER GOAL | EXPECTED RESULT | ACTUAL RESULT | FRICTION | SEVERITY | LAUNCH CLASSIFICATION | RECOMMENDED ACTION |
|---|---|---|---|---|---|---|---|---|
| 1 Landing | `/` | Understand value | Clear local-business promise | Hero "Descubre qué puede mejorar hoy tu negocio" clear; lower sections had pre-pivot claims | Unsupported claims (fixed); testimonials/stats unverified | P1 | LAUNCH BLOCKER (A28-005 only) | Owner provides evidence or approves removal |
| 2 Demo | `/` tool trial | Try a tool | Honest example | Canned example was presented as a real scan; now labelled as example | Fixed | P1 → fixed | — | None |
| 3 Signup | Login modal (signup mode) | Create account | Account + business name carried | Hero CTA OK; post-demo gate opened login and lost name → now signup with name | Gate no longer pre-fills typed email (App.tsx frozen) | P1 → fixed; residual P3 | POST-LAUNCH ACCEPTABLE | Pass email through in a later approved App.tsx change |
| 4 Login | Login modal / `/login` | Return | Session, `next` honoured | Works; open-redirect guarded by `returnTo.ts` | None | — | — | None |
| 5 First login | `/empezar` guard | Land in onboarding | Onboarding or Today | Works; error screen had only "Reintentar" → sign-out added | Fixed | P2 → fixed | — | None |
| 6 Business setup | `/empezar`, `/negocio` | Describe business | Profile saved | Works; one business per account | None | — | — | None |
| 7 Today | `/hoy` | Know what to do now | ≤3 priorities | Works; GBP 'error' and failed source load show as "not connected" (frozen file) | Misleading state on failure | P2 | PRE-LAUNCH RECOMMENDED | Fix in an approved TodayPage change |
| 8 Mission start | `/misiones`, action detail | Execute a task | Action detail, completion | Works; real actions only | Overlap with Today priorities | P3 | FUTURE PRODUCT DEVELOPMENT | Product decision |
| 9 Plan | `/plan` | See roadmap | Roadmap card | Works (A2.7.3) | Overlap with missions (A273-001) | P3 | FUTURE PRODUCT DEVELOPMENT | — |
| 10 SEO Generator | tool | Generate copy | 4 formats | Works; limit message said "20" (cap 18) → fixed | "Ver planes" with single plan | P3 | POST-LAUNCH ACCEPTABLE | Copy tweak |
| 11 Maps Profile Scanner | tool | Profile completeness | Score + gaps | Works; disclaimer "No representa tu posición en Google Maps" | Premium lock | — | — | None |
| 12 AI Digital Twin | tool | See what is known | Knowledge map | Works; "lo que LocalSEOHub conoce" | — | — | — | None |
| 13 Competitor Radar | tool | Compare with chosen URLs | Public-signal comparison | Works; SSRF-guarded; "No medimos tráfico, ventas…" | URL required | — | — | None |
| 14 GEO Audit | tool | AI readiness | Indicative score | Works; disclaimers present | — | — | — | None |
| 15 AI Business Advisor | tool | Ask advice | Grounded answer | Works; cannot name Voice Simulator (A28-029) | Minor | INFO | FUTURE PRODUCT DEVELOPMENT | — |
| 16 Voice Simulator | tool | Practise call | Written roleplay | Works; text-based | — | — | — | None |
| 17 Sources | `/fuentes` | Connect Google | GBP connected | Works; callback rendered `?error=` text raw → fixed | Fixed | P3 → fixed | — | None |
| 18 Reports | `/informes` | Weekly view | Honest metrics | Shows "No medido" when absent | — | — | — | None |
| 19 Billing | `/facturacion` | See plan | 9,99 €/mes, trial status | Works; server-side entitlement | Tools hub shows "Disponible" on locked tools | P2 | PRE-LAUNCH RECOMMENDED | Premium badge (needs approval) |
| 20 Checkout | Stripe Checkout | Pay | Session created server-side | Works; amount verified 999; return URLs from `SITE_URL` | Production E2E not run | INFO | PRE-LAUNCH RECOMMENDED | One live test purchase |
| 21 Return from checkout | `/facturacion?checkout=success` | See Premium active | Synced status | Triggers server sync + refresh; webhook idempotent | No Purchase pixel event | P2 | PRE-LAUNCH RECOMMENDED (if paid ads) | A3 analytics |

## D. Landing / value proposition

Hero is clear and truthful. Below the fold, pre-pivot e-commerce and "agency" positioning remained. Fixed: tool showcase (`ts_1…ts_7`), pricing features (`lp_pricing_f3…f5`), "how it works" steps (no Etsy/Shopify/CSV), FAQ 4 (now: one business per account — verified against `businessRepository.ts`, which loads by `user_id` with `maybeSingle`), FAQ 5 (no "never the same text" guarantee), final CTA (no "más llamadas" outcome promise, no "Tu competencia ya usa IA" pressure badge). Not changed (needs approval or evidence): testimonials, "+38/+24/+17%" block, "Más clientes", "No lo decimos nosotros" title (A28-005, A28-012).

## E. Landing demos

All demos are canned templates driven by timers, with no network calls. Fixed: scan messages now say "Preparando un ejemplo de…"; result title says "Así sería…"; SEO example no longer contains "Resultados Garantizados", "más de 10 años", "el mejor servicio"; Maps example no longer claims "pierdes el 68% de búsquedas nocturnas"; Twin signals are neutral; Radar labelled "competidores de ejemplo", fictitious review counts removed, locked items no longer promise review strategy; Advisor example no longer promises "10 reseñas con plantilla"; gate "opening" text no longer says "Abriendo tu informe completo".

## F. Signup / login

- Hero CTA opens signup and stores the business name. Post-demo gate (email and Google buttons) now also opens signup with the business name (previously login mode, name lost).
- Residual: the email typed in the gate is not pre-filled (requires frozen `App.tsx`).
- Signup uses `signup-instant` (pre-confirmed accounts): see AF.
- Login `next` parameter guarded against off-site redirects.
- Password reset code ready; delivery depends on SMTP (F-03).

## G. First-login experience

Guards route correctly (unauthenticated → login/signup; incomplete onboarding → `/empezar`; complete → `/hoy`). The session-check error screen was a dead end (only "Reintentar"); it now also offers "Cerrar sesión". `register_success` analytics is timing-based and can double-fire (A28-014).

## H. Business profile

Single business per account; profile drives all tools. Clear completeness prompts. No defects beyond minor missing accents in shell copy (A28-019).

## I. Today

Focus layer preserved (≤3 priorities, A2.7.2 intelligence active). A28-021: GBP 'error' and a failed sources load render as "not connected" (`TodayPage.tsx` frozen — documented). A28-023: AI insights and competitor alerts slots always empty.

## J. Missions

Execution layer preserved; real actions only, `PaywallNotice surface="execution"`. Overlap with Today priorities (A28-022).

## K. Plan

Roadmap layer preserved (A2.7.3). A273-001 overlap remains documented.

## L. Tools Hub

All seven tools listed and reachable. All cards show "Disponible" with no Premium indicator, while five tools render a lock card for non-Premium users (A28-026). `PaywallNotice` returns nothing for `TRIAL_NOT_STARTED`.

## M. SEO Generator

AI output with disclaimer, server-side cap 18 and `premium_required` error mapping. Limit message stated "20" → fixed to a number-free message (A28-007). "Ver planes" wording with a single plan (A28-027); result can be off-screen on mobile after generation (A28-028).

## N. Maps Profile Scanner

Deterministic, local. Explicit disclaimer that it does not represent Google Maps position. Engine hash unchanged.

## O. AI Digital Twin

Deterministic knowledge map of what LocalSEOHub knows. No external-awareness claim. Engine hash unchanged.

## P. Competitor Radar

User supplies URLs; public-signal comparison only; SSRF protection (private-address rejection, DNS pinning, off-site redirect rejection). Copy states traffic/sales are not measured. Landing demo aligned.

## Q. GEO Audit

Indicative AI-readiness score; disclaimers present (`copy.ts:73`, `:210`). Landing renamed to "Preparación para IA" and "Mide si ChatGPT…" removed. Engine hash unchanged.

## R. AI Business Advisor

Cap 12; grounded answers; server-gated. A28-029: banned-terms list prevents naming the Voice Simulator.

## S. Voice Simulator

Text-based roleplay, cap 10. Landing no longer implies voice-assistant (Siri/Alexa) campaign simulation.

## T. Sources

GBP OAuth flow intact (A2.5 trust fix active, `gbp-oauth-start` hash unchanged). Callback page now shows a fixed message instead of the `?error=` text (which anyone could craft in a link) and a fixed message instead of raw sync errors; details go to the console.

## U. Reports

Weekly summary shows "No medido" for absent metrics. No fabricated numbers.

## V. Premium / billing

9,99 €/mes, 7-day trial without card. Server verifies price (999), creates sessions server-side, webhook verifies signature (`constructEventAsync`) and de-duplicates (`claimEvent`). `?checkout=success` only triggers a server sync. Production payment E2E not executed (A28-031).

## W. Conversion friction

| FUNNEL STEP | CURRENT CTA | DESTINATION | RETURN CONTEXT | MEASURABLE? | FRICTION | RECOMMENDED CHANGE |
|---|---|---|---|---|---|---|
| Hero | "Configurar mi negocio gratis" | Signup modal | Business name saved | Pixel PageView + client signup event | Low | None |
| Demo run | Tool tabs + "Probar" | Canned example | Inputs kept in demo | No dedicated event | Low | Add demo_started event (A3) |
| Post-demo gate | "Crear cuenta y analizar mi negocio — gratis" | Signup modal (fixed) | Business name kept; email not pre-filled | Partial | Email retyped | Pass email (needs App.tsx approval) |
| "Analizar mi negocio gratis" CTAs | Same | Signup modal | None | Partial | No explanation of next step (A28-009) | Copy tweak |
| Signup | Email/password or Google | `/empezar` | — | CompleteRegistration on email only | Google signups not measured (A28-013) | A3 analytics |
| Locked tool | Lock card | `/facturacion` | No return-to-tool | Internal only | User must navigate back | Return link (needs approval) |
| Checkout | "Activar Premium" | Stripe Checkout | `SITE_URL` return | Server `checkout_started` / `checkout_completed`; no pixel InitiateCheckout/Purchase | Paid-ads attribution blind | A3 analytics / CAPI |
| Return | `?checkout=success` | `/facturacion` | Status refreshed | Server event | None | None |

## X. Dead ends

- Fixed: session-check error screen (no way out other than retry).
- Fixed: post-demo gate sending new users to login.
- Remaining: locked tool → billing has no way back to the tool (P3); mobile bottom bar lacks Herramientas/Facturación (A28-024, navigation change — document only).

## Y. Empty / loading / error states

Tools and reports have explicit empty and error states. Remaining: Today shows failures as "not connected" (A28-021); Today's AI insights/competitor alerts always empty (A28-023). Fixed: GBP callback raw error text.

## Z. Mobile

Responsive layouts verified by code reading (no browser available in this environment — not visually tested). Known: SEO result may be below the fold after generation (A28-028); bottom bar omits two sections (A28-024).

## AA. Accessibility

A28-018 (documented, not fixed to stay within the low-risk envelope across many files): demo inputs without labels, icon-only tabs without names, LoginModal labels without `htmlFor`, show-password toggle without `aria-label`, modal without `role="dialog"`, FAQ toggles without `aria-expanded`. A28-025: closed mobile drawer stays focusable.

## AB. Performance / fetches

Landing chunk ~199 kB (59 kB gzip), lazy-loaded. Today and Plan both load connected sources (A28-030, duplicate fetch). Dead landing code (`HeroDashboard`, unused helpers, unreachable `VisibilityChecker` phases, ~40 unused legacy i18n keys with old claims) adds weight but is not rendered (A28-017).

## AC. Trust / claims

| LOCATION | CLAIM | TYPE | EVIDENCE | SUPPORTED? | RISK | ACTION |
|---|---|---|---|---|---|---|
| Demo scan text | "Analizando tu negocio…" | Capability | Demo is canned | No | P1 | FIXED → "Preparando un ejemplo…" |
| SEO demo | "Resultados Garantizados", "más de 10 años", "el mejor servicio" | Outcome/fabricated fact | None | No | P1 | FIXED |
| Maps demo | "pierdes el 68% de búsquedas nocturnas" | Statistic | None | No | P1 | FIXED |
| Radar demo | Competitor review counts 142/97/63; review strategy | Fabricated data / capability | Radar reads websites, not reviews | No | P1 | FIXED |
| Advisor demo | "Conseguir 10 reseñas con plantilla incluida" | Capability | No template feature | No | P2 | FIXED |
| Tools showcase GEO | "Mide si ChatGPT te recomienda" | Capability | GEO is indicative readiness | No | P1 | FIXED |
| Tools showcase Advisor | "24/7", "presupuesto real" | Capability | Capped, profile-based | No | P2 | FIXED |
| Tools showcase Voice | Siri/Alexa campaign simulation | Capability | Text roleplay | No | P1 | FIXED |
| Pricing features | 16+ platforms, Etsy/Shopify | Capability | 4 formats | No | P1 | FIXED |
| How it works | CSV export to Shopify/Etsy | Capability | No export | No | P1 | FIXED |
| FAQ 4 | Agencies, many clients, one subscription | Capability/social proof | One business per account | No | P1 | FIXED |
| FAQ 5 | "Nunca recibirás el mismo texto" | Guarantee | Not guaranteed | No | P2 | FIXED |
| Final CTA | "¿Listo para recibir más llamadas?", "Tu competencia ya usa IA" | Outcome / pressure | None | No | P2 | FIXED |
| SEO limit | "límite de 20" | Fact | Cap 18 | No | P2 | FIXED |
| Testimonials | Named people, photos, results | Social proof | None in repo | Unknown | P1 | LAUNCH BLOCKER — evidence or approved removal |
| Results block | +38% / +24% / +17% in 30 days | Statistic | None in repo | Unknown | P1 | LAUNCH BLOCKER — evidence or approved removal |
| Benefit headlines | "Más clientes", "No lo decimos nosotros" | Outcome | None | Weak | P2 | PRE-LAUNCH RECOMMENDED |
| Signup verify copy | "Te hemos enviado un email" (`verify_signup_desc`) | Process | `signup-instant` sends none | No | P2 | F-03 scope |
| Unused i18n keys | ChatGPT visibility, CSV export, etc. | Capability | Not rendered | n/a | P4 | Cleanup later |

## AD. Free vs Premium

| FEATURE | FREE | PREMIUM | LIMIT | ENTITLEMENT SOURCE | CTA | CONSISTENT? | NOTES |
|---|---|---|---|---|---|---|---|
| Today / Missions / Plan | Yes | Yes | — | — | — | Yes | Execution paywall notice on gated actions |
| Business profile / Sources / Reports | Yes | Yes | — | — | — | Yes | |
| SEO Generator | Locked after trial | Yes | 18/month | Server `entitlement.ts` → `premium_required` | "Ver planes" | Partial | Hub says "Disponible" |
| AI Business Advisor | Locked after trial | Yes | 12/month | Server | Error → billing | Partial | Same |
| Voice Simulator | Lock card | Yes | 10/month | Client `hasPremium` + server | Lock card → `/facturacion` | Yes | |
| Competitor Radar | Lock card | Yes | — | Client + server | Lock card | Yes | |
| Maps Scanner | Lock card | Yes | — | Client `hasPremium` (local compute) | Lock card | Yes | Local computation, no cost exposure |
| Digital Twin | Lock card | Yes | — | Client (local compute) | Lock card | Yes | Same |
| GEO Audit | Lock card | Yes | — | Client (local compute) | Lock card | Yes | Same |
| Weekly content / improvement | Locked after trial | Yes | 22 / 18 | Server | — | Yes | |
| All AI | — | — | Global 80/month | `a248` migration | — | Yes | |

## AE. Analytics readiness

Client: PageView, signup (email path), internal events. Server: `checkout_started`, `checkout_completed`. Missing for paid acquisition: pixel InitiateCheckout/Purchase, CompleteRegistration for Google signups, Conversions API (A28-013). Business names and raw error strings are sent to analytics (A28-015). Not a blocker for organic/soft launch; PRE-LAUNCH RECOMMENDED before paid traffic.

## AF. F-03 / email-auth readiness

- `signup-instant` calls `admin.createUser({ email_confirm: true })`: any visitor can create a confirmed account for an email address they do not own.
- Impact: account pre-registration (squatting) of a victim's email; if the victim later uses "Continuar con Google", identity linking to the pre-existing confirmed account can give the squatter's password continued access (takeover vector). Also misleading `verify_signup_desc` copy, a global 50/hour signup quota that one actor can exhaust (signup denial of service), and a spoofable client-IP header in the rate-limit key.
- Password reset depends on SMTP and the Supabase redirect allowlist (external).
- Per mandate, nothing in SMTP, email confirmation, password reset, Google OAuth or Supabase Auth was touched. **F-03 remains a separately controlled launch-readiness item** and is a LAUNCH BLOCKER for public traffic.

## AG. Security preservation

- A2.5 GBP trust fix active; `gbp-oauth-start` hash unchanged; no new scopes.
- Stripe webhook signature + idempotency unchanged; price check unchanged.
- Radar SSRF protection unchanged.
- Login return-path guard unchanged.
- A2.8 reduced exposure: GBP callback no longer renders attacker-supplied query text.
- No RLS, policy, function grant or migration change.

## AH. Regression

| Check | Result |
|---|---|
| `vitest run` | 44 files, 1599 tests, all pass |
| A2.7.1 / A2.7.2 / A2.7.3 frozen SHA-256 checks (App.tsx, TodayPage, TodaysMissions, action-layer, today-intelligence, actions/*, Maps/Twin/GEO engines, gbp-oauth-start) | Pass |
| AI caps 22/18/18/12/10/80 | Pass (existing a273 tests 90–93 + a248 tests) |
| 14 legacy functions at HTTP 410 | Pass (a23 T27) |
| TypeScript | 20 errors, identical to baseline (unused declarations) |
| ESLint | 30 problems, identical to baseline |
| Build | Pass |
| Migrations | 42 |
| Routes | 27 |

New tests (`a28Prelaunch.test.ts`, 25): gate calls `onSignupClick(businessName)` twice and never `onLoginClick`; trial section receives signup handler; opening text neutral; 8 removed demo claims absent; 10 removed i18n claims absent (ES+EN); FAQ one-business wording; SEO limit copy has no "20"; auth error screen has retry + sign-out; GBP callback no longer renders `errorParam` or `result.error`.

## AI. Findings

| ID | SEVERITY | AREA | DESCRIPTION | EVIDENCE | CUSTOMER IMPACT | LAUNCH CLASSIFICATION | RECOMMENDED FIX | AUTO-FIXED? | TEST | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| A28-001 | P0 | Auth (F-03) | Direct signup creates confirmed accounts for unowned emails; Google linking takeover vector; global quota DoS; spoofable IP header | `signup-instant/index.ts:24-27,75,84-89` | Account squatting/takeover; signups blockable | LAUNCH BLOCKER | Close F-03 (email ownership proof before account is usable; per-IP limits from trusted header) | No (mandate) | — | OPEN |
| A28-002 | P1 | Conversion | Post-demo gate opened login and lost business name | `LandingPage.tsx` RegistrationGate | New users hit "wrong password" flow | — | Route to signup | Yes | a28 gate tests | FIXED (email pre-fill not kept; P3 residual) |
| A28-003 | P1 | Trust | Canned demo presented as real analysis | demo scan/result copy | Misleading | — | Example wording | Yes | a28 | FIXED |
| A28-004 | P1 | Trust | Fabricated facts/stats in demo output | SEO/Maps/Radar/Advisor demos | Misleading | — | Remove | Yes | a28 demo tests | FIXED |
| A28-005 | P1 | Trust | Testimonials and +38/+24/+17% statistics without evidence | `i18n.tsx` t1–t3, 619–631; `LandingPage.tsx` testimonials/stats | Potentially false social proof (consumer-law risk) | LAUNCH BLOCKER | Owner supplies evidence/consent, or approves removal | No (section removal needs approval) | — | OPEN |
| A28-006 | P1 | Trust | Showcase/pricing/how-it-works/FAQ capability claims (ChatGPT measurement, Siri/Alexa, Etsy/Shopify CSV, 16+ platforms, agencies/multi-client, 24/7) | i18n ts_*, lp_pricing_f*, landing_step_*, lp_faq4/5 | Buyers expect features that do not exist | — | Truthful copy | Yes | a28 i18n tests | FIXED |
| A28-007 | P2 | SEO tool | Limit message said 20, cap is 18 | `seo-generator/copy.ts` | Wrong expectation | — | Number-free message | Yes | a28 SEO test | FIXED |
| A28-008 | P2 | Auth copy | `verify_signup_desc` claims an email was sent | i18n 320 | Confusion | PRE-LAUNCH RECOMMENDED (with F-03) | Resolve within F-03 | No (F-03) | a261 keeps key | OPEN |
| A28-009 | P2 | Conversion | "Analizar mi negocio gratis" opens signup without saying so | Landing CTAs | Mild surprise | POST-LAUNCH ACCEPTABLE | Microcopy | No | — | OPEN |
| A28-010 | P2 | Trust | E-commerce steps (Shopify/Etsy) | i18n 54, 58 | Wrong audience | — | Local-business wording | Yes | a28 | FIXED |
| A28-011 | P2 | Trust | FAQ claims | i18n 530–531 | False capability | — | Truthful FAQ | Yes | a28 | FIXED |
| A28-012 | P2 | Trust | Outcome headlines ("Más clientes", "No lo decimos nosotros"); CTA "más llamadas"/"competencia ya usa IA" | i18n 626, 633, 638, 639 | Implied guarantees | PRE-LAUNCH RECOMMENDED (626/633) | CTA fixed; 626/633 tied to A28-005 section | Partial | a28 CTA tests | PARTIAL |
| A28-013 | P2 | Analytics | No pixel InitiateCheckout/Purchase; Google signups not measured; no CAPI | analytics, stripe-billing `handler.ts:124` | Paid campaigns cannot optimise | PRE-LAUNCH RECOMMENDED (if paid traffic) | A3 analytics | No | — | OPEN |
| A28-014 | P3 | Analytics | `register_success` timing-based, may double-fire | `useAuth` | Inflated counts | POST-LAUNCH ACCEPTABLE | Server-side event | No | — | OPEN |
| A28-015 | P3 | Privacy | Business names and raw errors in analytics | analytics calls | Data minimisation | PRE-LAUNCH RECOMMENDED | Strip PII | No | — | OPEN |
| A28-016 | P3 | Sources | GBP callback rendered `?error=` text and raw sync errors | `GBPCallbackPage.tsx` | Link-based text spoofing, technical text | — | Fixed messages | Yes | a28 GBP test | FIXED |
| A28-017 | P3 | Code health | Dead landing code and ~40 unused claim-bearing i18n keys | `HeroDashboard`, legacy `*Landing.tsx`, unused keys | None visible | POST-LAUNCH ACCEPTABLE | Cleanup | No | — | OPEN |
| A28-018 | P3 | Accessibility | Unlabelled inputs/tabs, labels without `htmlFor`, no dialog role, no `aria-expanded` | Landing, LoginModal | Screen-reader friction | PRE-LAUNCH RECOMMENDED | Attribute pass | No | — | OPEN |
| A28-019 | P4 | Copy | Missing accents in shell copy | "Cerrar sesion", "Contrasena", etc. | Polish | POST-LAUNCH ACCEPTABLE | Copy pass | Partial (auth guard, GBP callback) | a28 | PARTIAL |
| A28-020 | P2 | First login | Session error screen had only "Reintentar" | `app-v2/auth.tsx` | Stuck user | — | Add sign-out | Yes | a28 guard test | FIXED |
| A28-021 | P2 | Today | GBP 'error' / failed load shown as "not connected" | `TodayPage.tsx:103,119,125-130` (frozen) | Misleading status | PRE-LAUNCH RECOMMENDED | Approved TodayPage change | No (frozen) | — | OPEN |
| A28-022 | P3 | IA | Today priorities vs missions vs roadmap overlap | A273-001 | Repetition | FUTURE PRODUCT DEVELOPMENT | Product decision | No | — | OPEN |
| A28-023 | P3 | Today | AI insights / competitor alerts always empty | `TodayPage.tsx:284,287` (frozen) | Empty slots | POST-LAUNCH ACCEPTABLE | Hide or populate | No | — | OPEN |
| A28-024 | P3 | Navigation | Shell nav Spanish-only; mobile bar lacks Herramientas/Facturación | `AppShellV2.tsx:39` | Discoverability on mobile | POST-LAUNCH ACCEPTABLE | Navigation change (approval) | No | — | OPEN |
| A28-025 | P3 | Accessibility | Closed drawer focusable | `AppShellV2.tsx:128-134` | Keyboard trap-ish | PRE-LAUNCH RECOMMENDED | `inert`/hidden when closed | No | — | OPEN |
| A28-026 | P2 | Free/Premium | Tools hub shows "Disponible" on locked tools; `PaywallNotice` null for TRIAL_NOT_STARTED | `ToolsPage.tsx:83-86`, `BillingNotices.tsx:120` | Surprise lock | PRE-LAUNCH RECOMMENDED | Premium badge (approval) | No | — | OPEN |
| A28-027 | P3 | SEO tool | "Ver planes" with one plan | SEO copy | Minor | POST-LAUNCH ACCEPTABLE | "Ver Premium" | No | — | OPEN |
| A28-028 | P3 | Mobile | SEO result off-screen after generation | SEO page | Missed result | POST-LAUNCH ACCEPTABLE | Scroll into view | No | — | OPEN |
| A28-029 | INFO | Advisor | Banned-term list blocks naming Voice Simulator | `business-advisor-v2/logic.ts:287`, `handler.ts:67` | Advisor cannot cross-sell tool | FUTURE PRODUCT DEVELOPMENT | Review list | No | — | OPEN |
| A28-030 | INFO | Performance | Duplicate sources fetch Today/Plan | pages | Negligible | POST-LAUNCH ACCEPTABLE | Shared loader | No | — | OPEN |
| A28-031 | INFO | Billing | Production payment E2E not executed | — | Unknown live behaviour | PRE-LAUNCH RECOMMENDED | One live purchase + refund | No | — | OPEN |
| A28-032 | P4 | Privacy | Logout leaves `pending_business_name` in browser storage | storage | Shared-device leak of a name | POST-LAUNCH ACCEPTABLE | Clear on logout | No | — | OPEN |
| A28-033 | INFO | Copy | `mc_home_monitoring` "La IA está monitorizando…" defined, unused | i18n 600 | None | POST-LAUNCH ACCEPTABLE | Delete with A28-017 | No | — | OPEN |

### Tool value

| TOOL | PROMISE | INPUT | OUTPUT | REAL/AI/SIMULATED | FREE/PREMIUM | PRIMARY VALUE | MAIN FRICTION | TRUTHFUL? | LAUNCH READY? |
|---|---|---|---|---|---|---|---|---|---|
| SEO Generator | Content for Google, web, social | Profile + format | 4 formats | AI | Premium (trial) | Ready-to-paste copy | Limit/plan wording | Yes | Yes |
| Maps Profile Scanner | Profile completeness | Profile / GBP data | Score + gaps | Real (deterministic) | Premium | Concrete gaps | Lock card | Yes | Yes |
| AI Digital Twin | What LocalSEOHub knows | Profile/sources | Knowledge map | Real (deterministic) | Premium | Data-gap visibility | Abstract concept | Yes | Yes |
| Competitor Radar | Compare public signals with URLs you choose | Competitor URLs | Signal comparison | Real (fetched public pages) | Premium | Concrete differences | Must know URLs | Yes | Yes |
| GEO Audit | AI readiness (indicative) | Profile | Readiness score | Real (deterministic, indicative) | Premium | Checklist for AI assistants | Indicative only | Yes | Yes |
| AI Business Advisor | Grounded advice | Question | Answer | AI | Premium (trial) | Personal guidance | Monthly cap 12 | Yes | Yes |
| Voice Simulator | Practise customer calls (written) | Scenario | Roleplay | AI (simulated conversation) | Premium | Practice | Text, not voice | Yes | Yes |

## AJ. Launch blockers

1. **A28-001 / F-03** — signup without email-ownership proof (and the related quota/IP-header weaknesses). Must be closed in the separately controlled F-03 track before public traffic.
2. **A28-005** — testimonials and "+38% / +24% / +17%" results without evidence. Owner must either supply evidence (real customers, consent, data) or approve removal of those blocks.

Not blockers (PRE-LAUNCH RECOMMENDED): A28-013 analytics if paid traffic is planned; A28-031 one live payment test; A28-021, A28-026, A28-018/025, A28-015, A28-012 (remaining headlines).

## AK. Launch decision

**CONDITIONAL GO**

Conditions (all required before real traffic):
1. F-03 closed (A28-001).
2. A28-005 resolved (evidence supplied or removal approved and applied).

Strongly recommended before paid campaigns: A28-013 and A28-031.

## AL. Recommended next actions

1. Authorise F-03 as its own step (email confirmation/ownership, SMTP, signup rate-limit hardening, `verify_signup_desc`).
2. Owner decision on testimonials and results statistics (A28-005, with the "Más clientes"/"No lo decimos nosotros" headlines).
3. Run one live checkout + refund in production (A28-031).
4. A3: conversion analytics (pixel InitiateCheckout/Purchase, Google CompleteRegistration, CAPI, PII stripping).
5. Small approved UI pass: Premium badges in Tools hub, Today error-vs-not-connected state, accessibility attributes, drawer focus, gate email pre-fill.
6. Cleanup: dead landing code and unused claim-bearing i18n keys.

---

## Literal confirmations

- A2.8 was performed as a pre-launch audit, not a redesign.
- The approved LocalSEOHub interface was preserved.
- Today remains the focus layer.
- Missions remain the execution layer.
- Plan remains the roadmap layer.
- The A2.7.1 Action Layer remains active.
- The A2.7.2 Today Intelligence layer remains active.
- The A2.7.3 roadmap layer remains active.
- No Maps Profile Scanner ranking claim was introduced.
- No AI Digital Twin external-awareness claim was introduced.
- No GEO real-world AI ranking claim was introduced.
- No competitor traffic, sales, customer or ranking claim was introduced.
- No review management capability was fabricated.
- No new AI capability was introduced.
- All seven LocalSEOHub tools remain available.
- All fourteen retired legacy functions remain retired.
- AI usage global limit remains 80.
- No Stripe configuration was modified.
- No pricing was modified.
- No billing or Premium entitlement architecture was modified.
- No Google OAuth configuration was modified.
- The A2.5 GBP verification trust fix remains active.
- No new GBP OAuth scopes were introduced.
- No SMTP configuration was modified.
- Email confirmation was not enabled in A2.8.
- No authentication architecture was changed.
- No businesses were deleted.
- No connected sources were deleted.
- No mission history was deleted.
- No AI usage counters were reset.
- No new database migration was introduced.
- F-03 remains a separately controlled launch-readiness item.
