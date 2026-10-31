# A3.7.4.3 — Gate B.3 Part 1 — Live Read-Only Meta Preflight

Date: 2026-10-31
Scope: READ-ONLY VERIFICATION ONLY. Real Instagram publishing NOT authorized.
Baseline: Gate B.2 Part 2 (GO), `localseohub-a3743-gateB2p2.zip`.

## 1. Result summary

| Area | Result |
|---|---|
| Live Meta verification (section 3 of the brief) | **BLOCKED, not performed** |
| Publication D state | PASS |
| Security / disarmed state | PASS |
| Regression | PASS |

Verdict: **NO-GO — A3.7.4.3 GATE B.3 PART 1 REQUIRES CORRECTION** (cause: live Meta preflight couldn't be executed within the authorized boundaries; no defect found).

## 2. Live Meta verification: exact blocker

### 2.1 Where the credential lives

- The Meta user token is held in Supabase Vault; `meta_connections.user_token_ref` points to it.
- It is readable only through `public.meta_read_token(p_connection_id)`. EXECUTE is granted to `postgres` and `service_role` only (`anon`/`authenticated`/`PUBLIC` have none).
- It is consumed only inside edge functions, together with `META_APP_SECRET` (for `appsecret_proof`).

### 2.2 Available server-side paths, assessed

| Path | Calls Graph? | Usable read-only, now? | Why not |
|---|---|---|---|
| `instagram-publishing` `instagram_publish_status` | No (DB preflight + storage derivative check only) | n/a | Doesn't reach Meta |
| `instagram-publishing` `instagram_publish` / `instagram_publish_verify` | Yes | No | Write path / gated by arming + allowlist; owner JWT required; out of scope |
| `meta-connection` select page | Yes (`/{page}?fields=instagram_business_account`, `/{ig}?fields=id,username`) | No | Requires owner JWT and `page_selection_required` state; **writes** connection state |
| `meta-read` sync | Yes | No | Requires owner JWT; **writes** snapshots |
| `meta-oauth-start/callback` (`/me/permissions`, `/me/accounts`) | Yes | No | Starts a new OAuth flow; explicitly prohibited |
| Database-originated HTTP | — | No | Neither `http` nor `pg_net` is installed (extensions: pg_stat_statements, pgcrypto, plpgsql, plpgsql_check, supabase_vault, uuid-ossp) |

All three edge functions have `verify_jwt = true`, and the agent has no owner session.

### 2.3 Rejected workarounds (would breach the brief)

- **Pull the token out of Vault into the agent sandbox and call Graph from there.** This moves a production credential outside server-side infrastructure, which breaches "existing authorized server-side credentials" and "never expose tokens".
- **Deploy a new or temporary read-only edge function or action.** This is a production code change, which is prohibited in this gate.
- **Forge an owner JWT or start re-OAuth.** Both are prohibited.

### 2.4 Items therefore NOT live-verified

| Item | Stored DB snapshot (not live) |
|---|---|
| Token validity / expiry | `token_expires_at = null`; no `last_error`; connection `connected` since 2026-10-29 18:06:07.726431+00 |
| Permissions | `business_management, instagram_basic, instagram_content_publish, pages_manage_posts, pages_read_engagement, pages_show_list, public_profile` (checked 2026-10-29 18:06:07) |
| Instagram identity | `17841462487279994`, `@localseohub.io`, instagram_status `connected` |
| Professional account / subtype | not stored |
| Page association | Page `1393994523793266` → IG `17841462487279994` (stored at page selection) |
| Token access to IG account | not verifiable without Graph |

## 3. Correction options (each requires separate authorization)

1. **Recommended: a minimal read-only live-preflight action.** Add it to `instagram-publishing`, owner-JWT gated, with no DB writes and no arming required. It would only issue these GETs (with `appsecret_proof`):
   - `/debug_token`: `is_valid`, `expires_at`, `data_access_expires_at`, `scopes`
   - `/{page}?fields=id,instagram_business_account`
   - `/{ig}?fields=id,username`
   - `/{ig}/content_publishing_limit`: confirms publish capability and quota without creating media

   It would return booleans and IDs only, never tokens. The owner then clicks a "Check connection" button while signed in. This needs a code-change authorization plus tests, deploy and re-freeze.
2. **Owner-supplied evidence.** The owner checks in Meta Business Suite or the Access Token Debugger that the token is valid, the scopes are present, and @localseohub.io is a Business/Creator account linked to the Page. This is weaker: it's attested by the owner, not verified by the system.
3. **Defer to the real E2E.** The publish flow itself re-resolves the Page token and checks `instagram_business_account == 17841462487279994` before `/media`, and fails closed with mapped errors. This doesn't satisfy this gate's "verify before authorizing" intent.

## 4. Publication D (read-only, DB + storage)

| Check | Evidence | Result |
|---|---|---|
| UUID / count | `875587f5-0137-4477-904c-609e8e406ad6`, 1 row | PASS |
| Business / owner | `e6014022-…` Gopik.Digital; publication and business owner `aabe426e-…` | PASS |
| Draft version | 3 (unchanged; draft updated_at 2026-10-31 16:22:09.849195+00) | PASS |
| Publication updated_at | 2026-10-31 16:16:13.516242+00 (unchanged since B.2 P2) | PASS |
| Instagram caption SHA-256 | `537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e` (unchanged) | PASS |
| Facebook text | = generated; SHA-256 `b1c4786b…f8b6c5b2` (unchanged) | PASS |
| Original image | private `publication-images`, 901,643 B PNG 1080×1350, eTag `fc3a190ee41708dc8b242ff5b711ae58` = asset MD5 | PASS |
| Server preflight v3 (STABLE, no writes) | instagram: no issue, draft_version 3 | PASS |
| Attempts for D | 0 | PASS |
| Instagram attempts / UNKNOWN or active | 0 / 0 | PASS |
| External IG containers | `meta_container_id` non-null rows: 0; no `/media` call made by this gate | PASS (DB evidence; Meta-side not listable without Graph) |
| A/B/C | updated_at unchanged | PASS |

## 5. Remaining prerequisites for a future real E2E

1. Correct this gate: live Meta preflight via option 1 (or an accepted alternative).
2. Separate written authorization for the real Instagram E2E.
3. At that time only, set the three secrets: `ARMED=true`, `USER_IDS=aabe426e-…`, `PUBLICATION_IDS=875587f5-…`.
4. Publish with expected version 3. Any edit to D changes the version and needs a re-audit.
5. Disarm immediately after the single attempt.

## 6. Verdict

**NO-GO — A3.7.4.3 GATE B.3 PART 1 REQUIRES CORRECTION**
