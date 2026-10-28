# A3.7.4.2 — GATE A — CODE READY

**This is NOT a FINAL FREEZE.** A3.7.4.2 can only be FINAL FROZEN after an explicitly authorized Gate B real Facebook E2E passes.

Baseline: A3.7.4.1 FINAL FROZEN (2780/2780 tests, 20 inherited tsc errors, build PASS).
Gate A result: 2835/2835 tests (81 files), 20 inherited tsc errors / 0 new, build PASS, `meta-publishing` deployed, real-publish gate OFF (no `META_FACEBOOK_REAL_PUBLISH_*` secrets), 0 attempts, 0 consent states, 0 real posts.

## 1. New files (SHA-256)

| File | SHA-256 |
|---|---|
| supabase/functions/meta-publishing/facebookPhoto.ts | 7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a |
| supabase/functions/meta-publishing/facebookPublish.ts | 48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd |
| src/features/facebook-publish/repository.ts | 4242ea4c38c91b010a1bfd1d624f71c0edd2fc7e076cea32df127bc7f3a4ba20 |
| src/features/facebook-publish/copy.ts | b672f159ace046d90c8c3c6135e5831dff2a23767bb3194214db9832074d26a9 |
| src/features/facebook-publish/FacebookPublishHarness.tsx | 78cc2a49ef4d599b0858a99674fc30a07a440644b4e87ffb8827b03708647a1b |
| src/features/publications/__tests__/a3742FacebookPhotoPublishing.test.ts | 8542f77b8bab82646f484036ef2cbda02cb92521aa165aa8ff1b55e556f66cad |
| auditoria-a2/A3_7_4_2_FACEBOOK_SINGLE_PHOTO_PUBLISHING.md | fcab5d4d6f14d0dc8eeccb7e8141195c3fc9df6fc480a450cbd114a9b3afc66a |

## 2. Unchanged frozen files (verified byte-identical)

| File | SHA-256 |
|---|---|
| supabase/functions/meta-publishing/handler.ts | b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb |
| supabase/migrations/20261028132929_a3741_meta_publishing_security_foundation.sql | 42db6849eabf35b0d4c190b64178d531521d29e7e299fadd11dd90e9615dc79c |
| supabase/migrations/20261028133311_a3741_publishing_consent_decline_guard.sql | 37823afc968af172c784c3babdce917e1836147327582cec95445b639b88a6c1 |
| supabase/config.toml | f6a6e3e14a1840fe0a48137a648f036e6d7029269b37e6cd00f7cad0904f385a |
| supabase/functions/meta-oauth-callback/handler.ts | e59f91dbc235c13edcee9af708ca26dc0a92b2ecc5232217a66d3a1ef8564b48 |
| supabase/functions/meta-connection/handler.ts | 57e8341fbb5172329b5aa71ff9bf70b77256ac86184d24e58bab24c261097ada |
| supabase/functions/meta-read/handler.ts | 987cc94b1490ac79204280669e8d1f9834822bbd095f618ea6e3d912653e6166 |
| src/features/publications/__tests__/a3721aValidationHarness.test.ts | c20a942e4e8cad4a2c8514e2e258050bc0bd64ee2deb2c966ffcd7854ee306cc |
| auditoria-a2/A3_7_2_FREEZE_MANIFEST.md | ced8edffe1020456cbe645c62991f310eb910a74d4e29d3fd6a77bba9fba917a |
| auditoria-a2/A3_7_4_1_FREEZE_MANIFEST.md | ee28cd0e9f1a52e75d9e67b49ab3a96ee6d0ce4d10c142cb95efc9313851e907 |

No migration was added or changed.

## 3. Authorized re-pins

| File | Old SHA-256 (A3.7.4.1 final) | New SHA-256 | Reason | Behavioral impact | Proof |
|---|---|---|---|---|---|
| supabase/functions/meta-publishing/index.ts | 8c60b5287e50c612b32969639e77c42a9ae64d1412726fb1441dcdc4e3b260be | 027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23 | Routes `facebook_publish_status` / `facebook_publish` to the new handler and supplies its server deps (vault token read, service-role private download with size cap, begin/finish RPCs) | All existing A3.7.4.1 actions still go to the frozen `createHandler`; new actions are gated OFF | a3741 suite PASS; a3742 tests 15–44 |
| src/App.tsx | 7902658f9f56ad9db1059bf7111cd3b9ee786256f10b19ff0ac48b3e8d8b94ba | 81b0de7cf84a5105ce09ec865c9180b5611651331f97ca5584cda84fd6e27692 | Lazy-mounts the internal Facebook harness on the existing hidden `/internal/publications-validation` route | No new route; no customer-visible change | a3742 test 43; a281/a273/a272/a3544 pins |
| src/components/__tests__/a281TrustCleanup.test.ts | 5dec386ec1da6cf6859b0bc569918e082ed494a9bc5f34e869813bb6f641dcee | 0b69351e18bf72cd42cf207a6dd92f5b947bbbe71fdf394b7608228905f90fbc | App.tsx hash pin follows the change above | Test-only; guard strength unchanged | PASS |
| src/features/roadmap/__tests__/a273Roadmap.test.ts | 2f3281bb3976732f1df8c6c5691c372d11919671a8ed1c74d67792be0d3cef5f | 7b8b10b6c5f54e6a007941b48417d5826a4739c9545037a2415b433a66452a06 | App.tsx hash pin | Test-only | PASS |
| src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts | aa4e95245b5b187877840b8cbff21858c4b2ad3381d97e5934ebfbc7508d7f9c | 5c8006c55ec6df48cd881e10c6fec046559bc835f120c2ee3ac55807f2dfdfcc | App.tsx hash pin | Test-only | PASS |
| src/features/social-intelligence/integration/__tests__/a3544SocialIntegration.test.ts | e85d466ffe39ff2797ffc9505d44fa5a25261df955d38a465f0d54d9b12c8c08 | cf7c8076b0ccab9166b522990cba151c7582f5f43bde4a9ae4b59308f297a120 | App.tsx hash pin | Test-only | PASS |
| src/features/publications/__tests__/a3733ChannelReview.test.ts | 6a528660c5ccc30163e9757e7241378920c0d531fdc11fd4af14a4873859785b | eb212294494c2799e93acb7adeb0827c80f6b04a8110df31f52caa063dfa1b8e | Test 29 allows the `/photos` edge only inside `facebookPhoto.ts`; `media_publish` stays forbidden everywhere | Test-only; still blocks any other publish edge | PASS |
| src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts | 9689187412577a38d985db751032d3abf07ff7f296af85ffca4ec75b581b72eb | 41764ac85db8a3394ab943f67d88535be2225637582a703ac7a5e8776910ca0a | K-block `AUTHORIZED_REPINS` records the A3.7.4.2 re-pins and the new `index.ts` hash | Test-only; any unlisted drift still fails | PASS |

## 4. Deployment

`meta-publishing` is deployed with the code above. Arming secrets are absent, so `facebook_publish` returns `REAL_PUBLISH_DISABLED` for every caller.

## 5. Verdict

GO — A3.7.4.2 GATE A CODE READY; REAL FACEBOOK E2E NOT YET AUTHORIZED
