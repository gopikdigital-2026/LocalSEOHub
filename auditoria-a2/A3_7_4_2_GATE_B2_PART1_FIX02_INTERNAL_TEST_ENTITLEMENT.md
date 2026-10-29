# A3.7.4.2 · GATE B.2 · PART 1 · FIX02 — Secure internal owner/admin test entitlement

## A. Scope and authorization
Manuel explicitly authorized the minimal secure design proposed in FIX01. In scope: a server-authoritative, single-user, time-boxed (≤72h), revocable Premium entitlement for internal E2E testing, wired into the central resolver `billing_state_for`. Out of scope and NOT done: Stripe changes, fake payments, trial edits, client bypasses, generating/selecting/adapting/publishing, arming publishing, Gate B.2 Part 2.

## B. Root cause (from FIX01)
Manuel's account (aabe426e-f079-4db1-835b-17d9d126313e) is `TRIAL_EXPIRED`, so `authorize_premium_request` → `billing_state_for(...)->>'has_premium'` returned false and `publication-proposals` returned 403 `premium_required` ("Esta prueba requiere una cuenta Premium.").

## C. Design
- New table `public.internal_test_entitlements` (server-only).
- New predicate `public.internal_test_entitlement_active(uuid)` (SECURITY DEFINER, STABLE, search_path=public).
- `billing_state_for` re-created with byte-identical state CASE rules; `has_premium` = previous premium states **OR** active internal entitlement; new key `internal_test_entitlement`.
- `state` is never changed (stays `TRIAL_EXPIRED`), so trial/subscription semantics, Stripe and the trial ledger are untouched.

## D. Migration
`supabase/migrations/20261029222104_a3742_internal_test_entitlement.sql`, applied via apply_migration. It contains no grants to client roles, no policies and no data inserts.

## E. Table definition
| Column | Definition |
|---|---|
| id | uuid PK, gen_random_uuid() |
| user_id | uuid NOT NULL → auth.users(id) ON DELETE CASCADE |
| purpose | text NOT NULL DEFAULT 'internal_owner_e2e', CHECK = 'internal_owner_e2e' |
| note | text |
| created_at | timestamptz NOT NULL DEFAULT now() |
| expires_at | timestamptz NOT NULL |
| revoked_at | timestamptz NULL |
| created_by | text DEFAULT 'migration' |

CHECK `expires_at > created_at AND expires_at <= created_at + interval '72 hours'`. Index on user_id.

## F. Access control
- RLS enabled, 0 policies (deny-all for client roles).
- `REVOKE ALL` on the table from PUBLIC, anon, authenticated.
- `REVOKE EXECUTE` on `internal_test_entitlement_active` and `billing_state_for` from PUBLIC, anon, authenticated.
- Production verification: authenticated/anon table privileges = false; authenticated execute on predicate = false; authenticated/anon execute on billing_state_for = false; RLS = true; policies = 0.

## G. Grant row (inserted server-side via privileged SQL, not in migration)
| Field | Value |
|---|---|
| id | 41af3f04-b3f2-48fb-997a-279c84e012ae |
| user_id | aabe426e-f079-4db1-835b-17d9d126313e (Manuel) |
| purpose | internal_owner_e2e |
| created_at | 2026-10-29 22:21:13.055308+00 |
| expires_at | 2026-11-01 22:21:13.055308+00 (72h) |
| revoked_at | null |
| created_by | fix02_authorized_by_manuel |

Total rows in table: 1. Active rows: 1.

## H. Identity binding
Bound to the user UUID resolved server-side by `/auth/v1/user` in `entitlement.ts`. No email, JWT claim, user_metadata or app_metadata is consulted. Nothing a client sends can select another user.

## I. Fail-closed behaviour
Predicate requires matching user_id AND purpose AND `revoked_at IS NULL` AND `expires_at > now()`. NULL / unknown UUID / expired / revoked / wrong purpose → false → `premium_required`.

## J. Revocation
Immediate, server-side:
```sql
UPDATE public.internal_test_entitlements SET revoked_at = now() WHERE id = '41af3f04-b3f2-48fb-997a-279c84e012ae';
```
Otherwise it expires automatically at 2026-11-01 22:21:13 UTC.

## K. Client mutation impossibility
No grants and no policies mean clients cannot select, insert, update or delete the row. Confirmed in a rolled-back probe under `SET ROLE authenticated`: self-insert, select and function call were all denied.

## L. Central resolver integration
Both Premium-gated functions (`publication-proposals`, `publication-adaptations`) use the identical `requirePremium` → `authorize_premium_request` → `billing_state_for`. No edge function code changed. The database change is the full deployment.

