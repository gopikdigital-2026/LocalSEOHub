# A2.7.2 — Today Intelligence: cross-tool priority orchestration

## A. Executive summary

/hoy now opens its main column with a new card, **"Tus prioridades ahora" / "Your priorities right now"**. It shows at most three priorities, merged from the approved A2.7.1 Action Layer (Maps, Digital Twin, GEO):
- deduplicated by canonical action key;
- ordered by a documented, deterministic algorithm.

Each priority has a title, why it matters, next step and a real CTA. The first one is marked "Empieza por aquí / Start here". When the same gap comes from two or more tools, a small "Detectado en: Maps · Digital Twin · GEO" label appears.

**What stayed untouched:** every existing Today section, including the "Misiones de hoy" card, the Maps/Twin/GEO engines, the A2.7.1 Action Layer, Plan, billing, auth, OAuth and SMTP.

**Cost and storage:** no AI, no migration, no new route, no stored task state.

**New files:**
- `src/features/today-intelligence/model.ts` (orchestrator)
- `src/features/today-intelligence/copy.ts` (ES/EN)
- `src/features/today-intelligence/TodayPriorities.tsx` (card)
- `src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts` (101 tests)
- `src/features/action-layer/__tests__/fixtures.ts` (shared fixtures, extracted from the A2.7.1 test; no assertion changed)

**Edited:** `src/app-v2/routes/TodayPage.tsx`, with three additive changes:
1. It tracks the load state of connected sources.
2. It computes `todayActions(...)`.
3. It renders the new card above `TodaysMissions` in the same column.

## B. Baseline (verified before any change)

| Check | Baseline (verified) | Final |
|---|---|---|
| Vitest | 41 files / 1350 tests green | 42 files / 1451 tests green (+101) |
| TypeScript (`tsc -p tsconfig.app.json`) | 20 pre-existing | 20 (0 new) |
| ESLint | 30 pre-existing (23 errors, 7 warnings) | 30 (0 new) |
| Migrations | 42 | 42 |
| Routes (`<Route path=`) | 27 | 27 |
| Build | OK | OK (run after the final change) |

## C. Existing Today audit (read-only, before implementation)

1. **What /hoy shows, in order:**
   - `DashboardHeader`;
   - activation notices (`FirstSuccessNotice`, `FirstPlanIntro`), `TrialStartCard`, `PaywallNotice`, the action error banner;
   - **`TodaysMissions`**, next to `BusinessHealthCard`;
   - `WeeklyContentCard`, `PreparedRepliesCard`;
   - `AIInsights` and `CompetitorAlerts` (both empty-state);
   - `GrowthTimeline`, `QuickActions`;
   - `BusinessSnapshot`, `PlanCard`.
2. **What must remain untouched:** all of the above. In particular `TodaysMissions` is a stored task system (`business_actions`, rules in `src/features/actions/rules.ts`). It has start, complete and dismiss, follow-ups and Premium gating.
3. **What can consume A2.7.1 ActionItems:** the page already loads `currentBusiness` (from `useBusiness`) and the connected source rows (`loadConnectedSources`). Those rows include `verified_profile` and `verified_at`. These are exactly the inputs Maps, Twin and GEO use, so no new fetch was needed.
4. **Overlap:** yes. Several rules in `rules.ts` cover the same topics: `add_business_phone`, `add_business_website`, `add_business_schedule`, `complete_business_services`, `define_target_audience`, `set_primary_goal`, `connect_google_business_profile`, `complete_business_basics`. They are a different engine with stored state and a lifecycle. Merging them would be a structural change to approved Today behaviour, so it was **not** done (see A272-001).
5. **Minimum additive change:** one new card, the load-state tracking, and one line rendering the card.

## D. Preserved Today functionality

| AREA | BEFORE A2.7.2 | AFTER A2.7.2 | PRESERVED? | EVIDENCE |
|---|---|---|---|---|
| Existing Today layout | header, notices, 4 grid rows, `max-w-5xl` | same; new card stacked above missions in the same column | Yes | tests 89, 96 |
| Existing Today useful content | 12 sections | all 12 present | Yes | test 89 |
| TodaysMissions | stored actions, start/complete/dismiss | byte-identical file | Yes | test 89 (sha256) |
| Maps engine | sha `1c18dfe0…` | identical | Yes | test 60 |
| Twin engine | sha `5ee583c3…` | identical | Yes | test 61 |
| GEO engine | sha `410253d1…` | identical | Yes | test 62 |
| A2.7.1 Action Layer | model/copy/ActionDetail | identical hashes | Yes | test 68 |
| Maps scoring | partial/on 66, full/on 97 | same | Yes | tests 63–64 + A2.7.1 golden tests |
| Twin knowledge scoring | partial/on 49, full/off 90 | same | Yes | test 65 |
| GEO scoring | partial/on 59, minimal/off 27 | same | Yes | tests 66–67 |
| Billing | untouched | untouched | Yes | test 77; no billing file edited |
| Auth | untouched | untouched | Yes | test 81 |
| GBP trust | `normalizeGbp` ignores metadata | same, and Today uses `normalizeGbp` | Yes | test 71 |
| AI limits | 22/18/18/12/10/80 | same | Yes | tests 54–59 |
| Plan | `PlanPage.tsx` | identical hash | Yes | test 90 |
| Routes | `App.tsx` | identical hash, 27 routes | Yes | test 91 |

