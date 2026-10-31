# A3.7.4.3 — Gate B.2 Part 2 — Production Safety (post owner-created D)

Date: 2026-10-31. Read-only. No DB writes, no secrets touched, no Graph calls, no tokens/credentials/signed URLs exposed.

## Publications

| Item | Evidence | Result |
|---|---|---|
| Total publications | 18 (baseline 17 + D) | PASS |
| Created after baseline (2026-10-30 00:12:00) | exactly 1: `875587f5-0137-4477-904c-609e8e406ad6` at 2026-10-31 16:15:20 | PASS |
| A `65569535-…` updated_at | 2026-10-27 23:05:19.287086 (unchanged) | PASS |
| B `442059e5-…` updated_at | 2026-10-28 12:27:05.291163 (unchanged) | PASS |
| C `b140fc59-…` updated_at | 2026-10-30 00:13:08.946825 (unchanged) | PASS |

## Publishing attempts

| Item | Evidence | Result |
|---|---|---|
| Total attempts | 1 | PASS |
| Facebook succeeded (historical) | 1 | PASS |
| Instagram attempts | 0 | PASS |
| `unknown` / `publishing` | 0 | PASS |
| Attempts for D | 0 | PASS |

## Secrets (names only)

Absent: `META_INSTAGRAM_REAL_PUBLISH_ARMED`, `META_INSTAGRAM_REAL_PUBLISH_USER_IDS`, `META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS`, and no Facebook arming secret present. Only pre-existing platform, Stripe, Google, Meta-app and AI keys exist. PASS

## Storage

| Item | Evidence | Result |
|---|---|---|
| `publication-images` | private (`public = false`) | PASS |
| `instagram-derivatives` | private, 0 objects | PASS |
| D original | 1 object, 901,643 bytes, owner-scoped path | PASS |

## Code freeze integrity (SHA-256 prefixes, identical to Part 1 baseline)

| File | Hash |
|---|---|
| instagram-publishing/instagramPublish.ts | 5523a9c0481760a6 |
| instagram-publishing/index.ts | b782a99fbc4a9ba0 |
| instagram-publishing/shared.ts | 2de062eaf385236e |
| instagram-publishing/graph.ts | 6a5909c494b09f65 |
| instagram-publishing/derivative.ts | be27cd6efba40260 |
| meta-publishing/facebookPhoto.ts | 7225bc3d5dd0493f |
| meta-publishing/facebookPublish.ts | 48da8e2f81eb520d |
| meta-publishing/handler.ts | b7525645c005ea39 |
| meta-publishing/index.ts | 027ee4fe8f389fbb |
| instagram-publish/repository.ts | 9b5f26d48f0ab2ea |
| instagram-publish/InstagramPublishHarness.tsx | b7ea8c5c31b1002d |
| instagram-publish/copy.ts | fe8ce97b07d39fec |
| a3743InstagramGateA.test.ts | d1b0c3d01d0c940a |
| a3743GateB2Part1Security.test.ts | e045fe5baa91b331 |
| supabase/config.toml | fc17510c97774a53 |
| migration 20261030232253 | 366493c40ef00561 |
| src/App.tsx | ef7f7cdca4c0c0a9 |
| functions-deploy-state.json | 33fd37ab0af2cf2b |

P1 allowlist (`isPublicationAllowed`) and P2 controlled trigger (`isAuthorizedToPublish`, rechecked before /media and /media_publish) intact. Frozen Facebook files unchanged.

## Regression

- Vitest: 2937 total, 2937 passed, 0 failed (495 suites). PASS
- tsc (tsconfig.app.json): 20 errors = inherited baseline, 0 new. PASS
- Production build: OK. PASS
- No production code, migrations, tests or historical manifests modified.

## Result

Production safe; disarmed state confirmed.
