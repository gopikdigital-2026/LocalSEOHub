# A3.7.4.3 GATE B.5 — DEPLOYMENT MANIFEST

## Migration

| Field | Value |
|---|---|
| Repository file | `supabase/migrations/20261031190000_a3743_gateb4_fix01_publish_safety.sql` |
| sha256 | `a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981` (identical to the prepared, independently verified file) |
| Applied | YES, via the standard migration tool, with verbatim content |
| Version recorded in production | `20261031234927`, name `a3743_gateb4_fix01_publish_safety` |
| schema_migrations | 59 → 60 |
| Tool side effect | The tool also wrote a byte-identical repository copy, `supabase/migrations/20261031234927_a3743_gateb4_fix01_publish_safety.sql`, leaving 62 local files. Unresolved; see Rollout Report section 3b. |

## Edge functions

| Function | id | Action | Deploy-state hash before / after | Status |
|---|---|---|---|---|
| instagram-publishing | a3008491-be86-40c3-ae41-0a93ee773be4 | Deploy requested; the tool reported nothing changed and **deployed nothing** | 7daa1d6399f74a764be601df56015e82dc90a6501ab688868682c136e0992284 / same | ACTIVE; deployed version UNKNOWN (presumed pre-FIX01) |
| meta-publishing | 3b3b0765-4c87-4f5b-ab64-d1025a7a49c1 | none | ae6e628c3337250914530e004cf6d2da55af55d622c3c85d1290f8a4f9c31e6a / same | ACTIVE |
| other 41 functions | — | none | unchanged | ACTIVE |

The tool exposes no version number or timestamp. `functions-deploy-state.json` sha is `87f8bfce541362ee24dbb8280732a24dfcc627b75f91465c2e62cf5f7efeeade`, the same before and after the call.

## Approved `instagram-publishing` source (not yet deployed)

| File | Approved sha256 | Baseline (deployed) sha256 |
|---|---|---|
| connectionPreflight.ts | b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db | same |
| derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa | same |
| graph.ts | a107c840cba644967c9a911ef923755176de0b7674530372a506bdc1333bb61e | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a |
| index.ts | 6312ea2ebf7210d10e0319373d3cf48381e2925b23934a169a65b475334ea675 | f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28 |
| instagramPublish.ts | df94b08fcbd2134d17a85a3ecdaefdfcdda51a36014771585a6510787ad200f1 | 5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca |
| publishTarget.ts | d58f363b11e2c02a027da341e0c46c97691fc0490d4435287442b09c16d1040d | (absent) |
| shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd | same |

## Test files re-pinned in B.5

See `auditoria-a2/gate-b5-rollout/evidence/02_REGRESSION.txt` for the post-change sha of each file, and `03_REPIN_LIST.txt` / `04_REPIN_DIFF.patch` for the exact changes.

## Evidence index

All files are in `auditoria-a2/gate-b5-rollout/evidence/`:

1. `01_PRECHECKS.txt`
2. `02_REGRESSION.txt`
3. `03_REPIN_LIST.txt`
4. `04_REPIN_DIFF.patch`
5. `05_MIGRATION_APPLY.txt`
6. `06_DEPLOY_ATTEMPT.txt`
7. `07_POST_APPLY_REPO_SIDE_EFFECT.txt`
