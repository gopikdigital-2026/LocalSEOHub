# A3.7.3.1 — PUBLICATIONS MVP
# PROPOSAL SELECTION & CHANNEL DRAFT DATA FOUNDATION

Authorized by: Manuel + ChatGPT, after approval of A3.7.3.0 (CONDITIONAL GO, conditions C1–C4).
Scope: data foundation only. No AI, no ledger, no privacy, no Tools/catalog/sidebar, no Meta/Google, no customer UI, no frozen file changes.

---

## 1. Executive summary
A new 1:1 table `publication_drafts` stores a server-side snapshot of the proposal the owner selects. The only write path is the SECURITY DEFINER RPC `select_publication_proposal(p_publication_id, p_position, p_expected_generation_id)`. A new AFTER UPDATE trigger on `publications` deletes the draft when the proposal generation or the photo changes, and the draft cascades when the publication is deleted. A typed client module reads drafts and requests selections. 33/33 database behaviour checks passed (rolled back, isolated data), and 36 new vitest tests pass. The full suite passes 2546/2546; tsc has 20 errors (baseline 20, 0 new); the build passes. All 28 frozen A3.7.2 hashes are unchanged.

## 2. Authorization and condition status
- A3.7.3.0 verdict: CONDITIONAL GO.
- C1 (ledger), deferred to A3.7.3.2: not touched.
- C2 (privacy), pending for A3.7.3.3: not touched.
- C3 (Tools/catalog/sidebar), pending: not touched.
- C4 (copying the safety modules), deferred to A3.7.3.2: not touched.

## 3. Pre-implementation freeze verification
- Manifest `auditoria-a2/A3_7_2_FREEZE_MANIFEST.md` read: 28 hash entries.
- `sha256sum -c`: 28/28 OK.
- Storage fingerprint (`find supabase/functions/publication-media supabase/migrations -type f | sort | xargs sha256sum | sha256sum`) = `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973`, which matches the manifest.
- Deploy state: `"hasChanged": true` count = 0. publication-media `1c9e7886…3005`, publication-proposals `eae70ea4…5a49`, both `hasChanged: false`.

## 4. Files created
| File | SHA-256 |
|---|---|
| supabase/migrations/20261027162344_a3731_publication_drafts_selection_foundation.sql | e441f2fb57fd454446a7eaf254c0be60adfa1f40876dd2cedf082de1a8dce15d |
| src/features/publications/drafts/types.ts | db175c4efc1e5375cf34795267029cabaab2baf050dfb3a8ed256c21907488bf |
| src/features/publications/drafts/repository.ts | 299bc8b3e1fc97ec3e0791ce4d433a6f88de5a8379f372ff1ec23a983a76bbb1 |
| src/features/publications/__tests__/a3731SelectionFoundation.test.ts | (new test file) |
| auditoria-a2/A3_7_3_1_PROPOSAL_SELECTION_CHANNEL_DRAFT_DATA_FOUNDATION.md | (this report) |

## 5. Files modified (non-frozen preservation guards only)
These are migration-count and last-migration guards that earlier phases (A3.7.1, A3.7.2) re-pinned the same way. None of them is in the freeze manifest.
- src/components/__tests__/a281TrustCleanup.test.ts: count 51 → 52.
- src/features/action-layer/__tests__/a33DiagnosticAction.test.ts: count 51 → 52.
- src/features/email-verification/__tests__/f03Stage2b.test.ts: count 51 → 52 (two assertions).
- src/features/roadmap/__tests__/a273Roadmap.test.ts: count 51 → 52, plus `_a3731_` added to the last-three exclusion.
- src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts: count 51 → 52, plus `_a3731_` exclusion.
- src/features/social-intelligence/findings/__tests__/a3542SocialFindings.test.ts: `_a3731_` exclusion in test 39.
- src/features/social-intelligence/ui/__tests__/a3543SocialIntelligenceUi.test.ts: content-hash re-pin of the a3542 test file (`04220f34…` → `a6ff85be…`), annotated "A3.7.3.1 GUARD RE-PIN". No Social source file changed.

