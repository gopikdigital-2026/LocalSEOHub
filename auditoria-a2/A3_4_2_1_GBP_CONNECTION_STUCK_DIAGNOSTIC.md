# A3.4.2.1 — GBP CONNECTION STUCK DIAGNOSTIC

Audit only. No code, migration, deploy, secret, OAuth scope, Google Cloud or redirect change was made.
One read-only privilege probe was executed as the `authenticated` role inside a PL/pgSQL block that always raises, so it was rolled back; post-probe the rows were re-read and are unchanged.
No token, secret, authorization code, OAuth state value or service-role key appears in this document.

DB snapshot time: 2026-10-20 ~17:06 UTC.

---

## 1. Executive summary

There are two independent defects, and together they produce the symptom.

**Defect 1 — the client cannot write `connected_sources` through upsert (CONFIRMED, deterministic).**
- `upsertSource()` always sends `updated_at` in the INSERT payload. It also uses `ON CONFLICT … DO UPDATE` over `source_type`, `business_id` and `user_id`.
- The `authenticated` role has no INSERT privilege on `updated_at`, and no UPDATE privilege on `source_type`, `business_id` or `user_id`.
- Postgres therefore rejects the whole statement: `42501 permission denied for table connected_sources`. This was reproduced in production as the real user who owns a stuck row.

Consequences:
- `resetGBPStatus()` fails silently, because the callback page does `.catch(() => undefined)`. A failed or cancelled OAuth attempt therefore leaves the row in `connecting`.
- `selectGBPLocation()` throws on its very first upsert (`syncing`). Even a fully successful OAuth can never reach `connected`. The callback page then sits on "Sincronizando datos del negocio…" forever (unhandled rejection), and the reviews row is never written.

**Defect 2 — the OAuth round-trip did not complete for the observed attempts (HIGHLY LIKELY upstream, exact stage UNVERIFIED).**
- Both stuck rows still hold `metadata.oauth_state`, and no tokens are stored.
- `gbp-oauth-callback` clears `oauth_state` immediately after a successful code exchange. So for both attempts the callback either was never reached or failed before or at the code exchange.
- Edge function logs are not accessible from this environment, so the exact stage (consent cancelled, `redirect_uri_mismatch`, state miss, or token-exchange failure) cannot be confirmed.

**Primary classification: `STALE_CONNECTION_STATE`** caused by `FRONTEND_STATE_FAILURE` (the client write path is rejected by column privileges).
**Secondary (upstream, needs logs):** `CALLBACK_FAILURE` or `CODE_EXCHANGE_FAILURE`, with `GOOGLE_CONSENT_FAILURE` not excluded.

**Is A3.4.1 the cause? No.** The column grants come from the original 2026-08-04 migration. A3.4.1 only revoked anon access, TRUNCATE, TRIGGER and REFERENCES, and added the Vault and credential functions plus the disconnect trigger. None of these touch this path for the observed rows. The defect predates A3.4.1, and production has no record of any GBP row ever reaching `connected`.

---

## 2. Architecture (end-to-end flow)

