# A3.7.5.2 — Security Audit (FIX01)

All production checks below were read-only, except one DO-block proof that raised an exception at the end so every write was rolled back (row count before and after: 1).

## 1. Cross-tenant account assignment — database layer

| Check | Result |
|---|---|
| `meta_connections_page_assignment_key` live | `CREATE UNIQUE INDEX … USING btree (page_id) WHERE (page_id IS NOT NULL)` |
| `meta_connections_instagram_assignment_key` live | `CREATE UNIQUE INDEX … USING btree (instagram_account_id) WHERE (instagram_account_id IS NOT NULL)` |
| Duplicate page_id / instagram_account_id rows in production | 0 / 0 (1 connection row) |
| `meta_claim_page_selection` ACL | `{postgres=X, service_role=X}`; anon / authenticated have no EXECUTE |
| SECURITY DEFINER / search_path | true / `""` |

Live rolled-back proof, a second tenant in `page_selection_required` offered the owner's Page:

| Attempt | Result |
|---|---|
| Claim owner's Page | `page_assigned` |
| Claim another Page carrying owner's IG id | `instagram_assigned` |
| Direct `UPDATE … SET page_id = <owner page>` bypassing the function | blocked by unique index (`unique_violation`) |
| Foreign user id against owner's connection id | `not_pending` (no change) |

So the protection holds even if application checks are skipped: the index rejects the write itself.

## 2. Cross-tenant account assignment — server layer

- `select_page` requires a verified JWT (401 otherwise), only Pages in the caller's own `available_pages` (403 `PAGE_NOT_AUTHORIZED`), and passes the server-derived `userId` to the claim.
- Conflict responses are `{code, error}` only — no holder id, user, Page name, IG id/username or token (asserted in tests).
- Owner reconnection: the claim excludes the caller's own connection id; releasing on disconnect is handled by the existing wipe trigger.

## 3. Internal route isolation

- `internal-access` (verify_jwt=true): 401 no user, 403 non-admin, 403 when `ADMIN_EMAIL` missing/empty/whitespace (fail closed), 200 operator. Comparison trimmed + case-insensitive. CORS on all responses.
- `InternalGuard` mounts nothing until the server answers `allowed`; any error -> denied -> `/hoy`. It wraps the whole internal layout (including `PublicationResumeProvider`), so no internal data hook runs for customers.
- The frontend guard is defence in depth only. Every internal publishing action is enforced server-side independently (§4).

## 4. Internal publishing actions — server-side protection (independent of frontend)

| Layer | meta-publishing (FB) | instagram-publishing (IG) |
|---|---|---|
| JWT | verify_jwt=true + `AUTH_REQUIRED` 401 | verify_jwt=true + user resolution |
| Arming switch | `META_FACEBOOK_REAL_PUBLISH_ARMED` must be `"true"` + user allowlist | `META_INSTAGRAM_REAL_PUBLISH_ARMED` + user + publication allowlists |
| Production state | arming secrets absent -> disarmed | absent -> disarmed; internal test entitlement expired |
| DB attempt functions | `publish_attempt_*` EXECUTE service role only | same |

A customer reaching the internal URL directly, or calling the functions directly, cannot publish.

## 5. Frozen engines

All 11 files of `meta-publishing/*` and `instagram-publishing/*` byte-identical to A3.7.5.1 (SHA-256):

```
b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db instagram-publishing/connectionPreflight.ts
be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa instagram-publishing/derivative.ts
a107c840cba644967c9a911ef923755176de0b7674530372a506bdc1333bb61e instagram-publishing/graph.ts
6312ea2ebf7210d10e0319373d3cf48381e2925b23934a169a65b475334ea675 instagram-publishing/index.ts
df94b08fcbd2134d17a85a3ecdaefdfcdda51a36014771585a6510787ad200f1 instagram-publishing/instagramPublish.ts
d58f363b11e2c02a027da341e0c46c97691fc0490d4435287442b09c16d1040d instagram-publishing/publishTarget.ts
2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd instagram-publishing/shared.ts
7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a meta-publishing/facebookPhoto.ts
48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd meta-publishing/facebookPublish.ts
b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb meta-publishing/handler.ts
027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23 meta-publishing/index.ts
```

The A3.7.5.2 migration does not reference `publish_attempt_*`. No Meta secret changed. No publishing performed.

## 6. Residual risks

- Single-operator model (`ADMIN_EMAIL`); rotating the operator means changing a secret.
- Legacy `meta_finish_page_selection` is unused but still callable by the service role (no uniqueness pre-check; the indexes still block duplicates).
- Deployment provenance pending owner ratification (Implementation Report §5).
