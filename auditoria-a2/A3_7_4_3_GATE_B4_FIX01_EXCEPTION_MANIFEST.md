# A3.7.4.3 — Gate B.4 — FIX01 — AUTHORIZED FROZEN-CODE EXCEPTION — MANIFEST

Status: development-only correction. NOT applied, NOT deployed, NOT activated. No publishing.

## 1. Authorized divergence from the frozen baseline
Baseline = `localseohub-a3743-gateB4fix01.zip`. A recursive diff (excluding node_modules, dist, .git, .env, *.zip)
shows exactly these differences and nothing else:

| Path | Status | sha256 (after) |
|---|---|---|
| supabase/functions/instagram-publishing/instagramPublish.ts | modified | df94b08fcbd2134d17a85a3ecdaefdfcdda51a36014771585a6510787ad200f1 |
| supabase/functions/instagram-publishing/index.ts | modified | 6312ea2ebf7210d10e0319373d3cf48381e2925b23934a169a65b475334ea675 |
| supabase/functions/instagram-publishing/graph.ts | modified | a107c840cba644967c9a911ef923755176de0b7674530372a506bdc1333bb61e |
| supabase/functions/instagram-publishing/publishTarget.ts | added | d58f363b11e2c02a027da341e0c46c97691fc0490d4435287442b09c16d1040d |
| auditoria-a2/gate-b4-fix01-prepared/20261031190000_a3743_gateb4_fix01_publish_safety.sql | added (prepared only) | a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981 |
| src/features/publications/__tests__/a3743InstagramGateA.test.ts | modified | a88b6a9749aa843a19a209ca01dbf8c828b198941e7cf0aeaba603bfc6c77eb8 |
| src/features/publications/__tests__/a3743GateB2Part1Security.test.ts | modified | 1721fca93aa83834e109cec2b2e5615c4375aeb0014a677cd974a48fa5f6d7d5 |
| src/features/publications/__tests__/a3743GateB3Fix01ConnectionPreflight.test.ts | modified | 1a41e4efbea11ab67de05461c498ffcc64efd43c725e25e476c21f6a568e32e7 |
| src/features/publications/__tests__/a3743GateB3Fix02StatusAttemptGrant.test.ts | modified | 882a12c692b3f20da332631304cc0daba35d0f6233b90d4fbd6c260cc6184e24 |
| src/features/publications/__tests__/gateB4Fix01DbModel.ts | added | 075c7aaed1093ca681083b9ce2bb4fa632f22193034e5448583534f168bd20f7 |
| src/features/publications/__tests__/a3743GateB4Fix01PublishSafety.test.ts | added | a0d479e9c620b8d313be409b42ffa19c8a3507059ad415bfe977dbb81f25b13f |
| src/features/publications/__tests__/a3743GateB4Fix01DatabaseAndFreeze.test.ts | added | 78ea9a2a48701e9a89884437a9c52400cf11b69e2580660453dad770442414fa |
| auditoria-a2/A3_7_4_3_GATE_B4_FIX01_EXCEPTION_IMPLEMENTATION.md | added | recorded in ZIP listing (§6) |
| auditoria-a2/A3_7_4_3_GATE_B4_FIX01_EXCEPTION_SECURITY.md | added | recorded in ZIP listing (§6) |
| auditoria-a2/A3_7_4_3_GATE_B4_FIX01_EXCEPTION_MANIFEST.md | added | this file |

Before hashes and the per-line re-pin ledger: IMPLEMENTATION §2.

Explicitly unchanged: shared.ts 2de062ea…23cd, derivative.ts be27cd6e…8dfa, connectionPreflight.ts b57c82c1…b9db;
Facebook meta-publishing/index.ts 027ee4fe…ab23, handler.ts b7525645…1ffb, facebookPublish.ts 48da8e2f…28dd,
facebookPhoto.ts 7225bc3d…726a; supabase/migrations (60 files; foundation 42db6849…, container_state
366493c4…); all UI code; publication D.

