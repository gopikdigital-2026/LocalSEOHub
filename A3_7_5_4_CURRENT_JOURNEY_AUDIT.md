# A3.7.5.4 — Current Customer Journey Audit

Mode: read-only. No source, DB, function or secret change. Date: 2026-11-03.

Legend: **WD** working and demonstrable · **INV** implemented, not verified in production · **MISSING** · **BMA** blocked by Meta approval · **BISG** blocked by internal security gates.

## Code vs production baseline

| Layer | State |
|---|---|
| Edge Functions | All Meta functions ACTIVE: `meta-oauth-start` (jwt), `meta-oauth-callback` (no-jwt, state-protected), `meta-connection`, `meta-read`, `meta-publishing`, `instagram-publishing`, `internal-access`, `publication-media`, `publication-proposals`, `publication-adaptations` |
| Frontend in production | The A3.7.5.3 frontend (permission explanation, separate FB/IG status, publishing step hidden for customers) is **NOT deployed** (approval pending). Production runs the A3.7.5.2 frontend, where the "Facebook publishing" permission step appears to every connected customer. |
| DB | A3.7.5.2 migration applied; 1 `meta_connections` row (connected, IG connected) |

## Journey

| # | Step | Files | Behavior | Class |
|---|---|---|---|---|
| 1 | Registration / login | `src/components/LoginModal.tsx`, `src/app-v2/auth.tsx`, `src/features/email-verification/*`, `supabase/functions/signup-instant` | Email/password; `/signup`, `/login`; AppGuard protects app routes | WD |
| 2 | Business onboarding / tenant | `src/features/first-value/*`, `features/business-memory/BusinessContext.tsx`; `/empezar` (OnboardingGuard) | New user creates business in first-value flow; then `/hoy`. One business per user (`getOwnBusinessId`) | WD |
| 3 | `/fuentes` + Meta OAuth | `features/reality-engine/SourceManager.tsx`, `features/meta-connection/*`, `meta-oauth-start`, `meta-oauth-callback` | Connect → Meta dialog (4 scopes, `auth_type=rerequest`) → callback → completion | WD for app-role users; BMA for external users (Advanced Access) |
| 4 | Facebook Page selection | `MetaPageSelectModal.tsx`, `meta-connection select_page`, `meta_claim_page_selection` | Auto-select single Page; dialog for several; Page/IG uniqueness across tenants | WD (app-role users) |
| 5 | IG professional discovery | `meta-connection` (Page `instagram_business_account`) | connected / not_associated / unsupported / permission_unavailable / api_error | WD (app-role users) |
| 6 | Permission explanation & consent | A3.7.5.3 `metaStatus.ts` / `MetaConnectionCard.tsx` | In code: collapsible ES/EN explanation per scope | INV (code only; not deployed) |
| 7 | Status, reconnect, errors | `MetaConnectionCard.tsx`, `meta-connection recover`, ES/EN `ERROR_DETAIL` | Separate FB/IG status in code (A3.7.5.3); reauth → Reconnect; disconnect with confirmation | Production: WD (combined status) · A3.7.5.3 additions: INV |
| 8 | `/herramientas/social` | `features/social-intelligence/ui/*`; data from `meta_connections`, `meta_sync_state`, `meta_content_items` filled by `meta-read sync` | Page profile, published posts with reactions/comments counts, IG profile + media with likes/comments; deterministic findings. No `/insights` API calls | WD (app-role users) |
| 9 | Content creation & review | `features/publications/validation/PublicationsValidationPage.tsx`, `channel-adaptation/*`, `channel-review/*` | Photo upload → 3 AI proposals → channel adaptation → review/edit | Implemented; only at `/internal/publications-validation` behind InternalGuard → **BISG**; customer route **MISSING** |
| 10 | Publishing controls | `facebook-publish/FacebookPublishHarness.tsx`, `instagram-publish/InstagramPublishHarness.tsx`, `meta-publishing`, `instagram-publishing` | Operator harness only; server arming secrets absent in production | **BISG**; customer UI **MISSING**; Meta side **BMA** (`pages_manage_posts`, `instagram_content_publish`) |
| 11 | Publication results & history | `publication-resume/ResumeBar.tsx` (internal layout), harness status views; table `publication_publish_attempts` (owner SELECT policy present) | No customer history view | **MISSING** (data layer ready, UI internal only) |

## Blockers summary
1. Meta: Live mode + Advanced Access + Business Verification (status UNKNOWN; no evidence in repo or production).
2. Internal: content creation/publishing UI exists only on the internal route; no customer publication flow or history.
3. Deployment: A3.7.5.3 frontend awaiting owner approval.
