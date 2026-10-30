# A3.7.4.2 · GATE B.2 · PART 2 — Final real pre-publish audit

Mode: audit, read-only, no Meta write. Date: 2026-10-30.
This audit changed no code and no data, made no Meta write, created no attempt and did not arm publishing.

> **Update 2026-10-30:** D1 has been fixed by FIX03, and this audit was re-run. See the section "Re-run after FIX03" at the end of this file and `A3_7_4_2_GATE_B2_FIX03_PUBLISH_PANEL_REFRESH.md`. The original verdict and the D1 evidence below are kept unchanged as history.

## Verdict (original run, historical)

**NO-GO — A3.7.4.2 GATE B.2 PRE-PUBLISH HAS A TECHNICAL/SECURITY/IDENTITY DEFECT**

What Manuel reviewed in the Facebook publishing panel (version 2, "En **Gopik.Digital** estamos aquí…") is **not** what the server would publish. The server would publish the authoritative saved draft: version 3, "En **LocalSEOHub.io** estamos aquí…".

The cause is that the Facebook publishing panel does not reload after a save in the channel review editor, so it shows a stale version and caption. Under the brief, a discrepancy that can result in the wrong caption is an automatic NO-GO. Per instructions, the defect was not fixed.

---

## 0. Version question: what each number means

There is exactly one draft row per publication (`publication_drafts`, `draft_rows = 1`). It holds both the Facebook and Instagram texts and a single integer `version`, which is incremented on every save or restore. No separate per-channel or per-publication version exists.

| Item | Source | Live value |
|---|---|---|
| 1. Version used by `publication_publish_gate` | `publication_drafts.version`, compared with `p_expected_version` (`v_draft.version <> p_expected_version` → `VERSION_CONFLICT`) | **3** |
| 2. Facebook channel draft version | Same column; no per-channel version exists | **3** |
| 3. Version used in the idempotency key | `publish_attempt_begin` inserts `draft_version = v_draft.version`; `idempotency_key` is GENERATED ALWAYS AS `publication_id:channel:v{draft_version}` | **3** |
| 4. Is the UI label "Versión del texto: 2" correct? | The label's meaning is right (it is the shared draft version). The value is stale. | Shows 2, actual 3 |
| 5. Stale-version / concurrency problem? | **Yes, in the UI.** The server rejects the stale value safely. | See defect D1 |

"Estado: Borrador listo · Versión: 3" in the review editor is the same `publication_drafts.version`, read after Manuel's latest save. That is the correct value.

### Defect D1 (blocking): the publish panel does not refresh after an editor save
- The Facebook publishing panel loads the draft version and caption once, and reloads only when the resume `revision` changes.
- `revision` changes only when the publication is refreshed through the resume provider.
- After a successful save, the channel review editor updates only its own local state. It never triggers that refresh.
- Result: after editing, the publish panel keeps showing the previous version (2) and the previous caption (the generated "Gopik.Digital" text) until the page is reloaded.

### Consequences
| Scenario | Outcome |
|---|---|
| Click Publish while the panel holds v2 (once arming exists) | Server returns `VERSION_CONFLICT` (proven in Part C). Nothing is posted. Fails safe. |
| Reload the panel, then Publish | Server posts the v3 caption ("LocalSEOHub.io"), which differs from the caption in the brief and the one Manuel reviewed. The server is correct, but the human authorization was based on a different text. |
| Duplicate or stale post | Not possible. The unique indexes allow one live attempt per (publication, channel, version) and one success per (publication, channel). |

This mismatch between the authorization and the payload makes the frozen payload unsafe to authorize as described. Hence NO-GO.

---

## A. Database / identity

| Field | Value |
|---|---|
| publication_id | b140fc59-6458-47d7-b695-df8781610ea5 |
| owner | aabe426e-… (Manuel) on publication, draft and storage path |
| business_id | e6014022-370f-4ec0-a340-c7c55f808247 ("Gopik.Digital"), same on publication, draft and Meta connection |
| status | proposals_ready |
| proposal_generation_id | 6d624a5b-44b2-4a82-b38b-35c99ae140c5 (3 proposals, 1 generation used, no open claim) |
| selected proposal | position 1, role `direct`, lang `es`, selected 2026-10-30 00:15:58 |
| adaptation | adapted 00:16:33, adaptations_used 1, no open claim |
| draft source_generation_id | 6d624a5b-… (matches publication) |
| draft row | publication_drafts PK = publication_id (single row); version **3**; created 00:15:58.50; updated **00:18:03.28** |
| saved facebook_text | see Part E (222 chars, md5 5e3dd1d5591f6f8267071ece78b1c6e5); edited (≠ generated) |
| facebook_generated | "…En Gopik.Digital estamos aquí…" (md5 ed085a7bbe574eef41b599ae460ad230). This is what the panel and the brief show. |
| instagram_text | same row, version 3, md5 4f4b6622eefb41a10af3ebb5b047e2f3 (edited) |
| image path | aabe426e-…/e6014022-…/b140fc59-…/3b96d1a8-e860-48af-874f-4304d4af6905.png |
| image | image/png, 1086×1448, 2,089,456 bytes, normalized, uploaded 00:12:02.998 |
| storage object | exists in `publication-images`; mime image/png; size 2,089,456; eTag 4bccc6fc6f6b6a3e31f5d60a656db8da |
| publication updated_at | 00:13:08.95 |

