# A3.5.5.1 — META SOCIAL V1 — PRIVACY & DATA DELETION PRODUCTION FIX

Date: 2026-10-24 · Mode: minimal production fix + validation · Project: LocalSEOHub.io

## 1. Executive summary
The two internal production blockers from A3.5.5.0 are resolved. `/privacidad` now has a dedicated section on the Facebook/Instagram business connection. `/eliminar-datos` now has a dedicated Meta section with self-service disconnect steps, the real effects of disconnecting, and a request path by email. `/terminos` gained one concise clause on third-party integrations. All three pages are now complete in ES and EN, with a language switch in the legal layout. Every material claim was cross-checked against frozen code and migrations. No Meta, Social, database or Edge Function code changed. Tests: 2254/2254. TypeScript: 20 legacy errors, 0 new. Build: PASS.

## 2. Source audit
A3.5.5.0 (`A3_5_5_0_META_PRODUCTION_READINESS_AUDIT.md`) concluded NO-GO — META SOCIAL V1 HAS INTERNAL PRODUCTION BLOCKERS. The only blockers were the legal content of the privacy and data deletion pages. A Terms clause was rated optional.

## 3. A3.5.5.0 blockers addressed
| # | Blocker | Status |
|---|---|---|
| 1 | Privacy policy does not disclose the FB/IG business integration | RESOLVED: new §3 `#facebook-instagram` (ES + EN) |
| 2 | Data deletion page has no Meta disconnect/removal instructions | RESOLVED: new §4 `#facebook-instagram` (ES + EN) |
| opt | Terms third-party clause | DONE: new §7 "Integraciones con servicios de terceros" |

## 4. Files modified
| File | Change |
|---|---|
| `src/features/legal/PrivacyPolicyPage.tsx` | Meta section, cross-references, renumbering, full EN version |
| `src/features/legal/DataDeletionPage.tsx` | Meta section, account-deletion bullet, full EN version |
| `src/features/legal/TermsPage.tsx` | §7 third-party integrations, contact becomes §8, full EN version |
| `src/features/legal/LegalLayout.tsx` | ES/EN switch, translated header chrome, scroll to `#hash` targets |
| `src/features/legal/__tests__/a3551LegalMeta.test.ts` | NEW: 18 tests |
| `src/features/meta-connection/__tests__/a351MetaConnection.test.ts` | Updated the 3 legal-page byte pins only (authorised legal change) |
| `auditoria-a2/A3_5_5_1_META_PRIVACY_DATA_DELETION_FIX.md` | This report |

## 5. Privacy changes
- The existing ES wording of every prior section is preserved verbatim.
- New §2 sub-heading "Facebook e Instagram (opcional)" points to new §3.
- New §3 "Conexión de Facebook e Instagram (opcional)" has the following sub-sections: what we read, purpose, Meta authorisation, retention, how to disconnect, relationship with Meta, and difference from the Meta Pixel.
- Former §3–§10 are renumbered §4–§11, and internal "sección 5" references are updated to "sección 6".
- §4 (purposes) adds one bullet for the optional Google/Meta analysis.
- §5 (providers) splits Meta Platforms into connection vs Pixel, and Microsoft is listed on its own line.
- §6 (Pixel bullet) adds "No tiene relación con la conexión opcional…".
- §8 (retention) points to the specific §3 rules.
- §10 (deletion) mentions self-service disconnect in «Fuentes».
- The date is updated to 24 October 2026.

## 6. Meta business connection disclosure
The connection is voluntary and made from «Fuentes». It covers a Facebook Page the user manages and, if linked to that Page, its Instagram professional account (business or creator). The user decides in Meta whether to grant permissions and which Pages to share. We have no access to other Pages, other people's personal profiles or private messages.

## 7. Data categories
- **Page:** name, category, about, link, website, fan/follower counts.
- **Page posts:** text, date, type, permalink, and reaction/comment counts when Meta provides them.
- **IG profile:** username, name, biography, website, follower/follows/media counts.
- **IG media:** caption, timestamp, type, permalink, and like/comment counts when provided.
- **Connection data:** Meta user id only (not name/email), granted permissions, connection/sync status, last successful sync, technical error codes, and a temporary Page list (names) during selection.
- **Explicitly not read:** comment text, DMs, ad data, follower/interactor data.

## 8. Purpose
Purposes are:
- sync on user request;
- analyse social presence and detect factual signals (frequency/recency);
- generate recommendations and priorities in «Hoy», «Plan» and «Inteligencia Social».

The analysis uses LocalSEOHub's own rules, and social content is not sent to the AI provider.

