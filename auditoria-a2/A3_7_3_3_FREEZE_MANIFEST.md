# A3.7.3.3 — Freeze Manifest

Accepted verdict: GO — FINAL FREEZE A3.7.3.3 AFTER MIGRATION RECONCILIATION
Recorded: 2026-10-27, after the post-audit migration reconciliation (report §23).

## Frozen files (SHA-256)

| File | SHA-256 |
|---|---|
| supabase/migrations/20261027233057_a3733_publication_channel_review_editing.sql | 1b63b7b86642dcfbd61e5fcc896df24417b44a0de9d6026f0e5c73b2f82bbc60 |
| supabase/migrations/20261027233150_a3733_publication_channel_review_editing.sql | b2d7f4559636e70d8dc54a296dbf4ff656f95239b16427dbc34e3ff92e7258af |
| src/features/channel-review/ChannelReviewPanel.tsx | 5ab5259c24a48072d80535c13d1d4b5a5e5c432a2a66316cd3d4b30efa128989 — A3.7.3.4 RESUME RE-PIN (authorized), was 030eb506c7ae546d93332bcf3fc2f117b417c93c1a040d55b3e83b7ee6f75007 |
| src/features/channel-review/copy.ts | 6b6c39d4e90f97520e15df770baec1ed6e5472cbd389f03fd89d200022a17ddd — A3.7.3.4 RESUME RE-PIN (authorized), was 42c4b0e6608f7b6d5616de537e8c7ac5deb098564a69ec0ca08fd872477e3286 |
| src/features/channel-review/model.ts | 1045d50d7a8fcb0e7f8778fb4f1963d6e56ab57b62fd225eb0a81b5d9d03c287 |
| src/features/channel-review/repository.ts | 6c3371d9e811e4889172b038d8ecd9aa6aeccb5b7dc2018f51a439b54f7c3885 |
| src/features/channel-review/types.ts | 37c388de2612c42af6c393c198dd8ea56f2bca5adbb1f6c0352334647d677649 |
| src/features/publications/__tests__/a3733ChannelReview.test.ts | d62c66187e16c6200e1327b5709def5e2fe781fd344e2202585560249b8759c9 — A3.7.3.4 RESUME RE-PIN (authorized), was 11716a568dacf5283706395ea5fac1f7c8e0e35a424de3a01e9f9074097f9dcf |
| src/App.tsx (shared; hidden harness mount) | 7902658f9f56ad9db1059bf7111cd3b9ee786256f10b19ff0ac48b3e8d8b94ba — A3.7.3.4 RESUME RE-PIN (authorized), was c8e503d2a1cb4c1947a337b238c0ef078277f2c9cc313919aa50ff820f3c7210 |

## Migration history

| Migration | Role |
|---|---|
| 20261027233057 | The original definition, with the broad markup rule `<\s*/?\s*[A-Za-z!]`. The file reproduces the recorded run exactly. |
| 20261027233150 | The corrective re-definition, with the narrow markup rule `<[/!]?[A-Za-z]`. It is the final state, and the file reproduces the recorded run exactly. |

Both files are kept. Neither may be edited, deleted or renamed. The two files are not identical; they differ in the markup rule and in the header notes.

## Frozen database objects

| Function | Security | Access |
|---|---|---|
| `public.publication_channel_text_issue(text, integer)` | IMMUTABLE, `search_path=public` | `{postgres, service_role}` |
| `public.save_publication_channel_drafts(uuid, integer, text, text, boolean, boolean)` | SECURITY DEFINER, `search_path=public` | `{postgres, service_role, authenticated}` |

Whitespace-free body hashes in production equal migration 2:
- Helper: `47f5e1fe61d774e82fb779758db7e574`.
- Save function: `bc4466207fc5df2acc26c538fe647566`.

## Baselines at freeze

- A3.7.1 storage/migration fingerprint, excluding `_a3731_`, `_a3732_` and `_a3733_`: 1e7aa8722ca7b921ea740d121d48666654467dcf20cdc5d8d1cb9501613f8973.
- The A3.7.3.2, A3.7.3.1 and A3.7.2 frozen hashes are unchanged (report §19).
- vitest: 2688/2688.
- tsc: 20 legacy errors, 0 new.
- build: PASS.
- Production database: not changed by the reconciliation.
