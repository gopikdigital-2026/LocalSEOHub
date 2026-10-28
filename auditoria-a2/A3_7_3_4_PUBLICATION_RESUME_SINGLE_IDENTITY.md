# A3.7.3.4 — Publication Resume & Single-Identity Flow

Scope: internal harness `/internal/publications-validation` only. No migration, no schema change, no edge function, no change to AI, safety, usage, Premium, Meta, GBP, billing, auth, Hoy, Plan, social intelligence, DB security or text validation. Production orphan `442059e5-11e4-4bdd-a5bc-c714b0a03b72` untouched (still `image_ready`, `updated_at 2026-10-28 09:13:19`).

## 1. Root cause (from A3.7.3.3.1 diagnostic)

- Steps 1–2 (`PublicationsValidationPage`), Step 3 (`ChannelAdaptationPanel`) and Step 4 (`ChannelReviewPanel`) were siblings that each held their own `pub` in local React state.
- Step 1 created a publication in memory only, so nothing was in the URL. F5 dropped the identity.
- Steps 3 and 4 found "their" publication through `latestReady(listDrafts(business))`, which picks the most recently updated `proposals_ready` row of the business. With more than one publication, Steps 3–4 could silently operate on a different publication than Steps 1–2.
- Nothing loaded on mount. Every step required a manual "Cargar…" click.

## 2. Architecture

**Before**

```
App route ─┬─ PublicationsValidationPage  (useState pub)      Steps 1–2
           ├─ ChannelAdaptationPanel      (latestReady → pub)  Step 3
           └─ ChannelReviewPanel          (latestReady → pub)  Step 4
```

**After**

```
URL ?pub=<uuid>  (pointer only)
   │
PublicationResumeProvider  (layout route, the only reader/writer of ?pub)
   │  resolveResume → getDraft(id) under RLS → business check → draft state
   │  context { state, publication, stage, revision, adopt, refresh, open, close, setUnsaved }
   └─ <Outlet/> → AppGuard → PublicationsValidationPage + ResumeBar   Steps 1–2
                            ChannelAdaptationPanel                    Step 3
                            ChannelReviewPanel                        Step 4
```

The server is the source of truth. The provider holds only the last validated server snapshot. The step is never stored in the browser (no localStorage, sessionStorage, IndexedDB or cookies).

## 3. Files unlocked (authorized), with fingerprints

| File | BEFORE sha256 | AFTER sha256 | Why |
|---|---|---|---|
| src/App.tsx | c8e503d2a1cb4c1947a337b238c0ef078277f2c9cc313919aa50ff820f3c7210 | 7902658f9f56ad9db1059bf7111cd3b9ee786256f10b19ff0ac48b3e8d8b94ba | Lazy import of the provider, and the harness route wrapped in one layout route |
| src/features/publications/validation/PublicationsValidationPage.tsx | 4754251850c7c2d0ea75a38258445718aff1c689f876af214205b840294a726c | 1eb1a91eda49dcaaba496acb7072131c153bd022de0e87a637100584c61bbad0 | `pub` comes from context. Upload adopts the id into the URL. Generate refreshes. Remove closes. Proposals load on mount. ResumeBar is rendered |
| src/features/channel-adaptation/ChannelAdaptationPanel.tsx | f3d7f22da5cf3cfc1ba9a1f6f7130dcb5abce263b7573469b6cfbff5e8cbb6ea | f3cc00fdaa24364e194953d503c39976eb7f9b1be6bc742090f7fb6bd41f3369 | `latestReady`, `listDrafts` and the load button removed. Auto-loads the context publication. Select and adapt refresh |
| src/features/channel-adaptation/copy.ts | aa04e4767103c92997b91282e93ccff8e322b5df98111924784ac828855b261b | 31da9d1af14aaff98d53062c7882963610615550457caf33de0ade01e1124643 | Unused `load` key removed |
| src/features/channel-review/ChannelReviewPanel.tsx | 030eb506c7ae546d93332bcf3fc2f117b417c93c1a040d55b3e83b7ee6f75007 | 5ab5259c24a48072d80535c13d1d4b5a5e5c432a2a66316cd3d4b30efa128989 | `latestReady` and `listDrafts` removed. Auto-loads on publication or revision. Reports unsaved edits to the provider. Confirms before discarding dirty edits on reload |
| src/features/channel-review/copy.ts | 42c4b0e6608f7b6d5616de537e8c7ac5deb098564a69ec0ca08fd872477e3286 | 6b6c39d4e90f97520e15df770baec1ed6e5472cbd389f03fd89d200022a17ddd | Unused `load` key removed |

