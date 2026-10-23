import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { evaluateSocialSignals } from '../../engine';
import { DAY_MS, FRESHNESS_POLICY, HOUR_MS } from '../../policy';
import type {
  SignalKey,
  SocialConnectionInput,
  SocialContentItemInput,
  SocialPlatform,
  SocialSignalsReport,
  SocialSnapshot,
  SocialSyncStateInput,
} from '../../types';
import { evaluateSocialFindings, resolveRecommendation } from '../engine';
import { RECOMMENDATION_CATALOG, SOCIAL_FINDINGS_ENGINE_VERSION, TOPIC_POLICY } from '../policy';
import { formatSocialMessage, SOCIAL_FINDINGS_MESSAGES } from '../copy';
import type { FindingKey, RecommendationKey, SocialFinding, SocialFindingsReport } from '../types';

const NOW = '2026-10-22T18:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const ago = (days: number, hours = 0) => new Date(NOW_MS - days * DAY_MS - hours * HOUR_MS).toISOString();

const conn = (over: Partial<SocialConnectionInput> = {}): SocialConnectionInput => ({ status: 'connected', instagram_status: 'connected', ...over });
const sync = (platform: SocialPlatform, over: Partial<SocialSyncStateInput> = {}): SocialSyncStateInput => ({
  platform, status: 'ok', error_code: null, item_count: 1, pages_fetched: 1, last_success_at: ago(0, 1), ...over,
});
const item = (platform: SocialPlatform, n: number, over: Partial<SocialContentItemInput> = {}): SocialContentItemInput => ({
  platform,
  external_id: `${platform}_${n}`,
  content_type: platform === 'facebook' ? 'photo' : 'image',
  text_content: 'Texto',
  published_at: ago(3),
  reaction_count: 2,
  comment_count: 1,
  ...over,
});
const snap = (
  items: SocialContentItemInput[],
  states: SocialSyncStateInput[] = [sync('facebook'), sync('instagram')],
  connection: SocialConnectionInput | null = conn(),
): SocialSnapshot => ({ connection, syncStates: states, items });
const series = (platform: SocialPlatform, count: number, everyDays: number, startDaysAgo = 1, over: Partial<SocialContentItemInput> = {}) =>
  Array.from({ length: count }, (_, i) => item(platform, i, { published_at: ago(startDaysAgo + i * everyDays), ...over }));

const signalsOf = (s: SocialSnapshot, at: string = NOW) => evaluateSocialSignals(s, at);
const run = (s: SocialSnapshot, at: string = NOW) => evaluateSocialFindings(signalsOf(s, at));
const keys = (r: SocialFindingsReport) => r.findings.map((f) => f.findingKey);
const find = (r: SocialFindingsReport, key: FindingKey): SocialFinding => {
  const f = r.findings.find((x) => x.findingKey === key);
  if (!f) throw new Error(`missing ${key} in ${keys(r).join(',')}`);
  return f;
};
const recsFor = (r: SocialFindingsReport, platform: string) => r.recommendations.filter((x) => x.platform === platform);
const BUSINESS_TOPICS = new Set([
  'RECENT_ACTIVITY', 'INTERMEDIATE_ACTIVITY', 'LONG_INACTIVITY', 'NO_CONTENT', 'FREQUENCY_OBSERVED', 'TEXT_MISSING', 'CAPTION_MISSING',
  'CONTENT_TYPE_MIX', 'ENGAGEMENT_DATA_AVAILABLE', 'FB_ONLY_RECENT', 'IG_ONLY_RECENT', 'RECENCY_DIFFERENCE',
]);

// Copied read-only from production on 2026-10-22 (text replaced by a placeholder, only presence matters).
const REAL_SNAPSHOT: SocialSnapshot = {
  connection: { status: 'connected', instagram_status: 'connected' },
  syncStates: [
    { platform: 'facebook', status: 'ok', error_code: null, item_count: 3, pages_fetched: 1, last_success_at: '2026-10-22T17:22:26.633Z' },
    { platform: 'instagram', status: 'ok', error_code: null, item_count: 1, pages_fetched: 1, last_success_at: '2026-10-22T17:22:26.696Z' },
  ],
  items: [
    { platform: 'facebook', external_id: '1393994523793266_1121631013746842', content_type: 'photo', text_content: null, published_at: '2026-10-14T22:07:47Z', reaction_count: null, comment_count: null },
    { platform: 'facebook', external_id: '1393994523793266_122106721107502661', content_type: 'photo', text_content: null, published_at: '2026-10-14T22:12:35Z', reaction_count: null, comment_count: null },
    { platform: 'facebook', external_id: '1393994523793266_122106732081502661', content_type: 'photo', text_content: 'x', published_at: '2026-10-14T22:27:37Z', reaction_count: null, comment_count: null },
    { platform: 'instagram', external_id: '18144367309586214', content_type: 'image', text_content: 'x', published_at: '2026-10-14T22:26:26Z', reaction_count: 0, comment_count: 0 },
  ],
};

const LONG = snap([item('facebook', 1, { published_at: ago(40) }), item('instagram', 1, { published_at: ago(3) })]);
const RICH = snap([...series('facebook', 12, 3), ...series('instagram', 10, 4)]);
const STALE_FB = snap([item('facebook', 1, { published_at: ago(90) }), item('instagram', 1)], [sync('facebook', { last_success_at: ago(20) }), sync('instagram')]);
const REAUTH = snap([], [], conn({ status: 'reauth_required' }));
const igError = (status: string) => snap([item('facebook', 1), item('instagram', 1, { published_at: ago(200) })], [sync('facebook'), sync('instagram', { status, error_code: 'X' })]);

