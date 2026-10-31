# A3.7.4.3 — Gate B.3 FIX01 — Security

## Threat controls (all enforced server-side)

| Requirement | Control | Evidence (test in a3743GateB3Fix01ConnectionPreflight.test.ts) |
|---|---|---|
| Owner JWT required | Gateway `verify_jwt=true` + handler `getUserId`; 401 before any lookup | "missing or invalid JWT…"; live probes 401 |
| Strict input | Keys limited to {action, publicationId}; UUID; no version/retry flags | "malformed body, unknown keys…" |
| Internal test entitlement | `internal_test_entitlement_active` (SECURITY DEFINER, service_role only) checked **before** ownership, token or Graph | "missing internal test entitlement…" |
| Non-owner rejected | publications and businesses filtered by `user_id = jwt user`; 404, no token read | "non-owner (entitled) user…" |
| Wrong business or connection | meta_connections filtered by user + business + both statuses connected; numeric IDs required; 409 | "wrong business or missing connection…" |
| Missing Vault credential | token check fails (TOKEN_UNAVAILABLE); zero Graph calls | "missing Vault credential…" |
| Expired, invalid or foreign token | TOKEN_EXPIRED / TOKEN_INVALID / TOKEN_APP_MISMATCH; code 190 maps to TOKEN_INVALID | "expired, invalid, foreign-app…" |
| Missing permissions | per-permission map + missing list | "missing or declined permissions…" |
| Wrong Page / IG link | stops before any IG read | "incorrect Page association…" |
| Wrong IG account / username | INSTAGRAM_ACCOUNT_MISMATCH / INSTAGRAM_USERNAME_CHANGED | "incorrect Instagram account…" |
| Inconclusive vs failed | Unreadable limit gives INCONCLUSIVE; error code 10 gives FAIL; subtype never claimed | "eligibility is inconclusive…", "debug_token unavailable…" |
| Bounded Meta timeout | 8 s abort per call; META_TIMEOUT; INCONCLUSIVE | "Meta timeout is bounded…" |
| Sanitized errors | Graph message, fbtrace_id and error_user_msg are never returned or logged; logs contain stage/http/code only | "raw Graph errors…", "unexpected internal failure…" |
| GET only, read paths only | Exactly 5 GETs, no body, origin graph.facebook.com; never /media, /media_publish, /photos or /feed | "only GET requests…" |
| Token handling | User token only in the Bearer header (and the debug_token `input_token`); Page token stays in memory and never appears in a URL; `appsecret_proof` is a 64-hex value; no token, secret, proof or "Bearer" text in the response | "tokens travel only in the Authorization header…" |
| No DB or storage writes, no attempts | Module source: no insert/update/upsert/delete/upload/remove/createSignedUrl/rpc; index.ts preflight dependencies use only `.rpc("internal_test_entitlement_active")` and `.rpc("meta_read_token")` plus SELECTs | "dependencies are read-only…" |
| No P1/P2 activation | Module does not reference arming flags, isArmed, isAuthorizedToPublish or instagramPublish; even with all arming env set, `publishing_enabled:false`, no armed or trigger field, and only META_APP_ID/META_APP_SECRET are read | "arming secrets present or absent…" |
| A/B/C/D unchanged | Exactly one lookup of the requested publication; response has no caption, image, version, draft or attempt data | "only the requested publication…"; production SQL below |
| Browser hygiene | Client sends only {action, publicationId}; no fetch(, graph.facebook.com, access_token, appsecret, META_, signedUrl, image_url, storage or localStorage; no timers or refetch; single button; T33 secret scan over the whole feature dir | "browser panel" tests |
| Publish button unchanged | Enable expression asserted verbatim; the panel never imports requestInstagramPublish or canTrigger | "the panel mounts inside the existing internal harness…" |
| Frozen code | sha256 pins on instagramPublish/graph/shared/derivative/repository, the 4 Facebook files and App.tsx; config `verify_jwt = true` | "app routing, function config and frozen publishing engine…" |

## Production safety evidence (read-only SQL, after deployment)

**Publication D** `875587f5-0137-4477-904c-609e8e406ad6`:
- Draft is at **version 3**. Instagram caption sha256 `537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e` is unchanged.
- Draft updated_at is 2026-10-31 16:22:09.849195+00 and publication updated_at is 16:16:13.516242+00, both unchanged. Status is `proposals_ready`.
- Image: `aabe426e…/e6014022…/875587f5…/ba93c54e-c0ee-4fa0-a7b4-8284cddaa808.png`, 1080×1350, image/png, 901,643 B. The storage object size is 901643 and the eTag is `fc3a190ee41708dc8b242ff5b711ae58`, unchanged.

**A/B/C updated_at** (unchanged):
- 65569535: 2026-10-27 23:05:19.287086
- 442059e5: 2026-10-28 12:27:05.291163
- b140fc59: 2026-10-30 00:13:08.946825

**Counts:**
- 18 publications.
- Attempts: **1 facebook / succeeded**, **0 instagram**, **0** active or UNKNOWN (not succeeded or failed), **0** with `meta_container_id`.

**Buckets:**
- `publication-images` is private with 18 objects.
- `instagram-derivatives` is private with **0** objects.

**Secrets:** no arming secret is present. META_APP_ID, META_APP_SECRET and META_REDIRECT_URI are present by name; values were not read.

## Not performed (by design)
- No live Meta call was made by the agent. There was no owner session, impersonation or forged token.
- No /media or /media_publish call, no container, no publishing, no change to D, no end-to-end test and no next gate.
