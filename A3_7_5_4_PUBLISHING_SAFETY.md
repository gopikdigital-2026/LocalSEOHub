# A3.7.5.4 — Publishing Safety Audit

| Check | Evidence | Result |
|---|---|---|
| Frozen engines unchanged | `cat supabase/functions/meta-publishing/*.ts supabase/functions/instagram-publishing/*.ts \| sha256sum` = `58956f462595b404acaa0d9cb1790a6b4cb680780b33a77d83505b9272467606`, identical to A3.7.5.2/A3.7.5.3; `src/` and `supabase/` identical to the A3.7.5.3 package (`diff -rq` empty) | PASS |
| Commercial publishing disabled server-side | Production secrets list contains none of `META_FACEBOOK_REAL_PUBLISH_ARMED/USER_IDS`, `META_INSTAGRAM_REAL_PUBLISH_ARMED/USER_IDS/PUBLICATION_IDS`. FB: `facebookPublish.ts:74–75` requires ARMED=="true" + user UUID allowlist → else 403 `REAL_PUBLISH_DISABLED`. IG: `instagramPublish.ts:14–16, 211, 365` same pattern + publication allowlist | PASS |
| Internal test entitlement | `internal_test_entitlements`: 1 row, 0 active (expired); IG engine calls `internal_test_entitlement_active` (`instagram-publishing/index.ts:44, 189`) | PASS |
| Internal test publishing not reachable by customers | Harnesses rendered only at `/internal/publications-validation` inside `InternalGuard`; `internal-access` allows only `ADMIN_EMAIL`; denied → `/hoy` | PASS |
| Tenant isolation / ownership | `meta_connections` owner SELECT + column grant without tokens; `publication_publish_attempts` SELECT only when `auth.uid()=user_id` AND owner of business; page/IG uniqueness indexes + claim function (A3.7.5.2) | PASS |
| No browser flag bypass | Arming read only from server env; user id from verified JWT; business from `getOwnBusinessId(userId)`; publication allowlist from env; entitlement via server RPC | PASS |
| No live publication during audit | No publish action invoked; last attempt `2026-11-01 21:07:27Z` (1 FB + 1 IG succeeded, operator-authorized B-gates); no new rows | PASS |

## Observation (not a bypass)
`meta-publishing enable_publishing_start` is callable by any connected customer and opens a Meta dialog for the 6 publishing scopes. It cannot publish (arming absent), but in production the A3.7.5.2 frontend shows this step to every connected customer. A3.7.5.3 (pending deployment) hides it from non-operators in the UI. Server-side restriction of this consent request should be decided in the implementation phase.

## Can the architecture support an authorized Meta-review demo without general publishing?
YES, without engine changes, using existing controls only, as a temporary, explicitly owner-authorized window:
- Facebook: `META_FACEBOOK_REAL_PUBLISH_ARMED=true` + `…_USER_IDS=<reviewer test user UUID>`.
- Instagram: same + `…_PUBLICATION_IDS=<specific publication UUIDs>` + an active, time-limited internal test entitlement for the reviewer user.
- Every other user still receives 403. Disarm by deleting the secrets after review.
Limitation: Facebook has no per-publication allowlist, so an armed reviewer user can publish any of its own approved publications to its own connected Page. Acceptable only for a dedicated reviewer account and test Page.
NOT implemented or activated in this phase.

## Verification (this phase)
- Application source, migrations, functions and secrets: unchanged (no edits, no deploys).
- Full regression: 92 files, 3118/3118 passed.
- Production build: passes.
- TypeScript (reported separately, pre-existing, unrelated to Meta): 20 errors — LandingPage.tsx 10, BusinessAuditLanding.tsx 2, ContentGeneratorLanding.tsx 2, MetaAdsLanding.tsx 2, App.tsx 1, DiagnosticLanding.tsx 1, AdminDashboard.tsx 1, a3422GbpRecovery.test.ts 1. Same count and files as the A3.7.5.2/A3.7.5.3 baseline.
