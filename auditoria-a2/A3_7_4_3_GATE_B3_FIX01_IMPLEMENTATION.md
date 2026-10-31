# A3.7.4.3 — Instagram Gate B.3 — Correction 01 — Implementation

Scope: an owner-authenticated, **read-only** live Meta connection preflight. It fixes the B.3 Part 1 blocker, which was that no secure owner-authenticated read-only live check existed. Real Instagram publishing remains disabled and unarmed.

## 1. What was added

### Server action `instagram_connection_preflight`
This action lives in the existing `instagram-publishing` Edge Function, which has `verify_jwt = true`.

- **New module** `supabase/functions/instagram-publishing/connectionPreflight.ts`
  - Exports `PREFLIGHT_ACTION`, `PREFLIGHT_TIMEOUT_MS = 8000`, `PREFLIGHT_PERMISSIONS`, `isConnectionPreflightRequest(req)` and `createConnectionPreflightHandler(deps)`.
  - Dependencies are injected and **read-only**: `getUserId`, `internalTestActive`, `connection`, `readToken`, `env`, plus optional `fetch` and `now`.
- **Routing** in `index.ts`:
  ```
  Deno.serve(async (req) => {
    if (await isConnectionPreflightRequest(req.clone())) return connectionPreflight(req);
    return handle(req);
  });
  ```
  - Only a POST whose body `action === "instagram_connection_preflight"` reaches the new handler.
  - Every other request (publish, status, verify) goes to the **unchanged, frozen** publish handler.
  - `getUserId(jwt)` was extracted so both handlers share it. The publish handler's dependencies are otherwise identical.

### Handler order (fail-closed)
1. **JWT.** Missing or invalid returns `401 AUTH_REQUIRED`.
2. **Body.** Must be strict JSON with keys limited to `{action, publicationId}` and a UUID publication ID. Otherwise `400 INVALID_REQUEST`.
3. **Internal test entitlement.** Checked via RPC `internal_test_entitlement_active` (service role). Missing returns `403 INTERNAL_TEST_REQUIRED`. This happens before any ownership, token or Graph access.
4. **Server-side ownership.**
   - Look up `publications(id, user_id)`, then `businesses(id, user_id)`, then `meta_connections` filtered by user, business, `status='connected'` and `instagram_status='connected'`.
   - Not owned returns `404 PUBLICATION_NOT_FOUND`. No connection or non-numeric stored IDs returns `409 CHANNEL_NOT_CONNECTED`.
5. **App credentials.** `META_APP_ID` and `META_APP_SECRET` are required, else a generic `500 INTERNAL_ERROR`. **No arming secret is read**: the test proves only these two env names are accessed.
6. **Token.** Read from the Vault via RPC `meta_read_token` (service role), in memory only. If missing, the token check fails with `TOKEN_UNAVAILABLE` and no Graph call is made.
7. **Graph reads.** All are GET with a Bearer header, an `appsecret_proof` and an 8 s abort timeout:
   - In parallel: `debug_token?input_token=…` (app token), `me/permissions` and `{page}?fields=id,access_token,instagram_business_account`.
   - Then, with the in-memory Page token: `{ig}?fields=id,username` and `{ig}/content_publishing_limit?fields=config,quota_usage`.
8. **Report.** Sanitized JSON with `Cache-Control: no-store`. Any unexpected exception returns a generic `500 INTERNAL_ERROR` with a redacted log.

### Checks, statuses and reason codes
Each check is `pass`, `fail`, `inconclusive` or `skipped`.

