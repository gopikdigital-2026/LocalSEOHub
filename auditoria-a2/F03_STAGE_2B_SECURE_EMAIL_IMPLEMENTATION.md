# F-03 STAGE 2B — SECURE EMAIL VERIFICATION IMPLEMENTATION

**Decision: READY FOR EXTERNAL ACTIVATION WITH FINDINGS**

**F-03 status: IMPLEMENTED — PENDING EXTERNAL ACTIVATION AND E2E VERIFICATION**

---

## A. Executive summary

Customer email/password registration no longer uses `signup-instant` (which called `auth.admin.createUser({ email_confirm: true })` and then `signInWithPassword`). It now uses the standard `supabase.auth.signUp` with `emailRedirectTo = verificationRedirectUrl(origin)` (`/login`). If Supabase returns no session, the existing `VerifyEmailPanel` ("Revisa tu correo" / "Check your email") is shown. The `signup-instant` source has been replaced with a 410 retirement stub that cannot create or confirm users.

Two conditions apply before the security invariant is complete:

1. **Confirm email is still DISABLED** in the dashboard. While it is off, Supabase auto-confirms `signUp` users and returns a session, and the code accepts that session (`signed_in`) instead of faking an unconfirmed state. **The invariant "no email/password account is confirmed without mailbox proof" is INCOMPLETE until Confirm email is enabled externally.**
2. **The 410 stub of `signup-instant` is now DEPLOYED (on request).** The live endpoint can no longer create or pre-confirm accounts. Consequence: the currently published frontend still calls it, so email/password signup on the published site fails until the Stage 2B frontend is published (F03-2B-001).

No migrations, tables, SMTP, Stripe, billing, pricing, tools or AI limits were changed. Regression: vitest 46 files / 1666 tests green, tsc 19 (baseline), eslint 29 (baseline), migrations 42, routes 27, build OK.

## B. Stage 2A starting state

Stage 2A decision: READY FOR STAGE 2B WITH MANUAL PREREQUISITES. Starting state:
- `LoginModal` signup called `invoke('signup-instant')`, then `signInWithPassword`.
- `signup-instant` used the service role and `auth.admin.createUser({ email_confirm: true })`, with custom IP/email/global limits and the signup-created breaker.
- Verification infrastructure (VerifyEmailPanel, captureVerificationLinkProblem, requestVerificationResend, isEmailNotConfirmed) already existed but was not used by signup.
- `start_trial` already required `auth.users.email_confirmed_at IS NOT NULL`.

## C. Confirmed external configuration

| Setting | Value (confirmed externally) |
|---|---|
| Signups allowed / Email provider | Enabled |
| Confirm email | **DISABLED** |
| Secure email change | ON |
| Anonymous sign-ins | OFF |
| Manual identity linking | OFF |
| Site URL | `https://localseohub.io` |
| Redirect allowlist | `https://localseohub.io/**`, `https://localseohub.io/reset-password` |
| Custom SMTP | Resend, `no-reply@localseohub.io`, "LocalSEOHub" (not modified) |
| Templates | Confirm signup, Reset password, Change email, Reauthentication (exist) |

Bolt changed no dashboard setting.

## D. Old insecure signup architecture

`LoginModal` → `supabase.functions.invoke('signup-instant', {email,password})` → service role `auth.admin.createUser({ email, password, email_confirm: true, app_metadata:{signup_source:'signup-instant'} })` → client `signInWithPassword`. Any unauthenticated caller could create a **pre-confirmed** account for any email address they did not own. That enabled pre-account takeover through automatic Google identity linking, and satisfied the trial's `email_confirmed_at` gate without mailbox proof.

## E. New signup architecture

`LoginModal` → `requestEmailSignup(supabase.auth, email, password, origin, pendingBusinessMetadata(...))` (in `src/features/email-verification/signup.ts`) → `auth.signUp({ email: trimmed, password, options: { emailRedirectTo: origin + '/login', data: { pending_business_name? } } })`.

| Outcome | Condition | UI |
|---|---|---|
| `verify` | No session returned, or `user_already_exists` / `email_exists` / "already registered" | VerifyEmailPanel `reason='signup'` (neutral) |
| `signed_in` | Supabase returned a session (only possible while Confirm email is OFF) | `trackCompleteRegistration()` + `finish()` |
| `rate_limited` | 429 / `over_email_send_rate_limit` / `over_request_rate_limit` | `reset_err_rate_limited` |
| `weak_password` | `weak_password` | `reset_err_weak` |
| `invalid_email` | Local validation or `email_address_invalid` / `validation_failed` | `reset_err_email_invalid` |
| `error` | Anything else, including thrown/network errors | `auth_err_generic` |

