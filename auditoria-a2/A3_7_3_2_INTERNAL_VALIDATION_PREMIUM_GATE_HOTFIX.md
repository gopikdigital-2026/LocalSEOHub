# A3.7.3.2-VALIDATION — Owner/Admin Internal Validation Premium Gate

Status: **diagnosis complete. No code, database, Stripe or subscription change made.** Implementation is blocked pending an owner decision (section 6).

## 1. Request path for "Generar 3 propuestas reales"
1. The harness (`PublicationsValidationPage`, frozen) calls the `publication-proposals` Edge Function with the user JWT.
2. `publication-proposals/index.ts` (frozen) runs `requirePremium(req, "publication-proposals", cors)` from `entitlement.ts` (frozen; must be byte-identical in every premium function).
3. `requirePremium`:
   - resolves the user from the JWT via `/auth/v1/user` (server-side);
   - calls RPC `authorize_premium_request(p_user_id, p_function, 30, 3600)` with the service role.
4. `authorize_premium_request` (SECURITY DEFINER) returns `premium_required` when `billing_state_for(user)->>'has_premium'` is false.
5. `entitlement.ts` maps this to HTTP 403 `{error:"premium_required"}`. The harness shows "Esta prueba requiere una cuenta Premium."

The rejecting function is **`publication-proposals`**, through the shared entitlement gate and the database function `authorize_premium_request`.

## 2. Root cause
- Two separate accounts each own a business named "Gopik.Digital". Identifiers are withheld.
  - **Account A** (created 2026-06-25): `SUBSCRIPTION_ACTIVE`, has_premium = true, 0 publications.
  - **Account B** (created 2026-06-26): `TRIAL_EXPIRED`. Trial started 2026-10-20 16:44 UTC and **ended 2026-10-27 16:44 UTC**. has_premium = false. It owns all 9 publications, including the image_ready upload made at 22:25 UTC today.
- Manuel validates with Account B. Its earlier successful proposal runs (last reservation 2026-10-26) happened while the trial was still active. Today's upload worked because `publication-media` is not Premium-gated. The proposal request was rejected because the 7-day trial had expired a few hours earlier.
- **This is expected commercial behaviour, not a regression.** The gate, the billing state and the trial lifecycle all behaved exactly as designed.

## 3. Would publication-adaptations fail the same way?
Yes. `publication-adaptations/index.ts` uses the same `requirePremium` and the same `authorize_premium_request`. Account B would get `premium_required` there too.

## 4. Existing owner/admin mechanism
- The only owner/admin mechanism in the project is the Edge secret **`ADMIN_EMAIL`**. It is read only by `admin-stats/index.ts`, which compares it with the email of the server-verified user.
- The database has no admin concept:
  - no admin table;
  - 0 users with an `app_metadata.role`;
  - 0 super admins;
  - no migration that references admin identity.
- `authorize_premium_request` runs in the database and cannot see `ADMIN_EMAIL`.
- From the database alone it cannot be proven which of Account A or B (if either) is the `ADMIN_EMAIL` account. The secret value is not readable, by design.
- The internal validation route has **no** owner/admin validation mechanism today. It relies entirely on the normal Premium gate.

## 5. Why no hotfix was implemented
Every implementation that meets the hotfix rules conflicts with another rule:

| Option | Conflict |
|---|---|
| Reuse `ADMIN_EMAIL` in the Edge gate | It requires changing `publication-proposals/index.ts` or `entitlement.ts`. Both are **frozen A3.7.2 files**, and the entitlement file must stay identical across every premium function. This is not a defect, so changing them is not allowed without explicit approval. |
| Database-side exception in `authorize_premium_request` | The database has no trusted admin source. It would need a **new** admin allowlist or app_metadata flag, which is the "second administrator system" the brief forbids. It would also need a hard-coded user, and nobody has confirmed which account is the admin. |
| Grant Premium or a trial to Account B | Forbidden: no manual subscription or entitlement changes. |
| Weaken `requirePremium` | Forbidden. |

## 6. Options for Manuel (choose one)
1. **No code change (recommended, zero risk):** run the validation signed in as **Account A**, which has an active subscription and also owns a "Gopik.Digital" business. Upload a new photo there. All limits, the ledger and safety apply normally.
2. **Approve unfreezing two A3.7.2 files** (the proposals `entitlement.ts` and the shared copies). Add a server-side check: verified JWT email = `ADMIN_EMAIL` and email confirmed, for `publication-proposals` and `publication-adaptations` only. This skips only the has_premium check; the rate limit, ledger, caps and validators still run. The A3.7.2 manifest would need re-pinning.
3. **Approve a database operator allowlist:** a service-only table checked inside `authorize_premium_request` for the two publication functions only. Manuel would confirm which account to add. This is a new admin source and needs explicit approval.

## 7. Adjacent finding (not changed)
`admin-stats` allows **any** signed-in user if `ADMIN_EMAIL` is unset (`if (adminEmail && …)`). It is currently set, so there is no exposure today, but the check should fail closed. This should be fixed in a separate approved task.

## 8. Confirmations
- Stripe and subscription data: **not modified.**
- Customer Premium enforcement: **unchanged.**
- AI usage ledger, monthly caps (proposals 20, adaptations 20, global 80), 3 adaptations per publication, concurrency, idempotency and validators: **unchanged.**
- Files changed: **only this report.** No migration, Edge Function or app file was changed, and nothing was redeployed.
- Frozen files: A3.7.2 28/28 and A3.7.3.1 4/4 unchanged (no file touched since the last verification).
- Tests, TypeScript and build: no source change since the last run (2649/2649 tests, 20 baseline TypeScript errors, build PASS).
- Meta calls 0, Google calls 0, customer exposure 0. Manuel's real AI generation was not performed.
