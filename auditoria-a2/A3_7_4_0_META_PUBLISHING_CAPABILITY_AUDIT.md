# A3.7.4.0 — META PUBLISHING CAPABILITY & FEASIBILITY AUDIT

Mode: AUDIT ONLY / READ ONLY. No production code, migration, data, scope or Meta setting was changed. Nothing was published.

Evidence labels used throughout:

- **[REPO]** — fact read from this repository or from the live database catalog (read-only queries).
- **[META-DOC]** — fact read on 2026-10-28 from current official Meta developer documentation:
  - `developers.facebook.com/docs/instagram-platform/content-publishing/` (updated Jun 30, 2026)
  - `developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media` (v26.0)
  - `developers.facebook.com/docs/graph-api/reference/page/photos/` (v26.0)
  - `developers.facebook.com/documentation/instagram-platform/app-review` (updated Jun 30, 2026)
  - `developers.facebook.com/documentation/development/permissions` (updated Oct 15, 2026)
- **[ASSUMPTION]** — not provable from repo or the docs read; needs external verification.

---

## 1. Executive verdict

Publishing the exact user-reviewed draft plus its selected photo to a Facebook Page and a linked Instagram Professional account is **technically feasible on the current Facebook Login architecture**. No login-model migration is required.

The blockers are external:

- two new permissions, `pages_manage_posts` and `instagram_content_publish`;
- Advanced Access through Meta App Review, which is needed before non-role users can use them.

Two product constraints were found:

- **Instagram JPEG only.** Instagram accepts JPEG only, while Publications accepts PNG.
- **Instagram aspect ratio.** Instagram requires an aspect ratio between 4:5 and 1.91:1. One of the 12 stored images (0.666) is outside it.

Neither constraint blocks the architecture. Both must be handled by the Instagram preflight.

**Verdict: CONDITIONAL GO — A3.7.4 IS FEASIBLE BUT EXTERNAL META APPROVAL/PERMISSIONS ARE REQUIRED** (see §27).

---

## 2. Current Meta architecture [REPO]

| Concern | Location | Fact |
|---|---|---|
| OAuth entry | `supabase/functions/meta-oauth-start/handler.ts` `createHandler` L88–100 | `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?…` with `client_id`, `redirect_uri`, `state`, `response_type=code`, `scope`, `auth_type=rerequest`. Only the SHA-256 of `state` is stored through `meta_begin_attempt`. TTL is 10 min. A separate `binding` token goes to the client. |
| OAuth callback | `supabase/functions/meta-oauth-callback/handler.ts` | `code` → short-lived token (`/oauth/access_token`, L165–167) → long-lived exchange `grant_type=fb_exchange_token` (L174–176). Expiry comes from `expires_in`. |
| Granted scopes | callback L192–199 | `GET /me/permissions`. Only `status==="granted"` is kept. `pages_show_list` is mandatory, otherwise `META_PERMISSION_UNAVAILABLE`. `debug_token` is not used. |
| Granted scopes persisted | `public.meta_connections.granted_permissions text[]` | Live row: `pages_show_list, business_management, instagram_basic, pages_read_engagement, public_profile`. |
| Token stored | `meta_connections.user_token_ref` (`vault:<uuid>`) | Long-lived **user** token in Supabase Vault through `meta_vault_put` / `meta_vault_reveal` / `meta_vault_forget` (catalog: `prosrc` references `vault.`). Read through `meta_read_token`. Live row: Vault ref present, `token_expires_at` set and in the future. |
| Page token | `meta-read/handler.ts` `readFacebook` L279 | **Not stored.** Derived on each run with `GET /{page_id}?fields=access_token` using the user token. |
| appsecret_proof | `appSecretProof()` in callback L58, meta-connection L63, meta-read L94 | HMAC-SHA256(token, app secret), added to every Graph call. The token goes in the `Authorization: Bearer` header. |
| Page discovery | callback L201 | `/me/accounts?fields=id,name&limit=100`. Pagination is not followed. **`tasks` is not requested or stored.** Result goes to `available_pages jsonb`. |
| Page selection | `meta-connection/handler.ts` `selectPage` L92–139 | `pageId` must be in the server-stored `available_pages` (`PAGE_NOT_AUTHORIZED` 403 otherwise). Saved with `meta_finish_page_selection`. A single Page is selected automatically. |
| Server-owned Page id | `meta_connections.page_id`, `page_name` | Clients cannot write it: SELECT-only column grants and no write policy. |
| Instagram linkage | meta-connection L109, L121 | `/{page}?fields=instagram_business_account`, then `/{ig}?fields=id,username`. Stored in `instagram_account_id`, `instagram_username`, `instagram_status` (`connected / not_associated / unsupported / permission_unavailable / api_error`). |
| Read functions | `meta-read/handler.ts` | Page profile and `/{page}/published_posts` use the **page token**. IG profile and `/{ig}/media` use the **user token**. 60 s cooldown (`meta_sync_claim`). 10 s fetch timeout. |
| Read tables | `meta_content_items`, `meta_sync_state` | Written only through `meta_sync_apply`. |
| RLS / ownership | catalog | `meta_connections`: one policy, `select_own_meta_connection` (SELECT). `authenticated` has column-level SELECT on every column **except `user_token_ref`** and `meta_user_id`. Unique `(user_id, business_id)`. All 19 `meta_*` functions are SECURITY DEFINER with EXECUTE for `service_role` only. |
| Disconnect | meta-connection L184–200 | `DELETE /me/permissions` (revocation recorded as `revoked/failed/skipped`), then `meta_disconnect`. |
| Status lifecycle | a351 migration header | `disconnected / connecting / authorized / page_selection_required / connected / error / reauth_required`. |
| Expiry / revocation | meta-connection recover, meta-read `markReauth` | `token_expires_at <= now` → `reauth_required`. Graph 190/102 → `reauth_required` on both platforms. |
| Reconnect | meta-oauth-start | Starting while `connected` → `META_ALREADY_CONNECTED` 409. There is no "upgrade permissions" path while connected. |
| Rate limits | callback / meta-connection / meta-read | Codes `4, 17, 32, 613` are classified. `x-app-usage` / BUC headers are not parsed. No retry or backoff. |
| Graph write calls | all `meta-*` functions | **None.** The only non-GET call is `DELETE /me/permissions`. No `/photos`, `/feed`, `/media` or `/media_publish` exists. |

