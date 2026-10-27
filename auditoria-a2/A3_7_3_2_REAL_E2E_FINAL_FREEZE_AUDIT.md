# A3.7.3.2 — REAL E2E POST-VALIDATION & FINAL FREEZE AUDIT

Scope: this is a read-only audit of the first real production adaptation. No new adaptation was generated. The publication, the draft, subscriptions and frozen files were not mutated. The offline validator re-run used a scratch directory inside the project, which was removed afterwards.

## 1. Executive verdict

**GO — FREEZE A3.7.3.2 CHANNEL ADAPTATION ENGINE**

The real end-to-end run reached its intended terminal state:
- one atomic draft write;
- one completed ledger reservation;
- exactly one unit of usage counted, both per publication and per month.

The stored texts pass the production validators with zero issues. All frozen production baselines are byte-identical, the suites pass (2649/2649), tsc stays at baseline 20 and the build passes. No blockers.

## 2. Real E2E evidence

The run was performed once by the operator on the active Premium account (mjpmontes1969@gmail.com, business "Gopik.Digital"):
1. Image uploaded.
2. 3 proposals generated.
3. Proposal 1 ("Directa") selected.
4. "Adaptar para Facebook e Instagram" clicked once.

What the UI then showed:
- version 2;
- adaptations used 1/3;
- adapted_at 2026-10-27T23:08:42.459329+00:00;
- lang es.

The DB confirms every one of these values (§3).

## 3. DB evidence (IDs redacted)

| Item | Value |
|---|---|
| Drafts for this publication | 1 (`65569535…`), owner is the active account |
| source_position / role / lang | 1 / direct / es |
| version / adaptations_used | 2 / 1 |
| selected_at → adapted_at | 23:07:45.349741 → 23:08:42.459329 |
| adaptation_claim_id / claimed_at | NULL / NULL (claim released) |
| source_generation_id | equals publications.proposal_generation_id |
| facebook_generated = facebook_text | true |
| instagram_generated = instagram_text | true (one atomic write) |
| Publication status / updated_at | proposals_ready / 23:05:19.287086 (proposal time; adaptation did not touch the publication) |
| Publication proposal_generations_used | 1 |
| Image | normalized, image/jpeg |
| Proposals | exactly 3, all in the current generation |
| Draft source vs proposal 1 | body and CTA byte-identical |

## 4. Usage evidence

- The user has 2 ledger reservations today, both `completed`:
  - publication-proposals, 23:05:13 → 23:05:19;
  - publication-adaptation, 23:08:40.238 → 23:08:42.522.
- There are 0 pending reservations globally (nothing leaked).
- Monthly row 2026-10: proposals_used 1, publication_adaptations_used 1.
- Global adaptation reservations: 1 completed, which equals the monthly sum (1).
- Monthly cap is 20 for adaptations and 20 for proposals. The per-publication limit is 3, and this run used 1/3.
- The ledger function CHECK includes `publication-adaptation`.

## 5. Safety / grounding

**Stored Facebook text:**
"¿Necesitas impulsar tu estrategia de marketing?\n\nEn Gopik.Digital, estamos aquí para ayudarte a alcanzar tus objetivos.\n\nEscríbenos para más información. 📩"

**Stored Instagram text:**
"¡Impulsa tu estrategia de marketing! 🚀\nEn Gopik.Digital, te ayudamos a alcanzar tus objetivos.\nEscríbenos para más información.\n#GopikDigital #Marketing"

The operator transcribed the Facebook emoji as 📥, but the stored value is 📩. The difference is cosmetic.

Offline re-run of the production validators (adaptation, safety, quality, relational) on the stored texts:

| Check | Result |
|---|---|
| parse / safety issues / quality issues | ok / [] / [] |
| Price, offer, hours, availability, location, results, booking claims | none |
| Digits / numbers | none |
| Facebook hashtags | 0 |
| Instagram hashtags | 2 (≤5), both grounded: business name and category |
| City hashtag (San Pedro de Alcántara) | absent; the city is not sent to the model |
| Facebook vs Instagram similarity | 0.5625 (limit ≤0.8, so the channels are differentiated) |
| Facebook vs source similarity | 0.6087 |
| Emoji count | Facebook 1 (limit 1, direct); Instagram 1 (limit 2) |
| CTA | "Escríbenos para más información." equals the source CTA |

Facebook keeps the source's question-led paragraph structure. Instagram is shorter, uses line breaks and an exclamation hook, and adds hashtags, so the differentiation is meaningful.

## 6. Image non-resend proof

- Code: the prompt payload contains only `source_post {body, call_to_action}` and `business {name, category, services}`. The adaptation context envelope carries an empty visual block.
- There are no reads from storage, no signed URLs, no image_path, no base64 and no image_url anywhere in the edge function or the client feature (grep: 0 hits).
- The OpenAI request is text-only chat completions.
- The publication image and updated_at are unchanged since proposal generation.
- Guard tests assert that the prompt contains no image, URL or storage reference.

## 7. Concurrency / stale protection (tests and code only)

