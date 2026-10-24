# A3.5.4.4.2 — Social Intelligence Integration: Real-Data E2E Validation and Freeze

## 1. Executive summary
I validated the A3.5.4.4 Social Intelligence integration (Hoy card, Plan card and projection) against the real Gopik.Digital Meta snapshot. I also checked isolated scenarios and a rendered headless-Chromium matrix covering ES/EN and widths of 1280/820/375/320 px.
- Real data produces exactly one Hoy item, `REVIEW_POSTS_WITHOUT_TEXT:FACEBOOK_TEXT_MISSING`, and no Plan item.
- The CTA reaches `/herramientas/social` and the matching finding.
- Nothing is persisted and no Meta call is made on Hoy or Plan load.
- All frozen hashes are unchanged.
- Tests: 2236/2236. tsc: 20 legacy errors, 0 new. Build: PASS.
- No material defect was found. **Verdict: GO.**

## 2. Validation timestamp
2026-10-24 (UTC), approximately 11:00Z. Data freshness was evaluated against the current time.

## 3. Business/account
- Business: Gopik.Digital, `e6014022-370f-4ec0-a340-c7c55f808247`.
- Meta connection: Facebook Page connected and Instagram connected.
- No token, secret, vault reference or OAuth payload was read or recorded. The browser-visible columns are limited to `status, instagram_status, page_name, instagram_username`.

## 4. Frozen baseline
I hashed all integration files, TodayPage, PlanPage, App.tsx, the A3.5.3/A3.5.4.1/A3.5.4.2/A3.5.4.3 engines, the UI, meta-read and the guard tests before validation. Every value matched the A3.5.4.4.1 report (see §40). No production file was modified during this phase.

## 5. Current freshness
`meta_sync_state.last_success_at` was 2026-10-23T12:00:32Z for both FACEBOOK and INSTAGRAM, which is about 23 h old and within the freshness window. No sync was run.

## 6. Current Facebook snapshot
- 3 PHOTO items, all published 2026-10-14.
- 1 has text and 2 have null text.
- reaction_count and comment_count are NULL on all 3 (not provided).
- All permalinks are https facebook.com URLs.

## 7. Current Instagram snapshot
1 IMAGE item, published 2026-10-14. The caption is present, reactions/comments are 0/0 (real zero), and the permalink is https instagram.com.

## 8. Real Social analysis
`analyseSocialData(snapshot, now)`:
- The text-missing signal fires for Facebook (2 of 3).
- No inactivity, no-content, reauth, permission or stale signal fires.
- Finding: `FACEBOOK_TEXT_MISSING` (LOW), mapped to recommendation `REVIEW_POSTS_WITHOUT_TEXT`.
- This is consistent with the Social page view model's attention list.

## 9. Real integration projection
`projectSocialIntegration(report, 'es')`:
- `hoy` = `{ id: 'social:REVIEW_POSTS_WITHOUT_TEXT:FACEBOOK_TEXT_MISSING', message: 'Revisa 2 publicaciones de Facebook sin texto', source: 'Facebook', cta → /herramientas/social }`.
- `plan` = null.
- EN message: "Review 2 Facebook posts without text".

## 10. Hoy real-data result
- Exactly 1 Social block, with the heading "Inteligencia Social" / "Social Intelligence", the message above, the source label and the CTA "Ver en Inteligencia Social" / "View in Social Intelligence".
- No evidence, metrics, score, percentage or permalink appears in the card.
- The existing Hoy sections (priorities, missions, roadmap, actions) are untouched. The TodayPage diff is one import plus one mount line, and the hash is unchanged.

## 11. Hoy CTA E2E
In the rendered harness, clicking the CTA navigated to `/herramientas/social`. The Social page rendered with the h1 "Inteligencia Social" and showed the matching attention card "2 de 3 publicaciones…". Expanding it showed the 2 Facebook evidence links, which open in `_blank` with `rel="noopener noreferrer"`.

## 12. Premium semantics
There is no premium gating in projection.ts or SocialIntegrationCard.tsx (verified by source and by test). The card renders identically regardless of plan.

## 13. Plan real-data result
`plan` = null, and the Plan page renders 0 Social cards.

