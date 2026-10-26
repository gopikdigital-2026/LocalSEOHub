# A3.7.2.2.1 — Real Vision Classification Attribution & Mismatch Routing

## 1. Executive Summary
The real CASE 1 retest (Gopik.Digital + clothing store photo, ES) returned IMAGE_NOT_UNDERSTANDABLE instead of BUSINESS_IMAGE_MISMATCH. The misrouting happened at the **vision usability decision** (`insufficiency()` in `context.ts`). Since A3.7.2.2 the vision step sees the declared business and mismatch definitions, so the model could express "this does not fit the business" through `usable=false` + a generic reason (`other` / `no_clear_subject`) or through an `uncertain` primary subject. The pipeline trusted that blindly and stopped before business consistency was evaluated. The fix separates image usability (photo-only) from business fit, attributes every failure to a stage, and gives malformed AI responses their own client message. No message patching, no special cases.

## 2. Real Production Evidence
- Same CASE 1 JPEG (1200×800, ~145 KB, image_ready), Gopik.Digital, Español, one press.
- UI: "No hemos podido entender esta imagen con suficiente seguridad. Prueba con otra fotografía."
- DB: latest publication `25e089c8…` remained image_ready, generations_used 0, no proposals.
- Ledger: the `publication-proposals` reservation for that run was settled **consumed** ~3–4 s after creation, consistent with exactly one billed vision call and no writer call.

## 3. Expected vs Actual
| | Expected | Actual |
|---|---|---|
| Code | BUSINESS_IMAGE_MISMATCH | IMAGE_NOT_UNDERSTANDABLE |
| Writer called | No | No |
| Counter | 0/4 | 0/4 |
| Proposals | 0 | 0 |
Security outcome was correct; classification was wrong.

## 4. Root Cause
`insufficiency(v)` returned a reason whenever `usable=false` or the primary subject was not `observed`, regardless of whether the image content had been clearly observed. A3.7.2.2 removed the old `unrelated` reason and added business context to the vision prompt, which made it likely that the model would fold business incompatibility into `usable=false` / `other` or mark the primary subject `uncertain` ("a clothing store — but for a marketing agency?"). Relationship uncertainty was therefore treated as image uncertainty.

## 5. Exact Misrouting Stage
Attribution matrix of every path that could return IMAGE_NOT_UNDERSTANDABLE before the fix:

| Path | Possible in the real run? | Evidence |
|---|---|---|
| Provider error / timeout | No | Would return PROVIDER_*; message differs |
| Empty provider content | No | Would return INVALID_MODEL_OUTPUT → generation_failed text |
| Parser / schema rejection | No | Would return INVALID_MODEL_OUTPUT → generation_failed text |
| `usable=false` with any reason | **Yes** | One billed call, IMAGE_NOT_UNDERSTANDABLE text |
| `usable=true` but primary subject `uncertain`/missing | **Yes** | Same signature |
| Envelope subject empty after label filtering | **Yes** (claim-like label e.g. "ropa a la venta") | Same signature |
| Consistency verdict | No | Consistency never returns this code |

All three possible paths live in the vision usability stage; all three are fixed. The exact branch cannot be replayed because no provider content is logged by design; the new stage/reason log and the harness diagnostic will confirm it on retest.

## 6. Pre-A3.7.2.2 Vision Contract
Vision received only the photo. Reasons included `unrelated`; a separate relevance check decided whether the image related to the business. `usable=false` meant "cannot use for this business" in practice.

## 7. Post-A3.7.2.2 Vision Contract
Vision receives the declared business facts and returns `business_fit` (consistent / plausibly_related / unknown / material_mismatch). `unrelated` was removed, but nothing told the model that `usable` must describe the photo only, and the pipeline still let `usable` overrule clearly observed content.

## 8. Provider Response
Unchanged transport: strict json_schema, gpt-4o-mini. Non-ok → client/server/rate_limited; abort → timeout (billed); empty content → billed "empty". Provider success always reaches the parser; it can no longer become an image failure without passing the usability rule below.

## 9. Parser / Schema
`parseVisual` is unchanged. New `visualFailure(raw)` attributes a parse failure: invalid JSON / wrong shape → `vision_parse`; an otherwise valid answer with an invalid `business_fit` → `business_consistency`. Both return INVALID_MODEL_OUTPUT, never IMAGE_NOT_UNDERSTANDABLE.

