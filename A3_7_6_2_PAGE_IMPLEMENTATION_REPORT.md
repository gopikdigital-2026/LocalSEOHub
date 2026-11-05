# A3.7.6.2 — Tu Semana — Page Implementation Report

Mode: controlled implementation, no deployment. Verdict: **GO — TU SEMANA PAGE READY FOR INDEPENDENT REVIEW**

## 1. Baseline verification (before editing)

| Check | Result |
|---|---|
| A3.7.6.1 `model.ts` / `copy.ts` present | yes; byte-identical to `localseohub-a3761-weekly-plan-logic.zip` (model 06892478…, copy 3e729e75…) |
| A3.7.6.1 focused tests | 26/26 pass |
| A3.7.5.3 Meta files | MetaConnectionCard 37298926…, metaStatus 50845c8d…, MetaPageSelectModal e4e5b66a…, MetaCallbackPage 5bfc4554…, a3753 test da754bef… (unchanged) |
| Publishing engines (concatenated) | 58956f46… (unchanged) |
| Inspected for reuse | `PlanPage.tsx`, `ActionsContext.ts`, `ActionsProvider.tsx`, `BillingContext.ts`, `BillingNotices.tsx`, `ImprovementHint.tsx`, `components/ui` |

## 2. Files

New (only):

- `src/features/weekly-plan/WeeklyPlanPage.tsx` — the page.
- `src/features/weekly-plan/WeeklyPlanItemCard.tsx` — one action card (split out to keep the page readable).
- `src/features/weekly-plan/pageCopy.ts` — page-only ES/EN strings. Kept separate so the approved A3.7.6.1 `copy.ts` stays byte-identical.
- `src/features/weekly-plan/__tests__/a3762WeeklyPlanPage.test.tsx` — 33 component tests.
- `A3_7_6_2_PAGE_IMPLEMENTATION_REPORT.md`, `A3_7_6_2_PAGE_TEST_REPORT.md`.

Modified: **none**. Deleted: **none**. `App.tsx`, `AppShellV2.tsx`, `PlanPage.tsx` unchanged (hashes f0c81e90…, ef97c6d5…, 109a1a58… match the A3.7.6.1 ZIP). The page is not imported anywhere, so it is not in the production bundle.

## 3. Reuse map

| Need | Reused |
|---|---|
| Business context | `useBusiness()` (`currentBusiness`, `loading`) |
| Actions, loading, sync, errors, mutations | `useActions()` — `actions`, `ready`, `loading`, `error`, `locked`, `ensureFresh`, `refresh`, `start`, `complete`, `dismiss` |
| Premium state | `useBilling().hasPremium` → `buildWeeklyPlan({ access })`; `PaywallNotice` when `locked` |
| Selection, progress, activity | `buildWeeklyPlan` (A3.7.6.1) — no logic duplicated in the page |
| Navigation target / CTA text | `actionTarget`, `ctaLabel`, `PRIORITY_LABELS` |
| Improvement drafts | `ImprovementHint` + `offersImprovement` → existing `/ejecutar/:id` |
| Premium error mapping | `PremiumRequiredError` (same pattern as `PlanPage`) |
| Loading state, tokens | `LoadingState`, `v2-*` Tailwind tokens, lucide icons |
| Localization | `useI18n().lang`; title, effort, source labels, progress note, read-only note, time-zone note from `WEEKLY_PLAN_COPY` |

## 4. Page behaviour

- **Header**: week range ("Semana del 9 de marzo al 15 de marzo"), title from `WEEKLY_PLAN_COPY.title`, purpose line, goal if set, time-zone note.
- **Progress**: "N de M tareas cerradas" + percentage + accessible progress bar only when `percent !== null`; otherwise a plain "nothing to count yet" line. Always states it counts tasks, not business results, that dismissed tasks do not count, and that new tasks can lower the percentage; adds "N tareas nuevas esta semana" when `addedThisWeek > 0`.
- **Priorities**: `plan.focus` (≤5), numbered. Each card: title, state badge, "Por qué", priority, source label, effort labelled "(estimado)" only when the model returns it.
- **Later**: `plan.later` (≤3 when focus is full) behind a collapsed toggle with `aria-expanded` / `aria-controls`.
- **Activity**: four separate groups — done by you, resolved by data update, dismissed, no longer applies; the last two say "No cuentan en el progreso".
- **Controls**: primary CTA (starts a PENDING action via `start`, then navigates), "Marcar como hecha" only when `item.canMarkDone`, "Descartar" only when `item.canDismiss`. Buttons are disabled per action while a request is in flight, preventing double submissions.
- **Read-only**: when `hasPremium` is false, mark/dismiss are hidden, the CTA reads "Ver" and only navigates (no `start`), and the read-only note + existing paywall show. When `hasPremium` is null (unknown), controls stay hidden and no note is shown.
- **States**: loading (business loading, or first sync / loading with nothing to show), no business, load error with retry, incomplete profile (empty card if no actions, hint banner otherwise), missing connections (banner + "Ver fuentes" when any listed action is `SOURCE_REQUIRED`), no pending actions, update errors (dismissible alert; premium errors get the subscription message).

## 5. Data and security

- Isolation: the plan is built with `currentBusiness.id`; `scopeActions` drops rows from other businesses even if the provider briefly holds them during a switch. Server RLS remains the authority.
- Writes go only through `ActionsProvider` (which itself requires `hasPremium === true`) and then the existing repository and RLS. No new mutation path, no record creation.
- No demo data, no Supabase client, no `functions.invoke`, no `fetch`, no publishing, Meta or social modules imported (statically tested).
- No backend changes of any kind.

## 6. Deviations

1. Page strings live in a new `pageCopy.ts` rather than extending `copy.ts`, to leave the reviewed A3.7.6.1 module unchanged.
2. The "missing connections" notice is derived from `SOURCE_REQUIRED` actions rather than loading connection rows. This avoids adding a data dependency and never shows platform data; a business with no integrations and no such action sees no notice.
3. The existing `OriginLabel` badge is Spanish-only, so cards use the localized `sourceLabel` instead (the origin is kept as a `data-origin` attribute).

## 7. Known limitations and pending integration

- Not routed and not in navigation (by instruction). Next stage: `/semana` route, `/plan` redirect, nav entry, then retire `PlanPage`.
- Week uses device local time (documented on the page).
- Progress is live, so its denominator changes during the week (explained on the page).
- Actions without English copy show their Spanish text.
- Visual check in a browser was not possible here; verified via component tests (jsdom) and code review only.
- The roadmap card and social integration card from `PlanPage` are intentionally not included (not in the brief; the social card depends on Meta modules).
- The A3.7.5.3 deployment is still awaiting owner authorization; unrelated to this change.
