# A3.7.4.3 — Instagram Gate B.7 — Post-Publish Final Verification & Freeze

Mode: read-only production audit. Checks ran from 2026-11-01 21:12:50 UTC.

Not done during this audit: publishing, calling `instagram_publish`, creating containers, changing switches or the entitlement, writing to the database, deploying, or editing source code.

**Verdict: GO — INSTAGRAM REAL PUBLISHING VERIFIED; SAFELY DISARMED; GATE B.7 FROZEN**

## 1. Disarm state
| Check | Observed | Result |
|---|---|---|
| `META_INSTAGRAM_REAL_PUBLISH_ARMED` | absent | PASS |
| `META_INSTAGRAM_REAL_PUBLISH_USER_IDS` | absent | PASS |
| `META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS` | absent | PASS |
| Remaining secret names | the same 20 names as the pre-arming baseline | PASS |

The code arms publishing only when `ARMED` is exactly `"true"` and the user is in the allow-list (`isArmed`). With all three secrets absent, `mayWrite` is false for every user, so the system is disarmed.

## 2. Instagram attempt (publication D)
| Field | Value | Result |
|---|---|---|
| Attempt id | ba3e3bca-6ff0-43a4-947c-7414d571d9d3 | — |
| Publication / version / channel | 875587f5-0137-4477-904c-609e8e406ad6 / 3 / instagram | PASS |
| User / business | aabe426e… / e6014022… (the approved target) | PASS |
| Status | succeeded | PASS |
| attempt_number / Instagram attempts in total | 1 / 1 | PASS |
| Idempotency key | `875587f5-…:instagram:v3` | PASS |
| Media id (`meta_object_id`) | 18044145305836108, numeric and nonempty | PASS |
| Container id | 17959806654082910 | PASS |
| Permalink | https://www.instagram.com/p/DfNqSPmiEIP/ | PASS |
| external_stage | publish_requested (the final write-ahead stage before success) | PASS |
| error_code / retryable / verification_required | null / false / false | PASS |
| Started → finished | 21:07:27.69 → 21:07:50.49 UTC (about 23 s) | PASS |
| UNKNOWN outcomes | none (`status` ≠ unknown, `verification_required` false) | PASS |

### Media id ↔ real post correspondence
The publish path (`instagramPublish.ts` lines 338–350) works as follows:
- It publishes the container.
- It calls `readBackMedia(mediaId)`, which issues a Graph `GET {mediaId}?fields=id,permalink`.
- `readBackMedia` returns a permalink only when Graph answers OK, the returned `id` equals the published media id, and the link matches `^https://(www\.)?instagram\.com/…`. Every other response yields `permalink = null` (`graph.ts` lines 131–144).

The stored permalink is non-null and valid. That means Instagram itself confirmed, at publish time, that media 18044145305836108 exists and that its permalink is `/p/DfNqSPmiEIP/`.

The owner also independently confirmed that the post is visible on Instagram.

I did not make a fresh Graph read during this audit. It would need the owner's Meta token, and it was not required.

## 3. Isolation checks
| Check | Observed | Result |
|---|---|---|
| Duplicate Instagram attempts | 0 (exactly one Instagram row) | PASS |
| Other Instagram publications | none; total attempts = 2 (1 Facebook + 1 Instagram) | PASS |
| Facebook attempt aaca823e… | succeeded, `1393994523793266_122114709087502661`, updated 2026-10-30 22:40:42.724699 (unchanged) | PASS |
| Publication D row | proposals_ready, updated 2026-10-31 16:16:13.516242 (unchanged) | PASS |
| Draft v3 | updated 2026-10-31 16:22:09.849195; caption sha256 537130…915e (unchanged) | PASS |
| Original image | 901,643 B, eTag fc3a190e… (MD5 of approved asset sha256 6edee998…), unchanged | PASS |
| Temporary Instagram derivative images | 0 (cleaned up after publish, as designed) | PASS |
| Connected accounts | IG 17841462487279994 / Page 1393994523793266 | PASS |
| Publish gate for D/instagram/v3 | `ALREADY_PUBLISHED` (a repeat publish is blocked by the database) | PASS |
| Publications in total / latest update | 18 / 2026-10-31 16:16:13 (no publication rows changed) | PASS |

## 4. Safety protections — see A3_7_4_3_GATE_B7_SECURITY.md
- All 9 function fingerprints and their ACLs match the frozen baseline exactly.
- Migrations: 60, the latest is 20261031234927 (unchanged).
- The attempts-table guard trigger is enabled.
- RLS is on for every publishing table.

## 5. Regression and build
- Vitest: 90 files, 3069 tests, all passed.
- `npm run build`: exit 0.
- No edge function has undeployed changes (`hasChanged: true` count = 0).
- No source code was modified.

## 6. Notes
- The internal test entitlement 41af3f04… stays active until 2026-11-01 22:21:13 UTC and then expires on its own. It cannot publish anything without the three secrets. Renewing or revoking it was outside this gate's scope.
- The B.6 policy hash (529a39b…) was computed with a formula that was not recorded, so it cannot be recomputed byte-for-byte. In its place:
  - The publishing-table policies, grants, RLS and trigger were checked directly and are as frozen.
  - The migration count is unchanged.
  - A new, reproducible baseline with its formula is recorded in the Freeze Manifest.

STOP. No further publishing.
