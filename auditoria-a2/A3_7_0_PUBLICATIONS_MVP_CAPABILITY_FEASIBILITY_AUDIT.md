# A3.7.0 — PUBLICATIONS MVP CAPABILITY & FEASIBILITY AUDIT

Mode: strictly read-only. No implementation, no migrations, no code, permission, bucket, Edge Function, route or legal change was made. The only file written is this report.

Evidence labels used throughout:
- **A** code / database inspected in this project
- **B** dashboard / project state (live DB queries)
- **C** official documentation read during this audit
- **D** requires manual verification in Meta / Google dashboards or a live test
- **E** unknown

---

## 1. Executive Summary

The Publications MVP works like this:
- the user uploads one photo;
- the app produces 3 grounded proposals;
- the user picks one and gets separate Facebook and Instagram variants;
- the user edits, selects channels and publishes through the official API, with truthful per-channel status.

It is **technically feasible** in the current architecture (React + Supabase Edge Functions + OpenAI + existing Meta OAuth). Roughly 40% of what is needed already exists and can be reused with hardening:
- the AI call pattern, the claim validator, the monthly AI usage ledger and the Premium entitlement gate;
- server-side Page-token derivation with `appsecret_proof`;
- the server-owned `page_id` / `instagram_account_id` binding;
- the draft-persistence pattern;
- the tool catalog and routing.

Missing internally (category B, buildable):
- image storage: there are no buckets and no upload code anywhere;
- multimodal AI: every AI call is text-only today;
- a publications data model and state machine;
- Meta write calls: only GET calls exist;
- the UI;
- legal text updates.

Missing externally (category C, Meta):
- the publishing permissions `pages_manage_posts` and `instagram_content_publish` are not requested today;
- App Review and Advanced Access for them;
- these depend on Business Verification, which is under review, and Access Verification afterwards.

Until approval, publishing can only work for users with a role on the app (owner/test business). Google Business Profile publishing is **EXTERNALLY BLOCKED** (API quota 0, evidence from A3.4.2.2) and must ship as "Próximamente" without blocking V1.

**Verdict: CONDITIONAL GO.** The build can proceed in phases. External release to customers is gated on Meta approvals.

---

## 2. Exact MVP Definition

**In scope (V1)**
1. The user opens `/herramientas/publicaciones` (Premium).
2. The user uploads exactly one photo (JPEG/PNG/WebP/HEIC accepted at the input; normalized to JPEG before storage).
3. The server analyzes the image, combines it with safe business context and returns **up to 3** distinct proposals:
   - **A** Directa / comercial;
   - **B** Cercana / natural;
   - **C** Profesional / informativa.

   Fewer than 3 are returned, with an honest explanation, when 3 cannot be produced truthfully.
4. The user selects one proposal.
5. The system produces a **Facebook variant** and an **Instagram variant** of it.
6. The user edits each variant freely (with a non-blocking claim warning).
7. The user selects channels:
   - Facebook Page and Instagram Business, only if connected and authorized for publishing;
   - Google Business Profile, shown as "Próximamente" and disabled.
8. The user confirms, then the server publishes through the official Graph API.
9. Truthful status is shown per channel: Publicado (with link) / Error (reason, retry if safe) / Pendiente de verificar (ambiguous outcome).

**Out of V1 (explicit):** calendar, scheduling, Stories, Reels, carousels, video, multi-image, inbox/DMs/comments, ads/boosting, analytics of published posts, listening, unattended/bulk/auto-publishing, avatars, gamification, GBP posting.

**Non-negotiables**
- Nothing invented: no prices, offers, hours, awards, reviews or claims that are not in safe facts.
- Truthfulness beats returning 3 proposals.
- Partial success is never shown as success.

---

## 3. Current Architecture Inventory

| Area | Current state | Evidence |
|---|---|---|
| Frontend | React + Vite + Tailwind; routes in App.tsx; `/herramientas/*` tool pages; ToolId includes `social` | A |
| Sidebar | Hoy, Plan, Herramientas, Resumen, Mi negocio, Fuentes, Facturación | A |
| Edge Functions | 38 directories, Deno | A |
| Migrations | 49 files locally; 48 rows in `supabase_migrations.schema_migrations` (pre-existing difference, not caused by this audit) | A / B |
| AI provider | OpenAI only, `chat/completions`, `gpt-4o-mini`, secret `LocalSEO_AI`, 20 s timeout, `json_object`, retry on 429/5xx | A |
| AI input modality | Text only; no `image_url` content parts anywhere | A |
| AI ledger | `reserve_ai_usage` / `settle_ai_usage` / `reconcile_ai_usage`, monthly; `ai_usage_cap()` IMMUTABLE, unknown function → cap 0 (fail-closed); global 80 | A / B |
| Entitlement | `requirePremium` (entitlement.ts), `PREMIUM_RATE_LIMIT` 30/hour | A |
| Storage | `storage.buckets` = 0 rows; no `storage.from`, `.upload`, `createSignedUrl` or file inputs in the codebase | A / B |
| Business data | `businesses` (name, category, city, website, phone, schedule, target_audience, services[], goals); all user-entered | A |
| Business memory | Browser-only (localStorage); not trustworthy server-side | A |
| GBP verified profile | `connected_sources.verified_profile` jsonb, written only by gbp-sync | A |
| Meta OAuth | Graph v25.0; scopes `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_basic`; `auth_type=rerequest` | A |
| Meta tokens | User token in Vault (`user_token_ref`); Page token derived per request via `/{page}?fields=access_token`, never persisted; `appsecret_proof`; tokens stripped from logs | A |
| Meta calls | GET only, plus `DELETE /me/permissions` on disconnect | A |
| Meta content cache | `meta_content_items` (read-only mirror) | A |
| Draft pattern | `weekly_content_drafts` with `reservation_id` | A |
| GBP | OAuth scope `business.manage`; API access/quota 0 → `GBP_API_UNAVAILABLE` / `GBP_API_QUOTA` | A |
| Legal | Privacy §3 and Deletion §4 state the Meta integration is read-only: "No publicamos, programamos ni eliminamos contenido" | A |
| Account deletion | No self-service delete-user function; deletion is by email request (admin@localseohub.io) | A |
| Publications | Nothing present: no tables, functions, routes or catalog entry | A / B |

---

## 4. Reusable Components

