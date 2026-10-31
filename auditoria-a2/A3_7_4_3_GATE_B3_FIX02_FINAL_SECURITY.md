# A3.7.4.3 — GATE B.3 — FIX02 — FINAL SECURITY

## Verdict

**NO-GO — A3.7.4.3 GATE B.3 FIX02 REQUIRES FURTHER CORRECTION**. The reason is governance only: two hash-chain test pins. No security defect was found.

## Read-only production checks (2026-10-31, after governance edits)

| Check | Result |
|---|---|
| FIX02 migration applied exactly once | `schema_migrations` rows named `a3743_instagram_status_attempt_read_grant` = 1; total rows 59; 60 local files. No new migration was created and the grant was not re-applied. |
| service_role column grant | SELECT on exactly attempt_number, channel, external_stage, id, meta_container_id, publication_id, started_at, status, user_id (9). Unchanged. |
| Additional privileges | service_role/anon table-level grants = 0; anon column grants = 0; authenticated = table SELECT only (unchanged) |
| RLS | Enabled; 1 policy (unchanged) |
| Publication D 875587f5 | proposals_ready, updated 2026-10-31 16:16:13.516242+00 |
| D draft | version 3, updated 16:22:09.849195+00; instagram_text sha256 537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e |
| D image | ba93c54e-c0ee-4fa0-a7b4-8284cddaa808.png, 901,643 B, eTag fc3a190ee41708dc8b242ff5b711ae58 |
| A/B/C | 65569535 @ 2026-10-27 23:05:19.287086; 442059e5 @ 2026-10-28 12:27:05.291163; b140fc59 @ 2026-10-30 00:13:08.946825 (unchanged) |
| Facebook attempt | aaca823e, facebook, succeeded, stage none, updated 2026-10-30 22:40:42.724699 (unchanged; only attempt) |
| Instagram attempts | 0 |
| Active / UNKNOWN attempts | 0 |
| Buckets | publication-images private (18 objects); instagram-derivatives private (0 objects) |
| Arming secrets | No META_INSTAGRAM_* or other real-publish arming secrets present |
| instagram-publishing function | ACTIVE, verifyJWT true, id a3008491-be86-40c3-ae41-0a93ee773be4. Not redeployed. Local source hashes unchanged: index f1855158…, instagramPublish 5523a9c0…, shared 2de062ea…, derivative be27cd6e…, graph 6a5909c4…, connectionPreflight b57c82c1…, plus config.toml fc17510c…. |

## Actions not taken

No database writes, no permission changes, no deployments, no secret changes, no Meta Graph calls (/media or /media_publish), no publishing, and no production code changes. Only four test files were edited, all within the authorized scope.
