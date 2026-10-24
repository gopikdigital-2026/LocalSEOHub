# A3.5.5.0 — Meta Social V1: Production Readiness Audit

Mode: read-only. This report is the only file created. No production code, test, schema, function, route or configuration was changed.

## 1. Executive summary
The Meta Social V1 technical chain is sound and production-grade:
- server-owned, single-use, expiring OAuth state with browser binding;
- server-side token exchange with appsecret_proof;
- Vault-only token storage;
- column-restricted, owner-only RLS;
- server-validated Page and Instagram identity;
- bounded, SSRF-safe reads;
- truthful stale and reauth handling all the way to Hoy and Plan.

Two **internal launch blockers** exist. Both are public legal content, not the frozen technical chain:
- the Privacy Policy does not disclose the Facebook Page / Instagram connection or the data read;
- the Data Deletion page does not cover Meta-derived data or disconnection.

Separately, **Meta external blockers** remain or are NOT VERIFIED: app mode, Advanced Access / App Review for the requested permissions, and Business Verification. The Gopik.Digital success does not prove that an arbitrary customer can connect.

**Verdict: NO-GO — META SOCIAL V1 HAS INTERNAL PRODUCTION BLOCKERS.** The blockers are limited to legal content and are listed in §47.

## 2. Audit timestamp
2026-10-24 (UTC).

## 3. Frozen baseline
I took sha256 of 56 files before the audit (`/tmp/a3550/pre.txt`):
- all `supabase/functions/meta-*`;
- `src/features/meta-connection/*`;
- all of `src/features/social-intelligence/**`, including the tests;
- `src/app-v2/routes/*` (TodayPage, PlanPage);
- `src/App.tsx`;
- `src/features/legal/*`;
- SourceManager;
- the 4 A3.5.x migrations.

Re-verified at the end: identical (§54). Key values:

| File | sha256 |
|---|---|
| meta-oauth-start/handler.ts | e21d60a580ae1ff7e8775efb721f5b6bacf436946a12177f6a70ad6f8aadc49f |
| meta-oauth-callback/handler.ts | 89ff215b8e92e8afa4bd46ad889468edb161fbf34567cfc11540baee5be4073f |
| meta-connection/handler.ts | 57e8341fbb5172329b5aa71ff9bf70b77256ac86184d24e58bab24c261097ada |
| meta-read/handler.ts | 987cc94b1490ac79204280669e8d1f9834822bbd095f618ea6e3d912653e6166 |
| meta-read/index.ts | f88672e62c5ac185198c16e52c2f1b5bd4f7991cfbf9cbce0f9e34086a86be22 |
| a351 migration | cb6b3c65c70ae611c62dbdd3926c4d2a3e2c7e865675e5f9c60280fc35762cb7 |
| a3512 migration | 1e085acea8f33a0843c79d5ae1777de64528ba3f2160c8f054b1917f1ebccf42 |
| a353 read layer migration | a0a38bcd0d7719e573f5445deca7754e00e51d0e9a6d5cbc8e4d066a59c91bde |
| a353 claim interval migration | 6e349f1f123fec79df813f63c6abbdf823ba6fb02a6c83a1ce306f488266c398 |
| metaRepository.ts | b1c1f6107ec00103ab6ee7c3e4fa1fe910b0ac18c4c15fb68e41939c9ebc746e |
| metaSyncStatus.ts | 39d0d2775c006cf419c408f49eafeea16dcfc38d90854cd1e472886b9a4fe034 |
| integration/projection.ts | d427394451b8aa3b68794d5b6f488d4b7f0eb63292384ff08985df95097b60c4 |
| TodayPage.tsx | 78cdf392ae270d805046632ecb5e0b4872134d8a6ff5f24bd91b0f0a9e8129da |
| PlanPage.tsx | 109a1a58060ac4b2ef412b62ce3699e751452e904f88d3b4285bdab1e0da8dc0 |
| App.tsx | 36074bedfe7a79ecb92e47ec795abd1b9d263f3a37a1f8422146206f86f49078 |

The remaining A3.5.4.x hashes are as recorded in the A3.5.4.4.2 report §40, unchanged.