## 6. Frozen files: confirmation
No frozen file was modified. Specifically untouched: a371 and a372 migrations, `publication-proposals/*`, `publication-media/*`, `src/features/publications/repository.ts`, `src/features/publications/types.ts`, the frozen publications tests, `catalog.ts`, `toolsHub.test.ts`, `AppShellV2.tsx`, `PrivacyPolicyPage.tsx`.

## 7. Migration strategy
One new migration, applied through the migration tool (filename `a3731_publication_drafts_selection_foundation`), recorded locally as `20261027162344_…`. It is purely additive: no ALTER on `publications`, no DROP of tables, columns or functions, and no changes to existing data.

## 8. Table `publication_drafts`: columns
| Column | Type | Notes |
|---|---|---|
| publication_id | uuid PK | FK publications(id) ON DELETE CASCADE; enforces 1:1 |
| user_id | uuid NOT NULL | FK auth.users ON DELETE CASCADE; copied from publication by server |
| business_id | uuid NOT NULL | FK businesses ON DELETE CASCADE; copied from publication by server |
| source_generation_id | uuid NOT NULL | generation of the snapshotted proposal |
| source_position | smallint NOT NULL | 1..3 |
| source_role | text NOT NULL | direct/close/professional, paired with position |
| source_lang | text NOT NULL | es/en |
| source_body | text NOT NULL | 1..1000 chars |
| source_cta | text NOT NULL | 1..120 chars |
| selected_at | timestamptz NOT NULL | refreshed on changed selection |
| facebook_generated, facebook_text | text NULL | reserved; ≤5000; always NULL in A3.7.3.1 |
| instagram_generated, instagram_text | text NULL | reserved; ≤2200; always NULL in A3.7.3.1 |
| adapted_at | timestamptz NULL | reserved |
| version | integer NOT NULL DEFAULT 1 | ≥1, optimistic concurrency |
| adaptation_claim_id, adaptation_claimed_at | uuid / timestamptz NULL | paired CHECK; reserved single-flight claim |
| adaptations_used | integer NOT NULL DEFAULT 0 | ≥0; reserved per-draft counter |
| created_at, updated_at | timestamptz NOT NULL | |

## 9. Justification for business_id
`publications` is tenant-scoped by business, and `businesses` deletion cascades. Keeping `business_id` lets the draft cascade on business deletion independently and supports future per-business queries. It is never client-supplied: the RPC copies it from the locked publication row.

## 10. Justification for concurrency fields
- `version`: A3.7.3.2 adaptation results must only be written when the draft is still the one that was adapted (compare-and-set on version). This matches the prepared-replies precedent.
- `adaptation_claim_id` / `adaptation_claimed_at`: single-flight guard, the same 3-minute pattern as `generation_claim_id`.
- `adaptations_used`: a per-draft counter that a selection change deliberately does not reset, so flipping the selection cannot reset a future per-draft cap.

## 11. Constraints
- Role/position pairing.
- lang IN (es, en).
- body 1..1000; cta 1..120.
- Channel length bounds.
- version ≥ 1; adaptations_used ≥ 0.
- Claim fields both NULL or both set.

## 12. Indexes
PK on publication_id (unique 1:1); `publication_drafts_user_idx`; `publication_drafts_business_idx`.

## 13. RLS
Enabled. A single policy, `select_own_publication_drafts`: FOR SELECT TO authenticated USING (auth.uid() = user_id). There are no INSERT, UPDATE, DELETE or ALL policies and no anon policy.

## 14. Grants
`REVOKE ALL ... FROM PUBLIC, anon, authenticated` (which neutralises Supabase default privileges), then `GRANT SELECT TO authenticated` and `GRANT SELECT TO service_role`. There is no write grant for any client role. Verified in the database (T23): anon has no SELECT, and authenticated has no INSERT, UPDATE or DELETE.

## 15. RPC `select_publication_proposal`: signature
`(p_publication_id uuid, p_position integer, p_expected_generation_id uuid) RETURNS jsonb`. It is SECURITY DEFINER with `SET search_path = public`. It takes no user_id, business_id, body or CTA parameter.

