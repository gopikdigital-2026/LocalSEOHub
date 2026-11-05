# A3.7.5.3 — Controlled Deployment Preparation (NOT EXECUTED)

Date: 2026-11-05
Verdict: **GO — DEPLOYMENT READY, AWAITING EXPLICIT AUTHORIZATION**

Nothing was deployed or published. No database, secret, permission or source file was changed. The only actions taken were read-only checks, local builds (one in a scratch directory outside the project), and this report.

## 1. Pre-deploy checks

| Check | Result |
|---|---|
| MetaConnectionCard.tsx | 3729892653ebfdba30f89d70c2e5f37790f2a340c4c99479939bee75c7a9b064 MATCH |
| metaStatus.ts | 50845c8d1b85d2bed1a65d34e8ddbf8b9d98aa3620ef7b8f280adb08e9b31c73 MATCH |
| MetaPageSelectModal.tsx | e4e5b66a372e97c84c8c246e8c6c3aba4aa9dd64ec45098cf02b27891de61dc1 MATCH |
| MetaCallbackPage.tsx | 5bfc455450d14345fd7fc2e1a1181b43fc572559e1d11516ad3a9b310b26dbf1 MATCH |
| tests/a3753CommercialConnection.test.tsx | da754befec158efc121eb9b74b83a1f0f123274c950c1914a1fbf178fdd2c04a MATCH |
| Full test suite | 92 files, 3118/3118 passed (baseline 3118) |
| Production build | Pass |
| TypeScript | 20 errors, all pre-existing; no new errors. LandingPage 10, BusinessAuditLanding 2, ContentGeneratorLanding 2, MetaAdsLanding 2, App 1, DiagnosticLanding 1, AdminDashboard 1, a3422GbpRecovery.test 1 |
| Frozen engines `sha256(cat meta-publishing/*.ts instagram-publishing/*.ts)` | 58956f462595b404acaa0d9cb1790a6b4cb680780b33a77d83505b9272467606 UNCHANGED |
| Unrelated code | `src/` and `supabase/` are byte-identical to the FIX02 archive. Against the pre-restore archive (`localseohub-a3755-predeploy-verification.zip`), the only differences are the 4 restored files plus the new test file |
| Migrations | No new migration. 62 local files; 61 applied rows; latest applied 20261101230430 equals the latest local file. The count gap is a legacy June 2026 naming mismatch (local 20260623191653 and 20260623191709 versus applied 20260623191647). It is unrelated to this change |
| Arming secrets META_FACEBOOK_* / META_INSTAGRAM_* | Absent |
| Required secrets | META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, SITE_URL, ADMIN_EMAIL present |
| Test entitlements | 1 total, 0 active (revoked_at is null and expires_at > now()) |
| Publish attempts | 2, latest 2026-11-01 21:07:27Z (no new attempts) |
| Tenant isolation | `meta_connections` RLS on; unique indexes `meta_connections_page_assignment_key` and `meta_connections_instagram_assignment_key` present |
| Edge Functions | All ACTIVE, including meta-connection, meta-oauth-start, meta-oauth-callback, meta-read, meta-publishing, instagram-publishing and internal-access. None need redeploying |
| Recovery archive | `deliverables/localseohub-a3755-fix02-restoration.zip` SHA-256 69303fefd2b66515165b39db8c8813a9d0a23ca304438a6656a97963815fd510 MATCH; integrity OK |

## 2. Deployment target and currently deployed version

- **Target:** https://localseohub.io, served by Netlify (response header `server: Netlify`) and published through Bolt Publish. The scope is the frontend only.
- **Currently live:** the HTML entry is `/assets/index-v8c2PSZK.js` and the CSS is `/assets/index-BKT9WQA8.css`.
- **Identification method:** the pre-restore source (A3.7.5.2 FIX01, from `localseohub-a3755-predeploy-verification.zip`) was rebuilt and compared with the live files.
  - CSS: byte-identical (SHA-256 0d4d0358a1db22f22a7f5bc3591bb9ca5d170eb256baf35dfa060d46cf7a3f1d).
  - `MetaCallbackPage` chunk (2999 B) and `SourceManager` chunk (/fuentes, Meta card, 45834 B): identical to the previous build after normalising chunk-hash filenames. Both differ from the A3.7.5.3 build (2972 B and 47864 B).
  - Main entry: the same Supabase project URL. It differs only in minifier identifiers and chunk-hash filenames, which change with any rebuild.
- **Conclusion:** production currently runs A3.7.5.2 FIX01. A3.7.5.3 is not live.
- **Difference from the approved source:** exactly the 4 A3.7.5.3 frontend files. The test file is not shipped.
- **Limitation:** there is no access to a Netlify deploy ID or deploy history, so the live version is identified by its content, not by a deploy record.

## 3. Exact deployment steps (owner executes only after written authorization)

