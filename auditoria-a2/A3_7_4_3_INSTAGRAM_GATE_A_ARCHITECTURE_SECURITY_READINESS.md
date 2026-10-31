# A3.7.4.3 — Instagram Professional Single-Image Publishing — Gate A (Corrections 01–03)

Date: 2026-10-31
Scope: implement the owner-approved minimal Instagram state and the safe JPEG derivative, all mocked.
- No real `/media` or `/media_publish` call.
- No secret created.
- A/B/C untouched; no publication D.
- `instagram-publishing` deployed unarmed (§15).

## 1. Executive verdict

**GO — A3.7.4.3 GATE A CODE READY; INSTAGRAM REAL E2E NOT YET AUTHORIZED**

The Instagram implementation is complete and verified:
- 39/39 mocked Instagram tests pass;
- the full suite passes 2913/2913 with 0 failures;
- tsc reports the 20 inherited errors and 0 new;
- the build passes;
- every production safety check holds (§14, rechecked 2026-10-31).

The 14 older-phase pin failures were resolved with test-only changes. Correction 02 applied the authorized re-pins. Correction 03 added explicit was/now freeze exceptions for the a3721a → a3731 → a3732 → a3741 → T36 cascade (§17). No production code, Facebook file, Instagram file or historical freeze manifest changed.

The real Instagram E2E is **not** authorized. Arming secrets, any real `/media` or `/media_publish` call, publication D, Gate B and A3.7.4.4 all need a separate authorization.

## 2. Frozen baseline

- A3.7.4.2 is frozen (GO).
- Every A3.7.4.2 manifest hash was re-verified byte-identical (§16).
- meta-publishing was not redeployed.
- Facebook preflight is unchanged: the gate's Facebook path, text limit and Facebook image rules are identical. Only the Instagram image clause changed.

## 3. Connection, permissions and account type

- Page 1393994523793266, connected to IG 17841462487279994 (@localseohub.io).
- `granted_permissions` includes instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement, pages_manage_posts and business_management.
- Account type: **Professional account linked and publishing-capable permissions present; Business vs Creator subtype not independently verified.**
  - The status response carries `subtype_verified: false`.
  - The panel shows the same wording.

## 4. Database change (Decision 1) — migration `a3743_instagram_container_state`

The change is additive only. No column was dropped or retyped, and no data was rewritten.

**New columns on `publication_publish_attempts`**
- `meta_container_id text NULL`
  - numeric only (`^[0-9]{1,32}$`);
  - write-once.
- `external_stage text NOT NULL DEFAULT 'none'`
  - values: `none`, `container_requested`, `container_created`, `publish_requested`;
  - forward-only.

**Shape check**
- Facebook rows are always `none` with a NULL container.
- On Instagram rows, the container is present exactly at `container_created` or `publish_requested`.
- An Instagram row can only be `succeeded` at `publish_requested`.

**Guard trigger**
- Inserts start at `none` with no container.
- The container is immutable once set.
- The stage never moves backwards.
- A publishing→publishing transition is allowed only for Instagram, only one step forward, and only when no other column changes.
- Finish and verification transitions cannot alter the stage or the container, so the evidence is preserved.

**RPC `publish_attempt_advance(user, attempt, stage, container)`**
- SECURITY DEFINER with an empty `search_path`.
- Possible results: `ok`, `not_found` (also returned for a foreign user), `invalid_channel` (Facebook), `invalid_transition`, `invalid_payload`.
- Executable by service_role only; revoked from PUBLIC, anon and authenticated.

**`instagram_image_derivable(mime, w, h)`**
- True for JPEG or PNG with each side 320–8192 and at most 25M pixels.
- The gate's Instagram image clause now uses it. A derivable PNG or JPEG counts as Instagram-publishable.

**Bucket `instagram-derivatives`**
- public=false, 8 MiB limit, image/jpeg only.
- **No storage policies**, so only the service role can use it.

**Rolled-back transactional tests (T01–T28): all passed as intended**
- Foreign user → not_found.
- Facebook → invalid_channel.
- Skipped stage → invalid_transition.
- Bad id → invalid_payload.
- Replace or erase container → `publish_attempt_container_immutable`.
- Backwards → `publish_attempt_stage_backwards`.
- `succeeded` before `publish_requested` → violates the shape check.
- An unknown row keeps its stage and container. Verify "found" → succeeded, with the container preserved.

