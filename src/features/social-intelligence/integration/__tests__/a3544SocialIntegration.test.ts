import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { analyseSocialData } from '../../ui/viewModel';
import { buildSocialViewModel } from '../../ui/viewModel';
import type { SocialData } from '../../ui/repository';
import type { SocialFindingsReport } from '../../findings/types';
import { RECOMMENDATION_CATALOG } from '../../findings/policy';
import { SOCIAL_DESTINATION, SOCIAL_HOME, eligibleSocialItems, projectSocialIntegration } from '../projection';
import { SOCIAL_INTEGRATION_COPY } from '../copy';

const ROOT = resolve(__dirname, '../../../../../');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const INT_DIR = 'src/features/social-intelligence/integration';
const intSrc = readdirSync(join(ROOT, INT_DIR)).filter((f) => /\.tsx?$/.test(f)).map((f) => read(`${INT_DIR}/${f}`)).join('\n');
const card = read(`${INT_DIR}/SocialIntegrationCard.tsx`);
const today = read('src/app-v2/routes/TodayPage.tsx');
const plan = read('src/app-v2/routes/PlanPage.tsx');

const NOW = '2026-05-10T12:00:00.000Z';
const SYNCED = '2026-05-10T10:00:00.000Z';
type Snapshot = SocialData['snapshot'];
type Item = Snapshot['items'][number];

const okSync = (platform: 'facebook' | 'instagram', over: Partial<Snapshot['syncStates'][number]> = {}) => ({
  platform, status: 'ok', error_code: null, item_count: 3, pages_fetched: 1, last_success_at: SYNCED, ...over,
});
const post = (platform: 'facebook' | 'instagram', id: string, published: string, text: string | null, metrics: number | null = null): Item => ({
  platform, external_id: id, content_type: platform === 'facebook' ? 'photo' : 'image', text_content: text, published_at: published,
  reaction_count: metrics, comment_count: metrics,
});

// Shape of the validated real snapshot: FB 3 posts (2 without text, NULL metrics), IG 1 post (zero metrics).
const REAL_ITEMS: Item[] = [
  post('facebook', 'f1', '2026-05-02T09:00:00.000Z', 'Nuevo menú'),
  post('facebook', 'f2', '2026-04-20T09:00:00.000Z', null),
  post('facebook', 'f3', '2026-04-10T09:00:00.000Z', '   '),
  post('instagram', 'i1', '2026-05-02T09:00:00.000Z', 'Hola', 0),
];

function data(over: Partial<Snapshot> = {}): SocialData {
  return {
    snapshot: {
      connection: { status: 'connected', instagram_status: 'connected' },
      syncStates: [okSync('facebook'), okSync('instagram', { item_count: 1 })],
      items: REAL_ITEMS,
      ...over,
    },
    account: { pageName: 'Café Central', instagramUsername: 'cafecentral' },
    permalinks: { 'facebook:f2': 'https://www.facebook.com/123/posts/2' },
  };
}

const report = (d: SocialData): SocialFindingsReport => analyseSocialData(d, NOW).findings;
const project = (d: SocialData, lang: 'es' | 'en' = 'es') => projectSocialIntegration(report(d), lang);
const all = (d: SocialData) => eligibleSocialItems(report(d), 'es');
const topics = (d: SocialData) => report(d).findings.map((f) => f.topic);

const OLD = '2026-03-01T09:00:00.000Z';
const STALE_SYNC = '2026-04-01T00:00:00.000Z';
const fixtures = {
  real: data(),
  caption: data({ items: [post('facebook', 'f1', '2026-05-02T09:00:00.000Z', 'Hola'), post('instagram', 'i1', '2026-05-02T09:00:00.000Z', null, 0), post('instagram', 'i2', '2026-04-28T09:00:00.000Z', null, 0)] }),
  reauth: data({ connection: { status: 'reauth_required', instagram_status: 'connected' } }),
  permission: data({ syncStates: [okSync('facebook', { status: 'permission_unavailable' }), okSync('instagram', { item_count: 1 })] }),
  rateLimited: data({ syncStates: [okSync('facebook', { status: 'rate_limited' }), okSync('instagram', { item_count: 1 })] }),
  longInactivity: data({ items: [post('facebook', 'f1', OLD, 'Hola'), post('facebook', 'f2', '2026-02-20T09:00:00.000Z', 'Adiós'), post('instagram', 'i1', OLD, 'Hola', 0)] }),
  noContent: data({ syncStates: [okSync('facebook', { status: 'empty', item_count: 0 }), okSync('instagram', { item_count: 1 })], items: [post('instagram', 'i1', '2026-05-02T09:00:00.000Z', 'Hola', 0)] }),
  stale: data({ syncStates: [okSync('facebook', { last_success_at: STALE_SYNC }), okSync('instagram', { item_count: 1, last_success_at: STALE_SYNC })] }),
  staleInactive: data({
    syncStates: [okSync('facebook', { last_success_at: STALE_SYNC }), okSync('instagram', { last_success_at: STALE_SYNC })],
    items: [post('facebook', 'f1', OLD, null), post('instagram', 'i1', OLD, 'Hola', 0)],
  }),
  notConnected: data({ connection: null, syncStates: [], items: [] }),
};

