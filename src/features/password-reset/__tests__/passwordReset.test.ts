import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RESET_PASSWORD_PATH,
  captureRecoveryLink,
  classifyResetRequestError,
  endSessionsAfterReset,
  establishRecoverySession,
  isValidEmail,
  requestPasswordReset,
  resetRedirectUrl,
  updateRecoveredPassword,
  validateNewPassword,
  type AuthErrorLike,
  type RecoveryAuthClient,
} from '../recovery';
import { safeReturnPath } from '../../../app-v2/returnTo';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const loginModal = read('src/components/LoginModal.tsx');
const forgotForm = read('src/features/password-reset/ForgotPasswordForm.tsx');
const resetPage = read('src/features/password-reset/ResetPasswordPage.tsx');
const appSrc = read('src/App.tsx');
const mainSrc = read('src/main.tsx');
const i18nSrc = read('src/lib/i18n.tsx');

const ORIGIN = 'https://localseohub.io';

function fakeClient(overrides: Partial<Record<keyof RecoveryAuthClient, unknown>> = {}) {
  const ok = { error: null };
  const session = { data: { session: { user: { id: 'u1' } } }, error: null };
  return {
    resetPasswordForEmail: vi.fn().mockResolvedValue(ok),
    getSession: vi.fn().mockResolvedValue(session),
    verifyOtp: vi.fn().mockResolvedValue(session),
    exchangeCodeForSession: vi.fn().mockResolvedValue(session),
    updateUser: vi.fn().mockResolvedValue(ok),
    signOut: vi.fn().mockResolvedValue(ok),
    ...overrides,
  } as unknown as RecoveryAuthClient & Record<keyof RecoveryAuthClient, ReturnType<typeof vi.fn>>;
}

const err = (e: AuthErrorLike) => ({ error: e });

