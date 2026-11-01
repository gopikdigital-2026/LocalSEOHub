# A3.7.5.1 — Social Intelligence — Commercial Facebook & Instagram Publishing Readiness Audit

- Mode: STRICT READ-ONLY. No source, migration, deploy, secret, OAuth, entitlement or Meta change was made.
- Evidence date: 2026-11-01 (UTC), production project + repository working tree.
- Companion docs: `A3_7_5_1_CUSTOMER_JOURNEY_MATRIX.md`, `A3_7_5_1_BLOCKERS_AND_DEPENDENCIES.md`, `A3_7_5_1_IMPLEMENTATION_PLAN.md`.

Legend — Status: IMPLEMENTED / PARTIAL / MISSING / BLOCKED / UNKNOWN. Severity: BLOCKER / HIGH / MEDIUM / LOW.
"Frozen" = touches the Gate B.7 frozen engine (`supabase/functions/instagram-publishing/*`, `supabase/functions/meta-publishing/*`, publish_attempt_* DB functions). Fact = observed in code/DB. Assumption = explicitly marked.

## 0. Executive summary (facts)

1. Exactly one end-to-end proof exists per channel, both by the owner (user `aabe426e…`, business `e6014022…`, Page `1393994523793266`, IG `17841462487279994`): FB attempt `aaca823e…` (2026-10-30) and IG attempt `ba3e3bca…` (2026-11-01), both `succeeded` with stored permalinks.
2. No ordinary customer can publish today, by design:
   - FB: `isArmed` env gate + user allowlist (`META_FACEBOOK_REAL_PUBLISH_*`), secrets absent → `REAL_PUBLISH_DISABLED`.
   - IG: env gate + user + publication allowlists, `APPROVED_TARGET` hardcoded to publication D v3 with caption/image hashes, and DB-level `internal_test_entitlement_active` requirement.
3. The only publish UI is an internal harness at `/internal/publications-validation`, not linked from navigation but reachable by any signed-in, onboarded user (AppGuard checks sign-in + onboarding only).
4. "Inteligencia Social" (`/herramientas/social`) is an insights page only; it has no create/publish/history actions.
5. Meta platform status (App mode, Advanced Access, App Review for `pages_manage_posts` / `instagram_content_publish`, Business Verification) is NOT VERIFIED in any artefact → EXTERNAL DEPENDENCY, and is the gating item for 20 independent businesses.
6. No paid-plan check exists in the publish path (content generation is premium-gated; publishing is not).

## A. OAuth onboarding

