# A3.4.1 — GBP Security & Token Lifecycle Hardening

Sprint scope: pre-reviews hardening only. Reseñas IA was **not** started: no page, no reading of individual reviews, no AI replies, no publishing.

---

## 1. Executive Summary

All of the following were closed:
- the anonymous-role privileges on `connected_sources` and `source_sync_events`;
- the missing token refresh in `gbp-sync`;
- the reset that kept tokens on disconnected rows;
- the client-only disconnect without revocation;
- plaintext token storage.

Changes made:
- OAuth tokens are now **encrypted at rest with Supabase Vault**, using a Supabase-managed key. No owner secret was needed and no key lives in code.
- A database trigger plus a CHECK constraint make it impossible for a `disconnected` row to hold credentials.
- A new `gbp-disconnect` Edge Function revokes the grant at Google and always clears credentials locally.
- A shared, byte-identical `gbpToken.ts` helper handles reuse, refresh and persistence of tokens in `gbp-list-locations`, `gbp-sync` and `gbp-disconnect`.

Results:
- Full suite: 1772/1772 tests pass. Build passes.
- Live invariant: **0** disconnected rows with credentials and **0** plaintext tokens.

## 2. Vulnerabilities/debts addressed

| # | Finding (from A3.4) | Severity | Resolution |
|---|---|---|---|
| V1 | `anon` held full table privileges on `connected_sources`, plus column SELECT/INSERT/UPDATE on both token columns | High (defense in depth; RLS had no anon policy) | `REVOKE ALL … FROM anon` |
| V2 | `anon` and `authenticated` held UPDATE/TRUNCATE/TRIGGER/REFERENCES on `source_sync_events` | Medium | anon revoked entirely; authenticated limited to SELECT/INSERT/DELETE |
| V3 | `gbp-sync` used the stored access token without refreshing it, so syncs failed after about an hour | Medium (availability) | Shared helper `ensureAccessToken` |
| V4 | `resetGBPStatus` and the stale-`connecting` cleanup left tokens on `disconnected` rows | High | BEFORE INSERT/UPDATE trigger clears the credentials; CHECK constraint |
| V5 | Disconnect from Fuentes deleted the row client-side and never revoked the grant at Google | Medium | `gbp-disconnect` Edge Function |
| V6 | The callback overwrote an existing refresh token with `null` when Google omitted one | Medium | `gbp_store_credentials` treats a NULL refresh token as "keep the existing one" |
| V7 | Tokens were stored as plaintext in the `*_encrypted` columns | Medium | Vault encryption at rest |
| V8 | 1 disconnected row still held an access token and a refresh token | High | One-time cleanup in the migration |

## 3. Database privilege changes

Migration `a341_gbp_security_hardening`:
- `REVOKE ALL ON public.connected_sources FROM anon;`
- `REVOKE ALL ON public.source_sync_events FROM anon;`
- `REVOKE UPDATE, TRUNCATE, TRIGGER, REFERENCES ON public.source_sync_events FROM authenticated;`
- `REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.connected_sources FROM authenticated;`

Credential functions:
- New functions have `EXECUTE` revoked from `PUBLIC`, `anon` and `authenticated`.
- Only `service_role` is granted `EXECUTE` on:
  - `gbp_store_credentials`
  - `gbp_read_credentials`
  - `gbp_clear_credentials`
  - `gbp_credential_invariant_violations`

Live verification after apply:

| Check | Result |
|---|---|
| anon table grants on both tables | 0 |
| anon/authenticated column grants on `access_token_encrypted` / `refresh_token_encrypted` | 0 |
| authenticated on `source_sync_events` | INSERT, SELECT, DELETE |
| authenticated on `connected_sources` (table level) | DELETE only; column grants unchanged, no token columns |
| `has_function_privilege` on `gbp_read_credentials` | anon false, authenticated false, service_role true |

## 4. RLS verification

- RLS is still enabled on `connected_sources` and `source_sync_events`.
- The owner-scoped policies (`auth.uid() = user_id`, `TO authenticated`) are unchanged. There are still no anon policies.
- With anon privileges revoked, an anonymous request is now denied at the privilege layer, before RLS is evaluated.
- An authenticated request can see only its own rows (RLS) and only non-token columns (column grants).
- The token values themselves are now only `vault:<uuid>` references, which are useless without `service_role` access to `vault.decrypted_secrets`.
- `get_advisors` (security) reports no findings on any GBP object. The remaining findings concern older, unrelated objects (billing RPCs, `get_funnel_stats`, leaked-password setting).

