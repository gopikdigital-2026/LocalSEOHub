# A3.7.4.3 — Gate B.3 Part 1 — Production Safety

Date: 2026-10-31. Read-only. No DB writes, no secrets created, no Graph calls, no tokens/credentials/signed URLs exposed.

## Database and storage

| Item | Evidence | Result |
|---|---|---|
| Publications | 18; none created after D | PASS |
| A `65569535` | 2026-10-27 23:05:19.287086 | PASS |
| B `442059e5` | 2026-10-28 12:27:05.291163 | PASS |
| C `b140fc59` | 2026-10-30 00:13:08.946825 | PASS |
| D | version 3, unchanged (see preflight report) | PASS |
| Attempts | 1 total: facebook `succeeded` 2026-10-30 22:40:35 (historical) | PASS |
| Instagram attempts | 0 | PASS |
| UNKNOWN / publishing | 0 | PASS |
| Rows with `meta_container_id` | 0 | PASS |
| Buckets | `publication-images` private, `instagram-derivatives` private (0 objects) | PASS |
| Meta connection | unchanged; updated_at 2026-10-29 18:06:07.726431+00 | PASS |

## Secrets (names only)

There are no Instagram or Facebook real-publish arming secrets (`META_INSTAGRAM_REAL_PUBLISH_ARMED`, `…_USER_IDS`, `…_PUBLICATION_IDS` are absent, as are any Facebook equivalents). Present: platform, AI, Stripe, Google, `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`. PASS

## Server authority / browser bypass

| Control | Evidence | Result |
|---|---|---|
| P1 `isPublicationAllowed` | Missing, empty or any malformed entry → false; no wildcard (source lines 108–115) | PASS |
| `isArmed` | Requires `ARMED === "true"` and the user in a valid-UUID list | PASS |
| P2 `isAuthorizedToPublish` | armed && allowed; rechecked before /media and /media_publish | PASS (24/24 B.2 P1 tests, mocked) |
| Attempts table grants | `authenticated`: SELECT only; `anon`: none | PASS |
| `meta_read_token`, `publication_publish_preflight` | EXECUTE only `postgres`, `service_role` | PASS |
| Publish endpoints | `verify_jwt = true`; server decides arming from env, browser input can't arm | PASS |

While disarmed, no real publishing operation is possible: every publish/verify request returns `not_armed` before any Graph call (covered by mocked tests).

## Code freeze (SHA-256 prefix, identical to B.2 baseline)

instagramPublish.ts 5523a9c0481760a6 · index.ts b782a99fbc4a9ba0 · shared.ts 2de062eaf385236e · graph.ts 6a5909c494b09f65 · derivative.ts be27cd6efba40260 · facebookPhoto.ts 7225bc3d5dd0493f · facebookPublish.ts 48da8e2f81eb520d · meta-publishing/handler.ts b7525645c005ea39 · meta-publishing/index.ts 027ee4fe8f389fbb · instagram-publish/repository.ts 9b5f26d48f0ab2ea · InstagramPublishHarness.tsx b7ea8c5c31b1002d · instagram-publish/copy.ts fe8ce97b07d39fec · a3743InstagramGateA.test.ts d1b0c3d01d0c940a · a3743GateB2Part1Security.test.ts e045fe5baa91b331 · config.toml fc17510c97774a53 · migration 20261030232253 366493c40ef00561 · App.tsx ef7f7cdca4c0c0a9 · functions-deploy-state.json 33fd37ab0af2cf2b

## Regression

- Vitest: 2937 / 2937 passed, 0 failed (495 suites). Gate A 39/39, B.2 P1 security 24/24.
- tsc: 20 errors (inherited), 0 new.
- Build: OK.

Result: production safe, disarmed.
