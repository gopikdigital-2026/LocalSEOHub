# A2.7.1 — Action Layer: Diagnosis to Action (non-destructive extension)

## A. Executive summary

A2.7.1 adds a deterministic Action Layer on top of Maps Profile Scanner, AI Digital Twin and GEO Audit. Every actionable priority now explains WHY it matters, WHAT NEXT to do, and keeps its existing ACTION (the unchanged CTA). The Twin additionally shows which LocalSEOHub tools also read the field (code-evidenced). Where useful, a separate supporting tool link is shown (SEO Generator for services, Advisor for audience/goal), never replacing the primary action.

No engine, score, coverage, criterion, status, provenance, priority logic, disclaimer or existing CTA was changed. The layer costs zero AI, makes no network calls, adds no routes and no database flags: actions disappear because the existing engines stop emitting the priority once the field is completed.

New files: `src/features/action-layer/model.ts`, `copy.ts`, `ActionDetail.tsx`, `__tests__/a271ActionLayer.test.ts`. Edited: `MapsScannerPage.tsx`, `DigitalTwinPage.tsx`, `GeoAuditPage.tsx` (one inserted element inside each existing priority item).

## B. Baseline

| Check | Before | After |
|---|---|---|
| Vitest | 40 files, 1238 tests green | 41 files, 1350 tests green (+112) |
| TypeScript (`tsc -p tsconfig.app.json`) | 20 pre-existing errors | 20 (0 new) |
| ESLint | 30 pre-existing problems | 30 (0 new) |
| Routes in `App.tsx` (`<Route path=`) | 27 | 27 |
| Build | green | green (run after final change) |

## C. Current diagnostic value (before A2.7.1)

All three tools already produced a deterministic diagnosis plus up to 5 priorities, each with a title and CTA. GEO already carried a `why` per priority; Maps and Twin showed only a title + CTA. Users saw *what* was missing but not *why* it mattered nor *what concretely to do next*, nor that one field feeds several tools.

## D. Non-destructive preservation audit

| TOOL | FEATURE | BEFORE | AFTER | PRESERVED? | EVIDENCE |
|---|---|---|---|---|---|
| Maps | Score | golden table §T | identical | Yes | tests 1, golden 8 fixtures |
| Maps | Coverage | golden | identical | Yes | test 2 |
| Maps | Criteria | `WEIGHTS` keys, sum 100 | identical | Yes | test 3 |
| Maps | Disclaimer | "No representa tu posición en Google Maps" | identical | Yes | test 4 |
| Maps | Provenance | google=verified / localseohub=available / unchecked | identical | Yes | tests 11, 19 |
| Twin | Knowledge % | golden | identical | Yes | test 21 |
| Twin | Knowledge state | golden bands | identical | Yes | test 22 |
| Twin | Business map | 8 blocks, weights sum 100 | identical | Yes | test 23 |
| Twin | Provenance | declared 9 / verified 1 (full/on) | identical | Yes | test 24 |
| GEO | Score | golden | identical | Yes | test 42 |
| GEO | Coverage | golden | identical | Yes | test 43 |
| GEO | Criteria | `GEO_WEIGHTS` keys, sum 100 | identical | Yes | test 44 |
| GEO | Disclaimer + "not measured" | present | present | Yes | tests 45, 51 |
| GEO | Provenance / unchecked = 0 pts | yes | identical | Yes | test 55 |
| All | Existing CTAs / testids | present | present | Yes | tests 108–112 |
| All | Engines import nothing from action-layer | — | true | Yes | test 111 |

## E. Maps current behaviour

`scan(profile, gbp)` evaluates LocalSEOHub-declared fields and, when Google is connected, server-verified GBP data (`verified_profile`, A2.5). Up to 5 priorities (`MAX_PRIORITIES`) with CTAs to `/negocio`, `/fuentes` or `/herramientas/advisor` (reviews). Google-only checks are "No comprobado" when disconnected and are not penalised.

## F. Maps Action Layer