describe('A3.5.4.4.1 Social Integration Projection — eligibility', () => {
  it('1. TEXT_MISSING → Hoy, with real-data wording and Facebook attribution', () => {
    const { hoy } = project(fixtures.real);
    expect(hoy).toMatchObject({
      consumer: 'hoy', platform: 'facebook', recommendationKey: 'REVIEW_POSTS_WITHOUT_TEXT', findingKey: 'FACEBOOK_TEXT_MISSING',
      message: 'Revisa 2 publicaciones de Facebook sin texto', sourceLabel: 'Basado en tus datos de Facebook', destination: '/herramientas/social',
    });
    expect(project(fixtures.real, 'en').hoy?.message).toBe('Review 2 Facebook posts without text');
  });
  it('2. CAPTION_MISSING → Hoy', () => {
    expect(topics(fixtures.caption)).toContain('CAPTION_MISSING');
    expect(project(fixtures.caption).hoy).toMatchObject({ recommendationKey: 'REVIEW_POSTS_WITHOUT_CAPTION', platform: 'instagram', message: 'Revisa 2 publicaciones de Instagram sin descripción' });
  });
  it('3. RECONNECT_META → Hoy', () => {
    expect(project(fixtures.reauth).hoy).toMatchObject({ recommendationKey: 'RECONNECT_META', message: 'Vuelve a conectar Meta', destination: SOCIAL_DESTINATION });
  });
  it('4. REVIEW_META_PERMISSIONS → Hoy', () => {
    expect(project(fixtures.permission).hoy).toMatchObject({ recommendationKey: 'REVIEW_META_PERMISSIONS', platform: 'facebook' });
  });
  it('5. CONSIDER_NEW_CONTENT from LONG_INACTIVITY → Plan, frozen conditional copy', () => {
    expect(topics(fixtures.longInactivity)).toContain('LONG_INACTIVITY');
    const { plan: p } = project(fixtures.longInactivity);
    expect(p).toMatchObject({ consumer: 'plan', recommendationKey: 'CONSIDER_NEW_CONTENT', destination: SOCIAL_DESTINATION });
    expect(p?.message).toMatch(/^Si (Facebook|Instagram) forma parte de tu estrategia activa/);
  });
  it('6. CONSIDER_NEW_CONTENT from NO_CONTENT → Plan', () => {
    const r = report(fixtures.noContent);
    expect(r.findings.find((f) => f.findingKey === 'FACEBOOK_NO_CONTENT')?.status).toBe('ACTIVE');
    expect(project(fixtures.noContent).plan).toMatchObject({ findingKey: 'FACEBOOK_NO_CONTENT', recommendationKey: 'CONSIDER_NEW_CONTENT', platform: 'facebook' });
  });
  it('7–8. one home per key: review never in Plan, CONSIDER_NEW_CONTENT never in Hoy', () => {
    for (const d of Object.values(fixtures)) {
      for (const i of all(d)) {
        if (i.recommendationKey === 'CONSIDER_NEW_CONTENT') expect(i.consumer).toBe('plan');
        else expect(i.consumer).toBe('hoy');
      }
    }
    expect(project(fixtures.real).plan).toBeNull();
    expect(Object.entries(SOCIAL_HOME).filter(([, h]) => h?.consumer === 'plan').map(([k]) => k)).toEqual(['CONSIDER_NEW_CONTENT']);
  });
  it('9–13. informational, limited history, wait, engagement availability never projected', () => {
    const r = report(fixtures.real);
    expect(r.findings.map((f) => f.topic)).toEqual(expect.arrayContaining(['INTERMEDIATE_ACTIVITY', 'ENGAGEMENT_METRICS_UNAVAILABLE']));
    expect(r.recommendations.some((x) => x.recommendationKey === 'WAIT_FOR_MORE_HISTORY')).toBe(true);
    const projected = all(fixtures.real);
    expect(projected.map((i) => i.findingKey)).toEqual(['FACEBOOK_TEXT_MISSING']);
    for (const d of Object.values(fixtures)) {
      const rep = report(d);
      for (const i of eligibleSocialItems(rep, 'es')) {
        const f = rep.findings.find((x) => x.findingKey === i.findingKey)!;
        expect(['INFORMATIONAL', 'INSUFFICIENT_DATA', 'STALE']).not.toContain(f.status);
        expect(f.topic).not.toMatch(/ENGAGEMENT|LIMITED_HISTORY|INSUFFICIENT|^(RECENT|INTERMEDIATE)_ACTIVITY$|FREQUENCY|CONTENT_TYPE|RECENCY|ONLY_RECENT/);
      }
    }
  });
  it('14. stale business findings are never projected as current; DATA_STALE is not a Hoy item', () => {
    const r = report(fixtures.staleInactive);
    expect(r.findings.map((f) => f.topic)).toEqual(['DATA_STALE']);
    expect(r.recommendations.map((x) => x.recommendationKey)).toEqual(['REFRESH_DATA']);
    expect(project(fixtures.staleInactive)).toEqual({ hoy: null, plan: null });
    expect(project(fixtures.stale)).toEqual({ hoy: null, plan: null });
    const fresh = report(fixtures.real);
    const forged: SocialFindingsReport = { ...fresh, findings: fresh.findings.map((f) => ({ ...f, freshness: 'STALE' as const })) };
    expect(eligibleSocialItems(forged, 'es')).toEqual([]);
  });
  it('15. RETRY_LATER (rate limit) never projected', () => {
    expect(report(fixtures.rateLimited).recommendations.some((r) => r.recommendationKey === 'RETRY_LATER')).toBe(true);
    expect(all(fixtures.rateLimited).some((i) => i.platform === 'facebook')).toBe(false);
  });
  it('16. CONNECT_PLATFORM / not connected never projected', () => {
    expect(report(fixtures.notConnected).recommendations.some((r) => r.recommendationKey === 'CONNECT_PLATFORM')).toBe(true);
    expect(project(fixtures.notConnected)).toEqual({ hoy: null, plan: null });
  });
});

