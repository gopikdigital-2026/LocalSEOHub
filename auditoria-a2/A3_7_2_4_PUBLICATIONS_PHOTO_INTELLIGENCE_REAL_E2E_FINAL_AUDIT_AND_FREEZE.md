# A3.7.2.4 — PUBLICATIONS PHOTO INTELLIGENCE: REAL E2E VALIDATION, FINAL AUDIT & FREEZE

Date: 2026-10-26 · Mode: read-only audit · Product-code diff in this phase: **none**

## 1. Executive Summary
I audited the current A3.7.2 source against the code itself, not against earlier reports. I also checked the live database access rules and the deploy state, and ran the full test suite, TypeScript and the build.

Real evidence:
- REAL CASE 1 (mismatch) is accepted as authoritative.
- The post-publish REAL CASE 2B (3 proposals, 1/4) is accepted as authoritative.

Results:
- Full suite: 2510/2510, 0 failures.
- TypeScript: 20 legacy errors, 0 in publications.
- Build: PASS.
- All pinned hashes and frozen-system hashes match.
- No objective freeze blocker was found.

There are non-blocking limitations and false-positive risks; they are recorded in §45–46.

Verdict: **GO**.

## 2. Scope
In scope:
- The A3.7.2 engine: Edge Function `publication-proposals`.
- Its A3.7.1 dependency: `publication-media`, plus the storage and DB foundation.
- The proposals migration and RPCs.
- The client repository and types.
- The temporary internal harness.
- The critical tests.

Out of scope:
- A3.7.3.
- Meta and Google publishing.
- The final UI.

No real AI calls were made, no image was uploaded and no generation was consumed.

## 3. Current Architecture
- **`publication-media`** (Edge Function, `verify_jwt=true`): validates the upload, runs lossless metadata-stripping normalization, and stores the private image.
- **`publication-proposals`** (Edge Function, `verify_jwt=true`):
  - `index.ts` wires the dependencies: service-role DB RPCs, private storage download and the OpenAI call.
  - `handler.ts` holds the pure pipeline.
  - Supporting modules: `context.ts`, `prompts.ts`, `safety.ts`, `relational.ts`, `quality.ts`, `normalize.ts` and `entitlement.ts`.
- **Database tables:** `publications` and `publication_proposals`.
- **Database RPCs:**
  - `claim_publication_generation`, `release_publication_generation` and `complete_publication_generation`.
  - `reserve_ai_usage` and `settle_ai_usage`.
- **Client:** `src/features/publications/repository.ts` and `types.ts`.
- **Harness:** `validation/PublicationsValidationPage.tsx`.

## 4. A3.7.1 Dependency
The A3.7.1 storage and security foundation is intact. The combined hash of `publication-media` plus migrations is `1e7aa872…8f973`, unchanged.

`publication-proposals/normalize.ts` is byte-identical to `publication-media/normalize.ts` (both `bd74629f…`).

## 5. A3.7.2 Components
| Concern | Implementation |
|---|---|
| Vision and parsing | `prompts.ts` (vision prompt and schema), `context.ts::parseVisual` |
| Usability | `context.ts::insufficiency` gives IMAGE_NOT_UNDERSTANDABLE |
| Grounding | `context.ts::buildFacts`, `buildEnvelope` |
| Consistency and image role | `context.ts` (consistency, image_use) |
| Writer and repair | `prompts.ts::writerMessages`, `repairMessages`; `handler.ts` loop (`WRITER.maxCalls=2`) |
| Fact safety | `safety.ts` (CLAIM_RULES, ALWAYS, number, emoji, language) plus `relational.ts` |
| Copy quality | `quality.ts` |
| Persistence and accounting | migration `20261025161526` |

## 6. Real CASE 1 Evidence
- **Input:** Gopik.Digital (digital/marketing) with a clothing-store interior photo (shirts, red coat, red bag, trousers).
- **Upload and normalization:** OK.
- **Result:** `BUSINESS_IMAGE_MISMATCH` · `business_consistency`. No writer call, no proposals.
- **Verdict:** PASS, accepted as authoritative.

## 7. Real CASE 2 Baseline Evidence
- **Input:** the same business with a laptop/desk photo.
- **Result:** the earlier A3.7.2 produced 3 safe but literal, repetitive proposals ("En la imagen…", "La foto muestra…").
- **Classification:** a product-quality defect, not a vision defect. This led to A3.7.2.3.

