# A3.7.3.0 — Publications MVP: Channel Adaptation & Editor — Capability, Architecture & Safety Audit

LocalSEOHub · Audit / design only · No product code, no migrations, no RPCs, no Edge Functions, no AI or Meta calls.

---

## 1. Executive Summary

A3.7.2 is intact. All 28 frozen file hashes, the storage hash and the deploy state match the manifest. The 2510-test baseline, the 20 known TypeScript errors and the build all reproduce exactly.

The repository can support A3.7.3 without editing any frozen A3.7.2 file. Five findings shape the design:

1. **Proposals are deleted when they are replaced.**
   - `complete_publication_generation` runs `DELETE FROM publication_proposals` before every new set (a372:244).
   - The frozen trigger `publications_invalidate_proposals` deletes them whenever the image changes (a372:146-153).
   - So a selection cannot rely on a foreign key alone. A3.7.3 must keep its own immutable **snapshot** of the selected source (body, CTA, role, position, lang, generation_id).
2. **`publications.status` cannot be widened safely.**
   - `publications_proposals_consistency` requires the proposal fields to be non-null exactly when `status = 'proposals_ready'` (a372:92-98).
   - A new status such as `channel_drafts_ready` would have to redefine frozen CHECKs.
   - The A3.7.3 lifecycle should therefore live in a **new 1:1 table**, while the publication itself stays `proposals_ready`.
3. **The frozen safety validators need a `GroundingEnvelope`, which is never persisted.**
   - It is built in memory from the vision call (context.ts:240-305).
   - A3.7.3 cannot reconstruct the original envelope without a new vision call, which would be costly and non-deterministic.
   - The safe composition: byte-identical copies of the frozen modules (precedent: `normalize.ts` is already duplicated between publication-media and publication-proposals), a deterministically rebuilt *adaptation envelope*, and a **source-differential gate**. Any safety issue present in a variant but absent from the selected source rejects the variant.
4. **Adaptation should be one text-only AI call that returns both channels.** It sees only the selected proposal and its CTA, never the image, and has no authority to recompose business facts. A deterministic gate runs afterwards. Option A (fully deterministic) cannot produce a real Facebook/Instagram difference without artificial manipulation.
5. **Customer exposure needs a privacy update.** The privacy policy tells users that business information is sent to OpenAI "para generar recomendaciones y textos", but it does not say that **photos** are uploaded, stored privately and sent to an AI provider. This must be fixed before the customer Publications route goes live (A3.7.3.3). It does not block data or engine work.

The recommended design:
- **Data:** one new table, `publication_drafts` (1:1 with `publications`), browser-readable under owner RLS.
- **Writes:** only through two SECURITY DEFINER RPCs (`select_publication_proposal`, `save_publication_channel_text`) plus one new Edge Function, `publication-adaptations`.
- **Editing:** Facebook | Instagram tabs on every viewport, manual save with a version guard, the image shown from an authenticated in-memory download (no signed URL).
- **Not in MVP:** no hashtags; no emojis added by adaptation.

**Verdict: CONDITIONAL GO.** The conditions are in §62 and §68.

## 2. Verdict

**CONDITIONAL GO — A3.7.3 IS FEASIBLE WITH IDENTIFIED PRE-IMPLEMENTATION CONDITIONS**

## 3. Scope

**In scope:**
- inspection of source, migrations, live-schema-equivalent migration history, publications engine, Meta architecture, AI infrastructure, ledger, UI and routing, tests and legal pages;
- full test suite, TypeScript and build;
- this report.

**Out of scope, and not done:**
- any product code, migration, RPC, Edge Function, prompt or model change;
- any OpenAI, Graph or Instagram call, upload, or production data change;
- any modification of frozen A3.7.2 files;
- A3.7.3.1 or A3.7.4.

## 4. A3.7.2 Freeze Verification

| Check | Result |
|---|---|
| Manifest file hashes (engine, media, migrations a371/a372, client, 10 tests): 28 entries, `sha256sum -c` | **28/28 OK** |
| Storage combined hash (publication-media + migrations) | `1e7aa872…f8973`, **matches** |
| `functions-deploy-state.json` `hasChanged: true` entries | **0** |
| Frozen invariants 1–14 | All still hold. No file touched this phase. |

No unexpected drift was found, so there is no reason to stop.

## 5. Current Publications Architecture

```
browser (repository.ts)
  ├─ publications: SELECT (RLS owner), INSERT(business_id) only
  ├─ publication_proposals: SELECT (RLS owner) only
  ├─ publication-media EF (verify_jwt) ─ attach/replace image, lossless-strip-v1, private bucket
  └─ publication-proposals EF (verify_jwt)
        requirePremium → load pub/business (service role, user-filtered)
        → claim_publication_generation (3-min claim, limit 4)
        → reserve_ai_usage('publication-proposals')  [monthly 20, global 80]
        → re-normalize (byte-identical) → vision (gpt-4o-mini, strict json_schema)
        → parseVisual → insufficiency → buildEnvelope → consistency (mismatch stops here)
        → writer (≤2 calls) → parseProposals(3) → reviewSet{safety,quality}
        → complete_publication_generation (atomic) → settle
```

- **Bucket:** `publication-images` is private.
- **Storage policy:** `publication_images_select_own` allows SELECT only for the owner's *current* image (`p.image_path = objects.name AND p.user_id = auth.uid()`, a371:157-165).

## 6. Available Input Contract

A3.7.3 can use the following as-is, without changing A3.7.2.

**`public.publications`** (a371 + a372):
- `id`, `user_id`, `business_id`, `status ∈ {draft, image_ready, proposals_ready}`;
- `image_path`, `image_mime`, `image_bytes`, `image_width`, `image_height`, `image_uploaded_at`, `image_normalized`;
- `proposal_generation_id`, `proposals_lang`, `proposals_generated_at`, `proposal_generations_used (0..4)`;
- `generation_claim_id`, `generation_claimed_at`, `created_at`, `updated_at`.

**`public.publication_proposals`** (a372:108-126):
- `id`, `publication_id` (FK, CASCADE), `user_id`, `generation_id`;
- `position smallint`, `role` (1=direct, 2=close, 3=professional, enforced by CHECK);
- `lang ∈ {es,en}`, `body` (1..1000), `cta` (1..120), `created_at`;
- `UNIQUE (publication_id, position)`.

**Client types** (`types.ts`):
- `Publication` is a discriminated union on `status`, with `proposals: PublicationProposalSet {generationId, lang, generatedAt, generationsUsed}`.
- `PublicationProposal {id, generationId, position, role, lang, body, cta}`.
- Readers: `getDraft`, `listDrafts`, `getProposals`.

**Engine constants:**
- Engine bounds: `BODY_MAX 600`, `CTA_MAX 80`, `MAX_EMOJIS 1`.
- Validators: `isClaim`, `safetyIssues(text, env)`, `matchesLang`, `relationalIssues(text, env)`, `qualityIssues`, `similarity`.
- Business loading: `BUSINESS_COLUMNS`, `buildFacts`.

**Valid input to A3.7.3:** `status = 'proposals_ready'` AND three rows exist whose `generation_id = publications.proposal_generation_id` AND the caller is the owner.