## M. Unchanged limits
- Rate limit: `authorize_premium_request(..., 30, 3600)` unchanged; `consume_rate_limit` still enforced (probe: limit 1 → `rate_limited`).
- `claim_publication_generation`: ownership check (`id = p_publication_id AND user_id = p_user_id`) and cap `proposal_generations_used >= 4` unchanged.
- `reserve_ai_usage` monthly caps unchanged.
- RLS on publications/proposals/drafts unchanged.

## N. Client UI note
`parseBillingStatus` computes `hasPremium = has_premium === true && PREMIUM_STATES.has(state)`. Because state stays `TRIAL_EXPIRED`, the general app UI may still show the expired-trial message. This is intentional: there is no client upgrade, and only the server gate admits Manuel.

## O. Production probes (all rolled back, 0 rows left)
| Case (free TRIAL_EXPIRED user) | has_premium | authorize_premium_request |
|---|---|---|
| baseline | false | premium_required |
| expired grant | false | premium_required |
| revoked grant | false | premium_required |
| Manuel's grant (cross-user) | false | — |
| active grant | true | ok (state stays TRIAL_EXPIRED) |
| active grant, limit 1 | — | rate_limited |
| after revoke | false | premium_required |

Constraint probes: >72h rejected; bad purpose rejected; NULL/random UUID → false.

## P. Production eligibility check (read-only)
`billing_state_for(aabe426e…)` → `state: TRIAL_EXPIRED, has_premium: true, internal_test_entitlement: true`. `internal_test_entitlement_active` = true. Result: **ALLOWED**, source = internal owner/admin E2E entitlement. A random UUID → internal_test_entitlement false. Subscriber 5fa9559d unchanged (SUBSCRIPTION_ACTIVE, internal false). `authorize_premium_request` was not called for Manuel, so none of his rate-limit tokens were consumed.

## Q. Publishing safety
- `publication_publish_attempts` = 0.
- Edge-function secrets contain no `META_FACEBOOK_REAL_PUBLISH_ARMED` or `META_FACEBOOK_REAL_PUBLISH_USER_IDS`, so `isArmed` = false.
- 0 Meta writes.

## R. Publications
| Publication | Status | Updated | Gens used | Proposals | Drafts | Drafts md5 |
|---|---|---|---|---|---|---|
| A 65569535-5d89-4df3-a8d4-c2af6df8606d | proposals_ready | 2026-10-27 23:05:19 | 1 | 3 | 1 | 5b7366bfcaa8e008b1ba5b38138bf8dd (preserved) |
| B 442059e5-11e4-4bdd-a5bc-c714b0a03b72 | proposals_ready | 2026-10-28 12:27:05 | 1 | 3 | 1 | fd3e4f7a51725b58fced11e3ef4975ac (preserved) |
| bbb1034d-dc25-475c-aa36-0923ece53805 | image_ready | 2026-10-29 22:03:08 | 0 | 0 | 0 | — |
| 0e4de21c-f799-4f34-8016-78f6377bbe34 | image_ready | 2026-10-29 22:06:24 | 0 | 0 | 0 | — |
| **b138628e-3229-4095-96ac-a3cd806127a0 (open candidate)** | image_ready | 2026-10-29 22:16:00 | 0 | 0 | 0 | — |

All three candidates are owned by aabe426e, business e6014022 "Gopik.Digital", PNG 1086×1448, 2,089,456 bytes, normalized. None was deleted or merged.

## S. New tests
`src/features/billing/__tests__/a3742Fix02InternalTestEntitlement.test.ts`: 12 tests, all passing. They cover:
- latest-definition and state-rule identity;
- gate allow and 403;
- active/expiry/revoked/purpose predicates and CHECKs;
- no email/jwt/metadata use and no cross-user grant;
- RLS, REVOKEs, and no policies/grants/inserts;
- client does not upgrade TRIAL_EXPIRED;
- rate limit, claim and reserve untouched;
- ownership check and cap of 4 retained;
- `isArmed` false and no publish path.

## T. Regression re-pins (test-only, authorized by the new migration)
- Migration-count pins 57 → 58 in a281, a33, f03 (×2), a273 and a272.
- `_a3742_` exclusion added to the "latest pre-publications migration" checks in a3542, a273 and a272.
- Hash pins updated for the touched frozen tests: a3741 AUTHORIZED_REPINS for a281/a273/a272 (previous "now" values recorded in a comment), and the a3543 md5 for a3542.

No security assertion was weakened.

## U. Verification
- Full suite: 83 files / 2866 tests passed, 0 failed.
- TypeScript: 20 errors, all inherited, 0 new.
- Production build: passed.

## V. Verdict
**GO — SECURE INTERNAL OWNER/ADMIN TEST ENTITLEMENT ACTIVE; MANUEL MAY RETRY PROPOSAL GENERATION**

Next action (Manuel only): open `/internal/publications-validation?pub=b138628e-3229-4095-96ac-a3cd806127a0` and click "Generar 3 propuestas reales". No proposal was generated, nothing was published, and Part 2 was not started.
