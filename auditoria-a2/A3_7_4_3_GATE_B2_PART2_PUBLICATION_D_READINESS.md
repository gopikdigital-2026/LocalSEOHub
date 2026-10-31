# A3.7.4.3 — Gate B.2 Part 2 — Publication D Readiness (owner-created, read-only verification)

Date: 2026-10-31
Scope: READ-ONLY AUDIT AND REPORT UPDATE ONLY. No database writes, no publication edits, no secrets, no Meta Graph calls.

Supersedes the earlier Part 2 report (NO-GO, blocked on owner session). The owner has since created D through the normal authenticated workflow.

## 1. Publication D identity

| Check | Evidence (production DB, read-only SQL) | Result |
|---|---|---|
| Publication rows with UUID `875587f5-0137-4477-904c-609e8e406ad6` | count = 1 | PASS |
| Business | `e6014022-370f-4ec0-a340-c7c55f808247` (Gopik.Digital) | PASS |
| Publication owner | `aabe426e-f079-4db1-835b-17d9d126313e` | PASS |
| Business owner | `aabe426e-f079-4db1-835b-17d9d126313e` (matches) | PASS |
| Publication created_at | 2026-10-31 16:15:20.420329+00 | — |
| Publication updated_at | 2026-10-31 16:16:13.516242+00 | — |
| Publication status | `proposals_ready` (lifecycle of the proposals stage; draft readiness is tracked on the draft) | INFO |
| Proposal generation | `144d009d-e74a-4af4-8692-1ed882e4b2ca`, lang `es` | PASS |

## 2. Draft

| Check | Evidence | Result |
|---|---|---|
| Draft version | 3 (expected 3) | PASS |
| Selected proposal | position 3, role `professional`, lang `es`, selected_at 2026-10-31 16:18:11.396217+00 | PASS |
| Adapted | adapted_at 2026-10-31 16:20:26.486356+00 | PASS |
| Last draft edit | updated_at 2026-10-31 16:22:09.849195+00 | — |
| Draft "ready" | `publication_drafts` has no status column. Readiness is the server preflight: `publication_publish_preflight(owner, D, 3)` returns `issue = null` for both `facebook` and `instagram`, `draft_version = 3`, `attempt_status = null` | PASS |
| Version-binding control | Same preflight with expected version 2 returns `VERSION_CONFLICT` on both channels | PASS |

The preflight function is `STABLE` and contains no INSERT/UPDATE/DELETE (verified from `pg_get_functiondef`), so running it did not write anything.

## 3. Caption integrity

| Check | Evidence | Result |
|---|---|---|
| Instagram text exact match | `instagram_text = expected` → true | PASS |
| Length | 157 characters (limit 2200) | PASS |
| SHA-256 (UTF-8) | `537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e` | — |
| Edited by owner | `instagram_text <> instagram_generated` (owner replaced the generated text, as instructed) | PASS |
| Hashtags / mentions | none | PASS |
| Facebook text unchanged | `facebook_text = facebook_generated` → true; 302 chars; SHA-256 `b1c4786b85c8892a6dc85c5196df1093b561a1a64ca6930aac504354f8b6c5b2` | PASS |

Expected caption:
`Publicación de prueba controlada de LocalSEOHub. Estamos verificando nuestra integración de publicación en Instagram. Controlled LocalSEOHub publishing test.`

## 4. Original image

| Check | Evidence | Result |
|---|---|---|
| Path | `aabe426e-…/e6014022-…/875587f5-0137-4477-904c-609e8e406ad6/ba93c54e-c0ee-4fa0-a7b4-8284cddaa808.png` (owner/business/publication scoped) | PASS |
| Object exists in private bucket `publication-images` | 1 object, created 2026-10-31 16:15:22.690798+00 | PASS |
| Bucket private | `public = false` | PASS |
| Stored size / mime | 901,643 bytes, `image/png` (matches DB columns) | PASS |
| Dimensions (DB) | 1080 × 1350, `image_normalized = true` | PASS |
| Byte identity with test asset | storage eTag `fc3a190ee41708dc8b242ff5b711ae58` = MD5 of `gate-b1-assets/a3743-publication-d-test-image.png` | PASS |

Because the stored object is byte-identical to the asset, the local derivative evidence applies to D directly:
asset SHA-256 `6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7`, PNG 1080×1350 RGB, chunks IHDR/IDAT/IEND only;
derivative plan `none` (4:5, no crop), JPEG 1080×1350 q90, 87,040 bytes, SHA-256 `bc019d5ae146decf7dc22917027ccc4e0a1c7b2db2f3465bff14bd49ae726730`, deterministic, no metadata.
No derivative was uploaded; `instagram-derivatives` holds 0 objects.

## 5. Instagram single-image eligibility

- Aspect 4:5 (0.8), within the Instagram feed range 4:5–1.91:1. PASS
- Width 1080, within 320–1440. PASS
- JPEG derivative well under 8 MB. PASS
- Caption ≤ 2200 characters, 0 hashtags. PASS
- Server preflight Instagram issue: none. PASS

## 6. Publishing attempts for D

`publication_publish_attempts` rows for D: 0. PASS

## 7. Instagram account readiness

| Item | Stored DB evidence | Live Meta verification |
|---|---|---|
| Instagram account ID | `17841462487279994` (@localseohub.io), instagram_status `connected` | Not performed |
| Facebook Page | `1393994523793266`, connection `connected`, business = Gopik.Digital | Not performed |
| Permissions | snapshot includes `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`, `pages_manage_posts`, `public_profile` (checked 2026-10-29 18:06:07) | Not performed |
| Publishing consent | 2026-10-29 18:06:07.726431+00, not revoked, no last_error | n/a (internal) |
| Internal test entitlement | 1 active | n/a (internal) |
| Token validity | `token_expires_at` is null (long-lived Page token, no stored expiry) | NOT independently verifiable read-only without a Graph call using the token; not performed |
| Account subtype (Business/Creator) | not stored | NOT independently verifiable; not performed |

Limitation: token validity and account subtype rest on stored evidence only. Both must be confirmed live at the start of the separately authorized real E2E (the publish flow fails safely with a mapped Meta error if they're wrong).

## 8. Trigger state for D (P1/P2)

- Arming secrets absent → `isArmed = false` → trigger reason `not_armed`; D is also not in any allowlist (`META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS` absent).
- `isPublicationAllowed` / `isAuthorizedToPublish` unchanged (instagramPublish.ts SHA-256 `5523a9c0…`); mocked-arming coverage remains in the 24 Gate B.2 Part 1 security tests (passing).

## 9. Outstanding prerequisites (not authorized here)

1. Separate written authorization for the real Instagram E2E (Gate B.3).
2. At that time only: set `META_INSTAGRAM_REAL_PUBLISH_ARMED`, `META_INSTAGRAM_REAL_PUBLISH_USER_IDS = aabe426e-f079-4db1-835b-17d9d126313e`, `META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS = 875587f5-0137-4477-904c-609e8e406ad6`.
3. Publish with expected version 3; any further edit of D bumps the version and must be re-audited.
4. Live confirmation of token validity and account subtype.
5. Disarm (remove all three secrets) immediately after the single attempt.

## 10. Verdict

**GO — A3.7.4.3 GATE B.2 PART 2 PUBLICATION D READY; REAL INSTAGRAM E2E NOT AUTHORIZED**
