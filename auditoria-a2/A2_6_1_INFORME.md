# A2.6.1 — EMAIL AUTH, EMAIL VERIFICATION & SMTP HARDENING — INTERIM REPORT (STAGE 1)

Scope: closure of F-03 / A26-003 (P2). Stage 1 only: audit, safe code changes that need no external configuration, an exact configuration plan, and tests. Stage 2 (switching signup to real verification) waits for owner confirmation.

---

## A. Executive summary

- `signup-instant` still creates users with `admin.createUser({ email_confirm: true })`. Every new email account is pre-confirmed, so the `email_confirmed_at` check in `start_trial()` has no effect. **F-03 remains OPEN.**
- Live Auth settings (public `/auth/v1/settings`): `mailer_autoconfirm: true`, `disable_signup: false`, providers email and google on. This creates a second, more serious path (A261-001): a direct `supabase.auth.signUp` call with the public anon key creates an auto-confirmed, trial-eligible user and skips all `signup-instant` rate limits.
- No custom SMTP is in evidence. The default Supabase mailer (`no-reply@mail.supabase.io`) has very low send limits and is not meant for production. Password reset delivery therefore cannot be relied on.
- Stage 1 added the whole frontend verification experience, ready for when confirmation is turned on:
  - a "check your email" screen after signup;
  - unconfirmed sign-in handling;
  - resend with a cooldown and anti-enumeration;
  - expired or invalid link handling on `/login`;
  - localised trial-gate copy;
  - an onboarding guard.

  None of this changes server behaviour today.
- Tests: 57 new A2.6.1 tests. The full suite has 1,225 tests, all green. TypeScript: 20 problems (baseline 20). ESLint: 30 problems (baseline 30). The build passes.

## B. Current-state audit

| Item | Current state |
|---|---|
| Signup entry | `LoginModal` → `supabase.functions.invoke('signup-instant')` → sign-in with password |
| `signup-instant` | `verify_jwt=false`; IP 10/h, email 5/h, global created 50/h; `admin.createUser({ email_confirm: true, app_metadata.signup_source })`; returns `{ok:true}` for an existing email (anti-enumeration) |
| Project auth | `mailer_autoconfirm: true` (Confirm email OFF), signup enabled |
| Direct `auth.signUp` | Not used by the frontend (test 17), but callable by anyone with the anon key; auto-confirmed |
| `start_trial()` | SECURITY DEFINER, `auth.uid()`, `email_confirmed_at IS NOT NULL` gate, `ON CONFLICT (user_id) DO NOTHING`, EXECUTE only for `authenticated` |
| `user_trials` | No INSERT or UPDATE grant for anon or authenticated; 0 rows |
| Users | 10 (8 email, 2 Google), all confirmed at creation, all have signed in; none carry `signup_source='signup-instant'` |
| Password reset | `resetPasswordForEmail` with `redirectTo = origin + /reset-password`; anti-enumeration; supports implicit, token_hash, code and error links; global sign-out after a change |
| Google OAuth | `signInWithOAuth({ provider: 'google', queryParams: { prompt: 'select_account' } })`, unchanged |
| Edge secrets | `SITE_URL`, `GOOGLE_*` present; no SMTP secret (correct: SMTP is set in the Auth dashboard, not in functions) |
| Legacy landings | BusinessAudit, ContentGenerator, Copilot, Diagnostic and GrowthPlan call `signup-instant`; PotentialLanding uses `signInWithOtp`. None are routed or imported, so they cannot be reached |

## C. Findings

**A261-001**
- SEVERITY: P1 (candidate; cost bounded by the AI caps)
- AREA: Auth / trial abuse
- DESCRIPTION: `mailer_autoconfirm` is true, so a direct anon-key `auth.signUp` creates a confirmed user. That user is trial-eligible and bypasses `signup-instant` IP, email and global limits.
- EVIDENCE: `/auth/v1/settings` → `"mailer_autoconfirm": true`.
- IMPACT: Unlimited throwaway accounts, each able to start a 7-day trial and use up to 80 AI generations per month. Money exposure is capped per account, but not across accounts. Supabase's own Auth rate limits are the only brake.
- FIX: Stage 2: owner turns on Confirm email, and signup moves to verified creation (section J). Optional CAPTCHA.
- TEST: 17, 40–43 (the trial gate holds once confirmation is real).
- STATUS: OPEN, owner action required.

