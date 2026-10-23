import {
  CROSS_PLATFORM_POLICY,
  DAY_MS,
  ENGAGEMENT_POLICY,
  FREQUENCY_POLICY,
  HOUR_MS,
  RECENCY_POLICY,
  SYNC_WINDOW,
  completenessSufficiency,
  contentTypeSufficiency,
  engagementSufficiency,
  frequencySufficiency,
  recencySufficiency,
} from './policy';
import type {
  ActivityState,
  Dimension,
  ReasonCode,
  Severity,
  SignalEvidence,
  SignalKey,
  SignalStatus,
  SocialContentItemInput,
  SocialPlatform,
  SocialSyncStateInput,
  Sufficiency,
} from './types';

export interface SignalDraft {
  signalKey: SignalKey;
  dimension: Dimension;
  status: SignalStatus;
  severity: Severity | null;
  reason: ReasonCode | null;
  evidence: SignalEvidence;
}

export interface PlatformObservation {
  platform: SocialPlatform;
  items: SocialContentItemInput[];
  timestamps: number[];
  daysSinceLastPost: number | null;
  spanDays: number | null;
  windowTruncated: boolean;
}

const PREFIX: Record<SocialPlatform, 'FB' | 'IG'> = { facebook: 'FB', instagram: 'IG' };

const round1 = (n: number) => Math.round(n * 10) / 10;
const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());
const hasText = (t: string | null) => typeof t === 'string' && t.trim().length > 0;
const isCount = (n: number | null): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function observePlatform(
  platform: SocialPlatform,
  items: SocialContentItemInput[],
  row: SocialSyncStateInput | undefined,
  evaluatedAtMs: number,
): PlatformObservation {
  const own = items
    .filter((i) => i.platform === platform)
    .sort((a, b) => (a.external_id < b.external_id ? -1 : a.external_id > b.external_id ? 1 : 0));
  const timestamps = own
    .map((i) => (i.published_at ? Date.parse(i.published_at) : NaN))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => a - b);
  const newest = timestamps[timestamps.length - 1];
  const elapsed = newest === undefined ? null : Math.max(0, evaluatedAtMs - newest);
  return {
    platform,
    items: own,
    timestamps,
    daysSinceLastPost: elapsed === null ? null : Math.floor(elapsed / DAY_MS),
    spanDays: timestamps.length ? (newest - timestamps[0]) / DAY_MS : null,
    windowTruncated: (row?.item_count ?? 0) >= SYNC_WINDOW.maxItems || (row?.pages_fetched ?? 0) >= SYNC_WINDOW.maxPages,
  };
}

function isRecent(days: number): boolean {
  return days <= RECENCY_POLICY.recentMaxDays;
}

function isLongInactive(days: number): boolean {
  return days >= RECENCY_POLICY.longInactivityMinDays;
}

export function activityStateOf(obs: PlatformObservation): ActivityState {
  if (obs.items.length === 0) return 'no_content';
  if (obs.daysSinceLastPost === null) return 'insufficient_context';
  if (isRecent(obs.daysSinceLastPost)) return 'recent';
  if (isLongInactive(obs.daysSinceLastPost)) return 'old';
  return 'intermediate';
}

function emptyReason(obs: PlatformObservation): ReasonCode {
  return obs.items.length === 0 ? 'NO_DATA' : 'NO_TIMESTAMPS';
}

function recencySignals(obs: PlatformObservation): SignalDraft[] {
  const p = PREFIX[obs.platform];
  const base = {
    postsWithTimestamp: obs.timestamps.length,
    newestObservedPostAt: iso(obs.timestamps[obs.timestamps.length - 1]),
    daysSinceLastPost: obs.daysSinceLastPost,
  };
  if (obs.daysSinceLastPost === null) {
    const reason = emptyReason(obs);
    return [
      { signalKey: `${p}_RECENT_ACTIVITY`, dimension: 'recency', status: 'INSUFFICIENT', severity: null, reason, evidence: { ...base, thresholdDays: RECENCY_POLICY.recentMaxDays } },
      { signalKey: `${p}_LONG_INACTIVITY`, dimension: 'recency', status: 'INSUFFICIENT', severity: null, reason, evidence: { ...base, thresholdDays: RECENCY_POLICY.longInactivityMinDays } },
    ];
  }
  const recent = isRecent(obs.daysSinceLastPost);
  const long = isLongInactive(obs.daysSinceLastPost);
  return [
    {
      signalKey: `${p}_RECENT_ACTIVITY`, dimension: 'recency', status: recent ? 'DETECTED' : 'NOT_DETECTED',
      severity: recent ? 'INFO' : null, reason: null, evidence: { ...base, thresholdDays: RECENCY_POLICY.recentMaxDays },
    },
    {
      signalKey: `${p}_LONG_INACTIVITY`, dimension: 'recency', status: long ? 'DETECTED' : 'NOT_DETECTED',
      severity: long ? 'MEDIUM' : null, reason: null, evidence: { ...base, thresholdDays: RECENCY_POLICY.longInactivityMinDays },
    },
  ];
}

