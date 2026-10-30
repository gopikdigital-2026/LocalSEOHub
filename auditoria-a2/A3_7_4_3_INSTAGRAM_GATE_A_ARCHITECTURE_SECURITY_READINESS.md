# A3.7.4.3 — Instagram Professional Single-Image Publishing — Gate A

Date: 2026-10-30
Scope: architecture, security and capability readiness. No Instagram write. No Facebook write. No attempt rows created.

## 1. Executive verdict

**NO-GO — A3.7.4.3 INSTAGRAM GATE A REQUIRES CORRECTION**

Gate A stopped before implementation under rule §4 of the brief ("If the existing database state model is insufficient for the two-step Instagram process: STOP and explain the minimum migration required before implementing it").

The frozen `publication_publish_attempts` model cannot honestly represent Instagram's two external writes (`/media`, then `/media_publish`). Its other gaps are listed in §9–§11.

No application code, migration, edge function or secret was changed. The account capability audit passes; the blocker is the database state model, plus a decision on PNG/aspect-ratio normalization (§8) that the owner must approve.

## 2. Existing frozen baseline

- A3.7.4.2 is frozen with a GO verdict: one Facebook attempt, succeeded.
- meta-publishing deploy hash ae6e628c…, `hasChanged` false. All A3.7.4.2 manifest hashes are unchanged (no file touched).
- Reusable as-is:
  - the error taxonomy (`PUBLISH_ERRORS`) and `mapMetaError`, which already maps IG subcodes 2207004/2207005/2207009/2207051;
  - `redact` and `safeErrorLog`;
  - `appSecretProof`;
  - the service-only RPCs `publish_attempt_begin`, which already returns `instagram_account_id`, `publish_attempt_finish` and `publication_publish_preflight`;
  - `REQUIRED_PERMISSIONS.instagram`;
  - the unique indexes, which are already channel-scoped;
  - the private `publication-images` bucket;
  - the consent flow.

## 3. Real Instagram connection evidence (meta_connections, Manuel)

| Field | Value |
|---|---|
| status / instagram_status | connected / connected |
| Facebook Page | Localseohub.io — 1393994523793266 |
| Instagram account id | 17841462487279994 |
| Instagram username | localseohub.io |
| publishing_consent_at | 2026-10-29 18:06:07+00 |

## 4. Permissions evidence

`granted_permissions` contains:
- business_management
- instagram_basic
- instagram_content_publish
- pages_manage_posts
- pages_read_engagement
- pages_show_list
- public_profile

Every permission required for Instagram with Facebook Login is present. No extra permission is needed: Facebook-Login IG publishing uses the Page-linked IG user plus `instagram_basic` and `instagram_content_publish`, alongside the Page scopes. `page_tasks` includes CREATE_CONTENT and MANAGE.

## 5. Account identity / linkage

- The IG id was obtained by the connection flow from `GET /{page-id}?fields=instagram_business_account` (meta-connection handler). It is therefore the professional account linked to that exact Page; personal accounts are never returned by that field.
- Business vs Creator is NOT stored and was not read live, because audit tooling holds no Meta token by design. Gate B must read it via `GET /{ig-id}?fields=id,username` before any write. Publishing supports both types.

## 6. Image requirements (Meta Content Publishing docs, current)

- JPEG only; MPO/JPS are not supported, and PNG cannot be supplied.
- 8 MB maximum.
- Aspect ratio from 4:5 (0.8) to 1.91:1. The frozen 0.8–1.91 assumption is still correct.
- Width 320–1440 px.
- Meta fetches the image from a public `image_url`.
- Container `status_code` values: IN_PROGRESS, FINISHED, ERROR, EXPIRED (24 h), PUBLISHED.
- Limit: 100 API-published posts per 24 h.

Real images:

| Pub | Format | Size | Ratio | IG-compatible as-is |
|---|---|---|---|---|
| A | JPEG | 785×522 | 1.504 | yes (protected — not usable) |
| B | JPEG | 1175×655 | 1.794 | yes (protected — not usable) |
| C | PNG | 1086×1448 | 0.750 | **no**: PNG, and the ratio is below 0.8 |

