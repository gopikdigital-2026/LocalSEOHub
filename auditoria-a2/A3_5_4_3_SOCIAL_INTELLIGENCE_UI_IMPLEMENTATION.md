# A3.5.4.3 — Social Intelligence UI — Implementation

## 1. Executive summary
The approved Social Intelligence UI is implemented at `/herramientas/social` and listed as the ninth Tools Hub card. All 16 new UI tests pass, the frozen engines are byte-identical, the build passes and tsc shows no new errors. The full suite is **not green**: 9 tests fail. Eight are pinned inventory checks (tool count, route count, App.tsx hash) that were not finished because the session's edit budget ran out. One is in a **frozen** test file (A3.5.4.2 test 40), and it conflicts with the mandated route registration. Verdict: NO-GO pending correction.

## 2. Scope implemented
Route, Tools Hub card, header, FB/IG overview, "Qué merece tu atención", "Lo que sabemos hasta ahora", "Alcance del análisis", data/refresh footer, empty/loading/error/no-business states, and "Ver publicaciones" expansion.

## 3. Files created
`src/features/social-intelligence/ui/`:
- `repository.ts`
- `copy.ts`
- `viewModel.ts`
- `useSocialIntelligence.ts`
- `SocialIntelligencePage.tsx`
- `PlatformOverview.tsx`
- `AttentionSection.tsx`
- `InsightSections.tsx`
- `__tests__/a3543SocialIntelligenceUi.test.ts`

## 4. Files modified
- `src/App.tsx`: lazy import plus one route.
- `src/features/tools/catalog.ts`: `social` entry.
- `src/features/tools/ToolsPage.tsx`: Share2 icon.
- `src/features/tools/__tests__/toolsHub.test.ts`
- Inventory tests in 13 other files (see §27).

## 5. Route
`/herramientas/social` is lazy-loaded and placed inside the `AppGuard`/`AppShellV2` block next to `/herramientas/resenas`. The sidebar and bottom bar are unchanged.

## 6. Tools Hub
New card: id `social`, "Inteligencia Social" / "Social Intelligence", Share2 icon, `dataKind: 'sources'`, `ACTIVE`, `legacyFunction: null`, no custom CTA, no URLs. toolsHub tests were updated to 9 tools. They now also assert the social entry's metadata, path, route line and icon, so the tests became stricter, not weaker.

## 7. Header
Uses the exact ES/EN title, subtitle and trust note, with "Volver a Herramientas" / "Back to Tools" linking to `/herramientas`.

## 8. Platform overview
Two cards (`sm:grid-cols-2`), each showing account name, a text status badge, activity label, number of posts analysed, a "history building" note and the relative last-update time with the absolute time as a tooltip. There are no engagement figures, scores, percentages or trends.

## 9. Activity language
- RECENT shows "Actividad reciente" plus the days detail.
- INTERMEDIATE shows only "Última publicación hace {n} días".
- LONG shows "Sin publicaciones recientes" plus the detail.

The day count is the engine's whole-day value. "Inactivo" is never used (tested).

## 10. Attention section
Shows ACTIVE findings plus access, NOT_AVAILABLE and DATA_STALE findings, in engine order. Each card has a badge, a title (the recommendation title, otherwise the frozen finding title), a body (the recommendation message), a "¿Por qué?" line (the finding summary) and a CTA. When there are none, it shows the neutral empty text.

## 11. Visual priority
- MEDIUM/HIGH: `border-v2-warning-300`, "Prioritario".
- LOW: `border-v2-primary-200`, "Para revisar".
- Access/stale: neutral border with the status badge ("Requiere reconexión", "Acceso limitado", "Sin vincular", "Pausa temporal de Meta", "Error temporal", "Pendiente de sincronizar", "Datos desactualizados").

No red/error tokens are used (tested).

## 12. "Ver publicaciones"
A toggle button with `aria-expanded`/`aria-controls` lists the affected posts (date, type, link), sorted newest first. The without-text predicate mirrors the engine: a post counts as without text when it has no string or only whitespace.

## 13. Consistency guard
If the number of derived posts differs from `params.postsWithoutText`, the list and the CTA are hidden (test J).

## 14. Permalink allowlist
Links must be https, with no credentials and no port, and the host must be one of facebook.com, www/m.facebook.com, instagram.com or www.instagram.com. Anything else shows "Enlace no disponible". Links open with `target="_blank" rel="noopener noreferrer"` plus screen-reader "new tab" text (test K).

## 15. Known section
INFORMATIONAL findings appear as a compact list with an h3 title and the summary text.

## 16. Coverage section
- A single consolidated LIMITED_HISTORY entry, showing the platforms, the aspects (dates, frequency, formats, interaction) and the WAIT_FOR_MORE_HISTORY text, with no CTA.
- A FB engagement-unavailable sentence.

## 17. Engagement semantics
NULL is never rendered as 0. IG 0/0 produces no diagnosis, card or figure (test C).

