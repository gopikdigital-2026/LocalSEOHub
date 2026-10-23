import {
  CATEGORY_RANK,
  PLATFORM_RANK,
  PRIORITY_RANK,
  RECOMMENDATION_CATALOG,
  SOCIAL_FINDINGS_ENGINE_VERSION,
  SUPPORTED_SIGNALS_ENGINE_VERSION,
  TOPIC_POLICY,
  lowerPriority,
  topicPriority,
} from './policy';
import { applyRules, findingKeyOf, statusSufficiency, worstFreshness } from './rules';
import type {
  ActionType,
  FindingKey,
  FindingParams,
  FindingPlatform,
  FindingStatus,
  FindingTopic,
  RecommendationKey,
  SignalTrace,
  SocialFinding,
  SocialFindingsReport,
  SocialRecommendation,
  SupportedRecommendationKey,
} from './types';
import type { SignalKey, SocialSignalsReport } from '../types';

const SHARED_TOPICS: FindingTopic[] = [
  'ACCESS_REAUTH_REQUIRED', 'ACCESS_RATE_LIMITED', 'ACCESS_PERMISSION_UNAVAILABLE', 'ACCESS_SYNC_ERROR',
  'ACCESS_NOT_CONNECTED', 'ACCESS_NOT_LINKED', 'ACCESS_NEVER_SYNCED', 'DATA_STALE',
];

// Operational actions a finding may carry, by finding status. Anything else is dropped at the gate.
const ALLOWED_ACTIONS: Record<FindingStatus, ActionType[]> = {
  ACTIVE: ['REVIEW', 'PLAN', 'CREATE'],
  INFORMATIONAL: [],
  INSUFFICIENT_DATA: ['WAIT_FOR_MORE_DATA'],
  NOT_AVAILABLE: ['CONNECT', 'REFRESH_DATA', 'WAIT_FOR_MORE_DATA'],
  STALE: ['REFRESH_DATA'],
};

function merge(platform: FindingPlatform, topic: FindingTopic, members: SocialFinding[], base?: SocialFinding): SocialFinding {
  const policy = TOPIC_POLICY[topic];
  const parts = base ? [base, ...members] : members;
  const evidence = parts.flatMap((f) => f.evidence);
  const sufficiency = base?.sufficiency ?? statusSufficiency(policy.status, 'SUFFICIENT');
  return {
    findingKey: findingKeyOf(platform, topic),
    topic,
    platform,
    category: policy.category,
    status: policy.status,
    priority: topicPriority(topic, sufficiency),
    titleKey: `social.finding.${topic}.title`,
    summaryKey: `social.finding.${topic}.summary`,
    params: base?.params ?? {},
    evidence,
    sourceSignals: evidence.map((e) => e.signalKey),
    sufficiency,
    freshness: worstFreshness(parts),
    groupedFindings: [
      ...(base?.groupedFindings ?? []),
      ...members.map((m) => ({ findingKey: m.findingKey, topic: m.topic, summaryKey: m.summaryKey, params: m.params, sourceSignals: m.sourceSignals })),
    ],
    recommendationKeys: [...policy.recommendations],
  };
}

function deduplicate(raw: SocialFinding[]): { findings: SocialFinding[]; absorbedInto: Map<FindingKey, FindingKey> } {
  let findings = [...raw];
  const absorbedInto = new Map<FindingKey, FindingKey>();
  const replace = (members: SocialFinding[], merged: SocialFinding, base?: SocialFinding) => {
    const drop = new Set([...members, ...(base ? [base] : [])].map((m) => m.findingKey));
    for (const m of members) absorbedInto.set(m.findingKey, merged.findingKey);
    const at = findings.findIndex((f) => drop.has(f.findingKey));
    findings = findings.filter((f) => !drop.has(f.findingKey));
    findings.splice(at, 0, merged);
  };
  const byKey = (key: FindingKey) => findings.find((f) => f.findingKey === key);

  // D1: the same access/staleness condition on both platforms is reported once.
  for (const topic of SHARED_TOPICS) {
    const fb = byKey(findingKeyOf('facebook', topic));
    const ig = byKey(findingKeyOf('instagram', topic));
    if (fb && ig) replace([fb, ig], merge('cross_platform', topic, [fb, ig]));
  }

  // D2: several "not enough data yet" findings on one platform become a single limited-history finding.
  for (const platform of ['facebook', 'instagram'] as const) {
    const insufficient = findings.filter((f) => f.platform === platform && f.status === 'INSUFFICIENT_DATA');
    if (insufficient.length >= 2) replace(insufficient, merge(platform, 'LIMITED_HISTORY', insufficient));
  }

  // D3: a recency gap already implies which platform is the only recent one.
  const difference = byKey('CROSS_PLATFORM_RECENCY_DIFFERENCE');
  const onlyRecent = findings.filter((f) => f.topic === 'FB_ONLY_RECENT' || f.topic === 'IG_ONLY_RECENT');
  if (difference && onlyRecent.length) replace(onlyRecent, merge('cross_platform', 'RECENCY_DIFFERENCE', onlyRecent, difference), difference);

  return { findings, absorbedInto };
}

