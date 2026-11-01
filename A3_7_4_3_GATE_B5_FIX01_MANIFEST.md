# A3.7.4.3 GATE B.5 — FIX01 RECOVERY MANIFEST

## Repository changes

| Path | Change |
|---|---|
| `supabase/migrations/20261031190000_a3743_gateb4_fix01_publish_safety.sql` | REMOVED (redundant; sha a3209acb…) |
| `supabase/migrations/20261031234927_a3743_gateb4_fix01_publish_safety.sql` | kept; sha a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981 |
| `auditoria-a2/gate-b4-fix01-prepared/20261031190000_a3743_gateb4_fix01_publish_safety.sql` | kept, unchanged (sha a3209acb…) |
| `src/features/publications/__tests__/a3743GateB4Fix01DatabaseAndFreeze.test.ts` | promotion-test file name re-pinned to 20261031234927, plus an absence assertion for the 190000 copy |
| `auditoria-a2/gate-b5-fix01-recovery/evidence/*` | added: 01 reconciliation and regression, 02 deploy investigation, 03 production verification |
| 3 recovery reports | added |

## Not changed

- `instagram-publishing` source (sha256 verified):
  - graph.ts a107c840…
  - index.ts 6312ea2e…
  - instagramPublish.ts df94b08f…
  - publishTarget.ts d58f363b…
  - connectionPreflight.ts b57c82c1…, derivative.ts be27cd6e…, shared.ts 2de062ea…
- `supabase/functions-deploy-state.json` (sha 87f8bfce…).
- `supabase/config.toml`.
- Every other function, migration and the production database.

## Deployments

None. `deploy_edge_functions` was called once and reported nothing to deploy.
