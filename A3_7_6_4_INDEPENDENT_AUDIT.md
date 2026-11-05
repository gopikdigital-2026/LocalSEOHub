# A3.7.6.4 — Tu Semana: Independent Integrity & Regression Audit

Mode: strict read-only. No source, test, database, secret or OAuth changes were made. Only these three reports were written. Scratch probes ran from `/tmp/scr` (outside the project) and import production modules without modifying them.

**Verdict: NO-GO — TU SEMANA REQUIRES CORRECTION** (see §4, finding F1).

## 1. Baseline and source integrity

| Item | Evidence | Result |
|---|---|---|
| A3.7.6.2 baseline | `deliverables/localseohub-a3762-weekly-plan-page.zip` sha256 `72e35154…f3f6e0`, extracted to `/tmp/a4base` | OK |
| A3.7.6.3 archive | `deliverables/localseohub-a3763-tu-semana-integration.zip` sha256 `58a4a415…a9c09e17c4092`, extracted to `/tmp/a4new` | OK |
| Workspace vs A3.7.6.3 archive | `diff -rq` (excluding node_modules, dist, deliverables, *.zip, .env, .bolt, A3_7_6_4*) | **identical** |
| Production changes vs baseline | `src/App.tsx`, `src/app-v2/layouts/AppShellV2.tsx` only | OK |
| Changed test files vs baseline | 16 modified existing tests + 1 new (`src/features/weekly-plan/__tests__/a3763WeeklyPlanRouting.test.tsx`) | OK. The earlier "17 existing" wording actually means 16 modified + 1 new = 17 changed test files |
| Unrelated changes | none (no other file differs) | OK |

`src/App.tsx` diff:
- line 16: lazy `WeeklyPlanPage` replaces the lazy `PlanPage` import;
- `LegacyPlanRedirect` returns `<Navigate to={{ pathname: '/semana', search, hash }} replace />`;
- line 203: `/semana` → `<WeeklyPlanPage />`; line 204: `/plan` → `<LegacyPlanRedirect />`. Both sit inside the `AppGuard` + `AppShellV2` block (lines 202–220).

`AppShellV2.tsx` diff:
- the nav item becomes `{ id: 'plan', label: 'Tu Semana', labelEn: 'Your Week', path: '/semana' }`;
- a `navLabel(item, lang)` helper is added and called in the sidebar, mobile drawer and bottom bar;
- `BOTTOM_BAR_IDS` and `trackNavigationClick(item.id)` are unchanged.

### Protected fingerprints (sha256, first 16 hex, recomputed in this audit)

| File | Expected | Actual |
|---|---|---|
| src/features/meta-connection/MetaConnectionCard.tsx | 3729892653ebfdba | 3729892653ebfdba |
| src/features/meta-connection/metaStatus.ts | 50845c8d1b85d2be | 50845c8d1b85d2be |
| src/features/meta-connection/MetaPageSelectModal.tsx | e4e5b66a372e97c8 | e4e5b66a372e97c8 |
| src/features/meta-connection/MetaCallbackPage.tsx | 5bfc455450d14345 | 5bfc455450d14345 |
| src/features/meta-connection/tests/a3753CommercialConnection.test.tsx | da754befec158efc | da754befec158efc |
| `cat supabase/functions/meta-publishing/*.ts supabase/functions/instagram-publishing/*.ts` | 58956f462595b404 | 58956f462595b404 |
| src/features/weekly-plan/WeeklyPlanPage.tsx | b3b962b8e5e26b1e | b3b962b8e5e26b1e |
| src/app-v2/routes/PlanPage.tsx (unrouted, unchanged) | 109a1a58060ac4b2 | 109a1a58060ac4b2 |
| src/App.tsx | 4466949b9560d932 | 4466949b9560d932 |

## 2. Test re-pin audit

See `A3_7_6_4_TEST_REPIN_VERIFICATION.md`.