| Check | Fail reasons | Inconclusive reasons |
|---|---|---|
| token | TOKEN_UNAVAILABLE, TOKEN_INVALID, TOKEN_EXPIRED, TOKEN_APP_MISMATCH | TOKEN_DEBUG_UNAVAILABLE, TOKEN_EXPIRY_UNKNOWN, META_TIMEOUT |
| permissions | PERMISSIONS_MISSING | PERMISSIONS_UNREADABLE, META_TIMEOUT |
| page | PAGE_MISMATCH, PAGE_ACCESS_MISSING, INSTAGRAM_NOT_LINKED, INSTAGRAM_ACCOUNT_MISMATCH, PAGE_NOT_ACCESSIBLE | META_TIMEOUT, META_UNAVAILABLE |
| instagram_account | INSTAGRAM_ACCOUNT_MISMATCH, INSTAGRAM_USERNAME_CHANGED, INSTAGRAM_NOT_ACCESSIBLE | INSTAGRAM_USERNAME_UNREADABLE, META_TIMEOUT |
| publishing_limit | PUBLISHING_LIMIT_REACHED, PUBLISHING_LIMIT_DENIED | PUBLISHING_LIMIT_UNREADABLE, META_TIMEOUT |
| professional_eligibility | PUBLISHING_NOT_ELIGIBLE, INSTAGRAM_NOT_LINKED | ELIGIBILITY_INCONCLUSIVE |

- **Overall:** `FAIL` if any check fails; `PASS` only if every check passes; otherwise `INCONCLUSIVE`.
- **Professional subtype:** these endpoints do not expose the Business vs Creator subtype. The response always carries `professional.subtype = "not_exposed"` and the reason `SUBTYPE_NOT_EXPOSED`.
- **Eligibility:** inferred only from the verified link plus a readable `content_publishing_limit`.

### Response fields
`ok, action, overall, checked_at, token_valid (true|false|"unknown"), token_expiry{status,expires_at,data_access_expires_at}, permissions{…:true|false|null}, missing_permissions, page_id, instagram_account_id, instagram_username, professional{eligibility,subtype,basis}, publishing_limit{status,quota_usage,quota_total,quota_duration_seconds}, checks, reasons, persisted:false, publishing_enabled:false`.

### Browser
- `src/features/instagram-publish/connectionCheck.ts`
  - `checkMetaConnection(publicationId)` invokes `instagram-publishing` with only `{action, publicationId}`.
  - It strictly re-sanitizes the reply: numeric IDs, username regex, `^[A-Z_]{1,48}$` codes and enum statuses.
  - It lives in a new file so `repository.ts` keeps exactly its two pinned exports (T34).
- `src/features/instagram-publish/MetaConnectionCheck.tsx`
  - One button, **"Comprobar conexión con Meta"** / "Check Meta connection".
  - One request per click, no retry, no timers, no storage. The result is cleared when the publication changes.
  - Shows a clear "incomplete" banner for INCONCLUSIVE, plus the fields, permissions (with a ? for unreadable), the per-check list with reason codes, and a note that the result is not stored and does not change the publish button.
- `copy.ts`: added `CHECK`, `EXPIRY_TEXT`, `CHECK_TEXT` and `STATUS_TEXT` (es/en).
- `InstagramPublishHarness.tsx`: one import and one `<MetaConnectionCheck publicationId={pub.id} />` mount inside the existing internal validation panel. The publish-enable expression `s.armed && s.triggerEnabled && s.canPublish && s.state === 'NOT_REQUESTED' && s.version === version` is unchanged.

## 2. Changed files

| File | Change | sha256 |
|---|---|---|
| supabase/functions/instagram-publishing/connectionPreflight.ts | new (308 lines) | b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db |
| supabase/functions/instagram-publishing/index.ts | routing + shared getUserId + preflight deps | f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28 (was b782a99f…) |
| src/features/instagram-publish/connectionCheck.ts | new (80 lines) | d45f107e041088e5ab5242be9d2a03584ed4544b7a3ef5f54332cb5fedf7e3a0 |
| src/features/instagram-publish/MetaConnectionCheck.tsx | new (123 lines) | 67cc7b293a7b2a3cbb35206e7d598141699a55a28ef9b6463c6c04aac2e8a52b |
| src/features/instagram-publish/copy.ts | strings appended | c5660c551f7a8facf5371399974b2a55072f71eca508119a41cd40ea957b0f9e (was fe8ce97b…) |
| src/features/instagram-publish/InstagramPublishHarness.tsx | import + 1 mount | 746e94b366d55e755fa5fa0b8e86696931a951bfc4ae8524773b2a0aaa84a42e (was b7ea8c5c…) |
| src/features/publications/__tests__/a3743GateB3Fix01ConnectionPreflight.test.ts | new, 27 tests (441 lines) | bfc651657f457752ca00ca0b98c0ed90d8edb13961514e24124c705c93c03855 |
| supabase/functions-deploy-state.json | updated by the deploy tool (instagram-publishing hash only) | 87f8bfce541362ee24dbb8280732a24dfcc627b75f91465c2e62cf5f7efeeade (was 33fd37ab…) |