## E. Action Layer input

`rankedTodayActions(profile, gbp)` calls the approved APIs only:

```
mapsActions(scan(profile, gbp).priorities)
twinActions(buildDigitalTwin(profile, gbp).priorities)
geoActions(geoAudit(profile, gbp).priorities)
```

It does not read any business field directly and does not reinterpret the diagnostics. No mapping table (`MAPS_KEYS` and so on) is duplicated (test 68). Each tool still returns at most 5 actions, so Today merges at most 15.

## F. Deduplication model

- The key is the A2.7.1 canonical `ActionKey` (services, phone, website, hours, audience, goal, gbp_connect, …).
- Different keys never merge, even when related: `phone` and `align_phone` stay separate (test 9).
- Merged item:
  - `sourceTools` is the union, in fixed order maps → twin → geo;
  - `bestRank` is the lowest per-tool position;
  - `destination` comes from the first occurrence. A2.7.1 always gives the same key the same destination;
  - `supporting` is the first non-null value.
- Excluded:
  - `keep_fresh` and `keep_updated`. These are upkeep reminders a tool emits only when it has nothing to fix.
  - Any item whose destination is not in `ACTION_DESTINATIONS`. This is the dead-CTA guard (test 18).

## G. Priority algorithm

Items are sorted by the first criterion that differs (`compareToday`):

1. **Tier** (foundational first, and whether it can be done now inside LocalSEOHub):
   - 0 identity: `identity`, `activity`, `city`
   - 1 core business data stored in LocalSEOHub: `services`, `phone`, `website`, `hours`, `audience`, `goal`
   - 2 Google connection, done in /fuentes: `gbp_connect`, `gbp_fix`, `gbp_sync`
   - 3 changes made inside Google itself: `align_phone`, `align_website`, `align_sources`, `gbp_category`, `reviews`
2. **Cross-tool frequency:** more detecting tools ranks first.
3. **Reach:** how many LocalSEOHub tools read the field, from the code-evidenced `FIELD_CONSUMERS` of A2.7.1. Higher reach ranks first, so audience (5) ranks after phone (6) and goal (4) after audience.
4. **Existing action priority:** the lowest position the item had in any tool's own list.
5. **Explicit tie-break:** position in `KEY_ORDER` (see H).

These are internal weights only. No numeric score is shown in the UI.

**Missing Google state.** If the connected sources cannot be loaded, Google state is unknown. Today then withholds tier ≥ 2 items instead of guessing "Conecta Google" (`todayActions(..., gbpKnown=false)`, test 18). While sources are loading, the card is not rendered, so no wrong suggestion flashes (test 99).

## H. Tie-breaking

The final tie-break is the explicit array `KEY_ORDER`:

identity, activity, city, services, phone, website, hours, audience, goal, gbp_connect, gbp_fix, gbp_sync, align_phone, align_website, align_sources, gbp_category, reviews, keep_fresh, keep_updated.

It does not depend on randomness, timestamps, object iteration or AI. Input order of the tool lists does not change the result (test 14). The comparator is a strict total order (test 100). The model has no `Math.random`, `Date` or `crypto` (test 13).

## I. Top 3 selection

`todayActions = rankedTodayActions(...).filter(gbpKnown).slice(0, 3)`. Everything beyond 3 stays visible in Maps, Digital Twin and GEO, and remains available to Plan later. The card footer links to /herramientas.

**Promotion is automatic.** Results are recomputed from the current business and sources on every render. Example: partial/off with three services goes from [services, phone, website] to [phone, website, hours] (test 27).

## J. Today user experience

**Card:** "Tus prioridades ahora", with the subtitle "Lo más útil que puedes hacer hoy, según los datos actuales de tu negocio."