## 8. A3.7.2.3 Correction
A3.7.2.3 made these changes:
- Copy quality became a gate separate from fact safety.
- Image role: `direct_subject`, `contextual_support` or `thematic_inspiration`.
- Narration is no longer mandatory.
- Added controls for object enumeration, opening, CTA, semantic, name and location repetition.
- Added one controlled repair, followed by full revalidation.

Grounding and safety were not weakened.

## 9. Pre-Publish Testing Note
One CASE 2B attempt returned `GENERATION_UNSAFE · output_validation`. At that point the latest Bolt version had not been published. That result is not treated as evidence against the deployed A3.7.2.3, and no correction was made for it.

The A3.7.2.3.1 rule-attribution work is **not** part of this phase and is not present in the audited source:
- `handler.ts:255` returns `fail(result.code, { stage })`.
- `PublicationDiagnostic` has only `code` and `stage`.
- There is no `a37231` test file.

## 10. Authoritative Real CASE 2B Evidence
- **Input:** Gopik.Digital, the same `portatil.jpg` (image/jpeg, 785×522, 86 KB), Español.
- **Before:** `image_ready`, 0/4 generations, 0 proposals.
- **Action:** "Generar 3 propuestas reales" pressed once, after Bolt Publish and a production reload.
- **Result:** `proposals_ready`, 1/4 generations, 3 proposals, about 8.4 s, a generation_id was created, no error.

## 11. Real Vision Result
- **Observations:** ordenador portátil, taza, cuaderno, pluma, libros.
- **Uncertainties:** none.
- **Classification:** not a mismatch. This is correct for a digital/marketing business, which maps to compatible context.

## 12. Real Proposal 1
- **Role:** Directa / Comercial (`direct`).
- **Text:** "Aprovecha al máximo tu tiempo de trabajo con las herramientas adecuadas. La organización y la planificación son clave en el marketing. ¡Es momento de dar el siguiente paso!"
- **CTA:** "Escríbenos para más información."

## 13. Real Proposal 2
- **Role:** Cercana / Natural (`close`).
- **Text:** "¿Te has dado cuenta de cómo un buen ambiente de trabajo puede influir en tu productividad? Mantener todo ordenado puede ser un gran aliado. ¿Tienes alguna estrategia que te funcione?"
- **CTA:** "Cuéntanos en los comentarios."

## 14. Real Proposal 3
- **Role:** Profesional / Informativa (`professional`).
- **Text:** "La estrategia de marketing requiere una buena base de organización. Tener un espacio de trabajo ordenado y funcional puede marcar la diferencia en tus resultados. Si quieres saber más sobre cómo mejorar tu enfoque, estamos aquí para ayudarte."
- **CTA:** "Consulta con nosotros."

## 15. Manual Product Assessment
Compared with the baseline, the three proposals show material improvement:
- They do not narrate the image or enumerate objects.
- They use the image thematically.
- Openings, approaches and CTAs are all distinct.
- They stay relevant to marketing.
- They make no claims about ownership, employees, customer cases, prices or offers.

Some phrasing is generic ("herramientas adecuadas", "marcar la diferencia en tus resultados", "mejorar tu enfoque"). This is not a blocker.

## 16. End-to-End Data Flow
Verified against `handler.ts` and `index.ts`:

1. **Authentication:** an authenticated user (JWT verified by the gateway, plus `entitlement.ts`, which calls `/auth/v1/user` and the `authorize_premium_request` RPC).
2. **Upload:**
   - `publication-media` takes the owned business and the publication.
   - It streams the upload with a size cap, checks magic bytes, MIME and dimensions, then runs `normalizeImage` (lossless strip).
   - The cleaned bytes go to the private bucket, with `image_normalized=true`.
3. **Generate request:** `publication-proposals::generate`:
   - `parseInput` (exact keys).
   - `loadPublication(userId)`.
   - IMAGE_REQUIRED and IMAGE_NOT_NORMALIZED guards.
   - `buildFacts(loadBusiness(userId))`.
4. **Claim and image check:**
   - `claim` (busy, limit or stale).
   - `downloadImage`, then the fixed-point re-normalization check.
   - `reserve` (ledger).
