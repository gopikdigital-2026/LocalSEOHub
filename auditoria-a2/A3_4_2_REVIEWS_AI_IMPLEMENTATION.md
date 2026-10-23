# A3.4.2 — Reseñas IA · Reviews Read Layer + AI Reply Draft

**Verdict: CONDITIONAL GO (A3.4.3)** — implementation complete, deployed and tested; real Google review retrieval has **not** been verified in production (no tenant currently has a connected GBP source with a selected location). See §13–§15.

---

## 1. Scope

- New protected tool page `/herramientas/resenas` ("Reseñas IA").
- Server-side, read-only retrieval of real Google reviews through the official Business Profile API v4.
- Per-review AI reply **draft** (edit, copy, regenerate). No publishing.

Out of scope and untouched: Meta funnel/events, Stripe/billing entitlements, pricing, Google login and OAuth scopes, frozen tools.

## 2. Files

| Area | Path |
|---|---|
| Migration (applied live) | `supabase/migrations/20261019221707_a342_review_reply_ai_usage.sql` |
| Edge function | `supabase/functions/gbp-reviews/{index,handler,logic}.ts` |
| Byte-identical copies | `gbp-reviews/gbpToken.ts` (= `gbp-sync/gbpToken.ts`), `gbp-reviews/entitlement.ts` (= `weekly-content/entitlement.ts`) |
| Function config | `supabase/config.toml` → `[functions.gbp-reviews] verify_jwt = true` |
| Client | `src/features/reviews/{repository,copy}.ts`, `ReviewsPage.tsx`, `ReviewCard.tsx` |
| Catalog / hub | `src/features/tools/catalog.ts` (8th tool `reviews`, optional `cta`), `ToolsPage.tsx` (Star icon, `copy.cta ?? openCta`) |
| Route | `src/App.tsx` → lazy `ReviewsPage` at `/herramientas/resenas` |
| Tests | `src/features/reviews/__tests__/a342ReviewsAi.test.ts` (35 tests) + guard updates in 20 existing test files |

## 3. Google endpoints used (read-only)

- `GET https://mybusiness.googleapis.com/v4/{accounts/X}/{locations/Y}/reviews?pageSize=50&pageToken=…` (max 5 pages = 250 reviews).
- `GET https://mybusiness.googleapis.com/v4/{accounts/X}/{locations/Y}/reviews/{reviewId}` (draft only; review is re-read server-side).
- `POST https://oauth2.googleapis.com/token` only via the existing `ensureAccessToken` refresh path.

**Not used anywhere:** `UpdateReviewReply` (PUT `…/reply`), `DeleteReviewReply`, any PATCH/DELETE. Enforced by tests 23 and a271#70.

## 4. Security chain

1. JWT verified at gateway (`verify_jwt = true`) and `requirePremium` → `authorize_premium_request` (premium/trial, rate limit 30/h per `gbp-reviews-list` / `gbp-reviews-draft`).
2. Business: `businesses.user_id = <JWT user>`.
3. Source: `connected_sources` filtered by `user_id`, `business_id`, `source_type = google_business`, `status <> disconnected`.
4. Location: `selectedLocation()` accepts only `accounts/[A-Za-z0-9_-]+` and `locations/[A-Za-z0-9_-]+`; rejects `locations/default`.
5. Input: `reviewId` must match `^[A-Za-z0-9_-]{1,256}$`; `requestId` must be a UUID; body ≤ 4096 bytes; only `list` / `draft` actions.

Client-supplied user/source ids are ignored (test 16).

## 5. Credentials

- Tokens are read from Vault via `vaultCredentialStore` and refreshed server-side only.
- Responses contain a sanitized `diagnostic` (`endpoint` label, `httpStatus`, `googleStatus`, `reason`, `tokenRefreshed`) — never tokens, refresh tokens, client secrets or raw Google messages.
- Logs use event name + sanitized fields only. Test 15 asserts that an access token echoed back inside a Google error does not leak into the response or logs.

## 6. Error classification

| Condition | State | UI action |
|---|---|---|
| No source | `not_connected` | Conectar Google Business Profile → `/fuentes` |
| No/invalid location | `no_location` | Seleccionar negocio → `/fuentes` |
| Token refresh failed | `auth_expired` | Volver a conectar |
| Google 401 | `auth_revoked` | Volver a conectar |
| 429 / RESOURCE_EXHAUSTED / quota | `quota_unavailable` | Reintentar (neutral warning) |
| SERVICE_DISABLED / accessNotConfigured | `api_not_enabled` | Reintentar (neutral warning) |
| Other 403 | `access_denied` | Reintentar (neutral warning) |
| 404 / FAILED_PRECONDITION on list | `location_not_eligible` | Seleccionar negocio |
| 404 on single review | `review_not_found` | Reintentar |
| 5xx / network / malformed | `google_error` (retryable) | Reintentar |

## 7. UI states (A–E)

- **A** "Conecta Google Business Profile" + spec body + CTA "Conectar Google Business Profile".
- **B** "Seleccionar negocio".
- **C** neutral warning card with the spec's suggested message and retry/reconnect per state.
- **D** "No hemos encontrado reseñas en esta ficha."
- **E** summary Reseñas cargadas / Sin responder / Respondidas; filter tabs; review cards.

