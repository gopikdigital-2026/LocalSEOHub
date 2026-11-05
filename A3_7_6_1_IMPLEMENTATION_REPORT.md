# A3.7.6.1 — Tu Semana: Weekly Plan Logic — Implementation Report

**Mode:** controlled implementation, no deployment. **Scope:** pure presentation logic only. There is no UI, no route and no navigation change.

## 1. Reuse map (from A3.7.6.0)

| Need | Reused as-is (`src/features/actions/engine.ts` unless noted) |
|---|---|
| Ranking / priority | `prioritize` (score desc, ruleId asc) via `openActions`; stored `priority` (HIGH/MEDIUM/LOW) passed through unchanged |
| First three items | `selectTodayActions` (IN_PROGRESS first, doable-swap rule). Same as Hoy |
| Week boundary | `weekStart` (Monday 00:00 local) and `weekKey` (`src/features/weekly-content/model.ts`) |
| Outcome classification | `actionOutcome` (executed / data_completed / dismissed / open) plus the existing `metadata.auto_closed` flag written by `repository.ts` |
| Progress | `buildActionReport().weeklyProgress`, which is already used by Hoy, Plan and Informes |
| Manual completion rule | `canMarkDone` (self-resolving types cannot be ticked) |
| Copy and origin | `localizeAction` (`metadata.copy[lang]`) and `actionOrigin` |
| Persistence, idempotency, isolation | Unchanged: `business_actions` with owner RLS, the partial unique index `business_actions_open_rule_unique`, and conditional status updates in `repository.ts` |

No second engine was created. The new module ranks nothing on its own: it reads the engine's output and caps it.

## 2. New files

| File | Purpose |
|---|---|
| `src/features/weekly-plan/model.ts` | `buildWeeklyPlan`, `selectWeeklyFocus`, `scopeActions`, `weekBounds`, `WEEK_FOCUS_MAX=5`, `WEEK_PLAN_MAX=8` |
| `src/features/weekly-plan/copy.ts` | `WEEKLY_PLAN_COPY` `{es,en}`: source labels, honest fallback "why" text per source type, effort-estimate label, progress, read-only and time-zone notes |
| `src/features/weekly-plan/__tests__/a3761WeeklyPlanModel.test.ts` | 26 focused tests |

**Modified existing files:** none. **Deleted:** none.

## 3. Behaviour

- **Selection:** focus = `selectTodayActions(actions)`, followed by the remaining `openActions` in engine order, capped at 5. "Later" holds the next items up to 8 in total. No item appears twice.
- **Why:** the stored localized `reason`. If it is empty, a source-type explanation is shown instead (for example, general best practice is labelled as "not measured data about your business").
- **Effort:** shown only when the stored `effortMinutes` is an integer from 1 to 600, which matches the database CHECK. It is always flagged `isEstimate: true` and labelled "(estimado)" / "(estimate)". Otherwise it is null.
- **Source:** `sourceType`, `origin` (`actionOrigin`) and a localized `sourceLabel`.
- **States:** `pending`, `in_progress`, `executed`, `data_completed`, `dismissed` (by the user) and `outdated` (auto-closed because it no longer applies). Each closed state has its own list, filtered to the window [Monday 00:00, next Monday 00:00).
- **Progress:** `percent` is taken from `buildActionReport`, so there is a single source of truth: (executed + data_completed this week) / (that + open). Dismissed and outdated actions are excluded from both sides. `percent` is null when there is nothing to count.
- **Changing action set:** `addedThisWeek` counts open actions created this week, so the page can explain a falling percentage instead of hiding it.
- **Subscription:** `canAct = access.hasPremium === true`, which mirrors `ActionsProvider`. When access is `false` or `null` (unknown), the plan is visible but `readOnly`, with `canMarkDone`/`canDismiss` false. Server-side protection is unchanged (RLS policies "Premium required to create/update actions").
- **Business isolation:** `scopeActions` drops rows whose `businessId` differs from the requested business. This is defence in depth only; RLS remains the real boundary.
- **Duplicates:** rows are de-duplicated by id (the newest `updatedAt` is kept) and limited to one open row per rule (the highest-ranked is kept), mirroring the database's partial unique index.
- **Determinism:** the input is sorted by id before ranking, so the result does not depend on input order. The input is never mutated.
- **No integrations:** works with only profile or general actions. When connection actions rank first, the existing doable-swap rule still offers something the user can do. SOURCE_REQUIRED items show origin `unavailable` and cannot be ticked. Nothing is labelled verified unless its stored `sourceType` is `VERIFIED_FINDING`.

## 4. Deliberate deviations from the A3.7.6.0 plan

- `buildWeeklyPlan` takes `{ businessId, actions, lang, access, goal?, now? }` and does **not** take the client-side roadmap. Merging roadmap gaps into the plan would create a second selection source. The roadmap stays where it is today.
- Closed-in-week lists have an upper bound (the next Monday). `buildActionReport` has only a lower bound. The two differ only when timestamps are later than `now`, which does not happen in normal use; a test asserts that they agree.

## 5. Safety

- No change to the database, migrations, server functions, secrets, OAuth or deployment.
- No imports from Supabase, repositories, publishing, Meta/Instagram/Facebook, demo data or `lib/`. This is enforced by a test.
- A3.7.5.3 baseline hashes are unchanged: 3729892653ebfdba, 50845c8d1b85d2be, e4e5b66a372e97c8, 5bfc455450d14345, da754befec158efc. The engine bundle hash is unchanged: 58956f462595b404.

## 6. Limitations

1. **Time zone:** the week is computed in the device's local time (existing `weekStart`). There is no stored business time zone. A user who changes device time zone may see the boundary move by hours. The server's weekly-content window (−14h/+12h) tolerates this. Documented in `timeZoneNote`; no new time-zone system was added.
2. **Live denominator:** the plan is not a frozen snapshot, so new actions that appear mid-week lower the percentage. This is mitigated by exposing `addedThisWeek`, not prevented. Freezing would need new storage (Option B), which is out of scope.
3. **GBP unavailable:** plans lean on profile, goal and general actions until Google data is available.
4. **Copy completeness:** rows without `metadata.copy[lang]` fall back to the stored (Spanish) title. Measuring this is the read-only Stage 1 data check, which is still pending.
5. **Not wired yet:** nothing in the app imports this module yet. Hoy, Plan and Informes are unchanged.

## 7. Verdict

**GO — WEEKLY PLAN LOGIC READY FOR INDEPENDENT REVIEW**