1. Re-confirm the section 1 hashes, the suite (3118) and the build. Run the read-only production checks: no arming secrets, 0 active entitlements, attempts = 2, latest migration 20261101230430.
2. Note the current Version History entry, which contains the A3.7.5.3 restoration, and keep `deliverables/localseohub-a3755-predeploy-verification.zip` as the rollback source.
3. Apply no migrations, deploy no Edge Functions, and change no secrets or Meta App settings.
4. Click **Publish** in Bolt once.
5. Confirm the deploy: https://localseohub.io/ must reference a new `index-*.js` and `index-BIKRC2W1.css`. The CSS name is content-hashed and expected from the A3.7.5.3 build. If it is still `index-BKT9WQA8.css`, the deploy did not take effect.
6. Run the smoke tests in section 5 immediately.

## 4. Rollback plan

**Previous version:** A3.7.5.2 FIX01 frontend. Live CSS `index-BKT9WQA8.css`, entry `index-v8c2PSZK.js`. Source hashes:

- MetaConnectionCard.tsx 8e3d9265e6f1cdb4f19861562de92b9cd71c957354a8578003bbc51a1515b7cc
- metaStatus.ts c2615204659166500345771fbf90f001b9097a047e925af141b89c91f4f51ad6
- MetaPageSelectModal.tsx e615d053ad73ad1e89dd5db7b08340894993906676419a40b7cbed30f5dbc39d
- MetaCallbackPage.tsx 10ad1772397214a03e8e0486d9c1f2a949259b75c8eaae6b930fd473faa14520

**Verified recovery mechanism:**

- `deliverables/localseohub-a3755-predeploy-verification.zip` (SHA-256 fd1138a79a14dd648b99e0195e68ffcad0df55540149f1e96e15837398eee845, 772 files) holds those 4 files with the hashes above.
- Rebuilding that source on 2026-11-05 reproduced the live CSS byte-for-byte and the live Meta chunks.
- Republishing uses the same Bolt Publish action as the deployment.
- The earlier temporary backup outside the project no longer exists and is not relied on.

**Not verified, so not claimed:**

- Netlify instant rollback to a prior deploy. This needs Netlify account access that was not available.
- The content of specific Bolt Version History entries, which can't be seen from here.

**Procedure if deployment fails:**

1. Restore the 4 files to the previous hashes, using either:
   - (a) Bolt Version History, restoring the entry from before the A3.7.5.5 FIX02 restoration; or
   - (b) copying the 4 files from the predeploy archive.
2. Remove `src/features/meta-connection/tests/a3753CommercialConnection.test.tsx`, which belongs to A3.7.5.3. Or keep it and accept that its tests will fail.
3. Verify the 4 hashes, run the suite and the build, then click Publish.

**Verify the rollback:**

- https://localseohub.io/ serves `index-BKT9WQA8.css`.
- The live `MetaCallbackPage` chunk is 2999 bytes.
- /fuentes shows the pre-A3.7.5.3 Meta card.

**Customer data and connections:**

- Deployment and rollback are frontend only. No migration, function, secret, RLS policy or table is touched.
- `meta_connections`, tokens, Page selections and entitlements stay in the database unchanged.
- Never delete or reset connections as part of a rollback.

## 5. Post-deploy smoke tests (no publishing)

| # | Check | Expected |
|---|---|---|
| S1 | Log in and navigate between authenticated pages | Session holds; no blank pages; logout works |
| S2 | Switch business (account with 2+ businesses) | Only the selected business's sources and Meta status are shown; no cross-business data |
| S3 | Tenant isolation: second customer account | Cannot see the first account's Meta connection, Page or Instagram account |
| S4 | Open /fuentes | Loads without errors; Meta card shows the A3.7.5.3 permission explanation and the Facebook/Instagram status |
| S5 | Status accuracy | A connected account shows the correct Page and Instagram state; a disconnected one shows a connect option |
| S6 | Open /oauth/meta/callback directly, with no parameters | Shows a safe error or return state; no crash; nothing written |
| S7 | Connection flow on the owner's test account only | Facebook consent opens; return reaches the callback; Page selection lists Pages; selection saves. Read and connect only; no posting |
| S8 | Operator publishing visibility | Regular customers see no operator publishing controls; the operator sees them only as entitled (currently 0 active, so they are blocked) |
| S9 | Mobile (about 375 px) and desktop (1280 px or wider) | Meta card, Page selection and callback screens render without overflow; buttons are usable |
| S10 | No real publishing | After the tests: `publication_publish_attempts` still 2 (latest 2026-11-01 21:07:27Z); 0 active entitlements; no META_FACEBOOK_* / META_INSTAGRAM_* secrets; no new posts on the connected Page or Instagram account |

**Abort criteria:** any S1–S10 failure, a new publish attempt, or any cross-tenant visibility triggers an immediate rollback (section 4).
