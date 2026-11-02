# A3.7.5.2 — Tenant Security & Internal Route Isolation — Implementation Report (incl. FIX01)

Mode: focused correction, no real publishing. Baseline for every diff: A3.7.5.1 audit package.

## 1. Scope delivered

| Scope | What | Where |
|---|---|---|
| A — FB Page uniqueness | Partial unique index `meta_connections_page_assignment_key (page_id) WHERE page_id IS NOT NULL` | migration `20261101230430_a3752_meta_account_tenant_uniqueness.sql` |
| A — IG uniqueness | Partial unique index `meta_connections_instagram_assignment_key (instagram_account_id) WHERE instagram_account_id IS NOT NULL` | same |
| A — Atomic claim | `public.meta_claim_page_selection(...) RETURNS text` (`ok` / `not_pending` / `page_assigned` / `instagram_assigned`); owner match `user_id = p_user_id`, pending status, Page must be in `available_pages`; `unique_violation` mapped by constraint name; SECURITY DEFINER, `search_path=''`, EXECUTE service role only | same |
| A — Owner reconnection | Pre-checks exclude the caller's own connection (`c.id <> p_connection_id`); existing wipe trigger releases ids on `disconnected` / `connecting` | same |
| A — Neutral errors | 409 `META_PAGE_ALREADY_ASSIGNED`, 409 `META_INSTAGRAM_ALREADY_ASSIGNED`, 409 `PAGE_SELECTION_NOT_PENDING`; body `{code,error}` only | `supabase/functions/meta-connection/handler.ts`, `index.ts`; ES/EN copy in `src/features/meta-connection/metaStatus.ts` |
| B — Internal route server authorization | Edge function `internal-access` (verify_jwt=true): 401 `NOT_AUTHENTICATED`, 403 `FORBIDDEN` (non-admin and missing/empty `ADMIN_EMAIL` = fail closed), 200 `{allowed:true}`; trimmed, case-insensitive | `supabase/functions/internal-access/*`, `supabase/config.toml` |
| B — Frontend guard | `InternalGuard` wraps the internal layout route; children not mounted until server returns allowed; denied or error -> `/hoy` | `src/features/internal-access/*`, `src/App.tsx` |
| C — Customer navigation | Customer routes untouched; 34 route paths (36 `<Route>` elements) identical to baseline | `src/App.tsx` |

## 2. Modified / added files (vs A3.7.5.1)

Added (6):
- `supabase/migrations/20261101230430_a3752_meta_account_tenant_uniqueness.sql`
- `supabase/functions/internal-access/handler.ts`, `index.ts`
- `src/features/internal-access/repository.ts`, `InternalGuard.tsx`
- `src/features/internal-access/__tests__/a3752TenantSecurity.test.tsx` (FIX01, 29 tests)

Modified, application (6): `src/App.tsx` (1 import + 1 wrapped route), `src/features/meta-connection/metaStatus.ts` (2 ES + 2 EN messages), `supabase/functions/meta-connection/handler.ts`, `supabase/functions/meta-connection/index.ts`, `supabase/config.toml` (3 appended lines), `supabase/functions-deploy-state.json` (written by the deploy tool).

Modified, tests (19): see A3_7_5_2_TEST_EVIDENCE.md §3 (every change annotated `A3.7.5.2 RE-PIN`).

Not modified: `supabase/functions/meta-publishing/*`, `supabase/functions/instagram-publishing/*`, `publish_attempt_*` DB functions, every freeze manifest under `auditoria-a2/`, Meta secrets.

## 3. Source hashes (SHA-256)