**Each priority shows:**
- number;
- "Empieza por aquí" badge on #1 (primary-tinted border and filled number);
- "Detectado en: …" only when two or more tools found the gap;
- title;
- "Por qué importa" and "Siguiente paso", reusing the A2.7.1 copy;
- "Ir ahora" CTA: filled on #1, outlined on #2 and #3;
- optional secondary "Te puede ayudar: …" link.

**Empty state:** "No tienes acciones prioritarias pendientes ahora", with a "Ver herramientas" link. No urgency words.

**Design:** reuses `v2-card`, the existing numbered-list, button and colour tokens from `TodaysMissions`. On mobile it uses `flex-wrap` and `min-w-0`, and collapses into the existing single-column grid.

## K. CTA mapping

| Key | Primary destination | Source |
|---|---|---|
| identity, activity, city, services, phone, website, hours, audience | /negocio | A2.7.1 `destination` (= engine `cta`) |
| goal | /negocio/objetivos | Twin `add_goal` cta |
| gbp_connect, gbp_fix, gbp_sync | /fuentes | engines |
| align_*, gbp_category | /negocio or /fuentes | engines |
| reviews | /herramientas/advisor | Maps `reviews` cta |

All routes exist in `App.tsx` (tests 20, 92).

## L. Supporting tools

These are taken unchanged from A2.7.1:
- services → SEO Generator ("Redactar una descripción de servicio");
- audience and goal → AI Business Advisor ("Pensarlo con el asesor").

The supporting tool is rendered as a small, tertiary-style text link, never as the main button (tests 93–94). The primary CTA always resolves the source-of-truth gap.

## M. Empty / minimal / partial / full behaviour (Required Today table)

Raw lists use A2.7.1 keys in each tool's order. In the merged list, each item is shown as key[tier / tools / reach / bestRank].

| FIXTURE | GBP STATE | RAW MAPS ACTIONS | RAW TWIN ACTIONS | RAW GEO ACTIONS | DEDUPLICATED ACTIONS | TOP 3 | WHY THESE WON |
|---|---|---|---|---|---|---|---|
| empty | off | identity | identity, activity, city, services, audience | identity | identity[0/3/6/0], activity[0/1/6/1], city[0/1/6/2], services[1/1/6/3], audience[1/1/5/4] | identity, activity, city | All three are tier 0 (who the business is). Identity is seen by 3 tools; activity and city are ordered by Twin position. |
| empty | on | identity | identity, activity, city, services, audience | identity | same as off | identity, activity, city | Same; GBP does not change identity gaps |
| minimal | off | city, phone, gbp_connect, hours, services | city, services, audience, goal, phone | city, services, website, gbp_connect, audience | city[0/3/6/0], services[1/3/6/1], phone[1/2/6/1], audience[1/2/5/2], website[1/1/6/2], hours[1/1/6/3], goal[1/1/4/3], gbp_connect[2/2/0/2] | city, services, phone | City is tier 0. Services is tier 1 with 3 tools. Phone (2 tools, reach 6) beats audience (2 tools, reach 5). |
| minimal | on | city, phone, hours, services, website | city, services, audience, goal, phone | city, services, website, align_sources, audience | city, services, phone, website, audience, hours, goal, align_sources | city, services, phone | As above. Phone beats website on bestRank (1 vs 2). align_sources is tier 3. |
| partial | off | phone, gbp_connect, hours, services, website | services, audience, goal, phone, hours | services, website, gbp_connect, audience, phone | services[1/3/6/0], phone[1/3/6/0], website[1/2/6/1], hours[1/2/6/2], audience[1/2/5/1], goal[1/1/4/2], gbp_connect[2/2/0/1] | services, phone, website | Services and phone come from all 3 tools; services wins the KEY_ORDER tie. Website (2 tools, best rank 1) beats hours (rank 2) and audience (reach 5). |
| partial | on | phone, hours, services, website, reviews | services, audience, goal, phone, hours | services, website, align_sources, audience, phone | services, phone, website, hours, audience, goal, align_sources, reviews | services, phone, website | Same as partial/off. reviews and align_sources are tier 3. |
| full | off | gbp_connect | gbp_connect | gbp_connect | gbp_connect[2/3/0/0] | gbp_connect | Only remaining real gap; found by all 3 tools |
| full | on (0 reviews) | reviews | keep_updated | keep_fresh | reviews[3/1/0/0] | reviews | Google verifies 0 reviews (server-written `totalReviews`). The upkeep reminders are excluded. |
| full | on (12 reviews) | keep_fresh | keep_updated | keep_fresh | — | — (positive empty state) | Nothing to fix, so nothing is fabricated (test 40) |

