# A3 — Conversion & Revenue Tracking (incl. A3.1 completion)

## 1. Executive summary
Meta Pixel 2022587961640258 with a single init; controlled PageView (initial + SPA, no double counting, auth-token landings skipped); CompleteRegistration only on a confirmed registration; InitiateCheckout after a valid server-created Checkout; **Purchase wired** to the subscription row written only by the payment system, gated by a checkout started from the same browser; **Activation wired** to the existing `first_value_reached` milestone. 0 migrations; Auth, Stripe business logic, A2.7 and engines untouched. **A3: PASS.**

## 2. Analytics before A3
Internal `track()` → `analytics_events` (typed events). `useAuth` emits `register_success`/`login_success` (10 s heuristic). Server emits `checkout_started` (stripe-billing), `checkout_completed`, `subscription_activated`, `payment_failed` (stripe-webhook). Activation milestones persisted in `first_value_progress.milestones`.

## 3. Pixel before
- index.html base script with **old ID 7692881320839391** (init + noscript).
- Initial PageView only; `trackPageView` existed but was never called; Meta's automatic pushState tracking was implicitly on (uncontrolled SPA PageViews).
- `CompleteRegistration` fired from 6 landing pages on lead forms **and on plain logins** (CopilotLanding/GrowthPlanLanding login mode, PotentialLanding magic-link sign-in), plus LoginModal `signed_in` signup branch.
- No InitiateCheckout, Purchase or Activation.

## 4. Pixel final
ID 2022587961640258 in init and noscript; old ID absent from source. `autoConfig` disabled (no automatic button-text events). `fbq.disablePushState = true`. Not changed in A3.1.

## 5. Init location
Only `index.html` (single `fbevents.js`, single `fbq('init')`). `src/lib/pixel.ts` never inits; it only sends events and no-ops if the pixel is blocked.

## 6. PageView strategy
Initial PageView in index.html; later PageViews from `MetaPixelTracker` (mounted once inside `BrowserRouter` in `main.tsx`) on **pathname** change only. First mount / StrictMode re-runs are no-ops; query-only changes (e.g. `?checkout=` cleanup) do not count. Meta's history listener disabled → no double count. URLs carrying `access_token`, `refresh_token`, `token_hash`, `code=` or `token=` skip the initial PageView so one-time auth tokens never reach Meta. Payload `{}`. Not changed in A3.1.

## 7. CompleteRegistration
- **Trigger:** `isConfirmedRegistrationSession(user)` — `email_confirmed_at` present and `last_sign_in_at` within 10 min after it (server timestamps only). Evaluated in `MetaPixelTracker` from `useAuth().user`.
- **Not fired:** modal open, typing, create click, "Revisa tu correo", unconfirmed users, normal logins.
- **Google:** first Google sign-in counts once; returning Google user (old `email_confirmed_at`) → none.
- **Dedupe:** `localStorage pixel:complete_registration:<userId>` marked before firing. Payload `{}`.
- Auth files untouched. **Residual:** hash-locked `LoginModal.tsx` keeps a `trackCompleteRegistration()` call in its `signed_in` signup branch; with Confirm email ON that branch never runs. Not changed in A3.1.

## 8. Activation (wired in A3.1)
- **Signal reused, no new concept:** the existing `first_value_reached` milestone ("first useful result": onboarded business with minimum profile + first useful action started/completed), computed by `milestonesFor` and persisted by `recordMilestones`.
- **Hook:** `activation/service.ts → advanceActivation`, inside the existing loop that emits the internal funnel event only for milestones **newly persisted** (`result.added`, after the existing backfill filter). When that milestone is `first_value_reached` it calls `trackFirstValueActivation(userId)` → `trackCustom('Activation', {})`.
- **Dedupe, two layers:** (1) server row: a milestone already stored is never "added" again → reloads, remounts, other tabs, new sessions, second tool → no event; (2) `localStorage pixel:activation:<userId>` → one per user/browser even if the user creates a second business.
- **Payload:** `{}` — no content, prompts, business, competitor, Advisor or Google data.

## 9. InitiateCheckout trigger
In `useBillingAction.run`: only when action is `checkout` and the server returned a URL that passed the existing `https://checkout.stripe.com/` check, immediately before `window.location.assign`. Not on billing visit, price view or any error. Payload `{value: 9.99, currency: 'EUR'}`. A3.1 only adds `markCheckoutStarted()` right next to it (see 10); the event itself is unchanged.