## 5. Token refresh architecture

`supabase/functions/<fn>/gbpToken.ts` exists as byte-identical copies in `gbp-sync`, `gbp-list-locations` and `gbp-disconnect`. This follows the project's no-shared-code-between-functions rule, and a test asserts the copies are identical.

`ensureAccessToken(store, {fetch, clientId, clientSecret, now})` works as follows:
1. It reads credentials through a `CredentialStore`. In production this is `vaultCredentialStore(admin, sourceId)`, which calls the `gbp_read_credentials` / `gbp_store_credentials` RPCs.
2. If an access token exists and more than 60 s remain before expiry, it **reuses** it and makes no network call.
3. Otherwise it POSTs `grant_type=refresh_token` to `https://oauth2.googleapis.com/token`.
4. It persists the new access token and `expires_at`. The default lifetime is 3600 s if Google omits `expires_in`.
5. If Google returns no new refresh token, it passes `null`, and the RPC **keeps the existing refresh token**.

Errors map to a controlled result `{ok:false, code, retryable}`, never to an exception:

| Condition | Code |
|---|---|
| No connection | `NOT_CONNECTED` |
| No refresh token, or 400/401/`invalid_grant` | `GBP_AUTH_EXPIRED` |
| 429 / `RESOURCE_EXHAUSTED` / `RATE_LIMIT` | `GBP_QUOTA_EXCEEDED` (retryable) |
| 5xx, network error, malformed body | `GBP_API_UNAVAILABLE` (retryable when transient) |
| Missing client id or secret | `NOT_CONFIGURED` |

Usage:
- **`gbp-list-locations`** (`handler.ts`): the local refresh code was removed and the helper is used. On `GBP_AUTH_EXPIRED` it records `last_error`.
- **`gbp-sync`** (`index.ts`): the helper is used before the two Google calls. The file still contains exactly two `fetch(` calls and every A2.5 assertion still holds.

Tokens are never part of any HTTP response.

## 6. Reset behavior

`resetGBPStatus` still upserts `status:'disconnected'`; the browser cannot write the token columns. The new BEFORE INSERT/UPDATE trigger `connected_sources_clear_on_disconnect` enforces the following whenever `NEW.status = 'disconnected'`, from any role or path:
- deletes the referenced Vault secrets;
- nulls `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`, `external_account_id` and `external_location_id`;
- removes `metadata.oauth_state`.

This also covers the stale-`connecting` cleanup in `loadSources`.

A rolled-back live probe confirmed it: after setting `disconnected`, the tokens and expiry were null and 0 Vault secrets remained.

`verified_profile` is intentionally left in place. It is not a credential, and the frozen Maps Scanner consumes it.

## 7. Disconnect/revocation behavior

New Edge Function `gbp-disconnect` (`verify_jwt = true`), split into `handler.ts` (testable dependencies) and `index.ts`:
1. Takes the JWT and resolves it to the user with `auth.getUser(jwt)`, giving 401 otherwise.
2. Resolves the business by `user_id`. An optional `businessId` must match it (403 otherwise). It then finds that user's `google_business` source.
3. Reads the credentials server-side and POSTs the refresh token (or the access token as a fallback) to `https://oauth2.googleapis.com/revoke`.
4. **Always** calls `gbp_clear_credentials` and deletes the row, scoped by `id` and `user_id`. This happens even when revocation returns 4xx/5xx or throws, so revocation failure never blocks local cleanup.
5. Responds `{success, revoked, removed}` with no tokens. The log line contains only the `revoked`/`removed` booleans.

Contract: Fuentes previously deleted the row, and the row is still deleted, now server-side. The AFTER DELETE trigger also removes the Vault secrets for any other client-side delete.

Frontend: `disconnectSource` routes `google_business` to `gbp-disconnect`. Other source types are unchanged.

## 8. Token storage/encryption decision

