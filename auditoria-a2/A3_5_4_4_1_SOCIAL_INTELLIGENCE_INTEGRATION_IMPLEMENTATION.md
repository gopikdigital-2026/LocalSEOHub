# A3.5.4.4.1 — Social Intelligence Integration: Projection + Minimal Hoy/Plan Integration

Mode: implementation + automated validation. Source audit: `A3_5_4_4_0_SOCIAL_INTELLIGENCE_INTEGRATION_AUDIT.md` (GO).

## 1. Executive summary
A pure, deterministic projection now turns the frozen Social Findings report into at most one Hoy item and at most one Plan item. A compact card, "Desde tus redes sociales" / "From your social accounts", renders that item in Hoy (`/hoy`) and Plan. It links only to `/herramientas/social`.
- Nothing is persisted. No Meta calls are made.
- There is no premium gate.
- Advisor, Twin and Resumen are untouched.
- Results: 2236/2236 tests pass (62 files), 20 TypeScript errors (equal to the legacy baseline, 0 new), and `npm run build` passes after the final edit.

## 2. Approved decisions
- No premium gate.
- The CTA goes to `/herramientas/social` only. No anchor and no permalink.
- A controlled TodayPage change and re-pin are authorized.
- Plan is LIMITED to CONSIDER_NEW_CONTENT from LONG_INACTIVITY / NO_CONTENT.
- Max 1 item per consumer.
- No persistence and no new backend.
- Advisor, Twin and Resumen = NO.

## 3. Frozen baseline
I recorded sha256 values before editing (`/tmp/a3544/baseline.txt`) for these files:
- Signals: engine, policy, signals, types.
- Findings: copy, engine, policy, rules, types.
- UI: copy, repository, useSocialIntelligence, viewModel, AttentionSection, InsightSections, PlatformOverview, SocialIntelligencePage.
- Meta: metaRepository, metaSyncStatus, meta-read handler and index.
- Pages and tests: TodayPage, PlanPage, App.tsx, a273Roadmap.test, a272TodayIntelligence.test.

## 4. Files created
- `src/features/social-intelligence/integration/projection.ts`: the pure projection.
- `src/features/social-intelligence/integration/copy.ts`: ES/EN integration copy.
- `src/features/social-intelligence/integration/SocialIntegrationCard.tsx`: the compact consumer card.
- `src/features/social-intelligence/integration/__tests__/a3544SocialIntegration.test.ts`: 31 tests.

## 5. Files modified
- `src/app-v2/routes/TodayPage.tsx`: one import and one mount line.
- `src/app-v2/routes/PlanPage.tsx`: one import and one mount line.
- Fingerprint re-pins:
  - `a273Roadmap.test.ts`
  - `a281TrustCleanup.test.ts`
  - `a33DiagnosticAction.test.ts`
  - `a3543SocialIntelligenceUi.test.ts` (fingerprint of the a3542 guard file)
- Guard change: `a3542SocialFindings.test.ts`, test 40 (see §31).

## 6. Projection architecture
1. `loadSocialData` (frozen, 3 stored-data reads) feeds `analyseSocialData` (frozen signals plus findings).
2. `projectSocialIntegration(report, lang)` then produces `{hoy, plan}`.

The projection does no I/O, no clock reads and no randomness. It only reads `report.findings` and `report.recommendations`.

## 7. Projection contract
`SocialIntegrationItem` = `{id, consumer, platform, priority, message, sourceLabel, destination, findingKey, recommendationKey}`.
- The id is `social:<recommendationKey>:<findingKey>`.
- `SOCIAL_HOME` maps each eligible recommendation key to exactly one consumer, plus the required safety class, finding status and topics.

## 8. Hoy eligibility
A Hoy item must meet all of these:
- Key is REVIEW_POSTS_WITHOUT_TEXT (TEXT_MISSING), REVIEW_POSTS_WITHOUT_CAPTION (CAPTION_MISSING), RECONNECT_META (ACCESS_REAUTH_REQUIRED) or REVIEW_META_PERMISSIONS (ACCESS_PERMISSION_UNAVAILABLE).
- The recommendation passes `isPublishableRecommendation`.
- The safety class is DIRECT.
- The finding status is ACTIVE for content findings and NOT_AVAILABLE for access findings.
- The finding is not stale.