## 4. Meta app inventory
| Item | Evidence | Status |
|---|---|---|
| Meta App (App ID) | `META_APP_ID` secret present (value not read) | CODE VERIFIED (presence) |
| App secret | `META_APP_SECRET` present | CODE VERIFIED (presence) |
| Facebook Login dialog | `https://www.facebook.com/v25.0/dialog/oauth`, response_type=code, auth_type=rerequest | CODE VERIFIED |
| Redirect URI | `META_REDIRECT_URI` secret (server-only); callback = `meta-oauth-callback` edge function | CODE VERIFIED (presence) / dashboard match NOT VERIFIED |
| Requested scopes | pages_show_list, pages_read_engagement, business_management, instagram_basic | CODE VERIFIED |
| Granted (Gopik) | the 4 above + public_profile | DB VERIFIED |
| Business portfolio | Code comment: portfolio Pages need all page permissions | Dashboard NOT VERIFIED |
| App mode (Development/Live) | no evidence in project | NOT VERIFIED |
| Business Verification | no evidence | NOT VERIFIED |
| App Review / access level | no evidence | NOT VERIFIED |

How to check manually: Meta App Dashboard → App settings → Basic (mode, URLs, icon, category) → App Review → Permissions and Features (access level per permission) → Business Verification in Business Manager → Security Center.

## 5. Current permissions
| Permission | Why / where | V1 needs it? | External users |
|---|---|---|---|
| pages_show_list | `/me/accounts` page discovery (callback); hard-required, otherwise META_PERMISSION_UNAVAILABLE | Yes | Advanced Access + App Review likely required |
| pages_read_engagement | Page token `/{page}?fields=access_token`, Page posts and profile (meta-read) | Yes | Advanced Access + App Review likely required |
| business_management | Business-portfolio Pages are hidden from `/me/accounts` without it (callback L212, PAGE_PERMISSIONS) | Yes for portfolio-owned Pages | Advanced Access + review; commonly tied to Business Verification (MANUAL CHECK) |
| instagram_basic | `/{page}?fields=instagram_business_account`, IG profile and media (meta-connection, meta-read) | Yes | Advanced Access + App Review likely required |
| public_profile | Default identity, `/me?fields=id` | Yes | Default |

Exact current Meta review requirements must be confirmed in the dashboard; they are not asserted here as verified.

## 6. Minimum-permission assessment
The set is minimal for CONNECT / SYNC / READ / ANALYZE.
- No publish, manage, messaging, comments-management, insights or ads permission is requested.
- `business_management` is the only debatable scope. It is justified by the documented portfolio-Page visibility failure (A3.5.2.1), so it is not flagged for removal.
- Note: the meta-read profile fields include `fan_count` / `followers_count`, which are readable under the current scopes. No extra scope was added.

## 7. External-user OAuth journey
| Step | Implementation | Failure states / user-visible | Meta approval needed |
|---|---|---|---|
| /fuentes → Connect | MetaConnectionCard → metaRepository.startMetaConnection | META_APP_NOT_CONFIGURED 503, NO_BUSINESS, ALREADY_CONNECTED 409 | — |
| OAuth start | meta-oauth-start: JWT → own business → `meta_begin_attempt` (state + binding hashes, 10 min TTL) → returns URL + binding (binding kept in sessionStorage) | UNKNOWN_ERROR | — |
| Meta dialog | facebook.com v25.0 dialog | A non-role user in Development mode cannot authorize; permissions without Advanced Access are not grantable | **YES** |
| Callback | meta-oauth-callback: state regex → `meta_consume_oauth_state` → code exchange → long-lived token → /me → /me/permissions → /me/accounts → `meta_store_authorization` (Vault) → 302 to `/oauth/meta/callback#token=<completion>` | OAUTH_STATE_INVALID/EXPIRED, OAUTH_DENIED, TOKEN_EXCHANGE_FAILED, META_PERMISSION_UNAVAILABLE, NO_AUTHORIZED_PAGES, PAGE_DISCOVERY_FAILED, META_API_RATE_LIMIT, REAUTH_REQUIRED | — |
| Completion | MetaCallbackPage → meta-connection `complete` (completion + binding; same user) | SESSION_MISMATCH, OAUTH_STATE_EXPIRED | — |
| Page selection | auto when exactly 1 Page; otherwise MetaPageSelectModal → `select_page` (must be in available_pages) | PAGE_NOT_AUTHORIZED 403, PAGE_SELECTION_NOT_PENDING 409 | — |
| Instagram linkage | Page `instagram_business_account` → `/{ig}?fields=id,username` | not_associated / unsupported / permission_unavailable / api_error (Facebook still connects) | instagram_basic access |
| Credential storage | `meta_vault_put` → `user_token_ref = vault:<uuid>` | — | — |
| Status | `meta_connections.status = connected` | — | — |
| First sync | user-triggered via MetaSyncStatus → meta-read `sync` | SYNC_COOLDOWN 429, REAUTH_REQUIRED, etc. | — |
| Social Intelligence | `/herramientas/social` reads stored data only | NEVER_SYNCED / stale states | — |

