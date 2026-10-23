# A3.2 — Meta Production Event Delivery Diagnostic

Scope: diagnosis only. **No code, test, migration, edge function or configuration changed.** No purchase made. Regression not re-run (nothing modified; baseline from A3.1 stands: 1723 tests, tsc 19, eslint 29, migrations 42, routes 27, build PASS).

Evidence levels used below: **[CODE]** read from source; **[DB]** read from production database (no PII selected); **[OBS]** reported by the user from the E2E test; **[HYP]** hypothesis, not proven.

## 0. Production evidence of the E2E test [DB]
| Time (UTC) 2026-10-19 | Source | Fact |
|---|---|---|
| 17:04:35 | `analytics_events` `checkout_started` (stripe-billing, server) | Checkout session created and URL returned to the browser |
| 17:08:30 | `stripe_subscriptions.current_period_start` | Subscription period starts |
| 17:08:33 | `checkout_completed`, `subscription_activated` (stripe-webhook) | Webhook processed the payment-system confirmation |
| 17:08:49 | `stripe_subscriptions.updated_at` | Row refreshed (the return-page `sync`) |
| — | row | `status = 'active'`, `trial_end = null`, `current_period_end = 2026-10-26 16:42:13` |

`trial_end = null` + period end 26/10 = this is **not a Stripe trial**. It is a subscription created during the in-app trial with `billing_cycle_anchor = in-app trial end` and `proration_behavior: 'none'` (stripe-billing `index.ts` createCheckout) [CODE]. Stripe therefore marks it `active` immediately with a 0,00 € first invoice and 9,99 € from 26/10 — exactly what Stripe and LocalSEOHub showed [OBS].

## 1. InitiateCheckout trace [CODE]
`BillingPage` button → `useBillingAction.run('checkout')` → `runBillingAction` (stripe-billing; server validates price, returns a `https://checkout.stripe.com/` URL) → `if (url)` → `trackInitiateCheckout(PLAN_PRICE)` → `send('track','InitiateCheckout',{value:9.99,currency:'EUR'})` → `window.fbq('track','InitiateCheckout',{value:9.99,currency:'EUR'})` → `markCheckoutStarted()` → **`window.location.assign(url)` in the same synchronous tick.**

- **Can it run?** Yes. **Did it run?** Yes, proven indirectly: Purchase (2) can only fire if the checkout mark exists, and the mark is written on the line right after `trackInitiateCheckout` in the same block. Both statements execute together or not at all.
- **Does `window.fbq` exist at that instant?** Yes. The `fbq` stub is defined inline in `index.html` `<head>` before the app loads, so `typeof window.fbq === 'function'` always holds. Note: if `fbevents.js` itself has not loaded (or is blocked), the stub only **queues** the call in memory; the queue is destroyed by the navigation.
- **Payload:** `['track','InitiateCheckout',{value:9.99,currency:'EUR'}]`. No `eventID` (no option passed).
- **Event name:** Meta standard `InitiateCheckout` via `track`. Correct.

## 2. Purchase trace [CODE + DB]
Stripe redirects to `/app/billing?checkout=success` → `BillingPage` reads `checkout` once, clears it (`setParams({}, {replace:true})` — history replace, **no page unload**) → guarded by `syncedRef` → `runBillingAction('sync')` → `refresh()` → `trackPurchaseAfterCheckout()`:
1. checkout mark present (written at 17:04:35 browser time);
2. `billing_status` RPC → `SUBSCRIPTION_ACTIVE` + `hasPremium`;
3. `stripe_subscriptions` newest row → `status 'active'`, `subscription_id` present, `current_period_start` 17:08:30;
4. 17:08:30 ≥ mark − 5 min and ≤ now + 5 min; mark < 24 h old.

All four held, which is the exact condition that produced the Purchase seen in Pixel Helper. Then `fireOnce('pixel:purchase:<subscription_id>')` → `trackPurchase(PLAN_PRICE)` → `window.fbq('track','Purchase',{value:9.99,currency:'EUR'})`; mark removed.
- **Payload:** `{value: 9.99, currency: 'EUR'}`; value is a number, currency an ISO code — the two fields Meta requires for Purchase. **No `eventID`.**
- **`track` vs `trackCustom`:** `track`. Standard event.
- **Anything in code that can block delivery?** No navigation follows (the URL change is a history replace inside the same document), so there is no redirect race for Purchase. Dedupe only prevents *repeats*; the first call is not gated by anything else.

## 3. Standard events [CODE]
`fbq('track','InitiateCheckout',…)` and `fbq('track','Purchase',…)` exactly. Repo search: no `trackCustom('Purchase')`, `trackCustom('InitiateCheckout')` or alternative names. Only custom event is `Activation`. PageView/CompleteRegistration untouched.

