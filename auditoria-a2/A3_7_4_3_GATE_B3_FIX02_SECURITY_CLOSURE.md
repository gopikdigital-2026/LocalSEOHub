# A3.7.4.3 GATE B.3 — FIX02 SECURITY CLOSURE

Date: 2026-10-31. All checks read-only (SELECT queries, function/secret listing). No database writes, no deployments, no Graph API calls, no `/media` or `/media_publish`.

## Production safety

| Check | Expected | Observed | OK |
|---|---|---|---|
| FIX02 migration applied | once | 1 row (schema_migrations total 59; 60 local files) | yes |
| service_role column SELECT on publication_publish_attempts | 9 columns | attempt_number, channel, external_stage, id, meta_container_id, publication_id, started_at, status, user_id | yes |
| Table-level grants (service_role / anon / authenticated) | authenticated SELECT only | authenticated:SELECT | yes |
| RLS on publication_publish_attempts | on, 1 policy | true, 1 | yes |
| Publication D 875587f5-0137-4477-904c-609e8e406ad6 | proposals_ready, 16:16:13.516242 | proposals_ready, 2026-10-31 16:16:13.516242+00 | yes |
| D draft | v3, 16:22:09.849195 | v3, 2026-10-31 16:22:09.849195+00 | yes |
| D caption sha256 | 537130129640e265… | 537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e | yes |
| D image | 901,643 B, eTag fc3a190e… | 901643 B, fc3a190ee41708dc8b242ff5b711ae58 | yes |
| Publications A/B/C drafts | unchanged | 65569535 v4 (2026-10-28 09:15:04), 442059e5 v3 (2026-10-28 12:30:28), b140fc59 v3 (2026-10-30 00:18:03); no newer writes | yes |
| Publish attempts | 1 Facebook succeeded | aaca823e facebook succeeded, updated 2026-10-30 22:40:42.724699 | yes |
| Instagram attempts | 0 | 0 | yes |
| Active / UNKNOWN attempts | 0 | 0 | yes |
| Instagram containers (meta_container_id not null) | 0 | 0 | yes |
| Buckets | both private | publication-images private (18 objects), instagram-derivatives private (0 objects) | yes |
| META_INSTAGRAM_* arming secrets | absent | absent (only META_APP_ID, META_APP_SECRET, META_REDIRECT_URI present) | yes |
| instagram-publishing function | ACTIVE, verifyJWT true, id a3008491-… | ACTIVE, verifyJWT true, a3008491-be86-40c3-ae41-0a93ee773be4 | yes |

## Local function source (unchanged, not redeployed)

| File | sha256 |
|---|---|
| instagram-publishing/index.ts | f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28 |
| instagram-publishing/connectionPreflight.ts | b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db |
| instagram-publishing/derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa |
| instagram-publishing/graph.ts | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a |
| instagram-publishing/instagramPublish.ts | 5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca |
| instagram-publishing/shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd |
| supabase/config.toml | fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a |

## Security impact of this step

None. The only changes are three expected-hash strings inside two test files. No runtime code, permission, secret or data was touched.
