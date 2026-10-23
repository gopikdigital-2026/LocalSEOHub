# A3.4.2.2 — GBP Connection Recovery Fix

Server-owned connection state + OAuth failure recovery. Product: LocalSEOHub. Status: pre-launch. Priority: P0.

---

## 1. Executive summary

The Google Business Profile card could stay on "Conectando…" indefinitely. Every GBP status transition the
browser tried to make (reset, location selection, stale reset) was rejected by the database with 42501, and the
OAuth callback never ended a failed attempt. Nothing therefore ever moved a row out of `connecting`.

After this change the whole GBP lifecycle is owned by authenticated edge functions writing with the service role,
and a database trigger forbids the browser from writing `google_business` / `reviews` rows at all. Every OAuth
failure path ends the exact attempt that started it, location selection is a single server operation that only
sets `connected` + `verified_at` after Google returns the profile, and stale `connecting` / `syncing` attempts
are recovered on demand. The card always shows a finite state with a "Reintentar conexión" action.

- Full test suite: **1830 / 1830 passing (53 files)**, including 24 new A3.4.2.2 tests covering the 31 cases.
- Production build: **passes**.
- Edge functions deployed: `gbp-oauth-start`, `gbp-oauth-callback`, `gbp-sync`, `gbp-recover-attempt` (new), `gbp-disconnect`.
- Verdict: **CONDITIONAL GO — ready for production testing** (a real end-to-end run against Google is still required, §14).

## 2. Root cause addressed

| # | Cause | Effect | Fix |
|---|---|---|---|
| 1 | Client `upsertSource` sent `updated_at` on INSERT and set `source_type`/`business_id` in `ON CONFLICT`, columns `authenticated` may not write (42501). | `resetGBPStatus`, client stale reset and client `selectGBPLocation` writes always failed silently. | All GBP/reviews writes moved server-side; client writes removed. |
| 2 | `gbp-oauth-callback` redirected with `?error=` without touching the row. | Cancel, config errors, exchange failures left the row `connecting`. | Every failure terminates the matched attempt (§6). |
| 3 | Stale detection was client-side, fire-and-forget, `connecting` only, 10 min. | Stuck `syncing` never recovered; recovery never actually wrote. | `gbp-recover-attempt` + timeouts per phase (§8). |
| 4 | The location step had no server-owned intermediate state. | The card could not tell "authorised, choose a listing" from "stuck". | `metadata.phase` model (§5). |

## 3. Files changed

