# A3.7.4.3 — Gate B.1 — Instagram Real E2E Readiness

**Date:** 2026-10-31 (evidence window 15:04–15:12 UTC)
**Baseline:** A3.7.4.3 Gate A, ZIP (27), Corrections 01–03
**Scope:** preparation and audit only. No real Meta Graph writes, no secrets, no publication D, no deploys.

## 1. Verdict

**GO — A3.7.4.3 GATE B.1 READINESS COMPLETE; REAL INSTAGRAM E2E NOT AUTHORIZED**

- The preparation and the future protocol are complete.
- This does **not** authorize production publishing.
- Gate B.2 can only start once the prerequisites in §7 are met. P1 (publication allowlist) and P2 (publish trigger) need a separately authorized code change. They are prerequisites for B.2, not B.1 defects: B.1 forbids production code changes.

## 2. Instagram account readiness (read-only)

Source: `meta_connections`, observed 2026-10-31 15:04:28 UTC. Only one connection exists. Token references and values were never selected.

| Item | Evidence | Status |
|---|---|---|
| Connection | id e85ae653-d92d-415f-830a-af322756e01c, status `connected`, instagram_status `connected`, no last_error, no revocation | VERIFIED (DB) |
| Owner | user aabe426e-f079-4db1-835b-17d9d126313e, business e6014022-370f-4ec0-a340-c7c55f808247 | VERIFIED (DB) |
| Instagram Professional account | id **17841462487279994**, username **@localseohub.io** | VERIFIED (DB) |
| Linked Facebook Page | id **1393994523793266**, "Localseohub.io" | VERIFIED (DB) |
| Page tasks | ADVERTISE, ANALYZE, CREATE_CONTENT, MANAGE, MANAGE_LEADS, MESSAGING, MODERATE | VERIFIED (DB, recorded 2026-10-29 18:06) |
| `instagram_basic` | present in `granted_permissions` | VERIFIED (DB, permissions_checked_at 2026-10-29 18:06:07) |
| `instagram_content_publish` | present in `granted_permissions` | VERIFIED (DB, same timestamp) |
| Other permissions | business_management, pages_manage_posts, pages_read_engagement, pages_show_list, public_profile | VERIFIED (DB) |
| Publishing consent | publishing_consent_at 2026-10-29 18:06:07 | VERIFIED (DB) |
| Token availability | `user_token_ref` present, and the referenced vault secret exists (existence check only, nothing decrypted) | VERIFIED (DB) |
| Token expiry | `token_expires_at` is NULL; no expiry is recorded | **NOT INDEPENDENTLY VERIFIABLE** |
| Token validity right now | Last confirmed use: the successful Facebook E2E on 2026-10-30 22:40:42 UTC. No Graph read was performed in B.1. | **NOT VERIFIED — indirect evidence only** |
| Business vs Creator | No direct evidence. The status response hard-codes `subtype_verified: false`. | **NOT VERIFIED** |
| Page ↔ IG link at Meta right now | Checked at publish time by the read-only Page lookup: the echoed Page id and IG id must both match, before any write | DEFERRED TO B.2 (read-only step) |

**Remaining Meta-side limitations and unknowns**
- App mode and access level for `instagram_content_publish`, outside the app's tester/role scope, is not visible from here. The publishing account is the app's own account.
- The Instagram content-publishing rate limit (a rolling 24 h quota) has not been queried. With zero prior Instagram posts it is not expected to be a factor.
- The account subtype is unverified. Both Business and Creator accounts support content publishing through a linked Page.

## 3. Fail-closed verification (no Graph writes)

