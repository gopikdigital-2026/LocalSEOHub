# A3.7.4.3 — GATE B.3 — FIX02 — IMPLEMENTATION (AUTHORIZED EXCEPTION)

## Verdict

**NO-GO — A3.7.4.3 GATE B.3 FIX02 REQUIRES FURTHER CORRECTION**

The database correction is applied, exactly scoped, and verified. Type check and build match the baseline.
Five governed regression tests in four files still fail. The new migration count trips their migration-count pins (59) and one file-hash pin. Those files are outside the authorized test exception, so they were not modified ("Do not modify unrelated tests to force a passing result").

## 1. Migration

File: `supabase/migrations/20261031172241_a3743_instagram_status_attempt_read_grant.sql`
SHA-256: `71c2354572b94779b5a22b1698004fe90ad82eab0b58c5a3ed0747f2ddfdae71`

Executable SQL (sole statement, after a comment header):

```sql
GRANT SELECT (id, status, external_stage, meta_container_id, started_at, publication_id, user_id, channel, attempt_number)
ON public.publication_publish_attempts
TO service_role;
```

Applied through the standard migration mechanism.
- `supabase_migrations.schema_migrations`: 59 rows; latest is `20261031172241 a3743_instagram_status_attempt_read_grant`.
- Local `supabase/migrations`: 60 files.

## 2. Execution evidence (catalog, post-apply)

- `information_schema.column_privileges`, service_role on publication_publish_attempts: SELECT on exactly `attempt_number, channel, external_stage, id, meta_container_id, publication_id, started_at, status, user_id`. That is 9 columns, with no other privilege types.
- `information_schema.role_table_grants`, service_role: none at table level, so there is no table-wide SELECT and no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER.
- authenticated: table-level SELECT only (unchanged). anon: none (unchanged).
- RLS enabled = true; policy count = 1 (unchanged).
- service_role read-only probe: a SELECT of the 9 columns succeeds, and a SELECT of a non-granted column is denied with 42501 (recorded earlier in this exception).

## 3. Governed test changes (authorized)

| File | Change | Old SHA-256 | New SHA-256 |
|---|---|---|---|
| src/components/__tests__/a281TrustCleanup.test.ts | L157 `toHaveLength(59)` → `toHaveLength(60)` + FIX02 comment | 2f4b6d27fd7f1d2f7851251f5a2fc3dfd71f6558be1b7dd9724e1b387d0a0a9a | 67ba5b56ce48065241d41032d74beab25c9960628f64b80c1c41fae667a3f821 |
| src/features/action-layer/__tests__/a33DiagnosticAction.test.ts | L138 `toHaveLength(59)` → `toHaveLength(60)` + FIX02 comment | b7705d22de2d2cbab4bbcf06f11d004c0bb11f448fba2701ac944c3ae4e9236e | 5d849bcb2e852126ec87d49d6d1fc6a96059f6f80d497371ee90d0c5899fe462 |

New file: `src/features/publications/__tests__/a3743GateB3Fix02StatusAttemptGrant.test.ts`. It has 19 tests, all passing. SHA-256 `a45d72aac1626b69b1026734e811cc52b44abdae674a0d781ee2fbb50bbe9246`.

It covers:
- the exact 9-column grant with no extra privilege or role keywords, in a single statement;
- columns equal to those the function selects, filters and orders on;
- prior REVOKE/RLS migrations pinned and intact;
- status compatibility (owner + D v3 gives ok, not_armed, derivative ready);
- 401/404/malformed requests rejected;
- context/preflight failures give 500 INTERNAL_ERROR with no leak;
- no attempt creation, no Graph POST, no storage writes;
- P1/P2 arming gates (403 REAL_PUBLISH_DISABLED);
- frozen pins for the Instagram engine, Graph transport, derivative, preflight, UI, the 4 Facebook files, App.tsx and config.toml;
- the Gate A manifest byte-identical.

## 4. Regression

| Check | Baseline | Now |
|---|---|---|
| Vitest | 2,964 pass | **2,978 pass / 5 fail / 2,983 total** (84/88 files pass) |
| tsc | 20 inherited | 20 inherited, 0 new |
| build | OK | OK |

Failing tests. Each is caused by the 60th migration or by the authorized re-pin; none is a functional regression.

1. `src/features/email-verification/__tests__/f03Stage2b.test.ts` L229, "34/35. migrations stay at 46 and routes at 32…": `toHaveLength(59)`, received 60.
2. `src/features/email-verification/__tests__/f03Stage2b.test.ts` L283, "21. … no new migrations": `toHaveLength(59)`, received 60.
3. `src/features/roadmap/__tests__/a273Roadmap.test.ts` L354, "112. no new migration…": `toHaveLength(59)`, received 60.
4. `src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts` L131, "30. no new migration…": `toHaveLength(59)`, received 60.
5. `src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts` L516, "every A3.7.3.4 frozen file is byte-identical, except the enumerated authorized re-pins": it pins a281TrustCleanup.test.ts `now: 2f4b6d27…`, received `67ba5b56…`. a33DiagnosticAction.test.ts may be pinned the same way.

## 5. Further exception required (for owner/reviewer authorization)

To reach GO, authorize these changes, and only these:
- f03Stage2b.test.ts L229 and L283: 59 → 60 + FIX02 comment.
- a273Roadmap.test.ts L354: 59 → 60 + FIX02 comment.
- a272TodayIntelligence.test.ts L131: 59 → 60 + FIX02 comment.
- a3741MetaPublishingFoundation.test.ts L516: the `now` hash for a281TrustCleanup.test.ts becomes `67ba5b56ce48065241d41032d74beab25c9960628f64b80c1c41fae667a3f821`. Do the same for a33DiagnosticAction.test.ts if it is pinned there, using `5d849bcb2e852126ec87d49d6d1fc6a96059f6f80d497371ee90d0c5899fe462`.

Current SHA-256 of these files (pre-change, for the next manifest):
- f03Stage2b.test.ts `ac94b043dcc87dd2acd0d68e239f0de14d051dd24a34bcfdc7f4e021bb58b390`
- a273Roadmap.test.ts `300a87c8605856aaae31fd6ef666cd2f02bd0868f1ddcf45e95918bb4dde03c0`
- a272TodayIntelligence.test.ts `b5df9213adbb8ef98712b733ec88ad46e44e56d083647027bf6a2f2e446d30b1`
- a3741MetaPublishingFoundation.test.ts `f137e0a69c496c509b2a3dcaf16df05746992112446c7ea15d79619a10a0f61d`

## 6. Not modified

The following were not modified:
- Instagram engine, Graph transport, derivative and preflight code; the Facebook files;
- D and A/B/C; freeze manifests; secrets; config.toml;
- edge function deployments: no redeploy, and instagram-publishing still has id a3008491-be86-40c3-ae41-0a93ee773be4 with verifyJWT true.

## 7. Limitations

- The live owner «Comprobar estado» call was not executed; it is reserved for the owner.
- No edge-function log access.
- The migration stays applied. Reverting would need an unauthorized REVOKE, and it is read-only and column-scoped.
