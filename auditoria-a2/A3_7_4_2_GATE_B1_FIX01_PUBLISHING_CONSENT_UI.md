# A3.7.4.2 — GATE B.1 FIX 01 — Publishing Consent UI Entry Point

## 1. Root cause

The B.1 audit (`A3_7_4_2_GATE_B1_PERMISSION_READINESS.md`) found that the publishing-consent backend works end to end:

`enable_publishing_start` → Meta OAuth → callback publishing branch → `enable_publishing_complete`

The problem was on the client side. `startPublishingAccess()` had no call site, so no user-facing control could start the flow.

## 2. Exact scope

What this fix adds:

- An additive "Activar publicaciones" / "Enable publishing" control.
- It appears only in the **connected** view of the existing Facebook/Instagram card.
- It also shows the result of the existing callback return (`location.state.metaPublishing`), which the callback already sends and which nothing displayed before.

What this fix does not touch:

- server code;
- the callback;
- the repository;
- the publish state machine, idempotency or UNKNOWN handling;
- the image or Page-token architecture;
- the arming gate.

## 3. Files changed

| File | Change |
|---|---|
| `src/features/meta-connection/MetaConnectionCard.tsx` | Modified. One import, one sanitized read of `location.state.metaPublishing`, and one mount of the control inside the connected view. |
| `src/features/publishing-access/model.ts` | New. Pure visibility decision plus a single-flight activation controller. |
| `src/features/publishing-access/copy.ts` | New. ES/EN copy and normalized error messages. |
| `src/features/publishing-access/PublishingAccessControl.tsx` | New. The UI control. |
| `src/features/publishing-access/__tests__/a3742B1Fix01PublishingAccessUi.test.ts` | New. 19 tests. |

The new code lives in a sibling folder on purpose. A frozen A3.5.1 test forbids the word "consent" in any file under `src/features/meta-connection/`, and placing the code alongside keeps that guard intact.

## 4. Existing flow reused

- `startPublishingAccess()` is reused unchanged (sha `132b1fa4…`). It:
  - invokes `enable_publishing_start`;
  - validates the `https://www.facebook.com/` URL and the 64-hex binding;
  - stores the binding in sessionStorage.
- `loadPublishingCapabilities()` is reused unchanged.
- No second OAuth implementation was added.

## 5. UI behavior

| Situation | Shown |
|---|---|
| Card not in the connected view (disconnected, connecting, page selection, error, reauth) | Nothing. The control is not mounted. |
| Connected, capabilities loading | "Comprobando el permiso de publicación…" |
| Connected, capability load failed | "No pudimos comprobar el permiso de publicación." plus Retry. It never claims publishing is enabled. |
| Connected, `facebook_publish_ready === false` | The explanation "Autoriza a LocalSEOHub para publicar en tu página de Facebook. No se publicará nada al activar este permiso." plus the secondary button "Activar publicaciones". |
| Connected, `facebook_publish_ready === true` | A confirmation line. No activation button. |

- Connect, Reconnect, Choose Page, Cancel, Retry and Disconnect are all unchanged.
- The label uses capability language only. "Publicar", "Publish now", "Post" and "Create post" are not used.

## 6. Capability source

- Readiness comes only from the server's `capabilities` action, through `loadPublishingCapabilities()`.
- After the return from Meta, the "enabled" success message appears only when the server also reports `facebook_publish_ready === true`.
- If Meta completed but CREATE_CONTENT or the permission is still missing, the control says so truthfully.

## 7. OAuth navigation

- `window.location.assign(url)` uses only the URL returned by `startPublishingAccess()`.
- React does not build any OAuth URL and does not add scopes or `pages_manage_posts`. Scopes stay server-authoritative in `PUBLISHING_SCOPES`.

## 8. Cancellation/failure behavior

- Clicking disables the button and shows "Abriendo Meta…".
- Further clicks while the request is in flight are ignored: single-flight, proven by test.
- On failure:
  - there is no navigation;
  - the button is restored;
  - a normalized message appears, with fallback to UNKNOWN for unrecognized codes;
  - a thrown request becomes `INTERNAL_ERROR`.
- A back-button restore (`pageshow` with `persisted`) re-enables the button.
- Meta cancellation or a declined permission returns through the frozen callback publishing branch, which never touches the read connection. The card shows a message saying the Facebook connection is still active.
- The control never calls disconnect or reconnect.

## 9. Security

The new UI never handles, logs or displays:

- an access token or Page token;
- the app secret or `appsecret_proof`;
- an authorization code.

Other properties:

- No use of `console.*` or localStorage.
- The binding behavior is unchanged: `lsh_meta_publishing_binding` lives in sessionStorage only, managed by the existing repository.
- The returned state value is sanitized with `/^[A-Za-z_]{3,40}$/`.
- Messages come from a fixed allowlist, so raw codes are never rendered.

## 10. Real-publish gate proof

