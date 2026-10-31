# A3.7.4.3 — GATE B.4 — EVIDENCE MANIFEST

Verdict: **NO-GO — A3.7.4.3 INSTAGRAM GATE B.4 REQUIRES CORRECTION**

## 1. Baseline and freeze integrity

**Baseline ZIP 38:** `localseohub-a3743-gateB3fix02-go.zip`, sha256 `e0e46362db5d6a3e70d90a6ec4337c365bafd3d1520c56ca884d8c293851d1f2`. All 686 file hashes are identical to the current tree (before the B.4 reports were added). **Baseline ESTABLISHED.**

All historical manifests are byte-identical to their recorded values.

| Manifest | sha256 |
|---|---|
| A3_7_2_FREEZE_MANIFEST | ced8edffe1020456cbe645c62991f310eb910a74d4e29d3fd6a77bba9fba917a |
| A3_7_3_1_FREEZE_MANIFEST | 8c97c60295c66fa9eb53d1c4c5fb7664ac78ff92ece16b8e41fe2e296c0549b6 |
| A3_7_3_3_FREEZE_MANIFEST | d4a9700687fea40541c1d3e2c474ee671ad2d9219f8b9083d3285d3a195d5862 |
| A3_7_3_4_FREEZE_MANIFEST | 81217523283748bf41d917c80591d0277467740b608ed71ddc867982147e6606 |
| A3_7_4_1_FREEZE_MANIFEST | ee28cd0e9f1a52e75d9e67b49ab3a96ee6d0ce4d10c142cb95efc9313851e907 |
| A3_7_4_2_FREEZE_MANIFEST | 34feabd3781ea3fc4e2573d69f53e9a4ca99b802a860bace62d4ea3eef6ce228 |
| A3_7_4_2_GATE_A_MANIFEST | 6112bda74721ec6b5e9c363a6d87e47cbe3834a0d58ace20971b0ddcfed7a327 |
| A3_7_4_3_GATE_A_MANIFEST | 24c9c054c3fe5f71316b04c8910793bda8696e7b0126952b7bb0c7b6ceab37f4 |
| GATE_B1_MANIFEST | 4d2694dd8d7ecd8bbc5af812fbdeb761799254f1dff8b428769b8da2c0554849 |
| GATE_B2_PART1_MANIFEST | 6421dc8e521c5568477b446fb5853a965b364156247ca77359e0efaea4764a7b |
| GATE_B2_PART2_MANIFEST | cd50db5fc1695b81b375fb90545bdac18992c4b85796a0a30cf1deb1d1505a6b |
| GATE_B3_PART1_MANIFEST | c3e887209c503d8c65a314548784cf822e2a778c5ab96812261117eedee1bac8 |
| GATE_B3_FIX01_MANIFEST | 2209ac279aa8caf4ad47aeac2f90014a8bd615bffc348b7df133c810a3757411 |
| GATE_B3_FIX02_MANIFEST | 5e168ad1a097945e2a6fd3a4fe81df067093c12b1884024029f81182007e7282 |
| GATE_B3_FIX02_MANIFEST_FINAL | 0f35d9bb8c24ebeb80eb3aa0f5aad10f15f7b718cf7b41d539e5dae4e4248d5d |
| GATE_B3_FIX02_FINAL_FREEZE_MANIFEST | 8ebc2b359e84e71109274d453a3c47943180e3b934b53d9abbde451012326050 |
| GATE_B3_FIX02_GO_MANIFEST | 9b312d260174ca9232a165d9a20a8fbc99e0b60a9112b6815ad608d08ef53217 |

## 2. Audited source hashes (unchanged)