- Every re-pin is a fingerprint, route-count or label update that follows from the two real source changes.
- In every modified file, the `expect(` count and the `it/test` count are the same as or higher than the baseline.
- No `.skip`, `.only`, `.todo` or `it.fails` marker was added.
- No security assertion was removed or weakened.

## 3. Routing and access control

| Check | Evidence | Result |
|---|---|---|
| `/semana` requires sign-in and onboarding | App.tsx:202–220, inside `<AppGuard><AppShellV2/></AppGuard>`; a3763 tests (signed out → `/login?next=…`, onboarding incomplete → `/empezar`) | OK |
| `/plan` keeps query and fragment, replaces history, no loop | App.tsx `LegacyPlanRedirect`; it targets `/semana`, which never redirects back; a3763 test with `?x=1#y` | OK |
| `/plan` is also guarded | the redirect is inside the guarded block | OK |
| Business and premium | WeeklyPlanPage uses the same Business/Billing/Actions providers (main.tsx); read-only mode hides mutation buttons (WeeklyPlanItemCard:120); `PremiumRequiredError` → `c.locked` (WeeklyPlanPage:108) | OK |
| Navigation tracking | `trackNavigationClick(item.id)` with id `'plan'` unchanged; a3763 asserts `'plan'` | OK (event id stays `plan`) |
| ES/EN labels | "Tu Semana" / "Your Week" via `navLabel` in the sidebar, drawer and bottom bar | OK |
| Desktop and mobile parity | the same NAV item list feeds all three menus; a3763 checks the active state in each | OK |
| Other routes | all 34 earlier route paths are still present (App.tsx:181–268); a3752 still asserts no InternalGuard in the customer block and `/oauth/meta/callback` is present | OK |
| Internal `/plan` links | still work through the redirect | OK (retargeting is optional) |

## 4. Findings

### F1 — Open actions beyond 8 are not reachable (customer-facing loss, class D). Decides the verdict.

- The old PlanPage listed **all** open actions: today's actions, the rest grouped by category (PlanPage.tsx:167–178, 289–291).
- Tu Semana caps the list. `src/features/weekly-plan/model.ts:98–105` (`selectWeeklyFocus`) sets:
  - `focus = slice(0, WEEK_FOCUS_MAX=5)`;
  - `later = rest…slice(0, WEEK_PLAN_MAX(8) - focus.length)`.
- Nothing tells the customer that more actions exist, and nothing links to them:
  - WeeklyPlanPage.tsx:196–210 renders only `plan.later`;
  - `laterTitle(n)` counts only the visible items.
- No other customer page lists all open actions:
  - Hoy shows 3 (`TODAY_LIMIT`, engine.ts:21);
  - ExecutionPage.tsx:85 offers only the next 1;
  - WeeklySummaryPage, BusinessTimeline and SourceManager do not list open actions.
- The engine does produce more than 8 open actions for realistic businesses:
  - `planSync` has no cap (engine.ts:128–140) and keeps one open action per ruleId (engine.ts:86–101);
  - several rules emit multiple ruleIds (`gbp_add_*`, `website_*`, `follow_up_*`).
- Probe `/tmp/scr/cap2.test.ts` runs the real `planSync` for a business with a complete profile, a synced Google Business profile (no website, phone or hours, 0 reviews) and an analysed website (no https, title, meta or h1). It produces **12** open actions:
  `gbp_add_hours, gbp_add_phone, gbp_add_website, gbp_get_first_reviews, website_add_title, website_enable_https, publish_call_to_action_post, website_add_meta_description, write_faq_answers, improve_service_description, website_add_h1, add_recent_photos`.
  - Tu Semana shows 8 of them.
  - The remaining 4 cannot be seen, started, completed or dismissed until earlier ones are closed.
- Probe `/tmp/scr/cap.test.ts` (a sparse new business) produces 7, so the cap only bites for connected businesses: exactly the paying, engaged customers.
- The A3.7.6.3 parity report, row 3, states "every action is still listed". **That claim is inaccurate.**