## 3. Current login model [REPO]

The app uses the classic **Facebook Login** dialog with a `scope` parameter.

- `config_id` is absent, so it is not configuration-based Facebook Login for Business.
- Instagram Login (`graph.instagram.com`, `instagram_business_*`) is not used anywhere.
- Instagram is reached through the Page's `instagram_business_account` on `graph.facebook.com`.

## 4. Current Graph API version [REPO]

`export const META_GRAPH_VERSION = "v25.0";` is defined separately on L7 of each of:

- `meta-oauth-start/handler.ts`
- `meta-oauth-callback/handler.ts`
- `meta-connection/handler.ts`
- `meta-read/handler.ts`

[META-DOC] The current reference pages are v26.0. v25.0 is still documented as callable [ASSUMPTION: v25.0 deprecation date to be checked on the Meta changelog before A3.7.4.2]. The publishing function should use the same constant value as the read layer, so one connection never talks to two versions.

## 5. Current scopes [REPO]

- Requested (`meta-oauth-start/handler.ts` L9): `["pages_show_list","pages_read_engagement","business_management","instagram_basic"]`.
- Granted on the live connection: those four plus `public_profile`.
- This **confirms** the list given in the brief.
- The frozen test `a351MetaConnection.test.ts` L229 asserts the dialog URL does **not** match `/publish|pages_manage|ads_|instagram_manage|instagram_content/`. Adding publish scopes will require a deliberate, documented re-pin.

## 6. Facebook publishing requirements [META-DOC]

**Endpoint:** `POST /{page-id}/photos`. With `published` omitted or `true` it creates a published single-photo post.

**Requirements (Creating):**
- A **Page access token** requested by a person who can perform the **`CREATE_CONTENT`** task on the Page.
- Permissions `pages_read_engagement`, **`pages_manage_posts`** and `pages_show_list`.

**Upload:**
- `multipart/form-data` is supported (field name historically `source`).
- `url` (public URL) is also supported.

**Formats and size:** `.jpeg, .bmp, .png, .gif, .tiff`. Files cannot exceed 10 MB. PNG over 1 MB is "recommended not", because it may look pixelated.

**Caption field:** `caption`, UTF-8, supports emoji.

**Meta-side processing:** Meta strips location metadata and resizes the image.

**Response:** `{ id: numeric string (photo id), post_id: string (Page post id) }`. The endpoint supports read-after-write.

**Error codes:**

| Code | Meaning |
|---|---|
| 368 | Abusive / disallowed |
| 324 | Missing or invalid image file |
| 200 | Permissions error |
| 190 | Invalid OAuth token |
| 100 | Invalid parameter |
| 283 | Missing extended permission |

**Rate behaviour:** Page rate limiting is documented generically. Codes 4/17/32/613 are already classified [REPO].

**Idempotency:** there is no idempotency key parameter.

## 7. Instagram publishing requirements [META-DOC]

| Item | Fact |
|---|---|
| Login type for this path | "Instagram API with Facebook Login" (the docs label it Facebook Login for Business), host `graph.facebook.com` |
| Permissions | `instagram_basic`, **`instagram_content_publish`**, `pages_read_engagement`. **Plus `ads_management` or `ads_read` if the app user was granted their Page role through Business Manager.** |
| Tasks | The app user must be able to perform `MANAGE` or `CREATE_CONTENT` on the Page linked to the IG account |
| Token | The guide table says "Facebook Page access token". The `/media` reference says "User". Both are available to us (§2), so this is not a blocker. Use the token the reference specifies (user) and keep the page token as fallback [ASSUMPTION: confirm in A3.7.4.3 against a real account]. |
| Eligibility | Instagram Professional account linked to a Page. Page Publishing Authorization (PPA) must be complete if the Page requires it, and it cannot be detected through the API. 2FA is required if the Page enforces it. |
| Step 1 | `POST /{ig-id}/media` with `image_url`, `caption` (optional `alt_text`) → `{ id: IG_CONTAINER_ID }` |
| Step 2 | `POST /{ig-id}/media_publish` with `creation_id` → `{ id: IG_MEDIA_ID }` |
| Status | `GET /{container-id}?fields=status_code` → `EXPIRED / ERROR / FINISHED / IN_PROGRESS / PUBLISHED`. Recommended once per minute for at most 5 minutes. |
| Media hosting | "We cURL media … must be hosted on a publicly accessible server at the time of the attempt." URLs should be US-ASCII only. |
| Image | **JPEG only** (MPO/JPS not supported), **max 8 MB**, **aspect ratio 4:5 to 1.91:1**, width 320–1440 (auto-scaled), sRGB (other colour spaces converted) |
| Caption | max 2200 characters, **30 hashtags**, **20 @mentions** |
| Container expiry | 24 h |
| Limits | 100 API-published posts per rolling 24 h, enforced at `media_publish` (the carousel section of the same page says 50 — an internal inconsistency in the docs, so the effective limit should be read from `GET /{ig-id}/content_publishing_limit`). 400 containers per rolling 24 h. |
| Permalink | Not in the publish response. Read it afterwards with `GET /{ig-media-id}?fields=permalink,timestamp` (the read layer already reads `permalink` on `/{ig}/media` [REPO]). |

