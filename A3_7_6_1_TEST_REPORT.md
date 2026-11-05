# A3.7.6.1 — Tu Semana: Weekly Plan Logic — Test Report

## Results

| Check | Result |
|---|---|
| New suite `src/features/weekly-plan/__tests__/a3761WeeklyPlanModel.test.ts` | 26/26 passed |
| New suite under TZ=UTC, Europe/Madrid, America/New_York, Pacific/Auckland | 26/26 passed in each |
| Full suite (`npx vitest run`) | 93 files, **3,144 tests passed** (3,118 baseline + 26 new), 0 failed |
| Typecheck (`npx tsc --noEmit -p tsconfig.app.json`) | 20 errors, all pre-existing (same set as the A3.7.5.3 report); 0 in `src/features/weekly-plan` |
| ESLint on `src/features/weekly-plan` | clean |
| Production build (`npm run build`) | succeeded |
| A3.7.5.3 baseline hashes | unchanged |
| Publishing engines bundle hash | unchanged (58956f462595b404) |

## Coverage by required area

| Area | Tests |
|---|---|
| Selection and priority | First 3 equal `selectTodayActions`; IN_PROGRESS first; the rest in descending score; stored priority, reason, source and estimated effort exposed; localized copy and honest fallback |
| Maximum five | Exactly 5 focus items and 8 in total from 20 candidates; no duplicates between focus and later |
| Empty or incomplete profile | Empty plan → no items, `percent` null; profile gaps only → plan built, origin `user_provided` |
| Missing GBP / Facebook / Instagram | Connection-only top ranks still yield a doable item; connect actions show `unavailable` and cannot be ticked |
| Completion vs dismissal | executed / data_completed / dismissed / outdated each in its own list |
| Auto-closed or outdated | `auto_closed` rows → `outdated`, excluded from progress |
| Progress | 2 done / 1 open = 67%; dismissed and outdated excluded; equals `buildActionReport`; `addedThisWeek` reported |
| Week transitions | Monday 00:00 local; Sunday 23:59 vs Monday 00:00 key change; DST week ends Monday 00:00; last week's closures leave this week's groups |
| Business isolation | Another business's open and completed rows are ignored |
| Subscription | `hasPremium` false or null → read-only, no tick or dismiss; true → allowed (except self-resolving types) |
| Determinism and duplicates | Same output for reversed input; duplicate id keeps the newest row; duplicate open rule shown once; input not mutated |
| Safety | No Supabase, repository, publishing, Meta, demo or `lib/` imports; no `functions.invoke`, `fetch(` or `localStorage` |

## Not tested here

- UI rendering, routing and navigation (not built in this phase).
- Live database data (the Stage 1 read-only check is pending).
- Server-side premium enforcement: unchanged and covered by existing suites.