## 14. Plan positive scenario
These were run in isolation with fixtures and did not touch production.
- LONG_INACTIVITY: 1 `CONSIDER_NEW_CONTENT` card.
- NO_CONTENT: 1 `CONSIDER_NEW_CONTENT` card.
- Both use conditional copy ("Considera…" / "Consider…").
- Neither card has a checkbox, due date, effort, impact or persistence.
- Maximum height is 193 px at 320 px width, with no overflow.

## 15. Plan exclusions
The reauth, permission, stale and real (text-missing) scenarios each give 0 Plan cards.

## 16. Hoy exclusions
- LONG_INACTIVITY gives 0 Hoy cards (Plan-only).
- Stale gives 0 Hoy cards (CROSS_PLATFORM_DATA_STALE / REFRESH_DATA is not eligible).
- No-content gives 0 Hoy cards.

## 17. Technical Hoy scenarios
These were run in isolation and real OAuth was not altered.
- RECONNECT_META: "Vuelve a conectar Meta" / "Reconnect Meta", source Meta.
- REVIEW_META_PERMISSIONS: "Revisa los permisos de Meta" / "Review your Meta permissions", source Facebook.
- Each shows one card and the CTA goes to `/herramientas/social`.

## 18. NULL vs zero
- The Facebook NULL metrics are not rendered and not turned into 0.
- The Instagram 0/0 is not surfaced at all, because the integration carries no metrics.
- The text-missing count (2) comes from null `text_content` only.

## 19. Freshness
The freshness decision relies solely on `last_success_at`. With fresh data the engine produced real findings. The stale fixture suppressed every Hoy and Plan item.

## 20. Deduplication
- Hoy shows at most 1 item and Plan at most 1 item.
- The ids `social:<rec>:<finding>` are deterministic.
- The Hoy and Plan eligibility sets do not overlap, so the same finding never appears in both.

## 21. Lifecycle
- The card loads once per mount and hides itself on error, timeout or empty data.
- There is no polling, no write, no sync and no storage.
- When the conditions disappear, the item disappears on the next load.

## 22. Database audit
- Public tables named social/projection/integration: 0.
- RPCs named social/projection: 0.
- Applied migrations: 48. The last is `20261022170523` (A3.5.3), so nothing was added in A3.5.4.x. Local migration files: 49, unchanged in this phase (a pre-existing difference that predates A3.5.4).
- `business_actions` has 7 rows for the business. No row has a `social:` source_reference. The 4 rows matching social keywords in their text are `BUSINESS_PROFILE / add_business_website` actions created 2026-10-08 to 2026-10-20, before A3.5.4.
- `meta_content_items`: 4 rows, unchanged.
- Edge functions: 38, all pre-existing, with no new function.

## 23. Network/Meta audit
- In the rendered harness, each page load made 2 data reads (card plus Social page), 0 `syncMetaContent` calls and 0 network fetches.
- The integration imports only `loadSocialData`, which reads Supabase tables and never Meta Graph or meta-read.
- `syncMetaContent` is reachable only from the explicit refresh button on the Social page.

## 24. Advisor exclusion
`src/features/business-advisor` and `supabase/functions/business-advisor-v2` contain no reference to social-intelligence. Also covered by an a3544 test.

## 25. Twin exclusion
`src/features/digital-twin` has no reference.

## 26. Resumen exclusion
WeeklySummaryPage (`/informes`) has no reference.

## 27. Security
- The browser selects only non-sensitive columns. A grep of the integration sources and repository.ts finds no token, vault or secret.
- All copy is rendered as React text, with no HTML injection sink.
- The CTA is an internal static route.
- Evidence links on the Social page are https-only, with noopener/noreferrer.
- RLS and grants are unchanged.

## 28. ES
Heading, message, source and CTA are all correct in Spanish, with no English leakage.

## 29. EN
Heading, message, source and CTA are all correct in English, with no Spanish leakage.

## 30. Responsive
I used headless Chromium 156 over CDP in real time, at 1280×900, 820×1180, 375×812 and 320×700, in ES and EN.
- No horizontal overflow, clipping or overlap.
- The CTA (about 200×30 px) stays inside the card.
- Card height is 135–155 px on Hoy and up to 193 px on Plan.
- I reviewed the screenshots visually.