| # | Finding | Status | Evidence | Severity | Smallest safe action | Frozen? |
|---|---|---|---|---|---|---|
| A1 | Read-scope connect flow: `pages_show_list, pages_read_engagement, business_management, instagram_basic`; Graph v25.0; `auth_type=rerequest` | IMPLEMENTED (proven for owner only) | `meta-oauth-start/handler.ts:7-9,88-100` | — | none | No |
| A2 | State + binding: 32-byte random, SHA-256 hashed in DB, 10-min TTL, single-use; browser binding checked in `meta_complete_authorization` (`wrong_user`/`binding_mismatch`) | IMPLEMENTED | start `:10,38-42,71-72`; callback `:129,270-282`; connection `:159-167` | — | none | No |
| A3 | Separate publishing-consent flow requesting the 4 read scopes + `pages_manage_posts`, `instagram_content_publish`; classic FB Login (no `config_id`) | IMPLEMENTED (proven for owner only) | `meta-publishing/handler.ts:10-18,281-307`; callback `handlePublishing :194-251` | — | none | handler.ts is frozen-adjacent (read-only here) |
| A4 | Token: code → short → long-lived user token; stored via `meta_store_authorization` into Vault (`meta_vault_put/reveal/forget`); table holds only `user_token_ref`. Page tokens derived live per call. `appsecret_proof` on every call | IMPLEMENTED | callback `:312-334`; DB functions `meta_vault_*` (EXECUTE postgres/service_role only) | — | none | No |
| A5 | `authenticated` has column SELECT on `meta_connections` excluding `user_token_ref`; no table-level grant to anon/authenticated | IMPLEMENTED | `information_schema.column_privileges` (2026-11-01) | — | none | No |
| A6 | Page discovery `/me/accounts?limit=100`, no paging (`has_next` logged, not followed) | PARTIAL | callback `:348-357` | LOW | follow `paging.next` (bounded) | No |
| A7 | Page select restricted to stored `available_pages`; auto-select when one page; IG via `instagram_business_account`; missing IG → `not_associated` (FB still usable) | IMPLEMENTED | connection `:96-97,109-131,171-174` | — | none | No |
| A8 | Token expiry: detected (`token_expires_at`, Graph 190/102 → `reauth_required`); no refresh. Production row has `token_expires_at = NULL` | PARTIAL | connection `:221-225`; read `:101,367-368`; DB row | MEDIUM | record/verify expiry via `debug_token`; surface reconnect banner | No |
| A9 | Reconnect: `META_ALREADY_CONNECTED` (409) blocks begin while connected; `reauth_required` path exists; stale attempt expiry 11 min; cancel action | PARTIAL (reconnect from `reauth_required` untested in prod) | start `index.ts:32`, handler `:80-81`; connection `:9,202-219` | MEDIUM | test reconnect journey in pilot staging | No |
| A10 | Disconnect revokes at Meta (`DELETE /me/permissions`) then `meta_disconnect`; vault forget + purge functions exist | IMPLEMENTED (untested in prod for customers) | connection `:184-200`; `meta_vault_forget`, `meta_connections_purge_content`, `meta_connections_wipe_inactive` | — | test | No |
| A11 | Meta Data Deletion Callback (`signed_request`) | MISSING (instructions page `/eliminar-datos` exists) | no match for `signed_request` in `supabase/functions`; `App.tsx:179-181` | MEDIUM (Meta accepts instructions URL — assumption, verify in App Dashboard) | keep instructions URL or add callback | No |
| A12 | App mode (Development/Live), Advanced Access, App Review, Business Verification | UNKNOWN / EXTERNAL DEPENDENCY | `auditoria-a2/A3_5_5_0_…:19,69-71,97,284,302-305` ("NOT VERIFIED") | BLOCKER | owner verifies in Meta App Dashboard and records evidence | No |
| A13 | Hardcoded fallback `SITE_URL || "https://localseohub.io"` | IMPLEMENTED (acceptable) | callback `:139-140` | LOW | none | No |

Proven in production: A1–A5, A7, A10-revocation is NOT proven. Implemented but untested: A9, A10, multi-page selection, `not_associated`. Dependent on Meta: A12, A3 for non-role users.

## B. Tenant isolation

| # | Finding | Status | Evidence | Severity | Action | Frozen? |
|---|---|---|---|---|---|---|
| B1 | All Meta/publish functions authenticate via `auth.getUser(jwt)` and derive business from the user; no client-supplied business/connection id | IMPLEMENTED | meta-* handlers; `facebookPublish.ts:209-212`; IG `index.ts:61-71,144` | — | none | — |
| B2 | All Meta/publish RPCs EXECUTE only postgres/service_role (incl. `meta_read_token`, `publish_attempt_*`, `internal_test_entitlement_active`) | IMPLEMENTED | `pg_proc.proacl` (2026-11-01) | — | none | — |
| B3 | `publication_publish_attempts`: authenticated SELECT only, own rows + own business | IMPLEMENTED | policy `select_own_publish_attempts` | — | none | — |
| B4 | One business per user (`businesses_user_id_key` UNIQUE); one connection per (user,business) | IMPLEMENTED | pg_indexes | — | none | — |
| B5 | No uniqueness on `meta_connections.page_id` / `instagram_account_id`: two tenants who both administer a Page can each connect and publish to it | MISSING | constraint list (only `user_business_key`) | HIGH | partial unique index on active `page_id` (+ IG id), with clear "already connected by another account" error | No |
| B6 | Private buckets `publication-images`, `instagram-derivatives`; path must start with `userId/…/publicationId/` | IMPLEMENTED | storage.buckets; `facebookPublish.ts:152-162`; IG `originalPathOwner :136-139` | — | none | Yes (read) |
| B7 | Internal harness route reachable by any onboarded user | PARTIAL (server gates prevent writes) | `App.tsx:230-240`; `app-v2/auth.tsx:49-66` | MEDIUM | hide route behind owner/role check or remove when customer UI ships | No |
| B8 | Advisors: 13 findings, INFO `rls_enabled_no_policy` on service-only tables (`edge_rate_limits`, `internal_test_entitlements`, `meta_oauth_states`, …) — intentional deny-by-default | IMPLEMENTED | get_advisors 2026-11-01 22:11Z | LOW | none | — |

