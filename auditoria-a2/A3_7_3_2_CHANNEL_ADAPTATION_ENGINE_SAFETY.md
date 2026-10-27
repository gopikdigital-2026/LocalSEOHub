# A3.7.3.2 — Publications MVP · Facebook & Instagram Channel Adaptation Engine + Safety

Status: implementation and automated validation complete. Not frozen. Real AI adaptation validation is reserved for Manuel and ChatGPT.

## 1. Scope
- From one selected proposal (A3.7.3.1 draft), the engine produces one Facebook text and one Instagram text on the server and stores both in `publication_drafts` together.
- It does not publish. Meta calls = 0, Google calls = 0, customer exposure = 0.
- No change to Meta OAuth or scopes, GBP, billing, auth, or customer navigation and Tools.

## 2. Limits
| Limit | Value | Where enforced |
|---|---|---|
| Monthly adaptations per user | **20** | `ai_usage_cap('publication-adaptation')` → `reserve_ai_usage` returns `fn_limit` |
| Global monthly AI calls per user | 80 (unchanged) | `ai_usage_cap('global')` |
| Adaptations per publication | **3** | `claim_publication_adaptation` and `complete_publication_adaptation` (`adaptations_used >= 3`) plus a handler pre-check |
| Request body | 1024 bytes | handler `MAX_BODY_BYTES` |

All other caps are unchanged (proposals 20, weekly 22, and the rest).

## 3. AI usage
- Model: **gpt-4o-mini**, temperature 0.6, max 900 tokens, timeout 25 s.
- **One normal AI call** per adaptation; **at most two calls** when a single repair is needed (`WRITER.maxCalls = 2`).
- **No image resend.** Only the stored text snapshot of the selected proposal is sent (role, lang, body, CTA) plus server-loaded business facts. The photo is never sent again.

## 4. Request contract
The browser sends only `{publication_id, expected_version, request_id}`. It never sends source text, business_id, user_id, Facebook text or Instagram text. The server derives the user from the JWT and loads everything else from the database. `request_id` is a fresh UUID per click and serves as the claim id and the ledger reservation id.

## 5. Flow (handler)
1. Premium gate: `requirePremium(req, "publication-adaptations")`, with JWT verification on.
2. Parse and validate the body; load the publication and draft owned by the caller.
3. Pre-checks: proposals_ready, a selection exists, version and generation match, used < 3, valid role and lang.
4. Claim (`claim_publication_adaptation`): returns `claimed | busy | stale | limit | not_ready | no_selection | not_found`.
5. Reserve the ledger slot (`reserve_ai_usage(request_id, user, 'publication-adaptation')`).
6. AI generation, then safety and quality validation, then at most one repair.
7. Atomic completion (`complete_publication_adaptation`).
8. `finally`: settle the ledger (`completed` if saved, `consumed` if the AI was billed but nothing was saved, otherwise `released`).
9. `finally`: release the claim. This is a no-op after success, because completion already cleared it.

## 6. Atomic Facebook + Instagram persistence
A single `UPDATE` in `complete_publication_adaptation` writes all of the following together:
- `facebook_generated`, `facebook_text`, `instagram_generated`, `instagram_text`;
- `adapted_at`;
- `adaptations_used + 1`;
- `version + 1`;
- the cleared claim.

Both lengths are validated first (Facebook 1..5000, Instagram 1..2200, also backed by table CHECKs). An invalid length on either channel writes nothing. There is no path that stores only one channel.

## 7. Concurrency
- `publications` and `publication_drafts` rows are locked with `FOR UPDATE` in claim and completion.
- A live claim (younger than 3 minutes) makes any second claim return `busy`. A stale claim can be taken over.
- Completion requires the same claim id (otherwise `claim_lost`), the same version and generation (otherwise `stale`), and used < 3 (otherwise `limit`).
- A replayed completion after success returns `claim_lost`, so the count cannot increase twice.

## 8. Ledger reservation and settlement
- New column `ai_usage_monthly.publication_adaptations_used` (default 0, CHECK ≥ 0). It counts toward the global total.
- The reservations function CHECK is widened to include `publication-adaptation`.
- `reserve_ai_usage`, `settle_ai_usage`, `reconcile_ai_usage` and `my_ai_usage` were re-declared with the new function. Existing behaviour for every other function is unchanged.
- A duplicate reservation id returns `invalid` (mapped to `conflict`). Settling twice returns false.