const SCENARIOS: Record<string, SocialSnapshot> = {
  real: REAL_SNAPSHOT,
  long: LONG,
  rich: RICH,
  staleFb: STALE_FB,
  reauth: REAUTH,
  rateLimited: igError('rate_limited'),
  permission: igError('permission_unavailable'),
  syncError: igError('api_error'),
  empty: snap([], [sync('facebook', { status: 'empty' }), sync('instagram', { status: 'empty' })]),
  noTimestamps: snap([item('facebook', 1, { published_at: null }), item('facebook', 2, { published_at: null }), item('instagram', 1)]),
  fbOnly: snap([item('facebook', 1, { published_at: ago(2) }), item('instagram', 1, { published_at: ago(15) })]),
  igOnly: snap([item('facebook', 1, { published_at: ago(15) }), item('instagram', 1, { published_at: ago(2) })]),
  notConnected: snap([], [], null),
  igNotLinked: snap([item('facebook', 1)], [sync('facebook')], conn({ instagram_status: 'not_linked' as never })),
};

describe('A3.5.4.2 content completeness', () => {
  const r = run(REAL_SNAPSHOT);

  it('1. finding from FB text missing', () => {
    expect(find(r, 'FACEBOOK_TEXT_MISSING')).toMatchObject({
      platform: 'facebook', category: 'content', status: 'ACTIVE', sourceSignals: ['FB_CONTENT_TEXT_MISSING'],
      titleKey: 'social.finding.TEXT_MISSING.title', summaryKey: 'social.finding.TEXT_MISSING.summary',
    });
  });

  it('2. evidence preserved verbatim from the signal', () => {
    const signal = signalsOf(REAL_SNAPSHOT).signals.find((s) => s.signalKey === 'FB_CONTENT_TEXT_MISSING');
    const f = find(r, 'FACEBOOK_TEXT_MISSING');
    expect(f.evidence).toEqual([{ signalKey: 'FB_CONTENT_TEXT_MISSING', signalStatus: 'DETECTED', values: expect.any(Object) }]);
    expect(signal?.evidence).toMatchObject(f.evidence[0].values);
    expect(f.evidence[0].values).toMatchObject({ postsWithoutText: 2, postsWithText: 1, observedPostCount: 3 });
    expect(f.params).toEqual({ postsWithoutText: 2, observedPostCount: 3 });
  });

  it('3. DIRECT recommendation generated correctly', () => {
    const rec = r.recommendations.find((x) => x.recommendationKey === 'REVIEW_POSTS_WITHOUT_TEXT');
    expect(rec).toEqual({
      recommendationKey: 'REVIEW_POSTS_WITHOUT_TEXT', findingKey: 'FACEBOOK_TEXT_MISSING', platform: 'facebook', safetyClass: 'DIRECT',
      priority: 'LOW', messageKey: 'social.rec.REVIEW_POSTS_WITHOUT_TEXT', params: { postsWithoutText: 2, observedPostCount: 3 },
      evidenceRefs: ['FB_CONTENT_TEXT_MISSING'], actionType: 'REVIEW',
    });
  });

  it('4. no unsupported benefit claim in the text recommendation', () => {
    for (const lang of ['es', 'en'] as const) {
      const text = formatSocialMessage(lang, 'social.rec.REVIEW_POSTS_WITHOUT_TEXT', { postsWithoutText: 2 }, 'facebook');
      expect(text).not.toMatch(/engagement|interacci|interaction|alcance|reach|ventas|sales|ranking|posicion|aument|increase|mejor|better|más|more/i);
    }
  });

  it('5. IG caption present -> no false missing-caption finding', () => {
    expect(keys(r)).not.toContain('INSTAGRAM_CAPTION_MISSING');
    const missing = run(snap([item('facebook', 1), item('instagram', 1, { text_content: '  ' })]));
    expect(find(missing, 'INSTAGRAM_CAPTION_MISSING')).toMatchObject({ params: { postsWithoutText: 1, observedPostCount: 1 }, recommendationKeys: ['REVIEW_POSTS_WITHOUT_CAPTION'] });
  });

  it('text missing priority follows sample sufficiency: LIMITED -> LOW, SUFFICIENT -> MEDIUM', () => {
    expect(find(r, 'FACEBOOK_TEXT_MISSING')).toMatchObject({ priority: 'LOW', sufficiency: 'LIMITED' });
    const big = run(snap([...series('facebook', 6, 2, 1, { text_content: null }), item('instagram', 1)]));
    expect(find(big, 'FACEBOOK_TEXT_MISSING')).toMatchObject({ priority: 'MEDIUM', sufficiency: 'SUFFICIENT' });
  });
});

