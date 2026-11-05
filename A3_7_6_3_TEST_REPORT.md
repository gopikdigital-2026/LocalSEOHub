# A3.7.6.3 — Test Report

## Results

| Check | Result |
|---|---|
| Full suite (`vitest run`) | **3,197 / 3,197 pass**, 95 files (baseline 3,177 + 20 new) |
| `tsc --noEmit -p tsconfig.app.json` | 20 errors, same as baseline. None new; the only one in a modified file is the pre-existing unused `useAuth` import in App.tsx |
| ESLint on modified source/test files | 1 pre-existing error (same unused `useAuth`, present in baseline) + 1 pre-existing fast-refresh warning; nothing new |
| `npm run build` | succeeds |
| Meta files / publishing engines | unchanged (hashes in the integration report) |

## New integration test — `src/features/weekly-plan/__tests__/a3763WeeklyPlanRouting.test.tsx` (20 tests)

The real `App` is rendered in a MemoryRouter. Mocks cover auth/onboarding status, business, billing, actions, i18n, analytics, and the lazy pages that are not under test. No network, Supabase, publishing or demo data is involved.

| Area | Tests |
|---|---|
| Authenticated access | `/semana` renders Tu Semana inside the shell; signed out → `/login?next=%2Fsemana`; onboarding incomplete → `/empezar` |
| `/plan` redirect | lands on `/semana` (old page never renders, no loop); keeps `?origen=email#acciones`; signed-out `/plan?…` goes through login with the original `next` |
| ES/EN label | "Tu Semana" in sidebar, drawer and bottom bar, each linking to `/semana`, with no "Plan" label; "Your Week" ×3 in English |
| Active state | only "Tu Semana" active on `/semana` and after `/plan`, desktop and mobile; "Hoy" active on `/hoy` |
| Mobile bottom bar | still Hoy, Tu Semana, Resumen, Mi negocio, Fuentes |
| Analytics | click fires `trackNavigationClick('plan')` and navigates to `/semana` |
| No duplicates | exactly one `id: 'plan'` item and one `/semana` path in the shell; App routes `WeeklyPlanPage` once and no longer references `PlanPage` |
| Business / subscription | read-only note and no "Marcar como hecha" without premium; no-business state when none is selected |
| Action execution routes | CTA opens `/ejecutar/a-001` (execution page renders); action with `cta_to` opens `/herramientas` |
| No regressions | the other customer routes are still declared; `/hoy` renders |
| No publishing/demo dependencies | the redirect and the shell contain no supabase/publish/demo/fetch/invoke references |

## Updated existing tests (authorized, each marked `A3.7.6.3 RE-PIN`)

- **App.tsx fingerprint f0c81e90 → 4466949b** in:
  - a281TrustCleanup
  - a3741 AUTHORIZED_REPINS
  - a3743GateB2Part1Security
  - a3743GateB3Fix01
  - a3743GateB3Fix02
  - a273Roadmap
  - a3544SocialIntegration
  - a272TodayIntelligence
- **Route counts +1 (`/semana`)** in:
  - a281
  - a271
  - a33
  - f03Stage2b (×2)
  - a3732
  - a3752 (also adds `/semana` to the customer-route list and `<Route` 36 → 37)
  - a273
  - a272
- **Chained test-file fingerprints:**
  - a3741 AUTHORIZED_REPINS `now` for a281, a273, a272, a3544 and a3732;
  - a3743InstagramGateA pin of a3741 (4f4f2269 → b042af11).
- **Labels and checks:**
  - toolsHub: sidebar label "Plan" → "Tu Semana".
  - a3762: "does not touch routing" becomes "mounted only through the /semana route, never from the navigation shell".
- **No assertion was weakened or removed.** Every change only updates a pinned value to reflect the authorized route and label change.