## 4. Navigation race (InitiateCheckout)
**Evidence [CODE]:** `window.location.assign(url)` runs immediately after `fbq(...)`, with no wait, no callback and no `eventCallback`/beacon handling in app code.
**What decides loss [HYP — depends on Meta's script, not on our code]:**
- if `fbevents.js` is not yet loaded at click time → the call sits in the stub queue and is **certainly lost** when the page unloads (unlikely here: the user was on the page for a while);
- if loaded, `fbevents.js` builds the request to `facebook.com/tr` synchronously; whether that request survives the unload depends on the transport Meta's script chooses (an image/XHR request in flight is typically cancelled by navigation; `sendBeacon`/`keepalive` survives). This cannot be determined from our repository.
**Conclusion:** a real, code-visible risk; loss is **plausible but not proven**. Not fixed, per spec.

## 5. Pixel Helper vs Events Manager
- **Evidence:** Pixel Helper reported `Purchase — Active` [OBS]; the code path fired `fbq('track','Purchase',…)` [CODE/DB]. Pixel Helper inspects the page's pixel activity in the browser; it proves the browser attempted the event, **not** that Meta ingested it.
- **Ruled out by code:** CSP (no `Content-Security-Policy` meta tag or header file in the project); malformed payload; wrong pixel ID (same init as the PageView/CompleteRegistration that arrive); consent gating (no consent layer exists, so nothing suppresses events); navigation after Purchase.
- **Not observable from code — hypotheses:**
  1. Events Manager latency: new standard event types in "Overview" can take from tens of minutes to hours to appear [HYP].
  2. "Test events" only lists events from a browser session opened **from** the Test events tab (or carrying its test code); events fired before that session do not appear there by design [HYP — consistent with the observation that Test events shows neither event].
  3. Ad blocker / browser tracking protection blocking `facebook.com/tr` [HYP — weakened because PageView and CompleteRegistration from the same browser did arrive].
  4. InitiateCheckout specifically: the redirect race in 4 [HYP].
- **Evidence missing to decide:** the browser Network tab (with "Preserve log") showing whether the `facebook.com/tr/?…ev=Purchase` and `ev=InitiateCheckout` requests were sent and their status (200 / cancelled / blocked). We do not have it.

## 6. Trial / Purchase semantics [CODE + DB]
Confirmed: **Purchase currently means "new confirmed subscription", not "successful 9,99 € charge."** It fires when the payment system's row becomes `active`. In this test Stripe charged 0,00 € today; the 9,99 € charge happens on 26/10 (invoice not yet paid). Purchase still sent `value 9.99`. No change made, per spec.

## 7. Answers
1. **Does InitiateCheckout run?** Yes — the `fbq('track','InitiateCheckout')` call executes (proven via the checkout mark).
2. **Payload?** `{value: 9.99, currency: 'EUR'}`, no eventID.
3. **Can it be lost by the Stripe redirect?** Yes, it can: the redirect is immediate. Whether it *was* lost is unproven without network evidence.
4. **Does Purchase run?** Yes — all four conditions held in production data; Pixel Helper confirms the call.
5. **Payload?** `{value: 9.99, currency: 'EUR'}`, no eventID.
6. **Standard events?** Yes, both via `track` with exact Meta names.
7. **Why does Pixel Helper see it?** Because the page really calls `fbq('track','Purchase',…)`; Pixel Helper reports browser-side pixel activity, not Meta's ingestion.
8. **Evidence the request reaches / doesn't reach Meta?** None either way. The Network tab is the missing evidence.
9. **Code bug?** No unequivocal bug. One design weakness: InitiateCheckout is sent immediately before a full-page navigation with no delivery guarantee.
10. **Meta/test configuration problem?** Likely for Purchase (latency and/or Test events used outside its session); not provable from code.
11. **Subscription or real charge?** Subscription. With the in-app-trial billing anchor, the first real charge happens later and is not tracked.
12. **StartTrial for the trial?** Recommended for decision: `StartTrial` (Meta standard event, may carry `value`/`predicted_ltv`) when a subscription starts with a deferred first charge; `Purchase` only on the first paid invoice. The paid invoice is a server event (webhook), so reliable Purchase-on-charge essentially needs CAPI or a later browser-side check of a paid invoice — a separate, decided phase.
13. **Minimal change recommended (not applied):**
    - First, collect evidence (no code): repeat the flow in a clean browser profile without extensions, DevTools → Network → "Preserve log", filter `tr`, and check the `ev=InitiateCheckout` and `ev=Purchase` requests; separately, use Events Manager → Test events → open the site from there, then run the flow; wait at least 1 h before judging "Overview".
    - If the InitiateCheckout request shows as cancelled: delay the redirect briefly (e.g. ~300 ms) after the `fbq` call, inside `useBillingAction`. That is a ~2-line, non-locked change.
    - Optionally pass deterministic `eventID`s (`ic_<…>`, `purchase_<subscription_id>`) now, so a future CAPI copy can be deduplicated.

## 8. Not touched
Auth, F-03, Stripe business logic, webhook, subscription lifecycle, trial, price, entitlements, A2.7, tools, PageView, CompleteRegistration. No migrations, no CAPI, no purchase.

**A3.2 DIAGNOSIS: MIXED**

Why: (a) Purchase is fired correctly by the code with a valid standard-event payload and no navigation afterwards. Its absence in Events Manager is not explained by any code defect and is most consistent with Meta-side latency or the Test events procedure (META/TEST CONFIGURATION). (b) InitiateCheckout is fired, but immediately before a full-page redirect with no delivery guarantee — a code-level risk that can plausibly explain why it is missing. It is not proven, so no fix was applied. Network-tab evidence from one more test (without a new payment, e.g. opening Checkout and cancelling) would turn (b) into either CODE BUG or ruled out.