describe('A3.5.4.2 activity', () => {
  it('6. long inactivity -> contextual recommendation', () => {
    const r = run(LONG);
    expect(find(r, 'FACEBOOK_LONG_INACTIVITY')).toMatchObject({ status: 'ACTIVE', priority: 'MEDIUM', params: { daysSinceLastPost: 40, thresholdDays: 31 } });
    const rec = r.recommendations.find((x) => x.findingKey === 'FACEBOOK_LONG_INACTIVITY');
    expect(rec).toMatchObject({ recommendationKey: 'CONSIDER_NEW_CONTENT', safetyClass: 'CONTEXTUAL', actionType: 'PLAN', priority: 'LOW' });
    expect(formatSocialMessage('es', rec?.messageKey ?? '', rec?.params ?? {}, 'facebook')).toMatch(/^Si Facebook forma parte/);
    expect(formatSocialMessage('en', rec?.messageKey ?? '', rec?.params ?? {}, 'facebook')).toMatch(/^If Facebook is part/);
  });

  it('long inactivity boundary: 30 whole days intermediate, 31 long', () => {
    expect(keys(run(snap([item('facebook', 1, { published_at: ago(30, 23) }), item('instagram', 1)])))).toContain('FACEBOOK_INTERMEDIATE_ACTIVITY');
    expect(keys(run(snap([item('facebook', 1, { published_at: ago(31) }), item('instagram', 1)])))).toContain('FACEBOOK_LONG_INACTIVITY');
  });

  it('7. intermediate activity -> informational, no recommendation', () => {
    const r = run(REAL_SNAPSHOT, '2026-10-22T22:30:00.000Z');
    for (const key of ['FACEBOOK_INTERMEDIATE_ACTIVITY', 'INSTAGRAM_INTERMEDIATE_ACTIVITY'] as FindingKey[]) {
      expect(find(r, key)).toMatchObject({ status: 'INFORMATIONAL', priority: 'INFO', recommendationKeys: [], params: { daysSinceLastPost: 8 } });
      expect(r.recommendations.some((x) => x.findingKey === key)).toBe(false);
    }
  });

  it('8. recent activity -> informational only', () => {
    const r = run(REAL_SNAPSHOT);
    expect(find(r, 'FACEBOOK_RECENT_ACTIVITY')).toMatchObject({ status: 'INFORMATIONAL', priority: 'INFO', recommendationKeys: [], params: { daysSinceLastPost: 7, thresholdDays: 7 } });
    expect(find(r, 'INSTAGRAM_RECENT_ACTIVITY').recommendationKeys).toEqual([]);
  });

  it('no content -> factual finding with contextual recommendation; NO_DATA signals covered', () => {
    const r = run(SCENARIOS.empty);
    expect(find(r, 'FACEBOOK_NO_CONTENT')).toMatchObject({ status: 'ACTIVE', priority: 'LOW', params: { observedPostCount: 0 } });
    expect(r.recommendations.filter((x) => x.recommendationKey === 'CONSIDER_NEW_CONTENT').every((x) => x.safetyClass === 'CONTEXTUAL')).toBe(true);
    expect(r.trace.find((t) => t.signalKey === 'FB_FREQUENCY_OBSERVED')).toMatchObject({ disposition: 'COVERED', findingKey: 'FACEBOOK_NO_CONTENT' });
    expect(r.trace.find((t) => t.signalKey === 'PLATFORM_RECENCY_DIFFERENCE')).toMatchObject({ disposition: 'COVERED', findingKey: 'FACEBOOK_NO_CONTENT' });
  });
});

describe('A3.5.4.2 frequency, content type and engagement', () => {
  const r = run(REAL_SNAPSHOT);
  const allDetails = (rep: SocialFindingsReport) => rep.findings.flatMap((f) => [f.topic, ...f.groupedFindings.map((g) => g.topic)]);

  it('9. frequency insufficient -> no "post more" recommendation', () => {
    expect(allDetails(r)).toContain('FREQUENCY_INSUFFICIENT');
    const freq = r.findings.flatMap((f) => f.groupedFindings).filter((g) => g.topic === 'FREQUENCY_INSUFFICIENT');
    expect(freq.map((g) => g.findingKey).sort()).toEqual(['FACEBOOK_FREQUENCY_INSUFFICIENT', 'INSTAGRAM_FREQUENCY_INSUFFICIENT']);
    expect(r.recommendations.map((x) => x.recommendationKey)).not.toContain('POST_MORE_OFTEN');
    expect(r.recommendations.filter((x) => x.actionType === 'PLAN' || x.actionType === 'CREATE')).toEqual([]);
  });

  it('frequency observed with sufficient history is informational, no benchmark recommendation', () => {
    const rich = run(RICH);
    expect(find(rich, 'FACEBOOK_FREQUENCY_OBSERVED')).toMatchObject({ status: 'INFORMATIONAL', recommendationKeys: [], params: { postsWithTimestamp: 12, medianIntervalDays: 3 } });
  });

  it('10. engagement unavailable -> no zero claim', () => {
    const f = find(r, 'FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE');
    expect(f).toMatchObject({ status: 'NOT_AVAILABLE', priority: 'INFO', sufficiency: 'NOT_AVAILABLE', recommendationKeys: [] });
    expect(f.evidence[0].values).toMatchObject({ reactionTotal: null, commentTotal: null });
    for (const lang of ['es', 'en'] as const) expect(formatSocialMessage(lang, f.summaryKey, f.params, 'facebook')).not.toMatch(/\b0\b|cero|zero|bajo|low/i);
  });

  it('11. IG real zero + insufficient sample -> no "low engagement" claim', () => {
    const group = find(r, 'INSTAGRAM_LIMITED_HISTORY');
    const detail = group.groupedFindings.find((g) => g.topic === 'ENGAGEMENT_SAMPLE_INSUFFICIENT');
    expect(detail?.params).toEqual({ availableEngagementCount: 1, eligibleEngagementCount: 1 });
    expect(group.evidence.find((e) => e.signalKey === 'IG_ENGAGEMENT_DATA_AVAILABLE')?.values).toMatchObject({ reactionTotal: 0, commentTotal: 0 });
    for (const lang of ['es', 'en'] as const) {
      expect(formatSocialMessage(lang, detail?.summaryKey ?? '', detail?.params ?? {}, 'instagram')).not.toMatch(/bajo|baja|low|poor|cero|zero/i);
    }
    expect(r.recommendations.filter((x) => x.platform === 'instagram').map((x) => x.recommendationKey)).toEqual(['WAIT_FOR_MORE_HISTORY']);
  });

  it('12. content type insufficient -> no format recommendation', () => {
    expect(allDetails(r)).toContain('CONTENT_TYPE_INSUFFICIENT');
    const recKeys = r.recommendations.map((x) => x.recommendationKey);
    expect(recKeys).not.toContain('SWITCH_TO_REELS');
    expect(recKeys).not.toContain('FORMAT_ENGAGEMENT_UPLIFT');
    const all = JSON.stringify(Object.values(SOCIAL_FINDINGS_MESSAGES));
    expect(all).not.toMatch(/reels?\b|vídeo|video|carrusel|carousel/i);
  });

  it('content type mix with sufficient sample is informational only', () => {
    expect(find(run(RICH), 'FACEBOOK_CONTENT_TYPE_MIX')).toMatchObject({ status: 'INFORMATIONAL', recommendationKeys: [], params: { distinctContentTypes: 1, contentTypes: { photo: 12 } } });
  });

  it('engagement data available is informational, no judgement of values', () => {
    expect(find(run(RICH), 'FACEBOOK_ENGAGEMENT_DATA_AVAILABLE')).toMatchObject({ status: 'INFORMATIONAL', recommendationKeys: [], sufficiency: 'SUFFICIENT' });
  });
});

