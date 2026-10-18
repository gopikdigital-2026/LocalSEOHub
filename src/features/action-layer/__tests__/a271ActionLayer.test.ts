import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { normalizeGbp, scan, WEIGHTS, type GbpSnapshot } from '../../maps-scanner/engine';
import { geoAudit, GEO_WEIGHTS } from '../../geo-audit/engine';
import { buildDigitalTwin, TWIN_WEIGHTS } from '../../digital-twin/engine';
import { COPY as MAPS_COPY } from '../../maps-scanner/copy';
import { COPY as GEO_COPY } from '../../geo-audit/copy';
import { COPY as TWIN_COPY } from '../../digital-twin/copy';
import { TOOLS } from '../../tools/catalog';
import {
  ACTION_DESTINATIONS, FIELD_CONSUMERS, FIELD_EVIDENCE, MAX_ACTIONS, SUPPORTING_ROUTES, geoActions, mapsActions, twinActions,
  type ActionItem, type BusinessField,
} from '../model';
import { ACTION_COPY, actionText } from '../copy';

// Every fixture below is FIXTURE data. No real Google, Stripe or AI call is made.

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const app = src('src/App.tsx');
const layerSrc = ['model.ts', 'copy.ts', 'ActionDetail.tsx'].map((f) => src(`src/features/action-layer/${f}`)).join('\n');
const mapsPage = src('src/features/maps-scanner/MapsScannerPage.tsx');
const twinPage = src('src/features/digital-twin/DigitalTwinPage.tsx');
const geoPage = src('src/features/geo-audit/GeoAuditPage.tsx');

const FULL = {
  name: 'Gopik.Digital', category: 'Agencia de marketing', city: 'Marbella', phone: '+34 600 123 456',
  website: 'https://www.gopik.digital/', schedule: 'L-V 9:00-18:00', services: ['Diseño web', 'SEO local', 'Redes sociales'],
  target_audience: 'Pequeños negocios locales', primary_goal: 'more_calls',
};
const EMPTY = {};
const MINIMAL = { name: 'Bar Pepe', category: 'Bar' };
const PARTIAL = { name: 'Bar Pepe', category: 'Bar', city: 'Málaga', services: ['Tapas'] };
const OFF: GbpSnapshot = normalizeGbp(null);
const ERR: GbpSnapshot = normalizeGbp({ status: 'error' });
const ON: GbpSnapshot = normalizeGbp({
  status: 'connected', verified_at: '2026-10-10T09:30:00.000Z',
  verified_profile: {
    name: 'Gopik.Digital', category: 'Marketing', address: 'Calle 1, Marbella', phone: '+34 600 123 456',
    website: 'https://gopik.digital', hours: [{ d: 1 }], totalReviews: 0,
  },
});
const without = (k: keyof typeof FULL) => ({ ...FULL, [k]: k === 'services' ? [] : '' });

const keys = (a: ActionItem[]) => a.map((x) => x.key);
const maps = (p: object, g = ON) => mapsActions(scan(p, g).priorities);
const twin = (p: object, g = ON) => twinActions(buildDigitalTwin(p, g).priorities);
const geo = (p: object, g = ON) => geoActions(geoAudit(p, g).priorities);

const allStrings = (o: unknown): string[] => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(allStrings) : [];
const layerText = [...allStrings(ACTION_COPY.es), ...allStrings(ACTION_COPY.en)].join('\n');
const RANKING = /ranking|posicionamiento|posici[oó]n en (google|maps)|position on google|aparecer[aá]s? m[aá]s|appear (more|higher)|garantiz|guarantee|más clientes|more customers|increase (your )?(sales|traffic)/i;
const routeExists = (r: string) => app.includes(`path="${r}"`);

// Golden values captured before the Action Layer was added. [mapsScore, mapsCoverage, twin%, twinBand, geoScore, geoCoverage]
const GOLDEN: Array<[string, object, GbpSnapshot, number | null, number, number, string, number | null, number]> = [
  ['empty/off', EMPTY, OFF, null, 50, 0, 'initial', null, 57],
  ['empty/on', EMPTY, ON, null, 100, 10, 'initial', null, 71],
  ['minimal/off', MINIMAL, OFF, 28, 50, 18, 'initial', 27, 57],
  ['minimal/on', MINIMAL, ON, 51, 100, 28, 'initial', 33, 79],
  ['partial/off', PARTIAL, OFF, 52, 50, 39, 'initial', 57, 57],
  ['partial/on', PARTIAL, ON, 66, 100, 49, 'partial', 59, 79],
  ['full/off', FULL, OFF, 100, 50, 90, 'very_complete', 100, 57],
  ['full/on', FULL, ON, 97, 100, 100, 'very_complete', 100, 79],
];

