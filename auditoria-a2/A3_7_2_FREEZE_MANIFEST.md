# A3.7.2 — FREEZE MANIFEST

- **Freeze date:** 2026-10-26
- **Frozen phase:** A3.7.2, Publications Photo Intelligence & Grounded Three-Proposal Engine. It includes the sub-phases A3.7.2.1A, A3.7.2.1A.1, A3.7.2.2, A3.7.2.2.1 and A3.7.2.3.
- **Freeze gate:** `A3_7_2_4_PUBLICATIONS_PHOTO_INTELLIGENCE_REAL_E2E_FINAL_AUDIT_AND_FREEZE.md`
- **Status:** FROZEN, effective only if the gate verdict is GO.

## Frozen files (SHA-256)

### Engine: Edge Function `publication-proposals`
| File | SHA-256 | Purpose |
|---|---|---|
| supabase/functions/publication-proposals/handler.ts | e975d73e7f545051f261498885778f25bc1dd618817d75b65972cf299b91f255 | Pipeline orchestration (vision → usability → envelope → consistency → writer → safety and quality → repair → persist → settle). Also the error taxonomy and the claim/reserve/settle lifecycle. |
| supabase/functions/publication-proposals/index.ts | 925eb2d846145e19875c6ded48004b5c62695335dff8a5bde27ef01401e9b53b | Deno entry point. Wires the dependencies: DB RPCs, private storage download and the OpenAI call (strict json_schema, AbortController timeout). |
| supabase/functions/publication-proposals/context.ts | 0737fde722c8c37e9b15a9c7c4c1b83c81798fb480d0f3148ce95e8707cd3beb | Business-facts trust policy, vision parser, insufficiency check, grounding envelope, consistency and image use, mismatch notice. |
| supabase/functions/publication-proposals/prompts.ts | 750d16f3594a13ecedd0150ee8e6bd1e2bff21a75157aa1784fc64f926e12c8a | Vision, writer and repair prompts and JSON schemas. Treats all inputs as data and never as instructions. |
| supabase/functions/publication-proposals/safety.ts | ac0efae62dfbfa3c19903731bda57f20223e3ccc8f141ea26ef11f3d8a7f97a0 | Exactly-three parser (direct, close, professional), CLAIM_RULES, ALWAYS rules, number, emoji and language checks, reviewSet. |
| supabase/functions/publication-proposals/relational.ts | 489d7fd8c8839b5f345af253e096ef83a94b3d3d738e219f681e2f3e6af906fc | Relational safety (unsupported_possessive, unsupported_offering, location_composition) and repair guidance. |
| supabase/functions/publication-proposals/quality.ts | 158f3fd7d3a7723edffb54bbea17047c5837dbc966d2de3bdea9a12f69106288 | Deterministic copy-quality and differentiation rules. |
| supabase/functions/publication-proposals/normalize.ts | bd74629fd5d3b740942e95be2e745cc98e2155fe75fd1031742096d7177289a0 | Byte-identical copy of the A3.7.1 normalizer. Used for the fixed-point check before any AI call. |
| supabase/functions/publication-proposals/entitlement.ts | f948d629f5408537ff9b1c776a5a3ede9d292839923937a69bd5ddf52ea30fd5 | Shared premium and auth gate, identical across the AI functions. |

### Data layer (persistence, accounting, storage)
| File | SHA-256 | Purpose |
|---|---|---|
| supabase/migrations/20261025152315_a371_publications_data_storage_foundation.sql | ab9114d8110dc4493fccca330ac31fe73c38395a625b98b4cc72ce30cc75b5b7 | A3.7.1: `publications`, private `publication-images` bucket, path CHECK, RLS, storage SELECT policy. |
| supabase/migrations/20261025161526_a372_publication_proposals_engine.sql | 8f74c30ff935f77da1dcba3a1c7c982c79a2dc6b76c31e8b7b18c1b9cfcab6ee | `publication_proposals`, claim, release and complete RPCs (atomic, exactly 3), generation limit 4, image-change trigger, ledger function registration. |

### Upstream A3.7.1 media function (dependency, already frozen)
| File | SHA-256 |
|---|---|
| supabase/functions/publication-media/handler.ts | a502fd1d26426516a8706c401b43bbe9e5309db31d69af4d506f1e92de8caeae |
| supabase/functions/publication-media/index.ts | 3c76e77cd8b0615fa313853066c46928e4a9958c4706ea47021a98f8647d9d86 |
| supabase/functions/publication-media/normalize.ts | bd74629fd5d3b740942e95be2e745cc98e2155fe75fd1031742096d7177289a0 |

Combined hash of the A3.7.1 storage files (`find supabase/functions/publication-media supabase/migrations -type f | sort | xargs sha256sum | sha256sum`): `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973`

### Client contract
| File | SHA-256 | Purpose |
|---|---|---|
| src/features/publications/repository.ts | e5ddd8bb80df97c211a47f876d14913e6c2e8e5b62931f4f18ba6c05e962c0e5 | Upload and generate calls, mapping of server codes to client codes, sanitized diagnostic, mismatch parsing. |
| src/features/publications/types.ts | 9f5ac9a2bf1908644e70ca41884abc23b6890a0be79189dc181ac285585991cf | Publication, proposal, error and diagnostic types. |
| src/features/publications/validation/PublicationsValidationPage.tsx | 1eb1a91eda49dcaaba496acb7072131c153bd022de0e87a637100584c61bbad0 | Temporary internal harness. Not customer UI. A3.7.3.4 RESUME RE-PIN (authorized): was 4754251850c7c2d0ea75a38258445718aff1c689f876af214205b840294a726c; now reads the single URL-backed publication identity. |
| src/features/publications/validation/copy.ts | faa38cd547814aa9054d73052daf0d2f61062291fa766e88bbbdada209070110 | Harness texts (ES/EN). |

