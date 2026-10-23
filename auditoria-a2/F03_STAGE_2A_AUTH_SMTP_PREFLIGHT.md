# LocalSEOHub — F-03 Stage 2A: Auth & SMTP Preflight Audit

Scope: email ownership, signup security, transactional email readiness. Read-only. The only file created is this report.

---

## A. Executive summary

F-03 Stage 2A was performed as a read-only authentication and SMTP preflight audit.

**Confirmed root cause of F-03.** The only live email/password signup path is the Edge Function `signup-instant`. It creates users with `auth.admin.createUser({ email_confirm: true })`, so every email address typed into the signup form is marked as owned (`email_confirmed_at` set) before anyone proves they control the mailbox. That has three consequences:

1. The server-side trial gate in `start_trial()` checks `auth.users.email_confirmed_at IS NOT NULL`, so it is defeated. In practice there is no email-verification requirement before the 7-day trial.
2. Supabase automatic identity linking keeps *verified* identities. An attacker can pre-register a victim's email with a password, and the account is pre-verified. If the real owner later signs in with Google, that Google identity can be linked into the attacker-created user, which is a **pre-account-takeover** vector. This REQUIRES REAL E2E VERIFICATION.
3. Anyone can register arbitrary third-party addresses, which burns trial abuse protection and pollutes the user base.

**Live evidence (aggregate, no PII):**
- 10 users, 0 unconfirmed.
- 10 confirmed without a confirmation email ever being sent (`confirmation_sent_at` is NULL for every user).
- 4 recovery emails have been sent.
- 4 accounts have both email and Google identities, which proves automatic linking is active.

**Readiness.** Most of the verification infrastructure is already in place and tested:
- the `/login` verification landing with expired/invalid link capture;
- a neutral resend with a 60 s cooldown;
- neutral copy on the signup screen;
- the server-gated `start_trial`;
- password reset at `/reset-password`;
- `safeReturnPath` open-redirect protection.

Stage 2B is therefore mainly:
- move signup to `auth.signUp`;
- enable Confirm email;
- set up SMTP and templates;
- make the pending business context survive a cross-tab or cross-device confirmation.

**Decision: READY FOR STAGE 2B WITH MANUAL PREREQUISITES** (see AD).

## B. Scope and method

- **Read:**
  - `signup-instant`, `LoginModal`, the `email-verification` and `password-reset` features, `App.tsx` routes, `returnTo.ts` and `auth.tsx` guards;
  - `BusinessContext` / `businessRepository`, `useOnboardingStatus`, `useAuth`;
  - `FirstValueFlow`, `BillingNotices`, `billing/repository`;
  - migrations `a23` and `a231`, `supabase/config.toml`, i18n strings;
  - the orphan landing components.
- **Live DB queries:** read-only definition and aggregate queries only (function definitions, grants, RLS policies, user counts). No row-level personal data was read.
- **Secrets:** Edge Function secret names were listed without values.
- **Not inspected:** the Supabase Auth dashboard settings are not visible from the repo or the database. Every such item is marked **EXTERNAL CONFIGURATION — MUST BE VERIFIED MANUALLY**.

## C. Hard-rule compliance

- No code, configuration, schema, RLS, billing, Stripe, analytics, landing or tool changes were made.
- No migrations or tests were added.
- No secret values were printed.
- The only change is this file.

## D. Full trace of the email/password signup

| # | Step | Location | Behavior |
|---|---|---|---|
| 1 | User clicks "Crear cuenta" / `#registro` / `/signup` | `RootRoute`, `AuthRoute`, `LoginModal` | Signup mode; header promises "7 días gratis · sin tarjeta hasta decidir". `savePendingBusinessName` writes `pending_business_name` into **sessionStorage**. |
| 2 | Submit | `LoginModal` | `track('register_attempt')`, then `supabase.functions.invoke('signup-instant', {email, password})`. |
| 3 | Edge Function validation | `signup-instant` | `EMAIL_RE`; password 6–72 characters; otherwise 400 `invalid_input`. `verify_jwt = false` (public). |
| 4 | Rate limits | `signup-instant` → `consume_rate_limit` (service_role only) | IP: 10/h, key from the first `x-forwarded-for` entry (**spoofable**, which the code admits). Email: 5/h. Exceeding either returns 429 `rate_limited`. |
| 5 | Global breaker | `signup_created_recently(3600)` | 50 or more accounts created in the last hour returns 429. Counts only `app_metadata.signup_source='signup-instant'`. |
| 6 | User creation | `adminClient.auth.admin.createUser({ email, password, email_confirm: true, app_metadata:{signup_source:'signup-instant'} })` | **Email marked confirmed with no proof of ownership. No email is sent.** |
| 7 | Existing email | `signup-instant` | Returns a neutral `{ok:true}`; the password is not changed. |
| 8 | Trigger | `handle_new_user` | Inserts into `profiles` and `user_usage`. |
| 9 | Auto sign-in | `LoginModal` → `signInWithPassword` | Success fires `trackCompleteRegistration()` and `finish()`. Failure (e.g. existing email with a different password) shows `VerifyEmailPanel reason='signup'` with neutral copy. |
| 10 | First session | `BusinessContext` → `resolveBusiness` | Upserts `businesses {user_id}` (own-only RLS). |
| 11 | Routing | `destinationFor` / `OnboardingGuard` | Incomplete onboarding goes to `/empezar` (FirstValueFlow); otherwise `next` or `/hoy`. |
| 12 | Business name | `FirstValueFlow.tsx:76` `getPendingBusinessName()` | Reads and removes the value from sessionStorage. |
| 13 | Trial | `FirstValueFlow.finish` → `billing.startTrial()` → `rpc('start_trial')` | The server checks `email_confirmed_at`. It currently always passes because of step 6. `email_not_verified` is swallowed; `TrialStartCard` handles `emailNeeded`. |

