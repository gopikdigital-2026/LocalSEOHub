# A3.7.2 — Photo Intelligence & Grounded Three-Proposal Engine

Status of predecessor: A3.7.1 GO, FROZEN. This report covers A3.7.2 only. A3.7.3 has NOT been started.

## 1. Scope delivered
One photo -> lossless metadata-stripping normalization -> multimodal visual understanding -> server-side grounded context -> exactly three distinct, fact-checked proposals persisted as one typed set. No publishing, no UI, no routes, no sidebar, no scheduling, no Stories/Reels, no Meta/Google changes.

## 2. Files added
- `supabase/functions/publication-media/normalize.ts`
- `supabase/functions/publication-proposals/{index,handler,context,safety,prompts,entitlement,normalize}.ts`
- `supabase/migrations/20261025161526_a372_publication_proposals_engine.sql`
- Tests: `a372Normalization.test.ts` (25), `a372ProposalsEngine.test.ts` (44), `a372ProposalsGuards.test.ts` (14)
- Real fixtures: `__tests__/fixtures/photo-exif-gps.jpg`, `photo-exif-gps-upright.jpg`, `photo-progressive-gps.jpg`, `photo-text-exif.png`

## 3. Files modified
- `publication-media/handler.ts` (normalize before upload; only normalized bytes stored)
- `publication-media/index.ts` (`image_normalized: true` on save)
- `src/features/publications/types.ts`, `repository.ts` (proposals_ready, proposals, generate/get)
- `supabase/config.toml` (`[functions.publication-proposals] verify_jwt = true`)
- Pinned-guard tests (section 44).

## 4. Normalization lifecycle
raw upload (memory only) -> sniff + `inspectImage` (A3.7.1) -> `normalizeImage` -> dimensions must equal inspected ones -> ONLY normalized bytes uploaded -> row gets `image_normalized=true`. Raw bytes are never written to storage, so there is nothing to remove afterwards; the normalized object is the single source of truth.

## 5. Normalization strategy (decision)
`lossless-strip-v1`: container rewrite, not pixel re-encode. No image decoder is available in the Deno edge runtime or offline vitest, and a re-encode would degrade quality. A container rewrite gives deterministic metadata removal with byte-identical image data.
- JPEG keeps: SOI, DQT/DHT/DRI/DAC/DNL, one SOF, SOS + entropy data, ICC (APP2), Adobe APP14, JFIF APP0 rebuilt without thumbnail. Drops: EXIF (except a rebuilt orientation-only block), XMP, IPTC/APP13, APP3-15, COM, data after EOI.
- PNG keeps (pre-IDAT only): IHDR, PLTE, tRNS, gAMA, cHRM, sRGB, iCCP, sBIT, bKGD, pHYs, IDAT, IEND. Drops tEXt/zTXt/iTXt/tIME/private chunks/trailers; CRC verified on every chunk; unknown critical chunk -> fail.

## 6. Output format, MIME, dimensions, Instagram
Output MIME equals input (JPEG->JPEG, PNG->PNG); dimensions unchanged and within A3.7.1 limits (320-8192 px, 40 MP, 8 MB). JPEG is directly Instagram-compatible. PNG is accepted for analysis; conversion to JPEG for Instagram is deferred to the later channel-adaptation stage (noted debt, not a blocker for A3.7.2 because nothing is published).

## 7. Orientation
Preserved as a minimal EXIF/eXIf Orientation tag (only when != 1) and passed to the vision prompt. Not baked into pixels (no decoder).

## 8. Normalization failure behaviour
Any structural anomaly fails closed -> `IMAGE_UNREADABLE` (422) at upload; nothing stored. The proposals engine re-runs normalization on the downloaded object and requires a byte-identical fixed point plus matching `image_bytes`; otherwise `IMAGE_NOT_NORMALIZED`, with no reservation and no provider call. Rows with `image_normalized=false` are refused before claiming.

