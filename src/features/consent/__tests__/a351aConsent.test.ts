import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY, CONSENT_VERSION, hasAdvertisingConsent, readConsent, writeConsent } from '../../../lib/consent';
import { META_PIXEL_SCRIPT, fireOnce, trackCompleteRegistration, trackLead, trackPageView, trackPurchase } from '../../../lib/pixel';
import { applyTrackingConsent } from '../applyConsent';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
}

type FakeScript = { src?: string; async?: boolean };
let store: ReturnType<typeof memoryStore>;
let appended: FakeScript[];
let win: Window & { fbq?: { queue: unknown[][] } };
let doc: Document;

beforeEach(() => {
  store = memoryStore();
  vi.stubGlobal('localStorage', store);
  appended = [];
  doc = { createElement: () => ({}), head: { appendChild: (s: FakeScript) => appended.push(s) } } as unknown as Document;
  win = {
    location: { search: '', hash: '' },
    requestIdleCallback: (cb: () => void) => { cb(); return 1; },
    setTimeout: (cb: () => void) => { cb(); return 1; },
  } as unknown as typeof win;
  (globalThis as unknown as { window: unknown }).window = win;
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.unstubAllGlobals();
});

const queue = () => (win.fbq?.queue ?? []) as unknown[][];
const tracked = (name: string) => queue().filter((c) => c[1] === name);
const metaScripts = () => appended.filter((s) => s.src === META_PIXEL_SCRIPT);
const clarityScripts = () => appended.filter((s) => s.src?.startsWith('https://www.clarity.ms/'));
/** Mirrors the startup check in main.tsx. */
const startup = () => { if (hasAdvertisingConsent()) applyTrackingConsent(true, win, doc); };

describe('A — no decision yet', () => {
  it('nothing is decided, so the banner opens', () => {
    expect(readConsent()).toBeNull();
    expect(read('src/features/consent/ConsentProvider.tsx')).toContain('open={decision === null || preferencesOpen}');
  });

  it('no Meta or Clarity script is requested and no PageView exists', () => {
    startup();
    trackPageView();
    trackLead();
    expect(win.fbq).toBeUndefined();
    expect(appended).toHaveLength(0);
  });

  it('index.html contains no ungated tracker, noscript pixel or Clarity tag', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/fbq|fbevents|facebook\.com\/tr|clarity\.ms|_loadClarity/);
  });

  it('startup loads trackers only behind the stored-consent check', () => {
    const main = read('src/main.tsx');
    expect(main).toContain('if (hasAdvertisingConsent()) applyTrackingConsent(true);');
    expect(main.match(/applyTrackingConsent\(/g)).toHaveLength(1);
  });

  it('even a stray fbq receives nothing without consent', () => {
    const fbq = vi.fn();
    (globalThis as unknown as { window: unknown }).window = { fbq };
    trackPageView();
    trackCompleteRegistration();
    trackPurchase({ value: 29, currency: 'EUR' });
    expect(fbq).not.toHaveBeenCalled();
  });
});

describe('B — accept', () => {
  it('persists a minimal versioned decision without personal data', () => {
    writeConsent(true, store, new Date('2026-06-10T09:00:00Z'));
    const raw = JSON.parse(store.getItem(CONSENT_KEY)!);
    expect(raw).toEqual({ version: CONSENT_VERSION, advertising: true, decidedAt: '2026-06-10T09:00:00.000Z' });
    expect(Object.keys(raw).sort()).toEqual(['advertising', 'decidedAt', 'version']);
  });

  it('loads the pixel once, configures it before init and sends one PageView', () => {
    writeConsent(true);
    applyTrackingConsent(true, win, doc);
    expect(metaScripts()).toHaveLength(1);
    expect(clarityScripts()).toHaveLength(1);
    expect(queue()[0]).toEqual(['set', 'autoConfig', false, '2022587961640258']);
    expect(queue()[1]).toEqual(['init', '2022587961640258']);
    expect(tracked('PageView')).toEqual([['track', 'PageView', {}]]);
    expect((win.fbq as unknown as { disablePushState: boolean }).disablePushState).toBe(true);
  });

  it('a returning visitor who accepted gets the same start on reload', () => {
    writeConsent(true);
    startup();
    expect(metaScripts()).toHaveLength(1);
    expect(tracked('PageView')).toHaveLength(1);
  });

  it('skips the initial PageView on auth-token landings', () => {
    writeConsent(true);
    (win.location as { hash: string }).hash = '#access_token=x';
    applyTrackingConsent(true, win, doc);
    expect(tracked('PageView')).toHaveLength(0);
  });

  it('event helpers keep their names and payloads', () => {
    writeConsent(true);
    applyTrackingConsent(true, win, doc);
    trackLead();
    trackPurchase({ value: 29, currency: 'EUR' }, { eventId: 'e1' });
    expect(tracked('Lead')).toEqual([['track', 'Lead', {}]]);
    expect(tracked('Purchase')).toEqual([['track', 'Purchase', { value: 29, currency: 'EUR' }, { eventID: 'e1' }]]);
  });
});