The pages also state what we do not do: publish, schedule, delete, reply, message, manage ads, use the data for advertising or profiling, or sell it.

## 9. Authorization handling
- The Meta authorisation is used only from our servers. It is stored encrypted, never shown in the browser and never published.
- The password is never seen.
- It expires after a period set by Meta, and the user is then asked to reconnect.
- There are no mentions of Vault, token ids, app secret, appsecret_proof or internals; a test enforces this.

## 10. Retention
- While connected, data is kept and refreshed by each sync.
- On expiry or error, the authorisation is deleted and synced data stays stored until reconnect or disconnect.
- On disconnect, reconnect or Page switch, everything is deleted except a minimal technical record (status/dates).
- On account deletion, everything is deleted.
- No fixed period is invented.

## 11. Disconnect/deletion semantics
«Fuentes» → «Facebook e Instagram» card → «Desconectar» → confirm. We also ask Meta to remove the granted permissions (best-effort). Removing access in Facebook's business-integrations settings stops future syncs but does NOT delete stored data until the user disconnects in LocalSEOHub or asks us to delete it. The pages state this honestly.

## 12. Meta relationship
Facebook and Instagram are Meta Platforms services governed by Meta's own terms and privacy policy. LocalSEOHub is independent and not affiliated with, sponsored or endorsed by Meta.

## 13. Pixel vs business integration distinction
There is a dedicated "Diferencia con el Meta Pixel" / "Difference from the Meta Pixel" sub-section:
- the Pixel measures our own campaigns on our website and runs only with consent;
- the connection reads business data only if the user connects;
- accepting or rejecting one does not affect the other;
- connection data is not sent to the Pixel.

The providers list and the cookies §6 carry matching statements, and data deletion §5 repeats the separation.

## 14. Data Deletion changes
- The intro now covers FB/IG.
- §1 includes FB/IG among the connections.
- §3 adds a bullet: on account deletion we delete the connection, the Meta authorisation and all synced info.
- New §4 "Datos de Facebook e Instagram" covers what is stored, self-service steps, effects of disconnect, removing access from Facebook, and what to do without account access.
- Former §4–§5 become §5–§6, and §5 restates Pixel separation.
- Existing deletion-by-email procedure, no-secrets warning and legal-retention text are preserved.

## 15. User deletion steps
1. Sign in to LocalSEOHub.
2. Open «Fuentes» in the menu.
3. Find the «Facebook e Instagram» card.
4. Press «Desconectar» (the broken-link icon) and confirm.

The labels are asserted in tests against the live `META_COPY` strings, so the instructions cannot drift from the real UI.

## 16. Actual disconnect behaviour
`meta-connection` `disconnect`:
- sends `DELETE /me/permissions` (best-effort, records revoked/failed);
- then calls `meta_disconnect` → `meta_fail_connection(…,'disconnected')`.

The `meta_connections_wipe_inactive` trigger:
- forgets the Vault secret;
- nulls the token ref and expiry;
- clears `available_pages`, meta_user_id, page_id/name, IG id/username/status, granted_permissions and connected_at.

## 17. Stored-content behaviour
The `meta_connections_purge_content` trigger (AFTER UPDATE) deletes all `meta_content_items` and `meta_sync_state` for the connection when status becomes `disconnected` or `connecting`, or the page_id changes. It deletes Instagram rows only when the IG account changes. The row that remains holds status, revocation_status, timestamps and safe error code only ("minimal technical record").

## 18. Account deletion/request path
Account deletion stays manual by email, unchanged. `meta_connections`, `meta_content_items` and `meta_sync_state` cascade `ON DELETE` from `auth.users`/`businesses`. `meta_connections_forget_on_delete` forgets the Vault secret. Users without access can email with the subject «Eliminar datos de Facebook e Instagram». No new feature was invented.

## 19. Contact
Privacy and Data Deletion use `<MailLink />` → `LEGAL_CONTACT_EMAIL = admin@localseohub.io`, unchanged and with no new address. Terms keeps its previously approved address `gopik.digital@gmail.com`, which a code comment marks as approved text. This pre-existing inconsistency is documented in §35 for a product decision; it was not changed silently.

## 20. Meta deletion URL readiness
`/eliminar-datos` is public, outside the auth guards, and works on direct refresh via the SPA fallback. It now explains clearly what Meta data is held, how to remove it, what disconnect does and how to contact us. It is suitable as the "User data deletion → Data deletion instructions URL" in the Meta dashboard. A Data Deletion Callback was NOT implemented: A3.5.5.0 did not establish that V1 requires one over the instructions URL. Choosing between instructions URL and callback is a dashboard question for A3.5.5.2.

