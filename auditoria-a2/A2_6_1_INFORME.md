# A2.6.1 — EMAIL AUTH, EMAIL VERIFICATION & SMTP HARDENING — INTERIM REPORT (STAGE 1)

Scope: closure of F-03 / A26-003 (P2). Stage 1 covers the audit, safe code changes that need no external configuration, the exact external configuration required, and tests. Stage 2 waits for owner confirmation.

Baseline: 1168 tests, TypeScript 20, ESLint 30, build OK. Stage 1 result: 1238 tests (all green), TypeScript 20, ESLint 30, build OK.

---

## A. Current auth architecture

### Flow map

| Flow | Path today |
|---|---|
| EMAIL/PASSWORD SIGNUP | `/signup` → `AuthRoute` → `LoginModal` → `functions.invoke('signup-instant')` → `admin.createUser({ email_confirm: true, app_metadata.signup_source })` → client `signInWithPassword` → session → `/empezar` onboarding |
| GOOGLE SIGNUP / LOGIN | `LoginModal` → `signInWithOAuth({ provider: 'google', redirectTo: origin or /login?next=…, queryParams: { prompt: 'select_account' } })` → Supabase sets `email_confirmed_at` from the provider |
| LOGIN | `/login` → `signInWithPassword`; session through `onAuthStateChange` (`useAuth`) |
| EMAIL CONFIRMATION | Not exercised: the project has `mailer_autoconfirm: true` and `signup-instant` pre-confirms. No confirmation email is sent today |
| PASSWORD RESET | `ForgotPasswordForm` → `resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })` → email → `/reset-password` (implicit, token_hash, code or error link captured before the client clears the URL) → `updateUser({ password })` → global sign-out → sign in |
| TRIAL START | Onboarding finish or the Today trial card → `rpc('start_trial')` (SECURITY DEFINER, `auth.uid()`, `email_confirmed_at IS NOT NULL`, `ON CONFLICT (user_id) DO NOTHING`) |

Live Auth settings (public `/auth/v1/settings`): `mailer_autoconfirm: true`, `disable_signup: false`, email and google providers enabled.

Other facts:
- `signup-instant` runs with `verify_jwt=false`.
- Its limits are IP 10/h, email 5/h, and a global breaker of 50 created accounts per hour.
- It answers `{ok:true}` for an existing email (anti-enumeration).
- The `on_auth_user_created` trigger creates the `profiles` and `user_usage` rows; no business or trial is created at signup.

## B. F-03 root cause

`admin.createUser({ email_confirm: true })` sets `email_confirmed_at` at creation, so `start_trial()`'s gate is satisfied without any proof of address ownership.

Simply flipping it to `false` is unsafe: the admin API never sends a confirmation email. The account would be stuck unconfirmed with no link, and the user could never sign in.

A second cause sits at project level: `mailer_autoconfirm: true` (Confirm email OFF) auto-confirms every `auth.signUp` as well.

## C. Proposed target architecture (Stage 2, not applied)

1. `signup-instant` keeps its IP, email and global checks. Instead of `admin.createUser`, it calls `auth.signUp` with an anon-key client and `emailRedirectTo = SITE_URL + '/login'` (trusted server value; no client-supplied URL).
2. The owner turns on **Confirm email**. Supabase then creates the user unconfirmed and sends the confirmation email through custom SMTP.
3. The user clicks the link. Supabase verifies the token, sets `email_confirmed_at` and redirects to `/login` with a session. The normal onboarding then runs, and `start_trial()` passes.
4. Steps 1 and 2 must go live in the same window. Pinned tests asserting `email_confirm: true` (a231, a23, a2420, a26, a261 test 50) are flipped deliberately at that point.

## D. Rate-limit preservation

- Today: IP 10/h, email 5/h, global 50/h, unchanged (a261 test 49).
- Stage 2 keeps the same checks before `auth.signUp`.
- The global breaker currently counts users with `app_metadata.signup_source='signup-instant'`. `auth.signUp` cannot set `app_metadata`, so in Stage 2 the breaker counts all recently created `auth.users` rows. That is stricter, not weaker.
- The Supabase Auth email-send and sign-up rate limits apply on top.