## 10. Purchase signal (wired in A3.1)
**Why `?checkout=success` is not enough:** it only proves a redirect happened; it can be revisited, typed, bookmarked or shared and says nothing about payment.

**What the URL does now:** exactly what it did before — it starts the existing single `sync` (the server re-reads Stripe and applies the snapshot). After that sync, BillingPage calls `trackPurchaseAfterCheckout()` once. That function fires Purchase only if **all** of these hold:
1. this browser has a checkout mark (`pixel:checkout_started_at`, a timestamp only), set when the server returned a valid Checkout URL — otherwise it returns without reading anything;
2. `billing_status` (existing RPC, unchanged) reports `SUBSCRIPTION_ACTIVE` with `has_premium`;
3. the user's own `stripe_subscriptions` row — SELECT-only for the owner via RLS, written only by stripe-webhook / stripe-billing `sync` with the service role from Stripe data — has `status = 'active'` and a `subscription_id`;
4. the row's `current_period_start` is **after** the checkout mark (5 min clock tolerance, server clock offset applied) and the mark is less than 24 h old.

**Live DB evidence (read-only check):** `stripe_subscriptions` has a single policy, `SELECT TO authenticated` (owner via `stripe_customers.user_id = auth.uid()`, excluding deleted rows); `anon`/`authenticated` hold only the SELECT privilege — no INSERT/UPDATE/DELETE, so the browser cannot forge the row.

**Why it is reliable:** the deciding facts (active subscription, period start) come only from the payment system's own record; the browser contributes only "a checkout was started here at time T". No second source of truth, no Billing semantics changed, one read after one sync, no polling. If the webhook/sync has not yet produced an active row, no Purchase (the mark is kept, so a later `success` return can still count it once) — precision over volume.

**No retroactive false Purchase (historical Premium):** an existing subscriber has no checkout mark (the mark is only written by a successful Checkout creation after A3.1 ships, and the server refuses Checkout to subscribed users with `already_subscribed`), so the function exits before any read. Even with a mark, a subscription whose period started before that checkout fails condition 4. Trial Premium (`TRIAL_ACTIVE`) fails condition 2.

## 11. Purchase dedupe
- Key: `localStorage pixel:purchase:<subscription_id>` (Stripe subscription id: stable, non-sensitive, already stored for the user), written **before** firing.
- After a Purchase the checkout mark is removed, so revisiting `?checkout=success` cannot qualify again.
- Robust to reload, remount, StrictMode (also guarded by the existing `syncedRef`), repeated fetches (concurrent calls tested), back/forward, closing and reopening the app.
- A different, later subscription (resubscribe after cancel) has a new id and needs its own new checkout → counted once each.
- Stored: only the timestamp and subscription id. No email, name, business, customer id, session id, Checkout URL or tokens.

## 12. Value/currency
Single constant `PLAN_PRICE = { value: 9.99, currency: 'EUR' }` (`billing/conversion.ts`), tested equal to server `PLAN` (`eur`, 999, monthly), which `validatePrice` enforces before any Checkout session can exist. Used by both InitiateCheckout and Purchase; no second hardcoded price.

## 13. Privacy
Payloads: PageView/CompleteRegistration/Activation `{}`; InitiateCheckout/Purchase `{value, currency}` only. No eventID sent yet. Storage holds only user UUID (existing pattern), subscription id and a timestamp. Pre-existing leakage documented, not expanded: `register_failed` in GrowthPlanLanding sends `business` and raw error text; PotentialLanding sends `business` in `register_success` (internal analytics, not Meta).

## 14. Files modified
A3: `index.html`, `src/lib/pixel.ts`, `src/main.tsx`, `src/features/billing/useBillingAction.ts`, `src/components/{BusinessAuditLanding,ContentGeneratorLanding,CopilotLanding,DiagnosticLanding,GrowthPlanLanding,PotentialLanding}.tsx` (CompleteRegistration calls removed only).
A3.1: `src/features/billing/BillingPage.tsx` (one call after the existing sync), `src/features/billing/useBillingAction.ts` (checkout mark next to InitiateCheckout), `src/features/billing/conversion.ts` (`markCheckoutStarted`), `src/features/activation/service.ts` (one call in the existing new-milestone loop), `src/features/conversion/__tests__/a3Conversion.test.ts` (two assertions updated for the new code), `src/features/email-verification/__tests__/a261SpecChecklist.test.ts` (S41, see 16).
None of these is hash-locked; no hash was updated.