## 9. Real-image metadata evidence
Fixtures carry EXIF Make "SecretCam", Model "Model X1 Pro", DateTime, GPS 40°25'12.34"N 3°42'56.78"W, XMP GPS, IPTC "SecretCity", COM with name and phone, trailing data; PNG adds eXIf, tEXt, iTXt XMP, tIME, private `prVt`, trailer. `identify -verbose` confirmed these were present in inputs and absent from outputs (only `Profile-exif: 32 bytes`, orientation only). Pixel signatures identical input vs output (ee23c86c..., 3377bf28..., ef7449e7...). All outputs idempotent. Sizes 48612->48010, 48612->47974, 47178->46576, 15107->14473.

## 10. EXIF debt
CLOSED — NORMALIZED IMAGE HAS METADATA STRIPPED

## 11. Provider
OpenAI chat completions via existing secret `LocalSEO_KEY` (confirmed present in deployed secrets), model `gpt-4o-mini`, structured outputs (`json_schema`, strict). No provider switch; failures fail safely.

## 12. Two-stage pipeline (decision)
Stage 1 vision (observe only) -> Stage 2 writer (text only, sees the envelope, never the image). Separates observation from copywriting so the writer cannot "see" more than was validated.

## 13. Visual schema
Strict keys: usable, insufficient_reason, primary_subject, elements, setting, visible_text, people_visible, not_observed, unsafe_to_infer, business_relevance. Mapping: OBSERVED = certainty "observed"; UNCERTAIN = "uncertain"; NOT_OBSERVED = `not_observed`; UNSAFE_TO_INFER = `unsafe_to_infer`. Parser rejects extra or missing keys and bad enums.

## 14. OCR text policy
Visible text is CONTEXT_ONLY and non-authoritative: only legible, <=40 chars, max 3, and only if it contains no digits, claims, markup, URLs, @/# or injection words. Prices, dates and offers are never derived from it (digits/claim terms withheld).

## 15. Context assembler trust table
| Field | Class | Used |
|---|---|---|
| name, category, city, services | SAFE_FACT | yes |
| target_audience, primary_goal | CONTEXT_ONLY (tone only) | yes |
| website, phone | SAFE_WITH_CONDITION | no (contact never in copy) |
| secondary_goals, schedule | DO_NOT_USE | no |
| gbp_verified_profile, reviews_ratings | DO_NOT_USE | no |
| business_memory | DO_NOT_USE | no |
| meta_content | DO_NOT_USE | no |
| image_visible_text | CONTEXT_ONLY, filtered | filtered |

## 16. Business Memory
Excluded entirely (not queried).

## 17. GBP
No Google calls. GBP-derived fields are not read; the only columns selected are `name, category, city, services, target_audience, primary_goal` from the owner's business row.

## 18. Meta
No Meta calls; Meta content is never authoritative and not read.

## 19. Grounding envelope
`{lang, image{subject, observed, setting, people_visible, visible_text}, business{name, category, city, services}, tone_context{audience, goal}, cta{booking_declared}, uncertain}`. Anything outside it is unavailable; writer prompt states this, and the safety checker allows numbers/claims only if present in the declared envelope text.

## 20. Prompt-injection defences
Business text and image text are DATA: control/bidi characters stripped; services, audience and goal containing injection vocabulary or markup are withheld; image labels/visible text filtered (section 14); both prompts declare data as non-instructions; output is checked deterministically, so an obeyed injection is still rejected.

## 21. Adversarial tests
Injected service and goal text never reach the writer; injected/commercial OCR ("IGNORE PREVIOUS INSTRUCTIONS... 50% off", "OFERTA 2x1", URL, "precio 3€") withheld; a model answer that obeyed an OCR discount is rejected as GENERATION_UNSAFE; extra request keys (e.g. `prompt`) rejected.

## 22. Roles
Position 1 DIRECT/COMMERCIAL (`direct`), 2 CLOSE/NATURAL (`close`), 3 PROFESSIONAL/INFORMATIVE (`professional`); enforced by parser and by a DB CHECK tying role to position.

