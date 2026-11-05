# A3.7.6.3 — Functional Parity Report (PlanPage → Tu Semana)

Classification:
- **A** — preserved in Tu Semana
- **B** — available elsewhere through an existing route
- **C** — intentionally omitted, no essential loss
- **D** — at risk of being lost

| # | PlanPage capability | Class | Where it lives now / evidence |
|---|---|---|---|
| 1 | List of the business's active actions (pending + in progress) | A | WeeklyPlanPage focus list + rest of week (a3762 tests; a3763 "renders Tu Semana") |
| 2 | "Para hoy" grouping | A (changed) | Replaced by the "focus" top 5 of the week. Today's top 3 remain on `/hoy` (TodayPriorities) |
| 3 | Grouping of the rest of the week by category | C | Tu Semana orders by its weekly model instead; every action is still listed, only the category headers are gone |
| 4 | Closed this week (completed / dismissed) | A | Weekly activity section |
| 5 | Start-then-open an action at its in-app destination (`actionTarget`) | A | a3763 "follows an action's own in-app destination" (`/herramientas`) |
| 6 | Execute an action through `/ejecutar/:id` | A | a3763 "opens the existing execution route" → `/ejecutar/a-001` renders the execution page |
| 7 | Mark done / dismiss, with premium-required error handling | A | WeeklyPlanItemCard + a3762 tests |
| 8 | Progress bar | A | Weekly progress section |
| 9 | Subscription restriction (`PaywallNotice surface="plan"`, read-only) | A | Read-only note and hidden mutation buttons without premium (a3763 test) |
| 10 | Loading, error with retry, and empty states (empty links to `/negocio`) | A | a3762 state tests; no-business state confirmed in a3763 |
| 11 | RoadmapCard items 1–3 ("now") | B | `/hoy` TodayPriorities uses the same `eligibleActions(...).slice(0, 3)` |
| 12 | RoadmapCard items that map to missions (phone, website, hours, services, audience, goal, gbp_connect, reviews) | A | Those are business actions (MISSION_KEYS) and are listed and executable in Tu Semana |
| 13 | RoadmapCard items 4–8 that are not missions (e.g. gbp_fix, gbp_sync, align_*, gbp_category) | B | The roadmap is just the merged priorities of the Maps Scanner, Digital Twin and GEO Audit (`rankedTodayActions` = `scan`/`buildDigitalTwin`/`geoAudit` `.priorities`). Each tool page (`/herramientas/maps`, `/herramientas/twin`, `/herramientas/geo`) still renders its full priority list with CTAs |
| 14 | SocialIntegrationCard `consumer="plan"` (CONSIDER_NEW_CONTENT for LONG_INACTIVITY / NO_CONTENT) | B | `/herramientas/social` shows the same finding as an attention card ("Sin publicaciones recientes en {platform}" / "Sin publicaciones observadas…", icon calendar / noContent) with its recommendation. `/hoy` keeps its own social card |
| 15 | Business and subscription context | A | Same providers; a3763 business and premium tests |

**Capabilities in class D: none.**

## Assessment

- Every capability the old page offered is either kept in Tu Semana or reachable through an existing, unchanged route.
- The two items not carried into Tu Semana, the roadmap card and the social card for the plan, were deliberately left out in the approved A3.7.6.2 scope.
  - The a3762 static guard forbids Tu Semana from importing social, repository or reality-engine code.
  - The a3542 isolation list only allows social integration on TodayPage and PlanPage.
- Adding them to Tu Semana would have meant relaxing two approved guards, which is a design change outside this stage. It is not needed for parity (both are class B).
- Small, intentional differences:
  - the category headers are gone (C);
  - the "for today" bucket is now a weekly focus (A, changed).

## PlanPage retention

- Parity is shown, but `PlanPage.tsx` is **kept** (unrouted, unchanged, fingerprint 109a1a58) for these reasons:
  - it is pinned by an existing frozen test (a33DiagnosticAction);
  - it is named in the a3542 approved-integration list;
  - deleting it is a separate step that the independent reviewer should approve.
- The suggested follow-up, needing reviewer approval:
  - delete PlanPage;
  - remove it from the a3542 list and the a33 pin;
  - optionally retarget the three internal `/plan` links to `/semana`.
