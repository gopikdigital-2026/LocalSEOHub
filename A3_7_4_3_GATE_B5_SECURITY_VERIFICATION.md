# A3.7.4.3 GATE B.5 — SECURITY VERIFICATION

All fingerprints below are `md5(regexp_replace(prosrc,'\s','','g'))`, read from production after the migration was applied (version `20261031234927`).

## 1. Corrected functions

| Function | Before | After | Expected | Result |
|---|---|---|---|---|
| publish_attempt_begin | 165e0a4164230dc6db8bcdb6380a32bc | c7a783fc795bb4f5eb5ebbc1246e943b | c7a783fc… | PASS |
| publish_attempt_finish | 104a927804a445e5485cba3d5521ef2d | b899c48ece67be21664ec8564e475cbb | b899c48e… | PASS |
| publish_attempt_record_verification | 4761518141834367425557445611d2f0 | eabb8a45d15c3127aecedbf2d5201255 | eabb8a45… | PASS |
| publish_attempts_guard | 913576bd366a66a6b60151af16030d98 | 3ae610d5cbf419af15dce170cb853d7a | 3ae610d5… | PASS |

All 4 keep SECURITY DEFINER and `search_path=""`.

Permissions:
- The three RPCs are executable by `{postgres, service_role}` only.
- The guard function is executable by `{postgres}` only.

These are identical to the pre-fix permissions.

## 2. Related functions (unchanged)

| Function | md5 | Permissions | Result |
|---|---|---|---|
| publish_attempt_advance | e13cee809bdeaa8381ba02096761454f | postgres, service_role | PASS |
| publish_attempt_mark_stale | b99f5731dca7b2d9a6df5b6c345b78a1 | postgres, service_role | PASS |
| publication_publish_gate | 12f9d6cfa192af2efc55038f2a2745d0 | postgres | PASS |
| publication_publish_preflight | 356c5e36cba82ea003cf9654fededef7 | postgres, service_role | PASS |
| internal_test_entitlement_active | 325e375c25b198448ec80d9334065a12 | postgres, service_role (search_path=public) | PASS |

## 3. Whole-schema checks

| Check | Baseline | After | Result |
|---|---|---|---|
| Public function count | 91 | 91 | PASS |
| Source of all other functions | fb511e927e6e8224a4065480041a37a8 | identical | PASS |
| Table grants (anon / authenticated / service_role) | 06557e88fb5ed93a9c17379f20280724 | identical | PASS |
| RLS enablement | f7bf26607a8abca7e4ca49d13a355f2f | identical | PASS |
| Policies | 93 / 529a39b14d5a186440987fc1428c4466 | 93 / identical | PASS |
| publication* triggers | a226db0106f10f2510beb143bcab462d | identical | PASS |
| All-function permissions hash | 27a33051… | 35a194e9e81695980e1727107bb5df06 | UNKNOWN as a hash comparison; PASS by substitute proof |

**Why the permissions hash is UNKNOWN.** The exact query behind the pre-check value was not recorded, and 20+ variants failed to reproduce it.

**Substitute proof.** The catalog's change markers (xmin) show the migration transaction rewrote exactly 4 `pg_proc` rows: the 4 target functions. It wrote 0 policy rows, 0 public table rows and 0 trigger rows. Each of the 4 has the same permissions as before. So no other function's permissions can have changed.

## 4. Facebook compatibility

- FIX01 changes behaviour only when `channel = 'instagram'` (begin) or when `external_stage = 'publish_requested'` (finish, record_verification and guard).
- Facebook attempts never leave stage `none`, so Facebook behaviour is unchanged.
- `meta-publishing` was not redeployed.
- The only existing attempt (Facebook) is untouched: last change `2026-10-30 22:40:42.724699+00`.

## 5. Publishing-safety state

- 0 Instagram attempts and 0 containers.
- 0 objects in `instagram-derivatives`.
- Publication D and its draft (v3, md5 `7c34b594…`) are unchanged.
- No `META_INSTAGRAM_REAL_PUBLISH_*` secrets.
- 1 entitlement, not modified.
- No Meta POST was made: no edge function was invoked.

## 6. Edge function verification

| Item | Result |
|---|---|
| `instagram-publishing` deployed with the FIX01 source | **FAIL / NOT DONE.** The tool deployed nothing. |
| Deployed artifact compared with the approved source | **UNKNOWN.** The deployed code cannot be read directly; the evidence indicates it is still the pre-FIX01 source. |
| `meta-publishing` | Not redeployed. PASS. |
