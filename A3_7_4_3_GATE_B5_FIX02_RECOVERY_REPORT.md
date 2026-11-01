# A3.7.4.3 — Instagram Gate B.5 FIX02 — Deployment Tracker Recovery Report

**Date:** 2026-11-01
**Mode:** Controlled deployment recovery, no real publishing
**Verdict:** **NO-GO — INSTAGRAM GATE B.5 DEPLOYMENT MECHANISM UNAVAILABLE**

## 1. Source verification (section 2)

The seven `instagram-publishing` files match the approved FIX01 bytes: four against the fingerprints in this prompt and three against the FIX01 manifest. Details are in `evidence/01_SOURCE_AND_MECHANISM.txt`.

| File | SHA-256 (prefix) | Result |
|---|---|---|
| graph.ts | a107c840… | PASS |
| index.ts | 6312ea2e… | PASS |
| instagramPublish.ts | df94b08f… | PASS |
| publishTarget.ts | d58f363b… | PASS |
| connectionPreflight.ts | b57c82c1… | PASS (unchanged per FIX01 manifest) |
| derivative.ts | be27cd6e… | PASS (unchanged per FIX01 manifest) |
| shared.ts | 2de062ea… | PASS (unchanged per FIX01 manifest) |

The production FIX01 migration is already applied (newest version 20261031234927, 60 rows) and was not reapplied. All four corrected function fingerprints match: begin c7a783fc, finish b899c48e, record_verification eabb8a45, guard 3ae610d5.

## 2. Deployment mechanism investigation (section 3)

| Candidate | Finding |
|---|---|
| `deploy_edge_functions` | No parameters: no slug, no force, no refresh. It only deploys tracker entries with `hasChanged=true`, and there are 0. |
| Tracker entry | instagram-publishing `hasChanged=false`, hash `7daa1d63…`. That is the same hash as the pre-FIX01 baseline. |
| bolt-database skill | Documents automatic detection only. There is no refresh or resync operation. |
| Bolt Help Center | "Bolt deploys your server functions for you … when it updates them." There is no manual redeploy or per-function deploy. |
| `list_edge_functions` | Read-only. Shows slug, status, id and verifyJWT, with no version field. |
| Supabase CLI | Not supported in this environment. |

Nothing in the available mechanism has changed since FIX01. So, as section 3 requires, `deploy_edge_functions` was **not** called again.

The only remaining routes are editing the tracker or making an artificial source change. Both are forbidden, and neither was used.

## 3. Controlled deployment (section 4)

**Not executed.** The precondition (a confirmed supported mechanism) failed.

Deployed-code equivalence: **UNKNOWN.** The evidence indicates production still runs the pre-FIX01 bundle.

## 4. Production safety (section 5)

All checks were read-only and match the prior recovery. No function was invoked. Details are in `evidence/02_PRODUCTION_SAFETY_AND_REGRESSION.txt`.

- All four SQL safeguards are active, and the other publishing functions, policies (93) and permissions are unchanged.
- Facebook and `meta-publishing` are unchanged: same function id, and the single Facebook attempt was last updated 2026-10-30 22:40:42.
- Publication D is at draft version 3 with unchanged timestamps.
- Instagram attempts: 0. Containers: 0. Derivatives: 0.
- No `META_INSTAGRAM_*` arming secrets are present, and no Meta POST was made.
- No migration, no deploy and no SQL write took place.

## 5. Regression (section 6)

- Tests: 3069/3069 pass, 0 skipped.
- TypeScript: 20 errors, with per-file counts identical to the baseline.
- Build: successful.

## 6. Note on fingerprint reproducibility

Two prior row checksums could not be reproduced because their exact formulas were not recorded: Publication D draft (7c34b594…) and entitlement (0bd938b4…). Equivalence was established instead from unchanged versions, `updated_at` timestamps, counts and row identity.

New checksums were recorded with explicit formulas for future comparison.

The test entitlement expires 2026-11-01 22:21 UTC. It was not renewed, as instructed.

## 7. Options requiring owner action

1. **Owner-run external deploy.** Deploy `instagram-publishing` only, from the Supabase dashboard or a CLI outside Bolt, using the approved bytes listed above. Then request a read-only verification gate.
2. **Platform support.** Ask Bolt support for a supported way to re-detect or redeploy a single function whose tracker entry is stale.

## Verdict

**NO-GO — INSTAGRAM GATE B.5 DEPLOYMENT MECHANISM UNAVAILABLE**

STOP. Real publishing remains disabled.
