# A3.7.4.2 — Facebook Page Single-Photo Publishing — Real E2E Final (Gate B.3)

Date: 2026-10-30
Scope: post-publish verification, disarm, final freeze. No publish, no retry, no Instagram, no Facebook write performed by this audit.

**Result: real external Facebook E2E PASS. Post-disarm verification PASS. FINAL FREEZE.**

## 1. Publication C identity

| Field | Value |
|---|---|
| publication_id | b140fc59-6458-47d7-b695-df8781610ea5 |
| owner (Manuel) | aabe426e-f079-4db1-835b-17d9d126313e |
| business_id | e6014022-370f-4ec0-a340-c7c55f808247 |
| publication status / updated_at | proposals_ready / 2026-10-30 00:13:08.946825+00 (unchanged) |
| source_generation_id | 6d624a5b-44b2-4a82-b38b-35c99ae140c5 |
| Facebook caption md5 | 5e3dd1d5591f6f8267071ece78b1c6e5 (frozen value) |

## 2. Draft version

3 (draft updated_at 2026-10-30 00:18:03.275237+00, unchanged since Part 2).

## 3. Facebook Page

Localseohub.io — Page ID 1393994523793266 (meta_connections, status connected).

## 4. Meta object / post ID

`1393994523793266_122114709087502661`

Permalink stored: `https://www.facebook.com/122111374473502661/posts/122114709087502661`

The object ID prefix equals the connected Page ID 1393994523793266. The permalink path uses Facebook's profile ID for the Page (122111374473502661); the post suffix 122114709087502661 matches the object ID.

## 5. Attempt number

1

## 6. Idempotency key

`b140fc59-6458-47d7-b695-df8781610ea5:facebook:v3` — exact match with the expected identity.

## 7. Database evidence

`publication_publish_attempts` (whole table, read-only):

| Field | Value |
|---|---|
| total rows in table | 1 |
| id | aaca823e-44ab-4d67-bce2-aeee40d24ba7 |
| publication_id / channel / draft_version | C / facebook / 3 |
| status | succeeded |
| meta_object_id | 1393994523793266_122114709087502661 |
| error_code | null |
| retryable | false |
| verification_required | false |
| started_at | 2026-10-30 22:40:35.409695+00 |
| finished_at | 2026-10-30 22:40:42.724699+00 |

No second attempt, no duplicate succeeded row, no `publishing` row, no `unknown` row, no retry row.

## 8. Duplicate-prevention evidence

- Unique partial indexes present:
  - `publish_attempts_one_success (publication_id, channel) WHERE status='succeeded'`
  - `publish_attempts_one_active (publication_id, channel) WHERE status IN ('publishing','unknown')`
  - `publish_attempts_identity_live (publication_id, channel, draft_version) WHERE status IN ('publishing','succeeded','unknown')`
  - `publish_attempts_number_key (publication_id, channel, attempt_number)`
- Read-only `publication_publish_preflight(Manuel, C, 3)` returns facebook `ALREADY_PUBLISHED`, attempt_status succeeded, retryable false, with the same meta_object_id and permalink.
- With a stale version (2) it still returns `ALREADY_PUBLISHED`, so success takes precedence over a version conflict.
- With a foreign user it returns `INVALID_PUBLICATION_STATE` and leaks no data.
- `publish_attempt_begin` evaluates `publication_publish_gate` before any INSERT and returns the gate issue (ALREADY_PUBLISHED) without inserting. Any concurrent insert is also blocked by the unique indexes (PUBLISH_IN_PROGRESS).
  - `publish_attempt_begin` was deliberately NOT invoked in this audit, so that no row could be created.
- Edge function `facebook_publish` order:
  1. armed check (403 REAL_PUBLISH_DISABLED);
  2. preflight, where the issue returns before begin;
  3. begin;
  4. Meta calls.

  A succeeded C therefore produces zero external writes.
- `publish_attempt_finish` only transitions from `publishing`, so a succeeded row cannot be rewritten.

## 9. External Facebook evidence (Manuel)

Manuel confirmed visually on Facebook that the post is publicly visible on the Page Localseohub.io, with the expected image and the exact frozen caption.

The internal validation UI reported:
- Published / succeeded;
- preflight ALREADY_PUBLISHED;
- Meta object ID present;
- a "Ver en Facebook" link;
- the duplicate-publish button disabled.

This agrees with the stored row above.

Read-only confirmation through Graph API was not performed from this environment: the browser and the audit tooling hold no Meta tokens by design. The single LocalSEOHub-created object is proven by the attempts table, which has 1 row in total, and every Meta write path requires a row there first.

## 10. A/B preservation

| Publication | Draft row md5 | Publication status @ updated_at | Attempts |
|---|---|---|---|
| A 65569535-5d89-4df3-a8d4-c2af6df8606d | 5b7366bfcaa8e008b1ba5b38138bf8dd (= baseline) | proposals_ready @ 2026-10-27 23:05:19.287086+00 | 0 |
| B 442059e5-11e4-4bdd-a5bc-c714b0a03b72 | fd3e4f7a51725b58fced11e3ef4975ac (= baseline) | proposals_ready @ 2026-10-28 12:27:05.291163+00 | 0 |

## 11. Arming / disarming evidence

