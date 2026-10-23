# A3.5.1 — Meta Facebook & Instagram Connection Foundation

Date: 2026-10-21 · Mode: BUILD · Scope: connection foundation only (no social intelligence, no publishing)

---

## 1. Executive summary

LocalSEOHub now has a dedicated, isolated, server-owned connection to Meta (Facebook Pages + linked Instagram professional account):

- New `meta_connections` / `meta_oauth_states` tables, fully separate from GBP (`connected_sources`), the Meta Pixel and advertising consent.
- Three edge functions (`meta-oauth-start`, `meta-oauth-callback`, `meta-connection`) own every state transition; the browser can only read its own row (minus credential columns).
- User access tokens live only in Supabase Vault; the database row holds a `vault:<uuid>` reference that the browser cannot read.
- OAuth state is server-generated (256-bit), stored hashed, user-bound, 10-minute expiry, single-use; a second browser-bound step (binding nonce + one-time completion token) prevents login-CSRF / account-mixing.
- `/fuentes` shows a new "Facebook e Instagram" card with all required states; `/oauth/meta/callback` finishes the flow.
- Real Meta credentials (`META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`) are **not configured**. The system fails truthfully with "La conexión con Meta todavía no está disponible." No connection is faked.

Verdict: **CONDITIONAL GO** (blocked only on external Meta Developer configuration).

## 2. Pre-existing state (A3.5.0 findings re-verified)

| Check | Result |
|---|---|
| Meta OAuth code (`facebook.com/dialog/oauth`, `graph.facebook.com`) | None before this sprint |
| Meta credential table | None |
| FB/IG source in `SOURCE_REGISTRY` | None |
| `META_*` edge secrets | None (still none after this sprint) |
| Page / IG discovery | None |
| Meta Pixel (`src/lib/pixel.ts`) + consent | Present, unrelated, untouched |

A3.5.0 findings still held at sprint start.

## 3. Architecture

```
/fuentes  MetaConnectionCard ──POST──▶ meta-oauth-start (JWT)
   │  sessionStorage: binding nonce        │ meta_begin_attempt(hash(state), hash(binding))
   ▼                                        ▼
facebook.com/v25.0/dialog/oauth  ──302──▶ meta-oauth-callback (public)
                                            │ meta_consume_oauth_state(hash(state))  single-use
                                            │ code → short token → long-lived token
                                            │ /me, /me/permissions, /me/accounts
                                            │ meta_store_authorization → Vault  (status AUTHORIZED)
                                            ▼ 302 /oauth/meta/callback#token=<one-time completion>
MetaCallbackPage ──POST complete(completion, binding)──▶ meta-connection (JWT)
                                            │ meta_complete_authorization(user, hash, hash)
                                            │ → PAGE_SELECTION_REQUIRED (or auto-select if exactly 1 Page)
/fuentes Page picker ──POST select_page──▶ meta-connection → instagram_business_account → CONNECTED
```

Lifecycle: `disconnected → connecting → authorized → page_selection_required → connected`, with terminal `error` / `reauth_required`. All transitions are performed by SECURITY DEFINER functions executable only by `service_role`, called only from the edge functions.

Graph API version: **v25.0** (released 2026-02-18, supported until 2028-07-29), constant `META_GRAPH_VERSION` in each function.

## 4. Database changes

Migration `20261021191223_a351_meta_connection_foundation.sql`:

- `meta_connections`: `id`, `user_id`→auth.users, `business_id`→businesses, `status` (CHECK 7 values), `instagram_status` (CHECK: connected / not_associated / unsupported / permission_unavailable / api_error), `meta_user_id`, `page_id`, `page_name`, `instagram_account_id`, `instagram_username`, `available_pages` jsonb, `granted_permissions` text[], `user_token_ref`, `token_expires_at`, `last_synced_at`, `last_error`, `last_error_at`, `revocation_status` (revoked/failed/skipped), `attempt_started_at`, `connected_at`, timestamps. UNIQUE(user_id, business_id). CHECK that credentials only exist in active statuses.
- `meta_oauth_states`: `connection_id`, `user_id`, `state_hash` UNIQUE, `binding_hash`, `expires_at`, `consumed_at`, `completion_hash` UNIQUE, `completion_expires_at`, `pending_pages`, `pending_meta_user_id`.
- Triggers: `meta_connections_wipe_inactive` (wipes Vault secret/page/IG data when leaving active statuses), `meta_connections_forget_on_delete`.
- Functions: `meta_vault_put/reveal/forget`, `meta_fail_connection`, `meta_begin_attempt`, `meta_consume_oauth_state`, `meta_store_authorization`, `meta_complete_authorization`, `meta_read_token`, `meta_finish_page_selection`, `meta_disconnect`, `meta_credential_invariant_violations`.