**Not available:** the grounding envelope, the visual understanding and the image-use mode. None are persisted, and A3.7.3 must not try to recover them.

## 7. Proposal Selection

- **Persist the selection.** It is the anchor for adaptation and for A3.7.4, and the user can change it until publishing.
- **Server boundary:** `select_publication_proposal(p_publication_id, p_position, p_expected_generation_id)`.
  - SECURITY DEFINER, `auth.uid()`, EXECUTE for `authenticated` only.
  - Locks the publication `FOR UPDATE`.
  - Requires `status = 'proposals_ready'` and `proposal_generation_id = p_expected_generation_id`; otherwise it returns `stale`.
  - Copies `body/cta/role/lang/position/generation_id` from `publication_proposals` into the draft row **on the server**, so the client can never supply source text.
- **State transition:**
  - If the same position is already selected, nothing happens (idempotent).
  - If it differs, the snapshot is replaced, both channel texts are cleared and `version` is incremented.
- **Concurrency:** if an adaptation is in flight (active claim under 3 minutes), selection returns `busy`. This prevents a stale adaptation being written over a newer selection, and completion re-checks the snapshot anyway (§35).
- **Optimistic UI:** only for the selected-card highlight. Navigation to the editor waits for the RPC to succeed.

## 8. Proposal Immutability

- `publication_proposals` has **no UPDATE grant for anyone**: browser SELECT only; service_role SELECT, INSERT, DELETE (a372:132-134). A3.7.3 keeps that.
- User edits live only in `publication_drafts`. The draft's `source_*` columns are a write-once snapshot per selection. No browser grant reaches them, and the RPC alone sets them.
- Because proposals can be deleted (regeneration or image change), the snapshot is what keeps the provenance of a selected or edited draft.

## 9. Provenance Model

Each link in the chain maps to a column or relation:

1. **Generated proposal:** `publication_proposals.(generation_id, position)`.
2. **Selected proposal:** `publication_drafts.source_generation_id`, `source_position`, `source_role`, `source_body`, `source_cta`, `lang`, `selected_at`.
3. **Adapted channel draft:** `publication_drafts.facebook_generated`, `instagram_generated`, `adapted_at`.
4. **User-edited channel draft:** `publication_drafts.facebook_text`, `instagram_text`, `version`, `updated_at`.

Edited means `*_text IS DISTINCT FROM *_generated`. That is derived, so no extra flag is needed.

There is no revision history: an MVP needs only "generated" and "current". "Restore" copies generated into current.

## 10. Facebook Adaptation

Facebook means a feed post read in a scrolling, conversational context. It can be somewhat longer, with whole sentences.

**MVP shape:**
- 1–3 short paragraphs separated by a blank line;
- natural, slightly conversational tone;
- the CTA as a final standalone sentence;
- no hashtags;
- no emojis beyond any already present in the source.

**Deterministic parts:**
- whitespace and paragraph normalization;
- CTA placement as the final paragraph;
- trimming;
- length bounds;
- stripping markdown or `*`/`#`;
- emoji cap.

**AI-assisted parts:** paragraphing that reads naturally and a light conversational rewording of the selected text.

## 11. Instagram Adaptation

Instagram means a caption beneath a photo. The first line is visible before "more", so the opening matters most.

**MVP shape:**
- a short hook first line built only from source content;
- a short body with line breaks;
- a concise CTA last;
- no hashtags in MVP (§29);
- no @tags, no location tags, no "link in bio" unless the source CTA already says so.

**Deterministic parts:** line-break normalization, removal of markdown, no `#` or `@` tokens, length bounds, CTA last.

**AI-assisted parts:** the hook line and a more concise rewording.

Instagram does not require hashtags. They are an optional reach tactic, and the risk of noise or hallucination outweighs their MVP value.

## 12. Cross-Channel Differentiation

The two variants share the same source facts and differ in presentation. The validator measures difference without forcing it artificially:

- **D1:** after normalization, the texts are not identical.
- **D2:** the first sentences differ (`similarity(first_fb, first_ig) < 0.8`). This is a loose threshold, not the A3.7.2 0.5, because the same facts are expected.
- **D3:** the Instagram body is shorter than or equal to the Facebook body, or the Instagram text has more line breaks.

Failing D1 is a hard reject that triggers one repair. Failing D2 or D3 only triggers repair. If repair still fails D2/D3 but passes safety, the variants are **accepted**: safety outranks forced difference, and the user edits anyway.

## 13. AI Necessity Analysis

| Option | Quality | Cost | Latency | Factual risk | Validation | Accounting | Customer value |
|---|---|---|---|---|---|---|---|
| A. Deterministic only | Low: reflow only, no real channel voice | 0 | ~0 | None | Trivial | None | Weak ("same text, different label") |
| **B. One AI call → FB+IG** | Good: coherent pair, can differentiate deliberately | 1 text call | One call | Bounded by gate | One parse, two gate passes | 1 reservation | **High** |
| C. One call per channel | Similar per channel, no pair awareness | 2× | 2× sequential or parallel | 2× surface | Two parses | 2 reservations or a composite | Marginal gain |
| D. Hybrid (deterministic seed + AI) | As B | As B | As B | As B | As B | As B | As B, plus fallback |

**Recommendation: B, wrapped deterministically.** This is in effect D, but with one AI call.
- Deterministic pre-processing: build the source text.
- One strict-JSON AI call returning both channels.
- Deterministic post-processing and the safety/drift gate.
- **Deterministic fallback:** if adaptation fails, the editor seeds both channels with the selected proposal (`body + "\n\n" + cta`), which is already safe. The user is never stuck.

## 14. Recommended Adaptation Architecture

```
POST publication-adaptations {publication_id, request_id, expected_generation_id, expected_position}
  requirePremium (copy of entitlement.ts)
  load publication + draft (service role, user-filtered); require proposals_ready and matching snapshot
  claim_publication_adaptation (3-min claim, per-generation limit)
  reserve_ai_usage(request_id, user, 'publication-adaptation')
  build source = {lang, role, body, cta} from snapshot (NOT from publication_proposals, NOT image)
  call gpt-4o-mini, strict json_schema ADAPTATION_SCHEMA, ≤2 calls (initial + 1 repair)
  parse → deterministic post-process → adaptationGate(source, fb, ig, adaptationEnvelope)
  complete_publication_adaptation (atomic; re-checks claim + snapshot)
  settle completed | consumed | released
```

It is a **separate Edge Function**, so the frozen `publication-proposals` handler and index stay untouched.

## 15. Existing AI Infrastructure

- **No shared wrapper.** Each AI function implements its own OpenAI fetch in `index.ts`: advisor, improvement, gbp-reviews, publication-proposals, seo, voice, weekly-content.
- **publication-proposals pattern** (reuse by copying, matching the house convention):
  - DI `callModel(request) → ModelResult {ok, raw} | {ok:false, billed, failure: timeout|rate_limited|server|client|empty}`;
  - `AbortController` timeout;
  - `response_format: {type:"json_schema", json_schema}`, strict;
  - `temperature` and `max_tokens` per request;
  - logs record only the stable event and code (`console.error("[publication-proposals] …", code)`).
