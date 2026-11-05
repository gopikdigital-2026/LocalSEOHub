# A3.7.6.5 — Regression Test Report

## 1. New file: `src/features/weekly-plan/__tests__/a3765WeeklyPlanVisibility.test.tsx` (27 tests)

The tests render the real WeeklyPlanPage with the same context mocks as a3762 (BusinessContext, BillingContext, BillingNotices, ActionsContext, i18n, navigate), and call the real `buildWeeklyPlan`, `openActions` and `selectTodayActions`.

| Requirement | Test(s) |
|---|---|
| 0, 3, 5, 8, 12, 20 open actions; each appears exactly once across focus + later | model `it.each([0,3,5,8,12,20])` "focus + later contain each exactly once": count = n, unique = n, set equals the input ids, focus = min(n,5), later = max(0,n−5) |
| No action silently hidden (page) | page `it.each([0,3,5,8,12,20])` "renders all %i open actions once the later section is expanded" |
| Priority order and Today-first kept | `it.each([8,12,20])`: the focus starts with `selectTodayActions`, and focus-rest + later equals `openActions` order minus Today, exactly |
| Deterministic ordering | same `later` for the input and the reversed input |
| No duplicates | the unique-set assertions above |
| No cross-business exposure | 10 own + 15 other-business actions → exactly 10 shown, all `businessId === BIZ` |
| Read-only can view all but not modify | model: 12 shown, every `canMarkDone`/`canDismiss` false, `readOnly` true; page: 12 rendered, 0 "Marcar como hecha", 0 "Descartar", read-only note visible |
| ES/EN labels | `Para después (15)` for 20 actions (collapsed, `aria-expanded="false"`); `For later (7)` for 12 actions in EN |
| No empty section | `it.each([0,3,5])`: no toggle and no "Para después" text |
| Existing controls work | the 12th action (past the old 8th position): "Marcar como hecha" calls `complete` once with that exact action, and "Descartar" calls `dismiss` with it |
| Classifications unchanged | executed, auto-resolved, dismissed and auto-closed (outdated) actions are kept out of focus/later; the 4 closed lists have 4 items; dismissed → `dismissed`, auto_closed → `outdated` |
| Progress unchanged | 20 open + 1 completed → `pending` 20, `done` 1 |

Negative control: with the 8-action cap temporarily restored, this file gave **12 failed / 15 passed**. With the fix it gives **27 / 27 passed**.

## 2. Updated existing tests

| Test | Original → new |
|---|---|
| a3761WeeklyPlanModel.test.ts:47–53 | `focus+later === WEEK_PLAN_MAX (8)` → `=== 20` (all inputs); the focus-cap and no-duplicates assertions are kept |
| a3762WeeklyPlanPage.test.tsx:138–150 | `Para después (3)`, later 3, total 8 → `Para después (7)`, later 7, total 12; ordering, collapsed state and `aria-expanded` assertions are kept |

No `.skip`, `.only` or `.todo` was added, and the `expect(` counts are unchanged.

## 3. Verification

| Check | A3.7.6.3 baseline | After the fix | New defects |
|---|---|---|---|
| Full suite | 3,197 / 3,197 (95 files) | **3,224 / 3,224** passed, 0 failed, 0 skipped (96 files; +27 new) | none |
| `npx tsc --noEmit -p tsconfig.app.json` | 20 errors (pre-existing, none in weekly-plan) | 20 errors, none in weekly-plan | none |
| ESLint: model.ts, a3761, a3762, a3765 | — | 0 problems | none |
| `npm run build` | built | built | none |
| Protected fingerprints (Meta ×5, engines 58956f462595b404, WeeklyPlanPage, PlanPage, App, actions engine and rules) | — | unchanged | none |

## 4. Source archive

- File: `deliverables/localseohub-a3765-weekly-visibility-fix.zip`
- SHA-256: see the closing summary of this stage. The checksum is computed after this report is written, so it cannot be embedded in a file the archive contains.

**GO — TU SEMANA ACTION VISIBILITY RESTORED**
