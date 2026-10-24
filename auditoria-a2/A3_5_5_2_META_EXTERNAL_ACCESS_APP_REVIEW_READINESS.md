# A3.5.5.2 — META SOCIAL V1 — EXTERNAL ACCESS & APP REVIEW READINESS

Date: 2026-10-24 · Mode: external-access readiness + review preparation · No product feature development.

Evidence labels used throughout:

- **PROJECT VERIFIED**: established from frozen source, migrations, tests or deployed secret names.
- **META DOC (2026-10-15)**: Meta "Permissions Reference for Meta Technologies APIs", developers.facebook.com/documentation/development/permissions, page dated Oct 15, 2026, read during this phase.
- **META DOC (deletion)**: Meta "Data Deletion Request Callback" page (FAQ), read during this phase.
- **MANUAL META CHECK REQUIRED**: cannot be established from the project. Manuel must confirm it in the Meta App Dashboard.

Nothing in this report claims that Live mode, Advanced Access, App Review or Business Verification is complete.

---

## 1. Executive summary

LocalSEOHub code for Meta Social V1 is ready for review. The connection, sync, read, analysis and disconnect functions are frozen and unchanged (verified by hash). The legal pages are ready.

The only production edit in this phase is the contact address on the Terms page, which is now admin@localseohub.io, the same as Privacy and Data Deletion.

What prevents an ordinary customer from connecting today is entirely on Meta's side. While the permissions only have Standard Access, Meta only lets people with a role on the app (admin, developer, tester) grant them. Before any other customer can connect, all of the following must happen:

- Business Verification of the Business Portfolio that owns the app;
- App Review approval (Advanced Access) for `pages_show_list`, `pages_read_engagement`, `business_management` and `instagram_basic`;
- the app must be Live with valid settings.

Two review risks are flagged from Meta's current documentation, and neither one is changed in code:

1. **`business_management`**: Meta describes its allowed usage as managing business assets (for example ad accounts). LocalSEOHub uses it only so that Pages owned through a Business Portfolio appear in the Page list. It must be justified as a dependency of `pages_show_list`, and Meta's form explicitly allows that. Rejection risk: moderate.
2. **`instagram_basic`**: Meta lists `pages_read_user_content` and `pages_show_list` as its dependencies. LocalSEOHub does not request `pages_read_user_content`. **MANUAL META CHECK REQUIRED**: if the dashboard requires that dependency when requesting Advanced Access for `instagram_basic`, a later, separately authorized phase must decide on a scope change. This phase does not change scopes.

Verdict: **READY — META APP REVIEW PACKAGE PREPARED; MANUAL META ACTION REQUIRED** (see §44).

## 2. Current LocalSEOHub readiness

| Area | Status | Evidence |
|---|---|---|
| OAuth connect / Page selection / IG linking | READY (frozen) | meta-oauth-start `e21d60a5`, meta-oauth-callback `89ff215b`, meta-connection `57e8341f` |
| Read layer (FB Page, FB posts, IG profile, IG media) | READY (frozen) | meta-read `987cc94b` |
| Social Intelligence (deterministic, client-side, no AI) | READY (frozen) | A3.5.4.x freezes; hashes unchanged |
| Disconnect + wipe + content purge | READY (frozen) | A3.5.5.0 / A3.5.5.1 evidence |
| Privacy `/privacidad` (§3 Facebook e Instagram) | READY | A3.5.5.1 |
| Data deletion `/eliminar-datos` (§4) | READY | A3.5.5.1 |
| Terms `/terminos` + contact consistency | READY | This phase |
| Tests / tsc / build | 2255 pass · 20 legacy tsc errors (0 new) · build PASS | §38–40 |

## 3. Current permission set

PROJECT VERIFIED (`supabase/functions/meta-oauth-start/handler.ts`):

```
META_GRAPH_VERSION = "v25.0"
META_SCOPES = ["pages_show_list", "pages_read_engagement", "business_management", "instagram_basic"]
auth_type = "rerequest"
```

The connection requires `pages_show_list` to be granted, or it stops with `META_PERMISSION_UNAVAILABLE`. If the Page list comes back empty, the callback checks `PAGE_PERMISSIONS = [pages_show_list, pages_read_engagement, business_management]`. If any of these is missing it shows a permission error; otherwise it reports that no authorized Pages were found.

Graph calls actually made (PROJECT VERIFIED):

| Call | Function | Token |
|---|---|---|
| `GET /me?fields=id` | callback | user |
| `GET /me/permissions` | callback | user |
| `GET /me/accounts?fields=id,name&limit=100` | callback | user |
| `GET /{page}?fields=instagram_business_account` and `GET /{ig}?fields=id,username` | meta-connection (Page selection) | user |
| `DELETE /me/permissions` | meta-connection (disconnect, best effort) | user |
| `GET /{page}?fields=access_token` | meta-read | user → Page token |
| `GET /{page}?fields=id,name,about,category,link,website,fan_count,followers_count` | meta-read | Page |
| `GET /{page}/published_posts?fields=id,message,created_time,permalink_url,status_type,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)`; if engagement counts are denied, retried without them | meta-read | Page |
| `GET /{ig}?fields=id,username,name,biography,website,followers_count,follows_count,media_count` | meta-read | user |
| `GET /{ig}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count` | meta-read | user |

