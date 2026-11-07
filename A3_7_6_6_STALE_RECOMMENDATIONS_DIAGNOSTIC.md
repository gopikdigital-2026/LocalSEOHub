# A3.7.6.6 — Tu Semana: Stale Recommendations Root Cause Diagnostic

Mode: strict read-only. No source, test, schema, data, RLS, OAuth, secret or Meta changes. No deploy.

## 1. Executive summary
Tu Semana keeps showing "Añade el teléfono de tu negocio", "Indica tu horario de apertura" and "Describe a tu cliente ideal" for an account with **no active trial or subscription (read-only plan)**. The saved values do reach the database and use the same field names the rules read. The defect is in the action lifecycle. For read-only accounts, `ActionsProvider.run` only reloads the saved actions and never runs reconciliation (`planSync`). Actions whose condition is now met therefore stay `PENDING` indefinitely. Persisting the resolution is also blocked server-side by the premium-only UPDATE policy on `business_actions`. A client-only, in-memory reconciliation for the read-only path fixes the visible symptom without any DB change.

## 2. Symptoms
- A–C: phone, opening hours and ideal-customer actions shown as pending although saved in Mi negocio ("Guardar cambios" confirmed, values persist after reload).
- D: services, website and Google Business Profile recommendations shown; these are legitimate.
- E: the notice "Algunas fuentes no están conectadas… Google, Facebook ni Instagram" appears while Meta is connected.

## 3. Baseline
| Check | Result |
|---|---|
| A3.7.6.5 ZIP vs workspace (`diff -rq`) | identical |
| Meta fingerprints (Card / metaStatus / PageSelectModal / Callback / a3753 test) | 3729892653ebfdba / 50845c8d1b85d2be / e4e5b66a372e97c8 / 5bfc455450d14345 / da754befec158efc, unchanged |
| FB/IG engines aggregate | 58956f462595b404, unchanged |
| WeeklyPlanPage / PlanPage / App / engine / rules | b3b962b8e5e26b1e / 109a1a58060ac4b2 / 4466949b9560d932 / 2fa3eb2913328eb1 / d32c4bb98a2819f7, unchanged |
| weekly-plan model.ts | 8c4d50d63efa3601…, matches A3.7.6.5 |
| Test suite | 3,224 / 3,224 pass |
| tsc (app) | 20 errors, all pre-existing, none new |
| ESLint (actions, weekly-plan, business-memory) | 0 errors, 1 pre-existing warning |
| Build | OK |

## 4. Data-flow map
Mi negocio form (`BusinessProfilePage`: `phone`, `schedule`, `targetAudience`) → `validateProfile` → `profileToPatch` (`businessRecord.ts`: trim; `targetAudience` → `target_audience`) → `BusinessContext.updateBusiness` → `updateBusinessRecord` (UPDATE `businesses`, returns row) → `setCurrentBusiness(updated)` → `ActionsProvider` effect on `currentBusiness` → `run(false)` → **branch on `canWrite`** → rules (`rules.ts`: `isBlank(phone)`, `isBlank(schedule)`, `isBlank(target_audience)`) → `planSync` / `syncActions` (`repository.ts`) → `actions` → `buildWeeklyPlan` → `WeeklyPlanPage`.

Field names and normalisation agree end to end. Production read-only check of the affected business: phone, schedule and audience present; website empty; services 0; `businesses.updated_at` later than the last action write.

## 5. Lifecycle findings
- Generation and resolution live in `planSync` (`engine.ts:128`). Open actions whose rule no longer fires go to `toResolve`: `COMPLETED` with `metadata.resolved_by='condition_met'` for BUSINESS_PROFILE / SOURCE_REQUIRED / VERIFIED_FINDING; `DISMISSED` with `auto_closed` for other types. Dedup prevents recreation.
- `ActionsProvider.run` (lines 62–68): `if (!canWrite) { setActions(await loadActions(id)); …; return; }`. Read-only accounts **never call `planSync`**, so they get no resolve, no fingerprint and no reconciliation. `ensureFresh` and `refresh` both route to the same branch.
- Lines 69–82 (premium path): load sources, fingerprint, `syncActions` → resolutions are persisted.
- DB: the `business_actions` UPDATE and INSERT policies require `current_user_has_premium()`. Even if the client tried, a read-only user cannot persist the resolution.
- Production: the affected owner has `has_premium=false`. The five profile actions are `PENDING`, with no action write after the account became read-only, while the business was updated later.

