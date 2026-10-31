# A3.7.4.3 — Gate B.1 — Controlled Instagram E2E Execution Protocol

**Status: DOCUMENTED ONLY — NOT EXECUTED.**

This protocol is for a future Gate B.2. Each numbered step needs the authorization named in it. Nothing here was run in B.1.

**Fixed identifiers**
- User: aabe426e-f079-4db1-835b-17d9d126313e
- Business: e6014022-370f-4ec0-a340-c7c55f808247
- Facebook Page: 1393994523793266
- Instagram account: 17841462487279994 (@localseohub.io)
- Function: `instagram-publishing`

**Global rules**
- Exactly one publish attempt.
- No blind retries.
- Every STOP is final for the session. The next action is a written report, never an improvised fix.
- Never write tokens, secrets, signed URLs or `image_url` values into logs, reports or chat.

## 0. Entry conditions

The prerequisites P1–P4 of the readiness report are complete:
- P1: server-side publication allowlist, deployed and tested.
- P2: a scoped publish trigger, deployed and tested.
- P3 and P4: written authorizations.

The full suite, tsc (no new errors) and the build all pass on the B.2 baseline.

## 1. Final production-state snapshot (read-only)

Record each item with a UTC timestamp:
- the attempt count, and every attempt row's channel, status, stage and container presence;
- A/B/C `updated_at`;
- the publication count and latest `created_at`;
- bucket privacy, and the instagram-derivatives object count (must be 0);
- secret names, with no META_INSTAGRAM_* or META_FACEBOOK_*;
- the connection row: status, IG id, Page id, permissions, last_error;
- hashes of the frozen Facebook files and the Instagram function files;
- deployed function list (instagram-publishing verifyJWT=true).

**STOP** if anything differs from the Gate B.1 manifest, unless the change is explained by P1/P2 and documented.

## 2. Publication D creation

**Authorization:** P3.

1. Follow §5 of the readiness report, through the normal product flow only.
2. Confirm the stored image is 1080×1350 PNG.
3. Confirm `instagram_text` is byte-equal to the approved caption.
4. Record D's id and version.
5. Confirm A/B/C are unchanged.

**STOP** if D's caption, image, owner or business differ, or if any A/B/C value changes.

## 3. Independent preflight validation (read-only)

1. `publication_publish_preflight(user, D, version)` must return a null Instagram blocking code.
2. Run the panel status action for D. It must show:
   - account 17841462487279994 / @localseohub.io;
   - instagram_basic and instagram_content_publish both true;
   - derivative ready, 1080×1350, mode `none`;
   - no attempt.
3. Repeat the preflight for A, B and C. With P1 deployed, the publication allowlist must refuse them.

**STOP** on any blocking code, a permission flag that is false, a derivative that isn't ready, or an existing attempt for D.

## 4. Exact account and publication allowlist

- User allowlist: exactly `aabe426e-f079-4db1-835b-17d9d126313e`.
- Publication allowlist (P1): exactly D's UUID.
- Account: the function already requires the Page lookup to echo Page 1393994523793266 **and** IG 17841462487279994.

**STOP** if any lookup returns another account id, or if the allowlist contains more than one value.

## 5. Temporary secret activation

**Authorization:** P4.

1. Create `META_INSTAGRAM_REAL_PUBLISH_USER_IDS` (the single UUID).
2. Create the P1 publication allowlist (D only).
3. Create `META_INSTAGRAM_REAL_PUBLISH_ARMED=true` **last**.

Rules:
- Record the creation time of each secret (names only).
- Do not create or touch any META_FACEBOOK_* secret.
- Arming window: at most 30 minutes from ARMED creation to removal (step 11).

**STOP** if any secret fails to apply or the names differ.

## 6. Single-attempt execution limit

- Exactly one `instagram_publish` request, for D and its recorded version, with `retry=false`.
- No second request for any reason, including timeouts, 5xx or a client error.
- Any non-terminal or ambiguous result goes to step 10 (verification only).

## 7. Container creation and polling (performed by the function)

1. Read-only Page lookup. Both ids must match, otherwise FAILED before any write.
2. Stage → `container_requested`.
3. One `POST /{ig}/media` (image_url = 600 s signed URL, caption = stored instagram_text).
4. Stage → `container_created`, with the numeric container id persisted once.
5. Poll `status_code`, at most 6 times, 2 s apart:
   - FINISHED → continue;
   - ERROR → FAILED META_REJECTED;
   - timeout or EXPIRED → FAILED META_TEMPORARY_ERROR;
   - PUBLISHED → UNKNOWN.

**Operator check after the request:** the attempt row's stage and container presence. Read only presence, never values in reports beyond the ids.

## 8. `/media_publish` conditions (performed by the function)

`POST /{ig}/media_publish` (creation_id) is sent only when **all** of these hold:
- the container status is FINISHED;
- the stage was successfully advanced to `publish_requested`;
- the arming check passes.

It is sent once and is never retried. Afterwards the function reads back `id,permalink` and finishes as SUCCEEDED.

## 9. External post verification

- Open the permalink. Confirm it is on @localseohub.io and that the caption is byte-equal.
- Confirm the image is the 4:5 test image.
- Confirm exactly one post exists on the profile, and no Facebook post was created for D.
- Record: media id, permalink, attempt id, the `started_at`/`finished_at` timestamps.

## 10. Duplicate prevention and UNKNOWN handling

| Situation | Action |
|---|---|
| UNKNOWN before `publish_requested` | One `instagram_publish_verify`. A certain "absent" → FAILED. **Do not re-publish in this session**; report and STOP. |
| UNKNOWN at `publish_requested` | One `instagram_publish_verify`. An exact single match → SUCCEEDED. Otherwise it stays UNKNOWN: check the profile manually, then STOP. |
| Two or more matching posts | STOP. Duplicate incident. Report; the account owner decides what to delete. |

`begin` is refused while UNKNOWN. Never clear an UNKNOWN row by SQL.

## 11. Immediate removal of arming secrets

Do this right after step 9 or after any STOP, whatever the outcome:
1. Remove `META_INSTAGRAM_REAL_PUBLISH_ARMED` **first**.
2. Then remove the user and publication allowlists.
3. Confirm the secret list no longer contains any META_INSTAGRAM_*.
4. Send one probe publish (expected: 403 REAL_PUBLISH_DISABLED, attempt count unchanged).

## 12. Final production audit and freeze

Repeat the §1 snapshot. Expected:
- 2 attempts: Facebook (C) succeeded and Instagram (D) in its terminal state;
- A/B/C unchanged;
- 0 derivative objects (`finally` cleanup);
- no arming secrets;
- frozen hashes identical.

Write the B.2 report and freeze manifest, then STOP.

## STOP conditions (any one ends the session)

1. **Permission failure:** a missing instagram_basic or instagram_content_publish, or a Meta error code 10, 200 or 190 family.
2. **Unexpected account ids:** the Page or IG id differs from the fixed identifiers.
3. **Preflight failure:** any blocking code, stale version, or caption or image mismatch.
4. **Ambiguous external response:** a transport error, 5xx, malformed success, PUBLISHED-before-publish, or UNKNOWN.
5. **Token problems:** the token is missing or expired, the Page token can't be derived, or there is an OAuthException.
6. **Unauthorized write:** any Graph write not described in §7–8, any write for a publication other than D, or any Facebook write.
7. **Duplicate risk:** an existing attempt for D, more than one matching post, or any need for a second publish request.
8. The arming window is exceeded, or a secret appears that was not authorized.
