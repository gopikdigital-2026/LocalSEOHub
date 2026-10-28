# A3.7.3.4 — Freeze Manifest

Accepted verdict: GO — FINAL FREEZE A3.7.3.4 PUBLICATION RESUME & SINGLE IDENTITY
Recorded: 2026-10-28, after Manuel's real production browser E2E (PASS). See the report, section 16.

Regression at freeze:

| Check | Result |
|---|---|
| Publications and resume tests | 16 files, 457 tests, PASS |
| Full suite | 79 files, 2712 tests, PASS |
| `npx tsc --noEmit -p tsconfig.app.json` | 20 inherited errors, 0 new |
| `npm run build` | PASS |

No migration, schema, edge function or production data change belongs to A3.7.3.4. There are 55 local migration files and 54 applied migrations, both unchanged.

## A. Files changed by A3.7.3.4 (frozen)

### A.1 Unlocked existing files

| File | BEFORE SHA-256 | FROZEN SHA-256 |
|---|---|---|
| src/App.tsx | c8e503d2a1cb4c1947a337b238c0ef078277f2c9cc313919aa50ff820f3c7210 | 7902658f9f56ad9db1059bf7111cd3b9ee786256f10b19ff0ac48b3e8d8b94ba |
| src/features/publications/validation/PublicationsValidationPage.tsx | 4754251850c7c2d0ea75a38258445718aff1c689f876af214205b840294a726c | 1eb1a91eda49dcaaba496acb7072131c153bd022de0e87a637100584c61bbad0 |
| src/features/channel-adaptation/ChannelAdaptationPanel.tsx | f3d7f22da5cf3cfc1ba9a1f6f7130dcb5abce263b7573469b6cfbff5e8cbb6ea | f3cc00fdaa24364e194953d503c39976eb7f9b1be6bc742090f7fb6bd41f3369 |
| src/features/channel-adaptation/copy.ts | aa04e4767103c92997b91282e93ccff8e322b5df98111924784ac828855b261b | 31da9d1af14aaff98d53062c7882963610615550457caf33de0ade01e1124643 |
| src/features/channel-review/ChannelReviewPanel.tsx | 030eb506c7ae546d93332bcf3fc2f117b417c93c1a040d55b3e83b7ee6f75007 | 5ab5259c24a48072d80535c13d1d4b5a5e5c432a2a66316cd3d4b30efa128989 |
| src/features/channel-review/copy.ts | 42c4b0e6608f7b6d5616de537e8c7ac5deb098564a69ec0ca08fd872477e3286 | 6b6c39d4e90f97520e15df770baec1ed6e5472cbd389f03fd89d200022a17ddd |

### A.2 New resume layer

| File | FROZEN SHA-256 |
|---|---|
| src/features/publication-resume/model.ts | b65be3aa03c13a323dec74dba290b04511279fa84c9df97a3431384417bcbff4 |
| src/features/publication-resume/repository.ts | 1676c4979815c5b9bc50ad3c2140375feab4ce8e93162dac5b788debe98affa4 |
| src/features/publication-resume/resolve.ts | a6c152f72327ca8be6180968c57ccae5748ca7fe2af2e8f8dbd857c9fbbea656 |
| src/features/publication-resume/copy.ts | 205ad6eb1fe71ed81d2378ffb25f1792c3106ee4b58f29c6af290b3b21030df5 |
| src/features/publication-resume/context.ts | 7fe799a563102dec15a0cceece2bfcba0bb3a93b64388dcbb33fbac927215370 |
| src/features/publication-resume/PublicationResumeProvider.tsx | d8af68702d5b54e4f62d8720a05e190a6c2bbbc31fa2f699feb0741aa6f6c499 |
| src/features/publication-resume/ResumeBar.tsx | 57f804763393f2671d5968b1c4ef1d1d6b5b40a7cd8f0253864157c8b903e008 |

## B. Upstream frozen files verified unchanged

### B.1 Client files in the authorized area, left untouched

| File | SHA-256 |
|---|---|
| src/features/publications/validation/copy.ts | faa38cd547814aa9054d73052daf0d2f61062291fa766e88bbbdada209070110 |
| src/features/publications/repository.ts | e5ddd8bb80df97c211a47f876d14913e6c2e8e5b62931f4f18ba6c05e962c0e5 |
| src/features/publications/types.ts | 9f5ac9a2bf1908644e70ca41884abc23b6890a0be79189dc181ac285585991cf |
| src/features/publications/drafts/repository.ts | 299bc8b3e1fc97ec3e0791ce4d433a6f88de5a8379f372ff1ec23a983a76bbb1 |
| src/features/publications/drafts/types.ts | db175c4efc1e5375cf34795267029cabaab2baf050dfb3a8ed256c21907488bf |
| src/features/channel-adaptation/repository.ts | d4a46bd50d6510cc5f856a9c9c3865480f4c06c3f8ee114f05ffc0fb9801d288 |
| src/features/channel-adaptation/types.ts | 2a46a61f18188b9a5dab19b4bf4d82c52ef30ffc22d388043c8e31d58568f82e |
| src/features/channel-review/model.ts | 1045d50d7a8fcb0e7f8778fb4f1963d6e56ab57b62fd225eb0a81b5d9d03c287 |
| src/features/channel-review/repository.ts | 6c3371d9e811e4889172b038d8ecd9aa6aeccb5b7dc2018f51a439b54f7c3885 |
| src/features/channel-review/types.ts | 37c388de2612c42af6c393c198dd8ea56f2bca5adbb1f6c0352334647d677649 |

