# A3.7.4.3 — Instagram Gate B.3 — FIX02 — Root Cause

**Verdict: NO-GO — A3.7.4.3 GATE B.3 FIX02 REQUIRES CORRECTION**

The root cause is evidenced. The minimal correction requires a governed exception (it touches historical manifest hashes), and the FIX02 prompt requires STOP before that point. No correction was applied.

## 1. Symptom
- "Comprobar estado" on publication D (`875587f5-0137-4477-904c-609e8e406ad6`, expected version 3) shows `INTERNAL_ERROR`.
- "Comprobar conexión con Meta" (FIX01) shows PASS.

## 2. Request trace
| Step | Location | Result |
|---|---|---|
| Browser | `InstagramPublishHarness.tsx` `fetchStatus` L54-60, which calls `getInstagramStatus(pubId, draft.version)` | Sends `{action:"instagram_publish_status", publicationId, expectedVersion:3}` |
| Client mapping | `repository.ts` `invoke` L43-55; `getInstagramStatus` L57-60 | On HTTP error, parses the JSON body. If `ok !== true`, returns `body.code` (otherwise `'INTERNAL_ERROR'`). |
| Gateway | `verify_jwt = true` | Owner JWT is valid (the FIX01 check passes with the same session). |
| Routing | `index.ts` `Deno.serve` L209-212 | `isConnectionPreflightRequest` matches only `action:"meta_connection_preflight"`, so status goes to `handle(req)`. No interference. |
| Auth | `instagramPublish.ts` `handle` L359-385, `getUserId` | OK (owner). |
| Status | `instagramPublish.ts` `status()` L168-194, first statement L169 `await deps.context(...)` | **Throws.** |
| Context dep | `index.ts` `context` L50-85, third query L64-66: `from("publication_publish_attempts").select("id, status, external_stage, meta_container_id, started_at")…` | PostgREST error, so L68 `throw new Error("context lookup failed")` |
| Catch-all | `instagramPublish.ts` L381-383: `log({stage:"instagram", error: redact(...)})`, then `fail("INTERNAL_ERROR","NOT_REQUESTED",500)` | HTTP 500 `{ok:false, code:"INTERNAL_ERROR"}` |
| Browser | `repository.ts` L60 | `{error:"INTERNAL_ERROR"}` is shown |

## 3. Exact failing operation (evidenced)
`service_role` (the edge function's admin client) has **no SELECT privilege** on `public.publication_publish_attempts`.

- `has_table_privilege('service_role','public.publication_publish_attempts','SELECT')` returns **false**.
- Running the exact L64-66 query under `SET LOCAL ROLE service_role` for owner + D + instagram returns **`42501 permission denied for table publication_publish_attempts`**.
- Control checks under the same role all return OK:
  - `publications` (L51-56);
  - `publication_drafts` (L60-61);
  - `meta_connections` (L62-63);
  - `publication_publish_preflight(owner, D, 3)`.
- Grant inventory for the table: `postgres` has all privileges; `authenticated` has SELECT. `service_role` and `anon` have nothing.

**Origin:** `supabase/migrations/20261028132929_a3741_meta_publishing_security_foundation.sql`, L356-357:
```sql
REVOKE ALL ON public.publication_publish_attempts FROM anon, authenticated, service_role;
GRANT SELECT ON public.publication_publish_attempts TO authenticated;
```
A3.7.4.1 intentionally routed all writes through SECURITY DEFINER RPCs, and the Facebook path reads attempts only via RPC. Gate A of A3.7.4.3 later added a direct service-role read of the table in the Instagram `context` dep. Unit tests mock `deps.context`, so the missing grant was never exercised. Before FIX01 the status action had not been called live (B3 P1 report, L30).

## 4. Classification
**DB privilege / schema-grant mismatch** (closest category: "DB RPC / other"). It is a database authorization gap affecting the server role. It is **not**:
- user auth (JWT valid);
- user authz or entitlement (status has no entitlement gate, and ownership checks pass);
- the preflight RPC (works);
- a response-mapping or schema mismatch (all columns exist);
- the FIX01 routing (verified);
- an image or derivative exception (the code never reaches `derivativeReadiness`).

Ruled-out evidence:
- The D original in storage is byte-identical to `auditoria-a2/gate-b1-assets/a3743-publication-d-test-image.png`: 901,643 B, md5 `fc3a190ee41708dc8b242ff5b711ae58` = storage eTag.
- All selected columns exist.
- There is 1 `meta_connections` row, so `maybeSingle` is safe.

## 5. Impact
- Status fails closed (500 INTERNAL_ERROR, no false PASS).
- `publish()` (L204) and the verify path (L326) also call `deps.context` first. They would fail closed in the same way **before** any attempt, Graph call or storage write, so this is a safe failure.
- No data exposure.

## 6. Minimal correction (prepared, NOT applied)
Add one new migration that grants a read-only, column-scoped privilege to `service_role`. It covers exactly the columns that query L64-66 selects, filters and orders on:
```sql
GRANT SELECT (id, status, external_stage, meta_container_id, started_at,
              publication_id, user_id, channel, attempt_number)
  ON public.publication_publish_attempts TO service_role;
```
- No code changes. No frozen file, Facebook or FIX01 changes, and no redeploy of any edge function. A DB grant takes effect immediately.
- No INSERT, UPDATE or DELETE. Writes stay RPC-only, and the guard trigger is untouched.
- `anon` and `authenticated` are unchanged.

## 7. Why STOP (exception required)
Adding a migration file raises `supabase/migrations/*.sql` from 59 to 60. Two existing tests pin the count at 59:
- `src/components/__tests__/a281TrustCleanup.test.ts` L157. Its sha `2f4b6d27…` is recorded in `A3_7_4_3_GATE_A_MANIFEST.md` L75.
- `src/features/action-layer/__tests__/a33DiagnosticAction.test.ts` L138. Its sha `b7705d22…` is recorded in `A3_7_4_3_GATE_A_MANIFEST.md` L78.

Both tests must be re-pinned to 60, which changes their historical manifest hashes. FIX02 forbids re-pins and manifest changes, and says "If frozen files or historical manifest hashes must change, STOP and document the exception first." The migration filter in `a3542SocialFindings.test.ts` L580 already excludes `_a3743_` files, so it needs no change if the new file is named `*_a3743_*`.

No compliant alternative exists without a frozen-file change:
- Reading attempts through the user's JWT would need a new `deps.context` signature in the frozen `instagramPublish.ts`.
- Reading through the preflight RPC would need new output columns, which changes the frozen RPC contract and its tests.
- Swallowing the lookup error would produce a false or misleading status. That is forbidden.

## 8. Requested authorization (to unblock FIX02)
Authorize a FIX02 exception that covers:
1. one new migration `*_a3743_instagram_status_attempt_read_grant.sql` containing only the grant in §6;
2. re-pinning the count from 59 to 60 in the two tests above (comment-annotated, as in prior re-pins), with new hashes recorded in the FIX02 manifest;
3. a new FIX02 test file asserting the grant's exact scope.

No edge-function deploy is needed. The owner then retests "Comprobar estado" manually.