5. **`runPipeline`:**
   - Vision (at most 2 calls), then `parseVisual`, then `insufficiency`, then `buildEnvelope`.
   - If there is no subject, the result is "insufficient". A **MATERIAL_MISMATCH** returns at this point (`:160`).
   - Writer, then `parseProposals` (exactly 3), then `reviewSet` (safety and quality).
   - If anything fails, one repair runs, followed by `parseProposals` and `reviewSet` again.
6. **Save and settle:**
   - `complete_publication_generation`: atomic, exactly 3 proposals, `proposals_ready`, counter +1.
   - `settle(completed | consumed | released)`.
   - `release` claim in `finally`.

## 17. Private Image Storage
Live database check:
- **Bucket:** `publication-images` has `public=false`, `file_size_limit=8388608` and MIME types `[image/jpeg, image/png]`.
- **Storage policy:** there is only `publication_images_select_own` (SELECT, authenticated). It is limited to the user's own folder and requires the object to be the current `image_path` of the user's own publication.
- **Writes:** there is no INSERT, UPDATE or DELETE storage policy, so all writes are made by the server with the service role.
- **Path:** a CHECK regex enforces `{user_id}/{business_id}/{publication_id}/{uuid}.{jpg|png}`.
- **No URLs stored:** no public or signed URL is persisted.

## 18. Upload Validation
In `publication-media/handler.ts`:

| Check | Behaviour |
|---|---|
| Size | Max 8 MiB. The declared Content-Length is checked, then a streaming byte total → `FILE_TOO_LARGE` 413 |
| Empty file | `FILE_EMPTY` 400 |
| File signature | PNG 8-byte signature or JPEG `FF D8 FF`; the declared type must equal the detected type, otherwise `UNSUPPORTED_MEDIA_TYPE` 415 |
| Dimensions | Each side 320–8192 and at most 40 MP, read from the headers (IHDR/SOF) without decoding → `IMAGE_DIMENSIONS_OUT_OF_RANGE` 422 |
| SVG, GIF, HEIC, disguised files | Rejected by the signature check |

The database repeats the dimension and size checks.

Tests: `a371PublicationsMedia.test.ts` (gif, svg, heic, svg disguised as jpeg, mismatched png/jpeg, empty, too small, pixel-bomb header).

## 19. Normalization & Metadata Privacy
`normalize.ts` (`lossless-strip-v1`) rewrites the container without re-encoding the pixels:
- **JPEG:** only the image-data segments are kept (DQT/DHT/DRI/DAC/DNL, frame and scan). All APPn, COM and trailing data are removed.
- **PNG:** only rendering chunks are kept.
- **Orientation:** only an orientation-only EXIF or eXIf block is re-added when the image needs rotating.

Tests prove the fixtures really carry GPS, camera, XMP, IPTC and text metadata, and that all of it is stripped (`a372Normalization.test.ts`). Fixtures: `photo-exif-gps.jpg`, `photo-exif-gps-upright.jpg`, `photo-progressive-gps.jpg`, `photo-text-exif.png`. The tests also prove that normalization is idempotent and that the entropy-coded data is byte-identical.

Before any AI call, `publication-proposals` re-normalizes the image and requires a byte-identical result (`handler.ts:220-225`).

## 20. Vision Boundary
- **Input:** a `data:{mime};base64,…` URL built in memory from the private download (`handler.ts:237`). There is no remote fetch, no signed URL and no public bucket.
- **Model and limits:** `gpt-4o-mini`, `VISION={maxTokens:700, timeoutMs:30000, temperature:0.1, maxCalls:2}`. Output uses a strict json_schema, and the timeout is enforced with an AbortController.
- **Parser:** `parseVisual` requires the exact keys and enums and caps text lengths and counts.
- **Logging:** the image, URL and provider text are never logged.
- **Response size:** bounded by `max_tokens`. The HTTP body is not separately byte-capped; see §45.

## 21. Business Context Trust Hierarchy
- **Server-owned facts only:** `businesses.{name, category, city, services, target_audience, primary_goal}`, loaded with the service role and filtered by `id` and `user_id` (`context.ts:25`, `index.ts:50-58`).
- **Not used:** the trust policy in `context.ts:6-22` excludes website, phone, schedule, GBP data, reviews, memory and Meta data.
- **No browser input:** the request body allows only `{publication_id, request_id, lang}`, and extra keys are rejected (`handler.ts:94`). No browser or localStorage value becomes a business fact.

