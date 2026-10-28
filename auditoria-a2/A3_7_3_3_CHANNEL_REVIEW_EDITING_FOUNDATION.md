# A3.7.3.3 — Channel Review, Safe Editing & Final Draft Foundation

## 1. Verdict

**GO — FINAL FREEZE A3.7.3.3 AFTER MIGRATION RECONCILIATION**

(This supersedes the earlier verdict "GO — FREEZE A3.7.3.3 CHANNEL REVIEW & EDITING FOUNDATION". That verdict rested on a false claim that the two A3.7.3.3 migrations are identical. See §23.)

The pipeline now ends at FINAL DRAFT READY: photo → 3 proposals → selection → Facebook and Instagram adaptations → human review and edit → saved final draft. Nothing is published.

## 2. Scope

In scope and delivered:
- Load the selected proposal's frozen A3.7.3.2 adaptations.
- Edit the Facebook and Instagram texts, validate them, and save them atomically through a narrow server function.
- Restore either channel to its generated text.
- Edited/generated badges, "current / max" counters, unsaved/saved state, readiness.
- Stale-draft and cross-tenant protection.
- An internal harness panel only.

Out of scope and not touched: Meta or Google publishing, Graph writes, scopes, OAuth, App Review, scheduling, stories, reels, carousel, analytics, inbox, the customer-facing Publications module, AI regeneration, any OpenAI call, subscription and Premium.

No blocker required leaving scope.

## 3. Frozen baseline

These were recomputed before and after this phase and all match (§19):
- A3.7.1 storage.
- A3.7.2.
- A3.7.3.1 (migration, drafts types and repository, test).
- A3.7.3.2: migration, 9 edge files, 4 client files, 3 tests.
- A3.5 Meta, Hoy, Plan, billing, auth, GBP and tool-limit suites, all green.

No frozen production file was modified. The only shared production file changed is `src/App.tsx`: one lazy import and one mount on the existing hidden `/internal/publications-validation` route. The route count stays at 34.

## 4. Data model

There is no new table and no new column. The frozen `publication_drafts` table is reused:
- The generated columns `facebook_generated` and `instagram_generated` are the AI output.
- The final columns `facebook_text` and `instagram_text` are the human texts.
- `version` drives optimistic concurrency.

The table's existing CHECK constraints (FB 1–5000, IG 1–2200) remain the last line of defence.

The migration adds only two functions:
- `publication_channel_text_issue(text, integer)`: internal, not executable by any client role.
- `save_publication_channel_drafts(uuid, integer, text, text, boolean, boolean)`: executable by authenticated only.

## 5. Generated vs edited separation

- The only UPDATE in the save path assigns exactly `facebook_text`, `instagram_text`, `version` and `updated_at`. A test asserts this column list.
- The generated columns appear only as read sources, for restore and for the response.
- `authenticated` still has no table write grants, so the browser cannot reach the generated columns at all.
- "Edited" is derived on the client as normalized-and-trimmed final ≠ generated. It is never stored.

## 6. Server write architecture

`save_publication_channel_drafts` is SECURITY DEFINER with `search_path = public` and takes the caller from `auth.uid()`. Its steps, in order:

1. No session → `unauthenticated`.
2. The payload is validated → `invalid_payload`. This covers null IDs, version < 1, restore together with text for the same channel, and a request with no change.
3. Either field over 32 KB → `payload_too_large`.
4. The publication is locked `FOR UPDATE` and scoped to `user_id = auth.uid()` → `not_found`.
5. The business must be owned by the caller → `forbidden`.
6. The publication must be `proposals_ready` with a generation → `not_ready`.
7. The draft is locked `FOR UPDATE`, scoped to the user and the business → `not_found`.
8. The draft's `source_generation_id` must equal the current generation → `stale_draft`.
9. The adaptations must exist → `not_ready`.
10. An active adaptation claim (under 3 minutes old) → `busy`. This means a paid adaptation is never invalidated.
11. The version must match the expected version → `stale_draft`.
12. Each text is normalized (CRLF → LF) and validated → `invalid_facebook_text` / `invalid_instagram_text` with a `reason`.
13. If nothing changed → `unchanged`. Otherwise a single UPDATE guarded by `AND version = p_expected_version` raises the version by 1 → `saved`, returning the authoritative draft.

The browser sends six arguments only. It never sends user_id or business_id.

## 7. Ownership / security