- **Model:** `gpt-4o-mini` (handler.ts:16).
- **Writer settings:** 1200 tokens, 25 s, temperature 0.7, `maxCalls 2`.
- **Retries:** no blind retry; one repair only, after parse or validation failure.
- **Ledger:** `reserve_ai_usage(id, user, fn)` and `settle_ai_usage(id, user, outcome)`, run by service_role only. Caps come from `ai_usage_cap(fn)` (a372:289-306: `publication-proposals` 20, `global` 80).
- **Proposed for adaptation:** the same model, strict schema, `maxTokens ≈ 900`, `timeoutMs 20_000`, `temperature ≈ 0.5`, `maxCalls 2`. No model change.

## 16. Factual Authority

The hierarchy, from strongest to weakest. The adapter may use only:

1. `source_body` (the selected, safety-passed proposal);
2. `source_cta`;
3. `lang`, `source_role` (tone hint);
4. **validation-only** business facts (`buildFacts(BUSINESS_COLUMNS)` reloaded server-side), used **solely** to build the gate's envelope and **never sent in the prompt**.

The adapter does **not** use:
- the image;
- visual understanding;
- other proposals;
- business services, city or name as content;
- Meta data;
- reviews.

It does not reopen the generation problem.

## 17. Adaptation Safety

**Reuse without modification:**
- A3.7.2 functions are pure and env-parameterized: `safetyIssues`, `relationalIssues`, `matchesLang`, `isClaim`, `similarity`, `words`.
- Following the existing `normalize.ts` precedent, `publication-adaptations/` gets **byte-identical copies** of `context.ts`, `safety.ts`, `relational.ts` and `quality.ts`.
- A test asserts SHA-256 equality with the frozen originals, so the copies can never drift silently. Frozen files stay untouched.

**Adaptation envelope** (deterministic, conservative):
- `business` = rebuilt `buildFacts`;
- `image.observed` = content words of the **source** that are not business words. This treats every non-declared source noun as image-only, which is *stricter* than A3.7.2;
- `image.visible_text = []`;
- `cta.booking_declared` = derived from declared text exactly as `buildEnvelope` does;
- `uncertain = []`.

**Gate**, for each channel text `t` against source `s = body + "\n" + cta`:
1. `safetyIssues(t, envA)` must not contain any issue absent from `safetyIssues(s, envA)` (differential);
2. `matchesLang(t, lang)`;
3. drift rules (§18);
4. bounds and Unicode (§48).

Any failure goes to one repair. A second failure gives `ADAPTATION_UNSAFE`. Nothing is persisted and the per-generation counter does not change.

## 18. Semantic Drift

A practical, deterministic MVP method. Every rule compares the variant `t` with the source `s`:

- **No new digits:** the digit tokens of `t` must be a subset of those in `s`.
- **No new claim category:** for each `CLAIM_RULES` id, the rule may match `t` only if it also matches `s`. This also covers BOOKING and ALWAYS.
- **No new contact or targeting tokens:** none of URL, email, phone pattern, `@handle` or `#tag` unless present in `s`. Hashtags are always rejected in MVP.
- **No new relational links:** `relationalIssues(t, envA)` minus `relationalIssues(s, envA)` must be empty. This covers possessive, offering and location composition.
- **Bounded lexical novelty:** stemmed content words (≥4 chars, not STOP) in `t` that are absent from `s`, the business words and a small per-language channel allowlist (e.g. "descubre, hoy, mira, aquí, discover, today, here") may number at most `max(4, 20% of t's content words)`.
- **Business name and city:** if absent from `s`, they must be absent from `t` (§31).
- **CTA preserved:** the final segment's content words overlap `source_cta` with `jaccard ≥ 0.3`, or the CTA appears verbatim.

There is no embedding or LLM-judge comparison. It is not justified for an MVP, and the deterministic rules are auditable.

## 19. User Editing Policy

- Edits are saved explicitly (§34). The last generated variant is kept (`*_generated`) so "Restaurar" works.
- **User-authored text is the user's responsibility. LocalSEOHub does not block it.**
- A lightweight, non-blocking **review notice** is computed client-side with the same deterministic detectors (new digits, price/offer/claim words, URL/phone) on `*_text` versus `source`.
  - Example copy: "Has añadido datos como precios o cifras. Revísalos antes de publicar."
  - It is a warning only.
- Before A3.7.4 publishing, the same notice appears on the review step. Server-side, A3.7.4 only re-validates bounds and Unicode, not claims.
- Rationale: a non-paternalistic policy. The AI never introduces unsupported facts, and the owner may state real facts the system does not know.

## 20. Recommended Editor Data Model

**Options compared:**

| Model | Pros | Cons |
|---|---|---|
| Columns on `publications` | No new table | Collides with frozen CHECKs and trigger; mixes engine and editor concerns; widens frozen grants |
| JSONB on a new row | Flexible | Weak constraints; per-channel length and Unicode CHECKs harder; easy to smuggle fields |
| Child table per channel (publication × channel) | Matches future per-channel delivery | Selection would be duplicated per channel, or needs a third table; more RPC complexity now |
| **One 1:1 table `publication_drafts`** | Typed columns, simple CHECKs, one lock row, one version, no frozen collision | Adding a channel later means new columns (acceptable: Google is deferred) |

**Recommended: one table, `public.publication_drafts`**, PK `publication_id`:
- **Ownership:** `user_id`.
- **Source snapshot:** `source_generation_id`, `source_position`, `source_role`, `source_body`, `source_cta`, `lang`, `selected_at`.
- **Generated variants:** `facebook_generated`, `instagram_generated`, `adapted_at`, `adaptations_used`.
- **Adaptation claim:** `adaptation_claim_id`, `adaptation_claimed_at`.
- **Current text:** `facebook_text`, `instagram_text`.
- **Bookkeeping:** `version`, `created_at`, `updated_at`.

Per-channel publishing status belongs to A3.7.4, in a future `publication_deliveries (publication_id, channel, …)` table. That keeps editor state and delivery state apart.

## 21. State Model

`publications.status` stays `proposals_ready` and is unchanged.

The editor state is **derived** from `publication_drafts`. No status column is needed for MVP:

| Derived state | Condition |
|---|---|
| `selection_required` | no draft row |
| `adapting` | `adaptation_claim_id` set and under 3 minutes old |
| `drafts_ready` | `facebook_text` and `instagram_text` not null |
| `stale` | `source_generation_id ≠ publications.proposal_generation_id`. Defensive only, because the cleanup trigger (§45) deletes such rows. |

Readiness to publish is a **user action in A3.7.4**: the A3.7.4 `publication_deliveries` row appears when the user confirms. The states draft, ready, publishing, published and partial failure therefore live in A3.7.4's delivery rows, per channel. A3.7.3 adds no publishing states.

## 22. Regeneration

- **Change selected proposal:** allowed until publishing; free (no AI). It clears the channel texts after a confirmation dialog if edits exist.
- **Regenerate adaptation:** allowed, limited to **3 adaptations per proposal generation** (`adaptations_used ≤ 3`). The counter resets only when a new proposal generation replaces the row via the cleanup trigger. The overall bound is 3 × 4 generations × the monthly cap.
- **Restore generated text:** free and client-side; saved through the save RPC.
- **Reset after an adaptation failure:** the editor seeds from the selected proposal (deterministic, free).

