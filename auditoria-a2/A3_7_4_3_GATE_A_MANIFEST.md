# A3.7.4.3 — Gate A Manifest (Corrections 01–03)

Date: 2026-10-31
Verdict: GO — A3.7.4.3 GATE A CODE READY; INSTAGRAM REAL E2E NOT YET AUTHORIZED

The Instagram code is complete and passes 39/39. Correction 02 applied the authorized test-only re-pins, which fixed 13 of the 14 failures. Correction 03 added the authorized was/now freeze exceptions for the last cascade. Full suite: 2913/2913. No historical freeze manifest was modified.

## Migration (applied)

| File | sha256 |
|---|---|
| supabase/migrations/20261030232253_a3743_instagram_container_state.sql | 366493c40ef00561da1830f1ef1aa0f3f37ee46b784476d58371670b64482662 |

Database objects:
- columns `meta_container_id` and `external_stage`;
- checks `publish_attempts_container_id_format`, `publish_attempts_external_stage_values` and `publish_attempts_stage_shape`;
- trigger function `publish_attempts_guard` (replaced);
- `publish_attempt_advance` (service_role only);
- `instagram_image_derivable` (service_role only);
- `publication_publish_gate` (replaced; only the Instagram image clause differs);
- bucket `instagram-derivatives` (private, 8 MiB, JPEG only, no policies).

## Instagram edge function (new; deployed, ACTIVE, unarmed and fail-closed)

| File | sha256 |
|---|---|
| supabase/functions/instagram-publishing/derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa |
| supabase/functions/instagram-publishing/graph.ts | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a |
| supabase/functions/instagram-publishing/index.ts | b782a99fbc4a9ba06fd78f69d04b09e37607b5649052eb2aa231a9155e5a2605 |
| supabase/functions/instagram-publishing/instagramPublish.ts | 9f7d1cd19e2c2f4809dff0f288367c245d311a2149bc6c8106ce24eefba15be6 |
| supabase/functions/instagram-publishing/shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd |

## Instagram frontend (new; internal, read-only)

| File | sha256 |
|---|---|
| src/features/instagram-publish/InstagramPublishHarness.tsx | 046ed09310b93ff4afa855ecadd600c0cbcaa093dcb201a31e3b08ad328079a7 |
| src/features/instagram-publish/copy.ts | 023100761bbb1e6652e6da2b356f7934c5288c21789427ce0d3192516a8af819 |
| src/features/instagram-publish/repository.ts | c0a98e2e7c09ca77b48b8da741a18a53402512d4b747b7bdd455aa61554a8f48 |

## Tests (new)

| File | sha256 |
|---|---|
| src/features/publications/__tests__/a3743InstagramGateA.test.ts | 4bfd5b1e16e96412bdb052ead4e837b1120d996a7959481c157b7cc42f1bb9e1 |

## Shared files changed (not frozen by A3.7.4.2)

| File | sha256 | Change |
|---|---|---|
| src/App.tsx | ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b | adds a lazy `IgHarness` import and one `<IgHarness />` after `<FbHarness />` on the existing hidden route |
| supabase/config.toml | fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a | adds `[functions.instagram-publishing] verify_jwt = true` |
| package.json / package-lock.json | — | devDependencies jpeg-js 0.4.4 and upng-js 2.1.0 (test fixtures; the edge function uses `npm:` imports) |

App.tsx is not in the A3.7.4.2 freeze manifest. It is, however, hash-pinned by older tests whose re-pins are recorded in the frozen a3741 test, so its change is part of the pending authorization.

## Facebook files: byte-identical (re-verified)

| File | sha256 |
|---|---|
| supabase/functions/meta-publishing/facebookPhoto.ts | 7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a |
| supabase/functions/meta-publishing/facebookPublish.ts | 48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd |
| supabase/functions/meta-publishing/handler.ts | b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb |
| supabase/functions/meta-publishing/index.ts | 027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23 |
| src/features/facebook-publish/FacebookPublishHarness.tsx | 78cc2a49ef4d599b0858a99674fc30a07a440644b4e87ffb8827b03708647a1b |
| src/features/facebook-publish/copy.ts | e47fa991449289ca8986828f168c4e052bdfb67877ea7aa6c263d29aeb70ce20 |
| src/features/facebook-publish/repository.ts | 4242ea4c38c91b010a1bfd1d624f71c0edd2fc7e076cea32df127bc7f3a4ba20 |

The remaining A3.7.4.2 manifest files are also unchanged, including ChannelReviewPanel, PublicationResumeProvider, the publishing-access files, metaPublishingRepository, PublicationsValidationPage and the a3741/a3742 tests. T36 asserts these hashes. meta-publishing was not redeployed (deploy hash ae6e628c…).

## Correction 02 — test files re-pinned (sha256 now; test-only, no production change)

