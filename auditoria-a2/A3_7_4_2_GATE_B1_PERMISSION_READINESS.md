# A3.7.4.2 — GATE B.1 — Facebook Permission Activation & Real-E2E Readiness

## 1. Executive verdict

**NO-GO — A3.7.4.2 GATE B.1 IMPLEMENTATION/SECURITY REQUIRES CORRECTION**

Summary:
- The server-side consent flow exists and is correct: `enable_publishing_start`, then the callback consent branch, then `enable_publishing_complete`.
- **No screen in the app can start it.** `startPublishingAccess()` in `src/features/meta-connection/metaPublishingRepository.ts` has zero call sites outside its own module. `MetaConnectionCard.tsx` only offers connect/reconnect/choose/cancel/disconnect. The hidden harness at `/internal/publications-validation` has no consent control either.
- So Manuel has nothing to click, and the real `pages_manage_posts` grant cannot be obtained through the existing flow.
- Once that entry point exists, the remaining blocker is a Meta-side interactive consent, covered in sections 23 and 26.
- No Meta call was made. No token was read. Nothing was published or armed. Nothing was deployed. No code changed.

## 2. Gate-A baseline

| Check | Result |
|---|---|
| All 25 Gate-A fingerprints (`A3_7_4_2_GATE_A_MANIFEST.md`, including the re-pins) | OK, unchanged |
| Frozen `handler.ts` b7525645…, migrations, `config.toml`, oauth-callback / meta-connection / meta-read handlers | OK |
| Tests | 2835/2835 (81 files) |
| tsc | 20 errors, 0 new |

## 3. Meta app/account role

- The role cannot be determined programmatically. It needs an app access token and a roles call, and neither was performed.
- A3.7.4.0 records Manuel as app admin. Standard Access is enough for role users on assets they manage.
- **To verify manually:** Meta for Developers → the LocalSEOHub app → App roles → Roles. Manuel's Facebook account must be listed as Administrator, Developer or Tester.

## 4. Permissions before

`granted_permissions` = `pages_show_list, business_management, instagram_basic, pages_read_engagement, public_profile`.

`pages_manage_posts` is **absent**, and so is `instagram_content_publish`.

## 5. Page tasks before

- `page_tasks` = NULL.
- `publishing_consent_at` = NULL.
- `permissions_checked_at` = NULL.

## 6. Consent flow used

- The flow exists in code but was **not run**, because there is no UI entry point.
- Server scopes, from `PUBLISHING_SCOPES`: `pages_show_list, pages_read_engagement, business_management, instagram_basic, pages_manage_posts, instagram_content_publish`.
- Note: the consent dialog will also ask for `instagram_content_publish`. Granting it is harmless, because Instagram publishing is not built and not armed. Declining it does not block Facebook.
- The callback re-reads the real data from Meta: `/me/permissions` and `/me/accounts?fields=id,name,tasks`, both with `appsecret_proof`. `page_tasks` therefore comes from Meta, not from the client.
- `meta_publishing_consent_states` = 0 rows, meaning no consent has ever been started.

## 7. OAuth result

Not executed.

## 8. Permissions granted

Unchanged; see section 4.

## 9. Page relationship

- The connection is `connected`, Page `Localseohub.io` 1393994523793266, `meta_user_id` present.
- The Page identity was verified read-only from the DB and was not overwritten.

## 10. CREATE_CONTENT

Not verified, because `page_tasks` is NULL.

## 11. Page-token readiness

- Not evaluated. Without `pages_manage_posts`, the publish preflight stops at `PERMISSION_REQUIRED` before any Page-token derivation.
- Status: **not PAGE_TOKEN_READY** (normalized: `PERMISSION_REQUIRED`).

## 12. appsecret_proof readiness

- `META_APP_SECRET` is present in the live secrets.
- The proof is computed server-side on every Graph call (callback, `facebookPhoto.appSecretProof`).
- Status: **APPSECRET_PROOF_READY** (configuration level; no live call made).

## 13. Real preflight

- Expected result: `PERMISSION_REQUIRED`.
- The REQUIRED set `pages_show_list, pages_read_engagement, pages_manage_posts` plus CREATE_CONTENT is not met.
- This is proven by the A3.7.4.1 R1 evidence and the Gate-A tests.
- Not READY.