## E. Direct `supabase.auth.signUp` bypass analysis

- The app never calls `auth.signUp`. However, the public anon key plus the GoTrue `/auth/v1/signup` endpoint are always reachable by anyone, regardless of the UI.
- Whether this endpoint accepts signups depends on the **"Allow new users to sign up"** setting. That is EXTERNAL CONFIGURATION — MUST BE VERIFIED MANUALLY.
- **If signups are enabled and Confirm email is OFF:**
  - a direct call creates a confirmed user with a session;
  - it bypasses the `signup-instant` IP and email limits and the 50/h breaker (the breaker counts only `signup_source='signup-instant'`);
  - only GoTrue's built-in rate limits apply.
- **If signups are enabled and Confirm email is ON:** a direct call creates an unconfirmed user and sends a confirmation email. `start_trial` correctly refuses that user, and automatic linking discards the unconfirmed identity. This is safe.
- **If signups are disabled:** the admin API (used by `signup-instant`) still works, because it ignores that setting.
- Note: the code comment in `signup-instant` ("password sign-in rejects unconfirmed emails") suggests Confirm email may already be ON, which would make `admin.createUser(email_confirm:true)` the *only* reason users can sign in instantly. Migration `a23`'s comment implies autoconfirm. The repo is contradictory, so this MUST BE VERIFIED MANUALLY.

## F. Email confirmation state

**CODE-CONFIRMED**
- `signup-instant` sets `email_confirm: true` for every new user.
- `start_trial()` requires `email_confirmed_at`.
- A verification landing, link-problem capture, neutral resend (`type:'signup'`, `emailRedirectTo: origin/login`) and a 60 s cooldown exist.
- `isEmailNotConfirmed` is handled on login.

**LIVE DATA (aggregate)**
- 0 unconfirmed users.
- 0 confirmation emails ever sent.

**EXTERNAL CONFIGURATION — MUST BE VERIFIED MANUALLY**
- Auth → Providers → Email → "Confirm email" on/off.
- "Allow new users to sign up".
- "Secure email change".
- OTP / link expiry.

## G. SMTP / transactional email

**CODE-CONFIRMED**
- There is no SMTP, Resend, SendGrid, Postmark or Mailgun integration anywhere in the app or Edge Function code.
- No email secrets exist among the Edge Function secrets (names only):
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`;
  - `LocalSEO_AI`, `LocalSEO_KEY`;
  - `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`;
  - `ADMIN_EMAIL`;
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`;
  - `SITE_URL`.
- All auth emails (confirmation, recovery) are sent by Supabase Auth itself.

**LIVE DATA**
- 4 recovery emails have been sent, so some sender (the default Supabase mailer or a custom SMTP) works for recovery.

**EXTERNAL CONFIGURATION — MUST BE VERIFIED MANUALLY**
- Whether custom SMTP is configured in Auth → SMTP Settings.
- Sender address and sender name.
- The built-in mailer is limited to a very low hourly volume and authorized/team addresses only, so it is **not production-suitable** for confirmation at launch.

## H. Google Workspace vs Supabase Auth SMTP boundary

- **Google Workspace** (the business mailbox) and **Supabase Auth SMTP** are separate systems. Supabase sends auth emails only through what is set in Auth → SMTP Settings.
- If Workspace is used as the relay, the owner enters these categories in the Supabase dashboard (values never go into the repo, the database or chat):
  - SMTP host;
  - SMTP port;
  - SMTP username;
  - SMTP password / app credential (an app password or relay credential, never the mailbox login password);
  - sender address;
  - sender name.
- Deliverability prerequisites, outside the repo:
  - SPF includes the relay;
  - DKIM enabled for the sending domain;
  - a DMARC record;
  - the sender address belongs to the verified domain.
- Workspace sending quotas apply. A dedicated transactional provider is an alternative. Choosing between them is an owner decision.

## I. Password reset trace

