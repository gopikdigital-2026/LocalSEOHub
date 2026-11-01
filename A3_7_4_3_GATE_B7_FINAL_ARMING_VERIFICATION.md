# A3.7.4.3 — Gate B.7 — Final Arming Verification (read-only)

Run at 2026-11-01 20:54:58 UTC. No publish, secret change, entitlement renewal, deploy or database write was made.

| Check | Observed | Result |
|---|---|---|
| Secret `META_INSTAGRAM_REAL_PUBLISH_ARMED` | name present | PASS (exists) |
| Secret `META_INSTAGRAM_REAL_PUBLISH_USER_IDS` | name present | PASS (exists) |
| Secret `META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS` | name present | PASS (exists) |
| Secret values (exactly `true` / owner UUID / D UUID) | tooling exposes names only | **UNVERIFIED** |
| Other secrets | same 20 names as before; no extra or removed names | PASS |
| Publication D | proposals_ready, v3, draft updated 2026-10-31 16:22:09.849195, caption sha256 537130…915e | PASS |
| Original image | 901,643 B, eTag fc3a190e… (MD5 of approved asset sha256 6edee998…), unchanged since 2026-10-31 16:15:22 | PASS |
| Connected accounts | IG 17841462487279994 / Page 1393994523793266 | PASS |
| Publish gate (instagram, v3) | NULL (no blocking issue) | PASS |
| Instagram attempts / containers / derivatives | 0 / 0 / 0 (total attempts 1 = the Facebook post) | PASS |
| FIX01 SQL safeguards | begin c7a783fc, finish b899c48e, record_verification eabb8a45, guard 3ae610d5 | PASS |
| Entitlement 41af3f04… | active, not revoked, expires 2026-11-01 22:21:13 UTC (86 min left, ≥ 30 required) | PASS |
| `instagram-publishing` | ACTIVE, id a3008491-be86-40c3-ae41-0a93ee773be4, verify_jwt=true | PASS |
| Authenticated `instagram_publish_status` | requires the owner's session; not run | **UNVERIFIED** |

## Readiness
Everything verifiable passes. The app is ready for the owner to run `instagram_publish_status` while signed in. That check also confirms the two UNVERIFIED items:
- If any secret value is wrong, it returns `armed:false` / `not_armed` or `publication_not_allowed`.
- Proceed only if it shows `trigger.enabled=true`, `reason=null` and `derivative.ready=true`, with all permissions true. Otherwise delete the three secrets.
- The publish window closes when the entitlement expires at 22:21 UTC. Start no later than about 21:50 UTC so the 30-minute margin holds.