## 31. Accessibility
- The `<section>` is labelled by its own h2, and the page keeps a single h1.
- The CTA is a focusable link with visible text.
- Icons are `aria-hidden`.
- There are no inputs or images.
- The source label uses the existing tertiary text token.

## 32. Forbidden-output audit
The rendered texts contain none of: score, /100, %, engagement, reach, followers, sales, revenue, competitor, raw finding or recommendation keys, internal ids, or tokens.

## 33. Real user journey
The journey is: open Hoy, see the single Social suggestion, click the CTA, land on Inteligencia Social, see the same finding with its evidence, and open a post in a new tab. The journey is coherent, and there are no dead ends.

## 34. Frozen-engine integrity
All upstream hashes (§40) are identical before and after validation.

## 35. Targeted tests
social-intelligence, meta-connection, today-intelligence, roadmap, action-layer, components and actions: 19 files, 885/885 passed.

## 36. Full regression
62 files, 2236/2236 passed, equal to the baseline. No temporary test remains.

## 37. TypeScript
`tsc --noEmit -p tsconfig.app.json`: 20 errors, all legacy, 0 new.

## 38. Final build
`npm run build` was run as the final action after cleanup and the report: PASS.

## 39. Temporary-file cleanup
Removed:
- `src/__a3545tmp/`: the fixtures, scenarios, temporary test, harness, stubs, CDP driver and screenshots;
- `/tmp/a3545/profile`;
- `/tmp/a3545/harness-dist`.

No temporary file remains in the project.