**IMPLEMENTED — Supabase Vault (`supabase_vault` 0.3.1).** It is not marked BLOCKED, because Vault is installed, working and keyed by Supabase-managed key material. No owner-provided secret, no `VITE_*` value, no key in code and no home-made crypto are involved.

How it works:
- Columns store `vault:<uuid>` references.
- `gbp_vault_put` creates a secret or updates it in place on rotation; `gbp_vault_reveal` decrypts; `gbp_vault_forget` deletes.
- These are internal SECURITY DEFINER helpers with `search_path = ''` and no client `EXECUTE`.

Compatibility:
- `gbp_vault_reveal` returns legacy non-`vault:` values unchanged, so a not-yet-migrated connection would not break.
- The migration moved any plaintext on active rows into Vault. There were 0 at apply time.

Live probe (rolled back): store, read (round-trip correct), rotate (same reference, refresh token preserved), disconnect (secrets deleted), store on a disconnected row (refused), delete (secrets deleted).

## 9. Existing credential cleanup

- Before: 2 `google_business` rows, both `disconnected`, 1 holding an access token and a refresh token.
- The migration ran `UPDATE … SET status = status WHERE status='disconnected' AND <has credentials>`, which fired the clearing trigger.
- After:
  - `gbp_credential_invariant_violations()` = **0**;
  - raw count of disconnected rows with any token = **0**;
  - plaintext tokens on any row = **0**.
- Invariant enforcement: CHECK constraint `connected_sources_disconnected_no_credentials` (`status <> 'disconnected' OR` tokens and expiry are NULL), plus the trigger and the service-role-only check function.

Note: that orphaned refresh token could not be revoked at Google because its grant context was stale. It was destroyed locally. The owner can also remove the app at myaccount.google.com/permissions.

## 10. User isolation verification

- Every GBP function resolves `JWT → auth.getUser(jwt) → user.id → businesses.user_id → connected_sources(user_id, business_id)`. No function reads a `user_id` from the request body; this is tested.
- `gbp-sync` keeps `businessId != null && businessId !== business.id` → 403.
- `gbp-list-locations` filters by `user_id` and excludes `disconnected` rows.
- `gbp-disconnect` returns 403 for a foreign `businessId` and touches nothing (tested). Its deletes are scoped by `id` and `user_id`.
- Credential RPCs are not callable by any client role, so user A cannot read, refresh or clear user B's tokens through the Data API.
- `gbp-oauth-callback` keeps its existing check that the state matches the business and the business belongs to the user.
- Location selection still flows through `gbp-sync`, which is user-scoped.

## 11. Logging review

All `console.*` calls in the GBP functions (callback, start, sync, list-locations, disconnect, and the helper) are covered by tests asserting that no log line references:
- `tokens.`, `accessToken`, `refreshToken` or `_token`;
- the bare auth `code`;
- `clientSecret` or `client_secret`;
- a response `body` or `.text()`.

Logs contain only status codes, error codes or booleans. Google error bodies are inspected for keywords only, then discarded. They are never returned or logged.

## 12. Files modified

- `supabase/functions/gbp-sync/index.ts`: refresh via the helper; structured error codes.
- `supabase/functions/gbp-list-locations/handler.ts`, `index.ts`, `logic.ts`: helper plus Vault store; `needsRefresh` moved into the helper.
- `supabase/functions/gbp-oauth-callback/index.ts`: Vault storage, refresh token preserved, access token validated.
- `supabase/config.toml`: `[functions.gbp-disconnect] verify_jwt = true`.
- `src/features/reality-engine/engine.ts`: `disconnectSource` routes `google_business` to the server.
- Tests:
  - `gbpListLocations.test.ts` adapted to the credential store;
  - the migration-count guards in `a281TrustCleanup`, `a33DiagnosticAction`, `f03Stage2b`, `a273Roadmap` and `a272TodayIntelligence` updated from 42 to 43 to admit this sprint's single approved migration.

Not modified (frozen):
- `gbp-oauth-start` (hash unchanged) and `App.tsx`;
- Maps Scanner, GEO Audit, Digital Twin, SEO Generator, Business Advisor, Competitor Radar, Voice Simulator, Today Intelligence, Plan roadmap, Action Layer, Billing, Stripe and Meta.

## 13. Migrations created

