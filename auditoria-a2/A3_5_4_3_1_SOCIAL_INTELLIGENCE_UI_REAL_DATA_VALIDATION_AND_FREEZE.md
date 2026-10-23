# A3.5.4.3.1 — Social Intelligence UI — Real-Data Validation & Freeze

## 1. Executive summary
`/herramientas/social` was validated read-only against the real Facebook + Instagram data of business "Gopik.Digital" using the frozen A3.5.4.1 signals and A3.5.4.2 findings engines. No product code was modified. No Meta sync was run (data FRESH, 10.4 h old). All semantic, security, accessibility, responsive, ES/EN and regression checks pass. No defects. Verdict: **GO — FREEZE A3.5.4.3 SOCIAL INTELLIGENCE UI**.

## 2. Validation timestamp
- DB `now()` at snapshot: 2026-10-23 22:21:55Z; re-check: 2026-10-23 22:28:14Z (sync state unchanged).
- `evaluatedAt` used for engine run: `2026-10-23T22:21:55Z`.

## 3. Account / business
- business_id `e6014022-370f-4ec0-a340-c7c55f808247` ("Gopik.Digital"); connection `e85ae653-d92d-415f-830a-af322756e01c`.
- `status` connected, `instagram_status` connected, `last_error` null.
- FB Page "Localseohub.io"; IG `@localseohub.io`.
- Permissions: pages_show_list, business_management, instagram_basic, pages_read_engagement, public_profile.
- Tokens / `user_token_ref` / Vault / OAuth state / app secret: not read, not printed.

## 4. Frozen baseline
All md5 verified at start and end (identical):

| File | md5 |
|---|---|
| engine.ts | a088e2e9a6dd720f47ae70046abc8e73 |
| policy.ts | 9a2b024cc333912d508d92d6a3aabdaf |
| signals.ts | 7d2a19a406dc1b86d3eb425967c37c5a |
| types.ts | b9e9509c2289ef8011bf8a98da86917b |
| __tests__/a3541SocialSignals.test.ts | c91ccc294a8ff24fdc0867c31b3acc13 |
| findings/copy.ts | 5c2c0e33acf23897acdb04f463c1f339 |
| findings/engine.ts | b923294cce5e86d0356a0a639fd261d9 |
| findings/policy.ts | 8f40dfbe7480c1cb7d43876f7396a623 |
| findings/rules.ts | 2dbf1084d04d7855f8fd476054a351ee |
| findings/types.ts | 06e724e679c4de177b2cf1ca00ccbaa6 |
| findings/__tests__/a3542SocialFindings.test.ts | ce2a491f5dc65e6d113ef4401bc34746 |
| meta-connection/metaRepository.ts | 521963d28bd06b212afd630dedf8bb4c |
| meta-connection/metaSyncStatus.ts | 0e8612a85265300e71cd8c24c5b030cf |
| supabase/functions/meta-read/handler.ts | 57983b062a41ca37c7aa64b8d60de3a2 |
| supabase/functions/meta-read/index.ts | 499f786f43be3fcb34eeae76e2fea3fb |

App.tsx sha256 `36074bedfe7a79ecb92e47ec795abd1b9d263f3a37a1f8422146206f86f49078` (matches FIX1 pin).

## 5. Sync freshness
- `meta_sync_state.facebook`: ok, item_count 3, pages_fetched 1, last_success_at 2026-10-23 12:00:32.821Z.
- `meta_sync_state.instagram`: ok, item_count 1, last_success_at 2026-10-23 12:00:32.880Z.
- Age ≈ 10.4 h → engine `hoursSinceSuccess` 10, freshness FRESH (≤24 h) on both platforms.
- `meta_connections.last_synced_at` = 2026-10-22 16:49:51Z (older) — NOT used; UI reads only `meta_sync_state.last_success_at`.

## 6. Real FB snapshot
| external_id | type | published_at | text | reactions | comments | permalink host |
|---|---|---|---|---|---|---|
| 1393994523793266_122106732081502661 | photo | 2026-10-14 22:27:37Z | 707 chars | NULL | NULL | www.facebook.com |
| 1393994523793266_122106721107502661 | photo | 2026-10-14 22:12:35Z | NULL | NULL | NULL | www.facebook.com |
| 1393994523793266_1121631013746842 | photo | 2026-10-14 22:07:47Z | NULL | NULL | NULL | www.facebook.com |

