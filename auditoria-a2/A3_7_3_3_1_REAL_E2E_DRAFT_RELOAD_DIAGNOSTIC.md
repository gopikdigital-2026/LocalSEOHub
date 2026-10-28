# A3.7.3.3.1 — Real E2E Draft Reload Diagnostic

Date: 2026-10-28 · Mode: diagnosis only (read-only) · Scope: A3.7.3.3 channel review editor after full page reload (F5)

**Verdict: GO — SERVER DRAFT PERSISTENCE VALIDATED; RELOAD RECOVERY IS A SEPARATE UI/RESUME GAP**

---

## 0. Summary

- The Facebook and Instagram edits saved during the real browser validation **are persisted server-side** at version 4. Both texts contain the manual marker `MODIFICADO`, and both differ from the AI-generated originals, which do not contain the marker.
- Nothing was lost or changed by the reload. No publication or draft row has been written since the save at 09:15:04 UTC.
- After F5, the page returns to "Paso 1 — Elige una foto" for three reasons:
  - Step 1–2 keeps the active publication only in React component state, and nothing is stored in the URL or in browser storage.
  - Steps 3 and 4 are separate panels that **never load on mount**. They wait for a manual "Cargar …" button, which sits below Step 1.
- A recovery path already exists. Pressing "Cargar textos para revisar" on Step 4 resolves the same publication and shows version 4 with both markers (proven below by emulating the owner's access rules).
- That recovery is **manual and heuristic**: it picks the latest `proposals_ready` publication. It is not an explicit resume of a chosen draft.
- Secondary finding (§2.4): during this session, Step 1 and Steps 3–4 were working on **different publications**.

---

## 1. SERVER PERSISTENCE

### 1.1 Identifying the record

- **Selection basis:** ownership plus recency, not business name.
- **Owner's publications:** the owner `5fa9559d…` has exactly 2 publications, both on business `91a0c7d4…`.
- **Draft rows:** the owner has exactly 1 draft row in total.
- **Why this is the record:** the only draft row belongs to publication `65569535-…`. Its last update (09:15:04) follows its adaptation (09:14:18) in the same session window. Its version (4) and both "edited" flags match exactly what the UI showed after "Guardar borradores".

| Field | Value |
|---|---|
| publication id | `65569535-5d89-4df3-a8d4-c2af6df8606d` |
| owner | `5fa9559d…` (redacted); draft.user_id = publication.user_id ✔ |
| business | `91a0c7d4…` (redacted); draft.business_id = publication.business_id ✔ |
| publication status | `proposals_ready` |
| proposals generated | 2026-10-27 23:05:19 UTC |
| selected proposal | position 1, role `direct` ("Directa"), selected 2026-10-27 23:07:45 |
| source_generation_id = publication.proposal_generation_id | true (draft is current, not stale) |
| adaptations_used | 2 (latest adaptation 2026-10-28 09:14:18) |
| adaptation claim open | no |
| draft version | **4** (matches UI) |
| facebook_generated present | yes (155 chars) |
| instagram_generated present | yes (151 chars) |
| facebook_text present | yes (166 chars) |
| instagram_text present | yes (162 chars) |
| facebook_text ≠ facebook_generated | **true** |
| instagram_text ≠ instagram_generated | **true** |
| `MODIFICADO` in facebook_text | **true** |
| `MODIFICADO` in instagram_text | **true** |
| `MODIFICADO` in either generated text | false |
| draft updated_at | 2026-10-28 09:15:04.63 UTC |
| rows written after 09:15:05 (owner's publications or drafts) | 0 |

Both channels grew by 11 characters, which is consistent with the marker plus a separator. The marker was not a pure suffix, which is consistent with a manual edit inside the text.

### 1.2 What the app can see (owner's access rules emulated, read-only)

**As the owner** (JWT `sub` = owner, role `authenticated`), the business's publications, newest first:

| id | status | draft visible | markers visible | version |
|---|---|---|---|---|
| `442059e5-…` | `image_ready` | 0 | – | – |
| `65569535-…` | `proposals_ready` | 1 | **true** | **4** |

**As a random other authenticated user:** publication `65569535-…` is visible 0 times, and its draft row is visible 0 times. Ownership isolation holds.

### 1.3 Conclusion

- **A. Facebook edit persisted:** YES.
- **B. Instagram edit persisted:** YES.
- **C. Publication and draft in a correct server state:** YES. It is current against its generation, has no dangling claim, and its version is consistent.
- **Data lost on reload:** none.

**Persistence itself succeeded.**

---

## 2. INTERNAL VALIDATION PAGE STATE RECOVERY

### 2.1 Page composition

`/internal/publications-validation` mounts three independent siblings: `PublicationsValidationPage` (steps 1–2), `ChannelAdaptationPanel` (step 3) and `ChannelReviewPanel` (step 4). They share no publication identifier.

### 2.2 Answers

1. **What identifies the active publication before reload?**
   - Steps 1–2: a `pub` value in `useState`, set by upload or generate.
   - Step 3: its own `pub` state, set only by its "Cargar propuestas generadas" button.
   - Step 4: its own `pub` and `draft` state, set only by "Cargar textos para revisar".
2. **Is the publication id held only in React state?** Yes, for all three panels.
3. **Is it stored in localStorage, sessionStorage, the URL or query state?** No. There are no such reads or writes in any of the three panels.
4. **Is there an existing operation that can retrieve owned publications?** Yes:
   - `listDrafts(businessId)`: newest first, protected by row-level security.
   - `getDraft(id)`.
   - `getReviewDraft(publicationId)` and `getChannelDraft(publicationId)`.
   - Steps 3 and 4 combine them with a local `latestReady()` that picks the newest `proposals_ready` publication by `proposals.generatedAt`.
5. **Does the page intentionally start at Step 1 without an in-memory id?** Yes.
   - Step 1 renders the upload form whenever `pub` is null.
   - Steps 3 and 4 render only their header and a "Cargar …" button until it is pressed. There is no load on mount.
   - This is why the tester saw "Paso 1" and no editor.
6. **Can the page safely recover today?** Partially.
   - Pressing Step 4's load button would have shown version 4 with both edits, as proven in §1.2.
   - Ownership is enforced server-side, so another user's draft can never be recovered.
   - The choice of *which* draft to show is a client-side "latest ready" heuristic.
7. **Could "latest publication" recovery select the wrong draft?** Yes, once the owner has more than one `proposals_ready` publication.
   - The heuristic picks the most recently generated set of proposals, which is not necessarily the draft the user was editing.
   - Examples: the user regenerates proposals on another photo, or edits an older draft.
   - It is also blind to publications that are not `proposals_ready`. See §2.4.
8. **Would an explicit server-owned resume be safer?** Yes. See §3.

### 2.3 Classification

- The editor did not lose data.
- The internal page simply has no automatic resume, by design of the three-panel test harness.
- The recovery that exists is manual (a button), heuristic (latest ready) and placed below Step 1, so after F5 it looks as if nothing exists.

### 2.4 Secondary finding: Step 1 and Steps 3–4 can target different publications

- **What happened:** publication `442059e5-…` (`image_ready`, created 09:12:31 today, image stored, no proposals, no draft) was created by Step 1 in this session.
- **What steps 3–4 actually worked on:** the adaptation (09:14:18) and the save (09:15:04) went to `65569535-…`, whose proposals were generated yesterday. Steps 3–4 ignore the Step 1 publication and pick "latest ready".
- **Impact:** no data corruption. Every write respected ownership, version and generation checks.
- **Impact on the tester:**
  - The tester could believe they were editing the photo just uploaded.
  - The 09:14:18 re-adaptation consumed adaptation 2 of the quota on the older publication.
  - `442059e5-…` remains as an unfinished draft with a stored image.
- **Action:** none taken. Production data was not touched.

**D. Is the problem only client-side loss of the publication identifier after reload?** Yes, with respect to the reported symptom. Added to it is the identity divergence above, which is also a client-side (harness) issue.

**E. Does a safe server-owned recovery already exist but go uncalled?**
- The data access does exist and is ownership-safe.
- On reload the page does not call it automatically; it requires a button press.
- There is no explicit, server-owned "resume this draft" pointer. Recovery relies on a client heuristic.

---

## 3. FUTURE CUSTOMER PRODUCT REQUIREMENT

### 3.1 Scope

**F. Was reload recovery intentionally outside A3.7.3.3?**
- Yes, for the internal harness. The A3.7.3.3 scope was the server-validated editing foundation (save, restore, version locking, validation), mounted on a temporary manual-load page.
- For the future customer flow, it is a **real missing requirement**. A saved draft must never *appear* lost because component state was reset by:
  - F5;
  - closing and reopening the tab;
  - navigating away and back;
  - session restore.

### 3.2 Smallest safe architecture (recommendation, not implemented)

1. **The URL carries the publication id; the server revalidates it.** Use a route such as `/publicaciones/:publicationId`.
   - On mount, load with `getDraft(id)` plus `getReviewDraft(id)`, both under existing row-level security (owner only).
   - A foreign, deleted or invalid id resolves to "not found", never to another record.
   - The URL is only a pointer. The server stays the source of truth for ownership, status, version and texts.
2. **Explicit "continue a draft" list instead of silently picking the latest.**
   - The list shows the owner's unfinished publications for the current business: thumbnail, status, last edited time, and an "edited by you" indicator.
   - Use it when there is no id in the URL.
   - With exactly 0 drafts, go to Step 1. With 1 or more, show the list and let the user choose. Never guess.
3. **A single publication identity shared by all steps.**
   - Steps 1–4 receive the same id from the route.
   - Remove the per-panel "latest ready" lookups, so upload, proposals, adaptation and editing can never diverge again (§2.4).
4. **The step is derived from server state, not stored in the browser.**
   - No proposals: step 2.
   - Proposals but no selection: step 3.
   - Draft present: step 4 with the saved texts.
   - The existing `beforeunload` warning stays for unsaved local edits.
5. **No browser-owned identity is trusted.**
   - No localStorage or sessionStorage for user, business or publication ids.
   - The business comes from the authenticated session's business context.
   - Optionally, a server-side `last_opened_at` per publication can sort the "continue" list. This is not required for the minimum.

The minimum viable cut is items 1, 3 and 4. Item 2 can be a simple list built on `listDrafts()`. No new tables are needed. A database change is needed only if `last_opened_at` is desired.

### 3.3 Narrowest next corrective phase (proposed, not started)

**"A3.7.3.4 — Publication resume and single-identity harness"** (internal page first):

1. Put the publication id in the validation page URL (`?pub=<id>`) and load all steps from it on mount, revalidated by the server.
2. Make steps 3–4 consume that id instead of `latestReady()`.
3. When there is no id, show an explicit "continue a draft" chooser (owner and business scoped). Show Step 1 only when there are no drafts.
4. Add tests: reload resumes the same id; a foreign or invalid id shows "not found"; multiple drafts never auto-select; Step 1 and Step 4 ids always match.

This would modify frozen A3.7.3.2 and A3.7.3.3 client panels and `App.tsx`, so it requires an explicit unfreeze decision. It is **not** A3.7.4 and includes no publishing.

---

## 4. FREEZE INTEGRITY

| Item | Result |
|---|---|
| A3.7.3.1 pins (4 files) | all match |
| A3.7.3.2 pins (18 files) | all match |
| A3.7.3.3 pins (8 files plus App.tsx `c8e503d2…`) | all match |
| Total sha256 check | **31 / 31 OK** |
| A3.7.1 storage/migration fingerprint (excluding `_a3731_`, `_a3732_` and `_a3733_`) | `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973` (unchanged) |
| Publications test suites (15 files) | 433 / 433 passed |

### 4.1 Production safety of this diagnostic

- **Queries used:**
  - `SELECT` statements only.
  - Two read-only queries that simulate a signed-in user's access (`set_config` with transaction-local JWT claims, `SET LOCAL ROLE authenticated`) followed by `SELECT`. Both settings are transaction-scoped and were discarded when the query ended.
- **What did not happen:** no INSERT, UPDATE or DELETE; no migration; no edge-function deploy; no AI call; no Graph call.
- **Files changed:** none. The only file written is this report.

---

## 5. Verdict

**GO — SERVER DRAFT PERSISTENCE VALIDATED; RELOAD RECOVERY IS A SEPARATE UI/RESUME GAP**

A3.7.4 has not been started.