Assumption: no cross-tenant read/write path was found; a dynamic two-tenant test has NOT been run.

## C. Facebook trace (UI → edge → Meta)

Flow (fact): `FacebookPublishHarness` (internal route) → `repository.ts:51-52,76-77` → `meta-publishing` `index.ts:148-154` → `facebookPublish.ts` actions `facebook_publish_status`, `facebook_publish` → strict body keys (`:47,215`) → `isArmed` (`:111-113`) → `publication_publish_preflight` → retry rules (`:118-125`) → `publish_attempt_begin(…,'facebook',…)` → page token (`facebookPhoto.ts:31-53`) → image ≤ 8 MB, magic bytes (`:79-86`) → `POST /{page}/photos` multipart, single send, 30 s (`facebookPhoto.ts:72-88`) → `readBackPermalink` (`:114-133`) → `publish_attempt_finish`.

| # | Finding | Status | Evidence | Severity | Action | Frozen? |
|---|---|---|---|---|---|---|
| C1 | Env arm flag + user allowlist `META_FACEBOOK_REAL_PUBLISH_ARMED` / `_USER_IDS`; secrets absent in production → disarmed | BLOCKED (test-only gate) | `facebookPublish.ts:6-7,73-77`; secret list (20 names, none META_FACEBOOK_*) | BLOCKER | replace allowlist with commercial authorization (plan + connection + consent); keep a global kill switch | Yes |
| C2 | No paid-plan / commercial entitlement check for FB publishing (DB begin only gates IG) | MISSING | `publish_attempt_begin` source; `authorize_premium_request` used only by generation functions | HIGH | add plan check in a new commercial gate | Yes (begin) or new wrapper |
| C3 | Idempotency: one attempt per publication/channel/version; `ALREADY_PUBLISHED`, `PUBLISH_IN_PROGRESS`, `PUBLISH_OUTCOME_UNKNOWN`, `VERSION_CONFLICT` | IMPLEMENTED | `publication_publish_gate` codes | — | keep | Yes |
| C4 | Ambiguous outcome → `unknown` (202); no verify/recover action for FB | PARTIAL | `facebookPhoto.ts:89-105`; `facebookPublish.ts:146-149` | HIGH | add FB verify (recent page posts match) mirroring IG `instagram_publish_verify` | Yes (new action) |
| C5 | Caption length not enforced (non-blank only) | MISSING | `facebookPublish.ts:152-162` | LOW | validate in draft save (FB limit 63,206 chars) | No (draft side) |
| C6 | Logging redaction (`redact`, `safeErrorLog`) | IMPLEMENTED | `handler.ts:82-104` | — | keep | Yes |
| C7 | No own per-user/page publish rate limit | MISSING | — | MEDIUM | reuse `consume_rate_limit` in commercial gate | No |
| C8 | Harness is internal: shows raw IDs, `INTERNAL_NOTICE` English-only | PARTIAL (test UI) | `facebook-publish/copy.ts:6,9` | HIGH | build customer publish screen | No |

## D. Instagram trace

Flow (fact): harness → `repository.ts` → `instagram-publishing` actions `instagram_publish_status`, `instagram_publish`, `instagram_publish_verify` (`instagramPublish.ts:11,418-420`) → `mayWrite` = armed ∧ allowed ∧ target ∧ entitlement (`:207-211`) → begin → derivative JPEG 4:5..1.91 centre-crop, ≤ 8 MiB, signed URL 600 s (`derivative.ts:5-12,131-151,243-257`) → stage writes `container_requested` → `POST {ig}/media` → poll ≤ 6×2 s → `publish_requested` → `media_publish` → `readBackMedia` → finish → derivative removed in `finally`.

