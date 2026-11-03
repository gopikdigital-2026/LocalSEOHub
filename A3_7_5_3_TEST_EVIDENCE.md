# A3.7.5.3 — Test Evidence

## Totals
- Full suite: 92 files, 3118 tests, 3118 passed, 0 failed (baseline A3.7.5.2 FIX01: 91 / 3098).
- New file `src/features/meta-connection/__tests__/a3753CommercialConnection.test.tsx`: 20 tests (jsdom).
- Typecheck: 20 errors; sorted, position-stripped list identical to the A3.7.5.2 FIX01 baseline (empty diff).
- Build: passes.

## Required scenario coverage

| Scenario | Test(s) |
|---|---|
| Successful OAuth | a351 "returns a Meta dialog URL and a browser binding", "exactly one Page is auto-selected" |
| Invalid / expired state | a351 E, F (unknown, reused, wrong-user, expired); a3512 "an expired state ends the attempt…" |
| Unauthorized callback / completion | a351 "rejects wrong user and wrong binding with 403"; "accepts only a well-formed completion" |
| Multiple Pages | a351 "several Pages require explicit selection"; a3753 "multiple Pages require choosing one" |
| No eligible Pages | a351 "NO_AUTHORIZED_PAGES…"; a3753 "no eligible Pages yields a clear error" |
| FB without IG | a351 NO_INSTAGRAM_ACCOUNT_ASSOCIATED; a3753 "a Facebook Page without Instagram is still connected" |
| Eligible IG | a351 INSTAGRAM_CONNECTED; a3753 "shows Facebook and Instagram status separately" |
| Cross-tenant | a3752 tenant isolation tests (no foreign data in 409s) |
| Duplicate Page / IG | a3752 META_PAGE_ALREADY_ASSIGNED / META_INSTAGRAM_ALREADY_ASSIGNED |
| Legitimate reconnection | a3752 same-owner reconnection; a3753 reauth state shows Reconnect |
| Disconnection | a351 "still disconnects locally when revocation fails"; a3753 confirm declined / confirmed |
| Token expiration | a351 "an invalid token moves the connection to reauth_required", "recover marks an expired token…" |
| ES/EN errors & copy | a3753 key parity, no internal terminology, callback label; a3752 error message checks |
| Mobile / customer navigation | a3753 wrapping row + aria-busy, dialog focus + Escape, card on `/fuentes` outside InternalGuard |
| No access to internal publishing routes | a3753 no `/internal/` links; publishing step hidden for customers, shown for operators; a3752 InternalGuard route tests |

## Integrity
- Changed vs baseline: 4 frontend files + 1 new test. No `supabase/` changes.
- Frozen engines combined SHA-256 `58956f462595b404acaa0d9cb1790a6b4cb680780b33a77d83505b9272467606`, identical to baseline.

## Source hashes (SHA-256)
- MetaConnectionCard.tsx `3729892653ebfdba30f89d70c2e5f37790f2a340c4c99479939bee75c7a9b064`
- metaStatus.ts `50845c8d1b85d2bed1a65d34e8ddbf8b9d98aa3620ef7b8f280adb08e9b31c73`
- MetaPageSelectModal.tsx `e4e5b66a372e97c84c8c246e8c6c3aba4aa9dd64ec45098cf02b27891de61dc1`
- MetaCallbackPage.tsx `5bfc455450d14345fd7fc2e1a1181b43fc572559e1d11516ad3a9b310b26dbf1`
- a3753CommercialConnection.test.tsx `da754befec158efc121eb9b74b83a1f0f123274c950c1914a1fbf178fdd2c04a`

UI verified through jsdom render tests; no live browser session was available.