## 8. OAuth state security
READY.
- **Server-owned state:** 32-byte random state; only SHA-256 hashes are stored, in `meta_oauth_states`, which has no browser grants or policies.
- **Single use:** `consumed_at` is set under FOR UPDATE, and a reused state returns `consumed`.
- **Expiry and stale recovery:** state TTL is 10 min and the completion TTL is 10 min. Stale attempts are recovered by `meta_expire_stale_attempt` (11 min with grace) and by `meta_cancel_attempt`. Previous states are deleted on each `begin_attempt`.
- **Callback binding:** the callback requires the connection status `connecting` and the same user.
- **Completion:** requires the same user plus the browser binding hash (protects against login-CSRF / account-linking attacks).
- **No browser trust:** no browser-controlled value is trusted beyond hash lookups.

## 9. Redirect URI
READY, with a manual check.
- The redirect URI comes only from the server secret `META_REDIRECT_URI`, which is identical in the authorize request and the token exchange.
- The post-callback redirect target is the fixed `${SITE_URL}/oauth/meta/callback`. SITE_URL is set, and the fallback is `https://localseohub.io`, never localhost.
- There is no user-controlled redirect or return parameter, so no open redirect.
- MANUAL CHECK: the dashboard "Valid OAuth Redirect URIs" must exactly equal the `META_REDIRECT_URI` value.

## 10. Token exchange
READY.
- Code → short-lived token → long-lived token (`fb_exchange_token`), entirely in the edge function. The client_secret is used only server-side.
- Every Graph call after the exchange sends `appsecret_proof` (HMAC-SHA256).
- Non-OK or malformed JSON results in TOKEN_EXCHANGE_FAILED.
- Logs carry stage, code, subcode, type and fbtrace_id only.

## 11. Token storage
READY.
- The token lives only in Supabase Vault. `user_token_ref` holds `vault:<uuid>`, and authenticated users have no column grant on it (DB check: 0 grants).
- There is no plaintext token column.
- A CHECK constraint plus the `meta_connections_wipe_inactive` trigger forget the Vault secret on any inactive status. `meta_credential_invariant_violations()` = 0.
- The browser stores only the random binding nonce in sessionStorage; no token is held in local or session storage.
- API payloads never return a token: the completion is a one-time random hash-checked value delivered in the URL fragment.

## 12. Page token handling
READY.
- The Page access token is derived per sync (`/{page}?fields=access_token`), used in memory in meta-read, and never persisted.

## 13. Token lifecycle
GAP (non-blocking, by design).
- Stored: a long-lived **user** token, about 60 days. `token_expires_at` is stored (Gopik: 2026-12-21).
- **No automatic renewal exists.** Long-lived user tokens cannot be silently refreshed server-side without user interaction, so this is consistent with Meta's model.
- **Proactive expiry detection exists:**
  - meta-read `sync` checks `token_expires_at <= now` and marks `reauth_required`;
  - meta-connection `recover` (called on card mount) does the same.