## 23. Differentiation checks (deterministic)
Same first three words, same CTA, or word-Jaccard (>=4 chars) > 0.5 between any pair -> issue. At most one repair.

## 24. Fact-safety checks
Price, percentage, time, phone, offer/free, award/certification, years of experience, superlatives, social proof, schedule, urgency, availability, delivery, launch, health — flagged unless declared in the envelope. Always flagged: hashtags, links/emails/@, "buy now" CTAs. Also: booking unless declared, any number absent from the envelope, >1 emoji, wrong language.

## 25. Repair policy
Writer: first answer; if unsafe or not distinct, exactly one repair prompt listing issue ids; if still failing -> `GENERATION_UNSAFE` or `PROPOSALS_NOT_DISTINCT`. No fallback copy is ever produced or stored.

## 26. Insufficient image
`IMAGE_NOT_UNDERSTANDABLE` (422) with `reason` and localized `message` (ES/EN); three proposals are not forced. Triggers: unusable, no observed subject, unrelated to business, subject filtered as unsafe.

## 27. No user prompt
Request body is exactly `{publication_id, request_id, lang}`; free text is rejected.

## 28. Language and style
ES (Spain) or EN; stopword heuristic verifies output language; max 1 emoji; hashtags deferred to A3.7.3 (and rejected now); CTAs grounded, booking only if declared.

## 29. Persistence
`publication_proposals(id, publication_id, user_id, generation_id, position 1..3, role, lang, body 1..1000, cta 1..120, created_at)`, UNIQUE(publication_id, position). `publications` gains `image_normalized, proposal_generation_id, proposals_lang, proposals_generated_at, proposal_generations_used (0..4), generation_claim_id, generation_claimed_at`; status adds `proposals_ready`. No publishing fields.

## 30. Access control
RLS on; owner SELECT only; authenticated has no INSERT/UPDATE/DELETE on proposals; claim/release/complete RPCs are SECURITY DEFINER with `search_path` set, EXECUTE revoked from PUBLIC/anon/authenticated and granted to service_role only.

## 31. Live database verification (rolled back)
claim=claimed; second claim=busy; foreign user=not_found; complete with wrong claim=null; complete=ok (3 rows, proposals_ready, used=1); stale image path=stale; regeneration replaced set atomically (3 rows, 1 generation, used=2); foreign read=0; foreign insert denied; owner read=3; owner delete denied; owner counter write denied; user RPC call denied; user reserve denied; image replace -> 0 rows, status image_ready; at 4 generations -> limit; caps 20/80, weekly 22.

## 32. Regeneration
Max 4 generations per publication (counter survives image replacement so swapping images cannot reset it). Each generation consumes one ledger unit. `complete_publication_generation` deletes the old set and inserts the new one in one transaction, so sets are never mixed.

## 33. Ledger decision
New function key `publication-proposals`, monthly cap 20, inside unchanged global 80. Other caps unchanged (22/18/18/12/10/15). Premium required (`requirePremium` first). One unit per generation regardless of internal calls.

## 34. Ledger outcomes
completed on saved set; consumed if any billed provider call happened but no set was saved (including insufficient image and IMAGE_CHANGED); released if nothing was billed. Settled in `finally`, also when a dependency throws.

## 35. Cost table
| Stage | Max calls | max_tokens | Timeout | Temperature |
|---|---|---|---|---|
| Vision | 2 (1 retry on retryable/invalid) | 700 | 30 s | 0.1 |
| Writer | 2 (1 repair or retry) | 1200 | 25 s | 0.7 |
| Total | 4 provider calls per reservation | <= 3800 output tokens | — | — |
Image sent at `detail: "high"`. Timeouts are treated as possibly billed (consumed) in production.