### Tests that define critical behaviour
| File | SHA-256 |
|---|---|
| src/features/publications/__tests__/a371PublicationsMedia.test.ts | cc49ccdbd72711824c5a312d2fde53e8ffe5e70429cd323142c3a148edac7c0a |
| src/features/publications/__tests__/a371PublicationsRepository.test.ts | 5a915591d58138f8372543a05c6a303490df4b56c1f9c7995a963b9a5bc0a12a |
| src/features/publications/__tests__/a37211aUploadBytes.test.ts | 30e0da757f206eb117a04839c89ff0eb33ea118aa46371c151fb2dc2dcc394df |
| src/features/publications/__tests__/a3721aValidationHarness.test.ts | c20a942e4e8cad4a2c8514e2e258050bc0bd64ee2deb2c966ffcd7854ee306cc |
| src/features/publications/__tests__/a37221ClassificationRouting.test.ts | 1cf94bbc2c429769e1acdb568e23f6fb904211db276e702771ebc3da9d84e8f2 |
| src/features/publications/__tests__/a3722RelationalGrounding.test.ts | ff83675a139a3589b351401e4149078d45b617b9cca4623436e67547344154cb |
| src/features/publications/__tests__/a3723CopyQuality.test.ts | c020f3b6b97bf27df447f7063638efad88ae00ed4098234dabc51466c60a2cb3 |
| src/features/publications/__tests__/a372Normalization.test.ts | 68220b8d451956352f525134d60d5a588191adbdaf1bc1d304495d0c43c5a9c2 |
| src/features/publications/__tests__/a372ProposalsEngine.test.ts | 2194087b4585628370b88c8b56659eabef2213176c72ced5985dc4e86be1feac |
| src/features/publications/__tests__/a372ProposalsGuards.test.ts | 7f04876fd1601910d2bcdc026d0ea9f4622db5f26f5aa66b5ea6d6427654d574 |

### Deployed state reference (`supabase/functions-deploy-state.json`)
| Function | Deploy-state hash | hasChanged |
|---|---|---|
| publication-proposals | eae70ea4512cb7b6b1b93daa56f0ce0bb9af2e0a4b1e4b9f0ad5a257da9a5a49 | false |
| publication-media | 1c9e7886bfa0853c7a77f883b6667dbe91f503d70cdbfe47fcd30009f7bc3005 | false |

## Critical invariants

1. **Private image handling.** The bucket `publication-images` is private. It accepts JPEG/PNG only, up to 8 MiB. Paths follow `{user}/{business}/{publication}/{uuid}`. Signed-in users can only read their own current image, and all writes happen on the server. Images reach the AI only as an in-memory base64 data URL of the normalized bytes. No signed or public URLs are used.
2. **Business ownership.** Every load and RPC is filtered by the JWT-verified `user_id`. Business facts come only from server-side `businesses` columns. The request body accepts exactly `{publication_id, request_id, lang}`.
3. **Mismatch blocks the writer.** `MATERIAL_MISMATCH` returns `BUSINESS_IMAGE_MISMATCH` (stage `business_consistency`) before any writer call. Nothing is persisted and the counter does not change.
4. **No unsupported image/business relationship.** Relational rules (`unsupported_possessive`, `unsupported_offering`, `location_composition`) and the claim rules are enforced on every proposal.
5. **Exactly 3 proposals.** The parser requires 3 proposals in role order direct, close, professional. The SQL function checks `jsonb_array_length = 3`, and a CHECK ties each role to its position.
6. **Fact safety before persistence.** Any safety issue fails closed with `GENERATION_UNSAFE`.
7. **Copy quality before persistence.** Any quality issue fails closed with `PROPOSALS_NOT_DISTINCT`. Safety failures take precedence over quality failures.
8. **Maximum controlled repair.** `WRITER.maxCalls = 2`: one initial call plus at most one repair. Vision is capped at 2 calls.
9. **Revalidation after repair.** Repaired output goes through `parseProposals` and the full `reviewSet` again (safety and quality).
10. **Atomic persistence.** A single `complete_publication_generation` transaction locks the row `FOR UPDATE`, checks the claim, image and limit, replaces the set, sets `proposals_ready` and increments the counter.
11. **Generation and accounting integrity.** The counter increments only on a successful save, up to a limit of 4. The ledger reserves per request and settles as completed, consumed or released. Claims block concurrent generation, and a duplicate `request_id` is rejected.
12. **No Meta or Google publishing.** There are no Graph or GBP posting calls and no new permissions.
13. **No channel adaptation.** The proposals are channel-neutral.
14. **ES/EN contract.** `lang ∈ {es, en}` is enforced in the handler and the DB, and output language is enforced by the `language` safety rule.

## Change control
Any change to a frozen file requires:
- an explicit reason;
- a regression analysis;
- an updated hash in this manifest;
- tests;
- re-freeze documentation.

A3.7.3 must build on top of this engine without editing these files casually.