## 9. Safety architecture
- The prompts (`prompts.ts`) treat source text and business facts as data, not instructions.
- The output is parsed into a strict JSON object with exactly `facebook` and `instagram`.
- Validation (`adaptation.ts`) reuses the A3.7.2 validators:
  - **safety:** unsafe or medical claims, instruction leaks (always fire), links and handles, invented contact details;
  - **quality:** length, emptiness, hashtags (Instagram only, bounded);
  - **relational:** invented booking or number claims that are not exempted by the source text;
  - **CTA:** every CTA phrase must exist in the source (global regex).
- Failures map to `invalid_ai_output` or `unsafe_output`. Only mapped error codes reach the browser; raw AI text is never returned on failure. Logs carry codes and counters only.

## 10. Copied-validator hash proof
The adaptations function has byte-identical copies of the frozen A3.7.2 proposals files (asserted in `a3732AdaptationGuards.test.ts`):

| File | SHA-256 (proposals = adaptations) |
|---|---|
| context.ts | 0737fde722c8c37e9b15a9c7c4c1b83c81798fb480d0f3148ce95e8707cd3beb |
| safety.ts | ac0efae62dfbfa3c19903731bda57f20223e3ccc8f141ea26ef11f3d8a7f97a0 |
| quality.ts | 158f3fd7d3a7723edffb54bbea17047c5837dbc966d2de3bdea9a12f69106288 |
| relational.ts | 489d7fd8c8839b5f345af253e096ef83a94b3d3d738e219f681e2f3e6af906fc |
| entitlement.ts | f948d629f5408537ff9b1c776a5a3ede9d292839923937a69bd5ddf52ea30fd5 |

New files in the adaptations function:

| File | SHA-256 |
|---|---|
| adaptation.ts | b2d277d3a9bb2dbabfd1dd18a6c2a8bef4f8ee944a5bf5fdb85937a692f0d29a |
| prompts.ts | fa0f123168585df6a947f1d84bd0c1425125bf98e3daa865bdb3ee0944dce662 |
| handler.ts | f213b671ac3721957736d257f33868feca1558e1ec5f205384862dd5702cda5e |
| index.ts | 4f1db457b20cf59f1d40a86c046d7e5ad89a774efeec18df226d9feacb241999 |

## 11. Migration
`supabase/migrations/20261027165527_a3732_publication_adaptation_engine.sql` (applied).
- New server-only functions:
  - `claim_publication_adaptation`;
  - `release_publication_adaptation`;
  - `complete_publication_adaptation`.
- All are SECURITY DEFINER with `SET search_path = public`. EXECUTE is revoked from PUBLIC, anon and authenticated, and granted to service_role only.
- `publication_drafts`: no new write grants. Clients keep owner-scoped SELECT only.
- No DROP, rename or type change.

## 12. Real DB validation (rollback-safe)
This was one DO block on a real proposals_ready publication. The proposal was selected through the real `select_publication_proposal` running as the owner (authenticated role and JWT claims). The block ended with `RAISE EXCEPTION`, so everything rolled back. A post-check confirmed 0 drafts, 0 adaptation reservations and 0 adaptation usage remain.

| # | Check | Result |
|---|---|---|
| 00–01 | Selection creates draft v1, used 0, no texts, no claim | selected, v1 |
| 02 | Claim by a different user | not_found |
| 03 | Claim with a stale version | **stale** |
| 04 | Claim | **claimed** |
| 05 | Second simultaneous claim | **busy** |
| 06 | Complete, Facebook 5001 chars | invalid; no Facebook/Instagram text, used 0, v1, claim kept (**no partial state**) |
| 07 | Complete, Instagram 2201 chars | invalid; no Facebook/Instagram text, used 0 |
| 08 | Complete with a foreign claim | claim_lost; nothing written |
| 09 | Complete with a wrong version | stale; nothing written |
| 10 | Complete | completed: both `*_generated` and `*_text` columns set **together**, used 0→**1**, version 1→**2**, claim and claimed_at **cleared**, adapted_at set |
| 11 | Replay of the same completion | claim_lost; used stays 1, version stays 2 (**increments once**) |
| 12 | Claim with the old version after success | stale |
| 13–15 | Claim, release of a foreign claim (false), release own (true) | claim cleared; texts, used and version untouched |
| 16 | Three successful adaptations | used 3, version 4 |
| 17 | 4th claim | **limit** |
| 18 | Forced 4th completion (claim injected directly) | limit; used stays 3, texts unchanged |
| 19 | `reserve_ai_usage('publication-adaptation')` | **reserved**; monthly 0→1 |
| 20 | Settle completed | true; status completed, monthly 1 |
| 21 | Settle twice | false |
| 22 | Reserve + settle released | true; status released, monthly back to 1 (refunded) |
| 23 | Duplicate reservation id | invalid |
| 24 | Caps | adaptation 20, proposals 20, global 80, weekly 22 |
| 25 | Reserve at monthly 20 | **fn_limit** |
| 26 | anon EXECUTE on claim, complete, release, reserve, settle | all false |
| 27 | authenticated EXECUTE on the same | all false |
| 28 | service_role EXECUTE on the same | all true |
| 29 | `publication_drafts` privileges | authenticated: SELECT only (no INSERT, UPDATE or DELETE); anon: none |