describe('A2.7.1 · Maps Profile Scanner', () => {
  it('1. Maps existing score preserved', () => { for (const g of GOLDEN) expect(scan(g[1], g[2]).score, g[0]).toBe(g[3]); });
  it('2. Maps existing coverage preserved', () => { for (const g of GOLDEN) expect(scan(g[1], g[2]).coverage, g[0]).toBe(g[4]); });
  it('3. Maps existing criteria preserved', () => {
    expect(scan(FULL, ON).checks.map((c) => c.id)).toEqual(Object.keys(WEIGHTS));
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('4. Maps existing disclaimer preserved', () => {
    expect(mapsPage).toContain('data-testid="maps-disclaimer"');
    expect(MAPS_COPY.es.disclaimer).toContain('No representa tu posición en Google Maps');
    expect(MAPS_COPY.en.disclaimer).toContain('does not represent your position on Google Maps');
  });
  it('5. Maps missing phone action', () => expect(keys(maps(without('phone')))).toContain('phone'));
  it('6. Maps missing website action', () => expect(keys(maps(without('website')))).toContain('website'));
  it('7. Maps missing hours action', () => expect(keys(maps(without('schedule')))).toContain('hours'));
  it('8. Maps missing services action', () => expect(keys(maps(without('services')))).toContain('services'));
  it('9. Maps disconnected GBP action', () => {
    expect(keys(maps(FULL, OFF))).toEqual(['gbp_connect']);
    expect(keys(maps(FULL, ERR))).toEqual(['gbp_fix']);
  });
  it('10. Maps no fake ranking claim', () => {
    for (const k of ['phone', 'website', 'hours', 'services', 'gbp_connect'] as const) {
      for (const l of ['es', 'en'] as const) expect(Object.values(actionText(ACTION_COPY[l], 'maps', k)).join(' ')).not.toMatch(RANKING);
    }
  });
  it('11. Maps No comprobado not treated as error', () => {
    const r = scan(FULL, OFF);
    expect(r.checks.filter((c) => c.source === 'google').every((c) => c.status === 'unchecked')).toBe(true);
    expect(r.score).toBe(100);
    expect(keys(mapsActions(r.priorities))).not.toContain('reviews');
  });
  it('12. Maps action destination valid', () => {
    for (const a of [...maps(EMPTY, OFF), ...maps(PARTIAL, OFF), ...maps(PARTIAL, ON)]) expect(routeExists(a.destination), a.destination).toBe(true);
  });
  it('13. Maps completed phone removes action', () => expect(keys(maps(FULL))).not.toContain('phone'));
  it('14. Maps completed website removes action', () => expect(keys(maps(FULL))).not.toContain('website'));
  it('15. Maps completed hours removes action', () => expect(keys(maps(FULL))).not.toContain('hours'));
  it('16. Maps completed services removes action', () => expect(keys(maps(FULL))).not.toContain('services'));
  it('17. Maps max 5 primary actions', () => { for (const g of GOLDEN) expect(maps(g[1], g[2]).length).toBeLessThanOrEqual(MAX_ACTIONS); });
  it('18. Maps no duplicate action', () => { for (const g of GOLDEN) { const k = keys(maps(g[1], g[2])); expect(new Set(k).size).toBe(k.length); } });
  it('19. Maps verified provenance preserved', () => {
    const r = scan(FULL, ON);
    expect(r.checks.filter((c) => c.source === 'google' && c.status !== 'unchecked').every((c) => c.trust === 'verified')).toBe(true);
    expect(r.checks.filter((c) => c.source === 'localseohub').every((c) => c.trust === 'available')).toBe(true);
  });
  it('20. Maps AI cost zero', () => { for (const a of maps(PARTIAL, OFF)) expect(a.aiCost).toBe(0); });
});

describe('A2.7.1 · AI Digital Twin', () => {
  it('21. Twin existing knowledge percentage preserved', () => { for (const g of GOLDEN) expect(buildDigitalTwin(g[1], g[2]).knowledgePercent, g[0]).toBe(g[5]); });
  it('22. Twin existing knowledge state preserved', () => { for (const g of GOLDEN) expect(buildDigitalTwin(g[1], g[2]).knowledgeBand, g[0]).toBe(g[6]); });
  it('23. Twin existing business map preserved', () => {
    expect(buildDigitalTwin(FULL, ON).blocks.map((b) => b.id)).toEqual(['identity', 'offer', 'customer', 'location', 'contact', 'goals', 'local', 'web']);
    expect(Object.values(TWIN_WEIGHTS).reduce((a, b) => a + b.weight, 0)).toBe(100);
    expect(twinPage).toContain('<TwinBlockCard');
  });
  it('24. Twin existing provenance preserved', () => {
    expect(buildDigitalTwin(FULL, ON).sourceSummary).toMatchObject({ declared: 9, verified: 1 });
    expect(buildDigitalTwin(FULL, OFF).fields.find((f) => f.id === 'gbp')!.provenance).toBe('unchecked');
    expect(twinPage).toContain('data-testid="twin-sources"');
  });
  const explained = (field: keyof typeof FULL, key: string) => {
    const a = twin(without(field)).find((x) => x.key === key)!;
    expect(a).toBeDefined();
    expect(actionText(ACTION_COPY.es, 'twin', a.key).why.length).toBeGreaterThan(20);
    return a;
  };
  it('25. Twin missing services explanation', () => {
    const a = explained('services', 'services');
    expect(a.usedBy).toEqual(expect.arrayContaining(['seo', 'advisor', 'voice']));
    expect(actionText(ACTION_COPY.es, 'twin', 'services').why).toContain('LocalSEOHub todavía no conoce');
  });
  it('26. Twin missing audience explanation', () => expect(explained('target_audience', 'audience').usedBy).toEqual(['seo', 'advisor', 'voice', 'geo']));
  it('27. Twin missing phone explanation', () => explained('phone', 'phone'));
  it('28. Twin missing hours explanation', () => explained('schedule', 'hours'));
  it('29. Twin missing website explanation', () => explained('website', 'website'));
  it('30. Twin dependency map based on real consumers', () => {
    expect(FIELD_CONSUMERS.primary_goal).not.toContain('maps');
    expect(FIELD_CONSUMERS.primary_goal).not.toContain('geo');
    expect(FIELD_CONSUMERS.target_audience).not.toContain('maps');
  });
  it('31. Twin does not invent business facts', () => {
    const t = buildDigitalTwin(EMPTY, OFF);
    expect(t.values).toMatchObject({ name: '', activity: '', city: '', services: [], audience: '', phone: '', hours: '', website: '' });
    expect(layerSrc).not.toMatch(/invoke\(|fetch\(/);
  });
  it('32. Twin does not claim Internet-wide knowledge', () => expect(layerText).not.toMatch(/internet|toda la red|whole web/i));
  it('33. Twin does not claim ChatGPT understanding', () => expect(layerText).not.toMatch(/chatgpt|gemini|perplexity/i));
  it('34. Twin action destination valid', () => { for (const a of [...twin(EMPTY, OFF), ...twin(PARTIAL, ERR)]) expect(routeExists(a.destination)).toBe(true); });
  it('35. Twin completed services removes action', () => expect(keys(twin(FULL))).not.toContain('services'));
  it('36. Twin completed audience removes action', () => expect(keys(twin(FULL))).not.toContain('audience'));
  it('37. Twin completed phone removes action', () => expect(keys(twin(FULL))).not.toContain('phone'));
  it('38. Twin completed hours removes action', () => expect(keys(twin(FULL))).not.toContain('hours'));
  it('39. Twin completed website removes action', () => expect(keys(twin(FULL))).not.toContain('website'));
  it('40. Twin max 5 primary actions', () => { for (const g of GOLDEN) expect(twin(g[1], g[2]).length).toBeLessThanOrEqual(MAX_ACTIONS); });
  it('41. Twin AI cost zero', () => { for (const a of twin(EMPTY, OFF)) expect(a.aiCost).toBe(0); });
});

describe('A2.7.1 · GEO Audit', () => {
  it('42. GEO existing score preserved', () => { for (const g of GOLDEN) expect(geoAudit(g[1], g[2]).score, g[0]).toBe(g[7]); });
  it('43. GEO existing coverage preserved', () => { for (const g of GOLDEN) expect(geoAudit(g[1], g[2]).coverage, g[0]).toBe(g[8]); });
  it('44. GEO existing criteria preserved', () => {
    expect(geoAudit(FULL, ON).criteria.map((c) => c.id)).toEqual(Object.keys(GEO_WEIGHTS));
    expect(Object.values(GEO_WEIGHTS).reduce((a, b) => a + b.weight, 0)).toBe(100);
  });
  it('45. GEO existing disclaimer preserved', () => {
    expect(geoPage).toContain('data-testid="geo-disclaimer"');
    expect(geoPage).toContain('data-testid="geo-not-measured"');
  });
  it('46. GEO missing services action', () => expect(keys(geo(without('services')))).toContain('services'));
  it('47. GEO missing website action', () => expect(keys(geo(without('website')))).toContain('website'));
  it('48. GEO missing phone action', () => expect(keys(geo(without('phone')))).toContain('phone'));
  it('49. GEO missing hours action', () => expect(keys(geo(without('schedule')))).toContain('hours'));
  it('50. GEO disconnected GBP action', () => expect(keys(geo(FULL, OFF))).toEqual(['gbp_connect']));
  it('51. GEO keeps non-ranking disclaimer', () => {
    expect(GEO_COPY.es.disclaimer.length).toBeGreaterThan(20);
    expect(geoPage).toContain('{t.priorities[p.id].why}');
  });
  it('52. GEO no ChatGPT ranking claim', () => expect(layerText).not.toMatch(/chatgpt/i));
  it('53. GEO no Gemini ranking claim', () => expect(layerText).not.toMatch(/gemini/i));
  it('54. GEO no Perplexity ranking claim', () => expect(layerText).not.toMatch(/perplexity/i));
  it('55. GEO No comprobado not penalized', () => {
    const r = geoAudit(FULL, OFF);
    expect(r.score).toBe(100);
    expect(r.criteria.filter((c) => c.status === 'unchecked').every((c) => c.points === 0)).toBe(true);
  });
  it('56. GEO action destination valid', () => { for (const a of [...geo(PARTIAL, OFF), ...geo(PARTIAL, ON)]) expect(routeExists(a.destination)).toBe(true); });
  it('57. GEO completed services removes action', () => expect(keys(geo(FULL))).not.toContain('services'));
  it('58. GEO completed website removes action', () => expect(keys(geo(FULL))).not.toContain('website'));
  it('59. GEO completed phone removes action', () => expect(keys(geo(FULL))).not.toContain('phone'));
  it('60. GEO completed hours removes action', () => expect(keys(geo(FULL))).not.toContain('hours'));
  it('61. GEO max 5 primary actions', () => { for (const g of GOLDEN) expect(geo(g[1], g[2]).length).toBeLessThanOrEqual(MAX_ACTIONS); });
  it('62. GEO AI cost zero', () => { for (const a of geo(PARTIAL, OFF)) expect(a.aiCost).toBe(0); });
});

describe('A2.7.1 · Action Layer', () => {
  const every = GOLDEN.flatMap((g) => [...maps(g[1], g[2]), ...twin(g[1], g[2]), ...geo(g[1], g[2])]);
  it('63. deterministic action model', () => expect(maps(PARTIAL, OFF)).toEqual(maps(PARTIAL, OFF)));
  it('64. reason present for actionable finding', () => { for (const a of every) for (const l of ['es', 'en'] as const) expect(actionText(ACTION_COPY[l], a.tool, a.key).why).toBeTruthy(); });
  it('65. recommendation present', () => { for (const a of every) for (const l of ['es', 'en'] as const) expect(actionText(ACTION_COPY[l], a.tool, a.key).next).toBeTruthy(); });
  it('66. valid destination when available', () => { for (const a of every) expect((ACTION_DESTINATIONS as readonly string[])).toContain(a.destination); });
  it('67. unavailable action does not create dead CTA', () => {
    for (const a of every) if (a.supporting) expect(routeExists(a.supporting.route)).toBe(true);
    expect(src('src/features/action-layer/ActionDetail.tsx')).toContain('{item.supporting && (');
  });
  it('68. primary action distinguished from supporting tool', () => {
    const s = maps(without('services')).find((a) => a.key === 'services')!;
    expect(s.destination).toBe('/negocio');
    expect(s.supporting).toEqual({ tool: 'seo', route: '/herramientas/seo' });
    for (const a of every) if (a.supporting) expect(a.supporting.route).not.toBe(a.destination);
  });
  it('69. no unsupported review claim', () => {
    expect(ACTION_COPY.es.actions.reviews.why).toContain('LocalSEOHub no gestiona reseñas');
    expect(ACTION_COPY.en.actions.reviews.why).toContain("LocalSEOHub doesn't manage reviews");
  });
  it('70. no review management fabricated', () => {
    expect(layerSrc).not.toMatch(/reviewInbox|replyToReview|review_replies|monitor/i);
    expect(readdirSync(join(ROOT, 'src/features'))).not.toContain('reviews');
  });
  it('71. empty fixture safe', () => {
    expect(keys(maps(EMPTY, OFF))).toEqual(['identity']);
    expect(keys(geo(EMPTY, OFF))).toEqual(['identity']);
    expect(twin(EMPTY, OFF).length).toBe(5);
  });
  it('72. minimal fixture safe', () => expect(maps(MINIMAL, OFF).length).toBeLessThanOrEqual(5));
  it('73. partial fixture safe', () => expect(geo(PARTIAL, OFF).length).toBeLessThanOrEqual(5));
  it('74. full fixture safe', () => {
    expect(keys(twin(FULL))).toEqual(['keep_updated']);
    expect(keys(geo(FULL))).toEqual(['keep_fresh']);
  });
  it('75. GBP disconnected fixture', () => { for (const f of [maps, twin, geo]) expect(keys(f(FULL, OFF))).toContain('gbp_connect'); });
  it('76. GBP connected fixture', () => { for (const f of [maps, twin, geo]) expect(keys(f(FULL, ON))).not.toContain('gbp_connect'); });
  it('77. ES Action Layer copy', () => {
    expect(ACTION_COPY.es.nextLabel).toBe('Siguiente paso');
    expect(Object.keys(ACTION_COPY.es.actions)).toEqual(Object.keys(ACTION_COPY.en.actions));
  });
  it('78. EN Action Layer copy', () => {
    expect(ACTION_COPY.en.nextLabel).toBe('Next step');
    for (const k of Object.keys(ACTION_COPY.en.actions) as Array<keyof typeof ACTION_COPY.en.actions>) {
      expect(ACTION_COPY.en.actions[k].next).not.toBe(ACTION_COPY.es.actions[k].next);
    }
  });
  it('79. no cross-user data', () => expect(layerSrc).not.toMatch(/lib\/supabase|\.from\(|service_role|createClient/i));
  it('80. no new external API', () => expect(layerSrc).not.toMatch(/https?:\/\/|fetch\(|invoke\(/));
});

describe('A2.7.1 · Dependencies (code evidence)', () => {
  const seo = src('supabase/functions/seo-generator-v2/logic.ts');
  const advisor = src('supabase/functions/business-advisor-v2/logic.ts');
  const voice = src('supabase/functions/voice-simulator-v2/logic.ts');
  const consumers = (c: string) => (Object.keys(FIELD_CONSUMERS) as BusinessField[]).filter((f) => FIELD_CONSUMERS[f].includes(c as never));
  it('81. SEO dependency truthful', () => { for (const f of consumers('seo')) expect(seo).toContain(`row.${f}`); });
  it('82. Advisor dependency truthful', () => {
    expect(advisor).toContain("PROFILE_FIELDS = ['name', 'category', 'city', 'website', 'phone', 'schedule', 'target_audience']");
    expect(advisor).toContain('b.services');
    expect(advisor).toContain('b.primary_goal');
  });
  it('83. Voice dependency truthful', () => {
    expect(voice).toContain("TEXT_FIELDS = ['name', 'category', 'city', 'target_audience', 'website', 'phone', 'schedule']");
    expect(voice).toContain('business.services');
    expect(voice).toContain('business.primary_goal');
  });
  it('84. Maps dependency truthful', () => {
    const m = src('src/features/maps-scanner/engine.ts');
    for (const f of consumers('maps')) expect(m).toContain(`profile.${f}`);
    expect(m).not.toContain('target_audience');
  });
  it('85. GEO dependency truthful', () => {
    const g = src('src/features/geo-audit/engine.ts');
    for (const f of consumers('geo')) expect(g).toContain(`profile.${f}`);
    expect(g).not.toContain('primary_goal');
  });
  it('86. Twin dependency truthful', () => { const t = src('src/features/digital-twin/engine.ts'); for (const f of consumers('twin')) expect(t).toContain(`profile.${f}`); });
  it('87. dependency table has code evidence', () => {
    for (const p of Object.values(FIELD_EVIDENCE)) expect(() => src(p.split(' ')[0])).not.toThrow();
  });
});

describe('A2.7.1 · Regression', () => {
  const caps = src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith('_a248_voice_simulator_limits.sql'))}`);
  const RETIRED = [
    'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content', 'generate-business-audit',
    'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description', 'generate-geo-audit', 'generate-pitch',
    'generate-seo', 'generate-voice-script', 'scan-directories', 'simulate-campaign',
  ];
  it('88. all CTA routes exist', () => { for (const r of ACTION_DESTINATIONS) expect(routeExists(r), r).toBe(true); });
  it('89. no dead CTA', () => { for (const r of Object.values(SUPPORTING_ROUTES)) expect(routeExists(r)).toBe(true); });
  it('90. no unnecessary new route', () => {
    expect((app.match(/<Route path=/g) ?? []).length).toBe(27);
    expect(app).not.toContain('action-layer');
  });
  it('91. all seven tools remain available', () => expect(TOOLS.map((t) => t.id)).toEqual(['seo', 'maps', 'twin', 'radar', 'geo', 'advisor', 'voice']));
  it('92. all fourteen legacy functions remain retired', () => { for (const fn of RETIRED) expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410'); });
  it('93. AI global cap remains 80', () => expect(caps).toContain("WHEN 'global' THEN 80"));
  it('94. weekly remains 22', () => expect(caps).toContain("WHEN 'weekly-content' THEN 22"));
  it('95. improvement remains 18', () => expect(caps).toContain("WHEN 'business-improvement' THEN 18"));
  it('96. SEO remains 18', () => expect(caps).toContain("WHEN 'seo-generator' THEN 18"));
  it('97. Advisor remains 12', () => expect(caps).toContain("WHEN 'business-advisor' THEN 12"));
  it('98. Voice remains 10', () => expect(caps).toContain("WHEN 'voice-simulator' THEN 10"));
  it('99. Stripe untouched', () => expect(layerSrc).not.toMatch(/stripe/i));
  it('100. billing untouched', () => expect(layerSrc).not.toMatch(/billing|premium|entitlement/i));
  it('101. Google OAuth untouched', () => expect(layerSrc).not.toMatch(/oauth/i));
  it('102. GBP trust fix preserved', () => {
    const g = normalizeGbp({ status: 'connected', metadata: { name: 'Fake' }, last_sync_at: '2026-10-10T00:00:00Z' } as never);
    expect(g.data).toBeNull();
    expect(src('src/features/maps-scanner/engine.ts')).toContain('client-writable metadata/last_sync_at are ignored');
  });
  it('103. SMTP untouched', () => expect(layerSrc).not.toMatch(/smtp|email/i));
  it('104. auth flow untouched', () => expect(layerSrc).not.toMatch(/auth\.|signUp|signIn/));
  it('105. no business deleted', () => expect(layerSrc).not.toMatch(/delete/i));
  it('106. no connected source deleted', () => expect(layerSrc).not.toMatch(/connected_sources/));
  it('107. no AI usage reset', () => expect(layerSrc).not.toMatch(/ai_usage|reserve|ledger/i));
  it('108. no Maps diagnostic removed', () => {
    for (const id of ['maps-summary', 'maps-score', 'maps-coverage', 'maps-disclaimer', 'maps-sources', 'maps-priority', 'maps-check']) expect(mapsPage).toContain(`data-testid="${id}"`);
    expect(mapsPage).toContain('{t.outOfScopeTitle}');
  });
  it('109. no Twin diagnostic removed', () => {
    for (const id of ['twin-summary', 'twin-knowledge', 'twin-knowledge-note', 'twin-gaps', 'twin-gap', 'twin-sources', 'twin-context']) expect(twinPage).toContain(`data-testid="${id}"`);
    expect(twinPage).toContain('{t.unavailableTitle}');
  });
  it('110. no GEO diagnostic removed', () => {
    for (const id of ['geo-summary', 'geo-score', 'geo-coverage', 'geo-disclaimer', 'geo-criterion', 'geo-priority', 'geo-sources', 'geo-not-measured']) expect(geoPage).toContain(`data-testid="${id}"`);
  });
  it('111. no visual redesign', () => {
    for (const p of [mapsPage, twinPage, geoPage]) expect(p).toContain("const card = 'rounded-v2-xl border border-v2-border-light bg-white';");
    for (const f of ['maps-scanner/engine.ts', 'geo-audit/engine.ts', 'digital-twin/engine.ts']) expect(src(`src/features/${f}`)).not.toContain('action-layer');
  });
  it('112. existing priority copy preserved alongside the Action Layer', () => {
    expect(mapsPage).toContain('{t.priorities[p.id].title}');
    expect(twinPage).toContain('{t.gaps[p.id].title}');
    expect(TWIN_COPY.es.gaps.add_services.title).toBe('Define tus servicios principales');
  });
});
