# A2.7.3 — Plan Roadmap: Today, Missions and Plan reconciliation

## A. Executive summary

A2.7.3 adds a read-only **"Tu hoja de ruta / Your roadmap"** card to the Plan page. It is a non-destructive extension:

- The card shows at most **8** improvement items, taken from the same A2.7.2 ranked canonical actions that feed Today.
- Items are grouped by phase:
  - **Now** (positions 1–3, identical to the Today Top 3);
  - **Next** (positions 4–6);
  - **Later** (positions 7–8).
- Weekly missions are unchanged and stay below the card.
- Mission state is shown on a roadmap item ("En curso" badge, "Continuar" label) only for high-confidence rule mappings.
- Mission state never decides whether a gap exists. Only the business data does.

Zeros: 0 AI calls, 0 new migrations (still 42), 0 new tables, 0 new routes (still 27), 0 changes to the mission system, the Maps/Twin/GEO engines, Today, Stripe, billing, OAuth, SMTP or auth.

**Recovery note.** The first A2.7.3 delivery reported completion, but the four new roadmap files and this report had never persisted to the workspace. A delivery consistency check confirmed this; at that point the suite showed 1451 tests, TypeScript 22 and a failing build. Under the recovery authorisation (no rollback, no redesign), the five files were rewritten to the approved design, and each was checked on disk straight after writing. The full regression was then re-run, and a fresh export was produced and inspected.

## B. Baseline (verified before recovery changes)

- PlanPage was already the A2.7.3 version: it imports `buildRoadmap` and `RoadmapCard`, loads sources and renders the card. It was not modified during recovery.
- `today-intelligence/model.ts` was already the A2.7.3 version: it exports `eligibleActions`, and `todayActions` = `eligibleActions(...).slice(0, 3)`. It was not modified during recovery.
- Missing at that point: `roadmap/model.ts`, `roadmap/copy.ts`, `roadmap/RoadmapCard.tsx`, `roadmap/__tests__/a273Roadmap.test.ts` and `A2_7_3_INFORME.md`.

## C. Product roles

| Layer | Role | Source of truth |
|---|---|---|
| Today | Focus: no more than three primary priorities | `todayActions` (A2.7.2) |
| Missions | Execution: start, complete, dismiss, history, weekly progress | `business_actions` and the actions engine (unchanged) |
| Plan roadmap | Roadmap: ordered view of up to 8 canonical improvements | `eligibleActions` (A2.7.2 ranking) |

## D. Preserved Plan functionality

All of the following are unchanged: progress bar (`report.weeklyProgress`), "Para hoy", "Resto de la semana", "Cerradas esta semana", start (`await start(a)`, then navigate to `actionTarget`), complete (only where `canMarkDone`), dismiss, failure toasts, PaywallNotice, notice and the all-done state.

## E. Roadmap input

`buildRoadmap(profile, gbp, gbpKnown, missions)` calls `eligibleActions(profile, gbp, gbpKnown)`, takes `.slice(0, PLAN_MAX)`, and adds `position`, `phase` and `mission` to each item. The roadmap has no second diagnostic engine, no second ordering and no second key mapping.

## F. Deduplication

The roadmap inherits A2.7.2 deduplication by canonical `ActionKey`: each key appears once, with merged `sourceTools`.

## G. Ordering

The A2.7.2 canonical order applies (tier, then reach, then bestRank, then KEY_ORDER). The roadmap order equals `rankedTodayActions(...).slice(0, 8)` for every fixture (test 27).

## H. Phases

| Positions | Phase | ES | EN |
|---|---|---|---|
| 0–2 (`< TODAY_MAX`) | now | Ahora | Now |
| 3–5 (`< NEXT_END = 6`) | next | Siguiente | Next |
| 6–7 (`< PLAN_MAX = 8`) | later | Después | Later |

## I. Now = Today

The Now phase is by construction the same list as the Today Top 3, including when Google state is unknown (test 31).

## J. Plan user experience

- A v2 card titled "Tu hoja de ruta".
- Items are grouped by phase, and each phase has a short hint.
- The first item is visibly the highest priority: highlighted number and primary button.
- Each item shows:
  - title from TODAY_COPY;
  - "Por qué importa" and "Siguiente paso" from ACTION_COPY;
  - "Detectado en" only when more than one tool detected it;
  - CTA "Ir ahora", or "Continuar" when the mapped mission is IN_PROGRESS;
  - optional secondary link to a supporting tool.
- A footer note says that the weekly missions remain below.
- The card stays hidden while sources are loading.

## K. CTA mapping

