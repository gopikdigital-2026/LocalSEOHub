import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  GEO_BANDS, GEO_BLOCKS, GEO_MAX_PRIORITIES, GEO_ROUTES, GEO_WEIGHTS, geoAudit, geoBandFor, type GeoProfileInput,
} from '../../geo-audit/engine';
import { normalizeGbp, scan, type GbpSnapshot } from '../../maps-scanner/engine';
import { COPY } from '../../geo-audit/copy';
import { TOOLS } from '../../tools/catalog';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const FN_DIR = join(ROOT, 'supabase/functions');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const app = src('src/App.tsx');
const engineSrc = src('src/features/geo-audit/engine.ts');
const pageSrc = src('src/features/geo-audit/GeoAuditPage.tsx');
const copySrc = src('src/features/geo-audit/copy.ts');
const geoSrc = [engineSrc, pageSrc, copySrc].join('\n');

const RETIRED = [
  'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content',
  'generate-business-audit', 'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description',
  'generate-geo-audit', 'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
  'simulate-campaign',
];

const NO_GBP: GbpSnapshot = { state: 'not_connected', lastSyncAt: null, data: null };
const LOCAL_MAX = 67;

// A: full manual profile + website URL, no GBP, hours missing.
const A: GeoProfileInput = {
  name: 'Gopik.Digital', category: 'Agencia de marketing digital', city: 'Marbella', phone: '+34 600 123 456',
  website: 'https://gopik.digital', schedule: '', services: ['Diseño web', 'SEO local', 'Google Ads', 'Redes sociales'],
  target_audience: 'Pymes y profesionales de la Costa del Sol',
};
// B: incomplete profile.
const B: GeoProfileInput = { name: 'Taller Ruiz', category: 'Taller mecánico', city: '', phone: '', website: '', schedule: '', services: [], target_audience: '' };
// C: profile + GBP row shaped as written after gbp-sync.
const C_ROW = {
  status: 'connected',
  last_sync_at: '2026-10-10T09:30:00.000Z',
  metadata: {
    locationName: 'locations/123', name: 'Gopik.Digital', category: 'Agencia de marketing', address: 'Calle Mayor 1, Marbella',
    phone: '+34 600 123 456', website: 'https://www.gopik.digital/', hours: [{ openDay: 'MONDAY' }], totalReviews: 12, averageRating: 4.6,
  },
};
const C: GeoProfileInput = { ...A, schedule: 'L-V 9:00-18:00' };
// D: minimal info.
const D: GeoProfileInput = { name: '', category: '', city: '', services: [] };
// Shape of the two real production rows (name + category + city only).
const PROD: GeoProfileInput = { name: 'Negocio', category: 'Peluquería', city: 'Madrid', phone: null, website: null, schedule: null, services: null, target_audience: null };

const allEs = JSON.stringify(COPY.es);
const allText = JSON.stringify(COPY);
const AI_NAMES = /chatgpt|gemini|perplexity/i;

