# A3.7.4.3 — Gate B.6 — Execution Plan for the Real Instagram Test (PREPARED, NOT EXECUTED)

This plan runs only under a separate, explicit owner authorization. Exactly one attempt is allowed, and there are no automatic retries.

## 1. Owner authorizations required (all written, all in the same session)
- A1. Authorization to arm, i.e. to create the 3 secrets below for this test only.
- A2. Authorization for exactly ONE real Instagram publish of publication D v3 to IG account 17841462487279994.
- A3. If the entitlement is expired or under 30 minutes from expiry: separate authorization to renew it (section 2).
- A4. Authorization to disarm immediately afterwards, by deleting the 3 secrets.

## 2. Entitlement renewal (only if A3 is granted; not done in B.6)
- Current entitlement 41af3f04-b3f2-48fb-997a-279c84e012ae expires 2026-11-01 22:21:13 UTC.
- Renewal is done by the owner, or under owner authorization, as one SQL statement:
  `UPDATE internal_test_entitlements SET expires_at = now() + interval '2 hours' WHERE id = '41af3f04-b3f2-48fb-997a-279c84e012ae' AND revoked_at IS NULL;`
- Afterwards, confirm `internal_test_entitlement_active('aabe426e-f079-4db1-835b-17d9d126313e') = true`.
- Keep the window short (2h or less) and record the before and after rows.

## 3. Exact arming config (edge-function secrets)
```
META_INSTAGRAM_REAL_PUBLISH_ARMED=true
META_INSTAGRAM_REAL_PUBLISH_USER_IDS=aabe426e-f079-4db1-835b-17d9d126313e
META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS=875587f5-0137-4477-904c-609e8e406ad6
```
These must be exact, single values: no wildcards, spaces, quotes or extra entries. Do not change any other secret.

## 4. Preflight checks (read-only; any failure means STOP, do not arm or publish)
- P1. The fingerprints of begin, finish, record_verification, guard, gate, preflight, advance, mark_stale and entitlement_active equal the readiness report. The policy hash is 529a39b1…, the function-ACL hash is 35a194e9…, and there are 60 migrations.
- P2. Publication D: version 3, caption sha256 537130…, image eTag fc3a190e… / 901,643 B, IG account 17841462487279994, Page 1393994523793266, `publication_publish_gate(...,'instagram',3)` IS NULL.
- P3. The entitlement is active, with at least 30 minutes before expires_at.
- P4. Instagram attempts = 0, containers = 0, derivatives bucket empty. The Facebook attempt is unchanged.
- P5. `instagram-publishing` is ACTIVE with id a3008491-be86-40c3-ae41-0a93ee773be4.
- P6. After arming: the `instagram_publish_status` call (read-only) returns `trigger.enabled=true`, `reason=null`, `derivative.ready=true`, and all required permissions true.

## 5. The single attempt
The owner, signed in, clicks Publish once in the Instagram panel. This is equivalent to one POST of `{action:"instagram_publish", publicationId:D, expectedVersion:3}` without `retry`.
- Do not double-click, refresh or re-submit.
- Record the response code and body, and the UTC time.

## 6. Verification
- V1. The response `ok:true, state:SUCCEEDED` carries `meta_object_id` and `permalink`.
- V2. The attempt row is status=succeeded, external_stage=publish_requested, meta_object_id equal to the response, and meta_container_id set.
- V3. The permalink opens on account 17841462487279994, and the caption and image are visually those of D.
- V4. Read-only Graph GET of the media id: the id, permalink and caption match.

## 7. Duplicate and state checks
- Instagram attempts = 1 and successes = 1 for D.
- The account shows exactly one new post with this caption since the start time.
- The Facebook attempt is unchanged, and so are publication D and its draft (v3, same caption SHA).
- The derivatives bucket is empty again; if not, record it for cleanup, which needs separate authorization.

## 8. Immediate disarm (regardless of outcome)
- Delete all 3 `META_INSTAGRAM_REAL_PUBLISH_*` secrets.
- Confirm they are absent from the secrets list, and that `instagram_publish_status` reports `armed:false, reason:not_armed`.
- Optionally, with owner authorization, revoke the entitlement: `UPDATE ... SET revoked_at = now()`.

## 9. UNKNOWN-outcome incident procedure
This applies to a 202 PUBLISH_OUTCOME_UNKNOWN, a timeout, a network error, or an attempt stuck in `publishing`.
1. Do NOT click Publish again, and do NOT send `retry`. The database blocks any new attempt while one is unknown.
2. Disarm the publish path only after verification, because verification also requires the arming and allowlist. Alternatively, keep it armed only for the verify action and disarm right after.
3. Wait at least 5 minutes, then run `instagram_publish_verify` once. It is a read-only Meta lookup:
   - **found**: the attempt becomes succeeded with the media id and permalink. Proceed to sections 6–8.
   - **absent**: possible only if publish was never requested. The attempt becomes failed and retryable. A new attempt still needs a NEW owner authorization.
   - **inconclusive**: the attempt stays UNKNOWN. The owner checks the IG account manually. Do not retry, and do not edit rows by hand.
4. Record the times, the responses and the attempt row. Escalate to the owner, and disarm.

## 10. Prohibitions during the test
- No second attempt, no automatic retries, and no edits to D.
- No migrations or deploys, and no secrets other than the 3 above.
- No Facebook publish.