- Before Part 3A: neither secret existed.
- After Part 3A: Manuel added `META_FACEBOOK_REAL_PUBLISH_USER_IDS` and `META_FACEBOOK_REAL_PUBLISH_ARMED`, and he published once.
- First Gate B.3 run: both secrets were still present, so the verdict was NO-GO.
- **Post-disarm run: Manuel deleted both secrets manually.** The authoritative edge function secrets list from the production project no longer contains either name. The remaining names are SUPABASE_*, LocalSEO_AI, LocalSEO_KEY, STRIPE_*, ADMIN_EMAIL, GOOGLE_*, SITE_URL, META_APP_ID, META_APP_SECRET and META_REDIRECT_URI.
- Neither secret was recreated for testing. No secret values appear in this report.

## 12. Final server fail-closed evidence

Code-level, verified on the deployed source (meta-publishing hash ae6e628c…, hasChanged false):

- `isArmed()` returns false unless `META_FACEBOOK_REAL_PUBLISH_ARMED === "true"` exactly and the caller's UUID is in the parsed allow-list.
  - An absent flag means false; an absent or empty allow-list means false.
- `publish()` returns 403 `REAL_PUBLISH_DISABLED` before preflight, before begin, and before any Meta call.
- `facebook_publish_status` reports `armed:false` in that case, and the UI shows "Publicación real desactivada en el servidor".
- Unit tests in `a3742FacebookPhotoPublishing.test.ts` assert both paths: flag absent, and user not in the list. Neither performs a fetch nor calls begin.

Post-disarm proof:
- The production config has no `META_FACEBOOK_REAL_PUBLISH_ARMED`, so `env()` returns undefined, `!== "true"`, and `isArmed` is false for every user, including Manuel.
- The production config has no `META_FACEBOOK_REAL_PUBLISH_USER_IDS`, so the allow-list parses to `[]` and `isArmed` is false, even if the flag were ever re-added alone.
- There is no default or fallback: the flag needs the exact string `"true"`, the list defaults to empty, and there is no other env var, DB setting, header or request field read by `isArmed`.
- `publishFacebookPhoto` (the only POST /photos) is imported only by `facebookPublish.ts` and is reached only after the `isArmed` gate in `publish()`. Its source sha256 is unchanged and the deployed hash is ae6e628c… (hasChanged false), so production runs this exact code.
- An otherwise eligible unpublished publication is therefore rejected with 403 `REAL_PUBLISH_DISABLED`, state NOT_REQUESTED, before preflight, attempt creation or any Meta call. The UI shows "Publicación real desactivada en el servidor" (`armedOff`) and "La publicación real está desactivada en el servidor." (`REAL_PUBLISH_DISABLED`).
- No new publication or attempt was created to show this. Proof is the production secret state plus the deployed code path, and the unit tests in `a3742FacebookPhotoPublishing.test.ts` (flag absent; user not listed), which assert 403 with zero fetch and zero begin calls.

## 13. Tests / typecheck / build

| Check | Result |
|---|---|
| Full suite | 84 files / 2874 tests passed (= baseline) |
| Facebook / publishing focused suites (a3742, a3741, FIX03 panel, publishing-access) | 4 files / 150 passed |
| TypeScript | 20 errors, all inherited (App, legacy landings, AdminDashboard, a3422 test); 0 new |
| Production build | PASS |

Security posture (read-only):
- `meta_read_token`, `publication_publish_gate`, `publication_publish_preflight`, `publish_attempt_begin` and `publish_attempt_finish` are not executable by anon or authenticated; they are service-only.
- The `publication-images` bucket is private (`public=false`).
- Meta user and Page tokens and appsecret_proof are only handled inside the edge function.
- The browser receives status and IDs only.

Guarantees re-confirmed:
- one success per publication/channel;
- one active attempt per publication/channel;
- succeeded is not retryable;
- UNKNOWN is not blindly retryable (`retryable=false`, verification_required);
- version conflict fails closed;
- a foreign user fails closed;
- explicit confirmation is required (POST action from the user click only);
- no auto-publish path.

No A3.7.4.1 guarantee was modified, and no code changed in this phase.

Post-disarm global attempt accounting (whole `publication_publish_attempts`):

| Metric | Count |
|---|---|
| total | 1 |
| succeeded | 1 |
| publishing | 0 |
| unknown | 0 |
| failed | 0 |
| facebook | 1 |
| instagram | 0 |

After disarm, the attempt row is byte-identical to before: same id, key, meta_object_id, permalink and updated_at 22:40:42.724699+00. C preflight is still `ALREADY_PUBLISHED`; foreign user `INVALID_PUBLICATION_STATE`; C draft is still v3 with caption md5 5e3dd1d5…; A/B draft md5 and status timestamps are unchanged with 0 attempts. A repeated browser click on C now stops at the arming gate (403), and even if re-armed it would stop at preflight (ALREADY_PUBLISHED) and at the unique indexes, so a second Facebook post cannot be created.

## 14. Remaining known limitations

1. The runtime 403 was not triggered with a live user session, because audit tooling holds no user JWT and creating an extra eligible publication was prohibited. Fail-closed is proven from the production secret state, the deployed code hash and the unit tests.
2. There is no independent Graph API read-back from audit tooling; the external evidence is Manuel's visual confirmation plus the stored permalink.
3. `publications.status` stays `proposals_ready` after a Facebook success; publication state is tracked per channel in the attempts table (by design).
4. Instagram is out of scope (C's Instagram preflight: IMAGE_UNSUPPORTED).

## 15. Verdict

**GO — FINAL FREEZE A3.7.4.2 FACEBOOK SINGLE-PHOTO PUBLISHING**

The earlier NO-GO (arming secrets still present) is resolved: both secrets are deleted and the server fails closed. Every material check passes. A3.7.4.3 (Instagram) is not started.