describe('A3.5.4.4.1 Social Integration Projection — contract', () => {
  it('17–18. at most one item per consumer', () => {
    const both = data({
      connection: { status: 'reauth_required', instagram_status: 'connected' },
      items: [post('facebook', 'f1', OLD, null), post('facebook', 'f2', OLD, null), post('instagram', 'i1', OLD, null, 0)],
    });
    const p = project(both);
    expect(Object.keys(p)).toEqual(['hoy', 'plan']);
    expect(p.hoy).not.toBeNull();
  });
  it('19. deterministic: same input, same output; first eligible in frozen order wins', () => {
    const d = fixtures.caption;
    expect(project(d)).toEqual(project(d));
    const r = report(fixtures.real);
    expect(eligibleSocialItems(r, 'es')[0].id).toBe(projectSocialIntegration(r, 'es').hoy?.id);
  });
  it('20. frozen priority preserved; never HIGH, never INFO', () => {
    for (const d of Object.values(fixtures)) {
      const r = report(d);
      for (const i of eligibleSocialItems(r, 'es')) {
        const rec = r.recommendations.find((x) => x.findingKey === i.findingKey && x.recommendationKey === i.recommendationKey)!;
        expect(i.priority).toBe(rec.priority);
        expect(['HIGH', 'INFO']).not.toContain(i.priority);
      }
    }
    expect(project(fixtures.real).hoy?.priority).toBe('LOW');
    expect(project(fixtures.reauth).hoy?.priority).toBe('MEDIUM');
  });
  it('21. stable canonical identity from frozen keys, unique per item', () => {
    expect(project(fixtures.real).hoy?.id).toBe('social:REVIEW_POSTS_WITHOUT_TEXT:FACEBOOK_TEXT_MISSING');
    for (const d of Object.values(fixtures)) {
      const ids = all(d).map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => expect(id).toMatch(/^social:[A-Z_]+:(FACEBOOK|INSTAGRAM|CROSS_PLATFORM)_[A-Z_]+$/));
    }
    expect(intSrc).not.toMatch(/Math\.random|randomUUID|Date\.now\(\)/);
  });
  it('22. attribution by platform; cross-platform reads Meta; no internal keys in user text', () => {
    expect(project(fixtures.caption, 'en').hoy?.sourceLabel).toBe('Based on your Instagram data');
    const reauth = project(fixtures.reauth).hoy!;
    expect(reauth.sourceLabel).toBe(reauth.platform === 'cross_platform' ? 'Basado en tus datos de Meta' : `Basado en tus datos de ${reauth.platform === 'facebook' ? 'Facebook' : 'Instagram'}`);
    for (const d of Object.values(fixtures)) for (const lang of ['es', 'en'] as const) {
      for (const i of eligibleSocialItems(report(d), lang)) {
        expect(`${i.message} ${i.sourceLabel}`).not.toMatch(/[A-Z]{2,}_[A-Z_]+|\{|\}|undefined|null|NaN/);
      }
    }
  });
  it('23. destination exactly /herramientas/social; no permalinks or external URLs', () => {
    for (const d of Object.values(fixtures)) all(d).forEach((i) => expect(i.destination).toBe('/herramientas/social'));
    expect(intSrc).not.toMatch(/permalink|https?:\/\/|target="_blank"/);
  });
  it('24–25. no persistence and no Meta calls: only stored-data loader + frozen analysis', () => {
    expect(intSrc).not.toMatch(/business_actions|\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(|functions\.invoke|syncMetaContent|meta-read|graph\.facebook|localStorage/);
    expect(intSrc).not.toMatch(/supabase/);
    expect(card).toContain("from '../ui/repository'");
    expect(card).toContain('analyseSocialData');
  });
  it('26. never an unsupported or unmapped recommendation; safety class must match catalog', () => {
    for (const [key, home] of Object.entries(SOCIAL_HOME)) {
      const def = (RECOMMENDATION_CATALOG as Record<string, { safetyClass: string }>)[key];
      expect(def.safetyClass).toBe(home!.safetyClass);
    }
    const forged: SocialFindingsReport = {
      ...report(fixtures.real),
      recommendations: report(fixtures.real).recommendations.map((r) => ({ ...r, safetyClass: 'UNSUPPORTED' as unknown as typeof r.safetyClass })),
    };
    expect(eligibleSocialItems(forged, 'es')).toEqual([]);
    const unsupported = { ...report(fixtures.real) };
    unsupported.recommendations = [{ ...unsupported.recommendations[0], recommendationKey: 'POST_MORE_OFTEN' as never }];
    expect(eligibleSocialItems(unsupported, 'es')).toEqual([]);
  });
  it('27. NULL ≠ 0: FB NULL metrics and IG zero small sample create no engagement item', () => {
    const r = report(fixtures.real);
    expect(r.findings.some((f) => f.findingKey === 'FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE')).toBe(true);
    for (const d of Object.values(fixtures)) {
      for (const i of all(d)) expect(`${i.message} ${i.findingKey}`).not.toMatch(/ENGAGEMENT|interacci|engagement|reacci|comentario/i);
    }
    expect(intSrc).not.toMatch(/reaction_count|comment_count|text_content/);
  });
  it('parity: every projected item is an attention card on the Social page for the same data', () => {
    for (const d of Object.values(fixtures)) {
      const analysis = analyseSocialData(d, NOW);
      const vm = buildSocialViewModel(d, analysis, 'es');
      const cards = vm.kind === 'report' ? vm.attention.map((c) => c.id) : [];
      for (const i of eligibleSocialItems(analysis.findings, 'es')) expect(cards).toContain(i.findingKey);
    }
  });
  it('lifecycle: when the next sync no longer has the condition, the item disappears', () => {
    const fixed = data({ items: REAL_ITEMS.map((i) => ({ ...i, text_content: i.text_content?.trim() ? i.text_content : 'Texto añadido' })) });
    expect(project(fixtures.real).hoy).not.toBeNull();
    expect(project(fixed).hoy).toBeNull();
  });
});