## 8. Login-model compatibility analysis

- **[REPO]** The current architecture is Facebook Login + Page + linked IG Professional account + `instagram_basic`.
- **[META-DOC]** `instagram_content_publish` is the publish permission **for exactly this architecture**. `instagram_business_content_publish` belongs to Instagram Login (`graph.instagram.com`, Instagram User token) and **cannot be mixed in**.
- **Conclusion: no migration is required.** The continuity path in the brief is correct.
- **[ASSUMPTION / external]** Meta labels this path "Facebook Login for Business". Classic Facebook Login with a `scope` parameter is what currently works for the read layer in production (E2E-proven in A3.5.x). Whether Meta will require a `config_id` (Login for Business configuration) for `instagram_content_publish` approval must be checked in the App Dashboard → Use cases. This is **not** an architectural blocker: it would be a change to the start URL parameters only, and tokens, Page and IG linkage stay the same.

## 9. Permission gap

| Permission | Current | FB publishing | IG publishing |
|---|---|---|---|
| `pages_show_list` | yes | required | (needed to discover the Page) |
| `pages_read_engagement` | yes | required | required |
| `business_management` | yes | not listed | not listed (kept for Business-owned Pages discovery) |
| `instagram_basic` | yes | — | required |
| **`pages_manage_posts`** | **no** | **required** | — |
| **`instagram_content_publish`** | **no** | — | **required** |
| `ads_management` or `ads_read` | no | — | **conditionally** required if the user's Page role comes from Business Manager [META-DOC]. Avoid adding it by default. Detect it through the preflight/permission error and decide in A3.7.4.3. |
| Task `CREATE_CONTENT` | not checked (`tasks` not fetched) | required | `MANAGE` or `CREATE_CONTENT` required |

**Reauthorization:**
- The existing stored token does **not** carry the new scopes. A new consent is required.
- The current flow already uses `auth_type=rerequest` and re-reads `/me/permissions`, which is correct.
- The gap is that starting OAuth while `connected` returns 409, so an explicit "enable publishing" re-consent path is needed (A3.7.4.1).
- **Recommendation:** request the publish scopes **only** in that explicit opt-in flow, never in the base connect. That keeps the read-only connection working for users who never publish, and keeps App Review scope minimal per use case.

## 10. External Meta approval blockers

**[META-DOC]**
- "Business Verification – is required for all apps making requests for Advanced Access."
- Advanced Access requires **App Review**.
- Standard Access works for people with a role on the app (admin/developer/tester) and the assets they manage. The App Review page states that for "My app is only for a business I own or manage | Facebook Login | Standard Access | App Review not required".
- Unused permissions expire after 90 days of inactivity and must be re-granted.

**Consequence:**
- Manuel, as app admin, can develop and test publishing on his own Page/IG with Standard Access **before** review.
- External customers need Advanced Access for `pages_manage_posts` and `instagram_content_publish`.

**Known external fact (Manuel):** Business Verification of the business portfolio is **approved**.

**Not verifiable from code — Manuel must screenshot or confirm later:**

1. App Dashboard → App settings → Basic: **App mode** (Development / Live) and **App type** (Business).
2. App Dashboard → **Use cases**: which use cases are added; whether "Manage everything on your Page" and "Manage messaging & content on Instagram" (or the current equivalents) are present; whether a Facebook Login for Business **configuration** (`config_id`) exists.
3. App Review → **Permissions and features**: access level (Standard / Advanced) and status for `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_basic`, `pages_manage_posts`, `instagram_content_publish`, `ads_read`, `ads_management`.
4. App Review → **Requests**: any pending or rejected submissions.
5. **Access Verification** (Tech Provider) status, and whether Meta asks for it for this app.
6. Business Settings → Security Center: Business Verification = Verified (already confirmed).
7. App roles: which people are admin/developer/tester (they define who can test under Standard Access).
8. On the target Page: Manuel's task set includes `CREATE_CONTENT`; whether PPA (Page Publishing Authorization) is required or completed; whether 2FA is enforced.
9. Instagram account type = Business or Creator (Professional), linked to that Page.
10. Data Use Checkup / data handling questionnaire status.

## 11. Facebook image transport

**[REPO]**
- Bucket `publication-images` is **private** (`public=false`, re-forced on conflict), 8 MiB limit, JPEG/PNG only.
- The only storage policy is owner SELECT. There are no client write policies.
- Normalization (`publication-media/normalize.ts`, `lossless-strip-v1`) strips EXIF/GPS/XMP/IPTC/comments/thumbnails and keeps the pixels and format unchanged. Only Orientation and ICC/sRGB data are retained.
- Table constraints guarantee `image_normalized`, mime in jpeg/png, 1–8 388 608 bytes, 320–8192 px per side, ≤ 40 MP.
- Server-side retrieval is already proven: `publication-proposals/index.ts` L86 calls `admin.storage.from(BUCKET).download(path)`. The handler then re-verifies the normalization fixed point and byte length before use.
- No `createSignedUrl` or `getPublicUrl` exists anywhere; tests assert their absence.

