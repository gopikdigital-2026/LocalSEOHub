import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const trackMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/analytics', () => ({ track: trackMock }));
import { parseBillingStatus, trialCountdown, serverNow, needsUpgrade, PREMIUM_STATES } from '../model';
import { trackPaywallViewed, trackTrialStarted } from '../analytics';
import { billingCopy } from '../billingCopy';

const src = (p: string) => readFileSync(p, 'utf8');
const DAY = 86400000;

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('billing model', () => {
  it('M1. parses the server status and never trusts has_premium for a non-premium state', () => {
    const s = parseBillingStatus({ state: 'TRIAL_EXPIRED', has_premium: true, server_now: '2024-01-01T00:00:00Z' }, Date.parse('2024-01-01T00:00:00Z'));
    expect(s.hasPremium).toBe(false);
    expect(() => parseBillingStatus({ state: 'GOLD' })).toThrow();
    expect(() => parseBillingStatus(null)).toThrow();
    expect([...PREMIUM_STATES].sort()).toEqual(['SUBSCRIPTION_ACTIVE', 'SUBSCRIPTION_CANCELING', 'TRIAL_ACTIVE']);
  });

  it('M2. countdown: 7 days at start, honest final 24 hours, ended after', () => {
    const start = Date.parse('2024-01-01T10:00:00Z');
    const end = new Date(start + 7 * DAY).toISOString();
    expect(trialCountdown(end, start)).toMatchObject({ kind: 'days', days: 7 });
    expect(trialCountdown(end, start + 6 * DAY - 1)).toMatchObject({ kind: 'days', days: 2 });
    expect(trialCountdown(end, start + 6 * DAY + 1)).toMatchObject({ kind: 'today' });
    expect(trialCountdown(end, start + 7 * DAY)).toMatchObject({ kind: 'ended' });
  });

  it('M3. countdown uses server time, not a wrong device clock', () => {
    const s = parseBillingStatus({ state: 'TRIAL_ACTIVE', has_premium: true, server_now: '2024-01-05T00:00:00Z' }, Date.parse('2024-01-01T00:00:00Z'));
    expect(serverNow(s, Date.parse('2024-01-01T00:00:00Z'))).toBe(Date.parse('2024-01-05T00:00:00Z'));
  });

  it('M4. upgrade is offered only once access has actually lapsed', () => {
    expect(needsUpgrade('TRIAL_EXPIRED')).toBe(true);
    expect(needsUpgrade('SUBSCRIPTION_CANCELED')).toBe(true);
    expect(needsUpgrade('SUBSCRIPTION_CANCELING')).toBe(false);
    expect(needsUpgrade('TRIAL_ACTIVE')).toBe(false);
  });

  it('M5. required copy exists in both languages without fake urgency', () => {
    const es = billingCopy('es');
    const en = billingCopy('en');
    expect(es.daysLeft(3)).toBe('Te quedan 3 días de prueba gratuita');
    expect(es.endsToday).toBe('Tu prueba termina hoy');
    expect(es.ended).toBe('Tu prueba gratuita ha finalizado');
    expect(es.upgradeTitle).toBe('Tu prueba gratuita ha terminado');
    expect(es.upgradeBody).toBe('Tu negocio, tus acciones y tu progreso siguen guardados. Puedes continuar utilizando las funciones de LocalSEOHub con una suscripción de 9,99 €/mes.');
    expect(es.subscribe).toBe('Activar suscripción');
    expect(en.subscribe).toBeTruthy();
    expect(JSON.stringify(es) + JSON.stringify(en)).not.toMatch(/última oportunidad|solo hoy|last chance|hurry|!!/i);
  });

  it('M6. trial and paywall analytics fire once per user and state', () => {
    const store = memoryStore();
    trackTrialStarted('u1', store);
    trackTrialStarted('u1', store);
    trackPaywallViewed('u1', 'today', 'TRIAL_EXPIRED', store);
    trackPaywallViewed('u1', 'today', 'TRIAL_EXPIRED', store);
    trackPaywallViewed('u1', 'plan', 'TRIAL_EXPIRED', store);
    expect(trackMock.mock.calls.map((c) => c[0])).toEqual(['trial_started', 'paywall_viewed', 'paywall_viewed']);
    expect(JSON.stringify(trackMock.mock.calls)).not.toMatch(/u1|@/);
  });
});

describe('billing integration (source checks)', () => {
  it('S1. action writes are blocked client-side without premium and reads stay available', () => {
    const p = src('src/features/actions/ActionsProvider.tsx');
    expect(p).toMatch(/if \(!canWrite\) throw new PremiumRequiredError\(\)/);
    expect(p).toMatch(/setActions\(await loadActions\(currentBusiness\.id\)\)/);
  });

  it('S2. access is never granted from the checkout return URL', () => {
    const page = src('src/features/billing/BillingPage.tsx');
    expect(page).toMatch(/runBillingAction\('sync'\)/);
    expect(page).not.toMatch(/setStatus|hasPremium\s*=\s*true/);
  });

  it('S3. the old insecure Stripe functions are retired and the webhook processes synchronously', () => {
    expect(src('supabase/functions/stripe-checkout/index.ts')).toMatch(/status: 410/);
    expect(src('supabase/functions/stripe-cancel-subscription/index.ts')).toMatch(/status: 410/);
    const webhook = src('supabase/functions/stripe-webhook/index.ts');
    expect(webhook).not.toMatch(/waitUntil/);
    expect(webhook).toMatch(/constructEventAsync\(body, signature/);
    expect(src('supabase/functions/stripe-billing/index.ts')).not.toMatch(/trial_period_days/);
  });

  it('S4. onboarding starts the trial explicitly, with a visible no-card notice, and GBP stays optional', () => {
    const flow = src('src/features/first-value/FirstValueFlow.tsx');
    expect(flow).toMatch(/billing\.startTrial\(\)/);
    expect(src('src/features/first-value/onboardingCopy.ts')).toMatch(/Sin tarjeta y sin cobros automáticos/);
    expect(flow).not.toMatch(/startGBPConnection/);
  });

  it('S5. every app page shows the trial status and the billing page is routed inside the app shell', () => {
    expect(src('src/app-v2/layouts/AppShellV2.tsx')).toMatch(/<TrialBanner \/>/);
    expect(src('src/App.tsx')).toMatch(/path="\/facturacion"/);
  });
});
