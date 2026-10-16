import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  buildDigitalTwin, knowledgeBandFor, TWIN_BANDS, TWIN_MAX_PRIORITIES, TWIN_ROUTES, TWIN_TOOL_ROUTES, TWIN_WEIGHTS,
  type TwinProfileInput,
} from '../../digital-twin/engine';
import { COPY } from '../../digital-twin/copy';
import { normalizeGbp, scan, type GbpSnapshot } from '../../maps-scanner/engine';
import { geoAudit } from '../../geo-audit/engine';
import { TOOLS } from '../../tools/catalog';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const FN_DIR = join(ROOT, 'supabase/functions');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const app = src('src/App.tsx');
const engineSrc = src('src/features/digital-twin/engine.ts');
const pageSrc = src('src/features/digital-twin/DigitalTwinPage.tsx');
const cardSrc = src('src/features/digital-twin/TwinBlockCard.tsx');
const copySrc = src('src/features/digital-twin/copy.ts');
const uiSrc = pageSrc + cardSrc;
const twinSrc = [engineSrc, pageSrc, cardSrc, copySrc].join('\n');

const RETIRED = [
  'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content',
  'generate-business-audit', 'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description',
  'generate-geo-audit', 'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
  'simulate-campaign',
];

const NO_GBP: GbpSnapshot = { state: 'not_connected', lastSyncAt: null, data: null };

// A: fairly complete manual profile, no GBP, hours missing.
const A: TwinProfileInput = {
  name: 'Gopik.Digital', category: 'Agencia de marketing digital', city: 'Marbella', phone: '+34 600 123 456',
  website: 'https://gopik.digital', schedule: '', services: ['Gestión de campañas', 'SEO local', 'Diseño web'],
  target_audience: 'Pymes y profesionales de la Costa del Sol', primary_goal: 'more_calls', secondary_goals: ['more_reviews'],
};
// B: incomplete profile.
const B: TwinProfileInput = { name: 'Taller Ruiz', category: 'Taller mecánico', city: '', services: [], primary_goal: null, secondary_goals: [] };
// C: complete profile + GBP row as written after gbp-sync.
const C_ROW = {
  status: 'connected', verified_at: '2026-10-10T09:30:00.000Z',
  verified_profile: { locationName: 'locations/123', name: 'Gopik.Digital', category: 'Agencia de marketing', address: 'Calle Mayor 1, Marbella', phone: '+34 600 123 456' },
};
const C: TwinProfileInput = { ...A, schedule: 'L-V 9:00-18:00' };
// D: minimal.
const D: TwinProfileInput = { name: '', category: '', city: '', services: [] };
// Shape of the two real production rows.
const PROD: TwinProfileInput = { name: 'Negocio', category: 'Peluquería', city: 'Madrid', phone: '', website: '', schedule: '', services: [], target_audience: '', primary_goal: 'more_bookings', secondary_goals: [] };

const ALL: TwinProfileInput[] = [A, B, C, D, PROD];
const SNAPS: GbpSnapshot[] = [NO_GBP, normalizeGbp(C_ROW), normalizeGbp({ status: 'error' }), normalizeGbp({ status: 'connected', verified_at: null, verified_profile: {} })];
const allText = JSON.stringify(COPY);
const field = (p: TwinProfileInput, g: GbpSnapshot, id: string) => buildDigitalTwin(p, g).fields.find((f) => f.id === id)!;

