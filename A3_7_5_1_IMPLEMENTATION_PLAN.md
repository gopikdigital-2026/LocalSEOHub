# A3.7.5.1 — Commercial Implementation Plan (proposal; nothing implemented)

Principles: small independently auditable phases; frozen B.7 engine never edited in place — commercial paths are new, reviewed code that reuses the generic safeguards (idempotency, guard trigger, stage write-ahead, `stillAuthorized`, snapshot check, redaction); every phase ends with a GO/NO-GO gate signed by the owner. No phase authorizes customer publishing until Phase 7.

## Phase 0 — Meta external access evidence (owner, no code)
- Work: record App mode, Business Verification, Advanced Access and App Review status per permission (6 scopes); data-deletion URL acceptance.
- Acceptance: evidence doc with dated screenshots/IDs for each item.
- Tests: none (external).
- GATE: GO if Live + Business Verification done or scheduled; App Review may wait for Phase 5 screencast.

## Phase 1 — Tenant hardening (BL-08, BL-12)
- Work: partial unique indexes on active `meta_connections.page_id` and `instagram_account_id`; friendly "already connected by another account" error in callback/page select; owner-only guard for `/internal/*`.
- Acceptance: second tenant cannot connect an already connected Page; non-owner gets redirected from `/internal/*`.
- Tests: migration test with two synthetic users; route guard unit test; full Vitest + build.
- GATE: GO if no existing duplicates broken and all tests green. Frozen code untouched.

## Phase 2 — Commercial authorization gate (BL-03, BL-05, BL-14)
- Work: new table `publishing_pilot_cohort` (service-only, RLS on, no client grants) + function `commercial_publish_authorized(user, channel)` = has_premium ∧ cohort member ∧ connection connected ∧ publishing consent ∧ rate limit. EXECUTE service_role only.
- Acceptance: function returns false for every non-cohort user; owner row added only by explicit owner instruction.
- Tests: SQL tests for each predicate; advisor clean; policy/ACL hash recorded.
- GATE: GO when reviewed. Not wired to any publish path yet.

## Phase 3 — Commercial publish paths (BL-04, BL-07, BL-11)
- Work: new actions (e.g. `facebook_publish_commercial`, `instagram_publish_commercial`, `facebook_publish_verify`) or new functions, using Phase 2 gate instead of env allowlists / `APPROVED_TARGET` / internal entitlement; IG snapshot = version + caption hash + image hash captured at `publish_attempt_begin`; caption ≤ 2200, ≤ 30 hashtags, ≤ 20 mentions; IG `content_publishing_limit` pre-check. Keep per-channel `*_ARMED` env flag as global kill switch (default off). `publish_attempt_begin` IG entitlement branch changed only via a reviewed migration that accepts either internal entitlement or commercial gate.
- Acceptance: frozen internal actions byte-identical (sha256 vs B7 freeze manifest); commercial actions refuse when kill switch off.
- Tests: unit tests for every refusal path, mocked Graph for success/failed/unknown/verify; DB fingerprints diffed against baseline with only the reviewed function changing.
- GATE: GO only after security review; deployed disarmed.

## Phase 4 — Customer UI in Inteligencia Social (BL-06, BL-10)
- Work: customer "Crear publicación" flow: photo → proposals → choose → adapt → review exact text + image per channel → choose FB/IG → confirm → result (success with permalink / failed with plain reason + retry rule / verifying with "Comprobar" action) → history list with permalinks. Reconnect/disconnect entry point. Full ES/EN copy map for every error code; no raw codes. Mobile and keyboard checks.
- Acceptance: every journey step 1–10 reachable without the internal route; double-click impossible (confirm + busy + server lock).
- Tests: component/view-model tests, i18n completeness test, build.
- GATE: GO when owner walk-through on mobile and desktop passes with kill switch off.

## Phase 5 — App Review submission (BL-02)
- Work: screencasts of Phase 4 flow with a test user; permission justifications.
- Acceptance: Meta approval for all 6 scopes recorded.
- GATE: GO only on approval. EXTERNAL.

## Phase 6 — Pilot operations (BL-09, BL-14)
- Work: monitoring SQL (attempts by status/age, UNKNOWN > 2 min), runbooks for UNKNOWN, disarm, token expiry, disconnect; reconnect/expiry tests with a non-owner test account; media orphan sweep check.
- Acceptance: runbooks dry-run by owner; disarm proven < 1 min.
- GATE: GO when runbooks signed.

## Phase 7 — Controlled pilot (20 businesses)
- Work: owner adds cohort members one by one; arm kill switch; first publish per business observed.
- Acceptance: each business publishes 1 FB + 1 IG with permalink; zero cross-tenant events; all UNKNOWN resolved.
- GATE: explicit owner authorization required to start. This audit does NOT authorize it.