## 23. Usage Accounting

| Option | Verdict |
|---|---|
| Consume `publication-proposals` cap (20) | Rejected: adaptations would eat photo generations |
| Free, per-publication cap only | Bounded only transitively; inconsistent with every other AI feature |
| **New ledger key `publication-adaptation`, own monthly cap, counted in global 80, plus per-generation cap of 3** | **Recommended** |

- **Proposed monthly cap:** 40. Calls are text-only and smaller, so this is about 2 adaptations per monthly proposal generation.
- **Reservations:** use `request_id`.
- **Settlement:** `completed` on success; `consumed` on billed failure (timeout or unsafe after paid calls, conservative as in A3.7.2); `released` on pre-provider failure or stale.

This needs a **new migration that redefines `ai_usage_cap`, `reserve_ai_usage`, `settle_ai_usage` (if it references columns) and `my_ai_usage`**, and widens the `ai_usage_reservations.function` CHECK and `ai_usage_monthly` (new `publication_adaptations_used`). This is the established pattern (a242, a243, a248, a342, a372 each did it). It is **condition C1**: a change-controlled redefinition of DB functions last defined in frozen a372, with regression tests proving every existing cap is unchanged.

## 24. Proposal Selection UX

- Three cards, labelled "Directa", "Cercana" and "Profesional" in ES and "Direct", "Friendly" and "Professional" in EN. Each shows the body and CTA.
- `role="radiogroup"`; one selected; primary button "Usar esta propuesta".
- When proposals already have a selection, the selected card shows "En uso".
- The user can return ("Cambiar propuesta") until publishing. If channel texts were edited, a confirm dialog says: "Se reemplazarán los textos editados de Facebook e Instagram."

## 25. Editor UX

**Recommendation: A, tabs Facebook | Instagram**, on every viewport.

- **Desktop (≥1024):** two-column layout. Left is a sticky image preview with the selected proposal collapsed under "Propuesta base". Right holds the tabs, textarea, counter and actions.
- **Tablet and mobile:** single column. Image thumbnail, then tabs, then a textarea with autosize, then a sticky action bar ("Guardar", "Continuar").
- **Rejected options:**
  - side-by-side: cramped, and mobile collapses it anyway;
  - sequential: hides the comparison and adds steps;
  - master and override: confusing provenance.
- **Per-tab actions:** "Restaurar" (only when edited) and "Adaptar de nuevo" (shows remaining count, inside an overflow menu: progressive disclosure).
- **Review step:** read-only preview of both channels, then "Continuar". In A3.7.3 this ends at a "Listo para publicar — próximamente" state. No publish button exists until A3.7.4.

## 26. Private Image Display

- Invariant 1 says "No signed or public URLs are used". The existing storage policy lets the owner SELECT their current image.
- **Recommendation:** an authenticated `supabase.storage.from('publication-images').download(image_path)` returns a Blob, shown with `URL.createObjectURL` and revoked on unmount. No bearer URL ever exists.
- Short-lived signed URLs would work, but they are shareable bearer links and would weaken invariant 1. Not recommended.
- The frozen test a371 forbids `.storage`/`createSignedUrl` in `repository.ts` and `types.ts`. The download must therefore live in a **new client module** (e.g. `src/features/publications/image.ts`), so the frozen test and files stay untouched.

## 27. Character Counters

- The platform caption limits (Facebook about 63k, Instagram 2,200) far exceed the engine bounds.
- **Recommendation:** a simple live character count, plus a warning (not a block) only for Instagram above 2,200, the one platform limit users can realistically hit.
- The server save bound is 2,200 per channel for MVP (DB CHECK). It is documented as an Instagram-compatible maximum, not an arbitrary LocalSEOHub limit.
- Facebook gets the count only.

## 28. Emoji Policy

- **None added by adaptation.** A variant may contain at most the number of emojis in the source (`MAX_EMOJIS 1` already bounds the source).
- Users may add any emojis manually.
- Not style-dependent in MVP.

## 29. Hashtag Policy

**Deferred.**
- Low MVP value for local businesses.
- Real risk of irrelevant or hallucinated tags and clutter.
- Would need its own grounding rules.
- The gate rejects `#tag` in adapted output.
- Users may type hashtags manually.
- A future option: at most 3 tags derived only from declared business category and city, Instagram only, opt-in.

## 30. CTA Policy

- The CTA is **merged into the body as the last paragraph or line** of each channel text. Platforms have no separate CTA field, so a separate edit box would add friction.
- Light rewording per channel is allowed, subject to the CTA-preservation rule (§18).
- No new contact mechanism ("DM", "link en bio", "llámanos", "WhatsApp") unless the source CTA contains it. This is enforced by the novelty and contact-token rules.
- `source_cta` remains in the snapshot for provenance and for A3.7.4.

## 31. Business Name / Location Policy

- **No reintroduction.** If the business name or city is absent from the source, it must be absent from the variants (deterministic check against `buildFacts`).
- If present in the source, the variant may keep or drop it.
- This avoids repetitive name-stuffing and preserves the location-composition protection.

## 32. Language

- `publication_drafts.lang` is copied from the proposal and **persisted explicitly** (CHECK `es|en`). The prompt is written in that language, and `matchesLang` is enforced on output.
- There is no translation. Changing language means generating new proposals in A3.7.2, which replaces the draft through the cleanup trigger.

## 33. Accessibility

- **Selection cards:** radiogroup with `aria-checked`; arrow-key navigation; visible focus ring; selection never shown by colour alone (check icon plus "Seleccionada" text).
- **Tabs:** WAI-ARIA `tablist`/`tab`/`tabpanel`, `aria-selected`, roving tabindex, arrow keys.
- **Textareas:** visible `<label>`; the counter is linked with `aria-describedby` and announced politely.
- **Status and errors:** save status and errors in an `aria-live="polite"` region; errors also linked to the field.
- **Dialogs:** confirmation dialog traps focus and returns it on close; Esc cancels.
- **Mobile:** touch targets ≥44 px; the sticky action bar does not hide the focused field (scroll-into-view); no hover-only actions.
- **Image:** the alt text is not AI-generated; generic: "Foto de la publicación".

## 34. Autosave

**Recommendation: manual "Guardar" plus an unsaved-changes guard.** The guard covers `beforeunload`, the tab switch (prompt to save) and in-app navigation.

- This follows the house precedent: weekly-content, improvement and prepared-replies all save explicitly with an `updated_at`/`version` guard.
- Debounced autosave adds races with selection changes and adaptation completion, plus many writes on mobile, for little gain on short captions.
- A local `sessionStorage` copy of unsaved text, keyed by publication and version, covers accidental reloads.

## 35. Concurrency