| Component | Classification | Notes |
|---|---|---|
| `callModel` pattern (timeout, retry, json mode) | REUSABLE WITH HARDENING | Needs multimodal content parts, a longer timeout (vision is slower; ~30 s) and a higher `max_tokens` (3 proposals; ~900) |
| `sanitizeFacts` / `clean` | READY TO REUSE | Same field limits suit publication context |
| `violations()` / FORBIDDEN claim regex | REUSABLE WITH HARDENING | Must also check image-derived claims; add a per-proposal check and a check of user edits (warn, do not block) |
| `parseModelOutput` | REUSABLE WITH HARDENING | Extend to a 3-item array schema plus per-item angle |
| `missingEssentials` | READY TO REUSE | Blocks generation when name/category/city are missing |
| AI usage ledger | READY TO REUSE | Needs a new cap entry (e.g. `publication-proposals`) via migration; until then it fails closed |
| `requirePremium` + rate limit | READY TO REUSE | — |
| Meta Page-token derivation + `appsecret_proof` (meta-read) | REUSABLE WITH HARDENING | Extract into a shared helper, or duplicate into the publish function; must check `granted_permissions` for publish scopes |
| `meta_connections` (page_id, instagram_account_id, granted_permissions) | READY TO REUSE | Server-owned target binding prevents publishing to arbitrary IDs |
| meta-oauth-start scope list | REUSABLE WITH HARDENING | Adding publish scopes requires re-consent (`rerequest` already supported) |
| `weekly_content_drafts` pattern | REUSABLE WITH HARDENING | Model reference only; publications need their own tables |
| Tool catalog / routing / AppShellV2 | READY TO REUSE | Add a `publications` ToolId |
| `meta_content_items` | NOT SUITABLE (for state) | Read mirror; must not be used as publication state |
| Business memory (localStorage) | NOT SUITABLE | Client-controlled; never send as trusted facts |
| Image upload / storage | NOT PRESENT | — |
| Multimodal analysis | NOT PRESENT | — |
| Publish engine / state machine | NOT PRESENT | — |
| GBP posting | NOT PRESENT (externally blocked) | — |

---

## 5. Missing Components

1. A private storage bucket plus storage policies scoped by owner path.
2. Client-side image normalization: resize to ≤1440 px on the long edge, re-encode to JPEG, strip EXIF/GPS.
3. Server-side validation of the uploaded object: magic bytes, size and dimensions.
4. Tables `publications` and `publication_targets` (per-channel state), with RLS, grants and a status check constraint.
5. Edge Function `publication-proposals` (multimodal analysis + 3 proposals + grounding validation + ledger).
6. A deterministic channel adapter (FB/IG), shared by client and server.
7. Edge Function `publication-publish` (server-only Meta writes, idempotent, per-target state).
8. A reconciliation path for ambiguous outcomes, reading recent posts with existing read scopes.
9. Meta publish scopes in OAuth plus an in-app re-consent flow.
10. UI: upload → proposals → variants/editor → channels → confirm → status.
11. Legal updates (Privacy, Deletion, possibly Terms) describing publishing and image processing.
12. An App Review package: screencast, per-permission use-case text, test credentials.
13. Retention job for images (deletion after the defined period).

---

## 6. Image Upload & Storage Audit

**Current state:** no buckets (B), no upload code (A). Image upload is NOT PRESENT.

**Minimum safe architecture (proposal; no bucket was created)**

*Bucket and access*
- Private bucket, e.g. `publication-media`, `public = false`.
- Allowed MIME types: `image/jpeg`; file size limit 8 MB. Instagram's image limit is commonly documented as 8 MB (D: verify in the IG Media reference).
- Object path `{auth.uid()}/{publication_id}/original.jpg`.
- Storage policies on `storage.objects`:
  - INSERT / SELECT / DELETE `TO authenticated` where `bucket_id = 'publication-media' AND (storage.foldername(name))[1] = auth.uid()::text`;
  - **no UPDATE / upsert** (avoids the storage-upsert trap in the security-review catalog).

*Upload path*
- The client normalizes through canvas: decode, resize, re-encode to JPEG at quality 0.85. This strips EXIF/GPS and converts PNG/WebP/HEIC into the only format Instagram accepts (C: "JPEG is the only image format supported").
- HEIC decoding depends on the browser (D). If decoding fails, show a clear message.

*Server verification* (in `publication-proposals`, before any AI cost)
- The object exists under the caller's prefix.
- JPEG magic bytes `FF D8 FF`.
- Size ≤ 8 MB, dimensions within bounds.
- Aspect ratio inside Instagram's accepted range (commonly 4:5 to 1.91:1; D). Outside it, offer an automatic center-crop/pad before upload, or publish to Facebook only.

*Getting the image to each service*
- **To OpenAI:** download server-side with the service role and send as a base64 data URL (`detail: "low"` or `"auto"` at ≤1024 px). No public URL is needed.
- **To Instagram:**
  - Meta fetches the image itself: "We cURL media used in publishing attempts, so the media must be hosted on a publicly accessible server at the time of the attempt" (C).
  - Use a **short-lived signed URL** (TTL 10–15 min), generated server-side only at publish time and never logged or returned to the client.
  - Signed URLs are bearer links, so the exposure window is limited to the TTL.
  - Whether Meta accepts Supabase signed URLs (query-string token, redirect behaviour) is **D, a manual test in phase A3.7.4**.
  - Fallback: a randomized, non-guessable object copy in a separate public bucket, deleted immediately after `status_code=FINISHED`. Riskier; only if signed URLs fail.
- **To Facebook:** `POST /{page_id}/photos` with `url` (C). The Graph API also accepts a multipart `source` upload, which avoids any URL exposure (known from the Graph API Page Photo reference; D, confirm in test). Recommendation: use the same signed URL for both channels for simplicity, with `source` as the hardening option.

**Retention:** delete the original 30 days after the publication reaches a terminal state, or immediately when the user deletes the draft. Meta keeps its own copy once published. See §15.

---

## 7. Multimodal AI Capability

**Today:** text only (A).

**Known:**
- `gpt-4o-mini` accepts image input through `image_url` content parts, including base64 data URLs, on the same `chat/completions` endpoint and with the same key (C/known from OpenAI documentation).
- Not yet exercised in this project, so a live call is D.
- Low-detail image input has a small fixed token cost, so per-call cost stays within the current cost model (see §16).

**Grounding policy: every statement in a proposal must trace to one of these sources.**

| Source class | Definition | May be stated as fact? |
|---|---|---|
| **OBSERVED** | Visible in the image: objects, colours, setting, food/product type, people present (without identity) | Yes, descriptively and without superlatives ("un plato de pasta fresca", not "la mejor pasta de la ciudad") |
| **KNOWN** | Server-loaded safe facts (§8): name, category, city, declared services | Yes |
| **USER-PROVIDED** | An optional short note typed by the user for this photo (≤200 chars, sanitized) | Yes, but quoted or paraphrased faithfully; run through `violations()` against itself so the user may state their own price/offer |
| **INFERRED-UNSAFE** | Anything guessed: brand names, prices, ingredients not visible, location of the photo, identity/age/emotions of people, "new", "today only", quality claims, health claims, before/after results | **Never** |

