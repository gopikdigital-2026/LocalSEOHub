# A3.7.4.1 — Meta Publishing Security & Persistence Foundation

## 1. Executive verdict

GO — FREEZE A3.7.4.1 META PUBLISHING SECURITY & PERSISTENCE FOUNDATION

All of these are green:
- full regression: 2780/2780 tests across 80 files;
- targeted regression: 503/503 across 11 files;
- `tsc`: 20 errors, all inherited, 0 new;
- `npm run build`: PASS;
- security posture: no new material finding;
- live rolled-back checks: 22 attempt/gate checks and 20 consent/RLS checks, all as expected;
- production: 0 attempt rows, 0 consent rows, 0 rehearsal residue;
- preserved E2E data is untouched.

Nothing was published to Facebook or Instagram.

## 2. Exact scope implemented

The foundation only. Nothing in this stage publishes.
- A persisted publish-attempt ledger with a server-enforced state machine, idempotency and concurrency control.
- Server-side preflight and gate per channel (Facebook Page, Instagram professional account).
- A separate, explicit publishing-consent flow (`pages_manage_posts`, `instagram_content_publish`) that never weakens the existing read-only connection.
- A closed error taxonomy, a Meta error mapper and redaction.
- A capabilities endpoint, used for UI hints only.

Out of scope, and not built:
- Graph publish calls (`/feed`, `/photos`, `/media`, `/media_publish`);
- the Publish UI;
- multi-channel orchestration;
- a `mark_stale` scheduler;
- App Review.

## 3. Files changed

Production:
- `supabase/migrations/20261028132929_a3741_meta_publishing_security_foundation.sql` (new)
- `supabase/migrations/20261028133311_a3741_publishing_consent_decline_guard.sql` (new)
- `supabase/functions/meta-publishing/handler.ts` (new)
- `supabase/functions/meta-publishing/index.ts` (new)
- `supabase/functions/meta-oauth-callback/handler.ts` (additive consent branch; the read-only path is unchanged)
- `src/features/meta-connection/metaPublishingRepository.ts` (new)
- `src/features/meta-connection/MetaCallbackPage.tsx` (handles the consent return)
- `supabase/config.toml` (adds `[functions.meta-publishing]` with `verify_jwt = true`)

Tests:
- `src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts` (new; 45 tests in blocks A–K)
- Authorized re-pins of earlier tests (section 23).

Docs: this report and `A3_7_4_1_FREEZE_MANIFEST.md`.

## 4. Migration/schema

**Migration 1: `public.publication_publish_attempts`**
- Columns: `id`, `publication_id`, `user_id`, `business_id`, `channel` (`facebook`|`instagram`), `draft_version`, `attempt_number`, `status` (`publishing`|`succeeded`|`failed`|`unknown`), `meta_object_id`, `meta_permalink`, `error_code`, `verification_required`, `verification_attempts`, timestamps.
- `idempotency_key`: generated, of the form `publication:channel:vN`.
- One state-shape CHECK constraint.
- Three partial unique indexes (section 8).

**Migration 1: other objects**
- `public.meta_publishing_consent_states`: server-only.
- `meta_connections` gains `page_tasks` and `publishing_consent_at`.
- `meta_connections_reset_publishing` trigger.
- RPCs and the guard trigger.

**Migration 2**
- Decline/downgrade guard: storing consent never removes or weakens existing permissions, and never changes the connection status.

**Remote state**
- Both migrations are applied remotely.
- There are 57 local migration files, consistent with the re-pinned counts.

## 5. RLS/security model

`publication_publish_attempts`:
- RLS is on.
- The only grant is `authenticated: SELECT`.
- Policy `select_own_publish_attempts`: `auth.uid() = user_id` and the business is owned by the caller.
- anon, authenticated and service_role have no INSERT/UPDATE/DELETE grant. All writes go through SECURITY DEFINER RPCs.

`meta_publishing_consent_states`:
- RLS is on, with no grants and no policies. Only the server can reach it.

Functions:
- All 15 A3.7.4.1 functions are SECURITY DEFINER with `search_path = ''`.
- anon and authenticated have no EXECUTE on any of them.
- service_role has EXECUTE on the RPCs only.
- Internal helpers have no grant: `publication_publish_gate`, `meta_publish_channel_issue` and the triggers.

## 6. Attempt state machine

The `publish_attempts_guard` trigger enforces it.
- Allowed transitions: `publishing → succeeded | failed | unknown`, and `unknown → succeeded | failed`.
- Leaving `unknown` requires a recorded verification (`verification_attempts` must increase).
- `succeeded` and `failed` are terminal.
- Identity columns are immutable.

