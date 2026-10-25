# A3.7.1 — Publications MVP: Data, Private Image Storage & Safety Foundation

Date: 2026-10-25 · Type: implementation + security validation · Scope: storage, data foundation, ownership, lifecycle only.

---

## 1. Executive Summary

A3.7.1 delivers the server-enforced foundation for Publications drafts:

- one minimal table `public.publications` (status `draft` | `image_ready`), RLS on, owner + business-scoped;
- one **private** bucket `publication-images` (8 MB, JPEG/PNG only);
- one server function `publication-media` (sign-in required) that is the **only** write path into storage: it authenticates, verifies publication + business ownership, streams with a hard 8 MB cap, sniffs magic bytes, parses dimensions from headers without decoding, writes to `{user_id}/{business_id}/{publication_id}/{uuid}.{jpg|png}`, and handles attach / replace / delete with compensating cleanup;
- a typed client repository (`createDraft`, `getDraft`, `listDrafts`, `attachImage`, `replaceImage`, `deleteDraft`) with no `any`;
- 48 new tests + a live, fully rolled-back RLS/storage validation (37 checks, all as expected).

Results: 2303/2303 tests pass (2255 baseline + 48 new), tsc 20 errors (= legacy 20), build PASS, frozen Meta/Social/Hoy/Plan sources byte-identical. No AI, no publishing, no Meta permission change, no route, no UI.

## 2. Authorized Scope

Built: photo storage, publication/draft data, ownership, security, lifecycle (create, attach, replace, delete).
Not built (by instruction): AI, proposals, Facebook/Instagram publishing, Meta permissions/OAuth, channel adaptation, final UI, GBP, scheduling, analytics, Stories/Reels, legal changes, AI cap, any route (no `/herramientas/publicaciones`).

## 3. A3.7.0 Inputs

From the A3.7.0 audit (verdict CONDITIONAL GO): Option B staged server pipeline; phases A3.7.1–A3.7.6; Instagram requires a publicly fetchable JPEG at publish time; `pages_manage_posts` and `instagram_content_publish` missing; GBP externally blocked. A3.7.1 implements only phase 1 of that plan and keeps upload format (JPEG/PNG) separate from the publishing format (JPEG, produced in a later phase).

## 4. Data Model Decision

A single table holding the draft and its single current image reference. No proposal, caption, variant, schedule, channel, token or URL columns — each later phase adds its own columns/tables through its own migration. Image metadata (mime, bytes, width, height, uploaded_at) is stored because it is validated server-side and needed by A3.7.2 without re-reading the object.

## 5. Tables Created

`public.publications` (migration `20261025152315_a371_publications_data_storage_foundation.sql`, applied as `a371_publications_data_storage_foundation`):

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| user_id | uuid NOT NULL | DEFAULT `auth.uid()`, FK auth.users ON DELETE CASCADE |
| business_id | uuid NOT NULL | FK businesses ON DELETE CASCADE |
| status | text NOT NULL | DEFAULT 'draft', CHECK in ('draft','image_ready') |
| image_path | text NULL | object key only; never a URL |
| image_mime | text NULL | image/jpeg or image/png |
| image_bytes | integer NULL | 1..8388608 |
| image_width / image_height | integer NULL | 320..8192, product ≤ 40,000,000 |
| image_uploaded_at | timestamptz NULL | |
| created_at / updated_at | timestamptz | trigger-managed |

Constraints: status check; consistency check (draft ⇒ all image fields NULL; image_ready ⇒ all set and within limits); path-format check (`^{user_id}/{business_id}/{id}/{uuid}\.(jpg|png)$`, extension must match mime). Indexes: unique partial on image_path; (user_id, created_at DESC); business_id.

Trigger `publications_guard` (BEFORE INSERT OR UPDATE, `search_path=public`, EXECUTE revoked from PUBLIC/anon/authenticated): owner/business/created_at immutable on update; business must belong to `user_id`; max 20 rows per user; timestamps forced.

## 6. Status Model

`draft` (no image) → `image_ready` (one validated image). Nothing else. No `published`, `scheduled`, `failed` or similar states exist, so the system cannot pretend publishing happened. Later phases extend the CHECK in their own migrations.

## 7. Channel-result Deferral/Decision

**Deferred to A3.7.4.** A channel-result table records publishing attempts per channel; no publishing exists in A3.7.1, so the table would be empty and speculative. The minimal-schema rule forbids it now.