- **Revocation, password change or permission removal:** Graph returns 190/102, which maps to `reauth_required`. Codes 10/200–299 map to `permission_unavailable`.
- There is no warning before expiry, which means users find out only after the token has expired. This is RECOMMENDED post-V1.

## 14. Expiration UX
READY.
- `reauth_required` wipes the Vault token and keeps the Page identity.
- The Social engine emits RECONNECT_META, and Hoy shows "Vuelve a conectar Meta" (validated in A3.5.4.4.2).
- Old findings are not presented as current.
- The connection card offers a reconnect path.

## 15. Reconnect
READY, with a data effect.
- `begin_attempt` is allowed from `reauth_required` and blocked only on `connected`.
- The attempt sets `connecting`, so the purge trigger deletes the old content and sync state, and the wipe trigger clears the old identity. The user then re-selects the Page.
- Same row (UNIQUE user_id + business_id), so no duplicates and no cross-business overwrite.
- The old Vault secret is forgotten when the ref changes.
- No mixing of old and new account data is possible. The trade-off: stored content is re-read on the next sync.

## 16. Disconnect
READY.
- Best-effort `DELETE /me/permissions` (Meta-side revocation), then `meta_disconnect` → status `disconnected`.
- Effects: Vault secret deleted, identity fields and permissions cleared, `meta_content_items` and `meta_sync_state` deleted (purge trigger), `revocation_status` recorded.
- Remaining: one `meta_connections` row with status `disconnected`, user_id, business_id, timestamps and revocation_status. Social Intelligence then shows the not-connected state.

## 17. Data deletion
**GAP — INTERNAL BLOCKER.**
- A. Disconnect deletes Meta-derived content and tokens: implemented (§16).
- B. Deleting Meta-derived data: achieved by disconnect, but **not documented to the user**.
- C. Account or business deletion: manual email process. DB cascades (auth.users / businesses ON DELETE CASCADE) remove every meta_* row, and the trigger forgets the Vault secret.
- D. Meta requires either a Data Deletion Callback URL or a Data Deletion Instructions URL. No callback function exists. `/eliminar-datos` could serve as the instructions URL, but it mentions only Google Business Profile and the Meta Pixel. It does not tell users how to remove Facebook/Instagram data (disconnect in /fuentes, or remove the app in Facebook settings), and it does not promise that Meta-derived data will be deleted.

## 18. Privacy
**GAP — INTERNAL BLOCKER.**
`/privacidad` mentions Meta only for the Meta Pixel. It omits:
- the Facebook Page / Instagram professional account connection;
- the data categories read (Page and account profile fields, own posts and media text, dates, permalinks, reaction and comment counts);
- the purpose (analysis and recommendations);
- authorization handling (encrypted authorization, never shared);
- retention (kept while connected; deleted on disconnect or account deletion);
- the relationship with Meta as a third-party platform.

Meta App Review requires a policy that accurately describes the use of Platform Data.

## 19. Terms
GAP (minor; recommended to fix in the same content pass). `/terminos` contains no reference to connected third-party platforms (Meta). There is no material contradiction, but a short clause about third-party connections is advisable.

## 20. Data retention
| Table | Stored | Lifecycle | Owner isolation |
|---|---|---|---|
| meta_connections | status, Page/IG id, name, username, permissions, Vault ref, expiry, safe error codes | updated by service-role RPCs; inactive states wipe credentials | SELECT own row, restricted columns |
| meta_oauth_states | hashes, pending pages | deleted on completion, failure, begin or cancel (Gopik: 0 rows) | no browser access |
| meta_sync_state | per-platform status, counts, whitelisted profile, timestamps | upserted per sync; deleted on disconnect, reconnect or Page change | SELECT own |
| meta_content_items | up to 100 recent own items per platform | replaced each successful sync (items not returned are deleted); deleted on disconnect, reconnect or Page/IG change | SELECT own |

- Obsolete content does not accumulate. While a connection stays `reauth_required` and is never reconnected or disconnected, its last snapshot remains indefinitely.
- RECOMMENDED post-V1: a retention sweep for long-lived `reauth_required` / `error` rows.

