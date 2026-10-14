# A2.4.4 — Maps Profile Scanner: real data and deterministic local presence check

## A. Summary

The Maps Profile Scanner is now available at `/herramientas/maps`, inside the existing `AppGuard` (session plus onboarding) and gated by the Premium/trial entitlement. It scores how complete the user's local information is, using fixed rules. The score runs from 0 to 100, and coverage is reported separately.

- **No AI and no ledger.** The scanner never calls an AI model and never touches the usage ledger.
- **No new backend.** There is no new edge function and no migration.
- **Works without Google.** Without Google Business Profile (GBP) the tool works in PARTIAL mode: it scores the LocalSEOHub data and marks every Google item as "No comprobado".
- **GBP data only from a real sync.** Google data is shown as "Verificado con Google" only when a `google_business` source is `connected` and has actually been synced.
- **Hub.** The hub shows Maps as available. SEO and Advisor are unchanged; Twin, Radar, GEO and Voice stay blocked.

## B. Real source audit (production state, checked against the database before building)

- **`businesses` (user-entered).**
  - 3 rows. `name`, `category` and `city` are filled in 2 of the 3; `primary_goal` is present.
  - `phone`, `website`, `schedule`, `services` and `target_audience` are empty in every row.
- **`connected_sources`.**
  - Two `google_business` rows, both `disconnected`, with `metadata = {}` and `last_sync_at` null.
  - There are no `reviews` rows with data.
- **`source_sync_events`.** 0 rows.
- **How Google data would arrive.** The `gbp-sync` edge function returns location data; the client then writes it to `connected_sources.metadata`.
  - Keys written: `locationName, name, category, address, phone, website, hours, totalReviews, averageRating`, plus `last_sync_at`.
  - No photos, description, insights, views, calls or directions are ever fetched.
- **Website analysis.** Nothing is persisted, so it is not available.
- **Tokens.** `authenticated` has no SELECT grant on `access_token_encrypted` / `refresh_token_encrypted`. `loadSources` never selects them.

## C. Field table

| Field | Source | Storage | Reliability | Available today | Used |
|---|---|---|---|---|---|
| Name | User | businesses.name | DISPONIBLE | 2/3 rows | Yes (8) |
| Activity | User | businesses.category | DISPONIBLE | 2/3 | Yes (10) |
| City | User | businesses.city | DISPONIBLE | 2/3 | Yes (10) |
| Phone | User | businesses.phone | DISPONIBLE | 0/3 | Yes (10) |
| Website URL | User | businesses.website | DISPONIBLE | 0/3 | Yes (8) |
| Hours | User | businesses.schedule | DISPONIBLE | 0/3 | Yes (8) |
| Services | User | businesses.services | DISPONIBLE | 0/3 | Yes (10) |
| Name on Google | GBP | connected_sources.metadata.name | VERIFICADO if synced | No | Yes (5) |
| Category on Google | GBP | metadata.category | VERIFICADO if synced | No | Yes (6) |
| Address on Google | GBP | metadata.address | VERIFICADO if synced | No | Yes (6) |
| Phone on Google | GBP | metadata.phone | VERIFICADO if synced | No | Yes (6) |
| Website on Google | GBP | metadata.website | VERIFICADO if synced | No | Yes (5) |
| Hours on Google | GBP | metadata.hours | VERIFICADO if synced | No | Yes (5) |
| Review count | GBP | metadata.totalReviews | VERIFICADO if synced | No | Yes (3): presence only |
| Average rating | GBP | metadata.averageRating | — | No | **Not used** (not judged, not shown) |
| Photos / description | — | none | NO COMPROBADO | No | Not used ("Qué no medimos") |
| Maps position / views / calls / directions | — | none | NO COMPROBADO | No | Not used ("Qué no medimos") |
| Website content | — | none | NO COMPROBADO | No | Not used |
| Target audience / goal | User | businesses | DISPONIBLE | partial | Not used (not part of a local profile) |

## D. Classification

**PARTIAL.** The LocalSEOHub fields can be checked today. The Google fields can be checked only when a real sync exists, and none exists in production. The scanner is implemented in partial mode and adapts automatically when synced GBP data appears.

## E. Architecture