| File | sha256 |
|---|---|
| instagram-publishing/index.ts | f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28 |
| instagram-publishing/instagramPublish.ts | 5523a9c0481760a6… |
| instagram-publishing/graph.ts | 6a5909c494b09f65… |
| instagram-publishing/derivative.ts | be27cd6efba40260… |
| instagram-publishing/connectionPreflight.ts | b57c82c1d970ace3… |
| instagram-publishing/shared.ts | 2de062eaf385236e… |
| supabase/config.toml | fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a |
| migration 20261030232253_a3743_instagram_container_state.sql | 366493c40ef00561da1830f1ef1aa0f3f37ee46b784476d58371670b64482662 |
| migration 20261031172241_a3743_instagram_status_attempt_read_grant.sql | 71c2354572b94779b5a22b1698004fe90ad82eab0b58c5a3ed0747f2ddfdae71 |
| a3743InstagramGateA.test.ts | b1dc0995d8c2db7499dc94e48a8c6e3788cfb9e025c32b7c9136d160795ed617 |
| a3743GateB2Part1Security.test.ts | e045fe5baa91b331f9d283a3064b8584c120f193b591cc1cdf4f96266ed5f813 |
| a3743GateB3Fix01ConnectionPreflight.test.ts | bfc651657f457752ca00ca0b98c0ed90d8edb13961514e24124c705c93c03855 |
| a3743GateB3Fix02StatusAttemptGrant.test.ts | a45d72aac1626b69b1026734e811cc52b44abdae674a0d781ee2fbb50bbe9246 |
| a3741MetaPublishingFoundation.test.ts | 4760b8f315ba110767dbbe33d6c6ac07b0cc725a8db53f7a156fc44f649f7827 |
| a3742FacebookPhotoPublishing.test.ts | 8542f77b8bab82646f484036ef2cbda02cb92521aa165aa8ff1b55e556f66cad |
| instagram-publish/InstagramPublishHarness.tsx | 746e94b366d55e755fa5fa0b8e86696931a951bfc4ae8524773b2a0aaa84a42e |
| instagram-publish/repository.ts | 9b5f26d48f0ab2ea632ebe42d2c2247d49005eca292140ca4ea3d78a1fe190dd |
| gate-b1-assets/a3743-publication-d-test-image.png | 6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7 (md5 fc3a190ee41708dc8b242ff5b711ae58) |

## 3. Production evidence (read-only, 2026-10-31 18:12 UTC)

| Item | Expected | Observed | Result |
|---|---|---|---|
| D publication | 875587f5…6ad6, business e6014022…8247, proposals_ready | match; updated 2026-10-31 16:16:13.516242; owner owns the business | PASS |
| D draft | v3 | v3, updated 16:22:09.849195 | PASS |
| D caption sha256 | 537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e | identical; text identical | PASS |
| D image | PNG 1080×1350, 901,643 B | image/png 1080×1350; object 901643 B; eTag md5 fc3a190e… = md5 of the local asset with sha 6edee998… | PASS |
| Connection | IG 17841462487279994, page 1393994523793266 | match; connected / IG connected; instagram_basic and instagram_content_publish granted; no revocation; no token expiry | PASS |
| A/B/C drafts | unchanged | 65569535 v4 09:15:04.628346; 442059e5 v3 12:30:28.28094; b140fc59 v3 2026-10-30 00:18:03.275237 | PASS |
| Attempts | 1 FB success | only aaca823e, facebook, succeeded, 2026-10-30 22:40:42.724699 | PASS |
| IG attempts / active+unknown / containers | 0 / 0 / 0 | 0 / 0 / 0 | PASS |
| Derivative objects | 0 | instagram-derivatives: 0 objects | PASS |
| Buckets private | yes | publication-images public=false (18 objects); instagram-derivatives public=false | PASS |
| Arming secrets | absent | no META_INSTAGRAM_*; present: META_APP_ID, META_APP_SECRET, META_REDIRECT_URI | PASS |
| Migrations | 59 | 59 | PASS |
| IG function | ACTIVE, JWT on | ACTIVE, verifyJWT=true, id a3008491-be86-40c3-ae41-0a93ee773be4 | PASS |
| Deployed version = local | verifiable | local deploy-state `hasChanged:false`, hash 7daa1d63…2284; not independently verifiable | **UNKNOWN** |
| Internal entitlement | active | internal_owner_e2e, not revoked, expires 2026-11-01 22:21:13 UTC | Note |

## 4. Regression

- Vitest: 88/88 files; 2983 passed, 0 failed, 0 skipped.
- Targeted suites: 6 files, 232 passed.
- tsc: 20 errors (inherited).
- Build: OK.

## 5. Limitations

- No live Graph calls were made, so Meta-side behaviour (error codes at `/media_publish`, container expiry) is assessed from code and tests only.
- The edge wall-clock limit and the deployed bundle hash are not verifiable from this environment.
- The F1 race is established by code and SQL reading; no test reproduces it.

## 6. Audit ZIP

`localseohub-a3743-gateB4-audit.zip`. Its contents verification is reported in the closing message of this gate.
