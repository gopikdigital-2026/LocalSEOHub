# A3.7.4.3 — Gate B.2 Part 1 — Manifest

## Changed files (sha256 was → now)

| File | Was | Now |
|---|---|---|
| supabase/functions/instagram-publishing/instagramPublish.ts | 9f7d1cd19e2c2f4809dff0f288367c245d311a2149bc6c8106ce24eefba15be6 | 5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca |
| src/features/instagram-publish/repository.ts | c0a98e2e7c09ca77b48b8da741a18a53402512d4b747b7bdd455aa61554a8f48 | 9b5f26d48f0ab2ea632ebe42d2c2247d49005eca292140ca4ea3d78a1fe190dd |
| src/features/instagram-publish/InstagramPublishHarness.tsx | 046ed09310b93ff4afa855ecadd600c0cbcaa093dcb201a31e3b08ad328079a7 | b7ea8c5c31b1002dd270c607d24c1fd3e3c99af89e9a8b92a863542651dbb4a9 |
| src/features/instagram-publish/copy.ts | 023100761bbb1e6652e6da2b356f7934c5288c21789427ce0d3192516a8af819 | fe8ce97b07d39fec6c312ef65057be2e2db83a304c6eda23b96faba9767884b9 |
| src/features/publications/__tests__/a3743InstagramGateA.test.ts (authorized re-pin) | a9b6fca21a90e5bc201048224bd6adc9e811222e31af8cf9248fd9d0e8415971 | d1b0c3d01d0c940a75fb90484d05b9fcd6f5927a851361a219e739e3a5306327 |
| src/features/publications/__tests__/a3743GateB2Part1Security.test.ts (new) | — | e045fe5baa91b331f9d283a3064b8584c120f193b591cc1cdf4f96266ed5f813 |
| supabase/functions-deploy-state.json (written by deploy tool; unpinned) | 88225290… | 33fd37ab0af2cf2b2714e832f85e486fb6a0aed97572274cfe64e5bddc871357 |

## Unchanged (verified)

| File | sha256 |
|---|---|
| instagram-publishing/index.ts | b782a99fbc4a9ba06fd78f69d04b09e37607b5649052eb2aa231a9155e5a2605 |
| instagram-publishing/shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd |
| instagram-publishing/graph.ts | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a |
| instagram-publishing/derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa |
| src/App.tsx | ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b |
| supabase/config.toml | fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a |
| migration 20261030232253 | 366493c40ef00561da1830f1ef1aa0f3f37ee46b784476d58371670b64482662 |
| meta-publishing/index.ts | 027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23 |
| meta-publishing/facebookPhoto.ts | 7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a |
| meta-publishing/facebookPublish.ts | 48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd |
| meta-publishing/handler.ts | b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb |

Pin cascade: none. Historical manifests not rewritten.

## Test evidence

Full suite 2937 pass / 0 fail (baseline 2913 + 24 new). tsc 20 inherited / 0 new. Build OK. Details in TEST_REPORT.

## Deploy state

- Deployed: `instagram-publishing` only (verify_jwt true). `meta-publishing` not redeployed.
- Secrets present: no `META_INSTAGRAM_REAL_PUBLISH_ARMED`, `..._USER_IDS`, `..._PUBLICATION_IDS` → fully disarmed.
- Probes (publish / verify / status on C): no JWT → 401; anon key → 401 `AUTH_REQUIRED`; OPTIONS → 200.

## Production safety (post-deploy)

| Check | Result |
|---|---|
| Facebook attempts | 1 total, 1 succeeded (historical) |
| Instagram attempts | 0 |
| UNKNOWN / publishing attempts | 0 |
| A updated_at | 2026-10-27 23:05:19.287086 (unchanged) |
| B updated_at | 2026-10-28 12:27:05.291163 (unchanged) |
| C updated_at | 2026-10-30 00:13:08.946825 (unchanged) |
| Publication D | none (17 publications; latest created 2026-10-30 00:12:00, pre-existing) |
| Buckets publication-images / instagram-derivatives | both private |
| Derivative objects | 0 |
| Real /media, /media_publish, posts | none |

## Verdict

GO — A3.7.4.3 GATE B.2 PART 1 SECURITY READY; REAL INSTAGRAM E2E NOT AUTHORIZED