No existing table, column or policy was altered.

## 5. RLS / security

- RLS enabled on both tables. `REVOKE ALL` from `anon`, `authenticated`.
- `authenticated` gets column-level `SELECT` on every column **except** `user_token_ref` and `meta_user_id`.
- One policy: `select_own_meta_connection` — `FOR SELECT TO authenticated USING (auth.uid() = user_id)`.
- No INSERT/UPDATE/DELETE policy or grant → the browser cannot create, alter or mark a connection CONNECTED.
- `meta_oauth_states`: no grants, no policies (deny-all; advisor INFO "RLS enabled no policy" is intentional).
- All functions SECURITY DEFINER, `search_path = ''`, EXECUTE revoked from PUBLIC/anon/authenticated; only `service_role` granted.
- Edge functions derive the user from the JWT and the business from `businesses.user_id`; no client-supplied ids are trusted (the `connectionId` in a disconnect body is ignored).

Live verification (rollback-only SQL simulation, as `authenticated` with JWT claims):

| Probe | Result |
|---|---|
| Another user's rows visible | 0 rows |
| Own row visible | 1 row |
| `SELECT user_token_ref` | denied |
| `UPDATE ... SET status='connected'` | denied |
| `SELECT` on `meta_oauth_states` | denied |
| `meta_read_token()` RPC | denied |
| `meta_begin_attempt` for a business not owned | NULL (refused) |
| Disconnect → Vault secrets left | 0 |
| Credential invariant violations | 0 |

Supabase security advisor: no Meta-related warnings.

## 6. Credential storage

- Long-lived user token stored via `vault.create_secret`; row stores only `vault:<uuid>` in `user_token_ref`.
- Read only through `meta_read_token` (service_role, active statuses only).
- Never returned to the browser, never in URLs, never logged (logs contain error codes only; asserted by tests with console spies).
- Graph calls send the token in the `Authorization: Bearer` header plus `appsecret_proof` (HMAC-SHA256 with the app secret), never as a query parameter.
- Token is wiped from Vault when the connection leaves an active status, is replaced, or the row is deleted.
- Page access tokens are not requested or stored (not needed for this sprint).

## 7. OAuth state lifecycle

| Property | Implementation |
|---|---|
| Server-generated | `crypto.getRandomValues` 32 bytes (64 hex) in `meta-oauth-start` |
| Unpredictable | 256-bit; tested that two attempts differ |
| Stored safely | SHA-256 hash only (`state_hash` UNIQUE) |
| User-bound | state row carries `user_id`; consume rejects if connection user differs |
| Expiring | 10 min (`expires_at`); expired → attempt fails with `OAUTH_STATE_EXPIRED` |
| Single-use | `consumed_at` set atomically under `FOR UPDATE`; reuse → `OAUTH_STATE_INVALID` |
| Browser binding | binding nonce (hash stored) kept in `sessionStorage`; completion requires it + same signed-in user, else connection fails `SESSION_MISMATCH` and credentials are wiped |
| Completion token | one-time, 10 min, hashed, delivered in URL fragment (`#token=`), never reaches server logs; matched by the existing Pixel URL guard so no PageView fires |

Callback rejections: missing state, malformed state, unknown state, reused state, stale/wrong-user state, expired state, non-GET request, `error=access_denied` (→ `disconnected` + `OAUTH_DENIED`), other `error=` (→ `UNKNOWN_ERROR`), missing code (→ `TOKEN_EXCHANGE_FAILED`).

## 8. Edge Functions

| Function | verify_jwt | Purpose |
|---|---|---|
| `meta-oauth-start` | true | 503 `META_APP_NOT_CONFIGURED` if any Meta secret missing; 401 unauthenticated; begins attempt; returns `{url, binding}` |
| `meta-oauth-callback` | false | Validates/consumes state, exchanges code (short → long-lived), discovers user/permissions/Pages, stores in Vault, redirects with completion fragment or `?error=CODE` |
| `meta-connection` | true | Actions `complete`, `select_page`, `disconnect`, `recover` |

