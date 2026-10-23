import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  VERIFY_REDIRECT_PATH,
  captureVerificationLinkProblem,
  classifyResendError,
  isEmailNotConfirmed,
  requestVerificationResend,
  verificationRedirectUrl,
  type ResendAuthClient,
} from '../verification';
import {
  RESET_PASSWORD_PATH,
  captureRecoveryLink,
  classifyResetRequestError,
  requestPasswordReset,
  resetRedirectUrl,
  type RecoveryAuthClient,
} from '../../password-reset/recovery';
import { startTrial } from '../../billing/repository';
import { TOOLS } from '../../tools/catalog';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const mig = (suffix: string) => src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith(suffix))}`);
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

const loginModal = src('src/components/LoginModal.tsx');
const panel = src('src/features/email-verification/VerifyEmailPanel.tsx');
const verificationSrc = src('src/features/email-verification/verification.ts');
const recoverySrc = src('src/features/password-reset/recovery.ts');
const app = src('src/App.tsx');
const main = src('src/main.tsx');
const i18n = src('src/lib/i18n.tsx');
const notices = src('src/features/billing/BillingNotices.tsx');
const firstValue = src('src/features/first-value/FirstValueFlow.tsx');
const signup = src('supabase/functions/signup-instant/index.ts');
const config = src('supabase/config.toml');
const trialSql = stripComments(mig('_a231_ai_reservation_ledger_and_concurrency.sql'));
const capsSql = mig('_a248_voice_simulator_limits.sql');
const a25Sql = stripComments(mig('_a25_gbp_server_verified_profile.sql'));
const frontend = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));
const frontendText = frontend.map((f) => readFileSync(f, 'utf8')).join('\n');

const ORIGIN = 'https://app.example.com';
const resendClient = (result: { error: { code?: string; status?: number; message?: string } | null } | Error) => {
  const resend = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { resend } as unknown as ResendAuthClient, resend };
};
const resetClient = (error: { code?: string; status?: number } | null) => {
  const resetPasswordForEmail = vi.fn(async () => ({ error }));
  return { client: { resetPasswordForEmail } as unknown as RecoveryAuthClient, resetPasswordForEmail };
};
const keyIn = (lang: 'es' | 'en', key: string) => {
  const block = i18n.split(/\n\s*en:\s*\{/);
  const section = lang === 'es' ? block[0] : block[1] ?? '';
  return new RegExp(`\\b${key}:\\s*['"\`]`).test(section);
};

describe('A2.6.1 email verification link handling', () => {
  it('1. verification links land on /login', () => {
    expect(VERIFY_REDIRECT_PATH).toBe('/login');
    expect(verificationRedirectUrl(ORIGIN)).toBe(`${ORIGIN}/login`);
  });

  it('2. an expired link (otp_expired) is reported as expired', () => {
    expect(captureVerificationLinkProblem(`${ORIGIN}/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`)).toBe('expired');
  });

  it('3. any other link error is reported as invalid', () => {
    expect(captureVerificationLinkProblem(`${ORIGIN}/login?error=access_denied&error_code=bad_jwt`)).toBe('invalid');
    expect(captureVerificationLinkProblem(`${ORIGIN}/login#error_description=broken`)).toBe('invalid');
  });

  it('4. a clean /login URL is not a link problem', () => {
    expect(captureVerificationLinkProblem(`${ORIGIN}/login`)).toBeNull();
    expect(captureVerificationLinkProblem(`${ORIGIN}/login?next=/hoy`)).toBeNull();
  });

  it('5. errors on other paths are ignored by the verification capture', () => {
    expect(captureVerificationLinkProblem(`${ORIGIN}/hoy#error=access_denied&error_code=otp_expired`)).toBeNull();
    expect(captureVerificationLinkProblem(`${ORIGIN}/reset-password#error=access_denied&error_code=otp_expired`)).toBeNull();
  });

  it('6. recovery links are left to the password reset flow', () => {
    expect(captureVerificationLinkProblem(`${ORIGIN}/login#type=recovery&error=access_denied`)).toBeNull();
  });

  it('7. malformed URLs never throw', () => {
    expect(captureVerificationLinkProblem('not a url')).toBeNull();
  });

  it('8. no URL parameter can mark an account as verified or premium', () => {
    for (const fake of ['verified=true', 'email_confirmed=1', 'premium=true', 'type=signup', 'trial=active']) {
      expect(captureVerificationLinkProblem(`${ORIGIN}/login?${fake}`)).toBeNull();
      expect(captureVerificationLinkProblem(`${ORIGIN}/login#${fake}`)).toBeNull();
    }
    expect(verificationSrc).not.toMatch(/verified\s*[:=]\s*true|email_confirmed_at/);
  });

  it('9. the link problem is captured once at startup and handed to the app', () => {
    expect(main).toContain('captureVerificationLinkProblem(window.location.href)');
    expect(main).toContain('initialLinkProblem={initialLinkProblem}');
  });

  it('10. the /login route passes the link problem into the sign-in screen', () => {
    expect(app).toContain('<AuthRoute mode="login" linkProblem={linkProblem} />');
    expect(app).toContain('initialLinkProblem');
  });

  it('11. the sign-in screen opens the verification panel for a failed link', () => {
    expect(loginModal).toContain("initialLinkProblem ? { reason: 'link', email: '' } : null");
    expect(panel).toContain("linkProblem === 'expired' ? 'verify_link_expired_title' : 'verify_link_invalid_title'");
  });
});

