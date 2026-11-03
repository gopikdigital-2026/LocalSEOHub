# A3.7.5.3 — Security Audit

All A3.7.5.2 protections are preserved; no server, DB or secret change was made.

| Control | Evidence | Status |
|---|---|---|
| OAuth state integrity | State and binding stored only as SHA-256 hashes with expiry; consumed once; malformed/unknown/reused/wrong-user → `OAUTH_STATE_INVALID`; expired → `OAUTH_STATE_EXPIRED` (a351 E/F, a3512) | PASS |
| Callback integrity | Callback accepts only a 64-hex completion and `[A-Z_]{3,40}` error codes; URL cleared with `history.replaceState`; completion needs the browser binding held in sessionStorage; wrong user / binding → 403 | PASS |
| Business ownership | `meta-connection` resolves the user from the JWT; operates only on `getOwnConnection(userId)`; no client-supplied user/connection id | PASS |
| Server-side authorization | `meta-oauth-start`, `meta-connection`, `internal-access` verify_jwt=true; callback verify_jwt=false by design (Meta redirect) and protected by state | PASS |
| Tenant isolation (DB) | Live: one policy `select_own_meta_connection` (`auth.uid() = user_id`); `authenticated` holds column-level SELECT only, on non-secret columns; no INSERT/UPDATE/DELETE for anon/authenticated | PASS (verified in production, read-only) |
| Page / IG uniqueness | Partial unique indexes + `meta_claim_page_selection` (SECURITY DEFINER, `search_path=''`, service_role only); 409 `META_PAGE_ALREADY_ASSIGNED` / `META_INSTAGRAM_ALREADY_ASSIGNED` (a3752) | PASS, unchanged |
| Token protection | Tokens only in Vault; repository `COLUMNS` excludes them; card/UI scanned for token terms (a351, a3742B1Fix01) | PASS |
| Reconnect | `auth_type=rerequest`, new state per attempt, reconnecting user must own the row; claim rejects Pages owned by another tenant | PASS |
| Disconnect | Confirmation dialog in UI; server revokes (best effort) and deletes Vault secret; wipe trigger nulls Page/IG; still disconnects locally if Meta revocation fails | PASS |
| Cross-customer data | Error bodies are code-only; a3752 asserts no foreign ids/names/tokens in 409 responses | PASS |
| Logs | Callback logs only `stage`, `ok`, `http`, `result`, Graph `code` — no tokens, ids or emails | PASS |
| Publishing | Arming secrets absent; frozen engines unchanged (hash identical); publishing step now hidden from non-operators in the UI (server gating unchanged) | PASS |
| New frontend code | No `dangerouslySetInnerHTML`, no new network calls besides the existing `internal-access` check (fails closed to "denied") | PASS |

Residual notes
- Hiding the publishing step is a UX measure; the authoritative control remains server-side (entitlement + arming secrets), unchanged.
- Production migration count gap (61 vs 62 files) is pre-existing and unrelated.