| Check | Evidence | Result |
|---|---|---|
| Instagram publishing disabled | Arming requires `META_INSTAGRAM_REAL_PUBLISH_ARMED=true` **and** the user UUID in `META_INSTAGRAM_REAL_PUBLISH_USER_IDS` (instagramPublish.ts:13–14, 102–103). Publish and verify return 403 `REAL_PUBLISH_DISABLED` before preflight, begin or network. Test T35. | PASS |
| Instagram arming secrets absent | Secret list at 2026-10-31 15:04 UTC: neither META_INSTAGRAM_* name is present | PASS |
| Facebook arming secrets absent | No META_FACEBOOK_* names. Only META_APP_ID, META_APP_SECRET and META_REDIRECT_URI exist. | PASS |
| Separate function deployed, JWT-protected | `instagram-publishing` ACTIVE, verifyJWT=true (id a3008491-be86-40c3-ae41-0a93ee773be4); config.toml has `verify_jwt = true` | PASS |
| Unauthorized requests fail closed (live probe 2026-10-31 15:05:35 UTC) | no Authorization → 401; anon key as bearer → 401 `AUTH_REQUIRED`, state `NOT_REQUESTED`; malformed JWT → 401. The probe targeted C's id: still 0 attempts afterwards. | PASS |
| Graph writes mocked in tests | Every Instagram test injects a mocked `fetch` (T17–T29, T34) | PASS |
| No Facebook fallback | Separate function, no imports from meta-publishing. The caption comes only from `instagram_text`. Test T30 (channel independence). T31: a Facebook attempt cannot acquire container fields (DB shape check). | PASS |
| Originals not overwritten | The derivative is a new image in the separate private bucket `instagram-derivatives`, upload with upsert disabled, path keyed by attempt id; the original is only read (§5–6 of the Gate A report) | PASS |
| Signed URLs never persisted or exposed | 600 s TTL, in memory only, sent only as `image_url` to `/media`; `redact()` strips them (T15, T16); the browser has no token (T33) | PASS |
| Retry and UNKNOWN protections | Write-once container, forward-only stage, `begin` refused while UNKNOWN, no blind retry (T20–T22, T27–T29, T37–T38) | PASS |
| Real `/media` and `/media_publish` behaviour against Meta | — | **NOT EXECUTED — REQUIRES SEPARATE AUTHORIZATION** |
| Real container polling, permalink read-back, real UNKNOWN reconciliation | — | **NOT EXECUTED — REQUIRES SEPARATE AUTHORIZATION** |

## 4. Finding — the arming scope is per user, not per publication

The read-only preflight was run on 2026-10-31 (`publication_publish_preflight` is STABLE, so it cannot write).

| Pub | Owner | Instagram preflight |
|---|---|---|
| A | 5fa9559d… (different business, not connected) | CHANNEL_NOT_CONNECTED |
| B | 5fa9559d… | CHANNEL_NOT_CONNECTED |
| C | aabe426e… (connected user) | **eligible (no blocking code)** |

- C's Facebook result is ALREADY_PUBLISHED. Its Instagram channel is open: the image is derivable (PNG 1086×1448 → 4:5 crop) and its instagram_text is 156 chars.
- When arming is active for user aabe426e, any eligible publication of that user, including **frozen publication C**, could be published to Instagram by an authenticated request.
- The only current mitigations are procedural: there is no publish control in the UI, and only the operator holds a session.
- That is not sufficient for an audited single-publication E2E. Prerequisite **P1** (§7) adds a server-side publication allowlist before any arming.

## 5. Publication D — proposal (NOT inserted)