## 2. Historical freeze comparison
All 23 earlier reports/manifests are byte-identical to the baseline (`sha256sum -c` against the baseline copy: 0 mismatches).

| File | sha256 |
|---|---|
| A3_7_2_FREEZE_MANIFEST.md | ced8edffe1020456cbe645c62991f310eb910a74d4e29d3fd6a77bba9fba917a |
| A3_7_3_1_FREEZE_MANIFEST.md | 8c97c60295c66fa9eb53d1c4c5fb7664ac78ff92ece16b8e41fe2e296c0549b6 |
| A3_7_3_3_FREEZE_MANIFEST.md | d4a9700687fea40541c1d3e2c474ee671ad2d9219f8b9083d3285d3a195d5862 |
| A3_7_3_4_FREEZE_MANIFEST.md | 81217523283748bf41d917c80591d0277467740b608ed71ddc867982147e6606 |
| A3_7_4_1_FREEZE_MANIFEST.md | ee28cd0e9f1a52e75d9e67b49ab3a96ee6d0ce4d10c142cb95efc9313851e907 |
| A3_7_4_2_FREEZE_MANIFEST.md | 34feabd3781ea3fc4e2573d69f53e9a4ca99b802a860bace62d4ea3eef6ce228 |
| A3_7_4_2_GATE_A_MANIFEST.md | 6112bda74721ec6b5e9c363a6d87e47cbe3834a0d58ace20971b0ddcfed7a327 |
| A3_7_4_3_GATE_A_MANIFEST.md | 24c9c054c3fe5f71316b04c8910793bda8696e7b0126952b7bb0c7b6ceab37f4 |
| A3_7_4_3_GATE_B1_MANIFEST.md | 4d2694dd8d7ecd8bbc5af812fbdeb761799254f1dff8b428769b8da2c0554849 |
| A3_7_4_3_GATE_B2_PART1_MANIFEST.md | 6421dc8e521c5568477b446fb5853a965b364156247ca77359e0efaea4764a7b |
| A3_7_4_3_GATE_B2_PART2_MANIFEST.md | cd50db5fc1695b81b375fb90545bdac18992c4b85796a0a30cf1deb1d1505a6b |
| A3_7_4_3_GATE_B3_PART1_MANIFEST.md | c3e887209c503d8c65a314548784cf822e2a778c5ab96812261117eedee1bac8 |
| A3_7_4_3_GATE_B3_FIX01_MANIFEST.md | 2209ac279aa8caf4ad47aeac2f90014a8bd615bffc348b7df133c810a3757411 |
| A3_7_4_3_GATE_B3_FIX02_MANIFEST.md | 5e168ad1a097945e2a6fd3a4fe81df067093c12b1884024029f81182007e7282 |
| A3_7_4_3_GATE_B3_FIX02_MANIFEST_FINAL.md | 0f35d9bb8c24ebeb80eb3aa0f5aad10f15f7b718cf7b41d539e5dae4e4248d5d |
| A3_7_4_3_GATE_B3_FIX02_GO_MANIFEST.md | 9b312d260174ca9232a165d9a20a8fbc99e0b60a9112b6815ad608d08ef53217 |
| A3_7_4_3_GATE_B3_FIX02_FINAL_FREEZE_MANIFEST.md | 8ebc2b359e84e71109274d453a3c47943180e3b934b53d9abbde451012326050 |
| A3_7_4_3_GATE_B4_EVIDENCE_MANIFEST.md | d67a773775e2e5d9c34d1184c271dbf25fbfda73d56702facb6fd628bc380f2d |
| A3_7_4_3_GATE_B4_FIX01_MANIFEST.md | ce255ae3ca2f9f1c3146e86246acec43959b81e719e6b475d6efe245f6f6ae09 |
| A3_7_4_3_GATE_B4_FIX01_IMPLEMENTATION.md | 5cfdad66540c966ad189cbeed9c934ad47a591c8aef1b4a9f70118f9ac5bce38 |
| A3_7_4_3_GATE_B4_FIX01_SECURITY.md | b9af22fafe76e2ed9851f61272ea8f443e0d3662770c5543a9b2fd50c55222fb |
| A3_7_4_3_GATE_B4_READINESS_AUDIT.md | a1db096bc8f7dca51f9900695bbf149be4294e4a491721bce60f3a3cd0ff1cbd |
| A3_7_4_3_GATE_B4_SECURITY_AND_RECOVERY.md | fd52a0bda1ac7e62f3ee5e4aafe31241dc6e0debeec2d2e24b7e6cb5b910c88b |