**Model-output contract:**
- The model must return an `image_observations` array of short descriptive phrases.
- Each proposal may only reference observed elements from that list.
- The server rejects proposals that contain FORBIDDEN claims not present in facts or user note, and proposals that mention people by identity.

**Image safety:**
- If the model reports `unsuitable: true` (no relevant content, explicit content, documents/IDs, screenshots containing personal data, minors as the main subject), return "Esta foto no es adecuada para publicar" and do not generate.
- This is a classification aid, not a guarantee (INFO). The user remains the publisher and must confirm.

**Prompt injection via image:** text inside the image (signs, screenshots) is untrusted. The system prompt must state that text in the image is content to describe, never instructions. Output validation (schema + FORBIDDEN + length) is the real control.

---

## 8. Business Context Grounding Audit

| Field / source | Classification | Rule |
|---|---|---|
| `businesses.name` | SAFE FACT | User-declared identity of their own business |
| `businesses.category` | SAFE FACT | — |
| `businesses.city` | SAFE FACT | Use as "en {city}"; never invent a neighbourhood |
| `businesses.services[]` | SAFE FACT | Only the declared items, capped (as `sanitizeFacts` already does) |
| `businesses.target_audience` | CONTEXT ONLY | Shapes tone; do not state ("ideal para familias" only if declared literally as a service) |
| `businesses.primary_goal` / `secondary_goals` | CONTEXT ONLY | Shapes the CTA type; never stated |
| `businesses.website` | SAFE WITH CONDITION | Facebook variant only, as a plain link, validated `https://`. Not in Instagram (links are not clickable in captions) |
| `businesses.phone` | SAFE WITH CONDITION | Only if the user ticks "incluir teléfono"; the default is off (spam/PII exposure) |
| `businesses.schedule` | DO NOT USE (V1) | Free text, may be stale; FORBIDDEN already blocks hours claims |
| `connected_sources.verified_profile` (GBP) | SAFE WITH CONDITION | Server-verified, but GBP is blocked; use only when present and fresh. Not required for V1 |
| Business memory (localStorage) | DO NOT USE | Client-controlled |
| `meta_content_items` (past posts) | CONTEXT ONLY (optional, later) | Tone reference; never copy claims from past posts as facts |
| Reviews / ratings | DO NOT USE | FORBIDDEN already blocks review/star claims |
| Prices / offers / discounts | DO NOT USE unless in the USER-PROVIDED note | — |

The server must load facts itself from `businesses` by `auth.uid()`. It must not accept facts from the request body, except the optional user note.

---

## 9. Three-Proposal Generation Design

**Decision:** use **fixed angles**. This gives a stable UI, testable distinctness and predictable App Review demos.

| Slot | Angle | Intent | CTA |
|---|---|---|---|
| A | Directa / comercial | Highlights the declared service shown in the photo | Visit / contact (generic, no offer) |
| B | Cercana / natural | Human, behind-the-scenes tone describing what is seen | Soft (e.g. "Te esperamos") |
| C | Profesional / informativa | Explains the service or process with neutral expertise, no superlatives | Learn more / ask |

**Contract (single AI call)**
- Input: system rules, safe facts, optional user note, image.
- Output JSON:

  ```
  { unsuitable: bool, reason?: string,
    image_observations: string[≤8],
    proposals: [{ angle: "A"|"B"|"C", text: string(80–600), hashtags: string[≤5] }] }
  ```

**Server validation, per proposal**
- Schema and length checks.
- `violations(text, facts ∪ userNote)` must be empty.
- No identity, age or emotion statements about people.
- No URL or phone unless injected later by the deterministic adapter.

**Distinctness**
- Token-set Jaccard similarity < 0.6 between any two proposals.
- The opening sentences must differ.
- A near-duplicate is dropped.

**Retries and the truth rule**
- At most **one** retry for the whole call if fewer than 2 proposals survive. The retry is a second reservation within the cap, or one reservation covering both attempts (decide in A3.7.2; recommended: one reservation, internal retry).
- Return the 1–3 valid proposals with an honest banner: "Solo hemos podido crear 2 propuestas fiables con esta foto."
- With 0 valid proposals: "No hemos podido crear propuestas fiables. Prueba con otra foto o añade una nota." The reservation is released when the provider fails; it is settled when the model ran (consistent with existing tools).
- Never pad with generic filler.

**Regeneration:** "Generar de nuevo" consumes one more unit. A cap of 3 generations per publication is recommended.

---

## 10. Channel Adaptation Design

**Recommendation: deterministic in V1 (no extra AI cost, testable). A hybrid version is possible later.**

| Rule | Facebook | Instagram |
|---|---|---|
| Length | Base text (≤600) | Caption ≤ 2,200 chars (KNOWN; D verify) |
| Hashtags | 0–3, appended at the end | Up to 5 (Instagram allows 30, but 3–5 is the current best practice), on a separate block |
| Website | Appended as a plain link if present and opted in | Removed; optionally "Más info en el enlace del perfil" |
| Phone | Only if opted in | Only if opted in |
| Line breaks | Kept | Kept; collapse 3+ blank lines |
| Mentions / @ | Stripped from AI output | Stripped from AI output |
| Emojis | Only if the AI used them (at most 2, enforced by the validator) | Same |

**Editing:** the user edits each variant independently after adaptation. Client and server recompute the claim warning (`violations` against facts + note). It warns but does not block: the user is the publisher and may legitimately type their own price.

**Server publish limits:** IG ≤ 2,200, FB ≤ 5,000 (product limit), and no control characters.

---

## 11. Meta Publishing Capability & Permission Matrix

### 11.1 Endpoints (C, read this audit)

**Facebook Page photo:** `POST /{page_id}/photos` with `url` (or multipart `source`, D) and `message` (caption). Page access token. Returns `{ id, post_id }`. Permalink `https://www.facebook.com/{post_id}` (C).

**Instagram image:**
1. `POST /{ig_id}/media` with `image_url` and `caption` (optional `alt_text`, `is_ai_generated`). Returns the container id.
2. Optionally `GET /{container_id}?fields=status_code` until `FINISHED`.
3. `POST /{ig_id}/media_publish` with `creation_id`. Returns the media id.
4. Then `GET /{media_id}?fields=permalink` (read).

All calls use `graph.facebook.com` with the Page access token, through "Instagram API with Facebook Login" (C).

