# A3.7.2.1A — Temporary Real-AI Validation Harness

Verdict: **GO — TEMPORARY REAL-AI VALIDATION HARNESS READY**

## 1. Purpose
Unblock A3.7.2.1 (NO-GO: no authorized session, no UI) by giving Manuel a hidden, authenticated page that drives the real deployed pipeline with his own Premium session. Not product UI.

## 2. Scope
Frontend-only. One hidden route, one page, one copy file, client repository/type additions, one test file, guard re-pins. No edge function, schema, storage-policy, Meta or Google change.

## 3. Route
`/internal/publications-validation`, wrapped in `AppGuard` (authenticated + onboarding complete), mounted outside `AppShellV2` (no sidebar/mobile nav), lazy-loaded.

## 4. Discoverability
Not linked from sidebar, mobile nav, Herramientas catalog, ToolsPage or landing. Test walks `src/` and asserts the only references are `App.tsx`, the page and `copy.ts`.

## 5. Indexing
Page injects `<meta name="robots" content="noindex, nofollow">` on mount and removes it on unmount.

## 6. Authentication
Uses the normal app session. No credential, JWT or key input. Unauthenticated visitors are redirected by `AppGuard`.

## 7. Business ownership
Uses `useBusiness().currentBusiness.id` only. No business_id input. Server RLS and the edge ownership check remain the enforcement; a missing business renders an alert and disables the flow.

## 8. Real pipeline
draft (`createDraft`) → upload/normalize (`attachImage` → `publication-media`) → `generateProposals` (`publication-proposals`, real OpenAI server-side) → persisted proposals → rendered. All via the existing repository.

## 9. No mocks / no bypass
No mocked responses, no fake rows, no direct OpenAI call, no service role in the browser, no Premium or ledger bypass. `requirePremium` and usage limits apply unchanged.

## 10. Image input
JPEG/PNG only, max 8 MB, shown to the user; client pre-check is a hint, server normalization is authoritative. Preview via object URL (revoked on reset).

## 11. Language
Español / English selector, sent as the generation language. No free-text prompt; no textarea exists.

## 12. Generation
"Generar 3 propuestas reales"; client elapsed time measured with `performance.now()`.

## 13. Regeneration
"Regenerar propuestas", disabled once `generationsUsed >= 4`; server enforces the same limit (AI_LIMIT_REACHED).

## 14. Image replacement
Not supported in place. File input disabled once a test exists; user must "Eliminar prueba" and start fresh.

## 15. Delete
"Eliminar prueba" calls the real `deleteDraft` path, then resets local state. A failed attach also deletes its draft.

## 16. Results display
"Lo que LocalSEOHub ha observado" and "Incertidumbres" from returned grounding; three cards DIRECTA/COMERCIAL, CERCANA/NATURAL, PROFESIONAL/INFORMATIVA with body and CTA rendered verbatim as text (no HTML) and copyable.

## 17. Technical metadata
Status, language, generation N/4, generation id, MIME, dimensions, client elapsed time. No tokens, keys, storage paths or raw server payloads.

## 18. Error mapping
Server codes (`body.code`) and gate codes (`body.error`: unauthorized, premium_required, rate_limited) map to stable client codes; PROVIDER_TIMEOUT now maps to `provider_timeout`. Unknown → `unavailable`. UI renders only `ERROR_TEXT[code][lang]`, never raw messages.

## 19. Privacy note
Shown in ES/EN with the required wording.

## 20. Storage
No localStorage/sessionStorage/IndexedDB. Plain React state only.

## 21. Client changes
- `types.ts`: added `premium_required`, `rate_limited`, `provider_timeout` codes and `PublicationGrounding`.
- `repository.ts`: gate-code mapping, PROVIDER_TIMEOUT mapping, `generateProposals` now also returns `grounding` (non-strings filtered, missing → empty arrays).
- `App.tsx`: lazy import + route.

## 22. Engine
A3.7.2 edge engine (`publication-media`, `publication-proposals`) not modified; no defect found. No redeploy needed; both functions ACTIVE with `verify_jwt = true`.

## 23. Tests
New `a3721aValidationHarness.test.ts` (route/guard placement, discoverability, noindex, owned business only, constraints, privacy note, repository-only calls, no OpenAI/Meta/Google/secrets, no storage, disabled states, verbatim rendering, no prompt, delete path, ES/EN error coverage, gate mapping, grounding passthrough/absence).

## 24. Guard re-pins
Marked "A3.7.2.1A HARNESS RE-PIN": App.tsx SHA → `5f7353d2…69ad1` (a281, a272, a273, a3544); route counts 33→34 (a281, a271, f03 ×2, a272, a273), ROUTES 32→33 (a33); a371 "no publications route" now allows only the harness lines; a372 PROVIDER_TIMEOUT → `provider_timeout`.

## 25. Results
Full suite: 69 files, 2405 tests, 0 failures. tsc: 20 errors, all legacy (no new). Build: passes.

## 26. Frozen hashes
Meta handlers `e21d60a5`, `89ff215b`, `57e8341f`, `987cc94b` verified by passing pinned test. Social Intelligence, Hoy and Plan pinned hashes pass. The pre-change manifest file was no longer available; verification relies on the pinned-hash tests.

## 27. Deployment
Frontend build only. No migrations, no edge deploys. A live authenticated load cannot be verified from this environment; CASE 1 is the first live check.

## 28. Known limitation for A3.7.2.1B
The function returns only `grounding {observed, uncertain}`, not the full visual-analysis object. Evaluation of visual understanding is limited to grounding + proposals.

## 29. Removal plan
Delete `src/features/publications/validation/`, the route and lazy import in `App.tsx`, `a3721aValidationHarness.test.ts`, and revert the re-pins in §24. Repository/type additions may stay.

## 30. Manuel — CASE 1 only
1. Open `/internal/publications-validation` and sign in normally with the Premium account.
2. Check the business name shown is the right one.
3. Choose one good, normal photo (JPEG/PNG, under 8 MB). Confirm the preview.
4. Press upload/create, choose **Español**, press **Generar 3 propuestas reales**.
5. Do NOT regenerate.
6. Send back: the observed list, the uncertainties, the three proposals (body + CTA, copied), and the technical data block (or any error message shown).
Never share passwords, tokens or keys. Cases 2–6 planned, not executed.

STOP — A3.7.2.1B not run, A3.7.3 not started, prompts not tuned.
