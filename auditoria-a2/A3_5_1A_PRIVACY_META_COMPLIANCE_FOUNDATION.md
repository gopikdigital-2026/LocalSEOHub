# A3.5.1A — PRIVACY & META COMPLIANCE FOUNDATION

Scope: compliance hardening only. No Facebook/Instagram OAuth, Graph API, Meta credentials, permissions or FB/IG source cards were implemented. GBP, Stripe/billing, trial, subscriptions, AI quotas, product tools and the CompleteRegistration / Activation / InitiateCheckout / Purchase semantics and triggers are unchanged. No RLS, Vault or migrations were touched.

---

## 1. Executive summary

Before this change the Meta Pixel (and Microsoft Clarity) loaded unconditionally from `index.html`, sent a PageView before any user decision, a `<noscript>` image pixel fired for no-JS visitors, and the privacy modal stated "No usamos cookies de seguimiento ni publicidad de terceros" — false.

Now:
- Optional trackers (Meta Pixel 2022587961640258 and Microsoft Clarity) are **not requested at all** until the user presses "Aceptar". The base code moved from `index.html` into the app and only runs behind a stored, current-version consent.
- Every Pixel event additionally re-checks stored consent, so after a revocation the in-memory script receives nothing, and Meta's own `fbq('consent','revoke')` is called as defence in depth.
- A branded, equal-choice consent banner (Rechazar / Aceptar) appears on first visit and can be reopened from every legal footer, the privacy page and the app sidebar.
- Public, logged-out, refresh-safe pages: `/privacidad`, `/terminos`, `/eliminar-datos`, with footer links on all public pages.

Verdict: **CONDITIONAL GO** for A3.5.1B (conditions in §20/§22).

## 2. Pre-change privacy state

- Privacy and terms existed only as landing-page modals (`LegalModals.tsx`), not as URLs — unusable as a Meta Privacy Policy URL.
- Privacy modal: contact `gopik.digital@gmail.com`; section 4 claimed no tracking/advertising cookies (false: Meta Pixel + Clarity were active).
- No data deletion page or instructions URL.
- No consent mechanism of any kind.

## 3. Pre-change Pixel behaviour

- `index.html` inline base code: loaded `fbevents.js`, `disablePushState = true`, `autoConfig false`, `init 2022587961640258`, `track PageView` (skipped on auth-token URLs) — on every page load, before any decision.
- `<noscript><img src="https://www.facebook.com/tr?id=2022587961640258&ev=PageView&noscript=1"></noscript>` — transmitted for no-JS visitors with no possibility of consent.
- `MetaPixelTracker` sent PageView on each SPA path change; funnel helpers (`trackLead`, `trackCompleteRegistration`, `trackActivation`, `trackInitiateCheckout`, `trackPurchase`) called `window.fbq` whenever it existed.
- Microsoft Clarity (`xhez4c3vjj`) loaded at idle on every visit, no consent.

## 4. Compliance gaps addressed

| Gap | Resolution |
|---|---|
| Pixel loads and PageView before consent | Base code only runs after Accept / stored acceptance |
| Noscript pixel bypasses consent | Removed |
| Clarity loads without consent | Gated under the same optional category |
| Events after revocation | Per-event consent check + `fbq('consent','revoke')` |
| False "no tracking cookies" claim | Replaced by truthful `/privacidad` |
| No public privacy URL | `/privacidad` |
| No public terms URL | `/terminos` |
| No data deletion URL | `/eliminar-datos` |
| No way to change decision | Footer "Preferencias de privacidad", privacy page button, app sidebar link |

## 5. Consent architecture