## 21. Terms decision
Changed minimally:
- one new §7 states that the user may only connect business accounts they manage or are authorised to manage;
- the same §7 says integrations depend on each platform's availability, authorisation and terms;
- Contact moves to §8.

The existing ES text of §1–§6 is unchanged. An EN version was added for language consistency.

## 22. ES/EN parity
All three pages render ES or EN from the app language, and the legal header has an ES/EN switch. Tests assert per language:
- identical section ids;
- equal `<h3>` and `<li>` counts on Privacy and Deletion;
- the same Meta claims in each language.

Semantic parity was checked by manual paragraph-by-paragraph review; EN is a faithful translation with no omissions. In EN, the menu label «Fuentes» stays Spanish with "(Sources)" added because the app's menu is Spanish-only. Card labels use the real EN copy («Facebook and Instagram», «Disconnect»).

## 23. Legal claim → implementation evidence matrix
| Legal claim | Evidence | Status |
|---|---|---|
| Voluntary connection from «Fuentes» | `/fuentes` route; `SourceManager` renders `MetaConnectionCard` | VERIFIED |
| Only Pages/accounts Meta authorises | callback `/me/accounts`; `select_page` requires page in `available_pages` (SQL re-check) | VERIFIED |
| IG only if linked to the Page | `meta-connection` reads Page `instagram_business_account` | VERIFIED |
| Page fields read | `meta-read` `fields=id,name,about,category,link,website,fan_count,followers_count` | VERIFIED |
| Post fields + counts when provided | `FB_POST_FIELDS`, engagement fallback keeps counts null | VERIFIED |
| IG profile/media fields | `ig_profile` fields; `IG_MEDIA_FIELDS` | VERIFIED |
| Meta user id only, not name/email | `/me?fields=id` | VERIFIED |
| Temporary Page list deleted after choice | `meta_finish_page_selection` sets `available_pages='[]'` | VERIFIED |
| No comment text / DMs / ads / followers | no such fields or edges requested; scopes are read-only Page/IG basics | VERIFIED |
| Sync only on user request | only `syncMetaContent` callers are the «Sincronizar» button and the Social refresh button; no cron | VERIFIED |
| Own rules, not sent to AI | social engines are client-side deterministic; no AI function references meta_* or social | VERIFIED |
| No publish/schedule/reply/message/ads | no write calls in Meta handlers except `DELETE /me/permissions` | VERIFIED |
| Not used for advertising / not sent to Pixel | `MetaPixelTracker`/`pixel.ts` carry no social data | VERIFIED |
| Authorisation stored encrypted, server-only | Vault via `meta_vault_put`; token column not granted to authenticated users; RPCs service_role only | VERIFIED |
| Authorisation expires, reconnect requested | `token_expires_at` → `reauth_required` + reconnect UI | VERIFIED |
| Expiry/error deletes authorisation, keeps content | `wipe_inactive` on inactive status; purge only on disconnected/connecting/page change | VERIFIED |
| Disconnect deletes authorisation, Page/IG details, all content and sync data | `wipe_inactive` + `purge_content` | VERIFIED |
| Minimal technical record remains | row keeps status/revocation_status/timestamps | VERIFIED |
| We ask Meta to remove permissions | `DELETE /me/permissions` best-effort | VERIFIED |
| Reconnect starts from scratch | `begin_attempt` → `connecting` → purge | VERIFIED |
| Removing access in Facebook alone does not delete stored data | no deauthorise callback exists | VERIFIED |
| Account deletion removes all Meta data | FK `ON DELETE CASCADE` + `forget_on_delete` | VERIFIED |
| Button labels «Facebook e Instagram» / «Desconectar» | `META_COPY` (asserted in tests) | VERIFIED |

No NOT VERIFIED claim is published.

## 24. Routes
`/privacidad`, `/terminos` and `/eliminar-datos` are unchanged, public and outside `AppGuard`/`OnboardingGuard`. The consent test still asserts this. `App.tsx` is byte-identical.

## 25. Reviewer usability
A reviewer on `/eliminar-datos` can answer:
- what Meta data is used (§4 first paragraph);
- how to disconnect (steps);
- what happens afterwards (effects list);
- how to request deletion (email path);
- how to contact us (MailLink ×3).

On `/privacidad`, §3 answers integration, data, purpose, authorisation, and retention/deletion. Both pages link to each other's Meta section, and `#facebook-instagram` anchors now scroll correctly.

## 26. Security/no secrets
No secrets, env values, Vault references or internal identifiers appear in the copy; a test enforces this. No new external requests. The deletion page still never asks for credentials, in either language.

