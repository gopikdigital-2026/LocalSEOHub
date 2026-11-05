# A3.7.6.5 — Tu Semana: Fix Hidden Weekly Actions (Microfix Report)

Mode: controlled microfix. Nothing was deployed or published, and there were no database, secret, OAuth or backend changes.

## 1. Baseline (verified before any change)

| Check | Result |
|---|---|
| A3.7.6.4 reports read | `A3_7_6_4_INDEPENDENT_AUDIT.md` (finding F1), `A3_7_6_4_FUNCTIONAL_PARITY_VERIFICATION.md` (row 3 → D), `A3_7_6_4_TEST_REPIN_VERIFICATION.md` |
| A3.7.6.3 archive | `deliverables/localseohub-a3763-tu-semana-integration.zip` sha256 `58a4a4154d9393dcc4147473375ec31a88fa9863c5830ae8924e9c09e17c4092`; extracted to `/tmp/a5base`; `diff -rq` against the workspace shows it **identical** |
| Test suite | 3,197 / 3,197 passed |

Protected fingerprints (sha256, first 16 hex), unchanged before and after the fix:

| File | Fingerprint |
|---|---|
| MetaConnectionCard.tsx | 3729892653ebfdba |
| metaStatus.ts | 50845c8d1b85d2be |
| MetaPageSelectModal.tsx | e4e5b66a372e97c8 |
| MetaCallbackPage.tsx | 5bfc455450d14345 |
| a3753CommercialConnection.test.tsx | da754befec158efc |
| `cat supabase/functions/meta-publishing/*.ts supabase/functions/instagram-publishing/*.ts` | 58956f462595b404 |
| WeeklyPlanPage.tsx | b3b962b8e5e26b1e |
| PlanPage.tsx | 109a1a58060ac4b2 |
| App.tsx | 4466949b9560d932 |
| actions/engine.ts | 2fa3eb2913328eb1 |
| actions/rules.ts | d32c4bb98a2819f7 |

## 2. The fix

`src/features/weekly-plan/model.ts` is the only production change. The diff against the A3.7.6.3 baseline:

```diff
 export const WEEK_FOCUS_MAX = 5;
-export const WEEK_PLAN_MAX = 8;
...
-  const later = rest.filter((a) => !inFocus.has(a.id)).slice(0, WEEK_PLAN_MAX - focus.length);
+  const later = rest.filter((a) => !inFocus.has(a.id));
```

`WEEK_PLAN_MAX` had no other production use, so the constant was removed rather than left orphaned.

### Requirements

**Preserved:**
- The 5-item focus cap: `focus = [...today, ...rest].slice(0, WEEK_FOCUS_MAX)` is untouched (model.ts:101).
- Today-first selection and priority order: `selectTodayActions`, then `openActions` (engine `prioritize`), both untouched.
- The completion and dismissal paths: WeeklyPlanPage `run`/`complete`/`dismiss` and ActionsContext are untouched.

**Changed:**
- "Para después" / "For later" now contains every remaining open action not in focus. There is no second cap.

**Unchanged, confirmed by the new tests:**
- No duplicates: `later` is `rest` minus `focus`, and `rest` excludes Today, so each id appears once.
- Deterministic ordering: `rest` is the engine-prioritised order.
- Business isolation: `scopeActions(businessId, …)` runs before selection (model.ts:131).
- Subscription restriction: `toItem(…, canAct)` drives `canMarkDone`/`canDismiss`; the page's read-only handling is unchanged.
- Collapsed by default: `useState(false)` (WeeklyPlanPage.tsx:61, unchanged).

**Already handled by the page, no change needed:**
- The heading count comes from the existing `laterTitle(n)`: ES `Para después (${n})` (pageCopy.ts:60), EN `For later (${n})` (pageCopy.ts:108).
- The section is not rendered when empty: `plan.later.length > 0 &&` (WeeklyPlanPage.tsx:196).
- Progress is calculated from `buildActionReport(scoped…)`, independent of the focus and later lists (model.ts:139–153, unchanged).

The engine, rules, repository, migrations, permissions, Meta and publishing files, PlanPage and routing are all unchanged.

## 3. Exact changed-file list (vs the A3.7.6.3 baseline)

| File | Type | sha256 (16) before → after |
|---|---|---|
| src/features/weekly-plan/model.ts | production | 06892478c16d02a4 → 8c4d50d63efa3601 |
| src/features/weekly-plan/__tests__/a3761WeeklyPlanModel.test.ts | test (expectation) | 36c0f991f139bbdd → 03bb450b1fb06896 |
| src/features/weekly-plan/__tests__/a3762WeeklyPlanPage.test.tsx | test (expectation) | a9f1a235bacd27f6 → 7a6c58653d8c0ec1 |
| src/features/weekly-plan/__tests__/a3765WeeklyPlanVisibility.test.tsx | new test | — → 79bf6b48958676d5 |
| A3_7_6_4_*.md (3), A3_7_6_5_*.md (2) | reports | — |

No other file differs (`diff -rq /tmp/a5base .`). No other test pins these files.

## 4. Why two existing expectations changed

Both assertions encoded the defect that A3.7.6.4 confirmed, so they could not stay as they were. The `expect(` counts are unchanged (a3761: 63 → 63; a3762: 96 → 96) and no assertion was removed.

**a3761, "never shows more than five focus actions and eight in total":**
- `toBe(WEEK_PLAN_MAX)` becomes `toBe(20)` with 20 inputs.
- The test is renamed "…lists every other open action for later".
- The focus-equals-5 and no-duplicates assertions are kept.

**a3762, "…up to three later actions…":**
- With 12 actions, the toggle label goes from `Para después (3)` to `Para después (7)`, the later list from 3 to 7, and the total from 8 to 12.
- The rank-order, collapsed-by-default and `aria-expanded` assertions are kept.

## 5. Confirmation

Every applicable open action of the current business is now reachable from `/semana`: 5 in focus, and all the rest in the collapsible later list. Each one carries its normal controls (open, prepare, mark done, dismiss), subject to the unchanged subscription rules.

The negative control confirms the new tests catch the defect: with the old cap temporarily restored, `a3765WeeklyPlanVisibility.test.tsx` gave 12 failed / 15 passed. With the fix, 27 / 27 pass. The fix was restored and its hash re-verified (8c4d50d6…).

## 6. Deliverable archive

`deliverables/localseohub-a3765-weekly-visibility-fix.zip`. It uses the same exclusions as earlier archives: node_modules, dist, .env, .bolt, *.zip, deliverables. Its SHA-256 is given in the closing summary of this stage. It is computed after the reports are written, so it cannot be embedded in a file the archive contains.

## 7. Remaining limitations

- No browser is available in this environment. The page was verified with rendered-DOM tests (jsdom), not visually.
- With many actions (e.g. 20), the expanded later list is long. That is the intended trade-off: complete access over brevity. Category grouping was not reintroduced, since that would be a redesign.
- The A3.7.6.4 risks F2 (static checks still on the unrouted PlanPage) and F3 (paywall analytics surface name) are out of scope and remain open.
- PlanPage.tsx is kept, unrouted.

**GO — TU SEMANA ACTION VISIBILITY RESTORED**