## 15. Files new
A3: `src/features/conversion/registration.ts`, `src/features/conversion/MetaPixelTracker.tsx`, `src/features/billing/conversion.ts`.
A3.1: `src/features/billing/purchase.ts`, `src/features/conversion/activation.ts`.

## 16. Tests new
- `a3Conversion.test.ts` (21): pixel ID / single init / no old ID / PageView / SPA / no double PageView / token guard; CompleteRegistration cases; InitiateCheckout placement, no fire on visit/price/failure, value from server plan; `checkout=success` never calls `trackPurchase` directly.
- `a31PurchaseActivation.test.ts` (13): `checkout=success` without confirmed state → 0; historical Premium without checkout → 0 and no read; subscription older than checkout → 0; stale mark → 0; new confirmed subscription → 1 with `{value: 9.99, currency: 'EUR'}` and no PII in storage; concurrent fetch / remount / reload / revisit → still 1; two different subscriptions → 1 each; failed read → 0; mark set only after a valid Checkout URL; billing core and Stripe functions contain no pixel code; Activation: before first useful result → 0, first → 1, second result / reload / new session → 1, second business → 1, payload `{}`.
- S41 (A2.6.1) was tightened, not loosened: it still forbids any frontend `.from()` on `user_trials`, `subscriptions`, `stripe_customers`, `ai_usage_monthly`, and now also checks that `stripe_subscriptions` appears exactly once in the frontend, select-only, in `purchase.ts`, with no insert/update/upsert/delete.

## 17. Suite result
49 files, **1723 passed** (A3 baseline 1710 + 13).

## 18. tsc
Baseline 19 → final 19.

## 19. eslint
Baseline 29 → final 29.

## 20. Migrations
42 → 42 (0 new). Purchase reads an existing table under existing RLS.

## 21. Routes
27 unchanged (`App.tsx` not edited; hash test passes).

## 22. Build
PASS.

## 23. Auth unchanged
All a281Closure-locked auth files untouched; hash tests pass.

## 24. Stripe business logic unchanged
stripe-billing / stripe-webhook (handler, logic, index), products, price, entitlements, `billing_state_for`, `current_user_has_premium`, trial and subscription lifecycle untouched; `model.ts`, `repository.ts`, `BillingProvider.tsx` untouched; no edge function deployed. Analytics only observes: one existing RPC and one owner-scoped read.

## 25. A2.7 unchanged
Action Layer, Today, Mission, Roadmap, Maps/GEO/Twin untouched; hash tests pass.

## 26. Engines unchanged
Tools and caps (22/18/18/12/10/80) untouched; legacy functions still 410. The activation milestone rules (`milestones.ts`, `repository.ts`) are unchanged.

## 27. Pending limitations
1. Purchase needs the Stripe return in the **same browser** that started checkout; a return on another device is not counted (undercount, never overcount).
2. Async payment methods leaving the subscription `incomplete` at return are counted only if a later `success` return finds it active within 24 h.
3. Mid-trial subscribers: Stripe defers the first charge to trial end; Purchase reports the confirmed subscription at 9.99 EUR, not money already collected. Renewals happen server-side and need CAPI.
4. InitiateCheckout/Purchase requests can be lost if the browser leaves the page before the pixel request goes out (no redirect delay added).
5. CompleteRegistration: a second device signing in within 10 min of confirmation can count again; a confirmation that doesn't create a session is counted only if the next sign-in falls in the window.
6. Activation: one per user per browser; a user reaching first value on two devices for two different businesses could count twice. Legacy users whose `first_value_reached` is stamped for the first time behave exactly like the existing internal `first_value_reached` event.
7. LoginModal residual CompleteRegistration call (dead while Confirm email is ON); removing it needs a deliberate hash update.

## 28. CAPI readiness
All helpers accept `{ eventId }` → `eventID`. Deterministic IDs for future server-side dedupe: `purchase_<subscription_id>` (the webhook's `checkout.session.completed` / `subscription_activated` can emit the same id), `activation_<hashed userId>`, `cr_<hashed userId>`. No CAPI, tokens or secrets added.

**A3: PASS**