## 21. Tenant isolation
READY.
- RLS is enabled on all 4 tables, with owner-only SELECT policies (`auth.uid() = user_id`).
- No browser INSERT, UPDATE or DELETE. Anon grants = 0.
- Edge functions resolve the connection from the verified JWT plus `businesses.user_id`.
- The RPCs re-check `user_id`, status and account-id equality (`meta_sync_apply`).
- I performed no unauthorized access.

## 22. Page selection
READY.
- `pageId` must match `^\d{1,40}$` and must be present in the server-held `available_pages`. These come only from the callback's `/me/accounts`.
- `meta_finish_page_selection` re-checks membership in SQL.
- Changing the Page purges the old content (trigger).

## 23. Instagram linkage
READY.
- The IG id comes only from the selected Page's `instagram_business_account` field. There is no client input.
- A missing or unsupported account is stored truthfully (`not_associated` / `unsupported` / `permission_unavailable` / `api_error`), and no fake connected state is created.

## 24. First sync
READY, with a minor quirk.
- First sync is user-triggered: `syncMetaContent` is called only from MetaSyncStatus and the explicit refresh on the Social page.
- Before the first sync, `meta_sync_state` has no rows, so the Social page shows NEVER_SYNCED.
- Quirk: `meta_finish_page_selection` sets `meta_connections.last_synced_at = now()` although no read happened. Social Intelligence uses `meta_sync_state.last_success_at`, so this is cosmetic. OPTIONAL fix.

## 25. Manual refresh
READY.
- 60 s cooldown, covering both in-flight and finished attempts (row-locked `meta_sync_claim`), which prevents concurrent duplicates.
- 10 s fetch timeout with AbortController.
- Error mapping: rate limit → `rate_limited`, 190/102 → reauth, permission → `permission_unavailable`.
- A failed sync keeps `last_success_at` and the old data, and the status shows the failure.

## 26. Pagination/caps
READY.
- PAGE_LIMIT 25, MAX_PAGES 4, MAX_ITEMS 100.
- `next` URLs are accepted only if they are https on host `graph.facebook.com`, use the same edge path, and have not been seen before (loop guard).
- The SQL side rejects more than 200 items or a profile larger than 8 KB.
- Result: no SSRF and no unbounded crawl.

## 27. Graph API version
READY, with an upgrade-risk note.
- `v25.0` is hard-coded as `META_GRAPH_VERSION` in each of the 4 meta edge-function handlers. It is not centralized, so an upgrade means 4 one-line edits.
- Deprecation timing must be checked manually against Meta's changelog. It is not asserted here.

## 28. Error taxonomy
| Case | Internal | Stored | User / Social |
|---|---|---|---|
| Expired token | expiry check / 190, 102 | connection `reauth_required`, sync `reauth_required` | Reconnect Meta (Hoy + Social) |
| Revoked | 190 | same | same |
| Rate limit | 4/17/32/613 | sync `rate_limited` META_RATE_LIMITED | temporary message; data kept |
| Permission | 10, 200–299 | `permission_unavailable` | Review Meta permissions |
| Malformed | shape check | `malformed` | temporary failure |
| Unsupported IG | 100 on IG | instagram_status `unsupported` | not professional/unsupported copy |
| Not linked | no IG on Page | `not_linked` | Instagram not linked |
| Empty | 0 items | `empty` | NO_CONTENT (contextual) |
| Generic / timeout | other / abort | `api_error` META_API_ERROR / META_TIMEOUT | temporary failure |

## 29. Stale-data safety
READY.
- Failures never advance `last_success_at`.
- The engine emits only CROSS_PLATFORM_DATA_STALE / REFRESH_DATA when data is stale, or RECONNECT_META when reauth is needed.
- Hoy and Plan suppress stale content (A3.5.4.4.2 §16/§19).
- Truthful end-to-end.