- **Categories:** ESSENTIAL (always on: auth session, language, consent record, temporary flow data, first-party product analytics) and OPTIONAL advertising/analytics (Meta Pixel, Microsoft Clarity). One optional toggle — no fake granular categories.
- **Model:** `src/lib/consent.ts` — `readConsent`, `writeConsent`, `hasAdvertisingConsent`.
- **Activation:** `src/features/consent/applyConsent.ts` — `applyTrackingConsent(advertising)`:
  - grant → load Pixel (or `fbq('consent','grant')` if already loaded this page) → one PageView for the current page (auth-token landings skipped) → load Clarity (or `clarity('consent')`).
  - revoke → `fbq('consent','revoke')`, `clarity('consent', false)`.
- **Startup:** `main.tsx` runs `if (hasAdvertisingConsent()) applyTrackingConsent(true);` once, outside React (no StrictMode double-fire).
- **UI state:** `ConsentProvider` (context: `decision`, `openPreferences`) renders `ConsentBanner` when undecided or reopened. Mounted inside `BrowserRouter`, wrapping the app.

## 6. Meta Pixel gating implementation

- `index.html`: Pixel script, Clarity script and noscript pixel removed; only a comment remains.
- `src/lib/pixel.ts`:
  - `loadMetaPixel()` — official base code (stub queue, async `fbevents.js`, `disablePushState = true`, `set autoConfig false`, `init 2022587961640258`). Single `init` in the codebase.
  - `send()` now requires `window.fbq` **and** `hasAdvertisingConsent()`; event names, payloads and `eventID` unchanged.
  - `urlCarriesAuthTokens()` — the existing auth-token guard, moved from inline HTML.
- `MetaPixelTracker`: unchanged logic (PageView per path change); without consent `send()` drops it.
- `fireOnce` unchanged. Consequence (intentional, documented): a one-time event whose trigger happens while consent is absent is marked done and **never replayed** later — no fabricated historical events.
- Reject → Accept: tracking starts at acceptance with a single current PageView; nothing earlier is sent (nothing was ever queued because `send()` never calls `fbq` without consent).
- Accept → Reject: future events blocked; already-sent data is not touched.

## 7. Consent persistence / versioning

- localStorage key `lsh_privacy_consent`, value `{"version":1,"advertising":true|false,"decidedAt":"<ISO>"}`. No identifiers, no personal data.
- Missing, malformed or different-version records are treated as undecided → banner asks again. Bumping `CONSENT_VERSION` re-prompts everyone.
- If storage is unavailable, the decision applies to the current page only and event helpers fail closed (no events).

## 8. Privacy preference UI

- Bottom card (full-width sheet on mobile, bottom-left card on desktop), white with emerald shield icon, matching the landing brand; slides in with a short fade.
- Spanish copy: essential tech keeps the app working; with permission, Meta Pixel and Microsoft Clarity measure campaign performance and usage; app works the same if rejected. Link to `/privacidad`.
- Buttons "Rechazar" and "Aceptar": identical style and size (no dark pattern), no preselected checkbox.
- Non-blocking (no overlay); app fully usable before deciding (optional trackers simply stay off).
- Reopened view shows current choice and date, plus a close button.
- Change later: "Preferencias de privacidad" in the landing and legal footers; "Cambiar preferencias" on `/privacidad`; "Privacidad y preferencias" link in the app sidebar and mobile drawer.

## 9. Public privacy route — `/privacidad`

Sections: 1 Responsable (service operator, contact admin@localseohub.io), 2 Datos (account, business data, website/business analysis incl. OpenAI processing, optional GBP connection with encrypted credentials, Stripe at high level, first-party usage statistics), 3 Finalidades, 4 Proveedores (Supabase, Stripe, OpenAI, Google incl. Google Fonts, Resend, Meta Platforms and Microsoft only with consent), 5 Cookies y tecnologías (essential vs optional; Meta Pixel purpose; nothing loads before Accept), 6 Tu decisión (live status + change button), 7 Conservación (no invented periods), 8 Derechos, 9 Eliminación (link), 10 Cambios. Does not claim absence of third-party tracking.