The CTA always goes to the canonical `destination` (/negocio, /fuentes or /herramientas/*). An IN_PROGRESS mission only changes the label, never the destination (test 68).

## L. Supporting tools

The supporting link renders as a small secondary-text link. It is never the primary button (test 122).

## M. Mission reconciliation (required mission mapping table)

| Mission ruleId | Source type | Roadmap key | canMarkDone |
|---|---|---|---|
| add_business_phone | BUSINESS_PROFILE | phone | false |
| add_business_website | BUSINESS_PROFILE | website | false |
| add_business_schedule | BUSINESS_PROFILE | hours | false |
| complete_business_services | BUSINESS_PROFILE | services | false |
| define_target_audience | BUSINESS_PROFILE | audience | false |
| set_primary_goal | BUSINESS_PROFILE | goal | false |
| connect_google_business_profile | SOURCE_REQUIRED | gbp_connect | false |
| gbp_get_first_reviews | VERIFIED_FINDING | reviews | false |
| complete_business_basics | BUSINESS_PROFILE | — (spans identity/activity/city: ambiguous) | — |
| gbp_add_* | VERIFIED_FINDING | — (Google-side field, not local data) | — |
| fix_source_connection:*, connect_website_source | SOURCE_REQUIRED | — | — |
| request_customer_reviews, publish_call_to_action_post, optimize_services_keywords | GOAL_BASED | — | — |
| create_weekly_post, add_recent_photos, improve_service_description | GENERAL_BEST_PRACTICE | — | — |
| follow_up_reply_reviews, follow_up_check_post | FOLLOW_UP | — | — |
| website_findings, write_faq_answers | VERIFIED_FINDING / BUSINESS_PROFILE | — | — |

**Status precedence** when several missions map to the same key: IN_PROGRESS > PENDING > COMPLETED > DISMISSED.

**What mission state does:**
- It is shown only: an "En curso" badge and the "Continuar" label for IN_PROGRESS.
- A COMPLETED or DISMISSED mission never hides an unresolved gap.
- Resolving the business data removes the item, whatever the mission history.

## N. Overlap analysis (required overlap table)

| Underlying gap | Today | Plan roadmap | Weekly missions | Consequence |
|---|---|---|---|---|
| Missing services | Top 3 item (if ranked) | Item, with mission badge if IN_PROGRESS | complete_business_services | Visible twice on Plan (roadmap and missions): A273-001 |
| Missing website | Top 3 item (if ranked) | Item | add_business_website | Same |
| Google not connected | Item when it ranks in the top 3 | Item | connect_google_business_profile | Same |
| No reviews (verified 0) | Item when it ranks in the top 3 | Item | gbp_get_first_reviews | Same |
| Weekly post / photos | — | — | GENERAL_BEST_PRACTICE missions | Missions only |

## O. Plan fixtures (required Plan fixture table)

| Fixture | Google | Roadmap (no missions) |
|---|---|---|
| EMPTY | OFF | identity, activity, city, services, audience |
| MINIMAL | OFF | city, services, phone, audience, website, hours, goal, gbp_connect |
| MINIMAL | ON | city, services, phone, website, audience, hours, goal, align_sources |
| PARTIAL | OFF | services, phone, website, hours, audience, goal, gbp_connect |
| PARTIAL | ON | services, phone, website, hours, audience, goal, align_sources, reviews |
| FULL | OFF | gbp_connect |
| FULL | ON | reviews |
| FULL | ON_REVIEWED | [] (honest empty state) |
| any | unknown (sources failed) | tier ≥ 2 items withheld; no gbp_connect |
| PARTIAL + COMPLETED website mission | OFF | unchanged; website still present (mission = COMPLETED) |
| PARTIAL + IN_PROGRESS services mission | OFF | unchanged; services shows "En curso" and "Continuar" |

## P. GBP behaviour

- Plan loads connected sources for the current business and builds `gbp` with the A2.5 `normalizeGbp` (fake "connected" metadata gives null).
- If loading fails, `gbpKnown = false`, so Google-side items are withheld, as on Today.
- While loading, the card is hidden.

## Q. Truthfulness review

The roadmap text contains no Google/Maps ranking claims, no ChatGPT/Gemini/Perplexity claims, no customer-loss claims, no urgency, no sales or revenue promises, no competitor claims, no guarantees and no new percentage (tests 71–81).

## R. AI cost

Zero. The roadmap and reconciliation are pure functions over data already loaded: no invoke, fetch, rpc or ledger. AI caps are unchanged: weekly-content 22, business-improvement 18, seo-generator 18, business-advisor 12, voice-simulator 10, global 80.

## S. Security and data access

- The roadmap sources contain no database client, no writes, no user_id, no service_role, no stripe, billing, premium, oauth, smtp or auth references, and no deletes or resets.
- PlanPage loads sources only for `currentBusiness.id`, through the existing owner-scoped sources loader.

## T. ES / EN

`ROADMAP_COPY` has identical key structure in ES and EN (test 115). Titles and why/next text are reused from TODAY_COPY and ACTION_COPY; no copy is duplicated.

## U. Mobile

Mobile-safe classes are used: `flex-1 min-w-0`, `flex flex-wrap`, `shrink-0`, `gap-3 sm:gap-4`. The CTA and supporting link wrap below the text on narrow screens.

## V. Preservation (required preservation table)

| Area | Evidence | Status |
|---|---|---|
| Maps / Twin / GEO engines | SHA-256 frozen; scores 66/97, 49, 59 | Unchanged |
| A2.7.1 Action Layer (model, copy, ActionDetail) | SHA-256 frozen | Unchanged |
| A2.7.2 Today (copy, TodayPriorities, TodayPage) | SHA-256 frozen; `todayActions` = eligible.slice(0, 3) | Unchanged |
| Mission system (engine, rules, repository, provider, types, context, TodaysMissions) | SHA-256 frozen | Unchanged |
| Plan start / complete / dismiss / sections | Source assertions | Unchanged |
| Routes (App.tsx) | SHA-256 frozen; 27 routes | Unchanged |
| GBP OAuth start (scopes) | SHA-256 frozen | Unchanged |
| Migrations | 42; last 20261016104108_a26_billing_grant_hardening.sql | Unchanged |
| Seven tools / fourteen retired functions | Catalog ids; status 410 | Unchanged |

## W. Regression (after recovery)

| Check | Result |
|---|---|
| Vitest | 43 files, 1574 tests passed (1451 baseline plus 123 A2.7.3) |
| TypeScript (app) | 20 errors (pre-existing baseline; none in roadmap) |
| ESLint | 30 problems (pre-existing baseline; none in roadmap) |
| Production build | OK |

## X. Findings

- **A273-001 (P3): Plan roadmap items and weekly missions can both remain visible for the same underlying gap.**
  - Example: "Añade tus servicios" in the roadmap and the complete_business_services mission below it.
  - Documented, not fixed. The two are not merged and neither is hidden, because they serve different roles (roadmap vs execution) and mission state must not decide diagnostic truth.
  - Mitigation: the footer note and the "En curso" badge reconcile the two visually.
- **A273-002 (P3):** Today's missions block (TodaysMissions) and the Today Top 3 can likewise overlap. This was out of scope, because Today was frozen.
- **A273-003 (P4):** complete_business_basics is not reconciled, because it spans identity, activity and city (ambiguous mapping).
- **A273-004 (P4):** gbp_add_* missions are not reconciled with local-data items (a Google-side field is not the same fact).
- **A273-005 (P4):** A roadmap with only 1–2 items still renders the phase structure for the phases that have items. Empty phases are omitted.
- **A273-006 (process, P1, resolved):** The original A2.7.3 delivery claimed completion without the new files persisting. It was resolved by this recovery, with on-disk and export-content verification.

## Y. Future work (not implemented)

Possible next steps, none of them started:
- an optional merge or hide strategy for A273-001 after product review;
- recurring monitoring;
- review management;
- SMTP Stage 2;
- A3.

## Z. Remaining gaps

The pre-existing TypeScript (20) and ESLint (30) baselines remain. No other gaps were introduced by A2.7.3.

## Required literal confirmations

1. A2.7.3 was implemented as a non-destructive extension.
2. Today, Missions and Plan have distinct product roles.
3. Today remains the focus layer.
4. Missions remain the execution layer.
5. Plan is the roadmap layer.
6. Plan reuses the approved A2.7.2 ranked canonical actions.
7. Plan does not create a second diagnostic or recommendation engine.
8. Plan actions are deduplicated by canonical action identity.
9. Today continues to display no more than three primary priorities.
10. Mission lifecycle state remains separate from diagnostic truth.
11. Completing a mission does not falsify unresolved business data.
12. Dismissing a mission does not falsify unresolved business data.
13. Resolving source business data naturally removes the corresponding derived action.
14. No duplicate manual completion state was introduced for derived Plan actions.
15. No new Plan persistence table was introduced.
16. No new mission persistence architecture was introduced.
17. No LocalSEOHub interface was redesigned.
18. No Maps Profile Scanner diagnostic or scoring logic was modified.
19. No AI Digital Twin diagnostic or knowledge scoring logic was modified.
20. No GEO Audit diagnostic or scoring logic was modified.
21. The A2.7.1 Action Layer remains active.
22. The A2.7.2 Today Intelligence layer remains active.
23. Plan roadmap generation consumes zero AI usage.
24. Mission reconciliation consumes zero AI usage.
25. No Google Maps ranking is claimed.
26. No AI assistant ranking is claimed.
27. No customer-loss claim is fabricated.
28. No review management capability was fabricated.
29. All seven LocalSEOHub tools remain available.
30. All fourteen retired legacy functions remain retired.
31. AI usage global limit remains 80.
32. No Stripe configuration was modified.
33. No billing or Premium entitlement logic was modified.
34. No Google OAuth configuration was modified.
35. The A2.5 GBP verification trust fix remains active.
36. No new GBP OAuth scopes were introduced.
37. No SMTP configuration was modified.
38. No authentication flow was modified.
39. No businesses were deleted.
40. No connected sources were deleted.
41. No mission history was deleted.
42. No AI usage counters were reset.
