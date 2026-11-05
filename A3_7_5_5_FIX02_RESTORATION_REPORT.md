# A3.7.5.5 FIX02 — Exact A3.7.5.3 Source Restoration

**Verdict: GO — EXACT A3.7.5.3 SOURCE RESTORED; DEPLOYMENT PENDING**

Date: 2026-11-05. Mode: controlled source recovery. No deploy, no database change, no secret change, no Meta publishing.

## 1. Provenance

The owner attached the five files to the project:

- Four were uploaded as `<name> copy.<ext>` next to their targets in `src/features/meta-connection/`.
- The test was uploaded directly to `src/features/meta-connection/tests/`, the path the owner specified.

All five were hashed and matched the approved values **before** anything was modified. Each " copy" file was then moved byte-for-byte onto its target path, which removed the upload duplicates.

## 2. Hashes (SHA-256)

| File | Approved | Pre-install (upload) | Post-install | Result |
|---|---|---|---|---|
| MetaConnectionCard.tsx | 3729892653ebfdba30f89d70c2e5f37790f2a340c4c99479939bee75c7a9b064 | match | match | PASS |
| metaStatus.ts | 50845c8d1b85d2bed1a65d34e8ddbf8b9d98aa3620ef7b8f280adb08e9b31c73 | match | match | PASS |
| MetaPageSelectModal.tsx | e4e5b66a372e97c84c8c246e8c6c3aba4aa9dd64ec45098cf02b27891de61dc1 | match | match | PASS |
| MetaCallbackPage.tsx | 5bfc455450d14345fd7fc2e1a1181b43fc572559e1d11516ad3a9b310b26dbf1 | match | match | PASS |
| tests/a3753CommercialConnection.test.tsx | da754befec158efc121eb9b74b83a1f0f123274c950c1914a1fbf178fdd2c04a | match | match | PASS |

## 3. Backup of the replaced files (A3.7.5.2 FIX01)

Stored outside the project at `/tmp/a3755-fix02-backup/`:

| File | SHA-256 |
|---|---|
| MetaConnectionCard.tsx | 8e3d9265e6f1cdb4f19861562de92b9cd71c957354a8578003bbc51a1515b7cc |
| metaStatus.ts | c2615204659166500345771fbf90f001b9097a047e925af141b89c91f4f51ad6 |
| MetaPageSelectModal.tsx | e615d053ad73ad1e89dd5db7b08340894993906676419a40b7cbed30f5dbc39d |
| MetaCallbackPage.tsx | 10ad1772397214a03e8e0486d9c1f2a949259b75c8eaae6b930fd473faa14520 |

Bolt Version History remains the authoritative rollback.

## 4. No unrelated changes

- Every file under `src/` and `supabase/`, excluding `src/features/meta-connection/`, was hashed before and after the restore: 520 files, byte-identical.
- Inside `meta-connection/`, only the five target paths changed, and the four upload duplicates are gone.
- Frozen publishing engines: `sha256(cat meta-publishing/*.ts instagram-publishing/*.ts)` = 58956f462595b404acaa0d9cb1790a6b4cb680780b33a77d83505b9272467606 (unchanged).

## 5. Verification

| Check | Result |
|---|---|
| Recovered A3.7.5.3 tests | 20/20 pass |
| Full suite | 92 files, 3118/3118 pass (matches the runbook precondition) |
| Production build | pass |
| TypeScript | 20 pre-existing errors, 0 new (see below) |

TypeScript errors, all pre-existing and outside scope:

| File | Errors |
|---|---|
| LandingPage | 10 |
| BusinessAuditLanding | 2 |
| ContentGeneratorLanding | 2 |
| MetaAdsLanding | 2 |
| App | 1 |
| DiagnosticLanding | 1 |
| AdminDashboard | 1 |
| a3422GbpRecovery.test | 1 |

## 6. Publishing remains disabled (read-only checks)

- No `META_FACEBOOK_*` or `META_INSTAGRAM_*` arming secrets exist.
- `internal_test_entitlements`: 1 row, 0 active.
- `publication_publish_attempts`: 2, latest 2026-11-01 21:07:27Z. No new attempts.

## 7. Remaining items

- The test now lives in `tests/` rather than `__tests__/`, as the owner specified. Vitest discovers it and its relative paths resolve.
- Deployment is still pending. Follow `A3_7_5_5_DEPLOYMENT_RUNBOOK.md` after independent review; its precondition hashes and test counts are now met.