Further checks:
- RLS is enabled on `publication_drafts` (single policy: `select_own_publication_drafts`, SELECT) and on `ai_usage_monthly`.
- `my_ai_usage` is executable by authenticated but not anon. `ai_usage_cap` is not executable by anon.

## 13. Security advisors (10 notices, analysed individually)
| # | Level / rule | Object | Related to A3.7.3.2? |
|---|---|---|---|
| 1 | INFO rls_enabled_no_policy | edge_rate_limits | No. Pre-existing, intentionally service-only. |
| 2 | INFO rls_enabled_no_policy | meta_oauth_states | No. Pre-existing Meta OAuth state, service-only. |
| 3 | INFO rls_enabled_no_policy | stripe_customer_repairs | No. Pre-existing billing, service-only. |
| 4 | WARN function_search_path_mutable | get_funnel_stats (overload 1) | No. Pre-existing admin stats function. |
| 5 | WARN function_search_path_mutable | get_funnel_stats (overload 2) | No. Same as #4. |
| 6 | WARN authenticated_security_definer_function_executable | billing_status() | No. Pre-existing billing. |
| 7 | WARN authenticated_security_definer_function_executable | current_user_has_premium() | No. Pre-existing premium check. |
| 8 | WARN authenticated_security_definer_function_executable | select_publication_proposal(...) | No. A3.7.3.1 (frozen), an intentional owner RPC scoped by `auth.uid()`. |
| 9 | WARN authenticated_security_definer_function_executable | start_trial() | No. Pre-existing billing. |
| 10 | WARN auth_leaked_password_protection | Auth setting | No. Project-level Auth setting. |

None of the 10 notices concerns any of the following:
- publication-adaptations;
- the new claim, release and complete RPCs;
- the new grants and revokes;
- RLS;
- SECURITY DEFINER;
- search_path;
- publication_drafts;
- the AI usage ledger changes.

All new and re-declared functions have a fixed `search_path = public` (confirmed via `pg_proc.proconfig`). No A3.7.3.2 fix was required.

## 14. Internal validation harness
- **Decision:** new module `src/features/channel-adaptation/`:
  - `types.ts`, `repository.ts`, `copy.ts`;
  - `ChannelAdaptationPanel.tsx`.
- **Placement:** it is rendered on the **existing** hidden route `/internal/publications-validation`, below the frozen `PublicationsValidationPage`, inside the same AppGuard and Suspense.
- **Why:** the frozen `PublicationsValidationPage.tsx` and `validation/copy.ts` are untouched. No new route is added (route count stays 34), and there is no nav, Tools, catalog or landing entry. The module name avoids strings that frozen guards forbid elsewhere.
- **Flow:** photo → 3 proposals (frozen page) → panel loads the latest proposals_ready publication → "Elegir esta" (`selectPublicationProposal`) → **"Adaptar para Facebook e Instagram"**.
- **Display:** the selected original (body and CTA), the Facebook adaptation, the Instagram adaptation, version, adaptations used / 3, adaptedAt, and lang.
- **Notice:** "Validación interna — no es una función para clientes."
- **Behaviour:**
  - buttons are disabled while busy and at the limit;
  - only mapped ES/EN error messages are shown, including the limit scope (publication 3 / monthly 20 / global);
  - no text inputs, storage, direct fetch or provider keys.