## 22. Business/Image Consistency
- **Values:** `CONSISTENT | PLAUSIBLY_RELATED | UNKNOWN | MATERIAL_MISMATCH`, mapped from the vision `business_fit` enum. There is no numeric threshold.
- **Thin context:** MATERIAL_MISMATCH is downgraded to UNKNOWN when the business context is too thin, meaning a vague category and no services.
- **Before the writer:** MATERIAL_MISMATCH returns at `handler.ts:160` with `BUSINESS_IMAGE_MISMATCH` (stage `business_consistency`). No creative path bypasses this check.

## 23. Image Role Model
`image_use` is set in `context.ts`:

| Consistency | Image role |
|---|---|
| CONSISTENT | `direct_subject` |
| PLAUSIBLY_RELATED | `thematic_inspiration` |
| UNKNOWN | `contextual_support` |

Narration is optional, and quality rules penalize it (`image_narration`, `object_enumeration`).

The role only relaxes how the image is described, never what may be claimed. Relational and claim rules apply to every role, and a mismatch never reaches the writer.

## 24. Relational Safety
`relational.ts` enforces:
- `unsupported_possessive` ("nuestro producto/equipo/oficina/plato…" when the relationship is not grounded);
- `unsupported_offering`;
- `location_composition`.

Claim categories `availability` and `novelty` ("disponible hoy", "nuestro último trabajo") are enforced in `safety.ts`. Tests: `a3722RelationalGrounding.test.ts`.

## 25. Factual Safety
**CLAIM_RULES** (`safety.ts:65-87`):
- `price`, `percentage`, `time`, `phone`, `offer`, `award`, `experience_years`, `superlative`, `social_proof`;
- `schedule`, `urgency`, `availability`, `novelty`, `invented_behaviour`, `unsupported_intent`, `unsupported_quality`;
- `delivery`, `launch`, `statistic`, `promised_outcome`, `health`.

**ALWAYS:** `hashtag`, `contact`, `purchase_cta`.

**Additional:** `booking_not_declared`, `number` (only declared digits allowed), `emoji_excess`, `language`, plus the relational rules.

Ownership is covered by `unsupported_possessive` and `unsupported_offering`. Unsupported services are covered by `unsupported_offering` and `invented_behaviour`. No rule was weakened.

## 26. Copy Quality
`quality.ts` is separate from safety (`reviewSet` returns `{safety, quality}`):
- **Rules:** `image_narration`, `object_enumeration`, `repeated_objects`, `name_repetition`, `location_repetition`, `same_opening` and `similar_opening`, `same_cta` and `similar_cta`, `too_similar`, `generic_cta`, `same_message`, `close_not_conversational`.
- **Thresholds:**

| Setting | Value |
|---|---|
| MAX_NARRATED | 1 |
| MAX_ITEMS_PER_POST | 2 |
| SHARED_ITEMS | 2 |
| MAX_SIMILARITY | 0.5 |
| MAX_OPENING_SIMILARITY | 0.5 |
| MAX_CTA_SIMILARITY | 0.6 |
| SHARED_MESSAGE_WORDS | 4 |

## 27. Three-Proposal Invariant
- **Roles:** `direct`, `close` and `professional`, in that order. These correspond to Directa/Comercial, Cercana/Natural and Profesional/Informativa.
- **Enforced in three places:**
  - `parseProposals` requires length 3 and the role order.
  - The SQL function rejects `jsonb_array_length <> 3`.
  - A CHECK ties each role to its position.
- **Result:** 1, 2 or 4 proposals can never be persisted.

## 28. Controlled Repair
- **Attempts:** `WRITER.maxCalls=2` (initial plus one repair). The loop has a fixed bound.
- **What the repair receives:** its own previous answer, issue ids with positions and short guidance text. No new facts are added; the envelope is the same `base`.
- **Revalidation:** the repaired output goes through `parseProposals` and the full `reviewSet` (safety and quality).
- **Fails closed:** a failure ends as `GENERATION_UNSAFE` or `PROPOSALS_NOT_DISTINCT`. There is no fallback copy.