## 9. Hoy exclusions
These never appear in Hoy:
- DATA_STALE / REFRESH_DATA
- Informational findings
- LIMITED_HISTORY and WAIT_FOR_MORE_HISTORY
- Engagement unavailable or insufficient
- CONSIDER_NEW_CONTENT
- CONNECT_PLATFORM / NOT_CONNECTED
- RETRY_LATER / rate limit and sync error
- Frequency, content-type and cross-platform observations

All of these are covered by tests 8–16.

## 10. Hoy implementation
- The card is mounted directly after `TodayPriorities` and is separate from Action Layer systems A and B.
- It renders null when there is no item.
- It contains an h2 heading, a message, a platform attribution and a real `<Link>` to `/herramientas/social`.

## 11. Plan eligibility
CONSIDER_NEW_CONTENT only, with all of these:
- safety class CONTEXTUAL;
- finding status ACTIVE;
- topic LONG_INACTIVITY or NO_CONTENT;
- not stale.

It uses the frozen conditional copy ("Si {platform} forma parte de tu estrategia activa…").

## 12. Plan exclusions
- TEXT_MISSING and CAPTION_MISSING
- All technical and access states
- Intermediate or recent activity (the real-data shape, where Plan shows nothing)
- Stale data

## 13. Plan implementation
- Mounted after `RoadmapCard`.
- No checkbox, due date, effort, impact or completion control.
- Not added to the roadmap engine and not persisted.

## 14. Advisor exclusion
A test asserts that no file in `src/features/business-advisor` or `supabase/functions/business-advisor-v2` references Social Intelligence. The a3542 test 40 guard still fails on any such reference.

## 15. Twin exclusion
The same assertion covers `src/features/digital-twin`.

## 16. Resumen exclusion
The same assertion covers `WeeklySummaryPage.tsx`.

## 17. Persistence
None. Tests 24–25 check the integration sources for these and find none:
- `business_actions`, insert, upsert, update, delete, rpc
- `functions.invoke`, localStorage
- direct supabase usage

## 18. Lifecycle
Items are derived on every page mount from the latest stored sync. Once the condition disappears in a later sync, the item disappears; the lifecycle test covers this. There is no dismissal state.

## 19. Freshness
- Freshness comes from `meta_sync_state.last_success_at`, through the frozen engine.
- When data is stale, the frozen engine emits only DATA_STALE / REFRESH_DATA, and neither is projected.
- As a second safeguard, the projection also rejects any finding marked STALE (test 14, forged report).

## 20. NULL vs zero
- The projection never reads metrics.
- Facebook NULL metrics stay "unavailable", and Instagram zeros stay a small-sample result. Neither becomes an item (test 27).

## 21. Priority
- The frozen priority is copied unchanged.
- No new scoring and no SOURCE_POINTS.
- Real-data TEXT_MISSING is LOW; RECONNECT is MEDIUM. Neither is HIGH nor INFO (test 20).

## 22. Deduplication
- Items are deduplicated by canonical id.
- Each consumer gets one item: the first eligible one in the frozen `PRIORITY_RANK` order.
- One key has exactly one home, so the same finding never appears in both Hoy and Plan.

## 23. Source attribution
- Single-platform items read "Basado en tus datos de Facebook/Instagram" / "Based on your Facebook/Instagram data".
- Cross-platform items are attributed to "Meta".

## 24. Performance
- One `loadSocialData` per card mount. That is 3 indexed reads, with the frozen 15 s timeout.
- Hoy and Plan are separate routes, so a page never reads twice.
- No Meta Graph or meta-read call is made on load, and there is no polling.

## 25. Security
- Reads go through frozen, RLS-protected, explicit-column queries. The secret boundary is unchanged.
- No tokens, permalinks or external URLs.
- Errors hide the card silently, so no internal error detail reaches the UI.

## 26. I18n
- ES/EN key parity is tested.
- The messages contain no internal enum keys, placeholders or null/undefined/NaN.
- The copy avoids performance, follower and guarantee claims.