Each priority gets "Por qué importa / Why it matters" and "Siguiente paso / Next step". Services adds a supporting link to SEO Generator ("Redactar una descripción de servicio"). Google-side items (`fix_gbp`, `align_*`, reviews) keep their existing destinations; copy states the change happens in the user's Google profile, not inside LocalSEOHub.

## G. Twin current behaviour

`buildDigitalTwin(profile, gbp)` computes knowledge % from declared fields + GBP connection, 8 knowledge blocks, provenance summary and up to 5 gaps (`TWIN_MAX_PRIORITIES`) with CTAs to `/negocio`, `/negocio/objetivos`, `/fuentes`. It never fills missing values.

## H. Twin dependency map (code evidence only)

| FIELD | SEO | ADVISOR | VOICE | MAPS | GEO | TWIN | CODE EVIDENCE |
|---|---|---|---|---|---|---|---|
| name | Y | Y | Y | Y | Y | Y | seo `sanitizeFacts()`; advisor `PROFILE_FIELDS`; voice `TEXT_FIELDS`; engines `profile.name` |
| category | Y | Y | Y | Y | Y | Y | same |
| city | Y | Y | Y | Y | Y | Y | same |
| services | Y | Y | Y | Y | Y | Y | seo `sanitizeFacts()`; advisor `buildFacts()` `b.services`; voice `buildFacts()` `business.services`; engines |
| target_audience | Y | Y | Y | N | Y | Y | Maps engine has no `target_audience` reference (test 84) |
| primary_goal | Y | Y | Y | N | N | Y | advisor/voice `buildFacts()`; GEO engine has no `primary_goal` (test 85) |
| website | Y | Y | Y | Y | Y | Y | all sources |
| phone | Y | Y | Y | Y | Y | Y | all sources |
| schedule | Y | Y | Y | Y | Y | Y | all sources |

Files: `supabase/functions/seo-generator-v2/logic.ts`, `supabase/functions/business-advisor-v2/logic.ts`, `supabase/functions/voice-simulator-v2/logic.ts`, `src/features/{maps-scanner,geo-audit,digital-twin}/engine.ts`. Encoded in `FIELD_CONSUMERS` / `FIELD_EVIDENCE` and verified against source by tests 81–87.

## I. Twin Action Layer

Each gap shows why/next plus "También lo usan / Also used by" (field consumers minus Twin). Twin-specific wording for services ("LocalSEOHub todavía no conoce…") and GBP connection. No claim about what external assistants know.

## J. GEO current behaviour

`geoAudit(profile, gbp)` scores AI-readiness of declared + verified data, with existing `why` per priority, disclaimer and "not measured" block. Unchecked criteria score 0 and are excluded from coverage, not counted as errors.

## K. GEO Action Layer

GEO already had its own why; the Action Layer renders only the next step and supporting tool (`showWhy={false}`), avoiding duplicated reasons.

## L. Action Layer model

- `ActionItem = { id, tool, key, destination, supporting, usedBy, aiCost: 0 }`.
- `destination` is always the engine's existing `cta` (no new destinations).
- Priority ids map to shared `ActionKey`s (`MAPS_KEYS`, `TWIN_KEYS`, `GEO_KEYS`); dedup by key per tool; `slice(0, MAX_ACTIONS=5)`.
- Supporting tool dropped when equal to primary route.
- Pure functions, no I/O, no state, no completion flag.

## M. CTA destination map