- `App.tsx` changed only to add the lazy import and the panel element. New sha256: `f4523a4d043ae93b072c58b9f48201f68035119ef160802f50d15358f7a1e2d5`.

## 15. Tests
New tests:
- `a3732AdaptationEngine.test.ts` and `a3732AdaptationAdversarial.test.ts` (engine, safety, adversarial, ledger and claim paths);
- `a3732AdaptationGuards.test.ts` (28 tests): migration security, copied-validator hash identity, the A3.7.3.1 manifest, the 3-key client contract, error and scope mapping, gate codes, malformed bodies, the draft reader, and harness placement and isolation.

A3.7.3.2 total: 103 tests.

Guard and inventory tests changed because the inventory legitimately changed (one new migration, App.tsx gained the harness panel, one new AI caller):

| File | Change |
|---|---|
| auth-trust a281TrustCleanup.test.ts:157 | migrations 52 → 53 |
| auth-trust a281TrustCleanup.test.ts:132 | App.tsx hash re-pinned |
| action-layer a33DiagnosticAction.test.ts:138 | 52 → 53 |
| email-verification f03Stage2b.test.ts:229, :283 | 52 → 53 |
| roadmap a273Roadmap.test.ts:354 | 52 → 53 |
| roadmap a273Roadmap.test.ts:355 | added `_a3732_` exclusion |
| roadmap a273Roadmap.test.ts:72 | App re-pinned |
| today a272TodayIntelligence.test.ts:131 | 52 → 53 |
| today a272TodayIntelligence.test.ts:133 | `_a3732_` exclusion |
| today a272TodayIntelligence.test.ts:43 | App re-pinned |
| social a3542SocialFindings.test.ts:580 | `_a3732_` exclusion |
| social a3543SocialIntelligenceUi.test.ts:270 | md5 of a3542 re-pinned to `6abce40164ec26ffbcf228d1a7f30470` (follows the a3542 edit) |
| cost-control a23CostControl.test.ts:326 | aiCallers list gains `publication-adaptations` |
| social a3544SocialIntegration.test.ts:306 | App re-pinned |
| fixtures/a3732Adaptation.ts:94, :97 | `as const` literals (typing only) |

No frozen A3.7.2 or A3.7.3.1 test was modified.

## 16. Frozen regression
- A3.7.2 manifest: **28 / 28** files unchanged (including `PublicationsValidationPage.tsx` `4754251850c7…726c` and `validation/copy.ts` `faa38cd5…0110`).
- A3.7.3.1 manifest: **4 / 4** files unchanged.
- **Storage/migration fingerprint** (publication-media + migrations, excluding `_a3731_` and `_a3732_`): `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973`. This equals the documented A3.7.1–A3.7.3.1 value. The only additions to that tree are the A3.7.3.1 and A3.7.3.2 migrations, which the documented exclusions remove, so no earlier migration and no publication-media file changed.
  - Method: `find supabase/functions/publication-media supabase/migrations -type f | grep -v -e _a3731_ -e _a3732_ | sort | xargs sha256sum | sha256sum`.
  - Without exclusions the value is `b75a6dfc…b927`. It differs only because the two later migrations are included.

## 17. Deploy state
- `publication-adaptations` is ACTIVE with `verify_jwt = true` (it has a config.toml entry).
- `functions-deploy-state.json` shows 0 functions with `hasChanged: true`; publication-adaptations hash `26e4c0cd…5ce6`.
- `publication-proposals`, `publication-media` and the Meta functions are unchanged.

## 18. Validation results
- `npx vitest run`: **77 files, 2649 / 2649 tests passing.**
- `npx tsc --noEmit -p tsconfig.app.json`: **20 errors (the known legacy baseline), 0 new**, and 0 in A3.7.3.2 files.
- `npm run build`: **PASS.**

## 19. Exposure
- Meta calls = **0** (no publishing; OAuth and scopes untouched).
- Google calls = **0.**
- Customer exposure = **0** (hidden internal route only; nothing in navigation, Tools, catalog or landing).

## 20. Pending (not done on Manuel's behalf)
- The real AI channel-adaptation validation through the harness by Manuel and ChatGPT.
- The A3.7.3.2 freeze after that validation.
- A3.7.3.3 has not been started.
