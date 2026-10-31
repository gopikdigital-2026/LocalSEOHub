# A3.7.4.3 — Gate B.2 Part 1 — Test Report

## Authorized Gate A test adaptations (`a3743InstagramGateA.test.ts`)

1. **Change 1** — `ARMED_ENV` adds `META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS: PUB`. Comment: `A3.7.4.3 GATE B.2 PART 1 AUTHORIZED RE-PIN (Change 1 ...)`. No behavioural assertion changed; all mocked scenarios kept.
2. **Change 2** — T34: exports now exactly `[getInstagramStatus, requestInstagramPublish]`; `requestInstagramPublish(publicationId, expectedVersion)` signature pinned; exactly one `'instagram_publish'` literal; `instagram_publish_verify` still forbidden; Graph/`fetch(`/`media_publish`/`/media` prohibitions kept; T16/T33 secret/token/signed-URL bans untouched. "Always disabled" replaced with: disabled locked button must still exist, enablement expression pinned to server fields + version match, pre-send `fetchStatus()`, in-flight guard, and no client storage/env/URL inputs. Comment: `AUTHORIZED RE-PIN (Change 2 ...)`.

## New suite `a3743GateB2Part1Security.test.ts` — 24/24 pass

Allowlist: absent, empty, whitespace, `,`, `*`, `all`, truncated UUID, `D,*`, `D,not-a-uuid`, `D,` (trailing), dashless UUID, mismatched (A only) → refused; exact/trimmed/case-insensitive match accepted; combined check needs user arming + allowlist.

Server: publish+verify refused (403, before preflight/context/begin/token/derivative/fetch) for absent/empty/malformed/mismatched/wildcard lists; A, B, C refused with owner armed and D allowlisted; D-shaped fixture succeeds only under mocked arming with exactly one `/media` + one `/media_publish`; wrong user 403; unauthenticated 401; invalid UUID / `*` 400; wrong version → VERSION_CONFLICT before begin; allowlist removed before `/media` → 0 Graph writes, FAILED, derivative removed; arming removed between `/media` and `/media_publish` → only `/media`, FAILED; 3 concurrent requests → 1 attempt, 1 post, then ALREADY_PUBLISHED; UNKNOWN blocks publish, verify read-only; status trigger enabled/disabled with reasons; disarmed env → 0 Graph writes across A/B/C/D.

Browser: no verify/Graph/`fetch(`/`META_`/token/signed URL/A or C id in repository, harness, copy; request body only id + version; enablement from server status, re-fetch precedes send; `App.tsx` sha256 pinned; Facebook files sha256 pinned.

## Results

| Suite | Pass | Fail |
|---|---|---|
| a3743GateB2Part1Security | 24 | 0 |
| a3743InstagramGateA | 39 | 0 |
| a3741MetaPublishingFoundation | 68 | 0 |
| a3742FacebookPhotoPublishing | 55 | 0 |
| a3742B1Fix01 / B2Fix03 / Fix02 | 19 / 8 / 12 | 0 |
| **Full suite** | **2937** (baseline 2913 + 24) | **0** |

- tsc (`tsconfig.app.json`): 20 errors = 20 inherited, 0 new, none in Instagram files.
- `npm run build`: success.
