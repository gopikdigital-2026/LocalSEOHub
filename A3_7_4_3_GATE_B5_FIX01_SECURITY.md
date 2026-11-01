# A3.7.4.3 GATE B.5 — FIX01 RECOVERY SECURITY VERIFICATION

This is a read-only production check, run on 2026-11-01. Fingerprints are `md5(regexp_replace(prosrc,'\s','','g'))`.

| Check | Value | Result |
|---|---|---|
| New production migration | none; 60 rows, newest 20261031234927 | PASS |
| publish_attempt_begin | c7a783fc795bb4f5eb5ebbc1246e943b, {postgres, service_role} | PASS |
| publish_attempt_finish | b899c48ece67be21664ec8564e475cbb, {postgres, service_role} | PASS |
| publish_attempt_record_verification | eabb8a45d15c3127aecedbf2d5201255, {postgres, service_role} | PASS |
| publish_attempts_guard | 3ae610d5cbf419af15dce170cb853d7a, {postgres} | PASS |
| advance / mark_stale / gate / preflight / entitlement_active | e13cee80 / b99f5731 / 12f9d6cf / 356c5e36 / 325e375c | PASS (unchanged) |
| All-function permissions md5 | 35a194e9e81695980e1727107bb5df06 (equals the B.5 post-apply value) | PASS |
| Other function sources | fb511e927e6e8224a4065480041a37a8 | PASS |
| Table grants | 06557e88fb5ed93a9c17379f20280724 | PASS |
| RLS enablement | f7bf26607a8abca7e4ca49d13a355f2f | PASS |
| Policies | 93 / 529a39b14d5a186440987fc1428c4466 | PASS |
| publication* triggers | a226db0106f10f2510beb143bcab462d | PASS |
| Facebook | `meta-publishing` not redeployed (tracker hash ae6e628c… unchanged); 1 Facebook attempt, untouched (last change 2026-10-30 22:40:42.724699+00) | PASS |
| Instagram attempts / containers | 0 / 0 | PASS |
| Derivatives (`instagram-derivatives`) | 0 | PASS |
| Publication D | `proposals_ready`, updated 2026-10-31 16:16:13.516242+00; draft v3, updated 16:22:09.849195+00, md5 7c34b594984543cdf93171f6b600452a | PASS |
| Entitlements | 1 row, md5 0bd938b4d018ba9832d5eee43c66214f | PASS |
| Arming secrets | no `META_INSTAGRAM_REAL_PUBLISH_*` | PASS |
| Meta POST | none; no function was invoked | PASS |
| `instagram-publishing` deployed with the FIX01 bundle | not deployed; id a3008491-be86-40c3-ae41-0a93ee773be4, ACTIVE, no version field available | **FAIL** |
| Deployed-code equivalence | cannot be read directly | **UNKNOWN** |