function frequencySignal(obs: PlatformObservation): SignalDraft {
  const n = obs.timestamps.length;
  const sufficiency = frequencySufficiency(n, obs.spanDays);
  const evidence: SignalEvidence = {
    postsWithTimestamp: n,
    oldestObservedPostAt: iso(obs.timestamps[0]),
    newestObservedPostAt: iso(obs.timestamps[n - 1]),
    observedSpanDays: obs.spanDays === null ? null : round1(obs.spanDays),
    sampleSufficiency: sufficiency,
    windowTruncated: obs.windowTruncated,
  };
  const key: SignalKey = `${PREFIX[obs.platform]}_FREQUENCY_OBSERVED`;
  if (sufficiency !== 'SUFFICIENT') {
    const span = obs.spanDays ?? 0;
    const reason: ReasonCode =
      n === 0 ? emptyReason(obs)
        : n < FREQUENCY_POLICY.minPosts ? 'SAMPLE_TOO_SMALL'
          : span < FREQUENCY_POLICY.minSpanDays ? 'WINDOW_TOO_SHORT'
            : n < FREQUENCY_POLICY.sufficientPosts ? 'SAMPLE_TOO_SMALL'
              : 'WINDOW_TOO_SHORT';
    return { signalKey: key, dimension: 'frequency', status: 'INSUFFICIENT', severity: null, reason, evidence };
  }
  const intervals = obs.timestamps.slice(1).map((t, i) => (t - obs.timestamps[i]) / DAY_MS);
  return {
    signalKey: key, dimension: 'frequency', status: 'DETECTED', severity: null, reason: null,
    evidence: {
      ...evidence,
      medianIntervalDays: round1(median(intervals)),
      postsPer30Days: round1(((n - 1) / (obs.spanDays as number)) * 30),
    },
  };
}

function noContentSignal(obs: PlatformObservation): SignalDraft {
  const none = obs.items.length === 0;
  return {
    signalKey: `${PREFIX[obs.platform]}_NO_CONTENT`, dimension: 'activity',
    status: none ? 'DETECTED' : 'NOT_DETECTED', severity: none ? 'LOW' : null, reason: null,
    evidence: { observedPostCount: obs.items.length },
  };
}

function completenessSignal(obs: PlatformObservation): SignalDraft {
  const key: SignalKey = obs.platform === 'facebook' ? 'FB_CONTENT_TEXT_MISSING' : 'IG_CAPTION_MISSING';
  const n = obs.items.length;
  const withText = obs.items.filter((i) => hasText(i.text_content)).length;
  const evidence: SignalEvidence = {
    observedPostCount: n, postsWithText: withText, postsWithoutText: n - withText,
    sampleSufficiency: completenessSufficiency(n),
  };
  if (n === 0) return { signalKey: key, dimension: 'content_completeness', status: 'INSUFFICIENT', severity: null, reason: 'NO_DATA', evidence };
  const missing = n - withText > 0;
  return {
    signalKey: key, dimension: 'content_completeness', status: missing ? 'DETECTED' : 'NOT_DETECTED',
    severity: missing ? 'INFO' : null, reason: null, evidence,
  };
}

function contentTypeSignal(obs: PlatformObservation): SignalDraft {
  const key: SignalKey = `${PREFIX[obs.platform]}_CONTENT_TYPE_VARIETY`;
  const counts: Record<string, number> = {};
  for (const i of obs.items) counts[i.content_type] = (counts[i.content_type] ?? 0) + 1;
  const contentTypes = Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]));
  const sufficiency = contentTypeSufficiency(obs.items.length);
  const distinct = Object.keys(contentTypes).length;
  const evidence: SignalEvidence = {
    observedPostCount: obs.items.length, contentTypes, distinctContentTypes: distinct, sampleSufficiency: sufficiency,
  };
  if (obs.items.length === 0) return { signalKey: key, dimension: 'content_type', status: 'INSUFFICIENT', severity: null, reason: 'NO_DATA', evidence };
  if (sufficiency !== 'SUFFICIENT') return { signalKey: key, dimension: 'content_type', status: 'INSUFFICIENT', severity: null, reason: 'SAMPLE_TOO_SMALL', evidence };
  return { signalKey: key, dimension: 'content_type', status: distinct >= 2 ? 'DETECTED' : 'NOT_DETECTED', severity: null, reason: null, evidence };
}

function sumOrNull(values: (number | null)[]): number | null {
  const real = values.filter(isCount);
  return real.length ? real.reduce((a, b) => a + b, 0) : null;
}