## 7. Real IG snapshot
| external_id | type | published_at | caption | likes | comments | permalink |
|---|---|---|---|---|---|---|
| 18144367309586214 | image | 2026-10-14 22:26:26Z | 679 chars | 0 | 0 | https://www.instagram.com/p/DefdAVVDbiF/ |

Profile JSON (FB fan_count 0 / followers 0; IG followers 2, follows 6, media_count 1) is not read by the UI and not rendered.

## 8. NULL vs zero
- FB reaction/comment NULL ×3 → `FB_ENGAGEMENT_DATA_AVAILABLE` NOT_AVAILABLE / METRICS_NULL (availableEngagementCount 0, missing 3) → finding `FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE` (NOT_AVAILABLE) → UI coverage note "Las métricas de interacción de Facebook no están disponibles actualmente…". No "0" rendered.
- IG 0/0 are factual zeros → `IG_ENGAGEMENT_DATA_AVAILABLE` INSUFFICIENT / SAMPLE_TOO_SMALL (1 post < 3) → grouped into `INSTAGRAM_LIMITED_HISTORY`. No engagement diagnosis, no "0 likes" rendered.
- FB text NULL ×2 counted as missing text; IG caption present → not missing.

## 9. Signals (19, engine a3541-1)
| Signal | Status | Reason/severity | Key evidence |
|---|---|---|---|
| FB_RECENT_ACTIVITY | NOT_DETECTED | — | daysSinceLastPost 8, threshold 7 |
| FB_LONG_INACTIVITY | NOT_DETECTED | — | 8 < 31 |
| FB_FREQUENCY_OBSERVED | INSUFFICIENT | WINDOW_TOO_SHORT | 3 posts, span 0 d |
| FB_NO_CONTENT | NOT_DETECTED | — | 3 posts |
| FB_CONTENT_TEXT_MISSING | DETECTED | INFO | 1 with / 2 without, LIMITED |
| FB_CONTENT_TYPE_VARIETY | INSUFFICIENT | SAMPLE_TOO_SMALL | photo ×3 |
| FB_ENGAGEMENT_DATA_AVAILABLE | NOT_AVAILABLE | METRICS_NULL | 0/3 available |
| FB_TREND | NOT_AVAILABLE | NO_HISTORY | — |
| IG_RECENT_ACTIVITY | NOT_DETECTED | — | daysSinceLastPost 8 |
| IG_LONG_INACTIVITY | NOT_DETECTED | — | — |
| IG_FREQUENCY_OBSERVED | INSUFFICIENT | SAMPLE_TOO_SMALL | 1 post |
| IG_NO_CONTENT | NOT_DETECTED | — | — |
| IG_CAPTION_MISSING | NOT_DETECTED | — | caption present |
| IG_CONTENT_TYPE_VARIETY | INSUFFICIENT | SAMPLE_TOO_SMALL | — |
| IG_ENGAGEMENT_DATA_AVAILABLE | INSUFFICIENT | SAMPLE_TOO_SMALL | — |
| IG_TREND | NOT_AVAILABLE | NO_HISTORY | — |
| FB_ONLY_RECENT_ACTIVITY | NOT_DETECTED | — | — |
| IG_ONLY_RECENT_ACTIVITY | NOT_DETECTED | — | — |
| PLATFORM_RECENCY_DIFFERENCE | NOT_DETECTED | — | same-day posts (< 30 d) |

Platform summary: both `blockedReason` null, sync ok, FRESH, activityState `intermediate`.

Note: the newest post (2026-10-14 22:27:37Z) is 8 d 23 h 54 m before evaluation; the policy floors to whole days → 8 (not 9). Correct per frozen policy.

## 10. Findings (engine a3542-1)
| Finding | Status | Priority | Params | Recommendations |
|---|---|---|---|---|
| FACEBOOK_TEXT_MISSING | ACTIVE | LOW | postsWithoutText 2, observedPostCount 3 | REVIEW_POSTS_WITHOUT_TEXT (DIRECT, REVIEW) |
| FACEBOOK_LIMITED_HISTORY | INSUFFICIENT_DATA | INFO | groups FREQUENCY_INSUFFICIENT, CONTENT_TYPE_INSUFFICIENT | WAIT_FOR_MORE_HISTORY |
| INSTAGRAM_LIMITED_HISTORY | INSUFFICIENT_DATA | INFO | groups FREQUENCY, CONTENT_TYPE, ENGAGEMENT_SAMPLE | WAIT_FOR_MORE_HISTORY |
| FACEBOOK_INTERMEDIATE_ACTIVITY | INFORMATIONAL | INFO | daysSinceLastPost 8 | — |
| INSTAGRAM_INTERMEDIATE_ACTIVITY | INFORMATIONAL | INFO | daysSinceLastPost 8 | — |
| FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE | NOT_AVAILABLE | INFO | observedPostCount 3 | — |

