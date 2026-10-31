# A3.7.4.3 — Gate B.4 — FIX01 — SECURITY REPORT

## 1. Current security posture (unchanged from B.4)
Every finding below is still OPEN, because no correction was applied. Real publishing must stay disabled. The safeguards currently in force are unchanged:
- no META_INSTAGRAM_* arming secrets
- 0 IG attempts, 0 containers, 0 derivatives
- private buckets
- verify_jwt = true
- service_role-only RPCs

| ID | Severity | Status | Exploit precondition |
|---|---|---|---|
| B4-F1 | Critical (double publish) | OPEN | Arming plus a stalled attempt that has reached publish_requested |
| B4-F2 | High | OPEN | Arming after entitlement expiry (2026-11-01 22:21:13 UTC) |
| B4-F3/F4/F5 | High | OPEN | Arming; D content or version changed, or storage object replaced |
| B4-F6 | High (double publish) | OPEN | Arming plus a 4xx RATE/TEMP response at /media_publish |
| B4-F7 | Medium (lost media id) | OPEN, not in FIX01 scope | finish RPC failure after a successful publish |
| B4-F8 | Medium (evidence) | OPEN, procedure designed | n/a |

## 2. DB transition safety design (F1 / F6)
Invariant to enforce in the database, not in the client:

> An attempt whose `external_stage` has reached `publish_requested` must never become `retryable = true`, and must never leave `unknown` except via `found` (succeeded) or an explicit owner-authorized resolution.

Enforced at three layers:
1. **`publish_attempt_record_verification`**: lock the row and check the stage at decision time; `absent` is refused at `container_created` and `publish_requested`.
2. **`publish_attempt_finish`**: at `publish_requested`, failed RATE or TEMP outcomes are coerced to `unknown`.
3. **`publish_attempts_guard` trigger**: rejects `retryable = true` whenever `OLD.external_stage = 'publish_requested'`. This catches every path, including future ones.

`mark_stale` returns the stage read under the same lock, so `verify()` never decides from a snapshot. Every RPC error is fail-closed: no write, and the attempt stays blocking. UNKNOWN keeps `publish_attempts_one_active` occupied, which blocks any new begin.

Required deterministic tests:
- B4-F1 interleaving (snapshot container_created → advance → stale → absent ⇒ invalid_transition).
- absent at none and at container_requested ⇒ allowed.
- guard rejection.
- finish coercion.
- 429 / temporary / timeout / ambiguous body at /media_publish ⇒ unknown and retry refused.

## 3. Authorization design (F2)
- Entitlement is checked before begin, before each Graph write (container and media_publish), and at the start of verify.
- The begin RPC re-checks it in SQL.
- Errors fail closed.
- No renewal or creation.
- Owner, business and publication allowlists are kept.

## 4. Content integrity design (F3/F4/F5)
- Server constant pin (id, v3, caption sha, original image sha). The browser value must equal it, and only the constant is used.
- Caption hash checked after begin. Image bytes hashed after download and before any side effect.
- Derivative hash recorded at build time and re-verified, together with the caption snapshot, immediately before /media_publish.
- Any mismatch ⇒ no POST, and the attempt is closed non-retryable.

## 5. F8 — deployment evidence procedure (designed, not executed)
1. **Source identity.** Compute a deterministic manifest: the sorted sha256 of every file in `supabase/functions/instagram-publishing/` plus `config.toml`, then a sha256 of that manifest (the "bundle source hash"). Record it in the gate manifest.
2. **Build identity constant.** Embed `BUILD_ID = <bundle source hash of the approved commit, excluding this constant's file>` in a dedicated file that the status action returns, read-only and unauthenticated-safe, with no secrets.
3. **Deploy.** A single authorized deploy. Record the tool output: function id, version number, deploy timestamp and platform ezbr/eszip hash.
4. **Post-deploy probe.** Call the read-only `instagram_publish_status` with an owner JWT. Expected: `BUILD_ID` equals the approved hash. Also record the function version from the platform listing and compare it to step 3.
5. **Verifiable vs UNKNOWN.**
   - Verifiable: that the deployed runtime reports the approved BUILD_ID, and that the platform version incremented exactly once at the recorded time.
   - Remains UNKNOWN: byte equality of the deployed bundle with local sources. The platform eszip hash is computed over a bundled artifact, not over source, and the current deployed hash `7daa1d63…2284` cannot be mapped to local files. A matching BUILD_ID proves only that the constant was deployed, not that every other byte is identical.
   - A local hash never proves the deployment.

## 6. Remaining risks
- All findings stay open until authorization is granted and FIX01 is applied.
- F7 is out of scope.
- F9: the entitlement expires 2026-11-01 22:21:13 UTC. After that the B.4 E2E window closes. No renewal was performed, as required.
- Meta API semantics: there is no Graph primitive that proves absence after /media_publish. Caption-match verification remains heuristic, so UNKNOWN may require manual owner resolution.

## 7. Prohibited actions — confirmation
- No secrets activated.
- No Graph POST, no container, no publishing.
- D not modified.
- No production DB change, no migration applied, no deploy.
- No entitlement renewal.
