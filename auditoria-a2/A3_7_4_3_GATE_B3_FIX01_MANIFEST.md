# A3.7.4.3 — Gate B.3 FIX01 — Manifest

## Historical manifests: byte-identical (12/12, sha256 re-verified after deployment)
```
ced8edffe1020456cbe645c62991f310eb910a74d4e29d3fd6a77bba9fba917a  auditoria-a2/A3_7_2_FREEZE_MANIFEST.md
8c97c60295c66fa9eb53d1c4c5fb7664ac78ff92ece16b8e41fe2e296c0549b6  auditoria-a2/A3_7_3_1_FREEZE_MANIFEST.md
d4a9700687fea40541c1d3e2c474ee671ad2d9219f8b9083d3285d3a195d5862  auditoria-a2/A3_7_3_3_FREEZE_MANIFEST.md
81217523283748bf41d917c80591d0277467740b608ed71ddc867982147e6606  auditoria-a2/A3_7_3_4_FREEZE_MANIFEST.md
ee28cd0e9f1a52e75d9e67b49ab3a96ee6d0ce4d10c142cb95efc9313851e907  auditoria-a2/A3_7_4_1_FREEZE_MANIFEST.md
34feabd3781ea3fc4e2573d69f53e9a4ca99b802a860bace62d4ea3eef6ce228  auditoria-a2/A3_7_4_2_FREEZE_MANIFEST.md
6112bda74721ec6b5e9c363a6d87e47cbe3834a0d58ace20971b0ddcfed7a327  auditoria-a2/A3_7_4_2_GATE_A_MANIFEST.md
24c9c054c3fe5f71316b04c8910793bda8696e7b0126952b7bb0c7b6ceab37f4  auditoria-a2/A3_7_4_3_GATE_A_MANIFEST.md
4d2694dd8d7ecd8bbc5af812fbdeb761799254f1dff8b428769b8da2c0554849  auditoria-a2/A3_7_4_3_GATE_B1_MANIFEST.md
6421dc8e521c5568477b446fb5853a965b364156247ca77359e0efaea4764a7b  auditoria-a2/A3_7_4_3_GATE_B2_PART1_MANIFEST.md
cd50db5fc1695b81b375fb90545bdac18992c4b85796a0a30cf1deb1d1505a6b  auditoria-a2/A3_7_4_3_GATE_B2_PART2_MANIFEST.md
c3e887209c503d8c65a314548784cf822e2a778c5ab96812261117eedee1bac8  auditoria-a2/A3_7_4_3_GATE_B3_PART1_MANIFEST.md
```
- No re-pins were made.
- No historical guard blocked the change, so no freeze exception was needed.

## Unchanged frozen files (sha256)
```
5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca  supabase/functions/instagram-publishing/instagramPublish.ts
2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd  supabase/functions/instagram-publishing/shared.ts
6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a  supabase/functions/instagram-publishing/graph.ts
be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa  supabase/functions/instagram-publishing/derivative.ts
9b5f26d48f0ab2ea632ebe42d2c2247d49005eca292140ca4ea3d78a1fe190dd  src/features/instagram-publish/repository.ts
ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b  src/App.tsx
1eb1a91eda49dcaaba496acb7072131c153bd022de0e87a637100584c61bbad0  src/features/publications/validation/PublicationsValidationPage.tsx
fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a  supabase/config.toml
027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23  supabase/functions/meta-publishing/index.ts
b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb  supabase/functions/meta-publishing/handler.ts
48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd  supabase/functions/meta-publishing/facebookPublish.ts
7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a  supabase/functions/meta-publishing/facebookPhoto.ts
```

## Changed or new files (sha256)
```
b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db  supabase/functions/instagram-publishing/connectionPreflight.ts   (new)
f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28  supabase/functions/instagram-publishing/index.ts                (was b782a99f…)
d45f107e041088e5ab5242be9d2a03584ed4544b7a3ef5f54332cb5fedf7e3a0  src/features/instagram-publish/connectionCheck.ts               (new)
67cc7b293a7b2a3cbb35206e7d598141699a55a28ef9b6463c6c04aac2e8a52b  src/features/instagram-publish/MetaConnectionCheck.tsx          (new)
c5660c551f7a8facf5371399974b2a55072f71eca508119a41cd40ea957b0f9e  src/features/instagram-publish/copy.ts                          (was fe8ce97b…)
746e94b366d55e755fa5fa0b8e86696931a951bfc4ae8524773b2a0aaa84a42e  src/features/instagram-publish/InstagramPublishHarness.tsx      (was b7ea8c5c…)
bfc651657f457752ca00ca0b98c0ed90d8edb13961514e24124c705c93c03855  src/features/publications/__tests__/a3743GateB3Fix01ConnectionPreflight.test.ts (new)
87f8bfce541362ee24dbb8280732a24dfcc627b75f91465c2e62cf5f7efeeade  supabase/functions-deploy-state.json                           (deploy tool; was 33fd37ab…)
```

## Database
- No migrations.
- No DDL or DML; only read-only SELECT diagnostics.

## Deployment
- Only `instagram-publishing` was deployed. It is ACTIVE with `verifyJWT: true`.
- Deploy-state hash moved from be803eca… to 7daa1d6399f74a764be601df56015e82dc90a6501ab688868682c136e0992284.

## Test counts
| Suite | Result |
|---|---|
| FIX01 | 27 |
| IG Gate A | 39 |
| B.2 P1 | 24 |
| Facebook | 123 |
| Full | **2964 / 2964** |

- tsc: 20 errors, all inherited, 0 new.
- Build: OK.

## Verdict
GO — A3.7.4.3 GATE B.3 FIX01 READ-ONLY LIVE CHECK READY; OWNER EXECUTION PENDING
