# A3.7.6.0 — TU SEMANA — IMPLEMENTATION PLAN (Option A)

Each stage below is small, independently auditable, and ends with a GO/NO-GO gate.

**Invariants for every stage:**
- The five A3.7.5.3 SHA-256 fingerprints are unchanged.
- The frozen publishing-engine hash `58956f46…7606` is unchanged.
- No migrations, edge-function deploys, secret changes or publishing calls.
- The full test suite stays green: the 3,118-test baseline plus any new tests.
- `npm run build` passes.
- There are no new TypeScript errors compared with the recorded baseline.

---

## Stage 1 — Read-only data check (no code)

- Run read-only SQL to get the distribution of `business_actions` rows by `rule_id`, `status` and `source_type`.
- Check that `metadata.copy` has both `es` and `en` for each rule.
- Count businesses with zero open actions.
- Confirm that `weekStart()` agrees with `weekly_content_drafts.week_start` values.
- **Acceptance:** a short evidence file. Any copy gaps are listed for Stage 2.

## Stage 2 — Pure selection model and copy

**New files:**
- `src/features/weekly-plan/model.ts`
  - Function `buildWeeklyPlan(actions, roadmap, now)` returns `{ week: {from, to}, focus: BusinessAction[] (≤5), later, doneThisWeek, resolvedThisWeek, progress }`.
  - It reuses `weekStart`, `buildActionReport`, `openActions`, `selectTodayActions` and `actionOutcome`.
  - The progress denominator only counts actions that were open or closed within the week.
- `src/features/weekly-plan/copy.ts` (`{ es, en }`)

**Tests:** `src/features/weekly-plan/__tests__/a3761WeeklyPlanModel.test.ts`, covering:
- Week boundaries: Sunday 23:59 vs Monday 00:00, and the DST change week.
- The first 3 focus items equal `selectTodayActions`.
- At most 5 focus items.
- Dismissed actions are excluded from progress.
- `data_completed` and `executed` are kept separate.
- No self-resolving action can be marked done.
- An empty list works.
- The model is deterministic.

**Acceptance:** pure functions only, with no imports from publishing, demo or AI modules.

## Stage 3 — Page

**New file:** `src/features/weekly-plan/WeeklyPlanPage.tsx`. It reuses:
- `useActions`, `useBusiness`, `useI18n`, `useBilling`
- `RoadmapCard` pieces or `buildRoadmap`
- `SocialIntegrationCard`
- `OriginLabel` / DataIntegrity components
- `LoadingState`, `PaywallNotice`

**States:** loading, error with retry, empty (incomplete onboarding), empty (all closed), and locked.

**Tests:** `src/features/weekly-plan/__tests__/a3761WeeklyPlanPage.test.tsx`, covering:
- Each state renders correctly.
- ES and EN titles appear: "Tu plan semanal" / "Your weekly plan".
- The origin label is present on every card.
- The complete button is absent for self-resolving actions.
- No fabricated numbers: the page contains no score, rating or traffic text.
- An error never renders the "all done" state.

**Acceptance:** responsive classes reviewed for mobile and desktop. The page is not routed yet.

## Stage 4 — Routing and navigation

**Edits:**
- `src/App.tsx`: add `/semana` → `WeeklyPlanPage`, and redirect `/plan` → `/semana`.
- `src/app-v2/layouts/AppShellV2.tsx`: change the nav item `plan` to label "Tu Semana" / "Your Week" and path `/semana`. Keep id `plan` for analytics continuity, and localise only this label.
- Update `PlanCard`'s link target and label copy.
- Retire `src/app-v2/routes/PlanPage.tsx`: delete it once its sections are covered by `WeeklyPlanPage`, and remove any orphaned imports.

**Tests:**
- Route test: `/plan` redirects to `/semana`.
- The nav renders "Tu Semana" in both desktop and mobile bars.
- Existing Plan-related tests are updated where they reference the old title.

**Acceptance:** no other route changes.

## Stage 5 — Safety and regression closure

**Static tests** that read the source text of `src/features/weekly-plan/**` and assert:
- no imports from `facebook-publish`, `instagram-publish`, `publications`, `channel-adaptation`, `channel-review`, `demo/demoData` or `execution/demoWorkspaceData`;
- no `functions.invoke` calls;
- no `.from('…').insert/update/delete` except through `ActionsProvider`.

**Other checks:**
- Tenant check: `a3752TenantSecurity` still passes.
- Hash check for the frozen A3.7.5.3 baseline and the publishing engines.
- Write evidence files: test count, build, tsc diff.

## Stage 6 — Controlled deployment (separate gate, owner-authorised)

- Frontend only, with Bolt Publish done by the owner.
- Rollback: restore the previous version from Version History or a ZIP.
- **Smoke tests:**
  1. Login.
  2. Open `/semana`.
  3. `/plan` redirects.
  4. Mark a done-able action complete, and confirm it appears under "Hechas".
  5. Edit a profile field, and confirm the related action moves to "Resueltas".
  6. Language switch.
  7. Mobile check.
  8. No publishing attempts: `publication_publish_attempts` count is unchanged.

---

## Affected files (total)

| Type | Files |
|---|---|
| New | `src/features/weekly-plan/{model.ts,copy.ts,WeeklyPlanPage.tsx}`, plus 3 test files |
| Edited | `src/App.tsx`, `src/app-v2/layouts/AppShellV2.tsx`, the `PlanCard` source (in `src/features/dashboard/` or wherever it is defined; to be confirmed in Stage 4), and the existing tests that reference the Plan title |
| Removed | `src/app-v2/routes/PlanPage.tsx`, after its sections are carried over |
| Database | **None** |
| Edge functions | **None** |

## Risks and dependencies

| Risk | Mitigation |
|---|---|
| The plan is live, not frozen, so the denominator can change mid-week | Count only actions relevant to the week; copy explains "se actualiza con tus datos". Option B remains available as a later gated stage |
| Week uses browser local time; there is no stored business time zone | A single `weekStart()`, tests for DST and the Sunday/Monday edge, documented limitation |
| GBP is unavailable for all businesses (quota 0), so plans lean on profile and general actions | Origin labels, plus `gbpKnown` withholding; no GBP-derived claims |
| Meta cannot be connected by most customers | The social card shows its existing not-available or connect state |
| Non-premium users cannot write actions (RLS premium policies) | Locked state with `PaywallNotice`; behaviour identical to today |
| Renaming the nav breaks habits or links | Redirect `/plan` → `/semana`; keep the nav id `plan` |
| `metadata.copy` English gaps in old rows | Stage 1 check; fall back to `localizeAction` |
| One business per user | Matches the requirement; multi-business is out of scope |

## Explicitly out of scope

- New tables, RPCs, migrations or edge functions.
- AI-generated weekly plans.
- Calendars, notifications, email digests, reminders and automation.
- Any Facebook or Instagram publishing, or changes to publishing gates and entitlements.
- New analytics, scores, performance or uplift claims.
- Multi-business support.
- Changes to Hoy beyond the `PlanCard` link and label.
- Changes to Resumen (`/informes`) or the weekly content generator.
- Any change to the A3.7.5.3 baseline files.