**Instagram constraints (C):**
- the image must be on a public server at the time of the attempt;
- JPEG only;
- 100 API-published posts per 24 h moving window, enforced at `media_publish`;
- usage can be checked with `GET /{ig_id}/content_publishing_limit`.

The same page also says "50" in the carousel section. Inconsistent; carousels are out of scope, so design for the lower figure if in doubt (D).

**Page Publishing Authorization (PPA), C:**
- an Instagram account connected to a Page that requires PPA cannot be published to until PPA is completed;
- there is no API to detect it in advance;
- Meta recommends advising users to complete PPA preemptively.

UX copy plus an error mapping are needed.

**AI disclosure, C:** `is_ai_generated=true` exists on container creation. Policy decision (D / legal):
- the photo is the user's own;
- only the caption is AI-assisted and the user edited and approved it.

Recommended default: do not set it for caption-only assistance. Revisit with legal.

**Graph version:** the code uses v25.0; the docs show v26.0 examples. v25.0 is acceptable while supported (D: check the deprecation date).

### 11.2 Permission matrix

| Permission | Present today | Needed for V1 | Purpose | Evidence |
|---|---|---|---|---|
| `pages_show_list` | Yes | Yes | List/select the Page | A, C |
| `pages_read_engagement` | Yes | Yes | Required by both FB posting and IG publishing (Facebook Login) | A, C |
| `business_management` | Yes | Conditional | Already flagged as a justification risk in A3.5.5.2; keep only if needed for business-owned Pages | A, D |
| `instagram_basic` | Yes | Yes | IG publishing prerequisite | A, C |
| `pages_manage_posts` | **No** | **Yes** | Create Page posts/photos | C |
| `instagram_content_publish` | **No** | **Yes** | IG container + publish | C |
| `pages_manage_engagement`, `pages_read_user_engagement` | No | **D** | Listed in the Pages "Posts" guide prerequisites (which also covers comments/replies). Whether they are required for photo publish alone must be verified; request them only if required (unneeded permissions cause rejection) | C, D |
| `ads_management`, `ads_read` | No | **Conditional (D)** | IG docs: required "if the app user was granted a role on the Page via the Business Manager". Material: requesting ads permissions for a non-ads product is a review risk; options are to document the limitation or request them with a justification | C, D |
| `pages_read_user_content` | No | D | A3.5.5.2 noted an `instagram_basic` dependency; not required for publishing per the docs read | D |
| `publish_video` | No | No | Video is out of scope | C |

### 11.3 Access, review and tokens

**Access status (C/user-provided)**
- Standard Access lets role holders (owner/testers) use the permissions with no App Review. This is how the owner/test business can publish in development.
- Advanced Access (needed for external customers) requires App Review, which requires Business Verification (C, from A3.5.5.2).
- Current status (user-provided): BV under review, Access Verification next, App Review pending, app not public.
- **External customers cannot publish yet, and this report does not claim they can.**

**Technology Provider**
- LocalSEOHub is identified as a Technology Provider (user-provided). This is relevant to Access Verification (C/E for exact implications).
- It does not by itself grant publishing permissions (D).

**Tokens**
- Reuse the Vault-held user token.
- Derive the Page token per request server-side (A), with `appsecret_proof`.
- Never return tokens to the client; never log URLs with tokens.

**Pre-publish permission check:** `granted_permissions` must include the publish scopes. Otherwise return the `PUBLISH_PERMISSION_MISSING` reason and prompt re-consent via meta-oauth-start (`rerequest`).

**Target binding:** the publish function takes `publication_id` only. `page_id` and `ig_id` come from `meta_connections` for `auth.uid()`, never from the request.

### 11.4 Idempotency, duplicates, rate limits

Meta offers **no idempotency key** for `/photos` or `/media_publish` (E: none found in the docs read). Duplicate prevention must therefore be on our side:
- an atomic DB transition `ready → publishing` (conditional UPDATE, one winner);
- a unique `(publication_id, channel)` target row;
- no automatic retry after an ambiguous POST failure (timeout / 5xx after send). Mark the target `unknown` and run reconciliation (§13).

**Instagram two-step safety:**
- persist `container_id` before calling `media_publish`;
- a retry reuses the same container (containers expire after about 24 h; D);
- never create a second container while one is pending.

**Rate limits:**
- Meta: IG 100 per 24 h (C); Graph app/user call limits (BUC) apply (C/D).
- App-side caps: §16.

---

## 12. Google Business Profile Status

**Status: EXTERNALLY BLOCKED.**
- Evidence A3.4.2.2: GBP API access is not granted, quota 0, every call returns 429, mapped to `GBP_API_QUOTA` / `GBP_API_UNAVAILABLE`.
- The OAuth scope `business.manage` already exists (A). It would cover local posts once API access is approved (D).
- The GBP posts API (`localPosts`) also has its own media requirements (D/E).

**V1 behaviour:**
- the channel is shown with a "Próximamente" badge, disabled, not selectable;
- no GBP code paths in publish;
- it never blocks Facebook/Instagram.

---

## 13. Publication State Machine

**Publication (parent):**
`draft` (image uploaded) → `proposals_ready` → `selected` → `ready` (variants confirmed, channels chosen) → `publishing` → one terminal aggregate:
- `published`: all selected targets published;
- `partially_published`: at least one published and at least one failed or unknown;
- `failed`: none published;
- `needs_verification`: none confirmed, at least one unknown.

Plus `discarded` (user deleted).

**Target (per channel, `publication_targets`):**

```
pending → submitting → (IG only) container_created → published
                    ↘ failed_retryable  (network before send, 429, transient 5xx before container creation, PPA/permission fixed later)
                    ↘ failed_terminal   (invalid image, policy rejection, permission revoked, disconnected)
                    ↘ unknown           (timeout/5xx after POST sent; outcome not known)
unknown → published | failed_retryable   (only via reconciliation)
```

**Rules**
- Partial success is **never** displayed as success. The UI lists each channel with its own badge.
- Atomic claim: `UPDATE publication_targets SET status='submitting', attempt=attempt+1 WHERE id=$1 AND status IN ('pending','failed_retryable') RETURNING *`. Zero rows means another request owns it, so return the current status.
- Retry is manual only (user button), allowed only from `failed_retryable`. The cap is 3 attempts per target.
- **Reconciliation for `unknown`:** read recent posts with existing read scopes:
  - FB: `GET /{page_id}/published_posts` or `/feed`, created after the attempt start;
  - IG: `GET /{ig_id}/media`.

  Match on caption prefix and timestamp. If found, mark `published` with its permalink; if not found after 10 minutes, mark `failed_retryable`.