All: handler/index split with dependency injection, try/catch, mandatory CORS on every response. Deployed successfully.

## 9. Page discovery

`GET /me/accounts?fields=id,name&limit=100` after confirming `pages_show_list` is granted in `/me/permissions`.

| Outcome | Code |
|---|---|
| `pages_show_list` declined or Graph error 10/200–299 | `META_PERMISSION_UNAVAILABLE` |
| Empty list | `NO_AUTHORIZED_PAGES` |
| Graph 4/17/32/613 | `META_API_RATE_LIMIT` |
| Graph 190 | `REAUTH_REQUIRED` |
| Other Graph error / malformed body | `PAGE_DISCOVERY_FAILED` |

Page ids are validated as numeric; names trimmed to 200 chars. Debt: only the first 100 Pages are fetched (no paging).

## 10. Page selection

- Several Pages → `page_selection_required`; `/fuentes` opens a picker (auto-opened when arriving from the callback).
- `select_page` accepts only a numeric id present in the server-stored `available_pages`; the Page name is taken from the server copy, never from the browser. Unauthorised id → 403 with no Meta call.
- **Auto-select for exactly one Page** — safe because the list is the set the user explicitly granted in Meta's own dialog in the same, already browser-bound and user-verified flow; there is no other candidate. Documented in code and here.

## 11. Instagram association

`GET /{page-id}?fields=instagram_business_account`, then `GET /{ig-id}?fields=id,username`.

| Result | Stored `instagram_status` | Outcome code |
|---|---|---|
| IG id + username | connected | `INSTAGRAM_CONNECTED` |
| No `instagram_business_account` | not_associated | `NO_INSTAGRAM_ACCOUNT_ASSOCIATED` |
| IG node error code 100 | unsupported | `INSTAGRAM_NOT_PROFESSIONAL_OR_UNSUPPORTED` |
| Permission error | permission_unavailable | `INSTAGRAM_PERMISSION_UNAVAILABLE` |
| Other error | api_error | `INSTAGRAM_API_ERROR` |

The Facebook Page still connects when Instagram is unavailable. Rate limit (429) leaves the selection pending; 190 moves the connection to `reauth_required`.

## 12. /fuentes UX

New card "Facebook e Instagram" (below the existing cards; GBP card untouched):

- Description: "Conecta los perfiles sociales de tu negocio para que LocalSEOHub pueda analizar tu presencia y ayudarte a mejorarla."
- Disconnected: button "Conecta Facebook e Instagram".
- Connecting: "Conectando..." (never permanent; see §13/O).
- Page selection: "Selecciona la página de tu negocio" + "Elegir página" picker.
- Connected: "Facebook: [Page Name]" / "Instagram: @username" or "No hay una cuenta profesional asociada" (or the specific IG state).
- Error: "No se pudo completar la conexión" + plain-language reason + "Reintentar".
- Reauth: "Vuelve a conectar tu cuenta" + "Volver a conectar".
- Not configured: "La conexión con Meta todavía no está disponible."
- Disconnect icon with confirmation. English variants provided. No tokens, ids or metrics are displayed.

`/oauth/meta/callback` (signed-in, outside app shell): reads the completion fragment, clears it from the address bar immediately, completes, and returns to `/fuentes`, or shows a clear error with "Volver a fuentes".

## 13. Disconnect

`meta-connection` action `disconnect`: loads the caller's own connection (JWT-derived) → best-effort `DELETE /me/permissions` (revokes the app grant at Meta) → `meta_disconnect` wipes Vault secret, page/IG data and states. Local disconnect succeeds even if revocation fails (`revocation_status = failed`) or no token exists (`skipped`). Idempotent when no connection exists.

Stale-attempt guard: `recover` (called by the card on load) moves `connecting`/`authorized` attempts older than 15 min to `error`/`OAUTH_STATE_EXPIRED`, and expired tokens to `reauth_required`. The UI independently treats stale attempts as errors, so "Conectando..." can never be permanent.

## 14. Error taxonomy

