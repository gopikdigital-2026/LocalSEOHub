# Project memory

## Product intent & audience

- LocalSEOHub.io — SaaS for local SEO management targeting small/medium businesses and the agencies managing them.
- Core integrations: Google Business Profile (GBP), Facebook, Instagram; GBP is the current audit focus.
- Multi-tenant product intended to support multiple businesses per user; pilot goal: 20 real businesses.
- Recommendation engines named **Hoy** (Today) and **Tu Semana** (Your Week) consume synced GBP data.
- Subscriptions/billing handled via Stripe.

## Brand personality & voice

- Spanish-language product and user-facing artifacts (UI copy, reports, commit/audit narratives).
- Technical communication tends toward structured, audit-style reports with severity tiers (P0–P3) and explicit verdicts.

## Visual design & UX direction

- Vite + React + JSX + Tailwind CSS; Lucide React for icons. No additional UI/theme/icon packages.
- Production-quality, non-cookie-cutter UI expected by default.
- `/fuentes` (Sources) page surfaces integration status: connection state, verification, last sync, active source count.

## Decisions, constraints & rationale

- Stack: Node.js/Vite/React frontend; Supabase backend (RLS, Edge Functions, migrations).
- Google Cloud project: `localseohub-500916`; GBP API `mybusinessbusinessinformation.googleapis.com` enabled; production connected via Gopik Digital account.
- **Frozen modules — do not modify:** Facebook, Instagram, Tu Semana, Hoy, Stripe, Authentication, database/migrations, production config.
- GBP-02 task was read-only audit only: no code changes, no migrations, no secret changes, no deploys, no external posts.
- Deliverables produced: `GBP_02_FINAL_AUDIT_REPORT.md`, `GBP_02_TEST_REPORT.md`, `deliverables/localseohub-gbp02-final-audit.zip` (secret-scanned).
- Audit verdict: **NO-GO** for 20-business pilot readiness.

## Open questions & assumptions

- Assumption: single business per user in current OAuth/sync flow — needs verification before multi-business rollout.
- Known issue: GBP review fetch failures may display "0 verified" without surfacing the error.
- Preexisting TypeScript and lint failures remain unaddressed (build compiles); not introduced by this audit.
- 3,247 existing tests pass; two new simulations reproduced verification defects.
- Multi-tenant isolation (RLS, Edge Function authz, cross-tenant GBP access) still pending manual validation.
- Awaiting explicit authorization before any corrective implementation work.