## 18. Freshness
Freshness comes from `meta_sync_state.last_success_at` through the frozen engine. When data is STALE, activity and counts are hidden, business findings computed on stale data are suppressed, and a single DATA_STALE card shows the last good sync time and a refresh CTA (test E).

## 19. Refresh
Reuses the existing `syncMetaContent()` and then re-reads the data. States:
- idle
- refreshing (previous report kept, `aria-busy`, `opacity-60`)
- success
- cooldown (`SYNC_COOLDOWN`)
- rateLimited
- reauth
- permission
- error

The outcome is resolved against the re-evaluated report. If the reload fails, "Mostrando los últimos datos correctos" is shown.

## 20. State matrix A–N
Verified through the real frozen engines:
- connected
- stale
- REAUTH_REQUIRED, PERMISSION_UNAVAILABLE and NOT_LINKED → "Ir a Fuentes"
- RATE_LIMITED and SYNC_ERROR → no CTA
- NEVER_SYNCED → refresh
- both platforms NOT_CONNECTED → empty state

Loading uses a skeleton with `role="status"` and reduced motion; there is a 15 s read timeout leading to the error state with "Reintentar". If no business is selected, a link to `/negocio` is shown.

Note: when the Instagram connection status is `permission_unavailable`, the frozen engine classifies it as NOT_LINKED; the badge "Acceso limitado" appears only when the sync row reports a permission error. This is the engine's behaviour and was not changed.

## 21. Empty state
Shows "Conectar redes" linking to `/fuentes`. There is no OAuth inside the page.

## 22. Data access
- Explicit columns only, and every query is filtered by `business_id`.
- Items limited to 200.
- No `select('*')`, tokens or `user_token_ref` (test P).
- Reads go through the existing RLS.

## 23. Backend
No migrations, tables, RPCs, edge functions or permission changes.

## 24. View model
`viewModel.ts` is pure. It creates no findings and does not change priorities.

## 25. UNSUPPORTED filter
`isPublishableRecommendation` requires a catalog entry, a non-UNSUPPORTED safety class, a non-null action type, and DIRECT/CONTEXTUAL. Forged and relabelled recommendations are dropped (test H).

## 26. Real actions only
The only actions are links to `/fuentes`, `/herramientas` and `/negocio`, sync, expand/collapse, and validated permalinks. There are no `navigate()`, `window.open` or OAuth calls (test I).

## 27. Tests
New suite: 16 tests covering A–P, all passing.

Inventory tests updated deliberately, each annotated "A3.5.4.3":
- toolsHub
- a281 (tool count, App hash, route count)
- a271 (route count, tool list)
- a33 (route count)
- a2420
- a242
- a243
- a244
- a245
- a246
- a247
- a248
- a25Integration
- a26Billing
- a261EmailAuth

**Not yet updated** because the session's edit limit was reached:
- `a261SpecChecklist.test.ts:106`: add `'social'` to the sorted list.
- `f03Stage2b.test.ts:261,284`: route count 32 → 33.
- `a342ReviewsAi.test.ts:345`: add `'social'`.
- `a273Roadmap.test.ts:72,327`: App sha256 → `36074bedfe7a79ecb92e47ec795abd1b9d263f3a37a1f8422146206f86f49078`, and add `'social'` to the tool list.
- `a272TodayIntelligence.test.ts:43,210,259`: same App hash, add `'social'`, route count 32 → 33.

## 28. Frozen-baseline conflict (blocking)
`findings/__tests__/a3542SocialFindings.test.ts` test 40 asserts that no file outside `features/social-intelligence` contains the string `social-intelligence`. The mandated lazy route in `src/App.tsx` necessarily imports from that folder, so this frozen test fails. I did not edit the frozen file, and I did not hide the import path to get around the check. Correction needed: authorize a scoped amendment to test 40, for example allowing exactly the single lazy-import line in `src/App.tsx`, and re-freeze the new md5.

## 29. Regression results
- Full suite: 2196 passed, 9 failed (8 pending inventory updates + 1 frozen conflict).
- New tests, signals tests, Meta read tests and toolsHub: all pass.
- Findings tests: all pass except test 40.
- tsc: 20 errors, all pre-existing; none new.
- `npm run build`: passes.

## 30. Frozen hashes
All 12 frozen files match their md5 values before and after (also asserted in test P). The temporary baseline file was removed.

## 31. Real-data checks
Read-only. A fixture shaped like the production data (3 FB posts with 2 lacking text, 1 IG post with 0/0, intermediate activity at 8 days) produces:
- attention: IG long inactivity (MEDIUM) and FB text missing (LOW), with 2 linkable posts listed;
- known: FB intermediate activity and the recency difference between platforms;
- coverage: limited history on both platforms and FB engagement unavailable.

Validation against the live account is pending A3.5.4.3.1.

## 32. Exclusions honoured
- No charts, scores, filters, tabs, publishing, AI or tables.
- No integration with Hoy, Plan, Advisor, Twin, Resumen or Action Layer.
- No sidebar or bottom-bar change.

## 33. Final verdict
NO-GO — SOCIAL INTELLIGENCE UI IMPLEMENTATION REQUIRES CORRECTION
