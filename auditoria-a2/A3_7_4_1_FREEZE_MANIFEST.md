# A3.7.4.1 Freeze Manifest — Meta Publishing Security & Persistence Foundation

Status: FROZEN. All hashes are SHA-256 unless stated otherwise.

## A. New/modified production files

| File | SHA-256 |
|---|---|
| supabase/functions/meta-publishing/handler.ts | b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb |
| supabase/functions/meta-publishing/index.ts | 8c60b5287e50c612b32969639e77c42a9ae64d1412726fb1441dcdc4e3b260be |
| supabase/functions/meta-oauth-callback/handler.ts | e59f91dbc235c13edcee9af708ca26dc0a92b2ecc5232217a66d3a1ef8564b48 |
| src/features/meta-connection/metaPublishingRepository.ts | 132b1fa4ffcb8a29afe7e048e40e97c4ba1c580359ad682d6aad21eeaa55b360 |
| src/features/meta-connection/MetaCallbackPage.tsx | 10ad1772397214a03e8e0486d9c1f2a949259b75c8eaae6b930fd473faa14520 |
| supabase/config.toml | f6a6e3e14a1840fe0a48137a648f036e6d7029269b37e6cd00f7cad0904f385a |

## B. Migrations

| File | SHA-256 |
|---|---|
| supabase/migrations/20261028132929_a3741_meta_publishing_security_foundation.sql | 42db6849eabf35b0d4c190b64178d531521d29e7e299fadd11dd90e9615dc79c |
| supabase/migrations/20261028133311_a3741_publishing_consent_decline_guard.sql | 37823afc968af172c784c3babdce917e1836147327582cec95445b639b88a6c1 |

## C. Tests

| File | SHA-256 |
|---|---|
| src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts | 9689187412577a38d985db751032d3abf07ff7f296af85ffca4ec75b581b72eb |

## D. Authorized upstream re-pins

| File | Previous | New |
|---|---|---|
| auditoria-a2/A3_7_2_FREEZE_MANIFEST.md (row: a371PublicationsRepository.test.ts) | 5a915591d58138f8372543a05c6a303490df4b56c1f9c7995a963b9a5bc0a12a | 76ec5d97cdc320d925fff117c2068125848f0d1c68f442e6d3231f98b1a8c38e |
| src/features/publications/__tests__/a371PublicationsRepository.test.ts | 5a915591d58138f8372543a05c6a303490df4b56c1f9c7995a963b9a5bc0a12a | 76ec5d97cdc320d925fff117c2068125848f0d1c68f442e6d3231f98b1a8c38e |
| src/components/__tests__/a281TrustCleanup.test.ts | cb6a925ab209873f69222303e0b7afc27a1ebfe0e4aaf3d6eecba3364da36c92 | 5dec386ec1da6cf6859b0bc569918e082ed494a9bc5f34e869813bb6f641dcee |
| src/features/roadmap/__tests__/a273Roadmap.test.ts | 1fd5954c53ffa07da661db906f323ede4fffa5509fc66c23e21d2e150cf1fb94 | 2f3281bb3976732f1df8c6c5691c372d11919671a8ed1c74d67792be0d3cef5f |
| src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts | e71fbc7bef4ea63c746bc1ce1b360c8c6529e7c3906b5447d9945a5419fbcf9f | aa4e95245b5b187877840b8cbff21858c4b2ad3381d97e5934ebfbc7508d7f9c |
| src/features/publications/__tests__/a3733ChannelReview.test.ts | d62c66187e16c6200e1327b5709def5e2fe781fd344e2202585560249b8759c9 | 6a528660c5ccc30163e9757e7241378920c0d531fdc11fd4af14a4873859785b |
| src/features/social-intelligence/findings/__tests__/a3542SocialFindings.test.ts (md5 pin) | md5 ed9f980479601ff14dd9d0613bb7e838 | md5 a5e806e009ab714fc8d3deda1533f013 (sha256 8774195f89b14f363138a9618ee3e5c1aaeb224e1d75c72b522595edbaaf7ca6) |
| src/features/social-intelligence/ui/__tests__/a3543SocialIntelligenceUi.test.ts | (holds the md5 pin above) | 7fab3326fbbabb2580cd8afda0f7e065d137d586e50aaa9da77da8a333d2f1db |
| src/features/action-layer/__tests__/a33DiagnosticAction.test.ts | (not manifest-pinned) | 1b88202a16730f98482f789013c1e622d8ee801243f3dfcdf137545fffd40519 |
| src/features/email-verification/__tests__/f03Stage2b.test.ts | (not manifest-pinned) | 42ba933a299ae34058ab70c5ff2e7afc6be2d64ef59d6a1abf360308615122e8 |

## E. Frozen upstream files verified unchanged

| File | SHA-256 |
|---|---|
| supabase/functions/meta-connection/handler.ts | 57e8341fbb5172329b5aa71ff9bf70b77256ac86184d24e58bab24c261097ada |
| supabase/functions/meta-read/handler.ts | 987cc94b1490ac79204280669e8d1f9834822bbd095f618ea6e3d912653e6166 |
| auditoria-a2/A3_7_3_4_FREEZE_MANIFEST.md | 81217523283748bf41d917c80591d0277467740b608ed71ddc867982147e6606 |

All 36 A3.7.3.4 manifest entries are byte-identical, apart from the 4 enumerated re-pins. The a3741 K block enforces this.

## F. Reports/docs

| File | SHA-256 |
|---|---|
| auditoria-a2/A3_7_4_1_META_PUBLISHING_SECURITY_FOUNDATION.md | 60ba153aa1654fc360fec4f6175fefa4e4dd66c4b8a8d64942ba971e968c099a (final; adds section 26 FINAL LIVE ROLLBACK FOUNDATION EVIDENCE; was d6be95d7177e5fb874c30e1e8e2d250f86e5fac39839428c030fc10137214609) |
| auditoria-a2/A3_7_2_FREEZE_MANIFEST.md (after re-pin) | ced8edffe1020456cbe645c62991f310eb910a74d4e29d3fd6a77bba9fba917a |
