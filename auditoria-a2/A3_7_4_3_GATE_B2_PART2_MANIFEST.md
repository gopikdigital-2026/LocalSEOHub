# A3.7.4.3 — Gate B.2 Part 2 — Manifest

## Changed files

Production code: **none**. Tests: **none**. Historical manifests: not modified. Edge functions: none redeployed.

Added (audit only):
- auditoria-a2/A3_7_4_3_GATE_B2_PART2_PUBLICATION_D_READINESS.md
- auditoria-a2/A3_7_4_3_GATE_B2_PART2_PRODUCTION_SAFETY.md
- auditoria-a2/A3_7_4_3_GATE_B2_PART2_MANIFEST.md

A temporary local derivative-check test was created and deleted in the same step (not in the tree).

## Verified hashes (identical to Part 1)

| File | sha256 |
|---|---|
| instagram-publishing/instagramPublish.ts | 5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca |
| instagram-publishing/index.ts | b782a99fbc4a9ba06fd78f69d04b09e37607b5649052eb2aa231a9155e5a2605 |
| instagram-publishing/shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd |
| instagram-publishing/graph.ts | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a |
| instagram-publishing/derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa |
| instagram-publish/repository.ts | 9b5f26d48f0ab2ea632ebe42d2c2247d49005eca292140ca4ea3d78a1fe190dd |
| instagram-publish/InstagramPublishHarness.tsx | b7ea8c5c31b1002dd270c607d24c1fd3e3c99af89e9a8b92a863542651dbb4a9 |
| instagram-publish/copy.ts | fe8ce97b07d39fec6c312ef65057be2e2db83a304c6eda23b96faba9767884b9 |
| src/App.tsx | ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b |
| functions-deploy-state.json | 33fd37ab0af2cf2b2714e832f85e486fb6a0aed97572274cfe64e5bddc871357 |
| meta-publishing/{facebookPhoto,facebookPublish,handler,index}.ts | 7225bc3d… / 48da8e2f… / b7525645… / 027ee4fe… |
| Test asset PNG | 6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7 |

## Evidence summary

Preflight passed (identity, ownership, permissions snapshot, consent, entitlement, disarmed, 0 IG/active attempts). The derivative is valid and deterministic (bc019d5a…, 1080×1350, 87,040 B, no metadata). Tests 2937/0, tsc 20/0 new, build OK. Production state unchanged.

## Unresolved prerequisite

Publication D requires the owner to complete the normal workflow in the app while signed in. The agent cannot authenticate as the owner, and every alternative bypasses the workflow.

## Verdict

NO-GO — A3.7.4.3 GATE B.2 PART 2 REQUIRES CORRECTION

(The correction is owner action, creating D in the app. No code defect was found.)
