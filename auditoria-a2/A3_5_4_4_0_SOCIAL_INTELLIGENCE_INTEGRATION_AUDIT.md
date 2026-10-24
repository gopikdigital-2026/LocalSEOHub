# A3.5.4.4.0 — Social Intelligence Integration — Capability & Architecture Audit

Mode: audit + architecture design only. No implementation.
Date: 2026-10-24.

## 1. Executive summary
The frozen Social Intelligence pipeline (A3.5.3 → A3.5.4.1 → A3.5.4.2 → A3.5.4.3) is consumable through one pure application-layer function, `analyseSocialData(data, evaluatedAt)`, fed by `loadSocialData(businessId)`. Neither performs any Meta Graph call.

Of the five candidate surfaces, two benefit and three do not:

| Consumer | Decision |
|---|---|
| Hoy | **LIMITED** — at most one compact social item, only for a current DIRECT action that needs the user now (review posts without text/caption, reconnect Meta, review Meta permissions). |
| Plan | **LIMITED** — at most one compact social item, only for the CONTEXTUAL planning recommendation `CONSIDER_NEW_CONTENT` (long inactivity / no content). |
| Advisor | **NO** — generative AI (gpt-4o-mini) with a closed feature whitelist and numeric-claim filter; injecting findings creates a second interpretation layer. |
| Twin | **NO** — deterministic profile-completeness score (100-point weights); social would distort the score or require fake scoring. |
| Resumen | **NO** — `/informes` is a weekly report of persisted `business_actions`; social items are not actions and would duplicate Hoy. |

Integration is a **non-persisted, derived projection** (`Social Integration Projection`). Each supported recommendation has **exactly one external home** (Hoy or Plan, never both). No new tables, no `business_actions` rows, no user "done" checkbox. Items disappear when the next sync stops producing the finding.

Verdict: **GO — SOCIAL INTELLIGENCE INTEGRATION ARCHITECTURE READY FOR IMPLEMENTATION**, with one governance constraint. `src/app-v2/routes/TodayPage.tsx` is hash-pinned by the a273 roadmap suite, so A3.5.4.4.1 must include an explicitly authorized, scoped re-pin of that file (the same pattern as A3.5.4.3-FIX1).

## 2. Current frozen baseline
| Phase | Scope | Status |
|---|---|---|
| A3.5.3 | Meta read layer (`metaRepository.ts`, `metaSyncStatus.ts`, `meta-read` edge function) | FROZEN |
| A3.5.4.1 | Signals engine `a3541-1` (`engine/policy/signals/types.ts`) | FROZEN |
| A3.5.4.2 | Findings engine `a3542-1` (`findings/{copy,engine,policy,rules,types}.ts`) | FROZEN |
| A3.5.4.3 | UI `/herramientas/social` (`ui/*`) — hashes in the A3.5.4.3.1 report §32 | FROZEN |

Regression baseline: 2205/2205 tests, 20 legacy tsc errors, build passing. App.tsx sha256 `36074bed…9078`.

## 3. Existing consumer architecture inventory

### 3.1 Hoy — `/hoy`, `src/app-v2/routes/TodayPage.tsx`
- **Purpose.** What deserves attention now.
- **Two deterministic recommendation systems, no AI:**
  - **System A — saved actions** (`features/actions`).
    - Persisted in `business_actions`. Rules registry `ACTION_RULES` (18 rules).
    - Key = `rule_id`, with a unique index on open actions per (business_id, rule_id).
    - Score and priority: `scoreCandidate` → `HIGH|MEDIUM|LOW`.
    - Statuses `PENDING|IN_PROGRESS|COMPLETED|DISMISSED`.
    - Auto-resolution via `planSync`: `SELF_RESOLVING` sources become COMPLETED with `resolved_by='condition_met'`.
    - Shown via `selectTodayActions` (`TODAY_LIMIT=3`) in `TodaysMissions`.
  - **System B — calculated priorities** (`today-intelligence` + `action-layer`).
    - Never saved. Built from maps / twin / geo.
    - `TodayAction{key: ActionKey, destination, sourceTools, tier, …}`.
    - `mergeActions` deduplicates by `ActionKey` and drops the MAINTENANCE keys (`keep_fresh`, `keep_updated`). `TODAY_MAX=3`.
- **Data sources.** `useActions()` (business_actions), `loadSources` (connected_sources), `useBusiness()`, memory profile.
- **Attribution.**
  - System A: `actionOrigin` → real / user_provided / unavailable / general.
  - System B: `sourceTools` ("Detectado en: …").
