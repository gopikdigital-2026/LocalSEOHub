# A3.7.4.2 · GATE B.2 · PART 2 — Final pre-publish readiness (test publication C)

Mode: read-only audit. Date: 2026-10-30. No code changed in this phase. No data changed. No Meta write. No attempt created. Real publishing not armed.
Follows `A3_7_4_2_GATE_B2_PART2_FINAL_PREPUBLISH_AUDIT.md` (original NO-GO, D1) and `A3_7_4_2_GATE_B2_FIX03_PUBLISH_PANEL_REFRESH.md` (D1 closed).

## Verdict

**GO — A3.7.4.2 GATE B.2 PART 2 READY; TEST C VERIFIED; REAL FACEBOOK POST NOT YET AUTHORIZED**

---

## 1. Identity and state of C

| Item | Server value | OK |
|---|---|---|
| publication_id | b140fc59-6458-47d7-b695-df8781610ea5 (not A 65569535-…, not B 442059e5-…) | ✔ |
| owner | user aabe426e-f079-4db1-835b-17d9d126313e; business e6014022-370f-4ec0-a340-c7c55f808247 (owned by the same user) | ✔ |
| status | proposals_ready (draft, not published); publication updated 2026-10-30 00:13:08.946825 | ✔ |
| draft | exists; source_generation_id 6d624a5b-44b2-4a82-b38b-35c99ae140c5 | ✔ |
| authoritative draft_version | **3**, which matches the UI's "3" | ✔ |
| draft updated_at | 2026-10-30 00:18:03.275237 | ✔ |
| pending unsaved edit | none on the server; the publisher reads only the saved row (`publish_attempt_begin` selects `publication_drafts.facebook_text`; request captions are rejected, test 24) | ✔ |

**Observation (not a defect).** The internal business record is named "Gopik.Digital", and the Meta connection of that business is bound to the Page **Localseohub.io**. The caption names LocalSEOHub.io, so it matches the target Page and is the caption Manuel designated.

### Exact caption to be sent (md5 5e3dd1d5591f6f8267071ece78b1c6e5, 222 chars)

```
La visibilidad en Google es crucial para el éxito de cualquier negocio.

En LocalSEOHub.io estamos aquí para ayudarte a mejorar tu presencia online.

No dejes que tu competencia te supere.

Escríbenos para más información.
```

### Image

| Item | Value | Frozen rule | OK |
|---|---|---|---|
| path | aabe426e-…/e6014022-…/b140fc59-…/3b96d1a8-e860-48af-874f-4304d4af6905.png | `user/business/publication/uuid.(jpg\|png)`, user and publication must match | ✔ |
| MIME (row and storage) | image/png / image/png | jpeg or png (PNG valid for Facebook) | ✔ |
| size | 2,089,456 B | > 0 and ≤ 8 MiB | ✔ |
| dimensions | 1086×1448 (from Part 1 normalization) | — | ✔ |
| storage eTag | 4bccc6fc6f6b6a3e31f5d60a656db8da; updated 2026-10-30 00:12:02.936 | private bucket `publication-images` | ✔ |

**Limitation: server-side retrieval.** I did not download the bytes in this audit. The bucket is private, and only the server-side function holds the key. Evidence that the server can retrieve the file:
- the storage object exists with the metadata above;
- the server-side normalization pipeline wrote this file.

If the download or the PNG signature check failed at publish time, the attempt would close as FAILED **before** any POST, so no post would be created (tests 31–33).

## 2. Facebook connection (e85ae653-d92d-415f-830a-af322756e01c)

| Item | Value | OK |
|---|---|---|
| status | connected; same user and business as C | ✔ |
| Page | Localseohub.io, **1393994523793266** | ✔ |
| pages_show_list / pages_read_engagement / pages_manage_posts | granted / granted / granted | ✔ |
| Page tasks | ADVERTISE, ANALYZE, **CREATE_CONTENT**, MANAGE, MANAGE_LEADS, MESSAGING, MODERATE | ✔ |
| publishing consent | 2026-10-29 18:06:07.726431 (permissions_checked_at identical) | ✔ |
| revocation / last_error / token_expires_at | null / null / null (long-lived) | ✔ |
| user token storage | `user_token_ref` = `vault:<id>`; exactly 1 Vault secret, written 2026-10-29 18:06:03 at consent; readable only through SECURITY DEFINER `meta_read_token` / `meta_vault_reveal` | ✔ |

### Page Access Token readiness

The publisher (`derivePageToken`) and the read layer (`meta-read`) obtain the Page token the same way:
- the same Vault RPC (`meta_read_token`) and the same `META_APP_SECRET`;
- the same Graph read, `GET /{page-id}?fields=…access_token` with `appsecret_proof`.