## E. Direct signup bypass (A261-001)

- **Exposure, proven from live settings:** anyone holding the public anon key can call `auth.signUp` directly. This skips all `signup-instant` limits, and because `mailer_autoconfirm` is true, the account is confirmed immediately and is trial-eligible.
- **Not blocked at application level.** Supabase does not allow disabling the public signup endpoint while keeping signup through our function, short of `disable_signup`, which would also block `auth.signUp` from `signup-instant`.
- **Mitigation:** once Confirm email is on, direct signups stay unconfirmed and cannot start a trial. The remaining rate-limit bypass is limited to creating unconfirmed accounts, which Supabase's own Auth rate limits and optional CAPTCHA (Attack Protection) control.
- **Classification:** P1 candidate until Confirm email is on. Cost per account is capped by the AI limits (GLOBAL 80/month), but not across accounts.

## F. Trial protection

`start_trial()`:
- reads `auth.users.email_confirmed_at` for `auth.uid()` and returns `reason: 'email_not_verified'` without inserting;
- is one per user with `ON CONFLICT (user_id) DO NOTHING`, so concurrent calls are safe;
- can be executed by `authenticated` only (revoked from PUBLIC and anon).

Other protections:
- `billing_state_for` is not executable by clients.
- `user_trials` has no client INSERT or UPDATE.
- The frontend never writes billing tables (spec checklist S41).
- Unverified users therefore cannot start a trial or reach Premium through a trial. This becomes effective as soon as confirmation is real.

Stage 1 hardening:
- the trial card message is translated;
- onboarding completes even when `start_trial` answers `email_not_verified`; the Today card then asks the user to confirm.

## G. Verification UX (Stage 1, done)