No DATA_STALE, no access/reauth findings (connection healthy, data fresh).

## 11. Traceability
All 19 signals appear in `trace` (FINDING 7 / GROUPED 5 / NO_FINDING 7):
- DB 2 NULL-text FB rows → FB_CONTENT_TEXT_MISSING (DETECTED) → FACEBOOK_TEXT_MISSING → REVIEW_POSTS_WITHOUT_TEXT (evidenceRefs FB_CONTENT_TEXT_MISSING) → attention card "Revisa el texto de algunas publicaciones" + 2 listed posts.
- DB newest published_at → FB/IG_RECENT_ACTIVITY + LONG_INACTIVITY → *_INTERMEDIATE_ACTIVITY → overview label + Known section.
- DB NULL FB metrics → FB_ENGAGEMENT_DATA_AVAILABLE → FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE → coverage note.
- Small samples → FREQUENCY/CONTENT_TYPE/IG_ENGAGEMENT INSUFFICIENT → *_LIMITED_HISTORY → WAIT_FOR_MORE_HISTORY → coverage "Historial en construcción" (no card, no fake advice).
- meta_sync_state.last_success_at → freshness FRESH → "Datos actualizados hace 10 horas".

## 12. Platform overview
| | Facebook | Instagram |
|---|---|---|
| Account | Localseohub.io | @localseohub.io |
| Status | Conectado (success) | Conectado (success) |
| Activity | Última publicación hace 8 días (neutral) | Última publicación hace 8 días (neutral) |
| Posts | 3 publicaciones analizadas | 1 publicación analizada |
| History | Historial en construcción | Historial en construcción |
| Updated | Datos actualizados hace 10 horas (`<time dateTime=2026-10-23T12:00:32.821Z>`, title 23 oct 2026, 12:00) | idem (…32.880Z) |

No followers, fan count, media count or engagement figures rendered.

## 13. Activity wording
INTERMEDIATE renders "Última publicación hace 8 días" / "Last post 8 days ago". Grep of all rendered HTML: no "Inactivo", "Sin actividad reciente", "Inactive" label, "No recent activity". The only occurrence of "inactive" is the Known-section sentence "…neither recent activity nor a long inactive period" (ES "…ni una inactividad prolongada"), which is the correct INTERMEDIATE explanation. PASS.

## 14. Attention section
Exactly one card: FACEBOOK_TEXT_MISSING — tone review, badge "Para revisar", platform "Facebook", title "Revisa el texto de algunas publicaciones", body with (2), why "…2 de 3 publicaciones.", CTA "Ver publicaciones". LIMITED_HISTORY / INTERMEDIATE / METRICS_UNAVAILABLE correctly not shown as attention cards. PASS.

## 15. Affected posts
- `params.postsWithoutText` 2 = derived NULL-text FB items 2 → list allowed (guard `candidates.length !== expected → null` intact).
- Sorted newest first: 14 oct 2026 · Foto (…122106721107502661, 22:12:35Z), 14 oct 2026 · Foto (…1121631013746842, 22:07:47Z). The FB post with text is correctly excluded.
- Collapsed by default ("Ver publicaciones", `aria-expanded=false`, list absent from DOM); expanded state "Ocultar publicaciones", `aria-expanded=true`, `aria-controls` = list `id` (`:R6a:`), list `aria-label="Publicaciones afectadas"`. Post text is never rendered. PASS.

## 16. Permalinks
Both rendered anchors:
- `https://www.facebook.com/122111374473502661/posts/122106721107502661?substory_index=1773771203860754`
- `https://www.facebook.com/122111374473502661/posts/1121631013746842?substory_index=1121631013746842`

Both https, host `www.facebook.com` (allowlisted via `safeMetaPermalink`: https only, no credentials/port, host allowlist, ≤1000 chars), `target="_blank"`, `rel="noopener noreferrer"`, label "Abrir en Facebook" + sr text "(se abre en una pestaña nueva)". Only other anchor: internal `/herramientas`. PASS.

## 17. Known information
"Lo que sabemos hasta ahora": FB and IG INTERMEDIATE_ACTIVITY items ("La última publicación observada es de hace 8 días completos. No se considera actividad reciente ni una inactividad prolongada."). Factual, no judgement. PASS.