Nothing publishes, schedules, reads comments' text, reads messages, touches ads or uses Insights endpoints.

## 4. Minimum-permission assessment

| Permission | Needed for V1? | Reason |
|---|---|---|
| `pages_show_list` | Yes | `/me/accounts`: the user picks their business Page |
| `pages_read_engagement` | Yes | Page token, Page metadata and published posts. Also required for Business Portfolio Pages to appear in `/me/accounts` (A3.5.2 / A3.5.2.1 field evidence) |
| `business_management` | Yes for the current architecture | A3.5.2 diagnostic: `/me/accounts` returned `{"data":[]}` for a Page owned by a Business Portfolio until this permission was granted. Fixed in A3.5.2.1 |
| `instagram_basic` | Yes | IG professional account id/username, profile and media |

Conclusion: the four requested permissions are the **minimum viable V1 set** for the current Business Portfolio discovery architecture. **Requested scope is FROZEN for Meta Social V1.**

Documented caveat, not acted on: Meta's reference lists `pages_read_user_content` as a dependency of `instagram_basic` (§9). This is not an unnecessary permission but a possibly missing dependency. It is MANUAL META CHECK REQUIRED and is not changed here.

## 5. pages_show_list

- **Purpose:** show the customer the list of Facebook Pages they manage so they can choose the one for their business.
- **Feature:** Fuentes → Facebook e Instagram → «Conecta Facebook e Instagram» → after Meta authorization, the modal «Selecciona la página de tu negocio» → «Usar esta página».
- **Why required:** without it `/me/accounts` returns nothing and no Page can be chosen. The callback stops if it is not granted.
- **Access requirement (META DOC 2026-10-15):** no dependencies. Allowed usage: "Show a person the list of Pages they manage. Verify that a person manages a Page." Advanced Access needs App Review, and Business Verification is required for any Advanced Access.
- **Reviewer demonstration:** the Meta login dialog, then the Page selection modal listing the reviewer's Page, then the Page name shown as connected on the Facebook e Instagram card.
- **Test asset:** a Facebook account that manages at least one Page.
- **Status:** CODE READY · Advanced Access MANUAL META CHECK REQUIRED.

## 6. pages_read_engagement

- **What LocalSEOHub reads:**
  - the Page access token;
  - Page profile: name, about, category, link, website, fan_count, followers_count;
  - published posts: text, date, type, permalink, and total reaction and comment counts. The counts are only totals, never the comments themselves, and are null if Meta denies them.
- **Not used:** follower names/PSIDs, Page Insights, comment content, events.
- **Use in Social Intelligence:** a deterministic engine running in the browser computes:
  - posting recency and cadence;
  - content mix (by post type);
  - profile completeness (about, website, category);
  - average visible engagement per post.

  From these it produces findings and recommendations on the Inteligencia Social page, and at most one Social item in Hoy when the data supports it.
- **Why required:** posts and Page metadata are the core input. Business Portfolio Pages also stay hidden from `/me/accounts` without it.
- **Access requirement (META DOC):** dependency `pages_show_list`. Screencast requirement: show the login granting it, show the user accessing a post's content from their Page in the app, and show the post content displayed.
- **Reviewer demonstration:** Fuentes, then «Sincronizar» on the Facebook e Instagram card, then Inteligencia Social. The page shows the post count, recency and the Page profile analysis derived from real posts.
- **Test asset:** a Page with several published posts (§17).
- **Status:** CODE READY · Advanced Access MANUAL META CHECK REQUIRED.

## 7. business_management

- **Why it is still required:** pages owned through a Meta Business Portfolio (Business Suite) are not returned by `/me/accounts` unless the user also grants `business_management`. This is field-proven. A3.5.2 diagnosed the empty list on the owner's real Page, and A3.5.2.1 fixed it by adding the scope. The code comment in the callback records the same fact. Most local businesses that use Business Suite fall into this case.
- **LocalSEOHub does NOT** call any Business Manager API endpoint, claim assets, read ad accounts or write anything. The permission is used only as a Page-discovery dependency.
- **Review implications (META DOC 2026-10-15):**
  - Allowed usage is described as "Manage business assets such as an ad account. Claim ad accounts."
  - The use case field states: "If the permission is requested as a dependency of another main permission, including … `pages_show_list`, please specify the main permission in the use case description."
  - The generic screencast requirements mention ads performance data, which LocalSEOHub does not show.
