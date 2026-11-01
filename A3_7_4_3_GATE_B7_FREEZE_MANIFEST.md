# A3.7.4.3 — Gate B.7 — Freeze Manifest

Frozen 2026-11-01 21:14 UTC. Verdict: GO — INSTAGRAM REAL PUBLISHING VERIFIED; SAFELY DISARMED; GATE B.7 FROZEN.

## Production outcome (frozen)
| Item | Value |
|---|---|
| Instagram attempt | ba3e3bca-6ff0-43a4-947c-7414d571d9d3, succeeded, attempt 1 |
| Media id | 18044145305836108 |
| Container id | 17959806654082910 |
| Permalink | https://www.instagram.com/p/DfNqSPmiEIP/ |
| Facebook attempt (unchanged) | aaca823e-44ab-4d67-bce2-aeee40d24ba7, 1393994523793266_122114709087502661 |
| Arming secrets | absent (disarmed) |

## Source hashes (sha256, unchanged in B.7)
```
b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db  supabase/functions/instagram-publishing/connectionPreflight.ts
be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa  supabase/functions/instagram-publishing/derivative.ts
a107c840cba644967c9a911ef923755176de0b7674530372a506bdc1333bb61e  supabase/functions/instagram-publishing/graph.ts
6312ea2ebf7210d10e0319373d3cf48381e2925b23934a169a65b475334ea675  supabase/functions/instagram-publishing/index.ts
df94b08fcbd2134d17a85a3ecdaefdfcdda51a36014771585a6510787ad200f1  supabase/functions/instagram-publishing/instagramPublish.ts
d58f363b11e2c02a027da341e0c46c97691fc0490d4435287442b09c16d1040d  supabase/functions/instagram-publishing/publishTarget.ts
2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd  supabase/functions/instagram-publishing/shared.ts
7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a  supabase/functions/meta-publishing/facebookPhoto.ts
48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd  supabase/functions/meta-publishing/facebookPublish.ts
b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb  supabase/functions/meta-publishing/handler.ts
027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23  supabase/functions/meta-publishing/index.ts
a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981  supabase/migrations/20261031234927_a3743_gateb4_fix01_publish_safety.sql
6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7  auditoria-a2/gate-b1-assets/a3743-publication-d-test-image.png
```

## Database baseline (reproducible formulas)
- Function fingerprints: see A3_7_4_3_GATE_B7_SECURITY.md (all 9 match the B.6 baseline).
- Migrations: 60, the latest is 20261031234927.
- Public policies: 93.
- New policy hash `b53aef5e9275e9d2d0c8f2433da1fd03`, from:
  `select md5(string_agg(concat_ws('|',tablename,policyname,permissive,roles::text,cmd,qual,with_check),E'\n' order by tablename,policyname)) from pg_policies where schemaname='public'`
- New function-ACL hash `86bc51a33e2c0a888dd8cb773909cdf2`, from:
  `select md5(string_agg(p.oid::regprocedure::text||coalesce(proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where pronamespace='public'::regnamespace`

## Verification
- Vitest: 90 files and 3069 tests passed.
- `npm run build`: exit 0.
- Edge functions: 43 ACTIVE, 0 with undeployed changes.

## Deliverables
- A3_7_4_3_GATE_B7_FINAL_REPORT.md
- A3_7_4_3_GATE_B7_SECURITY.md
- A3_7_4_3_GATE_B7_FREEZE_MANIFEST.md
- auditoria-a2/gate-b7-final/evidence/01_POST_PUBLISH_READONLY_STATE.txt
- localseohub-a3743-gateB7-final.zip. It excludes node_modules, dist, .env, .bolt, deliverables/ and nested ZIPs.