These files are unchanged, with byte-identical hashes:
- instagramPublish.ts, shared.ts, graph.ts, derivative.ts and repository.ts
- App.tsx and PublicationsValidationPage.tsx
- config.toml
- all four meta-publishing (Facebook) files

See the MANIFEST report.

## 3. Verification

| Suite | Result |
|---|---|
| New FIX01 preflight tests | **27 / 27** |
| IG Gate A | 39 / 39 |
| IG B.2 Part 1 | 24 / 24 |
| Facebook regression (A3.7.4.1 + A3.7.4.2) | 123 / 123 |
| Full Vitest | **2964 / 2964** (87 files) = baseline 2937 + 27 new |
| tsc (`tsconfig.app.json`) | 20 errors = 20 inherited, **0 new** |
| `npm run build` | success |

Notes:
- **Intermittent failure.** During one early full run, a single test failed intermittently. It could not be reproduced in five further full runs (all 2964/2964), and the run's output did not identify it. The most timing-sensitive new test, the Meta timeout test with fake timers interleaved with async crypto, was hardened so its loop allows enough iterations. This is recorded as a limitation.
- **Build fix.** The first build failed because the icon name `CircleHelp` does not exist in this project's lucide-react version. It was replaced with `HelpCircle`. Two test-typing issues were fixed at the same time. No product logic changed.

## 4. Deployment
- Deployed **only** `instagram-publishing`; the tool reported "Deployed 1 Edge Function(s): instagram-publishing". Before deploying, a check confirmed that the only function files changed since the pre-change snapshot were `instagram-publishing/index.ts` and `instagram-publishing/connectionPreflight.ts`.
- Function status: ACTIVE, `verifyJWT: true` (id a3008491-be86-40c3-ae41-0a93ee773be4).
- Deploy state hash for instagram-publishing changed from be803eca… to 7daa1d63…. No function has `hasChanged: true`.
- Post-deploy unauthenticated probes, which never used the owner's session:
  - Preflight POST with no Authorization header: **401** `UNAUTHORIZED_NO_AUTH_HEADER` (gateway).
  - Status POST with no Authorization header: **401** (gateway).
  - Preflight POST with only the public anon key (not a user JWT): **401** `{"ok":false,"action":"instagram_connection_preflight","code":"AUTH_REQUIRED"}`. This proves the deployed code path is live and rejects non-user callers before any lookup.
- Edge function secrets: **no** `META_INSTAGRAM_REAL_PUBLISH_ARMED`, `META_INSTAGRAM_REAL_PUBLISH_USER_IDS` or `META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS`. Real publishing therefore stays disabled.
- **The live check was NOT executed.** No owner session was used, impersonated or forged.

## 5. Limitations
- The Instagram professional **subtype** (Business vs Creator) is not exposed by these endpoints. It is reported as `not_exposed`, and eligibility is inferred.
- `debug_token` uses the app access token (`APP_ID|APP_SECRET`) in the Authorization header only, never in the URL. The user token is necessarily passed as `input_token` in the query string of that single call to `graph.facebook.com`. It is never logged, because only stage, HTTP status and numeric code are logged.
- The live result depends on Meta at the moment of the owner's click. Meta timeouts or 5xx responses produce INCONCLUSIVE, never PASS.
- Tests are mocked. Real Graph response shapes are covered by the documented fields only and will be confirmed by the owner's run.
- There was one unreproduced intermittent failure in a single full run (see §3).