**Advisors:** no new findings.

## 5. JPEG derivative (Decision 2)

Pipeline:
1. Decode JPEG or PNG.
2. Apply EXIF orientation (JPEG APP1, or the PNG eXIf chunk).
3. Centre-crop to the Instagram range:
   - too tall (ratio < 0.8) → crop to **4:5**;
   - too wide (ratio > 1.91) → crop to **1.91:1**;
   - **no bars, no padding**.
4. Downscale with a box filter to a width of at most 1440. There is never any upscaling.
5. Composite any transparency onto white.
6. Write a new baseline JPEG at quality 90, falling back to 85, 80, then 70 if the file is too large.

Guarantees:
- The output is verified: it must be a parseable JPEG with exactly the planned dimensions, under 8 MiB, with **no APP1–APP15 or COM markers**. If any check fails, the derivative fails closed.
- The original is never modified, and the frozen lossless normalization is untouched.
- The output is deterministic: identical input gives identical bytes (tested).
- Version id: `ig-jpeg-centrecrop-v1`.

Fail-closed reasons: unreadable_header, source_too_small, source_too_large, source_too_many_pixels, no_compliant_plan, decode_failed, decode_mismatch, encode_failed, output_verification_failed, output_too_large.

Real images:

| Pub | Source | Plan |
|---|---|---|
| A | JPEG 785×522 | none, 785×522 (protected) |
| B | JPEG 1175×655 | none, 1175×655 (protected) |
| C | PNG 1086×1448 | tall_center_crop_4x5, 1086×1357 |

C's preflight is now `instagram = null`, because C is derivable. **C is frozen Facebook evidence and must not be used for the Instagram E2E.**

## 6. Signed URL and cleanup

- The derivative is uploaded privately to `instagram-derivatives/{user}/{business}/{publication}/{attempt}.jpg`, with upsert disabled.
- The signed URL is created server-side with a 600 s TTL and held in memory only.
- It is sent to Meta only as the `image_url` of the `/media` POST. It is never persisted, logged or returned to the browser.
- `redact()` removes `/object/sign/` URLs, `token=` and `image_url=` (tests T15 and T16).
- The derivative is removed in `finally` after every terminal outcome: succeeded, failed or unknown.

**Expiry strategy for abandoned containers**
- Meta expires unpublished containers after 24 h (status EXPIRED). An orphan container cannot be published without a separate `/media_publish` carrying its creation_id, and the code never issues that blindly.
- The signed URL expires after 600 s regardless of what happens.
- If a crash prevents the `finally` cleanup, the private derivative remains, but it is unreachable without the service role. It can be deleted by path, since the path is derived from the attempt id. A scheduled sweeper is listed as a known limitation (§18).

## 7. Transport (separate Instagram function `instagram-publishing`)

The function lives in its own directory and imports nothing from meta-publishing.

1. Derive the Page token through `GET /{page}?fields=id,access_token,instagram_business_account`. The echoed Page id **and** IG id must both match.
2. Advance to `container_requested`, then send `POST /{ig}/media` with `image_url` and `caption` (form body with appsecret_proof; the token is never in the URL).
3. Advance to `container_created` with the numeric container id. This is persisted once.
4. Poll `GET /{container}?fields=status_code`: at most 6 checks, 2 s apart.
   - FINISHED → continue.
   - ERROR → FAILED META_REJECTED.
   - Still not finished, or EXPIRED → FAILED META_TEMPORARY_ERROR.
   - PUBLISHED → UNKNOWN.
5. Advance to `publish_requested`, then send `POST /{ig}/media_publish` with `creation_id`.
6. Read back `GET /{media}?fields=id,permalink`, then finish as succeeded.

Every write is a single POST and is never retried. A transport error, a 5xx or a malformed success counts as UNKNOWN. **All Graph writes in this Gate are mocked.**

## 8. Interruption points A–H

