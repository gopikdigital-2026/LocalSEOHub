# A3.5.0 — Meta / Facebook & Instagram Capability Audit

LocalSEOHub.io · Audit only, nothing implemented · 2026-10-21

Evidence tags:

| Tag | Meaning |
|---|---|
| **[CODE]** | Confirmed from the current repository |
| **[DB]** | Confirmed from the live schema (read-only catalog queries, no row data beyond counts) |
| **[VERIFY-META]** | A known requirement that must be checked against current Meta documentation before implementation |
| **[EXT-APPROVAL]** | Needs Meta App Review, Advanced Access or Business Verification |
| **[NOT-MVP]** | Not needed for the first release |

Nothing was modified: no code, migrations, policies, Edge Functions, routes, secrets, Google Business Profile
(GBP), Stripe or Meta Pixel. No secret values were read or printed; only names appear here. Statements about Meta's
platform are written as items to verify, not as facts, because Meta's permission names, review rules and API
versions change frequently and were not checked against live documentation in this audit.

---

## 1. Executive summary

- **There is no Facebook or Instagram business integration in LocalSEOHub today** [CODE][DB]. That means:
  - no Meta OAuth;
  - no Graph API calls;
  - no Meta Edge Function, table, `source_type` value, type, test or secret.
- **Meta Pixel exists and is a separate system** (browser advertising analytics). It shares no code, data or
  credentials with a future business-account integration [CODE].
- **The /fuentes page does not mention Facebook or Instagram**, not even as "coming soon". It does not over-promise
  [CODE]. Some marketing landing pages do mention Facebook/Instagram content, which is a copy-truthfulness point
  (§22).
- **The hardened GBP architecture is a strong conceptual template.** It provides:
  - Vault-backed credentials;
  - service-role-only SECURITY DEFINER functions;
  - server-owned connection state;
  - attempt TTL and recovery;
  - a disconnect wipe and a delete trigger.

  However, its database objects are **hard-coded to Google** (`gbp_*` function names, a trigger keyed on
  `source_type IN ('google_business','reviews')`). Reusing it for Meta needs new, parallel `meta_*` objects;
  Google's objects must not be edited.
- **Critical gap for any future Meta source:** the `authenticated` role can insert and update `status` and
  `metadata` on `connected_sources` for any `source_type`. Only Google rows are protected by the server-owned
  trigger. A Meta row added without an equivalent guard would let the browser fake a "connected" state [DB].
- **External blockers dominate.** The following are outside the codebase and approval cannot be assumed:
  - a Meta app;
  - Business Verification;
  - App Review / Advanced Access for Page and Instagram read permissions;
  - a public privacy policy with a data-deletion path.

  The current privacy policy also says *"No usamos cookies de seguimiento ni publicidad de terceros"* while the
  Meta Pixel is loaded on every visit without a consent gate. This is a pre-existing compliance risk that Meta
  App Review may expose (§21).

**Recommendation for A3.5.1: CONDITIONAL GO** (§25).

---

## 2. Current Meta footprint