## 6. Hypothesis table
| H | Description | Evidence for | Evidence against | Classification |
|---|---|---|---|---|
| H1 | Field mismatch form ↔ DB ↔ rule | none | same names and trim at every hop; repo test resolves `add_business_phone` | Rejected |
| H2 | Missing reconciliation | read-only branch skips `planSync`; RLS blocks the UPDATE | premium path reconciles correctly | **Confirmed (read-only path)** |
| H3 | Stale state / cache | actions not refreshed after save for read-only users | `currentBusiness` is updated and the effect re-runs | Confirmed as a consequence of H2 |
| H4 | Wrong rule conditions | none | rules check `isBlank` of the right fields; `planSync` resolves them in the probe | Rejected |
| H5 | Multiple defects | the missing-sources copy always names Facebook/Instagram | it is secondary and cosmetic | Confirmed (secondary) |

## 7. Reproduction evidence (isolated probe in /tmp/scr, not in the project)
1–2. Empty profile → `syncActions` generates phone, schedule and audience actions as `PENDING`.
3. Fields filled (`updated_at` advanced).
4. **Read-only path** (`loadActions` only): statuses stay `PENDING`; in-memory `planSync` reports all three in `toResolve → COMPLETED`.
5–6. `buildWeeklyPlan(hasPremium:false)` still contains **3** profile items → **defect reproduced**.
7. **Premium path** (`syncActions`): all three `COMPLETED/condition_met`; the weekly plan contains 0; re-sync recreates 0.

The target-audience case is covered by the same probe.

## 8. Root cause
The read-only branch of `ActionsProvider.run` (`src/features/actions/ActionsProvider.tsx`, lines 62–68) shows saved actions without reconciling them against the current business data. Combined with premium-only write policies, satisfied data-gap actions for non-premium accounts can never close and keep showing in Tu Semana.

Secondary: `pageCopy.ts:90` (ES) and `:138` (EN). The missing-sources notice is generic and names Facebook and Instagram whenever any `SOURCE_REQUIRED` item is present (here only Google Business Profile, which is `connecting`). This wrongly implies Meta is disconnected.

## 9. File / function references
- `src/features/actions/ActionsProvider.tsx`: `run` (62–82), `ensureFresh`/`refresh` (151–152), `transition` (137), `currentBusiness` effect (97).
- `src/features/actions/engine.ts`: `planSync` (128–140), `SELF_RESOLVING` (112), `actionOutcome` (121).
- `src/features/actions/repository.ts`: `loadActions` (92–102), `syncActions` (116–149).
- `src/features/actions/rules.ts`: phone 181, website 191, schedule 205–219, services 221–235, audience 237–251, GBP 347–375.
- `src/features/business-memory/businessRecord.ts`: `profileToPatch` (65–67); `BusinessContext.tsx`: `updateBusiness` (70–74).
- `src/features/weekly-plan/WeeklyPlanPage.tsx`: `missingSources` (131, 163–165); `pageCopy.ts` 90 / 138.

## 10. Microfix proposal (not implemented)
- **ActionsProvider.run, `!canWrite` branch:** after `loadActions`, also `loadSources` and run the pure `planSync(currentBusiness, sources, saved)`. Drop from the in-memory list the actions in `toResolve` whose `sourceType` is `BUSINESS_PROFILE` (optionally all of `toResolve`). Do not write to the DB.
  - Before: satisfied actions stay visible.
  - After: they disappear from Tu Semana and Today. No inserts for read-only users (the `toInsert` result is ignored).
- **Copy (optional):** make the missing-sources notice name only the sources actually missing (or Google only), without implying Meta is disconnected.
- **Effect on existing rows:** none while read-only. When premium is regained, the normal `syncActions` persists `COMPLETED/condition_met`, keeping history and the auto-resolved vs manual distinction. Dismissed actions are untouched (`planSync` only considers open ones).
- **DB dependency:** none for the visible fix. Persisting resolutions for read-only users would require an RLS / SECURITY DEFINER change. That is out of scope and is not proposed here.

## 11. Regression tests (to add with the fix)
1. Read-only: saved PENDING phone/schedule/audience plus a filled business → not in `actions` or the weekly plan; no `update`/`insert` calls.
2. Read-only: website/services still blank → those actions remain.
3. Read-only: DISMISSED and COMPLETED rows are unchanged and not reopened.
4. Read-only: SOURCE_REQUIRED actions are kept when the same source snapshot still lacks the source.
5. Premium: the existing reconciliation and no-recreation behaviour is unchanged (existing repository tests).
6. Business isolation: actions of another business are never shown.
7. Missing-sources copy: does not mention Facebook/Instagram when only Google is missing (if the copy change is approved).

## 12. Risks
- The source snapshot must be the same one the premium path uses, or source-based actions could be wrongly hidden. Limiting the filter to `BUSINESS_PROFILE` removes this risk.
- Progress counters for read-only users will not count hidden items as "completed" until persisted. This is acceptable and should be documented.
- Other consumers of `actions` (Today) change accordingly, which is intended.
- One extra `loadSources` read per refresh for read-only users.

## 13. Verdict
**ROOT CAUSE CONFIRMED — MICROFIX READY**

STOP. Await independent review and explicit authorization before implementing any correction.
