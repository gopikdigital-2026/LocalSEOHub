# A3.7.5.1 — Blockers and Dependencies

Severity order. "Frozen" = requires touching Gate B.7 frozen engine code or its DB functions (must be a separately reviewed change, never an edit of the approved internal path in place).

| ID | Blocker / dependency | Type | Status | Severity | Evidence | Smallest safe corrective action | Frozen? |
|---|---|---|---|---|---|---|---|
| BL-01 | Meta App mode Live, Business Verification | EXTERNAL DEPENDENCY | UNKNOWN | BLOCKER | A3_5_5_0 L19, L69-71, L284 | Owner checks App Dashboard; record screenshots/IDs in an evidence doc | No |
| BL-02 | Advanced Access + App Review for pages_show_list, pages_read_engagement, business_management, instagram_basic, pages_manage_posts, instagram_content_publish | EXTERNAL DEPENDENCY | UNKNOWN | BLOCKER | meta-publishing `handler.ts:11-18`; A3_5_5_0 L302-305 | Submit App Review using the customer flow (needs BL-06 first for screencast — assumption) | No |
| BL-03 | Env test gates: `META_FACEBOOK_REAL_PUBLISH_ARMED/_USER_IDS`, `META_INSTAGRAM_REAL_PUBLISH_ARMED/_USER_IDS/_PUBLICATION_IDS` | INTERNAL | BLOCKED by design | BLOCKER | `facebookPublish.ts:6-7,73-77`; `instagramPublish.ts:14-16,106-122` | Keep `*_ARMED` as kill switch; replace user/publication allowlists with DB pilot cohort + plan check | Yes |
| BL-04 | IG `APPROVED_TARGET` (pub D v3 + caption/image hashes) and target-version checks | INTERNAL | BLOCKED by design | BLOCKER | `publishTarget.ts:8-30`; `instagramPublish.ts:207-213,277,294,311-312` | New commercial IG path: snapshot captured at begin replaces fixed target | Yes |
| BL-05 | Entitlement: IG requires `internal_test_entitlement_active` (owner, `internal_owner_e2e`); FB has no plan check at all | INTERNAL | BLOCKED (IG) / MISSING (FB) | BLOCKER | DB `publish_attempt_begin`; `authorize_premium_request` not used by publish | Commercial gate: `billing_state_for(user).has_premium` + pilot cohort, for both channels | Yes (DB begin) |
| BL-06 | No customer publish UI in Inteligencia Social (create → review → choose channel → publish → result → history) | INTERNAL | MISSING | BLOCKER | `App.tsx:230-240`; `SocialIntelligencePage.tsx` | New customer screens reusing existing panels; no change to frozen engine | No |
| BL-07 | FB has no verify/recover for UNKNOWN outcomes | INTERNAL | MISSING | HIGH | `facebookPhoto.ts:89-105`; `facebookPublish.ts:146-149` | Add `facebook_publish_verify` (recent page posts caption match) via `publish_attempt_record_verification` | Yes (new action) |
| BL-08 | Same Page / IG account connectable by multiple tenants | INTERNAL | MISSING | HIGH | `meta_connections` constraints: only `UNIQUE(user_id,business_id)` | Partial unique index on `page_id` / `instagram_account_id` where status in active set; pre-check for existing duplicates (currently 1 row → none) | No |
| BL-09 | Reconnect/disconnect/expiry journeys untested; prod row `token_expires_at` NULL | INTERNAL | PARTIAL | MEDIUM | connection `:184-225` | Test plan with a second test account; record expiry via `debug_token` | No |
| BL-10 | Raw error codes shown, ES/EN gaps, no history/permalink display, verify not wired | INTERNAL | PARTIAL | HIGH | IG harness `:139-188`; `copy.ts`; no `permalink` in src | Customer copy map for every error code; history list | No |
| BL-11 | Caption/hashtag/mention limits and IG 24h publishing limit not checked | INTERNAL | MISSING | MEDIUM | `instagramPublish.ts:276`; `shared.ts:44,52` | Validate at draft save; `content_publishing_limit` read in status | Partly |
| BL-12 | Internal harness route reachable by any onboarded user | INTERNAL | PARTIAL | MEDIUM | `app-v2/auth.tsx:49-66` | Owner-only guard on `/internal/*` | No |
| BL-13 | Meta Data Deletion Callback missing (instructions page exists) | EXTERNAL acceptance | UNKNOWN | MEDIUM | no `signed_request` handler | Confirm Dashboard accepts `/eliminar-datos` URL, else add callback | No |
| BL-14 | No own per-user publish rate limit; no operator alerting on UNKNOWN/FAILED | INTERNAL | MISSING | MEDIUM | — | `consume_rate_limit` in commercial gate; daily monitoring query | No |

## External dependency owners

- Meta App Dashboard (BL-01, BL-02, BL-13): project owner. Nothing in code can resolve these.
- Each pilot business: must own a Facebook Page (CREATE_CONTENT task) and an Instagram professional account linked to that Page.

## Critical path

BL-01 → (BL-03, BL-04, BL-05, BL-06, BL-08 in parallel) → BL-02 (needs working customer flow for review) → pilot.