## 16. RPC grants
`REVOKE ALL FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE TO authenticated`.

## 17. RPC algorithm
1. `auth.uid()` is NULL → `unauthenticated`.
2. Publication id is NULL → `not_found`; position not in (1,2,3) → `invalid_position`.
3. `SELECT … FROM publications WHERE id = p AND user_id = auth.uid() FOR UPDATE`; no row → `not_found`.
4. Status is not `proposals_ready` → `not_ready`.
5. Expected generation is NULL or differs from the current one → `stale_generation`.
6. Proposal (publication, position, current generation, owner) is missing → `proposal_not_found`.
7. Lock the draft FOR UPDATE. If there is none, insert the snapshot with version 1 → `selected`.
8. Same generation and position → `unchanged` (no write, same version).
9. Claim younger than 3 minutes → `busy` (no write).
10. Otherwise, update the snapshot, set `selected_at = now()`, set `version = version + 1`, null all channel and claim fields → `selected`.

## 18. Return contract
`{result: 'selected'|'unchanged', version}`, or `{result: 'unauthenticated'|'not_found'|'not_ready'|'stale_generation'|'invalid_position'|'proposal_not_found'|'busy'[, version]}`. The `not_found` result is byte-identical for a missing publication and a foreign one (T16).

## 19. Server-side snapshot
Every snapshot field comes from the `publication_proposals` row read inside the function (`v_prop.*`). Owner and tenant come from the locked `publications` row (`v_pub.*`). The client cannot inject text.

## 20. Idempotency
A repeated identical selection returns `unchanged`. It performs no UPDATE, so version and selected_at stay the same (T06), and this holds even while a claim is active (T25).

## 21. Version semantics
First selection → 1. Each changed selection → +1 exactly once (a single `version =` assignment in the UPDATE; T07, T26). Stale, invalid and busy requests never change the version (T10, T24).

## 22. Clearing on change
`facebook_generated`, `facebook_text`, `instagram_generated`, `instagram_text`, `adapted_at`, `adaptation_claim_id` and `adaptation_claimed_at` are set to NULL (T08). `adaptations_used` is preserved by design (§10).

## 23. Stale generation
A random or NULL expected generation returns `stale_generation` with no mutation (T10). An expected generation from a different publication also returns `stale_generation` (T15).

## 24. Claim behaviour
An active claim (under 3 minutes) blocks a changed selection with `busy`, and the claim is preserved (T24). A stale claim (4 minutes old) does not block; the change proceeds and the claim is cleared (T26).

## 25. Invalidation mechanism
A new trigger, `publications_invalidate_draft`: AFTER UPDATE ON publications FOR EACH ROW WHEN (generation id IS DISTINCT FROM, or image_path IS DISTINCT FROM). It runs `publication_drafts_invalidate()`, which is SECURITY DEFINER with `search_path = public` and EXECUTE revoked from PUBLIC, anon and authenticated, and which deletes the draft. It is a plain AFTER UPDATE with an OLD/NEW comparison rather than `UPDATE OF`, so it fires even when the frozen BEFORE trigger nulls the generation. SECURITY DEFINER is required because service_role holds only SELECT on drafts. Without it, photo replacement through publication-media would fail.

## 26. Regeneration
Validated through the real frozen functions: `claim_publication_generation` → `claimed`, then `complete_publication_generation` creates a new generation. The draft is deleted (T28). Selecting with the old generation returns `stale_generation`; selecting with the new one creates version 1 from the new text (T29).

## 27. Image replacement
Updating `image_path` → the frozen BEFORE trigger clears the proposals and sets status to image_ready → the new AFTER trigger deletes the draft (T30). Selection then returns `not_ready` (T31).

## 28. Unrelated updates
An update that changes neither generation nor photo keeps the draft (T32).

## 29. Deletion cascade
Deleting the publication removes its draft (T33). Deleting a user or business also cascades through the FKs.

## 30. Belt and braces
Besides the trigger, the RPC always compares the draft's `source_generation_id` with the current generation. A leftover draft from another generation is never treated as `unchanged`; it is replaced.

