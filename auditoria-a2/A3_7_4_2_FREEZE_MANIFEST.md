# A3.7.4.2 — Freeze Manifest (Facebook Page Single-Photo Publishing)

Status: FINAL — GO — FINAL FREEZE A3.7.4.2 FACEBOOK SINGLE-PHOTO PUBLISHING. All hashes below were re-verified after disarm and are unchanged.

Date: 2026-10-30

## Edge function

| Item | Value |
|---|---|
| meta-publishing deploy hash | ae6e628c3337250914530e004cf6d2da55af55d622c3c85d1290f8a4f9c31e6a (hasChanged false) |
| config | `[functions.meta-publishing] verify_jwt = true` |

| File | sha256 |
|---|---|
| supabase/functions/meta-publishing/facebookPhoto.ts | 7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a |
| supabase/functions/meta-publishing/facebookPublish.ts | 48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd |
| supabase/functions/meta-publishing/handler.ts | b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb |
| supabase/functions/meta-publishing/index.ts | 027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23 |

## Frontend

| File | sha256 |
|---|---|
| src/features/facebook-publish/FacebookPublishHarness.tsx | 78cc2a49ef4d599b0858a99674fc30a07a440644b4e87ffb8827b03708647a1b |
| src/features/facebook-publish/copy.ts | e47fa991449289ca8986828f168c4e052bdfb67877ea7aa6c263d29aeb70ce20 |
| src/features/facebook-publish/repository.ts | 4242ea4c38c91b010a1bfd1d624f71c0edd2fc7e076cea32df127bc7f3a4ba20 |
| src/features/channel-review/ChannelReviewPanel.tsx | 0dc3a0e50b5f61c69d458313a5a7f9a672616af9f81906c32618239b8025f4be |
| src/features/publication-resume/PublicationResumeProvider.tsx | d8af68702d5b54e4f62d8720a05e190a6c2bbbc31fa2f699feb0741aa6f6c499 |
| src/features/publishing-access/copy.ts | a692420d0e89f09798ddca65ceae7c318637cec30221bb4179da7c9b0954972c |
| src/features/publishing-access/model.ts | 9a208058c363b88b707c964ae5e9ff09f9098338deb21de80ba2adf5753c1d39 |
| src/features/publishing-access/PublishingAccessControl.tsx | a383269fed1986ad2ba1ab4a53b7e1d20a20d0f21b8e8e5a695a76d7798eadf0 |
| src/features/meta-connection/metaPublishingRepository.ts | 132b1fa4ffcb8a29afe7e048e40e97c4ba1c580359ad682d6aad21eeaa55b360 |
| src/features/publications/validation/PublicationsValidationPage.tsx | 1eb1a91eda49dcaaba496acb7072131c153bd022de0e87a637100584c61bbad0 |

## Migrations

| File | sha256 |
|---|---|
| 20261028132929_a3741_meta_publishing_security_foundation.sql | 42db6849eabf35b0d4c190b64178d531521d29e7e299fadd11dd90e9615dc79c |
| 20261028133311_a3741_publishing_consent_decline_guard.sql | 37823afc968af172c784c3babdce917e1836147327582cec95445b639b88a6c1 |
| 20261029222104_a3742_internal_test_entitlement.sql | 9d13d39016055fb143e3d68df0ecb25d568b5c1a6049994b796aea66222385be |

Database objects:
- functions: publish_attempt_begin, publish_attempt_finish, publication_publish_gate, publication_publish_preflight, meta_read_token. All are SECURITY DEFINER or service-only, with no anon/authenticated EXECUTE.
- unique indexes: one_success, one_active, identity_live, number_key.
- the `publication-images` bucket is private.

## Tests

| File | sha256 |
|---|---|
| src/features/publications/__tests__/a3742FacebookPhotoPublishing.test.ts | 8542f77b8bab82646f484036ef2cbda02cb92521aa165aa8ff1b55e556f66cad |
| src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts | e7674f8fcfaeb2b6e4f786f060fa059d3c017b9d4b33459fe8b7d331afdd4b07 |
| src/features/facebook-publish/__tests__/a3742B2Fix03PublishPanelRefresh.test.tsx | 7aaf058d4a402bb53cdffe182904e2077522e98ce4ce40fbc9beeb28cc7d457a |
| src/features/publishing-access/__tests__/a3742B1Fix01PublishingAccessUi.test.ts | 3bad6927ce30ff3997af3e7ea4a62dbb5458286aa21035447ec15c5bad12e662 |
| src/features/billing/__tests__/a3742Fix02InternalTestEntitlement.test.ts | d338fbb7cd9ef482c9d688863beea82267a46279173cd12aec8eac84427a815a |

Baseline:
- 84 files / 2874 tests pass;
- 20 inherited TypeScript errors, 0 new;
- build PASS.

## Real E2E record

- C b140fc59-6458-47d7-b695-df8781610ea5, version 3, Page 1393994523793266.
- Attempt aaca823e-44ab-4d67-bce2-aeee40d24ba7, #1, key `b140fc59-6458-47d7-b695-df8781610ea5:facebook:v3`, succeeded.
- Meta object `1393994523793266_122114709087502661`.

## Required secret state at freeze

`META_FACEBOOK_REAL_PUBLISH_ARMED` and `META_FACEBOOK_REAL_PUBLISH_USER_IDS` are both ABSENT, verified from the production edge function secrets list. Real Facebook writes are disabled for every user.

Post-disarm attempt accounting: total 1, succeeded 1, publishing 0, unknown 0, failed 0, facebook 1, instagram 0.

Final regression:
- 84 files / 2874 tests pass;
- focused publishing suites 4 files / 150 pass;
- TypeScript 20 inherited errors, 0 new;
- build PASS.
