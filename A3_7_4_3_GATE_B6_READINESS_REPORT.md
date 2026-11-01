# A3.7.4.3 — Instagram Gate B.6 — Final Real-Publish Readiness Report

Mode: read-only. Audit window: 2026-11-01 20:38–20:41 UTC. Nothing was published, deployed, migrated, renewed, or written to. No secrets or source files were changed.

**Verdict: GO — INSTAGRAM GATE B.6 READY FOR SEPARATELY AUTHORIZED REAL TEST.** This verdict is conditional on preflight P3 of the execution plan: the entitlement must still be active, with margin, when the test runs.

## 1. Production state

| Check | Observed | Expected | Result |
|---|---|---|---|
| Edge function `instagram-publishing` | ACTIVE, id a3008491-be86-40c3-ae41-0a93ee773be4, verify_jwt=true | same id, active | PASS |
| Deployed version / metadata | The MCP tooling only exposes slug, status, id and verifyJWT. The version number is not exposed. | — | NOT OBSERVABLE: relies on the owner's statement that the 7 downloaded deployed files are byte-identical to FIX01 |
| Local instagram-publishing sources (7) | graph a107c840, index 6312ea2e, instagramPublish df94b08f, publishTarget d58f363b, connectionPreflight b57c82c1, derivative be27cd6e, shared 2de062ea | approved FIX01 hashes | PASS |
| `publish_attempt_begin` | md5 c7a783fc795bb4f5eb5ebbc1246e943b · {postgres, service_role} | FIX01 | PASS |
| `publish_attempt_finish` | md5 b899c48ece67be21664ec8564e475cbb · {postgres, service_role} | FIX01 | PASS |
| `publish_attempt_record_verification` | md5 eabb8a45d15c3127aecedbf2d5201255 · {postgres, service_role} | FIX01 | PASS |
| `publish_attempts_guard` (trigger) | md5 3ae610d5cbf419af15dce170cb853d7a · {postgres} | FIX01 | PASS |
| Other gate functions | gate 12f9d6cf, preflight 356c5e36, advance e13cee80, mark_stale b99f5731, entitlement_active 325e375c | unchanged | PASS |
| Policies hash / function-ACL hash | 529a39b1… / 35a194e9… | unchanged since B.5 | PASS |
| Migrations | 60, newest 20261031234927 | unchanged | PASS |
| Facebook integrity | 1 attempt, succeeded, object 1393994523793266_122114709087502661, updated 2026-10-30 22:40:42.724699+00. meta-publishing sources unchanged (facebookPhoto 7225bc3d, facebookPublish 48da8e2f, handler b7525645, index 027ee4fe); function id 3b3b0765 ACTIVE | unchanged | PASS |
| Unrelated changes | 43 functions, all ACTIVE, same set as before; no new migrations | none | PASS |
| Arming switches | `META_INSTAGRAM_REAL_PUBLISH_ARMED`, `_USER_IDS`, `_PUBLICATION_IDS` are all ABSENT. Meta secrets present: META_APP_ID, META_APP_SECRET, META_REDIRECT_URI | absent (disarmed) | PASS |
| Instagram attempts / containers / derivatives | 0 / 0 / 0 (bucket `instagram-derivatives` empty) | 0 / 0 / 0 | PASS |

## 2. Publication D

| Field | Observed | Expected | Result |
|---|---|---|---|
| id | 875587f5-0137-4477-904c-609e8e406ad6 | same | PASS |
| status | proposals_ready (updated 2026-10-31 16:16:13) | unchanged | PASS |
| draft version | 3 (draft updated 2026-10-31 16:22:09) | 3 | PASS |
| caption SHA-256 (instagram_text, UTF-8) | 537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e | same | PASS |
| image | publication-images/…/ba93c54e-c0ee-4fa0-a7b4-8284cddaa808.png, image/png, 901,643 B, eTag fc3a190ee41708dc8b242ff5b711ae58, unchanged since 2026-10-31 16:15:22 | — | PASS |
| image SHA-256 | Approved asset: sha256 6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7, md5 fc3a190e…, 901,643 B. The stored eTag equals that MD5 and the size matches. | 6edee998… | PASS by MD5/size equivalence. The function independently re-checks SHA-256 before any Meta write. |
| IG account / FB Page | 17841462487279994 / 1393994523793266 | same | PASS |
| attempts for D | 0 | 0 | PASS |
| `publication_publish_gate(user, D, 'instagram', 3)` | NULL (no blocking issue) | NULL | PASS (eligible) |

## 3. Entitlement

| Field | Value |
|---|---|
| id | 41af3f04-b3f2-48fb-997a-279c84e012ae |
| purpose | internal_owner_e2e |
| revoked | no |
| `internal_test_entitlement_active` | **true** at 2026-11-01 20:39:49 UTC |
| expires_at | **2026-11-01 22:21:13.055308+00** (about 1h41m after the audit) |

Status: **ACTIVE, expiring imminently.** It was not renewed. If the real test does not finish before about 22:05 UTC, it will be refused with PERMISSION_REQUIRED (by `begin`) or REAL_PUBLISH_DISABLED (by the function). In that case the owner must renew it in a separate, explicitly authorized step, using the procedure in the execution plan, section 2.

## 4. Duplicate prevention: summary

The details are in the security document.

- **Atomic:** `begin` takes FOR UPDATE row locks on the publication and the draft. Unique partial indexes cover live attempts per version, one active attempt and one success, so a concurrent second insert gets PUBLISH_IN_PROGRESS.
- **Strict match:** the publication id, version 3, caption SHA and image SHA are hardcoded. They are checked before begin, after begin, and again before each Meta write via the snapshot re-check.
- **Entitlement:** it is checked in the function (`mayWrite`), again in SQL `begin`, and re-read before both Graph writes.
- **UNKNOWN:** once publish is requested, the database turns "failed" into UNKNOWN, and the trigger forbids unknown→failed without a verification record. The status is non-retryable.
- **No unsafe retry:** retry is only possible from FAILED, needs an explicit `retry:true`, and META_REJECTED additionally requires a newer draft save. There is no automatic retry loop.

## 5. Regression

There were no source changes in B.6. The B.5 baseline still applies: 3069/3069 tests, the build passes, and tsc shows 20 known errors in unrelated landing and legacy files.

## 6. Verdict

**GO — INSTAGRAM GATE B.6 READY FOR SEPARATELY AUTHORIZED REAL TEST**
