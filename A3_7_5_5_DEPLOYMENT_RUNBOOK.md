# A3.7.5.5 — A3.7.5.3 Controlled Deployment Runbook

Status: NOT EXECUTABLE until blocker B1 (missing A3.7.5.3 source) is corrected.

## Scope

Frontend only. A3.7.5.3 changes no migration, Edge Function, secret or Meta App setting.

## Preconditions (all required)

1. The A3.7.5.3 source is restored and these SHA-256 values match, or newly approved values are recorded:
   - MetaConnectionCard.tsx 3729892653ebfdba30f89d70c2e5f37790f2a340c4c99479939bee75c7a9b064
   - metaStatus.ts 50845c8d1b85d2bed1a65d34e8ddbf8b9d98aa3620ef7b8f280adb08e9b31c73
   - MetaPageSelectModal.tsx e4e5b66a372e97c84c8c246e8c6c3aba4aa9dd64ec45098cf02b27891de61dc1
   - MetaCallbackPage.tsx 5bfc455450d14345fd7fc2e1a1181b43fc572559e1d11516ad3a9b310b26dbf1
   - a3753CommercialConnection.test.tsx da754befec158efc121eb9b74b83a1f0f123274c950c1914a1fbf178fdd2c04a
2. Frozen engines hash = 58956f462595b404acaa0d9cb1790a6b4cb680780b33a77d83505b9272467606.
3. The full suite passes (expected 92 files, 3118 tests). The build passes. TypeScript shows only the 20 baseline errors.
4. Production read-only checks:
   - no META_FACEBOOK_* or META_INSTAGRAM_* secrets;
   - 0 active entitlements;
   - attempt count 2;
   - latest migration 20261101230430;
   - all Meta functions ACTIVE.
5. Secrets present: META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, SITE_URL, ADMIN_EMAIL.
6. OAuth: META_REDIRECT_URI equals the meta-oauth-callback URL and is listed in the Meta App's Valid OAuth Redirect URIs. The callback returns to SITE_URL (default https://localseohub.io).
7. Written owner approval for the deployment window.

## Deployment order

1. Record the current production version in Version History as the rollback point.
2. Do not apply migrations. Do not deploy functions. None are required.
3. Publish the frontend through Bolt Publish (one action).
4. Run the smoke tests below immediately.

## Post-deployment smoke tests (no publishing)

| # | Test | Expected |
|---|---|---|
| T1 | Customer opens /fuentes | Meta card shows the permission explanation and FB/IG status chips |
| T2 | Customer does NOT see the publishing-consent control | Absent for non-operator |
| T3 | ADMIN_EMAIL account opens /fuentes | Publishing access control visible |
| T4 | Connect → Meta OAuth → return | Page selection modal opens. Focus is on the first Page. Escape closes it |
| T5 | Select a Page | Status connected. Linked IG shown, or "unavailable" chip |
| T6 | /herramientas/social | Loads FB/IG read data |
| T7 | Customer opens /internal/publications-validation | Blocked by InternalGuard |
| T8 | DB re-check | Attempts still 2. 0 active entitlements. No arming secrets |

## Rollback

Trigger: any T1–T8 failure, or any unexpected publish attempt.

1. Restore the recorded previous version from Version History and publish it again (frontend only).
2. No database or function rollback is needed, since none were changed.
3. Re-run T6–T8.
