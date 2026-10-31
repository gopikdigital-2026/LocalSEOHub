# A3.7.4.3 — Gate B.2 Part 2 — Manifest (owner-created D verification)

Date: 2026-10-31
Baseline: Gate B.2 Part 1 (`localseohub-a3743-gateB2p1.zip`), unchanged.
ZIP: `localseohub-a3743-gateB2p2.zip` (regenerated; excludes node_modules, dist, .git, .env, *.zip).

## Changes in this step

Report files only:
- `auditoria-a2/A3_7_4_3_GATE_B2_PART2_PUBLICATION_D_READINESS.md` (rewritten)
- `auditoria-a2/A3_7_4_3_GATE_B2_PART2_PRODUCTION_SAFETY.md` (rewritten)
- `auditoria-a2/A3_7_4_3_GATE_B2_PART2_MANIFEST.md` (rewritten)

No production code, migrations, tests, deploy state or historical manifests changed. No DB writes. No secrets. No Graph calls.

## Publication D

| Field | Value |
|---|---|
| id | `875587f5-0137-4477-904c-609e8e406ad6` |
| owner / business | `aabe426e-f079-4db1-835b-17d9d126313e` / `e6014022-370f-4ec0-a340-c7c55f808247` (Gopik.Digital) |
| draft version | 3 |
| image | `…/875587f5-…/ba93c54e-c0ee-4fa0-a7b4-8284cddaa808.png`, 1080×1350, 901,643 B, MD5 `fc3a190ee41708dc8b242ff5b711ae58` = asset |
| Instagram caption SHA-256 | `537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e` (157 chars, exact match) |
| Facebook text SHA-256 | `b1c4786b85c8892a6dc85c5196df1093b561a1a64ca6930aac504354f8b6c5b2` (= generated) |
| Expected derivative SHA-256 | `bc019d5ae146decf7dc22917027ccc4e0a1c7b2db2f3465bff14bd49ae726730` |
| Preflight (v3) | facebook: no issue; instagram: no issue |
| Attempts | 0 |

## Limitations

Token validity and Instagram account subtype rest on stored evidence only. They can't be verified read-only without a live Graph call, which wasn't done.

## Verdict

**GO — A3.7.4.3 GATE B.2 PART 2 PUBLICATION D READY; REAL INSTAGRAM E2E NOT AUTHORIZED**

STOP. Gate B.2 Part 3 / B.3 and the real E2E are not started.