| Step | Behavior |
|---|---|
| Request | `ForgotPasswordForm` → `resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`. Neutral confirmation; 60 s resend cooldown (`RESEND_COOLDOWN_SECONDS`). |
| Link capture | `main.tsx` runs `captureRecoveryLink` before the Supabase client strips tokens. App redirects any recovery link to `/reset-password`. |
| Exchange | `verifyOtp({token_hash, type:'recovery'})` or `exchangeCodeForSession(code)`. |
| Update | `updateUser({ password })`. |
| Error | Expired/invalid link state on the reset page. |
| Note | Password reset on an attacker-pre-registered account sends the email to the true owner, who can then take control. This is a partial mitigation but not a fix. With Confirm email ON, recovery also proves mailbox ownership. |

The recovery path is not modified by Stage 2B except for template, sender and SMTP changes.

## J. Google OAuth

- **Login OAuth:**
  - `signInWithOAuth({ provider:'google', redirectTo: returnTo ? origin + '/login?next=' + encodeURIComponent(returnTo) : origin + '/', queryParams:{ prompt:'select_account' } })`;
  - `next` is sanitized by `safeReturnPath`.
- **Google Business Profile OAuth:**
  - a separate flow at `/oauth/google-business/callback` (`AppGuard`);
  - uses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in Edge Functions;
  - it is not an authentication flow. Out of scope; not modified.
- **Takeover concern:** Supabase automatically links identities with the same email and drops *unconfirmed* identities while linking. Because `signup-instant` pre-confirms, an attacker-created password identity survives linking. The attacker keeps the password, and the victim's Google login lands in the same user, so the attacker can read the victim's data. REQUIRES REAL E2E VERIFICATION. The 4 mixed email+Google accounts show that linking happens in production.
- Orphan landings (CopilotLanding, GrowthPlanLanding) also call `signInWithOAuth`, but they are not imported anywhere (dead code).

## K. Identity collision matrix

| Case | Scenario | Current outcome | After Stage 2B (target) | E2E |
|---|---|---|---|---|
| A | New email, password signup | Instant confirmed account and session | Unconfirmed user, confirmation email, no session until the link is clicked | E01–E03 |
| B | Existing password user signs up again with the same email | Neutral `{ok:true}`; sign-in fails with a new password; neutral panel | Neutral "check your email"; Supabase sends no new account; no enumeration | E05 |
| C | Existing Google user signs up with a password | Neutral; password not set; neutral panel | Same; neutral | E06 |
| D | Password user (confirmed) then signs in with Google | Linked into one user | Linked (identity verified) | E08 |
| E | Attacker pre-registers the victim's email with a password, then the victim signs in with Google | **Linked into the attacker-created, pre-confirmed user, which is a takeover risk.** REQUIRES REAL E2E VERIFICATION | The password identity is unconfirmed, so it is removed on Google linking; the victim owns the account | E09 |
| F | Unconfirmed password user tries to log in | N/A today (none exist) | `email_not_confirmed` leads to `VerifyEmailPanel reason='login'` with a resend option | E04 |
| G | Google-first user requests a password reset | Email sent to Google address; sets a password | Same (mailbox ownership proven) | E14 |
| H | Same email with different case or whitespace | `signup-instant` lowercases/trims? GoTrue normalizes lowercase | GoTrue normalizes; must be verified | E07 |

## L. Session assumptions

- Today the frontend expects a session immediately after signup. If `signInWithPassword` fails, it falls back to `VerifyEmailPanel`, so the UI already survives "no session after signup".
- After Stage 2B, `auth.signUp` returns `session: null` when confirmation is required, and the UI must show the check-email panel.
- After the link is clicked, `/login` receives the session (PKCE code or hash). `useAuthRedirect` / `destinationFor` route the user to `/empezar`.
- Guards:
  - `AppGuard`: unauthenticated users go to `/login?next=`;
  - `OnboardingGuard`: unauthenticated users go to `/signup`.
  - Neither guard checks `email_confirmed_at`. With Confirm email ON, an unconfirmed user cannot get a session at all, so a client-side check is not required.
- `useAuth` decides register vs login analytics by a 10 s `created_at` ≈ `last_sign_in_at` heuristic. After confirmation, the gap may exceed 10 s, so `register_success` may be misclassified (analytics only; not modified).

## M. Pending business context

- `pending_business_name` lives in **sessionStorage**, which is per tab.
- A confirmation link opened in a new tab, another browser or a phone loses the name, and the user re-enters it in FirstValueFlow. This is not a data-loss or security issue.
- The email pre-fill is not carried over either.
- Stage 2B target: persist it in localStorage with a TTL, or in signup `options.data` (user_metadata, non-authoritative and user-editable, so used only as a prefill hint and never for authorization).

## N. Trial gating

- **Desired invariant:** no email/password trial before verification.
- **Server:** `start_trial()` is SECURITY DEFINER with `search_path=public`. It requires `auth.uid()` and, in state `TRIAL_NOT_STARTED`, requires `email_confirmed_at IS NOT NULL`; otherwise it returns `email_not_verified`. It inserts with `ON CONFLICT DO NOTHING` (idempotent). EXECUTE is granted to `authenticated`.
- **RLS:** `user_trials` denies client insert/update/delete and allows select-own. `trial_fingerprints` denies everything.
- **Current:** ineffective, because every user is pre-confirmed by `signup-instant`.
- **After 2B:** effective without any database change.
- **Google users:** Google returns verified emails, so they are confirmed immediately, which is acceptable.