| Area | Finding |
|---|---|
| Meta business integration (OAuth, Graph API, Pages, Instagram) | **None** [CODE] |
| Meta Pixel (browser) | Present: `index.html` L55–97, `src/lib/pixel.ts`, `src/features/conversion/MetaPixelTracker.tsx` [CODE] |
| Meta Conversions API (server) | **None**. No `graph.facebook.com` call under `supabase/functions`. `pixel.ts` supports an `eventId` for future deduplication only [CODE] |
| Edge Functions | No Meta function [CODE] |
| Tables / migrations | No Meta table, column or migration [DB][CODE] |
| `source_type` values in DB | Only `google_business` (3 rows: connecting / disconnected / error) [DB] |
| `SourceType` TS union | `google_business, website, reviews, search_console, analytics, manual`; no social type [CODE] |
| Edge secrets (names) | `SUPABASE_*`, `LocalSEO_AI`, `LocalSEO_KEY`, `STRIPE_*`, `ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SITE_URL`. **No `META_*`, `FB_*`, `FACEBOOK_*` or `INSTAGRAM_*`** |
| Local env (names) | No `META_*`, `FB_*` or `VITE_META*` names. The Pixel ID is a public constant in code, which is normal for a Pixel |
| Other facebook/instagram mentions | Marketing copy (`ContentGeneratorLanding`, `GrowthPlanLanding`, `CopilotLanding`, `DiagnosticLanding` "Redes Sociales"); in-app browser detection (`src/lib/socialWebView.ts`, `LoginModal`); the `MetaAdsLanding` ad landing page; Competitor Radar extraction of facebook.com / instagram.com **links** from competitor websites (`competitor-radar-v2/extract.ts`). None of these touch Meta APIs |
| Tests | Pixel/conversion tests (`a3Conversion.test.ts`, `a31PurchaseActivation.test.ts`, plus incidental mentions). No tests for a business integration |
| Dormant/legacy code | None for Meta business accounts |

## 3. Meta Pixel vs business integration separation

| | Meta Pixel (exists) | Facebook/Instagram business integration (future) |
|---|---|---|
| Purpose | Ad attribution for LocalSEOHub's own marketing | Reading a customer's own Page / IG professional data |
| Whose data | LocalSEOHub visitors (browser events) | The authenticated business owner's Page/IG assets |
| Credential | Public Pixel ID | Per-user OAuth user token and derived Page tokens (secret) |
| Where it runs | Browser (`fbq`) | Server only (Edge Functions + Vault) |
| Meta app | Pixel / Events Manager | A Meta developer app with Facebook Login (for Business) |
| Code | `index.html`, `pixel.ts`, `MetaPixelTracker.tsx`, conversion helpers | None yet |

**Rule for the future:** the integration must not import from `src/lib/pixel.ts` or reuse the Pixel ID, and
the Pixel must never receive Page/IG data. A3.2 (`A3_2_META_DELIVERY_DIAGNOSTIC.md`) audited Pixel delivery
(verdict MIXED) and is unrelated to this scope.

## 4. Existing frontend/UI references

- **Route** `/fuentes`, served by `src/App.tsx` → `SourceManagerPage`, with a navigation entry in `AppShellV2.tsx`
  [CODE].
- **Source cards** (from `src/features/reality-engine/registry.ts`):

| Source | Visible name | State/behaviour | Backend | Data provenance |
|---|---|---|---|---|
| `google_business` | Google Business Profile | Interactive, Google OAuth | `gbp-*` Edge Functions | Verified (Google API) |
| `website` | Sitio web | Interactive | `analyze-website` | Analysed |
| `reviews` | Reseñas de Google | Follows GBP, not separately connectable | `gbp-sync`, `gbp-reviews` | Verified |
| `search_console` | Google Search Console | `comingSoon`, "Todavía no está disponible" | None | n/a |
| `analytics` | Google Analytics | `comingSoon` | None | n/a |
| `manual` | Entrada manual | Interactive | DB only | Declared ("no los verificamos") |
| **Facebook / Instagram** | **Not present** | n/a | n/a | n/a |

- **Status labels available** (`sourceStatus.ts`): verified, analyzed, declared, pending, in_progress
  ("Conectando…"), selecting ("Elige tu ficha"), syncing, expired, permissions, error, unavailable, coming_soon.
  These are reusable for Meta (§16).
- **The /fuentes UI does not suggest any Meta functionality** that doesn't exist.
- **Marketing landings do mention Facebook/Instagram posts** (see §22).

## 5. Existing backend references

- **No Meta Edge Function.** GBP functions, useful as a pattern only [CODE]:

| Function | Responsibility |
|---|---|
| `gbp-oauth-start` | Creates the server-owned attempt: random state via `crypto.getRandomValues`, stored in `metadata.oauth_state`, `phase: authorizing`. Builds the consent URL from `GOOGLE_CLIENT_ID` and `GOOGLE_REDIRECT_URI` |
| `gbp-oauth-callback` | Matches the state server-side; exchanges the code; stores tokens via `gbp_store_credentials` (Vault); discovers accounts; writes a terminal state with a specific error code |
| `gbp-list-locations` | Lists selectable assets for the user, server-side token use |
| `gbp-sync` | Persists the selected asset, fetches verified data, writes `source_sync_events` |
| `gbp-recover-attempt` | Ends stale or cancelled attempts (TTL), so there is no infinite "Conectando…" |
| `gbp-disconnect` | Revokes, wipes credentials and resets the row |
| `gbp-reviews` | Reads review data, with entitlement checks |
| `gbpToken.ts` (shared) | Refresh, expiry and error mapping |

- **AI functions** use a shared reservation ledger (`reserve_ai_usage`, `settle_ai_usage`, `reconcile_ai_usage`)
  with per-function `entitlement.ts` files.

## 6. Existing database architecture

**`connected_sources`** [DB]

- **Columns:** `id`, `user_id` (FK auth.users, ON DELETE CASCADE), `business_id` (text), `source_type` (text,
  **no CHECK constraint**), `status`, `external_account_id`, `external_location_id`, `access_token_encrypted`,
  `refresh_token_encrypted` (Vault references), `token_expires_at`, `last_sync_at`, `last_error`, `metadata`
  (jsonb), `verified_profile` (jsonb), `verified_at`, `created_at`, `updated_at`.
- **Constraints:**
  - `UNIQUE (user_id, business_id, source_type)`, so there is one row per source per business;
  - `connected_sources_disconnected_no_credentials`, which stops a disconnected row from holding credentials.
- **RLS:** enabled. There are 4 per-verb policies scoped `TO authenticated` with `auth.uid() = user_id`.
- **Grants (authenticated):**
  - DELETE on the whole table;
  - INSERT on `user_id, business_id, source_type, status, external_*, last_error, metadata`;
  - UPDATE on `status, external_*, last_sync_at, last_error, metadata, updated_at`;
  - credential columns are not client-writable;
  - anon has no access.
- **Triggers:**
  - `connected_sources_server_owned_gbp` rejects anon/authenticated writes **only for `google_business` and
    `reviews`**;
  - `connected_sources_clear_on_disconnect` and `connected_sources_forget_on_delete` handle the Vault wipe.

**`source_sync_events`** [DB]

- **Columns:** `id`, `user_id`, `source_id` (FK, CASCADE), `source_type`, `event_type`, `message`,
  `records_updated`, `error_details`, `created_at`.
- **RLS:** own rows. Authenticated may SELECT, INSERT and DELETE, so **events are client-forgeable** for the
  owner's own rows. That is acceptable for UX logs, but not as an audit trail.

**`businesses`** [DB]: owner-scoped RLS (`auth.uid() = user_id`). This is the business context for AI.

**Storage:** there are **no storage buckets** [DB]. There is no user photo/asset upload infrastructure.

**Reuse verdict:** `connected_sources` can hold a Meta row conceptually:

- a new `source_type`, e.g. `meta_facebook_page` / `meta_instagram`, or one `meta` row with IG in metadata;
- `external_account_id` = the Page ID;
- `external_location_id` = the IG professional account ID;
- `verified_profile` = the verified snapshot.

This works **without changing Google's implementation**, provided a *new* server-owned trigger and *new*
`meta_*` credential functions are added. Editing the GBP trigger to add Meta types would modify a frozen
system, so it must not be done.

## 7. Existing security architecture