**Assessment:**
- **Path:** private object → service-role download inside the Edge Function → re-verify normalization and byte length → `multipart/form-data` (`source`) `POST /{page}/photos` with the page token and `appsecret_proof`. This is **supported by Meta** [META-DOC] and needs **no public URL**.
- **Size:** at most 8 MiB, under Meta's 10 MB limit.
- **Formats:** JPEG/PNG are both accepted. PNG over 1 MB may look pixelated (quality warning only).
- **Memory:** buffering at most 8 MiB once, built into a `Blob`/`FormData` without base64, is comfortably within Edge Function memory [ASSUMPTION: Supabase Edge memory/wall-clock limits must be confirmed on the current plan; the existing proposals engine already holds the image plus a base64 copy in memory successfully].
- **Timeout:** the upload is one outbound request. Use a bounded `AbortSignal` (around 30 s). Expiry of that timeout after the request was sent must map to `PUBLISH_OUTCOME_UNKNOWN`, never to a retry (§15).
- **Metadata:** EXIF/GPS is already removed before storage. Meta also strips location.

## 12. Instagram image transport

**[META-DOC]** `image_url` must be publicly fetchable (cURLed by Meta) at the time of the attempt. Multipart upload is not offered for images (resumable upload is for video only).

**[ASSUMPTION — to be verified in A3.7.4.3 with a real account]**
- **Fetch timing.** For single images Meta fetches during, or shortly after, `POST /media`. The URL is only needed until the container reaches `FINISHED`, not until `media_publish`.
- **Redirects.** Whether Meta follows redirects is undocumented. Supabase signed URLs are served directly (no redirect), so this is moot.
- **Signed URL form.** Supabase `createSignedUrl(path, expiresIn)` produces an HTTPS, US-ASCII URL (path `{uuid}/{uuid}/{uuid}/{uuid}.jpg` plus a JWT `token` query). It is served with the stored `Content-Type` (`image/jpeg`).

**Safe design if verified:**
- Create the signed URL **server-side only** (service role) immediately before `POST /media`.
- Expiry of **300 s** minimum to **900 s** maximum; it is never stored in the database or logs and never returned to the browser.
- Poll the container until `FINISHED` (bounded) and only then call `media_publish`.

**Residual risk:**
- The URL is a bearer link to one already-sanitized JPEG for at most 15 minutes.
- It cannot be individually revoked before expiry (Supabase signed URLs are stateless JWTs).
- Exposure is limited to Meta's fetcher and any log Meta keeps.
- **Acceptable**, because the image is about to be made public on Instagram anyway by the user's explicit action.

**Hard product constraints (not transport blockers):**
1. **JPEG only.** Publications accepts PNG [REPO], and normalization is lossless with no transcoding. A PNG publication **cannot** go to Instagram without a new transcoding capability. MVP: the Instagram preflight returns `IMAGE_UNSUPPORTED` for `image/png`. Facebook remains allowed.
2. **Aspect ratio 4:5 to 1.91:1.** Publications allows any ratio. Live data: 12 stored images, all JPEG, ratios 0.666 / 1.5 / 1.504 / 1.794 — **one (0.666) would be rejected**. MVP: the preflight checks `image_width / image_height ∈ [0.8, 1.91]` from server columns and returns `IMAGE_UNSUPPORTED` with a clear message. Cropping or padding is a separate later decision because it alters the user's photo.
3. 8 MB: matches the bucket limit exactly. Width over 1440 is auto-scaled by Meta.

**Verdict for §12:** short-lived server-generated signed URLs are suitable, pending one real verification. No bucket change and no permanent public URL are needed.

## 13. Publications source of truth [REPO]

| Need | Server field |
|---|---|
| Generated FB adaptation | `publication_drafts.facebook_generated` |
| Generated IG adaptation | `publication_drafts.instagram_generated` |
| **Final FB text (edited or restored)** | **`publication_drafts.facebook_text`** |
| **Final IG text (edited or restored)** | **`publication_drafts.instagram_text`** |
| Current version | `publication_drafts.version` (+1 on selection change, adaptation completion and every save) |
| Selected proposal | `publication_drafts.source_generation_id / source_position / source_role` (snapshot), and it must equal `publications.proposal_generation_id` |
| Publication status | `publications.status ∈ {draft, image_ready, proposals_ready}`. **No published state exists.** |

**Write paths:**
- `complete_publication_adaptation` (service_role) writes both `_generated` and `_text`.
- `save_publication_channel_drafts` (authenticated, `auth.uid()`, `p_expected_version`, `publication_channel_text_issue` validation) writes only the `_text` columns. Restore copies `_generated` into `_text`.
- The trigger `publication_drafts_invalidate` deletes the draft if `proposal_generation_id` or `image_path` changes.

**Safe source-of-truth path for publishing:**
1. The browser sends **only** `publication_id`, the channel list and `expected_version`. **Never the text.**
2. The Edge Function, as service role, reads `publications` plus `publication_drafts` scoped to `user_id = auth user` and `business_id`.
3. It requires `draft.version = expected_version`, `draft.source_generation_id = publications.proposal_generation_id`, `status = 'proposals_ready'` and no live adaptation claim.
4. It publishes `facebook_text` / `instagram_text` exactly as stored, after re-running the frozen `publication_channel_text_issue` rules plus the channel rules below.
5. It persists the version used in the attempt row (§17).

**Gaps vs Meta rules:**
- User edits are not hashtag-checked server-side. Facebook should have none (an AI-only rule today). Instagram allows at most 30 hashtags and 20 mentions.
- The publish preflight must enforce the Instagram 30/20 limits.
- Facebook hashtags in manual edits should be allowed. It is the user's text, and the AI-only rule is a quality heuristic, not a Meta rule.
- The 2200 limit is counted by Postgres `char_length` (code points) [REPO]. Meta's counting unit is unspecified [ASSUMPTION].