## 8. Storage Bucket

`publication-images`: `public = false`, `file_size_limit = 8388608`, `allowed_mime_types = {image/jpeg, image/png}`. Created via upsert whose conflict branch forces `public = false`, so re-running the migration can never make it public. Live check: bucket row not even visible to the `authenticated` role (A19).

## 9. Object Path Model

`{user_id}/{business_id}/{publication_id}/{random_uuid}.{jpg|png}`

- Every segment is chosen by the server: user from the verified JWT, business and publication from the owned row, random leaf from `crypto.randomUUID()` (re-validated as a UUID before use), extension from sniffed bytes.
- Client-supplied `path`/`user_id` query parameters are ignored (tested).
- The database path CHECK independently rejects foreign prefixes, traversal (`..`) and mime/extension mismatch (live S1, S2).
- Uploads use `upsert: false`, so an existing object can never be overwritten.

## 10. Storage Policies

Exactly one policy on `storage.objects` for this bucket:

`publication_images_select_own` — FOR SELECT TO authenticated, when bucket = `publication-images`, first folder = `auth.uid()`, AND the object is the **current** `image_path` of a publication owned by the caller.

No INSERT / UPDATE / DELETE policies for any client role → clients cannot write, overwrite or delete objects. Orphaned or superseded objects are invisible even to their owner (live A13). Storage's own trigger additionally blocks direct SQL deletes (A18).

## 11. Database RLS

- RLS enabled. `REVOKE ALL` from anon and authenticated, then:
  - authenticated: `SELECT` + column-level `INSERT (business_id)` only. No UPDATE, no DELETE.
  - service_role: full CRUD (server function only).
- `select_own_publications`: `auth.uid() = user_id` AND business owned by caller.
- `insert_own_publications`: WITH CHECK `auth.uid() = user_id`, `status = 'draft'`, `image_path IS NULL`, business owned.
- No `FOR ALL`, no `USING (true)`, nothing granted to anon.

Because clients can neither set status nor image columns, the only way a row becomes `image_ready` is through the validated server path.

## 12. Business Ownership