## 29. Prompt Injection
Prompts declare image text, business data and the envelope as data, never instructions (`prompts.ts:15,34,80,115`).

`context.ts` drops visible text that contains injection words, markup, digits or claims before it reaches the writer.

Tests:
- `a372ProposalsEngine.test.ts`: injected business text, injected image text, prompts declare data, and an answer that obeyed an injection is rejected.
- `a3722RelationalGrounding.test.ts`: the "prompt injection, persistence and concurrency" block.

## 30. Persistence
Proposals are persisted only through `complete_publication_generation`, and only after `runPipeline` returns `ok`.

It is a single plpgsql transaction:
1. Locks the row with `FOR UPDATE`.
2. Checks the claim id, image path, the normalized flag and `used<4`.
3. Replaces the set and sets `proposals_ready`.
4. Increments the counter and clears the claim.

There are no partial sets. Failures persist nothing. A trigger clears proposals and resets status when the image path changes.

## 31. Generation Counter
- The counter increments only inside `complete_publication_generation`, on a successful save.
- The limit of 4 is enforced by a CHECK, the claim function and the complete function.
- Failures (mismatch, unsafe, not distinct, provider errors) never change it.

This matches real CASE 2B (0/4 → 1/4) and CASE 1 (no change).

## 32. AI Usage Accounting
- **Reservation:** `reserve_ai_usage(request_id)` (monthly cap 20 and global cap 80 for this function).
- **Settlement:** `settle_ai_usage` with outcome `completed` on save. Otherwise it is `consumed` if any provider call was billed, else `released` (which refunds the reservation).

| Case | Outcome |
|---|---|
| Mismatch, unsafe, not distinct, unusable image | consumed (the vision call was billed) |
| Provider HTTP or network error before billing | released |
| Timeout or empty response | consumed (conservative) |

Publication generations (the 4-per-publication counter) are counted only on success. Policy unchanged.

## 33. Concurrency / Idempotency
- **One id for both locks:** `request_id` is used as the claim id and the ledger reservation id.
- **Claim:** `claim_publication_generation` locks the row with `FOR UPDATE` and returns `busy` while a claim under 3 minutes old exists, giving `GENERATION_IN_PROGRESS` 409.
- **Duplicate request:** a repeated reservation conflicts and returns `invalid`, giving `DUPLICATE_REQUEST` 409.
- **Cleanup:** the claim is released in `finally`.
- **Stale claim:** a stale claim's late completion fails the claim-id check, giving `IMAGE_CHANGED`.

## 34. Error Taxonomy
Proposals error codes and HTTP statuses (`handler.ts:29-35`):

| Status | Codes |
|---|---|
| 400 | INVALID_REQUEST |
| 404 | NOT_FOUND |
| 409 | IMAGE_REQUIRED, IMAGE_NOT_NORMALIZED, BUSINESS_CONTEXT_MISSING, GENERATION_IN_PROGRESS, IMAGE_CHANGED, DUPLICATE_REQUEST |
| 422 | IMAGE_NOT_UNDERSTANDABLE (only from `insufficiency`), BUSINESS_IMAGE_MISMATCH, GENERATION_UNSAFE, PROPOSALS_NOT_DISTINCT |
| 429 | REGENERATION_LIMIT_REACHED, AI_LIMIT_REACHED, AI_GLOBAL_LIMIT_REACHED |
| 502 | INVALID_MODEL_OUTPUT |
| 503 | AI_UNAVAILABLE, STORAGE_UNAVAILABLE, PROVIDER_UNAVAILABLE |
| 504 | PROVIDER_TIMEOUT |
| 500 | UNKNOWN_ERROR |

Client mapping:
- A writer `INVALID_MODEL_OUTPUT` maps to `generation_failed`, not to an image-analysis failure.
- Codes not mapped explicitly (PROVIDER_UNAVAILABLE, AI_UNAVAILABLE, STORAGE_UNAVAILABLE, UNKNOWN_ERROR) fall back to `unavailable` and still carry the diagnostic.

No unrelated error appears as an image-understanding failure.

