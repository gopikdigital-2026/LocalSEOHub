import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { normalizeGbp, scan } from '../../maps-scanner/engine';
import { buildDigitalTwin } from '../../digital-twin/engine';
import { geoAudit } from '../../geo-audit/engine';
import { ACTION_DESTINATIONS, geoActions, mapsActions, twinActions, type ActionItem, type ActionKey } from '../../action-layer/model';
import { TOOLS } from '../../tools/catalog';
import { EMPTY, ERR, FULL, MINIMAL, OFF, ON, ON_REVIEWED, PARTIAL, without } from '../../action-layer/__tests__/fixtures';
import { KEY_ORDER, TODAY_MAX, compareToday, mergeActions, rankedTodayActions, todayActions } from '../model';
import { TODAY_COPY } from '../copy';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const app = src('src/App.tsx');
const todayPage = src('src/app-v2/routes/TodayPage.tsx');
const tiSrc = ['model.ts', 'copy.ts', 'TodayPriorities.tsx'].map((f) => src(`src/features/today-intelligence/${f}`)).join('\n');
const component = src('src/features/today-intelligence/TodayPriorities.tsx');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const caps = src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith('_a248_voice_simulator_limits.sql'))}`);
const routeExists = (r: string) => app.includes(`path="${r}"`);
const allStrings = (o: unknown): string[] => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(allStrings) : [];
const todayText = [...allStrings(TODAY_COPY.es), ...allStrings(TODAY_COPY.en)].join('\n');

const keys = (a: Array<{ key: ActionKey }>) => a.map((x) => x.key);
const top = (p: object, g = ON) => keys(todayActions(p, g));
const item = (tool: ActionItem['tool'], key: ActionKey, destination = '/negocio'): ActionItem =>
  ({ id: key, tool, key, destination, supporting: null, usedBy: [], aiCost: 0 });

// Hashes of frozen files taken at the A2.7.2 baseline, before any A2.7.2 change.
const FROZEN: Record<string, string> = {
  'src/features/maps-scanner/engine.ts': '1c18dfe0ee2ede9001e5aafe5ff19e4316d5b6600a818f26988b11d3333d380f',
  'src/features/digital-twin/engine.ts': '5ee583c39f7335c42faff29411be0c13c21c66ef08680fc0478445957fbf1cbd',
  'src/features/geo-audit/engine.ts': '410253d10b015657bc0e6c2872b31473e3dcce5054bdc29189fd211e2507fe46',
  'src/features/action-layer/model.ts': '38edfb9004c9a6bea8ca680d71d374eedfacc221fa4229cbbfe5efe4b4994075',
  'src/features/action-layer/copy.ts': '3dbbe24bcd674fd9f684bf6a2a5a40862ca1ca49ab4efcc86471ec035c54330d',
  'src/features/action-layer/ActionDetail.tsx': '1444e520b6bf497e5b710b13184837d59b67114efaf31ed4d00307a0a0ed8336',
  'src/App.tsx': '36074bedfe7a79ecb92e47ec795abd1b9d263f3a37a1f8422146206f86f49078', // A3.5.4.3: /herramientas/social
  'src/features/dashboard/TodaysMissions.tsx': '22684ca84042aa83ef018bb7855e4493a6338eb2cc880359b5a10c011a91b79d',
};
const frozen = (p: string) => expect(sha(p), p).toBe(FROZEN[p]);

const RAW = (p: object, g = ON) => [
  mapsActions(scan(p, g).priorities), twinActions(buildDigitalTwin(p, g).priorities), geoActions(geoAudit(p, g).priorities),
];

describe('A2.7.2 · Orchestration', () => {
  it('1. Maps actions can feed Today', () => expect(keys(mergeActions([[item('maps', 'phone')]]))).toEqual(['phone']));
  it('2. Twin actions can feed Today', () => expect(keys(mergeActions([[item('twin', 'goal', '/negocio/objetivos')]]))).toEqual(['goal']));
  it('3. GEO actions can feed Today', () => expect(keys(mergeActions([[item('geo', 'audience')]]))).toEqual(['audience']));
  it('4. canonical duplicate keys merge', () => {
    const merged = mergeActions(RAW(PARTIAL, OFF));
    expect(new Set(keys(merged)).size).toBe(merged.length);
  });
  it('5. source tools aggregate', () => {
    expect(rankedTodayActions(PARTIAL, OFF).find((a) => a.key === 'services')!.sourceTools).toEqual(['maps', 'twin', 'geo']);
  });
  it('6. three services actions become one', () => {
    const m = mergeActions([[item('maps', 'services')], [item('twin', 'services')], [item('geo', 'services')]]);
    expect(m).toHaveLength(1);
    expect(m[0].sourceTools).toEqual(['maps', 'twin', 'geo']);
  });
  it('7. two phone actions become one', () => expect(mergeActions([[item('maps', 'phone')], [item('twin', 'phone')]])).toHaveLength(1));
  it('8. two website actions become one', () => expect(mergeActions([[item('maps', 'website')], [item('geo', 'website')]])).toHaveLength(1));
  it('9. different actions do not merge', () => {
    expect(keys(mergeActions([[item('maps', 'phone'), item('maps', 'align_phone')]]))).toEqual(['phone', 'align_phone']);
  });
  it('10. output maximum is 3', () => {
    expect(TODAY_MAX).toBe(3);
    for (const p of [EMPTY, MINIMAL, PARTIAL, FULL]) for (const g of [OFF, ON, ERR]) expect(todayActions(p, g).length).toBeLessThanOrEqual(3);
  });
  it('11. deterministic ordering', () => expect(top(PARTIAL, OFF)).toEqual(['services', 'phone', 'website']));
  it('12. same input same output', () => expect(todayActions(MINIMAL, OFF)).toEqual(todayActions(MINIMAL, OFF)));
  it('13. no randomness', () => expect(tiSrc).not.toMatch(/Math\.random|Date\.now|new Date|crypto/));
  it('14. stable tie-breaking', () => {
    const a = mergeActions([[item('maps', 'website')], [item('twin', 'phone')]]);
    const b = mergeActions([[item('twin', 'phone')], [item('maps', 'website')]]);
    expect(keys(a)).toEqual(['phone', 'website']);
    expect(keys(b)).toEqual(keys(a));
    expect(new Set(KEY_ORDER).size).toBe(KEY_ORDER.length);
  });
  it('15. foundational actions rank correctly', () => {
    expect(keys(mergeActions([[item('maps', 'reviews', '/herramientas/advisor'), item('maps', 'gbp_connect', '/fuentes'), item('maps', 'services'), item('maps', 'city')]])))
      .toEqual(['city', 'services', 'gbp_connect', 'reviews']);
  });
  it('16. existing action priority respected', () => {
    expect(keys(mergeActions([[item('maps', 'hours'), item('maps', 'phone')]]))).toEqual(['hours', 'phone']);
  });
  it('17. multi-tool evidence considered', () => {
    expect(keys(mergeActions([[item('maps', 'hours'), item('maps', 'phone')], [item('twin', 'phone')]]))).toEqual(['phone', 'hours']);
  });
  it('18. unavailable action handled safely', () => {
    expect(mergeActions([[item('maps', 'phone', '/no-existe')]])).toEqual([]);
    expect(top(FULL, OFF)).toEqual(['gbp_connect']);
    expect(keys(todayActions(MINIMAL, OFF, false))).not.toContain('gbp_connect');
  });
  it('19. real CTA preserved', () => {
    for (const a of rankedTodayActions(MINIMAL, OFF)) {
      const raw = RAW(MINIMAL, OFF).flat().find((r) => r.key === a.key)!;
      expect(a.destination).toBe(raw.destination);
    }
  });
  it('20. no dead CTA', () => {
    for (const p of [EMPTY, MINIMAL, PARTIAL, FULL]) for (const g of [OFF, ON, ERR]) for (const a of rankedTodayActions(p, g)) {
      expect(routeExists(a.destination), a.destination).toBe(true);
      if (a.supporting) expect(routeExists(a.supporting.route)).toBe(true);
    }
  });
});

describe('A2.7.2 · Completion and promotion', () => {
  const ranked = (p: object) => keys(rankedTodayActions(p, ON));
  it('21. completing services removes services', () => { expect(ranked(without('services'))).toContain('services'); expect(ranked(FULL)).not.toContain('services'); });
  it('22. completing phone removes phone', () => { expect(ranked(without('phone'))).toContain('phone'); expect(ranked(FULL)).not.toContain('phone'); });
  it('23. completing website removes website', () => { expect(ranked(without('website'))).toContain('website'); expect(ranked(FULL)).not.toContain('website'); });
  it('24. completing hours removes hours', () => { expect(ranked(without('schedule'))).toContain('hours'); expect(ranked(FULL)).not.toContain('hours'); });
  it('25. completing audience removes audience', () => { expect(ranked(without('target_audience'))).toContain('audience'); expect(ranked(FULL)).not.toContain('audience'); });
  it('26. completing goal removes goal', () => { expect(ranked(without('primary_goal'))).toContain('goal'); expect(ranked(FULL)).not.toContain('goal'); });
  it('27. next eligible action is promoted', () => {
    expect(top(PARTIAL, OFF)).toEqual(['services', 'phone', 'website']);
    expect(top({ ...PARTIAL, services: ['Tapas', 'Raciones', 'Vinos'] }, OFF)).toEqual(['phone', 'website', 'hours']);
  });
  it('28. no manual completion flag', () => expect(tiSrc).not.toMatch(/done\s*[:=]\s*true|completed\s*[:=]|localStorage|sessionStorage/));
  it('29. no Today persistence table', () => expect(tiSrc).not.toMatch(/\.from\(|insert|upsert|today_actions/));
  it('30. no new migration (beyond A3.4.1, the A3.4.2 review-reply ledger and the A3.4.2.2 GBP guard and the A3.5.1 Meta connection foundation)', () => {
    expect(readdirSync(MIG_DIR)).toHaveLength(50); // A3.7.1 adds the publications data/storage foundation
    const migs = readdirSync(MIG_DIR).sort();
    expect(migs.filter((m) => !m.includes('_a371_')).slice(-3)).toEqual([
      '20261022152358_a3512_meta_oauth_stuck_connection_recovery.sql',
      '20261022170333_a353_meta_read_layer.sql',
      '20261022170523_a353_meta_sync_claim_min_interval.sql',
    ]);
  });
});

describe('A2.7.2 · Fixtures', () => {
  it('31. empty/off', () => expect(top(EMPTY, OFF)).toEqual(['identity', 'activity', 'city']));
  it('32. empty/on', () => expect(top(EMPTY, ON)).toEqual(['identity', 'activity', 'city']));
  it('33. minimal/off', () => expect(top(MINIMAL, OFF)).toEqual(['city', 'services', 'phone']));
  it('34. minimal/on', () => expect(top(MINIMAL, ON)).toEqual(['city', 'services', 'phone']));
  it('35. partial/off', () => expect(top(PARTIAL, OFF)).toEqual(['services', 'phone', 'website']));
  it('36. partial/on', () => expect(top(PARTIAL, ON)).toEqual(['services', 'phone', 'website']));
  it('37. full/off', () => expect(top(FULL, OFF)).toEqual(['gbp_connect']));
  it('38. full/on', () => expect(top(FULL, ON)).toEqual(['reviews']));
  it('39. empty business max 3', () => {
    expect(rankedTodayActions(EMPTY, OFF).length).toBe(5);
    expect(todayActions(EMPTY, OFF)).toHaveLength(3);
  });
  it('40. full business does not fabricate deficiency', () => {
    expect(todayActions(FULL, ON_REVIEWED)).toEqual([]);
    expect(component).toContain('{t.emptyTitle}');
    expect(TODAY_COPY.es.emptyTitle).toBe('No tienes acciones prioritarias pendientes ahora');
  });
  it('41. GBP disconnected may expose connection action', () => expect(top(FULL, OFF)).toContain('gbp_connect'));
  it('42. GBP connected removes connection gap', () => { for (const p of [MINIMAL, PARTIAL, FULL]) expect(keys(rankedTodayActions(p, ON))).not.toContain('gbp_connect'); });
  it('43. No comprobado not negative', () => {
    expect(keys(rankedTodayActions(FULL, OFF))).toEqual(['gbp_connect']);
    expect(keys(rankedTodayActions(FULL, OFF))).not.toContain('reviews');
  });
});

describe('A2.7.2 · Truthfulness', () => {
  it('44. no Google ranking claim', () => expect(todayText).not.toMatch(/ranking|posicionamiento|posici[oó]n en google|position on google/i));
  it('45. no Maps ranking claim', () => expect(todayText).not.toMatch(/(primero|top|first) (en|in) (google )?maps/i));
  it('46. no ChatGPT ranking claim', () => expect(todayText).not.toMatch(/chatgpt/i));
  it('47. no Gemini ranking claim', () => expect(todayText).not.toMatch(/gemini/i));
  it('48. no Perplexity ranking claim', () => expect(todayText).not.toMatch(/perplexity/i));
  it('49. no customer-loss claim', () => expect(todayText).not.toMatch(/pierdes|perdiendo|losing|lost customers|competidores te|competitors are/i));
  it('50. no fake urgency', () => expect(todayText).not.toMatch(/urgente|urgent|cr[ií]tico|critical|fix now|arr[eé]glalo ya/i));
});

describe('A2.7.2 · AI cost and limits', () => {
  it('51. AI cost zero', () => { for (const a of rankedTodayActions(EMPTY, OFF)) expect(a.aiCost).toBe(0); });
  it('52. no AI provider call', () => expect(tiSrc).not.toMatch(/openai|anthropic|gemini|invoke\(|fetch\(/i));
  it('53. no AI ledger consumption', () => expect(tiSrc).not.toMatch(/ai_usage|reserve|ledger|rpc\(/i));
  it('54. global cap unchanged', () => expect(caps).toContain("WHEN 'global' THEN 80"));
  it('55. weekly cap unchanged', () => expect(caps).toContain("WHEN 'weekly-content' THEN 22"));
  it('56. improvement cap unchanged', () => expect(caps).toContain("WHEN 'business-improvement' THEN 18"));
  it('57. SEO cap unchanged', () => expect(caps).toContain("WHEN 'seo-generator' THEN 18"));
  it('58. Advisor cap unchanged', () => expect(caps).toContain("WHEN 'business-advisor' THEN 12"));
  it('59. Voice cap unchanged', () => expect(caps).toContain("WHEN 'voice-simulator' THEN 10"));
});

describe('A2.7.2 · Frozen diagnostics', () => {
  it('60. Maps engine unchanged', () => frozen('src/features/maps-scanner/engine.ts'));
  it('61. Twin engine unchanged', () => frozen('src/features/digital-twin/engine.ts'));
  it('62. GEO engine unchanged', () => frozen('src/features/geo-audit/engine.ts'));
  it('63. Maps score regression', () => { expect(scan(PARTIAL, ON).score).toBe(66); expect(scan(FULL, ON).score).toBe(97); });
  it('64. Maps coverage regression', () => { expect(scan(PARTIAL, OFF).coverage).toBe(50); expect(scan(FULL, ON).coverage).toBe(100); });
  it('65. Twin knowledge regression', () => { expect(buildDigitalTwin(PARTIAL, ON).knowledgePercent).toBe(49); expect(buildDigitalTwin(FULL, OFF).knowledgePercent).toBe(90); });
  it('66. GEO score regression', () => { expect(geoAudit(PARTIAL, ON).score).toBe(59); expect(geoAudit(MINIMAL, OFF).score).toBe(27); });
  it('67. GEO coverage regression', () => { expect(geoAudit(FULL, ON).coverage).toBe(79); expect(geoAudit(EMPTY, ON).coverage).toBe(71); });
  it('68. A2.7.1 Action Layer preserved', () => {
    for (const f of ['model.ts', 'copy.ts', 'ActionDetail.tsx']) frozen(`src/features/action-layer/${f}`);
    expect(tiSrc).not.toMatch(/MAPS_KEYS|TWIN_KEYS|GEO_KEYS/);
  });
});

describe('A2.7.2 · Platform regression', () => {
  const RETIRED = [
    'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content', 'generate-business-audit',
    'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description', 'generate-geo-audit', 'generate-pitch',
    'generate-seo', 'generate-voice-script', 'scan-directories', 'simulate-campaign',
  ];
  it('69. all nine tools remain available (reviews added in A3.4.2, social in A3.5.4.3)', () => expect(TOOLS.map((t) => t.id)).toEqual(['seo', 'maps', 'twin', 'radar', 'geo', 'advisor', 'voice', 'reviews', 'social']));
  it('70. all 14 retired functions remain retired', () => { for (const fn of RETIRED) expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410'); });
  it('71. GBP trust fix preserved', () => {
    // Client-writable metadata must never count as verified Google data (A2.5).
    expect(normalizeGbp({ status: 'connected', metadata: { name: 'Fake' }, last_sync_at: '2026-10-10T00:00:00Z' } as never).data).toBeNull();
    expect(todayPage).toContain("normalizeGbp(connectedSources.find((s) => s.source_type === 'google_business') ?? null)");
  });
  it('72. no new GBP scopes', () => {
    const start = readFileSync(join(process.cwd(), 'supabase/functions/gbp-oauth-start/handler.ts'), 'utf8');
    expect(start.match(/https:\/\/www\.googleapis\.com\/auth\/[\w.]+/g)).toEqual(['https://www.googleapis.com/auth/business.manage']);
  });
  it('73. no review management', () => expect(tiSrc).not.toMatch(/replyToReview|review_replies|manageReviews/i));
  it('74. no review inbox', () => expect(tiSrc).not.toMatch(/inbox|bandeja/i));
  it('75. no automatic review replies', () => expect(tiSrc).not.toMatch(/auto.?repl|respuesta autom/i));
  it('76. no Stripe modification', () => expect(tiSrc).not.toMatch(/stripe/i));
  it('77. no billing modification', () => expect(tiSrc).not.toMatch(/billing|useBilling/i));
  it('78. no Premium modification', () => expect(tiSrc).not.toMatch(/premium|entitlement/i));
  it('79. no Google OAuth modification', () => expect(tiSrc).not.toMatch(/oauth/i));
  it('80. no SMTP modification', () => expect(tiSrc).not.toMatch(/smtp|email/i));
  it('81. no Auth flow modification', () => expect(tiSrc).not.toMatch(/auth\.|signIn|signUp|useAuth/));
  it('82. no cross-user data', () => {
    expect(tiSrc).not.toMatch(/lib\/supabase|createClient/);
    expect(todayPage).toContain('loadConnectedSources(businessId)');
  });
  it('83. no service-role frontend use', () => { expect(tiSrc).not.toMatch(/service_role|SERVICE_ROLE/); expect(todayPage).not.toMatch(/service_role/i); });
  it('84. no business deleted', () => expect(tiSrc).not.toMatch(/delete/i));
  it('85. no connected source deleted', () => expect(tiSrc).not.toMatch(/connected_sources/));
  it('86. no AI counter reset', () => expect(tiSrc).not.toMatch(/reset|counter/i));
});

describe('A2.7.2 · Copy, layout and scope', () => {
  it('87. ES copy exists', () => {
    expect(TODAY_COPY.es.heading).toBe('Tus prioridades ahora');
    expect(TODAY_COPY.es.startHere).toBe('Empieza por aquí');
  });
  it('88. EN copy exists', () => {
    expect(TODAY_COPY.en.heading).toBe('Your priorities right now');
    expect(Object.keys(TODAY_COPY.en.titles)).toEqual(Object.keys(TODAY_COPY.es.titles));
    for (const k of KEY_ORDER) expect(TODAY_COPY.en.titles[k]).not.toBe(TODAY_COPY.es.titles[k]);
    expect(component).toContain('TODAY_COPY[lang]');
  });
  it('89. existing Today content preserved', () => {
    for (const c of ['<TodaysMissions', '<BusinessHealthCard', '<WeeklyContentCard', '<PreparedRepliesCard', '<AIInsights', '<CompetitorAlerts', '<GrowthTimeline', '<QuickActions', '<BusinessSnapshot', '<PlanCard', '<TrialStartCard', '<DashboardHeader']) {
      expect(todayPage).toContain(c);
    }
    frozen('src/features/dashboard/TodaysMissions.tsx');
  });
  // Plan integration was authorised in A2.7.3; A2.7.2 itself only guaranteed Plan did not consume Today directly.
  it('90. no Plan implementation inside A2.7.2', () => { expect(src('src/app-v2/routes/PlanPage.tsx')).not.toContain('today-intelligence'); expect(tiSrc).not.toContain('PlanPage'); });
  it('91. no new route (A3.4.2 adds only /herramientas/resenas; A3.5.1A adds 3 public legal routes; A3.5.1 adds /oauth/meta/callback; A3.5.4.3 adds /herramientas/social)', () => { frozen('src/App.tsx'); expect((app.match(/<Route path=/g) ?? []).length).toBe(33); });
  it('92. Today CTA routes valid', () => {
    for (const r of ACTION_DESTINATIONS) expect(routeExists(r)).toBe(true);
    expect(routeExists('/herramientas')).toBe(true);
    expect(component).toContain('to={a.destination}');
  });
  it('93. supporting CTA remains secondary', () => {
    expect(component).toMatch(/data-testid="today-priority-supporting" className="inline-flex items-center gap-0\.5 font-medium text-v2-text-secondary/);
    expect(todayActions(PARTIAL, OFF)[0].supporting).toEqual({ tool: 'seo', route: '/herramientas/seo' });
  });
  it('94. source-of-truth CTA remains primary', () => {
    expect(todayActions(PARTIAL, OFF)[0].destination).toBe('/negocio');
    expect(component).toContain('className={primary ? primaryBtn : secondaryBtn}');
  });
  it('95. mobile-safe structure', () => {
    expect(component).toContain('flex-1 min-w-0');
    expect(component).toContain('flex flex-wrap');
    expect(component).toContain('gap-3 sm:gap-4');
  });
  it('96. no interface redesign', () => {
    expect(component).toContain('className="v2-card"');
    expect(todayPage).toContain('<div className="space-y-6 sm:space-y-8 pb-8 max-w-5xl">');
    expect(todayPage).toContain('{priorities && <TodayPriorities actions={priorities} lang={lang} />}');
  });
  it('97. Today reuses A2.7.1 why/next copy', () => {
    expect(component).toContain('ac.actions[a.key]');
    expect(tiSrc).not.toMatch(/why:|next:/);
  });
  it('98. multi-source label only when more than one tool', () => expect(component).toContain('a.sourceTools.length > 1'));
  it('99. section hidden until sources resolve', () => expect(todayPage).toContain("sourcesState === 'loading'"));
  it('100. ordering comparator is total', () => {
    const r = rankedTodayActions(EMPTY, OFF);
    for (let i = 1; i < r.length; i++) expect(compareToday(r[i - 1], r[i])).toBeLessThan(0);
  });
  it('101. section only renders for the signed-in business', () => expect(todayPage).toContain('if (!currentBusiness || sourcesState'));
});