**Controls:**
1. **Double-click adapt:** the button is disabled in flight, a claim under 3 minutes returns `busy`, and a duplicate `request_id` is rejected by the ledger.
2. **Two tabs:** every write carries `p_expected_version`. A mismatch gives `SAVE_CONFLICT`, and the UI offers "Recargar" without silently overwriting.
3. **Selection change while adapting:** selection returns `busy` while the claim is active. Completion re-checks `source_generation_id` and `source_position` under `FOR UPDATE` and discards stale output (`STALE_SELECTION`, reservation `consumed`).
4. **Save while selection changes:** the version guard rejects the save.
5. **Stale drafts after regeneration or image change:** the AFTER trigger deletes the row (§45); every RPC also verifies `source_generation_id = publications.proposal_generation_id`.

## 36. Idempotency

- The client-generated `request_id` is the claim id and the ledger reservation id (same as A3.7.2).
- The same publication, selection and request id cannot create two adaptations.
- A new `request_id` while a claim is active returns `busy`.
- Completion is a single atomic update with `version + 1` that writes both channels. There are no duplicate rows by construction, since the PK is `publication_id`.

## 37. Error Taxonomy

The project uses uppercase server codes mapped to lowercase client `PublicationErrorCode`.

**Reused codes:** `INVALID_REQUEST`, `NOT_FOUND`, `DUPLICATE_REQUEST`, `AI_LIMIT_REACHED`, `AI_GLOBAL_LIMIT_REACHED`, `AI_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `INVALID_MODEL_OUTPUT`, `UNKNOWN_ERROR`.

**New codes (minimal):**

| Code | HTTP | Meaning |
|---|---|---|
| `PROPOSALS_REQUIRED` | 409 | publication not `proposals_ready` |
| `SELECTION_REQUIRED` | 409 | no draft row or snapshot |
| `STALE_SELECTION` | 409 | expected generation or position mismatch |
| `ADAPTATION_IN_PROGRESS` | 409 | active claim |
| `ADAPTATION_LIMIT_REACHED` | 429 | `adaptations_used = 3` |
| `ADAPTATION_UNSAFE` | 422 | gate failed after repair |
| `SAVE_CONFLICT` | 409 | version mismatch (RPC) |
| `TEXT_INVALID` | 400 | empty, too long or disallowed Unicode (RPC) |

**Requirement:** the client maps **every** code, closing the A3.7.2 non-blocker where four codes fell back to `unavailable`. No provider text is ever returned.

## 38. Meta Handoff

The existing Meta architecture, read-only:
- `meta_connections` holds `page_id`, `instagram_account_id`, `instagram_status`, `granted_permissions`, and the **user** token as a Vault reference `user_token_ref` (a351:51-59).
- Browser grants exclude `user_token_ref` and `meta_user_id` (a351:99-104).
- Page tokens are never stored; they are fetched fresh server-side (`meta-read/handler.ts:279-284`).

A3.7.3 hands over only:
- the publication id and owner;
- `image_path`;
- the final `facebook_text` and `instagram_text`;
- `lang`;
- the provenance snapshot.

A3.7.3 stores **no** token, Page id or Instagram id. A3.7.4 resolves these server-side from `meta_connections`.

## 39. Meta Permissions Non-Scope

- Requested scopes today: `pages_show_list, pages_read_engagement, business_management, instagram_basic` (meta-oauth-start/handler.ts:9).
- Publishing scopes are **absent** from the repository.
- Which publishing permissions are needed, and Meta App Review, are A3.7.4 and external-approval concerns. A3.7.3 changes nothing in OAuth.

## 40. Google Non-Scope

- GBP posting is not designed.
- The editor may show a disabled "Google — Próximamente" chip at most. No data column, no workflow.

## 41. Legal / Privacy

- **Private draft editing needs no legal change in itself.** The texts are user content in the user's account.
- **Gap (condition C2):**
  - The privacy policy says business information is sent to OpenAI to generate texts (PrivacyPolicyPage.tsx:70-73, EN :328). It does not mention that **photos** are uploaded, stored in private storage and sent to an AI provider for analysis.
  - This disclosure must be added **before the customer Publications route is exposed** (A3.7.3.3).
  - The internal harness is already reachable by signed-in users (A3.7.2 non-blocker), so the gap also argues for gating it.
- **A3.7.4:** the policy states that the Meta connection "solo lee la información de tu negocio" (line ~182) and lists read-only data in section 3. Publishing will need updated Meta copy, terms covering user responsibility for published content, and Meta review materials. Not now.

## 42. Retention / Deletion

Reuse the existing truthful lifecycle; no new fixed periods.

- The draft row is deleted with the publication (FK `ON DELETE CASCADE`), with the user (`auth.users` CASCADE) and with the business (via `publications.business_id` CASCADE).
- It is removed automatically when proposals are regenerated or the image changes (cleanup trigger).
- **Abandoned drafts:** they persist until the user deletes the publication, as publications do today. They are bounded by `PUBLICATION_DRAFT_LIMIT = 20`.
- No automatic expiry is claimed.

## 43. Security

**Preserved:**
- JWT verification (`verify_jwt = true` for the new function);
- `requirePremium`;
- every server query filtered by the JWT user;
- the business taken from the publication row, never from the request;
- private images;
- server-side AI only;
- no service role, OpenAI key or Meta token in the browser.

**Request bodies:**
- Adaptation function: exactly `{publication_id, request_id, expected_generation_id, expected_position}`.
- Save RPC: `p_channel ∈ {facebook, instagram}`.

The source text is never accepted from the client.

**Arbitrary draft id access:** impossible. RLS plus RPC `user_id = auth.uid()` checks, and the PK is the publication id, which is itself owner-checked.

## 44. RLS

- **Browser:** SELECT only, owner policy `auth.uid() = user_id`. Explicit column grant: every column except the claim columns.
- **No browser INSERT, UPDATE or DELETE.** All writes go through RPCs, because selection must snapshot server-side, and a column-UPDATE design would need triggers for `version` and length. RPCs are clearer.
- `service_role`: SELECT, INSERT, UPDATE, DELETE for the Edge Function's claim and complete RPCs.
- **Four-policy rule:** one SELECT policy. INSERT, UPDATE and DELETE are deliberately ungranted, so with RLS enabled and no grant they fail closed with no policy needed (documented deny-by-default).

## 45. Proposed Database Migration

This is a design only, for A3.7.3.1 (data) and A3.7.3.2 (ledger).

**A3.7.3.1: the new table**

```sql
CREATE TABLE public.publication_drafts (
  publication_id uuid PRIMARY KEY REFERENCES public.publications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_generation_id uuid NOT NULL,
  source_position smallint NOT NULL,
  source_role text NOT NULL,
  source_body text NOT NULL,
  source_cta text NOT NULL,
  lang text NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  facebook_generated text, instagram_generated text,
  facebook_text text, instagram_text text,
  adapted_at timestamptz,
  adaptations_used smallint NOT NULL DEFAULT 0,
  adaptation_claim_id uuid, adaptation_claimed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_position, source_role) IN ((1,'direct'),(2,'close'),(3,'professional'))),
  CHECK (lang IN ('es','en')),
  CHECK (char_length(source_body) BETWEEN 1 AND 1000 AND char_length(source_cta) BETWEEN 1 AND 120),
  CHECK ((facebook_generated IS NULL) = (instagram_generated IS NULL) AND (facebook_generated IS NULL) = (adapted_at IS NULL)),
  CHECK (facebook_generated IS NULL OR char_length(facebook_generated) BETWEEN 1 AND 2200),
  CHECK (instagram_generated IS NULL OR char_length(instagram_generated) BETWEEN 1 AND 2200),
  CHECK (facebook_text IS NULL OR char_length(facebook_text) BETWEEN 1 AND 2200),
  CHECK (instagram_text IS NULL OR char_length(instagram_text) BETWEEN 1 AND 2200),
  CHECK (adaptations_used BETWEEN 0 AND 3),
  CHECK ((adaptation_claim_id IS NULL) = (adaptation_claimed_at IS NULL))
);
CREATE INDEX publication_drafts_user_id_idx ON public.publication_drafts (user_id);
ALTER TABLE public.publication_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT (publication_id, user_id, source_generation_id, source_position, source_role, source_body, source_cta,
  lang, selected_at, facebook_generated, instagram_generated, facebook_text, instagram_text, adapted_at,
  adaptations_used, version, created_at, updated_at) ON public.publication_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publication_drafts TO service_role;