describe('A2.4.6 AI Digital Twin', () => {
  it('1. /herramientas/twin is mounted once inside AppGuard and gated on Premium/trial', () => {
    const block = app.match(/<Route element=\{<AppGuard><AppShellV2 \/><\/AppGuard>\}>([\s\S]*?)<\/Route>\n/)![1];
    expect(block).toContain('<Route path="/herramientas/twin" element={<DigitalTwinPage />} />');
    expect(app.match(/path="\/herramientas\/twin"/g)).toHaveLength(1);
    expect(pageSrc).toContain('useBilling()');
    expect(pageSrc).toMatch(/if \(!hasPremium\)/);
  });

  it('2. Twin is available in the hub with its approved copy', () => {
    expect(TOOLS.find((t) => t.id === 'twin')).toMatchObject({ enabled: true, path: '/herramientas/twin', recoveryStatus: 'ACTIVE', legacyFunction: null });
    expect(TOOLS.find((t) => t.id === 'twin')!.copy.es.name).toBe('AI Digital Twin');
  });

  it.each([['seo', '/herramientas/seo'], ['maps', '/herramientas/maps'], ['geo', '/herramientas/geo'], ['advisor', '/herramientas/advisor']] as const)(
    '3-6. %s stays available', (id, path) => {
      expect(TOOLS.find((t) => t.id === id)).toMatchObject({ enabled: true, path });
    },
  );

  it.each(['voice'])('8. %s is released in A2.4.8', (id) => {
    const tool = TOOLS.find((t) => t.id === id)!;
    expect(tool.enabled).toBe(true);
    expect(tool.path).toBe(`/herramientas/${id}`);
    expect(app).toContain(`/herramientas/${id}`);
    expect(twinSrc).not.toContain(`/herramientas/${id}`);
  });

  it('enabled tools are exactly seo, maps, twin, radar, geo, advisor and voice (A2.4.8)', () => {
    expect(TOOLS.filter((t) => t.enabled).map((t) => t.id)).toEqual(['seo', 'maps', 'twin', 'radar', 'geo', 'advisor', 'voice']);
  });

  it('9-10. no AI call and no ledger use', () => {
    expect(twinSrc).not.toMatch(/openai|anthropic|functions\.invoke|fetch\(|reserve_ai_usage|settle_ai_usage|\.rpc\(|Math\.random|Date\.now/i);
    expect(uiSrc).not.toMatch(/lib\/supabase/);
    expect(readdirSync(FN_DIR).filter((f) => /twin/i.test(f))).toEqual([]);
    expect(readdirSync(MIG_DIR).filter((f) => /a246|twin/i.test(f))).toEqual([]);
  });

  it('11. global AI cap remains 80 with no Twin quota', () => {
    const mig = src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith('_a243_business_advisor_limits.sql'))!}`);
    expect(Number(mig.match(/WHEN 'global' THEN (\d+)/)![1])).toBe(80);
    expect(mig).not.toMatch(/twin/i);
  });

  it('12. same input gives the same Twin', () => {
    expect(buildDigitalTwin({ ...C }, normalizeGbp({ ...C_ROW }))).toEqual(buildDigitalTwin(C, normalizeGbp(C_ROW)));
    expect(buildDigitalTwin(A, NO_GBP)).toEqual(buildDigitalTwin(A, NO_GBP));
  });

  it('13. knowledgePercent stays within 0-100; weights sum to 100; bands are ordered', () => {
    expect(Object.values(TWIN_WEIGHTS).reduce((s, w) => s + w.weight, 0)).toBe(100);
    expect(TWIN_BANDS.map((b) => b.min)).toEqual([85, 65, 40, 0]);
    expect([100, 85, 84, 65, 64, 40, 39, 0].map(knowledgeBandFor))
      .toEqual(['very_complete', 'very_complete', 'well_defined', 'well_defined', 'partial', 'partial', 'initial', 'initial']);
    for (const p of ALL) for (const g of SNAPS) {
      const k = buildDigitalTwin(p, g).knowledgePercent;
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(100);
    }
  });

  it('14-16. knowledge is never presented as ranking, SEO score or business performance', () => {
    const withoutNote = JSON.stringify([COPY.es, COPY.en].map(({ knowledgeNote, ...rest }) => (void knowledgeNote, rest)));
    expect(withoutNote).not.toMatch(/ranking|posición en|SEO score|puntuación SEO|rendimiento|performance score|Excelente|Mal negocio|Buen rendimiento|calidad del \d/i);
    expect(COPY.en.knowledgeNote).toMatch(/^This percentage measures available information, not /);
    expect(COPY.es.knowledgeKicker).toBe('CONOCIMIENTO DEL NEGOCIO');
    expect(COPY.es.knowledgeExplain(64)).toBe('LocalSEOHub conoce el 64 % de los datos que utiliza para construir tu representación digital.');
    expect(COPY.es.knowledgeNote).toBe('Este porcentaje mide la información disponible, no la calidad de tu negocio, tu posicionamiento ni tus resultados.');
    expect(pageSrc).toContain('{t.knowledgeNote}');
    expect(pageSrc).not.toMatch(/\/ 100/);
    expect(COPY.es.bands).toEqual({ very_complete: 'Muy completo', well_defined: 'Bien definido', partial: 'Parcial', initial: 'Información inicial' });
  });

  it('17. manual data is declared, never verified', () => {
    for (const g of SNAPS) {
      const manual = buildDigitalTwin(C, g).fields.filter((f) => f.id !== 'gbp');
      expect(manual.every((f) => f.provenance === 'declared')).toBe(true);
    }
    expect(COPY.es.provenance.declared).toBe('Declarado');
  });

  it('18. GBP is verified only with a connected and synced row', () => {
    expect(field(C, normalizeGbp(C_ROW), 'gbp')).toMatchObject({ state: 'known', provenance: 'verified' });
    expect(field(C, normalizeGbp({ status: 'connected', verified_at: null, verified_profile: {} }), 'gbp')).toMatchObject({ state: 'partial', provenance: 'detected' });
    expect(field(C, normalizeGbp({ ...C_ROW, status: 'error' }), 'gbp')).toMatchObject({ state: 'missing', provenance: 'unchecked' });
    expect(field(C, normalizeGbp({ ...C_ROW, status: 'disconnected' }), 'gbp')).toMatchObject({ state: 'missing', provenance: 'unchecked' });
    expect(buildDigitalTwin(C, NO_GBP).values).toMatchObject({ gbpAddress: null, gbpCategory: null });
  });

  it('19. unknown fields are never filled in', () => {
    const t = buildDigitalTwin(D, NO_GBP);
    expect(t.values).toEqual({
      name: '', activity: '', city: '', services: [], audience: '', website: '', websiteValid: false, phone: '', hours: '',
      primaryGoal: null, secondaryGoals: [], gbpAddress: null, gbpCategory: null,
    });
    expect(t.knowledgePercent).toBe(0);
    expect(t.knownFields).toEqual([]);
  });

  it('20. services are never inferred from the activity', () => {
    expect(buildDigitalTwin(B, NO_GBP).values.services).toEqual([]);
    expect(buildDigitalTwin({ ...A, services: ['SEO local', ' SEO local ', 3] }, NO_GBP).values.services).toEqual(['SEO local']);
    expect(COPY.es.servicesEmpty).toBe('No has definido todavía tus servicios principales.');
  });

  it('21. target audience is never inferred', () => {
    expect(buildDigitalTwin(B, NO_GBP).values.audience).toBe('');
    expect(COPY.es.audienceEmpty).toBe('Cliente objetivo no definido.');
  });

  it('22. no description is generated: it is always unavailable and outside the percentage', () => {
    for (const p of ALL) expect(buildDigitalTwin(p, normalizeGbp(C_ROW)).unavailable).toEqual(['description', 'web_analysis', 'structured_data']);
    expect(Object.keys(TWIN_WEIGHTS)).not.toContain('description');
    expect(cardSrc).toMatch(/label=\{t\.description\} empty=\{t\.notAvailable\} prov="unchecked"/);
  });

  it('23. goals are never invented; unknown goal ids are dropped', () => {
    expect(buildDigitalTwin(B, NO_GBP).values.primaryGoal).toBeNull();
    expect(buildDigitalTwin({ ...A, primary_goal: 'world_domination', secondary_goals: ['more_calls', 'fake', 'more_reviews', 'more_reviews'] }, NO_GBP).values)
      .toMatchObject({ primaryGoal: null, secondaryGoals: ['more_calls', 'more_reviews'] });
    expect(buildDigitalTwin(A, NO_GBP).values.secondaryGoals).toEqual(['more_reviews']);
  });

  it('24. works without GBP', () => {
    const t = buildDigitalTwin(A, NO_GBP);
    expect(t.blocks.find((b) => b.id === 'local')!.state).toBe('empty');
    expect(t.priorities.map((p) => p.id)).toContain('connect_gbp');
  });

  it('25. works without website analysis: the web block is "No comprobado" even with a URL', () => {
    for (const g of SNAPS) expect(buildDigitalTwin(C, g).blocks.find((b) => b.id === 'web')).toEqual({ id: 'web', state: 'unchecked', fields: [] });
    expect(COPY.es.webUrlAvailable).toBe('URL disponible');
    expect(allText).not.toMatch(/Web analizada|Website analysed/i);
  });

  it('26-27. no fetch, crawler or SSRF surface; analyze-website is not used', () => {
    expect(twinSrc).not.toMatch(/fetch\(|XMLHttpRequest|axios|analyze-website|new URL\(|json-?ld|sitemap|robots/i);
  });

  it('28-29. refresh re-reads saved data only: no AI, no sync, no writes', () => {
    const refresh = pageSrc.match(/const onRefresh = async \(\) => \{([\s\S]*?)\n {2}\};/)![1];
    expect(refresh).toContain('refreshBusiness()');
    expect(refresh).toContain('loadGbp(businessId)');
    expect(refresh).not.toMatch(/invoke|fetch|sync|update|insert|upsert|rpc|new Date/i);
    expect(COPY.es.refresh).toBe('Actualizar Digital Twin');
    expect(uiSrc).not.toMatch(/new Date\(\)/);
    expect(pageSrc).toContain('formatDate(currentBusiness.updated_at, lang)');
    expect(pageSrc).toContain('formatDate(gbp.lastSyncAt, lang)');
  });

  it('30-31. gaps follow a fixed order, max 5, at least 1', () => {
    expect(buildDigitalTwin(B, NO_GBP).priorities.map((p) => p.id)).toEqual(['add_city', 'add_services', 'add_audience', 'add_goal', 'add_phone']);
    expect(buildDigitalTwin(A, NO_GBP).priorities.map((p) => p.id)).toEqual(['add_hours', 'connect_gbp']);
    expect(buildDigitalTwin(C, normalizeGbp(C_ROW)).priorities).toEqual([{ id: 'keep_updated', cta: '/negocio' }]);
    expect(buildDigitalTwin(C, normalizeGbp({ status: 'error' })).priorities.map((p) => p.id)).toEqual(['fix_gbp']);
    expect(buildDigitalTwin(C, normalizeGbp({ status: 'connected', verified_at: null })).priorities.map((p) => p.id)).toEqual(['sync_gbp']);
    for (const p of ALL) for (const g of SNAPS) {
      const n = buildDigitalTwin(p, g).priorities.length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(TWIN_MAX_PRIORITIES);
    }
  });

  it('32. CTAs point only to existing routes', () => {
    const allowed = new Set<string>(Object.values(TWIN_ROUTES));
    for (const p of ALL) for (const g of SNAPS) for (const x of buildDigitalTwin(p, g).priorities) expect(allowed.has(x.cta)).toBe(true);
    for (const r of [...allowed, ...Object.values(TWIN_TOOL_ROUTES), '/herramientas', '/facturacion']) expect(app).toContain(`path="${r}"`);
    expect(Object.values(TWIN_TOOL_ROUTES).sort()).toEqual(['/herramientas/advisor', '/herramientas/geo', '/herramientas/maps', '/herramientas/seo']);
    const links = [...pageSrc.matchAll(/to="([^"]+)"/g)].map((m) => m[1]);
    expect(links.every((x) => ['/herramientas', '/facturacion'].includes(x))).toBe(true);
  });

  it('33. isolation: only the signed-in user\'s business and RLS-scoped sources are read', () => {
    expect(pageSrc).toContain('useBusiness()');
    expect(pageSrc).toContain('loadSources(id)');
    expect(pageSrc).toContain('const businessId = currentBusiness?.id ?? null;');
    expect(twinSrc).not.toMatch(/user_id|userId|useParams|searchParams/);
  });

  it('34-37. no secrets, email, Stripe or internal IDs are read or shown', () => {
    expect(twinSrc).not.toMatch(/token|service_role|apikey|api_key|stripe|email|external_account_id|external_location_id|locationName|metadata/i);
    expect(uiSrc).not.toMatch(/\{currentBusiness\.id\}|\{businessId\}|user\.|useAuth/);
    expect(JSON.stringify(buildDigitalTwin(C, normalizeGbp(C_ROW)))).not.toContain('locations/123');
  });

  it('38. Maps Profile Scanner has no regression', () => {
    expect(app).toContain('<Route path="/herramientas/maps" element={<MapsScannerPage />} />');
    const r = scan({ name: 'Taller Ruiz', category: 'Taller mecánico', city: '', phone: '', website: '', schedule: '', services: [] }, NO_GBP);
    expect(r.priorities.map((p) => p.id)).toEqual(['add_city', 'add_phone', 'connect_gbp', 'add_schedule', 'add_services']);
  });

  it('39. GEO Audit has no regression and its score is not copied into the Twin', () => {
    expect(app).toContain('<Route path="/herramientas/geo" element={<GeoAuditPage />} />');
    expect(geoAudit({ name: 'Negocio', category: 'Peluquería', city: 'Madrid' }, NO_GBP).score).toBe(45);
    expect(engineSrc).not.toMatch(/geoAudit|scan\(/);
    expect(Object.keys(buildDigitalTwin(A, NO_GBP))).not.toContain('score');
  });

  it('40. SEO Generator has no regression', () => {
    expect(src('supabase/functions/seo-generator-v2/index.ts')).toContain('requirePremium(req, "seo-generator-v2"');
  });

  it('41. AI Business Advisor has no regression', () => {
    expect(src('supabase/functions/business-advisor-v2/index.ts')).toContain('requirePremium(req, "business-advisor-v2"');
  });

  it('42. weekly-content has no regression', () => {
    expect(src('supabase/functions/weekly-content/index.ts')).toContain('requirePremium(req, "weekly-content"');
  });

  it('43. business-improvement has no regression', () => {
    expect(src('supabase/functions/business-improvement/index.ts')).toContain('admin.rpc("settle_ai_usage"');
  });

  it.each(RETIRED)('44. retired %s still answers 410', (fn) => {
    expect(readdirSync(join(FN_DIR, fn))).toEqual(['index.ts']);
    expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410');
  });

  it('mandatory texts are present', () => {
    expect(COPY.es.subtitle).toBe('Así entiende LocalSEOHub tu negocio.');
    expect(COPY.es.definition).toBe('Una representación estructurada de lo que LocalSEOHub conoce sobre tu negocio.');
    expect(COPY.es.twinKicker).toBe('TU DIGITAL TWIN');
    expect(COPY.es.gapsTitle).toBe('Completa tu Digital Twin');
    expect(COPY.es.gapsWhy).toBe('Cuanto más completa sea la información de tu negocio, más personalizadas podrán ser las recomendaciones, contenidos y análisis de LocalSEOHub.');
    expect(COPY.es.contextTitle).toBe('Qué puede hacer LocalSEOHub con este contexto');
    expect(COPY.es.startingTitle).toBe('Tu Digital Twin está empezando a construirse.');
    expect(COPY.es.startingBody).toBe('Completa la información de tu negocio para obtener una representación más útil.');
    expect(COPY.es.blockState).toEqual({ complete: 'Completo', partial: 'Parcial', empty: 'Sin información', unchecked: 'No comprobado' });
    expect(allText).not.toMatch(/garantiza|aparecerás|te recomendará|avatar|predic/i);
  });

  describe('fixtures', () => {
    it('A: fairly complete profile, no GBP: useful Twin, Google not checked', () => {
      const t = buildDigitalTwin(A, NO_GBP);
      expect(t.knowledgePercent).toBe(84);
      expect(t.knowledgeBand).toBe('well_defined');
      expect(t.starting).toBe(false);
      expect(t.sourceSummary).toMatchObject({ declared: 8, detected: 0, verified: 0, gbpState: 'not_connected' });
      expect(field(A, NO_GBP, 'gbp').provenance).toBe('unchecked');
    });

    it('B: incomplete profile: lower knowledge and clear gaps', () => {
      const t = buildDigitalTwin(B, NO_GBP);
      expect(t.knowledgePercent).toBe(18);
      expect(t.knowledgeBand).toBe('initial');
      expect(t.priorities).toHaveLength(5);
    });

    it('C: profile + synced GBP: more knowledge and a verified source', () => {
      const t = buildDigitalTwin(C, normalizeGbp(C_ROW));
      expect(t.knowledgePercent).toBe(100);
      expect(t.knowledgeBand).toBe('very_complete');
      expect(t.sourceSummary.verified).toBe(1);
      expect(t.values).toMatchObject({ gbpAddress: 'Calle Mayor 1, Marbella', gbpCategory: 'Agencia de marketing' });
      expect(t.blocks.filter((b) => b.state === 'complete').map((b) => b.id)).toEqual(['identity', 'offer', 'customer', 'location', 'contact', 'goals', 'local']);
    });

    it('D: minimal info: starting state, nothing invented', () => {
      const t = buildDigitalTwin(D, NO_GBP);
      expect(t.starting).toBe(true);
      expect(t.knowledgeBand).toBe('initial');
      expect(t.priorities[0]).toEqual({ id: 'complete_identity', cta: '/negocio' });
      expect(t.blocks.filter((b) => b.id !== 'web').every((b) => b.state === 'empty')).toBe(true);
      expect(buildDigitalTwin({ name: 'Solo nombre' }, NO_GBP)).toMatchObject({ starting: true, knowledgePercent: 8 });
    });

    it('partial grades: 1-2 services and a short audience count half', () => {
      expect(field({ ...A, services: ['SEO'] }, NO_GBP, 'services')).toMatchObject({ state: 'partial', points: 9 });
      expect(field({ ...A, target_audience: 'Pymes' }, NO_GBP, 'audience')).toMatchObject({ state: 'partial', points: 5 });
      expect(field({ ...A, phone: '123' }, NO_GBP, 'phone').state).toBe('missing');
      expect(field({ ...A, website: 'no es una web' }, NO_GBP, 'website').state).toBe('missing');
    });

    it('production shape (name + activity + city + main goal): 42 %, Parcial', () => {
      const t = buildDigitalTwin(PROD, NO_GBP);
      expect(t.knowledgePercent).toBe(42);
      expect(t.knowledgeBand).toBe('partial');
      expect(t.priorities.map((p) => p.id)).toEqual(['add_services', 'add_audience', 'add_phone', 'add_hours', 'add_website']);
    });
  });
});
