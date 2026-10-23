import { TOPIC_POLICY, topicPriority } from './policy';
import type {
  FindingEvidence,
  FindingKey,
  FindingParams,
  FindingPlatform,
  FindingSufficiency,
  FindingTopic,
  SocialFinding,
} from './types';
import type {
  Freshness,
  SignalEvidence,
  SignalKey,
  SocialPlatform,
  SocialSignal,
  SocialSignalsReport,
  Sufficiency,
} from '../types';

type EvidenceField = keyof SignalEvidence;

interface Draft {
  topic: FindingTopic;
  platform: FindingPlatform;
  sources: SocialSignal[];
  evidenceFields: EvidenceField[];
  paramFields: EvidenceField[];
  sufficiency?: FindingSufficiency;
}

export interface RuleOutput {
  findings: SocialFinding[];
  // Signals intentionally not turned into their own finding because another finding already explains them.
  coveredBy: Map<SignalKey, FindingKey>;
}

const KEY_PREFIX: Record<FindingPlatform, string> = { facebook: 'FACEBOOK', instagram: 'INSTAGRAM', cross_platform: 'CROSS_PLATFORM' };
const SIGNAL_PREFIX: Record<SocialPlatform, 'FB' | 'IG'> = { facebook: 'FB', instagram: 'IG' };
const FRESHNESS_RANK: Record<Freshness, number> = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 };
const SUFFICIENCY_RANK: Record<Sufficiency, number> = { SUFFICIENT: 0, LIMITED: 1, INSUFFICIENT: 2 };

const ACCESS_TOPIC: Record<string, FindingTopic> = {
  REAUTH_REQUIRED: 'ACCESS_REAUTH_REQUIRED',
  RATE_LIMITED: 'ACCESS_RATE_LIMITED',
  PERMISSION_UNAVAILABLE: 'ACCESS_PERMISSION_UNAVAILABLE',
  SYNC_ERROR: 'ACCESS_SYNC_ERROR',
  NOT_CONNECTED: 'ACCESS_NOT_CONNECTED',
  NOT_LINKED: 'ACCESS_NOT_LINKED',
  NEVER_SYNCED: 'ACCESS_NEVER_SYNCED',
};

const ACCESS_FIELDS: EvidenceField[] = ['syncStatus', 'errorCode', 'lastSuccessAt'];
const RECENCY_FIELDS: EvidenceField[] = ['daysSinceLastPost', 'thresholdDays', 'newestObservedPostAt', 'postsWithTimestamp'];
const ENGAGEMENT_FIELDS: EvidenceField[] = [
  'observedPostCount', 'eligibleEngagementCount', 'availableEngagementCount',
  'reactionNullCount', 'commentNullCount', 'reactionTotal', 'commentTotal', 'sampleSufficiency',
];
const CROSS_FIELDS: EvidenceField[] = ['facebookDaysSinceLastPost', 'instagramDaysSinceLastPost', 'thresholdDays'];

export const findingKeyOf = (platform: FindingPlatform, topic: FindingTopic) => `${KEY_PREFIX[platform]}_${topic}` as FindingKey;

function pick(evidence: SignalEvidence, fields: EvidenceField[]): SignalEvidence {
  const out: SignalEvidence = {};
  for (const f of fields) if (f in evidence) (out as Record<string, unknown>)[f] = evidence[f];
  return out;
}

export function paramsFrom(evidence: FindingEvidence[], fields: string[]): FindingParams {
  const params: FindingParams = {};
  for (const f of fields) {
    const hit = evidence.find((e) => f in e.values);
    if (hit) params[f] = (hit.values as Record<string, FindingParams[string]>)[f];
  }
  return params;
}

export const worstFreshness = (signals: { freshness: Freshness }[]): Freshness =>
  signals.reduce<Freshness>((w, s) => (FRESHNESS_RANK[s.freshness] > FRESHNESS_RANK[w] ? s.freshness : w), 'FRESH');

export function statusSufficiency(status: SocialFinding['status'], fallback: FindingSufficiency): FindingSufficiency {
  if (status === 'NOT_AVAILABLE' || status === 'STALE') return 'NOT_AVAILABLE';
  if (status === 'INSUFFICIENT_DATA') return 'INSUFFICIENT';
  return fallback;
}

function build(d: Draft): SocialFinding {
  const policy = TOPIC_POLICY[d.topic];
  const findingKey = findingKeyOf(d.platform, d.topic);
  const evidence = d.sources.map((s) => ({ signalKey: s.signalKey, signalStatus: s.status, values: pick(s.evidence, d.evidenceFields) }));
  const sufficiency = statusSufficiency(policy.status, d.sufficiency ?? 'SUFFICIENT');
  return {
    findingKey,
    topic: d.topic,
    platform: d.platform,
    category: policy.category,
    status: policy.status,
    priority: topicPriority(d.topic, sufficiency),
    titleKey: `social.finding.${d.topic}.title`,
    summaryKey: `social.finding.${d.topic}.summary`,
    params: paramsFrom(evidence, d.paramFields),
    evidence,
    sourceSignals: d.sources.map((s) => s.signalKey),
    sufficiency,
    freshness: worstFreshness(d.sources),
    groupedFindings: [],
    recommendationKeys: [...policy.recommendations],
  };
}