**Spec §35 example.** The input is:
- Maps: services, phone, website
- Twin: services, audience, goal, phone
- GEO: services, website, audience

The result is **services, phone, website**:
- Services is the only key found by all 3 tools.
- Phone, website and audience each come from 2 tools. Audience loses on reach (5 vs 6).
- Phone and website tie on best rank (1). Phone wins on `KEY_ORDER`.

## Required deduplication table

| CANONICAL KEY | SOURCE TOOLS | PRIMARY DESTINATION | SUPPORTING TOOL | PRIORITY FACTORS | SELECTED IN TODAY? | REASON |
|---|---|---|---|---|---|---|
| identity | Maps, Twin, GEO | /negocio | — | tier 0, reach 6 | Yes when missing | Foundational; unlocks every tool |
| activity | Twin, GEO (Maps reports it inside `complete_profile` → identity) | /negocio | — | tier 0, reach 6 | Yes when missing | Foundational |
| city | Maps, Twin, GEO | /negocio | — | tier 0, reach 6 | Yes when missing | Foundational |
| services | Maps, Twin, GEO | /negocio | SEO Generator | tier 1, reach 6 | Yes (top in partial) | Core data, found by 3 tools |
| phone | Maps, Twin, GEO | /negocio | — | tier 1, reach 6 | Yes | Core data, often 2–3 tools |
| website | Maps, Twin, GEO | /negocio | — | tier 1, reach 6 | Often #3 | Core data |
| hours | Maps, Twin, GEO | /negocio | — | tier 1, reach 6 | When higher items are done | Core data |
| audience | Twin, GEO | /negocio | Advisor | tier 1, reach 5 | When higher items are done | Maps does not read it (lower reach) |
| goal | Twin | /negocio/objetivos | Advisor | tier 1, reach 4 | When higher items are done | Read by SEO, Advisor, Voice, Twin |
| gbp_connect | Maps, Twin, GEO | /fuentes | — | tier 2 | Yes when data is complete | Connection, after own data |
| gbp_fix / gbp_sync | Maps, Twin, GEO | /fuentes | — | tier 2 | When applicable | Connection repair |
| align_phone / align_website / align_sources / gbp_category | Maps or GEO | /negocio or /fuentes | — | tier 3 | Last | The change happens in Google |
| reviews | Maps | /herramientas/advisor | — | tier 3 | Only on verified 0 reviews | Server-verified, no management |
| keep_fresh / keep_updated | Maps, Twin, GEO | — | — | excluded | Never | Upkeep, not a priority |

## N. GBP behaviour

- **Disconnected:** a `gbp_connect` item can appear. It ranks after the business's own data (tier 2).
- **Connected:** the connection gap disappears (test 42).
- **"No comprobado"** never becomes a Today item: full/off shows only the connection step (test 43).
- **Sources failed to load:** Google items are withheld.
- **Verification:** `normalizeGbp` (the A2.5 trust fix) is the only path from source rows to GBP state.
- **Unchanged:** no new scopes (`gbp-oauth-start` hash unchanged, test 72) and no new GBP feature.

## O. Truthfulness review

- New ES/EN copy has no ranking, position, ChatGPT, Gemini or Perplexity mentions, no customer, traffic or sales loss claims, and no urgency words (tests 44–50).
- Why/next text is reused from A2.7.1, which already passed truthfulness checks, so the explanations do not contradict each other.
- The review title states a fact ("Tu perfil de Google aún no muestra reseñas"). It appears only when Google returns 0 reviews. The A2.7.1 why text says LocalSEOHub does not manage reviews.
- A complete business gets an honest positive state.

## P. AI cost

Zero. The model is pure computation over already-loaded data. It has no `invoke`, `fetch`, AI provider, ledger or RPC (tests 51–53). Caps unchanged: weekly 22, improvement 18, SEO 18, advisor 12, voice 10, global 80.

## Q. Security / data access

- The new code has no Supabase client, `.from(`, service role or writes (tests 29, 82–85).
- Today reuses the existing per-business call `loadConnectedSources(businessId)`. It runs under the signed-in user's session and current RLS.
- There are no cross-user or cross-business reads and no new tables, policies or migrations.

## R. ES / EN

All new strings are in `TODAY_COPY.es` and `TODAY_COPY.en`, selected by the `lang` that `TodayPage` already gets from `useI18n()`. Why/next come from `ACTION_COPY[lang]`. Every key has a distinct EN title (test 88).

## S. Regression