| # | Finding | Status | Evidence | Severity | Keep / Replace | Frozen? |
|---|---|---|---|---|---|---|
| D1 | `META_INSTAGRAM_REAL_PUBLISH_ARMED` | BLOCKED (absent) | `instagramPublish.ts:14,106-110` | BLOCKER | KEEP as global kill switch | Yes |
| D2 | `_USER_IDS`, `_PUBLICATION_IDS` allowlists | BLOCKED | `:15-16,108-122` | BLOCKER | REPLACE (test-only) | Yes |
| D3 | `APPROVED_TARGET` (pub `875587f5…`, v3, caption/image SHA-256) | BLOCKED | `publishTarget.ts:8-14,23-30` | BLOCKER | REPLACE: compare against snapshot captured at begin | Yes |
| D4 | `internal_test_entitlement_active` in `publish_attempt_begin` for `instagram`; purpose `internal_owner_e2e` | BLOCKED | DB `publish_attempt_begin`; `index.ts:43-46,188-206` | BLOCKER | REPLACE with commercial entitlement (plan) | Yes (DB) |
| D5 | Stage write-ahead, `stillAuthorized()` before each write, `snapshotIntact`, Page↔IG link check, no in-write retries, UNKNOWN on transport/5xx | IMPLEMENTED | `:257-260,308-338`; `graph.ts:50-95` | — | KEEP (generic) | Yes |
| D6 | Verify/recover by recent-media caption match (25 posts, ≥ start-60 s) | IMPLEMENTED (not exercised in prod) | `:364-398`; `graph.ts:150-168` | — | KEEP; decouple from allowlist (`:365`) | Yes |
| D7 | Caption ≤ 2200, ≤ 30 hashtags, ≤ 20 mentions not checked | MISSING | `:276` only non-empty | MEDIUM | validate at draft save + preflight | No (draft) / Yes (preflight) |
| D8 | `content_publishing_limit` not checked; only mapped error `META_RATE_LIMITED` | MISSING | `shared.ts:44,52` | MEDIUM | pre-check limit in status | Yes (new) |
| D9 | `subtype_verified:false` hardcoded (account type not checked) | PARTIAL | `:189` | LOW | read `account_type` if permitted | Yes |
| D10 | UI shows raw reason codes; no verify/retry button; permalink parsed but not shown | PARTIAL | `InstagramPublishHarness.tsx:139,150,168,188`; `repository.ts:104,109` | HIGH | customer UI | No |

Instruction honoured: the approved internal function was NOT modified or reactivated. Any commercial path must be a separately reviewed implementation (see plan Phase 3).

## E. Inteligencia Social UI

| # | Finding | Status | Evidence | Severity |
|---|---|---|---|---|
| E1 | `/herramientas/social` = insights only; links to `/fuentes`, `/negocio`, `/herramientas`; no create/publish/history | IMPLEMENTED (insights) / MISSING (publishing) | `SocialIntelligencePage.tsx:19,72,103,126`; catalog `tools/catalog.ts:189-208` | BLOCKER for journey |
| E2 | Creation flow (upload → 3 proposals → adaptation → review/edit → publish) exists only on internal route | PARTIAL | `App.tsx:230-240` | BLOCKER |
| E3 | Review/edit text: textarea, save disabled while busy/invalid, restore, `aria-busy` | IMPLEMENTED (internal) | `ChannelReviewPanel.tsx:155-264` | — |
| E4 | Duplicate-click: two-step confirm + `sending` flag + server lock | IMPLEMENTED (internal) | IG harness `:86,109,171-187`; gate `PUBLISH_IN_PROGRESS` | — |
| E5 | Publishing history / permalink display for customers | MISSING | no `permalink` in `src` outside tests; `a3544SocialIntegration.test.ts:201` asserts none | HIGH |
| E6 | i18n: publish copy ES/EN; meta-connection has no copy file; Spanish-only strings in `auth.tsx`, `AppShellV2.tsx:30-36`; `INTERNAL_NOTICE` EN-only; raw codes shown | PARTIAL | as cited | MEDIUM |
| E7 | Mobile layout / a11y of publish screens | UNKNOWN (not visually verified; no browser) | — | MEDIUM |