**Unchanged and byte-identical to BEFORE:**
- validation/copy.ts `faa38cd5…`
- publications/repository.ts `e5ddd8bb…`
- publications/types.ts `9f5ac9a2…`
- drafts/repository.ts `299bc8b3…`
- drafts/types.ts `db175c4e…`
- channel-adaptation/repository.ts `d4a46bd5…`
- channel-adaptation/types.ts `2a46a61f…`
- channel-review/model.ts `1045d50d…`
- channel-review/repository.ts `6c3371d9…`
- channel-review/types.ts `37c388de…`

**New files**, all in `src/features/publication-resume/`:
- `model.ts`
- `repository.ts` (read-only)
- `resolve.ts`
- `copy.ts`
- `context.ts`
- `PublicationResumeProvider.tsx`
- `ResumeBar.tsx`
- `__tests__/a3734PublicationResume.test.ts`

**Re-pins**, each tagged `A3.7.3.4 RESUME RE-PIN`:
- The App sha in a281TrustCleanup, a273Roadmap, a272TodayIntelligence and a3544SocialIntegration.
- The page sha in a3732AdaptationGuards.
- The adaptation panel and copy prefixes in a3733ChannelReview.
- The page row in `A3_7_2_FREEZE_MANIFEST.md`, which is read by the frozen a3731 test. That test file itself was kept byte-identical (`38e88e4f…`).
- Four rows in `A3_7_3_3_FREEZE_MANIFEST.md`: the review panel, review copy, the a3733 test and App. Each keeps its previous hash inline.

## 4. Routing

- `/internal/publications-validation?pub=<publication_id>`.
- `parsePubParam`:
  - absent or empty → `none`;
  - not a UUID → `invalid`, which makes no server call;
  - otherwise the lowercased UUID.
- The id is only a pointer. Upload sets it with `adopt`, the chooser sets it with `open`, and "Ver mis publicaciones" / "Cambiar de publicación" / remove clear it with `close`.
- Search-param writes use the router's default push navigation, so the browser back button walks between publications.

## 5. Ownership and business scoping

- Each read goes through the signed-in client:
  - `getDraft(id)` uses `.maybeSingle()` under the `select_own_publications` RLS policy (owner and owned business).
  - Draft rows are read under `select_own_publication_drafts`.
- A foreign or nonexistent id returns `null`. Both produce the identical `unavailable` state with generic copy and no id echoed, so nothing reveals whether the row exists.
- An owned publication whose `business_id` differs from the currently selected business becomes `other_business`, with generic copy.
- The business comes from `useBusiness()`, which loads the owner's businesses from the server under RLS. Nothing is matched by name, and the URL never carries a business id.
- The chooser lists only `listDrafts(currentBusiness.id)`, which is filtered again client-side by `businessId`.

## 6. Resume logic

`resolveResume(param, businessId, api)` returns:

| Input | Result |
|---|---|
| invalid | `unavailable` |
| none | `none { candidates }` |
| id, and `getDraft` returns null or a different id | `unavailable` |
| id in a different business | `other_business` |
| id, otherwise | `ready { publication, draft }` |
| any thrown error | `unavailable` |

- With a `?pub` present, everything loads on mount: the publication, its current proposals, the Step 3 selection or adaptation, and the Step 4 review draft. There are no "Cargar…" buttons.
- Revalidating the same id keeps the current view instead of flashing a loading state.
- After generate, select or adapt, the provider calls `refresh()`, which re-reads the server and increments `revision`. Step 4 reloads on that change.

## 7. Stage derivation (`deriveStage`)

| Server state | Stage |
|---|---|
| status `draft` (no image) | upload |
| `image_ready` | generate |
| `proposals_ready`, no draft row whose `source_generation_id` = current generation | select |
| current draft, adaptation texts not all present | adapt |
| current draft, adaptation texts present | review |

Manual edits are flagged when a current adapted draft has `facebook_text ≠ facebook_generated` or `instagram_text ≠ instagram_generated`. This uses the existing `isEdited` function.

## 8. `latestReady` removal

`latestReady` and `listDrafts` no longer appear in Steps 3 and 4, and a test enforces this. Both panels render only for the context publication. They render nothing when that publication is not `proposals_ready` or belongs to another business.

## 9. Multiple-draft behaviour

- Without `?pub`, the "Continuar una publicación" chooser lists every publication of the current business.
- Each item shows the stage, the last-modified time (the later of the publication's and the current draft's `updated_at`), and a manual-edits badge. It also has a "Continuar" button.
- The list is sorted newest first. Nothing is auto-selected, even when there is only one candidate.
- With zero candidates the chooser is hidden and Step 1 is shown.

## 10. Unsaved edits

- `beforeunload` is retained in Step 4.
- Step 4 reports its dirty state to the provider. Switching or closing a publication inside the app asks for confirmation.
- A revision reload while edits are dirty also asks for confirmation, and keeps the edits on cancel.
- Unsaved edits do **not** survive F5; only saved drafts do. The existing saved/unsaved indicator is unchanged.