Concurrency is serialized in the claim function:
- `claim_publication_adaptation` takes `FOR UPDATE` on the draft;
- it returns `busy` while a claim is under 3 minutes old;
- it returns `stale` when the source generation ≠ the current generation;
- it returns `limit` when used ≥3, plus `not_found` / `not_ready` / `no_selection`.

Completion re-checks under lock in `complete_publication_adaptation`:
- `claim_lost`, stale and limit are checked again;
- length CHECKs apply;
- one UPDATE writes both channels, version+1 and used+1.

Invalidation and cleanup:
- The A3.7.3.1 trigger invalidates the draft when proposal_generation_id or image_path changes.
- The handler `finally` always settles (completed / consumed / released) and releases the claim. The real run shows the claim cleared and 0 pending reservations.

Covered by tests: busy, stale, limit, claim_lost, release on failure, and repair/second-call paths. These live in a3732AdaptationEngine and a3732AdaptationAdversarial.

No destructive production experiments were run.

## 8. Auth / Premium / ownership

- `requirePremium` (server, `authorize_premium_request`) runs before any work.
- The successful run used the active subscription. The earlier failure on the expired trial account confirms the gate is enforced server-side.
- The input must be exactly 3 keys, all UUIDs, ≤1024 bytes. Business and publication are loaded owner-scoped. The proposal text is read from the DB and never from the client.
- These functions are SECURITY DEFINER with no EXECUTE for anon or authenticated (service_role only): claim, release, complete, reserve, settle and authorize_premium_request.
- `publication_drafts`:
  - authenticated has SELECT on own rows only, and no INSERT, UPDATE or DELETE;
  - anon has no SELECT.
- No subscription was modified.

## 9. Frozen fingerprint comparison

| Baseline | Result |
|---|---|
| A3.7.2 manifest | 28 / 28 OK |
| A3.7.3.1 manifest | 4 / 4 OK |
| A3.7.1 storage/migration fingerprint (excl. `_a3731_`, `_a3732_`) | `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973`, equal to the documented value |
| A3.5.4.2.1 production files | 10 OK |
| A3.5.4.3.1 production files | 18 OK |
| A3.5.4.4.2 (Hoy/Plan integration) | 19 OK |
| A3.5.5.0 | 8 OK |
| Edge deploy state | 0 functions pending |

The only hash differences against the old A3.5 pins are guard/inventory test files and App.tsx. All of them are documented, legitimate inventory re-pins and not production mutations:

| File | Documented in |
|---|---|
| a3542, a3543, a3544, a273, a272, a281, a33 tests | A3.7.3.2 report §15; A3.7.3.1 report; A3.7.2.1A report (migration count 52→53, `_a3731_` / `_a3732_` exclusions, route counts) |
| App.tsx (`f4523a4d…e2d5`) | re-pinned in A3.7.2.1A and A3.7.3.2 (harness panel) |
| a351MetaConnection.test.ts | A3.5.5.2 report line 553 (Terms byte pin `5b43eaa9…` → `76a07dc6…51a3`) |

There are no unexpected frozen-file mutations. File mtimes are uniformly 23:10:01, which is consistent with a workspace sync and not an edit; the content hashes are authoritative.

## 10. Tests

- `src/features/publications`: 14 files, **394 / 394 passed**.
- Full suite: 77 files, **2649 / 2649 passed**, 0 failures.

## 11. tsc baseline

`tsc --noEmit -p tsconfig.app.json`: **20 errors**, equal to the baseline. 0 new.

## 12. Build

`npm run build`: **PASS**.

## 13. Security

- The built bundle contains no OpenAI keys (`sk-…`), service-role references, Meta tokens (`EAA…`) or Meta app secret: 0 files matched.
- The edge function uses the service-role key and OPENAI_API_KEY server-side only.
- The adaptation path has no signed URLs, permanent or temporary.
- There is no cross-tenant injection: the publication and business are loaded with owner checks, and the client cannot pass business_id.
- There is no arbitrary proposal text: the client sends only IDs, and source text comes from the stored proposal.
- Model output is rendered as plain text. Markup and leak checks reject HTML, URLs and prompt leakage.

## 14. Scope

The only grep hits for publishing or scheduling terms are the safety deny-rules ("schedule" in the context trust map and the hours regex). There are:
- no Graph API, `/feed` or `/media_publish` calls;
- no new Meta permissions;
- no OAuth changes;
- no Google publishing;
- no scheduling or calendar;
- no stories, reels, video, multi-image or auto-publish;
- no customer-facing Publications UI;
- no Tu semana.

The panel exists only inside the internal validation harness.

## 15. Files created / modified by A3.7.3.2