- Persisted per target: channel, status, attempt count, `external_container_id`, `external_post_id`, permalink, last error code (mapped, never raw), timestamps.
- Persisted per publication: `user_id`, `business_id`, image path, the selected proposal, the final variant texts, `reservation_id`, status.
- Server-owned columns are status, external ids, permalink and attempt. Use column-level grants (secure-data-access pattern): the client may update only the variant texts, channel selection and selected proposal while the status is ≤ `ready`. All publish transitions happen through the Edge Function using the service role.

---

## 14. Security Threat Model

| # | Threat | Severity | Mitigation |
|---|---|---|---|
| T1 | Publishing to a Page/IG account the user does not own, by passing arbitrary ids | BLOCKER (if unmitigated) | Targets derived only from `meta_connections` by `auth.uid()`; the request carries only `publication_id` |
| T2 | Client sets `status='published'` or a fake permalink | HIGH | Column-level grants; status columns writable only by the service role |
| T3 | Duplicate posts from double-click, concurrent tabs or retry storms | HIGH | Atomic conditional transition, unique target per channel, no auto-retry on ambiguous results |
| T4 | Image exfiltration through a public or leaked URL | HIGH | Private bucket; short-TTL signed URL generated only server-side; never logged; fallback public copy deleted immediately |
| T5 | Cross-tenant image read/write in storage | HIGH | Path-prefix policies on `auth.uid()`, no UPDATE/upsert policy, server verifies the prefix |
| T6 | Malicious file (polyglot, huge, decompression bomb) | MEDIUM | Client re-encode, MIME allowlist, 8 MB limit, magic-byte check, dimension bounds |
| T7 | Prompt injection through text in the image or the user note | MEDIUM | Untrusted-content instruction, strict JSON schema, FORBIDDEN validator, the user reviews before publishing |
| T8 | Hallucinated claims (prices, awards, reviews) | HIGH | Grounding policy (§7/§8), server validation, honest fewer-than-3 path |
| T9 | Token leakage (user/Page token) | HIGH | Vault, per-request derivation, `appsecret_proof`, log redaction (already in meta-read) |
| T10 | AI cost abuse | MEDIUM | Ledger cap per function plus global 80, Premium gate, 30/h rate limit, regeneration cap |
| T11 | Publishing spam / platform abuse leading to Meta app restriction | HIGH | Daily publish cap per user, mandatory explicit confirm, no bulk or unattended publishing |
| T12 | Using the app for illegal or explicit content | MEDIUM | AI `unsuitable` flag, the user remains the publisher (Terms), reporting contact |
| T13 | Personal data in photos (faces, minors, documents) | MEDIUM | EXIF stripped, an unsuitable-content heuristic, a user acknowledgement checkbox for people in the photo (consent responsibility), retention limits |
| T14 | Error-message information leaks | LOW | Mapped generic error codes (existing pattern) |
| T15 | Stale permissions after the user revokes in Meta | MEDIUM | Pre-publish permission check; map Graph 190/200 to `failed_terminal` with reconnect CTA |
| T16 | SECURITY DEFINER helpers callable by anon | MEDIUM | REVOKE from PUBLIC/anon on any new function (existing pattern) |
| T17 | Legal mismatch: Privacy states "no publicamos" | HIGH (release) | Legal update phase before external release; disclosed in App Review |

---

## 15. Privacy / Retention / Deletion

**Data processed**
- The photo is sent to OpenAI for analysis (a processor; legal text must disclose image processing by an AI provider).
- Captions are stored.
- Meta post ids and permalinks are stored.

**Retention (proposal)**
- Original image: deleted 30 days after a terminal state, or immediately on discard. A scheduled cleanup is needed (pg_cron or an Edge Function, D on availability).
- Publication text and status: kept while the account exists (user history); user-deletable.
- Meta-side posts: owned by the user on Meta. Deleting the publication in our app does **not** delete the post on Facebook/Instagram (state this explicitly; no delete-on-Meta in V1).

**Deletion**
- Account deletion is by email request today (A). The deletion runbook must add publication rows and storage objects (storage objects do not cascade from table deletes, so they need explicit removal).
- Meta disconnect keeps publication history but blocks new publishes.

**Legal changes required before external release** (not in this phase):
- Privacy §3: publishing on behalf of the user, image processing, OpenAI;
- Deletion §4: images, publication records, and that posts remain on Meta;
- Terms: the user is responsible for content and rights/consent for people shown.

---

## 16. Cost / Abuse / Limits

| Limit | Proposed value | Mechanism |
|---|---|---|
| Proposal generations | 20 / month (`publication-proposals` cap), inside global 80 | Ledger; new cap entry by migration (unknown → 0 until then) |
| Regenerations per publication | 3 | Server count on the publication |
| Publishes per user | 5 / day, 60 / month | Server count over `publication_targets` |
| Image size | ≤ 8 MB after normalization; ≤ 1440 px | Bucket limit + server check |
| Drafts in progress | ≤ 10 non-terminal | Server check on insert |
| Premium | Required | `requirePremium` |
| Rate | 30 / hour (existing) | `requirePremium` |
| AI call | 1 vision call (+ at most 1 internal retry), `max_tokens` ≈ 900, timeout ≈ 30 s | callModel hardening |

**Estimated AI cost:** one low/auto-detail image plus about 600 prompt tokens and about 900 output tokens on gpt-4o-mini. This is a fraction of a US cent per generation (KNOWN pricing class; D for exact current pricing). It is negligible against the subscription.

Channel adaptation is deterministic, so it adds no AI cost.

---

## 17. UX Flow

**Placement**
- Route `/herramientas/publicaciones`.
- New Tools catalog card "Publicaciones" (`ToolId 'publications'`).
- **No sidebar entry in V1.** The sidebar holds sections, and tools live under Herramientas, consistent with the 9 existing tools.

**Relationships**
- **Social Intelligence:** a "Crear publicación" CTA on the social page. Published posts later appear there through the existing read sync (no new analytics).
- **Hoy:** an optional future tip "Publica una foto esta semana" linking to the tool. Not V1-blocking.
- **Tu semana / weekly-content:** separate. Weekly content is text-only ideas. A later link ("usar esta idea con una foto") is a future option, not V1.

**Steps and clicks (happy path)**
1. Open the tool from the Herramientas card (1).
2. Choose a photo (2), with an optional note.
3. "Crear propuestas" (3); about 10–20 s with a progress state.
4. Pick a proposal card (4).
5. Review the FB/IG variants in tabs; editing is optional (0–n).
6. Channels are preselected when connected and authorized (toggle optional).
7. "Publicar" (5), then confirm in a dialog summarizing channels (6).
8. Status screen with per-channel results and permalinks.

