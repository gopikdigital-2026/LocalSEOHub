# A3.7.4.3 — Gate B.2 Part 2 — Publication D Readiness

Baseline: Gate B.2 Part 1, ZIP (30). Real Instagram publishing NOT authorized.

## Status: BLOCKED BEFORE D CREATION (owner action required)

Publication D was **not created**. Every step of the normal workflow requires the owner's own authenticated session:

| Step | Server entry | Auth |
|---|---|---|
| Upload + normalization | `publication-media` | verify_jwt = true; handler returns 401 `UNAUTHENTICATED` without a user JWT |
| Three proposals (AI) | `publication-proposals` | verify_jwt = true, entitlement + usage limits |
| Proposal selection / draft | RLS-scoped RPC as `authenticated` | owner JWT |
| Channel adaptation | `publication-adaptations` | verify_jwt = true |
| Instagram caption edit (versioned) | channel review RPC | owner JWT |

The agent holds no session for user `aabe426e-…`. The only ways to proceed without the owner would be to forge or mint a user token, or to write rows directly with the service role. Both bypass the workflow and business rules and are prohibited by §4 ("Do not fabricate a publication through direct SQL"). Per §3/§4: STOP.

No production code was changed.

## Read-only preflight (passed)

| Item | Expected | Observed |
|---|---|---|
| Instagram account ID | 17841462487279994 | 17841462487279994 |
| Username | @localseohub.io | localseohub.io |
| Linked Page | 1393994523793266 | 1393994523793266 |
| Connection status / IG status | connected | connected / connected |
| Business | owned by connected user | e6014022-370f-4ec0-a340-c7c55f808247 (Gopik.Digital), owner aabe426e-f079-4db1-835b-17d9d126313e = connection user |
| Permissions (stored grant) | instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement | all present (+ pages_manage_posts, business_management, public_profile) |
| Publishing consent | present | 2026-10-29 18:06:07 UTC |
| Internal test entitlement | active | 1 active |
| Revocation / last error | none | none / none |
| IG / FB arming secrets | absent | absent (no `META_INSTAGRAM_REAL_PUBLISH_*`, no `META_FACEBOOK_REAL_PUBLISH_*`) |
| Instagram attempts | 0 | 0 |
| Active / UNKNOWN attempts | 0 | 0 |

Limitations (not invented):
- The stored `token_expires_at` is null. Token validity was **not** independently re-verified against Meta in this phase, because no live read-only Graph call was made.
- Permissions were taken from the stored grant snapshot (`permissions_checked_at` 2026-10-29 18:06 UTC), not re-queried live.
- The Business vs Creator subtype is not verified, as in Gate A/B.1.

## Test asset integrity and derivative (local, nothing uploaded)

- Asset `auditoria-a2/gate-b1-assets/a3743-publication-d-test-image.png`: sha256 `6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7`, 901,643 bytes, PNG 1080×1350, 8-bit RGB. Chunks are only IHDR/IDAT/IEND, so there is no text or metadata.
- Production derivative code (`derivative.ts`, unchanged), run locally with the test codecs:
  - probe 1080×1350, orientation 1; plan `none` (4:5 already, no crop);
  - output JPEG 1080×1350, quality 90, 87,040 bytes;
  - sha256 `bc019d5ae146decf7dc22917027ccc4e0a1c7b2db2f3465bff14bd49ae726730`, identical on a second run (deterministic);
  - JPEG metadata markers: none.
- No signed URL or token was generated. Nothing was stored. The temporary check script was deleted.

## Allowlist / trigger state

P1 and P2 are deployed and unchanged (`instagramPublish.ts` 5523a9c0…). The allowlist secret is absent, so every publication, including a future D, is refused, and the P2 button stays disabled (`trigger.reason = not_armed`). A/B/C are refused even under mocked arming (Part 1 suite, 24/24).

## Required to unblock (owner action in the app)

1. Signed in as the owner of Gopik.Digital, open the internal publications validation page and upload the test asset (from the audit ZIP).
2. Generate proposals, select one, then run the adaptation.
3. In channel review, set the Instagram text to exactly: "Publicación de prueba controlada de LocalSEOHub. Estamos verificando nuestra integración de publicación en Instagram. Controlled LocalSEOHub publishing test." Save it, and do not publish to Facebook.
4. Report back; the agent then records the D UUID, version, image path, caption hash and preflight read-only, and completes this gate.

## Outstanding for a future real E2E (unchanged)

D created; explicit authorization; set `META_INSTAGRAM_REAL_PUBLISH_ARMED`, `..._USER_IDS` (owner) and `..._PUBLICATION_IDS` (D only); live token/permission check; single trigger from the internal harness; disarm immediately after.