C's live preflight returns `instagram = IMAGE_UNSUPPORTED`, which is correct. JPEG conversion alone would not make C eligible; it would also need cropping or padding to ≥ 0.8.

## 7. Private-image delivery design (proposed, not implemented)

1. The service role writes a derivative object into the private bucket: `{user}/{business}/{publication}/ig/{attempt_id}.jpg`.
2. It issues `createSignedUrl(path, 600)` (TTL 10 min). The URL is scoped to that one object, the bucket stays `public=false`, and there is no listing.
3. The signed URL is held only in edge-function memory. It is never persisted, returned to the browser or logged; `redact` already masks `/object/sign/`.
4. Meta fetches the image during container creation. The 10 min TTL covers that and the readiness polling, which is bounded at ≤ 60 s.
5. The derivative is deleted once the attempt reaches a terminal state. A sweeper removes orphans older than 1 h.

## 8. JPEG / normalization design (requires owner decision)

The original private image is never mutated. The derivative is produced as follows:
- decode PNG/JPEG;
- if the ratio is < 0.8, pad (letterbox) to 4:5; if it is > 1.91, pad to 1.91:1;
- downscale to ≤ 1440 px wide;
- encode JPEG at quality 90, stripping EXIF;
- verify the result is ≤ 8 MB and record its sha256.

This needs a Deno-compatible codec (e.g. `npm:imagescript`) inside the edge function.

**Owner decision needed:** pad (no content loss, visible bars) or centre-crop (loses edges). The publish check must also be extended so that Instagram eligibility is "derivable", not just "JPEG and ratio 0.8–1.91". That change touches the shared, frozen `publication_publish_gate`.

## 9. Publishing state machine and why the frozen model is insufficient

Required Instagram states:

| Logical state | External effect so far |
|---|---|
| nothing sent | none |
| container create outcome unknown | maybe an orphan container (harmless, expires in 24 h) |
| container created, not published | container id known, no post |
| publish outcome unknown | maybe a live post |
| succeeded | media_id |
| definitively failed | none, or an expired container |

The frozen constraints block this:
- `publish_attempts_state_shape` requires `meta_object_id IS NULL` while the status is `publishing`, so `creation_id` cannot be stored mid-flight.
- There is no column for a container id, and `publish_attempt_finish` only accepts `publishing` → terminal.
- `unknown` collapses two very different risks:
  - unknown at container stage: no post can exist, so the result could be safely verified and failed;
  - unknown at publish stage: a post may exist, so verification against `GET /{ig-id}/media` is mandatory.

  The frozen model cannot tell them apart. Treating both as publish-unknown is safe but permanently blocks Instagram for that publication with no way out. Treating both as container-unknown is unsafe.
- If the function dies between `/media` and `/media_publish`, the row is stuck in `publishing` with no record of the container. A later verifier cannot query `GET /{creation_id}?fields=status_code`, so it cannot prove whether `/media_publish` ran.

Forcing Instagram into the Facebook-shaped model would be either unsafe or a dead end.

## 10. Idempotency model

Already correct and reusable:
- identity is `publication_id + channel + draft_version`;
- `one_success`, `one_active` and `identity_live` are all keyed by channel, so Facebook success on C does not block Instagram, which C's preflight confirms (instagram = IMAGE_UNSUPPORTED, not ALREADY_PUBLISHED);
- the gate rejects stale versions, foreign users, already-published and in-progress.

These protections need no change.

## 11. UNKNOWN handling

- Instagram UNKNOWN must stay non-retryable and `verification_required`, as today.
- Gate B verification is read-only, via `GET /{creation_id}?fields=status_code` and `GET /{ig-id}/media?fields=id,caption,timestamp`.
- This requires the container id to be persisted (§9).

## 12. Server-side security (design, matches frozen pattern)

- User token from Vault via `meta_read_token`.
- Page token derived server-side.
- `appsecret_proof` sent on every call.
- The browser receives only status and ids; no token or signed URL is ever sent to it.
- No Graph call from React.
- The publication id is always explicit; Instagram uses `instagram_text` only. There is no Facebook-caption fallback, no AI and no latestReady.

## 13. Arming / fail-closed design