| Capability | Exists (GBP) | Reusable for Meta as-is? |
|---|---|---|
| Server-only credential access | Yes: `gbp_read/store/clear_credentials`, EXECUTE for `service_role` only | Pattern yes, objects no (named and labelled `gbp`) |
| Encrypted storage | Supabase Vault (`vault.create_secret`) via `gbp_vault_put/reveal/forget` | Same Vault; needs `meta_*` wrappers |
| Token rotation/replacement | `gbp_vault_put` updates in place; `gbpToken.ts` refresh | Meta tokens follow a different model (long-lived exchange, Page tokens, no OAuth refresh_token) [VERIFY-META] |
| Disconnect + wipe | `gbp-disconnect` + `clear_on_disconnect` trigger + CHECK constraint | The trigger and CHECK are generic on credential columns; disconnect logic is Google-specific |
| Delete wipe | `forget_on_delete` trigger | Generic; review needed to confirm it handles any source |
| Revoked access | Code-mapped (`permissions_required`, `GBP_PERMISSION_DENIED`) | Concept reusable; Meta error codes differ [VERIFY-META] |
| Expiry | `token_expires_at`, attempt TTL, recovery function | Concept reusable |
| User ownership | RLS `auth.uid() = user_id` | Yes |
| Business ownership | `business_id` text, `UNIQUE(user, business, source)` | Yes (`business_id` is text, not FK-enforced; pre-existing) |
| Server-owned state | Trigger limited to google_business/reviews | **No.** Needs a Meta equivalent |
| Audit events | `source_sync_events` (client-insertable) | UX only; not tamper-proof |

## 8. Reusable infrastructure

- **Data and access:**
  - the `connected_sources` row model;
  - RLS policies;
  - credential-column grants;
  - the disconnect CHECK constraint;
  - Vault.
- **Process:** the GBP *patterns*:
  - state attempt with TTL;
  - server callback;
  - asset picker (cf. "Elige tu ficha");
  - recover-attempt;
  - fixed-string logging with no secrets;
  - test style using dependency-injected handlers.
- **UI:**
  - the /fuentes registry and `SourceCard`;
  - status labels;
  - provenance labels (verified / analyzed / declared);
  - `comingSoon` flag.
- **AI:**
  - `businesses` context;
  - the AI ledger (`reserve_ai_usage`, `settle_ai_usage`);
  - `entitlement.ts`;
  - `weekly-content` and `prepared-replies` (generate → edit → copy flows).
- **Actions:** the `actions/rules.ts` engine reads `ctx.sources` by `sourceType` and already creates "connect
  source" and "source error" actions linking to `/fuentes`.

## 9. Missing infrastructure

1. **Meta app and secrets.** Names to be decided, e.g. `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`;
   none exist.
2. **Meta Edge Functions:** start, callback, list-assets, select, sync, recover, disconnect, and the
   data-deletion callback.
3. **`meta_*` Vault credential functions** (service-role only) and a **server-owned trigger for Meta source
   types**.
4. **A `source_type` value** in the TS union and registry, plus a card on /fuentes.
5. **A data-deletion endpoint** (deauthorize / data-deletion callback) and a public deletion instructions page
   [VERIFY-META].
6. **A public privacy policy page** (currently a modal only), covering Meta data use; plus a fix for the
   existing cookies statement.
7. **A tamper-proof audit trail** (optional; server-only insert).
8. **For the later AI content layer:** user asset storage (no buckets exist) and a new AI ledger function key
   (the `ai_usage_reservations_function_check` constraint allows only 6 functions; adding one is a design
   decision, §17).
9. **A Meta Graph API version pin** and an upgrade policy.

## 10. Facebook Page capability requirements