That is about **6 clicks**, plus optional edits.

**States to design**
- business profile incomplete (link to Mi negocio);
- Meta not connected (link to Fuentes);
- connected but publish permission missing ("Autorizar publicación", re-consent);
- app not approved for this user (copy: "La publicación directa estará disponible pronto");
- GBP "Próximamente";
- cap reached;
- fewer than 3 proposals.

Bilingual: the existing AI functions support es/en (`Lang`), so copy should follow the same pattern.

---

## 18. Failure & Edge-Case Matrix

| # | Case | Behaviour | Message (es, summary) | Retry | Data retained | Security |
|---|---|---|---|---|---|---|
| 1 | Not Premium | Block before upload | "Disponible en Premium" | No | None | Server gate |
| 2 | Business profile incomplete | Block generation | "Completa nombre, actividad y ciudad" | After fixing | Image draft | No AI cost |
| 3 | Unsupported or undecodable file | Reject on client | "No podemos leer esta imagen" | Yes, new file | None | — |
| 4 | File > limit after resize | Reject | "La imagen es demasiado grande" | Yes | None | Bucket limit |
| 5 | Upload network failure | Retry upload | "No se pudo subir" | Yes | None | — |
| 6 | Object outside the caller's prefix / missing | 403/404 generic | "No encontramos la imagen" | No | None | Prefix check |
| 7 | Bad magic bytes | Reject; delete object | "Formato no válido" | Yes | Object deleted | Polyglot guard |
| 8 | Unsuitable image (AI flag) | No proposals | "Esta foto no es adecuada para publicar" | New photo | Image (until cleanup) | Settled usage |
| 9 | AI cap reached | Block | "Has alcanzado el límite mensual" | Next month | Draft | Ledger |
| 10 | AI timeout / 5xx | Release reservation | "No se pudieron crear propuestas, inténtalo de nuevo" | Yes | Draft | No charge |
| 11 | Malformed AI output | 1 internal retry, then error | Same as #10 | Yes | Draft | Schema |
| 12 | Only 1–2 valid proposals | Return them | "Solo hemos podido crear N propuestas fiables" | Regenerate (counted) | Proposals | Truth rule |
| 13 | 0 valid proposals (claims) | None | "No hemos podido crear propuestas fiables" | Yes | Draft | Validator |
| 14 | User edit adds a price/offer | Warn, allow | "Revisa: incluye datos que no constan en tu perfil" | — | Edited text | The user is the publisher |
| 15 | Meta not connected | Channels disabled | "Conecta Facebook/Instagram en Fuentes" | After connecting | Draft | — |
| 16 | Publish permission not granted | Channel disabled + CTA | "Autoriza la publicación" | After re-consent | Draft | Scope check |
| 17 | App not approved (non-role user) | Channel disabled | "Publicación directa disponible próximamente" | No | Draft | No false claim |
| 18 | No IG business account linked | IG disabled | "Vincula una cuenta profesional de Instagram a tu página" | After linking | Draft | — |
| 19 | Aspect ratio outside the IG range | IG disabled or crop offered | "Recorta la imagen para Instagram" | Yes | Draft | — |
| 20 | Double-click / concurrent publish | Second request gets the current status | — | — | Single target | Atomic claim |
| 21 | Token expired/revoked (Graph 190) | Target `failed_terminal` | "Vuelve a conectar Meta" | After reconnect (target reset to retryable) | Variant texts | No token leak |
| 22 | PPA required | `failed_terminal` until resolved | "Completa la autorización de publicación de la página en Meta" | After PPA | Draft | — |
| 23 | Meta fails to fetch the image (signed URL expired/blocked) | `failed_retryable`; new URL on retry | "Instagram no pudo obtener la imagen" | Yes | Container none | Fresh short URL |
| 24 | IG container ERROR status | `failed_terminal` | "Instagram rechazó la imagen" | New image | Error code | — |
| 25 | IG 24 h publishing limit | `failed_retryable` | "Límite diario de Instagram alcanzado" | Later | Container id | — |
| 26 | Timeout after POST (ambiguous) | `unknown`, then reconcile | "Comprobando si se publicó…" | Only after reconciliation | Attempt timestamp | No duplicate |
| 27 | FB ok, IG failed | `partially_published` | "Publicado en Facebook. Instagram: error" | IG only | FB permalink | Not shown as success |
| 28 | Meta 429 / 5xx before send | `failed_retryable` | "Meta no está disponible ahora" | Yes (backoff) | Draft | — |
| 29 | Content policy rejection by Meta | `failed_terminal` | "Meta no permitió esta publicación" | Edit and retry as a new attempt | Error code | Mapped message |
| 30 | GBP selected (impossible) | Server rejects | — | No | — | Server allowlist of channels |
| 31 | Meta disconnected mid-flow | Pending targets fail terminally | "Conexión con Meta eliminada" | After reconnect | History | — |
| 32 | User deletes the draft | Image deleted; rows discarded | "Borrador eliminado" | — | None | Storage delete |

---

## 19. Test Strategy

**Unit (Vitest, Deno-compatible pure modules like weekly-content/logic.ts)**
- grounding validator: FORBIDDEN per class, user-note allowance, people-identity rule;
- 3-proposal parser: schema, angle uniqueness, length, Jaccard distinctness, the 1–2 and 0 cases;
- deterministic adapter: IG link removal, hashtag caps, length caps, phone/website opt-in;
- state-machine transition table: allowed/forbidden transitions and aggregate status computation, including partial;
- Graph error mapping: 190, 200, 10, PPA, 4/17/32/613 rate limits, 9007/36003 (D for exact IG codes), timeout → `unknown`.

**Handler (mocked fetch, existing handler-test pattern)**
- `publication-proposals`:
  - unauthenticated, not Premium, cap reached, incomplete profile, wrong prefix, bad magic bytes;
  - AI timeout releases the reservation, success settles it;
  - the request-body facts are ignored.
- `publication-publish`:
  - only the publication id is accepted, targets come from `meta_connections`;
  - missing scope;
  - FB success; IG container then publish; IG container-reuse retry;
  - atomic claim conflict;
  - ambiguous timeout → `unknown`; reconciliation found / not found;
  - partial success;
  - GBP is rejected;
  - no token appears in logs or responses.

**Database**
- RLS: user A cannot read or write user B's publications or targets;
- column grants block client status writes;
- storage policies: cross-prefix denied, no upsert;
- cap function returns the new value; unknown is still 0.

**UI**
- All states in §17 render;
- partial success is never shown with a success-only style;
- GBP is disabled;
- the confirm dialog is required.

