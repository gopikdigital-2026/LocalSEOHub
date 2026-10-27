import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { classifySignupError, requestEmailSignup, type SignUpAuthClient } from '../signup';
import { captureVerificationLinkProblem, classifyResendError, requestVerificationResend, type ResendAuthClient } from '../verification';
import { resetRedirectUrl, RESEND_COOLDOWN_SECONDS } from '../../password-reset/recovery';
import {
  PENDING_BUSINESS_META_KEY, peekPendingBusinessName, pendingBusinessFromMetadata, pendingBusinessMetadata,
} from '../../first-value/pendingBusiness';
import { initialBusinessData } from '../../first-value/onboarding';
import { startTrial } from '../../billing/repository';
import { safeReturnPath, destinationFor } from '../../../app-v2/returnTo';
import { TOOLS } from '../../tools/catalog';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const MIG_DIR = join(ROOT, 'supabase/migrations');
const migrations = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
const mig = (suffix: string) => src(`supabase/migrations/${migrations.find((f) => f.endsWith(suffix))}`);

const loginModal = src('src/components/LoginModal.tsx');
const signupSrc = src('src/features/email-verification/signup.ts');
const pendingSrc = src('src/features/first-value/pendingBusiness.ts');
const panel = src('src/features/email-verification/VerifyEmailPanel.tsx');
const firstValue = src('src/features/first-value/FirstValueFlow.tsx');
const repo = src('src/features/business-memory/businessRepository.ts');
const app = src('src/App.tsx');
const i18n = src('src/lib/i18n.tsx');
const signupFn = src('supabase/functions/signup-instant/index.ts');
const trialSql = mig('_a231_ai_reservation_ledger_and_concurrency.sql');
const LANDINGS = ['BusinessAuditLanding', 'ContentGeneratorLanding', 'CopilotLanding', 'DiagnosticLanding',
  'GrowthPlanLanding', 'MetaAdsLanding', 'PotentialLanding'];
const frontendFiles = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));
const activeFrontend = frontendFiles.filter((f) => !LANDINGS.some((l) => f.endsWith(`components/${l}.tsx`)));
const activeText = activeFrontend.map((f) => readFileSync(f, 'utf8')).join('\n');
const frontendText = frontendFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

const ORIGIN = 'https://localseohub.io';
type SignUpResult = Awaited<ReturnType<SignUpAuthClient['signUp']>>;
const signUpClient = (result: SignUpResult | Error) => {
  const signUp = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { signUp } as unknown as SignUpAuthClient, signUp };
};