## 10. Vision Usability
Usability is now decided by evidence: the image is usable when there is an **observed anchor** (observed primary subject or observed setting) and either `usable=true` or at least one observed element. `business_fit` plays no part.

## 11. Insufficiency Decision
IMAGE_NOT_UNDERSTANDABLE only when:
- the model names a concrete visual defect (`blank_or_dark`, `blurry`, `unsafe_content`) — always trusted; or
- there is no observed anchor (nothing in the photo was clearly seen).
A generic `usable=false` with `other` / `no_clear_subject` over clearly observed content is no longer enough. The vision prompt now also says: usable describes only whether the photo itself can be understood; a clear photo of a different business is usable=true and is expressed via business_fit.

## 12. Business Consistency Routing
Runs only after usable vision. `consistencyVerdict` (with the sparse-context downgrade to UNKNOWN) is unchanged. MATERIAL_MISMATCH → BUSINESS_IMAGE_MISMATCH with no writer call. The envelope subject now falls back to the observed setting when the primary label is uncertain or filtered, so the mismatch notice always names something actually seen.

## 13. Error Taxonomy
| Code | Meaning | Stage(s) | Client |
|---|---|---|---|
| IMAGE_NOT_UNDERSTANDABLE | the photo itself is insufficient | vision_usability | image_not_understandable |
| BUSINESS_IMAGE_MISMATCH | understood but materially inconsistent | business_consistency | business_image_mismatch |
| INVALID_MODEL_OUTPUT (AI_RESPONSE_INVALID) | response could not be parsed | vision_parse, business_consistency | ai_response_invalid |
| INVALID_MODEL_OUTPUT | writer output unparseable | writer | generation_failed |
| PROVIDER_TIMEOUT / PROVIDER_UNAVAILABLE | provider error | vision_provider, writer | provider_timeout / unavailable |
| GENERATION_UNSAFE / PROPOSALS_NOT_DISTINCT | output rejected | output_validation | unchanged |

## 14. Fix
- `context.ts`: evidence-based `insufficiency()`; `visualFailure()`; envelope subject fallback with safe filtering of the primary label.
- `prompts.ts`: one line separating photo usability from business fit.
- `handler.ts`: every result carries `stage` and `reason`; responses include `stage`; the log records stage/reason.
- Client: INVALID_MODEL_OUTPUT from vision stages → `ai_response_invalid`; validated `{code, stage}` diagnostic attached to errors.
- Harness: new AI_RESPONSE_INVALID copy (ES/EN) and a small diagnostic line under the error.

## 15. Why Fix Is Not a Special Case
No image, business, filename, dimension, ID or label is referenced. The rule is generic: named visual defects or absence of clear observations make an image insufficient; anything else proceeds to the business-fit decision. It applies identically to every image and business.

## 16. Fail-Closed Preservation
Malformed output, timeouts, outages, unsafe or non-distinct writer output, and genuine insufficiency still stop without proposals. Envelope safe-filtering, withheld counting and the claim filter are unchanged; a filtered primary label is withheld, never passed through.

## 17. Relational Safety Preservation
All A3.7.2.2 tests pass unchanged except the added `stage` field. CASE 1 writer output is still rejected (GENERATION_UNSAFE at output_validation) even if vision were to pass it; possessive / location-composition / novelty checks unchanged.

## 18. CASE 1 Regression
Seven variants (clean answer; usable=false + no_clear_subject; usable=false + other; uncertain primary; claim-like primary; novelty primary; missing primary with clear setting) all return 422 BUSINESS_IMAGE_MISMATCH, stage business_consistency, one vision call, no writer, no complete, ledger consumed, claim released. EN variant also verified.

## 19. Genuine Insufficient-Image Control
Blank/dark, blurry (even with guessed labels), unsafe, no discernible subject, and usable=true with nothing observed → IMAGE_NOT_UNDERSTANDABLE, stage vision_usability, correct reason. Usability is shown to be independent of business_fit for all four values.

## 20. Consistent Positive Control
Clothing retailer + store photo → 200, proposals_ready, vision + writer.

## 21. Plausibly Related Control
Real estate + home interior → neither IMAGE_NOT_UNDERSTANDABLE nor mismatch; proceeds to writer; listing-claim copy ("nuestro salón luminoso en Marbella") still flagged.

## 22. Unknown Control
Sparse business + clear photo (even with a generic usable=false) → proceeds to generation, never forced into mismatch.

