import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { normalizeGbp, scan } from '../../maps-scanner/engine';
import { buildDigitalTwin } from '../../digital-twin/engine';
import { geoAudit } from '../../geo-audit/engine';
import { ACTION_DESTINATIONS, type ActionKey } from '../../action-layer/model';
import { canMarkDone } from '../../actions/engine';
import type { ActionSourceType, ActionStatus, BusinessAction } from '../../actions/types';
import { TOOLS } from '../../tools/catalog';
import { EMPTY, ERR, FULL, MINIMAL, OFF, ON, ON_REVIEWED, PARTIAL, without } from '../../action-layer/__tests__/fixtures';
import { KEY_ORDER, TODAY_MAX, eligibleActions, rankedTodayActions, todayActions } from '../../today-intelligence/model';
import { MISSION_KEYS, NEXT_END, PLAN_MAX, buildRoadmap, missionStatusFor } from '../model';
import { ROADMAP_COPY } from '../copy';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const app = src('src/App.tsx');
const planPage = src('src/app-v2/routes/PlanPage.tsx');
const rules = src('src/features/actions/rules.ts');
const modelSrc = src('src/features/roadmap/model.ts');
const card = src('src/features/roadmap/RoadmapCard.tsx');
const rmSrc = [modelSrc, src('src/features/roadmap/copy.ts'), card].join('\n');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const caps = src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith('_a248_voice_simulator_limits.sql'))}`);
const routeExists = (r: string) => app.includes(`path="${r}"`);
const allStrings = (o: unknown): string[] => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(allStrings) : [];
const copyText = [...allStrings(ROADMAP_COPY.es), ...allStrings(ROADMAP_COPY.en)].join('\n');

const PROFILES = [EMPTY, MINIMAL, PARTIAL, FULL];
const SNAPSHOTS = [OFF, ON, ERR, ON_REVIEWED];
const keys = (a: Array<{ key: ActionKey }>) => a.map((x) => x.key);

const mission = (ruleId: string, status: ActionStatus, sourceType: ActionSourceType = 'BUSINESS_PROFILE') => ({
  id: `${ruleId}-${status}`, businessId: 'b1', userId: 'u1', ruleId, status, sourceType,
  metadata: {}, startedAt: null, completedAt: null, dismissedAt: null,
}) as unknown as BusinessAction;

const NO_MISSIONS: BusinessAction[] = [];
const AVAILABLE = [mission('complete_business_services', 'PENDING')];
const STARTED = [mission('complete_business_services', 'IN_PROGRESS')];
const COMPLETED = [mission('add_business_website', 'COMPLETED')];
const DISMISSED = [mission('add_business_website', 'DISMISSED')];

const road = (p: object, g = ON, missions: BusinessAction[] = NO_MISSIONS, known = true) => buildRoadmap(p, g, known, missions);
const roadKeys = (p: object, g = ON, missions: BusinessAction[] = NO_MISSIONS, known = true) => keys(road(p, g, missions, known));
const itemFor = (k: ActionKey, p: object, g = ON, missions: BusinessAction[] = NO_MISSIONS) => road(p, g, missions).find((i) => i.key === k);

// Hashes of files A2.7.3 must not change, taken before the A2.7.3 work.
const FROZEN: Record<string, string> = {
  'src/features/maps-scanner/engine.ts': '1c18dfe0ee2ede9001e5aafe5ff19e4316d5b6600a818f26988b11d3333d380f',
  'src/features/digital-twin/engine.ts': '5ee583c39f7335c42faff29411be0c13c21c66ef08680fc0478445957fbf1cbd',
  'src/features/geo-audit/engine.ts': '410253d10b015657bc0e6c2872b31473e3dcce5054bdc29189fd211e2507fe46',
  'src/features/action-layer/model.ts': '38edfb9004c9a6bea8ca680d71d374eedfacc221fa4229cbbfe5efe4b4994075',
  'src/features/action-layer/copy.ts': '3dbbe24bcd674fd9f684bf6a2a5a40862ca1ca49ab4efcc86471ec035c54330d',
  'src/features/action-layer/ActionDetail.tsx': '1444e520b6bf497e5b710b13184837d59b67114efaf31ed4d00307a0a0ed8336',
  'src/features/today-intelligence/copy.ts': '064f5308a14b2274efbcd9008b9012ad2c93e83c1ceb8e49170879211653ec1f',
  'src/features/today-intelligence/TodayPriorities.tsx': 'c7e6555cc8bbbc516c92948a9ea6e0c6b7e862321fd5aff8c2fda7cfce7074ef',
  'src/app-v2/routes/TodayPage.tsx': '78cdf392ae270d805046632ecb5e0b4872134d8a6ff5f24bd91b0f0a9e8129da', // AUTHORIZED A3.5.4.4.1 TODAYPAGE INTEGRATION RE-PIN
  'src/features/dashboard/TodaysMissions.tsx': '22684ca84042aa83ef018bb7855e4493a6338eb2cc880359b5a10c011a91b79d',
  'src/features/actions/engine.ts': '2fa3eb2913328eb1a8e859f2e5db95d1e8158bd6cce135b277d3dc86284d3896',
  'src/features/actions/rules.ts': 'd32c4bb98a2819f7b09baabd692e97ef1ed878c8559f5d35a626cacd9b40654f',
  'src/features/actions/repository.ts': '0aff1a5a1c9fa7386d997443e816b3b16a77ac4530d96d1d3e8ec722691ee584',
  'src/features/actions/ActionsProvider.tsx': '3236e3e803c9b0d2ff37a91543272ff3756c697909039c206f89f93cb18369c9',
  'src/features/actions/types.ts': '660b06d7f51fe4334fff6f5408fc8a2843720b0fbcb1e254fa41a1082b68c068',
  'src/features/actions/ActionsContext.ts': 'f8cb0cb5b77f4f3eb0332a83422d93e95b4f8b71a00ae405875985d51e6db1a7',
  'src/App.tsx': '5f7353d212936b410ba7d72d009fdba06be9b199875a79ccb26a24945c169ad1', // A3.7.2.1A HARNESS RE-PIN: temporary hidden /internal/publications-validation
};
const frozen = (p: string) => expect(sha(p), p).toBe(FROZEN[p]);

describe('A2.7.3 · Preservation', () => {
  it('1. Today still shows at most 3', () => {
    expect(TODAY_MAX).toBe(3);
    for (const p of PROFILES) for (const g of SNAPSHOTS) expect(todayActions(p, g).length).toBeLessThanOrEqual(3);
  });
  it('2. Today ordering preserved', () => {
    expect(keys(todayActions(PARTIAL, OFF))).toEqual(['services', 'phone', 'website']);
    expect(keys(todayActions(EMPTY, OFF))).toEqual(['identity', 'activity', 'city']);
  });
  it('3. Today is the head of the eligible list', () => {
    for (const p of PROFILES) for (const g of SNAPSHOTS) for (const known of [true, false]) {
      expect(todayActions(p, g, known)).toEqual(eligibleActions(p, g, known).slice(0, 3));
    }
  });
  it('4. unknown Google state withholds Google-side actions', () => {
    for (const p of PROFILES) for (const a of eligibleActions(p, ERR, false)) expect(a.tier).toBeLessThan(2);
  });
  it('5. Maps engine unchanged', () => frozen('src/features/maps-scanner/engine.ts'));
  it('6. Twin engine unchanged', () => frozen('src/features/digital-twin/engine.ts'));
  it('7. GEO engine unchanged', () => frozen('src/features/geo-audit/engine.ts'));
  it('8. A2.7.1 Action Layer unchanged', () => { for (const f of ['model.ts', 'copy.ts', 'ActionDetail.tsx']) frozen(`src/features/action-layer/${f}`); });
  it('9. diagnostic scores unchanged', () => {
    expect(scan(PARTIAL, ON).score).toBe(66);
    expect(scan(FULL, ON).score).toBe(97);
    expect(buildDigitalTwin(PARTIAL, ON).knowledgePercent).toBe(49);
    expect(geoAudit(PARTIAL, ON).score).toBe(59);
  });
  it('10. A2.7.2 Today card, copy and page unchanged', () => {
    frozen('src/features/today-intelligence/copy.ts');
    frozen('src/features/today-intelligence/TodayPriorities.tsx');
    frozen('src/app-v2/routes/TodayPage.tsx');
  });
  it('11. TodaysMissions unchanged', () => frozen('src/features/dashboard/TodaysMissions.tsx'));
  it('12. mission engine, rules, persistence and provider unchanged', () => {
    for (const f of ['engine.ts', 'rules.ts', 'repository.ts', 'ActionsProvider.tsx', 'types.ts', 'ActionsContext.ts']) frozen(`src/features/actions/${f}`);
  });
  it('13. Plan start behaviour preserved', () => {
    expect(planPage).toContain('await start(a);');
    expect(planPage).toContain('navigate(actionTarget(a));');
  });
  it('14. Plan complete behaviour preserved', () => {
    expect(planPage).toContain('complete(a).catch(failWith(l.failComplete))');
    expect(planPage).toContain('canMarkDone(action) ?');
  });
  it('15. Plan dismiss behaviour preserved', () => expect(planPage).toContain('dismiss(a).catch(failWith(l.failDismiss))'));
  it('16. Plan mission sections preserved', () => {
    for (const s of ['<Section title={l.now}>', '<Section title={l.week}>', '<Section title={l.done}>', 'report.weeklyProgress']) expect(planPage).toContain(s);
  });
  it('17. Plan header, paywall and notice preserved', () => {
    for (const s of ['{l.title}', '<PaywallNotice surface="plan" />', '{l.notice}', '{l.allDone}']) expect(planPage).toContain(s);
  });
});

describe('A2.7.3 · Roadmap model', () => {
  it('18. roadmap has no database access', () => expect(rmSrc).not.toMatch(/lib\/supabase|createClient/));
  it('19. roadmap writes nothing', () => expect(rmSrc).not.toMatch(/insert|upsert|\.update\(|\.delete\(|localStorage|sessionStorage/));
  it('20. maximum 8 items', () => expect(PLAN_MAX).toBe(8));
  it('21. Next phase ends at position 6', () => expect(NEXT_END).toBe(6));
  it('22. roadmap consumes eligibleActions only', () => {
    expect(modelSrc).toContain('eligibleActions(profile, gbp, gbpKnown)');
    expect(rmSrc).not.toMatch(/\bscan\(|buildDigitalTwin|geoAudit|mapsActions|twinActions|geoActions|rankedTodayActions|mergeActions/);
  });
  it('23. no second ordering', () => expect(modelSrc).not.toMatch(/\.sort\(|compareToday/));
  it('24. no duplicated priority definitions', () => expect(rmSrc).not.toMatch(/TIER|KEY_ORDER|tier:|reach:/));
  it('25. no duplicated ActionKey mapping', () => expect(rmSrc).not.toMatch(/MAPS_KEYS|TWIN_KEYS|GEO_KEYS|ACTION_DESTINATIONS|FIELD_CONSUMERS/));
  it('26. never more than 8 for any fixture', () => {
    for (const p of PROFILES) for (const g of SNAPSHOTS) expect(road(p, g).length).toBeLessThanOrEqual(PLAN_MAX);
  });
  it('27. order equals the A2.7.2 ranking', () => {
    for (const p of PROFILES) for (const g of SNAPSHOTS) expect(roadKeys(p, g)).toEqual(keys(rankedTodayActions(p, g)).slice(0, PLAN_MAX));
  });
  it('28. deduplicated by canonical key', () => {
    for (const p of PROFILES) for (const g of SNAPSHOTS) expect(new Set(roadKeys(p, g)).size).toBe(road(p, g).length);
  });
  it('29. positions are sequential', () => {
    for (const p of PROFILES) road(p, OFF).forEach((i, idx) => expect(i.position).toBe(idx));
  });
  it('30. positions 1-3 are Now', () => road(MINIMAL, OFF).slice(0, 3).forEach((i) => expect(i.phase).toBe('now')));
  it('31. Now equals the Today Top 3', () => {
    for (const p of PROFILES) for (const g of SNAPSHOTS) for (const known of [true, false]) {
      expect(keys(road(p, g, NO_MISSIONS, known).filter((i) => i.phase === 'now'))).toEqual(keys(todayActions(p, g, known)));
    }
  });
  it('32. positions 4-6 are Next', () => road(MINIMAL, OFF).slice(3, 6).forEach((i) => expect(i.phase).toBe('next')));
  it('33. positions 7-8 are Later', () => {
    const later = road(MINIMAL, OFF).slice(6);
    expect(later).toHaveLength(2);
    later.forEach((i) => expect(i.phase).toBe('later'));
  });
  it('34. same input same output', () => expect(road(PARTIAL, ON, STARTED)).toEqual(road(PARTIAL, ON, STARTED)));
  it('35. no randomness', () => expect(rmSrc).not.toMatch(/Math\.random|Date\.now|new Date|crypto/));
  it('36. every item costs zero AI', () => { for (const p of PROFILES) for (const i of road(p, OFF)) expect(i.aiCost).toBe(0); });
  it('37. destination preserved from canonical action', () => {
    for (const p of PROFILES) for (const g of SNAPSHOTS) {
      const ranked = rankedTodayActions(p, g);
      for (const i of road(p, g)) expect(i.destination).toBe(ranked.find((a) => a.key === i.key)!.destination);
    }
  });
  it('38. supporting tool preserved', () => expect(itemFor('services', PARTIAL, OFF)!.supporting).toEqual({ tool: 'seo', route: '/herramientas/seo' }));
  it('39. source tools preserved', () => expect(itemFor('services', PARTIAL, OFF)!.sourceTools).toEqual(['maps', 'twin', 'geo']));
  it('40. complete business gets an honest empty roadmap', () => {
    expect(road(FULL, ON_REVIEWED)).toEqual([]);
    expect(card).toContain('data-testid="plan-roadmap-empty"');
  });
});

describe('A2.7.3 · Fixtures', () => {
  it('41. empty/off', () => expect(roadKeys(EMPTY, OFF)).toEqual(['identity', 'activity', 'city', 'services', 'audience']));
  it('42. minimal/off', () => expect(roadKeys(MINIMAL, OFF)).toEqual(['city', 'services', 'phone', 'audience', 'website', 'hours', 'goal', 'gbp_connect']));
  it('43. minimal/on', () => expect(roadKeys(MINIMAL, ON)).toEqual(['city', 'services', 'phone', 'website', 'audience', 'hours', 'goal', 'align_sources']));
  it('44. partial/off', () => expect(roadKeys(PARTIAL, OFF)).toEqual(['services', 'phone', 'website', 'hours', 'audience', 'goal', 'gbp_connect']));
  it('45. partial/on', () => expect(roadKeys(PARTIAL, ON)).toEqual(['services', 'phone', 'website', 'hours', 'audience', 'goal', 'align_sources', 'reviews']));
  it('46. full/off', () => expect(roadKeys(FULL, OFF)).toEqual(['gbp_connect']));
  it('47. full/on', () => expect(roadKeys(FULL, ON)).toEqual(['reviews']));
  it('48. unknown Google state never shows Connect Google', () => {
    for (const p of PROFILES) {
      expect(roadKeys(p, OFF, NO_MISSIONS, false)).not.toContain('gbp_connect');
      for (const i of road(p, ERR, NO_MISSIONS, false)) expect(i.tier).toBeLessThan(2);
    }
  });
  it('49. maintenance actions excluded', () => {
    for (const p of PROFILES) for (const g of SNAPSHOTS) {
      expect(roadKeys(p, g)).not.toContain('keep_fresh');
      expect(roadKeys(p, g)).not.toContain('keep_updated');
    }
  });
  it('50. reviews only on verified zero reviews', () => {
    expect(roadKeys(FULL, ON)).toContain('reviews');
    expect(roadKeys(FULL, ON_REVIEWED)).not.toContain('reviews');
    expect(roadKeys(FULL, OFF)).not.toContain('reviews');
    expect(roadKeys(FULL, ERR, NO_MISSIONS, false)).not.toContain('reviews');
  });
});

describe('A2.7.3 · Mission reconciliation', () => {
  it('51. exactly the high-confidence mappings', () => {
    expect(MISSION_KEYS).toEqual({
      add_business_phone: 'phone', add_business_website: 'website', add_business_schedule: 'hours',
      complete_business_services: 'services', define_target_audience: 'audience', set_primary_goal: 'goal',
      connect_google_business_profile: 'gbp_connect', gbp_get_first_reviews: 'reviews',
    });
  });
  it('52. ambiguous or unrelated rules are not mapped', () => {
    for (const r of [
      'complete_business_basics', 'gbp_add_phone', 'gbp_add_website', 'gbp_add_hours', 'connect_website_source',
      'fix_source_connection:google_business', 'request_customer_reviews', 'publish_call_to_action_post', 'optimize_services_keywords',
      'create_weekly_post', 'add_recent_photos', 'write_faq_answers', 'improve_service_description',
      'follow_up_reply_reviews', 'follow_up_check_post',
    ]) expect(MISSION_KEYS[r], r).toBeUndefined();
  });
  it('53. every mapped rule exists in the mission rules', () => {
    for (const id of Object.keys(MISSION_KEYS)) expect(rules.includes(`ruleId: '${id}'`) || rules.includes(`id: '${id}'`), id).toBe(true);
  });
  it('54. every mapped key is canonical', () => { for (const k of Object.values(MISSION_KEYS)) expect(KEY_ORDER).toContain(k); });
  it('55. one mission rule per canonical key', () => expect(new Set(Object.values(MISSION_KEYS)).size).toBe(Object.keys(MISSION_KEYS).length));
  it('56. completed mission does not hide a missing website', () => {
    expect(roadKeys(PARTIAL, OFF, COMPLETED)).toContain('website');
    expect(roadKeys(PARTIAL, OFF, COMPLETED)).toEqual(roadKeys(PARTIAL, OFF));
  });
  it('57. completed mission state is kept separate from the gap', () => expect(itemFor('website', PARTIAL, OFF, COMPLETED)!.mission).toBe('COMPLETED'));
  it('58. dismissed mission does not hide a missing website', () => {
    expect(roadKeys(PARTIAL, OFF, DISMISSED)).toEqual(roadKeys(PARTIAL, OFF));
    expect(itemFor('website', PARTIAL, OFF, DISMISSED)!.mission).toBe('DISMISSED');
  });
  it('59. started mission is reconciled', () => expect(itemFor('services', PARTIAL, OFF, STARTED)!.mission).toBe('IN_PROGRESS'));
  it('60. available mission is reported as pending', () => expect(itemFor('services', PARTIAL, OFF, AVAILABLE)!.mission).toBe('PENDING'));
  it('61. no mission means no mission state', () => { for (const i of road(PARTIAL, OFF)) expect(i.mission).toBeNull(); });
  it('62. resolved data removes the item even while the mission is started', () => {
    expect(roadKeys(FULL, ON, STARTED)).not.toContain('services');
    expect(roadKeys({ ...PARTIAL, services: ['Tapas', 'Raciones', 'Vinos'] }, OFF, STARTED)).not.toContain('services');
  });
  it('63. resolved data removes the item whatever the mission history', () => {
    for (const m of [COMPLETED, DISMISSED]) expect(roadKeys(FULL, ON, m)).not.toContain('website');
  });
  it('64. missions never add or reorder roadmap items', () => {
    const all = [...AVAILABLE, ...STARTED, ...COMPLETED, ...DISMISSED, mission('connect_google_business_profile', 'IN_PROGRESS', 'SOURCE_REQUIRED')];
    for (const p of PROFILES) for (const g of SNAPSHOTS) expect(roadKeys(p, g, all)).toEqual(roadKeys(p, g));
  });
  it('65. unmapped missions do not reconcile', () => {
    const basics = [mission('complete_business_basics', 'IN_PROGRESS')];
    expect(itemFor('city', MINIMAL, OFF, basics)!.mission).toBeNull();
    expect(itemFor('activity', EMPTY, OFF, basics)!.mission).toBeNull();
  });
  it('66. Google-side gap missions do not map to local data items', () => {
    const gbpAdd = [mission('gbp_add_website', 'IN_PROGRESS', 'VERIFIED_FINDING')];
    expect(itemFor('website', MINIMAL, ON, gbpAdd)!.mission).toBeNull();
    expect(itemFor('align_sources', MINIMAL, ON, gbpAdd)!.mission).toBeNull();
  });
  it('67. In progress badge only for started missions', () => {
    expect(card).toContain("const active = item.mission === 'IN_PROGRESS';");
    expect(card).toContain('{active && (');
    expect(card).toContain('data-testid="roadmap-in-progress"');
  });
  it('68. started mission CTA reads Continue but keeps its destination', () => {
    expect(card).toContain('{active ? r.continueCta : r.cta}');
    expect(card).toContain('to={item.destination}');
    expect(itemFor('services', PARTIAL, OFF, STARTED)!.destination).toBe('/negocio');
  });
  it('69. status precedence is fixed', () => {
    const statuses: ActionStatus[] = ['DISMISSED', 'COMPLETED', 'PENDING', 'IN_PROGRESS'];
    const ms = statuses.map((s) => mission('add_business_phone', s));
    expect(missionStatusFor('phone', ms)).toBe('IN_PROGRESS');
    expect(missionStatusFor('phone', [...ms].reverse())).toBe('IN_PROGRESS');
    expect(missionStatusFor('phone', ms.slice(0, 3))).toBe('PENDING');
    expect(missionStatusFor('phone', ms.slice(0, 2))).toBe('COMPLETED');
    expect(missionStatusFor('phone', ms.slice(0, 1))).toBe('DISMISSED');
    expect(missionStatusFor('phone', [])).toBeNull();
  });
  it('70. reconciliation calls no service', () => expect(modelSrc).not.toMatch(/fetch\(|invoke\(|rpc\(|await /));
});

describe('A2.7.3 · Truthfulness', () => {
  it('71. no Google ranking claim', () => expect(copyText).not.toMatch(/ranking|posicionamiento|posici[oó]n en google|position on google/i));
  it('72. no Maps ranking claim', () => expect(copyText).not.toMatch(/(primero|top|first) (en|in) (google )?maps/i));
  it('73. no ChatGPT claim', () => expect(copyText).not.toMatch(/chatgpt/i));
  it('74. no Gemini claim', () => expect(copyText).not.toMatch(/gemini/i));
  it('75. no Perplexity claim', () => expect(copyText).not.toMatch(/perplexity/i));
  it('76. no customer-loss claim', () => expect(copyText).not.toMatch(/pierdes|perdiendo|losing|lost customers/i));
  it('77. no fake urgency', () => expect(copyText).not.toMatch(/urgente|urgent|cr[ií]tico|critical|fix now|arr[eé]glalo ya/i));
  it('78. no sales or revenue promise', () => expect(copyText).not.toMatch(/ventas|ingresos|facturaci|revenue|sales/i));
  it('79. no competitor claim', () => expect(copyText).not.toMatch(/competidor|competitor/i));
  it('80. no guarantee', () => expect(copyText).not.toMatch(/garantiz|guarantee/i));
  it('81. no new progress percentage', () => expect(rmSrc).not.toMatch(/%|percent|progressbar|width:/i));
  it('82. roadmap does not read review data itself', () => expect(rmSrc).not.toMatch(/totalReviews|verified_profile/));
  it('83. no review management', () => expect(rmSrc).not.toMatch(/replyToReview|review_replies|manageReviews/i));
  it('84. no review inbox', () => expect(rmSrc).not.toMatch(/inbox|bandeja/i));
  it('85. no automatic review replies', () => expect(rmSrc).not.toMatch(/auto.?repl|respuesta autom/i));
  it('86. Plan treats unreadable sources as unknown', () => {
    expect(planPage).toContain(".catch(() => setSourcesState('failed'))");
    expect(planPage).toContain("buildRoadmap(currentBusiness, gbp, sourcesState === 'ready', actions)");
  });
});

describe('A2.7.3 · AI cost and limits', () => {
  it('87. no AI provider call', () => expect(rmSrc).not.toMatch(/openai|anthropic|gemini|invoke\(|fetch\(/i));
  it('88. no AI ledger consumption', () => expect(rmSrc).not.toMatch(/ai_usage|reserve|ledger|rpc\(/i));
  it('89. Plan adds no AI call', () => expect(planPage).not.toMatch(/functions\.invoke|openai|ai_usage/i));
  it('90. global cap unchanged', () => expect(caps).toContain("WHEN 'global' THEN 80"));
  it('91. weekly cap unchanged', () => expect(caps).toContain("WHEN 'weekly-content' THEN 22"));
  it('92. improvement cap unchanged', () => expect(caps).toContain("WHEN 'business-improvement' THEN 18"));
  it('93. SEO cap unchanged', () => expect(caps).toContain("WHEN 'seo-generator' THEN 18"));
  it('94. Advisor cap unchanged', () => expect(caps).toContain("WHEN 'business-advisor' THEN 12"));
  it('95. Voice cap unchanged', () => expect(caps).toContain("WHEN 'voice-simulator' THEN 10"));
});

describe('A2.7.3 · Platform regression', () => {
  const RETIRED = [
    'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content', 'generate-business-audit',
    'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description', 'generate-geo-audit', 'generate-pitch',
    'generate-seo', 'generate-voice-script', 'scan-directories', 'simulate-campaign',
  ];
  it('96. all nine tools remain (reviews added in A3.4.2, social in A3.5.4.3)', () => expect(TOOLS.map((t) => t.id)).toEqual(['seo', 'maps', 'twin', 'radar', 'geo', 'advisor', 'voice', 'reviews', 'social']));
  it('97. all 14 retired functions remain retired', () => { for (const fn of RETIRED) expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410'); });
  it('98. GBP trust fix used by Plan', () => {
    expect(normalizeGbp({ status: 'connected', metadata: { name: 'Fake' }, last_sync_at: '2026-10-10T00:00:00Z' } as never).data).toBeNull();
    expect(planPage).toContain("normalizeGbp(sources.find((s) => s.source_type === 'google_business') ?? null)");
  });
  it('99. no new GBP scopes', () => {
    const start = readFileSync(join(process.cwd(), 'supabase/functions/gbp-oauth-start/handler.ts'), 'utf8');
    expect(start.match(/https:\/\/www\.googleapis\.com\/auth\/[\w.]+/g)).toEqual(['https://www.googleapis.com/auth/business.manage']);
  });
  it('100. no Stripe change', () => { expect(rmSrc).not.toMatch(/stripe/i); expect(planPage).not.toMatch(/stripe/i); });
  it('101. no billing change', () => expect(rmSrc).not.toMatch(/billing|useBilling/i));
  it('102. no Premium change', () => expect(rmSrc).not.toMatch(/premium|entitlement/i));
  it('103. no Google OAuth change', () => expect(rmSrc).not.toMatch(/oauth/i));
  it('104. no SMTP change', () => expect(rmSrc).not.toMatch(/smtp|email/i));
  it('105. no auth flow change', () => { expect(rmSrc).not.toMatch(/auth\.|signIn|signUp|useAuth/); expect(planPage).not.toMatch(/signIn|signUp|useAuth/); });
  it('106. no cross-user data access', () => expect(rmSrc).not.toMatch(/user_id|supabase\.from|\.from\('/));
  it('107. Plan loads sources for the current business only', () => {
    expect(planPage).toContain('loadConnectedSources(businessId)');
    expect(planPage).toContain('const businessId = currentBusiness?.id;');
  });
  it('108. no service role in the frontend', () => { expect(rmSrc).not.toMatch(/service_role/i); expect(planPage).not.toMatch(/service_role/i); });
  it('109. no business deleted', () => expect(rmSrc).not.toMatch(/delete/i));
  it('110. no connected source deleted', () => expect(rmSrc).not.toMatch(/connected_sources/));
  it('111. no AI counter reset', () => expect(rmSrc).not.toMatch(/reset|counter/i));
  it('112. no new migration (beyond A3.4.1, the A3.4.2 review-reply ledger and the A3.4.2.2 GBP guard and the A3.5.1 Meta connection foundation)', () => {
    const migs = readdirSync(MIG_DIR).sort();
    expect(migs).toHaveLength(52); // A3.7.1 publications foundation; A3.7.2 proposals engine; A3.7.3.1 publication drafts
    expect(migs.filter((m) => !m.includes('_a371_') && !m.includes('_a372_') && !m.includes('_a3731_')).slice(-3)).toEqual([
      '20261022152358_a3512_meta_oauth_stuck_connection_recovery.sql',
      '20261022170333_a353_meta_read_layer.sql',
      '20261022170523_a353_meta_sync_claim_min_interval.sql',
    ]);
  });
  it('113. no new route (A3.4.2 adds only /herramientas/resenas; A3.5.1A adds 3 public legal routes; A3.5.1 adds /oauth/meta/callback) and every CTA is real', () => {
    frozen('src/App.tsx');
    expect((app.match(/<Route path=/g) ?? []).length).toBe(34); /* A3.7.2.1A HARNESS RE-PIN: temporary hidden /internal/publications-validation */
    for (const r of ACTION_DESTINATIONS) expect(routeExists(r)).toBe(true);
    for (const p of PROFILES) for (const g of SNAPSHOTS) for (const i of road(p, g)) {
      expect(routeExists(i.destination), i.destination).toBe(true);
      if (i.supporting) expect(routeExists(i.supporting.route)).toBe(true);
    }
    expect(routeExists('/herramientas')).toBe(true);
  });
});

describe('A2.7.3 · Copy and layout', () => {
  it('114. ES copy', () => {
    const es = ROADMAP_COPY.es;
    expect(es.heading).toBe('Tu hoja de ruta');
    expect([es.phases.now.title, es.phases.next.title, es.phases.later.title]).toEqual(['Ahora', 'Siguiente', 'Después']);
    expect([es.inProgress, es.continueCta, es.cta]).toEqual(['En curso', 'Continuar', 'Ir ahora']);
    expect(card).toContain('ROADMAP_COPY[lang]');
    expect(card).toContain('t.titles[item.key]');
    expect(card).toContain('ac.actions[item.key]');
  });
  it('115. EN copy matches ES structure', () => {
    const en = ROADMAP_COPY.en;
    expect(en.heading).toBe('Your roadmap');
    expect([en.phases.now.title, en.phases.next.title, en.phases.later.title]).toEqual(['Now', 'Next', 'Later']);
    expect([en.inProgress, en.continueCta, en.cta]).toEqual(['In progress', 'Continue', 'Go now']);
    expect(Object.keys(en)).toEqual(Object.keys(ROADMAP_COPY.es));
    expect(allStrings(en).length).toBe(allStrings(ROADMAP_COPY.es).length);
  });
  it('116. mobile-safe structure', () => {
    for (const c of ['flex-1 min-w-0', 'flex flex-wrap', 'shrink-0', 'gap-3 sm:gap-4']) expect(card).toContain(c);
    expect(card).toContain('className="v2-card"');
  });
  it('117. roadmap hidden until sources load', () => expect(planPage).toContain("if (!currentBusiness || sourcesState === 'loading') return null;"));
  it('118. honest empty state copy', () => {
    expect(ROADMAP_COPY.es.emptyTitle).toBe('Tu hoja de ruta no tiene mejoras prioritarias pendientes ahora');
    expect(card).toContain('{r.emptyTitle}');
  });
  it('119. data-gap missions still cannot be ticked off by hand', () => {
    const real: Record<string, ActionSourceType> = { connect_google_business_profile: 'SOURCE_REQUIRED', gbp_get_first_reviews: 'VERIFIED_FINDING' };
    for (const id of Object.keys(MISSION_KEYS)) expect(canMarkDone(mission(id, 'IN_PROGRESS', real[id] ?? 'BUSINESS_PROFILE')), id).toBe(false);
  });
  it('120. Now boundary reuses the Today limit', () => {
    expect(modelSrc).toContain('position < TODAY_MAX');
    expect(TODAY_MAX).toBe(3);
  });
  it('121. roadmap sits above the weekly missions', () => {
    const at = planPage.indexOf('<RoadmapCard items={roadmap} lang={lang} />');
    expect(at).toBeGreaterThan(planPage.indexOf('{l.notice}'));
    expect(at).toBeLessThan(planPage.indexOf('{today.length > 0 && ('));
  });
  it('122. supporting tool stays secondary', () => {
    expect(card).toMatch(/data-testid="roadmap-supporting" className="inline-flex items-center gap-0\.5 font-medium text-v2-text-secondary/);
    expect(card).toContain('className={first ? primaryBtn : secondaryBtn}');
  });
  it('123. each single missing field appears in the roadmap', () => {
    const cases: Array<[keyof typeof FULL, ActionKey]> = [
      ['services', 'services'], ['phone', 'phone'], ['website', 'website'], ['schedule', 'hours'],
      ['target_audience', 'audience'], ['primary_goal', 'goal'],
    ];
    for (const [field, key] of cases) {
      expect(roadKeys(without(field), ON_REVIEWED), field).toContain(key);
      expect(roadKeys(FULL, ON_REVIEWED)).not.toContain(key);
    }
  });
});