- **Risk:** moderate. The submission must state clearly that this is a dependency of `pages_show_list` for Business Portfolio Pages. The screencast must show a Business Portfolio Page appearing in the selection list.
- **If Meta rejects it:** customers whose Pages are not in a Business Portfolio may still work (the callback continues whenever Pages are returned). Portfolio-owned Pages would show the permission error. A product decision would follow.
- **Removal:** not removed (rule §8).
- **Status:** CODE READY · Advanced Access MANUAL META CHECK REQUIRED · Business Verification MANUAL META CHECK REQUIRED.

## 8. instagram_basic

- **Use:** only the Instagram professional (Business/Creator) account linked to the selected Facebook Page (`instagram_business_account`). Personal Instagram accounts are not supported and are not claimed to be.
- **Reads:**
  - id and username, at Page selection;
  - profile: username, name, biography, website, followers, follows and media_count;
  - media: caption, type, product type, permalink, timestamp, like count and comment count.
- **Use in Social Intelligence:** recency, cadence, format mix, bio/website completeness and visible engagement per post.
- **Access requirement (META DOC 2026-10-15):**
  - Dependencies listed: `pages_read_user_content`, `pages_show_list`.
  - Allowed usage: "Get basic metadata of an Instagram Business account profile."
  - Screencast: show the login and the user selecting their Instagram account.
- **Dependency gap:** LocalSEOHub does not request `pages_read_user_content`. **MANUAL META CHECK REQUIRED**: in App Review → Permissions and Features, check whether requesting Advanced Access for `instagram_basic` is blocked or flagged without it. Do not add it without a separate authorized phase. Adding it would also need a privacy review, because it covers user-generated content.
- **Reviewer demonstration:** after Page selection, the card shows the linked @username. After «Sincronizar», Inteligencia Social shows the Instagram platform overview.
- **Status:** CODE READY · Advanced Access + dependency MANUAL META CHECK REQUIRED.

## 9. public_profile

- **Explicitly requested?** No. It is not in `META_SCOPES` (PROJECT VERIFIED).
- **Supplied?** Yes, implicitly. META DOC: "This permission is automatically granted to all apps."
- **In the granted result?** It normally appears in `/me/permissions`, and the callback stores granted permissions as reported.
- **Used fields:** only `/me?fields=id` (identity of the authorizing user). No name, picture or email is requested.
- **App Review:** none is expected for this use. MANUAL META CHECK that it shows as available by default.

## 10. App Live mode

MANUAL META CHECK REQUIRED. Dashboard labels are not verified here.

- **Where (conceptually):** the app's dashboard header or app settings shows the app mode (Development vs Live).
- **Required:** Live, for arbitrary customers. In Development only app-role users can authorize.
- **Normally needed before Live:**
  - Privacy Policy URL;
  - Data Deletion instructions URL or callback;
  - app icon;
  - category;
  - contact email;
  - app domain;
  - a valid redirect URI;
  - any data-handling questions or Data Use Checkup the dashboard requests.
- **What may block switching:** a missing or unreachable privacy URL, a missing deletion URL, incomplete Basic Settings, unfinished data-handling questions, or an outstanding verification.
- **Note:** Live mode alone does not grant Advanced Access. Without approved permissions, non-role users still cannot grant them.

## 11. Business Verification

- **KNOWN FROM EVIDENCE (META DOC 2026-10-15):** "Business Verification – is required for all apps making requests for Advanced Access." External customers need Advanced Access for all four permissions, so Business Verification is required.
- **Industry context (not authoritative):** an October 2026 Social Media Today report says Meta retired a separate access-verification step and relies on Business Verification plus App Review.
- **MUST VERIFY IN DASHBOARD:** whether the app is connected to a Business Portfolio, and its verification status.
- **Information Manuel will likely need:**
  - legal business name exactly as registered;
  - registered address;
  - phone;
  - website on the localseohub.io domain;
  - a business email on the same domain (admin@localseohub.io matches);
  - official documents (registration, tax, or a utility bill matching the name and address);
  - domain verification may be requested.

  The documents must match the portfolio details exactly.
- **Status:** NOT claimed complete.

## 12. App Review

The package is fully prepared in §13–18 and §34–35. Requirements per META DOC:

- a use-case description per permission;
- a screencast showing the Facebook login granting it, then the data displayed in the app;
- reviewer access to the app.

Per permission (summary; copy-ready text in §34):

| Permission | Screen that demonstrates it | Data accessed | User benefit | Why less is insufficient |
|---|---|---|---|---|
| pages_show_list | Page selection modal | List of managed Pages (id, name) | Choose the right business Page | No other permission lists the user's Pages |
| pages_read_engagement | Inteligencia Social (Facebook section) after sync | Page metadata, published posts, totals | Findings about the Page's posting and profile | `pages_show_list` gives only the list, not content |
| business_management | Page selection modal listing a Business Portfolio Page | None directly; enables discovery | Business Suite Pages become selectable | Without it `/me/accounts` returns empty for portfolio Pages (field-proven) |
| instagram_basic | Card showing @username + Inteligencia Social (Instagram section) | IG profile + media metadata | Findings about the linked IG account | Page permissions do not expose IG media |

## 13. Reviewer journey