## 18. Coverage
"Alcance del análisis": "Historial en construcción — Facebook · Instagram", explanation that this describes analysis limits, not business state; wait note; FB interaction-metrics-unavailable note. ("Alcance" = analysis scope, not social reach.) PASS.

## 19. Freshness source
UI repository selects `meta_sync_state(platform, status, error_code, item_count, pages_fetched, last_success_at)`; `meta_connections` columns selected are only `status, instagram_status, page_name, instagram_username` — `last_synced_at` is never read. Displayed 12:00:32Z matches `last_success_at`, not 2026-10-22 16:49:51Z. PASS.

## 20. Refresh E2E
- Path: page "Actualizar datos" → `runRefresh` → existing frozen `syncMetaContent()` → `meta-read {action:'sync'}`; server cooldown `SYNC_COOLDOWN_SECONDS = 60` returns `SYNC_COOLDOWN` (429). Double-submit guarded (`refresh.status === 'refreshing'` early return; button disabled).
- Rendered real-data states: refreshing → "Actualizando datos…" in button and `role=status aria-live=polite`, content `aria-busy=true`, opacity reduced; cooldown → "Acabas de actualizar. Espera un minuto antes de volver a intentarlo." + "Seguimos mostrando los datos de la última actualización correcta." with prior data kept.
- Live sync: NOT executed. Data was FRESH (10.4 h), so a sync was not needed under §"at most one sync, only if needed". The live network round-trip also requires the user's browser session, which is not available in this environment. Sync state confirmed unchanged at end of validation.

## 21. Connection / security
- Browser reads: explicit column lists, filtered by `business_id`, limit 200, 15 s timeout; no `select('*')`.
- No token, `user_token_ref`, Vault, OAuth state, app secret, `page_id`/IG user id in selected columns or rendered HTML (grep: 0 hits for token/vault/secret/oauth/state=/user_token_ref).
- Read-only disclaimer shown: "Solo leemos tus publicaciones. No publicamos ni modificamos nada en Meta."

## 22. CTAs
| CTA | Behaviour | Result |
|---|---|---|
| Volver a Herramientas | Link `/herramientas` | PASS |
| Ver / Ocultar publicaciones | toggle, aria-expanded/controls | PASS |
| Abrir en Facebook ×2 | external, new tab, safe rel | PASS |
| Actualizar datos | existing sync path, cooldown, disabled while running | PASS |

No publish/edit/boost/ads CTAs. No `/fuentes` CTA rendered (no access issue).

## 23. Responsive
Rendered real-data HTML with the production stylesheet in headless Chromium:

| Width | scrollWidth | Overflowing elements | Overview grid | h1 |
|---|---|---|---|---|
| 1280 | 1280 | 0 | 2 cols (552/552) | 32px |
| 768 | 768 | 0 | 2 cols (360/360) | 32px |
| 375 (fixed container) | — | 0 | 1 col (343) | 24px |

ES/EN, collapsed/expanded and cooldown states all checked. PASS.

## 24. ES
Full ES rendered text reviewed: correct accents, plural/singular ("3 publicaciones analizadas" / "1 publicación analizada"), date "14 oct 2026", no English leakage, no raw keys. PASS.

## 25. EN
"Last post 8 days ago", "3 posts analysed" / "1 post analysed", "Check the text of some posts", "Oct 14, 2026", "Data updated 10 hours ago". No Spanish leakage, no raw keys. PASS.

## 26. Accessibility
- Sections `aria-labelledby` (overview, attention, known, coverage); one `h1`; `role=status aria-live=polite` refresh line; `aria-busy` on content; 18 decorative icons `aria-hidden`; `<time dateTime>`; new-tab sr text; motion-reduce variants on spinner/chevron/opacity.
- Measured target sizes: buttons 34 px tall; text links ("Volver a Herramientas", "Abrir en Facebook") 16 px tall but isolated on their own rows → satisfy WCAG 2.5.8 spacing exception. Recorded as limitation L4, not a defect.