- The new UI contains no `META_FACEBOOK_REAL_PUBLISH_*`, no `facebook_publish` action and no `facebook-publish` import (test-proven).
- The arming secrets are still absent.
- `facebookPhoto.ts` 7225bc3d…, `facebookPublish.ts` 48da8e2f…, `handler.ts` b7525645…, `index.ts` 027ee4fe… and the callback handler e59f91db… are all unchanged.
- `publication_publish_attempts` = 0.
- No Facebook post was created. The consent flow was not started.

## 11. Tests

19 new tests, all passing:

- **Visibility:**
  - missing permission shows the action;
  - ready status shows no action;
  - disconnected hides it, and it is mounted only in the connected branch;
  - a load error is never shown as enabled;
  - an "enabled" return counts as success only when the server reports ready;
  - the existing actions are preserved.
- **Action:**
  - one click makes one call and navigates to the returned URL;
  - a double click makes one call;
  - failure means no navigation and a safe code;
  - a thrown request is normalized;
  - error messages are safe;
  - a back-navigation restore re-enables the button.
- **Flow:**
  - the control uses only the existing repository functions;
  - `startPublishingAccess` sends `{ action: 'enable_publishing_start' }` and stores the binding in sessionStorage only;
  - a non-Meta URL is rejected and never navigated to.
- **Security:**
  - no tokens, secrets, proofs or codes;
  - the copy is capability-only and promises that nothing is posted;
  - no disconnect or reconnect;
  - no contact with the arming gate.

No test contacts Meta.

Full suite: **2854/2854** (82 files) = 2835 existing + 19 new.

## 12. TypeScript

20 errors, all inherited; 0 new (none in the changed files).

## 13. Build

`npm run build`: PASS.

## 14. Deployment

- Frontend only, with no Edge Function changes, so meta-publishing was **not** redeployed.
- The frontend ships through the normal app publish path.
- Meta configuration is unchanged.

## 15. Re-pins

Gate-A manifest history is left as is. This is the B.1 FIX01 record.

**Modified file**

- File: `src/features/meta-connection/MetaConnectionCard.tsx`
- Old SHA-256: `d38f3b4473221f2caeb889b541fce1bf362c813212a76910c55517fedb02060c`
- New SHA-256: `8e3d9265e6f1cdb4f19861562de92b9cd71c957354a8578003bbc51a1515b7cc`
- Reason: mount the publishing-consent entry point in the connected view.
- Behavioral impact: additive only. A new section appears in the connected state, and all existing actions and the polling/pageshow logic are unchanged.
- Regression proof: the a351 and a3512 card assertions pass; the full suite is 2854/2854.

**New files**

No previous pin exists for these.

| File | New SHA-256 | Reason | Behavioral impact | Regression proof |
|---|---|---|---|---|
| `src/features/publishing-access/model.ts` | `9a208058c363b88b707c964ae5e9ff09f9098338deb21de80ba2adf5753c1d39` | Visibility and single-flight logic | New | FIX01 tests |
| `src/features/publishing-access/copy.ts` | `a692420d0e89f09798ddca65ceae7c318637cec30221bb4179da7c9b0954972c` | ES/EN copy | New | FIX01 tests |
| `src/features/publishing-access/PublishingAccessControl.tsx` | `a383269fed1986ad2ba1ab4a53b7e1d20a20d0f21b8e8e5a695a76d7798eadf0` | Control | New | FIX01 tests |
| `src/features/publishing-access/__tests__/a3742B1Fix01PublishingAccessUi.test.ts` | `3bad6927ce30ff3997af3e7ea4a62dbb5458286aa21035447ec15c5bad12e662` | Tests | Test-only | Passes |

**Unchanged and verified**

- `metaPublishingRepository.ts` 132b1fa4…
- `MetaCallbackPage.tsx` 10ad1772…
- all meta-publishing server files and the callback handler

## 16. Remaining Meta action

Manuel's steps:

1. **Check the app role.** Meta only grants `pages_manage_posts` without App Review to people with a role on the app.
   - Go to Meta for Developers → LocalSEOHub app → App roles → Roles.
   - His account must be Administrator, Developer or Tester.
2. **Grant the permission.**
   - In LocalSEOHub, go to Sources → Facebook and Instagram card → **Activar publicaciones**.
   - In Meta's dialog, choose Continue / Allow.
   - Keep only **Localseohub.io** selected and leave post management allowed.
3. **Do not change:**
   - Dashboard use cases, permissions or App Review;
   - the Page or the Business;
   - any tokens.
4. **Return.** Meta redirects automatically to Sources, where the card shows the result.

After that, re-run B.1 verification:

- `pages_manage_posts`;
- CREATE_CONTENT;
- PAGE_TOKEN_READY;
- preflight READY.

`pages_manage_posts`, CREATE_CONTENT and `publishing_consent_at` were **not** fabricated. They remain missing / NULL until Manuel acts.

## 17. Final verdict

**GO — A3.7.4.2 GATE B.1 FIX01 READY; PUBLISHING CONSENT UI AVAILABLE; MANUEL ACTION REQUIRED**

STOP. The OAuth flow was not started on Manuel's behalf. Publishing is not armed, nothing was posted, and neither B.2 nor A3.7.4.3 has started.