describe('A2.6.1 unconfirmed sign-in and signup screens', () => {
  it('12. email_not_confirmed is detected by code', () => {
    expect(isEmailNotConfirmed({ code: 'email_not_confirmed', message: 'x' })).toBe(true);
  });

  it('13. email_not_confirmed is detected by message for older servers', () => {
    expect(isEmailNotConfirmed({ message: 'Email not confirmed' })).toBe(true);
  });

  it('14. other auth errors are not treated as unconfirmed', () => {
    expect(isEmailNotConfirmed(null)).toBe(false);
    expect(isEmailNotConfirmed({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(false);
  });

  it('15. an unconfirmed sign-in opens the verify panel instead of an error', () => {
    expect(loginModal).toContain('if (isEmailNotConfirmed(authError)) {');
    expect(loginModal).toContain("setVerifying({ reason: 'login', email });");
  });

  it('16. after signup, a sign-in that needs confirmation shows "check your email"', () => {
    expect(loginModal).toContain("setVerifying({ reason: 'signup', email });");
  });

  it('17. signup uses standard Supabase signup, no longer signup-instant (F-03 Stage 2B)', () => {
    expect(loginModal).not.toContain("invoke('signup-instant'");
    expect(loginModal).toContain('requestEmailSignup(');
  });

  it('18. password sign-in call is unchanged', () => {
    expect(loginModal).toContain('await supabase.auth.signInWithPassword({ email, password });');
  });

  it('19. raw server error text is never shown; a generic fallback is used', () => {
    expect(loginModal).toContain("translateError(authError.message, t('auth_err_generic'))");
    expect(loginModal).not.toMatch(/setError\(\s*(authError|fnError|error)\.message\s*\)/);
  });

  it('20. a signup rate limit shows the rate-limited message', () => {
    expect(loginModal).toContain("rate_limited: 'reset_err_rate_limited'");
    expect(loginModal).toContain("error: 'auth_err_generic'");
  });

  it('21. the panel shows the address the user typed', () => {
    expect(panel).toContain("t('verify_sent_to')");
    expect(panel).toContain('initialEmail.trim()');
  });

  it('22. the panel has a way back to sign in that clears the password', () => {
    expect(loginModal).toContain("onBack={() => { setVerifying(null); setMode('login'); setPassword(''); clearMessages(); }}");
  });

  it('23. the panel has a resend button with a cooldown', () => {
    expect(panel).toContain("t('verify_resend_btn')");
    expect(panel).toContain('setCooldown(RESEND_COOLDOWN_SECONDS)');
  });

  it('24. the panel never logs the address or server errors', () => {
    expect(panel).not.toMatch(/console\.\w+/);
    expect(verificationSrc).not.toMatch(/console\.\w+/);
  });
});

describe('A2.6.1 resend confirmation email', () => {
  it('25. resend asks for a signup email with the /login redirect', async () => {
    const { client, resend } = resendClient({ error: null });
    expect(await requestVerificationResend(client, ' ana@example.com ', ORIGIN)).toBe('sent');
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'ana@example.com', options: { emailRedirectTo: `${ORIGIN}/login` } });
  });

  it('26. an invalid address is rejected without calling the server', async () => {
    const { client, resend } = resendClient({ error: null });
    expect(await requestVerificationResend(client, 'nope', ORIGIN)).toBe('invalid_email');
    expect(resend).not.toHaveBeenCalled();
  });

  it('27. unknown accounts read as "sent" (no account enumeration)', () => {
    expect(classifyResendError({ code: 'user_not_found' })).toBe('sent');
  });

  it('28. already-confirmed or existing accounts read as "sent"', () => {
    expect(classifyResendError({ code: 'email_exists' })).toBe('sent');
    expect(classifyResendError({ code: 'user_already_exists' })).toBe('sent');
  });

  it('29. the per-address send limit reads as "sent"', () => {
    expect(classifyResendError({ code: 'over_email_send_rate_limit', status: 429 })).toBe('sent');
  });

  it('30. the request-level rate limit is surfaced', () => {
    expect(classifyResendError({ code: 'over_request_rate_limit' })).toBe('rate_limited');
    expect(classifyResendError({ status: 429 })).toBe('rate_limited');
  });

  it('31. a server-side invalid address is surfaced', () => {
    expect(classifyResendError({ code: 'email_address_invalid' })).toBe('invalid_email');
  });

  it('32. unexpected failures are a generic error', async () => {
    expect(classifyResendError({ code: 'unexpected_failure', status: 500 })).toBe('error');
    const { client } = resendClient(new Error('network'));
    expect(await requestVerificationResend(client, 'ana@example.com', ORIGIN)).toBe('error');
  });

  it('33. the redirect is built from the app origin, not from user input', () => {
    expect(panel).toContain('window.location.origin');
    expect(verificationSrc).not.toMatch(/searchParams\.get\(['"](redirect|next|redirect_to)['"]\)/);
  });
});

describe('A2.6.1 password reset flow (validated, unchanged)', () => {
  it('34. reset emails redirect to /reset-password on the app origin', async () => {
    const { client, resetPasswordForEmail } = resetClient(null);
    expect(await requestPasswordReset(client, 'ana@example.com', ORIGIN)).toBe('sent');
    expect(resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', { redirectTo: `${ORIGIN}${RESET_PASSWORD_PATH}` });
    expect(resetRedirectUrl(ORIGIN)).toBe(`${ORIGIN}/reset-password`);
  });

  it('35. reset gives the same answer for unknown accounts and per-address limits', () => {
    expect(classifyResetRequestError(null)).toBe('sent');
    expect(classifyResetRequestError({ code: 'over_email_send_rate_limit' })).toBe('sent');
  });

  it('36. reset surfaces only the request-level limit', () => {
    expect(classifyResetRequestError({ status: 429 })).toBe('rate_limited');
  });

  it('37. recovery links are recognised; expired recovery links are reported', () => {
    expect(captureRecoveryLink(`${ORIGIN}/reset-password#access_token=a&refresh_token=b&type=recovery`)).not.toBeNull();
    expect(captureRecoveryLink(`${ORIGIN}/reset-password#error=access_denied&error_code=otp_expired`)).not.toBeNull();
  });

  it('38. the reset code never logs passwords or tokens', () => {
    expect(recoverySrc).not.toMatch(/console\.\w+\([^)]*(password|token)/i);
  });

  it('39. the reset route exists', () => {
    expect(app).toContain('<Route path={RESET_PASSWORD_PATH} element={');
  });
});

describe('A2.6.1 trial eligibility stays server-side', () => {
  it('40. start_trial checks email_confirmed_at in auth.users', () => {
    expect(trialSql).toContain('SELECT u.email_confirmed_at IS NOT NULL INTO v_verified FROM auth.users u WHERE u.id = v_uid;');
    expect(trialSql).toContain("'email_not_verified'");
  });

  it('41. start_trial is idempotent under concurrency', () => {
    expect(trialSql).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('42. only signed-in users can call start_trial', () => {
    expect(trialSql).toContain('REVOKE EXECUTE ON FUNCTION public.start_trial() FROM PUBLIC, anon;');
    expect(trialSql).toContain('GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;');
  });

  it('43. the client maps email_not_verified without granting anything', async () => {
    const db = { rpc: vi.fn(async () => ({ data: { state: 'TRIAL_NOT_STARTED', reason: 'email_not_verified' }, error: null })) };
    const r = await startTrial(db as never);
    expect(r.emailNotVerified).toBe(true);
    expect(r.created).toBe(false);
  });

  it('44. the trial card asks for confirmation in the user language', () => {
    expect(notices).toContain("t('verify_trial_needed')");
    expect(notices).not.toContain('Confirma tu correo para activar tu prueba gratuita</p>');
  });

  it('45. onboarding does not crash when the email is not yet confirmed', () => {
    expect(firstValue).toContain("err.message === 'email_not_verified'");
  });
});

describe('A2.6.1 copy in Spanish and English', () => {
  const keys = ['verify_title', 'verify_signup_desc', 'verify_login_desc', 'verify_sent_to', 'verify_hint',
    'verify_link_expired_title', 'verify_link_invalid_title', 'verify_link_desc', 'verify_resend_btn',
    'verify_resent', 'verify_trial_needed', 'auth_err_generic'];

  it('46. every verification string exists in Spanish', () => {
    for (const k of keys) expect(keyIn('es', k), k).toBe(true);
  });

  it('47. every verification string exists in English', () => {
    for (const k of keys) expect(keyIn('en', k), k).toBe(true);
  });

  it('48. the resent confirmation message is neutral', () => {
    expect(i18n).not.toMatch(/verify_resent:\s*['"`][^'"`]*(no existe|not registered|doesn't exist|already confirmed|ya confirmad)/i);
  });
});

describe('A2.6.1 preserved controls', () => {
  it('49. signup-instant is retired (F-03 Stage 2B): its custom limits no longer apply', () => {
    expect(signup).toContain('status: 410');
    expect(signup).not.toContain('IP_LIMIT');
  });

  it('50. F-03 Stage 2B: signup-instant no longer pre-confirms emails', () => {
    expect(signup).not.toMatch(/email_confirm\s*:/);
  });

  it('51. Google sign-in is unchanged', () => {
    expect(loginModal).toContain('signInWithOAuth({');
    expect(loginModal).toContain("queryParams: { prompt: 'select_account' },");
  });

  it('52. signup, login and reset routes exist', () => {
    expect(app).toContain('<Route path="/signup" element={<AuthRoute mode="signup" />} />');
    expect(app).toContain('path="/login"');
    expect(RESET_PASSWORD_PATH).toBe('/reset-password');
  });

  it('53. no SMTP or service secret is present in frontend source or built assets', () => {
    const secret = /SMTP_PASS|SMTP_PASSWORD|smtp_pass|re_[A-Za-z0-9]{20,}|SUPABASE_SERVICE_ROLE_KEY|\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}/;
    expect(frontendText).not.toMatch(secret);
    const dist = join(ROOT, 'dist');
    if (existsSync(dist)) {
      for (const f of walk(dist).filter((p) => /\.(js|html|css)$/.test(p))) expect(readFileSync(f, 'utf8'), f).not.toMatch(secret);
    }
    expect(config).not.toMatch(/smtp/i);
  });

  it('54. A2.6.1 added no migrations with destructive or user-altering SQL', () => {
    const recent = readdirSync(MIG_DIR).filter((f) => f.slice(0, 14) > '20261016104108');
    for (const f of recent) {
      const sql = stripComments(src(`supabase/migrations/${f}`));
      expect(sql, f).not.toMatch(/\bDROP\s+(TABLE|COLUMN)|\bDELETE\s+FROM\s+auth\.users|email_confirmed_at\s*=\s*NULL|^\s*TRUNCATE/im);
    }
  });

  it('55. AI caps are unchanged', () => {
    for (const [fn, n] of [['weekly-content', 22], ['business-improvement', 18], ['seo-generator', 18], ['business-advisor', 12], ['voice-simulator', 10], ['global', 80]] as const) {
      expect(capsSql).toContain(`WHEN '${fn}' THEN ${n}`);
    }
  });

  it('56. all 9 tools (reviews added in A3.4.2, social in A3.5.4.3) stay enabled and the 14 legacy functions stay retired', () => {
    expect(TOOLS.filter((t) => t.enabled)).toHaveLength(9);
    const legacy = ['analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content', 'generate-business-audit',
      'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description', 'generate-geo-audit', 'generate-pitch',
      'generate-seo', 'generate-voice-script', 'scan-directories', 'simulate-campaign'];
    expect(legacy).toHaveLength(14);
    for (const fn of legacy) expect(src(`supabase/functions/${fn}/index.ts`), fn).toContain('status: 410');
  });

  it('57. the A2.5 Google verification trust fix and Stripe code are untouched', () => {
    expect(a25Sql).toContain('GRANT SELECT (verified_profile, verified_at) ON connected_sources TO authenticated;');
    expect(a25Sql).not.toMatch(/GRANT (INSERT|UPDATE)[^;]*verified_profile/);
    for (const f of ['stripe-checkout', 'stripe-cancel-subscription']) expect(src(`supabase/functions/${f}/index.ts`)).toContain('status: 410');
    expect(existsSync(join(ROOT, 'supabase/functions/stripe-webhook/handler.ts'))).toBe(true);
  });
});