- Owner only.
- A non-owner receives `not_found`, the same answer as for a missing row, so there is no existence oracle.
- Adversarial check (verified live in a rolled-back DB block, and in tests): user A, knowing user B's publication_id, business_id and version, gets `not_found` and writes nothing.
- `anon` cannot execute the function (`has_function_privilege` = false). The text helper is not executable by `authenticated`.
- Error copy contains no SQL, codes or secrets, and the panel never renders `error.message`.

## 8. Concurrency

- The expected version is checked under row locks.
- The UPDATE also carries a `version =` predicate as a second guard.
- A mismatch returns `STALE_DRAFT` with the message: "Este borrador ha cambiado desde que lo abriste. Recarga la versión más reciente antes de guardar."
- The panel keeps the user's local text and offers "Recargar". There is no auto-merge.

## 9. Character validation

| Rule | Client (`model.ts`) | Server |
|---|---|---|
| Limits | FB 5000 / IG 2200 | Same |
| Counting | Code points, so an emoji counts as one | `char_length` |
| Empty | Empty or whitespace-only rejected | Same |
| Control characters | Rejected, except tab and newline | Same |
| Bidi overrides | Rejected | Same |
| Markup | Rule `<[/!]?[A-Za-z]`: `<` directly followed by a letter, or by `/` or `!` and then a letter | Same |

- Over-limit text blocks the save, explains why, and keeps the local text. Nothing is ever truncated.
- Allowed by design: prices, offers, hours, addresses, phones, URLs, dates, promotions, emoji, and "a < b".
- Also allowed under the final rule: `<!-- x -->` (no letter after `<!`) and `< script>` (space after `<`). Neither is a working tag, the texts are never rendered as HTML (React text nodes only), and nothing is published, so this is accepted rather than treated as a defect.

## 10. Restore

- "Restaurar versión generada" sends only `p_restore_<channel> = true`. The server copies the generated text into the final column through the same locked, version-checked path, with version +1.
- No AI is involved.
- The user is asked to confirm only when that channel has unsaved edits.
- The other channel's saved text and local edits are preserved.

## 11. Dirty / save state

- Dirty means the local text differs from the last server-acknowledged text (CRLF-normalized).
- The status shows "Cambios sin guardar" or "Guardado". "✓ Borradores guardados" plus the per-channel state appear only after the server returns `saved` or `unchanged`.
- A `beforeunload` warning is active while there are unsaved changes, with no routing changes. Reloading with unsaved changes also asks for confirmation.

## 12. Readiness

- The value is `ready` or `not_ready` only. There is no published, scheduled or posted state anywhere.
- READY requires: a draft exists, its source generation equals the publication's current generation, both texts are valid, and the draft was loaded through the owner-scoped read.
- A stale draft fails at the server.
- Copy shown: "Estado: Borrador listo", or "Listo para revisar" while there are unsaved edits, plus "No se ha publicado nada todavía."

## 13. AI non-usage proof

- The client does not call `functions.invoke`, `fetch`, OpenAI or `/functions/v1` (test 19–20).
- The SQL makes no `http`, `pg_net` or OpenAI calls, and does not reference `ai_usage_monthly`, `ai_usage_reservations` or any `*_used` counter (tests 21–23).
- Live check after verification:
  - The real draft is still at version 2, with `adaptations_used` = 1.
  - `publication_adaptations_used` totals 1 and `publication_proposals_used` totals 11.
  - There are 17 reservations, all unchanged by the save and restore checks.

## 14. Meta non-publishing proof

- There is no Graph host, token, `meta_connections`, appsecret or vault reference in the new code (test 28).
- There is no `/feed`, `/photos`, `/media` or `/media_publish` and no publish function (test 29). The deployed edge functions are the same 41, none of them new.
- There is no "Publicar" button or string.
- The Meta OAuth, meta-read and Social Intelligence suites pass unchanged.

## 15. Tests

The new file is `src/features/publications/__tests__/a3733ChannelReview.test.ts`, with 39 tests covering all 30 required items plus extras: business-detail allow-list, error-copy leak check, folder independence, and 7 migration-history checks (§23). The original single check, "the first apply and the corrected re-apply define identical SQL", was historically false and has been removed.

The full suite passes: **78 files, 2688 tests, 0 failures**. That is the earlier 2682, minus the removed check, plus the 7 reconciliation checks.

