# A3.7.6.4 — Functional Parity Verification (independent re-check of A3_7_6_3_FUNCTIONAL_PARITY_REPORT.md)

Rule applied: a capability counts as preserved only if the same useful customer action stays reachable and understandable.

## 1. Row-by-row verification

| # | Capability | A3.7.6.3 claim | Independent result | Evidence |
|---|---|---|---|---|
| 1 | List of active actions | A | **Partially.** Only the first 8 are listed | model.ts:98–105 |
| 2 | "Para hoy" | A (changed) | Confirmed. Focus starts with `selectTodayActions` | model.ts:99–102; engine.ts:150–160 |
| 3 | Rest of week, all actions | C ("every action is still listed") | **Incorrect → D.** `later` is sliced to `8 - focus.length`, there is no indicator of hidden actions, and no other page lists them. The engine produces 12 open actions for a connected business (probe `/tmp/scr/cap2.test.ts`) | model.ts:104; WeeklyPlanPage.tsx:196–210; engine.ts:86–101, 128–140 |
| 4 | Closed this week | A | Confirmed | model.ts:145–147 |
| 5 | Start, then open the action's in-app destination | A | Confirmed; the start is skipped when read-only | WeeklyPlanPage.tsx:113–118 |
| 6 | `/ejecutar/:id` | A | Confirmed | WeeklyPlanPage.tsx:119; App.tsx:252 |
| 7 | Mark done / dismiss, premium error | A | Confirmed | WeeklyPlanPage.tsx:101–111 |
| 8 | Progress | A | Confirmed | WeeklyPlanPage.tsx:~175–180 |
| 9 | Subscription restriction | A | Confirmed. The paywall surface name changes from `plan` to `weekly_plan` (analytics only) | WeeklyPlanPage.tsx:147; BillingNotices.tsx:108–118 |
| 10 | Loading / error with retry / empty | A | Confirmed; both empty states link to `/negocio` | WeeklyPlanPage.tsx:79, 87, 96 |
| 11 | Roadmap items 1–3 | B | Confirmed: Hoy, TodayPriorities | — |
| 12 | Roadmap items that are missions | A | Confirmed, but subject to F1: listed only when inside the 8 | — |
| 13 | Roadmap items 4–8 (non-mission) | B | Confirmed. The tool pages render the full `priorities` list with CTAs. The merged cross-tool ranking is lost (C) | GeoAuditPage.tsx:238–247; MapsScannerPage.tsx:253; DigitalTwinPage.tsx:214 |
| 14 | Social card (CONSIDER_NEW_CONTENT) | B | Confirmed. The old card only linked to `SOCIAL_DESTINATION` (SocialIntegrationCard.tsx:55; projection.ts:65). `/herramientas/social` shows the activity finding (viewModel.ts:158–159, 181) and, for ACTIVE/STALE findings, an attention card with the recommendation title and body (viewModel.ts:206–208, 249–278) | — |
| 15 | Business and subscription context | A | Confirmed | main.tsx provider order |

**Class D items: 1** (row 3, together with the limits on rows 1 and 12). The A3.7.6.3 statement "Capabilities in class D: none" is not accurate.

## 2. Customer-facing loss: detail

- Scenario (real `planSync`):
  - complete profile;
  - Google Business synced with no website, phone or hours, and 0 reviews;
  - website analysed with no https, title, meta description or h1.
- Result: 12 open actions.
- On the old page, all 12 were visible and actionable. In Tu Semana, 8 are visible and 4 (the lowest-ranked, e.g. FAQ answers, service description, H1 and photos) cannot be seen, started, completed or dismissed until others are closed.
- The customer is not told they exist.
- Hoy shows 3 and the execution page shows the next 1, so neither restores access.
- Smallest correction: show every remaining open action in the collapsible "later" list (or add a "N more" reveal), plus a test asserting `focus + later` covers every open action.

## 3. Weekly plan safety

| Check | Result | Evidence |
|---|---|---|
| No cross-business exposure | OK. The plan is built per `businessId`, and other businesses' actions are excluded | a3762WeeklyPlanPage.test.tsx:347 |
| No duplicate execution | OK. Busy state per action, buttons disabled while running; one open action per ruleId | a3762:282; model.ts:90–95; engine.ts:92–96 |
| No invented analytics | OK. The page shows only action-derived counts; no metrics are fabricated | WeeklyPlanPage.tsx; a3762 import guard :389 |
| No demo data | OK. No demo or fixture imports in the page or model | a3762:389 |
| No publishing API calls | OK. No meta-/instagram-publishing references; a3763 asserts no supabase or publish usage in the redirect and shell | a3763WeeklyPlanRouting.test.tsx |
| Missing integrations | OK. `SOURCE_REQUIRED` items trigger a notice linking to `/fuentes` | WeeklyPlanPage.tsx:131, 164 |
| Completed / auto-resolved / dismissed / outdated kept apart | OK. `auto_closed` dismissals → `outdated`; separate lists | model.ts:15, 76, 145–147; a3762:297 |
| Week boundaries | OK. `weekKey`/`weekRange` work on local week start; closed items are filtered by their `completedAt`/`dismissedAt` within the range | weekly-content/model.ts:35–43; weekly-plan/model.ts:68 |
| No unexpected persistent changes | OK. Only user-initiated start, complete and dismiss through ActionsContext; `ensureFresh` is the existing sync path used by Hoy | WeeklyPlanPage.tsx |

## 4. Conclusion

- Routing, navigation, safety and verification all pass.
- Parity fails on one real customer-facing loss: open actions beyond the 8-item cap become unreachable, and the earlier parity report misstated this as "every action is still listed".

**NO-GO — TU SEMANA REQUIRES CORRECTION**