Server (edge functions):
- `supabase/functions/gbp-oauth-start/handler.ts` (new), `index.ts` (rewritten)
- `supabase/functions/gbp-oauth-callback/handler.ts` (new), `index.ts` (rewritten)
- `supabase/functions/gbp-sync/handler.ts` (new), `index.ts` (rewritten)
- `supabase/functions/gbp-recover-attempt/handler.ts`, `index.ts` (new)
- `supabase/functions/gbp-disconnect/index.ts` (also removes the caller's `reviews` row with the service role)
- `supabase/config.toml` (`[functions.gbp-recover-attempt] verify_jwt = true`)

Database:
- `supabase/migrations/20261021154643_a3422_gbp_server_owned_connection_state.sql`

Client:
- `src/features/reality-engine/gbpStatus.ts` (phases, timeouts, stale detection, friendly error messages)
- `src/features/reality-engine/sourceStatus.ts` (display states `selecting`, `syncing`, `expired`)
- `src/features/reality-engine/repositories.ts` (`upsertSource` restricted to `website` / `manual`; stale recovery call)
- `src/features/reality-engine/engine.ts` (`resetGBPStatus` removed; `selectGBPLocation` only calls `gbp-sync`; `cancelGBPAttempt`)
- `src/features/reality-engine/GBPCallbackPage.tsx` (rewritten; no unbounded spinner, retry, cancel)
- `src/features/reality-engine/SourceCard.tsx` (new badges, "Reintentar conexión", friendly error box)
- `src/features/reality-engine/SourceManager.tsx` (re-checks every 30 s while an attempt is in flight)

Tests:
- `src/features/reality-engine/__tests__/a3422GbpRecovery.test.ts` (new)
- Updated source-text assertions that pinned the old code or the migration count (44 → 45): `a341GbpSecurity`,
  `a25Integration`, `businessRepository`, `a281TrustCleanup`, `a28Prelaunch`, `a33DiagnosticAction`, `f03Stage2b`,
  `a273Roadmap`, `a272TodayIntelligence`. Hash-pins of `gbp-oauth-start/index.ts` were replaced by an explicit
  assertion that the only OAuth scope is `business.manage`.

## 4. Migration / RLS changes

One migration, additive only:

- New trigger function `connected_sources_server_owned_gbp()` + `BEFORE INSERT OR UPDATE` trigger on
  `connected_sources`. When `current_user` is `anon` or `authenticated` and the row (new or old) is
  `google_business` or `reviews`, it raises 42501.
- `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated`.
- No `GRANT`, no `CREATE POLICY`, no RLS relaxation, no column type change, no data deletion.

Live verification after deployment:
- Guard trigger present: yes.
- `anon` column privileges on `connected_sources`: none.
- `authenticated` SELECT on token columns: only `token_expires_at` (non-secret; unchanged since A3.4.1).
- `authenticated` UPDATE on `user_id` / `business_id` / `source_type`: none.

Existing triggers kept: `connected_sources_clear_on_disconnect` (forgets Vault secrets on `disconnected`),
`connected_sources_forget_on_delete`; CHECK `connected_sources_disconnected_no_credentials` kept.

## 5. Server-owned state architecture

`google_business` row, `metadata.phase`:

| Phase | `status` | Written by | Key metadata |
|---|---|---|---|
| `authorizing` | `connecting` | `gbp-oauth-start` | `oauth_state`, `oauth_started_at` |
| `select_location` | `connecting` | `gbp-oauth-callback` (success) | `authorized_at`, `oauth_state: null` |
| `syncing` | `syncing` | `gbp-sync` | `sync_started_at`, `locationName` |
| `connected` | `connected` (+ `verified_at`, `verified_profile`) | `gbp-sync` | `connected_at` |
| `failed` / `ended` | `error` / `permissions_required` / `disconnected` | callback, sync, recover | `failed_at` / `ended_at`, `last_error` = safe code |

Each function authenticates the JWT (`auth.getUser`), resolves the caller's own business from `businesses`
(`user_id = caller`), rejects a mismatched `businessId` with 403, and writes with the service role scoped by
`user_id` + `source_type` (+ `business_id` / `id`). Handlers are dependency-injected (`createHandler(deps)`) so
every path is unit-tested; `index.ts` only wires Supabase.

## 6. OAuth failure recovery

`gbp-oauth-start`: keeps auth, ownership, 256-bit random `state`, `oauth_started_at`, scope `business.manage`,
`access_type=offline`, `prompt=consent`. Upserts the attempt server-side as `connecting` / `authorizing` with
`last_error: null` and cleared external ids. Missing config → 503 `NOT_CONFIGURED`.

`gbp-oauth-callback`: the attempt is found only by `status = 'connecting'` AND `metadata->>oauth_state = state`;
updates are applied only to that row id while it is still `connecting`, and require exactly one updated row.
An unknown or missing state redirects without mutating anything (no CSRF hole: a forged callback cannot touch
another user's source).

| Failure | Resulting status | `last_error` |
|---|---|---|
| Google `?error=access_denied` | `disconnected` | `GOOGLE_CONSENT_DENIED` |
| `?error=redirect_uri_mismatch` | `error` | `GOOGLE_REDIRECT_URI_MISMATCH` |
| `?error=invalid_client` / `unauthorized_client` | `error` | `GOOGLE_CLIENT_CONFIGURATION_FAILURE` |
| `?error=invalid_scope` / other | `error` | `GOOGLE_SCOPE_REJECTED` / `GOOGLE_AUTHORIZATION_ERROR` |
| No code | `error` | `MISSING_CODE` |
| Missing server config | `error` | `NOT_CONFIGURED` |
| Business lookup failure / not owned | `error` | `BUSINESS_LOOKUP_FAILED` / `BUSINESS_NOT_FOUND` |
| Token exchange failure | `error` | classified from Google's `error` field (`redirect_uri_mismatch`, `invalid_client`, `invalid_grant` → `OAUTH_CODE_INVALID`, else `CODE_EXCHANGE_FAILED`) |
| Credential (Vault) store failure | `error` (credentials cleared) | `CREDENTIAL_STORE_FAILED` |
| Account discovery 401/403 · 429 · other | `permissions_required` · `error` · `error` (credentials cleared) | `GBP_PERMISSION_DENIED` · `GBP_API_QUOTA_UNAVAILABLE` · `ACCOUNT_DISCOVERY_FAILED` |
| Zero accounts | `error` | `NO_GBP_ACCOUNTS` |
| Unhandled exception | `error` | `INTERNAL_ERROR` |

Authorization codes and tokens are never persisted outside Vault, never put in a redirect, never logged.
The frontend renders only `gbpErrorMessage(code)` — a fixed ES/EN message table with a generic fallback.

## 7. Location selection flow

1. Callback success → row `connecting` / `select_location`; browser receives only account ids + names.
2. Browser lists locations via `gbp-list-locations` (unchanged, server-side, Vault tokens).
3. Browser calls `gbp-sync` with `{accountId, locationId, locationName, businessId}`.
4. `gbp-sync` checks: JWT (401), ids (`^accounts/[A-Za-z0-9_-]{1,64}$`, `locations/…`, never `locations/default`; 400),
   own business (403), live non-disconnected source (409 `NOT_CONNECTED`).
5. Sets `syncing` server-side, refreshes the token through the A3.4.1 Vault helper, fetches Business Information v1.
6. Only on success: `connected` + `verified_profile` + `verified_at` + `last_sync_at`, then links the `reviews` row.
7. Any failure: `permissions_required` (`GBP_AUTH_EXPIRED`, `GBP_PERMISSION_DENIED`) or `error`
   (`LOCATION_NOT_FOUND`, `GBP_API_QUOTA_UNAVAILABLE`, `LOCATION_FETCH_FAILED`, `PERSIST_FAILED`, `SYNC_FAILED`, `NOT_CONNECTED`);
   `verified_at` is never written on a failure path.

If the user has no locations or they cannot be listed, the page ends the attempt through
`gbp-recover-attempt {action:'cancel'}` (`NO_LOCATIONS` / `LOCATIONS_UNAVAILABLE`); "Cancelar y volver a Fuentes"
uses `USER_CANCELLED`. Cancel only applies to `connecting` rows — a connected profile is never touched.

## 8. Stale-state recovery

`gbp-recover-attempt` (JWT required) decides from server timestamps:

| Phase | Timeout | Becomes |
|---|---|---|
| `authorizing` (or legacy row without phase) | 15 min from `oauth_started_at` / `updated_at` | `disconnected` + `ATTEMPT_EXPIRED` |
| `select_location` | 30 min from `authorized_at` | `disconnected` + `ATTEMPT_EXPIRED` |
| `syncing` | 5 min from `sync_started_at` | `error` + `SYNC_INTERRUPTED` |

The update is conditional on the same `status` and `updated_at` it read, so it cannot overwrite a live attempt
that progressed concurrently. It is triggered when the Fuentes page loads a stale row; the card also mirrors the
timeouts locally (shows "Intento caducado") and re-checks every 30 s while an attempt is in flight, so it never
spins forever even before the server write lands.

The two production rows currently stuck in `connecting` (`1bad9bb5…`, `6968e814…`, no `phase`, older than 15 min)
will be moved to `disconnected` / `ATTEMPT_EXPIRED` the next time their owners open Fuentes. No manual data change
was made.

## 9. Security preservation

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SITE_URL`: not changed, not printed, not rotated. Google Cloud untouched.
- No credential-column grants, no anon access, no RLS relaxation, no UPDATE grant on `user_id` / `business_id` / `source_type`.
- Tokens stay in Supabase Vault (A3.4.1 RPCs `gbp_store_credentials` / `gbp_clear_credentials`); a missing refresh token keeps the stored one.
- New function `gbp-recover-attempt` uses `verify_jwt = true`; `gbp-oauth-callback` remains public (Google redirects to it) but can only act on a row matched by an unguessable `state`.
- Logs contain only fixed prefixes, HTTP statuses and safe codes.
- Tenant isolation: every server query is scoped by the JWT user; foreign `businessId` → 403.

## 10. Reviews preservation

- A3.4.2 (Reseñas IA, AI reply drafts, no publish-to-Google) unchanged.
- The `reviews` source is written only by `gbp-sync` after a verified profile and removed by `gbp-disconnect`.
- Display rule unchanged: a reviews row shows as connected only when the parent GBP row is `connected` with
  `verified_at`; otherwise "pending" (or "unavailable" when GBP is in `error` / `permissions_required`).

## 11. Tests

New file `a3422GbpRecovery.test.ts` (24 tests) plus existing suites:

| # | Case | Coverage |
|---|---|---|
| 1 | Start sets `connecting` server-side | start handler + index uses service role |
| 2 | New attempt clears stale `last_error` | `attemptRow` |
| 3 | Google cancellation terminates attempt | callback `access_denied` → `disconnected` |
| 4 | Callback errors never leave `connecting` | 7 scenarios + classifiers |
| 5 | Invalid state cannot mutate another source | unknown / foreign / missing state, lookup failure |
| 6 | Code exchange failure terminates | `invalid_grant` → `OAUTH_CODE_INVALID` |
| 7 | Credential store failure terminates | false + throw, credentials cleared |
| 8 | Account discovery failure terminates | 403 / 429 / 500 |
| 9 | Success leaves valid intermediate state | `select_location` |
| 10 | Frontend cannot own sensitive transitions | source scan + DB trigger |
| 11–14 | Selection requires auth / business / source / valid ids | sync handler |
| 15–17 | `syncing` then `connected` with `verified_at` only after Google | sync handler |
| 18 | Sync failure → recoverable state, no `verified_at` | 5 failure scenarios |
| 19–20 | Stale `connecting` / `syncing` recoverable | `staleTransition` + handler, race guard |
| 21 | No infinite spinner | display states + page cancel/retry |
| 22 | Retry starts clean attempt; friendly errors | |
| 23–24 | Tokens never returned or logged | console spies over success + failure paths |
| 25–27 | No anon / credential access; tenant isolation | migration text, scoped queries, `verify_jwt`; live catalog check (§4) |
| 28 | A3.4.1 Vault tests | `a341GbpSecurity.test.ts` passing |
| 29 | A3.4.2 Reviews tests | reviews suites passing |
| 30 | Full suite | 1830 / 1830 |
| 31 | Build | passes |

## 12. Build

`npm run build`: success. `npm run typecheck` reports 19 pre-existing unused-identifier warnings in unrelated
legacy/landing files; none in files touched by this change.

## 13. Deployment

Migration applied. Edge functions deployed in one call: `gbp-disconnect`, `gbp-oauth-callback`,
`gbp-oauth-start`, `gbp-sync`, `gbp-recover-attempt`. No secrets were added or changed.

## 14. Production E2E procedure

1. Sign in on https://localseohub.io with a test account that owns a business and a GBP listing.
2. Open Fuentes. If a row was stuck, confirm the card shows "Intento caducado" with "Reintentar conexión" (not a spinner).
3. Click Conectar / Reintentar conexión; confirm redirect to Google consent asking for Business Profile management.
4. Cancel on the Google screen; confirm return with a friendly "cancelled" message and the card is no longer "Conectando…".
5. Retry; this time accept consent.
6. Confirm the account list appears (callback success; card would show "Elige tu ficha").
7. Choose the account; confirm locations load.
8. Choose a location; confirm "Sincronizando…" and then a connected, verified card with the listing name.
9. Confirm Reseñas shows as available only after step 8.
10. Reload Fuentes; state persists as connected.
11. Abandon an attempt at the account-choice step for >30 min (or at Google for >15 min); reopen Fuentes and confirm "Intento caducado".
12. Disconnect; confirm GBP and Reseñas return to not connected.
13. In Supabase, confirm the row has no tokens after disconnect and `last_error` holds only safe codes.
14. Review edge function logs for the run: no tokens, codes or secrets present.

## 15. Remaining Google configuration uncertainty

From A3.4.2.1b, the client secret match and exact redirect URI value in the Supabase secrets could not be read
and remain **UNVERIFIED**. If they are wrong, the user now sees a friendly message and the row ends in `error` with
`GOOGLE_REDIRECT_URI_MISMATCH` or `GOOGLE_CLIENT_CONFIGURATION_FAILURE` — the step-5 E2E run will reveal which,
without exposing any value. The app may also be in Google "Testing" publishing status, which limits consent to
listed test users; Business Profile API access approval for the project is also outside this codebase.

## 16. Verdict

**CONDITIONAL GO — ready for production testing.**

All code-level requirements are implemented, tested and deployed, and the stuck-spinner failure mode is removed
at the database level. PASS requires the real Google end-to-end run in §14 to succeed, which depends on the
unverified Google/Supabase configuration in §15.

A3.4.3 not started. Publishing replies to Google not implemented.

## 17. First production OAuth E2E result

Read-only inspection. No code, rows, secrets, deployments, migrations or Google Cloud settings were changed, and
no OAuth retry was made. No tokens, auth code, client secret, OAuth state value or service-role key were read out.

### Evidence (most recent `google_business` row, `6968e814…`)

| Field | Value |
|---|---|
| `connected_sources.status` | `error` |
| `last_error` | `GBP_API_QUOTA_UNAVAILABLE` |
| `metadata.phase` | `failed` |
| `metadata` keys present | `phase`, `oauth_state` (null), `oauth_started_at`, `failed_at`; **no** `locationName`, **no** `authorized_at` |
| `oauth_started_at` | 2026-10-21T16:15:31.869Z |
| `failed_at` / `updated_at` | 2026-10-21T16:17:20.792Z (~1m49s after start, consistent with the user completing the Google consent screen) |
| `external_account_id` / `external_location_id` | both null |
| credentials remaining (`token_expires_at`) | none (cleared on terminate, as designed) |
| `source_sync_events` since 16:00Z | none (gbp-sync never ran) |

Attribution:
- The metadata shape `{phase:"failed", oauth_state:null, oauth_started_at, failed_at}` is written only by
  `gbp-oauth-callback` `terminate()`. gbp-sync's failure shape always includes `locationName` and
  `authorized_at`, which are absent, and no sync event exists.
- Inside `gbp-oauth-callback` the code `GBP_API_QUOTA_UNAVAILABLE` has exactly one origin:
  `classifyAccountDiscovery(429)` on the response from
  `GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts`.
- That call is reached only after (1) the state was matched, (2) the token exchange returned 2xx with an
  `access_token`, and (3) the credentials were stored in Vault. Token-exchange failures map to
  `OAUTH_CODE_INVALID` / `CODE_EXCHANGE_FAILED` / `OAUTH_CLIENT_MISCONFIGURED`, and store failure maps to
  `CREDENTIAL_STORE_FAILED`. None of these occurred.
- Edge function logs (`[gbp-oauth-callback] accounts status: …`) are not reachable with the available tools.
  The HTTP status is therefore derived from the classifier, which is unambiguous: only 429 produces this code.

### Result fields

- INFINITE_CONNECTING_FIXED = **YES** (the attempt ended in terminal `error` with a specific code, and the UI
  showed the message instead of a spinner)
- OAUTH_STARTED = **YES**
- GOOGLE_CONSENT_COMPLETED = **YES** (the callback received a valid code and a matching state)
- TOKEN_EXCHANGE_COMPLETED = **YES** (this also confirms that the client ID/secret and redirect URI left
  UNVERIFIED in A3.4.2.1b are correct)
- FAILURE_STAGE = **ACCOUNT_DISCOVERY** (the Google API quota rejection, GBP_API_QUOTA, happened at the
  account-discovery call)
- LAST_ERROR = `GBP_API_QUOTA_UNAVAILABLE`
- GOOGLE_HTTP_STATUS = **429** (derived from the classifier; raw log line not inspected)
- GOOGLE_API_FAMILY = **My Business Account Management API v1** (`accounts.list`). The Business Information API
  and the v4 reviews API were never called.
- LIKELY_EXTERNAL_CAUSE = **Most consistent with A** (Business Profile APIs enabled, but the project has not
  been granted GBP API access, so the default quota is 0 requests/min and every call returns 429). Supporting
  evidence: this was the project's first-ever successful token exchange, and it was rejected on the very first
  API call with a single request. Genuine rate limiting (B) is implausible at that volume. **Not proven**:
  confirming it requires checking, in Google Cloud Console → APIs & Services → My Business Account Management
  API → Quotas, whether the per-minute quota is 0, or whether the GBP API access request has been approved.
  This inspection did not do that.

### Side observation (not changed)

Row `1bad9bb5…` (an attempt from 2026-10-20) is still `connecting`, with a stored OAuth state from before the
fix. It does not block the new flow; the server-side expiry/recovery path ends it on the next start or recovery
call.

### Classification

**CONDITIONAL GO.** The A3.4.2.2 code behaved exactly as specified in production: there was no infinite
spinner, the failure was terminal and server-owned, credentials were cleared, and an accurate user message was
shown. OAuth configuration is now proven to work end-to-end through token exchange. PASS is blocked solely by
an external Google-side restriction on the Account Management API (429, most likely GBP API access not yet
approved or quota = 0). No fix was implemented.