## 27. Forbidden-output audit
Grep over 8 rendered pages (ES/EN × closed/open/cooldown/refreshing) for: Inactivo, Sin actividad reciente, followers/seguidores, fan_count, media_count, engagement rate/tasa de, reach, algoritmo/algorithm, ventas/sales, "0 reacciones/comentarios/reactions/comments", NaN, undefined, null, [object, social.finding/social.rec keys, FACEBOOK_/INSTAGRAM_ ids, token/vault/secret/oauth → 0 hits (except the acceptable "inactive period" / "Alcance del análisis" noted above). PASS.

## 28. Regression
Full suite: 61 files, **2205/2205 passed**, 0 failed, 0 skipped. Temporary validation file removed before the run.

## 29. TypeScript
`tsc --noEmit -p tsconfig.app.json`: 20 errors, all legacy (LandingPage 10, BusinessAuditLanding 2, ContentGeneratorLanding 2, MetaAdsLanding 2, DiagnosticLanding 1, AdminDashboard 1, a3422GbpRecovery test 1, App.tsx 1 TS6133). 0 new.

## 30. Build
`npm run build` passes (final run after the report write).

## 31. Frozen-file verification
All §4 hashes recomputed after validation: identical. App.tsx sha256 identical. No product file, test, migration or edge function changed in this phase. Only artefact added: this report.

## 32. Freeze hashes — A3.5.4.3 Social Intelligence UI (FROZEN)
| File (src/features/social-intelligence/ui/) | md5 | sha256 |
|---|---|---|
| copy.ts | ebc1baaba97933f81e525379db1ce228 | 2ac09cf4143fa2a483a57dfed61f7b2effc91e6becaadce1ef1dfc43d69d1f42 |
| repository.ts | 50eb1b2a10940d847d8a24fc82336803 | dc2cc79c122679a478e5bfc31374b9a0f8e68c033dc425a1217f58c6ea2d5817 |
| useSocialIntelligence.ts | 3c93c1e99684f874071c36d6518626c1 | fe845cc2dd4ff5f004111179d28bc54d812c1472b9bb94b99f677ca023752189 |
| viewModel.ts | d2204b0964a504869292ebf33091a87a | c92c4ee4e782274260cda418ef4f963cc300b29fcd35eb5b4149d71ae785aee1 |
| AttentionSection.tsx | 280e2259bf98f79342fcfbd9d644640c | 7c9d51a2eb011f0548881de1722bc487609424d56622f65c983f29fab2188390 |
| InsightSections.tsx | 9df706e034260452bf262980a3b94669 | 75c4d1d18ac0e1849fb988b3e27cd06a2e66301ae5c57526a9655b30cd88c85e |
| PlatformOverview.tsx | f0a09ee854f7cac3e23e753625c27309 | 2b38dcc143d7584f887e373eb49e5ce177d24fbc5389b882625a9a8f53ddb4dd |
| SocialIntelligencePage.tsx | eb0a959601db7c27144b1eee04161b1a | 368b60708eaf8b0bd61789239767b322bccca656690667a11afaa8a4420be827 |
| __tests__/a3543SocialIntelligenceUi.test.ts | 075b5a0cbb5734925bd736864df604e9 | 1d0a8ec0d280d9b49a7ff61130e9f0cde1b2d0017495d3a8704ceba6d5e506bd |

Route wiring: src/App.tsx sha256 36074bedfe7a79ecb92e47ec795abd1b9d263f3a37a1f8422146206f86f49078.

**A3.5.4.4 must consume this UI (route `/herramientas/social`, `SocialIntelligencePage`, `buildSocialViewModel`, `useSocialIntelligence`) and must not rebuild or fork it.** Any change to these files requires a new FIX phase with re-freeze.

## 33. Known limitations
- L1 Small real sample (FB 3, IG 1, all on one day): frequency, content type, trend and IG engagement correctly INSUFFICIENT; only one actionable card exists. Positive-path states (recent, long-inactive, stale, reauth, cross-platform) are covered by the A3.5.4.3 unit suite, not by real data.
- L2 Live refresh round-trip not executed (data fresh; needs user browser session). Path and states verified by code and render.
- L3 Visual verification was static render + production CSS in headless Chromium (no hydration/click). Toggle open state was rendered by forcing the initial state in a throw-away harness, since deleted.
- L4 Text links are 16 px tall (WCAG 2.5.8 met by the spacing exception only).
- L5 "Hace N días" is a whole-day floor: 8 days 23 h shows as "8 días". This is by policy.

## 34. Deviations / defects
None. Deviation from plan: the expected value was "9 días"; the engine's floor policy correctly yields 8. That plan estimate was wrong; the product is correct.

## 35. Final verdict
**GO — FREEZE A3.5.4.3 SOCIAL INTELLIGENCE UI**

## 36. Exact next phase
A3.5.4.4. It must consume the frozen A3.5.4.3 UI and must not rebuild it. It is not started in this phase.
