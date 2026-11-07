# A3.7.6.7 — Regression Test Report

## Results
| Check | Result |
|---|---|
| New file `a3767ReadOnlyReconciliation.test.tsx` | 23 / 23 pass |
| Same new tests run against the pre-fix A3.7.6.5 code (isolated copy outside the project) | 3 fail as expected (read-only hiding ×2, copy ×1), proving they detect the defect |
| Full suite | **97 files, 3,247 / 3,247 pass** (baseline 3,224 + 23 new) |
| `tsc --noEmit -p tsconfig.app.json` | 20 errors, all pre-existing (baseline 20); 0 in modified or new files |
| ESLint on all 10 modified/new files | 0 errors, 0 warnings |
| `npm run build` | OK |

## Coverage of the required scenarios
| # | Scenario | Test(s) |
|---|---|---|
| 1 | Saved phone hides the old phone recommendation | pure 1; provider "filled profile gaps are hidden" |
| 2 | Saved opening hours hide the schedule recommendation | pure 2; provider |
| 3 | Saved target audience hides the audience recommendation | pure 3; provider |
| 4 | Missing services and website remain | pure 4; provider (website) |
| 5 | Missing GBP recommendation remains | pure 5, 5b; provider 5c (connecting GBP source) |
| 6 | No duplicates, nothing added | pure 6 |
| 7 | No DB writes in read-only mode | provider 7 (no `syncActions`/`transitionAction`; `complete` rejected) and the no-DB-access helper check |
| 8 | Completed/dismissed history untouched | pure 8 (returned equal, input not mutated) |
| 9 | No cross-business exposure | pure 9 (scoped to `business.id`) and the provider `latestBusinessId` guard |
| 10 | Correct after a profile update | provider 10 |
| 11 | Correct after reloading Tu Semana | provider 11 (`ensureFresh` + `refresh`, stable result) |
| 12 | Premium reconciliation unchanged | pure 12 (`planSync` → COMPLETED, no re-insert); existing `repository.test.ts` suite unchanged and passing |
| 13 | Re-enabling premium allows persistent reconciliation | provider 13 (premium path calls `syncActions`, not `loadActions`) |
| 14 | Hoy and Tu Semana consistent | pure 14 (`buildWeeklyPlan` and `selectTodayActions` on the same list) |
| 15 | Progress not misleadingly increased | pure 15 (`done` unchanged, `resolvedThisWeek` empty, `pending` −3) |
| 16 | Copy accurate in ES and EN | copy 16; updated a3762 page test |
| 17 | Meta connection and publishing unaffected | 17 (fingerprints); protected suites a351/a3512/a3521/a353/a3753/a3741/a3742/a3743 all pass |
| 18 | Safe when source loading fails | provider 18 (nothing hidden, no error shown) |

## Updated existing tests
- a3762 (copy text) and billingModel S1 (read call form).
- Authorized hash re-pins:
  - `ActionsProvider.tsx` in a281 and a273;
  - the a3741 AUTHORIZED_REPINS entries for a281 and a273;
  - the a3743 pin of a3741.

  All are test-file-only changes; no protected source file changed.