`OAUTH_DENIED`, `OAUTH_STATE_INVALID`, `OAUTH_STATE_EXPIRED`, `TOKEN_EXCHANGE_FAILED`, `META_APP_NOT_CONFIGURED`, `META_PERMISSION_UNAVAILABLE`, `META_API_RATE_LIMIT`, `PAGE_DISCOVERY_FAILED`, `NO_AUTHORIZED_PAGES`, `INSTAGRAM_DISCOVERY_FAILED`, `REAUTH_REQUIRED`, `UNKNOWN_ERROR` — each with a Spanish and English user message. Internal extra: `SESSION_MISMATCH` (binding/user mismatch). Instagram per-account outcomes in §11. Error codes in redirect URLs are sanitised (`^[A-Z_]{3,40}$`) before display.

## 15. Permission matrix

| Permission | Requested | Why | Review needed |
|---|---|---|---|
| `pages_show_list` | Yes | List Pages the user manages (Page discovery) | Advanced Access via App Review for non-role users |
| `instagram_basic` | Yes | Read `instagram_business_account` id/username | Advanced Access via App Review |
| `pages_read_engagement` | No | Not needed for connection; future social intelligence (posts/insights) | Later sprint |
| `business_management` | No | Only required for some Business-Portfolio-owned Pages; add if real tests show Pages missing | Conditional |
| `instagram_manage_insights`, `read_insights` | No | Future analytics | Later sprint |
| `pages_manage_posts`, `instagram_content_publish` | No | Publishing is out of scope | Not planned |
| `ads_*` | No | Unrelated to connection; Pixel stays separate | Not planned |

## 16. External checklist (Meta Developer — for Manuel)

1. developers.facebook.com → My Apps → Create App → type **Business** (use the business portfolio that owns LocalSEOHub).
2. Add product **Facebook Login for Business** (or Facebook Login) → Settings:
   - Valid OAuth Redirect URIs: `<SUPABASE_URL>/functions/v1/meta-oauth-callback` (exact, https).
   - Enforce HTTPS: on. Strict mode for redirect URIs: on.