| TOOL | FINDING | WHY | ACTION | CTA | DESTINATION | SUPPORTING TOOL | DATA SOURCE | PROVENANCE | AI COST | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| Maps | complete_profile | No name/category, nothing to evaluate | Complete identity | existing | /negocio | — | LocalSEOHub profile | declared | 0 | Live |
| Maps | add_category | Category defines the activity | Add category | existing | /negocio | — | profile | declared | 0 | Live |
| Maps | add_city | Locality context | Add city | existing | /negocio | — | profile | declared | 0 | Live |
| Maps | add_phone | Contact data completeness | Add phone | existing | /negocio | — | profile | declared | 0 | Live |
| Maps | add_schedule | Opening info completeness | Add hours | existing | /negocio | — | profile | declared | 0 | Live |
| Maps | add_services | Offer clarity | Add services | existing | /negocio | SEO Generator | profile | declared | 0 | Live |
| Maps | add_website | Contact/data completeness | Add website | existing | /negocio | — | profile | declared | 0 | Live |
| Maps | connect_gbp | Google checks are "No comprobado" | Connect Google | existing | /fuentes | — | GBP | unchecked | 0 | Live |
| Maps | fix_gbp | Connection error | Reconnect | existing | /fuentes | — | GBP | unchecked | 0 | Live |
| Maps | align_phone / align_website | Declared vs verified mismatch | Review in Google profile | existing | /negocio | — | GBP verified | verified | 0 | Live (edit happens in Google) |
| Maps | reviews | Google returns 0 reviews | Think through with advisor | existing | /herramientas/advisor | — | GBP `totalReviews` | verified | 0 | Live, no review management |
| Maps | keep_fresh | All good | Keep data updated | existing | /negocio | — | profile | declared | 0 | Live |
| Twin | complete_identity … add_website | Field unknown to LocalSEOHub; used by other tools | Complete field | existing | /negocio | SEO (services) | profile | declared | 0 | Live |
| Twin | add_audience | Used by SEO, Advisor, Voice, GEO | Describe audience | existing | /negocio | Advisor | profile | declared | 0 | Live |
| Twin | add_goal | Used by SEO, Advisor, Voice | Choose goal | existing | /negocio/objetivos | Advisor | profile | declared | 0 | Live |
| Twin | connect_gbp / fix_gbp / sync_gbp | No verified data | Connect / repair | existing | /fuentes | — | GBP | unchecked | 0 | Live |
| Twin | keep_updated | Complete | Keep updated | existing | /negocio | — | profile | declared | 0 | Live |
| GEO | complete_identity … add_hours | existing GEO why | Complete field | existing | /negocio | SEO (services), Advisor (audience) | profile | declared | 0 | Live |
| GEO | connect_gbp / fix_gbp | Unverified | Connect / repair | existing | /fuentes | — | GBP | unchecked | 0 | Live |
| GEO | align_sources / gbp_category | Declared vs verified | Review in Google profile | existing | /negocio or /fuentes | — | GBP verified | verified | 0 | Live (edit in Google) |
| GEO | keep_fresh | All good | Keep updated | existing | /negocio | — | profile | declared | 0 | Live |

All destinations exist in `App.tsx` (tests 12, 34, 56, 66, 88, 89).

## N. Cross-tool dependencies

One field feeds several tools (table §H). Completing `services` removes the services action from Maps, Twin and GEO simultaneously, because each engine stops emitting the priority (tests 13–16, 35–39, 57–60). No cross-tool state is stored.

## O. Future GBP / reviews opportunities

Only `totalReviews` is server-verified today. Ratings, review listing and reply workflows would require additional GBP API scopes and a server-side flow; none was added. The reviews copy explicitly says LocalSEOHub does not manage reviews.

## P. Plan / Hoy future integration (documented only, not implemented)

Hoy and Plan were not modified. `ActionItem.key` is shared across tools, so a future A2.7.2/A2.7.3 could merge Maps/Twin/GEO actions by key to show one deduplicated "next step" list. Requires explicit authorization.

## Q. Truthfulness review

- No ranking/position/guarantee wording in ES/EN action copy (regex tests 10, 32, 33, 52–54).
- "No comprobado" remains neutral (tests 11, 55).
- No traffic, customer or review-volume promises; no review management (69, 70).
- Twin copy speaks only about what LocalSEOHub knows; no Internet-wide or ChatGPT claims.
- Dependencies come from code (81–87).

## R. AI cost review

Action Layer has `aiCost: 0`, no `invoke(`, `fetch(` or URLs (tests 20, 41, 62, 80). Caps unchanged: weekly 22, improvement 18, SEO 18, advisor 12, voice 10, global 80 (tests 93–98).

