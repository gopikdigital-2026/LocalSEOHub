# A3.7.6.0 — TU SEMANA — FUNCTIONAL DISCOVERY AUDIT

Mode: READ-ONLY. No source, schema, data, secret, permission or deployment change was made.
Date: 2026-11-05. Baseline: approved A3.7.5.3 (five SHA-256 fingerprints unchanged).

---

## 0. Headline finding

**A weekly plan already exists.** `/plan` (nav label "Plan") renders the title "Plan semanal" / "Weekly plan" and states in its own copy: "Hoy muestra tu prioridad inmediata; el Plan reúne las acciones de toda la semana." A weekly *summary* also exists at `/informes` (nav label "Resumen", title "Resumen semanal").

Adding "Tu Semana" as a third weekly surface next to these would duplicate functionality. The audit therefore treats "Tu Semana" as an **evolution of the existing Plan page**, not a new subsystem.

---

## A. Existing customer experience

### A.1 Routing and navigation

- **Routes:** `src/App.tsx`. All app pages sit inside `<AppGuard><AppShellV2/></AppGuard>`.
- **Guards:** `src/app-v2/auth.tsx`. `AppGuard` sends users to `/login?next=` or `/empezar` until onboarding is completed.
- **Return paths:** `src/app-v2/returnTo.ts`. `safeReturnPath` allows only in-app paths.
- **Nav definition:** `src/app-v2/layouts/AppShellV2.tsx`, lines 29–41.

```ts
{ id: 'hoy', label: 'Hoy', path: '/hoy' }, { id: 'plan', label: 'Plan', path: '/plan' },
{ id: 'herramientas', ... '/herramientas' }, { id: 'informes', label: 'Resumen', path: '/informes' },
{ id: 'negocio', ... }, { id: 'fuentes', ... }, { id: 'facturacion', ... }
const BOTTOM_BAR_IDS = ['hoy', 'plan', 'informes', 'negocio', 'fuentes'];
```

Navigation details:
- **Nav labels are Spanish only.** The shell does not use `useI18n`.
- **Desktop:** fixed sidebar with all 7 items.
- **Mobile:** drawer with all 7 items, plus a bottom bar with 5.
- **Analytics:** every nav click calls `trackNavigationClick(id)`.
- **Gating:** no router-level premium gate. Gating happens inside pages, through `useActions().locked` and `PaywallNotice`.

### A.2 "Hoy" — `src/app-v2/routes/TodayPage.tsx`

Two priority systems run on this page.

**1. `TodayPriorities`**
- **Source files:** `src/features/today-intelligence/{model.ts,copy.ts,TodayPriorities.tsx}`.
- **Computation:** `todayActions(business, normalizeGbp(gbp), sourcesKnown)` merges `mapsActions`, `twinActions` and `geoActions`. It is computed in the browser and **not persisted**.
- **Limit:** at most `TODAY_MAX = 3` items.
- **Ranking:** `compareToday` sorts by:
  1. tier (0 identity → 4 upkeep)
  2. number of tools that flagged the item
  3. field reach
  4. best rank
  5. `KEY_ORDER`
- **GBP safeguard:** when the GBP state is unknown, items at tier 2 or higher are withheld.

**2. `TodaysMissions`**
- **Source:** `src/features/dashboard/TodaysMissions.tsx`.
- **Data:** persisted `business_actions` via `selectTodayActions`, with `TODAY_LIMIT = 3`. IN_PROGRESS items come first. At least one item must be doable without connecting a source.

**Other cards on Hoy:**
- `SocialIntegrationCard consumer="hoy"`
- `BusinessHealthCard` (`score=null` by design)
- `WeeklyContentCard`
- `PreparedRepliesCard`
- `GrowthTimeline` (4 milestones)
- `QuickActions`
- `BusinessSnapshot` (rating, reviews and photos are `null`)
- `PlanCard`
- `AIInsights` and `CompetitorAlerts`, both always empty

### A.3 "Plan" — `src/app-v2/routes/PlanPage.tsx`

- **Title and horizon:** "Plan semanal" / "Weekly plan". The horizon is the current week, from `weekStart()`.
- **Progress bar:** `buildActionReport(actions, now, goal)` computes `weeklyProgress` = closed this week ÷ (closed this week + open).
- **Roadmap:** `RoadmapCard` from `src/features/roadmap/{model.ts,copy.ts,RoadmapCard.tsx}`.
  - `buildRoadmap` uses the same eligibility ranking as Hoy, with `PLAN_MAX = 8`.
  - Phases: `now` (positions 0–2, identical to Hoy), `next` (3–5) and `later` (6–7).
  - Persisted status is shown through `MISSION_KEYS`. The roadmap itself is not persisted.
- **Stored-action sections:**
  - "Para hoy"
  - "Resto de la semana", grouped by `CATEGORY_LABELS`
  - "Cerradas esta semana", for outcome `executed` or `data_completed` with `completedAt >= weekStart()`