**Manual (D)**
- the owner account publishes one FB photo and one IG image in development mode;
- a signed-URL fetch by Meta;
- PPA behaviour;
- permalink retrieval;
- deletion and retention cleanup.

**Non-regression**
- full suite (2255 baseline) plus pinned legal hashes;
- Meta read handlers unchanged until the scope phase (hash pins).

---

## 20. Architecture Options Comparison

| Criterion | **A. Monolithic function** (upload + AI + publish in one Edge Function call) | **B. Staged server pipeline** (private storage → `publication-proposals` → client edit → `publication-publish`, DB state machine) | **C. Client-heavy** (public bucket, browser calls Meta through the JS SDK) |
|---|---|---|---|
| Matches the MVP flow (user picks/edits between steps) | Poor: the flow is inherently multi-step | Yes | Yes |
| Token safety | Good | Good (tokens stay server-side, existing pattern) | **Poor**: Page token in the browser |
| Image privacy | Medium | Good (private + short signed URL) | **Poor**: public images |
| Idempotency / truthful status | Hard (long request, timeouts) | Good (persisted per-target state, atomic claims) | Poor (no server truth) |
| Reuse of existing code | Medium | High (ledger, entitlement, meta-read token pattern, draft pattern) | Low |
| Edge Function timeouts | Risky (vision + 2–3 Graph calls + IG polling) | Each step is bounded | n/a |
| App Review story | OK | Clear: server-side, user-initiated, explicit confirm | Weak |
| Complexity | Low code, high fragility | Medium | Low code, high risk |

**Recommendation: Option B.**

---

## 21. Recommended MVP Architecture

1. **Storage:** private bucket `publication-media` with owner-prefix policies (INSERT/SELECT/DELETE only). The client normalizes the image to JPEG ≤1440 px and strips EXIF.
2. **Data:**
   - `publications`: id, user_id, business_id, image_path, user_note, proposals jsonb, selected_angle, fb_text, ig_text, channels text[], status, reservation_id, generation_count, timestamps;
   - `publication_targets`: id, publication_id, user_id, channel check in ('facebook','instagram'), status, attempt, container_id, external_post_id, permalink, error_code, attempted_at, timestamps; unique (publication_id, channel).

   Both tables have RLS with 4 policies each, minimal grants and column-level update grants. Server-owned columns are service-role only.
3. **`publication-proposals` Edge Function** (verify_jwt true):
   - Premium, then ledger reserve, then load facts server-side;
   - verify the object, then send it as a base64 vision call;
   - validate and dedupe, persist the proposals, then settle or release.
4. **Deterministic adapter:** a shared pure module used by the UI preview and re-applied server-side at publish time for limits.
5. **`publication-publish` Edge Function** (verify_jwt true):
   - Premium, then load the publication, then resolve targets from `meta_connections`;
   - scope check, then per target: atomic claim, then the Graph call;
   - FB: `/photos` with url = signed URL (10–15 min);
   - IG: `/media`, persist the container, check `status_code`, then `/media_publish`, then read the permalink;
   - map errors and compute the aggregate.

   Sequential per channel: FB first, then IG. The order is independent, so a failure in one does not stop the other.
6. **Reconciliation:** triggered from the status screen ("Comprobar") or by the publish function on the next load. It uses read scopes only.
7. **Meta OAuth:** add `pages_manage_posts` and `instagram_content_publish` (plus whatever D-verification proves strictly required) to `META_SCOPES`, with a re-consent CTA. The meta-read behaviour stays unchanged.
8. **GBP:** UI badge only.
9. **Cleanup:** a scheduled image-retention job.

---

## 22. Gap Classification

| Gap | Class | Severity |
|---|---|---|
| Reuse ledger, entitlement, validator, token pattern, catalog | A READY | — |
| Private bucket + storage policies | B INTERNAL DEV | HIGH |
| Client image normalization + server verification | B INTERNAL DEV | HIGH |
| Multimodal `callModel` + live vision verification | B INTERNAL DEV (live call D) | HIGH |
| Grounding validator extensions (people, observations) | B INTERNAL DEV | HIGH |
| 3-proposal contract + distinctness | B INTERNAL DEV | MEDIUM |
| Deterministic channel adapter | B INTERNAL DEV | MEDIUM |
| Publications tables, RLS, column grants, cap entry | B INTERNAL DEV | HIGH |
| Publish function + state machine + reconciliation | B INTERNAL DEV | BLOCKER (for publishing) |
| UI flow + states | B INTERNAL DEV | HIGH |
| Image retention job | B INTERNAL DEV | MEDIUM |
| Legal text updates (Privacy/Deletion/Terms) | B INTERNAL DEV (release gate) | HIGH |
| `pages_manage_posts` / `instagram_content_publish` Advanced Access | C EXTERNAL META | BLOCKER (external customers) |
| Business Verification (under review) → Access Verification | C EXTERNAL META | BLOCKER (external customers) |
| App Review submission + approval | C EXTERNAL META | BLOCKER (external customers) |
| Exact minimal permission set (engagement perms, ads perms for Business-Manager roles) | C EXTERNAL META / F UNKNOWN | HIGH |
| Meta acceptance of Supabase signed URLs | F UNKNOWN (D test) | HIGH |
| PPA prevalence for target customers | F UNKNOWN | MEDIUM |
| Graph v25 deprecation timeline | F UNKNOWN | LOW |
| GBP API access/quota | D EXTERNAL GOOGLE | LOW for V1 (non-blocking) |
| Scheduling, Stories, Reels, carousel, video, analytics, GBP posts | E FUTURE | — |

---

## 23. External Blockers

1. **Meta Business Verification:** under review (user-provided). Prerequisite for Advanced Access (C).
2. **Meta Access Verification** as a Technology Provider: expected after BV (user-provided).
3. **App Review** for `pages_manage_posts` and `instagram_content_publish` (and any additional proven-required permission). It needs a working screencast, which needs phases A3.7.1–A3.7.4 done on the owner account first.
4. **Business-Manager role case:** the `ads_management`/`ads_read` requirement (C) needs a product decision.
5. **Page Publishing Authorization** for individual customer Pages: per customer, outside our control.
6. **Google Business Profile API access:** quota 0 (A3.4.2.2). Non-blocking for V1.

Until items 1–3 clear, publishing is available **only to app-role users** (owner/test business). External customers can use the proposal and editing flow (copy to clipboard) but cannot publish directly. The UI must say so truthfully.

---

## 24. Proposed Implementation Phases