### B.2 Publications migrations

| File | SHA-256 |
|---|---|
| supabase/migrations/20261025152315_a371_publications_data_storage_foundation.sql | ab9114d8110dc4493fccca330ac31fe73c38395a625b98b4cc72ce30cc75b5b7 |
| supabase/migrations/20261025161526_a372_publication_proposals_engine.sql | 8f74c30ff935f77da1dcba3a1c7c982c79a2dc6b76c31e8b7b18c1b9cfcab6ee |
| supabase/migrations/20261027162344_a3731_publication_drafts_selection_foundation.sql | e441f2fb57fd454446a7eaf254c0be60adfa1f40876dd2cedf082de1a8dce15d |
| supabase/migrations/20261027165527_a3732_publication_adaptation_engine.sql | 04e4d0af14d2778ca777d59477869b676684b682b7302370a8a728e3fd75f605 |
| supabase/migrations/20261027233057_a3733_publication_channel_review_editing.sql | 1b63b7b86642dcfbd61e5fcc896df24417b44a0de9d6026f0e5c73b2f82bbc60 |
| supabase/migrations/20261027233150_a3733_publication_channel_review_editing.sql | b2d7f4559636e70d8dc54a296dbf4ff656f95239b16427dbc34e3ff92e7258af |

### B.3 Upstream manifests re-verified at freeze

| Manifest | Rows matching |
|---|---|
| A3_7_2_FREEZE_MANIFEST.md | 28 / 28 |
| A3_7_3_1_FREEZE_MANIFEST.md | 4 / 4 |
| A3_7_3_3_FREEZE_MANIFEST.md | 9 / 9 |

The page row in A3.7.2 and four rows in A3.7.3.3 carry an inline `A3.7.3.4 RESUME RE-PIN (authorized)` note that keeps the previous hash. Those rows correspond to the A.1 files above and the a3733 test in C.

The frozen test `a3731SelectionFoundation.test.ts` is byte-identical: `38e88e4f65bbf3f0132bcc8cdef7dabb5a0a94f3fa92e16712789cc605940095`.

## C. Test and report-only files

### C.1 New test

| File | SHA-256 |
|---|---|
| src/features/publication-resume/__tests__/a3734PublicationResume.test.ts | 5ca2c7ba3f3c311a94f78565156199efcc6e2c4a95a8bc00583e1fb58ab94cf9 |

### C.2 Hash re-pins only (`A3.7.3.4 RESUME RE-PIN`)

| File | SHA-256 |
|---|---|
| src/components/__tests__/a281TrustCleanup.test.ts | cb6a925ab209873f69222303e0b7afc27a1ebfe0e4aaf3d6eecba3364da36c92 |
| src/features/roadmap/__tests__/a273Roadmap.test.ts | 1fd5954c53ffa07da661db906f323ede4fffa5509fc66c23e21d2e150cf1fb94 |
| src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts | e71fbc7bef4ea63c746bc1ce1b360c8c6529e7c3906b5447d9945a5419fbcf9f |
| src/features/social-intelligence/integration/__tests__/a3544SocialIntegration.test.ts | e85d466ffe39ff2797ffc9505d44fa5a25261df955d38a465f0d54d9b12c8c08 |
| src/features/publications/__tests__/a3732AdaptationGuards.test.ts | b0125ea3973b824416fa517f29a6d5958d46d3cb77287d3c801d0cac18c3860b |
| src/features/publications/__tests__/a3733ChannelReview.test.ts | d62c66187e16c6200e1327b5709def5e2fe781fd344e2202585560249b8759c9 |

### C.3 Documentation

These files are not hash-pinned, because they are living records:

- auditoria-a2/A3_7_3_4_PUBLICATION_RESUME_SINGLE_IDENTITY.md
- auditoria-a2/A3_7_3_4_FREEZE_MANIFEST.md (this file)
- auditoria-a2/A3_7_2_FREEZE_MANIFEST.md (re-pin note only)
- auditoria-a2/A3_7_3_3_FREEZE_MANIFEST.md (re-pin notes only)

## Production validation data (preserved, do not modify)

| Publication | Status | Draft version | Marker |
|---|---|---|---|
| 65569535-5d89-4df3-a8d4-c2af6df8606d | proposals_ready | 4 | MODIFICADO |
| 442059e5-11e4-4bdd-a5bc-c714b0a03b72 | proposals_ready | 3 | E2E442-FB / E2E442-IG |

Both publications belong to business `91a0c7d4…`. No cleanup is authorized.