| Point | Moment | Stored stage | Container id | Public post possible? | Status / retry | Verification |
|---|---|---|---|---|---|---|
| A | before `/media` (token, image, derivative, upload, sign) | none | none | no | FAILED; retry per code | not required |
| B | `/media` sent, outcome ambiguous | container_requested | none | no (an orphan container may exist; it expires in 24 h) | UNKNOWN; blind retry blocked | required → certain "absent" → FAILED, retryable |
| C | `/media` succeeded, persisting the id failed | container_requested | none (lost) | no | UNKNOWN; blind retry blocked | required → "absent" → FAILED, retryable |
| D | id persisted, process died before polling | container_created | present | no | PUBLISHING → stale (2 min) → UNKNOWN | required → "absent" (no `/media_publish` was ever requested) |
| E | during polling | container_created | present | no (unless Meta reports PUBLISHED) | FAILED TEMPORARY or REJECTED; PUBLISHED → UNKNOWN | only for PUBLISHED |
| F | `publish_requested` stored, process died before or while sending | publish_requested | present | **yes** | stale → UNKNOWN; blind retry blocked | required: an exact read-only match, otherwise it stays UNKNOWN |
| G | `/media_publish` sent, outcome ambiguous | publish_requested | present | **yes** | UNKNOWN (202); blind retry blocked | required: exact caption match after the attempt start, with exactly one match |
| H | Meta success, local finish failed | publish_requested | present | **yes** (it exists) | 202 UNKNOWN | required → found → SUCCEEDED |

Rules:
- Verification certifies "absent" only when the stage is before `publish_requested`.
- From `publish_requested` onward, only an unambiguous match settles the attempt. An inconclusive result keeps it UNKNOWN (409).
- Nothing is ever blindly retried. While a row is UNKNOWN, `begin` is refused.

## 9. Content rules

- Every request is tied to an explicit publication id and `expectedVersion`.
- The caption is the stored `instagram_text` of that draft version, returned by `publish_attempt_begin`.
- There is no AI, no fallback to `facebook_text`, and no silent selection.
- An empty caption fails before any write.
- The image is the publication's own private original, and its path owner is checked against the user and publication.

## 10. Arming

- `META_INSTAGRAM_REAL_PUBLISH_ARMED` must equal `true`, **and** `META_INSTAGRAM_REAL_PUBLISH_USER_IDS` must contain the user's UUID.
- If either is missing, publish and verify return 403 REAL_PUBLISH_DISABLED before any preflight, `begin` or network call.
- The Facebook arming secrets are not read.
- Neither secret exists today, and neither was created.

## 11. Internal read-only validation panel

The panel is mounted lazily on the existing hidden `/internal/publications-validation` route, below the Facebook harness. There is no new route.

It shows:
- IG account id and username, with the subtype-not-verified note;
- publication id and draft version;
- the instagram_basic, instagram_content_publish and Page permission flags;
- source format and dimensions;
- derivative readiness, JPEG output dimensions and crop mode;
- preflight, attempt state, external stage and whether a container is stored;
- the exact Instagram text.

The publish control is permanently disabled ("Real publishing disabled"). The browser module only calls the status action; it has no publish function and no token. Nothing is customer-visible.

## 12. Tests — `a3743InstagramGateA.test.ts`: 39/39 PASS

The derivative tests use the real codecs (jpeg-js and upng-js) with fixtures carrying real EXIF, XMP, IPTC, COM and eXIf metadata. Graph is fully mocked.

| # | Brief item | # | Brief item |
|---|---|---|---|
| T01 | missing instagram_content_publish | T20 | container id persisted once |
| T02 | missing instagram_basic | T21 | stage cannot move backwards |
| T03 | no IG account / Page relinked | T22 | container id cannot be replaced |
| T04 | foreign user | T23 | container not ready (bounded polling) |
| T05 | stale version | T24 | container ready |
| T06 | missing Instagram draft | T25 | media_publish success |
| T07 | image unavailable | T26 | media_publish definite failure |
| T08 | unsupported image | T27 | media_publish ambiguous, and point H |
| T09 | PNG→JPEG | T28 | UNKNOWN blocks blind retry, and verification |
| T10 | JPEG→compliant, no upscale, deterministic | T29 | already published blocks duplicate |
| T11 | tall centre-crop, no bars | T30 | channel independence |
| T12 | wide centre-crop, no bars | T31 | Facebook attempt cannot acquire container fields |
| T13 | compliant, no crop | T32 | foreign user cannot advance |
| T14 | metadata removed, orientation applied | T33 | browser has no Meta token |
| T14b | codec and oversize fail closed | T34 | browser makes no Graph write |
| T15 | signed URL safety | T35 | arming absent → fail closed |
| T16 | signed URL not logged or persisted | T36 | Facebook regression (hashes) |
| T17 | container create success | T37–T38 | id validation; stale pre-publish → absent |
| T18 | container definite failure | | |
| T19 | container ambiguous | | |