**Created:**
- `supabase/migrations/20261027165527_a3732_publication_adaptation_engine.sql`
- `supabase/functions/publication-adaptations/`: `index.ts`, `handler.ts`, `adaptation.ts`, `prompts.ts`, `context.ts`, `safety.ts`, `relational.ts`, `quality.ts`, `entitlement.ts` (9 files; the validator copies are hash-identical to A3.7.2 and enforced by tests)
- `src/features/channel-adaptation/`: `ChannelAdaptationPanel.tsx`, `copy.ts`, `repository.ts`, `types.ts`
- `src/features/publications/__tests__/`: `a3732AdaptationEngine.test.ts`, `a3732AdaptationAdversarial.test.ts`, `a3732AdaptationGuards.test.ts`, `fixtures/a3732Adaptation.ts`
- Reports: `A3_7_3_2_CHANNEL_ADAPTATION_ENGINE_SAFETY.md`, `A3_7_3_2_INTERNAL_VALIDATION_PREMIUM_GATE_HOTFIX.md`, and this report

**Modified:**
- `src/App.tsx` (harness placement only)
- `supabase/config.toml` (`[functions.publication-adaptations] verify_jwt = true`)
- Guard and inventory test re-pins: a281, a33, f03, a273, a272, a3542, a3543, a3544 and a23 (see the A3.7.3.2 report §15)

## 16. A3.7.3.2 freeze fingerprints (sha256)

| File | sha256 |
|---|---|
| migrations/20261027165527_a3732_publication_adaptation_engine.sql | `04e4d0af14d2778ca777d59477869b676684b682b7302370a8a728e3fd75f605` |
| publication-adaptations/adaptation.ts | `b2d277d3a9bb2dbabfd1dd18a6c2a8bef4f8ee944a5bf5fdb85937a692f0d29a` |
| publication-adaptations/context.ts | `0737fde722c8c37e9b15a9c7c4c1b83c81798fb480d0f3148ce95e8707cd3beb` |
| publication-adaptations/entitlement.ts | `f948d629f5408537ff9b1c776a5a3ede9d292839923937a69bd5ddf52ea30fd5` |
| publication-adaptations/handler.ts | `f213b671ac3721957736d257f33868feca1558e1ec5f205384862dd5702cda5e` |
| publication-adaptations/index.ts | `4f1db457b20cf59f1d40a86c046d7e5ad89a774efeec18df226d9feacb241999` |
| publication-adaptations/prompts.ts | `fa0f123168585df6a947f1d84bd0c1425125bf98e3daa865bdb3ee0944dce662` |
| publication-adaptations/quality.ts | `158f3fd7d3a7723edffb54bbea17047c5837dbc966d2de3bdea9a12f69106288` |
| publication-adaptations/relational.ts | `489d7fd8c8839b5f345af253e096ef83a94b3d3d738e219f681e2f3e6af906fc` |
| publication-adaptations/safety.ts | `ac0efae62dfbfa3c19903731bda57f20223e3ccc8f141ea26ef11f3d8a7f97a0` |
| channel-adaptation/ChannelAdaptationPanel.tsx | `f3d7f22da5cf3cfc1ba9a1f6f7130dcb5abce263b7573469b6cfbff5e8cbb6ea` |
| channel-adaptation/copy.ts | `aa04e4767103c92997b91282e93ccff8e322b5df98111924784ac828855b261b` |
| channel-adaptation/repository.ts | `d4a46bd50d6510cc5f856a9c9c3865480f4c06c3f8ee114f05ffc0fb9801d288` |
| channel-adaptation/types.ts | `2a46a61f18188b9a5dab19b4bf4d82c52ef30ffc22d388043c8e31d58568f82e` |
| __tests__/a3732AdaptationAdversarial.test.ts | `4fc044f42cc43a89c4029b786f49b36d288ec3da8356820810662fba661ee36e` |
| __tests__/a3732AdaptationEngine.test.ts | `a37a501fccc54fbc43452467b7ba124a14e1b23ad04aa093800b743b00bfb9ff` |
| __tests__/a3732AdaptationGuards.test.ts | `a4887a5924e6083ea5eb7ff9ee9594d7f079464d80db9983987a4599e22ce2a1` |
| __tests__/fixtures/a3732Adaptation.ts | `42e00d70640d8252dc467dd40f3b8d418102df5007c443e2a74d91165c514a67` |
| src/App.tsx (at freeze) | `f4523a4d043ae93b072c58b9f48201f68035119ef160802f50d15358f7a1e2d5` |
| Storage/migration fingerprint (excl. `_a3731_`, `_a3732_`) | `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973` |

## 17. Limitations / debt and next-phase recommendation

**Limitations and debt:**
- Only 1 real run was observed: Spanish, the "direct" role, and a business with empty services. The professional and close roles and other languages are covered by tests only.
- Concurrency was validated through code and tests, not through a live race.
- With services empty, Instagram hashtags can only draw on the name and category, so the variety is narrow.
- The panel is internal-harness only, and there is no customer-facing editing flow yet.
- The validator copies are duplicated per edge function by design. Drift is caught by the hash-identity guard tests.
- The A3.5 pin documents still list the old test and App hashes. They are superseded by the re-pin tables cited in §9.

**Recommendation:** proceed to **A3.7.3.3** (the next step on top of the frozen adaptation engine: review/edit of the adapted channel texts within the internal harness, still without publishing). It has not been started.

---

**GO — FREEZE A3.7.3.2 CHANNEL ADAPTATION ENGINE**