- **Pure engine:** `src/features/maps-scanner/engine.ts`.
  - `normalizeGbp(row)` reads only the known GBP keys and ignores everything else.
  - `scan(profile, gbp)` returns `{score|null, band, coverage, evaluated, total, checks[], priorities[], gbpState}`.
  - It has no I/O, no dates and no randomness, so it is deterministic.
- **Page:** `MapsScannerPage.tsx`.
  - Reads the user's own business through `useBusiness()` and the sources through the existing RLS-scoped `loadSources(businessId)`.
  - Computes the result with `useMemo`.
- **Decision: no edge function.** All inputs are the user's own rows, already readable under RLS. A server step would add no security and would only add cost.
- **Entitlement.** Gated client-side with `useBilling().hasPremium` (null shows a "cannot check plan" message; false shows an upsell). Because the data is the user's own and costs nothing, bypassing this gate gives no extra access.
- **Legacy.** `audit-maps-profile` stays 410 and no legacy code was recovered.

## F. Files created

- `src/features/maps-scanner/engine.ts`
- `src/features/maps-scanner/copy.ts` (es/en)
- `src/features/maps-scanner/MapsScannerPage.tsx`
- `src/features/billing/__tests__/a244MapsScanner.test.ts`
- `auditoria-a2/A2_4_4_INFORME.md`

## G. Files modified

- **`src/features/tools/catalog.ts`.** Maps entry set to `ACTIVE`, `enabled: true`, `path: '/herramientas/maps'`.
- **`src/App.tsx`.** Added a lazy `MapsScannerPage` and a route inside the AppGuard block.
- **Tests updated** for the new set of enabled tools:
  - `toolsHub.test.ts` (5)
  - `a2420Ledger.test.ts` (14)
  - `a242SeoGenerator.test.ts` (3)
  - `a243BusinessAdvisor.test.ts` (2-4)

## H. Migrations

None.

## I. Edge function

None created or deployed. `audit-maps-profile` is untouched (410).

## J. Score formula

`score = round(Σ points of evaluable checks / Σ weight of evaluable checks × 100)`

- A check is evaluable unless its status is `unchecked`.
- Points: `ok` earns the full weight and `improve` earns 0. Services earn half the weight when exactly one is listed.
- **Insufficient data:** if both name and activity are empty, `score = null` and the page shows "Necesitamos más información para calcular un diagnóstico fiable."

## K. Coverage formula

`coverage = round(evaluable checks / 14 defined checks × 100)`

- Without GBP: 7/14 = 50 %.
- With a full synced GBP profile: 14/14 = 100 %.
- Hours or reviews missing from the sync payload stay `unchecked` and lower coverage only.

## L. Weights (sum 100)

- **LocalSEOHub (64):** name 8, activity 10, city 10, phone 10, website 8, hours 8, services 10.
- **GBP (36):** name 5, category 6, address 6, phone 6, website 5, hours 5, reviews 3.

Validity rules:
- **Phone:** at least 7 digits.
- **Website:** must look like a domain.
- **Services:** 2 or more is `ok`; exactly 1 earns half.
- **GBP phone/website:** `improve` when they do not match the LocalSEOHub value (digits / host compared).

## M. Thresholds

| Score | State |
|---|---|
| 90–100 | Excelente |
| 75–89 | Bien |
| 50–74 | Mejorable |
| 0–49 | Incompleto |

Unchanged from the spec.

## N. Priority rules (fixed order, max 5)

Rule order:
1. `add_category`
2. `add_city`
3. `add_phone`
4. `fix_gbp` (source in error)
5. `connect_gbp` (not connected)
6. `add_schedule`
7. `add_services` (none or only one)
8. `add_website`
9. `align_phone`
10. `align_website`
11. `reviews` (GBP reports 0)

Special cases:
- If nothing triggers, the only priority is `keep_fresh`, which links to `/herramientas/seo`.
- If the data is insufficient, the only priority is `complete_profile`, which links to `/negocio`.

CTAs:
- `/negocio` ("Completar datos")
- `/fuentes` ("Revisar fuentes")
- `/herramientas/seo` ("Crear contenido")
- `/herramientas/advisor` ("Pedir ideas al asesor"), which is an enabled tool.

## O. GBP connected