describe('A3.5.4.4.1 Social Integration — consumers', () => {
  it('Hoy mounts exactly one card for consumer hoy, after TodayPriorities, without premium gating', () => {
    expect(today.match(/<SocialIntegrationCard /g)).toHaveLength(1);
    expect(today).toContain('<SocialIntegrationCard consumer="hoy" businessId={business?.id ?? null} lang={lang} />');
    expect(today.indexOf('<TodayPriorities')).toBeLessThan(today.indexOf('<SocialIntegrationCard'));
    expect(card).not.toMatch(/hasPremium|useBilling|Paywall|locked|subscription/);
  });
  it('Plan mounts exactly one card for consumer plan, outside roadmap and action sections', () => {
    expect(plan.match(/<SocialIntegrationCard /g)).toHaveLength(1);
    expect(plan).toContain('<SocialIntegrationCard consumer="plan" businessId={businessId ?? null} lang={lang} />');
    expect(plan.indexOf('<RoadmapCard')).toBeLessThan(plan.indexOf('<SocialIntegrationCard'));
  });
  it('card is compact: a real link, a heading, no posts, evidence, checkbox, due date, effort or score', () => {
    expect(card).toMatch(/<Link\s/);
    expect(card).toContain('to={item.destination}');
    expect(card).toMatch(/aria-labelledby=\{headingId\}/);
    expect(card).not.toMatch(/checkbox|markDone|complete\(|dismiss|due|effort|score|evidence|posts\.map|<img/i);
    expect(card).toMatch(/break-words/);
  });
  it('one Social data read per page mount; failure hides the card', () => {
    expect(card.match(/loadSocialData\(/g)).toHaveLength(1);
    expect(card).toMatch(/\[businessId\]\);/);
    expect(card).toMatch(/\.catch\(\(\) => \{ if \(active\) setReport\(null\); \}\)/);
  });
  it('Advisor, Twin and Resumen do not consume Social Intelligence', () => {
    const files = [
      ...readdirSync(join(ROOT, 'src/features/business-advisor')).map((f) => `src/features/business-advisor/${f}`),
      ...readdirSync(join(ROOT, 'supabase/functions/business-advisor-v2')).map((f) => `supabase/functions/business-advisor-v2/${f}`),
      ...readdirSync(join(ROOT, 'src/features/digital-twin')).map((f) => `src/features/digital-twin/${f}`),
      'src/features/business-memory/WeeklySummaryPage.tsx',
    ].filter((f) => /\.tsx?$/.test(f));
    for (const f of files) expect(read(f), f).not.toMatch(/social-intelligence|SocialFinding|SocialIntegration/);
  });
  it('only Hoy and Plan import the integration; no other module reaches Social engine internals', () => {
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== '__tests__' && !p.startsWith('src/features/social-intelligence')) walk(p); }
        else if (/\.tsx?$/.test(e.name) && /social-intelligence\//.test(read(p))) importers.push(p);
      }
    };
    walk('src');
    expect(importers.sort()).toEqual(['src/App.tsx', 'src/app-v2/routes/PlanPage.tsx', 'src/app-v2/routes/TodayPage.tsx']);
    expect(read('src/App.tsx')).not.toContain('integration');
  });
  it('actions engine and roadmap are not extended with social rules or keys', () => {
    for (const f of ['src/features/actions/rules.ts', 'src/features/actions/engine.ts', 'src/features/action-layer/model.ts', 'src/features/roadmap/model.ts', 'src/features/today-intelligence/model.ts']) {
      expect(read(f), f).not.toMatch(/social-intelligence|SocialIntegration|SOCIAL_HOME|meta_sync_state|meta_content_items/);
    }
  });
  it('ES/EN parity in integration copy', () => {
    expect(Object.keys(SOCIAL_INTEGRATION_COPY.es).sort()).toEqual(Object.keys(SOCIAL_INTEGRATION_COPY.en).sort());
    const userText = [SOCIAL_INTEGRATION_COPY.es.heading, SOCIAL_INTEGRATION_COPY.en.heading, SOCIAL_INTEGRATION_COPY.es.cta, SOCIAL_INTEGRATION_COPY.en.cta,
      ...Object.values(fixtures).flatMap((d) => (['es', 'en'] as const).flatMap((lang) => eligibleSocialItems(report(d), lang).map((i) => `${i.message} ${i.sourceLabel}`)))].join('\n');
    expect(userText).not.toMatch(/inactiv|rendimiento|performance|seguidores|followers|mejora tu|improve your|garantiza|guarantee/i);
  });
  it('frozen A3.5.4.3 UI files and App.tsx unchanged', () => {
    expect(sha('src/App.tsx')).toBe('f4523a4d043ae93b072c58b9f48201f68035119ef160802f50d15358f7a1e2d5'); // A3.7.3.2 HARNESS RE-PIN: channel adaptation panel on the hidden /internal/publications-validation route (no new route)
    expect(sha('src/features/social-intelligence/ui/viewModel.ts')).toBe('c92c4ee4e782274260cda418ef4f963cc300b29fcd35eb5b4149d71ae785aee1');
    expect(sha('src/features/social-intelligence/ui/repository.ts')).toBe('dc2cc79c122679a478e5bfc31374b9a0f8e68c033dc425a1217f58c6ea2d5817');
    expect(sha('src/features/social-intelligence/findings/engine.ts')).toBe('fe37139fc142dc2912f956addb8ccc5c20083cc1429fabdc678b5ad47812d2ca');
    expect(sha('src/features/social-intelligence/engine.ts')).toBe('457d613c24f768c0faec6219890aee3154d9dbf659ef9c9782ee11fb319f5fef');
  });
});