## 40. Freeze hashes (sha256)
| File | sha256 |
|---|---|
| social-intelligence/integration/projection.ts | d427394451b8aa3b68794d5b6f488d4b7f0eb63292384ff08985df95097b60c4 |
| social-intelligence/integration/copy.ts | 8c41ca308d6df1a7499ada25f046b858b8afa9a8b17ec18abb875167405546cd |
| social-intelligence/integration/SocialIntegrationCard.tsx | ee95e172fbcfc01529aee8cac22201ce59ceab326e0a0703aad04dabdf1e3d8e |
| social-intelligence/integration/__tests__/a3544SocialIntegration.test.ts | 539ef9397af1668fc176d01fa855d651e0287dff888fe723bc6d4d10c0462a37 |
| app-v2/routes/TodayPage.tsx | 78cdf392ae270d805046632ecb5e0b4872134d8a6ff5f24bd91b0f0a9e8129da |
| app-v2/routes/PlanPage.tsx | 109a1a58060ac4b2ef412b62ce3699e751452e904f88d3b4285bdab1e0da8dc0 |
| App.tsx | 36074bedfe7a79ecb92e47ec795abd1b9d263f3a37a1f8422146206f86f49078 |
| roadmap/__tests__/a273Roadmap.test.ts | b4374366a66281c5f80ccb1afe0d12c217e1632bc63e4e908f4e7f3f38404f67 |
| components/__tests__/a281TrustCleanup.test.ts | 8a33d71fc984f838cb7e16ec53c31b8513c844b2ed364cf75701c5599c34d456 |
| action-layer/__tests__/a33DiagnosticAction.test.ts | 984740dae09b966f34753c9048682b826a2bdbb940703dd5090e9074781c17d5 |
| today-intelligence/__tests__/a272TodayIntelligence.test.ts | 652f37cd80d9fb33f42eccfb74a701b7f719f8677c78dafcb7b4fc7e9d15f78d |
| social-intelligence/findings/__tests__/a3542SocialFindings.test.ts | 763ed19386ea675215ca38bc2928307f31ad538ca4569c8d52901fe7c8420ee4 |
| social-intelligence/ui/__tests__/a3543SocialIntelligenceUi.test.ts | bd2c93e91af8054ac47af582ce0c54a0d9da6a25d6da12a17573551fb097df3b |
| social-intelligence/engine.ts | 457d613c24f768c0faec6219890aee3154d9dbf659ef9c9782ee11fb319f5fef |
| social-intelligence/policy.ts | 45604a0cfa549fc198751dccf5a4676b27e32200ef1d63e5ceb5c91b041a9f07 |
| social-intelligence/signals.ts | c9aaf99d719c1537208e90b19d7af9b187da840ec6ca79f4b9dc8311ecbdf0ed |
| social-intelligence/types.ts | 2061f89f166f9333f44693944a798cd0af43dfe1d77ba4036ec44c1b849b5808 |
| findings/copy.ts | 5d1e26d458eee7da36853c011f528171e8f4840fae8c806e6e6e4f828fd2fe51 |
| findings/engine.ts | fe37139fc142dc2912f956addb8ccc5c20083cc1429fabdc678b5ad47812d2ca |
| findings/policy.ts | a7c6756601fdad941734b403a0c0c6578e869564834e44c155a3be51f23b679a |
| findings/rules.ts | e290033293aeb171b29219204058afa92efb8a27736f8ee9589d78ce36aff132 |
| findings/types.ts | 12ce1b7485666202c27b3cde294686102c252aa0e98c001d0bf5d98a2025e4fb |
| ui/AttentionSection.tsx | 7c9d51a2eb011f0548881de1722bc487609424d56622f65c983f29fab2188390 |
| ui/InsightSections.tsx | 75c4d1d18ac0e1849fb988b3e27cd06a2e66301ae5c57526a9655b30cd88c85e |
| ui/PlatformOverview.tsx | 2b38dcc143d7584f887e373eb49e5ce177d24fbc5389b882625a9a8f53ddb4dd |
| ui/SocialIntelligencePage.tsx | 368b60708eaf8b0bd61789239767b322bccca656690667a11afaa8a4420be827 |
| ui/copy.ts | 2ac09cf4143fa2a483a57dfed61f7b2effc91e6becaadce1ef1dfc43d69d1f42 |
| ui/repository.ts | dc2cc79c122679a478e5bfc31374b9a0f8e68c033dc425a1217f58c6ea2d5817 |
| ui/useSocialIntelligence.ts | fe845cc2dd4ff5f004111179d28bc54d812c1472b9bb94b99f677ca023752189 |
| ui/viewModel.ts | c92c4ee4e782274260cda418ef4f963cc300b29fcd35eb5b4149d71ae785aee1 |
| meta-connection/metaRepository.ts | b1c1f6107ec00103ab6ee7c3e4fa1fe910b0ac18c4c15fb68e41939c9ebc746e |
| meta-connection/metaSyncStatus.ts | 39d0d2775c006cf419c408f49eafeea16dcfc38d90854cd1e472886b9a4fe034 |
| supabase/functions/meta-read/handler.ts | 987cc94b1490ac79204280669e8d1f9834822bbd095f618ea6e3d912653e6166 |
| supabase/functions/meta-read/index.ts | f88672e62c5ac185198c16e52c2f1b5bd4f7991cfbf9cbce0f9e34086a86be22 |

## 41. Known limitations
- **Authenticated pages not rendered.** The full authenticated TodayPage and PlanPage, with their live priorities, missions and roadmap, were not rendered in a browser, because no authenticated session or credentials exist in this environment.
  - The real SocialIntegrationCard and SocialIntelligencePage were rendered with real-snapshot data inside a shell that uses the same container classes.
  - The page integrity rests on unchanged hashes, the one-line mount, and the passing guard tests (a272, a273, a33, a281).
  - I judged this sufficient for an isolated, self-hiding card.
- **Scenario fixtures.** The positive and technical scenarios were validated with fixtures, not real data, by design, so that OAuth and production stayed untouched.
- **Metrics.** Facebook metrics are NULL in the current Meta permission scope. This is pre-existing and is a topic for A3.5.5.
- **Migrations.** Applied migrations (48) differ from local migration files (49). This is pre-existing and unrelated to this phase.

## 42. Deviations/defects
None material. No production file was modified.

## 43. Final verdict
GO — FREEZE A3.5.4.4 SOCIAL INTELLIGENCE INTEGRATION

## 44. Exact next phase
A3.5.4.4 is frozen. The next phase is A3.5.5 (Meta Production Readiness), which must be started by a separate, explicit prompt. A3.5.5 and "Tu semana" were not started.