function compareFindings(a: SocialFinding, b: SocialFinding): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]
    || PLATFORM_RANK[a.platform] - PLATFORM_RANK[b.platform]
    || (a.findingKey < b.findingKey ? -1 : a.findingKey > b.findingKey ? 1 : 0);
}

function pickParams(params: FindingParams, fields: string[]): FindingParams {
  return Object.fromEntries(fields.filter((f) => f in params).map((f) => [f, params[f]]));
}

export function resolveRecommendation(key: RecommendationKey, finding: SocialFinding): SocialRecommendation | null {
  const def = RECOMMENDATION_CATALOG[key];
  if (def.safetyClass === 'UNSUPPORTED' || def.actionType === null) return null;
  if (!ALLOWED_ACTIONS[finding.status].includes(def.actionType) || finding.sourceSignals.length === 0) return null;
  return {
    recommendationKey: key as SupportedRecommendationKey,
    findingKey: finding.findingKey,
    platform: finding.platform,
    safetyClass: def.safetyClass,
    priority: lowerPriority(finding.priority, def.maxPriority),
    messageKey: `social.rec.${key}`,
    params: pickParams(finding.params, def.paramFields),
    evidenceRefs: [...finding.sourceSignals],
    actionType: def.actionType,
  };
}

function buildTrace(
  report: SocialSignalsReport,
  findings: SocialFinding[],
  coveredBy: Map<SignalKey, FindingKey>,
  absorbedInto: Map<FindingKey, FindingKey>,
): SignalTrace[] {
  const resolve = (key: FindingKey): FindingKey => {
    let k = key;
    while (absorbedInto.has(k)) k = absorbedInto.get(k) as FindingKey;
    return k;
  };
  return report.signals.map((s) => {
    const base = { signalKey: s.signalKey, platform: s.platform, signalStatus: s.status };
    const owner = findings.find((f) => f.sourceSignals.includes(s.signalKey));
    if (owner) {
      const grouped = owner.groupedFindings.some((g) => g.sourceSignals.includes(s.signalKey));
      return { ...base, disposition: grouped ? 'GROUPED' : 'FINDING', findingKey: owner.findingKey };
    }
    const covered = coveredBy.get(s.signalKey);
    if (covered) return { ...base, disposition: 'COVERED', findingKey: resolve(covered) };
    return { ...base, disposition: 'NO_FINDING', findingKey: null };
  });
}

export function evaluateSocialFindings(report: SocialSignalsReport): SocialFindingsReport {
  if (report.engineVersion !== SUPPORTED_SIGNALS_ENGINE_VERSION) throw new Error('UNSUPPORTED_SIGNALS_ENGINE_VERSION');
  const { findings: raw, coveredBy } = applyRules(report);
  const { findings: deduped, absorbedInto } = deduplicate(raw);

  const recommendations: SocialRecommendation[] = [];
  const findings = [...deduped].sort(compareFindings).map((f) => {
    const published = f.recommendationKeys
      .map((k) => resolveRecommendation(k, f))
      .filter((r): r is SocialRecommendation => r !== null);
    recommendations.push(...published);
    return { ...f, recommendationKeys: published.map((r) => r.recommendationKey) };
  });
  recommendations.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return {
    engineVersion: SOCIAL_FINDINGS_ENGINE_VERSION,
    signalsEngineVersion: report.engineVersion,
    evaluatedAt: report.evaluatedAt,
    findings,
    recommendations,
    trace: buildTrace(report, findings, coveredBy, absorbedInto),
  };
}
