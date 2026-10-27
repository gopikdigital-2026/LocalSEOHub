# A3.7.3.1 — Freeze Manifest

Accepted verdict: GO — FREEZE A3.7.3.1 PROPOSAL SELECTION & CHANNEL DRAFT DATA FOUNDATION
Recorded: 2026-10-27, at the start of A3.7.3.2, before any A3.7.3.2 change.

## Frozen files (SHA-256)

| File | SHA-256 |
|---|---|
| supabase/migrations/20261027162344_a3731_publication_drafts_selection_foundation.sql | e441f2fb57fd454446a7eaf254c0be60adfa1f40876dd2cedf082de1a8dce15d |
| src/features/publications/drafts/types.ts | db175c4efc1e5375cf34795267029cabaab2baf050dfb3a8ed256c21907488bf |
| src/features/publications/drafts/repository.ts | 299bc8b3e1fc97ec3e0791ce4d433a6f88de5a8379f372ff1ec23a983a76bbb1 |
| src/features/publications/__tests__/a3731SelectionFoundation.test.ts | 38e88e4f65bbf3f0132bcc8cdef7dabb5a0a94f3fa92e16712789cc605940095 |

## Frozen database objects

- Table `public.publication_drafts` (columns, CHECKs, indexes, RLS owner-SELECT policy, grants).
- Function `public.select_publication_proposal(uuid, integer, uuid)`.
- Trigger function `public.publication_drafts_invalidate()` and trigger `publications_invalidate_draft`.

Later phases may add NEW migrations and functions that build on these objects; the file above is never edited.

## Baselines at freeze

- A3.7.2 frozen hashes: 28/28 OK.
- Storage/migration fingerprint excluding `_a3731_`: 1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973.
- Deploy state: 0 functions with pending changes.
- vitest 2546/2546, tsc 20 legacy errors, build PASS.