- **Row controls:** "Marcar como completada" when `canMarkDone`, otherwise "Se cierra sola al guardar el dato". Each row also has dismiss, `ImprovementHint` (`/ejecutar/:id`), effort, priority and `OriginLabel`.
- **Page states:** loading, error with retry, and "Aún no tienes un plan".
- **Data-integrity notice:** "No inventamos diagnósticos".

### A.4 Recommendation and action generation — `src/features/actions/*`

**Rules** (`rules.ts`, `ACTION_RULES`):

| Group | Rule ids |
|---|---|
| Sources | `connect_google_business_profile`, `fix_source_connection`, `connect_website_source` |
| Profile | `complete_business_basics`, `add_business_contact`, `add_business_schedule`, `complete_business_services`, `define_target_audience`, `set_primary_goal` |
| Goal | `goal_focus_action` |
| Content | `create_weekly_post`, `add_recent_photos`, `write_faq_answers`, `improve_service_description` |
| GBP / web findings | `gbp_profile_gaps`, `gbp_get_first_reviews`, `website_findings` |
| Follow-up | `follow_up_actions` |

**Engine** (`engine.ts`):

- **Evaluation:** `evaluateBusinessState(business, sources, history, now)` evaluates the rules and scores each candidate with `scoreCandidate`.
- **Score formula:** impact (30/20/10) + source strength + goal match (+15) + quick win (+5, for effort of 10 minutes or less). `priorityFor` gives HIGH at 55 or more and MEDIUM at 35 or more.
- **Source strength points:**

  | Source type | Points |
  |---|---|
  | VERIFIED_FINDING | 25 |
  | SOURCE_REQUIRED | 20 |
  | BUSINESS_PROFILE | 15 |
  | GOAL_BASED | 15 |
  | FOLLOW_UP | 10 |
  | GENERAL_BEST_PRACTICE | 5 |

- **Dedupe:** `dedupCandidates` skips a candidate when the same rule is already open, was completed within the rule's `cooldownDays`, or was manually dismissed less than `DISMISS_COOLDOWN_DAYS = 30` ago.
- **Sync plan:** `planSync` inserts new candidates. Open actions whose trigger no longer fires are closed:
  - self-resolving types (BUSINESS_PROFILE, SOURCE_REQUIRED, VERIFIED_FINDING) become COMPLETED, with `resolved_by='condition_met'`;
  - all other types become DISMISSED.
- **Manual completion:** `canMarkDone(action)` is false for self-resolving types, so a click can never claim that a data gap is fixed.
- **Outcomes:** `actionOutcome()` returns `executed | data_completed | dismissed | open`.
- **Data origin:** `actionOrigin()` maps each source type to `real | user_provided | general | unavailable`.
- **Localisation:** `localizeAction(action, lang)` reads `metadata.copy[lang]`.

**Persistence** (`repository.ts`):
- `loadActions`, `getAction`, `syncActions` and `transitionAction` all operate directly on `business_actions` with the user JWT. No edge function is involved.
- Concurrent inserts are tolerated: error 23505 means another tab inserted the same open rule.
- Closes are conditional: `.in('status', ['PENDING','IN_PROGRESS'])`.

**Provider** (`ActionsProvider.tsx`):
- `ensureFresh()` runs `syncActions(currentBusiness, sources)`.
- Writes require `hasPremium === true`. `locked` is `hasPremium === false`.

**Action layer:** `src/features/action-layer/{model.ts,primary.ts,copy.ts,ActionDetail.tsx}` provides the `ACTION_COPY` why/next copy and the destinations used by Hoy and Plan.

**Execution:** `src/features/execution/*` (route `/ejecutar/:recommendationId`) is an execution checklist workspace. It uses demo workspace data that is explicitly labelled as demo or general.

### A.5 Progress tracking

| What | Where |
|---|---|
| Action progress | `business_actions.status`, `started_at`, `completed_at`, `dismissed_at`; `metadata.resolved_by` and `metadata.auto_closed` |
| Weekly progress | `buildActionReport` (this is the single source for Hoy, Plan and Informes, per the code comment) |
| Activation milestones | `src/features/activation/{milestones.ts,service.ts,repository.ts}` → `first_value_progress` |
| Growth timeline | computed on Hoy (`buildMilestones`) |

### A.6 Business onboarding and selection

- **Onboarding:** `/empezar` → `src/features/first-value/FirstValueFlow.tsx`, with `first_value_progress`.
- **Active business:** `src/features/business-memory/BusinessContext.tsx` (`useBusiness()` → `currentBusiness`, `businessId`).
- **One business per user:** this is enforced by the unique index `businesses_user_id_key ON businesses(user_id)`.
- **Profile fields:** name, category, city, website, phone, schedule, target_audience, services[], primary_goal, secondary_goals[], onboarding_completed(_at).
- **Goal ids:** more_calls, more_bookings, more_reviews, better_reputation, better_local_seo, more_web_visits, more_followers.