## 11. Security reverification (live database, read-only)

| Check | Result |
|---|---|
| RLS enabled on `publications` and `publication_drafts` | yes |
| `select_own_publications` (authenticated) | `auth.uid() = user_id AND` owned business |
| `select_own_publication_drafts` (authenticated) | `auth.uid() = user_id` |
| anon table grants on either table | none |
| authenticated table grants | SELECT only (writes remain through existing guarded paths, unchanged) |
| bucket `publication-images` | private (`public=false`) |
| service key in client source | none |
| applied migrations | 54, unchanged; no migration file added in A3.7.3.4 |

**Resume layer guarantees (enforced by a test):**
- no `service_role`, `createSignedUrl`, `getPublicUrl`, storage, rpc, functions, `fetch` or provider calls;
- exactly one `.from(` call, and it is read-only;
- no `<img>`.

## 12. Tests

`a3734PublicationResume.test.ts` contains 24 tests:

**URL parsing:** malformed and injection-like ids are rejected.

**Stage derivation:**
- all five stages;
- a stale-generation draft maps to `select`;
- a foreign draft is ignored;
- the edited flag;
- row mapping.

**Scenarios:**

| Scenario | Expected result |
|---|---|
| A. Zero drafts | `none`, empty list, so Step 1 |
| B. One draft, no id | chooser with one item, no publication selected |
| C. Multiple drafts | all listed with stage, last modified and edited flag; sorted; no pick |
| D. Valid owned id | exact publication; calls are exactly `getDraft(id)` and draft states for `[id]`, with no listing |
| E. Invalid id | `unavailable`, with zero server calls |
| F. Another user's id | deep-equal to a missing id; copy contains no UUID |
| G. Another owned business | `other_business`, and never listed |
| H. Reload while editing | same id, stage `review`, edits flagged |
| I. Reload after selection | stage `adapt` |
| J. Reload after upload | same id, stage `generate` |
| Server error | `unavailable` |

**Other checks:**
- The draft-state read is scoped by `.in('publication_id', ids)`, an empty list makes no query, and an error fails closed.
- Single-identity invariant:
  - The page and both panels consume `usePublicationResume()`.
  - None of them use `latestReady` or `listDrafts`.
  - Steps 1–4 call generate, delete, select, adapt and review with the same `pub.id`.
  - Upload adopts the id into the URL.
  - Only the provider touches search params.
  - The harness route is nested in the provider layout route.
- No browser persistence of the step.
- Unsaved-edit truthfulness: `beforeunload`, `setUnsaved` and confirmations.

## 13. Regression

| Check | Result |
|---|---|
| Full suite | 79 files, 2712 tests, all passed |
| `npx tsc --noEmit -p tsconfig.app.json` | 20 errors, the inherited baseline, 0 new |
| `npm run build` | PASS |
| `A3_7_2_FREEZE_MANIFEST.md` | 28/28 match (page row re-pinned as authorized) |
| `A3_7_3_1_FREEZE_MANIFEST.md` | 4/4 match |
| `A3_7_3_3_FREEZE_MANIFEST.md` | 9/9 match after the 4 authorized re-pins; migrations, model, repository and types are unchanged |

## 14. Manual browser E2E (for Manuel — NOT yet performed, NOT claimed as passed)

1. Open `/internal/publications-validation` and upload a photo in Step 1.
2. Confirm the address bar now shows `?pub=<id>`, and note the id.
3. Generate proposals in Step 2.
4. Select a proposal in Step 3.
5. Click Adapt in Step 3.
6. Edit both the Facebook and Instagram texts in Step 4.
7. Save the edits.
8. Press F5.
9. Confirm the same `?pub` id is in the URL and in the "Publicación actual" banner.
10. Confirm the same photo and publication are shown, with no "Cargar…" click.
11. Confirm the same selected proposal is shown in Step 3.
12. Confirm the same adaptations are shown in Step 4.
13. Confirm the saved edits are still there and marked as edited.
14. Navigate to another app page.
15. Return by pasting the full URL with `?pub`.
16. Confirm the same publication is shown.
17. Remove `?pub` from the URL and load the page.
18. Confirm the "Continuar una publicación" chooser appears.
19. Click "Continuar" on the same publication.
20. Confirm the exact resume: same id, same stage, same texts.
21. Confirm no different publication was silently selected at any point. Also check that the orphan `442059e5…` appears only as a chooser item and is never opened automatically.

**Optional extra checks:**
- Make an unsaved edit and click "Cambiar de publicación". A confirmation should appear.
- Make an unsaved edit and press F5. The browser should warn, and after a reload only the saved text is present.
- Use `?pub=abc`, or another account's id. A generic unavailable message should appear.

## 15. Limitations