The read layer's last Facebook sync for this connection and Page 1393994523793266 shows status **ok**, last success 2026-10-29 18:09:52.846 (no error). That was after the consent token was stored. That sync could only succeed if:
- the Vault token decrypted;
- `appsecret_proof` was accepted by Meta;
- a Page token was returned;
- Meta echoed the same Page id in its response (the read layer checks this).

The Instagram sync also succeeded at 18:09:52.890.

Publish-time protection: `derivePageToken` blocks the POST if Meta echoes any other Page id (tests 11, 12, 27).

**appsecret_proof:** HMAC-SHA256 of the token keyed by `META_APP_SECRET` (secret present). It is used on the token read and on the POST, and never logged (tests 2, 10).

**Not done (by design):** no fresh Page-token derivation today. The only code path that does it in meta-publishing is the armed publish path, and the read-layer sync was not triggered. If the token had become invalid, the publish would fail before the POST as REAUTH_REQUIRED or PERMISSION_REQUIRED, with no post created.

No token, app secret or proof value was read, printed or stored during this audit.

## 3. Real preflight

| Call | Result |
|---|---|
| `publication_publish_preflight(owner, C, 3)` | facebook: **issue null (READY)**, draft_version 3, no last attempt. instagram: IMAGE_UNSUPPORTED (out of scope; Instagram is not touched) |
| Same call with version 2 (stale) | VERSION_CONFLICT for both channels (fails safely) |

Facebook on version 3 returned none of: AUTH_REQUIRED, REAUTH_REQUIRED, PERMISSION_REQUIRED, CHANNEL_NOT_CONNECTED, INVALID_PUBLICATION_STATE, VERSION_CONFLICT, IMAGE_UNAVAILABLE, IMAGE_UNSUPPORTED, ALREADY_PUBLISHED, PUBLISH_IN_PROGRESS, PUBLISH_OUTCOME_UNKNOWN, or INTERNAL_ERROR.

## 4. Idempotency

| Item | Value |
|---|---|
| attempts for C (all channels, all statuses) | 0, so 0 succeeded, 0 publishing, 0 unknown |
| attempts table-wide | 0 |
| meta_object_id anywhere | none (0 rows) |
| blocking prior attempt | none; state NOT_REQUESTED ("Sin solicitar") |
| would-be idempotency key | **`b140fc59-6458-47d7-b695-df8781610ea5:facebook:v3`** (generated column `publication:channel:v{draft_version}`), attempt_number 1 |

No attempt was created. Calling `publish_attempt_begin` would leave a permanent row, so it was not called.

## 5. Payload validation (not sent)

The payload is built only from the server's `publish_attempt_begin` row; the browser cannot supply Page, image, token or caption (test 25). Built from the live rows, it would be:

| Field | Value |
|---|---|
| endpoint | `POST https://graph.facebook.com/v25.0/1393994523793266/photos` |
| auth | `Authorization: Bearer <Page token>` (header only, never in the URL; test 3) |
| multipart `source` | C's PNG bytes (2,089,456 B, eTag 4bccc6fc…), filename photo.png, type image/png |
| multipart `caption` | the exact caption above (md5 5e3dd1d5591f6f8267071ece78b1c6e5) |
| multipart `published` | `true` (immediate publication) |
| multipart `appsecret_proof` | HMAC-SHA256(Page token, app secret) |
| publication_id / draft_version | b140fc59-6458-47d7-b695-df8781610ea5 / 3 |
| attempt | single POST, never retried automatically; a 5xx, transport failure or malformed 2xx is recorded as UNKNOWN (tests 1, 5, 7, 8) |

Validation result: **valid**. The page id is numeric and bound to the connection. The caption is non-empty. The MIME is allowed, the path matches the user and publication, and the size is within the limit. The app secret is present.

## 6. Real-publish arming gate

- Deployed edge secrets: **no `META_FACEBOOK_REAL_PUBLISH_ARMED`**, **no `META_FACEBOOK_REAL_PUBLISH_USER_IDS`**.
- `isArmed` requires both the flag to equal exactly `"true"` and the user's UUID to be in the allow-list. As deployed, it returns false for every user.
- A click on the button or a direct call to `facebook_publish` therefore returns `403 REAL_PUBLISH_DISABLED`, with 0 RPCs, 0 attempts and 0 Meta calls (test 34).
- Request parameters cannot arm it (test 36). The browser has no arming switch (test 37). Tests never arm it (test 38).
- `meta-publishing` matches its deployed version (deploy state `hasChanged: false`, hash ae6e628c…).