Not stated because not verifiable in the repo: legal entity name, tax ID, postal address, the formal LocalSEOHub ↔ Gopik Digital relationship (see §20).

## 10. Public terms route — `/terminos`

Approved text from the former `TermsModal`, sections 1–7, reproduced verbatim (including its original contact address `gopik.digital@gmail.com`, kept to avoid rewriting approved terms). `PrivacyModal` / `TermsModal` removed; `ContactModal` kept.

## 11. Data deletion route — `/eliminar-datos`

Who can request (account holder), how (email admin@localseohub.io from the account email, subject "Eliminar mi cuenta", optional business name), explicit warning that we never ask for passwords, codes, Google/platform credentials or card data, what happens after (manual verification, deletion, subscription cancellation, GBP access withdrawal, confirmation email), legal retention (billing records; Stripe's own records; optional-provider data governed by their policies). No deadline promised, no automation implied.

## 12. Footer / legal discoverability

Shared `LegalLinks`: Política de privacidad · Términos · Eliminación de datos · Preferencias de privacidad. Used on the landing footer (alongside Iniciar sesión and Contacto) and every legal page footer. App sidebar/mobile drawer: "Privacidad y preferencias".

## 13. Files changed

New:
- `src/lib/consent.ts`, `src/lib/clarity.ts`
- `src/features/consent/applyConsent.ts`, `ConsentProvider.tsx`, `ConsentBanner.tsx`
- `src/features/legal/LegalLinks.tsx`, `LegalLayout.tsx`, `PrivacyPolicyPage.tsx`, `TermsPage.tsx`, `DataDeletionPage.tsx`
- `src/features/consent/__tests__/a351aConsent.test.ts`

Modified:
- `index.html` (trackers + noscript pixel removed)
- `src/lib/pixel.ts` (loader, consent check, token guard)
- `src/main.tsx` (startup gating, `ConsentProvider`)
- `src/App.tsx` (3 public lazy routes)
- `src/components/LandingPage.tsx` (footer), `src/components/LegalModals.tsx` (privacy/terms modals removed)
- `src/app-v2/layouts/AppShellV2.tsx` (privacy link)
- `src/features/conversion/MetaPixelTracker.tsx` (comment only)
- `src/lib/i18n.tsx` (footer labels; unused privacy/terms modal keys removed)

## 14. Tests added / changed

Added `a351aConsent.test.ts` (22 tests):
- **A** no decision: banner opens; no script requested, no `fbq`, no PageView; `index.html` has no Pixel/Clarity/noscript; startup gated; stray `fbq` receives nothing.
- **B** accept: minimal versioned record; one `fbevents.js`; `autoConfig` then `init` then one PageView; `disablePushState`; returning visitor; auth-token landing skip; helpers keep names/payloads/eventID.
- **C** reject: persisted; nothing loads; helpers no-op.
- **D** reject → accept: no Lead/CompleteRegistration replay; one PageView.
- **E** accept → reject: `consent revoke`; PageView/Lead/Purchase blocked; re-accept → `grant` + one PageView, no second script.
- Versioning; UI equality/no preselection; Spanish copy; reopen controls.
- **F/G** routes outside guards; `_redirects` SPA fallback; privacy truthfulness; deletion never asks for secrets / no deadline; terms sections.

Changed:
- `a3Conversion.test.ts`: base-code assertions moved from `index.html` to `pixel.ts`; event tests run with stored consent.
- `a31PurchaseActivation.test.ts`: in-memory storage keeps a consent record across `clear()`.
- Route-count / `App.tsx` freeze assertions in `a281TrustCleanup`, `a271ActionLayer`, `a33DiagnosticAction`, `f03Stage2b`, `a273Roadmap`, `a272TodayIntelligence` updated for the 3 legal routes (28→31; route list 27→30; new App hash).

## 15. Test results

`vitest run`: **54 files, 1852 tests, all passing** (previous 53 / 1830 + 22 new).

TypeScript: 20 pre-existing errors (unused imports in landing variants/App, legacy admin, one `.at()` in an earlier GBP test); none in files introduced here.

## 16. Build result

`npm run build`: **PASS**.

## 17. Security review

- No secrets added, read or logged. Pixel ID and Clarity ID are public identifiers (were already in `index.html`).
- Consent record contains no personal data.
- No RLS, Vault, migration, edge function or Supabase config change.
- Legal pages render static text; no user input, no `dangerouslySetInnerHTML`.
- Deletion page explicitly forbids sending passwords, tokens or card data.

## 18. Regression review

- Event names, payloads, `eventID`, `fireOnce` keys and all triggers unchanged (a3/a31 suites green).
- SPA PageView behaviour unchanged with consent; `disablePushState` and `autoConfig false` preserved.
- Behavioural change by design: users who never accept are no longer measured by Meta/Clarity, so Meta-reported funnel volume will drop to consenting users only.
- First-party `analytics_events` funnel unchanged (essential/product category, disclosed).
- Landing: Contacto modal kept; Privacidad/Términos now open pages instead of modals.
- Banner sits above the mobile sticky CTA / bottom nav while visible (z-index 70); disappears after a choice.

## 19. Manual production checklist

- **TEST 1** — Incognito, open https://localseohub.io. DevTools → Network, filter `facebook` and `clarity`. Expected: banner visible; **no** request to `connect.facebook.net`, `facebook.com/tr` or `clarity.ms`; Meta Pixel Helper shows no pixel.
- **TEST 2** — Press "Aceptar". Expected: `fbevents.js` loads; Pixel Helper shows pixel **2022587961640258** with one PageView; navigating to `/signup` and back sends one PageView per route change.
- **TEST 3** — Footer → "Preferencias de privacidad" → "Rechazar". Navigate across several pages. Expected: no new `facebook.com/tr` requests. Reload: no `fbevents.js` request at all.
- **TEST 4** — Logged out, open directly (and refresh) https://localseohub.io/privacidad, https://localseohub.io/terminos, https://localseohub.io/eliminar-datos. Expected: each renders without redirect to login, footer links work.

## 20. Remaining external Meta requirements

- Meta App: set Privacy Policy URL `https://localseohub.io/privacidad`, Terms URL `https://localseohub.io/terminos`, Data Deletion Instructions URL `https://localseohub.io/eliminar-datos`.
- **Controller identity:** add the legal operator name (and, if required, tax ID / address) and the actual LocalSEOHub ↔ Gopik Digital relationship to §1 of `/privacidad`. Not invented here; GDPR and Meta review expect it.
- Business verification, app icon, category, and App Review screencasts for any later permissions (A3.5.1B+).
- Legal review of the policy text (lawful bases were deliberately not asserted).

## 21. Remaining known debts

- Terms and the Contacto modal still show `gopik.digital@gmail.com`; privacy/deletion use `admin@localseohub.io`. Decide whether to unify.
- Google Fonts are loaded from Google servers on every visit (disclosed in the policy); self-hosting would remove that third-party request.
- First-party `analytics_events` (random session ID in localStorage) treated as essential/product analytics — confirm with legal whether it should move under consent.
- Clarity revocation within the same page relies on Clarity's `consent` API; from the next load it is fully not loaded.
- Privacy and deletion pages dated 21 October 2026; terms keep their approved "junio 2026" date.
- Legal pages are Spanish only.
- Purchase semantics issue (out of scope, unchanged).
- Pre-existing TypeScript baseline errors.

## 22. Verdict for A3.5.1B

**CONDITIONAL GO.** The technical foundation required by Meta (consent-gated Pixel, public privacy/terms/deletion URLs) is in place and tested. Conditions before submitting anything to Meta review: (1) complete the controller identity in `/privacidad` §1, (2) run the manual production checklist §19 after deploy, (3) register the three URLs in the Meta App settings.
