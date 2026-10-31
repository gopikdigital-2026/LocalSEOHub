# A3.7.4.3 — Gate B.1 — Manifest

**Date:** 2026-10-31
**Baseline:** Gate A, ZIP (27)
**Verdict:** **GO — A3.7.4.3 GATE B.1 READINESS COMPLETE; REAL INSTAGRAM E2E NOT AUTHORIZED**

## 1. Files added in Gate B.1

There are documentation and asset files only. No source, test, migration, config or historical manifest was changed.

| File | sha256 |
|---|---|
| auditoria-a2/A3_7_4_3_GATE_B1_INSTAGRAM_E2E_READINESS.md | 3f9d4d02558185e7ade433b453881a426ea7d42347cdd50dc4af59261eab16bb |
| auditoria-a2/A3_7_4_3_GATE_B1_EXECUTION_PROTOCOL.md | f79bdd0253dc2c391f4454bd338d8981bbb2e14c86935106c7f766b1216f40dd |
| auditoria-a2/gate-b1-assets/a3743-publication-d-test-image.png | 6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7 |
| auditoria-a2/A3_7_4_3_GATE_B1_MANIFEST.md | (this file) |

The test image is stored only in the audit folder. It is not under `public/`, so it is not served by the site and has not been uploaded to storage.

## 2. Frozen and Gate A files — verified byte-identical (2026-10-31 15:10:06 UTC)

**A3.7.4.2 Facebook (frozen)**

| File | sha256 |
|---|---|
| supabase/functions/meta-publishing/facebookPhoto.ts | 7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a |
| supabase/functions/meta-publishing/facebookPublish.ts | 48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd |
| supabase/functions/meta-publishing/handler.ts | b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb |
| supabase/functions/meta-publishing/index.ts | 027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23 |
| src/features/facebook-publish/FacebookPublishHarness.tsx | 78cc2a49ef4d599b0858a99674fc30a07a440644b4e87ffb8827b03708647a1b |
| src/features/facebook-publish/copy.ts | e47fa991449289ca8986828f168c4e052bdfb67877ea7aa6c263d29aeb70ce20 |
| src/features/facebook-publish/repository.ts | 4242ea4c38c91b010a1bfd1d624f71c0edd2fc7e076cea32df127bc7f3a4ba20 |
| src/features/channel-review/ChannelReviewPanel.tsx | 0dc3a0e50b5f61c69d458313a5a7f9a672616af9f81906c32618239b8025f4be |
| src/features/publication-resume/PublicationResumeProvider.tsx | d8af68702d5b54e4f62d8720a05e190a6c2bbbc31fa2f699feb0741aa6f6c499 |
| src/features/publishing-access/PublishingAccessControl.tsx | a383269fed1986ad2ba1ab4a53b7e1d20a20d0f21b8e8e5a695a76d7798eadf0 |
| src/features/publishing-access/copy.ts | a692420d0e89f09798ddca65ceae7c318637cec30221bb4179da7c9b0954972c |
| src/features/publishing-access/model.ts | 9a208058c363b88b707c964ae5e9ff09f9098338deb21de80ba2adf5753c1d39 |
| src/features/meta-connection/metaPublishingRepository.ts | 132b1fa4ffcb8a29afe7e048e40e97c4ba1c580359ad682d6aad21eeaa55b360 |
| src/features/publications/validation/PublicationsValidationPage.tsx | 1eb1a91eda49dcaaba496acb7072131c153bd022de0e87a637100584c61bbad0 |
| src/features/publications/__tests__/a3742FacebookPhotoPublishing.test.ts | 8542f77b8bab82646f484036ef2cbda02cb92521aa165aa8ff1b55e556f66cad |

**A3.7.4.3 Gate A (unchanged in B.1)**

| File | sha256 |
|---|---|
| supabase/functions/instagram-publishing/derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa |
| supabase/functions/instagram-publishing/graph.ts | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a |
| supabase/functions/instagram-publishing/index.ts | b782a99fbc4a9ba06fd78f69d04b09e37607b5649052eb2aa231a9155e5a2605 |
| supabase/functions/instagram-publishing/instagramPublish.ts | 9f7d1cd19e2c2f4809dff0f288367c245d311a2149bc6c8106ce24eefba15be6 |
| supabase/functions/instagram-publishing/shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd |
| src/features/instagram-publish/InstagramPublishHarness.tsx | 046ed09310b93ff4afa855ecadd600c0cbcaa093dcb201a31e3b08ad328079a7 |
| src/features/instagram-publish/copy.ts | 023100761bbb1e6652e6da2b356f7934c5288c21789427ce0d3192516a8af819 |
| src/features/instagram-publish/repository.ts | c0a98e2e7c09ca77b48b8da741a18a53402512d4b747b7bdd455aa61554a8f48 |
| src/App.tsx | ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b |
| supabase/config.toml | fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a |
| supabase/functions-deploy-state.json | 88225290fac5714d4391ec0055b7e50f193155879a664eb9d053e6d29ae230d3 |
| supabase/migrations/20261030232253_a3743_instagram_container_state.sql | 366493c40ef00561da1830f1ef1aa0f3f37ee46b784476d58371670b64482662 |
| package.json | fe2998f996470d60b83d960b71c14b8c7bb897e33ed35059ce41d034a220628b |
| package-lock.json | d891bc118f1d38e2b068c01dd91ad373eb2c78d7666384fcf3b855eb80ef7434 |