describe('A2.4.5 GEO Audit', () => {
  it('1. /herramientas/geo is mounted inside AppGuard and gated on Premium/trial', () => {
    const block = app.match(/<Route element=\{<AppGuard><AppShellV2 \/><\/AppGuard>\}>([\s\S]*?)<\/Route>\n/)![1];
    expect(block).toContain('<Route path="/herramientas/geo" element={<GeoAuditPage />} />');
    expect(app.match(/path="\/herramientas\/geo"/g)).toHaveLength(1);
    expect(pageSrc).toContain('useBilling()');
    expect(pageSrc).toMatch(/if \(!hasPremium\)/);
  });

  it('2. GEO is available in the hub', () => {
    expect(TOOLS.find((t) => t.id === 'geo')).toMatchObject({
      enabled: true, path: '/herramientas/geo', legacyFunction: 'generate-geo-audit', recoveryStatus: 'ACTIVE',
    });
    expect(TOOLS.find((t) => t.id === 'geo')!.copy.es.name).toBe('GEO Audit');
  });

  it('3-5. SEO, Maps and Advisor stay available', () => {
    expect(TOOLS.find((t) => t.id === 'seo')).toMatchObject({ enabled: true, path: '/herramientas/seo' });
    expect(TOOLS.find((t) => t.id === 'maps')).toMatchObject({ enabled: true, path: '/herramientas/maps' });
    expect(TOOLS.find((t) => t.id === 'advisor')).toMatchObject({ enabled: true, path: '/herramientas/advisor' });
  });

  it('6. Voice is released in A2.4.8 (Twin A2.4.6, Radar A2.4.7)', () => {
    expect(TOOLS.find((t) => t.id === 'voice')).toMatchObject({ enabled: true, path: '/herramientas/voice' });
    expect(TOOLS.filter((t) => t.enabled).map((t) => t.id)).toEqual(['seo', 'maps', 'twin', 'radar', 'geo', 'advisor', 'voice']);
    expect(app).toMatch(/herramientas\/voice/);
  });

  it('7. legacy generate-geo-audit still answers 410; no new function or migration was added', () => {
    expect(readdirSync(join(FN_DIR, 'generate-geo-audit'))).toEqual(['index.ts']);
    expect(src('supabase/functions/generate-geo-audit/index.ts')).toContain('status: 410');
    expect(readdirSync(FN_DIR).filter((f) => /geo/i.test(f))).toEqual(['generate-geo-audit']);
    expect(readdirSync(MIG_DIR).filter((f) => /a245|geo/i.test(f))).toEqual([]);
  });

  it('8-9. no AI call and no ledger use', () => {
    expect(geoSrc).not.toMatch(/openai|anthropic|functions\.invoke|fetch\(|reserve_ai_usage|settle_ai_usage|\.rpc\(|Math\.random|Date\.now/i);
    expect(pageSrc).not.toMatch(/from '..\/..\/lib\/supabase'/);
  });

  it('10. global cap remains 80 and GEO has no quota of its own', () => {
    const latest = readdirSync(MIG_DIR).find((f) => f.endsWith('_a243_business_advisor_limits.sql'))!;
    const mig = src(`supabase/migrations/${latest}`);
    expect(Number(mig.match(/WHEN 'global' THEN (\d+)/)![1])).toBe(80);
    expect(mig).not.toMatch(/geo/i);
  });

  it('11. same input gives the same output', () => {
    const gbp = normalizeGbp(C_ROW);
    expect(geoAudit(C, gbp)).toEqual(geoAudit({ ...C }, normalizeGbp({ ...C_ROW })));
    expect(geoAudit(A, NO_GBP)).toEqual(geoAudit(A, NO_GBP));
  });

  it('12-13. score and coverage stay within 0-100; weights sum to 100; bands are ordered', () => {
    expect(Object.values(GEO_WEIGHTS).reduce((a, b) => a + b.weight, 0)).toBe(100);
    expect(GEO_BANDS.map((b) => b.min)).toEqual([90, 75, 50, 0]);
    expect([100, 90, 89, 75, 74, 50, 49, 0].map(geoBandFor))
      .toEqual(['very_ready', 'very_ready', 'ready', 'ready', 'improvable', 'improvable', 'low', 'low']);
    for (const [p, g] of [[A, NO_GBP], [B, NO_GBP], [C, normalizeGbp(C_ROW)], [D, NO_GBP], [PROD, NO_GBP]] as const) {
      const r = geoAudit(p, g);
      expect(r.coverage).toBeGreaterThanOrEqual(0);
      expect(r.coverage).toBeLessThanOrEqual(100);
      if (r.score !== null) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('14. unchecked criteria do not penalise the score', () => {
    const r = geoAudit(C, NO_GBP);
    expect(r.criteria.filter((c) => c.status === 'unchecked').every((c) => c.points === 0)).toBe(true);
    expect(r.score).toBe(100);
  });

  it('15. unchecked criteria lower coverage', () => {
    expect(geoAudit(C, NO_GBP).coverage).toBe(57);
    expect(geoAudit(C, normalizeGbp(C_ROW)).coverage).toBe(79);
    expect(geoAudit(C, NO_GBP).evaluated).toBe(8);
    expect(geoAudit(C, NO_GBP).total).toBe(14);
  });

  it('16. missing evaluable criteria do penalise the score (partial credit is deterministic)', () => {
    const full = geoAudit(C, NO_GBP).score!;
    expect(geoAudit({ ...C, phone: '' }, NO_GBP).score).toBe(Math.round(((LOCAL_MAX - 4) / LOCAL_MAX) * 100));
    expect(geoAudit({ ...C, services: ['SEO'] }, NO_GBP).score).toBe(Math.round(((LOCAL_MAX - 8.5) / LOCAL_MAX) * 100));
    expect(geoAudit({ ...C, target_audience: 'Pymes' }, NO_GBP).criteria.find((c) => c.id === 'audience'))
      .toMatchObject({ status: 'improve', detail: 'short_audience', points: 3.5 });
    expect(geoAudit({ ...C, city: '' }, NO_GBP).score!).toBeLessThan(full);
  });

  it('17. priorities follow fixed rules, max 5, in a documented order, each with a why line', () => {
    expect(geoAudit(B, NO_GBP).priorities.map((p) => p.id)).toEqual(['add_city', 'add_services', 'add_website', 'connect_gbp', 'add_audience']);
    expect(geoAudit(A, NO_GBP).priorities.map((p) => p.id)).toEqual(['connect_gbp', 'add_hours']);
    expect(geoAudit(C, normalizeGbp(C_ROW)).priorities).toEqual([{ id: 'keep_fresh', cta: '/herramientas/seo' }]);
    for (const p of [A, B, C, D, PROD]) {
      const pr = geoAudit(p, NO_GBP).priorities;
      expect(pr.length).toBeLessThanOrEqual(GEO_MAX_PRIORITIES);
      for (const x of pr) expect(COPY.es.priorities[x.id].why.length).toBeGreaterThan(0);
    }
    expect(COPY.es.priorities.add_services.title).toBe('Define mejor tus servicios principales');
    expect(COPY.es.priorities.add_services.why).toBe('Esto ayuda a que buscadores y sistemas de IA comprendan con mayor precisión qué ofrece tu negocio.');
    expect(allEs).not.toMatch(/garantiza|garantizado|aparecerás|te recomendará/i);
  });

  it('18-20. no ChatGPT, Gemini or Perplexity ranking is computed or claimed', () => {
    expect(engineSrc).not.toMatch(AI_NAMES);
    expect(pageSrc).not.toMatch(AI_NAMES);
    // The names only appear in the disclaimer and in the "what we do not measure" list.
    const { disclaimer, notMeasured, ...rest } = COPY.es;
    expect(JSON.stringify(rest)).not.toMatch(AI_NAMES);
    expect(disclaimer).toMatch(/No mide tu posición ni tu aparición real/);
    expect(notMeasured.filter((s) => AI_NAMES.test(s)).every((s) => /posición real/.test(s))).toBe(true);
  });

  for (const [n, name] of [[18, 'ChatGPT'], [19, 'Gemini'], [20, 'Perplexity']] as const) {
    it(`${n}. no ${name} ranking: the result carries no assistant-specific field`, () => {
      const json = JSON.stringify([geoAudit(A, NO_GBP), geoAudit(C, normalizeGbp(C_ROW))]);
      expect(json).not.toMatch(new RegExp(name, 'i'));
      expect(COPY.es.notMeasured).toContain(`Tu posición real en ${name}`);
    });
  }

  it('21-22. no AI visibility share, citations or recommendations are fabricated', () => {
    expect(engineSrc).not.toMatch(/visibility|citation|mention|recommend|share|rank/i);
    expect(Object.keys(GEO_WEIGHTS).some((k) => /rank|visib|cite|mention|recommend/.test(k))).toBe(false);
    expect(allText).not.toMatch(/Excelente ranking IA|Top AI visibility|ChatGPT score/i);
    expect(COPY.es.notMeasured).toEqual(expect.arrayContaining(['Cuota de visibilidad en IA', 'Cuántas veces una IA recomienda tu negocio', 'Ranking en respuestas generativas']));
    expect(COPY.es.notMeasuredNote).toBe('LocalSEOHub no consulta ni simula rankings en asistentes de IA en esta auditoría.');
  });

  it('23. works without GBP: Google criteria are "No comprobado"', () => {
    const r = geoAudit(A, NO_GBP);
    expect(r.score).not.toBeNull();
    expect(r.criteria.filter((c) => c.source === 'google').every((c) => c.status === 'unchecked')).toBe(true);
    expect(COPY.es.status.unchecked).toBe('No comprobado');
  });

  it('24-25. works without website analysis; website content and structured data are never inferred', () => {
    for (const g of [NO_GBP, normalizeGbp(C_ROW)]) {
      const r = geoAudit(C, g);
      for (const id of ['web_content', 'structured_data', 'description'] as const) {
        expect(r.criteria.find((c) => c.id === id)).toMatchObject({ status: 'unchecked', points: 0, detail: 'no_source' });
      }
    }
    expect(engineSrc).not.toMatch(/json-?ld|robots|sitemap|canonical|metaDescription|og:|hasSchema|<h1/i);
    expect(geoAudit({ ...A, website: 'no es una web' }, NO_GBP).criteria.find((c) => c.id === 'website')!.status).toBe('improve');
  });

  it('26-27. no arbitrary fetch and no SSRF surface; analyze-website untouched and not called', () => {
    expect(geoSrc).not.toMatch(/fetch\(|XMLHttpRequest|axios|analyze-website|analyze-competitor-url|new URL\(/);
    expect(existsSync(join(ROOT, 'src/features/geo-audit/website.ts'))).toBe(false);
    expect(readdirSync(join(FN_DIR, 'analyze-competitor-url'))).toEqual(['index.ts']);
    expect(src('supabase/functions/analyze-competitor-url/index.ts')).toContain('status: 410');
  });

  it('28. manual data is never shown as Google-verified', () => {
    for (const g of [NO_GBP, normalizeGbp(C_ROW)]) {
      const local = geoAudit(C, g).criteria.filter((c) => c.source === 'localseohub');
      expect(local.every((c) => c.trust !== 'verified')).toBe(true);
    }
    expect(COPY.es.trust.available).toBe('Declarado en LocalSEOHub');
  });

  it('29. Google data counts only when it comes from a connected and synced row', () => {
    const google = (g: GbpSnapshot) => geoAudit(C, g).criteria.filter((x) => x.source === 'google');
    expect(google(normalizeGbp(C_ROW)).every((x) => x.trust === 'verified')).toBe(true);
    expect(google(normalizeGbp({ status: 'connected', last_sync_at: null, metadata: {} })).every((x) => x.status === 'unchecked')).toBe(true);
    expect(google(normalizeGbp({ ...C_ROW, status: 'disconnected' })).every((x) => x.status === 'unchecked')).toBe(true);
    expect(google(normalizeGbp({ ...C_ROW, status: 'error' })).every((x) => x.status === 'unchecked')).toBe(true);
    expect(geoAudit(C, normalizeGbp({ ...C_ROW, status: 'error' })).priorities[0].id).toBe('fix_gbp');
    expect(COPY.es.trust.verified).toBe('Sincronizado desde Google');
  });

  it('30. isolation: only the signed-in user\'s business and RLS-scoped sources are read', () => {
    expect(pageSrc).toContain('useBusiness()');
    expect(pageSrc).toContain('loadSources(id)');
    expect(pageSrc).toMatch(/const businessId = currentBusiness\?\.id \?\? null;/);
    expect(pageSrc).not.toMatch(/user_id|userId|searchParams|useParams/);
  });

  it('31-32. refresh re-reads stored data only: no AI, no sync, no external queries', () => {
    const refresh = pageSrc.match(/const onRefresh = async \(\) => \{([\s\S]*?)\n {2}\};/)![1];
    expect(refresh).toContain('refreshBusiness()');
    expect(refresh).toContain('loadGbp(businessId)');
    expect(refresh).not.toMatch(/invoke|fetch|gbp-sync|sync|update|insert|upsert|rpc/i);
    expect(COPY.es.refresh).toBe('Actualizar auditoría');
    expect(COPY.es.refreshed).not.toMatch(/Google|sincroniz|consult/i);
  });

  it('33. CTAs point only to real routes and never to Twin, Radar or Voice', () => {
    const allowed = new Set<string>(Object.values(GEO_ROUTES));
    expect([...allowed].sort()).toEqual(['/fuentes', '/herramientas/seo', '/negocio']);
    for (const p of [A, B, C, D, PROD]) {
      for (const g of [NO_GBP, normalizeGbp(C_ROW), normalizeGbp({ status: 'error' })]) {
        for (const pr of geoAudit(p, g).priorities) expect(allowed.has(pr.cta)).toBe(true);
      }
    }
    for (const route of [...allowed, '/facturacion', '/herramientas']) expect(app).toContain(`path="${route}"`);
    const links = [...pageSrc.matchAll(/to="([^"]+)"/g)].map((m) => m[1]);
    expect(links.every((l) => ['/herramientas', '/fuentes', '/facturacion'].includes(l))).toBe(true);
    expect(geoSrc).not.toMatch(/herramientas\/(twin|radar|voice)/);
  });

  it('34. no tokens, keys, provider payloads or internal IDs are read or shown', () => {
    expect(geoSrc).not.toMatch(/token|service_role|stripe|apikey|api_key|email|external_account_id|external_location_id|locationName/i);
    expect(pageSrc).not.toMatch(/\{gbp\.data\.|metadata|currentBusiness\.id\}/);
  });

  it('35. the 14 retired functions still answer 410', () => {
    for (const fn of RETIRED) {
      expect(readdirSync(join(FN_DIR, fn))).toEqual(['index.ts']);
      expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410');
    }
  });

  it('36. SEO Generator is untouched', () => {
    expect(src('supabase/functions/seo-generator-v2/index.ts')).toContain('requirePremium(req, "seo-generator-v2"');
    expect(app).toContain('<Route path="/herramientas/seo" element={<SeoGeneratorPage />} />');
  });

  it('37. AI Business Advisor is untouched', () => {
    expect(src('supabase/functions/business-advisor-v2/index.ts')).toContain('requirePremium(req, "business-advisor-v2"');
    expect(app).toContain('<Route path="/herramientas/advisor" element={<AdvisorPage />} />');
  });

  it('38. Maps Profile Scanner still behaves the same (shared helpers only)', () => {
    expect(app).toContain('<Route path="/herramientas/maps" element={<MapsScannerPage />} />');
    const r = scan({ name: 'Taller Ruiz', category: 'Taller mecánico', city: '', phone: '', website: '', schedule: '', services: [] }, NO_GBP);
    expect(r.priorities.map((p) => p.id)).toEqual(['add_city', 'add_phone', 'connect_gbp', 'add_schedule', 'add_services']);
    expect(src('src/features/maps-scanner/MapsScannerPage.tsx')).not.toMatch(/geo-audit/);
  });

  it('39. weekly-content is untouched', () => {
    expect(src('supabase/functions/weekly-content/index.ts')).toContain('requirePremium(req, "weekly-content"');
  });

  it('40. business-improvement is untouched', () => {
    expect(src('supabase/functions/business-improvement/index.ts')).toContain('admin.rpc("settle_ai_usage"');
  });

  it('mandatory texts are present and rendered', () => {
    expect(COPY.es.title).toBe('GEO Audit');
    expect(COPY.es.subtitle).toBe('Evalúa si la información de tu negocio está preparada para ser comprendida por buscadores y asistentes de IA.');
    expect(COPY.es.disclaimer).toBe('Esta puntuación evalúa la preparación de tu información digital. No mide tu posición ni tu aparición real en ChatGPT, Gemini, Perplexity u otros asistentes.');
    expect(COPY.es.scoreKicker).toBe('PREPARACIÓN GEO');
    expect(COPY.es.bands).toEqual({ very_ready: 'Muy preparado', ready: 'Bien preparado', improvable: 'Mejorable', low: 'Preparación baja' });
    expect(COPY.es.status).toEqual({ ok: 'Bien definido', improve: 'Mejorable', unchecked: 'No comprobado' });
    expect(COPY.es.origin).toEqual({ localseohub: 'LocalSEOHub', website: 'Sitio web', google: 'Google Business Profile' });
    for (const k of ['{t.disclaimer}', '{t.scoreKicker}', '{t.coverageKicker}', '{t.notMeasuredNote}', '{t.insufficient}']) expect(pageSrc).toContain(k);
    expect(GEO_BLOCKS).toHaveLength(9);
  });

  it('dates come only from real timestamps; never "analizado hoy"', () => {
    expect(pageSrc).toContain('formatDate(gbp.lastSyncAt, lang)');
    expect(pageSrc).toContain('formatDate(currentBusiness.updated_at, lang)');
    expect(pageSrc).not.toMatch(/new Date\(\)/);
    expect(allText).not.toMatch(/analizado hoy|analysed today/i);
  });

  describe('fixtures', () => {
    it('A: full manual profile + web URL, no GBP: useful score, partial coverage, Google unchecked', () => {
      const r = geoAudit(A, NO_GBP);
      expect(r.score).toBe(Math.round(((LOCAL_MAX - 3) / LOCAL_MAX) * 100));
      expect(r.band).toBe('very_ready');
      expect(r.coverage).toBe(57);
      expect(r.gbpState).toBe('not_connected');
    });

    it('B: incomplete profile: lower score and concrete priorities', () => {
      const r = geoAudit(B, NO_GBP);
      expect(r.score).toBe(Math.round((18 / LOCAL_MAX) * 100));
      expect(r.band).toBe('low');
      expect(r.priorities).toHaveLength(5);
    });

    it('C: profile + GBP: higher coverage; mismatches are reported only for fields that exist', () => {
      const r = geoAudit(C, normalizeGbp(C_ROW));
      expect(r.coverage).toBeGreaterThan(geoAudit(C, NO_GBP).coverage);
      expect(r.score).toBe(100);
      const bad = geoAudit(C, normalizeGbp({ ...C_ROW, metadata: { ...C_ROW.metadata, phone: '+34 999 000 111', address: 'Calle Sol 2, Málaga' } }));
      expect(bad.criteria.find((c) => c.id === 'consistency')).toMatchObject({ status: 'improve', detail: 'mismatch', mismatches: ['city', 'phone'] });
      expect(bad.priorities.map((p) => p.id)).toEqual(['align_sources']);
      const nothing = geoAudit({ name: 'X Y', category: 'Bar', services: [] }, normalizeGbp({ ...C_ROW, metadata: { category: 'Bar' } }));
      expect(nothing.criteria.find((c) => c.id === 'consistency')).toMatchObject({ status: 'unchecked', detail: 'no_source' });
    });

    it('D: minimal info: no score and the mandatory message', () => {
      const r = geoAudit(D, NO_GBP);
      expect(r.score).toBeNull();
      expect(r.band).toBeNull();
      expect(r.priorities).toEqual([{ id: 'complete_identity', cta: '/negocio' }]);
      expect(COPY.es.insufficient).toBe('No hay suficiente información para calcular una auditoría GEO fiable.');
    });

    it('production shape (name + category + city only): score 45, coverage 57 %', () => {
      const r = geoAudit(PROD, NO_GBP);
      expect(r.score).toBe(45);
      expect(r.band).toBe('low');
      expect(r.coverage).toBe(57);
    });
  });
});
