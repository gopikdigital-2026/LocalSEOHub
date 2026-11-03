# A3.7.5.3 — Commercial Meta Connections & Authorization — Implementation Report

Mode: focused implementation, no real publishing. Baseline: A3.7.5.2 FIX01 (`deliverables/localseohub-a3752-fix01-tenant-security.zip`, SHA-256 `3f55dc65…6eb3`, 758 files).

## 1. Audit of the existing journey (reused, not rebuilt)

| Step | Existing implementation | Result |
|---|---|---|
| Registration / onboarding | AppGuard + business onboarding; `/fuentes` is a customer route under `AppGuard`/`AppShellV2`, outside `InternalGuard` | Reused |
| Meta card | `MetaConnectionCard` rendered by `SourceManager` for the active business | Extended (UX only) |
| OAuth start | `meta-oauth-start` (verify_jwt) — hashed state + browser binding, TTL, `auth_type=rerequest`, 4 read scopes | Unchanged |
| Callback | `meta-oauth-callback` (verify_jwt=false by design) — state consumed once by hash, wrong-user/expired rejected, code exchanged server-side, token to Vault, redirects with a 64-hex one-time completion in the fragment | Unchanged |
| Page discovery | `/me/permissions` + `/me/accounts`; `NO_AUTHORIZED_PAGES`, `META_PERMISSION_UNAVAILABLE`, `PAGE_DISCOVERY_FAILED` | Unchanged |
| IG discovery | Per selected Page: connected / not_associated / unsupported / permission_unavailable / api_error | Unchanged |
| Page selection | `meta-connection select_page` → `meta_claim_page_selection` (A3.7.5.2 atomic claim, unique indexes) | Unchanged |
| Persistence | `meta_connections`, owner-only SELECT policy, column-level SELECT grant excluding token columns, no client writes | Unchanged |
| Expiry / reconnect | `recover` → `reauth_required`; card shows Reconnect | Extended (UX only) |
| Disconnect | `meta-connection disconnect` revokes at Meta (best effort), deletes Vault secret, wipe trigger nulls Page/IG | Unchanged |

## 2. Changes (frontend only)

| File | Change |
|---|---|
| `src/features/meta-connection/metaStatus.ts` | New ES/EN copy: permission explanation (one line per requested scope), read-only note, Page/IG requirements, per-account status labels, callback back label; new `instagramTone()` |
| `src/features/meta-connection/MetaConnectionCard.tsx` | Collapsible "Which permissions do we request?" before Connect / Retry / Reconnect; separate Facebook and Instagram status chips; publishing-permission step rendered only for verified operators (`checkInternalAccess()==='allowed'`), hidden for ordinary customers; `aria-busy`; wrapping action row for mobile |
| `src/features/meta-connection/MetaPageSelectModal.tsx` | Focus moves into the dialog on open and is restored on close; Escape closes (not while saving) |
| `src/features/meta-connection/MetaCallbackPage.tsx` | Back button label moved to shared ES/EN copy |
| `src/features/meta-connection/__tests__/a3753CommercialConnection.test.tsx` | New, 20 tests |

Rationale for hiding the publishing step: commercial publishing is disabled and `pages_manage_posts` has no evidence of Advanced Access; offering customers a publishing permission request would be misleading. The frozen `PublishingAccessControl` files are not modified (hash pins intact); the gate is in the card.

## 3. Not changed

- No Edge Function, migration, RLS, grant, constraint, secret or Meta App setting changed.
- Frozen engines `supabase/functions/meta-publishing/*`, `instagram-publishing/*`: combined SHA-256 `58956f46…7606`, identical to baseline.
- `metaRepository.ts` (md5 pinned), publishing-access files (sha pinned): unchanged.

## 4. Results

- Tests: 92 files, 3118/3118 passed (baseline 91/3098 + 20 new).
- Typecheck: 20 errors, identical to the A3.7.5.2 baseline after position stripping (diff empty).
- Build: passes.

## 5. Production deployment status

NOT DEPLOYED. Production still runs the ratified A3.7.5.2 state. See the deployment request below.

### Deployment request (owner approval required)

- Files: the 4 frontend files above (+1 test file, not shipped to users).
- DB changes: none. Edge Function changes: none.
- Operational impact: customer Meta card copy/layout; operators keep the publishing-permission step; customers no longer see it. No data changes, no new Meta requests, no permission changes.
- Rollback: redeploy the previous frontend build (or restore the prior version); fully reversible, no data migration.

## 6. Blockers (external, not code)

External customers without a role on the Meta App cannot complete OAuth until the app is in Live mode with Advanced Access for the four scopes (App Review + Business Verification). Status: UNKNOWN — see `A3_7_5_3_META_EXTERNAL_READINESS.md`.