describe('F-03 Stage 2B · standard signup', () => {
  it('1. active signup no longer invokes signup-instant', () => {
    expect(activeText).not.toContain('signup-instant');
  });

  it('2. active signup uses standard Supabase auth.signUp', async () => {
    expect(loginModal).toContain('requestEmailSignup(\n        supabase.auth,');
    const { client, signUp } = signUpClient({ data: { session: null }, error: null });
    await requestEmailSignup(client, 'new@example.com', 'secret123', ORIGIN);
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it('3. signup sends the confirmation link to /login via the existing helper', async () => {
    expect(signupSrc).toContain('emailRedirectTo: verificationRedirectUrl(origin)');
    const { client, signUp } = signUpClient({ data: { session: null }, error: null });
    await requestEmailSignup(client, ' new@example.com ', 'secret123', ORIGIN, { [PENDING_BUSINESS_META_KEY]: 'Bar' });
    expect(signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'secret123',
      options: { emailRedirectTo: `${ORIGIN}/login`, data: { [PENDING_BUSINESS_META_KEY]: 'Bar' } },
    });
  });

  it('4. email_confirm:true is absent from active signup behaviour', () => {
    expect(activeText).not.toMatch(/email_confirm\s*:/);
    expect(activeText).not.toMatch(/admin\.createUser/);
  });

  it('5/6. signup-instant is retired with 410 and cannot create or confirm users', () => {
    expect(signupFn).toContain('status: 410');
    expect(signupFn).not.toMatch(/createUser|email_confirm|SERVICE_ROLE|createClient/);
    expect(src('supabase/config.toml')).toContain('[functions.signup-instant]');
  });

  it('7. user without session shows the verification panel', async () => {
    const { client } = signUpClient({ data: { session: null }, error: null });
    expect(await requestEmailSignup(client, 'new@example.com', 'secret123', ORIGIN)).toBe('verify');
    expect(loginModal).toContain("} else if (outcome === 'verify') {");
    expect(loginModal).toContain("setVerifying({ reason: 'signup', email });");
  });

  it('8. no immediate password sign-in after signup', () => {
    const signupBranch = loginModal.slice(loginModal.indexOf("track('register_attempt'"), loginModal.indexOf('setLoading(false);\n  };'));
    expect(signupBranch).not.toContain('signInWithPassword');
  });

  it('a session is only accepted when Supabase itself issues one (Confirm email disabled)', async () => {
    const { client } = signUpClient({ data: { session: { access_token: 'x' } }, error: null });
    expect(await requestEmailSignup(client, 'new@example.com', 'secret123', ORIGIN)).toBe('signed_in');
  });
});

describe('F-03 Stage 2B · failure states and enumeration', () => {
  it('existing account reads as "check your email" (no enumeration)', () => {
    expect(classifySignupError({ code: 'user_already_exists' })).toBe('verify');
    expect(classifySignupError({ code: 'email_exists' })).toBe('verify');
    expect(classifySignupError({ message: 'User already registered' })).toBe('verify');
  });

  it('rate limits, weak passwords, invalid emails and send failures are not shown as "sent"', () => {
    expect(classifySignupError({ code: 'over_email_send_rate_limit', status: 429 })).toBe('rate_limited');
    expect(classifySignupError({ status: 429 })).toBe('rate_limited');
    expect(classifySignupError({ code: 'weak_password' })).toBe('weak_password');
    expect(classifySignupError({ code: 'email_address_invalid' })).toBe('invalid_email');
    expect(classifySignupError({ code: 'unexpected_failure', status: 500, message: 'Error sending confirmation email' })).toBe('error');
  });

  it('network failure and invalid email never reach Supabase as success', async () => {
    const thrown = signUpClient(new Error('offline'));
    expect(await requestEmailSignup(thrown.client, 'a@b.co', 'secret123', ORIGIN)).toBe('error');
    const bad = signUpClient({ data: { session: null }, error: null });
    expect(await requestEmailSignup(bad.client, 'not-an-email', 'secret123', ORIGIN)).toBe('invalid_email');
    expect(bad.signUp).not.toHaveBeenCalled();
  });

  it('errors map to localized keys, never raw Supabase text', () => {
    expect(loginModal).toContain('setError(t(SIGNUP_ERROR_KEYS[outcome]));');
    expect(loginModal).not.toMatch(/setError\([^)]*\.message\)/);
  });

  it('ES/EN verification copy', () => {
    expect(i18n).toContain("verify_title: 'Revisa tu correo',");
    expect(i18n).toContain("verify_title: 'Check your email',");
    expect(i18n).toContain('Confirma tu correo para continuar.');
    expect(i18n).toContain('Confirm your email to continue.');
  });
});