Publication, image path (user/business/publication segments) and draft all belong to the same publication, business and user. **Identity: OK.**

## B. Facebook connection

| Check | Result |
|---|---|
| connection | e85ae653-…, status `connected`, same user + business |
| Page | **Localseohub.io**, id **1393994523793266** (matches expected) |
| pages_show_list / pages_read_engagement / pages_manage_posts | granted / granted / granted |
| Page task CREATE_CONTENT | present |
| publishing consent | recorded 2026-10-29 18:06:07 |
| token | token reference present; revocation null; no expiry set; last_error null. No token was read or printed. |
| appsecret_proof readiness | `META_APP_SECRET` secret present; the publish path computes appsecret_proof for the Page-token GET, the photo POST and the read-back |
| Page-token derivation (live) | **Not executed.** Derivation is a live Graph call that runs only inside the armed publish path, and there is no read-only server action that exercises it as Manuel without his session. This is not blocking for a pre-publish audit; it is verified on first real use (a failure maps to REAUTH/PERMISSION before any write). |

## C. Real server preflight (`publication_publish_preflight`, read-only)

| expected_version | facebook | instagram |
|---|---|---|
| **3** (authoritative) | `issue = null` (ready), draft_version 3, no attempt | IMAGE_UNSUPPORTED (PNG, ratio 0.75); Instagram is out of scope |
| **2** (what the panel shows) | **VERSION_CONFLICT**, draft_version 3 | VERSION_CONFLICT |

The gate validated:
- owner and business ownership;
- publication state and generation linkage;
- image path shape, mime/extension and existence in storage;
- the draft belongs to the same user/business/generation, with no open adaptation claim;
- exact version;
- caption validity (non-empty, ≤5000 characters, no control characters or markup);
- connection status, token, revocation and expiry;
- required permissions and CREATE_CONTENT;
- no succeeded, publishing or unknown attempt.

Arming is not part of the gate. It is checked separately (Part F).

Transport validation of the image (PNG magic bytes, size ≤ 8 MB, content type) happens only at publish time after download. Size and mime from storage metadata satisfy those limits.

## D. Attempts / idempotency

- Attempts for C (Facebook): **0**. Succeeded 0, publishing 0, unknown 0. All attempts table-wide: 0.
- Idempotency key that WOULD be generated: **`b140fc59-6458-47d7-b695-df8781610ea5:facebook:v3`**, attempt_number 1. It is a generated column, never supplied by any caller.
- The version embedded is `publication_drafts.version` read under `FOR UPDATE` inside `publish_attempt_begin`, after the gate confirmed it equals the caller's expectedVersion. That is 3, not the 2 shown in the panel.
- Duplicate protection:
  - unique (publication, channel, draft_version) while publishing, succeeded or unknown;
  - one active attempt per (publication, channel);
  - one success per (publication, channel);
  - attempt identity is immutable (trigger).

## E. Candidate payload (recorded, NOT approved; see verdict)

| Field | Value |
|---|---|
| publication | b140fc59-6458-47d7-b695-df8781610ea5 |
| Page ID | 1393994523793266 (Localseohub.io) |
| image | …/b140fc59-…/3b96d1a8-e860-48af-874f-4304d4af6905.png · image/png · 1086×1448 · 2,089,456 B · eTag 4bccc6fc6f6b6a3e31f5d60a656db8da |
| draft version | 3 |
| idempotency key | b140fc59-6458-47d7-b695-df8781610ea5:facebook:v3 |
| caption that would be sent (md5 5e3dd1d5591f6f8267071ece78b1c6e5) | see below |

```
La visibilidad en Google es crucial para el éxito de cualquier negocio.

En LocalSEOHub.io estamos aquí para ayudarte a mejorar tu presencia online.

No dejes que tu competencia te supere.

Escríbenos para más información.
```

This **differs** from the caption in the brief ("En Gopik.Digital…", which is the generated text, md5 ed085a7bbe574eef41b599ae460ad230). The payload cannot be frozen as "what Manuel saw".

## F. Safety state