## 13. Regression

| Check | Result |
|---|---|
| Instagram suite | 39/39 PASS |
| A3.7.4.1 suite | 68/68 PASS |
| A3.7.4.2 suites | a3742FacebookPhotoPublishing 55/55; B2Fix03 8/8; B1Fix01 19/19; Fix02 12/12 — PASS |
| Full suite (Correction 03, final) | **2913 PASS / 0 FAIL** of 2913 (Correction 02: 2912 / 1; Correction 01: 2899 / 14) |
| a3731 / a3732 guards | 36/36 / 28/28 |
| tsc | 20 inherited errors, 0 new |
| build | PASS |

Before Correction 02, 14 tests failed. All were scope pins in older phases; none was a behaviour failure. They are now fixed. The remaining failure is a3731 "frozen A3.7.2 files still match the freeze manifest" (a3721a: expected c20a942e…, actual 6c32bfcd…). The original causes were:

| Cause | Failing tests |
|---|---|
| Migration count 58 → 59 and "latest migration" pins (caused by the approved migration) | a281 #18; a273 #112; a272 #30; a33 #16; f03 #21 and #34/35; a3542 #39 |
| App.tsx hash or route-shape pins (caused by mounting the Instagram panel) | a281 #15; a3544 "App.tsx unchanged"; a3721a route-shape regex; a3741 freeze/re-pin table; a273 #113; a272 #91 |
| Allowed Graph-capable functions = ['meta-publishing'] | a3733 #29 (now also sees instagram-publishing) |

## 14. Production safety (verified read-only; rechecked 2026-10-31 after Correction 03, identical)

| Item | Value |
|---|---|
| Attempts | total 1: Facebook succeeded 1; Instagram 0; publishing 0; unknown 0 |
| Facebook rows with a stage or container | 0 |
| A / B / C publication updated_at | 2026-10-27 23:05:19.287086 / 2026-10-28 12:27:05.291163 / 2026-10-30 00:13:08.946825 (unchanged) |
| A / B / C draft last saved | 2026-10-28 09:15 / 2026-10-28 12:30 / 2026-10-30 00:18 (all before this Gate; no draft write) |
| Publications | 17 (no D) |
| Buckets | publication-images private; instagram-derivatives private; 0 derivative objects |
| Arming secrets | META_FACEBOOK_* absent; META_INSTAGRAM_* absent |
| Instagram posts | 0 (no real Graph write possible: the function is unarmed) |
| New Facebook posts | 0 |

## 15. Deployment status

`instagram-publishing` is deployed and ACTIVE (`verify_jwt = true`).
- It is fail closed: both arming secrets are absent, so publish and verify return 403 REAL_PUBLISH_DISABLED before any write. Only the read-only status action works.
- The deploy changed only this function. meta-publishing was not redeployed (still ae6e628c…).
- After the deploy: attempts 1 (Facebook succeeded), Instagram 0, 0 derivative objects, 17 publications, A/B/C `updated_at` unchanged, both buckets private.
- The build passed again after the reports were updated.

## 16. Frozen Facebook files: byte-identical

facebookPhoto.ts 7225bc3d…, facebookPublish.ts 48da8e2f…, handler.ts b7525645…, meta-publishing/index.ts 027ee4fe…, FacebookPublishHarness.tsx 78cc2a49…, facebook-publish/copy.ts e47fa991…, facebook-publish/repository.ts 4242ea4c…, plus every other file in the A3.7.4.2 freeze manifest. T36 asserts these hashes on every run.

## 17. Correction 02 — authorized re-pins applied, and the remaining cascade

