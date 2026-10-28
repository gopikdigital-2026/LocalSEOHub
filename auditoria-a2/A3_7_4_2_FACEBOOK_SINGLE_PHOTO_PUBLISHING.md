# A3.7.4.2 — Facebook Page Single-Photo Publishing — GATE A

## 1. Executive verdict

GO — A3.7.4.2 GATE A CODE READY; REAL FACEBOOK E2E NOT YET AUTHORIZED

Code is complete, mocked-tested (55 new tests), deployed with the real-publish gate OFF. Zero real Facebook posts, zero Instagram publishing, zero publish attempts persisted.

## 2. Exact scope

Facebook Page + one photo + the saved Facebook draft caption + immediate publication via `POST /{page-id}/photos`. Not implemented: Instagram `/media` / `/media_publish`, `/feed`, `attached_media`, multi-channel, scheduling, calendar, multi-photo, video, Reels, Stories, GBP publishing, customer UI. No App Review, no Meta Dashboard change, A3.7.4.3 not started.

## 3. Graph API version decision

- Repository pin: `META_GRAPH_VERSION = "v25.0"` (frozen `meta-publishing/handler.ts`, shared by all Meta functions).
- v25.0 is a current Meta version (availability documented until 2028-07-29).
- `POST /{page-id}/photos` with `source` (multipart) + `caption` + `published` is supported in v25.0 and returns `{ id, post_id }`.
- No migration needed; version kept. Test 42 asserts the pin.

## 4. Current real Meta permission state (read-only, live DB)

Single connection, status `connected`, Page `Localseohub.io` (1393994523793266).
`granted_permissions`: pages_show_list, business_management, instagram_basic, pages_read_engagement, public_profile.
- `pages_manage_posts`: **absent**.
- `page_tasks`: **NULL** → CREATE_CONTENT not proven.
- `publishing_consent_at`: NULL.

Gate A passes as CODE READY; Gate B is currently **PERMISSION_REQUIRED**. Nothing fabricated.

## 5. Files changed

New: `supabase/functions/meta-publishing/facebookPhoto.ts`, `supabase/functions/meta-publishing/facebookPublish.ts`, `src/features/facebook-publish/{repository.ts,copy.ts,FacebookPublishHarness.tsx}`, `src/features/publications/__tests__/a3742FacebookPhotoPublishing.test.ts`, this report, the Gate A manifest.
Modified (re-pinned, see §24): `supabase/functions/meta-publishing/index.ts`, `src/App.tsx`, guard tests a281, a273, a272, a3544, a3733, a3741.
Unchanged: frozen `handler.ts` (b7525645…), all migrations, `config.toml`, meta-oauth-callback, meta-connection, meta-read. No new migration.

## 6. Facebook transport architecture

`facebookPhoto.ts` is pure Meta HTTP: `derivePageToken`, `publishFacebookPhoto`, `readBackPermalink`, `appSecretProof`. It receives already-verified typed inputs (Page ID, Page token, bytes, MIME, caption) and makes no ownership decisions. `facebookPublish.ts` owns orchestration/persistence. `fetch` is injected, so tests mock transport completely.

## 7. Page Access Token architecture

The Vault stores the long-lived **user** token (A3.5.x). The Page token is derived on demand with `GET /{page-id}?fields=id,access_token` (Bearer user token + `appsecret_proof`), where page-id comes from the server-side begin row (bound connection page). Meta must echo the same id, otherwise PERMISSION_REQUIRED. The Page token lives only in function memory; it is never persisted, logged or returned. No new token storage.

## 8. Private image retrieval

Path and MIME come from `publish_attempt_begin` (server publication state). The path must match `{userId}/{businessId}/{publicationId}/{uuid}.(jpg|png)` with owner and publication equal to the caller and publication, extension consistent with MIME. The service role downloads from the private `publication-images` bucket (public=false, verified live). No public or signed URL is created.

## 9. Authoritative caption resolution

The caption is the saved Facebook draft returned by `publish_attempt_begin` for the expected version. The request body only allows `action, publicationId, expectedVersion, retry`; `caption`, `pageId`, `imagePath` and token keys → 400 before any RPC (tests 24, 25). A version mismatch → VERSION_CONFLICT with no write (test 17).

## 10. Publish orchestration sequence

