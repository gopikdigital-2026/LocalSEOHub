# A3.7.4.2 · GATE B.2 · FIX03 — Publish panel refresh after draft save

Mode: minimal fix → test → real read-only re-audit. Date: 2026-10-30.
Authorization: Manuel, limited to the minimal fix for defect D1 in `A3_7_4_2_GATE_B2_PART2_FINAL_PREPUBLISH_AUDIT.md`.

## Verdict

**GO — A3.7.4.2 GATE B.2 FIX03 CLOSED; PRE-PUBLISH VERIFIED; TEST C PAYLOAD FROZEN; REAL FACEBOOK POST REQUIRES MANUEL EXPLICIT AUTHORIZATION**

Not armed. Not published. No attempt created. Waiting for Manuel.

---

## 1. Fix (client only, existing shared mechanism)

`src/features/channel-review/ChannelReviewPanel.tsx`:
- After a **successful** `saveChannelDrafts` (both Save and Restore, which use the same `persist` path), the editor calls the existing `usePublicationResume().refresh()`.
  - That re-resolves the publication and bumps the shared `revision`.
  - `FacebookPublishHarness` already reloads on `[load, revision]`. It re-reads `getReviewDraft`, then calls `facebook_publish_status` with the new version.
- **Self-reload guard.** The editor's own loader also listens to `revision`. A naive refresh would have:
  1. reloaded the editor right after its own save, removing the "Borradores guardados" confirmation;
  2. on a restore while the other channel has unsaved text, asked "discard changes?".

  To prevent this, the editor records the `updated_at` of the row it just saved. It skips its reload only when the refreshed shared state reports exactly that row (`resumeState.draft.updatedAt`). The marker is consumed on the next effect run, so a later refresh for any other reason (selection, adaptation, someone else's save) still reloads the editor normally.
- A failed save (`catch`) triggers no refresh.

`src/features/facebook-publish/copy.ts`: label `version` changed from "Versión del texto" / "Text version" to **"Versión del borrador" / "Draft version"**. This is a copy-only change.

**Not introduced:** polling, timers, window reload, new global state, new repositories, database columns, migrations, or edge functions. `PublicationResumeProvider`, `FacebookPublishHarness.tsx` and every server file are byte-identical. The harness SHA-256 still equals the GATE A manifest value `78cc2a49…`; the provider equals `d8af6870…`.

### Timestamp equality (live DB, read-only)
The guard compares the saved row's `updated_at` from two sources: the save RPC (`jsonb_build_object`) and the shared resume read (PostgREST `select`). On publication C, both serialize to `2026-10-30T00:18:03.275237+00:00`. If they ever differed, the only effect would be one extra editor reload, never a stale publish panel.

## 2. No refresh loop (proven by test)

The rendered integration test reports, per save:

| Measure | Result |
|---|---|
| Save RPC calls | exactly 1 |
| Logical refreshes (shared revision bumps) | 1 |
| Draft reads after the save | +1, from the harness only (total 3 = 2 initial + 1) |
| Facebook status requests | 2 in total (v2 initially, then v3) |
| Requests during extra idle cycles | 0 |
| Version | incremented only by the save; refreshing never changes it |
| Editor | keeps its saved confirmation; `window.confirm` never called |

## 3. Regression tests

New file `src/features/facebook-publish/__tests__/a3742B2Fix03PublishPanelRefresh.test.tsx`, 8 tests.

**What it renders.** The real `PublicationResumeProvider`, `ChannelReviewPanel` and `FacebookPublishHarness` inside a router. Real repositories run against a simulated server holding C's identifiers (publication, business, generation, Page 1393994523793266).

| Test | Proves |
|---|---|
| A | Harness starts on version 2 with the OLD caption |
| B–F | Editor saves v3 with the NEW caption; harness then shows **3** and **NEW**, and OLD is gone; status requested with v2 then v3 |
| One logical refresh | No loop, no repeated requests, single save, no version bump from refreshing |
| Editor stable | Saved confirmation kept; no confirmation dialog |
| Restore | Restore bumps the version to 4; harness shows 4 and the restored caption; unsaved Instagram text kept |
| Failed save | No refresh; harness unchanged |
| Guard consumed | A later unrelated shared refresh still reloads the editor and the harness (v5) |
| Nothing published | Only `facebook_publish_status` is invoked (no `facebook_publish`), so no attempt and no Meta write; the publish button is disabled and the panel says "Publicación real desactivada en el servidor" |

**Reproduction proof.** With only the `refresh()` call temporarily removed, tests B–F, one-logical-refresh and restore **fail** (3 failed). With the fix they pass (8/8).

**Test tooling.** `jsdom@^25.0.1` was added as a **devDependency** only, because the project had no DOM test environment. It is not part of the app bundle.

### Authorized re-pins (recorded in a3741 `AUTHORIZED_REPINS`, with "was" values from the A3.7.3.4 manifest)

| File | was | now |
|---|---|---|
| src/features/channel-review/ChannelReviewPanel.tsx | 5ab5259c24a48072d80535c13d1d4b5a5e5c432a2a66316cd3d4b30efa128989 | 0dc3a0e50b5f61c69d458313a5a7f9a672616af9f81906c32618239b8025f4be |
| src/features/publication-resume/__tests__/a3734PublicationResume.test.ts | 5ca2c7ba3f3c311a94f78565156199efcc6e2c4a95a8bc00583e1fb58ab94cf9 | 7778b24b8cf0e80c07fb33008a751bafd7dbe6c1d18ac395561e7e8ae4df35b1 |

- a3734 changed only its destructuring assertion for step 4, to `{ publication, state: resumeState, revision, refresh, setUnsaved }`.
- `facebook-publish/copy.ts` moves from the GATE A manifest value `b672f159…` to `e47fa991449289ca8986828f168c4e052bdfb67877ea7aa6c263d29aeb70ce20`. That manifest is documentary, not test-enforced; the label change is the only difference.

## 4. Health

| Check | Result |
|---|---|
| New regression tests | 8/8 passed |
| Focused suites (FIX03, Facebook publishing, channel review, publication resume, Meta publishing foundation, publishing access, FIX02 entitlement) | 7 files, **225 tests passed** |
| Full suite | **84 files, 2874 tests passed**, 0 failed |
| TypeScript | **20 errors (inherited baseline), 0 new**; none in changed files |
| Build | **PASS** |

## 5. Real read-only re-audit of C (DB reads and read-only RPCs only)

| Item | Live value | OK |
|---|---|---|
| publication | b140fc59-6458-47d7-b695-df8781610ea5, proposals_ready, updated 2026-10-30 00:13:08.946825 (unchanged) | ✔ |
| draft version | **3**; updated_at 2026-10-30 00:18:03.275237 (unchanged, so the fix incremented nothing) | ✔ |
| saved Facebook caption | exactly the authoritative LocalSEOHub.io text; 222 chars; md5 5e3dd1d5591f6f8267071ece78b1c6e5 | ✔ |
| Instagram text | md5 4f4b6622eefb41a10af3ebb5b047e2f3 (unchanged) | ✔ |
| image | same path …/3b96d1a8-e860-48af-874f-4304d4af6905.png; image/png; 2,089,456 B; storage eTag 4bccc6fc6f6b6a3e31f5d60a656db8da (unchanged) | ✔ |
| Page | Localseohub.io, 1393994523793266; connection e85ae653-…, connected | ✔ |
| pages_show_list / pages_read_engagement / pages_manage_posts | granted / granted / granted | ✔ |
| CREATE_CONTENT | present in page_tasks | ✔ |
| consent / token / revocation / last_error | 2026-10-29 18:06:07 / present (not read) / null / null | ✔ |
| preflight (expected 3) | facebook issue **null** (ready), draft_version 3 | ✔ |
| preflight (expected 2) | VERSION_CONFLICT (stale requests still fail closed) | ✔ |
| attempts | C: 0; table-wide: 0 | ✔ |
| real publishing | no `META_FACEBOOK_REAL_PUBLISH_ARMED` / `_USER_IDS` secrets, so OFF | ✔ |

**What the panel shows.**
- The panel reads its version from `publication_drafts.version`, and the status action returns `caption: draft.facebook_text` and `version: draft.version` from the same row. For C that is version 3 and the caption above.
- Since FIX03 it re-reads after every save or restore, so it now resolves the same publication, version, caption, Page, permissions, preflight and attempt state as the database.
- The `meta-publishing` function is unchanged since its last deploy (deploy state `hasChanged: false`).

**Not done.**
- The panel was not viewed in a browser as Manuel; this environment has no browser and his session is not used. That rendering path is covered by the integration test above.
- The live Page-token derivation from Facebook was not run. As in Part 2, it runs only inside the armed publish path.

## 6. Idempotency

The would-be key, recalculated from authoritative version 3, is **`b140fc59-6458-47d7-b695-df8781610ea5:facebook:v3`** (generated column, attempt_number 1). No attempt was created.

## 7. Frozen test C payload

| Field | Value |
|---|---|
| publication | b140fc59-6458-47d7-b695-df8781610ea5 |
| Page | 1393994523793266 (Localseohub.io) |
| draft version | 3 |
| image | …/b140fc59-…/3b96d1a8-e860-48af-874f-4304d4af6905.png · image/png · 1086×1448 · 2,089,456 B · eTag 4bccc6fc6f6b6a3e31f5d60a656db8da |
| caption md5 | 5e3dd1d5591f6f8267071ece78b1c6e5 |
| idempotency key | b140fc59-6458-47d7-b695-df8781610ea5:facebook:v3 |

Caption:

```
La visibilidad en Google es crucial para el éxito de cualquier negocio.

En LocalSEOHub.io estamos aquí para ayudarte a mejorar tu presencia online.

No dejes que tu competencia te supere.

Escríbenos para más información.
```

Before authorizing, Manuel should reload the internal page and confirm that the panel shows "Versión del borrador: 3" and exactly this caption. If the draft is edited again, the version changes, this freeze no longer applies, and the payload must be re-frozen.

## 8. Safety proof

- Real publishing OFF: no arming or allow-list secret exists.
- No allow-list activation occurred.
- No Meta endpoint was called. No edge function was invoked or deployed; the audit used database reads and read-only preflight RPCs only.
- publication_publish_attempts: 0 for C, 0 table-wide. No Facebook post was created.
- A 65569535-…: proposals_ready, updated 2026-10-27 23:05:19.287086, draft md5 5b7366bfcaa8e008b1ba5b38138bf8dd. Unchanged from Part 2.
- B 442059e5-…: proposals_ready, updated 2026-10-28 12:27:05.291163, draft md5 fd3e4f7a51725b58fced11e3ef4975ac. Unchanged from Part 2.
- C caption md5, draft version 3, updated_at and image eTag: unchanged.
- Billing, entitlements and Meta permissions were not touched.

STOP. Not armed. Not published. No attempt created. Waiting for Manuel's explicit authorization.