## 30. App Review readiness
| Permission | V1 feature | Reviewer steps | Needs |
|---|---|---|---|
| pages_show_list | choose the business's Page in /fuentes | log in → /fuentes → Conectar Facebook e Instagram → authorize → select Page | test FB user with a Page; screencast likely |
| pages_read_engagement | read own Page posts for Social Intelligence | after connect → refresh → /herramientas/social shows findings | same |
| business_management | discover portfolio-owned Pages | connect with a portfolio-owned Page | Business Verification likely (MANUAL CHECK) |
| instagram_basic | read the linked IG professional account and media | Page linked to an IG professional account → refresh → IG section | test IG professional account |

- URLs: privacy `https://localseohub.io/privacidad`, terms `/terminos`, data deletion `/eliminar-datos` (paths verified in App.tsx; production domain per SITE_URL fallback).
- Privacy and deletion content must be fixed first (§47).
- Reviewer credentials and instructions still need to be prepared.
- Nothing was submitted.

## 31. Business Verification
NOT VERIFIED; no evidence in the project. This is likely an external dependency for Advanced Access to `business_management` (confirm in the dashboard). Not to be confused with Google Business verification.

## 32. App mode/test-user status
NOT VERIFIED.

Does the successful Gopik.Digital E2E prove that an arbitrary LocalSEOHub customer can connect today? **No.** The connecting identity is the app owner's. In Development mode, or with Standard Access only, a user with no app role cannot be granted these permissions. Nothing in the project establishes Live mode with Advanced Access.

## 33. Meta dashboard manual checklist
**CODE VERIFIED**
- scopes;
- redirect handling;
- state;
- token storage;
- Graph version;
- callback endpoint;
- URL routes exist.

**META DASHBOARD — MUST BE VERIFIED MANUALLY**
1. App mode (Live).
2. Business Verification complete.
3. Advanced Access for pages_show_list, pages_read_engagement, business_management, instagram_basic.
4. App Review status per permission.
5. Valid OAuth Redirect URIs = META_REDIRECT_URI.
6. App Domains = localseohub.io.
7. Privacy Policy URL.
8. Terms URL.
9. Data Deletion Instructions URL (or callback).
10. App icon, category and contact email.
11. Reviewer test user / test Page / IG professional account plus written instructions and screencast.
12. Facebook Login settings (client OAuth login, web OAuth login, Enforce HTTPS, strict mode).

## 34. Rate-limit/scale readiness
READY for initial launch.
- User-triggered syncs only, with a 60 s per-connection cooldown and row locks.
- Item caps of 100 per platform per connection, so DB growth is bounded and linear.
- Failures are isolated per connection.
- No background fan-out.

## 35. Observability
READY / RECOMMENDED.
- Safe error codes, stage logs with Graph code, subcode and fbtrace_id, `last_attempt_at` / `last_success_at` / `last_error_at`, and `revocation_status`.
- No token, code or proof is logged.
- Permission, rate, reauth and API failures are distinguishable.
- RECOMMENDED post-V1: an admin view or alerting on connection and sync status counts.

## 36. User-facing error UX
READY.
- ES/EN copy in metaStatus.ts and the Social UI distinguishes reconnect, permissions, temporary rate limit, temporary failure, IG not linked / not professional, never synced and stale.
- No misleading copy found.

## 37. Facebook-only case
READY.
- The connection completes with an Instagram status of not_associated; Instagram sync is `not_linked`.
- Facebook analysis proceeds, and no Instagram data is invented.

## 38. Instagram requirements
- Requires an Instagram **professional** account linked to the selected Facebook Page.
- The copy states "cuenta profesional" / "professional account".
- RECOMMENDED: a short pre-connection explanation on /fuentes that a personal Instagram account cannot be analysed. Non-blocking.

## 39. Empty/new account
READY.
- `empty` status leads to NO_CONTENT, which gives only a contextual recommendation (Plan: one conditional CONSIDER_NEW_CONTENT item).
- No metrics and no "poor performance" diagnosis.

## 40. Account switching
READY.
- Switching requires disconnect or reauth first (`begin_attempt` blocks while `connected`).
- `connecting` purges the content and sync state and clears the identity.
- A Page change purges everything; an IG change purges the Instagram data.
- `meta_sync_apply` rejects writes whose account id no longer matches.
- No contamination path found.