- After signup, if sign-in requires confirmation: "Revisa tu correo para confirmar tu cuenta". The screen shows the address typed (only the user's own input), plus resend and back-to-login. It is identical for new and existing addresses.
- An unconfirmed sign-in shows "Confirma tu correo antes de continuar" with resend.
- An invalid or expired link landing on `/login` shows the expired or invalid title with resend. No raw Supabase text is shown: errors use a generic fallback.
- No URL parameter is ever treated as "verified" or "premium". Verification state comes only from Supabase's session and `email_confirmed_at`.
- Copy is in Spanish and English.

## H. Resend

- `auth.resend({ type: 'signup', email, options: { emailRedirectTo: origin + '/login' } })`.
- 60-second cooldown and an in-flight guard prevent button spam. Supabase limits the per-address and per-IP send rate.
- Neutral outcome: unknown, existing, already confirmed and per-address limit all show the same "sent" message. Only request-level rate limits and malformed addresses are surfaced.
- No custom email sending.

## I. Password reset

- Request: generic "sent" answer (Supabase returns 200 for unknown addresses; the per-address limit is also shown as "sent").
- Redirect fixed to `origin + /reset-password`.
- The link is captured before the client clears the URL. Expired or invalid links are handled. The password must be 6–72 characters. After a change, all sessions are signed out.
- No passwords or tokens are logged.
- Code: ready. Delivery: depends on the mailer (J). **NOT READY for a real test** until custom SMTP is verified.

## J. SMTP requirements

- No custom SMTP is in evidence. Mail would go through the Supabase default sender (`no-reply@mail.supabase.io`), which allows only a few emails per hour and is not for production. No SMTP data exists in the code, `config.toml` or edge function secrets. That is correct: SMTP belongs only in the Supabase Auth dashboard.
- **Google Workspace ≠ Supabase SMTP.** A configured Workspace mailbox does not mean Supabase can send through it. Supabase needs its own SMTP credentials entered in its Auth settings.
- Fields Supabase requires: **Host, Port, Username, Password, Sender email, Sender name** (plus the minimum interval between emails).
  - Option 1, a transactional provider (recommended): for example Resend (`smtp.resend.com`, port 465, user `resend`, password = API key), Postmark or SendGrid, with the sending domain verified (SPF and DKIM DNS records from the provider).
  - Option 2, Google Workspace SMTP relay or `smtp.gmail.com` with an app password. This works but has lower sending limits and needs Workspace admin changes. Not recommended for auth mail.
- **Sender identity.** The code references `localseohub.io` (default `SITE_URL` fallback in the GBP callback). No mailbox or sending domain could be verified from here. Recommendation: `noreply@<your verified production domain>`, sender name "LocalSEOHub". Use a monitored `support@` or `hola@` as reply-to if available. I do not claim any of these addresses exists.
- Do **not** paste any password or API key into Bolt.

## K. Supabase dashboard owner actions

1. **Ownership.** In Bolt, Database → Advanced: if the database is not yet claimed, claim it into your own Supabase account. Custom SMTP on a Bolt-managed database is ignored.
2. **SMTP.** Authentication → Emails → SMTP Settings → enable custom SMTP → fill in the fields from J.
3. **Templates.** Authentication → Emails → Templates:
   - "Confirm signup" and "Reset password" must use `{{ .ConfirmationURL }}` as the button link.
   - Use LocalSEOHub naming and a clear call to action ("Confirmar mi correo", "Cambiar contraseña").
   - Make no trial or price claims; "after confirming you can start your 7-day trial" is acceptable.
4. **Rate limits.** Authentication → Rate Limits: review email-sent and sign-up limits. Optionally enable CAPTCHA (Attack Protection).
5. **Confirm email.** Authentication → Sign In / Providers → Email → "Confirm email". **Do not enable it yet.** Enable it only together with the Stage 2 code switch.

## L. Redirect requirements

Authentication → URL Configuration:
- **Site URL** = the production domain (used by the email links).
- **Redirect URLs** allow-list must include:
  - `https://<production-domain>/login`
  - `https://<production-domain>/reset-password`
  - the same two paths on any preview domain, and on `http://localhost:5173` for development.

The app never forwards a user-supplied URL as `redirectTo` or `emailRedirectTo`. The post-login `next` is limited to internal paths.

## M. Existing-user policy

- There are 10 users: 8 email and 2 Google. All were confirmed at creation and all have signed in. None has a trial row.
- Policy: keep them as they are. Do not unconfirm, delete or force re-verification. They remain usable, and their prior confirmation is accepted as legacy.
- Nothing was deleted or reset: auth users, businesses, connected sources, trials, billing, subscriptions, AI usage and Stripe mappings are all untouched.

## N. Security tests

There are two test files for A2.6.1:
- the main A2.6.1 test file, with 57 tests;
- a spec checklist file, with 13 tests mapped to the spec's numbered items.

Coverage:

| Area | Tests |
|---|---|
| Open redirect / arbitrary redirect | 1, 33, S17/S18, 34, S27/S28 |
| Enumeration | 16, 27–29, 35, 48, S21 |
| Verification bypass / fake params | 8, S2/S3 |
| Trial before verification / direct trial RPC | 40–43, S41 |
| Expired, invalid, reused, already verified, missing parameters | 2–7, S21, S21b |
| Direct Premium RPC | S41 (no client writes; `billing_state_for` not called) |
| Direct signup bypass | 17, S12 (documented, not claimed blocked) |
| Secrets in src / frontend / dist | 53 |
| No deletion, no usage reset | 54, S34–S40 |
| Caps / tools / legacy functions / A2.5 / Stripe | 55–57, S50 |
| ES and EN copy | 46–47 |
| Routes signup, login, reset | 39, 52 |

Real-email checks (deliverability, real link click, reuse of a real link) can only happen in Stage 2.

## O. Findings

**A261-001**
- SEVERITY: P1 (candidate)
- AREA: Auth / trial abuse
- DESCRIPTION: Project `mailer_autoconfirm: true`, so a direct anon-key `auth.signUp` creates a confirmed, trial-eligible user that bypasses the `signup-instant` limits.
- EVIDENCE: `/auth/v1/settings`.
- IMPACT: Unlimited throwaway trials, each capped at 80 AI generations per month.
- FIX: Owner turns on Confirm email together with Stage 2; optional CAPTCHA.
- TEST: 17, 40–43, S12.
- STATUS: OPEN (owner action).

**A261-002 (= F-03 / A26-003)**
- SEVERITY: P2
- AREA: Signup
- DESCRIPTION: `signup-instant` uses `email_confirm: true`.
- EVIDENCE: `signup-instant/index.ts`.
- IMPACT: The `start_trial` verification gate is ineffective for official signups.
- FIX: Stage 2 switch to `auth.signUp` with the limits preserved (C, D).
- TEST: 50, S2/S3.
- STATUS: OPEN.

**A261-003**
- SEVERITY: P2
- AREA: Email delivery
- DESCRIPTION: No custom SMTP; default sender with very low limits.
- EVIDENCE: No SMTP configuration anywhere in the project; only the default mailer is available.
- IMPACT: Reset and verification emails may not arrive.
- FIX: Owner configures SMTP (J, K).
- TEST: Real delivery test in Stage 2.
- STATUS: OPEN (owner action).

**A261-004**
- SEVERITY: P3
- AREA: UX / error leakage
- DESCRIPTION: The sign-in screen showed raw server text as a fallback; there was no unconfirmed-login path.
- EVIDENCE: Former `translateError` returned `msg`.
- IMPACT: Server wording reached users; unconfirmed users got stuck.
- FIX: Generic fallback, verify panel, resend.
- TEST: 12–24.
- STATUS: FIXED.

**A261-005**
- SEVERITY: P3
- AREA: Trial / onboarding
- DESCRIPTION: Hardcoded Spanish trial message; onboarding could fail on `email_not_verified`.
- EVIDENCE: `BillingNotices.tsx`, `FirstValueFlow.tsx`.
- IMPACT: Wrong language for EN users; possible broken onboarding once confirmation is on.
- FIX: Translated copy; onboarding tolerates `email_not_verified`.
- TEST: 44, 45.
- STATUS: FIXED.

**A261-006**
- SEVERITY: P3
- AREA: Dead code
- DESCRIPTION: Six unreachable legacy landings call `signup-instant` or `signInWithOtp`.
- EVIDENCE: Not routed or imported.
- IMPACT: None unless re-routed.
- FIX: Remove in a later cleanup.
- TEST: 17.
- STATUS: DEFERRED.

**A261-007**
- SEVERITY: P3
- AREA: Abuse controls
- DESCRIPTION: No CAPTCHA on signup, reset or resend.
- EVIDENCE: Supabase settings and the code.
- IMPACT: Automated abuse is limited only by the rate limits.
- FIX: Optional: enable Supabase Attack Protection CAPTCHA (owner).
- TEST: n/a.
- STATUS: OPEN (optional owner action).

Stage 1 test maintenance: one assertion in the existing password-reset test was relaxed from an exact line to a pattern, so the app's startup line can carry the extra link-problem value. Its intent is unchanged. No tests were deleted.

## P. OWNER ACTION REQUIRED

1. Confirm or claim database ownership (K.1).
2. Configure custom SMTP with a verified sending domain (J, K.2). Do not paste secrets into Bolt.
3. Set the Site URL and redirect allow-list (L).
4. Review the two email templates (K.3).
5. Review the Auth rate limits; CAPTCHA is optional (K.4).
6. **Do not enable "Confirm email" yet** (K.5).
7. Send one password reset to your own address and confirm it arrives from your domain and not in spam.
8. Reply confirming steps 1–7. Stage 2 then switches signup and enables confirmation in one window, and verifies a real signup, confirmation and reset.

## Q. Stage status

- A2.6.1 STAGE 1 = COMPLETE
- EXTERNAL SMTP CONFIGURATION = REQUIRED
- EMAIL CONFIRMATION = NOT READY
- PASSWORD RESET = NOT READY (code ready; mailer not verified)
- F-03 = OPEN

No Stripe configuration was modified during A2.6.1.
The A2.5 Google verification trust fix remains active.

A2.6.1 is not approved. A3 has not been started. Waiting for audit and explicit authorization.