Enforced at three layers: the INSERT policy (business owned by `auth.uid()`), the trigger (business owned by the row's `user_id`, also on service-role writes — live S8), and the server function (re-checks ownership of the business on every call, so a business that changed hands is refused — tested). SELECT also requires current business ownership.

## 13. Accepted Upload Formats

JPEG and PNG only. HEIC, SVG, GIF, WebP and everything else are rejected. Upload format is distinct from publishing format: A3.7.x publishing will produce a JPEG derivative (Instagram requirement) in a later phase; nothing here assumes the uploaded file is what gets published.

## 14. File Validation

Server-side, in order: valid session → valid action + UUID → publication owned → business owned → attach/replace precondition → streamed body ≤ 8 MB → non-empty → magic bytes (JPEG `FF D8 FF`, PNG 8-byte signature) → declared `Content-Type` must equal the sniffed type → header parse for dimensions → dimension limits. Filename is never used. Client-side precheck (type, size, empty) exists only for fast feedback; the server is authoritative.

## 15. File Size Limit

8 MB (8,388,608 bytes), enforced three times: declared `Content-Length` rejected early, streamed byte counter aborts the read on the first byte over the limit (no unbounded buffering), and the bucket's own `file_size_limit`. The database CHECK caps `image_bytes` too. Exactly 8 MB is accepted; 8 MB + 1 is rejected (tested).

## 16. Dimension Handling

Dimensions come from the PNG IHDR chunk or the JPEG SOF marker (baseline/progressive/other SOF variants; APP/EXIF segments and fill bytes are skipped). Pixel data is **never decoded** in A3.7.1, so decompression bombs cannot exhaust memory here. Limits: 320–8192 px per side and ≤ 40 MP total. A 8192×8192 or 0x7FFFFFFF-sided header is rejected before anything is stored. This bounds the work any later phase (A3.7.2 normalization) must do when it does decode. Truncated or SOF-less JPEG and malformed PNG are rejected as unreadable.

## 17. EXIF/Metadata Handling

**RAW UPLOAD MAY CONTAIN METADATA.** A3.7.1 stores the original bytes unchanged; EXIF (including possible GPS location) is not stripped. Mitigation now: the object is private, readable only by its owner while it is the current image, and is never sent anywhere. Stripping/normalization (re-encode to a clean JPEG) is deferred to A3.7.2 and must happen before any AI or publishing use.

## 18. Signed URL Policy

- No generic signing endpoint exists. The server function never creates signed or public URLs (source-tested).
- The only read path is the owner storage policy: the owner's session may read (or create a short-lived signed URL for) their **current** image only.
- Later phases that need an externally fetchable URL (Instagram) must mint a short-lived signed URL server-side, per object, at publish time. Nothing permanent is stored.

## 19. Upload Architecture

**Server-mediated upload** via `publication-media` (verify_jwt = true), chosen over direct client upload because:
1. clients get no storage write policy at all, so path, overwrite and cross-tenant writes are impossible by construction;
2. magic bytes, dimensions and declared-type consistency can only be trusted when checked server-side;
3. the row reference and the object are updated together, with compensation on failure.

Trade-off: bytes pass through the function (bounded at 8 MB). Request shape: `POST publication-media?action=attach|replace|delete&publication_id=<uuid>` with the raw file body and its `Content-Type`. Responses contain only `ok`, a code, and safe metadata (mime, bytes, width, height, uploadedAt) — no paths, URLs or tokens (tested). Errors are fixed codes; exception text is never returned.

Gating decision: plain sign-in (same as the Meta functions), not premium gating. A3.7.1 has no AI cost; storage is bounded by 20 drafts × 8 MB per user. Premium/AI caps are a decision for A3.7.2.

## 20. Draft Creation Flow

Client `createDraft(businessId)` inserts `{ business_id }` only; owner defaults to `auth.uid()`, status to `draft`. Errors map to `draft_limit`, `business_not_owned` or a generic `unavailable` (raw database messages are never surfaced). Live: own insert succeeds as draft with no image (P1); foreign business, forged owner and forged status all denied (A8–A10).

## 21. Image Replacement

- `attach` requires no current image; a second attach returns `IMAGE_ALREADY_ATTACHED` (409) and stores nothing (deterministic).
- `replace` requires a current image (`NO_IMAGE_TO_REPLACE` otherwise).
- Order: upload new object (new random name) → conditional row update (`WHERE image_path = <old>`) → only then delete the old object. The old object is removed only after the new reference is persisted; only the caller's own old path is ever deleted (tested).
- A concurrent replace that loses the conditional update gets `CONFLICT`, and its freshly uploaded object is removed; the winner is untouched (tested).

## 22. Deletion

`deleteDraft` goes through the server function: conditional row delete first (`WHERE image_path = <expected>`), then object removal. If the row changed in between → `CONFLICT`, nothing deleted. If object removal fails after the row is gone, the call still succeeds (the user's draft is gone) and a generic orphan log line is written; the object is already unreadable because the storage policy requires a live reference. Clients cannot delete rows or objects directly (live A6, A7, A18).

## 23. Orphan Handling

| Case | Handling |
|---|---|
| Upload ok, row update fails or throws | new object removed immediately (compensation, tested) |
| Upload fails | row unchanged, `STORAGE_UNAVAILABLE` |
| Draft created, never uploaded | harmless `draft` row, counts toward the 20 limit |
| Old object removal fails after replace/delete | logged; object unreachable via policy; left for a sweep |
| Account/business deletion | rows cascade; **objects do not cascade** (see §24) |

Residual orphans are bounded and invisible. A periodic service-side sweep (objects in the bucket not referenced by any `image_path`) is documented, not built.

## 24. Retention

An image exists while it is the current image of an existing draft. Replacing or deleting removes it. On account or business deletion the publication rows cascade, but Storage objects are not removed by database cascades; until a sweep exists, the account-deletion runbook must include removing the `{user_id}/` prefix in `publication-images`. No claim of automatic removal is made.

## 25. Repository Layer

`src/features/publications/repository.ts` (dependency-injected `Db = Pick<SupabaseClient,'from'|'functions'>`, matching existing repositories):
`createDraft`, `getDraft`, `listDrafts` (needed for any future list view, RLS-scoped), `attachImage`, `replaceImage` (server upload, then reload row), `deleteDraft` (server). Rows are validated by `toPublication`; inconsistent rows are dropped. Server codes are mapped through an own-property allowlist (a `__proto__` code was caught by the tests and fixed).

## 26. Types

`src/features/publications/types.ts`: shared limits; `Publication` discriminated union (`status: 'draft'; image: null` | `status: 'image_ready'; image: PublicationImage`); `PublicationErrorCode` union; `PublicationError` class. No `any`. Client and server limits are asserted equal by a test (the server function cannot import app code).

## 27. Security Analysis

| Threat | Control | Evidence |
|---|---|---|
| Anonymous access | no anon grants; function requires JWT | N1–N4, handler 401 tests |
| Cross-tenant read | RLS + business ownership; storage policy | A1, A3, A11 |
| Cross-tenant write / namespace injection | no client storage write policy; server-built path; DB path CHECK | A14, S1, path tests |
| Enumeration | foreign and missing ids both return identical 404 | handler test |
| Forged owner/status/image | column-level INSERT grant; no UPDATE grant | A5, A9, A10 |
| Overwrite of existing object | `upsert: false`, random leaf, unique path index | S10, code guard |
| Malicious file (SVG/script, polyglot, HEIC, GIF) | magic bytes + declared type match | 415 tests |
| Oversize / slow drip | streamed cap, Content-Length precheck, bucket limit | 413 tests |
| Decompression bomb | header-only parsing, 40 MP cap | dimension tests, S5 |
| Path traversal | UUID-only ids, server-built path, DB regex | 400 tests, S2 |
| Race on replace/delete | conditional updates/deletes | conflict tests |
| Error-detail leakage | fixed codes; generic logs | 500 test, source guard |
| Storage abuse | 20-draft cap, 8 MB each | S11 |
| Prototype-key confusion in client mapping | own-property check | repository test |

Security advisor: no findings for `publications`, `publications_guard` or `publication-images`; the 9 listed findings all pre-date A3.7.1.

## 28. Secrets Audit

- `dist/`: no `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_`, `META_APP_SECRET` (grep clean).
- Client publications code: no service-role reference, no storage calls (source test).
- Server function reads the service role only from the runtime environment; no tokens stored in the table; no URLs persisted.

## 29. Meta/Frozen Architecture Protection

Hash prefixes unchanged: meta-oauth-start `e21d60a5`, meta-oauth-callback `89ff215b`, meta-connection `57e8341f`, meta-read `987cc94b`. All non-test sources under meta-connection, social-intelligence, today-intelligence and roadmap are byte-identical (manifest diff). No Meta scopes, OAuth or Graph calls were added (source test). Hoy/Plan untouched.

## 30. Google Status

Unchanged. GBP remains EXTERNALLY BLOCKED as recorded in A3.7.0; nothing in A3.7.1 touches Google.

## 31. Tests Added

48 new tests in 2 files:

- `a371PublicationsMedia.test.ts` (30):
  - signature sniffing;
  - PNG/JPEG dimension parsing (baseline, progressive, EXIF, fill bytes);
  - empty/unsupported/disguised/mismatched files;
  - truncated/SOF-less files;
  - 320/8192/40 MP limits and huge headers;
  - limit parity;
  - path model;
  - CORS/method;
  - unauthenticated/forged token;
  - bad action/UUID/traversal;
  - cross-user = missing (no enumeration);
  - business no longer owned;
  - 8 rejection cases with no storage write;
  - oversize by declared and streamed length;
  - exactly 8 MB accepted;
  - successful attach with ignored client path and metadata-only reply;
  - deterministic second attach;
  - replace preconditions;
  - replace order and old-object-only deletion;
  - concurrent replace;
  - failed/throwing save compensation;
  - storage failure;
  - delete order and tenant isolation;
  - image-less delete;
  - orphan logging;
  - non-UUID random id.
- `a371PublicationsRepository.test.ts` (18):
  - insert shape;
  - error mapping;
  - row validation;
  - get/list;
  - client precheck;
  - invoke shape;
  - server code mapping incl. `__proto__`;
  - delete via server;
  - migration guards (RLS, grants, no anon, no `FOR ALL`/`USING(true)`, no token/URL/speculative columns, private bucket, single owner-scoped SELECT storage policy);
  - function guards (JWT, no signing, no AI/Meta/Google, no upsert, no raw error messages);
  - no service role/storage in client;
  - dist secret scan;
  - no route;
  - frozen Meta hashes.

Updated pinned guards (deliberate, documented in-line): migration count 49 → 50 in a281 (test 18), a33 (test 16), f03Stage2b (tests 21, 34/35), a273 (112), a272 (30). Meanwhile:

- a273, a272 and a3542 (test 39) now check "the last non-A3.7.1 migrations are unchanged", so each still proves its own feature added none.
- a3543 re-pins the hash of the a3542 test file only, with reason; no Social source changed.

## 32. Database/Storage Validation

Live, inside a single DO block that ends in an exception (all fixtures rolled back; table count after = 0, no real data touched). Two real owners/businesses (A, B) used only as identities.

**Server-side constraints:**

| Check | Result |
|---|---|
| S1 foreign-prefix path | denied |
| S2 traversal | denied |
| S3 GIF mime | denied |
| S4 oversize | denied |
| S5 64 MP | denied |
| S6 empty | denied |
| S7 `published` status | denied |
| S8 foreign business (trigger) | denied |
| S9 owner change | denied |
| S10 shared object path | denied |
| S11 20 drafts | ok |
| S11 21st draft | denied |

**As authenticated user A:**

| Check | Result |
|---|---|
| A1 B's row visible | 0 |
| A2 own row visible | 1 |
| A3 foreign rows visible | 0 |
| A4 update B | denied |
| A5 update own image | denied |
| A6 delete B | denied |
| A7 delete own directly | denied |
| A8 insert into B's business | denied |
| A9 forged owner | denied |
| A10 forged status | denied |
| A11 B's object visible | 0 |
| A12 own current object visible | 1 |
| A13 own orphan visible | hidden |
| A14 write into B's namespace | denied |
| A15 direct own write | denied |
| A16 update B's object | 0 rows |
| A17 update own object | 0 rows |
| A18 delete B's object | denied |
| A19 bucket row | not visible |
| P1 own draft insert | succeeds |

**As anon:**

| Check | Result |
|---|---|
| N1 table | denied |
| N2 objects visible | 0 |
| N3 insert | denied |
| N4 upload | denied |

All 37 outcomes match the intended policy. The function was deployed; an end-to-end call against the deployed function was not possible from this sandbox (no outbound network). Its behavior is covered by the handler tests with injected dependencies.

## 33. Full Regression

65 files, **2303 passed, 0 failed** (2255 baseline + 48 new).

## 34. TypeScript

`npx tsc --noEmit -p tsconfig.app.json`: **20 errors = the 20 legacy errors**, none in new or edited files.

## 35. Build

`npm run build`: **PASS**.

## 36. Hash Verification

Manifest `/tmp/a371/pre.txt` vs `/tmp/a371/post.txt` (430 → 437 files):

- **Added (7):**
  - `src/features/publications/{types.ts, repository.ts}`;
  - 2 test files;
  - `supabase/functions/publication-media/{index.ts, handler.ts}`;
  - the migration.
- **Changed (9):**
  - 7 test files (pinned guards, §31);
  - `supabase/config.toml` (new `[functions.publication-media] verify_jwt = true`);
  - `supabase/functions-deploy-state.json` (deploy record).
- **Removed:** none.
- **Frozen sources:** byte-identical (Meta handlers, Social Intelligence, Meta connection, Hoy, Plan).

## 37. Known Limitations

1. EXIF/GPS not stripped (RAW UPLOAD MAY CONTAIN METADATA) until A3.7.2.
2. Storage objects do not cascade on account/business deletion; manual runbook step until a sweep exists.
3. A failed old-object removal leaves an invisible orphan; no automated sweep yet.
4. JPEG/PNG validation is header-level (signature + dimensions); the full image is not decoded, so a file with valid headers and corrupt pixel data is accepted and would fail at A3.7.2 normalization.
5. Draft limit (20) counts all rows, since only draft/image_ready exist; later states must revisit what counts.
6. End-to-end call against the deployed function not exercised from the sandbox.
7. Plain sign-in gating; premium/AI quota is not applied (no AI exists yet).

## 38. Deferred Work

- A3.7.2: EXIF stripping/JPEG normalization, photo intelligence, three grounded proposals, AI cap, gating decision.
- A3.7.3: channel adaptation/variants.
- A3.7.4: channel-result table, publishing attempts.
- Meta publishing permissions (`pages_manage_posts`, `instagram_content_publish`): unchanged, external.
- Orphan sweep and account-deletion storage cleanup.
- Final Publications UI and route.

## 39. Exact Next Phase

**A3.7.2 — PHOTO INTELLIGENCE & GROUNDED THREE-PROPOSAL ENGINE.** Recommended only; not started. It must begin by normalizing the stored image (strip metadata, bounded decode within the 40 MP ceiling) before any AI use.

## 40. Final Verdict

**GO — FREEZE A3.7.1 PUBLICATIONS DATA & STORAGE FOUNDATION**