- Shows "Google Business Profile conectado".
- Shows "Última sincronización con Google: [date]" only if `last_sync_at` is a real timestamp.
- Google rows are labelled "Verificado con Google".
- If the source is connected but was never synced (no timestamp or no profile keys), it says no data has been received yet and every Google row is "No comprobado".

## P. GBP not connected

The tool still works. It shows "Google Business Profile no está conectado." / "Puedes analizar la información disponible ahora y conectar Google para ampliar el diagnóstico." plus a "Revisar fuentes" button.

- Disconnected rows with stale metadata are ignored.
- A source in `error` state shows a review-connection message. This is not treated as an app error.

## Q. Website

Only the stored URL is checked, for presence and format. No website content is analysed, and no GBP gaps are inferred from it. Website content is listed under "Qué no medimos".

## R. Security

- All data is read through RLS as the signed-in user: `useBusiness` and `connected_sources` filtered by the current business id.
- No client-provided `user_id` or owner value is used.
- No token columns are selected.
- The raw provider payload is never rendered; only normalised fields are used.
- No service role is used and no secrets are involved.
- **Known limitation (documented, not new):** `connected_sources.metadata` is written by the client after `gbp-sync`. A user could therefore edit their own "verified" GBP fields. This only affects that user's own check, so the risk is low. A future server-side sync write would close this gap.

## S. Privacy

The page shows no email, Stripe data, Supabase IDs, auth metadata, location resource names or other businesses.

## T. AI cost

AI cost per run is **0**. There is no model call and no ledger identifier. Refresh only reloads the stored business and the source rows.

## U. Tests

`a244MapsScanner.test.ts` contains 29 test cases that cover the 35 required items plus fixtures A–D.

- **Full suite:** 735 passing (A2.4.3 baseline 706, plus 29 new).
- **Updated tests:** 4 existing hub tests were updated for the new enabled-tool list.

## V. Fixtures

| Fixture | Profile | Score | Coverage | Result |
|---|---|---|---|---|
| A | Complete manual profile, no hours, no GBP | 88 (Bien) | 50 % | Priorities: connect_gbp, add_schedule |
| B | Incomplete profile | 28 (Incompleto) | 50 % | 5 priorities |
| C | Synced GBP data | 100 | 100 % | Google rows verified; a phone mismatch plus 0 reviews lowers the score and adds align_phone and reviews |
| D | No name or activity | null | — | "Necesitamos más información…" message |

## W. Real-data tests

- **TESTED STATICALLY:** route, catalog, guard, absence of AI/ledger/token use, links, copy, 410 functions, untouched regressions.
- **TESTED LOCALLY:** the pure engine against fixtures A–D (vitest).
- **AGAINST DATABASE:** read-only audit of the real `businesses`, `connected_sources` and `source_sync_events` state (see B). No writes.
- **WITH REAL GBP:** not tested. No connected, synced GBP account exists.
- **NOT TESTED:** browser rendering (no browser in this environment); a live GBP sync end to end.

## X. GBP E2E status

**NOT TESTED.** No production GBP connection has synced data. Fixture C uses the exact metadata shape that `gbp-sync` and the client write.

## Y. Build

`npm run build` OK.

## Z. tsc / ESLint / regressions / risks

- **tsc:** 20 errors, identical to the A2.4.3 baseline (all PRE-EXISTING). 0 NEW, and none in the new files.
- **ESLint:** 30 problems, identical to the baseline (PRE-EXISTING). 0 NEW.
- **Regressions:** none. The SEO, Advisor, weekly-content and business-improvement tests all pass.
- **Risks:**
  1. Client-written GBP metadata (see R).
  2. The premium gate is client-side by design, since there is no server cost and only own data.
  3. When GBP data first syncs, coverage jumps from 50 % to up to 100 %, so users will see the change.

### Confirmations

- Maps Profile Scanner does not use AI for scoring.
- Maps Profile Scanner does not consume AI usage.
- Legacy audit-maps-profile remains retired with HTTP 410.
- No Google ranking or Maps position is fabricated.
- Unverified data is not presented as verified.
- Global AI limit remains 80.
- SEO Generator remains operational.
- AI Business Advisor remains operational.
- No Stripe configuration was modified.
- No Google OAuth/GBP configuration was modified.

A2.4.5 has not been started. Awaiting authorization.
