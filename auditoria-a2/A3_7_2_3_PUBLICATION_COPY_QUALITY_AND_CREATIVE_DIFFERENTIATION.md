# A3.7.2.3 — Publication Copy Quality & Creative Differentiation

## 1. Executive Summary
The real CASE 2 retest showed copy that was safe but not worth publishing. All three proposals narrated the photo and then followed the same "Gopik.Digital → marketing → contact us" pattern. A3.7.2.3 makes four changes:
- An explicit image-role model, derived from the business/image consistency verdict.
- Three distinct writer strategies, each with an angle id.
- Craft rules in the writer prompt.
- A deterministic copy-quality layer, separate from fact safety, that runs after generation and before persistence. It feeds the existing single repair, and the repaired output is re-checked for both safety and quality before the pipeline either persists or fails closed.

No factual-safety rule was removed or weakened. Two claim rules were added: `statistic` and `promised_outcome`.

Results:
- 2510/2510 tests pass. The baseline was 2490; 20 tests are new.
- `tsc` shows 20 errors, all legacy and unchanged.
- The build passes.
- `publication-proposals` is deployed.

## 2. Real CASE 2 Evidence
- Business and image: Gopik.Digital (Marketing); a person working at a desk.
- Vision observed: ordenador portátil, cuaderno, pluma, taza, libros.
- Outcome: proposals_ready, 1/4, 3 proposals, about 8.7 s.
- Pattern: every proposal opened with "En la imagen se aprecia… / En la foto vemos…", listed the objects, named the business, said "marketing" and ended with a "contact us" CTA.

## 3. Quality Defect
The defects were:
- Systematic image narration.
- Object enumeration.
- The same message three times.
- The business name in every proposal.
- Generic, near-identical CTAs.
- No real difference between the "direct", "close" and "professional" proposals.

## 4. Why Safe Copy Was Still Poor Copy
The A3.7.2.2 prompt told the writer to describe the photo neutrally ("En la imagen se aprecia…") so it would not claim relationships. That made narration the safest default. Differentiation was checked only by a word-overlap threshold and a same-inventory check, and a set can pass both while still being three captions of one image.

## 5. Scope
- The `publication-proposals` edge function: a new `quality.ts`, plus edits to `safety.ts`, `context.ts`, `prompts.ts` and `handler.ts`.
- Tests.
- No frontend change. The client's diagnostic-stage pattern `/^[a-z_]{3,40}$/` already accepts `copy_quality`, and `PROPOSALS_NOT_DISTINCT` already maps to `generation_failed`.

## 6. Image Role Model
`GroundingEnvelope.image_use` is derived from the consistency verdict, not chosen by the model:

| Verdict | image_use |
|---|---|
| CONSISTENT | direct_subject |
| PLAUSIBLY_RELATED | thematic_inspiration |
| UNKNOWN | contextual_support |
| MATERIAL_MISMATCH | never reaches the writer |

`image_use` is sent to the writer as data, together with a guide line. A fixed line is always appended: "Creative freedom never extends to facts: a theme suggested by the photo is not a fact about the business."

## 7. DIRECT_SUBJECT
The photo shows the business's own activity. One proposal may mention it, but no proposal may describe it, and even then it is never treated as stock, a product, novelty or availability.

## 8. CONTEXTUAL_SUPPORT
The photo is background. The posts are built from the declared activity, and photo details appear sparingly or not at all.

## 9. THEMATIC_INSPIRATION
The photo suggests a theme (CASE 2: planning, work, digital presence). The writer develops that theme for the declared category without narrating objects.

## 10. Business Grounding Preservation
Business facts, provenance, unsupported-service and possessive rules are unchanged. Themes must come from the declared activity.

## 11. Relational Safety Preservation
`relational.ts` is unchanged, and so are all RELATION_RULES except one line. "Describe the photo neutrally… 'En la imagen se aprecia…'" became "If a proposal does refer to the photo, do it neutrally as an image, never as something the business has."

## 12. Writer Strategy
The writer is told it must produce three different communication strategies, not three tones of one paragraph. Each role carries an angle id (business_action / relatable_conversation / useful_context). The angle is guidance only and is never trusted as proof of differentiation; the validator checks the text itself.

## 13. Direct / Commercial Strategy
Structure: hook → one need or value tied to the declared activity → action-oriented CTA (write, ask, talk). It must not be pushy.

## 14. Close / Natural Strategy
Structure: relatable idea or question → short development → conversational CTA. It must not use corporate filler or invent stories, feelings or team habits; `invented_behaviour` still blocks "nos apasiona", "nuestro equipo" and similar. The validator requires a question or direct address (tú/usted, you).