Applied (test-only; every security and behaviour assertion is kept):
- Migration count 58 → 59 and `_a3743_` exclusion in a281, a273, a272, a33, f03 and a3542 #39; a3543 follows the a3542 md5 (6895742f → a0473304).
- App.tsx pin 81b0de7c → ef7f7cdc in a281, a273, a272 and a3544.
- a3721a route window 300 → 400. The same AppGuard / PublicationsValidationPage regex and the shell check are kept.
- a3733 #29 allows exactly ['instagram-publishing', 'meta-publishing']. meta-publishing keeps its rules. In instagram-publishing, /media and /media_publish are allowed only in graph.ts, and /photos and /feed are banned everywhere.
- a3741 `AUTHORIZED_REPINS`: `was` values kept. `now` values were App 81b0de7c → ef7f7cdc, a281 4db0f819 → 2f4b6d27, a273 2ce19c6b → 300a87c8, a272 20296e5b → b5df9213, a3544 cf7c8076 → c1b5c3c2, a3733 eb212294 → 9dc24452. The test file goes e7674f8f → 170e4828.
- Instagram T36: a3741 pin e7674f8f → 170e4828.

Remaining cascade (not authorized, not applied). `a3731SelectionFoundation.test.ts` reads `A3_7_2_FREEZE_MANIFEST.md`, and line 52 of that manifest pins a3721a at c20a942e…. Options for a further authorization:
- (a) Add an `AUTHORIZED_REPINS`-style exception for a3721a (was c20a942e, now 6c32bfcd) in a3731. a3731 is pinned by `A3_7_3_1_FREEZE_MANIFEST.md` (38e88e4f), which a3732 checks, so a3732 needs the same exception. a3732 is pinned in `A3_7_3_4_FREEZE_MANIFEST.md` (b0125ea3), which a3741 checks, so it needs one more `AUTHORIZED_REPINS` entry and T36 needs another a3741 re-pin.
- (b) Update the single a3721a row in the historical A3.7.2 freeze manifest, with a dated re-pin note. This is one documentation change and leaves the other tests alone.

Option (b) is the smallest change; option (a) leaves historical records untouched.

### Correction 03 — option (a) authorized and applied

- In a3731 ("frozen A3.7.2 files still match the freeze manifest"), `AUTHORIZED_EXCEPTIONS` has exactly one entry, a3721a: was c20a942e… (still required in the manifest), now 6c32bfcd…. The other 27 entries must match exactly, and the excepted set must equal the declared set.
- In a3732 ("A3.7.3.1 frozen files still match their manifest"), there is one entry, a3731: was 38e88e4f…, now 4030cdc8…. The other 3 entries must match exactly.
- a3741 `AUTHORIZED_REPINS` gains a3732: was b0125ea3… (from the A3.7.3.4 manifest), now 721d76d3…. The a3741 file changes from 170e4828 to f137e0a6.
- T36 a3741 pin changes from 170e4828 to f137e0a6. The a3743 test file is now a9b6fca2….
- No historical freeze manifest was modified. No production file changed.

Result: 2913/2913. The GO verdict in §1 applies.

### Original justification for stopping (Correction 01)

The frozen file that would have to change is `src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts`, frozen by A3.7.4.2 at hash e7674f8f…. Its `AUTHORIZED_REPINS` table pins the hashes of App.tsx and of the older pin tests (a281, a273, a272, a3544, a3733). Any edit to those files, which is exactly what A3.7.4.1 and A3.7.4.2 did through authorized re-pins, must be recorded there.

Proposed test-only re-pin set:
1. Migration count 58 → 59, and exclude `_a3743_` in a281, a273, a272, a33, f03 and a3542.
2. In a3721a, allow `<IgHarness />` after `<FbHarness />` in the route-shape regex. Update the App.tsx hash pins in a281, a3544 and a3741, and the route check in a273 #113 and a272 #91.
3. In a3733 #29, allow `instagram-publishing`, with `/media_publish` confined to `instagram-publishing/graph.ts`.
4. Record the "was/now" hashes in the a3741 `AUTHORIZED_REPINS` table.

The alternative is to avoid touching App.tsx by not mounting the panel. That would only remove category 2; the migration re-pins remain unavoidable because the migration was approved.

After authorization: apply the re-pins, rerun the full suite, recheck production safety, then issue the GO verdict.

## 18. Known limitations

- No scheduled sweeper for derivatives orphaned by a hard crash. They are private and addressable by path.
- No cron job for `publish_attempt_mark_stale`. Verify marks stale rows on demand.
- The Business vs Creator subtype is not verified.
- Read-only verification lists the 25 most recent media; a busier account might need pagination.