- `META_FACEBOOK_REAL_PUBLISH_ARMED` and `META_FACEBOOK_REAL_PUBLISH_USER_IDS` are absent from the deployed secrets. `isArmed` returns false, and `facebook_publish` returns `REAL_PUBLISH_DISABLED` before preflight.
- The UI button stays disabled (`!status.armed`).
- No Meta endpoint was called during this audit (no edge function invoked; database reads only).
- publication_publish_attempts: 0 before and after. No Facebook post was created.
- Publication A 65569535-…: proposals_ready, updated 2026-10-27 23:05:19, drafts md5 5b7366bfcaa8e008b1ba5b38138bf8dd (unchanged).
- Publication B 442059e5-…: proposals_ready, updated 2026-10-28 12:27:05, drafts md5 fd3e4f7a51725b58fced11e3ef4975ac (unchanged).

## G. Regression / health (no code changes made)

- Focused suites (Facebook publishing, Meta publishing foundation, channel review, publishing access, publication resume, FIX02 entitlement): 6 files, 217 tests, all passed.
  - The existing tests do not cover the cross-panel refresh, which is why D1 was not caught.
- TypeScript: 20 errors, equal to the inherited baseline; 0 new.
- Build: passed (`npm run build`).
- Production/database mutation by this audit: none.

## Required fix before re-audit (not applied, awaiting authorization)

1. After a successful save or restore in the channel review editor, trigger the shared publication refresh. The Facebook publishing panel then reloads its version and caption.
2. Add a test proving that the publish panel's version and caption follow an editor save.
3. Manuel must decide which caption he wants posted. Then reload the page, confirm the panel shows version 3 (or the newer version) with that exact caption, and re-run this audit to freeze it.

STOP. Not armed. Not published. Awaiting Manuel.

---

## Re-run after FIX03 (2026-10-30)

Items 1 and 2 above were implemented under Manuel's FIX03 authorization. Details are in `A3_7_4_2_GATE_B2_FIX03_PUBLISH_PANEL_REFRESH.md`.
- The editor now triggers the existing shared refresh after a successful save or restore, so the Facebook publishing panel reloads.
- 8 new rendered regression tests pass. With the refresh call removed, 3 of them fail (reproducing D1).
- Label renamed to "Versión del borrador" / "Draft version".
- Full suite: 84 files, 2874 tests passed. TypeScript: 20 inherited errors, 0 new. Build: passed.

**D1 status: CLOSED.** The panel's version and caption now follow the authoritative saved draft. The server-side guard behaves as before: stale version 2 requests still fail with VERSION_CONFLICT.

Item 3: the authoritative caption is the version 3 LocalSEOHub.io text below, as designated in the FIX03 brief.

### Re-audit evidence (read-only)
- C b140fc59-6458-47d7-b695-df8781610ea5:
  - status proposals_ready;
  - draft **version 3**, updated_at 2026-10-30 00:18:03.275237 (not incremented by the fix);
  - Facebook caption md5 5e3dd1d5591f6f8267071ece78b1c6e5, 222 chars.
- Image …/3b96d1a8-e860-48af-874f-4304d4af6905.png, image/png, 2,089,456 B, eTag 4bccc6fc6f6b6a3e31f5d60a656db8da (unchanged).
- Page Localseohub.io 1393994523793266, connection connected:
  - pages_show_list, pages_read_engagement and pages_manage_posts granted;
  - CREATE_CONTENT present;
  - not revoked, no last error.
- Preflight at version 3: Facebook ready (no issue). At version 2: VERSION_CONFLICT.
- Attempts: 0 for C, 0 table-wide.
- Real publishing OFF: no arming or allow-list secret.
- A and B unchanged: md5 5b7366bf… and fd3e4f7a…, matching this report.
- No Meta endpoint or edge function was called.
- Not done:
  - The panel was not viewed in a browser as Manuel. Its rendering path is covered by the rendered regression test.
  - The live Page-token derivation from Facebook was not run; it runs only on the armed path.

### Frozen test C payload
- Publication b140fc59-6458-47d7-b695-df8781610ea5; Page 1393994523793266; draft version 3.
- Image as above.
- Would-be idempotency key: **`b140fc59-6458-47d7-b695-df8781610ea5:facebook:v3`**.
- Caption (md5 5e3dd1d5591f6f8267071ece78b1c6e5):

```
La visibilidad en Google es crucial para el éxito de cualquier negocio.

En LocalSEOHub.io estamos aquí para ayudarte a mejorar tu presencia online.

No dejes que tu competencia te supere.

Escríbenos para más información.
```

Any further edit to the draft changes the version and voids this freeze.

### Verdict (re-run)

**GO — A3.7.4.2 GATE B.2 FIX03 CLOSED; PRE-PUBLISH VERIFIED; TEST C PAYLOAD FROZEN; REAL FACEBOOK POST REQUIRES MANUEL EXPLICIT AUTHORIZATION**

STOP. Not armed. Not published. No attempt created. Awaiting Manuel's explicit authorization.