Adapted to actual functionality (routes are PROJECT VERIFIED):

1. Open https://localseohub.io.
2. Sign in with the reviewer LocalSEOHub credentials (email/password, no 2FA). The account must already have a completed business profile so the reviewer lands on Hoy.
3. In the left menu, open **Fuentes** (`/fuentes`).
4. Find the **Facebook e Instagram** card.
5. Click **«Conecta Facebook e Instagram»**.
6. In the Meta dialog, sign in with the reviewer Facebook account and accept all requested permissions (select the Page and the IG account if Meta offers asset selection).
7. Back in LocalSEOHub, choose the Page in **«Selecciona la página de tu negocio»** and press **«Usar esta página»**.
8. The card shows the connected Page name and the linked Instagram @username, where one exists.
9. Press **«Sincronizar»** on the card. The sync status shows the last successful update.
10. Open **Herramientas → Inteligencia Social** (`/herramientas/social`).
11. Observe the platform overview and the analysis based on the real Page posts and IG media (post counts, last activity, findings or a "no issues" state).
12. Open **Hoy**. A Social item appears only if the data produces one, which is not required for validation.
13. Return to Fuentes and press **«Desconectar»**, then confirm. The card returns to the disconnected state and the synced content is deleted.

The interface is in Spanish. The reviewer notes should give these labels with English equivalents: Fuentes = Sources, Sincronizar = Sync, Inteligencia Social = Social Intelligence, Hoy = Today, Desconectar = Disconnect.

## 14. Reviewer assets

Do not create credentials here, and never paste them into reports.

| Asset | Requirement |
|---|---|
| LocalSEOHub reviewer login | Dedicated email/password account, email already verified, no 2FA, business profile completed, plan/trial state that allows Fuentes and Inteligencia Social |
| Facebook account for review | Meta's current guidance on test users vs real reviewer accounts: MANUAL META CHECK. It must manage the review Page |
| Facebook Page | Preferably owned through a Business Portfolio (demonstrates `business_management`) with public posts |
| Instagram professional account | Business or Creator, linked to that Page, with published media |
| Reviewer notes | Steps from §13 + label translations + statement that no publishing/messaging exists |

## 15. Review data requirements

- **Page:** at least 5–10 published posts, ideally recent and of mixed types, so post sync and the analysis are visibly populated.
- **Page profile:** some fields filled in (about, website, category).
- **IG account:** at least 5–10 media items with captions.
- **Do not depend on a specific recommendation.** The permission is validated by visible synced data (counts, last post date, platform overview). Inteligencia Social shows that even when no issue is detected.
- If engagement counts are denied, posts still sync and counts stay empty (truthful). The demo still works.

## 16. Screencast plan

One continuous recording (or one per permission if the dashboard requires separate uploads; reuse segments). Order:

1. Login
2. Fuentes
3. «Conecta Facebook e Instagram»
4. The full Meta dialog, with the permissions visible and accepted
5. Page selection, showing the Business Portfolio Page
6. Connected card with the Page and @IG
7. «Sincronizar»
8. Inteligencia Social with real FB and IG data
9. (optional) Hoy
10. «Desconectar»

Use English captions or narration if possible. Script in §35.

## 17. Privacy URL

`https://localseohub.io/privacidad`: public route, no login required, served by the SPA with `_redirects` fallback.

§3 "Facebook e Instagram" covers:

- what is read;
- purpose (no publishing, no selling);
- authorization stored encrypted;
- retention;
- disconnect path;
- independence from Meta;
- the difference from the Meta Pixel.

ES/EN switch available. **Suitable for Meta.**

## 18. Data deletion URL

`https://localseohub.io/eliminar-datos`. §4 explains:

- what is stored;
- the self-service steps (Fuentes → Facebook e Instagram → Desconectar);
- what disconnecting removes;
- that removing the app only inside Facebook stops updates but does not delete stored data;
- full account deletion;
- the email route (admin@localseohub.io) for users who can't access their account.

**Suitable as the Data Deletion Instructions URL.**

## 19. Terms URL

`https://localseohub.io/terminos`: public, bilingual. It has §7 on third-party integrations, and §8 contact now uses admin@localseohub.io. Consistent with Privacy and Deletion.

## 20. Legal contact consistency

| Page | Old | New |
|---|---|---|
| Terms §8 (ES + EN) | gopik.digital@gmail.com (local `TERMS_CONTACT_EMAIL` + `ContactLink`) | admin@localseohub.io (shared `MailLink` → `LEGAL_CONTACT_EMAIL`) |
| Privacy / Deletion / legal footer | admin@localseohub.io | unchanged |

No other Terms text changed.

Out of scope, noted only: the landing page contact modal (`src/components/LegalModals.tsx`, `ContactModal`) still shows gopik.digital@gmail.com. It is not a legal page and Meta does not ask for it. Changing it is a separate product decision.

## 21. Production URL inventory