### A3.7.1: Data & Storage Foundation
- **Objective:** a secure persistence layer for publications and images.
- **Scope:**
  - migration: `publications`, `publication_targets`, RLS (4 policies each), grants, column-level update grants, status check constraints;
  - private bucket `publication-media` with owner-prefix INSERT/SELECT/DELETE policies;
  - `ai_usage_cap('publication-proposals') = 20`;
  - typed repository (client).
- **Forbidden:** AI, Meta, UI routes, legal pages, scope changes.
- **Files:** 1–2 migrations, the repository module, tests.
- **Tests:** RLS cross-tenant, column-grant denial, storage cross-prefix and upsert denial, cap values (existing caps unchanged).
- **Freeze:** all existing Meta handlers (hash pins), legal pages.
- **Dependencies:** none.
- **External blockers:** none.

### A3.7.2: Image Analysis & Three Proposals
- **Objective:** the `publication-proposals` Edge Function with the grounding policy.
- **Scope:**
  - multimodal callModel variant;
  - server object verification;
  - safe facts loaded server-side;
  - extended validator; 3-angle parser + distinctness; truth rule (1–3 proposals);
  - ledger reserve/settle/release;
  - `config.toml` entry.
- **Forbidden:** Meta writes, scopes, UI beyond a dev harness, legal.
- **Files:** a new function dir (index/logic/handler + tests); reuses entitlement/ledger.
- **Migrations:** none (cap from A3.7.1).
- **Tests:** §19 unit + handler; one live owner vision call (D).
- **Freeze:** weekly-content and the other AI functions unchanged.
- **Dependencies:** A3.7.1.
- **External blockers:** none.

### A3.7.3: Publications UI (drafts, no publishing)
- **Objective:** the full user flow up to "ready", plus copy-to-clipboard.
- **Scope:**
  - route `/herramientas/publicaciones`, catalog card;
  - upload + client normalization; proposal cards; deterministic FB/IG adapter + editor;
  - channel selector (FB/IG disabled with an honest reason; GBP "Próximamente");
  - draft list/discard (with image delete);
  - Social Intelligence CTA.
- **Forbidden:** Publish button wiring, Meta scopes, legal.
- **Files:** a feature folder, catalog, App route, adapter module + tests.
- **Migrations:** none.
- **Tests:** UI states, adapter unit tests, no publish call present.
- **Freeze:** Meta handlers, legal.
- **Dependencies:** A3.7.1–2.
- **External blockers:** none. This is shippable value even before Meta approval.

### A3.7.4: Meta Publish Engine (owner/test only)
- **Objective:** server-side FB photo + IG image publishing with a truthful state machine.
- **Scope:**
  - add the minimal publish scopes to meta-oauth-start + re-consent CTA;
  - `publication-publish` function: target binding, scope check, atomic claims, FB `/photos`, IG container/status/publish, permalink, error mapping, `unknown` + reconciliation;
  - publish caps; confirm dialog; status screen.
- **Forbidden:** scheduling, video, carousel, GBP, auto-retry on ambiguous results, delete-on-Meta.
- **Files:** a new function dir, meta-oauth-start scope list (a controlled hash-pin update), UI status components, tests.
- **Migrations:** none expected (tables from A3.7.1), unless a column is missed.
- **Tests:** §19 publish handler suite; manual D tests (signed URL fetch, owner FB + IG publish, PPA, revoke).
- **Freeze:** meta-read, meta-connection, meta-oauth-callback behaviour.
- **Dependencies:** A3.7.1–3; pre-phase D verification of the minimal permission set.
- **External blockers:** none for role users. External users remain blocked (C).

### A3.7.5: Legal, Retention & App Review Readiness
- **Objective:** release gate.
- **Scope:**
  - Privacy §3 / Deletion §4 / Terms updates (publishing, image processing by AI provider, retention, posts remain on Meta);
  - image retention job;
  - deletion runbook update;
  - App Review package (per-permission use case, screencast script, test user);
  - update the A3.5.5.2 readiness report.
- **Forbidden:** new features.
- **Files:** legal pages + pins, a cleanup job, an audit doc.
- **Migrations:** possibly a cron schedule.
- **Tests:** legal pin updates, retention unit tests.
- **Freeze:** publication logic.
- **Dependencies:** A3.7.4.
- **External blockers:** BV → Access Verification → App Review submission.

### A3.7.6: External Enablement (after Meta approval)
- **Objective:** enable publishing for customers.
- **Scope:** remove the "disponible próximamente" gating copy; monitoring; caps review.
- **Dependencies:** Meta Advanced Access approval.
- **External blockers:** C (Meta).

GBP posting is a separate future track (E/D), started only when Google API access is approved.

---

## 25. Baseline / Hash / Non-Regression Evidence

| Check | Before | After |
|---|---|---|
| Files hashed (supabase/, src/, index.html, package.json, public/) | 430 | 430 |
| Hash diff | — | **IDENTICAL** (no differences) |
| Pre-manifest digest (prefix) | `351c00f56fe7ab52` | — |
| Migration files | 49 | 49 |
| Applied migration rows (DB) | 48 | 48 |
| Edge Function directories | 38 | 38 |
| Storage buckets (DB) | 0 | 0 |
| Public tables matching `%publica%` | 0 | 0 |
| meta-oauth-start handler | `e21d60a5` | `e21d60a5` |
| meta-oauth-callback handler | `89ff215b` | `89ff215b` |
| meta-connection handler | `57e8341f` | `57e8341f` |
| meta-read handler | `987cc94b` | `987cc94b` |
| Meta scopes | 4 read scopes | unchanged |
| Tests (baseline) | 63 files, 2255/2255 pass | not re-run (no code changed; hash-identical) |
| tsc | 20 legacy errors | unchanged (no code changed) |
| Build | PASS | PASS (re-run after writing this report) |

The temporary hash manifests were kept outside the project (`/tmp/a370/`). No temporary artifacts exist inside the project. The only new file is this report.

---

## 26. Exact Next Step

1. Owner action (manual, D), before A3.7.4 and can be done in parallel:
   - in the Meta App Dashboard, confirm the minimal permission set for "photo post to Page" and "IG image publish" with Facebook Login: `pages_manage_posts`, `instagram_content_publish`, and whether `pages_manage_engagement` / `pages_read_user_engagement` / `ads_management` / `ads_read` apply;
   - confirm the Business Verification status.
2. Engineering: issue **PROMPT A3.7.1 — Data & Storage Foundation** as scoped in §24, only when the owner authorizes it. This audit does not start it.

---

## 27. Final Verdict

**CONDITIONAL GO — PUBLICATIONS MVP IS FEASIBLE WITH IDENTIFIED BLOCKERS**