**Tests carrying the authorized Correction 03 exceptions (unchanged)**

| File | sha256 |
|---|---|
| a3743InstagramGateA.test.ts | a9b6fca21a90e5bc201048224bd6adc9e811222e31af8cf9248fd9d0e8415971 |
| a3741MetaPublishingFoundation.test.ts | f137e0a69c496c509b2a3dcaf16df05746992112446c7ea15d79619a10a0f61d |
| a3731SelectionFoundation.test.ts | 4030cdc839d1be813b40ffbd6f7f2e1f88a18fce1c51c3fa487b60861fbe7a8c |
| a3732AdaptationGuards.test.ts | 721d76d3dd8ce07f178eaf70b3502db0df64f3f0b3393d1ba0ff96b5aa960ddb |

**Historical manifests and Gate A reports (unchanged)**

| File | sha256 |
|---|---|
| A3_7_2_FREEZE_MANIFEST.md | ced8edffe1020456cbe645c62991f310eb910a74d4e29d3fd6a77bba9fba917a |
| A3_7_3_1_FREEZE_MANIFEST.md | 8c97c60295c66fa9eb53d1c4c5fb7664ac78ff92ece16b8e41fe2e296c0549b6 |
| A3_7_3_3_FREEZE_MANIFEST.md | d4a9700687fea40541c1d3e2c474ee671ad2d9219f8b9083d3285d3a195d5862 |
| A3_7_3_4_FREEZE_MANIFEST.md | 81217523283748bf41d917c80591d0277467740b608ed71ddc867982147e6606 |
| A3_7_4_1_FREEZE_MANIFEST.md | ee28cd0e9f1a52e75d9e67b49ab3a96ee6d0ce4d10c142cb95efc9313851e907 |
| A3_7_4_2_FREEZE_MANIFEST.md | 34feabd3781ea3fc4e2573d69f53e9a4ca99b802a860bace62d4ea3eef6ce228 |
| A3_7_4_3_GATE_A_MANIFEST.md | 24c9c054c3fe5f71316b04c8910793bda8696e7b0126952b7bb0c7b6ceab37f4 |
| A3_7_4_3_INSTAGRAM_GATE_A_ARCHITECTURE_SECURITY_READINESS.md | 86766ee95856db6d732b15cf8efe81494b8007ef52472c2f8b29b40cb8978378 |

## 3. Test, type and build results

| Check | Result |
|---|---|
| Full suite | 2913 / 2913 pass, 0 fail |
| a3743 Instagram Gate A | 39/39 |
| a3741 | 68/68 |
| A3.7.4.2 | 55/55, 8/8, 19/19, 12/12 |
| a3731 / a3732 guards | 36/36 / 28/28 |
| tsc (tsconfig.app.json) | 20 inherited, 0 new |
| Build | PASS |

## 4. Read-only and dry-run actions performed in B.1

| UTC | Action | Writes |
|---|---|---|
| 15:04:28 | `meta_connections` read (token values and refs not selected) | none |
| 15:04 | edge function list, secret-name list | none |
| 15:05:01 | vault existence check (no decryption); attempts, publications, buckets, storage objects | none |
| ~15:05 | `publication_publish_preflight` (STABLE) on A/B/C; `instagram_image_derivable` (IMMUTABLE) | none |
| 15:05:35 | 3 unauthenticated POSTs to `instagram-publishing` → 401, 401 `AUTH_REQUIRED`, 401 | none (rejected before handler logic) |
| ~15:06 | Local `buildDerivative` dry run on the test image (no network) | none |
| 15:10:05 | Closing production safety recheck | none |

No `/media`, `/media_publish` or any other Meta Graph call was made. No deploy and no secret change.

## 5. Production safety (closing recheck, 2026-10-31 15:10:05 UTC)

| Check | Result |
|---|---|
| Publish attempts | 1 (Facebook, succeeded, publication C) |
| Instagram attempts | 0 |
| Publishing / UNKNOWN attempts | 0 |
| A | 2026-10-27 23:05:19.287086 (unchanged) |
| B | 2026-10-28 12:27:05.291163 (unchanged) |
| C | 2026-10-30 00:13:08.946825 (unchanged) |
| Publications | 17, no D |
| publication-images / instagram-derivatives | private / private |
| instagram-derivatives objects | 0 |
| META_INSTAGRAM_* / META_FACEBOOK_* secrets | none / none |
| instagram-publishing | ACTIVE, verify_jwt true, not redeployed |
| meta-publishing | not redeployed |

## 6. Outstanding before Gate B.2

These are listed in the readiness report §7.
- P1: server-side publication allowlist (finding §4: C is Instagram-eligible under the user-only arming).
- P2: a scoped publish trigger.
- P3: authorization to create publication D.
- P4: authorization for the temporary arming secrets.
- P5: live token validity at the read-only first step.
- P6: optional manual check of the account subtype.

**STOP. Gate B.2 and A3.7.4.4 not started.**