## 14. Publish preconditions (design, not implemented)

| # | Check | Possible today? | Source |
|---|---|---|---|
| 1 | Authenticated user | yes | `verify_jwt` + `auth.getUser` pattern used by all functions |
| 2 | Owned business | yes | `publications.business_id`, `businesses.user_id` |
| 3 | Owned publication | yes | `publications.user_id = auth uid` |
| 4 | Image exists and is normalized | yes | `image_path`, `image_normalized`, constraint; download + fixed-point check (proposals pattern) |
| 5 | Proposal selected, current generation | yes | `draft.source_generation_id = publications.proposal_generation_id` |
| 6 | Channel adaptation / final draft exists | yes | `facebook_text` / `instagram_text` NOT NULL |
| 7 | Final draft passes frozen validation | yes | `publication_channel_text_issue(text, 5000/2200)` |
| 8 | Expected version matches | yes | `draft.version` |
| 9 | No adaptation claim in flight | yes | `adaptation_claim_id IS NULL` or stale |
| 10 | Meta connection `connected`, same business | yes | `meta_connections (user_id, business_id)` unique, `status` |
| 11 | Selected Page belongs to connection | yes | `meta_connections.page_id` (server-owned, validated against `available_pages`) |
| 12 | IG account belongs to selected Page | yes | `instagram_account_id` derived from that `page_id`, `instagram_status='connected'`. Optionally re-confirm live with `/{page}?fields=instagram_business_account`. |
| 13 | Required scope granted | yes (data present) | `granted_permissions` contains `pages_manage_posts` / `instagram_content_publish`. Refresh with `/me/permissions` at preflight. |
| 14 | Token not expired / revoked | partly | `token_expires_at`. Revocation is only discoverable live (190) → `REAUTH_REQUIRED`. |
| 15 | `CREATE_CONTENT` task on Page | **needs A3.7.4** | Not fetched. Read live with `/me/accounts?fields=id,tasks` or `/{page}?fields=tasks` (user token). |
| 16 | IG image JPEG and ratio 0.8–1.91 | yes | `image_mime`, `image_width`, `image_height` |
| 17 | IG caption ≤30 hashtags, ≤20 mentions | **needs A3.7.4** | new server rule |
| 18 | Not already published / not in flight for that channel | **needs A3.7.4** | requires new persistence (§17) |
| 19 | IG daily quota available | **needs A3.7.4** | `GET /{ig}/content_publishing_limit` |

## 15. Idempotency analysis

Meta offers no idempotency key on `/photos`, `/media` or `/media_publish` [META-DOC]. Without server-side guards, each scenario below creates a duplicate or leaves an unknown outcome.

| Scenario | Risk without guard | Required behaviour |
|---|---|---|
| Double-click Publish | 2 Facebook posts, 2 IG posts | Atomic DB claim: a partial unique index on `(publication_id, channel)` WHERE status IN (`publishing`,`succeeded`,`unknown`). The second request gets `ALREADY_PUBLISHING`/`ALREADY_PUBLISHED` without calling Meta. |
| Refresh during publish | UI loses result, user re-clicks | The server row is the truth. The UI reloads per-channel status from the DB (same pattern as A3.7.3.4 resume). |
| Browser/network retry of the same request | duplicate | Same claim, plus a client-generated `idempotency_key` (uuid per click). The same key returns the stored result. |
| Edge Function times out after Meta accepted | real post, row stuck `publishing` | Stale `publishing` (> N min) becomes **`unknown`**, never `failed`. |
| Response lost after Meta success | real post, no id | `unknown` → verification (§20) before any retry is allowed. |
| FB succeeds, IG fails | — | Independent rows. FB stays `succeeded`, IG `failed` with code. A retry targets IG only. |
| IG succeeds, FB fails | — | Symmetric. |

**IG advantage:** the container id is persisted **before** `media_publish`. An unknown IG outcome is resolvable deterministically with `GET /{container}?fields=status_code` (`PUBLISHED` → succeeded; `FINISHED` → publish not done, safe to call `media_publish` with the **same** container; `EXPIRED`/`ERROR` → failed).

**FB limitation:** there is no equivalent handle. An unknown FB outcome is resolved by reading `/{page}/published_posts` (page token, `pages_read_engagement`, already used by meta-read) within the attempt's time window and matching the exact message. If still inconclusive, the user is asked to check the Page; there is no automatic retry.

## 16. Per-channel state model

```
NOT_REQUESTED ──claim──▶ PUBLISHING ──Meta 2xx + id──▶ SUCCEEDED (terminal)
                              │
                              ├─ definitive Meta error before acceptance ─▶ FAILED (retryable flag)
                              └─ timeout / network loss after send / stale ─▶ UNKNOWN
UNKNOWN ──verify: found──▶ SUCCEEDED
UNKNOWN ──verify: proven absent (IG container EXPIRED/ERROR)──▶ FAILED
UNKNOWN ──inconclusive──▶ stays UNKNOWN (user must confirm; no auto-retry)
FAILED ──explicit user retry (new attempt)──▶ PUBLISHING
```

- Facebook and Instagram are **separate state machines**. There is no FB+IG atomicity.
- IG adds internal sub-steps inside PUBLISHING: `container_created` → `container_finished` → `media_publish`.
- **UNKNOWN is required.** It is the only honest state when the request left the server and no answer was received.

## 17. Minimum persistence proposal (not created)

The smallest auditable model is **one table**, `publication_publish_attempts`:

| Column | Purpose |
|---|---|
| `id uuid` PK | attempt id |
| `publication_id`, `user_id`, `business_id` | ownership (FK, cascade like drafts) |
| `channel text` CHECK in (`facebook`,`instagram`) | |
| `draft_version int` | exact version published |
| `idempotency_key uuid` | unique per (publication, channel, key) |
| `status text` CHECK in (`publishing`,`succeeded`,`failed`,`unknown`) | |
| `meta_page_id` / `meta_ig_account_id text` | target snapshot (audit) |
| `meta_container_id text` | IG only, persisted before publish |
| `meta_object_id text` | FB `post_id` (+ photo id) / IG media id |
| `permalink text` | optional, after verification |
| `error_code text` | normalized taxonomy (§18) only |
| `retryable boolean` | |
| `requested_at`, `completed_at`, `updated_at timestamptz` | |

**Constraints and access:**
- Partial unique index `(publication_id, channel) WHERE status IN ('publishing','succeeded','unknown')`. This is the double-publish guard.
- RLS: owner SELECT only. All writes go through `service_role` SECURITY DEFINER functions with EXECUTE revoked from PUBLIC/anon/authenticated (same pattern as `meta_*`).
- **Never stored:** access tokens, page tokens, signed URLs, app secret, raw Meta responses.
- `publications.status` does not need to change. "Published" is derived per channel from attempts. That avoids touching the frozen status constraint.
- **Open question for A3.7.4.1:** whether a draft edit after a successful publish should be blocked or allowed (republish = new post). Recommendation: allow editing, but the publish preflight treats any `succeeded` row for that channel as `ALREADY_PUBLISHED`. No "republish" in the MVP.

## 18. Error taxonomy

| Internal code | Meta / local trigger | Browser message class |
|---|---|---|
| `AUTH_REQUIRED` | no or invalid Supabase JWT | sign in |
| `REAUTH_REQUIRED` | Graph 190, 102; `token_expires_at` passed | reconnect Meta |
| `PERMISSION_REQUIRED` | scope missing in `/me/permissions`; Graph 10, 200–299 (incl. 200, 283); missing `CREATE_CONTENT` task; IG permission errors | enable publishing (re-consent) |
| `CHANNEL_NOT_CONNECTED` | no connection / no `page_id` / `instagram_status ≠ connected` | connect channel |
| `INVALID_PUBLICATION_STATE` | not `proposals_ready`, stale generation, no final text, text validation fails, adaptation claim live | go back to review |
| `VERSION_CONFLICT` | `expected_version ≠ draft.version` | reload |
| `IMAGE_UNAVAILABLE` | storage download fails / fixed-point mismatch | re-upload photo |
| `IMAGE_UNSUPPORTED` | IG PNG / ratio out of range; Graph 324; IG media-format errors | choose another photo / FB only |
| `META_RATE_LIMITED` | Graph 4, 17, 32, 613; IG publishing limit reached | try later |
| `META_TEMPORARY_ERROR` | Graph 1, 2, HTTP 5xx **before** acceptance is certain (connection refused, DNS) | try again |
| `META_REJECTED` | Graph 100 (invalid param), 368 (abusive), PPA/2FA requirement, IG container `ERROR` | edit / check account |
| `PUBLISH_OUTCOME_UNKNOWN` | timeout or network loss after the request was sent; stale `publishing` | verifying — do not retry |
| `ALREADY_PUBLISHED` | `succeeded` row exists, or an in-flight `publishing` row | show existing result |
| `INTERNAL_ERROR` | anything else | generic |

The browser receives only `{ channel, code, retryable }` plus our own copy. Meta `message`, `fbtrace_id`, subcodes and tokens stay in server logs. The existing `classifyGraphError` / `classifyMetaError` [REPO] are the starting point. IG-specific subcodes (e.g. 2207xxx family) are [ASSUMPTION] and must be mapped from real responses in A3.7.4.3.

## 19. Retry policy

| Class | Codes | Policy |
|---|---|---|
| SAFE TO RETRY (no post can exist) | `META_TEMPORARY_ERROR` when the request provably never reached Meta; IG failure at `POST /media` (an orphan container is harmless and expires in 24 h); IG `media_publish` when the container status is still `FINISHED` (reuse the same container) | user-initiated retry; at most 1 automatic retry only for pre-send connection failures |
| REQUIRES USER ACTION | `REAUTH_REQUIRED`, `PERMISSION_REQUIRED`, `CHANNEL_NOT_CONNECTED`, `IMAGE_*`, `INVALID_PUBLICATION_STATE`, `VERSION_CONFLICT`, `META_REJECTED` | no retry until the user fixes the cause |
| DO NOT AUTOMATICALLY RETRY | `META_RATE_LIMITED` (show "try later"), `ALREADY_PUBLISHED`, any FB `/photos` call that may have been received | never automatic |
| UNKNOWN / VERIFY FIRST | `PUBLISH_OUTCOME_UNKNOWN` | IG: container status check. FB: `published_posts` match. Retry is allowed only after verification proves absence. |

## 20. Result verification

**Facebook:**
- Success requires a Meta 2xx with `post_id` (and photo `id`).
- Immediately read `GET /{post_id}?fields=permalink_url,created_time` with the page token (`pages_read_engagement`, already granted; meta-read already requests `permalink_url` [REPO]).
- If the permalink read fails, the post is still `succeeded` (id is proof) and the permalink is null and fetched later.
- Delayed verification is needed only for `unknown`.