## 36. Error codes
400 INVALID_REQUEST; 404 NOT_FOUND; 409 IMAGE_REQUIRED, IMAGE_NOT_NORMALIZED, BUSINESS_CONTEXT_MISSING, GENERATION_IN_PROGRESS, IMAGE_CHANGED, DUPLICATE_REQUEST; 422 IMAGE_NOT_UNDERSTANDABLE, GENERATION_UNSAFE, PROPOSALS_NOT_DISTINCT; 429 REGENERATION_LIMIT_REACHED, AI_LIMIT_REACHED, AI_GLOBAL_LIMIT_REACHED; 500 UNKNOWN_ERROR; 502 INVALID_MODEL_OUTPUT; 503 AI_UNAVAILABLE, STORAGE_UNAVAILABLE, PROVIDER_UNAVAILABLE; 504 PROVIDER_TIMEOUT.

## 37. Error hygiene
Provider bodies, exception messages, images, data URLs and keys are never returned or logged; logs carry counts/outcomes only. Client maps only known codes (own-property lookup) and everything else to `unavailable`.

## 38. Concurrency
DB claim (3-minute lease) blocks competing generations; `request_id` is both claim id and ledger reservation id, so a replay is `DUPLICATE_REQUEST` and cannot double charge; complete requires the same claim and unchanged image path.

## 39. Image replacement
Trigger `publications_invalidate_proposals` deletes proposals and clears proposal/claim fields when `image_path` changes; status returns to `image_ready` (or `draft`). An in-flight generation then fails to complete -> `IMAGE_CHANGED`.

## 40. Client layer
`toPublication` handles `proposals_ready`; `toProposal`; `getProposals` refuses partial or mixed sets; `generateProposals(id, lang, requestId)` invokes the function then reloads the stored set and checks the generation id. No UI or routes.

## 41. Privacy copy (future, document only)
Future UI copy should state: "Your photo is cleaned of location and camera details before it is stored. It is analysed by our AI provider only to write your post suggestions; we do not use reviews, private notes or connected-account data for this." Not implemented in A3.7.2.

## 42. Storage-orphan debt assessment
Unchanged from A3.7.1: orphan paths remain only on failed save after upload and failed delete of a replaced object (both logged). Normalization adds no new orphan path because only the normalized object is ever uploaded. Proposal rows cascade with the publication. Debt stays OPEN-LOW (cleanup job still future work).

## 43. Deployment
`publication-media` and `publication-proposals` deployed; `verify_jwt = true` for both.

## 44. Changes to earlier tests (with reasons)
- A3.7.1 media test: PNG builder made structurally complete and response byte count uses `normalizedLength` (normalization now runs).
- A3.7.1 repository test: fixture rows gain the new columns; draft mapping includes `generationsUsed`/`proposals`.
- Migration-count pins 50 -> 51 (a281, a33, f03 x2, a273, a272); a273/a272/a3542 recent-migration filters also exclude `_a372_`; a3543 re-pins the a3542 test md5 (Social sources unchanged).
- a23 T30 approved AI callers adds `publication-proposals`.

## 45. Test results
68 files, 2386 tests, 0 failures (baseline 65/2303; +83 new).

## 46. Type check
`npx tsc --noEmit -p tsconfig.app.json`: 20 errors, all legacy; 0 new.

## 47. Build
`npm run build` passes.

## 48. Frozen-file verification
SHA-256 comparison against the pre-change manifest: no frozen Meta, Social Intelligence or Hoy/Plan source changed. Meta handlers: meta-oauth-start e21d60a5, meta-oauth-callback 89ff215b, meta-connection 57e8341f, meta-read 987cc94b (match). Only files in sections 2-3 and 44 changed, plus `functions-deploy-state.json` (deploy tool).

## 49. Real-AI validation and verdict
Real-AI validation was NOT performed. Outbound network is available, but `LocalSEO_KEY` exists only as a deployed secret and invoking the deployed function requires a signed-in premium user session, which is not available in this environment. All provider behaviour is covered with deterministic fakes. Pending: one live run per language on a real product photo, an insufficient photo and an adversarial OCR photo, checking output quality, latency and token usage against section 35.

CONDITIONAL GO — A3.7.2 IMPLEMENTED; REAL-AI VALIDATION PENDING