## 15. Professional / Informative Strategy
Structure: one useful, timeless idea → why it matters for this kind of business → low-pressure CTA. It must not be a more formal copy of the direct post; `too_similar`, `similar_opening` and `same_message` enforce this.

## 16. Image Narration Controls
- `isNarrated` checks the first sentence for ES and EN narration openings: en la imagen/foto, la imagen muestra, se aprecia/ve, vemos, podemos ver, in the image, this photo shows, we can see…
- At most one narrated proposal is allowed (`MAX_NARRATED = 1`); more gives `image_narration`.
- The prompt lists these openings as forbidden examples, not as recommendations.

## 17. Object Enumeration Controls
- More than 2 image labels in one body gives `object_enumeration:N`.
- 2 or more labels shared by all three bodies gives `repeated_objects`.
- The prompt states that the photo is not a checklist.

## 18. Business Name Controls
The name in every body gives `name_repetition`. One or two mentions are allowed, and no proposal may open with the name (prompt rule).

## 19. Location Controls
The city in every body gives `location_repetition`. A single mention is allowed, and is tested. Location-composition safety still applies.

## 20. CTA Strategy
The validator checks, for each pair of CTAs:
- `same_cta`: identical CTAs.
- `similar_cta`: Jaccard similarity above 0.6.

Across the set:
- `generic_cta`: more than one "más información / saber más / more information / learn more" CTA.

CTA safety is unchanged: no booking unless declared, no purchase, no contact data, no unsupported capability.

## 21. Copy Quality Validator
`quality.ts` → `qualityIssues(ps, env)` is deterministic and uses no embeddings or model calls. Besides the rules above, it checks:
- `same_opening` / `similar_opening`: first three words equal, or first-sentence Jaccard above 0.5.
- `too_similar`: body Jaccard on words of 4+ letters above 0.5.
- `same_message`: 4 or more words of 5+ letters shared by all three bodies, excluding the business name, category, city and services.
- `close_not_conversational`.

## 22. Fact Safety vs Copy Quality
`reviewSet` returns `{ safety, quality }`. Safety takes precedence: if any safety issue remains, the result is GENERATION_UNSAFE · output_validation; quality-only failures give PROPOSALS_NOT_DISTINCT · copy_quality. Two claim rules were added to safety:
- `statistic`: estudios demuestran, la mayoría de clientes, studies show, most customers…
- `promised_outcome`: más clientes, aumenta tus ventas, primer puesto en Google, boost your sales, rank higher…

Numbers and percentages were already blocked.

## 23. Differentiation Validation
The old `differentiationIssues` / `same_inventory` checks are replaced by the quality layer, which covers everything they did and more.

## 24. Controlled Quality Repair
- The cap is unchanged: one writer call plus one repair (`WRITER.maxCalls = 2`).
- The repair message lists the failed safety and quality rule ids, with plain explanations of each.
- It restates the three strategies and the grounding boundaries, and says "Improving the writing never permits new facts".

## 25. Safety Revalidation After Repair
The repaired output goes through `parseProposals` and the full `reviewSet` (safety and quality). The test case is a repair that improves style but adds "Nuestro ordenador portátil…" and "conseguirás más clientes"; it ends in GENERATION_UNSAFE and nothing is stored.

## 26. Failure Semantics
There is no loop; after the repair the pipeline fails closed:
- Quality-only failure: PROPOSALS_NOT_DISTINCT (an existing code), 422, stage `copy_quality` (new, narrow stage).
- Any safety failure: GENERATION_UNSAFE · output_validation.
- The client shows `generation_failed`.
- IMAGE_NOT_UNDERSTANDABLE, BUSINESS_IMAGE_MISMATCH and the AI_RESPONSE_INVALID taxonomy are unchanged.

## 27. Usage Accounting
Unchanged. A quality failure after billed model calls settles the reservation as `consumed`, so AI usage is counted. `complete` is not called, so the publication generation counter (x/4) does not increase. Both are verified by a test.

## 28. Persistence
The pipeline persists only when vision is usable, consistency is acceptable, safety is empty and quality is empty. Persistence is still the single atomic `complete`. Regeneration is unchanged (4-generation limit).

## 29. ES
Spanish narration patterns, generic CTAs, conversational markers, statistics and promised outcomes are all covered. The CASE 2 ES good set passes with zero issues.

## 30. EN
English equivalents are covered. The CASE 2 EN good set passes with zero issues, and EN statistic/outcome claims are flagged.

