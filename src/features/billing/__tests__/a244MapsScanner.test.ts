import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  BANDS, MAX_PRIORITIES, ROUTES, WEIGHTS, bandFor, normalizeGbp, scan, type GbpSnapshot, type ProfileInput,
} from '../../maps-scanner/engine';
import { COPY } from '../../maps-scanner/copy';
import { TOOLS } from '../../tools/catalog';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const FN_DIR = join(ROOT, 'supabase/functions');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const app = src('src/App.tsx');
const engineSrc = src('src/features/maps-scanner/engine.ts');
const pageSrc = src('src/features/maps-scanner/MapsScannerPage.tsx');
const copySrc = src('src/features/maps-scanner/copy.ts');
const scannerSrc = [engineSrc, pageSrc, copySrc].join('\n');

const RETIRED = [
  'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content',
  'generate-business-audit', 'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description',
  'generate-geo-audit', 'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
  'simulate-campaign',
];

const NO_GBP: GbpSnapshot = { state: 'not_connected', lastSyncAt: null, data: null };

// Fixture A: fairly complete manual profile, no GBP.
const A: ProfileInput = {
  name: 'Gopik.Digital', category: 'Agencia de marketing digital', city: 'Marbella', phone: '+34 600 123 456',
  website: 'https://gopik.digital', schedule: '', services: ['Diseño web', 'SEO local'],
};
// Fixture B: incomplete profile.
const B: ProfileInput = { name: 'Taller Ruiz', category: 'Taller mecánico', city: '', phone: '', website: '', schedule: '', services: [] };
// Fixture C: real GBP row shape written after gbp-sync.
const C_ROW = {
  status: 'connected',
  last_sync_at: '2026-10-10T09:30:00.000Z',
  metadata: {
    locationName: 'locations/123', name: 'Gopik.Digital', category: 'Agencia de marketing', address: 'Calle Mayor 1, Marbella',
    phone: '+34 600 123 456', website: 'https://www.gopik.digital/', hours: [{ openDay: 'MONDAY' }], totalReviews: 12, averageRating: 4.6,
  },
};
const C_PROFILE: ProfileInput = { ...A, schedule: 'L-V 9:00-18:00' };
// Fixture D: not enough data.
const D: ProfileInput = { name: '', category: '', city: '', phone: '', website: '', schedule: '', services: [] };

const allText = JSON.stringify(COPY);