| Field | Proposed value |
|---|---|
| Identity | A new publication created through the normal app flow by user aabe426e for business e6014022. Its UUID is assigned at creation and recorded in the B.2 evidence. It must differ from A/B/C and from the other 14 existing rows. |
| Channel | Instagram only. No Facebook attempt may ever be made for D. |
| Test image | `auditoria-a2/gate-b1-assets/a3743-publication-d-test-image.png` |
| Image ownership | Generated for LocalSEOHub for this test. No people, places, brands, logos or text, so no third-party rights are involved. |
| Image facts | PNG, 1080×1350 (ratio 0.80, exactly 4:5), sRGB truecolor, metadata stripped, orientation 1, 901,643 bytes, sha256 `6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7` |
| Bucket limits | publication-images: 8 MiB, JPEG/PNG → within limits |
| Derivative dry run (real `buildDerivative`, local, no network) | ok; plan `none` (no crop needed); output JPEG 1080×1350, 87,040 bytes, APP1–APP15/COM markers: none; deterministic across two runs; output sha256 `bc019d5ae146decf7dc22917027ccc4e0a1c7b2db2f3465bff14bd49ae726730`; version `ig-jpeg-centrecrop-v1` |
| Expected at B.2 | `instagram_image_derivable` = true; no crop; no upscaling; 1080 ≤ 1440 width; size well under 8 MiB |
| Instagram caption (exact final `instagram_text`) | `Publicación de prueba controlada de LocalSEOHub. Estamos verificando nuestra integración de publicación en Instagram. Controlled LocalSEOHub publishing test.` (157 chars, within the 1–2200 DB check; no links, mentions or hashtags) |
| Draft version | Whatever `publication_drafts.version` reads after the caption is saved. That value is passed as `expectedVersion`, and any later edit invalidates it (STALE_VERSION). |
| Preflight requirements | Instagram preflight blocking code = null; Facebook channel not used; no prior attempt for D; caption byte-equal to the text above |

**Creation procedure (for a later, separately authorized phase).** It uses only the normal product flow, with no SQL inserts.
1. Upload the test image through the publications page.
2. Generate proposals. This consumes one normal proposal generation.
3. Select one proposal.
4. Run the channel adaptation.
5. In channel review, replace the Instagram text with the exact caption above and save.
6. Record D's id, version, image path, stored dimensions and `updated_at`.
7. Run the read-only preflight and confirm A/B/C `updated_at` are unchanged.

## 6. Tests and regressions (2026-10-31)

| Suite | Result |
|---|---|
| Full suite | **2913 / 2913 pass, 0 fail** (490 suites) |
| Instagram Gate A (a3743) | 39/39 |
| A3.7.4.1 (a3741) | 68/68 |
| A3.7.4.2 | 55/55 (a3742 photo), 8/8 (B2 Fix03), 19/19 (B1 Fix01), 12/12 (Fix02 entitlement) |
| Freeze guards | a3731 36/36, a3732 guards 28/28 |
| TypeScript | 20 inherited errors, **0 new** |
| Production build | PASS |

No frozen file, production file, migration, existing test or historical manifest was modified (hashes in the manifest).

## 7. Outstanding prerequisites before Gate B.2

| # | Prerequisite | Type |
|---|---|---|
| P1 | Server-side **publication allowlist** (e.g. `META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS`), checked together with the user allowlist before preflight. Refuses A/B/C and anything other than D. | Code change, needs separate authorization |
| P2 | **Publish trigger**: today the panel control is permanently disabled and the browser has no publish call. B.2 needs a narrowly scoped trigger that is only live when armed and only for the allowlisted publication. | Code change, needs separate authorization |
| P3 | Authorization to create publication D (§5) | Authorization |
| P4 | Authorization to create the temporary arming secrets, with an owner and an explicit removal deadline | Authorization |
| P5 | Live token validity, confirmed by the read-only Page lookup at the start of the single attempt (a fail here happens before any write) | Executed in B.2 |
| P6 | Optional: confirm the account subtype in Meta Business settings (manual, by the account owner) | Manual |

## 8. Production safety (read-only, 2026-10-31 15:05:01 UTC; re-checked at closure, see manifest)

- Publish attempts: exactly **1**, Facebook / succeeded / stage none / no container, on publication C (2026-10-30 22:40:42).
- Instagram attempts: **0**. Publishing or UNKNOWN attempts: **0**.
- A/B/C `updated_at` unchanged:
  - A 2026-10-27 23:05:19.287086
  - B 2026-10-28 12:27:05.291163
  - C 2026-10-30 00:13:08.946825
- Publications: 17. Latest `created_at` 2026-10-30 00:12:00, so there is **no D**.
- Buckets: publication-images private (8 MiB, JPEG/PNG); instagram-derivatives private (8 MiB, JPEG), no storage policies; **0** derivative objects.
- Secrets: no META_INSTAGRAM_* and no META_FACEBOOK_*.
- No function deployed in B.1. meta-publishing was not redeployed.