describe('A3.5.4.2 stale data and technical errors', () => {
  it('13. stale signal -> stale-data finding', () => {
    const r = run(STALE_FB);
    const f = find(r, 'FACEBOOK_DATA_STALE');
    expect(f).toMatchObject({ status: 'STALE', category: 'data_quality', priority: 'LOW', sufficiency: 'NOT_AVAILABLE', freshness: 'STALE', params: { lastSuccessAt: ago(20) } });
    expect(f.sourceSignals.length).toBeGreaterThan(0);
    expect(r.recommendations.find((x) => x.findingKey === 'FACEBOOK_DATA_STALE')).toMatchObject({ recommendationKey: 'REFRESH_DATA', safetyClass: 'DIRECT', actionType: 'REFRESH_DATA' });
    expect(formatSocialMessage('es', f.summaryKey, f.params, 'facebook')).toContain(`${FRESHNESS_POLICY.agingMaxHours / 24} días`);
  });

  it('14. stale lastKnownStatus not treated as current fact', () => {
    const signals = signalsOf(STALE_FB);
    expect(signals.signals.find((s) => s.signalKey === 'FB_LONG_INACTIVITY')).toMatchObject({ status: 'STALE', lastKnownStatus: 'DETECTED' });
    const r = evaluateSocialFindings(signals);
    expect(r.findings.filter((f) => f.platform === 'facebook').map((f) => f.topic)).toEqual(['DATA_STALE']);
    const f = find(r, 'FACEBOOK_DATA_STALE');
    for (const e of f.evidence) expect(Object.keys(e.values).sort()).toEqual(['errorCode', 'lastSuccessAt', 'syncStatus']);
    expect(r.findings.some((x) => x.platform === 'cross_platform')).toBe(false);
  });

  it('both platforms stale -> one cross-platform stale finding', () => {
    const r = run(snap([item('facebook', 1), item('instagram', 1)], [sync('facebook', { last_success_at: ago(9) }), sync('instagram', { last_success_at: ago(10) })]));
    expect(keys(r)).toEqual(['CROSS_PLATFORM_DATA_STALE']);
    expect(find(r, 'CROSS_PLATFORM_DATA_STALE').groupedFindings.map((g) => g.findingKey)).toEqual(['FACEBOOK_DATA_STALE', 'INSTAGRAM_DATA_STALE']);
    expect(r.recommendations.map((x) => x.recommendationKey)).toEqual(['REFRESH_DATA']);
  });

  it('15. reauth -> data-access finding only', () => {
    const r = run(REAUTH);
    expect(keys(r)).toEqual(['CROSS_PLATFORM_ACCESS_REAUTH_REQUIRED']);
    expect(find(r, 'CROSS_PLATFORM_ACCESS_REAUTH_REQUIRED')).toMatchObject({ status: 'NOT_AVAILABLE', category: 'data_quality', priority: 'MEDIUM' });
    expect(r.recommendations).toEqual([expect.objectContaining({ recommendationKey: 'RECONNECT_META', actionType: 'CONNECT', safetyClass: 'DIRECT' })]);
    expect(r.trace.every((t) => t.disposition !== 'NO_FINDING')).toBe(true);
  });

  const noIgBusiness = (status: string, topic: string) => {
    const r = run(igError(status));
    const ig = r.findings.filter((f) => f.platform === 'instagram');
    expect(ig.map((f) => f.topic)).toEqual([topic]);
    expect(ig[0]).toMatchObject({ status: 'NOT_AVAILABLE', category: 'data_quality' });
    expect(r.findings.some((f) => f.platform === 'cross_platform')).toBe(false);
    expect(r.findings.some((f) => f.platform !== 'facebook' && BUSINESS_TOPICS.has(f.topic))).toBe(false);
    expect(keys(r)).toContain('FACEBOOK_RECENT_ACTIVITY');
    return r;
  };

  it('16. rate limit -> no business diagnosis', () => {
    const r = noIgBusiness('rate_limited', 'ACCESS_RATE_LIMITED');
    expect(recsFor(r, 'instagram').map((x) => [x.recommendationKey, x.actionType])).toEqual([['RETRY_LATER', 'WAIT_FOR_MORE_DATA']]);
  });

  it('17. permission unavailable -> no business diagnosis', () => {
    const r = noIgBusiness('permission_unavailable', 'ACCESS_PERMISSION_UNAVAILABLE');
    expect(recsFor(r, 'instagram').map((x) => x.recommendationKey)).toEqual(['REVIEW_META_PERMISSIONS']);
  });

  it('18. sync error -> no business diagnosis', () => {
    noIgBusiness('api_error', 'ACCESS_SYNC_ERROR');
    noIgBusiness('malformed', 'ACCESS_SYNC_ERROR');
  });

  it('not connected / not linked -> availability findings with contextual connect only', () => {
    const none = run(SCENARIOS.notConnected);
    expect(keys(none)).toEqual(['CROSS_PLATFORM_ACCESS_NOT_CONNECTED']);
    expect(none.recommendations).toEqual([expect.objectContaining({ recommendationKey: 'CONNECT_PLATFORM', safetyClass: 'CONTEXTUAL', priority: 'INFO' })]);
    const unlinked = run(SCENARIOS.igNotLinked);
    expect(keys(unlinked)).toContain('INSTAGRAM_ACCESS_NOT_LINKED');
    expect(unlinked.trace.find((t) => t.signalKey === 'FB_ONLY_RECENT_ACTIVITY')).toMatchObject({ disposition: 'COVERED', findingKey: 'INSTAGRAM_ACCESS_NOT_LINKED' });
  });
});

