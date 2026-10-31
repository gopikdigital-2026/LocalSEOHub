# A3.7.4.3 — Instagram Gate B.3 — FIX02 — Manifest

**Verdict: NO-GO — A3.7.4.3 GATE B.3 FIX02 REQUIRES CORRECTION**

## 1. Changed files
Application code, tests, migrations, config: **none**.

Added (documentation only):
- `auditoria-a2/A3_7_4_3_GATE_B3_FIX02_ROOT_CAUSE.md`
- `auditoria-a2/A3_7_4_3_GATE_B3_FIX02_SECURITY.md`
- `auditoria-a2/A3_7_4_3_GATE_B3_FIX02_MANIFEST.md`

## 2. Database / deployment
- Migrations applied: none.
- Edge functions deployed: none.
- Secrets changed: none.

## 3. Hashes (SHA-256, unchanged from FIX01)
| File | SHA-256 |
|---|---|
| supabase/functions/instagram-publishing/index.ts | f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28 |
| supabase/functions/instagram-publishing/instagramPublish.ts | 5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca |
| supabase/functions/instagram-publishing/shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd |
| supabase/functions/instagram-publishing/derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa |
| supabase/functions/instagram-publishing/graph.ts | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a |
| supabase/functions/instagram-publishing/connectionPreflight.ts | b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db |
| supabase/config.toml | fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a |
| src/features/instagram-publish/repository.ts | 9b5f26d48f0ab2ea632ebe42d2c2247d49005eca292140ca4ea3d78a1fe190dd |
| src/features/instagram-publish/InstagramPublishHarness.tsx | 746e94b366d55e755fa5fa0b8e86696931a951bfc4ae8524773b2a0aaa84a42e |
| src/features/instagram-publish/MetaConnectionCheck.tsx | 67cc7b293a7b2a3cbb35206e7d598141699a55a28ef9b6463c6c04aac2e8a52b |
| src/features/instagram-publish/connectionCheck.ts | d45f107e041088e5ab5242be9d2a03584ed4544b7a3ef5f54332cb5fedf7e3a0 |
| src/features/instagram-publish/copy.ts | c5660c551f7a8facf5371399974b2a55072f71eca508119a41cd40ea957b0f9e |
| src/App.tsx | ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b |
| supabase/functions/meta-publishing/index.ts | 027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23 |
| supabase/functions/meta-publishing/handler.ts | b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb |
| supabase/functions/meta-publishing/facebookPublish.ts | 48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd |
| supabase/functions/meta-publishing/facebookPhoto.ts | 7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a |
| supabase/migrations/20261028132929_a3741_meta_publishing_security_foundation.sql | 42db6849eabf35b0d4c190b64178d531521d29e7e299fadd11dd90e9615dc79c |
| src/components/__tests__/a281TrustCleanup.test.ts | 2f4b6d27fd7f1d2f7851251f5a2fc3dfd71f6558be1b7dd9724e1b387d0a0a9a (= Gate A manifest L75) |
| src/features/action-layer/__tests__/a33DiagnosticAction.test.ts | b7705d22de2d2cbab4bbcf06f11d004c0bb11f448fba2701ac944c3ae4e9236e (= Gate A manifest L78) |

Historical manifests are byte-identical: no edits were made to any file in `auditoria-a2/` other than the three added above.

## 4. Exception required to proceed (see ROOT_CAUSE §7-§8)
| Item | Change if authorized |
|---|---|
| New migration `*_a3743_instagram_status_attempt_read_grant.sql` | Column-scoped `GRANT SELECT (…9 cols…) ON publication_publish_attempts TO service_role` |
| `a281TrustCleanup.test.ts` L157 | Count 59 to 60 (re-pin; new hash) |
| `a33DiagnosticAction.test.ts` L138 | Count 59 to 60 (re-pin; new hash) |
| New `a3743GateB3Fix02StatusInternalError.test.ts` | Asserts grant scope, no write grants, and that FIX01 and Facebook are unchanged |
| Deploy | None required |

## 5. ZIP
`localseohub-a3743-gateB3fix02.zip`. Excludes nested zips, `node_modules`, `dist`, `.git`, `.env*` and credentials.