There is no `signInWithPassword` after signup, no service role, and no Edge Function in the signup path.

## F. signup-instant disposition

- Source replaced with the repository's 410 retirement convention (corsHeaders, OPTIONS 200, otherwise `410 {error:'gone'}`). No Supabase client, no service role, no `createUser`, no `email_confirm`.
- Not deleted; the `config.toml` entry remains (`verify_jwt = false`, harmless for a 410 stub).
- Not added to the "14 retired legacy functions" set; that set stays byte-identical at 14.
- **Deployed (F03-2B-001).** The live function now returns 410. Until the Stage 2B frontend is published, email/password signup on the published site fails safely (no account is created). Google sign-in and existing-user login are unaffected.
- Unused DB helpers (`signup_created_recently`, `consume_rate_limit`) remain. They are service-role only and harmless; no migration was needed.

## G. Verification UI

`VerifyEmailPanel reason='signup'` is reused. Changes:
- The resend cooldown now starts at 60 s for `signup`, because an email was just sent.
- Copy: ES "Revisa tu correo" plus "Si la dirección es nueva, te hemos enviado un enlace para confirmarla. Confirma tu correo para continuar. Si ya tienes cuenta, inicia sesión."; EN "Check your email" plus "If this address is new, we've sent you a link to confirm it. Confirm your email to continue. If you already have an account, sign in."

## H. Confirmation return

The link returns to `https://localseohub.io/login`, which is covered by the `/**` allowlist. The existing session detection and `useAuthRedirect` / `destinationFor` route the user to `/empezar` (onboarding) or their `next` destination. `captureVerificationLinkProblem` still maps `otp_expired` to "expired", other errors to "invalid", and ignores `type=recovery`. `App.tsx` is unchanged (frozen hash).

## I. Resend verification

Unchanged `requestVerificationResend` → `auth.resend({ type:'signup', email, options:{ emailRedirectTo: origin+'/login' } })`, with an in-flight guard, a 60 s cooldown and neutral outcomes.

## J. Pending business context

- sessionStorage `pending_business_name` (existing) is read with `peekPendingBusinessName()` without being consumed.
- It is also sent as signup `user_metadata.pending_business_name`, sanitized (control characters stripped, whitespace collapsed, max 120 characters). This survives opening the confirmation link in another tab or device.
- `FirstValueFlow` uses `getPendingBusinessName() ?? pendingBusinessFromMetadata(user_metadata)` **only as a prefill hint**. The saved business record always wins (`initialBusinessData`).
- No password, token or session is stored. `user_metadata` is user-editable, so it is never used for authorization.

## K. Business creation safety

Business creation is unchanged: `resolveBusiness` upserts `businesses {user_id}` with `onConflict:'user_id', ignoreDuplicates:true` under own-only RLS. The metadata hint never creates a business by itself, so there is no duplicate-business path.

## L. Trial security

`start_trial` is unchanged: `SELECT u.email_confirmed_at IS NOT NULL INTO v_verified FROM auth.users u WHERE u.id = v_uid;` and the result maps to `email_not_verified`. The client cannot set `email_confirmed_at`. Once Confirm email is ON, an unconfirmed signup has no session at all. While it is OFF, Supabase itself confirms the user (F03-2B-002).

## M. Google OAuth preservation

The Google path is unchanged (`provider:'google'`, `prompt:'select_account'`, redirect `/login?next=…`). No `linkIdentity` or `unlinkIdentity` was introduced, and manual linking stays OFF.

## N. Identity collision mitigation

With Confirm email ON, a password identity created by someone who does not own the mailbox stays unconfirmed. Supabase automatic linking does not attach to unconfirmed identities and removes them when the verified Google identity arrives (E09). The previous `email_confirm:true` path defeated this. The mitigation is effective only after Confirm email is enabled **and** the signup-instant stub is deployed.

## O. Existing-user safety

No admin user writes, no data changes and no migrations. The 10 existing users (all confirmed, including 4 mixed email+Google) and their identities were not touched.

## P. Password reset

Unchanged: `resetPasswordForEmail(email.trim(), { redirectTo: origin + '/reset-password' })`, the recovery capture, and the `/reset-password` route.

## Q. Enumeration behavior

Signing up with an existing email maps to the same neutral "check your email" panel. With Confirm email ON, Supabase returns an obfuscated user and no session for existing emails. Resend stays neutral. Error copy never includes raw Supabase messages.