## F. Meta platform

| Item | Status | Evidence |
|---|---|---|
| App mode Live | UNKNOWN / EXTERNAL | A3_5_5_0 L69-71 |
| Advanced Access: pages_show_list, pages_read_engagement, business_management, instagram_basic, pages_manage_posts, instagram_content_publish | UNKNOWN / EXTERNAL | publishing scopes added after A3_5_5_0 (which lists only 4 read scopes) |
| App Review approval per permission (screencast of customer flow required — assumption) | UNKNOWN / EXTERNAL | — |
| Business Verification | UNKNOWN / EXTERNAL | A3_5_5_0 L284 |
| Non-role users can authorize | UNKNOWN — NOT proven; only owner identity tested | A3_5_5_0 L97, L289 |
| Page eligibility: user must have CREATE_CONTENT task; IG must be professional and linked | IMPLEMENTED check of tasks (`page_tasks`), IG link check | DB row tasks include CREATE_CONTENT |
| Data deletion URL / privacy URL | Instructions page exists; callback missing | A11 |

## G. Operations

| # | Finding | Status | Severity |
|---|---|---|---|
| G1 | Idempotency `{pub}:{channel}:v{n}` + guard trigger | IMPLEMENTED | — |
| G2 | Retries: only after FAILED with `retry:true`; META_REJECTED needs re-saved draft; no backoff | IMPLEMENTED | LOW |
| G3 | Ambiguous outcomes: IG verify exists; FB has none | PARTIAL | HIGH |
| G4 | Rate limits: Meta errors mapped; no own limiter; IG 24h limit not pre-checked | PARTIAL | MEDIUM |
| G5 | Token expiry: detection only, no proactive alerting | PARTIAL | MEDIUM |
| G6 | Audit log = `publication_publish_attempts` rows + redacted logs; no operator dashboard/alerting | PARTIAL | MEDIUM |
| G7 | Media cleanup: IG derivative removed in `finally`; orphan sweep for crashed runs not verified | PARTIAL | LOW |
| G8 | Emergency disarm: per-channel env flags (delete secret = immediate off, proven at B7) | IMPLEMENTED | — |
| G9 | Internal entitlement `41af3f04…` expiry 2026-11-01 22:21:13 UTC (state after that not re-queried) | INFO | — |

## H. Launch readiness — minimum for a 20-business controlled pilot

Not ready. Mandatory minimum (no optional features):
1. Meta: Live mode, Advanced Access + App Review for the 6 permissions, Business Verification — evidence recorded (EXTERNAL).
2. Commercial authorization gate replacing test allowlists/target/internal entitlement for both channels, with plan check, pilot cohort allowlist (DB table, not env), and global kill switch retained.
3. Page/IG uniqueness across tenants (B5).
4. FB verify action for UNKNOWN outcomes (C4).
5. Caption/hashtag validation and IG publishing-limit pre-check (D7, D8).
6. Customer publishing screen in Inteligencia Social: create → review exact text+image → choose FB/IG → publish → result → history with permalink; reconnect/disconnect entry point; ES/EN.
7. Internal harness route restricted to owner.
8. Pilot operations: attempt monitoring query, UNKNOWN runbook, disarm runbook.

Details and gates: `A3_7_5_1_IMPLEMENTATION_PLAN.md`.

## Facts vs assumptions

- Facts: everything with a file:line or DB/catalog citation above.
- Assumptions: Meta accepting an instructions URL in lieu of a deletion callback; App Review requiring a screencast; absence of cross-tenant paths beyond static review; mobile/a11y quality of internal screens.
- Not read in this audit: `auditoria-a2/A3_5_5_2_META_EXTERNAL_ACCESS_APP_REVIEW_READINESS.md` content, `src/features/billing/*`, `signup-instant` internals, IG `connectionPreflight.ts`. These do not change the blocker list (Meta status remains UNKNOWN regardless).

## Verdict

GO — COMMERCIAL IMPLEMENTATION PLAN READY; NO CUSTOMER PUBLISHING AUTHORIZED
