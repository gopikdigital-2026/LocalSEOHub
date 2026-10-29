# A3.7.4.2 — GATE B.2 PART 1 — FIX/DIAGNOSTIC 01 — Admin Test C Premium Entitlement Block

Date: 2026-10-29. Read-only diagnostic. No code, schema, billing, Stripe or publication data was modified.

## A. Authenticated user / role
- C owner: `aabe426e-f079-4db1-835b-17d9d126313e` (gopik.digital@gmail.com).
- Business `e6014022-370f-4ec0-a340-c7c55f808247` "Gopik.Digital", owned by the same user.
- `meta_connections` row (Page Localseohub.io) belongs to the same user + business — C is correctly scoped for the later publish.
- There is NO role/admin column or table used by the entitlement path. "Admin" exists only as secret `ADMIN_EMAIL`, read solely by `admin-stats` (analytics dashboard access). It is not consulted by any Premium check.
- Note: A and B belong to a different user (`5fa9559d-…`), which is why they were generated while C cannot be.

## B. Entitlement / subscription state (server)
`billing_state_for(aabe426e…)`:
- state `TRIAL_EXPIRED`, has_premium `false`
- user_trials: started 2026-10-20 16:44:57, ended 2026-10-27 16:44:57 (origin explicit)
- stripe_customers: `cus_Ut0v…` (soft-deleted 2026-10-08, archived test-mode), `cus_VQdX…` (active customer, no subscription)
- subscription_status: null

## C. Code path enforcing Premium
1. `publication-proposals/index.ts` → `requirePremium(req, "publication-proposals", cors)`
2. `entitlement.ts` → resolves user from JWT via `/auth/v1/user` (server-side), then RPC `authorize_premium_request(p_user_id, 'publication-proposals', 30, 3600)`
3. `authorize_premium_request` → `IF NOT (billing_state_for(p_user_id)->>'has_premium')::boolean THEN RETURN 'premium_required'`
4. `billing_state_for` → has_premium only for `TRIAL_ACTIVE | SUBSCRIPTION_ACTIVE | SUBSCRIPTION_CANCELING`
5. 403 `premium_required` → UI "Esta prueba requiere una cuenta Premium."

## D. Exact failing condition
`billing_state_for` returns `TRIAL_EXPIRED` because `now() (2026-10-29 22:09) >= user_trials.ends_at (2026-10-27 16:44)` and there is no live Stripe subscription → `has_premium = false` → `premium_required`.

This is the system working as designed, not a resolution defect.

## E. Is owner/admin Premium part of the intended architecture?
No. Neither `billing_state_for`, `authorize_premium_request`, nor `entitlement.ts` (identical copies enforced by test across premium functions) contains any owner/admin/allowlist branch. No migration defines one.

## F. Existing secure internal testing exemption?
None. `/internal/publications-validation` uses the same production `publication-proposals` function and same Premium gate. `ADMIN_EMAIL` is not wired to entitlement.

## G. Recommended minimal correction (NOT implemented — needs authorization)
Option 1 (no code change, legitimate existing path): Manuel subscribes through the real Stripe checkout on his own account. This uses existing, sanctioned billing — no fake payment, no history alteration. Real charge applies.

Option 2 (minimal secure design, requires explicit authorization):
- New table `internal_entitlement_grants(user_id uuid pk, reason text, granted_at, expires_at timestamptz not null)`; RLS enabled, zero grants to anon/authenticated (service_role / migration only).
- `billing_state_for` adds `has_premium = true` (state stays truthful, e.g. new flag `internal_grant: true`) only when an unexpired row exists for `p_user_id`.
- Row inserted by migration for `aabe426e…` with a short expiry (e.g. 72h) and reason `A3.7.4.2 Gate B.2 test C`.
- No browser input, no ADMIN_EMAIL trust, no Stripe change, normal users unaffected; rate limit (30/h) and per-publication generation cap (4) still apply.
- Tests: grant absent → premium_required; expired → premium_required; present → ok; anon/authenticated cannot read/insert the table.

Not recommended: extending the trial by editing `user_trials` (alters billing/trial history).

## H. C preservation
- id `0e4de21c-f799-4f34-8016-78f6377bbe34`, status `image_ready`, updated 2026-10-29 22:06:24.626469
- image `image/png`, 2,089,456 bytes, 1086×1448, normalized true, private path `aabe426e…/e6014022…/0e4de21c…/9502a80e-0277-437a-9e53-456284806618.png`
- proposal_generations_used 0, no claim; proposals 0; drafts 0. Not modified.

## I. A/B preservation
- A `65569535…` proposals_ready, updated 2026-10-27 23:05:19, drafts md5 `5b7366bfcaa8e008b1ba5b38138bf8dd` (unchanged)
- B `442059e5…` proposals_ready, updated 2026-10-28 12:27:05, drafts md5 `fd3e4f7a51725b58fced11e3ef4975ac` (unchanged)

## J. Publishing disarmed
Edge secrets contain no `META_FACEBOOK_REAL_PUBLISH_ARMED` / `META_FACEBOOK_REAL_PUBLISH_USER_IDS`. REAL_FACEBOOK_PUBLISH_ARMED = false. No Meta endpoint called.

## K. Attempts / posts
publication_publish_attempts = 0. Facebook posts created = 0. Instagram posts created = 0.

## Verdict
DESIGN AUTHORIZATION REQUIRED — NO EXISTING SECURE ADMIN TEST ENTITLEMENT EXISTS