## 27. Accessibility
- The section is labelled by its h2 (the page's h1 stays the only h1).
- The CTA is a real link and keyboard focusable, with a visible focus ring.
- Icons are `aria-hidden`.
- Meaning comes from text, not colour.

## 28. Responsive
- The card is a single column with `break-words` wrapping.
- The CTA wraps below the text on narrow widths and sits inline on larger widths.
- It was not checked visually in a browser: there is no browser in this environment. The A3.5.4.4.2 E2E phase should confirm it at 375 px, tablet and desktop.

## 29. Controlled TodayPage re-pin
AUTHORIZED A3.5.4.4.1 TODAYPAGE INTEGRATION RE-PIN.
- sha256 `423bd478…e781c` → `78cdf392ae270d805046632ecb5e0b4872134d8a6ff5f24bd91b0f0a9e8129da`.
- The change is one import and one mount line.
- Re-pinned in a273, a281 and a33, each with the authorization comment.
- No Hoy redesign. The `useActions()` and dataIntegrity guards still pass.

## 30. PlanPage re-pin
AUTHORIZED A3.5.4.4.1 PLANPAGE INTEGRATION RE-PIN.
- sha256 `adfa7e58…e9d9f1` → `109a1a58060ac4b2ef412b62ce3699e751452e904f88d3b4285bdab1e0da8dc0`.
- Re-pinned in a33.
- a272 test 90 (no `today-intelligence` in Plan) still passes.

## 31. Architectural guard changes
- In `a3542SocialFindings.test.ts`, test 40 now permits exactly one exact import line, `SocialIntegrationCard` from `.../integration/SocialIntegrationCard`, and only in TodayPage and PlanPage.
- Every other outside reference still fails, including any in Advisor, Twin or Resumen.
- The fingerprint of that file is re-pinned in a3543 with an `AUTHORIZED A3.5.4.4.1 GUARD RE-PIN` comment.
- A new test also asserts that the only importers of `social-intelligence/` are App.tsx (the route), TodayPage and PlanPage.

## 32. Tests added
`a3544SocialIntegration.test.ts`, 31 tests:
- The §37 projection cases 1–27.
- Parity with Social page attention cards.
- Lifecycle disappearance.
- 9 consumer and guard tests:
  - Hoy mount
  - Plan mount
  - compact card
  - single read and error hiding
  - Advisor/Twin/Resumen exclusion
  - importer allowlist
  - actions/roadmap not extended
  - ES/EN parity
  - frozen hashes

## 33. Targeted tests
These suites pass:
- social-intelligence (a3541, a3542, a3543, a3544)
- today-intelligence (a272)
- roadmap (a273)
- action-layer (a33)
- components (a281, dataIntegrity)
- actions (engine)

## 34. Full regression
`npx vitest run`: 62 files and 2236 tests passed, 0 failed.

## 35. TypeScript
`tsc --noEmit -p tsconfig.app.json` reports 20 errors, equal to the legacy baseline, with 0 in the new or modified files. A type error in the new test was fixed before the final run.

## 36. Final post-edit build
`npm run build` succeeded after the last edit.

## 37. Frozen-file verification
I re-checked every file against the baseline sha256. All signals, findings, UI, Meta-connection and meta-read files, and App.tsx, are unchanged. The only mismatches are the authorized edits: TodayPage, PlanPage and a273Roadmap.test. a272TodayIntelligence.test is unchanged.

## 38. Database/backend changes
None:
- no migrations, tables or RPCs;
- no Edge Functions deployed or changed;
- migration count is unchanged (49) and the route count is unchanged (33).

## 39. Known limitations
- The card loads separately from the page data, so it may appear a moment after the rest of Hoy and Plan.
- The responsive and visual check was not done in a browser.
- Real-data expectation (current snapshot): Hoy shows "Revisa 2 publicaciones de Facebook sin texto" and Plan shows nothing. This is not yet confirmed on real data.
- An item cannot be dismissed. It disappears once the condition clears in a later sync.

## 40. Scope exclusions
- Premium gating
- Anchors or permalinks
- Post lists and evidence
- Persistence and business_actions
- Roadmap engine changes
- Advisor, Twin and Resumen
- New scoring
- Engagement and performance claims
- Freeze

## 41. Final verdict
GO — SOCIAL INTELLIGENCE INTEGRATION IMPLEMENTED AND READY FOR REAL-DATA VALIDATION

## 42. Exact next phase
A3.5.4.4.2: real-data E2E validation and freeze of the Social Intelligence integration. It must be started explicitly; it does not start automatically.