**A261-002 (= F-03 / A26-003)**
- SEVERITY: P2
- AREA: Signup
- DESCRIPTION: `signup-instant` uses `email_confirm: true`.
- EVIDENCE: `supabase/functions/signup-instant/index.ts`; test 50.
- IMPACT: The `start_trial` verification gate is ineffective for accounts created through the official signup.
- FIX: Stage 2 code switch (section J), only after SMTP is working and Confirm email is on. Doing it now would create accounts that can never sign in, because the admin API sends no email.
- TEST: 50 (pins the current state; Stage 2 flips it).
- STATUS: OPEN.

**A261-003**
- SEVERITY: P2
- AREA: Email delivery
- DESCRIPTION: There is no evidence of custom SMTP. The default mailer is rate-limited, and its sender is not on the product domain.
- EVIDENCE: No SMTP configuration visible; there is none in `config.toml` (test 53).
- IMPACT: Reset and verification emails may be throttled, delayed or sent to spam.
- FIX: Owner configures custom SMTP (section M).
- TEST: Real delivery test in Stage 2.
- STATUS: OPEN, owner action required.

**A261-004**
- SEVERITY: P3
- AREA: UX / error leakage
- DESCRIPTION: The sign-in screen used to show raw server error text as a fallback. Unconfirmed sign-in had no dedicated screen.
- EVIDENCE: Previous `translateError` returned `msg`.
- IMPACT: Server wording reached users, and users with unconfirmed accounts got stuck.
- FIX: Added a generic fallback (`auth_err_generic`), the verify panel and resend.
- TEST: 12–24.
- STATUS: FIXED (Stage 1).

**A261-005**
- SEVERITY: P3
- AREA: Trial / onboarding
- DESCRIPTION: The trial gate message was hardcoded in Spanish. The first-value flow could fail if `start_trial` reported `email_not_verified`.
- EVIDENCE: `BillingNotices.tsx`, `FirstValueFlow.tsx`.
- IMPACT: English users saw Spanish text. After confirmation is turned on, onboarding could break.
- FIX: `t('verify_trial_needed')`; onboarding tolerates `email_not_verified`, and the Today page then asks for confirmation.
- TEST: 44, 45.
- STATUS: FIXED (Stage 1).

**A261-006**
- SEVERITY: P3
- AREA: Dead code
- DESCRIPTION: Six unreachable legacy landing pages call `signup-instant` or `signInWithOtp`.
- EVIDENCE: Not imported by any route.
- IMPACT: None today. They are a risk if re-routed.
- FIX: Delete them in a later cleanup (not in scope; no deletion done).
- TEST: 17 (no `auth.signUp` in the frontend).
- STATUS: ACCEPTED / DEFERRED.

## D. Changes made in Stage 1 (code only, no external configuration)

1. New verification helpers: link-problem capture limited to `/login` (never trusts URL parameters as "verified"), redirect builder, unconfirmed-error detection, resend with neutral classification.
2. New verify-email panel: shows the typed address, resend with a 60 s cooldown and in-flight guard, generic success message, back to sign in.
3. Sign-in screen: unconfirmed sign-in opens the panel; after signup, if sign-in requires confirmation it shows "check your email" (the same screen for new and existing addresses); a 429 shows the rate-limit message; other errors show generic text.
4. App startup captures failed email-link landings before the auth client clears the URL. `/login` opens the panel with an "expired" or "invalid" title.
5. Spanish and English copy for all new strings.
6. The trial card uses translated copy; onboarding no longer fails on `email_not_verified`.
7. One existing reset test assertion was relaxed from an exact line to a pattern, so the startup line can carry the extra link-problem value. Its intent is unchanged.

Not changed: `signup-instant`, project Auth settings, SMTP, templates, Google, Stripe, DNS, the database (no migration in A2.6.1), users, AI usage.

## E. Signup flow (target, after Stage 2)

signup → account created unconfirmed → confirmation email (custom SMTP) → link → `/login` (session from link) → `email_confirmed_at` set by Supabase → sign in → `start_trial()` passes → 7-day trial → Premium.

## F. Email verification

- Stage 1 status: the frontend is ready; the server still auto-confirms.
- Resend uses `auth.resend({ type: 'signup', emailRedirectTo: origin + '/login' })`.

## G. Password reset

- Flow validated by code and tests (34–39, plus the existing password reset suite).
- Delivery depends on the mailer (A261-003). NOT READY for a real test until custom SMTP is verified.

