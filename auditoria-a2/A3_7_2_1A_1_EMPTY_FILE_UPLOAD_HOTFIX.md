# A3.7.2.1A.1 — Empty-File Upload Hotfix (Publications Validation Harness)

Verdict: **GO — EMPTY FILE UPLOAD HOTFIX READY FOR REAL RETEST**

## 1. Executive Summary
Real browser uploads reached `publication-media` with no body, so the server correctly returned FILE_EMPTY. Root cause: `@supabase/functions-js` 2.4.6 `invoke()` only assigns the request body when the caller does NOT pass a `Content-Type` header; the client passed `Content-Type: image/jpeg`, so the body was silently dropped. Fix is client-only: image bytes are now posted with `fetch` directly to the same function URL with the user's session. Server unchanged.

## 2. Real Production Symptom
Authenticated user, business Gopik.Digital, normal JPEG, preview OK, "Subir foto" → "El archivo está vacío." No AI generation attempted.

## 3. Reproduction
New test drives the real `FunctionsClient.invoke` with a non-empty JPEG `File` and `headers: {'Content-Type': 'image/jpeg'}` and captures the fetch init: `body === undefined`. Reproduced deterministically.

## 4. Root Cause
`FunctionsClient.invoke` (node_modules/@supabase/functions-js/dist/module/FunctionsClient.js): `let body;` is only set inside `if (functionArgs && (!headers || !headers.hasOwnProperty('Content-Type')))`. Supplying Content-Type skips the whole branch; `fetch(url, { headers, body })` is then sent with `body: undefined`.

## 5. Previous Client Contract
`db.functions.invoke('publication-media?action=attach&publication_id=…', { method: 'POST', body: file, headers: { 'Content-Type': mime } })`. Intended: raw bytes + real image MIME. Actual: headers only, no body.

## 6. Previous Server Contract (unchanged)
Raw image bytes as the request body; declared `Content-Type` must be image/jpeg or image/png and must match magic bytes; `Authorization: Bearer <user JWT>`; `action` and `publication_id` in the query string; streamed read capped at 8 MB.

## 7. Exact Byte-Loss Point
Client side, inside `functions.invoke`, before the network. `readLimited()` saw `req.body === null` → zero bytes → `inspectImage` → FILE_EMPTY (400). The server behaved correctly.

## 8. Fix
`src/features/publications/repository.ts`:
- `attachImage`/`replaceImage` → `uploadBytes`: precheck (size > 0, ≤ 8 MB, JPEG/PNG), read the session from `db.auth.getSession()` (no session → `unauthenticated`, nothing sent), then `fetch(${VITE_SUPABASE_URL}/functions/v1/publication-media?action=…&publication_id=…, { method: 'POST', headers: { Authorization: Bearer <user token>, apikey: <anon key>, 'Content-Type': mime }, body: file })`.
- The exact selected `File` is the body; no JSON, no FormData, no copying.
- Error responses mapped by the shared `responseErrorCode` (same SERVER/GATE code tables). Network failure → `unavailable`.
- Delete still uses `functions.invoke` (no body, unaffected).

## 9. New Upload Contract
CLIENT SENDS: POST raw File bytes; Content-Type = real image MIME; Authorization = user access token; apikey = public anon key.
EDGE FUNCTION RECEIVES: the same request (gateway `verify_jwt = true` verifies the user token).
EDGE FUNCTION PARSES: `readLimited` streams `req.body` with the 8 MB cap.
HANDLER RECEIVES: non-empty `Uint8Array` + declared MIME → sniff/match → dimensions → normalize (strip EXIF/GPS).
STORAGE RECEIVES: normalized bytes at `userId/businessId/publicationId/<uuid>.jpg|png` in the private bucket; row set to `image_ready`.

## 10. Security Preservation
No server change. Auth, ownership of publication and business, private bucket, service role server-side only, JPEG/PNG only, 8 MB limit, magic-byte check, dimension limits, metadata/GPS stripping, safe object path, no public URL, replace/delete conditions: all unchanged. Browser only uses the public anon key and the user's own session token.

## 11. Empty-File Validation
Zero-byte File → client `file_empty`, nothing sent. Body-less request to the real handler → 400 FILE_EMPTY (test). Server FILE_EMPTY response → `file_empty` message (test).

## 12. JPEG Validation
Real fixture JPEG `File` → real handler: request body length = file length, stored as image/jpeg, normalized smaller (metadata stripped), safe path, `image_ready`.

## 13. PNG Validation
Real fixture PNG `File` → `image_ready`, image/png.

## 14. MIME/Magic Validation
PNG bytes declared image/jpeg → server UNSUPPORTED_MEDIA_TYPE, nothing stored. GIF/HEIC rejected by precheck (existing tests).

## 15. Harness Behaviour
After a successful upload the page shows "uploaded", the replace hint, the language selector and "Generar 3 propuestas reales". Generation runs only from that button (test: `generateProposals` called once in the page, never in the upload path). A failed attach deletes the new draft.

## 16. AI Usage Confirmation
No call to `publication-proposals` in the upload path or in any verification. AI usage consumed by this hotfix: zero.

## 17. Tests Added
`a37211aUploadBytes.test.ts` (root-cause reproduction, JPEG/PNG end-to-end through the real handler, empty file, body-less server rejection, MIME mismatch, size limit, no JSON/FormData/AI in upload path, no auto-generation, failure cleanup). `a371PublicationsRepository.test.ts` updated: upload uses fetch with bytes/token/MIME, FILE_EMPTY mapping, network failure, missing session.

## 18. Full Regression
70 files, 2415 tests, 0 failures.

## 19. TypeScript
20 errors, all legacy; none new.

## 20. Build
Pass.

## 21. Frozen Hash Verification
Pinned-hash tests pass for Meta OAuth start/callback, Meta Connection, Meta Read, Social Intelligence, Hoy, Plan and App.tsx. `publication-proposals` and `publication-media` sources not modified (A3.7.2 engine tests pass unchanged).

## 22. Deployment
Frontend only. No edge function redeploy, no migration. Published app picks up the fix on the next publish.

## 23. Manuel Retest Instructions
1. Open /internal/publications-validation (signed in as usual).
2. Select the same or another normal JPEG.
3. Press "Subir foto".
4. STOP when "Generar 3 propuestas reales" appears. Do not press it.
5. Send a screenshot.
Never share passwords or keys.

## 24. Final Verdict
GO — EMPTY FILE UPLOAD HOTFIX READY FOR REAL RETEST

STOP — no proposals generated, A3.7.2.1B and A3.7.3 not started.
