# A3.7.4.3 — Gate B.6 — Security Review (duplicate, UNKNOWN, entitlement)

The sources reviewed are the production SQL bodies (fingerprints in the readiness report) and the local instagram-publishing sources, which match the approved FIX01 hashes.

## 1. Atomic protection against concurrent duplicates
- `publish_attempt_begin` locks the publication (`FOR UPDATE`) and the draft (`FOR UPDATE`), then inserts. A `unique_violation` returns `PUBLISH_IN_PROGRESS` with no attempt id.
- These unique indexes are in production:
  - `publish_attempts_identity_live` (publication, channel, draft_version) WHERE status IN (publishing, succeeded, unknown)
  - `publish_attempts_one_active` (publication, channel) WHERE status IN (publishing, unknown)
  - `publish_attempts_one_success` (publication, channel) WHERE status = succeeded
  - `publish_attempts_number_key` (publication, channel, attempt_number)
- The `publish_attempts_guard` trigger has these rules:
  - New rows must start in `publishing` / stage `none`, with no container, and with the owner, business and publication consistent.
  - Identity columns are immutable.
  - The container id is immutable once set.
  - Stages can only move forward, one step at a time.

## 2. Strict target matching
`APPROVED_TARGET` is frozen: D, v3, caption 537130…, image 6edee998…. It is enforced at these points:
1. `mayWrite`: arming flag, user allowlist, publication allowlist, `isTargetPublication`, and the entitlement.
2. `requestedVersion === 3`, otherwise VERSION_CONFLICT.
3. After begin, the returned `draft_version === 3` and the caption SHA must match.
4. The original image must pass the JPEG/PNG signature, content type and SHA-256 checks against the target.
5. Before both container creation and media_publish, `snapshotIntact()` re-reads the version, path, mime and caption, and checks the SHA of the stored derivative.

A wildcard or malformed allowlist entry disables the whole allowlist.

## 3. Entitlement at the publishing boundary
- The function checks it in `mayWrite` before begin, and `stillAuthorized()` re-checks it before each of the two Graph writes. Any error counts as not entitled.
- SQL `begin` independently refuses Instagram attempts when `internal_test_entitlement_active` is not true.
- Verification (`instagram_publish_verify`) is intentionally not gated on the entitlement, so an UNKNOWN can still be investigated after it expires. It is read-only toward Meta.

## 4. UNKNOWN / ambiguous outcomes
- Stages are written ahead of each external call: container_requested, then container_created, then publish_requested.
- A media_publish response that is not an unambiguous "created", any exception after the first Meta write, or a container already reporting PUBLISHED → `unknown`.
- `publish_attempt_finish` converts `failed` into `unknown` once the stage is `publish_requested` (`ok_unknown`; retryable=false, verification_required=true).
- The trigger forbids publish_requested → failed. Leaving `unknown` requires an incremented `verification_attempts` and `last_verified_at`.
- `record_verification` refuses "absent" after publish_requested (`unsafe_absent`). Only an exact read-only caption match since `started_at` can settle it as succeeded.
- While an attempt is `unknown`, the active index blocks any new attempt.

## 5. No unsafe retry
- `retry` must be explicitly true and is only accepted when the last state is FAILED. FAILED cannot be reached after publish_requested.
- `retryable` is true only for META_RATE_LIMITED and META_TEMPORARY_ERROR. META_REJECTED additionally needs a newer draft save.
- There is no automatic retry or backoff loop. The only polling is a read-only container status check.

## 6. Exposure
- All gate RPCs are executable only by postgres and service_role. The guard and gate functions are postgres-only.
- The arming secrets are absent, so production is disarmed: every publish call returns 403 REAL_PUBLISH_DISABLED before any database write.
- No tokens are logged; errors are redacted.

## 7. Residual risks
- The deployed version can't be observed through the tools. Byte identity rests on the owner's verification.
- The entitlement expires 2026-11-01 22:21:13 UTC. Renewing it is an owner action.
- The derivative is removed in `finally`. If removal fails, an orphan file may remain in the private bucket; this is cleanup only and does not cause a duplicate.
