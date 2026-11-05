# A3.7.6.0 — TU SEMANA — ARCHITECTURE PROPOSAL

Status: PROPOSAL ONLY. Nothing implemented.

## 1. Product framing

| Surface | Question it answers | Horizon |
|---|---|---|
| Hoy | "What do I do right now?" | Today, up to 3 items |
| **Tu Semana** (currently "Plan") | "What is my plan for this week, and how far have I got?" | Monday to Sunday, local time |
| Resumen | "What did I actually do?" (a backward-looking report) | This week |

"Tu Semana" **replaces the "Plan" nav entry**. It is not a fourth weekly surface. The `/plan` page is already "Plan semanal", built on the same engine. Creating a parallel page would split progress tracking and confuse users with two weekly plans.

## 2. Minimum viable feature

- **One weekly plan per business.** There is one business per user, enforced by `businesses_user_id_key`. The plan is the current `weekStart()` week.
- **5 prioritised actions by default** ("Tus acciones de la semana"). Below them sits a collapsed "Más adelante" disclosure for the remaining roadmap items, with `PLAN_MAX = 8` kept as the ceiling.
  - The first 3 are the same items shown on Hoy. Consistency between Hoy and the weekly plan is intentional.
- **Every action shows:** what to do (title and next step), why (`reason` / `ACTION_COPY.why`), its origin label (`actionOrigin` → "Dato verificado", "Dato que nos diste", "Buena práctica general", "Requiere conectar fuente"), effort in minutes, and priority.
- **Recommendations are kept separate from executed work.** There are three visible groups:
  1. *Pendientes* (open)
  2. *Hechas esta semana*: the user marked the action done (`executed`)
  3. *Resueltas al actualizar tus datos*: the system detected the underlying data changed (`data_completed`)

  Dismissed actions are not counted as progress. Self-resolving actions can never be ticked by hand (`canMarkDone`).
- **Progress:** "X de Y acciones cerradas esta semana", from `buildActionReport`. It is **effort, not results**, and the copy must say so. The page shows no traffic, ranking or revenue claims.
- **Social block:** reuse `SocialIntegrationCard` (consumer `"plan"`, renamed if needed). It only shows the allowed social-intelligence recommendations. When Meta is disconnected it shows the existing connect / not-available state.
- **Disconnected integrations:** when GBP is not readable, `gbpKnown=false` already withholds GBP-dependent items (tier 2 or higher). SOURCE_REQUIRED actions are shown as "conecta tu fuente" and never as findings.
- **No AI, no new server function and no publishing call.** The plan is deterministic and computed from data already stored.
- **ES/EN:** all new copy goes in a `copy.ts` with `{ es, en }` objects. The nav label gets an ES/EN map: "Tu Semana" / "Your Week". The page title is "Tu plan semanal" / "Your weekly plan".

## 3. Options compared

### Option A — Reuse `business_actions`, the roadmap and `weekStart` (evolve the Plan page)

| Criterion | Assessment |
|---|---|
| Code reuse | Very high: engine, rules, provider, repository, roadmap, social card, data-origin UI |
| Complexity | Low: one page reworked, one nav entry renamed, one new copy file |
| Security | Unchanged attack surface. It uses the existing RLS policies (owner, business-ownership `EXISTS`, premium on writes). No new endpoints and no SECURITY DEFINER functions |
| Maintainability | One weekly source of truth (`buildActionReport` already feeds Hoy, Plan and Informes) |
| Testability | Pure functions plus existing fixtures, so selectors can be unit tested and the page tested with Testing Library |
| Database changes | **None** |
| Regression risk | Low to medium. Plan page layout changes; the `/plan` URL must keep working |
| Time | Smallest |
| Limitation | The plan is *live*, not a frozen snapshot. If the user fills in a data gap mid-week, the item moves to "Resueltas" and new items may join. This is honest, but the "Y" in "X de Y" can grow during the week |

### Option B — Dedicated weekly-plan table (snapshot)

Example design: a new `weekly_plans (id, business_id → businesses ON DELETE CASCADE, user_id, week_start date, action_ids uuid[], created_at)` table, `UNIQUE (business_id, week_start)`, created by a SECURITY DEFINER RPC `ensure_weekly_plan(p_business_id, p_week_start)` using `INSERT … ON CONFLICT DO NOTHING`, with owner-only SELECT.

| Criterion | Assessment |
|---|---|
| Code reuse | Medium: still uses `business_actions` for items, but needs a new repository, RPC and reconciliation logic |
| Complexity | Medium to high: snapshot vs live drift, actions closed or re-created by `planSync` while still referenced, and week-key agreement between browser and database |
| Security | New RPC must verify `business.user_id = auth.uid()`, validate the week, revoke from PUBLIC/anon, and handle premium gating |
| Maintainability | Two sources of truth for "this week's plan" |
| Testability | Needs migration-text tests, RPC tests and a concurrency test |
| Database changes | One table, one RPC, RLS and grants |
| Regression risk | Medium: a new migration on a frozen production DB |
| Time | Two to three times Option A |
| Benefit | A stable denominator and "Monday's commitments" |

