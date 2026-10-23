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

(Original verdict, kept for the record. It is superseded by A3.5.4.3-FIX1 below.)

---

# A3.5.4.3-FIX1 — Regression Baseline Correction

## F1. Initial NO-GO
After A3.5.4.3, the full suite showed 2196 passed and 9 failed: 8 stale inventory expectations and 1 conflict with frozen architectural guard test 40.

## F2. The nine original failures
1. `a261SpecChecklist` (sorted tool list)
2. `f03Stage2b` 28-31 (route count)
3. `f03Stage2b` (second route-count test)
4. `a342ReviewsAi` (tool list)
5. `a273Roadmap` (App.tsx sha256)
6. `a273Roadmap` (tool list / route count)
7. `a272TodayIntelligence` (App.tsx sha256)
8. `a272TodayIntelligence` (tool list / route count)
9. `a3542SocialFindings` test 40

All were re-verified as the exact current failures before editing.

## F3. Inventory corrections
All are precise value updates. No assertion was removed or loosened.
- `a261SpecChecklist.test.ts`: `'social'` added to the sorted list.
- `f03Stage2b.test.ts`: route count 32 → 33 (two assertions), and tool count 8 → 9. The tool count was hidden behind the route assertion in the same test and surfaced once that was fixed.
- `a342ReviewsAi.test.ts`: `'social'` added.
- `a273Roadmap.test.ts`: App.tsx sha256 updated, test 96 updated to nine tools, and test 113 route count 32 → 33. The route count was hidden behind the hash assertion in the same test.
- `a272TodayIntelligence.test.ts`: App.tsx sha256 updated, test 69 updated to nine tools, and test 91 route count 32 → 33.

## F4. Test-40 conflict
Test 40 forbade the string `social-intelligence` in every source file outside the feature. The approved route has to be registered in `src/App.tsx` via a lazy import from the feature path, so the guard and the approved scope could not both be satisfied.

## F5. Why the exception is legitimate, and how narrow it is
Application routing is the one sanctioned point where a feature enters the app shell. The amended guard still walks every `.ts`/`.tsx` file outside `src/features/social-intelligence/**` and forbids `social-intelligence`. The single exception applies to `src/App.tsx` only, and only under all of these conditions:
- The exact line `const SocialIntelligencePage = lazy(() => import('./features/social-intelligence/ui/SocialIntelligencePage'));` appears exactly once.
- `SocialIntelligencePage` appears exactly 3 times: twice in that import line and once in the route.
- The exact route `<Route path="/herramientas/social" element={<SocialIntelligencePage />} />` is present.
- After that one line is removed, no other `social-intelligence` reference remains.

The findings-source isolation check in test 40 is unchanged.

Negative probe: a temporary file `src/__guardprobe.ts` importing `./features/social-intelligence/findings/engine` made test 40 fail as required. The probe was then deleted.

## F6–F7. Test-40 file hash (authorized frozen test baseline amendment)
| | md5 | sha256 |
|---|---|---|
| Old | `25e8e1cebfc4457e01b7615f6f17d9b1` | `01d2d78a89ff67d93c12a1c12672d1bf887f8ba884b7defb8e728d80cd4e583c` |
| New (frozen baseline) | `ce2a491f5dc65e6d113ef4401bc34746` | `43e6da4af38f5912715f169d83a795125b57bd540ecdbb6ccff6b0267a575e6b` |

The new md5 is pinned in `a3543SocialIntelligenceUi.test.ts` test P. The historical A3.5.4.2.1 report is left untouched as a record of the earlier baseline.

## F8. Production engine change
**NONE.** Social Signals and Social Findings production files are byte-identical (see F14).

## F9. App.tsx SHA-256
The computed value is `36074bedfe7a79ecb92e47ec795abd1b9d263f3a37a1f8422146206f86f49078`, which matches the supplied value. App.tsx was not modified by FIX1.

## F10. Targeted tests
toolsHub, a261SpecChecklist, f03Stage2b, a342ReviewsAi, a273Roadmap, a272TodayIntelligence, a3542SocialFindings and a3543SocialIntelligenceUi: 8 files, **405/405 passed**.

## F11. Full suite
61 files. **2205 total, 2205 passed, 0 failed, 0 skipped.**

## F12. TypeScript
`tsc --noEmit -p tsconfig.app.json` reports 20 errors, the same pre-existing set:
- LandingPage 10
- BusinessAuditLanding 2
- ContentGeneratorLanding 2
- MetaAdsLanding 2
- DiagnosticLanding 1
- AdminDashboard 1
- a3422GbpRecovery test 1
- App.tsx 1 (unused `useAuth`, line 5, pre-existing)

**0 new.**

## F13. Final post-edit build
`npm run build` passes. It was executed after the last file modification, including this report.

## F14. Frozen baseline verification
Unchanged:
- A3.5.4.1: `engine.ts` a088e2e9…, `policy.ts` 9a2b024c…, `signals.ts` 7d2a19a4…, `types.ts` b9e9509c…, `a3541SocialSignals.test.ts` c91ccc29…
- A3.5.4.2: `findings/copy.ts` 5c2c0e33…, `engine.ts` b923294c…, `policy.ts` 8f40dfbe…, `rules.ts` 2dbf1084…, `types.ts` 06e724e6…
- Meta read layer: `metaRepository.ts` 521963d2…, `metaSyncStatus.ts` 0e8612a8…, `meta-read/handler.ts` 57983b06…, `meta-read/index.ts` 499f786f…

Only `a3542SocialFindings.test.ts` received a new frozen hash (F6–F7).

## F15. Scope audit
FIX1 includes none of the following:
- DB migrations, tables, RPCs or Edge Functions
- Meta permissions or OAuth changes
- Social Score, charts, publishing or AI generation
- Hoy, Plan, Advisor, Twin or Resumen integration
- A3.5.4.4 or A3.5.4.3.1 work

The Social Intelligence UI files are unchanged.

## F16. Remaining limitations
- Validation against the live production account is still pending (A3.5.4.3.1).
- When the Instagram connection status is `permission_unavailable`, the badge shows NOT_LINKED (frozen engine behaviour, §20).
- The 20 legacy TypeScript errors remain.

## F17. Final verdict
GO — SOCIAL INTELLIGENCE UI IMPLEMENTED AND READY FOR REAL-DATA VALIDATION