## S. Security / data-access review

The layer is pure frontend computation over data the page already loaded for the signed-in user. No Supabase client import, no `.from(`, no service role, no cross-user reads (test 79). No new tables, policies, functions or migrations. A2.5 trust fix intact: client `metadata` / `last_sync_at` ignored (test 102).

## T. Tests / regression

File `src/features/action-layer/__tests__/a271ActionLayer.test.ts`, 112 tests: Maps 1–20, Twin 21–41, GEO 42–62, Action Layer 63–80, dependencies 81–87, regression 88–112. Fixtures: empty, minimal, partial, full × GBP disconnected / connected (+ error state).

Golden values (unchanged before/after):

| Fixture | Maps score | Maps cov | Twin % | Twin band | GEO score | GEO cov |
|---|---|---|---|---|---|---|
| empty/off | null | 50 | 0 | initial | null | 57 |
| empty/on | null | 100 | 10 | initial | null | 71 |
| minimal/off | 28 | 50 | 18 | initial | 27 | 57 |
| minimal/on | 51 | 100 | 28 | initial | 33 | 79 |
| partial/off | 52 | 50 | 39 | initial | 57 | 57 |
| partial/on | 66 | 100 | 49 | partial | 59 | 79 |
| full/off | 100 | 50 | 90 | very_complete | 100 | 57 |
| full/on | 97 | 100 | 100 | very_complete | 100 | 79 |

Full suite: 41 files / 1350 tests green. TS 20 (baseline), ESLint 30 (baseline), build green.

## U. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| A271-001 | INFO | Maps/Twin priorities lacked why/next; GEO had why only | Resolved by Action Layer |
| A271-002 | INFO | Google-side fixes (category, alignment) cannot be done inside LocalSEOHub; CTAs point to `/negocio` / `/fuentes` and copy says the edit happens in Google | Documented, truthful |
| A271-003 | P3 | Reviews action only reacts to `totalReviews === 0`; no richer review data available | Future (§O) |
| A271-004 | INFO | Maps does not read `target_audience`/`primary_goal`; GEO does not read `primary_goal` — "Also used by" reflects this | Verified in code |
| A271-005 | INFO | Advisor NEVER-regex may reject some Voice-related phrases (pre-existing, out of scope) | Not changed |
| A271-006 | INFO | Voice is never a supporting tool: no finding maps truthfully to it | By design |
| A271-007 | INFO | 20 TS / 30 ESLint problems are pre-existing, none in new files | Unchanged |

## V. Remaining product gaps

- Cross-tool deduplicated action list in Hoy/Plan (A2.7.2/A2.7.3, needs authorization).
- Review data beyond total count requires new GBP scope.
- In-app editing of Google profile fields not available.

## Confirmations

A2.7.1 was implemented as a non-destructive extension.
No existing Maps Profile Scanner diagnostic was removed.
No existing Maps Profile Scanner scoring or coverage logic was changed.
No existing AI Digital Twin diagnostic was removed.
No existing AI Digital Twin knowledge scoring logic was changed.
No existing GEO Audit diagnostic was removed.
No existing GEO Audit scoring or coverage logic was changed.
No LocalSEOHub interface was redesigned.
Maps Profile Scanner remains deterministic.
GEO Audit remains deterministic.
AI Digital Twin does not invent missing business information.
No Google Maps ranking is claimed.
No AI assistant ranking is claimed.
No review management capability was fabricated.
Deterministic Action Layer recommendations consume zero AI usage.
AI usage global limit remains 80.
All seven LocalSEOHub tools remain available.
All fourteen retired legacy functions remain retired.
No Stripe configuration was modified.
No billing or Premium entitlement logic was modified.
No Google OAuth configuration was modified.
The A2.5 GBP verification trust fix remains active.
No SMTP configuration was modified.
No authentication flow was modified.
No businesses were deleted.
No connected sources were deleted.
No AI usage counters were reset.