## 31. Client module
- `src/features/publications/drafts/types.ts`: `PublicationDraft`, `ProposalPosition`, `ProposalSelectionResult`, `DraftErrorCode`, `DraftError`.
- `src/features/publications/drafts/repository.ts`: `getPublicationDraft(publicationId, db = supabase)` and `selectPublicationProposal(publicationId, position, expectedGenerationId, db = supabase)`, plus the pure mappers `toDraft` and `mapSelectionResponse`.
- It imports only constants and types from the frozen `types.ts`, which is read-only use.

## 32. Client error mapping
| Source | DraftErrorCode |
|---|---|
| RPC `unauthenticated`, PostgREST 42501/PGRST301/PGRST302 | unauthenticated |
| RPC `not_found`, malformed publication id | not_found |
| RPC `not_ready` | publication_not_ready |
| RPC `stale_generation`, malformed expected generation | stale_generation |
| RPC `invalid_position`, local non-1..3 position | invalid_position |
| RPC `proposal_not_found` | proposal_not_found |
| RPC `busy` | busy |
| Other transport error or rejected promise | unavailable |
| Unknown result or malformed payload | unknown |

## 33. Client hardening
- No `any`.
- Strict shape validation of rows and responses.
- Local input validation short-circuits before any network call.
- The draft read selects explicit columns and excludes user_id, channel and claim columns.
- No `functions.invoke`, storage, signed URLs, service_role, Meta or OAuth.

## 34. Database behaviour validation (isolated, rolled back)
- **Method:** one `DO` block creates two throwaway auth users, two businesses and three publications, with proposals that include an SQL/HTML injection-shaped body. It switches to `SET LOCAL ROLE authenticated` with per-user JWT claims, runs every scenario, and ends with `RAISE EXCEPTION` carrying the results. All changes roll back.
- **Production:** Manuel's publication was not touched. A post-check showed 0 drafts and 0 test users remaining, and the publications count unchanged (7).
- **Result:** 33/33 PASS.
  - T01 first select; T02 snapshot fidelity; T03 injection stored verbatim and inert; T04 owner/tenant from server;
  - T05 channels NULL; T06 idempotent; T07 change → v2; T08 clears channels; T09 selected_at refreshed;
  - T10 stale generation; T11 invalid positions 0/4/NULL; T12 not ready; T13 missing publication;
  - T14 missing proposal; T15 other publication's generation; T16 cross-tenant generic not_found;
  - T17 RLS: other user sees 0; T18 owner sees own row;
  - T19–T21 browser INSERT/UPDATE/DELETE denied; T22 unauthenticated; T23 privileges;
  - T24 active claim → busy; T25 active claim, same selection → unchanged; T26 stale claim not blocking;
  - T27 one row per publication; T28/T28a regeneration deletes draft; T29 old generation rejected, new accepted;
  - T30 image replacement deletes draft; T31 not ready after image change; T32 unrelated update keeps draft; T33 delete cascade.

## 35. Spec test items 1–28: coverage map
| # | Item | Covered by |
|---|---|---|
| 1 | Snapshot fidelity | T02; vitest "copies the snapshot" |
| 2 | Injection impossibility | T03; vitest signature test (no text params) |
| 3 | Idempotent same selection | T06; vitest idempotency |
| 4 | Version +1 once on change | T07, T26; vitest "bumps version once" |
| 5 | Channel fields cleared | T08; vitest clears test |
| 6 | Stale generation | T10; client mapping |
| 7 | Other generation | T15, T29 |
| 8 | Other publication | T15 |
| 9 | Tenant isolation | T16, T17 |
| 10 | user_id spoofing | T04, T20; signature test |
| 11 | business_id spoofing | T04; signature test |
| 12 | Non-ready publication | T12, T31 |
| 13 | Invalid position | T11; client local validation |
| 14 | Missing proposal | T14 |
| 15 | Delete cascade | T33; FK test |
| 16 | Regeneration invalidation | T28, T29; trigger test |
| 17 | Image replacement invalidation | T30; trigger test |
| 18 | No direct browser write | T19–T21, T23; grants test |
| 19 | Unique row | T27; PK test |
| 20 | No AI | vitest "never calls AI…"; module scope guard |
| 21 | No Meta | Same guards |
| 22 | Frozen hashes unchanged | vitest manifest hash test (28/28) |
| 23 | Active claim blocks | T24 |
| 24 | Stale claim does not block | T26 |
| 25 | Same selection under claim | T25 |
| 26 | Unauthenticated | T22; client mapping |
| 27 | Generic not_found | T13, T16; client mapping |
| 28 | Typed client errors | vitest mapping table |