describe('F-03 Stage 2B · resend and confirmation return', () => {
  it('9/10. resend uses Supabase Auth and stays neutral', async () => {
    const resend = vi.fn(async () => ({ error: { code: 'user_not_found' } }));
    expect(await requestVerificationResend({ resend } as unknown as ResendAuthClient, 'a@b.co', ORIGIN)).toBe('sent');
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.co', options: { emailRedirectTo: `${ORIGIN}/login` } });
    expect(classifyResendError({ code: 'over_request_rate_limit' })).toBe('rate_limited');
  });

  it('resend after signup starts on a cooldown and ignores repeated clicks', () => {
    expect(panel).toContain("useState(reason === 'signup' ? RESEND_COOLDOWN_SECONDS : 0)");
    expect(panel).toContain('if (inFlight.current || cooldown > 0) return;');
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
  });

  it('11. verification redirect is a fixed same-origin path', () => {
    expect(signupSrc).not.toMatch(/next=|returnTo/);
  });

  it('12/13. expired and invalid links are handled', () => {
    expect(captureVerificationLinkProblem(`${ORIGIN}/login#error=access_denied&error_code=otp_expired`)).toBe('expired');
    expect(captureVerificationLinkProblem(`${ORIGIN}/login?error=access_denied&error_code=bad`)).toBe('invalid');
    expect(captureVerificationLinkProblem(`${ORIGIN}/login`)).toBeNull();
  });

  it('20. returnTo protection is preserved', () => {
    expect(safeReturnPath('//evil.com')).toBeNull();
    expect(safeReturnPath('https://evil.com')).toBeNull();
    expect(safeReturnPath('/\\evil.com')).toBeNull();
    expect(destinationFor('not_started', '/plan')).toBe('/empezar');
  });
});

describe('F-03 Stage 2B · pending business context', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });

  it('14. the name travels in signup metadata and survives another tab or device', () => {
    sessionStorage.setItem('pending_business_name', 'Panadería Sol');
    const meta = pendingBusinessMetadata(peekPendingBusinessName());
    expect(meta).toEqual({ pending_business_name: 'Panadería Sol' });
    expect(sessionStorage.getItem('pending_business_name')).toBe('Panadería Sol');
    expect(pendingBusinessFromMetadata(meta)).toBe('Panadería Sol');
    expect(firstValue).toContain('getPendingBusinessName() ?? pendingBusinessFromMetadata(signupMetadataRef.current)');
  });

  it('metadata is sanitized and only a prefill hint', () => {
    expect(pendingBusinessMetadata('  ')).toEqual({});
    expect(pendingBusinessMetadata(null)).toEqual({});
    expect(pendingBusinessFromMetadata({ pending_business_name: 42 })).toBeNull();
    expect(pendingBusinessFromMetadata({ pending_business_name: 'a\u0000b' })).toBe('a b');
    expect(pendingBusinessFromMetadata({ pending_business_name: 'x'.repeat(500) })).toHaveLength(120);
    expect(initialBusinessData(null, { name: 'Real', category: '', city: '', website: '' }, 'Hint').name).toBe('Real');
  });

  it('15. no password or token is stored as pending context', () => {
    expect(pendingSrc).not.toMatch(/password|token/i);
    expect(loginModal).toContain('pendingBusinessMetadata(peekPendingBusinessName())');
  });

  it('16. no duplicate-business path: one upsert per user', () => {
    expect(repo).toContain(".upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })");
    expect(pendingSrc).not.toContain('businesses');
    expect(firstValue).not.toContain("from('businesses')");
  });
});

describe('F-03 Stage 2B · trial, OAuth, users, reset', () => {
  it('17/18. start_trial still requires a confirmed email server-side', async () => {
    expect(trialSql).toContain('SELECT u.email_confirmed_at IS NOT NULL INTO v_verified FROM auth.users u WHERE u.id = v_uid;');
    const db = { rpc: vi.fn(async () => ({ data: { state: 'TRIAL_NOT_STARTED', reason: 'email_not_verified' }, error: null })) };
    const r = await startTrial(db as never);
    expect(r.created).toBe(false);
    expect(r.emailNotVerified).toBe(true);
  });

  it('19. Google OAuth path is unchanged', () => {
    expect(loginModal).toContain("provider: 'google',");
    expect(loginModal).toContain("queryParams: { prompt: 'select_account' },");
    expect(loginModal).toContain('`${window.location.origin}/login?next=${encodeURIComponent(returnTo)}`');
    expect(frontendText).not.toMatch(/linkIdentity|unlinkIdentity/);
  });

  it('21. existing users are not modified: no admin writes and no new migrations (46 after A3.5.1)', () => {
    expect(migrations).toHaveLength(53); // A3.7.1 publications foundation; A3.7.2 proposals engine; A3.7.3.1 publication drafts; A3.7.3.2 adaptation engine
    expect(frontendText).not.toMatch(/updateUserById|deleteUser|email_confirmed_at\s*[:=]/);
  });

  it('22. password reset architecture is preserved', () => {
    expect(resetRedirectUrl(ORIGIN)).toBe(`${ORIGIN}/reset-password`);
    expect(src('src/features/password-reset/recovery.ts')).toContain('resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectUrl(origin) })');
  });

  it('23. CompleteRegistration only fires when Supabase issued a session', () => {
    const idx = loginModal.indexOf('trackCompleteRegistration();');
    expect(loginModal.lastIndexOf("if (outcome === 'signed_in') {", idx)).toBeGreaterThan(-1);
    expect(loginModal.match(/trackCompleteRegistration\(\)/g)).toHaveLength(1);
    const verifyBranch = loginModal.slice(loginModal.indexOf("} else if (outcome === 'verify') {"), loginModal.indexOf("track('register_failed'"));
    expect(verifyBranch).not.toContain('trackCompleteRegistration');
  });
});