## O. Signup rate limit

| Control | Current | Risk class |
|---|---|---|
| Per-IP 10/h | Key from a spoofable `x-forwarded-for` first entry | **Abuse** (a bypass by rotating the header) |
| Per-email 5/h | Effective | Low |
| Global 50/h breaker | Counts only `signup-instant` users | **Availability**: an attacker can fill 50/h and block real signups for an hour. **Abuse**: direct `auth.signUp` is not counted |
| GoTrue built-in | Auth rate limits (emails/hour, signups) | EXTERNAL — MUST BE VERIFIED MANUALLY |

- **Security** risk is low as long as verification is required.
- After 2B, GoTrue's email-sending rate limit and SMTP quota become the main limiters. The owner must check Auth → Rate Limits.

## P. Bot protection

- **CODE-CONFIRMED:** no CAPTCHA, Turnstile, hCaptcha or honeypot exists in the app or Edge Function code.
- **EXTERNAL:** Auth → Bot and Abuse Protection (CAPTCHA) state — MUST BE VERIFIED MANUALLY.
- Enabling CAPTCHA in Supabase without adding a widget and `captchaToken` in code **breaks all signups, logins and resets**. Therefore enable it only together with a code change (Group C; recommended as Stage 2C, not 2B).

## Q. Email enumeration

| Surface | Current | Assessment |
|---|---|---|
| Signup | `{ok:true}` for new and existing emails; same panel copy | Neutral |
| Login | Generic "wrong email or password" | Neutral; `email_not_confirmed` reveals that an unconfirmed account exists (accepted Supabase behavior, low) |
| Resend | `classifyResendError` maps `user_not_found`, `email_exists`, etc. to "sent" | Neutral |
| Reset | Neutral confirmation | Neutral |
| Timing | `signup-instant` existing-user path is faster than create (no hashing) | Low; accepted |

## R. Resend confirmation

- `requestVerificationResend` → `supabase.auth.resend({ type:'signup', email, options:{ emailRedirectTo: origin + '/login' } })`.
- 60 s client cooldown plus an in-flight guard; neutral classification.
- The server-side limit is the GoTrue email rate limit (EXTERNAL).
- Today it is unreachable in practice, because there are no unconfirmed users. It becomes live in 2B.

## S. Auth routes table