function signalOf(report: SocialSignalsReport, key: SignalKey): SocialSignal {
  const found = report.signals.find((s) => s.signalKey === key);
  if (!found) throw new Error(`MISSING_SIGNAL:${key}`);
  return found;
}

function platformRules(report: SocialSignalsReport, platform: SocialPlatform, out: RuleOutput): void {
  const assessment = report.platforms[platform];
  const own = report.signals.filter((s) => s.platform === platform);
  const sig = (suffix: string) => signalOf(report, `${SIGNAL_PREFIX[platform]}_${suffix}` as SignalKey);
  const drafts: Draft[] = [];

  if (assessment.blockedReason) {
    drafts.push({ topic: ACCESS_TOPIC[assessment.blockedReason] ?? 'ACCESS_SYNC_ERROR', platform, sources: own, evidenceFields: ACCESS_FIELDS, paramFields: [] });
    out.findings.push(...drafts.map(build));
    return;
  }

  const stale = own.filter((s) => s.status === 'STALE');
  if (stale.length) {
    drafts.push({ topic: 'DATA_STALE', platform, sources: stale, evidenceFields: ACCESS_FIELDS, paramFields: ['lastSuccessAt'] });
    out.findings.push(...drafts.map(build));
    return;
  }

  const suff = assessment.sufficiency;
  const recent = sig('RECENT_ACTIVITY');
  const long = sig('LONG_INACTIVITY');
  const noContent = sig('NO_CONTENT');

  if (noContent.status === 'DETECTED') {
    const key = findingKeyOf(platform, 'NO_CONTENT');
    for (const s of own) if (s.reason === 'NO_DATA') out.coveredBy.set(s.signalKey, key);
    drafts.push({ topic: 'NO_CONTENT', platform, sources: [noContent], evidenceFields: ['observedPostCount'], paramFields: ['observedPostCount'] });
  }

  if (recent.status === 'DETECTED') {
    drafts.push({ topic: 'RECENT_ACTIVITY', platform, sources: [recent], evidenceFields: RECENCY_FIELDS, paramFields: ['daysSinceLastPost', 'thresholdDays'], sufficiency: suff.recency });
  } else if (long.status === 'DETECTED') {
    drafts.push({ topic: 'LONG_INACTIVITY', platform, sources: [long], evidenceFields: RECENCY_FIELDS, paramFields: ['daysSinceLastPost', 'thresholdDays'], sufficiency: suff.recency });
  } else if (recent.status === 'NOT_DETECTED' && long.status === 'NOT_DETECTED') {
    drafts.push({ topic: 'INTERMEDIATE_ACTIVITY', platform, sources: [recent, long], evidenceFields: RECENCY_FIELDS, paramFields: ['daysSinceLastPost'], sufficiency: suff.recency });
  } else if (recent.reason === 'NO_TIMESTAMPS') {
    drafts.push({ topic: 'RECENCY_INSUFFICIENT', platform, sources: [recent, long], evidenceFields: ['postsWithTimestamp'], paramFields: ['postsWithTimestamp'] });
  }

  const frequency = sig('FREQUENCY_OBSERVED');
  const frequencyFields: EvidenceField[] = ['postsWithTimestamp', 'observedSpanDays', 'medianIntervalDays', 'postsPer30Days', 'sampleSufficiency', 'windowTruncated'];
  if (frequency.status === 'DETECTED') {
    drafts.push({ topic: 'FREQUENCY_OBSERVED', platform, sources: [frequency], evidenceFields: frequencyFields, paramFields: ['postsWithTimestamp', 'observedSpanDays', 'medianIntervalDays', 'postsPer30Days'], sufficiency: suff.frequency });
  } else if (frequency.status === 'INSUFFICIENT' && frequency.reason !== 'NO_DATA') {
    drafts.push({ topic: 'FREQUENCY_INSUFFICIENT', platform, sources: [frequency], evidenceFields: frequencyFields, paramFields: ['postsWithTimestamp', 'observedSpanDays'] });
  }

  const completeness = sig(platform === 'facebook' ? 'CONTENT_TEXT_MISSING' : 'CAPTION_MISSING');
  if (completeness.status === 'DETECTED') {
    drafts.push({
      topic: platform === 'facebook' ? 'TEXT_MISSING' : 'CAPTION_MISSING', platform, sources: [completeness],
      evidenceFields: ['observedPostCount', 'postsWithText', 'postsWithoutText', 'sampleSufficiency'],
      paramFields: ['postsWithoutText', 'observedPostCount'], sufficiency: suff.content_completeness,
    });
  }

  const contentType = sig('CONTENT_TYPE_VARIETY');
  const typeFields: EvidenceField[] = ['observedPostCount', 'contentTypes', 'distinctContentTypes', 'sampleSufficiency'];
  if (contentType.status === 'DETECTED' || contentType.status === 'NOT_DETECTED') {
    drafts.push({ topic: 'CONTENT_TYPE_MIX', platform, sources: [contentType], evidenceFields: typeFields, paramFields: ['distinctContentTypes', 'observedPostCount', 'contentTypes'], sufficiency: suff.content_type });
  } else if (contentType.reason === 'SAMPLE_TOO_SMALL') {
    drafts.push({ topic: 'CONTENT_TYPE_INSUFFICIENT', platform, sources: [contentType], evidenceFields: typeFields, paramFields: ['observedPostCount'] });
  }

  const engagement = sig('ENGAGEMENT_DATA_AVAILABLE');
  if (engagement.status === 'NOT_AVAILABLE' && engagement.reason === 'METRICS_NULL') {
    drafts.push({ topic: 'ENGAGEMENT_METRICS_UNAVAILABLE', platform, sources: [engagement], evidenceFields: ENGAGEMENT_FIELDS, paramFields: ['observedPostCount'] });
  } else if (engagement.status === 'INSUFFICIENT' && engagement.reason === 'SAMPLE_TOO_SMALL') {
    drafts.push({ topic: 'ENGAGEMENT_SAMPLE_INSUFFICIENT', platform, sources: [engagement], evidenceFields: ENGAGEMENT_FIELDS, paramFields: ['availableEngagementCount', 'eligibleEngagementCount'] });
  } else if (engagement.status === 'DETECTED') {
    drafts.push({ topic: 'ENGAGEMENT_DATA_AVAILABLE', platform, sources: [engagement], evidenceFields: ENGAGEMENT_FIELDS, paramFields: ['availableEngagementCount', 'eligibleEngagementCount'], sufficiency: suff.engagement_availability });
  }

  out.findings.push(...drafts.map(build));
}