## 14. Arming state

- `META_FACEBOOK_REAL_PUBLISH_ARMED`: absent.
- `META_FACEBOOK_REAL_PUBLISH_USER_IDS`: absent.
- **Disarmed.**

## 15. Zero-publish evidence

- `publication_publish_attempts` = 0 rows.
- While unarmed, `facebook_publish` returns 403 `REAL_PUBLISH_DISABLED` before preflight, begin or any Meta call (Gate-A test 34, passing).
- No POST to `/photos`, `/feed`, `/media` or `/media_publish` was made in B.1.

## 16. DB before/after

| Field | Before | After |
|---|---|---|
| attempts | 0 | 0 |
| consent_states | 0 | 0 |
| granted_permissions | see section 4 | unchanged |
| page_tasks | NULL | NULL |
| publishing_consent_at | NULL | NULL |
| publications | 12 | 12 |

All reads were read-only.

## 17. Preserved A/B

| Publication | Status | Updated at | Draft md5 | Draft updated |
|---|---|---|---|---|
| A 65569535-5d89-4df3-a8d4-c2af6df8606d | proposals_ready | 2026-10-27 23:05:19 | 5b7366bfcaa8e008b1ba5b38138bf8dd | 2026-10-28 09:15:04 |
| B 442059e5-11e4-4bdd-a5bc-c714b0a03b72 | proposals_ready | 2026-10-28 12:27:05 | fd3e4f7a51725b58fced11e3ef4975ac | 2026-10-28 12:30:28 |

Both are unchanged and untouched.

## 18. Regression

2835/2835 passed.

## 19. TypeScript

20 errors (baseline), 0 new.

## 20. Build

No source changes; the only file written is this report.

## 21. Deployment

None. No code changed, so nothing was redeployed.

## 22. Security review

- No tokens, secrets or codes were requested from or shown to Manuel.
- The consent flow is server-controlled. Its protections:
  - hashed state with a 10-minute TTL;
  - session binding stored in sessionStorage;
  - completion token in the URL fragment;
  - Page-change and downgrade triggers.
- The proposed correction (section 26) is a UI trigger only. It calls the existing action and changes no server logic.

## 23. Requirements for Manuel/app-role testing

Once the entry point exists:

1. **Why:** Meta only grants `pages_manage_posts` without App Review to people who hold a role on the app.
   - **Screen:** Meta for Developers → LocalSEOHub app → App roles → Roles.
   - **Check:** Manuel's account is Administrator, Developer or Tester.
2. **What is missing:** the `pages_manage_posts` grant and the CREATE_CONTENT task.
   - **Action:** in LocalSEOHub → Sources → Facebook card → "Enable publishing" (to be added).
   - In Meta's dialog, click Continue / Allow.
   - Keep **only Localseohub.io** selected and leave "manage posts" allowed.
3. **Do NOT change:**
   - Dashboard use cases, permissions or App Review;
   - the selected Page or the Business;
   - any tokens.
4. **Return:** Meta redirects automatically to LocalSEOHub's callback page, which then lands on Sources with a confirmation. Nothing needs copying.

## 24. Requirements for external customers

- Advanced Access for `pages_manage_posts` (and later `instagram_content_publish`) through App Review plus Business Verification.
- Out of scope for B.1.

## 25. B.2 candidate

- **None designated.** A and B are excluded by instruction.
- The other 10 publications have 0 drafts, so none is a valid candidate.
- Manuel must name or create one in B.2 through the normal flow.

## 26. Remaining blockers

1. **Implementation (blocks NO-GO → re-run):** a minimal "Enable publishing" control in the Facebook connection card. It calls the existing `startPublishingAccess()` and redirects to the returned Meta URL. It is shown only when the connection is `connected` and the capabilities lack `pages_manage_posts`. It needs tests, a build, and no server change.
2. **Meta (after 1):** the app-role check and the interactive consent (section 23).
3. **B.2:** a valid candidate publication.

## 27. Recommendation

1. Authorize the correction in item 26.1 as a scoped B.1 fix.
2. Then Manuel completes section 23.
3. Re-run B.1 to verify `pages_manage_posts`, CREATE_CONTENT, PAGE_TOKEN_READY and preflight READY.

Do not arm. Do not post. Do not proceed to B.2.