function engagementSignal(obs: PlatformObservation, evaluatedAtMs: number): { draft: SignalDraft; sufficiency: Sufficiency } {
  const key: SignalKey = `${PREFIX[obs.platform]}_ENGAGEMENT_DATA_AVAILABLE`;
  const items = obs.items;
  const reactionObserved = items.filter((i) => isCount(i.reaction_count)).length;
  const commentObserved = items.filter((i) => isCount(i.comment_count)).length;
  const eligible = items.filter((i) => {
    const ms = i.published_at ? Date.parse(i.published_at) : NaN;
    return !Number.isNaN(ms) && evaluatedAtMs - ms >= ENGAGEMENT_POLICY.minAgeHours * HOUR_MS;
  });
  const available = eligible.filter((i) => isCount(i.reaction_count) && isCount(i.comment_count)).length;
  const sufficiency = engagementSufficiency(available, eligible.length);
  const evidence: SignalEvidence = {
    observedPostCount: items.length,
    eligibleEngagementCount: eligible.length,
    availableEngagementCount: available,
    missingEngagementCount: items.filter((i) => !isCount(i.reaction_count) || !isCount(i.comment_count)).length,
    reactionObservedCount: reactionObserved,
    reactionNullCount: items.length - reactionObserved,
    commentObservedCount: commentObserved,
    commentNullCount: items.length - commentObserved,
    reactionTotal: sumOrNull(items.map((i) => i.reaction_count)),
    commentTotal: sumOrNull(items.map((i) => i.comment_count)),
    sampleSufficiency: sufficiency,
  };
  const draft = (status: SignalStatus, reason: ReasonCode | null): SignalDraft =>
    ({ signalKey: key, dimension: 'engagement_availability', status, severity: null, reason, evidence });
  if (items.length === 0) return { draft: draft('INSUFFICIENT', 'NO_DATA'), sufficiency };
  if (reactionObserved === 0 && commentObserved === 0) return { draft: draft('NOT_AVAILABLE', 'METRICS_NULL'), sufficiency };
  if (sufficiency !== 'SUFFICIENT') return { draft: draft('INSUFFICIENT', 'SAMPLE_TOO_SMALL'), sufficiency };
  return { draft: draft('DETECTED', null), sufficiency };
}

export function platformSignals(obs: PlatformObservation, evaluatedAtMs: number): {
  drafts: SignalDraft[];
  sufficiency: Record<'recency' | 'frequency' | 'content_completeness' | 'content_type' | 'engagement_availability', Sufficiency>;
} {
  const engagement = engagementSignal(obs, evaluatedAtMs);
  return {
    drafts: [
      ...recencySignals(obs),
      frequencySignal(obs),
      noContentSignal(obs),
      completenessSignal(obs),
      contentTypeSignal(obs),
      engagement.draft,
      { signalKey: `${PREFIX[obs.platform]}_TREND`, dimension: 'trend', status: 'NOT_AVAILABLE', severity: null, reason: 'NO_HISTORY', evidence: {} },
    ],
    sufficiency: {
      recency: recencySufficiency(obs.timestamps.length),
      frequency: frequencySufficiency(obs.timestamps.length, obs.spanDays),
      content_completeness: completenessSufficiency(obs.items.length),
      content_type: contentTypeSufficiency(obs.items.length),
      engagement_availability: engagement.sufficiency,
    },
  };
}

export function crossPlatformSignals(fb: PlatformObservation, ig: PlatformObservation): SignalDraft[] {
  const evidence: SignalEvidence = {
    facebookDaysSinceLastPost: fb.daysSinceLastPost,
    instagramDaysSinceLastPost: ig.daysSinceLastPost,
  };
  const keys: SignalKey[] = ['FB_ONLY_RECENT_ACTIVITY', 'IG_ONLY_RECENT_ACTIVITY', 'PLATFORM_RECENCY_DIFFERENCE'];
  if (fb.daysSinceLastPost === null || ig.daysSinceLastPost === null) {
    const reason = fb.daysSinceLastPost === null ? emptyReason(fb) : emptyReason(ig);
    return keys.map((signalKey) => ({ signalKey, dimension: 'cross_platform', status: 'INSUFFICIENT', severity: null, reason, evidence }));
  }
  const fbRecent = isRecent(fb.daysSinceLastPost);
  const igRecent = isRecent(ig.daysSinceLastPost);
  const diff = Math.abs(fb.daysSinceLastPost - ig.daysSinceLastPost);
  const gap = diff >= CROSS_PLATFORM_POLICY.recencyDifferenceMinDays;
  const flag = (on: boolean): Pick<SignalDraft, 'status' | 'severity'> => ({ status: on ? 'DETECTED' : 'NOT_DETECTED', severity: on ? 'INFO' : null });
  return [
    { signalKey: keys[0], dimension: 'cross_platform', ...flag(fbRecent && !igRecent), reason: null, evidence: { ...evidence, thresholdDays: RECENCY_POLICY.recentMaxDays } },
    { signalKey: keys[1], dimension: 'cross_platform', ...flag(igRecent && !fbRecent), reason: null, evidence: { ...evidence, thresholdDays: RECENCY_POLICY.recentMaxDays } },
    {
      signalKey: keys[2], dimension: 'cross_platform', ...flag(gap), reason: null,
      evidence: { ...evidence, recencyDifferenceDays: diff, thresholdDays: CROSS_PLATFORM_POLICY.recencyDifferenceMinDays },
    },
  ];
}