## 41. App-secret rotation
READY.
- The secret is read per request via `Deno.env.get`, with no secret-derived stored value (appsecret_proof is computed per call). Rotating it only requires updating the environment secret.
- Existing user tokens remain bound to the app. Confirm in the dashboard whether a reset invalidates sessions; this is a MANUAL CHECK.

## 42. Environment configuration
READY.
- META_APP_ID, META_APP_SECRET, META_REDIRECT_URI and SITE_URL are all present as edge secrets (names only).
- If any are missing, the functions return META_APP_NOT_CONFIGURED (503) or the callback terminates safely.
- None of them is in the client environment.

## 43. Frontend secret audit
READY.
- The production bundle (54 assets) and the frontend source contain no META_APP_SECRET, service-role key, `vault:` reference, appsecret or Meta access-token pattern.
- The App ID appears only in the server-generated authorize URL, and it is public.

## 44. Database secret audit
READY.
- Authenticated users have no grant on `user_token_ref`, and the anon role has 0 grants on the meta tables.
- Vault RPCs are executable by service_role only.
- The invariant check returns 0 violations.
- No token values were printed.

## 45. V1 feature boundary
Confirmed: CONNECT / SYNC / READ / ANALYZE / DETECT / RECOMMEND / PRIORITIZE only. There is no create, publish, schedule, advanced insights, comments, DMs or ads code.

## 46. Production readiness matrix
| Area | Status | Blocker type | Launch impact | Required action |
|---|---|---|---|---|
| OAuth | READY | NONE | — | — |
| OAuth state | READY | NONE | — | — |
| Redirect | READY | MANUAL CHECK | callback fails if dashboard mismatch | verify redirect URI in dashboard |
| Permissions | READY | META EXTERNAL | non-role users cannot grant | Advanced Access / App Review |
| Token exchange | READY | NONE | — | — |
| Token storage | READY | NONE | — | — |
| Token expiry | READY (no auto-renew, by design) | NONE | reconnect about every 60 days | optional pre-expiry notice |
| Reconnect | READY | NONE | — | — |
| Disconnect | READY | NONE | — | — |
| Data deletion | GAP | INTERNAL | App Review / compliance | document Meta data deletion on /eliminar-datos |
| Privacy | GAP | INTERNAL | App Review / compliance | add Meta Social section to /privacidad |
| Terms | GAP (minor) | INTERNAL (recommended) | low | third-party connection clause |
| RLS | READY | NONE | — | — |
| Page selection | READY | NONE | — | — |
| Instagram linkage | READY | NONE | — | — |
| First sync | READY | NONE | — | optional last_synced_at fix |
| Refresh | READY | NONE | — | — |
| Rate limits | READY | NONE | — | — |
| Pagination | READY | NONE | — | — |
| Graph version | READY | MANUAL CHECK | future deprecation | track Meta changelog |
| Error handling | READY | NONE | — | — |
| Stale safety | READY | NONE | — | — |
| App Review | NOT VERIFIED | META EXTERNAL | blocks external users | prepare and submit |
| Business Verification | NOT VERIFIED | META EXTERNAL | likely blocks business_management | complete in Business Manager |
| App mode | NOT VERIFIED | MANUAL CHECK | Dev mode blocks non-role users | switch to Live |
| External users | NOT VERIFIED | META EXTERNAL | cannot be established | after the above |
| Observability | READY | NONE | — | optional admin view |
| Error UX | READY | NONE | — | — |
| Facebook-only | READY | NONE | — | — |
| Account switching | READY | NONE | — | — |
| Environment config | READY | NONE | — | — |
| Frontend secrets | READY | NONE | — | — |

## 47. Internal blockers
1. **Privacy Policy (`/privacidad`)** lacks a Meta Social (Facebook Page / Instagram professional account) section. It needs to cover the data read, the purpose, authorization handling, retention, deletion/disconnection and the Meta relationship.
2. **Data Deletion page (`/eliminar-datos`)** does not explain how to delete Meta-derived data:
   - disconnect in /fuentes, which deletes the content and authorization immediately;
   - removing the app in Facebook settings;
   - the account deletion request.

   It must explicitly include Facebook/Instagram data, so that it can serve as Meta's Data Deletion Instructions URL.