| Need | Status |
|---|---|
| A. User authorizes LocalSEOHub via Facebook Login (for Business) | [VERIFY-META] login product and configuration type; [EXT-APPROVAL] for non-test users |
| B. List Pages the user manages | [VERIFY-META] a "pages list"-type permission; likely [EXT-APPROVAL] |
| B. User picks one Page; store the Page ID; derive a Page token server-side | [VERIFY-META] |
| C. Read Page basics (name, category, about, website, phone, hours, location, link) | [VERIFY-META] Page read permission; [EXT-APPROVAL] likely |
| C. Read recent Page posts (timestamps, type) | [VERIFY-META] Page content read permission; [EXT-APPROVAL] likely |
| C. Page insights/metrics | [VERIFY-META] availability has changed over time; treat as OPTIONAL |
| Reviews/recommendations on Pages | [NOT-MVP]; availability uncertain [VERIFY-META] |

## 11. Instagram professional account requirements

| Need | Status |
|---|---|
| IG account must be Business or Creator (professional), not personal | Prerequisite [VERIFY-META]; personal accounts are out of scope by design |
| Discover the IG professional account linked to the selected Page (Facebook Login path) or via Instagram Login (alternative path) | [VERIFY-META]; pick ONE path for MVP |
| Read IG profile basics (username, name, biography, website, followers/media counts where exposed) | [VERIFY-META] IG basic permission; [EXT-APPROVAL] likely |
| Read recent media (timestamp, type, caption, permalink; like/comment counts where exposed) | [VERIFY-META] |
| IG insights (reach, impressions, profile views) | OPTIONAL; separate insights permission; often restricted by thresholds or retention windows [VERIFY-META][EXT-APPROVAL] |
| Audience demographics | [NOT-MVP]; often threshold-gated |

## 12. Candidate permission matrix

These are permission *categories*. The exact names must be confirmed against current Meta docs; none should be
requested yet.

| Capability category | Class | Verify docs | App Review / Advanced Access | Restricted? | Request now? |
|---|---|---|---|---|---|
| Public profile/identity of the authorizing user | MVP READ | Yes | Usually default | No | No |
| List Pages the user manages | MVP READ | Yes | Likely | Moderate | No |
| Read Page engagement/content | MVP READ | Yes | Likely | Moderate | No |
| Read Page metadata/settings | MVP READ (only if needed beyond the above) | Yes | Likely | Moderate | No |
| Business asset access via Business Manager | OPTIONAL | Yes | Likely + Business Verification | Yes | No |
| IG professional account basic read | MVP READ | Yes | Likely | Moderate | No |
| IG insights | OPTIONAL | Yes | Likely | Yes | No |
| Page insights | OPTIONAL | Yes | Likely | Yes | No |
| Publish to Page | LATER PUBLISHING | Yes | Yes | Yes | **No** |
| Publish to IG (content publish) | LATER PUBLISHING | Yes | Yes | Yes | **No** |
| Comments / messaging management | NOT REQUIRED | n/a | Yes | Yes | **No** |
| Ads management / ads read | NOT REQUIRED | n/a | Yes | Yes | **No** |
| Personal profile data (friends, posts, photos of the person) | NOT REQUIRED, never | n/a | n/a | n/a | **Never** |
| Webhooks (Page/IG change subscriptions) | NOT-MVP | Yes | Depends on subscribed fields | Varies | No |

**Principle:** MVP = identity + list Pages + read one Page + read one linked IG professional account. Nothing
else.

## 13. App Review / external approval risks

- **Development vs Live mode** [VERIFY-META]. In development, only app roles and test users can authorize. Real
  customers need Live mode plus approved permissions. This mirrors the current Google block, where an
  approval-gated API caused the first production failure (A3.4.2.2 §17).
- **Business Verification** is likely required for Advanced Access [EXT-APPROVAL].
- **App Review needs:**
  - a working, reviewable flow (screencast);
  - a test account;
  - a clear justification per permission;
  - public privacy policy and terms URLs;
  - data-deletion instructions or callback [VERIFY-META].
- **Rejection risk if:**
  - permissions are broader than the demonstrated use;
  - the privacy policy contradicts actual behaviour (see the §21 cookie statement);
  - the reviewer can't reach the feature.
- **Timeline uncertainty.** Approval cannot be assumed or scheduled. The product must handle "API unavailable"
  gracefully from day one.