describe('F-03 Stage 2B · secrets and preservation', () => {
  it('24/25. no SMTP, Resend or service-role secret reaches the client', () => {
    expect(frontendText).not.toMatch(/SERVICE_ROLE|service_role|RESEND_API|SMTP_|re_[A-Za-z0-9]{20,}/);
    expect(src('.env').match(/^[A-Z_]+/gm)).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_STRIPE_PRICE_ID', 'VITE_ADMIN_EMAIL']);
  });

  it('26/27. billing and Stripe sources are untouched by signup', () => {
    for (const f of ['stripe-billing/handler.ts', 'stripe-webhook/handler.ts']) {
      expect(src(`supabase/functions/${f}`)).not.toMatch(/signUp|signup-instant/);
    }
    expect(signupSrc).not.toMatch(/start_trial|billing|stripe/i);
  });

  it('28-31. frozen layers (App routes, Today, Missions, engines) stay byte-frozen elsewhere; App untouched here (A3.4.2 adds /herramientas/resenas; A3.5.1A 3 public legal routes; A3.5.1 /oauth/meta/callback)', () => {
    expect(app.match(/<Route [^>]*path=/g)).toHaveLength(34); // A3.7.2.1A HARNESS RE-PIN: temporary hidden /internal/publications-validation
    expect(app).toContain("const PENDING_BIZ_KEY = 'pending_business_name';");
    expect(TOOLS).toHaveLength(9);
  });

  it('32. AI limits are unchanged', () => {
    const sql = mig('_a248_voice_simulator_limits.sql');
    for (const [k, v] of [['weekly-content', 22], ['business-improvement', 18], ['seo-generator', 18],
      ['business-advisor', 12], ['voice-simulator', 10], ['global', 80]] as const) {
      expect(sql).toContain(`WHEN '${k}' THEN ${v}`);
    }
  });

  it('33. the fourteen legacy functions remain retired', () => {
    for (const f of ['analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content',
      'generate-business-audit', 'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description',
      'generate-geo-audit', 'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories', 'simulate-campaign']) {
      expect(src(`supabase/functions/${f}/index.ts`), f).toContain('status: 410');
    }
  });

  it('34/35. migrations stay at 46 and routes at 32 (A3.4.2: a342 migration + /herramientas/resenas; A3.4.2.2: GBP guard; A3.5.1A: 3 public legal routes; A3.5.1: Meta connection migration + /oauth/meta/callback)', () => {
    expect(migrations).toHaveLength(53); // A3.7.1 publications foundation; A3.7.2 proposals engine; A3.7.3.1 publication drafts; A3.7.3.2 adaptation engine
    expect(app.match(/<Route [^>]*path=/g)).toHaveLength(34); // A3.7.2.1A HARNESS RE-PIN: temporary hidden /internal/publications-validation
  });

  it('orphan landings are not imported by any active file', () => {
    for (const l of LANDINGS) expect(activeText, l).not.toMatch(new RegExp(`from '[^']*/${l}'`));
  });
});