Live proof:
- `finish(failed)` on UNKNOWN returned `invalid_transition`.
- A direct UNKNOWN→FAILED UPDATE was blocked with `publish_attempt_unknown_requires_verification`.

## 7. Idempotency design

The key is generated as `publication:channel:vN` (live proof: matched).
- At most one live attempt exists per (publication, channel, draft_version).
- A FAILED attempt can be retried; the retry gets the next `attempt_number`. Live proof: retry OK with `attempt_number = 2`.

## 8. Concurrency proof

`publish_attempt_begin` locks the publication row FOR UPDATE. Three partial unique indexes back it up:
- one live row per version;
- one active row (`publishing`/`unknown`) per channel;
- one `succeeded` row per channel.

A `unique_violation` maps to `PUBLISH_IN_PROGRESS`. Live proof: a second begin returned `PUBLISH_IN_PROGRESS`.

## 9. Final-draft source of truth

The gate reads `publication_drafts` server-side. The checks are:
- the draft belongs to the publication;
- `source_generation_id` matches the current `proposal_generation_id`;
- the channel text is non-empty.

Text supplied by the client is never accepted. The tests in block D cover this.

## 10. Version conflict handling

`draft_version` is compared to the current draft version. A mismatch returns `VERSION_CONFLICT`. Live proof: begin with version 99 returned `VERSION_CONFLICT`.

## 11. Preflight architecture

`meta-publishing` actions `preflight` and `capabilities` call `publication_publish_preflight` and `meta_publish_capabilities` with service_role. The caller is identified from a verified JWT.

The gate checks, in order:
1. ownership;
2. publication state;
3. draft and version;
4. image;
5. channel connection and permissions;
6. prior attempts.

The first failure is returned as one taxonomy code.

## 12. Facebook eligibility

Requires:
- connection `connected`;
- a Page;
- permissions `pages_show_list`, `pages_read_engagement` and `pages_manage_posts`;
- `CREATE_CONTENT` in `page_tasks`.

Live proof:
- without the permission: `PERMISSION_REQUIRED`;
- with the permission but without CREATE_CONTENT: `PERMISSION_REQUIRED`;
- with CREATE_CONTENT: OK.

## 13. Instagram eligibility

Requires:
- `instagram_status = connected` and an `instagram_account_id`;
- permissions `pages_show_list`, `pages_read_engagement`, `instagram_basic` and `instagram_content_publish`;
- a JPEG image with aspect ratio 0.8–1.91.

Live proof:
- without `instagram_content_publish`: `PERMISSION_REQUIRED`;
- with it: begin OK.

## 14. Permission/consent architecture

The flow is `enable_publishing_start` → Meta OAuth dialog → callback consent branch → `enable_publishing_complete`.

Safeguards:
- The state is single-use and stored only as SHA-256 hashes.
- The pending token is held in Vault.
- A binding hash ties completion to the same browser session.

Live proof:

| Step | Result |
|---|---|
| begin | ok |
| consume | ok |
| replay consume | `consumed` |
| wrong Meta account | `account_mismatch` |
| weaker permissions | `downgrade` |
| no publish permissions | `declined` |
| connection after decline/downgrade | still connected, permissions unchanged |
| store valid consent | ok |
| complete with wrong binding | `binding_mismatch` |
| complete as wrong user | `wrong_user` |
| complete valid | ok |
| complete replay | `unknown` |
| consent recorded | `publishing_consent_at` set |

## 15. CREATE_CONTENT handling

`page_tasks` are stored when consent completes. The `meta_connections_reset_publishing` trigger clears `page_tasks` and `publishing_consent_at` when the status leaves `connected` or the Page changes.

Live proof:
- after disconnect, `page_tasks` was NULL and `publishing_consent_at` was NULL;
- a FB gate without CREATE_CONTENT returned `PERMISSION_REQUIRED`.

## 16. Error taxonomy

There are 15 closed codes:
- AUTH_REQUIRED, REAUTH_REQUIRED, PERMISSION_REQUIRED, CHANNEL_NOT_CONNECTED
- INVALID_PUBLICATION_STATE, VERSION_CONFLICT, IMAGE_UNAVAILABLE, IMAGE_UNSUPPORTED
- META_RATE_LIMITED, META_TEMPORARY_ERROR, META_REJECTED, PUBLISH_OUTCOME_UNKNOWN
- ALREADY_PUBLISHED, PUBLISH_IN_PROGRESS, INTERNAL_ERROR