CREATE POLICY "select_own_publication_drafts" ON public.publication_drafts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Cleanup without touching the frozen BEFORE trigger: runs after it.
CREATE FUNCTION public.publications_drop_stale_drafts() RETURNS trigger ... AS $$
BEGIN
  IF NEW.proposal_generation_id IS DISTINCT FROM OLD.proposal_generation_id THEN
    DELETE FROM public.publication_drafts WHERE publication_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER publications_drop_stale_drafts AFTER UPDATE OF proposal_generation_id, image_path ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.publications_drop_stale_drafts();
REVOKE EXECUTE ON FUNCTION public.publications_drop_stale_drafts() FROM PUBLIC, anon, authenticated;
```

**Notes:**
- The trigger needs `SECURITY DEFINER`, because the service-role completion or media replacement are the actors. It must use `SET search_path = public`.
- `AFTER UPDATE OF` must include `image_path`. The frozen BEFORE trigger changes `proposal_generation_id` inside the same update, but `UPDATE OF` matches only the target columns of the original statement.
- Unicode safety (control characters other than `\n` excluded) is enforced in the RPCs.
- **No change to `publications` or `publication_proposals`.**

**A3.7.3.2: ledger extension (C1)**
- Add `ai_usage_monthly.publication_adaptations_used`.
- Widen the `ai_usage_reservations.function` CHECK.
- `CREATE OR REPLACE ai_usage_cap` adding `'publication-adaptation' → 40`, all other values byte-identical.
- Update `reserve`/`settle`/`reconcile`/`my_ai_usage` for the new column, following the a372 pattern.

## 46. Proposed API / RPC Surface

| Operation | Path | Caller |
|---|---|---|
| Load publication, proposals, draft | client → Supabase SELECT (RLS) | browser |
| Show image | client → Storage `download` (owner policy) | browser |
| `select_publication_proposal(p_publication_id, p_position, p_expected_generation_id) → jsonb` | RPC, SECURITY DEFINER, `auth.uid()` | browser |
| `save_publication_channel_text(p_publication_id, p_channel, p_text, p_expected_version) → jsonb` | RPC, SECURITY DEFINER, `auth.uid()` | browser (also used for Restore) |
| Adapt (both channels) | Edge Function `publication-adaptations` | browser |
| `claim_publication_adaptation` / `release_…` / `complete_publication_adaptation` | RPC, service_role only | Edge Function |

That is three browser operations plus reads. There is no reset RPC (Restore is a save of `*_generated`) and no delete (cascade).

## 47. Proposed AI Response Contract

```json
{
  "name": "publication_channel_variants",
  "strict": true,
  "schema": {
    "type": "object", "additionalProperties": false,
    "required": ["facebook", "instagram"],
    "properties": {
      "facebook":  { "type": "object", "additionalProperties": false, "required": ["text"], "properties": { "text": { "type": "string" } } },
      "instagram": { "type": "object", "additionalProperties": false, "required": ["text"], "properties": { "text": { "type": "string" } } }
    }
  }
}
```

- Each `text` is the full channel post, with the CTA merged as the last paragraph or line.
- No hashtags, title, notes, markdown or extra fields.
- The parser rejects anything else.

## 48. Validation Contract

An adaptation succeeds only if all of these hold:
1. Strict JSON with both channels and exactly the schema fields.
2. Each text, after trim and whitespace normalization, is 40–2,200 characters and no more than about 1.6× the source length (prevents padding).
3. Unicode allowlist: no control characters except `\n`, no zero-width or bidi overrides, at most 2 consecutive blank lines.
4. No markdown syntax (`**`, `#`, `` ` ``, `[](...)`).
5. `matchesLang(text, lang)`.
6. Differential `safetyIssues` and `relationalIssues` are empty (§17).
7. Drift rules pass (§18).
8. D1 (not identical) passes. D2/D3 are attempted with one repair, as in §12.
9. No prompt leakage: no system-prompt phrases, "as an AI", or JSON or schema terms. Checked by a deterministic phrase list.
10. Emoji count ≤ source emoji count.

## 49. Test Strategy

The future tests, written in A3.7.3.1–3, not now, cover:

- **Selection and data:** selection snapshot; idempotent re-select; change-selection clears texts; stale generation; non-owner `NOT_FOUND`; cross-user SELECT denial (RLS); no browser write grants; proposal rows never updated.
- **Frozen-engine integrity:** frozen-copy hash equality; cleanup trigger on regeneration and on image replace; existing A3.7.2 suite unchanged.
- **Adaptation:** Facebook shape; Instagram shape; same-source preservation; new digit, price, offer, booking, contact, hashtag, @ and URL rejection; possessive, offering and location-composition differential; name or city reintroduction; novelty budget; CTA preservation; ES and EN; language mismatch; identical-variant repair; repair cap of 2 calls; invalid JSON; provider timeout, error and empty.
- **Concurrency and accounting:** double-click and duplicate `request_id`; busy claim; stale selection at completion; save version conflict; restore; regenerate limit 3; ledger reserve and settle per outcome; global cap.
- **Client and UI:** every error code mapped on the client; mobile editor state (tab persistence, unsaved guard); a11y roles in the markup; no `createSignedUrl`/`getPublicUrl`; no Graph calls anywhere in the new code.

## 50. Real E2E Plan (A3.7.3.4)

1. Use the existing real CASE 2B publication (`proposals_ready`, Gopik.Digital, `portatil.jpg`).
2. Select proposal 2.
3. Adapt and record the Facebook and Instagram texts, latency, ledger rows and `adaptations_used = 1`.
4. Inspect drift manually against the source.
5. Edit Instagram, save, reload, and confirm persistence and the "editado" state.
6. Restore.
7. Switch to proposal 3 and confirm the cleared texts and the confirm dialog.
8. Second tab: stale save gives `SAVE_CONFLICT`.
9. Confirm no Graph or Meta request in the network log and no Meta function logs.
10. Confirm the cap counters.

There is no publishing.

## 51. Performance