- Full suite: 42 files, 1451 tests green. All 112 A2.7.1 tests still pass using the shared fixtures, with no assertion changed.
- TypeScript 20 and ESLint 30, both equal to baseline. The new files have 0 problems.
- Production build green after the final change.

## T. Findings

| ID | SEVERITY | AREA | DESCRIPTION | EVIDENCE | IMPACT | FIX | TEST | STATUS |
|---|---|---|---|---|---|---|---|---|
| A272-001 | P3 | Today | Two recommendation surfaces now sit on /hoy. "Misiones de hoy" holds stored, rule-based tasks with a lifecycle; the new card is derived. Topics overlap: phone, website, hours, services, audience, goal, Google connection. | `src/features/actions/rules.ts` rule ids; `TodaysMissions.tsx` | The same gap can appear in both cards, worded differently | Not changed, because it is a structural conflict with approved behaviour. Recommend deciding in A2.7.3 whether missions consume `rankedTodayActions` or hide overlapping rule ids. | 89 (missions preserved) | Open, documented |
| A272-002 | INFO | Today | Previously a failed source load was swallowed silently. Today now tracks load state so the new card never guesses Google state. | `TodayPage.tsx` `sourcesState` | Avoids a wrong "Conecta Google" | Implemented: Google-tier items withheld on failure; card hidden while loading | 18, 99 | Done |
| A272-003 | INFO | Copy | On an empty business the identity and activity titles overlapped | `copy.ts` | Repetitive wording | Identity title changed to "Completa los datos básicos de tu negocio" | 31 | Done |
| A272-004 | INFO | Reviews | full/on with 0 verified reviews shows the review item as the only priority | Maps `reviews` priority | Truthful, low tier, no management | None needed | 38 | By design |
| A272-005 | INFO | Fixtures | A2.7.1 fixtures moved to a shared file to avoid duplication | `action-layer/__tests__/fixtures.ts` | None | — | A2.7.1 suite green | Done |

## U. Future Plan integration (not implemented)

`rankedTodayActions(profile, gbp)` returns the full deduplicated, ordered list, and `todayActions` returns its top 3. A2.7.3 could:
- show the remaining ranked items in /plan;
- group them by tier: "Base", "Datos clave", "Google";
- reconcile them with `business_actions` (A272-001).

The `TodayAction` fields `key`, `destination`, `supporting`, `sourceTools` and `tier` are enough for that. No Plan code was touched.

## V. Future recurring intelligence (not implemented)

These would need real integrations or monitoring first:
- **New reviews or rating changes:** GBP review scopes plus server-side sync.
- **GBP field changes:** periodic `gbp-sync` and a stored diff.
- **Competitor changes:** scheduled Competitor Radar snapshots.
- **Freshness alerts:** `verified_at` age thresholds.
- **New opportunities / weekly recommendations:** the weekly-content pipeline, which consumes AI quota and so must stay opt-in.

Each would add a new canonical key and tier, with no change to the orchestrator's shape.

## W. Remaining gaps

- Overlap between "Misiones de hoy" and the new card (A272-001).
- Google-side fixes still can't be done inside LocalSEOHub.
- Review data is limited to the total count.
- No UI test in a real browser was possible in this environment; layout was checked by reading the code.

## Required literal confirmations

A2.7.2 was implemented as a non-destructive extension.
Today Intelligence reuses the approved A2.7.1 Action Layer.
Today Intelligence does not create a second diagnostic engine.
Cross-tool actions are deduplicated by canonical action identity.
Today displays no more than three primary priorities.
Today priorities are deterministic.
Completing source business data naturally removes resolved Today actions.
No manual task-completion database state was introduced.
No new Today persistence table was introduced.
No LocalSEOHub interface was redesigned.
No Maps Profile Scanner diagnostic or scoring logic was modified.
No AI Digital Twin diagnostic or knowledge scoring logic was modified.
No GEO Audit diagnostic or scoring logic was modified.
The A2.7.1 Action Layer remains active.
Today Intelligence consumes zero AI usage.
No Google Maps ranking is claimed.
No AI assistant ranking is claimed.
No customer-loss claim is fabricated.
No review management capability was fabricated.
All seven LocalSEOHub tools remain available.
All fourteen retired legacy functions remain retired.
AI usage global limit remains 80.
No Stripe configuration was modified.
No billing or Premium entitlement logic was modified.
No Google OAuth configuration was modified.
The A2.5 GBP verification trust fix remains active.
No new GBP OAuth scopes were introduced.
No SMTP configuration was modified.
No authentication flow was modified.
No businesses were deleted.
No connected sources were deleted.
No AI usage counters were reset.
Plan integration was not implemented in A2.7.2.