The 19 manifest hashes are also asserted by `a3743GateB4Fix01DatabaseAndFreeze.test.ts`.

## 3. Regression (§10) — final run after all reports were written
- Vitest full: **90 files, 3069 / 3069 passed**, 0 failed, 0 skipped, 0 todo (baseline 2983 + 86 new).
- New: PublishSafety 55, DatabaseAndFreeze 31. All Graph / storage / DB interaction mocked; no network.
- tsc (`tsconfig.app.json`): **20** errors = baseline; all in untouched files (App.tsx 1, BusinessAuditLanding 2,
  ContentGeneratorLanding 2, DiagnosticLanding 1, LandingPage 10, MetaAdsLanding 2, a3422GbpRecovery.test 1,
  legacy AdminDashboard 1). None in changed or new files.
- Build: OK.

## 4. §12 compliance
Migrations applied: none (schema_migrations 59; live function md5s unchanged — SECURITY §1). Deploys: none.
Secrets changed: none (no META_INSTAGRAM_* present). Activation / entitlement renewal: none. Containers, uploads,
attempts, Graph POSTs: none (0 IG attempts). Publication D: unchanged (proposals_ready, v3). Publishing: none.

## 5. Deployment-verification procedure (§11) — for a future, separately authorized step
Do NOT treat anything here as performed. No claim of deployed equivalence is made.

1. Approve source: confirm the four IG files and the SQL hash to the §1 values (`sha256sum`). Any mismatch → stop.
2. Re-pin plan: placing the SQL in `supabase/migrations/` makes the count 61; the a281, a33, B3 FIX02 and B4
   DatabaseAndFreeze count / location pins must be re-pinned under a separate authorization BEFORE applying.
3. Apply the migration in one transaction; then read-only:
   `select proname, md5(prosrc), prosecdef, proconfig, proacl from pg_proc where proname in (…)` — record the four
   new md5s, confirm SECURITY DEFINER, `search_path=""`, EXECUTE = postgres + service_role (guard: postgres only),
   mark_stale and advance md5s unchanged (1042747630e9cff8d7da0b7ece08fdfe, 8b23859c0abeac3b3b3c5ba08fc3c476).
   Run a live two-session concurrency check on a disposable non-D attempt (lock + `unsafe_absent`,
   `outcome_unprovable`) without any Graph call.
4. Deploy only `instagram-publishing` (code and SQL together; never code alone). Record the deployed function
   version number and bundle/ezbr sha from the list-functions output; confirm `meta-publishing` version unchanged.
5. Independent verification that the active version's source equals the approved hashes (download / compare
   bundle) by someone other than the implementer.
6. Read-only post-checks: 0 IG attempts, D unchanged (proposals_ready, v3, caption/image hashes = pins), no
   META_INSTAGRAM_* secrets, publishing still disarmed.
7. Only then may equivalence be stated, and only for the recorded version.

## 6. Delivery
ZIP: `localseohub-a3743-gateB4fix01-exception.zip` (project root). Exclusions: node_modules, dist, .git, .env*,
*.zip, credentials. Verified programmatically: zero nested zips, zero forbidden paths, archive integrity OK.
Entry count and archive sha256 are reported with the delivery (the archive cannot contain its own hash).

## 7. Verdict
GO — A3.7.4.3 GATE B.4 FIX01 SECURITY CORRECTIONS READY FOR INDEPENDENT AUDIT; NOT DEPLOYED
