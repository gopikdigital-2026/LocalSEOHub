# A3.7.5.1 — Customer Journey Matrix (ordinary customer, not the owner)

Columns: what exists today, reachable by an ordinary customer?, status, blocker refs (see `A3_7_5_1_BLOCKERS_AND_DEPENDENCIES.md`). Evidence: `A3_7_5_1_COMMERCIAL_READINESS_AUDIT.md`.

| # | Step | What exists | Customer-reachable today | Proven in prod | Status | Blockers |
|---|---|---|---|---|---|---|
| 1 | Register and create a business | Signup + onboarding `/empezar`; one business per user (`businesses_user_id_key`) | Yes | Yes (11 users, 5 businesses) | IMPLEMENTED | — |
| 2 | Connect own FB Page + IG professional account | `/fuentes` MetaConnectionCard → meta-oauth-start → callback → page select → IG discovery | UI yes; Meta consent only for app-role users while app is not Live/Advanced (UNKNOWN) | Owner only (1 connection) | PARTIAL / EXTERNAL | BL-01, BL-02, BL-08 |
| 3 | Authorize Meta publishing permissions | `enable_publishing_start` (pages_manage_posts, instagram_content_publish) in meta-publishing | Entry point lives in internal publishing-access UI only | Owner only | PARTIAL | BL-01, BL-02, BL-06 |
| 4 | Select business and accounts | Business implicit (1 per user); page select modal limited to stored `available_pages`; ≤100 pages | Yes | Owner (single page, auto-select) | IMPLEMENTED (multi-page untested) | BL-08 (dup Page), LOW paging |
| 5 | Generate content in Inteligencia Social | Generation (proposals/adaptations, premium-gated) exists only on `/internal/publications-validation`; `/herramientas/social` is insights-only | No (unlinked internal route) | Owner | MISSING (customer UI) | BL-06 |
| 6 | Review exact text and image | ChannelReviewPanel textarea, save/restore; harness shows "texto exacto" + private image | No (internal) | Owner | PARTIAL | BL-06, BL-10 |
| 7a | Publish FB photo | meta-publishing `facebook_publish` | No: `REAL_PUBLISH_DISABLED` (env gate + user allowlist) | Owner, 1 success | BLOCKED | BL-03, BL-05 |
| 7b | Publish IG single image | instagram-publishing `instagram_publish` | No: env gate, user+publication allowlists, APPROVED_TARGET, internal entitlement | Owner, 1 success (pub D v3) | BLOCKED | BL-03, BL-04, BL-05 |
| 8 | Success / failure / verification-required result | States SUCCEEDED/FAILED/UNKNOWN; IG verify action exists (not wired in UI); FB has no verify | No | Success path only | PARTIAL | BL-07, BL-10 |
| 9 | See content and permalink | Permalink stored on attempt; FB harness shows "View on Facebook"; IG harness does not; no history list | No | Permalinks stored for both | MISSING (customer UI) | BL-06, BL-10 |
| 10 | Reconnect expired / disconnect safely | `reauth_required` detection, recover, cancel, disconnect with Meta revoke + vault forget | UI yes (`/fuentes`) | Not exercised | PARTIAL (untested) | BL-09 |

## Journey verdict

Steps 1 and 4 are customer-ready. Step 2 depends on Meta external access. Steps 3, 5–9 are internal-only or blocked by test gates. Step 10 is implemented but unproven. No ordinary customer can complete the journey today.
