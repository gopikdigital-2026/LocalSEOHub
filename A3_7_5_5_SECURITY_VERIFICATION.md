# A3.7.5.5 — Security & Publishing Safety Verification

All checks are read-only. No secret, record, permission or switch was changed.

| # | Check | Evidence | Result |
|---|---|---|---|
| S1 | Facebook real publishing disabled server-side | facebookPublish.ts requires META_FACEBOOK_REAL_PUBLISH_ARMED=="true" plus a USER_IDS allowlist, otherwise 403 REAL_PUBLISH_DISABLED. Production secret list has no META_FACEBOOK_* entry | PASS |
| S2 | Instagram real publishing disabled server-side | instagramPublish.ts requires ARMED, USER_IDS, PUBLICATION_IDS and the internal_test_entitlement_active RPC. Production has no META_INSTAGRAM_* secret | PASS |
| S3 | No active internal test entitlement | internal_test_entitlements: 1 row total, 0 active. The table has no client policies, so clients have no access | PASS |
| S4 | No customer bypass | Gates are read from server env plus DB only. No request body or browser flag is consulted. Publishing functions verify the JWT. The internal route needs a server-side ADMIN_EMAIL check (internal-access) | PASS |
| S5 | Tenant isolation | publication_publish_attempts SELECT policy is auth.uid()=user_id AND the user owns the business. Meta Page/IG partial unique indexes plus service-role-only meta_claim_page_selection (migration 20261101230430, applied). a3752TenantSecurity tests pass | PASS |
| S6 | Frozen engines unchanged | sha256(cat meta-publishing/*.ts instagram-publishing/*.ts) = 58956f462595b404acaa0d9cb1790a6b4cb680780b33a77d83505b9272467606, identical to the frozen value | PASS |
| S7 | No new real publication attempts | publication_publish_attempts = 2 (1 FB, 1 IG, B7 validation). Latest 2026-11-01 21:07:27Z, unchanged since A3.7.5.4 | PASS |

## Observation (not a bypass)

The current source, and production, show the publishing-consent step (meta-publishing `enable_publishing_start`) to any connected customer. A3.7.5.3 had limited this control to operators in the UI. With A3.7.5.3 reverted, that UI restriction is gone again. Granting consent cannot publish while S1–S3 hold.

## Tests

Meta connection, publications, publishing-access, internal-access and FB/IG harness tests: 30 files, 1006/1006 pass. Full suite: 91 files, 3098/3098 pass.

## Result

Production remains safe and publishing is disabled. The security posture does not block anything. The blocker is missing source (see the pre-deploy audit, B1).