## 7. Procedure for Part 3 (documented only; NOT executed)

Runs only after Manuel's explicit, separate authorization.

1. **Pre-check (read-only).** Re-run sections 1–4.
   - C must still be version 3, caption md5 5e3dd1d5…, image eTag 4bccc6fc…, Facebook preflight null, attempts 0.
   - If anything differs, STOP.
2. **Arm temporarily.**
   - Set the edge secret `META_FACEBOOK_REAL_PUBLISH_USER_IDS=aabe426e-f079-4db1-835b-17d9d126313e` (Manuel only).
   - Then set `META_FACEBOOK_REAL_PUBLISH_ARMED=true`.
   - No code change and no redeploy.
3. **Verify the arming.** The status action for C reports `armed: true` for Manuel only.
4. **Publish once.**
   - Manuel clicks "Publicar en Facebook" once on C (expectedVersion 3).
   - The server enforces at most one POST: the unique idempotency key, plus double-click and concurrency protection (tests 22, 23).
5. **Capture** `meta_object_id` (post_id, otherwise photo_id) and the permalink from the response and from `publication_publish_attempts`.
6. **Read-back.**
   - Read-only check: `GET /{object-id}?fields=id,permalink_url` (verdict CONFIRMED / NOT_FOUND / TEMPORARY / AMBIGUOUS).
   - Also check visually on the Page.
7. **Record the outcome.**
   - The attempt row must be `succeeded` (with the object id), `failed` (with the error code), or `unknown`.
   - On `unknown`: do NOT retry. Verify on the Page manually first, because UNKNOWN blocks any further attempt (test 28).
8. **No double publication.**
   - Do not click again or retry after SUCCEEDED or UNKNOWN.
   - A retry is allowed only from FAILED, and META_REJECTED needs a newer saved draft first.
9. **Disarm immediately.** Delete `META_FACEBOOK_REAL_PUBLISH_ARMED` and `META_FACEBOOK_REAL_PUBLISH_USER_IDS`, whatever the outcome.
10. **Verify OFF.**
    - The secrets list contains neither name.
    - The status action reports `armed: false`.
    - A publish call returns REAL_PUBLISH_DISABLED.
    - Re-check that A and B are unchanged and that exactly 1 attempt exists, for C/facebook only.

## 8. A and B protected

| Publication | status | publication updated | draft version | draft row md5 | publication row md5 |
|---|---|---|---|---|---|
| A 65569535-5d89-4df3-a8d4-c2af6df8606d | proposals_ready | 2026-10-27 23:05:19.287086 | 4 (2026-10-28 09:15:04.628346) | 5b7366bfcaa8e008b1ba5b38138bf8dd | 5d0b2403c6b4a317d496f57c4955a8ea |
| B 442059e5-11e4-4bdd-a5bc-c714b0a03b72 | proposals_ready | 2026-10-28 12:27:05.291163 | 3 (2026-10-28 12:30:28.28094) | fd3e4f7a51725b58fced11e3ef4975ac | 4156531497c7994319630eed844d40d2 |

The draft md5 values equal those recorded in the earlier Part 2 run and in FIX03, so A and B are unchanged.

## 9. Zero real publications

- 0 new Facebook posts. 0 POST to `/photos`. 0 POST to `/feed`.
- 0 Meta object ids (0 attempt rows table-wide).
- 0 attempts for C.
- Real publishing OFF (no arming or allow-list secret).
- C is still a draft (proposals_ready, version 3, unchanged updated_at).
- A and B are unchanged.
- This audit used database reads, read-only RPCs (`publication_publish_preflight` is STABLE) and the secret-name listing only. No edge function was invoked or deployed.

## 10. Regression (current real baseline)

| Check | Result |
|---|---|
| Full suite | **84 files, 2874 tests PASS, 0 FAIL**. Current baseline: 2854, plus 12 from FIX02, plus 8 from FIX03 |
| Focused: publications (incl. Meta publishing, idempotency/state machine, arming gate, ownership/isolation, channel review), Facebook publishing panel, publishing access, publication resume, internal-test entitlement, Meta connection | 25 files, 818 tests PASS |
| TypeScript | **20 errors, all inherited baseline; 0 new** |
| Production build | **PASS** |

## 11. Not touched

Instagram publishing, Google/GBP, "Tu semana", billing, commercial entitlements, Meta App Review, general UI, A/B, and the frozen A3.7.4.1 and A3.7.3.4 architecture. No code or data changed in this phase.

STOP. Not published. Real button not enabled. Part 3 not run. No Facebook write call made. Waiting for Manuel's explicit authorization.