**Instagram:**
1. `POST /media` → container id, persisted.
2. Poll `status_code` until `FINISHED`. Images normally finish fast [ASSUMPTION]. Use a short bounded loop (e.g. every 2–3 s for at most 30 s) inside the request; if still `IN_PROGRESS`, return `PUBLISHING` and let the UI re-check (Meta's guidance for video: once/min ≤ 5 min).
3. `POST /media_publish` → media id.
4. Mark `succeeded` only on a media id, or when the container status is `PUBLISHED`.
5. `GET /{media-id}?fields=permalink,timestamp` for the permalink.

**UI rule:** success is shown **only** after a Meta object id is stored. "Request sent" is never presented as success.

## 21. Legal changes required later (do not change now) [REPO]

| Location | Clause that becomes inaccurate |
|---|---|
| `src/features/legal/PrivacyPolicyPage.tsx` L142–144 (ES) | "No publicamos, programamos ni eliminamos contenido en tus cuentas…" |
| `PrivacyPolicyPage.tsx` L395–397 (EN) | "We do not publish, schedule or delete content on your accounts…" |
| `PrivacyPolicyPage.tsx` EN L401–403 (+ ES equivalent) | token used only "to maintain the connection and read the information described above" |
| `PrivacyPolicyPage.tsx` data-use sections (ES L110–138, EN L365–391) | must add: the publication photo and the user-approved text are **sent to Meta** on explicit action; Meta object ids and permalinks are stored |
| `src/features/social-intelligence/ui/copy.ts` L74 | `sourceNote: 'Solo leemos tus publicaciones. No publicamos ni modificamos nada en Meta.'` |
| `src/features/legal/DataDeletionPage.tsx` L91–93 | must state that deleting LocalSEOHub data does **not** delete posts already published on Facebook/Instagram (the user deletes those on Meta), and that attempt records are deleted |
| `TermsPage.tsx` | no publish clause found. Needs a user-responsibility clause for published content and for the explicit-action model. |
| Tests pinning the old text | `src/features/legal/__tests__/a3551LegalMeta.test.ts` L41, L44; `a351MetaConnection.test.ts` L229 (no publish scopes) |

**Legal checklist for A3.7.5 / production readiness:**
1. Privacy ES and EN: publishing disclosure, data sent to Meta, ids and permalinks stored, token use extended to "publish on your instruction".
2. Remove the "we do not publish" statements and keep "we do not schedule / delete / reply / manage ads" (still true in the MVP).
3. Social Intelligence source note.
4. Data deletion: published posts are outside our deletion scope.
5. Terms: the user is responsible for published content, publishing requires explicit action, and there is no automatic publishing.
6. Update the App Review data-handling answers to match.

## 22. Test plan (where future tests live)

Existing patterns [REPO]:
- `createHandler(deps)` dependency injection for Edge handlers;
- `fetch` mocked by URL (meta tests);
- `fakeDb` for client repositories;
- regex assertions on migration and source text.

| Area | Suggested file |
|---|---|
| Migration security (RLS, grants, partial unique index, no token columns) | `src/features/publications/__tests__/a3741PublishFoundation.test.ts` |
| Preflight (ownership, foreign publication, foreign business, version conflict, stale generation, text validation, IG JPEG/ratio, hashtag/mention limits, scope/task missing) | `a3741PublishPreflight.test.ts` |
| Idempotency (double click, same key, stale `publishing`→`unknown`, `ALREADY_PUBLISHED`) | `a3741PublishIdempotency.test.ts` |
| Error mapping and redaction (no Meta message/token/fbtrace/signed URL reaches the response) | `a3741PublishErrors.test.ts` |
| Facebook success, multipart body, `appsecret_proof`, page token derivation, 190/200/368/324/4 paths, timeout→unknown | `a3742FacebookPublish.test.ts` |
| IG container→status→publish, PNG/ratio rejection, signed URL TTL bounds and non-persistence, container `EXPIRED/ERROR`, unknown resolution through status, quota | `a3743InstagramPublish.test.ts` |
| Partial success both directions, per-channel retry, real-E2E checklist | `a3744PublishOrchestration.test.ts` |
| Re-consent "enable publishing" flow (scopes only in opt-in mode, `rerequest`, `/me/permissions` refresh) | `src/features/meta-connection/__tests__/a3741MetaPublishConsent.test.ts` |
| Foreign Page / foreign IG (page not in `available_pages`, IG not linked to `page_id`) | inside the preflight + consent suites |

## 23. Recommended phase decomposition

The proposed decomposition is **kept, with three precisions**:

**A3.7.4.1 — Security & Persistence Foundation**
- Attempts table and SECURITY DEFINER claim/complete functions.
- Preflight library and error taxonomy.
- The **explicit "enable publishing" re-consent mode** (publish scopes requested only in that mode; `tasks` fetched; fix the `META_ALREADY_CONNECTED` dead end for an upgrade).
- **No Graph write calls.**
- Precision 1: the scope change belongs here, gated behind the opt-in mode, so the base read-only connect and its frozen tests stay intact.

**A3.7.4.2 — Facebook Page single-photo publishing**
- Private download → multipart upload.
- Verification and permalink.
- Unknown-outcome resolution through `published_posts`.
- Real E2E on Manuel's Page (Standard Access).

**A3.7.4.3 — Instagram single-image publishing**
- Signed-URL transport (verify Meta fetch timing first, on a real account).
- Container lifecycle and quota.
- Precision 2: the first step is a one-off real verification that a 300 s signed URL is fetched successfully. If it fails, stop and re-plan before writing orchestration.

**A3.7.4.4 — Multi-channel orchestration, partial failure, UI & real E2E**
- Per-channel results.
- Retry UX.
- Unknown-state UX.

**A3.7.4.5 (or A3.7.5) — Legal & App Review readiness**
- Legal updates (§21).
- Screencasts and App Review submission for `pages_manage_posts` and `instagram_content_publish`.
- Precision 3: this must be **mandatory before any non-role user** sees the Publish action. Until approved, the Publish action should be server-gated on the granted scopes, so it is naturally hidden for users without them.

## 24. Exact files likely to change later

**Edge functions (existing):**
- `supabase/functions/meta-oauth-start/handler.ts` — opt-in publish scope mode.
- `supabase/functions/meta-oauth-callback/handler.ts` — `tasks`, permission refresh.
- `supabase/functions/meta-connection/handler.ts` — upgrade path while connected.

**Edge functions (new):**
- `supabase/functions/publication-publish/{index,handler,preflight,facebook,instagram,errors}.ts`.

**Config:** `supabase/config.toml` — `[functions.publication-publish] verify_jwt = true`.

**New migrations:** attempts table + claim/complete/verify functions.

**Client (new):** `src/features/publication-publish/*` — repository, types, copy, publish panel, per-channel result.

**Frozen files that will need documented re-pins:**
- `src/features/publications/validation/PublicationsValidationPage.tsx` — mount a publish step.
- `src/features/channel-review/ChannelReviewPanel.tsx` — "continue to publish" entry.
- `src/features/meta-connection/MetaConnectionCard.tsx` — "enable publishing" action.

**Legal / copy:** `PrivacyPolicyPage.tsx`, `DataDeletionPage.tsx`, `TermsPage.tsx`, `social-intelligence/ui/copy.ts`.

**Tests to re-pin:** `a351MetaConnection.test.ts` (L229), `a3551LegalMeta.test.ts` (L41, L44), plus any test hash-pinning the files above.

**Must NOT change:** the `publication-images` bucket privacy, `publication-media` normalization, and the frozen draft functions (`save_publication_channel_drafts`, `publication_channel_text_issue`), which are read and reused only.

## 25. Freeze-integrity evidence

- `auditoria-a2/A3_7_3_4_FREEZE_MANIFEST.md`: **36/36** pinned file hashes (sections A changed, A new, B upstream, B migrations, C tests) recomputed with SHA-256 → **0 mismatches**.
- The frozen test `a3731SelectionFoundation.test.ts` still begins `38e88e4f…` (byte-identical).
- Migrations directory: 55 files, unchanged. No migration was applied during this audit.
- Database access was **read-only `SELECT`** against `information_schema`, `pg_catalog`, `meta_connections` (status/scopes/booleans only — no token, no ref value) and `publications` (image mime/size/dimensions only).
- No production file was edited. The only file created is this report.
- No Graph API call was made. No scope or Meta setting was changed. Nothing was published.

## 26. Risks / blockers

| # | Item | Type | Severity |
|---|---|---|---|
| 1 | `pages_manage_posts`, `instagram_content_publish` not requested; Advanced Access requires App Review | External | Blocks external users; not Manuel's testing |
| 2 | Meta may require a Facebook Login for Business configuration (`config_id`) for the publish use case | External / ASSUMPTION | Medium — start-URL change only |
| 3 | IG requires a public `image_url`; signed-URL suitability unverified on a real account | Technical, verify in A3.7.4.3 | Medium — fallback would need a new design |
| 4 | IG JPEG-only vs PNG publications | Product | Low — preflight reject; FB still works |
| 5 | IG aspect 4:5–1.91:1; 1 of 12 live images out of range | Product | Medium — common for vertical phone photos |
| 6 | `ads_management`/`ads_read` needed when the Page role comes from Business Manager | External / conditional | Medium — would widen App Review |
| 7 | No idempotency key at Meta; FB unknown outcomes only resolvable heuristically | Technical | High if ignored — mitigated by §15–17 |
| 8 | `CREATE_CONTENT` task not currently fetched | Technical | Low — add in A3.7.4.1 |
| 9 | PPA / 2FA requirements are undetectable in advance | External | Low — map to `META_REJECTED` with guidance |
| 10 | Graph v25.0 vs current v26.0 | Maintenance | Low — check the deprecation date |
| 11 | Legal text states "we do not publish" | Compliance | Must change before external launch |
| 12 | Doc inconsistencies: IG token type (Page vs User), IG daily limit (100 vs 50) | Documentation | Low — use `content_publishing_limit` and test both tokens |

There is **no technical or architectural blocker** in the repository.

## 27. Final recommendation

Proceed to **A3.7.4.1 Security & Persistence Foundation** when authorized.

- Build on the existing Facebook Login, Vault-stored long-lived user token, `appsecret_proof`, server-owned `page_id` and `instagram_account_id`.
- Add the opt-in publish re-consent and the per-channel attempt model.
- Use **private multipart upload for Facebook**.
- Use **short-lived, server-only signed URLs for Instagram**, after one real verification.
- Gate the Publish action on server-verified granted scopes until App Review grants Advanced Access.
- Update the legal text before any external user can publish.

**CONDITIONAL GO — A3.7.4 IS FEASIBLE BUT EXTERNAL META APPROVAL/PERMISSIONS ARE REQUIRED**

The reason:
- the repository has every building block (ownership, server-owned identities, private image retrieval, versioned final drafts, a token vault);
- the official Meta APIs support the required single-image flows on the current login model;
- `pages_manage_posts` and `instagram_content_publish` are not yet requested and need Advanced Access through App Review for non-role users;
- the remaining unknowns (Login for Business configuration, signed-URL fetch timing) are verifications, not blockers.

STOP. A3.7.4.1 not started. No Meta scope changed. No content published.
