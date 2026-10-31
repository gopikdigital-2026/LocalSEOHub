# A3.7.4.3 — GATE B.3 — FIX02 — SECURITY FINAL

## Verdict

**NO-GO — A3.7.4.3 GATE B.3 FIX02 REQUIRES FURTHER CORRECTION**. The reason is governance: five out-of-scope regression pins fail. There is no security defect.

## Privilege verification (post-apply, catalog)

| Role | publication_publish_attempts privileges |
|---|---|
| service_role | Column SELECT on exactly 9 columns: id, status, external_stage, meta_container_id, started_at, publication_id, user_id, channel, attempt_number. No table-level grant. No INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER. |
| authenticated | Table SELECT (unchanged) |
| anon | None (unchanged) |

- RLS is enabled, with 1 policy (unchanged).
- The publish_attempts_guard trigger, SECURITY DEFINER attempt RPCs and existing migrations were not touched. They are pinned by hash in the FIX02 test file.
- Attempt writes remain possible only through the existing SECURITY DEFINER RPCs.
- Non-granted columns are not exposed to service_role. These include idempotency_key, error_code, meta_object_id, permalink, business_id and draft_version.

## Production safety (post-change)

| Item | Result |
|---|---|
| D 875587f5 | proposals_ready, updated 2026-10-31 16:16:13.516242+00 (unchanged) |
| D draft | v3, updated 16:22:09.849195+00; instagram_text sha256 537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e (unchanged) |
| D image | …/ba93c54e-c0ee-4fa0-a7b4-8284cddaa808.png, 901,643 B, eTag fc3a190ee41708dc8b242ff5b711ae58 (unchanged) |
| A/B/C | 65569535 2026-10-27 23:05:19.287086; 442059e5 2026-10-28 12:27:05.291163; b140fc59 2026-10-30 00:13:08.946825 (unchanged) |
| Publications | 18 |
| Attempts | 1 total, Facebook succeeded (unchanged); 0 Instagram; 0 active; 0 UNKNOWN; 0 containers |
| Buckets | publication-images private (18 objects); instagram-derivatives private (0 objects) |
| meta_connections | 1 |
| Secrets | No META_INSTAGRAM_* or arming secrets present |
| Edge functions | instagram-publishing ACTIVE, verifyJWT true, id a3008491-be86-40c3-ae41-0a93ee773be4; not redeployed |
| Graph | No /media or /media_publish calls made |

## Residual risk

- With the grant, service_role can read the 9 columns. Combined with the existing bypass of row-level security, it can read those columns for every user. This is equivalent in reach to the other service_role reads the function already performs, and it is limited to non-secret attempt metadata.
- The owner status retest is still pending.