1. Authenticate (JWT).
2. Strict body validation.
3. Arming gate.
4. Frozen preflight.
5. Retry policy.
6. `publish_attempt_begin` (atomic).
7. Validate page id, caption, path and MIME.
8. Vault user token, then derive the Page token.
9. Download the image and check size and magic bytes.
10. `sent=true`, then a single POST `/photos`.
11. Classify the outcome.
12. `publish_attempt_finish`.
13. Sanitized response.

The attempt always exists before any Meta write (tests 15, 16).

## 11. Attempt/idempotency integration

Reuses the frozen `publication_publish_gate` / begin / finish. Double click and 5 concurrent requests → exactly one POST (tests 22, 23). SUCCEEDED → ALREADY_PUBLISHED, PUBLISHING → PUBLISH_IN_PROGRESS, UNKNOWN → PUBLISH_OUTCOME_UNKNOWN, each with 0 Meta calls (test 17).

## 12. Timeout/UNKNOWN handling

Publish timeout is 30 s, with abort. A throw or timeout after send, a malformed 2xx, or a 5xx all give UNKNOWN, persisted, HTTP 202. There is no retry loop and no second POST (tests 5, 7, 8, 19). Failures before `sent=true` are definitely-not-sent and become FAILED. An exception after `sent=true` becomes UNKNOWN. UNKNOWN is checked at the channel level before the version, so UNKNOWN on v3 blocks v4 (test 28).

## 13. Meta response parsing

Only the documented `id` (numeric) and `post_id` (`page_post` pattern) are read. Nothing else is persisted. `meta_object_id = post_id ?? id`. SUCCEEDED only on a 2xx with a valid numeric id.

## 14. Result verification/permalink strategy

Optional read-back after a confirmed creation: `permalink_url` for a post id, `link` for a photo id. Verdicts are CONFIRMED, NOT_FOUND, TEMPORARY and AMBIGUOUS. A permalink is kept only if it matches `https://(www.|m.)facebook.com/...`; otherwise it is NULL. Read-back failure never downgrades SUCCEEDED (test 29). If the finish RPC fails after a confirmed creation, the response is UNKNOWN, never a clean success.

## 15. Error mapping/redaction

Reuses the frozen `mapMetaError`, `safeErrorLog` and `redact`. Logs carry only the result code, Meta numeric code and subcode. Responses carry only `{ok, code, state, traits}`. Test 10 proves there is no token, proof, raw message or fbtrace_id in logs.

## 16. Image limits/MIME

The maximum is 8 MB, which equals the bucket `file_size_limit` (8388608) and is within Meta photo limits and Edge memory. The size is checked from storage metadata before buffering, and again on the bytes. MIME comes from the begin row (server). Storage content-type and magic bytes must agree. JPEG and PNG are both valid; the Instagram JPEG-only rule is not applied (test 33).

## 17. Internal validation harness

A panel on the existing hidden `/internal/publications-validation` route, labelled internal-only. It shows:
- publication ID;
- Page name and ID;
- draft version;
- attempt state (NOT_REQUESTED / PUBLISHING / SUCCEEDED / FAILED / UNKNOWN);
- last error;
- preflight result;
- the three permission flags;
- CREATE_CONTENT;
- the exact saved caption;
- an authenticated private image preview (object URL, revoked on cleanup);
- the permalink (`noopener noreferrer`).

Publish uses a two-step red confirmation with a double-click guard. It is disabled unless the gate is armed, preflight passes, and the state is not SUCCEEDED, UNKNOWN or PUBLISHING. Page load only calls the read-only status action. This is not the customer UI.

## 18. Real-publish arming mechanism

Arming requires both server secrets: `META_FACEBOOK_REAL_PUBLISH_ARMED === "true"` AND the caller UUID listed in `META_FACEBOOK_REAL_PUBLISH_USER_IDS`. It is OFF by default; neither secret exists (verified by listing secrets). When OFF, the publish action returns 403 `{code:"REAL_PUBLISH_DISABLED", state:"NOT_REQUESTED"}` before any RPC or Meta call. `REAL_PUBLISH_DISABLED` is an internal Gate-A result outside the frozen 15-code taxonomy (test 42 proves the taxonomy is unchanged). Browser, URL, storage and request parameters cannot arm it (tests 34–38).

## 19. Automated-test isolation from Meta

Every Meta call in the tests goes through an injected `vi.fn` fetch. Test 38 asserts the arming env vars are absent from the test process. Build and page load never call the publish action.

## 20. Test evidence

`a3742FacebookPhotoPublishing.test.ts`: 55 tests, all PASS.
- Transport: 1–14 (+6 parameterized).
- Orchestration: 15–29 (+7 parameterized).
- Private image: 30–33.
- Arming: 34–38.
- Status and boundaries: 39–44.

