import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_ITEMS, MAX_PAGES } from '../../../../supabase/functions/meta-read/handler.ts';
import { evaluateSocialSignals, SOCIAL_SIGNALS_ENGINE_VERSION } from '../engine';
import { DAY_MS, FRESHNESS_POLICY, HOUR_MS, RECENCY_POLICY, SYNC_WINDOW } from '../policy';
import type {
  ContentType,
  SignalKey,
  SocialConnectionInput,
  SocialContentItemInput,
  SocialPlatform,
  SocialSignalsReport,
  SocialSnapshot,
  SocialSyncStateInput,
  SyncStatus,
} from '../types';

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

const run = (s: SocialSnapshot, at: string | Date = NOW) => evaluateSocialSignals(s, at);
const sig = (r: SocialSignalsReport, key: SignalKey) => {
  const found = r.signals.find((s) => s.signalKey === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
};
const series = (platform: SocialPlatform, count: number, everyDays: number, startDaysAgo = 1) =>
  Array.from({ length: count }, (_, i) => item(platform, i, { published_at: ago(startDaysAgo + i * everyDays) }));

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

const SCENARIOS: SocialSnapshot[] = [
  REAL_SNAPSHOT,
  snap([...series('facebook', 12, 3), ...series('instagram', 10, 4)]),
  snap([], [sync('facebook', { status: 'empty' }), sync('instagram', { status: 'rate_limited', error_code: 'META_4' })]),
  snap([item('facebook', 1, { published_at: ago(90) })], [sync('facebook', { last_success_at: ago(20) }), sync('instagram')]),
  snap([], [], conn({ status: 'reauth_required' })),
];

describe('A3.5.4.1 recency', () => {
  it('1. Facebook recent activity', () => {
    const r = run(snap([item('facebook', 1, { published_at: ago(2) })]));
    expect(sig(r, 'FB_RECENT_ACTIVITY')).toMatchObject({ status: 'DETECTED', severity: 'INFO', platform: 'facebook', dimension: 'recency' });
    expect(sig(r, 'FB_RECENT_ACTIVITY').evidence).toMatchObject({ daysSinceLastPost: 2, thresholdDays: 7, newestObservedPostAt: ago(2) });
    expect(sig(r, 'FB_LONG_INACTIVITY').status).toBe('NOT_DETECTED');
  });

  it('2. Facebook long inactivity', () => {
    const r = run(snap([item('facebook', 1, { published_at: ago(45) })]));
    expect(sig(r, 'FB_LONG_INACTIVITY')).toMatchObject({ status: 'DETECTED', severity: 'MEDIUM' });
    expect(sig(r, 'FB_LONG_INACTIVITY').evidence.daysSinceLastPost).toBe(45);
    expect(sig(r, 'FB_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
    expect(r.platforms.facebook.activityState).toBe('old');
  });

  it('3. Instagram recent activity', () => {
    const r = run(snap([item('instagram', 1, { published_at: ago(0, 5) })]));
    expect(sig(r, 'IG_RECENT_ACTIVITY').status).toBe('DETECTED');
    expect(r.platforms.instagram.activityState).toBe('recent');
  });

  it('4. Instagram long inactivity', () => {
    const r = run(snap([item('instagram', 1, { published_at: ago(31) })]));
    expect(sig(r, 'IG_LONG_INACTIVITY').status).toBe('DETECTED');
  });

  it('between thresholds produces no strong conclusion', () => {
    const r = run(snap([item('facebook', 1, { published_at: ago(15) })]));
    expect(sig(r, 'FB_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
    expect(sig(r, 'FB_LONG_INACTIVITY').status).toBe('NOT_DETECTED');
    expect(r.platforms.facebook.activityState).toBe('intermediate');
  });

  it('items without timestamps are insufficient context, not inactivity', () => {
    const r = run(snap([item('facebook', 1, { published_at: null })]));
    expect(sig(r, 'FB_LONG_INACTIVITY')).toMatchObject({ status: 'INSUFFICIENT', reason: 'NO_TIMESTAMPS' });
    expect(r.platforms.facebook.activityState).toBe('insufficient_context');
  });
});

describe('A3.5.4.1 activity and frequency', () => {
  it('5. No content means no content found, not abandonment', () => {
    const r = run(snap([], [sync('facebook', { status: 'empty', item_count: 0 }), sync('instagram', { status: 'empty', item_count: 0 })]));
    expect(sig(r, 'FB_NO_CONTENT')).toMatchObject({ status: 'DETECTED', severity: 'LOW', dimension: 'activity' });
    expect(sig(r, 'FB_LONG_INACTIVITY')).toMatchObject({ status: 'INSUFFICIENT', reason: 'NO_DATA' });
    expect(sig(r, 'IG_NO_CONTENT').status).toBe('DETECTED');
    expect(r.platforms.facebook.activityState).toBe('no_content');
  });

  it('6. One post -> frequency insufficient', () => {
    const r = run(snap([item('instagram', 1)]));
    expect(sig(r, 'IG_FREQUENCY_OBSERVED')).toMatchObject({ status: 'INSUFFICIENT', reason: 'SAMPLE_TOO_SMALL' });
    expect(sig(r, 'IG_FREQUENCY_OBSERVED').evidence.medianIntervalDays).toBeUndefined();
  });

  it('7. Multiple posts in a very short window -> frequency insufficient', () => {
    const r = run(snap([0, 5, 20].map((m, i) => item('facebook', i, { published_at: new Date(NOW_MS - 3 * DAY_MS + m * 60000).toISOString() }))));
    expect(sig(r, 'FB_FREQUENCY_OBSERVED')).toMatchObject({ status: 'INSUFFICIENT', reason: 'WINDOW_TOO_SHORT' });
    expect(sig(r, 'FB_FREQUENCY_OBSERVED').evidence.postsPer30Days).toBeUndefined();
  });

  it('limited sample (3-7 posts over 7+ days) stays insufficient', () => {
    const r = run(snap(series('facebook', 5, 3)));
    expect(sig(r, 'FB_FREQUENCY_OBSERVED')).toMatchObject({ status: 'INSUFFICIENT', reason: 'SAMPLE_TOO_SMALL' });
    expect(sig(r, 'FB_FREQUENCY_OBSERVED').evidence.sampleSufficiency).toBe('LIMITED');
  });

  it('8. Sufficient sample -> deterministic frequency calculation', () => {
    const r = run(snap(series('facebook', 10, 4)));
    const f = sig(r, 'FB_FREQUENCY_OBSERVED');
    expect(f).toMatchObject({ status: 'DETECTED', severity: null });
    expect(f.evidence).toMatchObject({ postsWithTimestamp: 10, observedSpanDays: 36, medianIntervalDays: 4, postsPer30Days: 7.5, sampleSufficiency: 'SUFFICIENT', windowTruncated: false });
  });

  it('full sync window is flagged as truncated', () => {
    const r = run(snap(series('facebook', 10, 4), [sync('facebook', { item_count: SYNC_WINDOW.maxItems, pages_fetched: 4 }), sync('instagram')]));
    expect(sig(r, 'FB_FREQUENCY_OBSERVED').evidence.windowTruncated).toBe(true);
  });
});

describe('A3.5.4.1 engagement availability', () => {
  const fbNull = snap([1, 2, 3].map((n) => item('facebook', n, { reaction_count: null, comment_count: null })));

  it('9. FB reaction_count NULL remains unavailable', () => {
    const e = sig(run(fbNull), 'FB_ENGAGEMENT_DATA_AVAILABLE');
    expect(e).toMatchObject({ status: 'NOT_AVAILABLE', reason: 'METRICS_NULL' });
    expect(e.evidence).toMatchObject({ reactionNullCount: 3, reactionObservedCount: 0, reactionTotal: null });
  });

  it('10. FB comment_count NULL remains unavailable', () => {
    const e = sig(run(fbNull), 'FB_ENGAGEMENT_DATA_AVAILABLE');
    expect(e.evidence).toMatchObject({ commentNullCount: 3, commentObservedCount: 0, commentTotal: null, availableEngagementCount: 0 });
  });

  it('11-12. IG like_count and comments_count = 0 remain real zeros', () => {
    const e = sig(run(snap([item('instagram', 1, { reaction_count: 0, comment_count: 0 })])), 'IG_ENGAGEMENT_DATA_AVAILABLE');
    expect(e.evidence).toMatchObject({ reactionTotal: 0, commentTotal: 0, reactionObservedCount: 1, commentObservedCount: 1, reactionNullCount: 0 });
    expect(e.status).toBe('INSUFFICIENT');
  });

  it('enough real metrics -> engagement data available (no quality judgement)', () => {
    const e = sig(run(snap(series('instagram', 12, 3, 3))), 'IG_ENGAGEMENT_DATA_AVAILABLE');
    expect(e).toMatchObject({ status: 'DETECTED', severity: null });
    expect(e.evidence.sampleSufficiency).toBe('SUFFICIENT');
  });

  it('posts younger than 48h are not eligible', () => {
    const e = sig(run(snap(series('instagram', 12, 0.1, 0))), 'IG_ENGAGEMENT_DATA_AVAILABLE');
    expect(e.evidence.eligibleEngagementCount).toBe(0);
    expect(e.status).toBe('INSUFFICIENT');
  });
});

describe('A3.5.4.1 content completeness and type', () => {
  it('13. Missing Facebook text', () => {
    const r = run(snap([item('facebook', 1, { text_content: null }), item('facebook', 2, { text_content: '   ' }), item('facebook', 3)]));
    const s = sig(r, 'FB_CONTENT_TEXT_MISSING');
    expect(s).toMatchObject({ status: 'DETECTED', severity: 'INFO', dimension: 'content_completeness' });
    expect(s.evidence).toMatchObject({ observedPostCount: 3, postsWithText: 1, postsWithoutText: 2, sampleSufficiency: 'LIMITED' });
  });

  it('14. Missing Instagram caption', () => {
    const r = run(snap([item('instagram', 1, { text_content: null }), item('instagram', 2)]));
    expect(sig(r, 'IG_CAPTION_MISSING')).toMatchObject({ status: 'DETECTED' });
  });

  it('existing caption is not reported as missing', () => {
    expect(sig(run(snap([item('instagram', 1)])), 'IG_CAPTION_MISSING').status).toBe('NOT_DETECTED');
  });

  it('15. Mixed content types with sufficient sample', () => {
    const types: ContentType[] = ['image', 'reel', 'carousel', 'image', 'image', 'reel', 'image', 'carousel'];
    const r = run(snap(types.map((t, i) => item('instagram', i, { content_type: t }))));
    const s = sig(r, 'IG_CONTENT_TYPE_VARIETY');
    expect(s.status).toBe('DETECTED');
    expect(s.evidence).toMatchObject({ contentTypes: { carousel: 2, image: 4, reel: 2 }, distinctContentTypes: 3 });
  });

  it('16. Content-type sample insufficient', () => {
    const s = sig(run(snap([item('facebook', 1), item('facebook', 2, { content_type: 'video' })])), 'FB_CONTENT_TYPE_VARIETY');
    expect(s).toMatchObject({ status: 'INSUFFICIENT', reason: 'SAMPLE_TOO_SMALL' });
    expect(s.evidence.contentTypes).toEqual({ photo: 1, video: 1 });
  });
});

describe('A3.5.4.1 freshness', () => {
  const one = (lastSuccess: string) => snap([item('facebook', 1, { published_at: ago(2) })], [sync('facebook', { last_success_at: lastSuccess }), sync('instagram')]);

  it('17. Fresh data', () => {
    const r = run(one(ago(0, 23)));
    expect(r.platforms.facebook.freshness).toBe('FRESH');
    expect(sig(r, 'FB_RECENT_ACTIVITY')).toMatchObject({ status: 'DETECTED', freshness: 'FRESH' });
  });

  it('18. Aging data keeps signals but marks freshness', () => {
    const r = run(one(ago(3)));
    expect(r.platforms.facebook.freshness).toBe('AGING');
    expect(sig(r, 'FB_RECENT_ACTIVITY')).toMatchObject({ status: 'DETECTED', freshness: 'AGING' });
  });

  it('19. Stale data never looks current', () => {
    const r = run(one(ago(8)));
    const s = sig(r, 'FB_RECENT_ACTIVITY');
    expect(s).toMatchObject({ status: 'STALE', lastKnownStatus: 'DETECTED', severity: null, reason: 'STALE_DATA', freshness: 'STALE' });
    expect(s.evidence.lastSuccessAt).toBe(ago(8));
    expect(r.platforms.facebook.activityState).toBe('not_evaluable');
  });

  it('freshness boundaries are exact', () => {
    expect(run(one(ago(0, FRESHNESS_POLICY.freshMaxHours))).platforms.facebook.freshness).toBe('FRESH');
    expect(run(one(ago(7))).platforms.facebook.freshness).toBe('AGING');
    expect(run(one(new Date(NOW_MS - 7 * DAY_MS - 1).toISOString())).platforms.facebook.freshness).toBe('STALE');
    expect(RECENCY_POLICY).toEqual({ recentMaxDays: 7, longInactivityMinDays: 31 });
  });
});

describe('A3.5.4.1 technical states never become business signals', () => {
  const oldPost = [item('instagram', 1, { published_at: ago(90) }), item('facebook', 1, { published_at: ago(90) })];
  const businessKeys: SignalKey[] = ['IG_LONG_INACTIVITY', 'IG_NO_CONTENT', 'IG_RECENT_ACTIVITY', 'IG_FREQUENCY_OBSERVED', 'IG_CAPTION_MISSING'];

  it.each([
    ['20. sync error (api_error)', 'api_error', 'SYNC_ERROR'],
    ['20b. malformed', 'malformed', 'SYNC_ERROR'],
    ['21. reauth_required', 'reauth_required', 'REAUTH_REQUIRED'],
    ['22. rate limit', 'rate_limited', 'RATE_LIMITED'],
    ['permission unavailable', 'permission_unavailable', 'PERMISSION_UNAVAILABLE'],
  ])('%s does not become inactivity', (_label, status, reason) => {
    const r = run(snap(oldPost, [sync('facebook'), sync('instagram', { status, error_code: 'META_X', last_success_at: ago(1) })]));
    for (const k of businessKeys) expect(sig(r, k)).toMatchObject({ status: 'NOT_AVAILABLE', reason, severity: null });
    expect(sig(r, 'IG_LONG_INACTIVITY').evidence).toEqual({ lastSuccessAt: ago(1), syncStatus: status, errorCode: 'META_X' });
    expect(r.platforms.instagram.activityState).toBe('not_evaluable');
  });

  it('23. one platform error + other OK', () => {
    const r = run(snap(oldPost, [sync('facebook'), sync('instagram', { status: 'rate_limited' })]));
    expect(sig(r, 'FB_LONG_INACTIVITY').status).toBe('DETECTED');
    expect(sig(r, 'IG_LONG_INACTIVITY').status).toBe('NOT_AVAILABLE');
    expect(sig(r, 'PLATFORM_RECENCY_DIFFERENCE')).toMatchObject({ status: 'NOT_AVAILABLE', reason: 'RATE_LIMITED' });
  });

  it('expired connection token blocks both platforms', () => {
    const r = run(snap(oldPost, undefined, conn({ status: 'reauth_required' })));
    expect(r.signals.every((s) => s.status === 'NOT_AVAILABLE' && s.reason === 'REAUTH_REQUIRED')).toBe(true);
  });

  it('Instagram not linked is neutral and not evaluated', () => {
    const r = run(snap(oldPost, [sync('facebook'), sync('instagram', { status: 'not_linked', last_success_at: null })], conn({ instagram_status: 'not_associated' })));
    expect(sig(r, 'IG_NO_CONTENT')).toMatchObject({ status: 'NOT_AVAILABLE', reason: 'NOT_LINKED' });
    expect(sig(r, 'FB_LONG_INACTIVITY').status).toBe('DETECTED');
  });

  it('never synced / disconnected / missing row', () => {
    expect(run(snap([], [sync('facebook', { status: 'never', last_success_at: null })])).platforms.facebook.blockedReason).toBe('NEVER_SYNCED');
    expect(run(snap([], [])).platforms.instagram.blockedReason).toBe('NEVER_SYNCED');
    expect(run(snap([], [], null)).platforms.facebook.blockedReason).toBe('NOT_CONNECTED');
    expect(run(snap([], [], conn({ status: 'disconnected' }))).platforms.facebook.blockedReason).toBe('NOT_CONNECTED');
  });

  it('Instagram connected but empty is NO_DATA, distinct from not linked', () => {
    const r = run(snap([], [sync('facebook'), sync('instagram', { status: 'empty', item_count: 0 })]));
    expect(sig(r, 'IG_NO_CONTENT').status).toBe('DETECTED');
    expect(r.platforms.instagram.blockedReason).toBeNull();
  });
});

describe('A3.5.4.1 cross-platform', () => {
  it('24. comparison with sufficient fresh data', () => {
    const r = run(snap([item('facebook', 1, { published_at: ago(2) }), item('instagram', 1, { published_at: ago(45) })]));
    expect(sig(r, 'FB_ONLY_RECENT_ACTIVITY')).toMatchObject({ status: 'DETECTED', platform: 'cross_platform', severity: 'INFO' });
    expect(sig(r, 'IG_ONLY_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
    const d = sig(r, 'PLATFORM_RECENCY_DIFFERENCE');
    expect(d.status).toBe('DETECTED');
    expect(d.evidence).toMatchObject({ facebookDaysSinceLastPost: 2, instagramDaysSinceLastPost: 45, recencyDifferenceDays: 43, thresholdDays: 30 });
  });

  it('25. insufficient sample on one platform -> INSUFFICIENT', () => {
    const r = run(snap([item('facebook', 1, { published_at: ago(2) })], [sync('facebook'), sync('instagram', { status: 'empty', item_count: 0 })]));
    for (const k of ['FB_ONLY_RECENT_ACTIVITY', 'IG_ONLY_RECENT_ACTIVITY', 'PLATFORM_RECENCY_DIFFERENCE'] as SignalKey[]) {
      expect(sig(r, k)).toMatchObject({ status: 'INSUFFICIENT', reason: 'NO_DATA' });
    }
  });

  it('stale platform makes cross-platform stale', () => {
    const r = run(snap([item('facebook', 1, { published_at: ago(2) }), item('instagram', 1, { published_at: ago(45) })], [sync('facebook'), sync('instagram', { last_success_at: ago(10) })]));
    expect(sig(r, 'PLATFORM_RECENCY_DIFFERENCE')).toMatchObject({ status: 'STALE', lastKnownStatus: 'DETECTED', freshness: 'STALE' });
  });
});

const agoExact = (days: number, hours = 0, minutes = 0) => new Date(NOW_MS - days * DAY_MS - hours * HOUR_MS - minutes * 60000).toISOString();
const pair = (fbAge: string, igAge: string) =>
  run(snap([item('facebook', 1, { published_at: fbAge }), item('instagram', 1, { published_at: igAge })]));

describe('A3.5.4.1.2 recency boundaries (whole elapsed days)', () => {
  const cases: [string, number, number, number, number, 'DETECTED' | 'NOT_DETECTED', 'DETECTED' | 'NOT_DETECTED', string][] = [
    ['6d 23h', 6, 23, 0, 6, 'DETECTED', 'NOT_DETECTED', 'recent'],
    ['7d 00h', 7, 0, 0, 7, 'DETECTED', 'NOT_DETECTED', 'recent'],
    ['7d 19h', 7, 19, 0, 7, 'DETECTED', 'NOT_DETECTED', 'recent'],
    ['7d 23h59m', 7, 23, 59, 7, 'DETECTED', 'NOT_DETECTED', 'recent'],
    ['8d 00h', 8, 0, 0, 8, 'NOT_DETECTED', 'NOT_DETECTED', 'intermediate'],
    ['29d', 29, 0, 0, 29, 'NOT_DETECTED', 'NOT_DETECTED', 'intermediate'],
    ['30d 00h', 30, 0, 0, 30, 'NOT_DETECTED', 'NOT_DETECTED', 'intermediate'],
    ['30d 23h59m', 30, 23, 59, 30, 'NOT_DETECTED', 'NOT_DETECTED', 'intermediate'],
    ['31d 00h', 31, 0, 0, 31, 'NOT_DETECTED', 'DETECTED', 'old'],
    ['31d 12h', 31, 12, 0, 31, 'NOT_DETECTED', 'DETECTED', 'old'],
    ['45d', 45, 0, 0, 45, 'NOT_DETECTED', 'DETECTED', 'old'],
  ];

  it.each(cases)('Facebook %s', (_l, d, h, m, days, recent, long, state) => {
    const r = run(snap([item('facebook', 1, { published_at: agoExact(d, h, m) })]));
    expect(sig(r, 'FB_RECENT_ACTIVITY')).toMatchObject({ status: recent, evidence: { daysSinceLastPost: days, thresholdDays: 7 } });
    expect(sig(r, 'FB_LONG_INACTIVITY')).toMatchObject({ status: long, evidence: { daysSinceLastPost: days, thresholdDays: 31 } });
    expect(r.platforms.facebook.activityState).toBe(state);
  });

  it.each(cases)('Instagram %s', (_l, d, h, m, days, recent, long, state) => {
    const r = run(snap([item('instagram', 1, { published_at: agoExact(d, h, m) })]));
    expect(sig(r, 'IG_RECENT_ACTIVITY')).toMatchObject({ status: recent, evidence: { daysSinceLastPost: days, thresholdDays: 7 } });
    expect(sig(r, 'IG_LONG_INACTIVITY')).toMatchObject({ status: long, evidence: { daysSinceLastPost: days, thresholdDays: 31 } });
    expect(r.platforms.instagram.activityState).toBe(state);
  });

  it('cross-platform recency uses the same whole days', () => {
    let r = pair(agoExact(7, 23, 59), agoExact(8));
    expect(sig(r, 'FB_ONLY_RECENT_ACTIVITY')).toMatchObject({ status: 'DETECTED', evidence: { facebookDaysSinceLastPost: 7, instagramDaysSinceLastPost: 8, thresholdDays: 7 } });
    expect(sig(r, 'IG_ONLY_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
    r = pair(agoExact(8), agoExact(7, 19));
    expect(sig(r, 'IG_ONLY_RECENT_ACTIVITY').status).toBe('DETECTED');
    expect(sig(r, 'FB_ONLY_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
    r = pair(agoExact(7, 23, 59), agoExact(7, 0, 1));
    expect(sig(r, 'FB_ONLY_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
    expect(sig(r, 'IG_ONLY_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
  });

  it('platform recency difference is |fbDays - igDays| on whole days, threshold 30 inclusive', () => {
    let d = sig(pair(agoExact(0, 1), agoExact(30, 23, 59)), 'PLATFORM_RECENCY_DIFFERENCE');
    expect(d).toMatchObject({ status: 'DETECTED', evidence: { facebookDaysSinceLastPost: 0, instagramDaysSinceLastPost: 30, recencyDifferenceDays: 30, thresholdDays: 30 } });
    d = sig(pair(agoExact(1), agoExact(30, 23, 59)), 'PLATFORM_RECENCY_DIFFERENCE');
    expect(d).toMatchObject({ status: 'NOT_DETECTED', evidence: { recencyDifferenceDays: 29 } });
  });

  it('evidence never contradicts the decision (sweep 0-40 days, 7h steps)', () => {
    for (let h = 0; h <= 40 * 24; h += 7) {
      const r = pair(agoExact(0, h), agoExact(0, 40 * 24 - h));
      for (const p of ['FB', 'IG'] as const) {
        const recent = sig(r, `${p}_RECENT_ACTIVITY`);
        const long = sig(r, `${p}_LONG_INACTIVITY`);
        const days = recent.evidence.daysSinceLastPost as number;
        expect(recent.status === 'DETECTED').toBe(days <= (recent.evidence.thresholdDays as number));
        expect(long.status === 'DETECTED').toBe(days >= (long.evidence.thresholdDays as number));
        expect(long.status === 'DETECTED').toBe(days >= 31);
        const state = r.platforms[p === 'FB' ? 'facebook' : 'instagram'].activityState;
        expect(state).toBe(days <= 7 ? 'recent' : days >= 31 ? 'old' : 'intermediate');
      }
      const fbOnly = sig(r, 'FB_ONLY_RECENT_ACTIVITY');
      const igOnly = sig(r, 'IG_ONLY_RECENT_ACTIVITY');
      const diff = sig(r, 'PLATFORM_RECENCY_DIFFERENCE');
      const fbDays = fbOnly.evidence.facebookDaysSinceLastPost as number;
      const igDays = fbOnly.evidence.instagramDaysSinceLastPost as number;
      expect(fbDays).toBe(sig(r, 'FB_RECENT_ACTIVITY').evidence.daysSinceLastPost);
      expect(igDays).toBe(sig(r, 'IG_RECENT_ACTIVITY').evidence.daysSinceLastPost);
      expect(fbOnly.status === 'DETECTED').toBe(fbDays <= 7 && igDays > 7);
      expect(igOnly.status === 'DETECTED').toBe(igDays <= 7 && fbDays > 7);
      expect(diff.evidence.recencyDifferenceDays).toBe(Math.abs(fbDays - igDays));
      expect(diff.status === 'DETECTED').toBe(Math.abs(fbDays - igDays) >= (diff.evidence.thresholdDays as number));
    }
  });

  it('whole days are elapsed-time based, not calendar dates (midnight crossing)', () => {
    const at = '2026-10-22T00:30:00.000Z';
    const r = run(snap([item('facebook', 1, { published_at: '2026-10-14T23:59:00.000Z' })]), at);
    expect(sig(r, 'FB_RECENT_ACTIVITY')).toMatchObject({ status: 'DETECTED', evidence: { daysSinceLastPost: 7 } });
  });
});

const FORBIDDEN_RECOMMENDATION = /\b(deber[ií]as|recomend\w*|publica|mejora|haz|conviene|should|recommend\w*|improve)\b/i;
const FORBIDDEN_SCORE = /score|health|rating|stars|ranking|benchmark|percentile/i;
const FORBIDDEN_METRIC = /reach|impression|views|saves|shares|follower|growth|conversion|sales|revenue|competitor|competencia|ventas|clientes/i;

describe('A3.5.4.1 output guarantees', () => {
  it('26. no trends generated', () => {
    for (const s of SCENARIOS) {
      for (const t of run(s).signals.filter((x) => x.dimension === 'trend')) {
        expect(t.status).toBe('NOT_AVAILABLE');
        expect(t.lastKnownStatus).toBeNull();
      }
    }
  });

  it('27-28, 32-34. no score, recommendations, unsupported metrics, competitor or sales claims', () => {
    for (const s of SCENARIOS) {
      const json = JSON.stringify(run(s));
      expect(json).not.toMatch(FORBIDDEN_RECOMMENDATION);
      expect(json).not.toMatch(FORBIDDEN_SCORE);
      expect(json).not.toMatch(FORBIDDEN_METRIC);
    }
  });

  it('29-30. deterministic, same input -> same output, input not mutated', () => {
    for (const s of SCENARIOS) {
      const frozen = JSON.stringify(s);
      expect(JSON.stringify(run(s))).toBe(JSON.stringify(run(JSON.parse(frozen))));
      expect(JSON.stringify(s)).toBe(frozen);
    }
    const shuffled = { ...REAL_SNAPSHOT, items: [...REAL_SNAPSHOT.items].reverse(), syncStates: [...REAL_SNAPSHOT.syncStates].reverse() };
    expect(run(shuffled)).toEqual(run(REAL_SNAPSHOT));
    expect(run(REAL_SNAPSHOT, NOW).evaluatedAt).toBe(NOW);
    expect(run(REAL_SNAPSHOT, new Date(NOW)).evaluatedAt).toBe(NOW);
    expect(() => run(REAL_SNAPSHOT, 'not-a-date')).toThrow('INVALID_EVALUATED_AT');
  });

  it('stable signal collection: same keys in same order for every scenario', () => {
    const keys = run(SCENARIOS[0]).signals.map((s) => s.signalKey);
    expect(keys).toHaveLength(19);
    for (const s of SCENARIOS) expect(run(s).signals.map((x) => x.signalKey)).toEqual(keys);
  });

  it('31. NULL is never 0', () => {
    const r = run(snap([item('facebook', 1, { reaction_count: null, comment_count: 4 }), item('facebook', 2, { reaction_count: null, comment_count: null })]));
    const e = sig(r, 'FB_ENGAGEMENT_DATA_AVAILABLE').evidence;
    expect(e.reactionTotal).toBeNull();
    expect(e.commentTotal).toBe(4);
    expect(e.commentNullCount).toBe(1);
    expect(e.availableEngagementCount).toBe(0);
  });

  it('severity only on detected signals', () => {
    for (const s of SCENARIOS) {
      for (const x of run(s).signals) if (x.status !== 'DETECTED') expect(x.severity).toBeNull();
    }
  });

  it('evidence never contains post text or external ids', () => {
    const json = JSON.stringify(run(snap([item('facebook', 1, { text_content: 'SECRET_TEXT_MARKER' })])));
    expect(json).not.toContain('SECRET_TEXT_MARKER');
    expect(json).not.toContain('facebook_1');
  });
});

describe('A3.5.4.1 real production data validation', () => {
  const r = run(REAL_SNAPSHOT, NOW);

  it('Facebook frequency = INSUFFICIENT (3 posts in 20 minutes)', () => {
    expect(sig(r, 'FB_FREQUENCY_OBSERVED')).toMatchObject({ status: 'INSUFFICIENT', reason: 'WINDOW_TOO_SHORT' });
    expect(sig(r, 'FB_FREQUENCY_OBSERVED').evidence).toMatchObject({ postsWithTimestamp: 3, observedSpanDays: 0 });
  });

  it('Instagram frequency = INSUFFICIENT (1 item)', () => {
    expect(sig(r, 'IG_FREQUENCY_OBSERVED')).toMatchObject({ status: 'INSUFFICIENT', reason: 'SAMPLE_TOO_SMALL' });
  });

  it('Facebook engagement = NOT_AVAILABLE, Instagram keeps real zeros', () => {
    expect(sig(r, 'FB_ENGAGEMENT_DATA_AVAILABLE')).toMatchObject({ status: 'NOT_AVAILABLE', reason: 'METRICS_NULL' });
    expect(sig(r, 'IG_ENGAGEMENT_DATA_AVAILABLE').evidence).toMatchObject({ reactionTotal: 0, commentTotal: 0 });
    expect(sig(r, 'IG_ENGAGEMENT_DATA_AVAILABLE').status).toBe('INSUFFICIENT');
  });

  it('Facebook 2 of 3 without text; Instagram caption present', () => {
    expect(sig(r, 'FB_CONTENT_TEXT_MISSING').evidence).toMatchObject({ postsWithText: 1, postsWithoutText: 2 });
    expect(sig(r, 'IG_CAPTION_MISSING').status).toBe('NOT_DETECTED');
  });

  it('fresh data, 7 whole days since last post: recent, not long inactivity', () => {
    expect(r.platforms.facebook.freshness).toBe('FRESH');
    expect(r.platforms.instagram.freshness).toBe('FRESH');
    expect(sig(r, 'FB_RECENT_ACTIVITY')).toMatchObject({ status: 'DETECTED', severity: 'INFO', evidence: { daysSinceLastPost: 7, thresholdDays: 7 } });
    expect(sig(r, 'IG_RECENT_ACTIVITY')).toMatchObject({ status: 'DETECTED', severity: 'INFO', evidence: { daysSinceLastPost: 7, thresholdDays: 7 } });
    expect(sig(r, 'FB_LONG_INACTIVITY').status).toBe('NOT_DETECTED');
    expect(sig(r, 'IG_LONG_INACTIVITY').status).toBe('NOT_DETECTED');
    expect(r.platforms.facebook.activityState).toBe('recent');
    expect(r.platforms.instagram.activityState).toBe('recent');
    expect(sig(r, 'FB_ONLY_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
    expect(sig(r, 'IG_ONLY_RECENT_ACTIVITY').status).toBe('NOT_DETECTED');
    expect(sig(r, 'FB_CONTENT_TYPE_VARIETY')).toMatchObject({ status: 'INSUFFICIENT', evidence: { contentTypes: { photo: 3 } } });
    expect(sig(r, 'PLATFORM_RECENCY_DIFFERENCE').status).toBe('NOT_DETECTED');
  });
});

describe('A3.5.4.1 boundaries and frozen contracts', () => {
  const dir = resolve(__dirname, '..');
  const sources = ['types.ts', 'policy.ts', 'signals.ts', 'engine.ts'].map((f) => readFileSync(resolve(dir, f), 'utf8')).join('\n');

  it('engine has no network, AI, database, token, randomness or implicit clock access', () => {
    expect(sources).not.toMatch(/fetch\(|graph\.facebook|openai|gpt-|supabase|functions\.invoke|access_token|appsecret|Math\.random|Date\.now\(|new Date\(\)/i);
    expect(sources).not.toMatch(FORBIDDEN_SCORE);
    expect(sources).not.toMatch(/last_synced_at/);
  });

  it('35. A3.5.3 contracts remain aligned', () => {
    expect(SYNC_WINDOW).toEqual({ maxItems: MAX_ITEMS, maxPages: MAX_PAGES });
    const migration = readFileSync(resolve(dir, '../../../supabase/migrations/20261022170333_a353_meta_read_layer.sql'), 'utf8');
    const list = (re: RegExp) => (migration.match(re)?.[1] ?? '').split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    const statuses: SyncStatus[] = ['never', 'ok', 'empty', 'not_linked', 'permission_unavailable', 'reauth_required', 'rate_limited', 'malformed', 'api_error'];
    const types: ContentType[] = ['post', 'photo', 'video', 'link', 'status', 'event', 'image', 'carousel', 'reel', 'other'];
    expect(list(/status text NOT NULL DEFAULT 'never' CHECK \(status IN \(([^)]*)\)\)/)).toEqual([...statuses].sort());
    expect(list(/content_type text NOT NULL CHECK \(content_type IN \(([^)]*)\)\)/)).toEqual([...types].sort());
    expect(SOCIAL_SIGNALS_ENGINE_VERSION).toBe('a3541-1');
  });
});
