# A3.7.6.4 — Test Re-pin Verification

- Baseline: `/tmp/a4base` (A3.7.6.2 archive). Workspace = A3.7.6.3 archive (`/tmp/a4new`, identical).
- Method:
  - per-file `diff`;
  - `expect(` and `it(`/`test(` counts, baseline → now;
  - a scan of added lines for `.skip`, `.only`, `.todo`, `xit(` and `it.fails`.

## 1. Assertion integrity per modified file

| File | expect( | it/test | added skip/only |
|---|---|---|---|
| src/components/__tests__/a281TrustCleanup.test.ts | 42→42 | 18→18 | 0 |
| src/features/action-layer/__tests__/a271ActionLayer.test.ts | 159→159 | 112→112 | 0 |
| src/features/action-layer/__tests__/a33DiagnosticAction.test.ts | 45→45 | 14→14 | 0 |
| src/features/email-verification/__tests__/f03Stage2b.test.ts | 87→87 | 34→34 | 0 |
| src/features/internal-access/__tests__/a3752TenantSecurity.test.tsx | 72→72 | 27→27 | 0 |
| src/features/publications/__tests__/a3732AdaptationGuards.test.ts | 73→73 | 24→24 | 0 |
| src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts | 165→165 | 44→44 | 0 |
| src/features/publications/__tests__/a3743GateB2Part1Security.test.ts | 71→71 | 20→20 | 0 |
| src/features/publications/__tests__/a3743GateB3Fix01ConnectionPreflight.test.ts | 131→131 | 27→27 | 0 |
| src/features/publications/__tests__/a3743GateB3Fix02StatusAttemptGrant.test.ts | 63→63 | 19→19 | 0 |
| src/features/publications/__tests__/a3743InstagramGateA.test.ts | 199→199 | 39→39 | 0 |
| src/features/roadmap/__tests__/a273Roadmap.test.ts | 169→169 | 123→123 | 0 |
| src/features/social-intelligence/integration/__tests__/a3544SocialIntegration.test.ts | 85→85 | 31→31 | 0 |
| src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts | 127→127 | 101→101 | 0 |
| src/features/tools/__tests__/toolsHub.test.ts | 49→49 | 10→10 | 0 |
| src/features/weekly-plan/__tests__/a3762WeeklyPlanPage.test.tsx | 95→96 | 31→31 | 0 |

- 16 existing test files were modified, and 1 file is new (`a3763WeeklyPlanRouting.test.tsx`, 20 tests, no skip/only).
- No assertion count decreased.

## 2. Re-pin table (original → new, reason)

### App.tsx fingerprint (`f0c81e90…` → `4466949b…`)

- Reason: App.tsx genuinely changed (WeeklyPlanPage import, LegacyPlanRedirect, two routes).
- Recomputed: `sha256(src/App.tsx)` = `4466949b9560d932f092b0de91116b1240c8ffc87c4fce13496a9d571c467f3c`.

| File:line | Change |
|---|---|
| a281TrustCleanup.test.ts:132 | f0c81e90… → 4466949b… |
| a3743GateB2Part1Security.test.ts:306 | same |
| a3743GateB3Fix01ConnectionPreflight.test.ts:427 | same |
| a3743GateB3Fix02StatusAttemptGrant.test.ts:278 | same |
| a273Roadmap.test.ts:72 | same |
| a3544SocialIntegration.test.ts:306 | same |
| a272TodayIntelligence.test.ts:43 | same |

### Route counts (+1 path: `/semana`; `/plan` kept as a redirect)

| File:line | Original → new | Neighbouring assertions kept |
|---|---|---|
| a281TrustCleanup.test.ts:158 | `<Route [^>]*path=` 34 → 35 | yes |
| a271ActionLayer.test.ts:299 (test 90) | 34 → 35 | still asserts `/herramientas/resenas` |
| a33DiagnosticAction.test.ts:141 | ROUTES 33 → 34 | still asserts `/oauth/meta/callback` |
| f03Stage2b.test.ts:261, :284 | 34 → 35 (each) | yes |
| a3732AdaptationGuards.test.ts:222 | 34 → 35 | yes |
| a273Roadmap.test.ts:363 | 34 → 35 | yes |
| a272TodayIntelligence.test.ts:259 (test 91) | 34 → 35 | yes |
| a3752TenantSecurity.test.tsx | customer list gains `'/semana'`; path= 34 → 35; `<Route\s` 36 → 37; title updated | still asserts no `InternalGuard` in the customer block and the internal route stays guarded |

The +1 in each case matches App.tsx exactly: one new `path=` attribute and one new `<Route` element.

### Chained fingerprints

`a3741MetaPublishingFoundation.test.ts` `AUTHORIZED_REPINS`:
- `was` values unchanged; `now` values updated:
  - App.tsx f0c81e90 → 4466949b
  - a281 3d09ed2e → 804246c9
  - a273 687257b4 → cc367fa1
  - a272 e49985e4 → f372c5e6
  - a3544 59b9d730 → ea5c21fc
  - a3732 a24601b7 → 0293149f
- Each new value is the hash of a file that genuinely changed because of the pin and count updates above. The suite passing with these values shows they match the files on disk.
- The 36-entry manifest check (`checked === 36`) and the repinned-key equality check are intact.

`a3743InstagramGateA.test.ts:792`:
- a3741 pin 4f4f2269… → b042af115cd49fb076e9f4954a46c03db9e417aa9a912b883f6e7eff2b79658c, because the a3741 file changed (above).
- The rest of T36 is unchanged: frozen engine files, migration clauses, verify_jwt.
- The engine aggregate is independently recomputed as 58956f462595b404 (unchanged).

### Labels and intent

| File:line | Original → new | Reason |
|---|---|---|
| toolsHub.test.ts:39–41 | `['Hoy','Plan',…]` → `['Hoy','Tu Semana',…]`; title | nav label rename |
| a3762WeeklyPlanPage.test.tsx:398–405 | "does not touch routing or navigation" (App and shell must not contain WeeklyPlanPage) → "is mounted only through the /semana route" (App has 3 matches, including `<Route path="/semana" element={<WeeklyPlanPage />} />`; the shell still must not contain WeeklyPlanPage) | A3.7.6.2 guarded that the page was not routed yet; A3.7.6.3 routing is the intended change. The new version is stricter: it pins the exact route element and keeps the shell guard |

## 3. Conclusion

- No security or behavioural assertion was removed, weakened, skipped or bypassed.
- Every re-pin traces to a real change in App.tsx, AppShellV2.tsx or a dependent test file.
- Protected Meta and engine fingerprints are unchanged.

Caveat (see the audit, F2): several static protections still target the unrouted PlanPage.tsx rather than the live WeeklyPlanPage. They were not weakened, but they no longer cover the live page.