- **Freeze status.** `TodayPage.tsx`, `TodayPriorities.tsx`, `today-intelligence/copy.ts`, `TodaysMissions.tsx` and every `features/actions/*` file are sha256-pinned in `a273Roadmap.test.ts` FROZEN. (a272 also pins App.tsx and action-layer files.)
- **Meta / social references today:** none.

### 3.2 Plan — `/plan`, `src/app-v2/routes/PlanPage.tsx`
- **Purpose.** Work over the week. Its own wording: "Hoy muestra tu prioridad inmediata; el Plan reúne las acciones de toda la semana".
- **Sections:**
  - `RoadmapCard` (System B via `buildRoadmap`, `PLAN_MAX=8`, phases now/next/later).
  - "Para hoy" (same as Hoy's missions), "Resto de la semana" (grouped by `CATEGORY_LABELS`), "Cerradas esta semana", and weekly progress (`buildActionReport`).
- **Persistence.** Only through System A.
- **Freeze status.** `PlanPage.tsx` is not in a hash-pinned FROZEN map; `roadmap/{model,copy,RoadmapCard}` are pinned.

### 3.3 Advisor — `/herramientas/advisor`
- **Engine.** Generative AI: OpenAI `gpt-4o-mini` in `business-advisor-v2`, temperature 0.5, JSON output.
- **Context.** `buildFacts`: profile, manual context, open/completed action titles, connected source type names.
  - `NEVER_KNOWN` explicitly marks rating, reviews, traffic, competitors and similar as unknown.
- **Guardrails:**
  - The prompt only allows mentioning Generador SEO, Mi negocio, Plan, and Fuentes (GBP).
  - `NEVER` regexes block guarantees, rankings, competitors and other tools.
  - Numbers must appear in the facts or the user's own text.
- **Limits.** Premium plus usage ledger (`reserve_ai_usage` / `settle_ai_usage`).
- **Persistence.** None.

### 3.4 Twin — `/herramientas/twin`
- `buildDigitalTwin(profile, gbp)` is deterministic.
- `TWIN_WEIGHTS` total 100 (name, activity, city, services, audience, website, phone, hours, primary_goal, gbp); `knowledgePercent` maps to `KnowledgeBand`.
- Provenance per field: declared / detected / verified / unchecked.
- No competitors, no AI, not persisted.

### 3.5 Resumen — `/informes`, `WeeklySummaryPage.tsx` (nav label "Resumen")
- `buildActionReport(actions, now, goal)` over `business_actions`: done / pending / overdue / blocked for the week, plus `WeeklyContentReport`.
- Deterministic. No source status, no score.

### 3.6 Sources and tools
- `/fuentes` (`SourceManager.tsx:214`) already mounts `MetaConnectionCard`, which handles connection, page selection and sync status.
- `SOURCE_REGISTRY` has no Meta entry; Meta lives in `meta_connections`, not `connected_sources`.
- `tools/catalog.ts:190`: `social` → `/herramientas/social` ("Inteligencia Social").

### 3.7 Risk summary per consumer
| Consumer | Can deterministic external recs enter safely? | Duplicated-logic risk |
|---|---|---|
| Hoy | Yes, as a separate compact slot outside Systems A and B | Low if consuming the projection; high if a new `ActionRule` re-derived social state |
| Plan | Yes, same slot pattern | Low |
| Advisor | No (AI reinterpretation) | High |
| Twin | No (score semantics) | High |
| Resumen | Only by persisting social items as actions (rejected) | Medium |

## 4. Frozen Social output inventory (A3.5.4.2 `a3542-1`)

### 4.1 Report and field values
`SocialFindingsReport{engineVersion, signalsEngineVersion, evaluatedAt, findings[], recommendations[], trace[]}`.

| Field | Values |
|---|---|
| `FindingStatus` | ACTIVE, INFORMATIONAL, INSUFFICIENT_DATA, NOT_AVAILABLE, STALE |
| `FindingPriority` | HIGH (reserved, never emitted), MEDIUM, LOW, INFO |
| `FindingSufficiency` | SUFFICIENT, LIMITED, INSUFFICIENT, NOT_AVAILABLE |
| `FindingPlatform` | facebook, instagram, cross_platform |
| `Freshness` | FRESH, AGING, STALE, UNKNOWN (source: `meta_sync_state.last_success_at`) |
| `SafetyClass` | DIRECT, CONTEXTUAL (published); UNSUPPORTED (never published) |
| `ActionType` | REVIEW, PLAN, CREATE, CONNECT, REFRESH_DATA, WAIT_FOR_MORE_DATA |

Each finding carries `findingKey` (e.g. `FACEBOOK_TEXT_MISSING`), `evidence[]` (verbatim signal values), `sourceSignals[]`, `groupedFindings[]` and `recommendationKeys[]`. Recommendations carry `recommendationKey`, `findingKey`, `platform`, `safetyClass`, `priority` (capped by catalog `maxPriority`), `params`, `evidenceRefs`, `actionType`. The engine gate `ALLOWED_ACTIONS` restricts action types by finding status.

### 4.2 Topic → policy and suitability
| Topic | Status | Priority | Recommendation | Suitable for |
|---|---|---|---|---|
| TEXT_MISSING / CAPTION_MISSING | ACTIVE | MEDIUM if SUFFICIENT, else LOW | REVIEW_POSTS_WITHOUT_TEXT / _CAPTION (DIRECT, REVIEW) | immediate attention |
| LONG_INACTIVITY | ACTIVE | MEDIUM | CONSIDER_NEW_CONTENT (CONTEXTUAL, PLAN, max LOW) | roadmap planning |
| NO_CONTENT | ACTIVE | LOW | CONSIDER_NEW_CONTENT | roadmap planning |
| ACCESS_REAUTH_REQUIRED | NOT_AVAILABLE | MEDIUM | RECONNECT_META (DIRECT, CONNECT) | immediate attention |
| ACCESS_PERMISSION_UNAVAILABLE | NOT_AVAILABLE | LOW | REVIEW_META_PERMISSIONS (DIRECT, CONNECT) | immediate attention |
| DATA_STALE | STALE | LOW | REFRESH_DATA (DIRECT) | Social page only |
| ACCESS_RATE_LIMITED / ACCESS_SYNC_ERROR | NOT_AVAILABLE | INFO | RETRY_LATER | Social page only |
| ACCESS_NOT_CONNECTED / ACCESS_NOT_LINKED | NOT_AVAILABLE | INFO | CONNECT_PLATFORM (CONTEXTUAL) | Social page only |
| ACCESS_NEVER_SYNCED | NOT_AVAILABLE | INFO | REFRESH_DATA | Social page only |
| RECENT / INTERMEDIATE activity, FREQUENCY_OBSERVED, CONTENT_TYPE_MIX, ENGAGEMENT_DATA_AVAILABLE, FB_ONLY_RECENT, IG_ONLY_RECENT, RECENCY_DIFFERENCE | INFORMATIONAL | INFO | — | informational (Social page only) |
| LIMITED_HISTORY, RECENCY / FREQUENCY / CONTENT_TYPE / ENGAGEMENT_SAMPLE insufficient | INSUFFICIENT_DATA | INFO | WAIT_FOR_MORE_HISTORY | Social page only |
| ENGAGEMENT_METRICS_UNAVAILABLE | NOT_AVAILABLE | INFO | — | Social page only |
| Unsupported keys (POST_MORE_OFTEN, SWITCH_TO_REELS, …) | never published | — | — | never |

Engine deduplication already merges identical access/stale conditions across both platforms into one `CROSS_PLATFORM_*` finding (D1).

**Important.** "Hide business findings computed on stale data" is not an engine rule. It lives in the A3.5.4.3 view model (`viewModel.ts:325–326`). Any consumer must reapply it (see §15).

## 5. Integration principles
1. One pipeline: Meta data → signals → findings/recommendations → consumers. Consumers never read `meta_content_items` semantics themselves.
2. Consumers act on **published recommendations**, not raw findings, so `safetyClass` and the `ALLOWED_ACTIONS` gate stay authoritative.
3. One external home per recommendation key: Hoy or Plan, never both.
4. Derived, not persisted.
5. Data resolves, users don't: no completion checkbox for social items.
6. Pointer, not dashboard: external items show one sentence, a source label and one CTA. Evidence stays on `/herramientas/social`.
7. A failure to read social data hides the slot silently and never breaks Hoy or Plan.

## 6. Proposed source-of-truth architecture
```
loadSocialData(businessId)           [frozen A3.5.4.3 repository; Supabase reads only]
        ↓
analyseSocialData(data, now)         [frozen A3.5.4.3 view-model fn → A3.5.4.1 + A3.5.4.2]
        ↓
projectSocialIntegration(data, analysis)        NEW pure function (A3.5.4.4.1)
        ↓                                       filter + map + attach source; no analysis
SocialIntegrationItem[]  { id, home:'hoy'|'plan', recommendationKey, findingKey, platform,
                           priority (frozen, unchanged), params (whitelisted), cta, freshness }
        ↓
useSocialIntegration(businessId, home)          NEW hook (load + project, silent failure)
        ↓
<SocialIntegrationItem/>  in Hoy  |  in Plan    NEW small presentational element
```

**Is an adapter required?** Yes. Without it, Hoy and Plan would each repeat the eligibility, stale and dedup logic.
- It is a pure filter/map over frozen output. It never inspects `items`, `text_content` or metrics.
- Proposed location: `src/features/social-intelligence/integration/` (`projection.ts`, `copy.ts`, `useSocialIntegration.ts`, `SocialIntegrationItem.tsx`).
- No A3.5.4.1/2/3 file changes.

## 7. Hoy audit
- **Eligible:** published recommendations where:
  - key ∈ {`REVIEW_POSTS_WITHOUT_TEXT`, `REVIEW_POSTS_WITHOUT_CAPTION`, `RECONNECT_META`, `REVIEW_META_PERMISSIONS`};
  - `safetyClass === 'DIRECT'`;
  - for the review keys, the source finding is ACTIVE and its freshness is not STALE.
- **Cap:** 1 item. Selection uses the frozen ordering: the first eligible recommendation in `report.recommendations`, which follows the frozen `compareFindings` order. Access items naturally rank first (data_quality, MEDIUM).
- **Placement:** a separate compact row ("Desde tus redes sociales") after `TodayPriorities`.
  - Not merged into System B, because `ActionKey`, `TIER` and `KEY_ORDER` are frozen and semantically Google/profile-specific.
  - Not merged into System A (frozen rules and table).
- **CTA:** review → `/herramientas/social`; reconnect / permissions → `/fuentes`, where `MetaConnectionCard` lives. No direct execution and no direct sync from Hoy.
- **Stale:** review items disappear. No refresh nag in Hoy, consistent with Hoy's existing MAINTENANCE exclusion.
- **Limited history:** nothing.
- **Not a dashboard:** no counts of findings, no evidence, no posts.

## 8. Plan audit
- **Eligible:** `CONSIDER_NEW_CONTENT` (CONTEXTUAL, PLAN), from LONG_INACTIVITY or NO_CONTENT. The source finding must be ACTIVE and not STALE. Cap 1; if both platforms qualify, use the first in frozen order.
- **Placement:** a compact contextual row near `RoadmapCard`. It is not a roadmap position (RoadmapCard/model are frozen) and not a `business_actions` row:
  - it does not count in weekly progress;
  - it has no due date and no completion.
- **Copy:** stays conditional ("Si Facebook forma parte de tu estrategia…"), reusing the frozen `social.rec.CONSIDER_NEW_CONTENT` message.
- **Excluded from Plan:** every technical / maintenance state (reconnect, permissions, rate limit, sync error, stale, never synced) and every review item (those live in Hoy).
- **Rationale:** posting cadence is work over time; a review of existing posts is a quick action now.

## 9. Advisor audit
Advisor is generative. Injecting findings would require:
- adding social facts to `BusinessFacts`;
- widening the feature whitelist;
- trusting the model to respect sufficiency.

Concrete dangers:
- An LLM paraphrasing "8 días" into "inactive";
- turning "metrics unavailable" into "low engagement";
- inventing "post more often" (an UNSUPPORTED key);
- repeating third-party caption text (prompt-injection surface);
- numeric facts (postsWithoutText) becoming "declared" and therefore usable in invented claims.

The value added is low: Hoy already points to the evidence. **Decision: NO SOCIAL INTEGRATION IN ADVISOR V1.** The Advisor must not receive social facts, and its prompt and whitelist stay unchanged.

## 10. Twin audit
Twin is a profile-completeness model with a fixed 100-point weight table and provenance. Social state is not a profile field. Adding it would:
- require re-weighting, i.e. a de facto Social Score;
- or invite comparison semantics that don't exist.

**Decision: NO SOCIAL INTEGRATION IN TWIN V1.**

## 11. Resumen audit
`/informes` reports this week's persisted `business_actions`. Social items are derived and not persisted, so showing them would either:
- duplicate Hoy;
- or force persistence (rejected in §21).

Meta connection status already lives in `/fuentes`, and the tool is in `/herramientas`. **Decision: NO SOCIAL INTEGRATION IN RESUMEN V1.**

## 12. Informational findings policy
Confirmed: INFORMATIONAL findings never leave `/herramientas/social`. "Última publicación hace N días" never appears in Hoy or Plan. Activity only leaves the page when the frozen engine has turned it into ACTIVE LONG_INACTIVITY / NO_CONTENT with a published `CONSIDER_NEW_CONTENT`, and then only in Plan.

## 13. Limited-history policy
- Social Intelligence shows it in Coverage.
- Hoy, Plan and Resumen show nothing.
- Advisor and Twin receive nothing.

`WAIT_FOR_MORE_HISTORY` is never projected.

## 14. Engagement-availability policy
- ENGAGEMENT_METRICS_UNAVAILABLE (NULL) and ENGAGEMENT_SAMPLE_INSUFFICIENT (factual zeros, small sample) have no actionable recommendation and are never projected.
- The projection whitelists params per key: postsWithoutText and observedPostCount for review keys; none for the others. So no metric value can reach a consumer.
- NULL ≠ 0, and 0 + insufficient sample ≠ poor performance, both hold by construction.

## 15. Freshness policy
- The source stays `meta_sync_state.last_success_at`, via the frozen signals.
- The projection reapplies the A3.5.4.3 visibility rule: drop any non-technical finding with `freshness === 'STALE'`.
- AGING (24 h–7 d) is still eligible, consistent with the Social page.

| Consumer | When data is STALE |
|---|---|
| Hoy | Review items disappear; no refresh item |
| Plan | CONSIDER_NEW_CONTENT disappears |
| Social page | Shows DATA_STALE plus refresh (unchanged) |

A parity test guarantees every projected item id is also an attention card on the Social page for the same data, so the duplicated filter cannot drift.

## 16. Technical-state policy
| State | Hoy | Plan | Resumen |
|---|---|---|---|
| REAUTH_REQUIRED | YES (one item → /fuentes) | no | no |
| PERMISSION_UNAVAILABLE | YES (one item → /fuentes) | no | no |
| NOT_CONNECTED / NOT_LINKED | no (optional source; Fuentes covers it) | no | no |
| RATE_LIMITED / SYNC_ERROR | no (transient; RETRY_LATER) | no | no |
| NEVER_SYNCED | no | no | no |
| DATA_STALE | no (business items suppressed) | no | no |

At most one social connection warning, on one surface. Access states are labelled as account access, never as business performance.

## 17. Action mapping
| ActionType / key | Destination | Executed in consumer? |
|---|---|---|
| REVIEW (posts without text/caption) | `/herramientas/social` (evidence and validated permalinks live there) | No |
| CONNECT (RECONNECT_META, REVIEW_META_PERMISSIONS) | `/fuentes` | No |
| PLAN (CONSIDER_NEW_CONTENT) | `/herramientas/social` | No |
| CONNECT_PLATFORM, REFRESH_DATA, WAIT_FOR_MORE_DATA (RETRY_LATER, WAIT_FOR_MORE_HISTORY) | not projected | — |

- Consumers never link to Meta permalinks directly; the allowlisted links stay on the Social page.
- No consumer triggers `syncMetaContent()`.
- CREATE is allowed by the engine gate but no a3542-1 key uses it, so it is not mapped.

## 18. Deduplication
- **Canonical identity:** `social:<recommendationKey>:<findingKey>` (e.g. `social:REVIEW_POSTS_WITHOUT_TEXT:FACEBOOK_TEXT_MISSING`).
- **Within a surface:** unique by id; cap of 1 per surface.
- **Across surfaces:** a static `HOME` map gives each key exactly one home, so the same finding can never show up as "Review" in Hoy and "Improve" in Plan.
- **Across platforms:** the engine already merges shared access conditions (D1).
- **Across systems:** no social System A rule or System B `ActionKey` exists or may be added (tested).

## 19. Source attribution
- **Shown to the user:** one line, "Basado en tus datos de Facebook" / "Based on your Facebook data" (Instagram likewise). Cross-platform access items say "Meta (Facebook e Instagram)".
- **Never shown:** signalKey, findingKey, recommendationKey or any enum.
- **Kept internally:** id, findingKey, recommendationKey and evidenceRefs on the item, as `data-*` attributes for tests.

## 20. Priority semantics
- There is no mapping into Hoy or Plan priority scales; social items live in their own slot.
- The frozen `priority` is carried unchanged and only used to choose the single item, via the frozen order.
- No consumer or AI changes priority. HIGH is never emitted by a3542-1, and the projection must not create it.

## 21. Persistence analysis
Recommendation: **no persistence.**

Writing social items into `business_actions` would:
- need a new `source_type` and a CHECK-constraint change;
- touch frozen `actions/*`;
- duplicate findings that go stale;
- create lifecycle ambiguity between sync time and action sync time.

The projection is recomputed from stored Meta data on page load. No schema, RPC or migration is needed.

## 22. Lifecycle
- **A. A finding exists:** the Hoy item is shown.
- **B. The user edits the post on Facebook:** nothing changes until a sync.
- **C. The next sync** (from the Social page refresh or Fuentes): `meta_sync_apply` upserts changed posts and deletes posts outside the window. The finding no longer fires and the item disappears on the next Hoy load.

There are no orphaned missions because nothing is stored.

## 23. User completion vs data resolution
- Social items have **no "done" control**. The only resolution is that the data confirms it.
- "Tu semana" must not report a social issue as resolved because of a click. If a user action is ever wanted, it must be a separate "reviewed" note, never a resolution.

## 24. Performance
Per Hoy or Plan load:
- one `loadSocialData` (3 selective Supabase reads, limit 200, 15 s timeout);
- one pure engine evaluation (milliseconds).

There are no Meta Graph calls; sync stays user-triggered with a 60 s server cooldown. Hoy and Plan are separate routes, so there is at most one read per page view, and no cache is needed in V1. If the business has no Meta connection, the snapshot is empty and so is the projection. If a later surface needs a shared cache, lift the call into a provider; no module-level state.

## 25. Security
- Consumers use the same browser-safe column lists as A3.5.4.3: no tokens, `user_token_ref`, Vault, OAuth state, app secret, or page / IG ids beyond what RLS already returns.
- No new Meta permissions or edge functions.
- Param whitelisting keeps post text and metric values out of consumers.
- Advisor excluded, so no social data reaches an LLM.

## 26. I18n
- New `integration/copy.ts` with ES/EN keyed by `recommendationKey`:
  - a short Hoy title, e.g. "Revisa {n} publicaciones de Facebook sin texto" / "Review {n} Facebook posts without text";
  - the attribution line;
  - CTA labels.
- Plan reuses frozen `formatSocialMessage(lang, 'social.rec.CONSIDER_NEW_CONTENT', …)`.
- Wording must match the Social page's tone (review, not "fix" or "improve"). A forbidden-words test covers inactivo / inactive, engagement, rendimiento / performance, followers and similar.

## 27. UX duplication analysis
| Item | Why outside the Social page? | Integrate? |
|---|---|---|
| Review posts without text/caption | Concrete, quick, current; the user wouldn't otherwise open the tool | Yes (Hoy) |
| Reconnect / permissions | All social analysis stops until the user acts | Yes (Hoy) |
| Consider new content | A planning decision over time | Yes (Plan) |
| Activity / limited history / engagement availability | Descriptive, nothing to do | No |
| Stale / rate limit / sync error / never synced | Maintenance, handled where data is refreshed | No |
| Any social item in Advisor / Twin / Resumen | No strong answer; risk of reinterpretation or score | No |

## 28. Consumer decision matrix
| Consumer | Integrate V1? | What enters | What stays out | CTA | Persistence | Rationale |
|---|---|---|---|---|---|---|
| Hoy | **LIMITED** | ≤1 item: REVIEW_POSTS_WITHOUT_TEXT/CAPTION (ACTIVE, not STALE), RECONNECT_META, REVIEW_META_PERMISSIONS | informational, limited history, engagement, stale, transient errors, not connected, CONSIDER_NEW_CONTENT | `/herramientas/social` (review), `/fuentes` (access) | None (derived) | Focus surface; only current, direct, user-actionable items |
| Plan | **LIMITED** | ≤1 item: CONSIDER_NEW_CONTENT (ACTIVE, not STALE) | everything else, incl. technical states and review items | `/herramientas/social` | None; not in weekly progress | Roadmap surface; only the planning-class recommendation |
| Advisor | **NO** | nothing | all social data | — | — | Generative AI reinterpretation risk |
| Twin | **NO** | nothing | all social data | — | — | Would imply a social score or comparison |
| Resumen | **NO** | nothing | all social data | — | — | Action report; would duplicate Hoy or force persistence |

## 29. Finding/recommendation matrix
| Topic → recommendation | Classification | Freshness req. | Sufficiency req. | CTA | Attribution | Lifecycle |
|---|---|---|---|---|---|---|
| TEXT_MISSING → REVIEW_POSTS_WITHOUT_TEXT | Hoy eligible | FRESH / AGING | LIMITED or SUFFICIENT (as emitted) | /herramientas/social | Facebook | Disappears when a sync no longer detects it |
| CAPTION_MISSING → REVIEW_POSTS_WITHOUT_CAPTION | Hoy eligible | FRESH / AGING | as emitted | /herramientas/social | Instagram | same |
| ACCESS_REAUTH_REQUIRED → RECONNECT_META | Hoy eligible | n/a (technical) | n/a | /fuentes | Meta / platform | Disappears after reconnect plus sync |
| ACCESS_PERMISSION_UNAVAILABLE → REVIEW_META_PERMISSIONS | Hoy eligible | n/a | n/a | /fuentes | Meta / platform | same |
| LONG_INACTIVITY / NO_CONTENT → CONSIDER_NEW_CONTENT | Plan eligible (conditional wording) | FRESH / AGING | as emitted | /herramientas/social | platform | Disappears when a newer post syncs |
| DATA_STALE → REFRESH_DATA | Social page only | — | — | — | — | — |
| ACCESS_RATE_LIMITED / SYNC_ERROR → RETRY_LATER | Social page only | — | — | — | — | — |
| ACCESS_NOT_CONNECTED / NOT_LINKED → CONNECT_PLATFORM | Social page only | — | — | — | — | — |
| ACCESS_NEVER_SYNCED → REFRESH_DATA | Social page only | — | — | — | — | — |
| *_INSUFFICIENT / LIMITED_HISTORY → WAIT_FOR_MORE_HISTORY | Social page only | — | — | — | — | — |
| INFORMATIONAL topics, ENGAGEMENT_METRICS_UNAVAILABLE | Social page only | — | — | — | — | — |
| UNSUPPORTED keys | never external (never published) | — | — | — | — | — |

Resumen eligible: none.

## 30. Real current-data walkthrough
Reference: the frozen A3.5.4.3.1 snapshot. It is used only as an illustration and never hard-coded.

- **Hoy:** one row — "Revisa 2 publicaciones de Facebook sin texto · Basado en tus datos de Facebook · [Ver en Inteligencia Social]" → `/herramientas/social`. It comes from REVIEW_POSTS_WITHOUT_TEXT (DIRECT, LOW, LIMITED, FRESH).
- **Plan:** nothing. Activity is INTERMEDIATE (8 days), so no LONG_INACTIVITY and no CONSIDER_NEW_CONTENT.
- **Advisor, Twin, Resumen:** nothing.
- **Only in Social Intelligence:**
  - the platform overview;
  - "Última publicación hace 8 días" on both platforms;
  - FB and IG limited history;
  - FB engagement unavailable;
  - IG insufficient engagement sample;
  - the 2-post list with permalinks;
  - coverage and freshness.

## 31. Proposed user journey
Hoy row → `/herramientas/social` (evidence, why, "Ver publicaciones") → "Abrir en Facebook" (validated permalink, new tab) → user edits the post on Facebook → refresh on the Social page (existing `syncMetaContent`, cooldown) → finding gone → Hoy row gone on the next visit.

This is the safest journey: evidence is seen before acting, and no editing or posting happens inside LocalSEOHub. The read-only promise is kept.

## 32. Future "Tu semana" compatibility
- It must consume `projectSocialIntegration` (same ids and eligibility), never the engines directly and never raw data.
- To show "resolved this week" it would need a history of projection ids. That needs a deliberate, separate design (snapshotting ids, not findings) and must use data resolution, not clicks.
- The `home` field can grow a third value without changing eligibility rules.

Nothing in this design blocks it.

## 33. V1 scope recommendation
Hoy = LIMITED, Plan = LIMITED, Advisor = NO, Twin = NO, Resumen = NO. This is the smallest scope that connects Social Intelligence to the daily loop without duplication.

## 34. Implementation architecture (for A3.5.4.4.1)
- **New:** `src/features/social-intelligence/integration/`
  - `projection.ts`: pure `projectSocialIntegration(data, analysis): SocialIntegrationItem[]`, with the HOME map, eligibility, STALE filter, param whitelist and id.
  - `copy.ts`: ES/EN.
  - `useSocialIntegration.ts`: calls frozen `loadSocialData` and `analyseSocialData`; on error returns an empty list.
  - `SocialIntegrationItem.tsx`: compact row with attribution and a router Link.
- **Edit:**
  - `TodayPage.tsx`: mount the row. Needs an authorized scoped re-pin in `a273Roadmap.test.ts` FROZEN.
  - `PlanPage.tsx`: mount the row (not hash-pinned).
- **Do not touch:** A3.5.3/A3.5.4.1/2/3 files, `features/actions/*`, `today-intelligence/*`, `roadmap/*`, Advisor, Twin, Resumen, App.tsx, schema, edge functions.
- **Gating:** follow the same access as the Social tool (catalog `social` ACTIVE, no paywall in the A3.5.4.3 UI). Confirm in A3.5.4.4.1 (§38).

## 35. Implementation sequence
1. **A3.5.4.4.1** — Social Integration Projection plus Hoy and Plan slots, the test suite, and the scoped TodayPage re-pin.
2. **A3.5.4.4.2** — Real-data E2E, regression, freeze.

No further subphases are needed.

## 36. Test strategy (future)
1. **No duplicate engine:** integration files import only `ui/repository` (`loadSocialData`), `ui/viewModel` (`analyseSocialData`) and `findings/copy|types`. They never import signals internals or read `text_content`, reaction or comment fields.
2. **Eligibility:** each topic fixture → expected home or exclusion (§29).
3. **Informational and limited-history exclusion.**
4. **Stale:** a STALE business finding gives no item; AGING is eligible.
5. **NULL vs zero:** an FB NULL metrics fixture and an IG zero small-sample fixture give no item, and the item params contain no metric fields.
6. **Priority preservation:** item.priority === recommendation.priority; HIGH never appears.
7. **Attribution:** platform label present; no enum strings in rendered ES/EN copy.
8. **CTA destinations:** review/plan → `/herramientas/social`, access → `/fuentes`; no external URLs.
9. **Deduplication:** cap 1 per surface, unique ids, one home per key, no social rule in `ACTION_RULES` and no social `ActionKey`.
10. **Lifecycle:** the same data without the finding gives an empty projection.
11. **Parity:** projected ids ⊆ attention card ids from `buildSocialViewModel`.
12. **Silent failure:** a loader rejection gives no row and no error UI in Hoy or Plan.
13. **No secrets:** loader column lists unchanged; no token / vault / oauth strings in integration files.
14. **ES/EN** complete and in parity; forbidden-words list.
15. **Advisor / Twin / Resumen untouched:** no imports of `social-intelligence` in those features or in `business-advisor-v2`.
16. **Frozen baseline:** A3.5.3/4.1/4.2/4.3 hashes unchanged; App.tsx unchanged; only the authorized TodayPage pin updated.
17. **Full regression:** 2205+ tests, 20 legacy tsc errors, build.

## 37. Risks
| Risk | Mitigation |
|---|---|
| STALE filter duplicated outside the view model | Parity test (§36.11) |
| TodayPage pin change weakens the freeze | Scoped, documented re-pin only for TodayPage; all other pins untouched |
| Hoy shows a social row while the Social page needs a refresh to update | Consistent by design: both read the same stored data |
| Extra Supabase reads on Hoy and Plan | 3 small queries; silent failure; no Graph calls |
| Copy drift ("mejora" / "improve") | Copy tests; review tone |
| A future team adds Advisor injection | Test §36.15 plus this report's NO decision |

## 38. Open questions
1. Should the social slot in Hoy be visible to users without premium? The A3.5.4.3 UI has no paywall; Hoy shows `PaywallNotice` for some features. Default: same as the Social tool (visible).
2. Should the Hoy CTA deep-link to the attention section (`#social-attention-title`)? Default: plain route, since hash scrolling with lazy routes is unverified.
3. Is authorization granted to re-pin `TodayPage.tsx` in `a273Roadmap.test.ts` during A3.5.4.4.1? Required before implementation.

## 39. Files inspected
- `src/App.tsx`
- `src/app-v2/layouts/AppShellV2.tsx`
- `src/app-v2/routes/TodayPage.tsx`, `src/app-v2/routes/PlanPage.tsx`
- `src/features/today-intelligence/{model,copy,TodayPriorities}.*`
- `src/features/roadmap/{model,copy,RoadmapCard}.*`
- `src/features/actions/{types,rules,engine,repository,ActionsProvider,ActionsContext,ResolvedActionsNotice}.*`
- `src/features/action-layer/{primary,model}.ts`
- `src/features/dashboard/TodaysMissions.tsx`
- `src/features/business-advisor/{AdvisorPage,copy,repository}.*`
- `supabase/functions/business-advisor-v2/{index,handler,logic,entitlement}.ts`
- `src/features/digital-twin/{engine,copy,DigitalTwinPage}.*`
- `src/features/business-memory/{WeeklySummaryPage,BusinessContext}.tsx`
- `src/features/reality-engine/{registry,SourceManager}.*`
- `src/features/meta-connection/MetaConnectionCard.tsx`
- `src/features/tools/catalog.ts`
- `src/features/social-intelligence/findings/{types,policy,engine,rules,copy}.ts`
- `src/features/social-intelligence/ui/{viewModel,repository,useSocialIntelligence,AttentionSection,InsightSections}.*`
- `supabase/functions/meta-read/{handler,index}.ts`
- `supabase/migrations/{20261007165118_create_business_actions,20261008181414_sprint06…,20261022170333_a353_meta_read_layer}.sql`
- `src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts`, `src/features/roadmap/__tests__/a273Roadmap.test.ts` (FROZEN maps)

## 40. Confirmation no implementation occurred
- No production code, tests, routes, UI, tables, migrations, RPCs, edge functions, Meta OAuth or permissions were changed.
- The only new file is this report.
- Frozen hashes were re-verified after writing (A3.5.4.3.1 §4 and §32 values; App.tsx sha256 `36074bed…9078`).
- No Meta sync was run and no database writes were made (read-only `execute_sql` was not needed in this phase).

## 41. Final verdict
**GO — SOCIAL INTELLIGENCE INTEGRATION ARCHITECTURE READY FOR IMPLEMENTATION**

## 42. Exact next phase
**A3.5.4.4.1 — Social Integration Projection + minimal Hoy/Plan consumer implementation.** It requires explicit authorization for the scoped `TodayPage.tsx` re-pin (§38.3). Not started.