### A.7 Weekly surfaces that already exist

| Surface | Route | Week logic |
|---|---|---|
| Plan semanal | `/plan` | `weekStart()` |
| Resumen semanal | `/informes` (`WeeklySummaryPage.tsx`) | `buildActionReport` + `weekStart()`; also shows `WeeklyContentReport` |
| Weekly content draft (AI) | card on Hoy | `weekKey()` = `weekStart()` formatted as YYYY-MM-DD |

**Week boundary (single shared function, `src/features/actions/engine.ts:268`):**

```ts
export function weekStart(now: Date = new Date()): Date {
  const d = new Date(now);
  const offset = (d.getDay() + 6) % 7;   // Monday = 0
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);                // browser local time
  return d;
}
```

- The week runs Monday 00:00 to Sunday, in the **browser's local time zone**.
- The server-side check `supabase/functions/weekly-content/logic.ts:66` (`isCurrentWeek`) accepts a Monday key within [start − 14 h, start + 7 d + 12 h] UTC, which absorbs time-zone skew.

### A.8 Localisation

- **Provider:** `src/lib/i18n.tsx`. `I18nProvider` and `useI18n()` give `lang: 'es' | 'en'`. The language is persisted in `localStorage('lang')` and defaults to `es`.
- **Feature copy:** features define `{ es: {...}, en: {...} }` objects in `copy.ts` (for example `src/features/roadmap/copy.ts` and `src/features/today-intelligence/copy.ts`).
- **Gap:** the shell's nav labels are not localised.

---

## B. Available data per business

Classification: **1** fully operational and verified · **2** implemented but not fully validated · **3** not implemented or planned · **4** unavailable for the current business.