describe('A3.5.4.2 cross-platform', () => {
  it('19. FB-only recent activity -> factual cross-platform finding', () => {
    const f = find(run(SCENARIOS.fbOnly), 'CROSS_PLATFORM_FB_ONLY_RECENT');
    expect(f).toMatchObject({ status: 'INFORMATIONAL', priority: 'INFO', recommendationKeys: [], params: { facebookDaysSinceLastPost: 2, instagramDaysSinceLastPost: 15, thresholdDays: 7 } });
    expect(formatSocialMessage('es', f.summaryKey, f.params, 'cross_platform')).toContain('no actividad reciente equivalente en Instagram');
  });

  it('20. IG-only recent activity -> factual cross-platform finding', () => {
    expect(find(run(SCENARIOS.igOnly), 'CROSS_PLATFORM_IG_ONLY_RECENT')).toMatchObject({ params: { facebookDaysSinceLastPost: 15, instagramDaysSinceLastPost: 2 }, recommendationKeys: [] });
  });

  it('21. recency difference -> no performance comparison', () => {
    const r = run(LONG);
    const f = find(r, 'CROSS_PLATFORM_RECENCY_DIFFERENCE');
    expect(f.params).toMatchObject({ recencyDifferenceDays: 37 });
    expect(f.recommendationKeys).toEqual([]);
    for (const lang of ['es', 'en'] as const) {
      expect(formatSocialMessage(lang, f.summaryKey, f.params, 'cross_platform')).not.toMatch(/mejor|peor|rendimiento|funciona|better|worse|perform/i);
    }
    expect(r.recommendations.map((x) => x.recommendationKey)).not.toContain('PLATFORM_PERFORMANCE_COMPARISON');
  });
});

const UNSUPPORTED = (Object.keys(RECOMMENDATION_CATALOG) as RecommendationKey[]).filter((k) => RECOMMENDATION_CATALOG[k].safetyClass === 'UNSUPPORTED');
const reports = () => Object.values(SCENARIOS).map((s) => run(s));
const rendered = (r: SocialFindingsReport) => (['es', 'en'] as const).flatMap((lang) => [
  ...r.findings.flatMap((f) => [
    formatSocialMessage(lang, f.titleKey, f.params, f.platform),
    formatSocialMessage(lang, f.summaryKey, f.params, f.platform),
    ...f.groupedFindings.map((g) => formatSocialMessage(lang, g.summaryKey, g.params, f.platform)),
  ]),
  ...r.recommendations.map((x) => formatSocialMessage(lang, x.messageKey, x.params, x.platform)),
]).join('\n');
const ALL_COPY = Object.values(SOCIAL_FINDINGS_MESSAGES).flatMap((m) => Object.values(m)).join('\n');

