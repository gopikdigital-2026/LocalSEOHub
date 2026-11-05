# A3.7.6.2 — Tu Semana — Page Test Report

## Results

| Check | Result |
|---|---|
| New page tests (`a3762WeeklyPlanPage.test.tsx`) | 33/33 pass |
| A3.7.6.1 model tests | 26/26 pass |
| Weekly-plan tests in UTC, America/New_York, Asia/Tokyo and the default time zone | 59/59 each |
| Full suite | 94 files, 3,177 tests, all pass (previously 93 / 3,144; +1 file, +33 tests) |
| TypeScript (`tsc --noEmit -p tsconfig.app.json`) | 20 errors, all pre-existing; 0 in new files |
| ESLint on `src/features/weekly-plan` | clean |
| Production build | succeeds; the page is not in the bundle (not routed) |
| Baseline fingerprints after the work | Meta files, publishing engines, model, copy, App, AppShellV2, PlanPage unchanged |

## Coverage

| Requirement | Tests |
|---|---|
| Weekly content rendering | title, week range, purpose, progress notes, time-zone note; why, source, priority, effort, state per card; invalid effort hidden |
| Five-action limit | 12 actions → 5 numbered in score order |
| Later section | collapsed by default, `aria-expanded` toggles, 3 items; absent when ≤5 actions |
| Empty / loading | business loading, first sync pending, no business, no actions, incomplete profile with and without actions, nothing to count (no bar, no %) |
| Missing connections | `SOURCE_REQUIRED` action → notice + "Ver fuentes"; none otherwise |
| ES / EN | English title, week range, notes, effort, buttons; no Spanish title |
| Read-only subscription | `hasPremium` false and null hide mark/dismiss; false shows note + paywall; "Ver" navigates without `start` |
| Completion / dismissal | calls the provider's `complete` / `dismiss` once; pending CTA calls `start` then navigates; self-closing actions have no manual completion; in-flight double click sends once |
| Automatic vs manual | four activity groups with correct states; dismissed/outdated marked "not counted"; progress 2 of 3 = 67% |
| Progress changes | "2 tareas nuevas" note |
| Error handling | load error + retry; completion failure keeps action pending, alert dismissible; premium refusal message; failed start does not navigate |
| Business isolation | other business's open and closed rows never render or count; no business → no actions |
| Mobile structure / a11y | one h1, labelled sections, `flex-col sm:flex-row` controls, no fixed pixel widths, labelled cards, progress bar with `aria-valuenow` |
| No publishing / demo | static scan of page, card and copy imports; App and AppShellV2 do not reference the page |

## Not covered here

- Real browser rendering and visual review (no browser in this environment).
- Live data and server-side premium enforcement (unchanged; covered by earlier suites and RLS).