- New secrets `META_INSTAGRAM_REAL_PUBLISH_ARMED` and `META_INSTAGRAM_REAL_PUBLISH_USER_IDS` would use the same semantics as the frozen `isArmed`: the flag must be exactly `"true"` and the caller's UUID must be in the allow-list.
- They were not created. Today no Instagram write path exists at all, so real Instagram publishing is impossible.

## 14. Error mapping

Instagram cases map onto existing taxonomy codes:

| Instagram case | Code |
|---|---|
| container ERROR / 2207xxx image errors | IMAGE_UNSUPPORTED / META_REJECTED |
| EXPIRED | META_TEMPORARY_ERROR (nothing published) |
| container IN_PROGRESS beyond the bound | META_TEMPORARY_ERROR before publish (safe; the container simply expires) |
| 2207051 | META_RATE_LIMITED |
| the 100/24 h cap | META_RATE_LIMITED |

No new code is needed. The "unknown at container stage" vs "unknown at publish stage" distinction is a **state** gap, not a taxonomy gap (§9).

## 15. Tests

Not written, because implementation stopped at §4. The 25 required cases are deferred to the corrected Gate A.

## 16. Typecheck / build

No application code changed. Regression was re-run on the unchanged tree (§18).

## 17. DB state before/after (identical; read-only only)

| Check | Value |
|---|---|
| attempts | facebook/succeeded = 1; everything else 0; instagram 0 |
| C preflight | facebook = ALREADY_PUBLISHED, instagram = IMAGE_UNSUPPORTED |
| A draft md5 | 5b7366bfcaa8e008b1ba5b38138bf8dd (= baseline), proposals_ready @ 2026-10-27 23:05:19.287086+00 |
| B draft md5 | fd3e4f7a51725b58fced11e3ef4975ac (= baseline), proposals_ready @ 2026-10-28 12:27:05.291163+00 |
| C | updated_at 2026-10-30 00:13:08.946825+00 (unchanged) |
| Facebook arming secrets | absent |
| Instagram arming secrets | absent |
| publication-images bucket | public=false |
| meta_connections | unchanged (read only) |

No Instagram media and no Facebook content were published.

## 18. Facebook regression

All frozen Facebook files are byte-identical to the A3.7.4.2 manifest, and the deployed function is unchanged. Results on the unchanged tree:

| Check | Result |
|---|---|
| Full suite | 84 files, 2874 tests passed (= baseline) |
| tsc | 20 inherited errors, 0 new |
| Build | PASS |

## 19. Known limitations

- IG account type (Business or Creator) is unverified live (§5).
- C is not Instagram-eligible without normalization, and A and B are protected. Gate B therefore needs either owner approval of normalization or a new JPEG test publication with a 0.8–1.91 ratio.

## 20. Minimum correction required before Gate A can be re-run (implementation)

Migration `a3743_instagram_container_state`, additive only, with no change to existing rows or Facebook semantics:

1. `ALTER TABLE publication_publish_attempts ADD COLUMN meta_container_id text NULL CHECK (meta_container_id ~ '^[0-9]{1,32}$')` and `ADD COLUMN external_stage text NOT NULL DEFAULT 'none' CHECK (external_stage IN ('none','container_requested','container_created','publish_requested'))`.
2. Replace `publish_attempts_state_shape` with an equivalent constraint that additionally allows `meta_container_id` and `external_stage` to be set only when `channel = 'instagram'`. Facebook rows must keep `external_stage = 'none'` and `meta_container_id IS NULL`.
3. New service-only function `publish_attempt_advance(p_user_id, p_attempt_id, p_stage, p_container_id)`, with REVOKE from PUBLIC, anon and authenticated:
   - only for `status = 'publishing'` and channel instagram;
   - monotonic stages, never backwards;
   - the container id can be written once and only at `container_created`.
4. `publish_attempt_finish` unchanged.
5. Instagram eligibility in `publication_publish_gate` extended to "JPEG, or PNG with an approved derivative", only if the owner approves §8.

After the correction, re-run Gate A to implement:
- the separate `instagram-publishing` edge function, so the frozen meta-publishing stays byte-identical;
- the derivative and signed-URL delivery;
- `/media` → bounded `status_code` poll → `/media_publish` → read-only verification, all mocked;
- the read-only internal panel;
- the 25 tests.