| File | Before | Now | Change |
|---|---|---|---|
| src/components/__tests__/a281TrustCleanup.test.ts | 4db0f819… | 2f4b6d27fd7f1d2f7851251f5a2fc3dfd71f6558be1b7dd9724e1b387d0a0a9a | App pin ef7f7cdc; count 59 |
| src/features/roadmap/__tests__/a273Roadmap.test.ts | 2ce19c6b… | 300a87c8605856aaae31fd6ef666cd2f02bd0868f1ddcf45e95918bb4dde03c0 | App pin; count 59; `_a3743_` exclusion |
| src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts | 20296e5b… | b5df9213adbb8ef98712b733ec88ad46e44e56d083647027bf6a2f2e446d30b1 | App pin; count 59; `_a3743_` exclusion |
| src/features/action-layer/__tests__/a33DiagnosticAction.test.ts | — | b7705d22de2d2cbab4bbcf06f11d004c0bb11f448fba2701ac944c3ae4e9236e | count 59 |
| src/features/email-verification/__tests__/f03Stage2b.test.ts | — | ac94b043dcc87dd2acd0d68e239f0de14d051dd24a34bcfdc7f4e021bb58b390 | count 59 (x2) |
| src/features/social-intelligence/findings/__tests__/a3542SocialFindings.test.ts | md5 6895742f… | d0aee86db7cdfa4fc292b70fce119c9277952f81cba36b55293d59f3de523f09 (md5 a0473304903dfddc4aefb32cad93068b) | #39 excludes `_a3743_` |
| src/features/social-intelligence/ui/__tests__/a3543SocialIntelligenceUi.test.ts | — | 442308d8502b81e8f8c9dc6d5ac1bad431e1701a27aeb5b1be28f306edf451ce | a3542 md5 pin |
| src/features/social-intelligence/integration/__tests__/a3544SocialIntegration.test.ts | cf7c8076… | c1b5c3c207d802e2f84f9c0e6fbe53a95beac5624d93e6fecb0b4b661fbf2290 | App pin |
| src/features/publications/__tests__/a3721aValidationHarness.test.ts | c20a942e… | 6c32bfcdde9cb03a79eb2e6d109eb4a2c98166094a40b51803fcf2e4891126fd | route window 300 → 400 |
| src/features/publications/__tests__/a3733ChannelReview.test.ts | eb212294… | 9dc24452f539a7fc0aa0bd4d28f1238babcf8c298b955a48edbb5088eadf7500 | #29 allows instagram-publishing; /media, /media_publish only in graph.ts |
| src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts | e7674f8f… | 170e482873d48fca58eb05c90a64b6ff680e9572ad962f865f961b2a85c2384f (superseded by Correction 03) | AUTHORIZED_REPINS `now` values (was values kept) |
| src/features/publications/__tests__/a3743InstagramGateA.test.ts | 4bfd5b1e… | 296015bd806a25b0b8c7098c524a750a8658b2a1d3f2462f5f8e941c8398ca58 (superseded by Correction 03) | T36 a3741 pin |

Instagram production files, migration, App.tsx (ef7f7cdc…) and config.toml are unchanged by Correction 02.

## Correction 03 — explicit historical freeze exceptions (test-only)

Hash cascade: a3721a (A3.7.2 manifest) → a3731 (A3.7.3.1 manifest) → a3732 (A3.7.3.4 manifest) → a3741 → T36.

| File | Before | Now | Change |
|---|---|---|---|
| src/features/publications/__tests__/a3731SelectionFoundation.test.ts | 38e88e4f65bbf3f0132bcc8cdef7dabb5a0a94f3fa92e16712789cc605940095 | 4030cdc839d1be813b40ffbd6f7f2e1f88a18fce1c51c3fa487b60861fbe7a8c | Single exception: a3721a was c20a942e… / now 6c32bfcd… |
| src/features/publications/__tests__/a3732AdaptationGuards.test.ts | b0125ea3973b824416fa517f29a6d5958d46d3cb77287d3c801d0cac18c3860b | 721d76d3dd8ce07f178eaf70b3502db0df64f3f0b3393d1ba0ff96b5aa960ddb | Single exception: a3731 was 38e88e4f… / now 4030cdc8… |
| src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts | 170e4828… | f137e0a69c496c509b2a3dcaf16df05746992112446c7ea15d79619a10a0f61d | AUTHORIZED_REPINS + a3732 (was b0125ea3 / now 721d76d3) |
| src/features/publications/__tests__/a3743InstagramGateA.test.ts | 296015bd… | a9b6fca21a90e5bc201048224bd6adc9e811222e31af8cf9248fd9d0e8415971 | T36 a3741 pin → f137e0a6 |

Each exception checks three things: the manifest still records the original `was` hash, the file now hashes to exactly `now`, and the set of excepted paths equals the declared set. Every other manifest entry must match exactly; the entry counts (28, 4, 36) are unchanged. No manifest files were edited.

## Regression snapshot (Correction 03, final)

- Instagram: 39/39. A3.7.4.1: 68/68. A3.7.4.2: 55/55, 8/8, 19/19, 12/12. a3731: 36/36. a3732 guards: 28/28.
- Full suite: **2913 pass / 0 fail** of 2913.
- tsc: 20 inherited errors, 0 new.
- Build: PASS.

## Production state at stop (rechecked 2026-10-31 after Correction 03)

- Attempts: exactly 1 (Facebook succeeded); Instagram 0; publishing 0; unknown 0.
- A/B/C `updated_at` unchanged (2026-10-27 23:05:19.287086 / 2026-10-28 12:27:05.291163 / 2026-10-30 00:13:08.946825); 17 publications, no D.
- Both buckets private; 0 derivative objects.
- META_FACEBOOK_* and META_INSTAGRAM_* secrets absent.
- Frozen Facebook files byte-identical (facebookPhoto 7225bc3d, facebookPublish 48da8e2f, handler b7525645, index 027ee4fe, harness 78cc2a49, copy e47fa991, repository 4242ea4c, and the rest of the A3.7.4.2 freeze set via T36).
- No function redeployed in Corrections 02/03; instagram-publishing ACTIVE and unarmed.
- 0 Instagram posts; 0 new Facebook posts.
