# A3.7.4.3 — Gate B.2 Part 1 — Security Implementation (P1 + P2)

Continuation of ZIP (29). Facebook A3.7.4.2 frozen. Real Instagram E2E NOT authorized.

## P1 — Fail-closed server-side publication allowlist

File: `supabase/functions/instagram-publishing/instagramPublish.ts` (only production server file changed).

- New secret name: `ARMED_PUBLICATIONS = "META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS"` (not set in production).
- `isPublicationAllowed(env, publicationId)`:
  - missing secret → false; empty / whitespace → false;
  - any comma-separated entry that is not a full UUID (incl. `*`, `all`, trailing comma, truncated id) → the **whole list** is rejected (false);
  - otherwise exact (case-insensitive, trimmed) membership. No wildcard semantics exist.
- `isAuthorizedToPublish(env, userId, publicationId) = isArmed(env, userId) && isPublicationAllowed(env, publicationId)`.
- `isArmed` signature and behaviour unchanged.

Enforcement points:

| Point | Check | Result when not authorized |
|---|---|---|
| `publish()` entry (after JWT user + UUID body validation in the handler, before preflight/begin) | `isAuthorizedToPublish` | 403 `REAL_PUBLISH_DISABLED`, state `NOT_REQUESTED`; no attempt, no token read, no derivative, no Graph call |
| `verify()` entry (before context/markStale/Graph read) | `isAuthorizedToPublish` | 403 `REAL_PUBLISH_DISABLED` |
| Immediately before `POST /{ig}/media` | live re-read via `deps.env` | attempt closed FAILED (`INTERNAL_ERROR`), 403 `REAL_PUBLISH_DISABLED` state `FAILED`; no Graph write; derivative removed in `finally` |
| Immediately before `POST /{ig}/media_publish` | live re-read | attempt closed FAILED; `/media_publish` never sent. A container without `media_publish` produces no post, so FAILED is truthful (not UNKNOWN). |

`index.ts` reads env live (`Deno.env.get`) per call, so revocation mid-flight is honoured. `index.ts` unchanged.

Preserved: idempotency/concurrency (single `begin` via DB RPC), UNKNOWN blocking, write-ahead stages, retry rules, META_REJECTED edit rule, redaction.

`status` now also returns `trigger: { enabled, reason }`, computed server-side:
`not_armed` → `publication_not_allowed` → `preflight_blocked` → `attempt_exists` → `derivative_not_ready` → enabled.

## P2 — Controlled internal trigger

- `repository.ts`: one new export `requestInstagramPublish(publicationId, expectedVersion)` sending only `{action:'instagram_publish', publicationId, expectedVersion}`. No retry, no verify, no secrets/tokens/signed URLs. Status now maps `triggerEnabled` / `triggerReason` from the server.
- `InstagramPublishHarness.tsx` (existing internal-only harness; mount in `App.tsx` unchanged):
  - Button enabled only when `armed && triggerEnabled && canPublish && state==='NOT_REQUESTED' && status.version === draftVersion`, and not loading/sending. All of these come from the server response; no client flag, env value or allowlist exists in the browser.
  - Otherwise a disabled locked button shows the server reason.
  - Two-step confirm; single in-flight guard; status + draft version re-fetched from the server immediately before sending, and the fresh version is what is sent. The server re-validates everything regardless.
- `copy.ts`: new strings; title/intro no longer claim "read-only".

## Freeze integrity

- Hash pins on changed files: none outside Gate A content checks (T34/T16/T33). No cascade.
- `App.tsx`, `index.ts`, `shared.ts`, `graph.ts`, `derivative.ts`, `config.toml`, migration, all Facebook files: byte-identical.
- `functions-deploy-state.json` updated by the deploy tool itself (not pinned by any test).
- Historical manifests (Gate A, B.1) not rewritten.
