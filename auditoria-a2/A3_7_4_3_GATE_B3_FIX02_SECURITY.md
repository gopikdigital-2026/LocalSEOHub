# A3.7.4.3 — Instagram Gate B.3 — FIX02 — Security

**Verdict: NO-GO — A3.7.4.3 GATE B.3 FIX02 REQUIRES CORRECTION** (root cause evidenced; correction pending a governed exception)

## 1. Actions performed
All actions were read-only:
- Static code trace.
- `information_schema` and `has_*_privilege` catalog queries.
- One `SET LOCAL ROLE service_role` SELECT probe inside a `DO` block that always raises an exception, so nothing could persist.
- A production snapshot query.
- Listing the edge functions and secret names.

The following were **not** done:
- any migration, grant or DDL;
- any code change or deploy;
- any Graph call, /media or /media_publish request, or container;
- any attempt, storage write or secret change;
- impersonating the owner.

## 2. Security assessment of the current defect
- Fail-closed: the status, publish and verify paths all call `deps.context` first and return 500 INTERNAL_ERROR before any side effect.
- No false PASS and no data leak. The error is redacted in the server log, and the client receives only `code`.

## 3. Security assessment of the proposed correction (not applied)
| Aspect | Assessment |
|---|---|
| Privilege | SELECT only, on 9 named columns, to `service_role` only. `service_role` already holds broader rights on the sibling tables. |
| Writes | Unchanged. INSERT, UPDATE and DELETE stay revoked, mutations stay only via `publish_attempt_begin/advance/finish` (SECURITY DEFINER) and the `publish_attempts_guard` trigger is unchanged. |
| anon / authenticated | Unchanged. |
| RLS | Unchanged (`service_role` bypasses RLS by design). Queries stay scoped by `user_id` + `publication_id` + `channel` in `index.ts`. |
| Columns excluded | `idempotency_key`, `error_code`, `meta_object_id`, `permalink`, `business_id`, `draft_version`, `retryable`, `verification_*`, timestamps not used. |
| Auth / ownership / entitlement | Unchanged. The frozen handler code is unmodified. |
| Arming | Unchanged. `META_INSTAGRAM_REAL_PUBLISH_ARMED`, `_USER_IDS` and `_PUBLICATION_IDS` are all absent, so the trigger stays `not_armed`. |
| Facebook / FIX01 | Untouched (hashes below). |

## 4. Production safety snapshot (read-only, this session)
| Check | Result |
|---|---|
| D status | `proposals_ready`; publication updated_at 2026-10-31 16:16:13.516242+00 |
| D draft | v3, updated_at 2026-10-31 16:22:09.849195+00 |
| D Instagram caption sha256 | `537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e` (unchanged) |
| D image | Same path `…/ba93c54e-c0ee-4fa0-a7b4-8284cddaa808.png`, 901,643 B, eTag `fc3a190ee41708dc8b242ff5b711ae58` (unchanged) |
| A / B / C updated_at | 65569535 at 2026-10-27 23:05:19.287086; 442059e5 at 2026-10-28 12:27:05.291163; b140fc59 at 2026-10-30 00:13:08.946825 (unchanged) |
| Publications | 18 |
| Attempts | 1 Facebook succeeded; **0 Instagram**; 0 active (publishing or unknown); 0 containers |
| Buckets | `publication-images` private, 18 objects; `instagram-derivatives` private, 0 objects |
| meta_connections | 1 row |
| Arming secrets | Absent (secret names list contains no `META_INSTAGRAM_*`) |
| instagram-publishing | ACTIVE, verifyJWT true, id a3008491-be86-40c3-ae41-0a93ee773be4 (not redeployed) |
| Applied migrations | 58 rows in `schema_migrations` (unchanged; 59 files locally) |

## 5. Regression / tests
No files under test were changed, so no suite was re-run in FIX02. The FIX01 baseline stands: 2964 pass, 0 fail, 20 inherited tsc errors, build OK. The FIX02 test file will be written once the exception is authorized.

## 6. Limitations
- No edge-function log tool is available. The server log line (`stage:"instagram"`, redacted "context lookup failed") could not be read directly.
- The failure was reproduced at the database layer with the exact query and role, plus a static trace of the throw and catch path. A live status call was not made, because it would need the owner's JWT.