## 23. Malformed Provider Response
Invalid JSON then wrong shape → INVALID_MODEL_OUTPUT, stage vision_parse, two calls, consumed, nothing stored. Client shows AI_RESPONSE_INVALID copy.

## 24. Provider Timeout
Billed timeouts → PROVIDER_TIMEOUT, stage vision_provider, consumed. Unbilled outages → PROVIDER_UNAVAILABLE, released.

## 25. Consistency Failure
Otherwise valid vision with an invalid business_fit → INVALID_MODEL_OUTPUT, stage business_consistency, reason invalid_business_fit; never IMAGE_NOT_UNDERSTANDABLE.

## 26. Usage Accounting
Unchanged settle/release `finally`: mismatch → one vision call, consumed once, no duplicate usage, claim released (no stuck reservation).

## 27. Generation Counter
Only `complete_publication_generation` increments; it is never called on mismatch, insufficiency or any error. Counter stays 0/4.

## 28. Persistence
No proposals, generation rows or status changes on any failure path; publication remains image_ready.

## 29. Safe Diagnostics
Pipeline log: result, code, stage, reason, consistency, calls, repairs, billed. Test asserts no image data, base64, labels, business names, prompt text or tokens appear. Responses add only `stage` (and `reason` for insufficiency, a fixed enum).

## 30. Harness Changes
- AI_RESPONSE_INVALID message.
- Diagnostic line in the error box, e.g. `Diagnóstico: BUSINESS_IMAGE_MISMATCH · business_consistency`. Only regex-validated uppercase codes and lowercase stage tokens are shown; free text is discarded.
- Mismatch box still shows the title plus the server's mismatch sentence ("La imagen parece mostrar «…», pero no coincide claramente con la actividad que conocemos de Gopik.Digital. Comprueba que has seleccionado la fotografía correcta.").

## 31. ES/EN
- IMAGE_NOT_UNDERSTANDABLE: "No hemos podido entender esta imagen con suficiente seguridad. Prueba con otra fotografía." / EN equivalent.
- BUSINESS_IMAGE_MISMATCH: server sentence in ES/EN naming the observed scene and business.
- AI_RESPONSE_INVALID: "No hemos podido completar el análisis de la imagen de forma segura. Inténtalo de nuevo más tarde." / "We could not complete the image analysis safely. Please try again later."
No commercial copy changed.

## 32. Security
Auth, ownership, claim/reservation, JWT verification and storage access unchanged. Diagnostics carry no user content; client diagnostics are allowlisted by pattern.

## 33. Frozen-System Verification
- A3.7.1 storage combined hash (publication-media + migrations): `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973`, unchanged.
- `normalize.ts` bd74629f, `entitlement.ts` f948d629, `index.ts` 925eb2d8, unchanged.
- Pinned-hash suites (Meta, Social Intelligence, Hoy, Plan, App) pass. GBP, billing and auth untouched.

## 34. Tests
New `a37221ClassificationRouting.test.ts` (CASE 1 variants, insufficient controls, positive/plausible/unknown controls, parser contract, malformed vision, malformed consistency, timeout, outage, log safety, client mapping, copy). Existing exact-JSON assertions updated only to include `stage`; one older test now uses a photo with no observed content as its insufficiency case. Full suite: **72 files, 2490 tests, 0 failures.**

## 35. TypeScript
`tsc --noEmit -p tsconfig.app.json`: 20 errors, all legacy, none in publications.

## 36. Build
`npm run build`: PASS.

## 37. Deployment
Deployed `publication-proposals` only. No migrations, no other functions. No real AI generation was run. **A Bolt Publish is required** for the harness changes (diagnostic line, AI_RESPONSE_INVALID copy).

## 38. Exact Manuel Retest Instructions
1. Press Publish in Bolt and wait for it to finish.
2. Open the validation harness, select Gopik.Digital, language Español.
3. Upload the SAME CASE 1 clothing-store JPEG; wait for image_ready.
4. Press "Generar 3 propuestas reales" once.
5. Expected: mismatch title plus the sentence naming the clothing-store scene and Gopik.Digital; diagnostic line `BUSINESS_IMAGE_MISMATCH · business_consistency`; state image_ready; 0/4; no proposals.
6. Send the screenshot, including the diagnostic line.

## 39. Final Verdict
GO — A3.7.2.2.1 CLASSIFICATION ROUTING HOTFIX READY FOR REAL RETEST