| ROUTE | PURPOSE | EXPECTED PARAMETERS | AUTH STATE | RETURN DESTINATION | OPEN-REDIRECT PROTECTION | USED BY |
|---|---|---|---|---|---|---|
| `/` (`#login`, `#registro`) | Landing + LoginModal | hash | Any | `destinationFor` | `safeReturnPath` | Landing CTAs |
| `/signup` | Signup | `next?` | Unauthenticated | `/empezar` | `safeReturnPath` | OnboardingGuard, CTAs |
| `/registro` | Legacy | — | Any | Redirects to `/signup` | N/A (fixed) | Old links |
| `/login` | Login + **verification landing** + OAuth return | `next?`, `recuperar?`, `error`/`error_code` (hash/query), PKCE `code` | Any | `next` or `/hoy` or `/empezar` | `safeReturnPath` rejects `//`, `/\`, backslash, control characters, auth paths | AppGuard, resend `emailRedirectTo`, Google `redirectTo` |
| `/reset-password` | Set new password | `token_hash`+`type=recovery` or `code` | Recovery session | `/hoy` / login | Fixed path | `resetPasswordForEmail` `redirectTo` |
| `/empezar` | FirstValueFlow onboarding | — | Authenticated | `/hoy` | Fixed | `destinationFor` |
| `/oauth/google-business/callback` | GBP connect (not auth) | `code`, `state` | Authenticated | `/fuentes` | `state` | GBP connect |
| `/dashboard`, `/app-v2/*` | Legacy | — | Any | Redirects to `/hoy` | Fixed | Old links |
| `*` | Fallback | — | Any | Redirects to `/` | Fixed | — |

## T. Production URL categories

These must be set in Auth → URL Configuration. Values are owner-supplied.

- **Site URL:** the production origin (no trailing path).
- **Redirect allowlist:**
  - production origin `/login`;
  - production origin `/reset-password`;
  - production origin `/` (Google with no `next`);
  - production origin `/login?next=*` (pattern);
  - optionally preview or staging origins (remove before launch if unused).
- **Google Cloud OAuth client** (login): authorized redirect URI = the Supabase project callback (`<project>/auth/v1/callback`); authorized JavaScript origin = the production origin.
- **GBP OAuth:** `GOOGLE_REDIRECT_URI` / `SITE_URL` secrets (separate; unchanged).

## U. Email templates

| Template | SUBJECT PURPOSE | CTA | DESTINATION | SECURITY | LOCALIZATION |
|---|---|---|---|---|---|
| Confirm signup | Confirm your LocalSEOHub email | "Confirmar correo" | `{{ .ConfirmationURL }}` → `/login` | Single-use, expiring; no password in the email; brand sender | ES primary (Supabase has one template per project; bilingual body optional) |
| Reset password | Reset your password | "Crear nueva contraseña" | `{{ .ConfirmationURL }}` → `/reset-password` | Single-use, short expiry; "ignore if not you" | ES |
| Magic link | Not used (dead `signInWithOtp` in the orphan PotentialLanding) | — | — | Keep the default; unreachable | — |
| Change email | Confirm the new address | "Confirmar nuevo correo" | Default | Secure email change ON (verify) | ES |
| Invite | Not used | — | — | — | — |
| Reauthentication | Not used | — | — | — | — |

## V. Safe target architecture

1. Signup: the client calls `supabase.auth.signUp({ email, password, options:{ emailRedirectTo: origin + '/login', data:{ pending_business_name? } } })`.
2. Confirm email ON. GoTrue sends the email via custom SMTP. No session is issued until the link is clicked.
3. UI: a check-email panel (existing `VerifyEmailPanel reason='signup'`) with a resend option and a 60 s cooldown.
4. The link goes to `/login`. Session established; `destinationFor` sends the user to `/empezar`; the pending name comes from localStorage or metadata.
5. `start_trial()` works unchanged; the gate becomes effective.
6. `signup-instant`: retired from the UI. In the same release either delete `email_confirm:true` (create unconfirmed and let GoTrue send the email) or disable the function (return 410). It must never pre-confirm again.
7. Google: unchanged; auto-linking now drops unconfirmed attacker identities.
8. Abuse: GoTrue rate limits + SMTP quota; CAPTCHA in a later stage with the widget.

## W. Existing-user migration safety

- All 10 users are confirmed, so enabling Confirm email does **not** lock anyone out.
- 4 password-only and 4 mixed accounts keep working. Google users are unaffected.
- No database change is required. `start_trial` already reads `email_confirmed_at`.
- The 0 users created via `signup-instant` means no pre-confirmed-but-unverified accounts exist from that path (the counter shows 0). Earlier password accounts predate the `signup_source` metadata and cannot be distinguished. **Owner decision:** accept them as-is (they are known/test users) or require a password reset.

## X. Rollback plan

- **Code rollback:** revert the signup UI to the previous release. Do **not** restore `email_confirm:true`. If rollback is needed, set `signup-instant` to create unconfirmed users (or disable it), so signup degrades to "check your email" rather than to unverified accounts.
- **SMTP rollback:** if custom SMTP fails, the Supabase default mailer can be re-selected temporarily (low volume). Confirm email stays ON; at worst, signups queue on email delivery.
- **Confirm email rollback:** turning it OFF re-opens F-03. Only as an emergency and owner-authorized, and never together with `email_confirm:true`.
- **Templates:** keep a copy of the current default templates before editing.
- Users who confirmed during 2B stay confirmed; there is no data rollback.

## Y. Manual owner checklist (Manuel)

**GROUP A — CHECK NOW / DO NOT CHANGE**
1. Auth → Providers → Email: record whether "Confirm email" is ON or OFF.
2. Auth → Providers → Email: record whether "Allow new users to sign up" is ON.
3. Auth → Providers → Email: record "Secure email change" and the OTP expiry.
4. Auth → SMTP Settings: record whether custom SMTP is enabled and the sender address/name (do not share the password).
5. Auth → URL Configuration: record the Site URL and every redirect URL.
6. Auth → Providers → Google: enabled? Record the client ID category only (no secret).
7. Auth → Bot and Abuse Protection: is CAPTCHA enabled? Which provider?
8. Auth → Rate Limits: record the email-sent/hour and signup limits.
9. Auth → Email Templates: record whether the defaults are customized.
10. Google Cloud console: the OAuth client's authorized redirect URIs and JavaScript origins.

**GROUP B — PREPARE FOR STAGE 2B**
1. Decide the sender: a Google Workspace relay or a transactional provider.
2. Create the app password or relay credential (host, port, username, credential, sender address, sender name).
3. Configure SPF, DKIM and DMARC for the sending domain and confirm propagation.
4. Draft the Spanish copy for the confirm and reset templates (section U).
5. Prepare the production Site URL and the redirect allowlist (section T).
6. Decide what to do with the 4 legacy password-only accounts (W).
7. Prepare two test mailboxes (one Gmail with Google login, one non-Google).

**GROUP C — CHANGE ONLY WHEN STAGE 2B AUTHORIZES IT**
1. Enter the custom SMTP settings and send a test email.
2. Update the confirm and reset templates.
3. Update the Site URL and the redirect allowlist.
4. Turn "Confirm email" ON, only after the 2B code is deployed.
5. Raise the GoTrue email rate limit to match the SMTP quota.
6. CAPTCHA: leave OFF until a later stage ships the widget.

## Z. Stage 2B implementation plan

**Code changes**

| STEP | FILE / SETTING | CURRENT | TARGET | RISK | TEST | ROLLBACK |
|---|---|---|---|---|---|---|
| C1 | `LoginModal` signup handler | `invoke('signup-instant')` then `signInWithPassword` | `auth.signUp` with `emailRedirectTo` `/login`; if `session` is null, show `VerifyEmailPanel reason='signup'`; if a session exists (Confirm email OFF), `finish()` | Medium (core conversion) | Unit + E01–E05 | Revert the file |
| C2 | Pending business name | sessionStorage, per tab | localStorage with TTL (and/or `options.data` hint) | Low | E03 cross-tab | Revert |
| C3 | `signup-instant` | `email_confirm:true` | Remove pre-confirm: return 410 or create unconfirmed and let GoTrue send | Medium | E10, E11 | Redeploy the 410 version, **never** `email_confirm:true` |
| C4 | `trackCompleteRegistration` placement | After instant sign-in | After the confirmed first session | Low (analytics) | E02 | Revert |
| C5 | Tests | Tests assert the `signup-instant` invoke | Update assertions to `auth.signUp` | Low | Suite green | Revert |

**Manual Supabase changes (owner)**

| STEP | SETTING | CURRENT | TARGET | RISK | TEST | ROLLBACK |
|---|---|---|---|---|---|---|
| M1 | URL Configuration | Unknown (A5) | Production Site URL + allowlist (T) | Medium: wrong value breaks links | E12, E15 | Restore the recorded values |
| M2 | Email templates | Unknown (A9) | Section U | Low | E01, E13 | Restore the defaults |
| M3 | Rate limits | Unknown (A8) | Match the SMTP quota | Low | E20 | Restore |
| M4 | Confirm email | Unknown (A1) | **ON** | High if before C1–C3; low after | E01–E11 | OFF only in an emergency (re-opens F-03) |

**SMTP provider changes (owner)**

| STEP | SETTING | CURRENT | TARGET | RISK | TEST | ROLLBACK |
|---|---|---|---|---|---|---|
| P1 | DNS SPF/DKIM/DMARC | Unknown | Aligned for the sender domain | Medium (spam folder) | Mail-tester / headers | Revert DNS |
| P2 | Supabase SMTP Settings | Unknown (A4) | Custom SMTP (host, port, username, credential, sender address, sender name) | Medium | Test email; E13 reset still works | Switch back to the default mailer |

**Safest order**

1. P1 DNS.
2. P2 SMTP; then verify **password reset still delivers** (E13).
3. M2 templates.
4. M1 URLs + M3 limits.
5. C1, C2, C4, C5 deployed. They are compatible with Confirm email OFF or ON, because a returned session goes straight in.
6. M4 Confirm email ON.
7. C3 `signup-instant` retired, immediately after M4 (or together with C1, since the UI no longer calls it).
8. Run the full E2E matrix.
9. Close F-03 only when E01–E23 pass.

## AA. E2E matrix

| ID | PRECONDITION | ACTION | EXPECTED | INVARIANT |
|---|---|---|---|---|
| E01 | New mailbox | Sign up with email+password | Check-email panel; email arrives from the brand sender | No session before confirmation |
| E02 | E01 | Click the link | Lands on `/login`, signed in, goes to `/empezar` | Session only after mailbox proof |
| E03 | E01, link opened in a new tab or device | Click | Signed in; business name pre-filled (or asked again) | No crash; no other user's data |
| E04 | Unconfirmed account | Log in with password | Verify panel `reason='login'` + resend | No session |
| E05 | Existing confirmed password account | Sign up with the same email | Neutral panel | No enumeration; password unchanged |
| E06 | Existing Google-only account | Sign up with a password | Neutral panel | No password silently attached |
| E07 | Mixed-case email | Sign up `User@X.com`, log in `user@x.com` | Same account | Normalization |
| E08 | Confirmed password account | Sign in with Google, same email | One user, both identities | Linking only for a verified email |
| E09 | Attacker signs up with the victim's email (unconfirmed) | Victim signs in with Google | Victim gets an account; attacker password identity removed/unusable | **No pre-account takeover** |
| E10 | After C3 | POST directly to `signup-instant` | 410, or an unconfirmed user and no session | Never pre-confirms |
| E11 | Confirm email ON | Direct `/auth/v1/signup` with the anon key | Unconfirmed user, email sent | Direct bypass is safe |
| E12 | Link from E01 | Tamper with `redirect_to` to an external host | Rejected by the allowlist | No open redirect |
| E13 | Any account | Forgot password | Email via custom SMTP; reset works at `/reset-password` | Reset unchanged |
| E14 | Google-only account | Forgot password | Email sent; password set | Mailbox proof |
| E15 | Expired confirmation link | Click | "Link expired" panel + resend | No session; no trust in the URL |
| E16 | Invalid/reused link | Click | "Invalid link" panel | Same |
| E17 | Unconfirmed account | Resend twice within 60 s | Second click blocked by cooldown | Neutral copy |
| E18 | Unconfirmed account (crafted session attempt) | Call `rpc('start_trial')` | `email_not_verified` | No trial before verification |
| E19 | Confirmed new user | Finish FirstValueFlow | Trial starts once | Idempotent trial |
| E20 | Signup burst | Exceed the rate limits | Neutral rate-limit message | Availability is acceptable |
| E21 | Existing 10 users | Log in (password/Google) | Works unchanged | No lockout |
| E22 | `/login?next=//evil.com` | Log in | Goes to `/hoy` | `safeReturnPath` |
| E23 | Regression | Today/Missions/Plan/7 tools/limits | Unchanged | Product invariants |

## AB. Security invariants

- **S01** No email/password account is marked confirmed without mailbox proof.
- **S02** No session is issued to an unconfirmed email/password user.
- **S03** `start_trial` refuses users with NULL `email_confirmed_at`; the trial is never started client-side.
- **S04** Automatic identity linking never merges into an account whose email was not proven.
- **S05** Signup, login, resend and reset responses do not reveal whether an account exists.
- **S06** Every auth redirect is either a fixed path or passes `safeReturnPath`, and is on the Supabase allowlist.
- **S07** Link parameters are never trusted as proof; only a session established by Supabase counts.
- **S08** No service-role key or SMTP credential exists in client code, the repo or logs.
- **S09** `signup-instant` (if kept) never sets `email_confirm:true`.
- **S10** Rate limits cannot be fully bypassed by header spoofing alone (GoTrue limits remain).
- **S11** Existing confirmed users keep access after Confirm email is enabled.
- **S12** Authorization never depends on user_metadata (pending business name is a hint only).

## AC. Findings

| ID | SEVERITY | AREA | CURRENT STATE | EVIDENCE | RISK | TARGET STATE | CODE CHANGE? | EXTERNAL CHANGE? | E2E REQUIRED? | LAUNCH CLASSIFICATION |
|---|---|---|---|---|---|---|---|---|---|---|
| F03-2A-001 | Critical | Signup | `admin.createUser(email_confirm:true)` | `signup-instant/index.ts`; 10/10 confirmed with 0 confirmation emails | Unverified ownership; root cause of F-03 | `auth.signUp` + Confirm email | Yes | Yes | Yes | Launch blocker |
| F03-2A-002 | Critical | OAuth linking | Pre-confirmed password identity survives auto-linking | Supabase linking docs; 4 mixed accounts | Pre-account takeover | Unconfirmed identities dropped on linking | Yes (via 001) | Yes | Yes (E09), REQUIRES REAL E2E VERIFICATION | Launch blocker |
| F03-2A-003 | High | Trial | `start_trial` gate ineffective | Function definition; a23 comment | Trial without verification | Gate effective after 001 | No | No | Yes (E18) | Launch blocker (resolved by 001) |
| F03-2A-004 | High | SMTP | No custom SMTP evidenced; built-in mailer unsuitable | No SMTP code or secrets; external | Confirmation emails not delivered at scale | Custom SMTP + SPF/DKIM/DMARC | No | Yes | Yes (E01, E13) | Launch blocker for 2B |
| F03-2A-005 | Medium | Direct signup | `/auth/v1/signup` reachable; breaker counts only `signup-instant` | `a231` SQL | Limit bypass if signups are ON and Confirm is OFF | Confirm ON; GoTrue limits | No | Yes | Yes (E11) | Must fix with 001 |
| F03-2A-006 | Medium | Rate limit | IP key from spoofable `x-forwarded-for` | `signup-instant` comment | Abuse | Retire function; GoTrue limits | Yes | Optional | Yes (E20) | Resolved by retirement |
| F03-2A-007 | Medium | Availability | Global 50/h breaker can be exhausted | `signup_created_recently` | Real signups blocked for 1 h | Remove with the function; GoTrue limits | Yes | No | E20 | Post-2B |
| F03-2A-008 | Medium | Bot | No CAPTCHA/honeypot | grep negative | Bot signups / mail bombing | CAPTCHA with widget (later stage) | Yes | Yes | Yes | Post-launch recommended |
| F03-2A-009 | Low | UX | Pending business name in sessionStorage | `LoginModal`, `FirstValueFlow:76` | Lost cross-tab/device | localStorage TTL / metadata hint | Yes | No | E03 | 2B |
| F03-2A-010 | Low | Config | Repo comments contradict on the Confirm email state | `signup-instant` vs a23 | Wrong deployment order | Owner records the actual state (A1) | No | Verify | No | Prerequisite |
| F03-2A-011 | Low | Analytics | 10 s register heuristic misfires after delayed confirmation | `useAuth.ts` | Misclassified events | Revisit later (not 2B scope) | Later | No | No | Post-launch |
| F03-2A-012 | Info | Dead code | Orphan landings call `signup-instant`, `signInWithOAuth` and `signInWithOtp` | Not imported | None at runtime; confusion | Delete in a cleanup pass | Later | No | No | Post-launch |
| F03-2A-013 | Low | Legacy users | 4 password-only accounts predate `signup_source` | Aggregate query | Possibly unverified ownership | Owner decision (W) | No | Maybe | No | Owner decision |

## AD. Configuration matrix and Stage 2B readiness decision

### Configuration matrix

| ITEM | CURRENT STATE | EVIDENCE SOURCE | CODE OR EXTERNAL? | MANUAL VERIFICATION NEEDED? | CHANGE IN 2B? | RISK IF WRONG |
|---|---|---|---|---|---|---|
| Confirm email | Unknown; contradictory hints | `signup-instant` comment, a23 comment | External | Yes (A1) | Yes, ON (M4) | OFF keeps F-03 open; ON before code breaks signup |
| Custom SMTP | Not evidenced | No SMTP secrets/code; 4 recovery emails sent by some mailer | External | Yes (A4) | Yes (P2) | Emails undelivered or rate-capped |
| Sender address | Unknown | — | External | Yes (A4) | Yes | Spam / spoofing perception |
| Site URL | Unknown (`SITE_URL` secret exists for Edge Functions) | Secret names | External | Yes (A5) | Yes (M1) | Links point to the wrong origin |
| Redirect allowlist | Unknown | — | External | Yes (A5) | Yes (M1) | Broken confirm/reset/Google returns or open redirect |
| Confirmation callback | `/login` | `verification.ts` `VERIFY_REDIRECT_PATH` | Code (+ allowlist) | Allowlist entry | No (code) | Lands on the wrong page |
| Password-reset callback | `/reset-password` | `recovery.ts` | Code (+ allowlist) | Allowlist entry | No | Reset broken |
| Google OAuth callback | Supabase `/auth/v1/callback`; app return `/` or `/login?next=` | `LoginModal` | Both | Yes (A6, A10) | No | Google login broken |
| CAPTCHA / anti-bot | None in code | grep | Both | Yes (A7) | No (later) | Enabling without a widget breaks auth |
| Signup rate limit | Function: IP 10/h (spoofable), email 5/h, global 50/h; GoTrue unknown | `signup-instant`, a231 | Both | Yes (A8) | Yes (M3) | Abuse or self-DoS |
| Direct signup | Endpoint reachable; "allow signups" unknown | GoTrue behavior | External | Yes (A2) | No (safe once Confirm is ON) | Unlimited confirmed accounts if Confirm is OFF |
| Trial verification gate | Exists, ineffective | `start_trial` definition | Code (DB) | No | No (becomes effective) | Trial without verification |

### Regression

| Check | Result | Baseline |
|---|---|---|
| vitest | 45 files / 1635 tests passed | Equal |
| tsc errors | 19 | Equal |
| eslint | 29 (22 errors, 7 warnings) | Equal |
| Build | OK | Equal |
| Migrations | 42 | Equal |
| Routes | 27 | Equal |

### Confirmations

- F-03 Stage 2A was performed as a read-only authentication and SMTP preflight audit.
- No authentication application code was modified.
- No Supabase Auth configuration was modified.
- No SMTP configuration was modified.
- Email confirmation was not enabled.
- signup-instant was not modified.
- Password reset behavior was not modified.
- Google OAuth was not modified.
- No identity-linking behavior was modified.
- No redirect configuration was modified.
- No database migration was introduced.
- No table was introduced.
- No RLS policy was modified.
- No Stripe configuration was modified.
- No billing architecture was modified.
- No pricing was modified.
- No Premium entitlement logic was modified.
- No analytics implementation was modified.
- The LocalSEOHub landing was not modified.
- Today remains the focus layer.
- Missions remain the execution layer.
- Plan remains the roadmap layer.
- All seven LocalSEOHub tools remain available.
- All fourteen retired legacy functions remain retired.
- AI usage global limit remains 80.
- No service-role secret was exposed.
- No SMTP secret was exposed.
- F-03 remains OPEN until Stage 2B is implemented and real E2E verification passes.

### Decision

**READY FOR STAGE 2B WITH MANUAL PREREQUISITES**

This is not a launch decision.

**Manual prerequisites** (all owner-side, before any Stage 2B code ships):
1. Record the current Auth settings: Confirm email, Allow signups, Secure email change, CAPTCHA, rate limits and templates (Group A, items 1–3 and 7–9).
2. Record the Site URL and redirect allowlist, plus the Google Cloud OAuth redirect URIs and JavaScript origins (A5, A6, A10).
3. Choose the sender and create the SMTP credential (host, port, username, credential, sender address, sender name). Configure SPF/DKIM/DMARC (B1–B3).
4. Provide two test mailboxes for E2E (B7).
5. Decide what to do with the legacy password-only accounts (B6).
