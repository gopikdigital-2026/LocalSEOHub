# A3.7.5.4 — Minimal Implementation Plan (not implemented)

Constraints for every step: no change to `supabase/functions/meta-publishing/*` or `instagram-publishing/*`; preserve OAuth state/binding, tenant isolation, page/IG uniqueness, idempotency and duplicate prevention; no new scopes; each step separately approved; deploys only with explicit owner approval.

| Order | Step | Smallest change | Files (expected) | DB / functions | Risk |
|---|---|---|---|---|---|
| P0 | Submission correction | Remove `instagram_manage_insights` from the Meta submission; decide on `business_management` justification | none (Meta dashboard, owner) | none | none |
| P1 | Customer connection & selection | Deploy A3.7.5.3 frontend (already built and tested) | 4 meta-connection UI files | none | low; rollback = previous build |
| P2 | Customer content preparation & review | Add one customer route (e.g. `/herramientas/publicar`) that reuses existing `PublicationsValidationPage`, `ChannelAdaptationPanel`, `ChannelReviewPanel` under AppGuard, shown only when a server-side capability says the user is allowed (reviewer/test entitlement); no new engines | `src/App.tsx` (route), small wrapper page, tools catalog entry gated by capability | reuse `internal_test_entitlements` or `meta-publishing capabilities`; no migration expected | medium: route-count tests and InternalGuard tests need annotated updates |
| P3 | Explicit publication authorization | Reuse the harness publish confirmation inside the customer page with customer copy (ES/EN), visible only with the capability; server gates unchanged (arming + allowlists + entitlement) | wrapper around `FacebookPublishHarness` / `InstagramPublishHarness` UI logic, copy files | none | medium: must not expose internal terminology; harness files are hash-pinned → wrap, don't edit, or re-pin with review |
| P4 | Safe result & history | Read-only list of the user's `publication_publish_attempts` (status, channel, time, permalink) | new small component + repository select (RLS owner policy exists) | verify column grants for authenticated; grant only if missing (would be a migration → separate approval) | low |
| P5 | Restrict publishing consent | Decide whether `enable_publishing_start` should require the review capability server-side (it lives in frozen `meta-publishing/handler.ts` → requires explicit unfreeze authorization) or remain UI-gated | — | possible function change (frozen) | needs owner decision |
| P6 | Reviewer access & instructions | Reviewer account, test business, Page/IG, written test steps, arming runbook (enable → record → disarm → verify) | docs only | secrets set/removed only in authorized window | operational |

## GO / NO-GO criteria for the implementation phase
GO when all hold:
- P1 deployed and verified on production with a real app-role user (R1–R3, R6 recordable).
- P2–P4 implemented, full regression green, typecheck = 20 baseline errors, build passes, frozen hashes unchanged (`58956f46…7606`).
- Ordinary customer accounts cannot reach content publishing UI or publish (tests + production check: arming secrets absent outside window).
- Owner written authorization for the arming window exists before R4/R5.
NO-GO if any: engine hash change without authorization; any customer can publish; recordings rely on simulated results; unused permissions remain in the submission.