## 36. Vitest
New file: 36 tests, all passing. Full suite: 74 files, **2546/2546 passed** (baseline 2510 plus 36 new).

## 37. TypeScript
`npx tsc --noEmit -p tsconfig.app.json`: 20 errors, equal to the baseline of 20. None are in the drafts module or the new test.

## 38. Build
`npm run build`: passes.

## 39. Security advisors
10 findings in total.
- **New (1):** `authenticated_security_definer_function_executable` for `select_publication_proposal`. This is intentional and required by the spec: the function is the designed client entry point, derives identity from `auth.uid()` only, and scopes every read and write to the caller's own publication. It is accepted.
- **Pre-existing (9, unchanged):**
  - RLS enabled with no policy: edge_rate_limits, meta_oauth_states, stripe_customer_repairs (intentional deny-all);
  - `get_funnel_stats` mutable search_path (×2);
  - authenticated-executable definer functions: billing_status, current_user_has_premium, start_trial;
  - leaked-password protection disabled.
- **The trigger function** is not reported: its EXECUTE is revoked.

## 40. Post-implementation freeze verification
- `sha256sum -c` manifest: 28/28 OK.
- Storage fingerprint, original command: `095972aa1a7649bf44a689dc24842c691c3c4c66b9eb078b06ccb82d69d1967a`. This changed only because the command includes every migration and A3.7.3.1 adds one.
- Storage fingerprint, the same command excluding the A3.7.3 addition (`find supabase/functions/publication-media supabase/migrations -type f ! -name '*_a3731_*' | sort | xargs sha256sum | sha256sum`): `1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973`. This is **identical to the frozen value**, which proves that no frozen storage file or prior migration changed.
- Deploy state: `hasChanged: true` count = 0. No edge function was created, changed or deployed.

## 41. Prohibitions honoured
- No AI call and no adaptations function.
- No ledger change (ai_usage_cap, reserve_ai_usage, settle_ai_usage untouched).
- No privacy change.
- No Tools card, catalog, toolsHub or sidebar change.
- No safety module copies.
- No Meta, Google, Graph or OAuth change.
- No customer UI or route.
- No frozen file modified; A3.7.3.2 not started.

## 42. Residual risks
- A regeneration or photo change deletes the draft and any future adaptation text. This is intended ("never masquerade as current"), and A3.7.3.2/3 UI must explain it to the user.
- `adaptations_used` resets when the trigger deletes the draft. Regeneration itself is capped at 4 per publication, and the monthly AI cap (C1) will remain authoritative.
- Channel length bounds (5000 / 2200) are provisional. A3.7.3.2 may tighten them in a new migration.

## 43. Notes for A3.7.3.2 (not started)
- Adaptation writes must compare-and-set on `version` and the held `adaptation_claim_id`.
- Claims use the same 3-minute window as the RPC.
- service_role currently has SELECT only on drafts; the adaptation path must get its write capability through a dedicated SECURITY DEFINER function, not table grants.
- C1 and C4 must be satisfied before any AI call.

## 44. Rollback note
The change is additive. If it had to be undone, dropping the trigger, the two functions and the empty table would restore the previous state. Not executed.

## 45. Verdict
All 28 frozen hashes are intact. The storage fingerprint excluding the new migration is identical. There are no deploy changes, 33/33 database checks and 2546/2546 tests pass, there are 0 new type errors, and the build passes. No frozen file was modified and no prohibited area was touched.

**GO — FREEZE A3.7.3.1 PROPOSAL SELECTION & CHANNEL DRAFT DATA FOUNDATION**

STOP. A3.7.3.2 not started.