**Averages:** the page does not compute an average from loaded reviews. It shows only Google's own `averageRating` / `totalReviewCount`, explicitly labelled "(según Google)". When pagination did not finish, it says "Se muestran las N reseñas más recientes de tu ficha."

## 8. Review card

Reviewer name (or "Nombre no disponible"), stars (or "Valoración no disponible"), date, text or "Esta valoración no incluye comentario.", existing owner reply labelled "Tu respuesta actual en Google", badge "Respondida" / "Sin responder", button "Preparar respuesta con IA" (answered reviews: "Preparar respuesta alternativa con IA", with a note that the current Google reply is not changed). The draft is labelled "Respuesta sugerida por IA" in an editable textarea with "Copiar respuesta", "Regenerar" and "Descartar". There is no publish button; a permanent note says the app never publishes to Google.

## 9. AI reply generation

- Model `gpt-4o-mini`, JSON output, ≤ 400 tokens, 20 s timeout, at most 2 provider calls per request.
- The prompt receives only known business facts (name, category, city, services, phone, website). Missing facts are sent as `UNKNOWN` and must not be mentioned.
- Tone per rating: 5 warm; 4 grateful; 3 balanced; 1–2 calm, non-confrontational, no automatic admission, private contact invitation.
- Rules: no promises/discounts/refunds/compensation, no legal admission, no rating pressure, no private info, no placeholders/links. Review text is treated as untrusted data (prompt-injection guard).
- Output guard `replyViolations` rejects length, placeholders, emails, unknown URLs, unknown phone numbers, promise words and rating-pressure phrases. Rejected drafts are never returned.

## 10. Usage ledger

- New capability `review-reply`, cap **15 per period**. The period is the UTC calendar month, following the existing ledger convention (the spec's "~15 per period" was mapped to the existing monthly period, not a new weekly one). The global cap of 80 still applies.
- Reserve → settle `completed` on success; `consumed` if the provider was billed but the draft was rejected; `released` if the provider never answered (no usage counted).
- Listing reviews never touches the ledger.
- Live check: `ai_usage_cap('review-reply') = 15`, column `ai_usage_monthly.review_reply_used` present, reservation CHECK includes `review-reply`.

## 11. Persistence

No new tables. Reviews and drafts are not stored; drafts live only in page memory and disappear on reload. The only schema change is the ledger counter.

## 12. Test results

- New suite: 35/35 passing, covering all 25 required cases (1 unauthenticated · 2 disconnected · 3 no location · 4 Google 401 · 5 refresh path · 6 refresh failure · 7 403 · 8 quota · 9 5xx · 10 zero reviews · 11 reviews returned · 12 no-comment · 13 unanswered · 14 answered · 15 no credentials · 16 tenant isolation · 17 AI draft · 18 no fabrication · 19 usage counted · 20 cap enforced · 21 copy/edit UI · 22 no Publish · 23 no UpdateReviewReply · 24 other tools unaffected · 25 function registration/official hosts) plus pagination, input validation and repository mapping.
- Full suite: 52 files, 1807/1807 passing.
- Type check: 19 errors, all pre-existing in unrelated files (none in new files).
- Lint on new files: clean (the existing unused `useAuth` import in `App.tsx` predates this sprint).
- Production build: passes.
- Edge function `gbp-reviews` deployed.

## 13. Production capability test procedure

Run with a real premium/trial user whose GBP source is connected **and** has a selected location:

1. Sign in, open `/herramientas/resenas` (or call `gbp-reviews` with `{"action":"list"}` and the user's JWT).
2. Record from the response `diagnostic`:
   - endpoint (`GET mybusiness.googleapis.com/v4/{account}/{location}/reviews`)
   - `httpStatus`
   - `googleStatus` / `reason` (sanitized)
   - whether `reviews` were returned and how many
   - whether any `ownerReply` values were returned
   - `tokenRefreshed`
3. Request one draft; record `status` and confirm `my_ai_usage → functions['review-reply'].used` increased by 1.
4. Classify:
   - **PASS** — HTTP 200, reviews (or a genuine zero) returned, draft generated and counted.
   - **CONDITIONAL** — a classified Google access state (`access_denied`, `api_not_enabled`, `quota_unavailable`, `location_not_eligible`) shown correctly with no leak.
   - **FAIL** — wrong state, leaked credential, fabricated content, or an uncaught error.

## 14. Production status (actual)

- Live query: **0** `google_business` sources with a selected location (`status <> disconnected`). No real review call could be made.
- No credentials or user JWTs were used by the implementer; no production Google request was issued.
- Result: **CONDITIONAL — not verified against Google.** Unit tests prove behaviour against mocked Google responses only; they do not prove operational access. The Business Profile API requires project-level access approval and quota from Google; if not granted, the page will show the neutral "acceso a reseñas no disponible" state (expected `quota_unavailable` with quota 0, or `api_not_enabled` / `access_denied`).
- Security advisor: no new findings (8 pre-existing items, none related to this sprint).

## 15. Verdict and next steps

**CONDITIONAL GO for A3.4.3.**

Done: safe read-only implementation, truthful states, AI drafts with output guard, ledger integration, tenant isolation, tests, deploy.

Required before calling it operational:
1. Confirm Google has granted Business Profile API access/quota to the project.
2. Connect a real GBP and select a location, then run §13 and record the result here.
3. Only after a PASS: consider A3.4.3 scope (still no auto-publishing unless explicitly approved and scoped).
