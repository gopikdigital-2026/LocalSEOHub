import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  captureVerificationLinkProblem,
  classifyResendError,
  requestVerificationResend,
  type ResendAuthClient,
} from '../verification';
import { captureRecoveryLink, requestPasswordReset, type RecoveryAuthClient } from '../../password-reset/recovery';
import { TOOLS } from '../../tools/catalog';

// Each test is numbered after the A2.6.1 spec, section 30.
const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const code = (dir: string) => walk(join(ROOT, dir)).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));
const frontendText = code('src').map((f) => readFileSync(f, 'utf8')).join('\n');
const functionsText = code('supabase/functions').map((f) => readFileSync(f, 'utf8')).join('\n');
const report = src('auditoria-a2/A2_6_1_INFORME.md');
const signup = src('supabase/functions/signup-instant/index.ts');
const loginModal = src('src/components/LoginModal.tsx');
const panel = src('src/features/email-verification/VerifyEmailPanel.tsx');
const a261Files = [
  'src/features/email-verification/verification.ts',
  'src/features/email-verification/VerifyEmailPanel.tsx',
  'src/components/LoginModal.tsx',
  'src/App.tsx',
  'src/main.tsx',
  'src/features/billing/BillingNotices.tsx',
  'src/features/first-value/FirstValueFlow.tsx',
].map(src).join('\n');
const ORIGIN = 'https://app.example.com';

describe('A2.6.1 spec checklist', () => {
  it('S1. current signup architecture is documented in the report', () => {
    for (const s of ['## A. Current auth architecture', 'admin.createUser', 'email_confirm: true', 'mailer_autoconfirm']) expect(report).toContain(s);
  });

  it('S2/S3. no app code writes email_confirmed_at; signup-instant no longer pre-confirms (F-03 Stage 2B)', () => {
    expect(frontendText).not.toMatch(/email_confirmed_at\s*[:=]/);
    expect(functionsText).not.toMatch(/email_confirmed_at\s*[:=]/);
    expect(signup.match(/email_confirm:/g)).toBeNull();
    expect(report).toContain('F-03 = OPEN');
  });

  it('S12. direct signup bypass is audited and not claimed as blocked', () => {
    expect(report).toContain('A261-001');
    expect(report).toMatch(/direct anon-key `auth\.signUp`/);
    expect(report).not.toMatch(/direct signup (is )?blocked/i);
  });

  it('S17/S18. confirmation redirect is fixed to the app origin; user input cannot change it', async () => {
    const resend = vi.fn(async () => ({ error: null }));
    await requestVerificationResend({ resend } as unknown as ResendAuthClient, 'ana@example.com', ORIGIN);
    expect(resend.mock.calls[0]).toEqual([{ type: 'signup', email: 'ana@example.com', options: { emailRedirectTo: `${ORIGIN}/login` } }]);
    expect(await requestVerificationResend({ resend } as unknown as ResendAuthClient, 'https://evil.example/@x', ORIGIN)).toBe('invalid_email');
    expect(panel).toContain('window.location.origin');
    expect(loginModal).not.toMatch(/emailRedirectTo:\s*[^,}]*(searchParams|returnTo|next)/);
  });

  it('S21. an already-verified address gets the same neutral resend answer', () => {
    expect(classifyResendError({ code: 'email_exists' })).toBe('sent');
    expect(captureVerificationLinkProblem(`${ORIGIN}/login#access_token=a&refresh_token=b&type=signup`)).toBeNull();
  });

  it('S21b. a reused confirmation link (rejected by Supabase) is shown as expired, not as success', () => {
    expect(captureVerificationLinkProblem(`${ORIGIN}/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`)).toBe('expired');
  });

  it('S26. Google sign-in is still offered', () => {
    expect(loginModal).toContain("provider: 'google',");
  });

  it('S27/S28. password reset is generic and redirects only to the app', async () => {
    // Supabase answers 200 for unknown addresses, so known and unknown accounts look the same.
    const resetPasswordForEmail = vi.fn(async () => ({ error: null }));
    expect(await requestPasswordReset({ resetPasswordForEmail } as unknown as RecoveryAuthClient, 'nobody@example.com', ORIGIN)).toBe('sent');
    expect(resetPasswordForEmail).toHaveBeenCalledWith('nobody@example.com', { redirectTo: `${ORIGIN}/reset-password` });
  });

  it('S29. reset links with tokens are only accepted on /reset-password handling', () => {
    expect(captureRecoveryLink(`${ORIGIN}/hoy`)).toBeNull();
    expect(src('src/features/password-reset/recovery.ts')).not.toMatch(/console\.\w+\([^)]*token/i);
  });

  it('S34–S40. A2.6.1 code deletes nothing and resets no AI usage', () => {
    expect(a261Files).not.toMatch(/\.delete\(|deleteUser|updateUserById|ai_usage|\.from\(['"](businesses|connected_sources|user_trials|subscriptions|stripe_\w+)['"]\)/);
  });

  it('S41. Premium and trials stay server-authoritative (frontend never writes billing tables)', () => {
    expect(frontendText).not.toMatch(/\.from\(['"](user_trials|subscriptions|stripe_customers|ai_usage_monthly)['"]\)/);
    expect(frontendText).not.toMatch(/\.from\(['"]stripe_subscriptions['"]\)\s*\.(insert|update|upsert|delete)/);
    expect(frontendText.match(/\.from\(['"]stripe_subscriptions['"]\)/g) ?? []).toHaveLength(1);
    const purchase = readFileSync(resolve(__dirname, '../../billing/purchase.ts'), 'utf8');
    expect(purchase).toMatch(/\.from\('stripe_subscriptions'\)\s*\.select\(/);
    expect(purchase).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(frontendText).not.toContain("rpc('billing_state_for'");
  });

  it('S50. all eight tools (reviews added in A3.4.2) are available by name', () => {
    const enabled = TOOLS.filter((t) => t.enabled).map((t) => t.id).sort();
    expect(enabled).toEqual(['advisor', 'geo', 'maps', 'radar', 'reviews', 'seo', 'twin', 'voice']);
    expect(TOOLS.find((t) => t.id === 'reviews')?.copy.es.name).toBe('Reseñas IA');
  });

  it('Q. the report carries the required stage status and confirmations', () => {
    for (const s of [
      'A2.6.1 STAGE 1 = COMPLETE',
      'EXTERNAL SMTP CONFIGURATION = REQUIRED',
      'EMAIL CONFIRMATION = NOT READY',
      'PASSWORD RESET = NOT READY',
      'F-03 = OPEN',
      'OWNER ACTION REQUIRED',
      'No Stripe configuration was modified during A2.6.1.',
      'The A2.5 Google verification trust fix remains active.',
    ]) expect(report).toContain(s);
  });
});