| Item | Value |
|---|---|
| Main domain | https://localseohub.io (`SITE_URL` secret set; code default `https://localseohub.io`) |
| Privacy | https://localseohub.io/privacidad |
| Terms | https://localseohub.io/terminos |
| Data deletion | https://localseohub.io/eliminar-datos |
| OAuth redirect (Meta → server) | `<SUPABASE_PROJECT_URL>/functions/v1/meta-oauth-callback` (value held in the `META_REDIRECT_URI` secret; not printed) |
| Post-OAuth landing (server → browser) | https://localseohub.io/oauth/meta/callback (route present in App) |

## 22. OAuth redirect checklist

- Application configuration (PROJECT VERIFIED):
  - meta-oauth-start sends `redirect_uri = META_REDIRECT_URI`;
  - the callback uses the same value for the code exchange;
  - the secret is set.
- Meta dashboard (MANUAL META CHECK). Under Facebook Login (for Business) settings → Valid OAuth Redirect URIs, the list must contain the **exact** `META_REDIRECT_URI` value: https, same host, path `/functions/v1/meta-oauth-callback`, no trailing slash difference.
- Strict mode / "Use Strict Mode for Redirect URIs" on; Client OAuth Login and Web OAuth Login on (labels to confirm in dashboard).
- `https://localseohub.io/oauth/meta/callback` is NOT an OAuth redirect URI. Meta never redirects there directly, so it does not need to be listed.
- The callback is not modified.

## 23. App domain checklist

- App Domains: `localseohub.io`. Add `www.localseohub.io` only if the site is actually served there (MANUAL check).
- The Supabase functions host is used only as the redirect URI. Whether the dashboard also wants it under App Domains: MANUAL META CHECK. Add it only if the dashboard reports a domain mismatch.
- Do not add localhost or preview/dev domains.

## 24. App metadata checklist

| Item | Status |
|---|---|
| Contact email | Project uses admin@localseohub.io (VERIFIED FROM PROJECT). Dashboard value: MANUAL META CHECK |
| Privacy Policy URL | VERIFIED FROM PROJECT (§17); dashboard entry MANUAL META CHECK |
| Terms of Service URL | VERIFIED FROM PROJECT (§19); dashboard entry MANUAL META CHECK |
| Data deletion URL | VERIFIED FROM PROJECT (§18); dashboard entry MANUAL META CHECK |
| App icon (1024×1024) | MANUAL META CHECK (the brand favicon exists in the project; a proper icon must be uploaded) |
| Category (e.g. Business / Productivity) | MANUAL META CHECK |
| App domain | §23, MANUAL META CHECK |
| Business Portfolio linked | MANUAL META CHECK |
| Data handling questions / Data Use Checkup | MANUAL META CHECK |

## 25. Data deletion dashboard configuration

META DOC (deletion FAQ): "Developers need to specify either a data deletion callback instruction URL or a callback URL found in Basic Settings for your app." An instructions URL is therefore accepted, per the current documentation.

- Enter `https://localseohub.io/eliminar-datos` as the Data Deletion Instructions URL.
- No callback is implemented, and none is required by this evidence.
- MANUAL META CHECK REQUIRED that the current dashboard for this app or use case offers the instructions option. If it insists on a callback, that becomes a new, separately authorized implementation phase.

## 26. Owner/test vs external access

**Gopik.Digital success ≠ arbitrary customer success.**

The owner's account has a role on the app (admin). With Standard Access, Meta lets app-role users grant even unapproved permissions, which is why the owner's real Page and IG connected, synced and analysed successfully in A3.5.2.x–A3.5.4.x.

A customer without a role is refused those permissions until Meta grants Advanced Access through App Review, with Business Verification and Live mode. No code change can bypass this.

## 27. External-user E2E plan (post-approval only — A3.5.6)

Run this only after approval, using a Meta account that is NOT app admin/developer/tester and NOT in the Business Portfolio that owns the app. Steps:

1. Sign up as a new LocalSEOHub customer.
2. Fuentes → Conecta Facebook e Instagram.
3. Authorize all permissions.
4. Select their Page; confirm the IG @username where linked.
5. Sincronizar → check `last_success_at` and the absence of `permission_unavailable`.
6. Inteligencia Social shows real data.
7. Hoy (optional Social item).
8. Desconectar → the content is removed.

Also test a Page owned by a Business Portfolio and a non-portfolio Page if possible. Do not perform this now.

## 28. Review failure modes

These are likely categories based on the architecture, not a prediction.

- Reviewer cannot log in (wrong credentials, email verification wall, unfinished onboarding, expired trial or paywall).
- Reviewer's Facebook account has no Page, or the Page has no posts; IG not linked or a personal account.
- The screencast does not show the Meta permission dialog, or does not show the data appearing in-app.
- **`business_management` justified generically or as asset management.** It must be stated as a dependency of `pages_show_list`.
- **`instagram_basic` dependency (`pages_read_user_content`) flagged as missing.**
- Spanish-only UI confusing the reviewer (mitigate with notes and captions).
- Privacy, terms or deletion URLs unreachable or not matching the dashboard fields.
- Business Verification incomplete or documents not matching.
- The redirect URI is not listed exactly.
- Requested permissions do not match what is shown.