| Source | Objects | Class | Evidence |
|---|---|---|---|
| Business profile and goals | `businesses` | 2 (in active production use; no dedicated E2E freeze report) | code; migration `20261007162621` |
| Onboarding and milestones | `first_value_progress` | 2 | code |
| Manual source ("declared by you; not verified") | `reality-engine/registry.ts` (`manual`) | 2 | registry copy |
| Actions and progress | `business_actions` | 2 (live; behaviour covered by `src/features/actions/__tests__/*`) | tests `engine`, `fix061`, `sprint06`, `repository` |
| Website analysis | `analyze-website`, `connected_sources` | 2 | SSRF tests `analyzeWebsiteSsrf.test.ts` |
| Google Business Profile | `gbp-*` functions, `connected_sources`, `source_sync_events` | 2 in code, **4 for every business** | `A3_4_2_2_GBP_CONNECTION_RECOVERY_FIX.md`: GBP API quota is 0, so the account discovery step fails with 429 |
| Google reviews | `gbp-reviews`, `audit-reviews` | **4** (depends on GBP) | `A3_4_2_REVIEWS_AI_IMPLEMENTATION.md`: "no tenant currently has a connected GBP source" |
| Prepared replies | `prepared_replies`, `prepared_reply_details` | 2 | code |
| Meta connection (FB Page / IG account) | `meta_connections` | 1 (the owner's test account); **4 for most customers** until Meta app review and external access are granted | `A3_5_2_2_…FREEZE.md`, `A3_7_5_3_CUSTOMER_CONNECTION_MATRIX.md` |
| Meta read layer | `meta_content_items`, `meta_sync_state`, `meta-read` | 1 | `A3_5_3_1_…FREEZE.md` |
| Social intelligence (signals → findings → recommendations, deterministic) | `src/features/social-intelligence/**` | 1 | `A3_5_4_1_1_R2`, `A3_5_4_2_1`, `A3_5_4_3_1`, `A3_5_4_4_2` (GO / FREEZE) |
| Weekly content draft (AI) | `weekly_content_drafts`, RPCs `reserve_/complete_/release_weekly_content` | 2 | code; idempotent reservation |
| Improvement drafts (AI) | `business_improvement_drafts`, `business_improvement_usage` | 2 | code |
| Maps scanner, GEO audit, Digital Twin (as used by Hoy and Plan) | `maps-scanner/engine.ts`, `geo-audit/engine.ts`, `digital-twin/engine.ts` (client-side, deterministic, computed from the profile and GBP) | 2 | consumed by `today-intelligence/model.ts` |
| Competitor radar, advisor, SEO generator, voice simulator | AI edge functions | 2; output is not persisted per business | no repository table found |
| Publications pipeline | `publications`, `publication_proposals`, `publication_drafts` | 2 (internal route only) | FREEZE manifests A3.7.2 / A3.7.3.x |
| Real FB/IG publishing | `meta-publishing`, `instagram-publishing` | **disabled in production** (no arming secrets, no active entitlements) | A3.7.5.5 reports |
| Search Console, Analytics | registry `comingSoon: true` | **3** | `reality-engine/registry.ts` |

Social-intelligence outputs that are safe to act on:
- **Allowed recommendations:** REVIEW_POSTS_WITHOUT_TEXT, REVIEW_POSTS_WITHOUT_CAPTION, CONSIDER_NEW_CONTENT, REFRESH_DATA, RECONNECT_META, REVIEW_META_PERMISSIONS, CONNECT_PLATFORM, RETRY_LATER, WAIT_FOR_MORE_HISTORY.
- **Explicitly prohibited claims:** POST_MORE_OFTEN, SWITCH_TO_REELS, BEST_TIME_TO_POST, SALES_UPLIFT, PLATFORM_PERFORMANCE_COMPARISON, COMPETITOR_COMPARISON, FORMAT_ENGAGEMENT_UPLIFT.

Fabricated-data risk points:
- `src/features/execution/demoWorkspaceData.ts` is labelled demo where it is used.
- `src/app-v2/demo/demoData.ts` is used only in tests.
- Any new page must not import either file.

---

## C. Reusable components

| Kind | Reusable item (exact path or object) |
|---|---|
| Ranking and roadmap | `src/features/roadmap/model.ts` (`buildRoadmap`, `PLAN_MAX`, phases), `src/features/today-intelligence/model.ts` (`todayActions`, `compareToday`) |
| Action engine | `src/features/actions/engine.ts` (`weekStart`, `buildActionReport`, `selectTodayActions`, `openActions`, `canMarkDone`, `actionOutcome`, `actionOrigin`, `localizeAction`, `ctaLabel`, `PRIORITY_LABELS`, `CATEGORY_LABELS`, `actionTarget`) |
| Action state | `src/features/actions/ActionsProvider.tsx`, `ActionsContext.ts` (`useActions`), `repository.ts` |
| Action copy | `src/features/action-layer/copy.ts` (`ACTION_COPY`), `primary.ts` |
| Social layer | `src/features/social-intelligence/integration/SocialIntegrationCard.tsx` (supports `consumer="hoy" | "plan"`), `integration/projection.ts` |
| Data-origin UI | `src/domain/dataIntegrity.ts`, `src/components/DataIntegrity.tsx` (`NoDataState`, origin labels), `src/components/data-status/index.tsx` |
| Generic UI | `src/components/ui/index.tsx` (`LoadingState` and others) |
| Billing | `src/features/billing/BillingContext.ts` (`useBilling().hasPremium`), `BillingNotices.tsx` (`PaywallNotice`, `TrialBanner`) |
| Business | `src/features/business-memory/BusinessContext.tsx` (`useBusiness`), `activation/milestones.ts` (`goalLabel`) |
| Weekly content | `src/features/weekly-content/WeeklyContentCard.tsx`, `model.ts` (`weekKey`, `weekRange`) |
| i18n | `src/lib/i18n.tsx` (`useI18n`) |
| Analytics | `src/services/analytics/v2Analytics.ts` |

**Database objects** (all have RLS enabled; live catalogue checked 2026-11-05):

| Object | Access |
|---|---|
| `businesses` | owner policies for all four commands |
| `business_actions` | owner select, insert, update and delete; separate premium-required insert and update policies; partial unique index `business_actions_open_rule_unique (business_id, rule_id) WHERE status IN ('PENDING','IN_PROGRESS')`; insert and update policies check `EXISTS (businesses b WHERE b.id = business_id AND b.user_id = auth.uid())` |
| `first_value_progress` | owner policies for all four commands |
| `connected_sources`, `source_sync_events` | owner policies (`business_id` is text, not a foreign key) |
| `meta_connections`, `meta_content_items`, `meta_sync_state` | select only for the owner; writes go through edge functions |
| `weekly_content_drafts` | select and update for the owner; generation goes through SECURITY DEFINER RPCs |

**Test infrastructure:**
- Vitest suite, baseline 3,118 tests, organised as `__tests__` per feature.
- Fake DB helpers: `src/features/prepared-replies/__tests__/fakeDb.ts`, `src/features/publications/__tests__/gateB4Fix01DbModel.ts`.
- `.tsx` component tests with Testing Library already exist (for example `src/features/meta-connection/tests/a3753CommercialConnection.test.tsx` and `src/features/internal-access/__tests__/a3752TenantSecurity.test.tsx`).

---

## D. Items this audit did not verify

- The internals of the AI tool edge functions: whether each one persists anything beyond the usage ledger. This does not matter for the recommended design, which uses no AI.
- Which language is actually stored in `business_actions.metadata.copy` for each existing row. This will be checked in Stage 1, read-only.
- Real-device mobile rendering. There is no browser in this environment.