## 14. Proposed Social Intelligence MVP (design only)

**Flow: CONNECT → READ → UNDERSTAND → RECOMMEND.** No publishing.

1. **Connect:**
   - one card "Facebook + Instagram" on /fuentes;
   - server-owned OAuth attempt with TTL;
   - Page picker;
   - IG auto-detected from the Page, or "no professional IG linked".
2. **Read:**
   - a one-shot sync of Page basics, last N Page posts, IG profile basics and last N IG media;
   - a stored verified snapshot (`verified_profile`-style), never live-proxied to the browser with tokens.
3. **Understand:** derived signals (§15), computed deterministically.
4. **Recommend:**
   - rule-based actions into the existing actions engine (e.g. "Tu Página no tiene web ni teléfono", "No has
     publicado en 30 días en Instagram");
   - optional AI explanation labelled as recommendation.

## 15. Proposed supported metrics with provenance classification

Only metrics plausibly backed by legitimate Meta read access. All entries are subject to [VERIFY-META].

| Metric | Provenance |
|---|---|
| Connection status, connected Page name, IG username | REAL META DATA |
| Page fields present: category, about, website, phone, hours, address | REAL META DATA |
| Page/IG follower count (where exposed) | REAL META DATA |
| IG biography, website link, media count | REAL META DATA |
| Recent post dates, post type (image/video/reel/carousel), caption text | REAL META DATA |
| Like/comment counts on recent posts (where exposed) | REAL META DATA |
| Profile completeness score (fields present / expected) | DERIVED LOCALSEOHUB METRIC |
| Days since last post; posts per week (last 30/90 days); posting consistency | DERIVED |
| Average interactions per recent post (from exposed counts only) | DERIVED |
| NAP consistency: Page phone/web/address vs business profile vs GBP | DERIVED |
| Content mix (share of video/reels vs images) | DERIVED |
| "What to improve this week", caption suggestions | AI RECOMMENDATION |
| Reach, impressions, profile visits | REAL META DATA **only if** the insights permission is granted; otherwise "No disponible" |
| Demographics, competitor social metrics, leads, revenue, DMs | **Not proposed** (unavailable or out of scope; never estimated) |

## 16. Required UX states

Map to existing `SourceStatus` and labels where possible. Each state has an explicit exit; none is
indefinite.

| State | DB status / code | Visible label (proposal) | Exit |
|---|---|---|---|
| Not connected | `disconnected` | Pendiente de conexión | Connect |
| Connecting | `connecting`, phase `authorizing` + TTL | Conectando… | Callback, cancel, or TTL → expired |
| Authorization cancelled | `disconnected` + `USER_CANCELLED` | Conexión cancelada | Retry |
| Authorization denied / permissions declined | `permissions_required` | Faltan permisos | Re-authorize |
| No Facebook Page available | `disconnected` + `NO_PAGES` | No encontramos Páginas que administres | Help link, retry |
| Selecting Page | `connecting`, phase `select_page` | Elige tu Página | Select or cancel |
| Page selected / connected | `connected` | Conectada y verificada | n/a |
| No professional IG linked | `connected` + metadata `ig: none` | Instagram: no vinculado (cuenta profesional necesaria) | Help, re-sync |
| Instagram connected | `connected` + IG ID | Instagram conectado | n/a |
| Sync in progress | `syncing` | Sincronizando… | complete / error |
| Sync complete | `connected`, `last_sync_at` | Actualizado hace X | n/a |
| Partial data | `connected` + metadata `partial: [...]` | Datos parciales (lists unavailable items) | n/a |
| Token expired | `permissions_required` + `TOKEN_EXPIRED` | Vuelve a conectar | Re-authorize |
| Permission revoked (in Meta) | `permissions_required` + `PERMISSION_REVOKED` | Acceso retirado en Meta | Re-authorize |
| API unavailable / app not approved | `error` + `META_API_UNAVAILABLE` | Meta no está disponible ahora | Retry later |
| Rate limited | `error` + `META_RATE_LIMITED` | Meta está limitando las conexiones | Retry later |
| Disconnected | `disconnected`, credentials wiped | Pendiente de conexión | Connect |
| Generic error | `error` + code | Error de conexión | Retry |

## 17. Future AI Content Layer architecture (design only)

```
businesses (context) + user asset + social snapshot + objective
        ↓
AI proposals → user picks → user edits → channel version (FB / IG) → copy or (later) publish
```

- **Reusable:**
  - `businesses` context;
  - the AI ledger and `entitlement.ts` pattern;
  - `weekly-content` and `prepared-replies` generate/edit/copy UX;
  - `LocalSEO_AI` provider secret (name only).
- **Missing:**
  - user asset upload (no storage buckets; would need private, owner-scoped buckets with type and size
    validation);
  - image handling.
- **Design decision (not taken):**
  - a new AI quota/function key (e.g. `social-content`) requires extending
    `ai_usage_reservations_function_check` and `ai_usage_monthly` counters in a future migration;
  - existing caps must stay unchanged.

## 18. Future publishing architecture (design only)

- The user must approve every post. There is no auto-publishing.
- A server-side publish function reads the Page token from Vault and posts to the selected Page or IG account.
  The result is stored with the post ID and permalink.
- It must be **idempotent**, using a per-draft publish token, to avoid double posts.
- IG publishing typically needs media hosted at a public URL and a container → publish two-step process
  [VERIFY-META]. This implies public or short-lived signed asset URLs, which is a security design point.
- It requires separate publishing permissions [EXT-APPROVAL] and its own App Review cycle.

## 19. Integration points

| Area | How Meta intelligence could feed it |
|---|---|
| Fuentes | New card; status/provenance via existing registry and labels |
| Hoy | `actions/rules.ts` already turns source state into priorities (`connect_*`, source-error rules); add Meta rules (inactive IG, incomplete Page) |
| Plan | Roadmap consumes actions; Meta actions appear as "Presencia social" steps |
| AI Business Advisor | Pass verified social snapshot as labelled REAL / DERIVED context |
| Digital Twin | Add a "social presence" block; show "No disponible" when not connected |
| Reports | Weekly summary: posts this week, days since last post (derived), recommendations (AI) |

No cross-tool integration is implemented.

## 20. External Meta Developer checklist (for Manuel; not performed)

| Item | Mark |
|---|---|
| Meta developer account | REQUIRED |
| Meta app created with the correct use case (Facebook Login for Business / Page and IG management) | REQUIRED, TO VERIFY type |
| Business portfolio linked; Business Verification | LIKELY REQUIRED |
| Facebook Login configured; valid OAuth redirect URI (HTTPS, exact match) | REQUIRED |
| App domains / allowed domains (localseohub.io) | REQUIRED |
| Public privacy policy URL (a page, not a modal) mentioning Meta data | REQUIRED |
| Terms of service URL | LIKELY REQUIRED |
| Data deletion instructions URL or data-deletion callback | REQUIRED, TO VERIFY form |
| App icon, category, contact email | REQUIRED |
| Development mode testing with app roles / test users | REQUIRED |
| A test Facebook Page plus a linked IG professional account for review | REQUIRED |
| App Review submission per permission (screencast, justification) | REQUIRED for non-test users |
| Advanced Access for Page/IG read permissions | LIKELY REQUIRED |
| Switch app to Live mode | REQUIRED |
| Publishing permissions and their review | ONLY FOR PUBLISHING |
| Webhooks configuration | TO VERIFY (not MVP) |
| Graph API version pin and deprecation calendar | REQUIRED (operational) |

Approval status: unknown. Nothing has been requested.

## 21. Security risks

1. **Client-writable state for non-Google sources.** Authenticated users can insert or update
   `status`/`metadata` on any `source_type`. A Meta source must ship with a server-owned trigger in the same
   change [DB].
2. **Page tokens are powerful.** They must live only in Vault, be read only by service-role functions, and never
   be sent to the browser or put in logs or URLs.
3. **OAuth state/CSRF.** Server-generated random state, single use, TTL, matched server-side (the GBP pattern).
4. **Data-deletion callback** must verify Meta's signed request [VERIFY-META] and wipe Vault plus snapshot.
5. **`source_sync_events` is client-insertable.** It must not be used as an authorization or compliance
   audit.
6. **Pre-existing compliance gaps:**
   - the Pixel fires `PageView` on every visit with no consent gate;
   - the privacy policy says no third-party tracking or advertising cookies are used.

   This is unrelated to the integration code, but is a likely App Review and GDPR finding. **Not fixed**
   (Pixel and legal are frozen in this scope).
7. **Future asset uploads** need private buckets, owner-scoped paths, and MIME/size validation.
8. **Over-broad scopes** increase breach impact and rejection risk.

## 22. Product risks

- **Approval dependency.** As with GBP, the feature may be built but unusable for real users for an
  indeterminate time. The UI must say so truthfully.
- **Personal accounts.** Many small businesses run personal Instagram accounts or Pages they don't administer.
  The flow must explain the professional-account requirement clearly.
- **Thin data.** Insights may be unavailable, so the MVP must still be valuable using profile and post-cadence
  signals alone.
- **Copy truthfulness.** Landing pages mention Facebook/Instagram content; `ContentGeneratorLanding` says
  "Publicaciones para Google Business Profile, Facebook e Instagram". That is acceptable if it means
  generated text to copy, but it must not imply connection or publishing until those exist. Review is
  recommended; nothing was changed.

## 23. Technical risks

- Graph API versioning and deprecations, and changes to field availability.
- The token model differs from Google's: short-lived to long-lived exchange, Page tokens, and no standard
  refresh token [VERIFY-META]. `gbpToken.ts` logic is not reusable as-is.
- One `connected_sources` row per (user, business, source_type). Representing Page + IG may need two types or a
  structured metadata design; this should be decided before migration.
- `business_id` is text with no FK; this is a pre-existing limitation.
- Rate-limit headers and usage throttling must be mapped to explicit states.

## 24. Recommended implementation phases

| Phase | Scope |
|---|---|
| **A3.5.1** | External setup + design freeze, no user-facing feature: create Meta app (dev mode); decide Login path (FB Login for Business vs Instagram Login); confirm exact permission names; public privacy/data-deletion pages decision; finalize data model (`source_type` values, trigger, `meta_*` Vault functions) |
| **A3.5.2** | Backend skeleton in dev mode: migration (new server-owned trigger, `meta_*` credential functions, service-role only); start/callback/recover/disconnect/deletion functions; tests mirroring GBP |
| **A3.5.3** | Page picker + read sync + /fuentes card (all UX states), test users only |
| **A3.5.4** | Social Intelligence derived signals + actions into Hoy/Plan |
| **A3.5.5** | App Review submission → Live mode |
| **Later** | AI content layer (asset storage, new quota decision); then user-approved publishing (separate review) |

## 25. Recommendation for A3.5.1

**CONDITIONAL GO.**

The codebase has a clean slate for Meta: no conflicting code, no false UI promises, and a proven GBP security
pattern to mirror. A3.5.1 may proceed as **setup and design only** under these conditions:

1. No user-facing Meta feature until Meta app configuration and permission names are verified against current
   docs.
2. Any Meta data-model change ships with its own server-owned trigger and `meta_*` Vault functions. GBP objects
   must not be edited.
3. The privacy policy / Pixel-consent discrepancy is acknowledged and scheduled before App Review, because it
   is a likely blocker.
4. The minimum-permission set in §12 is respected; no publishing, messaging or ads scopes are requested.