## 29. Token-expiry operations

- Meta long-lived user tokens last roughly 60 days (the callback records `expires_in` as `token_expires_at`).
- When Meta rejects an expired or revoked token, LocalSEOHub:
  - marks the connection as expired or error and the sync state `reauth_required`;
  - wipes the stored token (trigger);
  - keeps the synced content;
  - shows «Debes volver a conectar con Meta» / «Volver a conectar».
- The customer reconnects in one step.
- Not a launch blocker. No token-lifecycle change in this phase.

## 30. Support note

If a customer says Facebook or Instagram stopped updating, check in order:

1. `meta_connections.status`: connected / expired / error / disconnected.
2. `meta_sync_state.last_success_at` per platform: when the last update actually succeeded.
3. `reauth_required`: the token expired or was revoked. Ask the customer to reconnect.
4. `permission_unavailable`: a permission was declined or removed. Reconnect and accept all.
5. `rate_limited`: Meta throttling. Wait and retry later.
6. Other sync error codes and the edge-function logs (stage logs contain no tokens).

Only after these, suspect a product failure. Also remember that sync only runs when the user triggers it.

## 31. Manuel checklist

**BEFORE APP REVIEW**

- [ ] Check app mode (Development/Live) in the Meta App Dashboard.
- [ ] Check the app is linked to the Gopik.Digital / LocalSEOHub Business Portfolio.
- [ ] Check Business Verification status; if not verified, complete it first (legal name, address, phone, domain, documents).
- [ ] Check Basic Settings: contact email admin@localseohub.io, Privacy `/privacidad`, Terms `/terminos`, Data Deletion Instructions `/eliminar-datos`, icon, category, App Domain `localseohub.io`.
- [ ] Check Facebook Login settings: Valid OAuth Redirect URIs contains the exact server callback URL; strict mode on.
- [ ] Check in Permissions and Features that the four permissions can be requested. Note whether `instagram_basic` reports a missing dependency (`pages_read_user_content`). If so, STOP and report back; do not add it yourself.
- [ ] Complete data-handling questions / Data Use Checkup if prompted.
- [ ] Create the LocalSEOHub reviewer account (verified email, completed business profile, access to Fuentes and Inteligencia Social).
- [ ] Prepare the review Facebook account + Page (Business Portfolio Page with posts) + linked IG professional account with media.
- [ ] Do a full dry run of §13 with those assets.

**APP REVIEW SUBMISSION**