describe('A3.5.4.2 safety and forbidden claims', () => {
  it('22. unsupported recommendations blocked', () => {
    expect(UNSUPPORTED.sort()).toEqual(['BEST_TIME_TO_POST', 'COMPETITOR_COMPARISON', 'FORMAT_ENGAGEMENT_UPLIFT', 'PLATFORM_PERFORMANCE_COMPARISON', 'POST_MORE_OFTEN', 'SALES_UPLIFT', 'SWITCH_TO_REELS']);
    const anyFinding = run(LONG).findings[0];
    for (const k of UNSUPPORTED) {
      expect(resolveRecommendation(k, anyFinding)).toBeNull();
      expect(SOCIAL_FINDINGS_MESSAGES.es[`social.rec.${k}`]).toBeUndefined();
    }
    for (const r of reports()) {
      for (const x of r.recommendations) expect(['DIRECT', 'CONTEXTUAL']).toContain(x.safetyClass);
      for (const f of r.findings) for (const k of f.recommendationKeys) expect(UNSUPPORTED).not.toContain(k);
    }
  });

  it('status gate: informational findings never carry recommendations, insufficient ones only wait', () => {
    const informational = find(run(REAL_SNAPSHOT), 'FACEBOOK_RECENT_ACTIVITY');
    expect(resolveRecommendation('REVIEW_POSTS_WITHOUT_TEXT', informational)).toBeNull();
    const group = find(run(REAL_SNAPSHOT), 'FACEBOOK_LIMITED_HISTORY');
    expect(resolveRecommendation('CONSIDER_NEW_CONTENT', group)).toBeNull();
    expect(resolveRecommendation('WAIT_FOR_MORE_HISTORY', group)?.actionType).toBe('WAIT_FOR_MORE_DATA');
    for (const r of reports()) {
      for (const f of r.findings) {
        if (f.status === 'INFORMATIONAL') expect(f.recommendationKeys).toEqual([]);
        if (f.status === 'INSUFFICIENT_DATA') for (const k of f.recommendationKeys) expect(RECOMMENDATION_CATALOG[k].actionType).toBe('WAIT_FOR_MORE_DATA');
      }
    }
  });

  it('CONTEXTUAL recommendations use conditional language', () => {
    for (const k of ['CONSIDER_NEW_CONTENT', 'CONNECT_PLATFORM'] as const) {
      expect(SOCIAL_FINDINGS_MESSAGES.es[`social.rec.${k}`]).toMatch(/^Si /);
      expect(SOCIAL_FINDINGS_MESSAGES.en[`social.rec.${k}`]).toMatch(/^If /);
    }
  });

  const claims: [string, RegExp][] = [
    ['23. no sales claims', /ventas|vender|sales|revenue|ingresos|facturaci/i],
    ['24. no conversion claims', /conversi|convert|clientes|customers|leads/i],
    ['25. no competitor claims', /competi/i],
    ['26. no benchmark claims', /benchmark|sector|industria|industry|average|promedio|media de|veces por semana|times (a|per) week|\d{1,2}:\d{2}|best time|mejor hora/i],
    ['27. no invented reach/impressions', /alcance|reach|impresi|impression|views|visualizaci|seguidores|followers/i],
    ['28. no trends', /tendencia|trend|crecimiento|growth|ha (bajado|subido)|decline/i],
    ['29. no Social Score', /score|puntuaci|rating|estrellas|stars|salud|health|\d+\s?%/i],
    ['no uplift promises', /aumentar|aumentará|increase|boost|mejorar(á)?|improve|garantiz|guarantee|más engagement|more engagement/i],
  ];
  for (const [name, re] of claims) {
    it(name, () => {
      expect(ALL_COPY).not.toMatch(re);
      for (const r of reports()) {
        expect(rendered(r)).not.toMatch(re);
        const output = {
          f: r.findings.map((f) => ({ ...f, evidence: [], sourceSignals: [], groupedFindings: f.groupedFindings.map((g) => ({ ...g, sourceSignals: [] })) })),
          r: r.recommendations.map((x) => ({ ...x, evidenceRefs: [] })),
        };
        expect(JSON.stringify(output)).not.toMatch(name.includes('trend') ? /trend/i : /score|benchmark|competitor|sales|revenue|reach|impression/i);
      }
    });
  }

  it('every emitted key has ES and EN copy with all placeholders resolvable', () => {
    for (const r of reports()) {
      const msgs = [
        ...r.findings.flatMap((f) => [[f.titleKey, f.params], [f.summaryKey, f.params], ...f.groupedFindings.map((g) => [g.summaryKey, g.params])]),
        ...r.recommendations.map((x) => [x.messageKey, x.params]),
      ] as [string, SocialFinding['params']][];
      for (const [key, params] of msgs) {
        for (const lang of ['es', 'en'] as const) {
          const text = formatSocialMessage(lang, key, params, 'facebook');
          expect(text).not.toMatch(/\{\w+\}/);
          expect(text).not.toContain('—');
        }
      }
    }
    expect(Object.keys(SOCIAL_FINDINGS_MESSAGES.es).sort()).toEqual(Object.keys(SOCIAL_FINDINGS_MESSAGES.en).sort());
    for (const topic of Object.keys(TOPIC_POLICY)) expect(SOCIAL_FINDINGS_MESSAGES.es[`social.finding.${topic}.title`]).toBeDefined();
  });
});

describe('A3.5.4.2 determinism, priority and ordering', () => {
  const PRIORITY_ORDER = ['HIGH', 'MEDIUM', 'LOW', 'INFO'];

  it('31. deterministic priority (HIGH reserved, never emitted)', () => {
    for (const r of reports()) {
      for (const f of r.findings) expect(f.priority).not.toBe('HIGH');
      for (const x of r.recommendations) {
        const f = r.findings.find((y) => y.findingKey === x.findingKey) as SocialFinding;
        expect(PRIORITY_ORDER.indexOf(x.priority)).toBeGreaterThanOrEqual(PRIORITY_ORDER.indexOf(f.priority));
        if (x.safetyClass === 'CONTEXTUAL') expect(['LOW', 'INFO']).toContain(x.priority);
      }
    }
  });

  it('32. deterministic ordering: priority, category, platform, key', () => {
    const CAT = ['data_quality', 'activity', 'frequency', 'content', 'engagement'];
    const PLAT = ['facebook', 'instagram', 'cross_platform'];
    for (const r of reports()) {
      const sortKey = (f: SocialFinding) => [PRIORITY_ORDER.indexOf(f.priority), CAT.indexOf(f.category), PLAT.indexOf(f.platform), f.findingKey];
      const sorted = [...r.findings].sort((a, b) => {
        const x = sortKey(a); const y = sortKey(b);
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
        return 0;
      });
      expect(keys(r)).toEqual(sorted.map((f) => f.findingKey));
      const recRanks = r.recommendations.map((x) => PRIORITY_ORDER.indexOf(x.priority));
      expect(recRanks).toEqual([...recRanks].sort((a, b) => a - b));
    }
  });

  it('33. same input + same evaluatedAt -> same output; input not mutated', () => {
    for (const s of Object.values(SCENARIOS)) {
      const signals = signalsOf(s);
      const frozen = JSON.stringify(signals);
      expect(JSON.stringify(evaluateSocialFindings(signals))).toBe(JSON.stringify(evaluateSocialFindings(JSON.parse(frozen))));
      expect(JSON.stringify(signals)).toBe(frozen);
      expect(run(s)).toEqual(run(JSON.parse(JSON.stringify(s))));
    }
  });

  it('rejects a report from a different signals engine version', () => {
    const report = { ...signalsOf(REAL_SNAPSHOT), engineVersion: 'a3541-2' } as SocialSignalsReport;
    expect(() => evaluateSocialFindings(report)).toThrow('UNSUPPORTED_SIGNALS_ENGINE_VERSION');
    expect(run(REAL_SNAPSHOT)).toMatchObject({ engineVersion: SOCIAL_FINDINGS_ENGINE_VERSION, signalsEngineVersion: 'a3541-1', evaluatedAt: NOW });
  });
});