function activityFindingKey(report: SocialSignalsReport, platform: SocialPlatform): FindingKey {
  const noContent = signalOf(report, `${SIGNAL_PREFIX[platform]}_NO_CONTENT` as SignalKey);
  return findingKeyOf(platform, noContent.status === 'DETECTED' ? 'NO_CONTENT' : 'RECENCY_INSUFFICIENT');
}

function crossRules(report: SocialSignalsReport, out: RuleOutput): void {
  const cross = report.signals.filter((s) => s.platform === 'cross_platform');
  const { facebook, instagram } = report.platforms;

  if (cross.some((s) => s.status === 'NOT_AVAILABLE')) {
    const blocked: SocialPlatform = facebook.blockedReason ? 'facebook' : 'instagram';
    const topic = ACCESS_TOPIC[report.platforms[blocked].blockedReason ?? ''] ?? 'ACCESS_SYNC_ERROR';
    for (const s of cross) out.coveredBy.set(s.signalKey, findingKeyOf(blocked, topic));
    return;
  }
  if (cross.some((s) => s.status === 'STALE')) {
    const stale: SocialPlatform = facebook.freshness === 'STALE' ? 'facebook' : 'instagram';
    for (const s of cross) out.coveredBy.set(s.signalKey, findingKeyOf(stale, 'DATA_STALE'));
    return;
  }
  if (cross.some((s) => s.status === 'INSUFFICIENT')) {
    const missing: SocialPlatform = cross[0].evidence.facebookDaysSinceLastPost === null ? 'facebook' : 'instagram';
    for (const s of cross) out.coveredBy.set(s.signalKey, activityFindingKey(report, missing));
    return;
  }

  const recency = [facebook.sufficiency.recency, instagram.sufficiency.recency]
    .reduce((w, s) => (SUFFICIENCY_RANK[s] > SUFFICIENCY_RANK[w] ? s : w), 'SUFFICIENT' as Sufficiency);
  const add = (key: SignalKey, topic: FindingTopic, extra: EvidenceField[] = []) => {
    const s = signalOf(report, key);
    if (s.status !== 'DETECTED') return;
    const fields = [...CROSS_FIELDS, ...extra];
    out.findings.push(build({ topic, platform: 'cross_platform', sources: [s], evidenceFields: fields, paramFields: fields, sufficiency: recency }));
  };
  add('FB_ONLY_RECENT_ACTIVITY', 'FB_ONLY_RECENT');
  add('IG_ONLY_RECENT_ACTIVITY', 'IG_ONLY_RECENT');
  add('PLATFORM_RECENCY_DIFFERENCE', 'RECENCY_DIFFERENCE', ['recencyDifferenceDays']);
}

export function applyRules(report: SocialSignalsReport): RuleOutput {
  const out: RuleOutput = { findings: [], coveredBy: new Map() };
  platformRules(report, 'facebook', out);
  platformRules(report, 'instagram', out);
  crossRules(report, out);
  return out;
}