## 31. CASE 1 Non-Regression
The clothing-store photo for the marketing business still gives BUSINESS_IMAGE_MISMATCH after vision only, with no writer call and nothing stored. All A3.7.2.2 and A3.7.2.2.1 tests pass. The CASE 1 writer output is still rejected for safety and also triggers `repeated_objects` / `object_enumeration`.

## 32. CASE 2 Regression
The fixture is modelled on the real output:
- It is safe (`safety: []`) but fails `image_narration`, `object_enumeration`, `repeated_objects`, `name_repetition`, `generic_cta` and `same_message`.
- Old set → repair → good set gives 200, proposals_ready, 3 proposals.
- Old set twice gives PROPOSALS_NOT_DISTINCT · copy_quality, nothing stored, consumed, and a log containing only rule ids.

## 33. Other Business-Type Controls
Five pairs are tested: restaurant + food, salon + beauty, real estate + interior, retailer + store, trade + work. Each has its image_use asserted (direct_subject, thematic_inspiration or contextual_support). Ownership, availability, novelty and unsupported-offering claims about photo items are still flagged in each.

## 34. First Marketing-Graphic Failure Analysis
The earlier GENERATION_UNSAFE · output_validation on a marketing graphic cannot be reproduced without the provider content, which is correctly not logged. Graphics usually contain visible text with figures, offers or promises, which the safety rules block by design, so this is most likely a correct block. No rule was tuned to make it pass.

There is a separate false-positive risk: whole-word matches on everyday words. Found while writing tests:
- "cuesta" ("lo que te cuesta") is matched as `price`.
- "review" ("review how you come across") is matched as `social_proof`.

These were left unchanged, since changing them would weaken safety rules outside this scope. They can cause a needless repair or a fail-closed result, and are listed as known limitations.

## 35. Security
- No new secrets.
- Logs carry rule ids, image_use and the verdict only: no image, URL, prompt, provider response or copy text (tested).
- Auth, ownership, claim/reservation and JWT verification are unchanged.
- Business and image data are still declared as non-instructions.

## 36. Frozen-System Verification
- The pinned hashes are unchanged: normalize.ts `bd74629f`, entitlement.ts `f948d629`, index.ts `925eb2d8`.
- The A3.7.1 storage combined hash (`publication-media` + `migrations`) is `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973`, unchanged.
- The Meta, Social Intelligence, Hoy, Plan, GBP, billing and auth pinned suites pass.
- `relational.ts` is unchanged, and there is no frontend change.

Exact A3.7.2 files changed:
- `supabase/functions/publication-proposals/quality.ts` (new)
- `supabase/functions/publication-proposals/safety.ts`
- `supabase/functions/publication-proposals/context.ts`
- `supabase/functions/publication-proposals/prompts.ts`
- `supabase/functions/publication-proposals/handler.ts`
- `src/features/publications/__tests__/a3723CopyQuality.test.ts` (new)
- `src/features/publications/__tests__/a372ProposalsEngine.test.ts`: success fixtures rewritten without narration, `differentiation` → `quality`, stage → `copy_quality`.
- `src/features/publications/__tests__/a3722RelationalGrounding.test.ts`: success fixtures, `quality` assertions, prompt wording.
- `src/features/publications/__tests__/a37221ClassificationRouting.test.ts`: success fixture.

## 37. Tests
73 files, 2510 passed, 0 failed. No real AI calls; every model call is a deterministic fake.

## 38. TypeScript
`npx tsc --noEmit -p tsconfig.app.json` reports 20 errors, all legacy and unchanged.

## 39. Build
`npm run build` passes.

## 40. Deployment
Only `publication-proposals` was deployed. No frontend publish is needed.

## 41. Known Limitations
- Quality is measured with lexical heuristics, which cannot judge persuasiveness. A set can pass and still be average.
- The quality of real model output after this change is not yet verified. That is what the retest is for.
- Whole-word false positives (`cuesta` → price, `review` → social_proof) can trigger a needless repair.
- A repair costs one extra billed call; if it fails, the user sees a generic failure and the publication generation is not consumed.

## 42. Exact Manuel Retest Instructions
1. Business: Gopik.Digital.
2. Image: the same laptop/desk photo.
3. Language: Español.
4. Press generate once. Do not regenerate.
5. Send a screenshot of the CASE 2 result.

Expected: proposals_ready with three proposals. At most one refers to the photo, there are no object lists, the hooks and CTAs differ, and the name is not in all three. A fail-closed "generation failed" result is acceptable but should be reported.

## 43. Final Verdict
GO — A3.7.2.3 COPY QUALITY & CREATIVE DIFFERENTIATION READY FOR REAL RETEST

A3.7.2 is not frozen. Work stops here pending the real CASE 2 screenshot; A3.7.3, Meta publishing and the final UI have not been started.