describe('A3.5.4.2 deduplication and traceability', () => {
  it('34. deduplication: insufficient-data findings grouped per platform, nothing hidden', () => {
    const r = run(REAL_SNAPSHOT);
    const fb = find(r, 'FACEBOOK_LIMITED_HISTORY');
    expect(fb.groupedFindings.map((g) => g.findingKey)).toEqual(['FACEBOOK_FREQUENCY_INSUFFICIENT', 'FACEBOOK_CONTENT_TYPE_INSUFFICIENT']);
    expect(fb.sourceSignals).toEqual(['FB_FREQUENCY_OBSERVED', 'FB_CONTENT_TYPE_VARIETY']);
    expect(find(r, 'INSTAGRAM_LIMITED_HISTORY').groupedFindings).toHaveLength(3);
    expect(r.findings.filter((f) => f.status === 'INSUFFICIENT_DATA')).toHaveLength(2);
    expect(r.recommendations.filter((x) => x.recommendationKey === 'WAIT_FOR_MORE_HISTORY').map((x) => x.platform)).toEqual(['facebook', 'instagram']);
    for (const t of r.trace.filter((x) => x.disposition === 'GROUPED')) expect(t.findingKey).toMatch(/LIMITED_HISTORY$/);
  });

  it('single insufficient finding is not grouped', () => {
    const r = run(RICH);
    expect(keys(r)).toContain('INSTAGRAM_ENGAGEMENT_SAMPLE_INSUFFICIENT');
    expect(keys(r)).not.toContain('INSTAGRAM_LIMITED_HISTORY');
  });

  it('recency gap absorbs the matching only-recent finding', () => {
    const f = find(run(LONG), 'CROSS_PLATFORM_RECENCY_DIFFERENCE');
    expect(f.sourceSignals).toEqual(['PLATFORM_RECENCY_DIFFERENCE', 'IG_ONLY_RECENT_ACTIVITY']);
    expect(f.groupedFindings.map((g) => g.findingKey)).toEqual(['CROSS_PLATFORM_IG_ONLY_RECENT']);
    expect(keys(run(LONG))).not.toContain('CROSS_PLATFORM_IG_ONLY_RECENT');
  });

  it('no duplicate finding keys or (recommendation, platform) pairs', () => {
    for (const r of reports()) {
      expect(new Set(keys(r)).size).toBe(r.findings.length);
      const pairs = r.recommendations.map((x) => `${x.recommendationKey}:${x.platform}`);
      expect(new Set(pairs).size).toBe(pairs.length);
    }
  });

  it('6b. every finding traces to real signals; every signal accounted for', () => {
    for (const s of Object.values(SCENARIOS)) {
      const signals = signalsOf(s);
      const r = evaluateSocialFindings(signals);
      const byKey = new Map(signals.signals.map((x) => [x.signalKey, x]));
      expect(r.trace.map((t) => t.signalKey)).toEqual(signals.signals.map((x) => x.signalKey));
      for (const f of r.findings) {
        expect(f.sourceSignals.length).toBeGreaterThan(0);
        expect(f.evidence.map((e) => e.signalKey)).toEqual(f.sourceSignals);
        for (const e of f.evidence) {
          const signal = byKey.get(e.signalKey);
          expect(signal?.status).toBe(e.signalStatus);
          for (const [field, value] of Object.entries(e.values)) expect((signal?.evidence as Record<string, unknown>)[field]).toEqual(value);
        }
        const evidenceValues = f.evidence.flatMap((e) => Object.entries(e.values));
        for (const [p, v] of Object.entries(f.params)) expect(evidenceValues.some(([k, val]) => k === p && JSON.stringify(val) === JSON.stringify(v))).toBe(true);
      }
      for (const x of r.recommendations) {
        const f = r.findings.find((y) => y.findingKey === x.findingKey) as SocialFinding;
        expect(x.evidenceRefs).toEqual(f.sourceSignals);
        expect(f.recommendationKeys).toContain(x.recommendationKey);
      }
      for (const t of r.trace) if (t.findingKey) expect(keys(r)).toContain(t.findingKey);
      for (const t of r.trace.filter((x) => x.disposition === 'NO_FINDING')) {
        expect(['NOT_DETECTED', 'NOT_AVAILABLE']).toContain(t.signalStatus);
      }
    }
  });

  it('35. insufficient data remains informational (never ACTIVE, never above INFO)', () => {
    for (const r of reports()) {
      for (const f of r.findings) {
        if (f.status === 'INSUFFICIENT_DATA') expect(f).toMatchObject({ priority: 'INFO', sufficiency: 'INSUFFICIENT' });
        if (f.topic.endsWith('INSUFFICIENT') || f.topic === 'LIMITED_HISTORY') expect(f.status).toBe('INSUFFICIENT_DATA');
      }
    }
    const noDates = run(SCENARIOS.noTimestamps);
    expect(find(noDates, 'FACEBOOK_LIMITED_HISTORY').groupedFindings.map((g) => g.topic)).toContain('RECENCY_INSUFFICIENT');
  });

  it('36-37. NULL remains unavailable, real zero remains zero', () => {
    const r = run(snap([item('facebook', 1, { reaction_count: null, comment_count: 0, published_at: ago(5) }), item('instagram', 1, { reaction_count: 0, comment_count: 0, published_at: ago(5) })]));
    const ev = (key: SignalKey) => r.findings.flatMap((f) => f.evidence).find((e) => e.signalKey === key)?.values;
    expect(ev('FB_ENGAGEMENT_DATA_AVAILABLE')).toMatchObject({ reactionTotal: null, commentTotal: 0, reactionNullCount: 1 });
    expect(ev('IG_ENGAGEMENT_DATA_AVAILABLE')).toMatchObject({ reactionTotal: 0, commentTotal: 0, reactionNullCount: 0 });
    expect(formatSocialMessage('es', 'social.finding.LONG_INACTIVITY.summary', { thresholdDays: 31, daysSinceLastPost: null }, 'facebook')).toContain('—');
  });

  it('privacy: no post text, external ids, tokens or raw payloads in output', () => {
    const r = run(snap([item('facebook', 1, { text_content: 'SECRET_TEXT_MARKER', external_id: 'EXT_ID_MARKER' }), item('instagram', 1)]));
    const json = JSON.stringify(r);
    for (const marker of ['SECRET_TEXT_MARKER', 'EXT_ID_MARKER', 'access_token', 'external_id', 'text_content']) expect(json).not.toContain(marker);
  });
});

