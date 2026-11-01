# A3.7.4.3 — Gate B.7 — Security Verification (post-publish)

Read-only. Checked 2026-11-01 21:12–21:14 UTC.

## Disarm
- The three `META_INSTAGRAM_REAL_PUBLISH_*` secrets are absent, so `isArmed()` is false for all users and real Graph writes are impossible.
- The remaining secret set equals the pre-arming baseline (20 names).
- `instagram-publishing` is ACTIVE, id a3008491-be86-40c3-ae41-0a93ee773be4, `verify_jwt=true`.
- `meta-publishing` is ACTIVE, id 3b3b0765-4c87-4f5b-ab64-d1025a7a49c1.
- There are 43 functions in total, all ACTIVE, with no pending redeploys.

## Database safeguards: fingerprints `md5(regexp_replace(prosrc,'\s','','g'))`
| Function | Fingerprint | ACL | vs baseline |
|---|---|---|---|
| publish_attempt_begin | c7a783fc795bb4f5eb5ebbc1246e943b | postgres, service_role | match |
| publish_attempt_finish | b899c48ece67be21664ec8564e475cbb | postgres, service_role | match |
| publish_attempt_record_verification | eabb8a45d15c3127aecedbf2d5201255 | postgres, service_role | match |
| publish_attempts_guard | 3ae610d5cbf419af15dce170cb853d7a | postgres | match |
| publication_publish_gate | 12f9d6cfa192af2efc55038f2a2745d0 | postgres | match |
| publication_publish_preflight | 356c5e36cba82ea003cf9654fededef7 | postgres, service_role | match |
| publish_attempt_advance | e13cee809bdeaa8381ba02096761454f | postgres, service_role | match |
| publish_attempt_mark_stale | b99f5731dca7b2d9a6df5b6c345b78a1 | postgres, service_role | match |
| internal_test_entitlement_active | 325e375c25b198448ec80d9334065a12 | postgres, service_role | match |

None of these functions is executable by `anon` or `authenticated`.

## Access control on publishing tables
- RLS is enabled on publication_publish_attempts, publications, publication_drafts, meta_connections and internal_test_entitlements.
- `publication_publish_attempts`:
  - `authenticated` holds SELECT only.
  - There is a single SELECT policy, `select_own_publish_attempts`: `auth.uid() = user_id` and the business is owned by the caller.
  - There are no INSERT, UPDATE or DELETE grants or policies for client roles.
- `internal_test_entitlements`: no client grants.
- The `publish_attempts_guard` trigger is enabled (`O`).
- Migrations: 60, the latest is 20261031234927, the same as the B.6 baseline.

## Replay protection
- `publication_publish_gate(user, D, 'instagram', 3)` now returns `ALREADY_PUBLISHED`.
- The idempotency key `875587f5…:instagram:v3` is consumed.
- A second publish of D v3 is therefore refused at the database level even if the system were re-armed.

## Residual items
- Entitlement 41af3f04… expires on its own at 22:21:13 UTC. It is harmless while disarmed.
- No secrets, tokens or credential values appear in this report or in the evidence.