## 35. Security
- **Authentication:** JWT verified at the gateway (`verify_jwt=true`, confirmed live for both functions) plus the server-side user and premium check.
- **Ownership:** every load and RPC is scoped by `p_user_id`. The publication RPCs can be executed only by `service_role`.
- **Live RLS:** RLS is on for `publications` and `publication_proposals`.
  - anon has no grants.
  - authenticated has SELECT on both, plus column-level INSERT of `business_id` only on `publications`.
  - Policies: `select_own_*` and `insert_own_publications`.
  - Status, counter and proposal writes are server-only.
- **Secrets:** the service role key and the OpenAI key are read only from the server environment and never returned.
- **Logs:** bounded fields only (result, code, stage, reason, consistency, image_use, rule ids, calls, repairs, billed). No prompt, provider text, image bytes or URL is logged.
- **Responses:** error responses carry the code and stage, plus a fixed message or a sanitized mismatch notice. Successful responses return only the validated proposals and the filtered observed/uncertain labels.
- **Security advisor:** no finding on the publication tables, functions or bucket. The remaining advisor items are pre-existing and unrelated.

## 36. Internal Validation Harness
- **Route:** `/internal/publications-validation` is a lazy route wrapped only in `<AppGuard>` (sign-in required).
- **Not linked anywhere:** it is intentionally not linked from the sidebar, mobile nav, tools catalog or landing. A test (`a3721aValidationHarness.test.ts`) asserts that the only references are in `App.tsx`, the page and `copy.ts`.
- **No feature flag or allowlist:** the backend still enforces premium access, the AI caps and the 4-generation limit.
- **Temporary:** the removal path is documented in A3.7.2.1A. It is not presented as customer functionality.

## 37. Meta Non-Scope
Searching for `graph.facebook.com|media_publish|localPosts|mybusiness` in both publication functions and `src/features/publications` gives 0 matches. There are no Meta permission or OAuth changes, and Meta OAuth and read hashes are unchanged (§48).

## 38. Google Non-Scope
There are no GBP posting calls; the search returned 0 matches. GBP files are unchanged.

## 39. Channel Adaptation Non-Scope
Proposals are channel-neutral. Channel adaptation is explicitly deferred (`context.ts:13`, migration header). There are no Facebook- or Instagram-specific variants.

## 40. Final UI Non-Scope
The only UI is the unlinked internal harness. There is no customer-facing Publications page.

## 41. CASE 1 Regression Coverage
- `a3722RelationalGrounding.test.ts:116-155`: mismatch, no proposals, no persistence, no counter change (ES and EN).
- `a37221ClassificationRouting.test.ts:85-111`: 7 variants with `calls: 1` (writer never called).
- `a3723CopyQuality.test.ts:144`: CASE 1 still stops at the mismatch with no writer call.

## 42. CASE 2B Regression Coverage
`a3723CopyQuality.test.ts:89-144` (the deterministic laptop/desk fixture, labelled "CASE 2" in the code):
- The image is used as thematic inspiration.
- The old all-narrated set fails quality.
- A differentiated set is accepted in ES and EN.
- The old pattern is repaired once and three proposals are stored.
- A poor repair fails closed.

No real AI is used.

## 43. Other Business-Type Coverage
- `a3723CopyQuality.test.ts:227-246` covers restaurant, salon, real estate, retailer and trade/renovations. It checks the image role and that ownership/availability claims are flagged.
- More cases: `a3722:181,189` and `a37221:159,166`.

## 44. ES / EN
- `lang ∈ {es, en}` is enforced in the handler (`:95`) and the DB.
- Output language is enforced by `matchesLang` through the `language` safety rule.
- Mismatch and unusable-image messages exist in both languages.
- Tests: `a372ProposalsEngine:162`, `a37221:111`, `a3722:138,300,309`, `a3723:100`, `a3721a:94`.

Only ES and EN are supported.

## 45. Known Non-Blocking Limitations
- **Copy:** can still sound generic (seen in real CASE 2B).
- **Not yet built:** customer-defined tone, hashtag strategy (hashtags are blocked by the ALWAYS rule), channel adaptation, final editor, and Meta and Google publishing.
- **Formats and limits:** static JPEG/PNG only, 4 generations per publication, and monthly and global AI caps.
- **Thin business context** (only name, category, city, services, audience and goal) limits how specific the copy can be.
- **Timeouts:** a provider timeout settles as consumed, and a writer provider failure uses up the repair slot. Both are conservative and part of the existing contract.
- **Business-declared terms:** `safetyIssues` exempts a claim rule when the business's own declared facts also match it (`safety.ts:104`). For example, a business whose services include "premium" may use "premium". This is by design, because declared facts are trusted. It also means a term in the business name relaxes that rule for every post.
- **Vision response body:** bounded by `max_tokens` and the timeout only; there is no explicit byte cap.
- **Internal harness:** protected only by sign-in plus the backend premium and limits. Remove or gate it before broad launch.