3. App Settings → Basic: App Domains `localseohub.io`; Privacy Policy URL `https://localseohub.io/privacidad`; Terms URL `https://localseohub.io/terminos`; User Data Deletion URL `https://localseohub.io/eliminar-datos`; category; app icon.
4. Use cases / permissions: add `pages_show_list` and `instagram_basic`.
5. While in Development mode: add test users / your own account as app Admin/Tester; ensure a test Facebook Page with a linked Instagram **professional** account exists.
6. Provide the three secrets to the project: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` (= the redirect URI from step 2).
7. Test end-to-end from `/fuentes` with a role user.
8. Business Verification, then App Review for Advanced Access to `pages_show_list` and `instagram_basic` (screencast of the `/fuentes` flow + explanation).
9. Switch the app to **Live** mode after approval.

## 17. Secrets (names only)

Required, currently **not set**: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`.
Reused (existing): `SITE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
No values were invented, hardcoded or committed.

## 18. Files changed

New:
- `supabase/migrations/20261021191223_a351_meta_connection_foundation.sql`
- `supabase/functions/meta-oauth-start/{handler.ts,index.ts}`
- `supabase/functions/meta-oauth-callback/{handler.ts,index.ts}`
- `supabase/functions/meta-connection/{handler.ts,index.ts}`
- `src/features/meta-connection/metaStatus.ts`
- `src/features/meta-connection/metaRepository.ts`
- `src/features/meta-connection/MetaConnectionCard.tsx`
- `src/features/meta-connection/MetaPageSelectModal.tsx`
- `src/features/meta-connection/MetaCallbackPage.tsx`
- `src/features/meta-connection/__tests__/a351MetaConnection.test.ts`
- `auditoria-a2/A3_5_1_META_CONNECTION_FOUNDATION.md`

Modified:
- `supabase/config.toml` (3 new function entries)
- `src/App.tsx` (lazy import + `/oauth/meta/callback` route)
- `src/features/reality-engine/SourceManager.tsx` (import + render `MetaConnectionCard`; GBP logic untouched)
- Freeze tests updated for the new route/migration/App hash: `a281TrustCleanup`, `a271ActionLayer`, `a33DiagnosticAction`, `f03Stage2b`, `a273Roadmap`, `a272TodayIntelligence`.

## 19. Migrations

One: `a351_meta_connection_foundation` (applied via migration tool; file on disk). Total migrations 45 → 46. Additive only; no drops, renames or type changes.

## 20. Tests added

`a351MetaConnection.test.ts` — 100 tests:

- A Isolation from GBP / Pixel / consent; lifecycle constraint
- B Not configured → 503 `META_APP_NOT_CONFIGURED` (each secret)
- C Unauthenticated / no business
- D State unpredictability, hash-only storage, expiry, minimal scopes, no secret leak
- E Missing/malformed state
- F Unknown / reused / stale / expired state; DB single-use & user binding
- G Denial, missing code, non-GET
- H Token exchange failures; no secret/code in logs; config missing after state
- I Page discovery taxonomy
- J Success: Vault storage, fragment-only completion, Bearer + appsecret_proof, no token in URLs/logs, Pixel guard
- K Completion binding: malformed, wrong user, wrong binding, expired, hashes only, multi vs single Page
- L Server-validated selection; no write policies/grants
- M All 5 Instagram outcomes + reauth + rate limit
- N Disconnect: revoked / failed-but-local / skipped / own-only idempotent
- O Stale CONNECTING recovery, token expiry, UI never stuck
- P GBP regression: 20 files byte-frozen + GBP card flow + config
- Q Pixel / consent / legal regression: 12 files byte-frozen
- R RLS & grants, function EXECUTE restrictions, browser column whitelist, exact copy, taxonomy messages, no fake metrics, callback param sanitising, route placement

Plus the live rollback-only cross-user DB simulation in §5.

## 21. Full test result

`npm test`: **55 files, 1952 tests passed, 0 failed.**

## 22. Build result

`npm run build`: **PASS**. TypeScript error count unchanged from the pre-existing baseline (20).

## 23. GBP regression

All GBP edge functions (`gbp-oauth-start`, `gbp-oauth-callback`, `gbp-disconnect`, `gbp-sync`, `gbp-recover-attempt`, `gbp-list-locations`, `gbp-reviews` — handler and index), `GBPCallbackPage`, `gbpStatus`, `engine`, `SourceCard`, `registry`, `sourceStatus` are byte-identical to their pre-sprint hashes. GBP config entries unchanged. GBP edge functions were not redeployed. All existing GBP tests pass. **PASS.**

## 24. Pixel / consent regression

`pixel.ts`, `consent.ts`, `clarity.ts`, `applyConsent.ts`, `ConsentProvider.tsx`, `ConsentBanner.tsx`, `MetaPixelTracker.tsx`, `main.tsx`, `index.html`, Privacy/Terms/Data-Deletion pages byte-identical. Meta connection code imports nothing from Pixel or consent; advertising consent is not a prerequisite. **PASS.**

## 25. External blockers

1. Meta App not created / secrets `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` not configured.
2. Redirect URI must be registered in the Meta App.
3. Advanced Access App Review for `pages_show_list` and `instagram_basic` (plus Business Verification) required before non-role users can connect.
4. No real end-to-end run against Meta is possible until 1–2 are done.

## 26. Technical debts

1. `/me/accounts` limited to the first 100 Pages (no cursor paging).
2. No scheduled job refreshes long-lived tokens (~60 days); expiry is detected on load and moves to `reauth_required`.
3. Pages owned only through a Business Portfolio may need `business_management`; verify with real accounts.
4. `INSTAGRAM_NOT_PROFESSIONAL_OR_UNSUPPORTED` relies on Graph error code 100; personal IG accounts are generally invisible to the API and appear as `NO_INSTAGRAM_ACCOUNT_ASSOCIATED`.
5. Graph version pinned to v25.0 in three files (edge functions cannot share code); bump together.
6. Deployed edge functions were not exercised live against Meta (no credentials); behaviour verified by unit tests and DB simulation.
7. No webhook for Meta-initiated deauthorization yet (user removing the app in Facebook settings is detected only on next API failure).

## 27. Next manual action for Manuel

Create the Meta Business App, register `<SUPABASE_URL>/functions/v1/meta-oauth-callback` as the Valid OAuth Redirect URI, add `pages_show_list` + `instagram_basic`, then provide `META_APP_ID`, `META_APP_SECRET` and `META_REDIRECT_URI` to the project and test "Conecta Facebook e Instagram" on `/fuentes` with an app-role account that manages a Page linked to an Instagram professional account.

## 28. Verdict

**CONDITIONAL GO** — foundation complete, secure, isolated and tested; activation blocked only on external Meta Developer configuration. No Meta connection has been faked. No social intelligence or publishing was implemented.