- **No thumbnails in the chooser.** There is no safe client-side signed-URL path, and the tests forbid `createSignedUrl` in the client. An icon placeholder is shown instead.
- **Unsaved edits do not survive F5,** by design and stated truthfully. Only saved drafts persist.
- **The chooser lists all of the business's publications.** There is no "published/finished" status yet, so every publication counts as unfinished.
- Real-browser behaviour was verified by Manuel in production on 2026-10-28 (section 16).

## Pre-E2E verdict (historical)

GO — A3.7.3.4 READY FOR REAL RESUME E2E VALIDATION

## 16. REAL PRODUCTION E2E — PASS

Performed by Manuel on 2026-10-28 in a real production browser session.

Two distinct real publications of the **same** authenticated business (`91a0c7d4…`) were used.

### 16.1 Publications and final state

| | Publication A | Publication B |
|---|---|---|
| UUID | `65569535-5d89-4df3-a8d4-c2af6df8606d` | `442059e5-11e4-4bdd-a5bc-c714b0a03b72` |
| Starting point | already adapted and edited | `image_ready`, 0 proposals (the former orphan) |
| Selected proposal | 1 · direct | 2 · "Cercana" (close) |
| Manual marker, Facebook | `MODIFICADO` | `E2E442-FB` |
| Manual marker, Instagram | `MODIFICADO` | `E2E442-IG` |
| "Editado por ti" | both channels | both channels |
| Status shown | Borrador listo | Borrador listo |
| Draft version | **4** | **3** |
| Ctrl+F5 | exact server state restored automatically | exact server state restored automatically |
| Foreign markers present | no `E2E442` | no `MODIFICADO` |

The brief quoted Publication A's id as `…c2af6df8686d`. The database row, under the same prefix and business, is `…c2af6df8606d`, so this report uses the database value.

**Read-only database corroboration** (no writes):

- **Both publications:**
  - status `proposals_ready`;
  - 3 proposals in the current generation;
  - the draft is bound to the current generation;
  - both channels differ from the generated text.
- **Publication A:**
  - version 4;
  - position 1 `direct`;
  - `MODIFICADO` in both channels;
  - no `E2E442`.
- **Publication B:**
  - version 3;
  - position 2 `close`;
  - `E2E442-FB` in Facebook and `E2E442-IG` in Instagram.

### 16.2 Single-identity lifecycle (Publication B)

`442059e5-…` stayed the one identity across the whole flow, and the URL stayed `?pub=442059e5-…` throughout:

photo → generation of exactly 3 proposals → `proposals_ready` → selection of proposal 2 → Facebook + Instagram adaptation → review → manual edit → save → Ctrl+F5 → resume

The original A3.7.3.3.1 defect cannot recur in this flow. That defect was a photo on one publication while later steps used another, chosen by "latest ready".

### 16.3 Explicit chooser and no silent latest selection

- Without `?pub`, the page showed the explicit "Continuar una publicación" list and selected nothing by itself.
- At first the list told the two publications apart: "Textos adaptados · en revisión" and "Foto subida · falta generar propuestas".
- After B was finished, both appeared independently as "Textos adaptados · en revisión". Each had its own last-modified time and manual-change indicator.
- Each "Continuar" button opened its own publication.

### 16.4 Server persistence

The following all survive Ctrl+F5 with no manual reload button:

- the publication identity;
- the selected proposal;
- the generated adaptations;
- the manual edits;
- the version;
- the status.

### 16.5 Same-business isolation

Switching between A and B through the chooser showed no cross-publication contamination. A kept only `MODIFICADO`, and B kept only `E2E442-FB` / `E2E442-IG`. This proves isolation between publications of the same business, beyond the per-user and per-business isolation covered by tests F and G.

### 16.6 Final regression at freeze

| Check | Result |
|---|---|
| Publications and resume tests | 16 files, 457 tests, PASS |
| Full suite | 79 files, 2712 tests, PASS (equals the baseline) |
| `npx tsc --noEmit -p tsconfig.app.json` | 20 inherited errors, 0 new |
| `npm run build` | PASS |
| Upstream manifests | A3.7.2 28/28, A3.7.3.1 4/4, A3.7.3.3 9/9 |

Final fingerprints, separated into A (changed), B (upstream unchanged) and C (test/report-only), are in `A3_7_3_4_FREEZE_MANIFEST.md`.

**Freeze scope:**
- no code changed for this freeze;
- no migration;
- no production data modified;
- both E2E publications preserved as validation evidence;
- no Meta permission or publishing work.

## Final verdict

GO — FINAL FREEZE A3.7.3.4 PUBLICATION RESUME & SINGLE IDENTITY

A3.7.3.4 is FROZEN. A3.7.4 is not started. Facebook and Instagram publishing are not implemented, and Meta permissions are unchanged.
