# A3.7.6.7 — Tu Semana: Stale Recommendations Microfix Report

Mode: controlled microfix. No deployment, no DB/RLS/schema change, no production writes, no Stripe/subscription change, no Meta connection or publishing change.

## 1. Baseline gate
- `A3_7_6_6_STALE_RECOMMENDATIONS_DIAGNOSTIC.md` read; its root cause and microfix scope are followed exactly.
- Workspace matched `deliverables/localseohub-a3765-weekly-visibility-fix.zip` (`diff -rq` empty) before editing.
- Baseline: 3,224 / 3,224 tests passing, 20 pre-existing tsc errors, build OK.
- All protected fingerprints were verified before and after (section 6). Result: **GO to edit**.

## 2. Defects fixed
1. **Read-only accounts showed already-satisfied profile recommendations as pending.** Root cause: the `!canWrite` branch of `ActionsProvider.run` displayed the saved actions without evaluating them against the current business, and the premium-only RLS prevents persisting resolutions.
2. **The missing-sources notice named Facebook and Instagram** even when only Google Business Profile was unavailable.

## 3. Changes
### Source (3 files)
| File | Change |
|---|---|
| `src/features/actions/readOnlyView.ts` (new) | Pure `hideSatisfiedProfileActions(business, sources, saved, now)`. It scopes the actions to `business.id`, runs the existing `planSync`, and removes only those `toResolve` actions whose `sourceType === 'BUSINESS_PROFILE'`. It never adds, mutates or reorders actions, and has no DB access. |
| `src/features/actions/ActionsProvider.tsx` | The existing source mapping is extracted to `loadSourceSnapshots` (same mapping, now shared by both paths). In the read-only branch: `loadActions` → `loadSourceSnapshots` → `hideSatisfiedProfileActions`. If loading sources fails, the saved list is shown unfiltered (fail-safe). A `latestBusinessId` guard drops a result whose business is no longer current. No `syncActions`, insert, update or delete in this branch. The premium branch behaviour is unchanged. |
| `src/features/weekly-plan/pageCopy.ts` | `missingSources` ES: "Algunas fuentes de datos todavía no están disponibles. Conéctalas para obtener recomendaciones más precisas." EN: "Some data sources are not yet available. Connect them for more precise recommendations." The "Ver fuentes" → `/fuentes` navigation is unchanged (`WeeklyPlanPage.tsx` untouched). |

### Tests (1 new, 6 updated)
| File | Change |
|---|---|
| `src/features/actions/__tests__/a3767ReadOnlyReconciliation.test.tsx` | New: 23 regression tests (see the regression report). |
| `src/features/weekly-plan/__tests__/a3762WeeklyPlanPage.test.tsx` | The copy assertion now expects the new wording. |
| `src/features/billing/__tests__/billingModel.test.ts` | S1 "reads stay available" assertion now matches `const saved = await loadActions(businessId)`. |
| `src/components/__tests__/a281TrustCleanup.test.ts` | Authorized re-pin of `ActionsProvider.tsx` (3236e3e8… → 7e929e08…). |
| `src/features/roadmap/__tests__/a273Roadmap.test.ts` | Same authorized re-pin. |
| `src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts` | Cascade: AUTHORIZED_REPINS `now` hashes for a281 (804246c9… → 82259ae5…) and a273 (cc367fa1… → fb9fd051…). Test file only. |
| `src/features/publications/__tests__/a3743InstagramGateA.test.ts` | Cascade: a3741 pin (b042af11… → d8e3c1d5…). Test file only. |

No other file changed. `engine.ts`, `rules.ts`, `repository.ts`, `types.ts`, `WeeklyPlanPage.tsx`, `model.ts`, `PlanPage.tsx`, `TodayPage.tsx` and `App.tsx` are byte-identical.

## 4. Behaviour
**Read-only account**
- Saved recommendations remain visible, except open BUSINESS_PROFILE items whose data is now filled.
- Website, services and Google Business Profile recommendations stay while they still apply.
- Actions cannot be started, completed or dismissed (`PremiumRequiredError`, unchanged).
- Zero DB writes: stored statuses and history are untouched.
- Hoy and Tu Semana both read the same `actions` list from the provider, so they stay consistent.

**Premium account**
- Unchanged: `syncActions` persists `COMPLETED` with `resolved_by='condition_met'`, history is intact, and resolved actions are not recreated.

**Read-only → premium**
- The next run takes the premium path and persists the resolutions normally.

## 5. Known limitations
- Hidden items are not persisted as completed while the account is read-only. The weekly "done" count does not increase. The pending count drops, so the progress percentage can rise slightly when there is already completed work this week; this reflects that those tasks are genuinely no longer pending.
- If the source snapshot cannot be loaded, nothing is hidden (by design), so stale profile items could reappear until the next successful load.
- The production data for the affected business is unchanged; its rows remain `PENDING` until the account is premium again.
- Not deployed.

## 6. Protected fingerprints (sha256, first 16), unchanged
MetaConnectionCard 3729892653ebfdba · metaStatus 50845c8d1b85d2be · MetaPageSelectModal e4e5b66a372e97c8 · MetaCallbackPage 5bfc455450d14345 · a3753 test da754befec158efc · FB/IG engines aggregate 58956f462595b404 · WeeklyPlanPage b3b962b8e5e26b1e · PlanPage 109a1a58060ac4b2 · TodayPage 78cdf392ae270d80 · App 4466949b9560d932 · engine 2fa3eb2913328eb1 · rules d32c4bb98a2819f7 · repository 0aff1a5a1c9fa738 · weekly-plan model 8c4d50d63efa3601 · migrations count 62 (unchanged).

New pins: ActionsProvider 7e929e087f22fc93 · readOnlyView 55382750d070c997 · pageCopy 26f7d91b9d0fc0c6.

## 7. Verdict
**GO — STALE RECOMMENDATIONS MICROFIX COMPLETE**

STOP. Await independent review before deployment.