| File | Now | A3.7.5.1 |
|---|---|---|
| migration 20261101230430 | 66d7ab940c6d32bfab4dff2807e12123b62348e691961967a7a470c9a42c5a29 | new |
| meta-connection/handler.ts | 65e720d3cedae692ea89ff8787d613f42e0930dc791c12737411ab32543798e1 | 57e8341fbb5172329b5aa71ff9bf70b77256ac86184d24e58bab24c261097ada |
| meta-connection/index.ts | 61c6cc068b53b06bb84772708c5e6d84bf3c74c7a451f24e4556d5a9b670c793 | 742dc490ae45c34b89a4a3d39be80c6b9b81b7da2589b772f79cb8e5c9ad33df |
| internal-access/handler.ts | b39f987ce578d2f62bfaf2c25d0da75c319cd5f67dfc58135bebb868edb6d09d | new |
| internal-access/index.ts | c35b6c027cb95bdc44e589f16ccc95fc8e438000e3c87f7210dd2acf2d3c79e8 | new |
| supabase/config.toml | aeda6a0575fef1abbcc128c9f9e8a085f4e8b84bfa12737e1a09e1c28617f49d | fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a |
| src/App.tsx | f0c81e90531415f57b28bc1c82851d7cf84b6cf0ebec13f03b9b91833c1b4f52 | ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b |
| internal-access/repository.ts | 0e2e7d47d94231d39a5764575383416ac71f7037c5066c7550c7868e13f800a4 | new |
| internal-access/InternalGuard.tsx | ba0a94361d15ff916ad87b758602dcc92207c101b34858eb34ab5ffb5bdb0450 | new |
| meta-connection/metaStatus.ts | c2615204659166500345771fbf90f001b9097a047e925af141b89c91f4f51ad6 | d74fd3e863c02ffeb090fe86b96e8e0c6773e284e4e29ad3b1fb73643c7a7f6f |
| a3752TenantSecurity.test.tsx | b421d3b7a292356d3ce03570e15f7fbb6bdd34989b5a671c176ebb179ba2d32d | new |

Frozen engines: all 11 files byte-identical to baseline (see SECURITY_AUDIT §5).

## 4. Migration status

- Applied in production: version `20261101230430` present in `supabase_migrations.schema_migrations` (latest).
- Production records 61 versions; repo has 62 files. The difference is pre-existing and unrelated: the repo splits the initial schema into `20260623191653` + `20260623191709`, while production records it once as `20260623191647`. Every other version matches 1:1. A3.7.5.2 adds exactly +1 on both sides. Test count assertions (61 -> 62) count repo files and were updated accordingly.
- No new migration in FIX01.

## 5. Edge Function deployment status

| Function | Production | verify_jwt | Source |
|---|---|---|---|
| meta-connection | ACTIVE (id 2c9d1d26-…) | true | current repo files, unchanged since deployment |
| internal-access | ACTIVE (id 4232692a-…) | true | current repo files, unchanged since deployment |
| meta-publishing / instagram-publishing | ACTIVE, not redeployed | true | frozen, unchanged |

Provenance: both functions were deployed in the A3.7.5.2 implementation turn, following an explicit platform instruction in that turn to deploy changed functions. No owner approval was recorded for that deploy as such. FIX01 performed **no** deployment. The owner should ratify (or roll back) that deployment during review — see blockers. `ADMIN_EMAIL` secret exists in production (value not inspected).

## 6. Outstanding blockers / notes (none block tenant security)

1. Owner ratification of the meta-connection + internal-access deployment (governance, §5).
2. Commercial FB/IG publishing remains disabled: arming secrets `META_FACEBOOK_REAL_PUBLISH_*` / `META_INSTAGRAM_REAL_PUBLISH_*` are absent in production.
3. The internal IG test entitlement expired 2026-11-01 22:21 UTC (inactive).
4. Meta App Review / Advanced Access status unknown — required before commercial use.
5. Operator identity is a single `ADMIN_EMAIL`; no multi-operator roles.
6. Legacy `meta_finish_page_selection` function still exists (unused, service role only); removal deferred to avoid an unjustified migration.
7. 20 pre-existing TypeScript errors (identical to baseline; none new).