describe('C — reject', () => {
  it('persists the rejection; nothing loads and the helpers are harmless no-ops', () => {
    writeConsent(false);
    expect(readConsent()?.advertising).toBe(false);
    applyTrackingConsent(false, win, doc);
    startup();
    expect(() => { trackPageView(); trackLead(); trackCompleteRegistration(); }).not.toThrow();
    expect(win.fbq).toBeUndefined();
    expect(appended).toHaveLength(0);
  });
});

describe('D — reject then accept', () => {
  it('starts from the moment of acceptance with no replay of earlier events', () => {
    writeConsent(false);
    trackLead();
    fireOnce('lsh_px_cr_u1', () => trackCompleteRegistration(), store);
    writeConsent(true);
    applyTrackingConsent(true, win, doc);
    fireOnce('lsh_px_cr_u1', () => trackCompleteRegistration(), store);
    expect(tracked('Lead')).toHaveLength(0);
    expect(tracked('CompleteRegistration')).toHaveLength(0);
    expect(tracked('PageView')).toHaveLength(1);
  });
});

describe('E — accept then reject', () => {
  it('revokes in Meta and blocks every later event; re-accepting resumes from that point', () => {
    writeConsent(true);
    applyTrackingConsent(true, win, doc);
    writeConsent(false);
    applyTrackingConsent(false, win, doc);
    expect(queue()[queue().length - 1]).toEqual(['consent', 'revoke']);
    const before = queue().length;
    trackPageView();
    trackLead();
    trackPurchase({ value: 29, currency: 'EUR' });
    expect(queue()).toHaveLength(before);

    writeConsent(true);
    applyTrackingConsent(true, win, doc);
    expect(metaScripts()).toHaveLength(1);
    expect(queue().slice(before)).toEqual([['consent', 'grant'], ['track', 'PageView', {}]]);
  });
});

describe('Consent versioning', () => {
  it('missing, malformed or other-version records count as undecided', () => {
    for (const raw of ['{', 'null', '"yes"', JSON.stringify({ version: 2, advertising: true, decidedAt: 'x' }), JSON.stringify({ version: 1, advertising: 'true', decidedAt: 'x' })]) {
      store.setItem(CONSENT_KEY, raw);
      expect(readConsent()).toBeNull();
      expect(hasAdvertisingConsent()).toBe(false);
    }
  });
});

describe('Consent UI', () => {
  const banner = read('src/features/consent/ConsentBanner.tsx');
  it('offers Rechazar and Aceptar with identical styling and nothing preselected', () => {
    expect(banner).toContain('className={CHOICE_BUTTON}>Rechazar<');
    expect(banner).toContain('className={CHOICE_BUTTON}>Aceptar<');
    expect(banner).not.toMatch(/checked|type="checkbox"/);
  });
  it('explains campaign measurement in Spanish and links the policy', () => {
    expect(banner).toContain('medir el rendimiento');
    expect(banner).toContain('to="/privacidad"');
  });
  it('can be reopened later from every legal footer', () => {
    const links = read('src/features/legal/LegalLinks.tsx');
    expect(links).toContain('onClick={openPreferences}');
    for (const to of ['/privacidad', '/terminos', '/eliminar-datos']) expect(links).toContain(`to="${to}"`);
    expect(read('src/components/LandingPage.tsx')).toContain('<LegalLinks />');
    expect(read('src/features/legal/LegalLayout.tsx')).toContain('<LegalLinks />');
  });
});

describe('F/G — public legal routes', () => {
  const app = read('src/App.tsx');
  it('are registered outside every auth guard', () => {
    for (const path of ['/privacidad', '/terminos', '/eliminar-datos']) {
      const at = app.indexOf(`<Route path="${path}"`);
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(app.indexOf('<AppGuard>'));
      expect(at).toBeLessThan(app.indexOf('<OnboardingGuard>'));
    }
  });

  it('survive a direct refresh through the SPA fallback', () => {
    expect(read('public/_redirects')).toMatch(/^\/\*\s+\/index\.html\s+200/m);
  });

  it('privacy policy is truthful about optional tracking', () => {
    const p = read('src/features/legal/PrivacyPolicyPage.tsx');
    for (const s of ['Meta Pixel', 'Meta Platforms', 'Microsoft Clarity', 'Stripe', '<MailLink />', 'id="cookies"']) expect(p).toContain(s);
    expect(p).not.toMatch(/No usamos cookies de seguimiento/);
    expect(read('src/features/legal/LegalLinks.tsx')).toContain("LEGAL_CONTACT_EMAIL = 'admin@localseohub.io'");
  });

  it('data deletion never asks for secrets and promises no deadline', () => {
    const d = read('src/features/legal/DataDeletionPage.tsx');
    expect(d).toContain('Nunca te pediremos tu contraseña');
    expect(d).toContain('<MailLink />');
    expect(d).not.toMatch(/\d+\s*(días|horas|semanas)|automátic/i);
  });

  it('terms keep the approved sections', () => {
    const t = read('src/features/legal/TermsPage.tsx');
    for (let i = 1; i <= 7; i++) expect(t).toContain(`<h2>${i}. `);
    expect(read('src/components/LegalModals.tsx')).not.toMatch(/PrivacyModal|TermsModal/);
  });
});