describe('1. Forgot-password link is shown in the sign-in form', () => {
  it('renders the translated link only in login mode, under the password field', () => {
    expect(loginModal).toContain("t('reset_forgot_link')");
    const pwdField = loginModal.indexOf("type={showPassword ? 'text' : 'password'}");
    const link = loginModal.indexOf("t('reset_forgot_link')");
    const submit = loginModal.indexOf('type="submit"');
    expect(pwdField).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(pwdField);
    expect(link).toBeLessThan(submit);
    expect(loginModal).toMatch(/\{mode === 'login' && \(\s*<div className="flex justify-end/);
  });

  it('keeps Google sign-in untouched', () => {
    expect(loginModal).toContain("provider: 'google'");
    expect(loginModal).toContain("queryParams: { prompt: 'select_account' }");
  });
});

describe('2. Opening the recovery form', () => {
  it('switches the modal to the recovery form and back', () => {
    expect(loginModal).toContain('onClick={() => { setRecovering(true); clearMessages(); }}');
    expect(loginModal).toContain('<ForgotPasswordForm');
    expect(loginModal).toContain('onBack={() => { setRecovering(false); clearMessages(); }}');
  });

  it('pre-fills the email already typed and can be opened directly from /login?recuperar', () => {
    expect(loginModal).toContain('initialEmail={email}');
    expect(appSrc).toContain("initialRecovering={mode === 'login' && new URLSearchParams(location.search).has('recuperar')}");
  });

  it('has title, description, email field, send button and back link', () => {
    for (const key of ['reset_request_title', 'reset_request_desc', 'reset_email_label', 'reset_send_btn', 'reset_back_to_login']) {
      expect(forgotForm).toContain(`t('${key}')`);
    }
    expect(forgotForm).toContain('htmlFor="reset-email"');
    expect(forgotForm).toContain('role="alert"');
  });
});

describe('3. Email validation', () => {
  it('accepts well-formed addresses (trimmed)', () => {
    expect(isValidEmail('ana@negocio.es')).toBe(true);
    expect(isValidEmail('  ana@negocio.es  ')).toBe(true);
  });

  it('rejects empty, malformed or oversized input', () => {
    for (const bad of ['', '   ', 'ana', 'ana@', '@negocio.es', 'ana@negocio', 'ana @negocio.es', `${'a'.repeat(250)}@x.es`]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });

  it('does not call Supabase for an invalid address', async () => {
    const client = fakeClient();
    expect(await requestPasswordReset(client, 'no-es-un-email', ORIGIN)).toBe('invalid_email');
    expect(client.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe('4. Correct request to Supabase', () => {
  it('calls resetPasswordForEmail with the trimmed email and the reset page as redirect', async () => {
    const client = fakeClient();
    expect(await requestPasswordReset(client, ' ana@negocio.es ', ORIGIN)).toBe('sent');
    expect(client.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(client.resetPasswordForEmail).toHaveBeenCalledWith('ana@negocio.es', { redirectTo: 'https://localseohub.io/reset-password' });
  });

  it('builds the redirect from the current origin (dev and production)', () => {
    expect(resetRedirectUrl('http://localhost:5173')).toBe('http://localhost:5173/reset-password');
    expect(forgotForm).toContain('requestPasswordReset(supabase.auth, email, window.location.origin)');
  });

  it('prevents duplicate submissions while sending and during the cooldown', () => {
    expect(forgotForm).toContain('if (inFlight.current || cooldown > 0) return;');
    expect(forgotForm).toContain('disabled={busy}');
  });

  it('never ships SMTP or Resend credentials in the frontend', () => {
    for (const src of [forgotForm, resetPage, read('src/features/password-reset/recovery.ts')]) {
      expect(src).not.toMatch(/resend\.com|api\.resend|smtp|api[_-]?key|\bre_[A-Za-z0-9]{16,}/i);
    }
  });
});

describe('5. Errors and rate limits', () => {
  it('shows the rate-limit notice for the IP-level limit', async () => {
    const client = fakeClient({ resetPasswordForEmail: vi.fn().mockResolvedValue(err({ status: 429, code: 'over_request_rate_limit' })) });
    expect(await requestPasswordReset(client, 'ana@negocio.es', ORIGIN)).toBe('rate_limited');
    expect(classifyResetRequestError({ status: 429 })).toBe('rate_limited');
  });

  it('maps server-side email validation to the invalid-email message', () => {
    expect(classifyResetRequestError({ status: 400, code: 'email_address_invalid' })).toBe('invalid_email');
  });

  it('turns network failures and unknown errors into a generic message', async () => {
    const throwing = fakeClient({ resetPasswordForEmail: vi.fn().mockRejectedValue(new Error('Failed to fetch')) });
    expect(await requestPasswordReset(throwing, 'ana@negocio.es', ORIGIN)).toBe('error');
    expect(classifyResetRequestError({ status: 500, message: 'Error sending recovery email' })).toBe('error');
  });

  it('never prints raw server messages', () => {
    expect(forgotForm).not.toMatch(/\.message/);
    expect(resetPage).not.toMatch(/\.message/);
  });
});

describe('6. Generic answer without user enumeration', () => {
  it('per-address send limits (only hit by existing accounts) look exactly like a success', () => {
    expect(classifyResetRequestError({ status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.' })).toBe('sent');
    expect(classifyResetRequestError({ status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })).toBe('sent');
  });

  it('shows the same generic sentence for every sent outcome', () => {
    expect(i18nSrc).toContain("reset_sent_generic: 'Si existe una cuenta asociada a este correo, recibirás un enlace para restablecer tu contraseña.'");
    expect(forgotForm).toContain("t('reset_sent_generic')");
    expect(forgotForm).not.toMatch(/not.?found|no existe|no registrad/i);
  });
});

describe('7. /reset-password route', () => {
  it('is a public route outside every auth guard', () => {
    expect(appSrc).toContain('<Route path={RESET_PASSWORD_PATH} element={');
    const route = appSrc.slice(appSrc.indexOf('<Route path={RESET_PASSWORD_PATH}'), appSrc.indexOf('{/* ── Onboarding ── */}'));
    expect(route).not.toMatch(/AppGuard|OnboardingGuard|useAuthRedirect/);
    expect(RESET_PASSWORD_PATH).toBe('/reset-password');
  });

  it('cannot be used as a post-login return target', () => {
    expect(safeReturnPath('/reset-password')).toBeNull();
  });

  it('captures the link before the Supabase client clears the URL', () => {
    expect(mainSrc).toContain('const initialRecoveryLink = captureRecoveryLink(window.location.href);');
    expect(mainSrc).toContain('<App initialRecoveryLink={initialRecoveryLink} />');
  });

  it('sends a recovery link that landed on another page to /reset-password', () => {
    expect(appSrc).toContain('if (recoveryLink && location.pathname !== RESET_PASSWORD_PATH)');
    expect(captureRecoveryLink(`${ORIGIN}/#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=recovery`)).toEqual({ kind: 'implicit' });
  });

  it('ignores unrelated URLs (landing, Google OAuth callbacks)', () => {
    expect(captureRecoveryLink(`${ORIGIN}/`)).toBeNull();
    expect(captureRecoveryLink(`${ORIGIN}/login?next=%2Fhoy`)).toBeNull();
    expect(captureRecoveryLink(`${ORIGIN}/#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer`)).toBeNull();
    expect(captureRecoveryLink(`${ORIGIN}/#error=access_denied&error_code=otp_expired`)).toBeNull();
  });
});

describe('8. Valid link', () => {
  it('accepts the default link format (session in the URL hash)', async () => {
    const link = captureRecoveryLink(`${ORIGIN}/reset-password#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=recovery`);
    expect(link).toEqual({ kind: 'implicit' });
    const client = fakeClient();
    expect(await establishRecoverySession(client, link)).toEqual({ ok: true });
    expect(client.getSession).toHaveBeenCalledTimes(1);
  });

  it('accepts a token_hash link (custom email template)', async () => {
    const link = captureRecoveryLink(`${ORIGIN}/reset-password?token_hash=pkce_abc&type=recovery`);
    expect(link).toEqual({ kind: 'token_hash', tokenHash: 'pkce_abc' });
    const client = fakeClient();
    expect(await establishRecoverySession(client, link)).toEqual({ ok: true });
    expect(client.verifyOtp).toHaveBeenCalledWith({ token_hash: 'pkce_abc', type: 'recovery' });
  });

  it('accepts a PKCE code link', async () => {
    const link = captureRecoveryLink(`${ORIGIN}/reset-password?code=xyz`);
    const client = fakeClient();
    expect(await establishRecoverySession(client, link)).toEqual({ ok: true });
    expect(client.exchangeCodeForSession).toHaveBeenCalledWith('xyz');
  });

  it('verifies a single-use link only once even if React re-runs the effect', () => {
    expect(resetPage).toContain('if (started.current) return;');
  });
});

describe('9. Expired or invalid link', () => {
  it('recognises the expired-link redirect from Supabase', async () => {
    const link = captureRecoveryLink(`${ORIGIN}/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    expect(link).toEqual({ kind: 'error', reason: 'expired' });
    expect(await establishRecoverySession(fakeClient(), link)).toEqual({ ok: false, reason: 'expired' });
  });

  it('treats other URL errors as invalid', () => {
    expect(captureRecoveryLink(`${ORIGIN}/reset-password?error=server_error&error_description=x`)).toEqual({ kind: 'error', reason: 'invalid' });
  });

  it('reports a reused token_hash as invalid and an expired one as expired', async () => {
    const reused = fakeClient({ verifyOtp: vi.fn().mockResolvedValue({ data: { session: null }, error: { status: 403, code: 'otp_disabled' } }) });
    expect(await establishRecoverySession(reused, { kind: 'token_hash', tokenHash: 't' })).toEqual({ ok: false, reason: 'invalid' });
    const expired = fakeClient({ verifyOtp: vi.fn().mockResolvedValue({ data: { session: null }, error: { status: 403, code: 'otp_expired' } }) });
    expect(await establishRecoverySession(expired, { kind: 'token_hash', tokenHash: 't' })).toEqual({ ok: false, reason: 'expired' });
  });

  it('is invalid when the hash link did not produce a session', async () => {
    const client = fakeClient({ getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) });
    expect(await establishRecoverySession(client, { kind: 'implicit' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('is invalid when the PKCE exchange fails or throws', async () => {
    const failing = fakeClient({ exchangeCodeForSession: vi.fn().mockRejectedValue(new Error('no verifier')) });
    expect(await establishRecoverySession(failing, { kind: 'code', code: 'x' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('offers a new link from the invalid screen', () => {
    expect(resetPage).toContain("navigate('/login?recuperar=1', { replace: true })");
  });
});

describe('10. Passwords that do not match', () => {
  it('blocks mismatches, too short and too long passwords before calling Supabase', () => {
    expect(validateNewPassword('secreto1', 'secreto2')).toBe('mismatch');
    expect(validateNewPassword('abc', 'abc')).toBe('too_short');
    expect(validateNewPassword('a'.repeat(73), 'a'.repeat(73))).toBe('too_long');
    expect(validateNewPassword('secreto1', 'secreto1')).toBeNull();
    expect(resetPage.indexOf('validateNewPassword(password, confirmation)')).toBeLessThan(resetPage.indexOf('updateRecoveredPassword(supabase.auth, password)'));
  });
});

describe('11. Successful password update', () => {
  it('calls updateUser with only the new password', async () => {
    const client = fakeClient();
    expect(await updateRecoveredPassword(client, 'NuevaClave#2026')).toEqual({ ok: true });
    expect(client.updateUser).toHaveBeenCalledWith({ password: 'NuevaClave#2026' });
  });

  it('then ends all sessions of the account, falling back to this browser', async () => {
    const client = fakeClient();
    await endSessionsAfterReset(client);
    expect(client.signOut).toHaveBeenCalledWith({ scope: 'global' });
    const failing = fakeClient({ signOut: vi.fn().mockResolvedValueOnce(err({ status: 500 })).mockResolvedValueOnce({ error: null }) });
    await endSessionsAfterReset(failing);
    expect(failing.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
  });

  it('clears the typed passwords, shows confirmation and offers sign-in', () => {
    const success = resetPage.slice(resetPage.indexOf('if (outcome.ok) {'), resetPage.indexOf("} else if (outcome.problem === 'session')"));
    expect(success).toContain('await endSessionsAfterReset(supabase.auth);');
    expect(success).toContain("setPassword('');");
    expect(success).toContain("setPhase({ name: 'done' });");
    expect(resetPage).toContain("t('reset_go_login')");
  });

  it.each([
    [{ status: 422, code: 'weak_password', reasons: ['length', 'characters', 'bogus'] }, { ok: false, problem: 'weak', reasons: ['length', 'characters'] }],
    [{ status: 422, code: 'same_password' }, { ok: false, problem: 'same' }],
    [{ status: 429, code: 'over_request_rate_limit' }, { ok: false, problem: 'rate_limited' }],
    [{ status: 500 }, { ok: false, problem: 'error' }],
  ])('classifies %j', async (error, expected) => {
    expect(await updateRecoveredPassword(fakeClient({ updateUser: vi.fn().mockResolvedValue(err(error)) }), 'x')).toEqual(expected);
  });
});

describe('12. No password change without a valid recovery', () => {
  it('a visit without a recovery link never reaches the form', async () => {
    const client = fakeClient();
    expect(captureRecoveryLink(`${ORIGIN}/reset-password`)).toBeNull();
    expect(await establishRecoverySession(client, null)).toEqual({ ok: false, reason: 'missing' });
    expect(client.getSession).not.toHaveBeenCalled();
  });

  it('only renders the form in the ready phase, reached only after a successful check', () => {
    expect(resetPage).toContain("{phase.name === 'ready' && (");
    expect(resetPage).toContain("setPhase(check.ok ? { name: 'ready' } : { name: 'invalid', reason: check.reason });");
    expect(resetPage).toContain("useState<Phase>({ name: 'checking' })");
  });

  it('an access token without type=recovery on the reset page is rejected', () => {
    expect(captureRecoveryLink(`${ORIGIN}/reset-password#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=magiclink`)).toEqual({ kind: 'error', reason: 'invalid' });
  });

  it('a session that expires mid-way sends the user back to request a new link', async () => {
    for (const e of [{ name: 'AuthSessionMissingError', status: 400 }, { status: 403, code: 'session_not_found' }, { status: 401 }, { code: 'reauthentication_needed', status: 400 }]) {
      expect(await updateRecoveredPassword(fakeClient({ updateUser: vi.fn().mockResolvedValue(err(e)) }), 'x')).toEqual({ ok: false, problem: 'session' });
    }
    expect(resetPage).toContain("setPhase({ name: 'invalid', reason: 'expired' });");
  });

  it('removes tokens from the address bar and never stores or logs passwords', () => {
    expect(resetPage).toContain("window.history.replaceState(window.history.state, '', RESET_PASSWORD_PATH);");
    for (const src of [resetPage, forgotForm, read('src/features/password-reset/recovery.ts')]) {
      expect(src).not.toMatch(/localStorage|sessionStorage|console\.|track\(/);
    }
  });
});

describe('13. Google OAuth compatibility', () => {
  it('Google redirects (with or without errors) outside /reset-password are not treated as recovery', () => {
    expect(captureRecoveryLink(`${ORIGIN}/login?next=%2Fhoy#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&provider_token=g`)).toBeNull();
    expect(captureRecoveryLink(`${ORIGIN}/?error=access_denied&error_description=cancelled`)).toBeNull();
  });

  it('a Google-only user can still request a link (same generic answer, no account created)', async () => {
    const client = fakeClient();
    expect(await requestPasswordReset(client, 'google.user@gmail.com', ORIGIN)).toBe('sent');
    expect(Object.keys(client)).not.toContain('signUp');
  });
});

describe('14. ES/EN', () => {
  const esBlock = i18nSrc.slice(0, i18nSrc.indexOf('\n  en: {'));
  const enBlock = i18nSrc.slice(i18nSrc.indexOf('\n  en: {'));
  const keysIn = (block: string) => [...block.matchAll(/^\s+(reset_[a-z_]+):/gm)].map((m) => m[1]).sort();

  it('every recovery string exists in both languages', () => {
    expect(keysIn(esBlock).length).toBeGreaterThan(30);
    expect(keysIn(esBlock)).toEqual(keysIn(enBlock));
  });

  it('every key used by the UI is defined', () => {
    const used = new Set([...`${forgotForm}${resetPage}${loginModal}`.matchAll(/'(reset_[a-z_]+)'/g)].map((m) => m[1]));
    const defined = new Set(keysIn(esBlock));
    for (const key of used) expect(defined.has(key)).toBe(true);
  });

  it('uses the required Spanish copy', () => {
    for (const s of ["'¿Olvidaste tu contraseña?'", "'Recuperar contraseña'", "'Enviar enlace de recuperación'", "'Volver a iniciar sesión'", "'Guardar nueva contraseña'", "'Confirmar nueva contraseña'"]) {
      expect(esBlock).toContain(s);
    }
  });

  it('the reset page offers a language switch', () => {
    expect(resetPage).toContain('onClick={() => setLang(l)}');
  });
});

describe('15. Mobile and desktop layout', () => {
  it('uses fluid widths with responsive padding', () => {
    expect(resetPage).toContain('w-full max-w-md');
    expect(resetPage).toContain('p-7 sm:p-8');
    expect(resetPage).toMatch(/items-start sm:items-center/);
  });

  it('inputs have labels, autocomplete hints and accessible toggles', () => {
    expect(resetPage).toContain('autoComplete="new-password"');
    expect(resetPage).toContain('aria-label={toggleLabel}');
    expect(forgotForm).toContain('autoComplete="email"');
  });
});

describe('16. No regressions in sign-in and sign-up', () => {
  it('sign-in and sign-up calls are unchanged', () => {
    expect(loginModal).toContain('await supabase.auth.signInWithPassword({ email, password });');
    expect(loginModal).toContain("supabase.functions.invoke('signup-instant', { body: { email, password } })");
    expect(loginModal).toContain('minLength={6}');
  });

  it('the recovery link is not part of sign-up', () => {
    expect(loginModal.match(/reset_forgot_link/g)).toHaveLength(1);
  });

  it('existing return-path rules still hold', () => {
    expect(safeReturnPath('/plan?week=1')).toBe('/plan?week=1');
    expect(safeReturnPath('/login')).toBeNull();
    expect(safeReturnPath('//evil.com')).toBeNull();
  });

  it('the redirect URL is fixed to our own origin (no open redirect)', () => {
    expect(read('src/features/password-reset/recovery.ts')).toContain('return `${origin}${RESET_PASSWORD_PATH}`;');
    expect(forgotForm).not.toMatch(/searchParams|location\.search|next=/);
  });
});