## 17. Meta error redaction

`redact()` strips:
- EA tokens;
- `access_token` and secret query parameters;
- Bearer tokens;
- signed URLs;
- `fbtrace_id`;
- 64-character hex strings.

`safeErrorLog` logs only numeric codes and the normalized result. The block I tests cover this.

## 18. Retry/UNKNOWN policy

- `mapMetaError` maps transport failures and 5xx responses to UNKNOWN, never FAILED.
- UNKNOWN blocks retry. Live proof: `PUBLISH_OUTCOME_UNKNOWN`.
- UNKNOWN resolves only through `publish_attempt_record_verification`. Live proof: verification "found" → `succeeded`, then the gate returned `ALREADY_PUBLISHED`.
- `publish_attempt_mark_stale` refuses attempts that are too recent. Live proof: `false`.

## 19. Per-channel independence

The indexes and the gate are scoped per channel. Live proof: with Facebook already succeeded, an Instagram begin returned OK, and an Instagram failure followed by a retry was independent of Facebook.

## 20. Test evidence

- `a3741MetaPublishingFoundation.test.ts` has 45 tests in blocks A–K: RLS, idempotency, concurrency, draft source, permissions, eligibility, IG image, state machine, taxonomy/redaction, consent, freeze/scope. All pass.
- The live rolled-back checks were aborted with RAISE EXCEPTION. Afterwards there were 0 rehearsal users, businesses, attempts and consent states.
- Attempt/gate checks 1–22: all as expected (sections 6–19).
  - Foreign user saw 0 rows.
  - Owner saw own rows (3).
  - Browser setting SUCCEEDED was blocked (42501).
  - Finish by the wrong user returned `not_found`.
  - A forged begin as another user returned `INVALID_PUBLICATION_STATE`.
- Consent/RLS checks 19–38 (previous run): all as expected.
  - Browser insert, finish RPC and reading consent states were all blocked (42501).

## 21. Regression evidence

| Check | Result |
|---|---|
| Targeted regression | 503/503 (11 files) |
| Full suite | 2780/2780 (80 files) |
| `tsc` | 20 errors, all inherited, 0 new |
| `npm run build` | PASS |

The 20 inherited `tsc` errors:
- App.tsx: 1
- BusinessAuditLanding: 2
- ContentGeneratorLanding: 2
- DiagnosticLanding: 1
- LandingPage: 10
- MetaAdsLanding: 2
- a3422GbpRecovery.test: 1
- AdminDashboard: 1

The meta-connection consent/pixel/fbq guard (a351 test) still passes. In edge functions, "pixel" appears only in image-pixel comments in publication-media.

Preserved E2E data, checked read-only:
- **Publication A** `65569535-5d89-4df3-a8d4-c2af6df8606d`: version 4, `direct`, MODIFICADO present in both FB and IG text, md5 `2a58f6e4c7c693297ea0fbd537c46373`.
- **Publication B** `442059e5-11e4-4bdd-a5bc-c714b0a03b72`: version 3, `close`, E2E442-FB and E2E442-IG present, md5 `18c54a54da78bd7f51156680c6e6ae52`.
- Both were last written before migration 20261028132929.

## 22. Security review

The advisor reported 12 findings. Only one is attributable to A3.7.4.1:
- INFO `rls_enabled_no_policy` on `meta_publishing_consent_states`. This is intentional: the table is server-only with no API grants.

Inherited findings:
- INFO `rls_enabled_no_policy` on `edge_rate_limits`, `meta_oauth_states`, `stripe_customer_repairs`.
- WARN `function_search_path_mutable` on `get_funnel_stats` (×2).
- WARN `authenticated_security_definer_function_executable` on `billing_status`, `current_user_has_premium`, `save_publication_channel_drafts`, `select_publication_proposal`, `start_trial`.
- WARN `auth_leaked_password_protection`.

Privilege review: as in section 5, verified live.

No-publish proof:
- The `meta-publishing` handler has no `fetch` and no Graph publish endpoint. Its only external URL is the OAuth dialog (Graph v25.0).
- The only `/media` in the codebase is the frozen read-only GET of `/${igId}/media` in `meta-read`.
- Two tests enforce this: the a3733 test (29) and the a3741 K block.

## 23. Freeze/re-pin evidence

All re-pins are test- or manifest-only. No frozen production code changed.