### Recommendation: **Option A**

Reasons:
- Every MVP requirement can be met without schema changes.
- Persistence, idempotency, concurrency and tenant isolation are already solved and tested for `business_actions`:
  - the partial unique index on open rules;
  - 23505 tolerance;
  - conditional status transitions;
  - the RLS ownership `EXISTS` check.
- Option B adds risk for one benefit only, a frozen denominator. Option A can get most of that by counting only actions **created before or during** the week. Option B can be revisited as a separate gated stage if real customers ask for frozen plans.

## 4. Security and data integrity (Option A)

| Concern | Handling |
|---|---|
| Tenant isolation | Reads come from `business_actions` through `loadActions(businessId)`. RLS `auth.uid() = user_id`, and insert/update also require `EXISTS (businesses … user_id = auth.uid())`. No new queries bypass RLS |
| AuthN / AuthZ | The route stays inside `AppGuard`. Writes stay premium-gated by the RLS premium policies plus `canWrite`. Non-premium users see a read-only plan with `PaywallNotice` (the current behaviour) |
| Server-side ownership | Unchanged; enforced by RLS. No service-role code is added |
| Persistence and idempotency | `syncActions` relies on the partial unique index, treats 23505 as benign, and uses conditional updates `.in('status', open)` |
| Week boundary | `weekStart()` uses Monday 00:00 in browser local time. It is the single shared function; no second week calculation may be introduced. **Known limitation:** a user who changes device time zone sees a shifted week, because there is no stored business time zone. This is acceptable for the MVP and documented |
| Concurrent requests | Several tabs produce duplicate inserts that are rejected by the index. Closes are conditional, so double clicks are idempotent |
| Failure and retry | The existing provider error state and retry are reused. The page must show an error state, never an empty "all done" state, when loading fails |
| Fabricated data | Only stored actions and deterministic engines are used. Every item carries an origin label. `demoData` / `demoWorkspaceData` must not be imported. There are no metrics, scores or uplift claims, and the prohibited social claims stay prohibited |
| Publishing | The feature imports nothing from `facebook-publish`, `instagram-publish`, `publications`, `channel-*` or the `meta-publishing` / `instagram-publishing` functions. A test asserts this |
| Frozen baseline | The five A3.7.5.3 files and the frozen publishing engines are not touched (hash checks in every stage) |

## 5. UX design

- **Navigation:** the second nav position (where "Plan" is now) becomes **"Tu Semana" / "Your Week"**, with the same icon. Desktop sidebar order: Hoy · Tu Semana · Herramientas · Resumen · Mi negocio · Fuentes · Facturación. The mobile bottom bar keeps 5 items, with "Tu Semana" second.
- **Route:** add `/semana` as the canonical path. `/plan` redirects to `/semana`, so existing links, `PlanCard` and analytics keep working.
- **Layout, top to bottom:**
  1. Header: "Tu plan semanal", the week range ("Semana del 3 al 9 de noviembre", via `Intl.DateTimeFormat` with the active language), and the primary goal.
  2. Progress strip: "3 de 5 cerradas" with the bar, plus the subtitle "Mide lo que has hecho, no resultados."
  3. "Tus acciones de la semana": up to 5 cards. Each card has a priority chip, title, why, effort, origin label and a primary CTA (`ctaLabel` → `actionTarget`), plus the complete or "se cierra sola" line and a secondary dismiss in an overflow.
  4. Social card, shown only when relevant.
  5. "Hechas esta semana" (collapsible) and "Resueltas al actualizar tus datos" (collapsible).
  6. "Más adelante": a collapsed disclosure for the remaining roadmap items.
- **States:**
  - *Loading:* skeleton cards, with no layout shift.
  - *Error:* message plus "Reintentar".
  - *Empty, onboarding incomplete:* "Completa tu negocio para preparar tu semana", linking to `/negocio`.
  - *Empty, all closed:* "Has cerrado todo lo de esta semana", with a link to Resumen.
  - *Locked (no premium):* the plan is visible, actions are not writable, and `PaywallNotice` is shown.
- **Mobile:** single column. Cards use full-width CTAs. Collapsible sections start closed. Touch targets are at least 44 px.
- **Terminology:**

  | ES | EN |
  |---|---|
  | Tu Semana | Your Week |
  | Tu plan semanal | Your weekly plan |
  | Pendiente | To do |
  | En curso | In progress |
  | Hecha | Done |
  | Resuelta al actualizar tus datos | Resolved when your data was updated |
  | Descartada | Dismissed |
  | Prioridad alta / media / baja | High / Medium / Low priority |

- **Out of the MVP:** calendars, notifications, emails, automation, scheduling, AI generation and new dashboards.

## 6. Relationship to existing features

- **Hoy:** unchanged. Its top 3 equal the top 3 of Tu Semana. `PlanCard` on Hoy links to `/semana` with updated label copy.
- **Resumen (`/informes`):** unchanged; it stays the retrospective view.
- **Weekly content card:** stays on Hoy. Tu Semana may link to it from the `create_weekly_post` action's existing CTA but does not embed generation.