## H. Trial eligibility

The server gate (`start_trial`) is correct and is the only authority. The client never decides eligibility. Once confirmation is real, unverified users get `email_not_verified` and no trial row.

## I. Anti-enumeration

- Signup: identical response and identical "check your email" screen for new and existing addresses.
- Resend and reset: account-specific errors read as "sent"; only request-level limits are surfaced.

## J. Stage 2 design (NOT applied)

1. `signup-instant` keeps the IP, email and global checks, then calls `auth.signUp` with an anon-key client and `emailRedirectTo = SITE_URL + '/login'`, with the origin allow-listed.
2. The global breaker counts all recently created `auth.users` rows, because `signUp` cannot set `app_metadata`.
3. The pinned tests (`email_confirm: true` in a231, a23, a2420, a26 and test 50 here) are flipped deliberately.
4. Deployed in the same window as the owner turning on Confirm email.

## K. Rate limits

Unchanged: IP 10/h, email 5/h, global breaker 50/h (test 49). Supabase Auth's own limits apply as well; review them in M.6.

## L. Legacy users

There are 10 existing users, all confirmed. Policy: keep them as they are. Do not unconfirm or delete them. No action taken.

## M. OWNER ACTION REQUIRED (exact steps)

1. **Database ownership.** In Bolt: Database → Advanced. If the project is not yet claimed, use **Claim** to move it into your own Supabase account. On a Bolt-managed database, custom SMTP settings appear to save but are ignored.
2. **Custom SMTP.** In Supabase: Authentication → Emails → SMTP Settings → enable custom SMTP and fill in Host, Port, Username, Password, Sender email and Sender name. Use a provider on a domain you own, with SPF, DKIM (and ideally DMARC) verified. Example with Resend: host `smtp.resend.com`, port 465, user `resend`, password = your API key, sender e.g. `no-reply@yourdomain`. **Do not paste the password or API key into Bolt.**
3. **URLs.** Authentication → URL Configuration:
   - Site URL = your production domain.
   - Redirect allow-list: `https://<prod>/login`, `https://<prod>/reset-password`, and the same paths on your preview or local addresses.
4. **Templates.** Review "Confirm signup" and "Reset password". Keep `{{ .ConfirmationURL }}` as the link. Use Spanish copy if desired.
5. **Confirm email.** Do NOT turn it on yet. Tell me when steps 1–4 are done. I will prepare the Stage 2 code switch, and you then enable "Confirm email" in the same window.
6. **Abuse limits.** Authentication → Rate Limits: review email-sent and sign-up limits. Optionally enable CAPTCHA (Attack Protection).
7. **Real test.** Send one password reset to your own address and confirm it arrives from your domain, not from spam.

## N. Tests

- New: `a261EmailAuth.test.ts`, 57 tests covering:
  - link handling;
  - fake parameters;
  - unconfirmed sign-in;
  - resend and anti-enumeration;
  - reset;
  - the `start_trial` gate, grants and concurrency;
  - ES and EN copy;
  - rate limits;
  - Google OAuth;
  - routes;
  - no SMTP or service secrets in source or build;
  - no destructive SQL;
  - AI caps;
  - the 7 tools and the 14 retired functions;
  - A2.5 and Stripe untouched.
- Full suite: 39 files, 1,225 tests, all passing.
- TypeScript: 20 problems (baseline 20, 0 new). ESLint: 30 problems (baseline 30, 0 new). `npm run build`: passes.

## O. Preserved controls

- AI caps: weekly-content 22, business-improvement 18, seo-generator 18, business-advisor 12, voice-simulator 10, GLOBAL 80.
- All 7 tools enabled; all 14 legacy functions return 410.
- Signup rate limits unchanged.

## P. Risks remaining

- A261-001 and A261-002 stay open until Stage 2.
- Email delivery is unproven (A261-003).

## Q. Stage status

- A2.6.1 STAGE 1 = COMPLETE
- EXTERNAL SMTP CONFIGURATION = REQUIRED
- EMAIL CONFIRMATION = NOT READY FOR REAL TEST
- PASSWORD RESET = NOT READY FOR REAL TEST (mailer not verified)
- F-03 = OPEN

No Stripe configuration was modified during A2.6.1.
The A2.5 Google verification trust fix remains active.

**OWNER ACTION REQUIRED** (section M). A2.6.1 is not approved. A3 has not been started. Waiting for audit and explicit authorization before Stage 2.