describe('A2.4.4 Maps Profile Scanner', () => {
  it('1. /herramientas/maps is mounted inside the AppGuard shell (session + onboarding)', () => {
    const block = app.match(/<Route element=\{<AppGuard><AppShellV2 \/><\/AppGuard>\}>([\s\S]*?)<\/Route>\n/)![1];
    expect(block).toContain('<Route path="/herramientas/maps" element={<MapsScannerPage />} />');
    expect(app.match(/path="\/herramientas\/maps"/g)).toHaveLength(1);
    expect(pageSrc).toContain('useBilling()');
    expect(pageSrc).toMatch(/if \(!hasPremium\)/);
  });

  it('2. Maps shows as available and links to /herramientas/maps', () => {
    expect(TOOLS.find((t) => t.id === 'maps')).toMatchObject({
      enabled: true, path: '/herramientas/maps', legacyFunction: 'audit-maps-profile', recoveryStatus: 'ACTIVE',
    });
    expect(TOOLS.find((t) => t.id === 'maps')!.copy.es.name).toBe('Maps Profile Scanner');
  });

  it('3-4. SEO and Advisor stay available', () => {
    expect(TOOLS.find((t) => t.id === 'seo')).toMatchObject({ enabled: true, path: '/herramientas/seo' });
    expect(TOOLS.find((t) => t.id === 'advisor')).toMatchObject({ enabled: true, path: '/herramientas/advisor' });
  });

  it('5. Radar and Voice stay blocked (GEO released in A2.4.5, Twin in A2.4.6)', () => {
    const blocked = TOOLS.filter((t) => ['radar', 'voice'].includes(t.id));
    expect(blocked).toHaveLength(2);
    expect(blocked.every((t) => t.enabled === false && !t.path)).toBe(true);
    expect(TOOLS.filter((t) => t.enabled).map((t) => t.id)).toEqual(['seo', 'maps', 'twin', 'geo', 'advisor']);
  });

  it('6. legacy audit-maps-profile still answers 410 and no new function or migration was added', () => {
    expect(readdirSync(join(FN_DIR, 'audit-maps-profile'))).toEqual(['index.ts']);
    expect(src('supabase/functions/audit-maps-profile/index.ts')).toContain('status: 410');
    expect(readdirSync(FN_DIR).filter((f) => /maps/i.test(f))).toEqual(['audit-maps-profile']);
    expect(readdirSync(MIG_DIR).filter((f) => /a244|maps/i.test(f))).toEqual([]);
  });

  it('7-8 & 28. no AI call and no ledger use anywhere in the scanner, including refresh', () => {
    expect(scannerSrc).not.toMatch(/openai|functions\.invoke|fetch\(|reserve_ai_usage|settle_ai_usage|LocalSEO_KEY|\.rpc\(/i);
    expect(pageSrc).not.toMatch(/from '..\/..\/lib\/supabase'/);
    const refresh = pageSrc.match(/const onRefresh = async \(\) => \{([\s\S]*?)\n {2}\};/)![1];
    expect(refresh).toContain('refreshBusiness()');
    expect(refresh).toContain('loadGbp(businessId)');
    expect(refresh).not.toMatch(/invoke|gbp-sync|sync|update|insert|upsert/i);
  });

  it('9. global cap remains 80 and the maps tool has no ledger identifier', () => {
    const latest = readdirSync(MIG_DIR).find((f) => f.endsWith('_a243_business_advisor_limits.sql'))!;
    const mig = src(`supabase/migrations/${latest}`);
    expect(Number(mig.match(/WHEN 'global' THEN (\d+)/)![1])).toBe(80);
    expect(mig).not.toMatch(/maps/i);
  });

  it('10. same input gives the same output', () => {
    const gbp = normalizeGbp(C_ROW);
    expect(scan(C_PROFILE, gbp)).toEqual(scan(C_PROFILE, gbp));
    expect(scan(A, NO_GBP)).toEqual(scan({ ...A }, { ...NO_GBP }));
  });

  it('11-12. score and coverage stay within 0-100; weights sum to 100 and bands are ordered', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(BANDS.map((b) => b.min)).toEqual([90, 75, 50, 0]);
    expect([bandFor(100), bandFor(90), bandFor(89), bandFor(75), bandFor(74), bandFor(50), bandFor(49), bandFor(0)])
      .toEqual(['excellent', 'excellent', 'good', 'good', 'improvable', 'improvable', 'incomplete', 'incomplete']);
    for (const [p, g] of [[A, NO_GBP], [B, NO_GBP], [C_PROFILE, normalizeGbp(C_ROW)], [D, NO_GBP]] as const) {
      const r = scan(p, g);
      expect(r.coverage).toBeGreaterThanOrEqual(0);
      expect(r.coverage).toBeLessThanOrEqual(100);
      if (r.score !== null) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('13. unchecked Google items do not penalise the score', () => {
    const full: ProfileInput = { ...C_PROFILE };
    const r = scan(full, NO_GBP);
    expect(r.checks.filter((c) => c.source === 'google').every((c) => c.status === 'unchecked' && c.points === 0)).toBe(true);
    expect(r.score).toBe(100);
  });

  it('14. missing checkable items do penalise the score', () => {
    const full = scan(C_PROFILE, NO_GBP).score!;
    const noPhone = scan({ ...C_PROFILE, phone: '' }, NO_GBP).score!;
    const noHours = scan({ ...C_PROFILE, schedule: '' }, NO_GBP).score!;
    expect(noPhone).toBeLessThan(full);
    expect(noHours).toBeLessThan(full);
    expect(noPhone).toBe(Math.round(((64 - WEIGHTS.phone) / 64) * 100));
  });

  it('15. coverage reflects evaluable items and is independent of the score', () => {
    expect(scan(A, NO_GBP).coverage).toBe(50);
    expect(scan(B, NO_GBP).coverage).toBe(50);
    expect(scan(C_PROFILE, normalizeGbp(C_ROW)).coverage).toBe(100);
    const r = scan(A, NO_GBP);
    expect(r.evaluated).toBe(7);
    expect(r.total).toBe(14);
  });

  it('16. priorities follow fixed rules, max 5, in a documented order', () => {
    const b = scan(B, NO_GBP).priorities.map((p) => p.id);
    expect(b).toEqual(['add_city', 'add_phone', 'connect_gbp', 'add_schedule', 'add_services']);
    expect(b.length).toBeLessThanOrEqual(MAX_PRIORITIES);
    expect(scan(A, NO_GBP).priorities.map((p) => p.id)).toEqual(['connect_gbp', 'add_schedule']);
    expect(scan(C_PROFILE, normalizeGbp(C_ROW)).priorities.map((p) => p.id)).toEqual(['keep_fresh']);
    for (const p of [A, B, C_PROFILE, D]) {
      for (const pr of scan(p, NO_GBP).priorities) expect(COPY.es.priorities[pr.id].title.length).toBeGreaterThan(0);
    }
  });

  it('17-21. no invented reviews, rating, ranking, GBP metrics or photos', () => {
    const r = scan(A, NO_GBP);
    const reviews = r.checks.find((c) => c.id === 'gbp_reviews')!;
    expect(reviews.status).toBe('unchecked');
    expect(reviews.reviewCount).toBeUndefined();
    expect(engineSrc).not.toMatch(/averageRating|\brating\b|\branking\b|\bposition\b|\bviews\b|\bcalls\b|\bclicks\b|\bdirections\b|\bphotos?\b|competitor/i);
    expect(normalizeGbp(C_ROW).data).not.toHaveProperty('averageRating');
    expect(Object.keys(WEIGHTS).some((k) => /photo|rank|rating|(^|_)views?$|click/.test(k))).toBe(false);
    expect(COPY.es.outOfScope.join(' ')).toMatch(/posición en Google Maps/);
    expect(allText).not.toMatch(/Hemos analizado tu perfil de Google Maps|ranking score/i);
    const c = scan(C_PROFILE, normalizeGbp(C_ROW)).checks.find((x) => x.id === 'gbp_reviews')!;
    expect(c.reviewCount).toBe(12);
  });

  it('22-23. works without GBP and shows "not connected", not an error', () => {
    const r = scan(A, NO_GBP);
    expect(r.score).not.toBeNull();
    expect(r.gbpState).toBe('not_connected');
    expect(normalizeGbp(null).state).toBe('not_connected');
    expect(normalizeGbp({ status: 'disconnected', metadata: {} }).state).toBe('not_connected');
    expect(COPY.es.gbpNotConnected).toBe('Google Business Profile no está conectado.');
    expect(COPY.es.gbpNotConnectedBody).toBe('Puedes analizar la información disponible ahora y conectar Google para ampliar el diagnóstico.');
    expect(COPY.es.intro).toBe('Analizamos la información local disponible de tu negocio. Cuando Google Business Profile esté conectado, podremos comprobar más elementos.');
    expect(COPY.es.headerKicker).toBe('DIAGNÓSTICO DE PRESENCIA LOCAL');
  });

  it('24. manual data is "available", never "verified"', () => {
    for (const g of [NO_GBP, normalizeGbp(C_ROW)]) {
      const local = scan(C_PROFILE, g).checks.filter((c) => c.source === 'localseohub');
      expect(local.every((c) => c.trust === 'available')).toBe(true);
    }
    expect(COPY.es.trust.available).toBe('Disponible');
  });

  it('25. Google data is "verified" only when it really comes from a synced connection', () => {
    const c = scan(C_PROFILE, normalizeGbp(C_ROW)).checks.filter((x) => x.source === 'google');
    expect(c.every((x) => x.trust === 'verified')).toBe(true);
    expect(COPY.es.trust.verified).toBe('Verificado con Google');
    // Connected but never synced: nothing is verified.
    const empty = normalizeGbp({ status: 'connected', last_sync_at: null, metadata: {} });
    expect(empty).toEqual({ state: 'connected', lastSyncAt: null, data: null });
    expect(scan(C_PROFILE, empty).checks.filter((x) => x.source === 'google').every((x) => x.trust === 'unchecked')).toBe(true);
    // Disconnected rows with stale metadata are ignored.
    expect(normalizeGbp({ ...C_ROW, status: 'disconnected' }).data).toBeNull();
    expect(normalizeGbp({ ...C_ROW, status: 'error' }).state).toBe('error');
  });

  it('26. user isolation: only the signed-in user\'s business and its RLS-scoped sources are read', () => {
    expect(pageSrc).toContain('useBusiness()');
    expect(pageSrc).toContain('loadSources(id)');
    expect(pageSrc).toMatch(/const businessId = currentBusiness\?\.id \?\? null;/);
    expect(pageSrc).not.toMatch(/user_id|userId|searchParams|useParams/);
  });

  it('27. CTAs point only to existing, enabled routes', () => {
    const allowed = new Set(Object.values(ROUTES));
    for (const p of [A, B, C_PROFILE, D]) {
      for (const g of [NO_GBP, normalizeGbp(C_ROW), normalizeGbp({ status: 'error' })]) {
        for (const pr of scan(p, g).priorities) expect(allowed.has(pr.cta as never)).toBe(true);
      }
    }
    for (const route of [...allowed, '/facturacion']) expect(app).toContain(`path="${route}"`);
    const links = [...pageSrc.matchAll(/to="([^"]+)"/g)].map((m) => m[1]);
    expect(links.every((l) => ['/herramientas', '/fuentes', '/facturacion'].includes(l))).toBe(true);
    expect(scannerSrc).not.toMatch(/herramientas\/(twin|radar|geo|voice)/);
  });

  it('29. refresh never claims a Google sync', () => {
    expect(COPY.es.refreshed).toBe('Diagnóstico recalculado con los datos guardados.');
    expect(COPY.es.refreshed).not.toMatch(/Google|sincroniz/i);
    expect(COPY.es.refresh).toBe('Actualizar diagnóstico');
  });

  it('30. no tokens, provider payloads or private fields are read or shown', () => {
    expect(src('src/features/reality-engine/repositories.ts')).not.toMatch(/access_token_encrypted|refresh_token_encrypted/);
    expect(scannerSrc).not.toMatch(/token|service_role|stripe|email|external_account_id|locationName/i);
    expect(pageSrc).not.toMatch(/\{gbp\.data\.|metadata/);
  });

  it('31. the 14 retired functions still answer 410', () => {
    for (const fn of RETIRED) {
      expect(readdirSync(join(FN_DIR, fn))).toEqual(['index.ts']);
      expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410');
    }
  });

  it('32-35. SEO, Advisor, weekly-content and business-improvement are untouched', () => {
    expect(src('supabase/functions/seo-generator-v2/index.ts')).toContain('requirePremium(req, "seo-generator-v2"');
    expect(src('supabase/functions/business-advisor-v2/index.ts')).toContain('requirePremium(req, "business-advisor-v2"');
    expect(src('supabase/functions/weekly-content/index.ts')).toContain('requirePremium(req, "weekly-content"');
    expect(src('supabase/functions/business-improvement/index.ts')).toContain('admin.rpc("settle_ai_usage"');
    expect(app).toContain('<Route path="/herramientas/seo" element={<SeoGeneratorPage />} />');
    expect(app).toContain('<Route path="/herramientas/advisor" element={<AdvisorPage />} />');
  });

  it('mandatory disclaimer is present and no ranking wording is used', () => {
    expect(COPY.es.disclaimer).toBe('Esta puntuación evalúa la completitud y calidad de la información disponible. No representa tu posición en Google Maps.');
    expect(pageSrc).toContain('{t.disclaimer}');
    expect(pageSrc).toContain('{t.headerKicker}');
  });

  it('website analysis is never inferred: only the stored URL is checked', () => {
    expect(scan({ ...A, website: 'no es una web' }, NO_GBP).checks.find((c) => c.id === 'website')!.status).toBe('improve');
    expect(existsSync(join(ROOT, 'src/features/maps-scanner/website.ts'))).toBe(false);
  });

  describe('fixtures', () => {
    it('A: fairly complete manual profile, no GBP: useful score, partial coverage', () => {
      const r = scan(A, NO_GBP);
      expect(r.score).toBe(Math.round(((64 - WEIGHTS.schedule) / 64) * 100));
      expect(r.band).toBe('good');
      expect(r.coverage).toBe(50);
    });

    it('B: incomplete profile: lower score and clear priorities', () => {
      const r = scan(B, NO_GBP);
      expect(r.score).toBe(Math.round(((WEIGHTS.name + WEIGHTS.category) / 64) * 100));
      expect(r.score!).toBeLessThan(scan(A, NO_GBP).score!);
      expect(r.band).toBe('incomplete');
      expect(r.priorities).toHaveLength(5);
    });

    it('C: real GBP data: higher coverage and Google fields verified', () => {
      const gbp = normalizeGbp(C_ROW);
      expect(gbp.lastSyncAt).toBe('2026-10-10T09:30:00.000Z');
      const r = scan(C_PROFILE, gbp);
      expect(r.coverage).toBe(100);
      expect(r.score).toBe(100);
      expect(r.gbpState).toBe('connected');
      const mismatch = scan(C_PROFILE, normalizeGbp({ ...C_ROW, metadata: { ...C_ROW.metadata, phone: '+34 999 000 111', totalReviews: 0 } }));
      expect(mismatch.checks.find((c) => c.id === 'gbp_phone')).toMatchObject({ status: 'improve', detail: 'phone_mismatch' });
      expect(mismatch.priorities.map((p) => p.id)).toEqual(['align_phone', 'reviews']);
      expect(mismatch.score!).toBeLessThan(100);
    });

    it('D: not enough data: no score and a clear message', () => {
      const r = scan(D, NO_GBP);
      expect(r.score).toBeNull();
      expect(r.band).toBeNull();
      expect(r.priorities).toEqual([{ id: 'complete_profile', cta: '/negocio' }]);
      expect(COPY.es.insufficient).toBe('Necesitamos más información para calcular un diagnóstico fiable.');
      expect(pageSrc).toContain('{t.insufficient}');
    });
  });
});