- `20261019194350_a341_gbp_security_hardening.sql`: revokes, Vault helpers and RPCs, two triggers, cleanup, plaintext migration and the CHECK constraint.
- Idempotent, with no DROP of data or columns.

## 14. Edge Functions created/modified

- Created: `gbp-disconnect` (`index.ts`, `handler.ts`, `gbpToken.ts`).
- Modified: `gbp-sync` (`+gbpToken.ts`), `gbp-list-locations` (`+gbpToken.ts`), `gbp-oauth-callback`.
- All four were deployed successfully.

## 15. Tests added

`src/features/reality-engine/__tests__/a341GbpSecurity.test.ts` has 35 tests:
- **Privileges:** anon revoked; token columns never granted; RPCs are service-role only; `search_path` pinned on all 9 SECURITY DEFINER functions; Vault used with no custom crypto.
- **Reset and invariant:** the trigger clears tokens, expiry, `oauth_state` and ids; the delete trigger forgets the secrets; cleanup and CHECK constraint are present; storing on a disconnected row is refused.
- **Helper:** a valid token is reused with no network call; expired, near-expiry and missing expiry all refresh and persist; the existing refresh token is preserved; a rotated refresh token is stored; an invalid refresh gives `GBP_AUTH_EXPIRED` with no token leak; quota, outage and network errors map correctly; `NOT_CONNECTED`, `NOT_CONFIGURED` and `AUTH_EXPIRED` are distinct; revocation success and failure.
- **Disconnect:** JWT required; revocation plus clearing; revocation failure (400, 503, throw) still clears; the JWT user is used, never a client `user_id`; a foreign business gets 403 and nothing is touched; no-op when nothing is connected; a clear failure surfaces; server wiring and config; Fuentes routes through the server.
- **Isolation and secrecy:** helper copies are byte-identical; sync and list-locations use the helper; functions never touch token columns directly; callback refresh preservation; JWT-scoped lookups; log sanitization; the frontend never references tokens or Vault.

Live checks (rolled-back probe plus queries) are described in sections 3, 8 and 9.

## 16. Full regression results

| Check | Result |
|---|---|
| Vitest full suite | **51 files, 1772/1772 passed** |
| `npm run build` | **passed** |
| TypeScript (`tsc -p tsconfig.app.json`) | 0 errors in GBP or new files; 19 older errors in unrelated files (e.g. unused imports in `LandingPage`, `MetaAdsLanding`, legacy admin) |
| ESLint | 0 errors in new or changed GBP files; older errors remain elsewhere (e.g. `no-explicit-any` in `invokeEdge`, `i18n.tsx`) |
| A2.5 assertions on `gbp-sync` | all hold, including exactly 2 `fetch(` calls, scoped update and verified-profile fields |
| `gbp-oauth-start` frozen hash | unchanged |

GBP flows:
- connect start: unchanged;
- callback: stores encrypted;
- accounts and list locations: refresh-aware;
- select location / sync: refresh-aware, writes `verified_profile`;
- Maps Scanner: still reads `verified_profile`;
- Fuentes status: unchanged columns.

End-to-end against real Google was **not** executed, because there is no live consented account or API quota (see section 17).

## 17. Remaining external blockers

- **Google Cloud:** Business Profile API access approval, non-zero quota and consent-screen production status are **not verified and not claimed**. Live end-to-end refresh and revocation against Google remain untested until access is granted.
- **Orphaned Google grant:** the previously disconnected user's grant could not be revoked server-side. The user can remove it at the Google account permissions page.
- **Encryption:** none. It is implemented with the managed Vault key, so there is no BLOCKED EXTERNAL CONFIGURATION.

## 18. GO / CONDITIONAL GO / NO-GO

Every PASS criterion is met:
- anon has no credential access;
- the authenticated frontend cannot read tokens;
- `gbp-sync` refreshes safely;
- reset and disconnect keep no tokens;
- 0 disconnected rows hold credentials;
- no secrets reach the browser;
- GBP flows are intact;
- the suite and build pass.

The only open items are Google-side approvals outside the codebase.

**Verdict: GO for the security baseline (A3.4.1 PASS).** Proceeding to Reseñas IA (A3.4.2) remains **conditional on Google API access and quota**, which this sprint does not and cannot assert.