| File | Previous | New | Reason | Behavioral impact | Regression proof |
|---|---|---|---|---|---|
| `auditoria-a2/A3_7_2_FREEZE_MANIFEST.md`, row `a371PublicationsRepository.test.ts` | `5a915591d58138f8372543a05c6a303490df4b56c1f9c7995a963b9a5bc0a12a` | `76ec5d97cdc320d925fff117c2068125848f0d1c68f442e6d3231f98b1a8c38e` | Test covers the additive consent branch of meta-oauth-callback and still proves the read-only path is unchanged | None (test-only) | a3731 manifest test (28 entries) passes; full suite green |
| `src/components/__tests__/a281TrustCleanup.test.ts` | `cb6a925ab209873f69222303e0b7afc27a1ebfe0e4aaf3d6eecba3364da36c92` | `5dec386ec1da6cf6859b0bc569918e082ed494a9bc5f34e869813bb6f641dcee` | Migration count 55→57 | None | Passes |
| `src/features/roadmap/__tests__/a273Roadmap.test.ts` | `1fd5954c53ffa07da661db906f323ede4fffa5509fc66c23e21d2e150cf1fb94` | `2f3281bb3976732f1df8c6c5691c372d11919671a8ed1c74d67792be0d3cef5f` | Count 55→57; filter excludes `_a3741_` | None | Passes |
| `src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts` | `e71fbc7bef4ea63c746bc1ce1b360c8c6529e7c3906b5447d9945a5419fbcf9f` | `aa4e95245b5b187877840b8cbff21858c4b2ad3381d97e5934ebfbc7508d7f9c` | Count 55→57; filter excludes `_a3741_` | None | Passes |
| `src/features/publications/__tests__/a3733ChannelReview.test.ts` | `d62c66187e16c6200e1327b5709def5e2fe781fd344e2202585560249b8759c9` | `6a528660c5ccc30163e9757e7241378920c0d531fdc11fd4af14a4873859785b` | Test 29: the publish-named function list is exactly `['meta-publishing']`, and that function must contain no `/photos`, `/media`, `/media_publish` or `/feed` | Guard strengthened | Passes |
| `a3542SocialFindings.test.ts` md5 pin inside `a3543SocialIntelligenceUi.test.ts` | md5 `ed9f980479601ff14dd9d0613bb7e838` | md5 `a5e806e009ab714fc8d3deda1533f013` | Test 39 also excludes the a3741 migrations | None | Passes |
| `src/features/action-layer/__tests__/a33DiagnosticAction.test.ts` | not pinned by any manifest | `1b88202a16730f98482f789013c1e622d8ee801243f3dfcdf137545fffd40519` | Count 55→57 | None | Passes |
| `src/features/email-verification/__tests__/f03Stage2b.test.ts` | not pinned by any manifest | `42ba933a299ae34058ab70c5ff2e7afc6be2d64ef59d6a1abf360308615122e8` | Count 55→57 | None | Passes |

Notes:
- The A3.7.3.4 test-file re-pins (rows 2–5) are listed explicitly in `AUTHORIZED_REPINS` in the a3741 K block. There is no wildcard. The test asserts that the manifest still records the old hash, that the file equals the new hash, and that exactly this set of files was re-pinned. All other 36 manifest entries are byte-identical.
- Frozen Meta handlers are unchanged:
  - `meta-connection/handler.ts`: `57e8341fbb5172329b5aa71ff9bf70b77256ac86184d24e58bab24c261097ada`
  - `meta-read/handler.ts`: `987cc94b1490ac79204280669e8d1f9834822bbd095f618ea6e3d912653e6166`

## 24. Known limitations

None of these is complete:
- No Facebook content has been published.
- No Instagram content has been published.
- Real CREATE_CONTENT behavior still needs validation against a live granted connection.
- A real `pages_manage_posts` grant still depends on external Meta state.
- A real `instagram_content_publish` grant still depends on external Meta state.
- Instagram signed-URL ingestion has not been tested.
- `mark_stale` has no scheduler.
- There is no final Publish UI.
- There is no multi-channel orchestration.
- No App Review has been submitted.

## 25. Exact next-step recommendation

Freeze A3.7.4.1 using `A3_7_4_1_FREEZE_MANIFEST.md`.

A3.7.4.2 needs separate authorization. It covers:
- the Facebook Page single-photo publish executor built on `publish_attempt_begin`/`finish`;
- a live-granted test connection to validate CREATE_CONTENT and `pages_manage_posts`.

A3.7.4.2 was not started.