## 21. Database evidence (read-only)

- `publication_publish_attempts` = 0; `meta_publishing_consent_states` = 0.
- Bucket `publication-images` public = false.
- Publication A 65569535…: v4, MODIFICADO present in the Facebook and Instagram drafts.
- Publication B 442059e5…: v3, E2E442-FB and E2E442-IG present.

Nothing was written.

## 22. Security review

PASS:
- No Page or user token, app secret or proof client-side (test 40 plus a dist scan: no `graph.facebook.com`, `appsecret` or arming names in the bundle).
- No tokens in logs; no raw Meta errors in the browser.
- No foreign Page (echo check), publication or business (preflight ownership, test 26).
- No arbitrary image path or caption.
- No automatic UNKNOWN or Facebook retry, and no loops in the transport (test 41).
- No automated real publication; gate OFF; bucket private.
- No App Review and no Dashboard change.

## 23. Regression evidence

- Full suite: 81 files, 2835/2835 PASS (2780 baseline + 55 new).
- `tsc --noEmit -p tsconfig.app.json`: 20 errors, all inherited, 0 new.
- `npm run build`: PASS.

## 24. Freeze/re-pin evidence

See `A3_7_4_2_GATE_A_MANIFEST.md` §3. Every re-pin lists old hash, new hash, reason, impact and proof, and is enforced by the a3741 K-block `AUTHORIZED_REPINS`. Frozen `handler.ts`, migrations, `config.toml` and the other Meta functions are byte-identical.

## 25. External Meta actions still required

A. App admin/developer real testing (Gate B):
1. Re-consent through the existing publishing-access flow, granting `pages_manage_posts`.
2. The Page role must include CREATE_CONTENT, recorded in `page_tasks`.
3. The app must be in Development mode with the tester as admin/developer (Standard Access is enough).

B. Ordinary external customers:
1. Meta App Review approval of `pages_manage_posts` (plus `pages_read_engagement` and `pages_show_list`) with Advanced Access.
2. Business Verification.
3. A customer-facing publishing UI.

None of these is claimed today.

## 26. Known limitations

- Optional read-back may return AMBIGUOUS or NOT_FOUND for photo ids without `link` visibility. The creation outcome is unaffected.
- No automatic UNKNOWN reconciliation. UNKNOWN blocks the channel until it is resolved manually or by a future reconciliation tool.
- A META_REJECTED retry requires the draft to be re-saved after the failure.
- Single Page per connection, as already frozen.

## 27. Gate B exact manual E2E procedure (DOCUMENT ONLY — NOT EXECUTED)

1. Publication: Publication A `65569535-5d89-4df3-a8d4-c2af6df8606d`, unless Manuel names another.
2. Image: its stored private `publication-images` object (path from `publications.image_path`).
3. Caption: the current saved Facebook draft (MODIFICADO marker), shown verbatim in the harness.
4. Version: 4, re-confirmed in the harness immediately before the write.
5. Page: Localseohub.io (1393994523793266).
6. pages_manage_posts: must show granted (currently absent; re-consent first).
7. CREATE_CONTENT: must show present (currently NULL).
8. Activation: set the server secrets `META_FACEBOOK_REAL_PUBLISH_USER_IDS=<Manuel UUID>` and `META_FACEBOOK_REAL_PUBLISH_ARMED=true`.
9. Obtain explicit written authorization from Manuel for this single post.
10. Load the harness and confirm preflight is "ready", state is NOT_REQUESTED and armed is true.
11. Click Publish, then confirm, once only: one `POST /{page-id}/photos`.
12. Record the returned `meta_object_id`.
13. Query `publication_publish_attempts` for the single row: SUCCEEDED, UNKNOWN or FAILED. If UNKNOWN, do not retry; check the Page manually.
14. Verify the post on the Facebook Page manually and record the read-back verdict.
15. Record the permalink if one was returned.
16. Set `META_FACEBOOK_REAL_PUBLISH_ARMED` to anything other than `true` (or remove it) and clear the user list; confirm the harness shows real publishing disabled.
17. Produce the A3.7.4.2 FINAL freeze manifest with Gate B evidence.

## 28. Final recommendation

GO — A3.7.4.2 GATE A CODE READY; REAL FACEBOOK E2E NOT YET AUTHORIZED

STOP. Do not arm, do not post, do not start A3.7.4.3, do not submit App Review. Wait for explicit Gate B authorization.
