# A3.7.4.3 — Instagram Gate B.5 FIX02 — Manifest

**Verdict:** NO-GO — INSTAGRAM GATE B.5 DEPLOYMENT MECHANISM UNAVAILABLE
**Archive:** `localseohub-a3743-gateB5-fix02-tracker-recovery.zip`. Its SHA-256 is reported with delivery, because an archive cannot contain its own hash.

## New deliverables

| File | SHA-256 |
|---|---|
| A3_7_4_3_GATE_B5_FIX02_RECOVERY_REPORT.md | 471c8d4b49153eeb14a3bda396338cf73c043d2f1ca09c0277b9b1b83acf84da |
| A3_7_4_3_GATE_B5_FIX02_SECURITY.md | 8431353fa9ca044fd01942b9094cba111555dd7e9c3ad87938672f66f418c250 |
| auditoria-a2/gate-b5-fix02-tracker-recovery/evidence/01_SOURCE_AND_MECHANISM.txt | a21bf5c7752ab304e92cc4c68ad2398752e308e13c31ed2d691ec90cff461449 |
| auditoria-a2/gate-b5-fix02-tracker-recovery/evidence/02_PRODUCTION_SAFETY_AND_REGRESSION.txt | b4ca172d57725edcb0363b752dfd61bc457f4fdc86ed5ca2f5c12fc3f3093dcb |

## Approved Instagram sources (unchanged, verified)

| File | SHA-256 |
|---|---|
| graph.ts | a107c840cba644967c9a911ef923755176de0b7674530372a506bdc1333bb61e |
| index.ts | 6312ea2ebf7210d10e0319373d3cf48381e2925b23934a169a65b475334ea675 |
| instagramPublish.ts | df94b08fcbd2134d17a85a3ecdaefdfcdda51a36014771585a6510787ad200f1 |
| publishTarget.ts | d58f363b11e2c02a027da341e0c46c97691fc0490d4435287442b09c16d1040d |
| connectionPreflight.ts | b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db |
| derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa |
| shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd |
| supabase/functions-deploy-state.json (read only) | 87f8bfce541362ee24dbb8280732a24dfcc627b75f91465c2e62cf5f7efeeade |

## Files modified in FIX02

None outside the new deliverables. No source, test, migration, config or tracker file was changed.

## Archive exclusions

`.env`, `.bolt/`, `.v3/`, `node_modules/`, `dist/`, all `*.zip` files (including `deliverables/`), and the archive itself.