Smallest correction (for a later, authorised stage):
- either include every remaining open action in the collapsible "later" list (drop the `WEEK_PLAN_MAX` slice for `later`, or raise the cap to the open count);
- or keep the cap and add a visible "N more actions" entry that reveals them.

Either way, add a test asserting that every open action is reachable from `/semana`.

### F2 — Protective static checks still target the unrouted PlanPage (risk, not a regression)

These checks now guard dead code instead of the live `/semana` page:

| Test | Line | What it checks on PlanPage only |
|---|---|---|
| `src/features/actions/__tests__/engine.test.ts` | 242–256 | `useActions`, no `pendingByGoal`, no `syncActions` / `evaluateBusinessState` |
| `src/features/activation/__tests__/activation.test.ts` | 285 | no `'/empezar'` |
| `src/features/improvement/__tests__/improvement.test.ts` | 426 | `offersImprovement(action) && <ImprovementHint` |
| `a3544SocialIntegration.test.ts` | 291 | importers of social integration |
| `a272TodayIntelligence.test.ts`, `a273Roadmap.test.ts`, `a33DiagnosticAction.test.ts`, the `a3542SocialFindings` list | — | — |

- WeeklyPlanPage does satisfy the equivalent rules today:
  - it reads only `useActions()` plus `ensureFresh`;
  - the a3762 import guard (a3762WeeklyPlanPage.test.tsx:389) forbids repository, reality-engine and social imports;
  - its ImprovementHint is gated by `!readOnly && offersImprovement` (WeeklyPlanItemCard:120).
- Recommendation: extend these checks to WeeklyPlanPage when PlanPage is removed.

### F3 — Paywall analytics surface renamed (low)

- `PaywallNotice surface="weekly_plan"` (WeeklyPlanPage:147) replaces `surface="plan"` (PlanPage:249).
- `surface` is a free string passed to `trackPaywallViewed` (BillingNotices.tsx:108–118).
- Paywall views from this page will appear under a new surface name. Dashboards should account for this; it is not a functional defect.

## 5. Weekly plan safety

See `A3_7_6_4_FUNCTIONAL_PARITY_VERIFICATION.md` §3. All items pass:
- no cross-business exposure;
- no double execution;
- no invented analytics or demo data;
- no publishing calls;
- missing-integration notice;
- the four closed states are kept apart;
- week boundaries are handled correctly;
- no persistent writes beyond the user's own start, complete and dismiss actions.

## 6. Verification

| Check | Baseline (A3.7.6.2) | Now | New defects |
|---|---|---|---|
| Full suite (`npx vitest run`) | 3,177 passed | 3,197 / 3,197 passed, 0 failed, 0 skipped, 95 files | none |
| `npx tsc --noEmit -p tsconfig.app.json` | 20 errors | 20 errors; the only one in a changed file is App.tsx:5 unused `useAuth`, byte-identical to baseline line 5 | none |
| ESLint (App.tsx, AppShellV2.tsx, a3762 and a3763 tests) | — | 1 error (App.tsx:5 unused `useAuth`) + 1 warning (App.tsx:64 react-refresh, `getPendingBusinessName`); both lines are identical in the baseline | none |
| `npm run build` | built | built (12.3 s) | none |

Passing checks do not cover F1: no test asserts that every open action is reachable.

## 7. Limitations and risks

1. F1, the 8-action visibility cap: **blocking**.
2. F2, protective checks still on the unrouted PlanPage: coverage risk.
3. F3, paywall analytics surface name change.
4. The cross-tool merged roadmap ranking (RoadmapCard phases now/next/later) is gone. Each tool page still lists its own priorities with CTAs, and Hoy shows the top 3, but customers lose the single combined view (class C).
5. Category headers are gone (class C).
6. There is no browser in this environment. UI behaviour was verified through rendered-DOM tests (jsdom) and source reading, not visually.
7. PlanPage.tsx remains in the codebase, unrouted, pending an approved removal.

**NO-GO — TU SEMANA REQUIRES CORRECTION**
