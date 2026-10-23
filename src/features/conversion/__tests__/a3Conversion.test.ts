import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { META_PIXEL_ID, urlCarriesAuthTokens, fireOnce, trackActivation, trackCompleteRegistration, trackInitiateCheckout, trackLead, trackPageView, trackPurchase } from '../../../lib/pixel';
import { isConfirmedRegistrationSession, registrationKey, trackConfirmedRegistration } from '../registration';
import { shouldTrackPageView } from '../MetaPixelTracker';
import { PLAN_PRICE } from '../../billing/conversion';
import { PLAN } from '../../../../supabase/functions/stripe-billing/logic';
import { CONSENT_KEY } from '../../../lib/consent';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const html = read('index.html');

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

let fbq: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fbq = vi.fn();
  (globalThis as unknown as { window: unknown }).window = { fbq };
  const consent = memoryStore();
  consent.setItem(CONSENT_KEY, JSON.stringify({ version: 1, advertising: true, decidedAt: '2026-06-01T00:00:00.000Z' }));
  vi.stubGlobal('localStorage', consent);
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.unstubAllGlobals();
});
const calls = (name: string) => fbq.mock.calls.filter((c) => c[1] === name);
const pixelSrc = read('src/lib/pixel.ts');

describe('A3 pixel base code (consent-gated since A3.5.1A)', () => {
  it('uses only the official pixel id', () => {
    expect(META_PIXEL_ID).toBe('2022587961640258');
    expect(html).not.toContain('7692881320839391');
    expect(pixelSrc).toContain("n('init', META_PIXEL_ID)");
  });

  it('has exactly one base script and one init across index.html and src', () => {
    expect(html).not.toMatch(/fbevents\.js|fbq\(/);
    expect(pixelSrc.match(/fbevents\.js/g)).toHaveLength(1);
    expect(pixelSrc.match(/'init'/g)).toHaveLength(1);
  });

  it('disables Meta\'s own history tracking and automatic events before init', () => {
    expect(pixelSrc).toContain('n.disablePushState = true');
    expect(pixelSrc.indexOf('disablePushState = true')).toBeLessThan(pixelSrc.indexOf("n('init'"));
    expect(pixelSrc).toContain("n('set', 'autoConfig', false, META_PIXEL_ID)");
  });

  it('skips the initial PageView when the URL carries auth tokens', () => {
    expect(urlCarriesAuthTokens('#access_token=x&refresh_token=y&type=recovery')).toBe(true);
    expect(urlCarriesAuthTokens('?code=abc')).toBe(true);
    expect(urlCarriesAuthTokens('?token_hash=abc&type=signup')).toBe(true);
    expect(urlCarriesAuthTokens('?checkout=success')).toBe(false);
    expect(urlCarriesAuthTokens('')).toBe(false);
  });
});

describe('A3 SPA PageView', () => {
  it('fires only when the path changes, never on first mount or query-only changes', () => {
    expect(shouldTrackPageView('/app', '/app')).toBe(false);
    expect(shouldTrackPageView('/', '/app')).toBe(true);
  });

  it('is mounted once inside the router and nowhere else', () => {
    const main = read('src/main.tsx');
    expect(main.match(/<MetaPixelTracker \/>/g)).toHaveLength(1);
    expect(main.indexOf('<BrowserRouter>')).toBeLessThan(main.indexOf('<MetaPixelTracker />'));
  });

  it('PageView carries no parameters', () => {
    trackPageView();
    expect(fbq).toHaveBeenCalledWith('track', 'PageView', {});
  });
});

describe('A3 CompleteRegistration', () => {
  const base = { id: 'u1', email_confirmed_at: '2026-01-01T10:00:00Z', last_sign_in_at: '2026-01-01T10:00:05Z' };

  it('signup submitted / awaiting confirmation: none', () => {
    const store = memoryStore();
    expect(trackConfirmedRegistration(null, store)).toBe(false);
    expect(trackConfirmedRegistration({ id: 'u1', email_confirmed_at: null, last_sign_in_at: null }, store)).toBe(false);
    expect(calls('CompleteRegistration')).toHaveLength(0);
  });

  it('confirmed new user: once, and reload does not duplicate', () => {
    const store = memoryStore();
    expect(trackConfirmedRegistration(base, store)).toBe(true);
    expect(trackConfirmedRegistration(base, store)).toBe(false);
    expect(trackConfirmedRegistration({ ...base }, store)).toBe(false);
    expect(calls('CompleteRegistration')).toHaveLength(1);
    expect(store.m.get(registrationKey('u1'))).toBe('1');
  });

  it('normal login of an older account: none', () => {
    expect(isConfirmedRegistrationSession({ ...base, last_sign_in_at: '2026-01-05T09:00:00Z' })).toBe(false);
    expect(trackConfirmedRegistration({ ...base, last_sign_in_at: '2026-01-01T10:30:00Z' }, memoryStore())).toBe(false);
    expect(calls('CompleteRegistration')).toHaveLength(0);
  });

  it('Google: first sign-in counts, returning Google user does not', () => {
    const fresh = { id: 'g1', email_confirmed_at: '2026-02-01T08:00:00Z', last_sign_in_at: '2026-02-01T08:00:00Z' };
    expect(isConfirmedRegistrationSession(fresh)).toBe(true);
    expect(isConfirmedRegistrationSession({ ...fresh, last_sign_in_at: '2026-03-01T08:00:00Z' })).toBe(false);
  });

  it('rejects malformed timestamps', () => {
    expect(isConfirmedRegistrationSession({ id: 'x', email_confirmed_at: 'nope', last_sign_in_at: 'nope' })).toBe(false);
  });

  it('payload has no personal data', () => {
    trackConfirmedRegistration(base, memoryStore());
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', {});
  });

  it('landing pages no longer fire CompleteRegistration on lead forms or logins', () => {
    for (const f of ['BusinessAuditLanding', 'ContentGeneratorLanding', 'CopilotLanding', 'DiagnosticLanding', 'GrowthPlanLanding', 'PotentialLanding']) {
      expect(read(`src/components/${f}.tsx`)).not.toContain('trackCompleteRegistration');
    }
  });
});

describe('A3 InitiateCheckout', () => {
  const hook = read('src/features/billing/useBillingAction.ts');

  it('fires only after a checkout URL came back, right before the redirect', () => {
    const fire = hook.indexOf('trackInitiateCheckout(PLAN_PRICE);');
    expect(hook).toContain("if (action === 'checkout') {");
    expect(fire).toBeGreaterThan(hook.indexOf('if (url) {'));
    expect(fire).toBeLessThan(hook.indexOf('window.location.assign(url)'));
    expect(hook.match(/trackInitiateCheckout/g)).toHaveLength(2);
  });

  it('billing visit, price view and failed creation do not fire', () => {
    for (const f of ['BillingPage.tsx', 'BillingNotices.tsx', 'BillingProvider.tsx', 'repository.ts']) {
      expect(read(`src/features/billing/${f}`)).not.toMatch(/trackInitiateCheckout|fbq/);
    }
    const catchBlock = hook.slice(hook.indexOf('} catch (err) {'));
    expect(catchBlock).not.toContain('trackInitiateCheckout');
  });

  it('value and currency come from the server-enforced plan', () => {
    expect(PLAN_PRICE.value).toBe(PLAN.unitAmount / 100);
    expect(PLAN_PRICE.currency).toBe(PLAN.currency.toUpperCase());
    trackInitiateCheckout(PLAN_PRICE);
    expect(fbq).toHaveBeenCalledWith('track', 'InitiateCheckout', { value: 9.99, currency: 'EUR' });
  });
});

describe('A3 Purchase and Activation', () => {
  it('?checkout=success alone never fires Purchase', () => {
    const page = read('src/features/billing/BillingPage.tsx');
    expect(page).not.toMatch(/trackPurchase\(/);
    expect(page).toContain("if (returned === 'success') void trackPurchaseAfterCheckout()");
    expect(read('index.html')).not.toContain('Purchase');
  });

  it('helpers accept a future eventID for server-side dedupe', () => {
    trackPurchase(PLAN_PRICE, { eventId: 'evt_1' });
    trackActivation({ eventId: 'evt_2' });
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', { value: 9.99, currency: 'EUR' }, { eventID: 'evt_1' });
    expect(fbq).toHaveBeenCalledWith('trackCustom', 'Activation', {}, { eventID: 'evt_2' });
  });
});

describe('A3 helpers', () => {
  it('fireOnce marks before firing and survives missing storage', () => {
    const store = memoryStore();
    const fire = vi.fn();
    expect(fireOnce('k', fire, store)).toBe(true);
    expect(fireOnce('k', fire, store)).toBe(false);
    expect(fireOnce('k', fire, null)).toBe(true);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it('no-op when the pixel is blocked', () => {
    (globalThis as unknown as { window: unknown }).window = {};
    expect(() => { trackLead(); trackCompleteRegistration(); }).not.toThrow();
  });
});