## 27. Database changes
None. No tables, columns, migrations, RPCs or policies.

## 28. Meta functional changes
None. No OAuth, scopes, connection, read layer, Social Signals/Findings/UI, Hoy, Plan, Advisor, Twin or Resumen changes. No Edge Functions deployed.

## 29. Frozen hash verification
128 files hashed before and after:
- `supabase/functions/meta-*`, all migrations;
- `src/features/meta-connection`, `src/features/social-intelligence` (signals, findings, UI, integration);
- `src/app-v2` (TodayPage, PlanPage, shell), `src/App.tsx`, `src/lib`;
- consent, conversion and reality-engine.

The only difference is `a351MetaConnection.test.ts`: the legal-page pin update. Key hashes (prefix):

| File | Hash prefix |
|---|---|
| meta-oauth-start/handler | e21d60a580ae |
| meta-oauth-callback/handler | 89ff215b8e92 |
| meta-connection/handler | 57e8341fbb51 |
| meta-read/handler | 987cc94b1490 |
| App.tsx | 36074bedfe7a |
| TodayPage | 78cdf392ae27 |
| PlanPage | 109a1a58060a |
| social-intelligence/engine | 457d613c24f7 |
| findings/engine | fe37139fc142 |
| integration/projection | d427394451b8 |
| SocialIntelligencePage | 368b60708eaf |
| MetaConnectionCard | d38f3b447322 |

The four Meta handler hashes equal the A3.5.5.0 baseline.

## 30. Tests added/updated
- New `a3551LegalMeta.test.ts` has 18 tests. Privacy (9):
  - single Meta section;
  - Page/IG disclosure;
  - data categories;
  - purpose and non-functions;
  - no internals;
  - disconnect and deletion;
  - Pixel separation;
  - independence and no overclaims;
  - ES/EN structure parity.
- Data Deletion (7):
  - Meta section;
  - real labels from `META_COPY`;
  - real disconnect effects;
  - Facebook-side removal honesty;
  - contact;
  - no deadlines or secrets in either language;
  - parity.
- Terms (1) and layout language switch (1).
- Updated: the 3 legal byte pins in `a351MetaConnection.test.ts`.

## 31. Targeted regression
Legal + consent: 40/40. Meta connection, Meta read and Social tests pass within the full run.

## 32. Full regression
63 files, 2254/2254 passed (baseline 2236 + 18 new). 0 failures.

## 33. TypeScript
`npx tsc --noEmit -p tsconfig.app.json`: 20 errors, all legacy, none in legal files. 0 new.

## 34. Final build
`npm run build` after the final edit (this report): PASS.

## 35. Known limitations
- Terms contact address (`gopik.digital@gmail.com`) differs from the Privacy/Deletion address (`admin@localseohub.io`). It is pre-existing approved text and was left untouched; aligning it is a product owner decision.
- Synced data for connections in `error`/`reauth_required` stays stored until the user disconnects or reconnects. This is truthfully disclosed. A retention sweep remains a post-V1 option, per A3.5.5.0.
- Removing the app from Facebook settings does not delete LocalSEOHub-stored data, since there is no deauthorise or data-deletion callback. This is truthfully disclosed.
- "Integraciones comerciales" / "business integrations" names Meta's own settings area, which Meta may relabel.
- The app menu label «Fuentes» is Spanish-only, so EN copy shows «Fuentes» (Sources).

## 36. Remaining internal blockers
None.

## 37. Remaining external Meta requirements
These are PENDING / TO BE VERIFIED:
- Live mode;
- App Review / Advanced Access for `pages_show_list`, `pages_read_engagement`, `business_management`, `instagram_basic`;
- probable Business Verification;
- dashboard: Privacy Policy URL `/privacidad`, Terms URL `/terminos`, Data deletion instructions URL `/eliminar-datos` (or callback decision), app domains, redirect URI, icon, category, reviewer instructions and screencast.

Arbitrary external customers cannot be assumed able to connect until these are complete.

## 38. Final verdict
**GO — META SOCIAL V1 INTERNAL PRODUCTION BLOCKERS RESOLVED**

- LOCAL PRODUCT CODE / LEGAL PAGES: READY
- META EXTERNAL APPROVAL: PENDING / TO BE VERIFIED

## 39. Exact next phase
A3.5.5.2 — META EXTERNAL ACCESS & APP REVIEW READINESS:
- Meta dashboard configuration;
- Live mode;
- App Review;
- permission access levels;
- Business Verification;
- reviewer instructions and evidence;
- external-user readiness.

Not started. Awaiting explicit authorisation.