describe('A3.5.4.2 boundaries', () => {
  const root = resolve(__dirname, '../../../../..');
  const findingsDir = resolve(__dirname, '..');
  const findingsSources = readdirSync(findingsDir).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(findingsDir, f), 'utf8')).join('\n');

  it('30. no AI calls, network, clock or randomness', () => {
    expect(findingsSources).not.toMatch(/openai|gpt-|anthropic|prompt|fetch\(|functions\.invoke|graph\.facebook|Math\.random|Date\.now\(|new Date\(/i);
  });

  it('38. frozen A3.5.4.1 contract unchanged (file fingerprints)', () => {
    const dir = resolve(__dirname, '../..');
    const hash = (f: string) => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
    expect({ types: hash('types.ts'), policy: hash('policy.ts'), signals: hash('signals.ts'), engine: hash('engine.ts') }).toEqual({
      types: '2061f89f166f9333f44693944a798cd0af43dfe1d77ba4036ec44c1b849b5808',
      policy: '45604a0cfa549fc198751dccf5a4676b27e32200ef1d63e5ceb5c91b041a9f07',
      signals: 'c9aaf99d719c1537208e90b19d7af9b187da840ec6ca79f4b9dc8311ecbdf0ed',
      engine: '457d613c24f768c0faec6219890aee3154d9dbf659ef9c9782ee11fb319f5fef',
    });
    expect(findingsSources).not.toMatch(/from '\.\.\/(signals|policy|engine)'/);
  });

  it('39. no persistence: no database access, no new migrations', () => {
    expect(findingsSources).not.toMatch(/supabase|\.from\(|\.insert\(|\.upsert\(|\.rpc\(|localStorage|indexedDB/i);
    const migrations = readdirSync(join(root, 'supabase/migrations')).sort();
    expect(migrations[migrations.length - 1]).toBe('20261022170523_a353_meta_sync_claim_min_interval.sql');
  });

  it('40. no integration with other product layers', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const outside = walk(join(root, 'src')).filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes(join('features', 'social-intelligence')));
    // A3.5.4.3: the only approved external reference is the lazy route import of the UI page in App.tsx.
    const approvedImport = "const SocialIntelligencePage = lazy(() => import('./features/social-intelligence/ui/SocialIntelligencePage'));";
    const appPath = join(root, 'src', 'App.tsx');
    for (const file of outside) {
      let text = readFileSync(file, 'utf8');
      if (file === appPath) {
        expect(text.split(approvedImport).length - 1).toBe(1);
        expect(text.match(/SocialIntelligencePage/g)).toHaveLength(3);
        expect(text).toContain('<Route path="/herramientas/social" element={<SocialIntelligencePage />} />');
        text = text.replace(approvedImport, '');
      }
      expect(text, file).not.toMatch(/social-intelligence/);
    }
    expect(findingsSources).not.toMatch(/action-layer|today-intelligence|business-advisor|digital-twin|weekly|roadmap|from 'react'/i);
  });
});

describe('A3.5.4.2 real production data validation', () => {
  it('current snapshot at 18:00Z produces a conservative output', () => {
    const r = run(REAL_SNAPSHOT);
    expect(r.findings.map((f) => [f.findingKey, f.status, f.priority])).toEqual([
      ['FACEBOOK_TEXT_MISSING', 'ACTIVE', 'LOW'],
      ['FACEBOOK_LIMITED_HISTORY', 'INSUFFICIENT_DATA', 'INFO'],
      ['INSTAGRAM_LIMITED_HISTORY', 'INSUFFICIENT_DATA', 'INFO'],
      ['FACEBOOK_RECENT_ACTIVITY', 'INFORMATIONAL', 'INFO'],
      ['INSTAGRAM_RECENT_ACTIVITY', 'INFORMATIONAL', 'INFO'],
      ['FACEBOOK_ENGAGEMENT_METRICS_UNAVAILABLE', 'NOT_AVAILABLE', 'INFO'],
    ]);
    expect(r.recommendations.map((x) => [x.recommendationKey, x.platform, x.safetyClass, x.priority, x.actionType])).toEqual([
      ['REVIEW_POSTS_WITHOUT_TEXT', 'facebook', 'DIRECT', 'LOW', 'REVIEW'],
      ['WAIT_FOR_MORE_HISTORY', 'facebook', 'DIRECT', 'INFO', 'WAIT_FOR_MORE_DATA'],
      ['WAIT_FOR_MORE_HISTORY', 'instagram', 'DIRECT', 'INFO', 'WAIT_FOR_MORE_DATA'],
    ]);
    expect(r.findings.some((f) => f.platform === 'cross_platform')).toBe(false);
  });

  it('same snapshot at 22:30Z: activity becomes intermediate, recommendations unchanged', () => {
    const r = run(REAL_SNAPSHOT, '2026-10-22T22:30:00.000Z');
    expect(keys(r)).toContain('FACEBOOK_INTERMEDIATE_ACTIVITY');
    expect(keys(r)).toContain('INSTAGRAM_INTERMEDIATE_ACTIVITY');
    expect(r.recommendations.map((x) => x.recommendationKey)).toEqual(['REVIEW_POSTS_WITHOUT_TEXT', 'WAIT_FOR_MORE_HISTORY', 'WAIT_FOR_MORE_HISTORY']);
  });
});