- **Evidence:** CASE 2B ran vision plus the writer in about 8.4 s end-to-end.
- **Estimate:** adaptation is one text-only call with a small input (about 1,000 characters plus instructions) and output (about 2 × 600 characters). It should be noticeably shorter than a writer call. This is a budget, not a promise: target p50 under 6 s; 20 s per-call timeout; 2 calls at most, so under 45 s worst case including DB.
- **UI:** a skeleton with "Adaptando para Facebook e Instagram…", and the deterministic fallback after failure.

## 52. Cost

- Model: `gpt-4o-mini`, unchanged.
- **Per adaptation:** about 700–1,000 input tokens (instructions plus source) and about 400–700 output tokens, times at most 2 calls.
- **Relative to one proposal generation:** that generation includes a vision call with a high-detail image (dominant input cost) plus 1–2 writer calls of up to 1,200 tokens. So an adaptation is roughly a **fraction (≈⅓ or less)** of a generation.
- The exact monetary cost needs current OpenAI pricing, verified externally. None is stated here.

## 53. Observability

**Log events** (`console.error` with stable JSON, as in A3.7.2):
- `adaptation_started`, `adaptation_completed`, `adaptation_failed`;
- `{code, stage: parse|gate|provider|persist, calls: 1|2, channel_count: 2, latency_bucket: <5s|5-10s|10-20s|>20s, repaired: bool, gate_rules: [rule ids]}`.

**Never logged:** post or source text, user edits, image bytes or paths, keys, tokens, signed URLs, prompts.

## 54. Customer-Facing Copy

| ES | EN |
|---|---|
| Elige una propuesta | Choose a proposal |
| Usar esta propuesta | Use this proposal |
| Cambiar propuesta | Change proposal |
| Adaptando para Facebook e Instagram… | Adapting for Facebook and Instagram… |
| Facebook · Instagram | Facebook · Instagram |
| Editar | Edit |
| Guardar · Guardado | Save · Saved |
| Restaurar texto sugerido | Restore suggested text |
| Adaptar de nuevo (quedan N) | Adapt again (N left) |
| Revisar | Review |
| Continuar | Continue |
| Publicar — próximamente | Publish — coming soon |
| Has añadido precios o cifras. Revísalos antes de publicar. | You added prices or figures. Please check them before publishing. |
| Este texto cambió en otra pestaña. Recarga para ver la última versión. | This text changed in another tab. Reload to see the latest version. |

There are no internal terms: no grounding, image role, generation id, repair or ledger.

## 55. Customer Route

- **Route:** `/herramientas/publicaciones`, alongside the existing nine `/herramientas/*` tools (App.tsx:191-200).
- **Tools card:**
  - a new `ToolId 'publications'` in `catalog.ts`;
  - `enabled: true` only when A3.7.3.3 ships (until then, either absent or `enabled: false`);
  - this requires deliberately updating `toolsHub.test.ts` pins (tool list, enabled ids) — condition C3.
- **Navigation:** **no sidebar item.**
  - The nav labels are pinned by test (`['Hoy','Plan','Herramientas','Resumen','Mi negocio','Fuentes','Facturación']`).
  - The mobile bottom bar is already at 7 items.
  - Publications is reached through Tools; a later Today-page shortcut is optional.
- **Sub-views** use one route with steps: list or new, then photo, proposals, editor, review. Each step is its own screen (single responsibility).

## 56. Internal Harness Lifecycle

**Recommendation: keep it temporarily for regression, gated by an admin allowlist in A3.7.3.1 or A3.7.3.3, and remove it in the A3.7.4 freeze.**

- **Gate:** server-verifiable, reusing the existing admin pattern used by `admin-stats`/AdminDashboard. Verify in A3.7.3.1.
- It is useful for A3.7.3.4 real E2E comparison.
- Today it is reachable by any signed-in user (A3.7.2 non-blocker), which matters more once photos become customer-facing.

## 57. Recommended A3.7.3 Phase Decomposition

1. **A3.7.3.1 — Selection & Draft Data Foundation:**
   - `publication_drafts` table, cleanup trigger, RLS;
   - `select_publication_proposal` and `save_publication_channel_text` RPCs;
   - client repository readers and writers;
   - harness admin gating.
   - **Gate:** RLS and cross-user tests, frozen-hash check, A3.7.2 suite unchanged.
2. **A3.7.3.2 — Safe Channel Adaptation Engine:**
   - `publication-adaptations` Edge Function;
   - frozen-module copies with hash test;
   - adaptation envelope, gate, prompt, schema;
   - claim and complete RPCs;
   - ledger extension (C1).
   - **Gate:** full unit matrix with mocked provider; no real AI.
3. **A3.7.3.3 — Editor UI & Customer Route:**
   - route, Tools card (C3), selection, tabs, review, image download;
   - a11y and error mapping;
   - privacy update (C2) shipped in the same phase, before the card is enabled.
   - **Gate:** UI tests and a manual review.
4. **A3.7.3.4 — Real E2E Validation & Freeze:** the §50 plan, plus manifest and freeze.

## 58. A3.7.4 Handoff Contract

A3.7.4 receives a publication where all of these hold:
- `publications.status = 'proposals_ready'`, owned by `auth.uid()`;
- `image_path` set and `image_normalized = true`;
- a `publication_drafts` row with `source_generation_id = publications.proposal_generation_id`;
- non-null `facebook_text` and/or `instagram_text`, plus `lang` and `version`.

The user chooses channels at A3.7.4 confirmation. A3.7.4 creates its own per-channel delivery rows that capture **the exact text and version** being published. It resolves `page_id`/`instagram_account_id` and tokens server-side from `meta_connections`/Vault. It never regenerates copy.

## 59. Explicit Non-Goals

None of these are in scope:
- a Hootsuite or Buffer clone;
- a social calendar or scheduler;
- a campaign manager;
- an inbox;
- an analytics suite;
- a hashtag generator;
- a bulk publisher;
- carousels or multi-image posts;
- video, Reels or Stories;
- GBP posting;
- revision history beyond generated and current;
- AI-judged semantic similarity;
- new Meta scopes.

## 60. Product Value Assessment

For a small-business owner, the path from one photo to three safe options to one tap to two channel-ready texts is valuable: it removes the blank page twice.

**Friction and mitigations:**
- **Too many steps:** adaptation runs automatically after "Usar esta propuesta", with no extra button.
- **Waiting:** a skeleton, and the deterministic fallback so the user is never blocked.
- **Fear of losing edits:** explicit save, an unsaved guard and Restore.
- **"Can I publish?":** a clear "Publicar — próximamente" until A3.7.4.

No scope expansion is recommended.

## 61. Risks