## 46. Potential False Positives
Both are confirmed in current code, and both fail safe by over-blocking. Not fixed in this phase.
- **Spanish "cuesta":** `safety.ts:66` price rule `\b(precios?|prices?|cuesta|costs?|…)\b/i` also matches "me cuesta concentrarme" ("I find it hard to concentrate").
- **English "review":** `safety.ts:74` social_proof rule includes `reviews?`, so "review your strategy" is flagged.

Neither is a blocker. Their only effect is an occasional repair or a GENERATION_UNSAFE result.

## 47. Freeze Manifest
See `auditoria-a2/A3_7_2_FREEZE_MANIFEST.md`. Key hashes:

| File | Hash prefix |
|---|---|
| handler.ts | `e975d73e` |
| index.ts | `925eb2d8` |
| context.ts | `0737fde7` |
| prompts.ts | `750d16f3` |
| safety.ts | `ac0efae6` |
| relational.ts | `489d7fd8` |
| quality.ts | `158f3fd7` |
| normalize.ts | `bd74629f` |
| entitlement.ts | `f948d629` |
| migration a372 | `8f74c30f` |
| migration a371 | `ab9114d8` |

## 48. Frozen-System Verification
Compared against hashes recorded in earlier freeze reports:
- **Social Intelligence:** engine, policy, signals, types, findings/*, ui/*, integration/*. All match.
- **Meta:** `meta-connection/metaRepository.ts`, `metaSyncStatus.ts`, `meta-read/handler.ts`, `meta-read/index.ts`. All match.
- **Today and Plan routes:** both match.
- **`App.tsx`:** `5f7353d2…69ad1`, equal to the documented A3.7.2.1A harness re-pin. The only change since the A3.5.5 baseline is the harness route.
- **Shared AI gate:** `entitlement.ts` `f948d629` is identical across all 9 AI functions.
- **A3.7.1 storage:** the combined hash matches.
- **Edge functions:** the deploy state shows `hasChanged=false` for all functions, including GBP, billing, auth and Meta.

## 49. Full Test Suite
`npx vitest run`: **73 files, 2510 tests passed, 0 failures**. This equals the accepted baseline.

## 50. TypeScript
`npx tsc --noEmit -p tsconfig.app.json`: **20 errors**, equal to the legacy baseline. None are in `src/features/publications`, so A3.7.2 adds no new debt.

## 51. Build
`npm run build`: **PASS**.

## 52. Deployment Parity
- **Live functions:** `publication-media` and `publication-proposals` are ACTIVE with `verifyJWT=true`.
- **Deploy state:** `supabase/functions-deploy-state.json` shows `hasChanged=false` for both (`publication-proposals` `eae70ea4…`, `publication-media` `1c9e7886…`). The local source equals the last deployed source.
- **No redeploy:** nothing was redeployed for this audit.

## 53. Product-Code Diff
None. This phase created only this report and the freeze manifest. Bolt Publish is not required, because nothing in the frontend changed. The authoritative CASE 2B ran against the published application.

## 54. Freeze Decision
Every GO criterion in §60 of the spec is satisfied, and there are no objective blockers. **A3.7.2 is FROZEN** under the manifest's change-control rule.

## 55. Recommended Next Phase
**A3.7.3 — CHANNEL ADAPTATION & EDITOR.** Not implemented. Conceptual flow:
1. The user chooses one of the 3 safe proposals.
2. The chosen proposal becomes editable.
3. It is adapted into Facebook and Instagram variants from a common factual source.
4. The user reviews and edits the final variants.
5. This prepares for a later publishing layer.

Google stays "Próximamente". Candidate follow-ups for separate, approved micro-phases:
- the §46 false positives;
- harness gating or removal.

## 56. Final Verdict
GO — FREEZE A3.7.2 PUBLICATIONS PHOTO INTELLIGENCE & GROUNDED THREE-PROPOSAL ENGINE