| # | Stage | Where | Writes |
|---|---|---|---|
| 1 | User clicks Conectar on the GBP card (Fuentes) | `SourceManager` / `SourceCard` → `engine.startGBPConnection(businessId)` | sessionStorage `gbp_oauth_state` |
| 2 | OAuth start | edge `gbp-oauth-start` (verify_jwt **true**; JWT re-validated with `admin.auth.getUser`; business ownership checked) | service-role upsert `connected_sources` → `status='connecting'`, `metadata={oauth_state, oauth_started_at}` |
| 3 | Browser → Google consent | `accounts.google.com/o/oauth2/v2/auth`, scope `business.manage`, `access_type=offline`, `prompt=consent`, `redirect_uri=GOOGLE_REDIRECT_URI` | — |
| 4 | Google → callback (GET) | edge `gbp-oauth-callback` (verify_jwt **false**, both in config.toml and deployed) | — |
| 5 | State lookup | row where `source_type='google_business' AND status='connecting' AND metadata->>'oauth_state'=state` | — |
| 6 | Code exchange | `POST oauth2.googleapis.com/token` with `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | — |
| 7 | Token storage | upsert `metadata={oauth_state:null, tokens_stored_at}`, then RPC `gbp_store_credentials` (service_role only; Vault) | `access_token_encrypted` / `refresh_token_encrypted` hold Vault refs |
| 8 | Account discovery | `GET mybusinessaccountmanagement.googleapis.com/v1/accounts` | — |
| 9 | Redirect to SPA | `${SITE_URL}/oauth/google-business/callback?accounts=…` or `?error=…` | — |
| 10 | SPA callback page | `GBPCallbackPage` (route registered in `App.tsx`) | on error: `resetGBPStatus()` → **client upsert (fails, Defect 1)** |
| 11 | Location discovery | edge `gbp-list-locations` (verify_jwt true) | — |
| 12 | Selection + sync | `engine.selectGBPLocation()` → client upsert `syncing` (**fails, Defect 1**) → edge `gbp-sync` → client upsert `connected`/`error` + reviews row | `source_sync_events` |
| 13 | Fuentes refresh | `repositories.loadSources()` → `sourceDisplayStatus()` | stale-reset via client `.update()` (works) |

Edge env names used: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SITE_URL` (default `https://localseohub.io`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 3. What "Conectando…" means

`sourceStatus.ts` → `sourceDisplayStatus()` returns `in_progress` ("Conectando…") when:
- DB `status` is `connecting` or `syncing`; or
- DB `status` is `connected` but `verified_at` is null.

The card is not waiting on a live promise. It is a pure rendering of the DB row.

| Question | Answer |
|---|---|
| Awaited operation | None on Fuentes; the label reflects persisted `status`. |
| Termination condition | Row leaves `connecting`. This happens only via (a) callback success then selection (blocked by Defect 1), (b) `resetGBPStatus` (blocked by Defect 1), (c) the 10-min stale reset in `loadSources`, or (d) gbp-disconnect. |
| Timeout | `STALE_CONNECTING_MS` = 10 min, only for `connecting`. It runs only when Fuentes reloads, and it is fire-and-forget. There is no timeout for `syncing` or for `connected` without `verified_at`. |
| Error surfacing | Callback errors are shown only on the callback page. The reset failure is swallowed (`.catch(() => undefined)`). |
| Rejected promises | `handleSelectLocation` does not catch a throw from `selectGBPLocation`. The page stays in phase `syncing` forever. |
| Reload recovery | Partial. After 10 min a reload resets the row: the plain `.update()` uses only updatable columns and the probe returned `UPDATE_OK`. Every new click on Conectar restarts the 10-min clock. |
| Stale DB status | Yes. Two rows are `connecting` (see section 4). |
| Popup or redirect cancelled | Full-page redirect, no popup. If the user cancels, or Google shows an error page (e.g. `redirect_uri_mismatch`) and the user navigates back, nothing resets the row. |

Reviews: "Pendiente de conexión" is the dependent-source rule. The parent GBP row is not `connected` with `verified_at`, so the reviews card shows `pending`. It is purely downstream of the GBP row.

---

## 4. DB state (production, anonymised)

| Row | status | user/business (hash) | business owned by user | access token | refresh token | oauth_state present | account/location | updated_at (UTC) |
|---|---|---|---|---|---|---|---|---|
| 6968e814 | connecting | a58901 / b5b21d | true | false | false | true | none / none | 2026-10-20 17:00:14 |
| 1bad9bb5 | connecting | e95df1 / ecff82 | true | false | false | true | none / none | 2026-10-20 16:39:32 |
| 432e5779 | disconnected | 9097ed / 3702ff | true | false | false | false | — | 2026-08-17 22:22 |

How to read this:
- These are two different users and businesses, with the same pattern: the failure is systemic, not per-account.
- `oauth_state` is still set and there are no tokens. Therefore the callback never passed step 6.
- Row 6968e814 carries the stale-reset message in `last_error` while `status='connecting'`. It was auto-reset once, then a new `gbp-oauth-start` re-upserted `connecting` without clearing `last_error`.
- `source_sync_events` has no rows in the last 3 days. Selection and sync never ran.
- No GBP row in production has ever been `connected`.

A3.4.1 triggers on `connected_sources`:
- `connected_sources_clear_on_disconnect` (BEFORE INSERT/UPDATE): acts only when `NEW.status='disconnected'`. It forgets Vault refs, nulls tokens and account/location, and strips `oauth_state`.
- `connected_sources_forget_on_delete` (AFTER DELETE).

Neither trigger fires on the `connecting` path. Neither one blocks the callback, and neither is involved in the failing upsert (the permission error is raised before triggers run).

---

## 5. OAuth config

| Item | Status |
|---|---|
| `GOOGLE_CLIENT_ID` | CONFIGURED |
| `GOOGLE_CLIENT_SECRET` | CONFIGURED |
| `GOOGLE_REDIRECT_URI` | CONFIGURED (value not readable from this environment; consistency UNVERIFIED) |
| `SITE_URL` | CONFIGURED |
| gbp-oauth-callback `verify_jwt` | false (config.toml and deployed). This is correct, so a gateway 401 is excluded. |
| gbp-oauth-start / list-locations / sync / disconnect / reviews `verify_jwt` | true (correct) |
| State / CSRF | 32-byte random hex state, stored server-side in row metadata, matched on callback together with `status='connecting'`, cleared after exchange. The SPA's sessionStorage copy is only cleared, not compared (acceptable, since the server holds the authoritative check). |
| Code exchange | Uses the same `GOOGLE_REDIRECT_URI` as start (required by Google). |
| Google-side error (`?error=` from Google) | Redirects to the SPA with an error; the row is not reset server-side. |

The redirect URI that must be registered in Google Cloud (OAuth client → Authorized redirect URIs), exactly, with no trailing slash:

`https://<supabase-project-ref>.supabase.co/functions/v1/gbp-oauth-callback`

It must be byte-identical to `GOOGLE_REDIRECT_URI`. If `SITE_URL` points at the production domain, the SPA route `/oauth/google-business/callback` is served there.

---

## 6. Google project consistency

- Intended project: **LocalSEOHub** (`localseohub-500916`).
- The client ID's numeric prefix is the Google project number, not the project id. The secret values are not readable from this environment, so it cannot be verified here that the client ID and secret belong to `localseohub-500916`, or that they belong to the same OAuth client.
- **Status: UNVERIFIED.** If manual verification shows that the client comes from another project, that is CRITICAL. It would also explain a token-exchange failure (`invalid_client`) or `redirect_uri_mismatch`.

---

## 7. Logs

Edge function logs (gateway and function) are **not accessible** with the tools available in this environment: there is no log-query tool, and the CLI is unsupported.

| Function | Window to inspect | Expected evidence |
|---|---|---|
| gbp-oauth-start | 2026-10-20 16:39:32 and 17:00:14 UTC | 200 (proved by DB: rows written at those exact times) |
| gbp-oauth-callback | 16:39–16:50 and 17:00–17:10 UTC | **Key question:** any invocation at all? If none, Google never redirected (consent cancelled or `redirect_uri_mismatch`). If there were invocations: a 302 to `?error=` plus the token-endpoint error (`invalid_client` / `invalid_grant` / `redirect_uri_mismatch`). |
| gbp-list-locations / gbp-sync | same | Expected: no invocations (DB shows the flow never got past step 6) |

The rows show no `tokens_stored_at` and no sync events. This is consistent with the callback not succeeding, but logs are needed to identify the stage.

---

## 8. API access (case A vs B)

- **A — OAuth cannot complete: YES.** No tokens were stored for any attempt.
- **B — OAuth works but the GBP API is unavailable: not reached.** The account and location APIs were never called successfully, because no row has tokens. GBP API quota or approval (`mybusinessaccountmanagement` / `mybusinessbusinessinformation`, often 0 QPM until Google approves access) is still a latent risk. It is untestable until case A is fixed, and it would surface as `ACCOUNT_DISCOVERY_FAILURE` / `GBP_API_ACCESS_FAILURE`, with tokens stored and `oauth_state` null.

---

## 9. A3.4.1 regression check

| Area | Breaks the flow? | Evidence |
|---|---|---|
| Token storage (Vault, `gbp_store_credentials`) | No | Never reached (`oauth_state` still present). EXECUTE is granted to service_role, which the callback uses. |
| Refresh | No | Not reached. |
| Disconnect trigger | No | Only acts on `status='disconnected'`. |
| Cleanup / forget on delete | No | Not involved. |
| Grants | No | A3.4.1 only revoked anon access and TRUNCATE/TRIGGER/REFERENCES. The restrictive column grants that break `upsertSource` come from `20260804165058_create_connected_sources_and_sync_events.sql` (pre-existing). |

**Verdict: no A3.4.1 regression.** No revert is needed or advised.

---

## 10. Root cause

1. **Confirmed.** Every client `upsertSource()` call on `connected_sources` fails with `42501`. The client sends `updated_at` (no INSERT grant), and the upsert's `DO UPDATE` sets `source_type`, `business_id` and `user_id` (no UPDATE grants).
   - Recovery (`resetGBPStatus`) is therefore silently impossible.
   - The success path (`selectGBPLocation`) is dead at its first statement.
   - The row stays `connecting`, so the card shows "Conectando…" and Reseñas shows "Pendiente de conexión".
2. **Highly likely, stage unconfirmed.** For both observed attempts, Google's round-trip did not reach a successful code exchange. Candidates, in order of likelihood:
   - (a) `redirect_uri_mismatch` or a client from another project, where Google shows an error page and never calls back;
   - (b) a token-exchange failure (`invalid_client`, secret not matching the client);
   - (c) the user cancelled consent.

Classification: **STALE_CONNECTION_STATE / FRONTEND_STATE_FAILURE (confirmed)**, plus **CALLBACK_FAILURE or CODE_EXCHANGE_FAILURE (upstream, pending logs)**.

---

## 11. Confidence

| Finding | Confidence |
|---|---|
| Client upsert rejected by column privileges | 100% (reproduced in production as the real owning user, rolled back) |
| Stuck label is a rendering of the stale DB row | 100% (code plus DB) |
| OAuth never passed code exchange for both attempts | 95% (`oauth_state` still present, no tokens, no sync events) |
| Exact upstream stage | Low without logs |
| A3.4.1 not responsible | 95% |

---

## 12. Minimum fix (proposed, NOT applied)

Smallest and safest change, frontend-only, with no security loosening.

1. **`upsertSource` (repositories.ts):**
   - stop sending `updated_at` in the INSERT payload, and add a BEFORE UPDATE `updated_at` trigger (or let the edge functions set it);
   - for existing rows, use `.update(patch).eq('business_id', …).eq('source_type', …)` instead of an upsert. Fall back to `.insert()` (without `updated_at`) only when no row matches.

   This stays within the existing column grants. Granting UPDATE on `user_id`, `business_id` or `source_type` is not recommended, because it would let a user re-parent rows.
2. **`GBPCallbackPage.handleSelectLocation`:** wrap `selectGBPLocation` in try/catch and route to `handleError`, so the spinner can never hang.
3. **`gbp-oauth-callback`** (optional hardening): on every error redirect after the state row is found, set `status='disconnected'` server-side (service role), so recovery does not depend on the browser.
4. **`gbp-oauth-start`:** clear `last_error` when re-entering `connecting`.

Item 1 alone unblocks recovery and the selection path. The upstream OAuth failure must still be diagnosed from logs and Google Cloud (sections 14–15).

---

## 13. Files to modify (when authorized)

- `src/features/reality-engine/repositories.ts` — `upsertSource` (item 1)
- `src/features/reality-engine/GBPCallbackPage.tsx` — error handling in `handleSelectLocation` (item 2)
- `supabase/functions/gbp-oauth-callback/index.ts` — server-side reset on error (item 3, optional)
- `supabase/functions/gbp-oauth-start/index.ts` — clear `last_error` (item 4, optional)
- Optional migration: BEFORE UPDATE trigger setting `updated_at = now()` on `connected_sources` (no grant changes)

---

## 14. Google Cloud manual action (project `localseohub-500916`)

1. In APIs & Services → Credentials, confirm the OAuth 2.0 Web client used in Supabase belongs to `localseohub-500916`. The project number shown on the dashboard must equal the numeric prefix of the client ID.
2. Confirm that Authorized redirect URIs contains exactly `https://<supabase-project-ref>.supabase.co/functions/v1/gbp-oauth-callback`.
3. On the OAuth consent screen:
   - the scope `https://www.googleapis.com/auth/business.manage` must be added;
   - while the app is in Testing, the connecting Google accounts must be listed as test users.
4. Confirm these APIs are enabled: My Business Account Management, My Business Business Information, and (for reviews) My Business v4 / reviews. Confirm that GBP API access is approved, i.e. the quota is not 0 QPM.

## 15. Supabase manual action

1. In the Dashboard, open Edge Functions → `gbp-oauth-callback` → Logs, window 2026-10-20 16:39–17:10 UTC.
   - If there are no invocations: Google never redirected (check section 14, items 1–3).
   - If there are invocations: read the sanitized token-endpoint error.
2. Verify that the `GOOGLE_REDIRECT_URI` secret is byte-identical to the Google Cloud entry, and that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` come from the same client in `localseohub-500916`.
3. No manual DB edit is required. Once the fix ships, the stale-reset (or the user clicking Conectar) clears the two `connecting` rows.

---

**ROOT CAUSE HIGHLY LIKELY**

(The stuck-state mechanism is confirmed by reproduction. The upstream OAuth stage that left both attempts without tokens needs the edge function logs to be confirmed.)

---

## External configuration verification — Google Cloud + Supabase

(A3.4.2.1b — audit only. No secret, code, row, migration, deploy or Google Cloud change was made. No secret value was read into this document.)

### Method and limits

- Edge-function secrets are not readable from this environment. The SQL tools cannot reach the edge runtime, the local workspace has no copy of the `GOOGLE_*` or `SITE_URL` values, and the CLI is unsupported.
- The only server-side ways to read them are both forbidden in this audit:
  - deploying a probe function;
  - calling `gbp-oauth-start`, which needs a real user session and writes a `connecting` row.
- One safe probe was run: an unauthenticated `GET` to the deployed `gbp-oauth-callback` with no `code` or `state`.
  - Per the source code, this path returns before any database access, token request or secret use.
  - Result: `HTTP 302` with `Location: https://localseohub.io/oauth/google-business/callback?error=Faltan parametros de autorizacion (code/state)`.

What that probe proves:

1. **The gateway lets a JWT-less GET through.** The response came from the function code (its own error message), not from a gateway `401`.
2. **The effective `SITE_URL` is `https://localseohub.io`.**
3. **`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` are all non-empty at runtime.** Otherwise the function would have answered "Google API no configurado en el servidor", which is checked first.

### Check 1 — Client ID project consistency

The value cannot be read safely: no deploy, and no call to start that writes a row. A prefix comparison against `527097264879` is therefore impossible here.

**GOOGLE_CLIENT_ID_PROJECT_MATCH = UNVERIFIED.** It is not YES/NO, because guessing is prohibited.

Safe manual check: in Bolt/Supabase secrets, confirm that the value begins with `527097264879-` and ends with `.apps.googleusercontent.com`. Alternatively, start a connection in production and confirm that Google's consent page shows the app name "LocalSEOHub".

### Check 2 — Redirect URI exact match

The value cannot be read for the same reason.

**GOOGLE_REDIRECT_URI_MATCH = UNVERIFIED.**

Requirements for a match:
- the value must be byte-identical to `https://<LOCALSEOHUB_SUPABASE_PROJECT>.supabase.co/functions/v1/gbp-oauth-callback`;
- no trailing slash, `https`, and the project ref in lowercase;
- the same ref as the deployed functions, i.e. the project that served the 302 above.

Observable symptom if it does not match: Google shows `Error 400: redirect_uri_mismatch` on its own page and never calls the callback. That fits the DB evidence: `oauth_state` is never cleared and the callback is never reached.

### Check 3 — SITE_URL

**SITE_URL_MATCH = YES.** The deployed callback redirects to `https://localseohub.io/...`.

Note: the code falls back to `https://localseohub.io` if `SITE_URL` were empty. The secret is listed as present, and either way the effective value is the expected one.

### Check 4 — Client secret consistency

Verifying the secret needs a token request, and that needs the secret. The only safe discriminator would be a request with a deliberately invalid code (`invalid_client` vs `invalid_grant`), which this audit forbids.

**GOOGLE_CLIENT_SECRET_MATCH = UNVERIFIED.**

Having two enabled secrets on the client is fine: Google accepts either. A mismatch is only possible if the configured value belongs to a different client, or was deleted or disabled.

### Check 5 — Callback deployment

Deployed `gbp-oauth-callback` has `verify_jwt = false`, as does `supabase/config.toml`. The live probe got a function-generated 302, not a gateway 401.

**CALLBACK_PUBLIC_GET_REACHABLE = YES.** Google's JWT-less browser redirect reaches the function code.

### Check 6 — Start/callback URI symmetry

- `gbp-oauth-start` sends `redirect_uri = Deno.env.get("GOOGLE_REDIRECT_URI")` in the authorization URL.
- `gbp-oauth-callback` sends `redirect_uri = Deno.env.get("GOOGLE_REDIRECT_URI")` in the token exchange.
- Both functions are in the same project and read the same secret store, so they get the same value.

**OAUTH_REDIRECT_SYMMETRY = YES.** This confirms that start and callback agree with each other. Check 2 covers whether that value matches Google Cloud.

### Check 7 — Database write failure (preserved and pinned)

**DATABASE_STATUS_WRITE = BLOCKED** (reproduced as the real owning user, rolled back).

Exact cause: these are column-level privileges. The A3.4.1 triggers and the RLS policies are not involved; RLS ownership passes. The privileges were granted in `20260804165058_create_connected_sources_and_sync_events.sql` (pre-A3.4.1).

| Privilege of `authenticated` on `connected_sources` | Columns granted | What the client sends |
|---|---|---|
| INSERT | user_id, business_id, source_type, status, external_account_id, external_location_id, last_error, metadata | `upsertSource()` also sends **`updated_at`** → denied |
| UPDATE | status, external_account_id, external_location_id, last_error, last_sync_at, metadata, updated_at | PostgREST upsert `ON CONFLICT DO UPDATE SET` also sets **`source_type`, `business_id`** → denied |

The result is `42501 permission denied for table connected_sources` on every `upsertSource()` call:
- `resetGBPStatus`;
- `selectGBPLocation`: syncing, connected and error;
- the reviews row.

A plain `.update()` limited to the granted columns succeeds. This is why the 10-minute stale reset works.

The `connected_sources_clear_on_disconnect` trigger, the Vault functions and the RLS policies are **not** the blocker.

Minimum safe architectural correction (preferred; no security loosening):

1. **Server-owned transitions.** Status changes for `google_business` and its dependent `reviews` row move to the server, using service role:
   - `gbp-oauth-callback` sets `disconnected` on every error path after the state row is found;
   - `gbp-sync` sets `syncing` before the sync and `connected` or `error` after it, and writes the linked `reviews` row;
   - the client stops writing these statuses.
2. **User reset or cancel** goes through an ownership-checked server path: the existing `gbp-disconnect`, or a narrowly scoped SECURITY DEFINER RPC that only allows a transition to `disconnected` for the caller's own row.
3. **Do not** grant UPDATE on `user_id`, `business_id` or `source_type`. That would allow re-parenting rows, which weakens the A3.4.1 model.
4. **Interim, if the recovery fix must stay client-side:** use `.update()` with only granted columns and no `updated_at` in INSERT. This works within the current grants, but it keeps a client-trusted status, which the A3.4.2.2 fix should retire.

### Matrix

| Check | Result |
|---|---|
| GOOGLE_CLIENT_ID_PROJECT_MATCH | UNVERIFIED (not readable without a forbidden deploy or row-writing call) |
| GOOGLE_REDIRECT_URI_MATCH | UNVERIFIED (same reason) |
| SITE_URL_MATCH | YES |
| GOOGLE_CLIENT_SECRET_MATCH | UNVERIFIED |
| CALLBACK_PUBLIC_GET_REACHABLE | YES |
| OAUTH_REDIRECT_SYMMETRY | YES |
| DATABASE_STATUS_WRITE | BLOCKED |

### Updated root-cause classification

**Ruled out:**
- a gateway 401 on the callback (`verify_jwt`);
- a wrong `SITE_URL`;
- missing secrets;
- a start/callback redirect asymmetry;
- an A3.4.1 trigger or Vault regression.

**Confirmed:**
- `STALE_CONNECTION_STATE` caused by `FRONTEND_STATE_FAILURE`. The client write path is blocked by column grants, so no failed attempt can be reset and no successful attempt can reach `connected`.

**Upstream, still unconfirmed.** Both attempts stopped before the code exchange (`oauth_state` was never cleared). The remaining candidates are external values that cannot be read here:
1. `GOOGLE_REDIRECT_URI` not byte-identical to the Google Cloud entry: Google shows `redirect_uri_mismatch` and never calls back;
2. `GOOGLE_CLIENT_ID` not the `527097264879-…` client: consent fails at Google;
3. the secret does not belong to that client (`invalid_client`);
4. the user cancelled, or the consent screen is in Testing without the user listed.

Fastest way to decide: start one connection in production and note what Google shows.
- A `redirect_uri_mismatch` or `invalid_client` page points to item 1 or 2.
- A normal consent screen named "LocalSEOHub" makes items 1 and 2 very unlikely; item 3 would then appear as the error returned to the app.

**ROOT CAUSE HIGHLY LIKELY**