- [ ] Record the screencast (§35), with captions in English.
- [ ] Paste and adapt the per-permission texts (§34).
- [ ] Add reviewer instructions: URL, credentials (in Meta's form only), steps, label translations.
- [ ] Submit for Advanced Access for `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_basic`.
- [ ] Respond to any reviewer feedback without changing scope unless an authorized phase decides so.

**AFTER APPROVAL**

- [ ] Confirm all four show Advanced Access.
- [ ] Switch the app to Live (if not already).
- [ ] Ask for A3.5.6 — external-user E2E (§27) with a non-role Meta account.

## 32. Current Meta/manual-verification boundaries

| Statement | Basis |
|---|---|
| Requested scopes, Graph calls, redirect architecture, legal URLs, disconnect behaviour | PROJECT VERIFIED |
| Business Verification required for Advanced Access | META DOC (2026-10-15) |
| Permission dependencies, allowed usages and screencast requirements | META DOC (2026-10-15) |
| Deletion instructions URL accepted as an alternative to a callback | META DOC (deletion FAQ) |
| App mode, verification status, access levels, dashboard labels, review timelines, test-user policy | MANUAL META CHECK REQUIRED |
| Whether `instagram_basic` will be blocked without `pages_read_user_content` | MANUAL META CHECK REQUIRED |

## 33. Readiness matrix

| Requirement | Project status | Meta/dashboard status | Manuel action | Blocking external users? |
|---|---|---|---|---|
| Meta app mode | n/a | MANUAL CHECK | Confirm; go Live after approval | Yes |
| Business Verification | Info identified (§11) | MANUAL CHECK | Complete if not verified | Yes |
| pages_show_list | CODE READY | Advanced Access pending | Submit | Yes |
| pages_read_engagement | CODE READY | Advanced Access pending | Submit | Yes |
| business_management | CODE READY | Advanced Access pending; moderate risk | Submit as dependency | Yes (portfolio Pages) |
| instagram_basic | CODE READY | Advanced Access pending; dependency check | Check dependency, submit | Yes (IG) |
| OAuth redirect | READY (secret set) | MANUAL CHECK | Confirm exact URI listed | Yes if wrong |
| App domain | localseohub.io | MANUAL CHECK | Enter domain | Possibly |
| Privacy URL | READY | MANUAL CHECK | Enter URL | Yes if missing |
| Terms URL | READY | MANUAL CHECK | Enter URL | Possibly |
| Data deletion URL/config | READY (instructions) | MANUAL CHECK | Enter instructions URL | Yes if missing |
| Contact email | READY (consistent) | MANUAL CHECK | Set admin@localseohub.io | Possibly |
| Reviewer test account | Requirements defined | n/a | Create | Yes (review) |
| Review Page | Requirements defined | n/a | Prepare | Yes (review) |
| Review Instagram account | Requirements defined | n/a | Prepare | Yes (review) |
| Screencast | Script ready | n/a | Record | Yes (review) |
| App Review | Package ready | Not submitted | Submit | Yes |
| External-user E2E | Plan ready (§27) | After approval | Request A3.5.6 | Final gate |

## 34. Permission submission pack

**PERMISSION:** pages_show_list
**FEATURE:** Connecting the customer's Facebook business Page to LocalSEOHub (Sources page → Facebook and Instagram).
**WHY REQUIRED:** After Facebook Login we list the Pages the person manages so they can select the one that belongs to their business. We store only the selected Page's id and name. The list is discarded once a Page is chosen.
**REVIEWER STEPS:** Log in to https://localseohub.io → Fuentes (Sources) → «Conecta Facebook e Instagram» → accept permissions in the Meta dialog → the modal «Selecciona la página de tu negocio» lists your Pages → choose one → «Usar esta página».
**EXPECTED RESULT:** The card shows the selected Page as connected.
**DATA USED:** Page id and name from /me/accounts.
**WHY LESS ACCESS IS INSUFFICIENT:** No other permission returns the list of Pages a person manages; without it the user cannot select their business Page.

**PERMISSION:** pages_read_engagement
**FEATURE:** Social Intelligence: read-only analysis of the business Page's own published posts and profile.
**WHY REQUIRED:** We read the selected Page's metadata (name, category, about, website, link, follower and fan counts) and its published posts (text, date, type, permalink, total reactions and total comments). From these we show the owner how recently and how often they post, their content mix, profile completeness and visible engagement. Sync only runs when the user presses Sync. We never publish, comment, message or read follower identities.
**REVIEWER STEPS:** After connecting, press «Sincronizar» (Sync) on the Facebook and Instagram card → open Herramientas → Inteligencia Social (Social Intelligence).
**EXPECTED RESULT:** The Facebook section shows the synced post count, the last post date and findings based on the Page's real posts.
**DATA USED:** Page token, Page metadata, /{page}/published_posts fields listed above.
**WHY LESS ACCESS IS INSUFFICIENT:** pages_show_list returns only the list of Pages; it does not allow reading the Page's posts or metadata.

**PERMISSION:** business_management
**FEATURE:** Requested as a dependency of pages_show_list (Page selection).
**WHY REQUIRED:** Many local businesses own their Facebook Page through a Meta Business Portfolio (Business Suite). In our testing, /me/accounts returned an empty list for such Pages unless business_management was also granted, so those customers could not select their own Page. We do not call Business Manager APIs, manage assets, or access ad accounts.
**REVIEWER STEPS:** Using a Facebook account whose Page is owned by a Business Portfolio, follow the connection steps above.
**EXPECTED RESULT:** The portfolio-owned Page appears in «Selecciona la página de tu negocio» and can be connected.
**DATA USED:** No data is read through Business Manager endpoints; the permission only allows the Page to be returned by /me/accounts.
**WHY LESS ACCESS IS INSUFFICIENT:** Without it, Pages owned through a Business Portfolio are not returned to our app, so the main permission (pages_show_list) cannot do its job for these businesses.

**PERMISSION:** instagram_basic
**FEATURE:** Social Intelligence for the Instagram professional account linked to the selected Page.
**WHY REQUIRED:** After Page selection we read the linked Instagram professional account's id and username. On sync we read its profile (username, name, biography, website, follower/following/media counts) and its media metadata (caption, type, timestamp, permalink, like and comment counts). From these we show posting recency, cadence, format mix, bio completeness and visible engagement. Personal Instagram accounts are not supported. Read-only.
**REVIEWER STEPS:** Connect as above with a Page that has a linked Instagram professional account → the card shows the @username → «Sincronizar» → Inteligencia Social.
**EXPECTED RESULT:** The Instagram section shows the synced media count, last post date and findings based on real media.
**DATA USED:** /{page}?fields=instagram_business_account, /{ig} profile fields, /{ig}/media fields listed above.
**WHY LESS ACCESS IS INSUFFICIENT:** Page permissions do not expose the Instagram account's profile or media.

## 35. Screencast script (about 3 minutes)

| Time | On screen | Caption / narration |
|---|---|---|
| 0:00 | https://localseohub.io → sign in | "LocalSEOHub helps local businesses improve their online presence. Signing in as a business owner." |
| 0:15 | Menu → Fuentes | "Sources page, where the owner connects their accounts." |
| 0:25 | Facebook e Instagram card → «Conecta Facebook e Instagram» | "Connecting Facebook and Instagram (read-only)." |
| 0:35 | Meta login + permission screen, pause on the permission list, accept | "The owner grants pages_show_list, pages_read_engagement, business_management and instagram_basic." |
| 1:05 | «Selecciona la página de tu negocio» with the portfolio Page → «Usar esta página» | "pages_show_list (with business_management for Business Portfolio Pages): the owner selects their business Page." |
| 1:25 | Card: Page name + @instagram | "instagram_basic: the linked Instagram professional account is identified." |
| 1:35 | «Sincronizar», wait for the success time | "The owner syncs their own Page posts and Instagram media." |
| 1:55 | Herramientas → Inteligencia Social: Facebook section, then Instagram section | "pages_read_engagement and instagram_basic: real posts and media are analysed to show recency, frequency, format mix and profile completeness." |
| 2:35 | (optional) Hoy | "Priorities can include a social recommendation when the data supports it." |
| 2:45 | Fuentes → «Desconectar» → confirm | "The owner can disconnect at any time; access and synced content are deleted." |
| 3:00 | End | n/a |

Keep unrelated features out of frame. Never show credentials.

## 36. Decision tree

- IF the Meta dashboard shows Business Verification required or not complete → complete Business Verification first.
- IF `instagram_basic` shows a missing-dependency warning (`pages_read_user_content`) → stop and request a separately authorized scope decision phase; do not submit with a known blocker.
- IF permission access can be requested → finish the reviewer assets, record the screencast and submit the §34 package.
- IF the app cannot switch to Live → read the dashboard prerequisite (usually a missing privacy/deletion URL, icon, category, contact or data-handling questions) and fix that field.
- IF the dashboard refuses a deletion instructions URL and requires a callback → request a separately authorized callback phase.
- IF App Review is rejected → read the rejection reason per permission, then adjust the justification or screencast. Change scope only through an authorized phase.
- IF all external requirements are approved → run A3.5.6 external-user E2E.

## 37. Files modified

| File | Change |
|---|---|
| `src/features/legal/TermsPage.tsx` | Removed local `TERMS_CONTACT_EMAIL`/`ContactLink` (gopik.digital@gmail.com); the §8 contact in ES and EN now uses the shared `MailLink` (admin@localseohub.io). |
| `src/features/legal/__tests__/a3551LegalMeta.test.ts` | +1 test: all legal pages use the single legal contact and none contains the old address. |
| `src/features/meta-connection/__tests__/a351MetaConnection.test.ts` | Terms byte pin updated `5b43eaa9…` → `76a07dc69ff04c885d2006b20361f7b687f7d7b9f771c5c5d0e422a9140751a3`. |
| `auditoria-a2/A3_5_5_2_META_EXTERNAL_ACCESS_APP_REVIEW_READINESS.md` | This report. |

## 38. Tests

- Legal, consent and meta-connection suites: 6 files, 240/240 pass.
- Full regression: 63 files, **2255/2255 pass**, 0 failures (baseline 2254 + 1 new).

## 39. TypeScript

`npx tsc --noEmit -p tsconfig.app.json`: **20 errors, all legacy baseline, 0 new.**

## 40. Build

`npm run build`: **PASS** (run after this report).

## 41. Frozen hash verification

- 408 files (all of `src/` except the legal folder, plus `supabase/functions`, `supabase/migrations` and `supabase/config.toml`) were hashed before and after this phase. The only difference is `a351MetaConnection.test.ts` (the Terms pin).
- Meta handlers are unchanged and identical to A3.5.5.0 / A3.5.5.1:

  | Handler | Hash prefix |
  |---|---|
  | meta-oauth-start | `e21d60a5` |
  | meta-oauth-callback | `89ff215b` |
  | meta-connection | `57e8341f` |
  | meta-read | `987cc94b` |

- No DB, migration, Edge Function, Social or scope change.

## 42. Remaining LocalSEOHub blockers

None internal for review submission.

Conditional item: if the Meta dashboard requires `pages_read_user_content` for `instagram_basic`, or a deletion callback, a new authorized phase is needed.

## 43. Remaining Meta blockers

- Business Verification (required for Advanced Access).
- App Review / Advanced Access for the four permissions.
- Live mode and complete Basic Settings.
- Exact redirect URI in Facebook Login settings.
- Reviewer assets and screencast.
- Post-approval external-user E2E.

## 44. Final verdict

**READY — META APP REVIEW PACKAGE PREPARED; MANUAL META ACTION REQUIRED**

This does not mean Meta has approved the app.

## 45. Exact next step

STOP. Manuel performs the §31 "BEFORE APP REVIEW" checks in the Meta App Dashboard and reports back:

- app mode;
- Business Verification status;
- whether the four permissions can be requested;
- whether the `instagram_basic` dependency warning appears;
- whether the deletion instructions URL is accepted.

A3.5.6 — META SOCIAL V1 FINAL EXTERNAL-USER E2E & FREEZE runs only after Meta approval. No new functionality is built while waiting.