Both are content-only. No change to the frozen technical chain is required.

## 48. Meta external blockers
1. App mode must be Live (NOT VERIFIED).
2. Advanced Access via App Review for pages_show_list, pages_read_engagement, business_management and instagram_basic (NOT VERIFIED).
3. Business Verification of the Meta business portfolio, likely required for business_management (NOT VERIFIED).
4. Dashboard configuration: redirect URI, domains, privacy/terms/deletion URLs, icon, category, contact (NOT VERIFIED).

## 49. Non-blocking improvements
- Pre-expiry reconnect notice (about 60-day token).
- Centralize META_GRAPH_VERSION.
- Retention sweep for long-abandoned `reauth_required` / `error` connections.
- Fix the cosmetic `last_synced_at` set at page selection.
- Pre-connection explanation that an Instagram professional account is required.
- Short third-party clause in Terms (if not done with the blockers).
- Admin observability of sync and connection health.
- Optional automatic first sync after connect.

## 50. External-user readiness answers
1. Can Manuel / Gopik.Digital connect? **Yes**, verified (connected, 5 permissions granted, Vault token, data read).
2. Can another app-role or test user connect? **Likely yes** with the same code, because roles can grant permissions in Development mode. Not verified with a second user.
3. Can an arbitrary external customer connect? **Not established; presumed no.** No evidence of Live mode with Advanced Access.
4. What prevents it: Meta app mode, permission access level / App Review and probably Business Verification. Before submitting, the incomplete Privacy Policy and Data Deletion content must also be fixed.
5. Cause: **Meta platform approval/configuration** for access. **LocalSEOHub-controlled legal content** for review readiness. Not a defect in the technical code.

## 51. Minimum next action
**A3.5.5.1 — META PRODUCTION READINESS FIXES**, limited to:
- (a) a Meta Social section in `/privacidad` (ES, and EN if the page is bilingual);
- (b) Meta data deletion instructions in `/eliminar-datos`;
- (c) optionally, a one-line third-party connection clause in `/terminos`.

No OAuth, schema, function or Social engine change. After that comes a Meta dashboard / App Review preparation phase (§33 checklist).

## 52. Tests/regression
- Full suite: 62 files, **2236 / 2236 passed**, 0 failures.
- `tsc --noEmit -p tsconfig.app.json`: **20** errors (legacy), 0 new.

## 53. Build
`npm run build` PASS, both before the report (used for the bundle secret scan) and as the final action after the report.

## 54. Frozen hash verification
I re-hashed all 56 baseline files after the audit and compared them with `/tmp/a3550/pre.txt`: **no difference**.

## 55. Files inspected
- supabase/functions/meta-oauth-start/{handler,index}.ts
- supabase/functions/meta-oauth-callback/{handler,index}.ts
- supabase/functions/meta-connection/{handler,index}.ts
- supabase/functions/meta-read/handler.ts (constants, fetch, pagination, reauth, sync)
- migrations a351, a3512, a353 read layer, a353 claim interval
- src/features/meta-connection/{metaRepository.ts, MetaSyncStatus.tsx, MetaConnectionCard.tsx, metaStatus.ts}
- src/features/legal/{PrivacyPolicyPage, DataDeletionPage, TermsPage}.tsx
- src/App.tsx (routes)
- dist/assets/*.js (secret scan)

Live checks:
- DB: Gopik connection summary, grants, invariant;
- edge secret names;
- deployed edge function list.

## 56. Confirmation no implementation occurred
Only this report was created. No production code, test, migration, edge function, route, permission, OAuth or Meta configuration was modified, and no sync or OAuth action was triggered.

## 57. Final verdict
NO-GO — META SOCIAL V1 HAS INTERNAL PRODUCTION BLOCKERS

## 58. Exact next phase
A3.5.5.1 — META PRODUCTION READINESS FIXES (legal content only: Privacy Policy Meta Social section plus Meta data deletion instructions; optional Terms clause). Awaiting explicit authorization. A3.5.5.1, A3.5.6 and Tu semana have not been started.
