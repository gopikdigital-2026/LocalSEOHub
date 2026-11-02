# A3.7.5.2 — Test Evidence (FIX01)

## 1. Totals

| Run | Result |
|---|---|
| Full Vitest suite | **91 files, 3098 / 3098 passed, 0 failed** |
| Dedicated A3.7.5.2 file | 29 / 29 passed |
| Production build | passes |
| Typecheck | 20 errors, **identical to A3.7.5.1 baseline** (sorted diff empty); 0 new; none in A3.7.5.2 code |

Before FIX01: 21 failures, all caused by authorized A3.7.5.2 changes (no pre-existing failures). All resolved by mock fixes and reviewed re-pins; no test disabled, skipped or weakened.

## 2. Dedicated tests — `src/features/internal-access/__tests__/a3752TenantSecurity.test.tsx`

| Requirement | Test(s) |
|---|---|
| Duplicate FB Page across tenants | 409 `META_PAGE_ALREADY_ASSIGNED`, body contains no holder id/user/token/Page name, both rows unchanged |
| Duplicate IG account across tenants | 409 `META_INSTAGRAM_ALREADY_ASSIGNED` with different Page, no IG id/username leak |
| Legitimate owner reconnection | 200 connected; claim carries owner `userId`; release-after-disconnect then claim by another tenant succeeds |
| Concurrent assignment | two simultaneous claims -> exactly one 200 + one 409, single holder |
| Unauthorized selection | forged JWT -> 401 before any claim; un-offered Page -> 403; foreign user on owner connection -> `not_pending`; not-pending -> 409 |
| DB enforcement independent of app | migration asserts partial unique indexes, `user_id = p_user_id`, pending status, offered-Page check, `unique_violation` handler, SECURITY DEFINER + empty search_path, REVOKE PUBLIC/anon/authenticated, GRANT service role only, no row/column/policy changes. Live rolled-back proof in SECURITY_AUDIT §1 |
| Non-admin internal access | 403 `FORBIDDEN`; 401 without user; guard redirects to `/hoy`, panel never mounted; failed check = denied; pending check mounts nothing |
| Authorized admin | 200 `{allowed:true}`, case/whitespace-insensitive; guard renders panel |
| Missing ADMIN_EMAIL fails closed | undefined / "" / "   " -> 403 |
| Customer routes accessible | customer routes under AppGuard, outside InternalGuard; single InternalGuard; 34 paths / 36 Route elements = baseline |
| Neutral ES/EN copy | both languages specific (not generic), mention LocalSEOHub and the recovery path, contain no identity data |

## 3. Re-pinned baselines (each annotated `A3.7.5.2 RE-PIN` in source; each backed by a diff against A3.7.5.1)

Authorized source changes behind the re-pins: App.tsx (+1 import, 1 route wrapped in InternalGuard), config.toml (+3 lines `[functions.internal-access] verify_jwt = true`), meta-connection handler (claim result + userId), +1 migration.

| Test file | Change | Old -> New |
|---|---|---|
| a281TrustCleanup, a33DiagnosticAction, f03Stage2b (x2), a3743GateB3Fix02StatusAttemptGrant, a273Roadmap, a272TodayIntelligence | migration count | 61 -> 62 |
| a3743GateB4Fix01DatabaseAndFreeze | count 62, a3752 last; FIX01-newest checks on `slice(0,-1)` | 61 -> 62 |
| a281, a273, a272, a3544, a3743GateB2Part1, a3743GateB3Fix01, a3743GateB3Fix02 | App.tsx pin | ef7f7cdc… -> f0c81e90… |
| a3743GateB3Fix02 | config.toml pin | fc17510c… -> aeda6a05… |
| a273, a272, a3542 (test 39) | exclude `_a3752_` migration from unrelated-feature scans | — |
| a3543 | md5 of a3542 | a0473304903dfddc4aefb32cad93068b -> 489755e8876032d4bcfd0470a121809b |
| a351, a3512 | mock `finishPageSelection` returns `'ok'` (new return type) | — |
| a3734 | layout assertion includes InternalGuard | — |
| a371 | meta-connection handler pin | 57e8341f -> 65e720d3 |
| a3731 (AUTHORIZED_EXCEPTIONS, manifest order) | a371 file / a3721a file | 76ec5d97… -> e0b85527…; 4030cdc8… -> 3a392196… |
| a3732 | a3731 file | 721d76d3… -> a24601b7… |
| a3741 AUTHORIZED_REPINS + handler pin | App, a281, a273, a272, a3544, a3734, a3732 | now: f0c81e90…, 3d09ed2e…, 687257b4…, e49985e4…, 59b9d730…, 6daddf69…, a24601b7… |
| a3743InstagramGateA T36 | a3741 file | 5e6ca888… -> 4f4f2269… |

Unchanged: every `meta-publishing/*` and `instagram-publishing/*` pin, and all `auditoria-a2/` freeze manifests.

## 4. Migration count verification

Repo: 62 files. Production `schema_migrations`: 61 versions, including `20261101230430`. The 1-row gap is pre-existing (initial schema stored as two repo files vs one production version). Tests count repo files, so 62 is correct.