## R. Rate-limit implications

The custom `signup-instant` limits (IP 10/h, email 5/h, global 50/h, signup-created breaker) no longer apply. Supabase Auth rate limits (email sends, sign-up/sign-in requests) and the Resend quota are now the primary controls (F03-2B-003). 429 responses show a neutral localized message.

## S. Analytics registration semantics

- `register_attempt` is unchanged.
- New `register_pending_verification` fires when the verify panel is shown.
- `register_failed` carries the outcome code only.
- `trackCompleteRegistration()` (Meta pixel) fires **only** in the `signed_in` branch, i.e. never for an unconfirmed signup. Once Confirm email is ON, it no longer fires on signup at all; moving it to after the first confirmed session is deferred to the analytics phase (F03-2B-005).
- `useAuth`'s `register_success` heuristic is unchanged.

## T. Failure states

Invalid email (no network call), weak password, rate limit, existing account (neutral), SMTP/send failure and network failure all map to localized copy (see E). There is no fake "sent" on failure (except the deliberate neutral existing-account case) and no raw internals are shown.

## U. Secrets/SMTP preservation

SMTP was not touched. The client `.env` holds only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PRICE_ID` and `VITE_ADMIN_EMAIL`. A test confirms there is no service-role, SMTP or Resend secret in `src`.

## V. Frozen architecture

Frozen-hash tests (A2.7.1, A2.7.2, A2.7.3, A2.8.1, including `App.tsx`) pass unchanged. Today, Missions, Plan, the 7 tools, billing and Stripe were not modified.

## W. Database/migrations

None. Migrations stay at 42.

## X. Automated tests

New file `src/features/email-verification/__tests__/f03Stage2b.test.ts` (34 tests) covers required items 1–35 with mocked `signUp` and `resend`, the pending-business helpers, `startTrial` mapping, `safeReturnPath`, link capture, reset URL, AI caps, 14 retired functions, 42 migrations and 27 routes.

Legacy tests that asserted the insecure behaviour were updated to assert retirement: `a231Reservations`, `a23CostControl`, `a2420Ledger`, `a26Billing`, `premiumAccess`, `a261EmailAuth`, `a261SpecChecklist` and `passwordReset`.

Total: 46 files, 1666 tests passing (baseline 1635).

| # | Item | Result |
|---|---|---|
| 1 | Active signup no longer invokes signup-instant | PASS |
| 2 | Uses auth.signUp | PASS |
| 3 | Secure email redirect | PASS |
| 4 | No email_confirm:true in active signup | PASS |
| 5 | signup-instant cannot auto-confirm | PASS (source + deployed) |
| 6 | signup-instant retired | PASS (source + deployed) |
| 7 | No session leads to verification UI | PASS |
| 8 | No immediate password sign-in | PASS |
| 9 | Resend works | PASS |
| 10 | Resend anti-enumeration | PASS |
| 11 | Redirect safe | PASS |
| 12 | Expired link | PASS |
| 13 | Invalid link | PASS |
| 14 | Pending context survives | PASS |
| 15 | No password/token in pending context | PASS |
| 16 | No duplicate business | PASS |
| 17 | start_trial gate preserved | PASS |
| 18 | Unconfirmed email cannot satisfy trial | PASS |
| 19 | Google OAuth preserved | PASS |
| 20 | returnTo protection | PASS |
| 21 | Existing users not modified | PASS |
| 22 | Password reset preserved | PASS |
| 23 | CompleteRegistration not on unconfirmed | PASS |
| 24 | No SMTP secret in client | PASS |
| 25 | No service-role key in client | PASS |
| 26 | Billing preserved | PASS |
| 27 | Stripe preserved | PASS |
| 28–30 | A2.7.1 / A2.7.2 / A2.7.3 preserved | PASS (frozen-hash suites) |
| 31 | Tool engines preserved | PASS |
| 32 | AI limits 22/18/18/12/10, global 80 | PASS |
| 33 | 14 legacy functions retired | PASS |
| 34 | Migrations 42 | PASS |
| 35 | Routes 27 | PASS |

## Y. Static security search

Searched `src`, `supabase`, `docs` and `auditoria-a2`.

| Pattern | Location | Classification |
|---|---|---|
| `signup-instant` | `src/components/{BusinessAuditLanding,ContentGeneratorLanding,CopilotLanding,DiagnosticLanding,GrowthPlanLanding}.tsx` | DEAD/UNREACHABLE (imported nowhere; after the 410 the call fails safely) |
| `signup-instant` | `supabase/config.toml` `[functions.signup-instant]` | RETIRED (config of the 410 stub) |
| `signup-instant` | `supabase/migrations/…a231_signup_created_accounts_breaker.sql` | RETIRED (historic, service-role-only helper; migration not modified) |
| `signup-instant`, `email_confirm: true`, `admin.createUser` | `src/features/**/__tests__/*` | TEST (negative assertions) |
| all patterns | `docs/AUDIT_PRE_LAUNCH_001.md`, `auditoria-a2/*.md` | DOCUMENTATION |
| `email_confirm`, `admin.createUser`, `auth.admin.createUser` | `supabase/functions/**` | **None** |
| any pattern | active frontend (`src` excluding the orphan landings) | **None (ACTIVE = 0)** |

`PotentialLanding.tsx` also contains a dead `signInWithOtp({shouldCreateUser:true})`. It is unreachable and documented only (F03-2B-004).

## Z. Regression

| Step | Result |
|---|---|
| vitest | 46 files, 1666 passed |
| tsc | 19 (baseline 19, no new) |
| eslint | 29 problems (baseline 29, no new) |
| migrations | 42 |
| routes | 27 |
| build (last) | OK |

## AA. Findings

| ID | SEVERITY | AREA | PREVIOUS STATE | CHANGE | EVIDENCE | TEST | REMAINING RISK | STATUS | LAUNCH CLASSIFICATION |
|---|---|---|---|---|---|---|---|---|---|
| F03-2B-001 | HIGH | signup-instant deploy | Live function pre-confirms arbitrary emails | 410 stub written and **deployed** | `supabase/functions/signup-instant/index.ts` | f03Stage2b 5/6 | Published frontend's email signup fails until the new frontend is published | MITIGATED, publish the Stage 2B frontend promptly | LAUNCH BLOCKER until frontend published |
| F03-2B-002 | HIGH | Confirm email | OFF: Supabase auto-confirms signUp | Code handles both modes honestly; no fake unconfirmed state | signup.ts `signed_in` | items 7, 23 | Invariant incomplete until enabled | OPEN, external action | LAUNCH BLOCKER until enabled |
| F03-2B-003 | MEDIUM | Rate limits | Custom IP/email/global limits in signup-instant | Supabase Auth limits now primary | Section R | a23CostControl T9/T10 | Signup burst bounded only by Auth/Resend limits | ACCEPTED, review Auth rate limits externally | NON-BLOCKING |
| F03-2B-004 | LOW | Orphan landings | 7 unused landings with signup-instant / OTP code | Documented, not removed (no broad cleanup) | Section Y | orphan-import test | None while unreachable; fails safely after 410 | DOCUMENTED | POST-LAUNCH CLEANUP |
| F03-2B-005 | LOW | Analytics | CompleteRegistration after instant sign-in | Fires only when a session is issued | Section S | item 23 | Under-counting registrations once Confirm is ON | DEFERRED (analytics phase) | NON-BLOCKING |
| F03-2B-006 | INFO | Pending name hint | sessionStorage only | Also in user_metadata (user-editable) | Section J | item 14/15 | None: prefill only, never authorization | CLOSED | NON-BLOCKING |

## AB. External activation checklist

```
[ ] ZIP reviewed externally
[ ] Stage 2B code approved
[ ] Stage 2B code published
[ ] Supabase Authentication opened
[ ] Sign In / Providers opened
[ ] Confirm email enabled
[ ] Changes saved
[ ] New test email registration performed
[ ] Confirmation email received
[ ] Confirmation link opened
[ ] Email ownership confirmed
[ ] Onboarding completed
[ ] Trial verified
[ ] Logout/login verified
[ ] Password reset email verified
[ ] Google OAuth verified
[ ] Existing user login verified
[ ] Identity-collision test completed
[ ] F-03 externally approved
```

The `signup-instant` 410 stub is already deployed; publish the Stage 2B frontend promptly so email signup works again on the live site (F03-2B-001).

**MANUAL ACTION REQUIRED AFTER CODE APPROVAL: Authentication → Sign In / Providers → Confirm email → ENABLE → Save changes**

Do this only after the ZIP audit, approval and publication.

## AC. E2E checklist

Stage 2A matrix preserved. **None of these has been executed; none is claimed as passed.**

| ID | PRECONDITION | ACTION | EXPECTED | INVARIANT | STATUS |
|---|---|---|---|---|---|
| E01 | New mailbox | Sign up with email+password | Check-email panel; email arrives from the brand sender | No session before confirmation | NOT RUN |
| E02 | E01 | Click the link | Lands on `/login`, signed in, goes to `/empezar` | Session only after mailbox proof | NOT RUN |
| E03 | E01, link opened in a new tab or device | Click | Signed in; business name pre-filled (or asked again) | No crash; no other user's data | NOT RUN |
| E04 | Unconfirmed account | Log in with password | Verify panel `reason='login'` + resend | No session | NOT RUN |
| E05 | Existing confirmed password account | Sign up with the same email | Neutral panel | No enumeration; password unchanged | NOT RUN |
| E06 | Existing Google-only account | Sign up with a password | Neutral panel | No password silently attached | NOT RUN |
| E07 | Mixed-case email | Sign up `User@X.com`, log in `user@x.com` | Same account | Normalization | NOT RUN |
| E08 | Confirmed password account | Sign in with Google, same email | One user, both identities | Linking only for a verified email | NOT RUN |
| E09 | Attacker signs up with the victim's email (unconfirmed) | Victim signs in with Google | Victim gets an account; attacker password identity removed/unusable | **No pre-account takeover** | NOT RUN |
| E10 | After C3 | POST directly to `signup-instant` | 410, or an unconfirmed user and no session | Never pre-confirms | NOT RUN |
| E11 | Confirm email ON | Direct `/auth/v1/signup` with the anon key | Unconfirmed user, email sent | Direct bypass is safe | NOT RUN |
| E12 | Link from E01 | Tamper with `redirect_to` to an external host | Rejected by the allowlist | No open redirect | NOT RUN |
| E13 | Any account | Forgot password | Email via custom SMTP; reset works at `/reset-password` | Reset unchanged | NOT RUN |
| E14 | Google-only account | Forgot password | Email sent; password set | Mailbox proof | NOT RUN |
| E15 | Expired confirmation link | Click | "Link expired" panel + resend | No session; no trust in the URL | NOT RUN |
| E16 | Invalid/reused link | Click | "Invalid link" panel | Same | NOT RUN |
| E17 | Unconfirmed account | Resend twice within 60 s | Second click blocked by cooldown | Neutral copy | NOT RUN |
| E18 | Unconfirmed account (crafted session attempt) | Call `rpc('start_trial')` | `email_not_verified` | No trial before verification | NOT RUN |
| E19 | Confirmed new user | Finish FirstValueFlow | Trial starts once | Idempotent trial | NOT RUN |
| E20 | Signup burst | Exceed the rate limits | Neutral rate-limit message | Availability is acceptable | NOT RUN |
| E21 | Existing 10 users | Log in (password/Google) | Works unchanged | No lockout | NOT RUN |
| E22 | `/login?next=//evil.com` | Log in | Goes to `/hoy` | `safeReturnPath` | NOT RUN |
| E23 | Regression | Today/Missions/Plan/7 tools/limits | Unchanged | Product invariants | NOT RUN |

## AD. F-03 status

**IMPLEMENTED — PENDING EXTERNAL ACTIVATION AND E2E VERIFICATION**

### Literal confirmations

- The insecure automatic email-confirmation signup path was removed from active customer registration.
- No active customer signup path can use email_confirm:true to trust an arbitrary email address.
- signup-instant can no longer automatically confirm arbitrary email addresses.
- Email/password registration now uses the standard Supabase signup flow.
- The existing email-verification infrastructure was reused.
- The existing password-reset architecture was preserved.
- Google OAuth was preserved.
- No custom identity-linking mechanism was introduced.
- Existing users were not modified.
- Existing identity links were not modified.
- The server-side verified-email trial gate was preserved.
- Client state cannot grant email verification.
- Client state cannot grant Premium.
- No SMTP configuration was modified.
- No SMTP secret was exposed.
- No service-role secret was exposed to the client.
- No Stripe configuration was modified.
- No pricing was modified.
- No billing entitlement architecture was modified.
- No new AI capability was introduced.
- All seven LocalSEOHub tools remain available.
- Today remains the focus layer.
- Missions remain the execution layer.
- Plan remains the roadmap layer.
- AI usage global limit remains 80.
- All fourteen retired legacy functions remain retired.
- Confirm email was not enabled by Bolt.
- F-03 is not closed until Confirm email is enabled externally and the real E2E verification passes.

Note on "signup-instant can no longer automatically confirm arbitrary email addresses": this holds for both the code delivered and the live endpoint, since the stub is deployed (F03-2B-001).

**Final decision: READY FOR EXTERNAL ACTIVATION WITH FINDINGS**