| Risk | Level | Mitigation |
|---|---|---|
| Adapted text drifts in meaning | Medium | Source-only prompt, differential safety, drift rules, one repair, fail closed |
| Conservative gate rejects good variants (false positives, e.g. "cuesta", "review") | Low–Medium | Differential check (rules matching the source too don't count), deterministic fallback to the proposal |
| Copies of frozen modules diverge | Low | SHA-256 equality test |
| Ledger redefinition regresses other features | Medium | C1: change-controlled migration, per-cap regression tests |
| Stale draft after regeneration | Low | AFTER trigger plus RPC checks |
| Photo processing not disclosed | Medium (legal) | C2 before the customer route |
| User adds false claims | Accepted | Non-blocking review notice; user responsibility |
| Harness exposed to all signed-in users | Low–Medium | Admin gating in A3.7.3.1 or 3 |

## 62. Blockers

**BLOCKER:** none.

**IMPORTANT NON-BLOCKER (pre-implementation conditions):**
- **C1:** extending the ledger for `publication-adaptation` redefines DB functions last defined in frozen a372. It must be done as a change-controlled migration with regression proving all existing caps unchanged, and documented in the A3.7.3.2 report.
- **C2:** the privacy policy must disclose photo upload, private storage and AI analysis of photos before the customer Publications route is enabled (A3.7.3.3).
- **C3:** adding the Tools card requires deliberate updates to `toolsHub.test.ts` pins. They are not A3.7.2-frozen, but they are pinned evidence from earlier phases.
- **C4:** safety reuse must use byte-identical copies plus a hash test. No edit to any frozen A3.7.2 file.

**OPTIONAL:** a Today-page shortcut to Publications; a `sessionStorage` unsaved-text backup.

**DEFERRED:** hashtags; style-dependent emojis; Google channel; revision history; per-channel delivery states (A3.7.4); Meta publishing permissions and legal copy (A3.7.4); harness removal (A3.7.4 freeze).

## 63. Full Test Suite

`npx vitest run`: **73 files, 2510 tests passed, 0 failed.** This matches the A3.7.2 freeze baseline.

## 64. TypeScript

`npx tsc --noEmit -p tsconfig.app.json`: **20 errors**, all the known legacy baseline. **0 new.**

## 65. Build

`npm run build`: **PASS** (built in about 12.8 s).

## 66. Files Inspected

**Freeze documents:**
- `auditoria-a2/A3_7_2_FREEZE_MANIFEST.md`
- `auditoria-a2/A3_7_2_4_…_FREEZE.md`

**Migrations:**
- `supabase/migrations/20261025152315_a371_publications_data_storage_foundation.sql`
- `supabase/migrations/20261025161526_a372_publication_proposals_engine.sql`
- `supabase/migrations/20261021191223_a351_meta_connection_foundation.sql`
- `supabase/migrations/20261022170333_a353_meta_read_layer.sql`

**Edge Functions:**
- `supabase/functions/publication-proposals/{handler,index,context,safety,relational,quality,prompts,normalize,entitlement}.ts`
- `supabase/functions/meta-oauth-start/handler.ts`
- `supabase/functions/meta-oauth-callback/handler.ts`
- `supabase/functions/meta-read/handler.ts`
- `supabase/functions/meta-connection/handler.ts`

**Client:**
- `src/features/publications/{types,repository}.ts`
- `src/features/publications/validation/PublicationsValidationPage.tsx`
- `src/features/tools/catalog.ts`
- `src/app-v2/layouts/AppShellV2.tsx`
- `src/App.tsx` (routes)
- `src/features/legal/PrivacyPolicyPage.tsx`
- `src/features/{weekly-content,improvement,prepared-replies}/repository.ts` (edit and concurrency precedents)

**Tests:**
- `src/features/publications/__tests__/a371PublicationsRepository.test.ts`
- `src/features/tools/__tests__/toolsHub.test.ts`

## 67. Recommended Next Step

Manuel and ChatGPT review this audit. If approved, they issue the A3.7.3.1 spec (Selection & Draft Data Foundation) incorporating conditions C1–C4 at their respective phases. Nothing is implemented until then.

---

## Decision Matrix

| Decision | Options | Recommendation | Why | Risk |
|---|---|---|---|---|
| Persistence model | Columns on publications / JSONB / per-channel child table / 1:1 table | **1:1 `publication_drafts`** | No collision with frozen CHECKs and trigger; typed CHECKs; one lock row | New columns if a channel is added later (deferred) |
| AI vs deterministic | A / B / C / D | **B (one AI call), deterministic gate and fallback** | Only AI yields real channel voice; gate keeps authority bounded | Gate false positives (fallback covers) |
| One call vs two | One for both / one per channel | **One** | Pair awareness for differentiation; half the cost and latency; one reservation | Larger single output (bounded by 900 tokens) |
| Editor UX | Tabs / side-by-side / sequential / master + override | **Tabs on all viewports** | Simple, mobile-native, comparable | Hidden other channel (one tap away) |
| Autosave | Manual / debounced | **Manual + unsaved guard + version guard** | House precedent; no races with selection or adaptation | Forgotten save (guard covers) |
| Hashtags | Include bounded / defer | **Defer; gate rejects `#`** | Low value, high noise and hallucination risk | Some users expect them (they can type them) |
| Regeneration | Unlimited / capped / none | **3 per proposal generation; selection change free** | Abuse-resistant, still flexible | Users hitting the cap (fallback and edit) |
| Safety validation | Modify frozen / copies + differential gate / none | **Byte-identical copies + adaptation envelope + differential + drift rules** | Zero frozen edits; stricter than A3.7.2 | Copy drift (hash test) |
| Customer route | Sidebar item / Tools card / Today | **`/herramientas/publicaciones` via Tools card; no sidebar** | Nav pinned and full; fits the tool model | Discoverability (optional Today shortcut later) |

## Blocker Classification

| Finding | Class |
|---|---|
| Frozen hashes intact; suite, tsc and build at baseline | — (pass) |
| Proposal rows deleted on regeneration or image change, so a snapshot is required | IMPORTANT NON-BLOCKER (designed in) |
| `publications.status` cannot be widened without frozen CHECK changes, so a new table is used | IMPORTANT NON-BLOCKER (designed in) |
| Grounding envelope not persisted, so an adaptation envelope plus differential gate is used | IMPORTANT NON-BLOCKER (designed in) |
| C1 ledger redefinition | IMPORTANT NON-BLOCKER (condition) |
| C2 privacy disclosure of photos | IMPORTANT NON-BLOCKER (condition, before customer route) |
| C3 Tools test pins | IMPORTANT NON-BLOCKER (condition) |
| C4 copies, not edits, of frozen validators | IMPORTANT NON-BLOCKER (condition) |
| Harness admin gating | IMPORTANT NON-BLOCKER |
| Today shortcut, `sessionStorage` backup | OPTIONAL |
| Hashtags, emoji styles, Google, history, publishing states, Meta permissions and legal | DEFERRED |

## 68. Final Verdict

**CONDITIONAL GO — A3.7.3 IS FEASIBLE WITH IDENTIFIED PRE-IMPLEMENTATION CONDITIONS**

The conditions:
- **C1:** change-controlled ledger extension, in A3.7.3.2.
- **C2:** privacy disclosure of photo upload and AI analysis, before the customer route in A3.7.3.3.
- **C3:** deliberate Tools-catalog test pin updates, in A3.7.3.3.
- **C4:** reuse frozen validators only via byte-identical, hash-tested copies, in A3.7.3.2.

STOP. A3.7.3.1 is not started. Awaiting review by Manuel and ChatGPT.