Test re-pins (bookkeeping only, separate from production):
- App.tsx hash → `c8e503d2…`: a281TrustCleanup:132, a273Roadmap:72, a272TodayIntelligence:43, a3544SocialIntegration:306.
- Migration count 53 → 55: a281:157, a33DiagnosticAction:138, f03Stage2b:229/283, a273:354, a272:131.
- `_a3733_` exclusion added: a273:355, a272:133, a3542SocialFindings:580.
- md5 of a3542SocialFindings re-pinned in a3543SocialIntelligenceUi:270 → `ed9f9804…`.

## 16. TypeScript

`npx tsc --noEmit -p tsconfig.app.json` reports 20 errors, equal to the inherited baseline, with 0 new errors.

Correction: the original A3.7.3.3 run actually produced 21 errors. One was new, in `a3733ChannelReview.test.ts` (test 17 passed an extra `facebookText` field that the save function's input type does not accept). The earlier report missed it. It was fixed during reconciliation, and the change is test-only.

## 17. Build

`npm run build`: PASS. The review panel is a separate lazy chunk.

Dist greps:
- No service-role key, Stripe secret or OpenAI key.
- No `media_publish`.
- The only new RPC name present is `save_publication_channel_drafts`.

## 18. Files

New files:
- `supabase/migrations/20261027233057_a3733_publication_channel_review_editing.sql`: the original definition, with the broad markup rule.
- `supabase/migrations/20261027233150_a3733_publication_channel_review_editing.sql`: the corrective migration, which carries the narrow markup rule and is the final state. The two files are NOT identical (§23).
- `src/features/channel-review/types.ts`, `model.ts`, `repository.ts`, `copy.ts`, `ChannelReviewPanel.tsx`.
- `src/features/publications/__tests__/a3733ChannelReview.test.ts`.

Modified production file: `src/App.tsx` (one import and one mount).

Modified test files: the re-pins listed in §15.

## 19. Fingerprints (sha256)

| File | sha256 |
|---|---|
| migration …233057 (restored to as-applied) | `1b63b7b86642dcfbd61e5fcc896df24417b44a0de9d6026f0e5c73b2f82bbc60` |
| migration …233150 | `b2d7f4559636e70d8dc54a296dbf4ff656f95239b16427dbc34e3ff92e7258af` |
| ChannelReviewPanel.tsx | `030eb506c7ae546d93332bcf3fc2f117b417c93c1a040d55b3e83b7ee6f75007` |
| copy.ts | `42c4b0e6608f7b6d5616de537e8c7ac5deb098564a69ec0ca08fd872477e3286` |
| model.ts | `1045d50d7a8fcb0e7f8778fb4f1963d6e56ab57b62fd225eb0a81b5d9d03c287` |
| repository.ts | `6c3371d9e811e4889172b038d8ecd9aa6aeccb5b7dc2018f51a439b54f7c3885` |
| types.ts | `37c388de2612c42af6c393c198dd8ea56f2bca5adbb1f6c0352334647d677649` |
| src/App.tsx | `c8e503d2a1cb4c1947a337b238c0ef078277f2c9cc313919aa50ff820f3c7210` |
| a3733ChannelReview.test.ts | `11716a568dacf5283706395ea5fac1f7c8e0e35a424de3a01e9f9074097f9dcf` |

Frozen baselines that were verified as unchanged:

| Baseline | Prefixes |
|---|---|
| A3.7.3.2 migration | 04e4d0af14d2 |
| A3.7.3.2 edge files | b2d277d3a9bb, 0737fde722c8, f948d629f540, f213b671ac37, 4f1db457b20c, fa0f12316858, 158f3fd7d3a7, 489d7fd8c883, ac0efae62dfb |
| A3.7.3.2 client files | f3d7f22da5cf, aa04e4767103, d4a46bd50d65, 2a46a61f1818 |
| A3.7.3.2 tests | 4fc044f42cc4, a37a501fccc5, a4887a5924e6 |
| A3.7.3.1 | e441f2fb, db175c4e, 299bc8b3, 38e88e4f |

The A3.7.1 storage combined hash (publication-media + migrations, excluding `_a3731_`, `_a3732_` and `_a3733_`) is `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973`, unchanged.

## 20. Limitations

- Whitespace-only text made of non-ASCII spaces (for example NBSP) is blocked by the client but would pass the server's `btrim` rule. This is cosmetic and cannot cause a publish.
- Two migration records exist: an original definition and a corrective one. They differ in the markup rule (§23).
- Premium decision: editing and saving requires an authenticated owner only, with no Premium gate. This follows the frozen `select_publication_proposal` precedent, the action involves no AI or cost, and the harness sits behind AppGuard. Premium logic was not changed, and there is no email hardcode or bypass.
- The panel UI was verified by code review and build only. No browser was available in this environment.

## 21. Manual E2E (reuse the existing real draft, version 2; no AI calls)

1. Sign in as the owner and open `/internal/publications-validation`.
2. In "Paso 4", press "Cargar borrador". Both texts are shown with the "Versión generada" badge and "Versión: 2".
3. Edit the Facebook text, for example by adding "Hoy 2x1 hasta las 14:00".
4. Check that the badge changes to "Editado por ti", the counter updates, and the status shows "Cambios sin guardar".
5. Edit the Instagram text.
6. Paste more than 2200 characters into Instagram. The counter turns red, a reason is shown and saving is blocked. Undo the paste.
7. Press "Guardar borradores". "✓ Borradores guardados" appears, both channels show "Editado por ti", "Estado: Borrador listo" and "Versión: 3".
8. Refresh the page and load again. Both edits persist.
9. Check in the database that `facebook_generated` and `instagram_generated` are unchanged.
10. Press "Restaurar versión generada" on Facebook. No confirmation is needed because there are no unsaved edits.
11. Facebook returns to "Versión generada" and the version becomes 4.
12. Instagram still shows your edit.
13. Refresh and load again. Facebook equals generated and Instagram is still edited.
14. Edit Instagram without saving, then try to reload. A confirmation appears.
15. In a second tab, save a change. Back in the first tab, save again. The STALE_DRAFT message appears and your text is kept.
16. Press "Recargar" to get the latest version.
17. Check in the database that the version rose with each save (2 → 3 → 4 → 5).
18. Check that `ai_usage_monthly`, `ai_usage_reservations` and `adaptations_used` are unchanged.
19. Confirm that there is no "Publicar" button, that "No se ha publicado nada todavía." is shown, and that nothing appears on Facebook or Instagram.

## 22. Next-phase recommendation

Recommended next phase: **A3.7.4**, the publishing step, which takes a READY final draft and sends it to Meta. It needs new scopes, App Review and Graph write calls, so it requires separate authorization.

A3.7.4 has NOT been started.

## 23. POST-AUDIT MIGRATION RECONCILIATION

### 23.1 Finding confirmed

The external audit was correct. The two A3.7.3.3 migration files in the exported ZIP were not byte-identical. The claim in §15, §18 and §20 that they were "SQL-identical" was false as a statement about migration history.

### 23.2 SHA-256 values

| File | As exported (before reconciliation) | Now (final) |
|---|---|---|
| …233057 | `f64ce503d2b91357867f7fc87a2af466ccfe9a8fb7b07da253cd529d6e4e32c5` | `1b63b7b86642dcfbd61e5fcc896df24417b44a0de9d6026f0e5c73b2f82bbc60` |
| …233150 | `b2d7f4559636e70d8dc54a296dbf4ff656f95239b16427dbc34e3ff92e7258af` | `b2d7f4559636e70d8dc54a296dbf4ff656f95239b16427dbc34e3ff92e7258af` (unchanged) |

### 23.3 What differed in the exported ZIP

In the exported files, only the header comment differed:
- Item 6 of migration 2 adds "The text helper is not callable by any client role."
- Item 7 adds the clarification "(`<` directly followed by a letter, `/` or `!`)".

The executable SQL from the first `CREATE OR REPLACE FUNCTION` onward was the same in both files. That is why the old test passed: it compared only that part.

### 23.4 What actually ran: the real semantic difference

The history table `supabase_migrations.schema_migrations` stores the statements that were really executed. It shows a different picture from the exported files:

| Run | Markup rule actually executed |
|---|---|
| 20261027233057 | `<\s*/?\s*[A-Za-z!]` (broad) |
| 20261027233150 | `<[/!]?[A-Za-z]` (narrow) |

With whitespace ignored and that one rule swapped, the two recorded runs are equal. The only semantic difference is the markup rule.

Under the broad rule, `a < b`, `< script>` and `<!-- x -->` count as markup, so harmless text such as "a < b" would be rejected. The narrow rule accepts those three. It still rejects `<script>`, `</b>`, `<img …>` and `<!DOCTYPE …>`.

### 23.5 Root cause

The broad rule was applied first. The narrow rule was then applied again under a second timestamp. Afterwards, the local file for the first migration was overwritten with the narrow rule. From then on, the repository file no longer reproduced what had actually run. That is how the false "identical" claim, and the test that appeared to confirm it, came about.

The historical explanation in the brief is therefore confirmed by the database history.

### 23.6 Repository correction

The one markup line in `…233057` was restored to the rule that actually ran. No other change was made to that file, and no file was deleted or renamed.

It was verified in the history table's own encoding:

| File | Hash of its executable part (whitespace-free) | Recorded run |
|---|---|---|
| …233057 | `b4c84cd14a7b05affe82be57b0647a02` | Equal to the recorded `20261027233057` run |
| …233150 | `1b1c625796d20c5f3c36f78bece121f5` | Equal to the recorded `20261027233150` run |

The header comments also equal the recorded headers (`4ff1982d…` and `2c57d358…`). Both files now reproduce migration history exactly.

### 23.7 Current production definition

- `publication_channel_text_issue`:
  - Uses the rule `p_text ~ '<[/!]?[A-Za-z]'`.
  - Is not SECURITY DEFINER.
  - Has `search_path=public`.
  - Access list `{postgres, service_role}`: not executable by anon or authenticated.
  - Its whitespace-free body hash is `47f5e1fe…`, equal to migration 2.
- `save_publication_channel_drafts`:
  - Is SECURITY DEFINER.
  - Has `search_path=public`.
  - Access list `{postgres, service_role, authenticated}`: no PUBLIC, no anon.
  - Its body hash is `bc446620…`, equal to migration 2. Migration 1 has the same save body.

Live behaviour of the helper:

| Input | Result |
|---|---|
| Whitespace only | `empty` |
| Empty | `empty` |
| FB 5000 / 5001 characters | ok / `too_long` |
| IG 2200 / 2201 characters | ok / `too_long` |
| BEL control character | `control_chars` |
| Tab and newline | ok |
| U+202E bidi override | `control_chars` |
| `<script>…` | `markup` |
| `x </b>` | `markup` |
| `a < b` | ok |
| `Menos de <10€ hoy` | ok |
| Emoji | ok |

### 23.8 Clean replay result

A fresh database replaying the migrations in timestamp order ends in the correct final state:

1. `…233057` creates both functions (helper with the broad rule), revokes everything from PUBLIC, anon and authenticated, and grants execute on the save function to authenticated.
2. `…233150` runs `CREATE OR REPLACE` on both functions with the same signatures and return types, and re-runs the same revoke and grant.

The final state is fully defined by migration 2 and does not depend on migration 1. A test checks that both files declare exactly the same five objects, functions and grants, and that the save path is identical in both.

The final state:
- Narrow markup rule.
- SECURITY DEFINER with a fixed search_path.
- `auth.uid()` ownership and the publication/business/draft ownership checks.
- The UPDATE writes only `facebook_text`, `instagram_text`, `version` and `updated_at`, so the generated texts cannot change.
- Stale-draft protection through the generation check, the version check and the `version =` guard on the UPDATE.
- `not_found` for other tenants.
- Grants exactly as listed in §23.7.

The replay was proven by structural comparison of the declared objects, by hash equality of the executed bodies, and by the behavioural checks above. It was not proven by spinning up a separate empty database, which this environment does not offer.

### 23.9 Corrected test invariant

The check "the first apply and the corrected re-apply define identical SQL" was removed. It is replaced by 7 checks:

1. Both migration records are present, in replay order.
2. The original records the broad rule that actually ran first, and that rule flags "a < b".
3. The corrective migration carries the narrow rule, and the client uses the same rule.
4. Both migrations declare the same five objects, functions and grants. The save function is SECURITY DEFINER with a fixed search_path, so replay ends on migration 2.
5. Apart from the markup rule, the executable SQL of the two migrations is identical. The save path never differed.
6. The final rule allows "a < b", prices and "3<4". It rejects `<script>`, `</b>`, `<img>` and `<!DOCTYPE>`. The client and server agree on each sample.
7. The final helper keeps the empty, too_long, control-character and bidi rules, and the 5000/2200 limits.

### 23.10 Production database change

There was no production database change. No third migration was created. No function, grant, table or row was modified. Only one line of the local `…233057` file, `a3733ChannelReview.test.ts`, and this report were changed.

After reconciliation:
- Full suite: 2688 passed, 0 failed.
- Code checker: 20 errors (inherited), 0 new.
- Build: PASS.
- The A3.7.1 storage hash `1e7aa872…` is unchanged.
- The frozen A3.7.3.2, A3.7.3.1 and A3.7.2 fingerprints are unchanged.
- The channel-review client files are unchanged (hashes in §19).

The freeze manifest is `A3_7_3_3_FREEZE_MANIFEST.md`.
