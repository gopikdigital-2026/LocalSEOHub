# A3.7.6.3 — Tu Semana: Routing & Navigation Integration Report

Mode: controlled implementation, no deployment. No migrations, data changes, secrets/OAuth changes, publishing calls or Meta/engine edits.

## 1. Baseline gate (verified before editing)

| Check | Result |
|---|---|
| A3.7.6.1 / A3.7.6.2 source (weekly-plan feature, App, AppShellV2, PlanPage) vs `deliverables/localseohub-a3762-weekly-plan-page.zip` | identical |
| Test suite | 3,177 / 3,177 pass |
| Build | succeeds |
| MetaConnectionCard / metaStatus / MetaPageSelectModal / MetaCallbackPage / a3753 test | 3729892653ebfdba / 50845c8d1b85d2be / e4e5b66a372e97c8 / 5bfc455450d14345 / da754befec158efc |
| `cat supabase/functions/meta-publishing/*.ts supabase/functions/instagram-publishing/*.ts \| sha256sum` | 58956f462595b404 |

Re-checked after the work: every value above is unchanged. `WeeklyPlanPage.tsx` is unchanged (b3b962b8e5e26b1e) and `PlanPage.tsx` is unchanged (109a1a58060ac4b2).

## 2. Routing (`src/App.tsx`)

- The lazy `PlanPage` import has been replaced by `WeeklyPlanPage` (`./features/weekly-plan/WeeklyPlanPage`).
- `<Route path="/semana" element={<WeeklyPlanPage />} />` sits inside the existing `<AppGuard><AppShellV2 /></AppGuard>` layout block, directly after `/hoy`.
  - It therefore has the same protections as every customer route:
    - signed out → `/login?next=/semana`;
    - onboarding incomplete → `/empezar`.
  - Business, billing and actions come from the existing providers in `main.tsx`.
- `<Route path="/plan" element={<LegacyPlanRedirect />} />` is also inside the guarded block.
  - `LegacyPlanRedirect` is `<Navigate to={{ pathname: '/semana', search, hash }} replace />`. Query parameters and hash are kept, and `replace` stops Back from bouncing.
  - There is no loop, because `/semana` renders a page and never redirects.
  - A signed-out visitor on `/plan?x` goes to login with `next=/plan?x`, then `/plan` sends them to `/semana?x`.
- No other route was touched. The route count is 34 → 35 `path=` entries.
- Internal links that still point to `/plan` are served transparently by the redirect and were left as they are, to keep the change minimal:
  - BusinessTimeline
  - WeeklySummaryPage
  - TodaysMissions

  Pointing them at `/semana` directly is an optional follow-up.

## 3. Navigation (`src/app-v2/layouts/AppShellV2.tsx`)

- The nav item is `{ id: 'plan', label: 'Tu Semana', labelEn: 'Your Week', path: '/semana' }`.
- The label is chosen per language through the existing `useI18n()` mechanism with `navLabel(item, lang)`. This applies to the desktop sidebar, the mobile drawer and the mobile bottom bar.
- The analytics id is still `'plan'`, so `trackNavigationClick('plan')` is unchanged and the reporting series stays continuous.
- `BOTTOM_BAR_IDS` is unchanged. The bottom bar still shows Hoy, Tu Semana, Resumen, Mi negocio and Fuentes.
- The active state comes from the existing NavLink `isActive` on `/semana`. After the `/plan` redirect, the entry is also active.
- There is exactly one weekly-plan menu entry, and no menu entry points at `/plan`.

## 4. PlanPage

- `PlanPage.tsx` is no longer routed or imported, but it has **not** been deleted.
- An existing frozen test (a33DiagnosticAction) still pins its fingerprint.
- The A3.7.5.3 review chain and the a3542 approved-integration list still reference it.
- Removing it is a separate, reviewable cleanup step. See the parity report.

## 5. Modified files (exact)

Source:
1. `src/App.tsx` (sha256 4466949b9560d932f092b0de91116b1240c8ffc87c4fce13496a9d571c467f3c)
2. `src/app-v2/layouts/AppShellV2.tsx`

New test:
3. `src/features/weekly-plan/__tests__/a3763WeeklyPlanRouting.test.tsx`

Updated tests (authorized re-pins / route counts / labels, each marked `A3.7.6.3 RE-PIN`):
4. `src/features/weekly-plan/__tests__/a3762WeeklyPlanPage.test.tsx`
5. `src/components/__tests__/a281TrustCleanup.test.ts`
6. `src/features/action-layer/__tests__/a271ActionLayer.test.ts`
7. `src/features/action-layer/__tests__/a33DiagnosticAction.test.ts`
8. `src/features/email-verification/__tests__/f03Stage2b.test.ts`
9. `src/features/internal-access/__tests__/a3752TenantSecurity.test.tsx`
10. `src/features/publications/__tests__/a3732AdaptationGuards.test.ts`
11. `src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts`
12. `src/features/publications/__tests__/a3743GateB2Part1Security.test.ts`
13. `src/features/publications/__tests__/a3743GateB3Fix01ConnectionPreflight.test.ts`
14. `src/features/publications/__tests__/a3743GateB3Fix02StatusAttemptGrant.test.ts`
15. `src/features/publications/__tests__/a3743InstagramGateA.test.ts`
16. `src/features/roadmap/__tests__/a273Roadmap.test.ts`
17. `src/features/social-intelligence/integration/__tests__/a3544SocialIntegration.test.ts`
18. `src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts`
19. `src/features/tools/__tests__/toolsHub.test.ts`

Reports:
20. `A3_7_6_3_INTEGRATION_REPORT.md`
21. `A3_7_6_3_FUNCTIONAL_PARITY_REPORT.md`
22. `A3_7_6_3_TEST_REPORT.md`

No file under `supabase/`, no Meta file and no publishing engine was modified.

## 6. Pre-existing items (not introduced here)

- `src/App.tsx` line 5 has an unused `useAuth` import.
  - It is reported by lint and is one of the 20 baseline tsc errors.
  - It is present byte-for-byte in the A3.7.6.2 baseline.
  - It was left alone to keep the change scoped.
- The tsc error count is 20 before and 20 after.
