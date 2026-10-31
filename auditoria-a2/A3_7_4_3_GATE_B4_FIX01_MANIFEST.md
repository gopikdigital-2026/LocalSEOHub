# A3.7.4.3 — Gate B.4 — FIX01 — MANIFEST

## 1. Files added (reports only)
| File | sha256 |
|---|---|
| auditoria-a2/A3_7_4_3_GATE_B4_FIX01_IMPLEMENTATION.md | 5cfdad66540c966ad189cbeed9c934ad47a591c8aef1b4a9f70118f9ac5bce38 |
| auditoria-a2/A3_7_4_3_GATE_B4_FIX01_SECURITY.md | b9af22fafe76e2ed9851f61272ea8f443e0d3662770c5543a9b2fd50c55222fb |
| auditoria-a2/A3_7_4_3_GATE_B4_FIX01_MANIFEST.md | (this file; recorded in the ZIP listing) |

Files modified: **none**. Migrations added or applied: **none** (local count is 60; production schema_migrations has 59 rows, unchanged). Deploys: **none**.

## 2. Frozen dependencies that block FIX01 (exact)
Current hashes equal the pinned values:

| File | Current = pinned sha256 | Pinned by |
|---|---|---|
| supabase/functions/instagram-publishing/instagramPublish.ts | 5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca | B3 FIX01 test L429-432; B3 FIX02 test L250-262 |
| supabase/functions/instagram-publishing/index.ts | f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28 | B3 FIX02 test L250-262 |
| supabase/functions/instagram-publishing/graph.ts | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a | B3 FIX01 test; B3 FIX02 test |
| supabase/functions/instagram-publishing/shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd | B3 FIX01 test; B3 FIX02 test |
| supabase/functions/instagram-publishing/derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa | B3 FIX01 test; B3 FIX02 test |
| supabase/functions/instagram-publishing/connectionPreflight.ts | b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db | B3 FIX02 test |
| supabase/migrations/20261030232253_a3743_instagram_container_state.sql | 366493c40ef00561da1830f1ef1aa0f3f37ee46b784476d58371670b64482662 | B3 FIX02 test L127; Gate A test L31 |
| Frozen SQL: publish_attempt_record_verification, publish_attempt_mark_stale, publish_attempts_guard (migration 20261028132929_a3741) | — | a3741 test L145-203, L308-323 (frozen DB logic; also the A3.7.4.1 foundation) |
| Frozen SQL: publish_attempt_begin / publish_attempt_finish | — | shared with frozen Facebook path (meta-publishing/index.ts L103, L114) |
| Migration count = 60 | a281TrustCleanup.test.ts 67ba5b56ce48065241d41032d74beab25c9960628f64b80c1c41fae667a3f821 (L157); a33DiagnosticAction.test.ts 5d849bcb2e852126ec87d49d6d1fc6a96059f6f80d497371ee90d0c5899fe462 (L138) | plus B3 FIX02 test L287-292 (exact "60 … FIX02 AUTHORIZED RE-PIN" text); a281 also pinned by a3741 AUTHORIZED_REPINS (L500-526) |

Cascade: re-pinning a281 changes a3741MetaPublishingFoundation.test.ts (4760b8f315ba110767dbbe33d6c6ac07b0cc725a8db53f7a156fc44f649f7827), which is pinned by Gate A T36 L782. Re-pinning the B3 FIX01 and FIX02 tests changes bfc651657f457752ca00ca0b98c0ed90d8edb13961514e24124c705c93c03855 and a45d72aac1626b69b1026734e811cc52b44abdae674a0d781ee2fbb50bbe9246, which are recorded in the FIX02 manifests. Gate A test b1dc0995d8c2db7499dc94e48a8c6e3788cfb9e025c32b7c9136d160795ed617.

## 3. Regression (baseline, post-report)
- Vitest full: 88 files, **2983 / 2983 passed**, 0 skipped, 0 disabled.
- The race, entitlement, integrity and retry/UNKNOWN suites were not created, because the corrections were not applied. Existing auth, IG, Facebook-frozen and freeze-integrity suites are included in the full run and pass.
- tsc: **20** errors (inherited baseline, unchanged).
- Build: OK.

## 4. Freeze integrity
All historical manifests are byte-identical:
- A3_7_2 ced8edff
- A3_7_3_1 8c97c602
- A3_7_3_3 d4a97006
- A3_7_3_4 81217523
- A3_7_4_1 ee28cd0e
- A3_7_4_2 34feabd3
- A3_7_4_2_GATE_A 6112bda7
- A3_7_4_3_GATE_A 24c9c054
- B1 4d2694dd
- B2P1 6421dc8e
- B2P2 cd50db5f
- B3P1 c3e88720
- B3FIX01 2209ac27
- FIX02_MANIFEST 5e168ad1
- FIX02_MANIFEST_FINAL 0f35d9bb
- FIX02_FINAL_FREEZE 8ebc2b35
- FIX02_GO_MANIFEST 9b312d26
- B4_EVIDENCE d67a7737

Frozen Facebook files, config.toml (fc17510c…) and test image 6edee998… are unchanged.

## 5. Deployment requirements (future, separately authorized)
1. A new migration `a3743_gateb4_fix01_publish_safety` (SQL changes per IMPLEMENTATION §3.1-3.4).
2. A redeploy of `instagram-publishing` following the F8 procedure.
3. No secret activation until an independent audit of the applied FIX01.

## 6. Verdict
NO-GO — A3.7.4.3 GATE B.4 FIX01 REQUIRES FURTHER CORRECTION
