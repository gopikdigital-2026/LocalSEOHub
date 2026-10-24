import type { Lang } from '../../../lib/i18n';
import type {
  FindingPlatform, FindingPriority, FindingStatus, FindingTopic, SafetyClass, SocialFindingsReport, SupportedRecommendationKey,
} from '../findings/types';
import { isPublishableRecommendation } from '../ui/viewModel';
import { socialItemCopy } from './copy';

export type SocialConsumer = 'hoy' | 'plan';
export const SOCIAL_DESTINATION = '/herramientas/social';

interface HomeRule {
  consumer: SocialConsumer;
  safetyClass: Exclude<SafetyClass, 'UNSUPPORTED'>;
  status: FindingStatus;
  topics: FindingTopic[];
}

// Each recommendation has exactly one external home; anything absent here stays on the Social page.
export const SOCIAL_HOME: Partial<Record<SupportedRecommendationKey, HomeRule>> = {
  REVIEW_POSTS_WITHOUT_TEXT: { consumer: 'hoy', safetyClass: 'DIRECT', status: 'ACTIVE', topics: ['TEXT_MISSING'] },
  REVIEW_POSTS_WITHOUT_CAPTION: { consumer: 'hoy', safetyClass: 'DIRECT', status: 'ACTIVE', topics: ['CAPTION_MISSING'] },
  RECONNECT_META: { consumer: 'hoy', safetyClass: 'DIRECT', status: 'NOT_AVAILABLE', topics: ['ACCESS_REAUTH_REQUIRED'] },
  REVIEW_META_PERMISSIONS: { consumer: 'hoy', safetyClass: 'DIRECT', status: 'NOT_AVAILABLE', topics: ['ACCESS_PERMISSION_UNAVAILABLE'] },
  CONSIDER_NEW_CONTENT: { consumer: 'plan', safetyClass: 'CONTEXTUAL', status: 'ACTIVE', topics: ['LONG_INACTIVITY', 'NO_CONTENT'] },
};

export interface SocialIntegrationItem {
  id: string;
  consumer: SocialConsumer;
  platform: FindingPlatform;
  priority: FindingPriority;
  message: string;
  sourceLabel: string;
  destination: typeof SOCIAL_DESTINATION;
  findingKey: string;
  recommendationKey: SupportedRecommendationKey;
}

const isTechnicalTopic = (topic: FindingTopic) => topic === 'DATA_STALE' || topic.startsWith('ACCESS_');

export function eligibleSocialItems(report: SocialFindingsReport, lang: Lang): SocialIntegrationItem[] {
  const findings = new Map(report.findings.map((f) => [f.findingKey, f]));
  const seen = new Set<string>();
  const items: SocialIntegrationItem[] = [];
  for (const rec of report.recommendations) {
    if (!isPublishableRecommendation(rec)) continue;
    const key = rec.recommendationKey as SupportedRecommendationKey;
    const home = SOCIAL_HOME[key];
    const finding = findings.get(rec.findingKey);
    if (!home || !finding || rec.safetyClass !== home.safetyClass) continue;
    if (finding.status !== home.status || !home.topics.includes(finding.topic)) continue;
    // A business finding computed from stale data must not be presented as current.
    if (!isTechnicalTopic(finding.topic) && finding.freshness === 'STALE') continue;
    const id = `social:${key}:${rec.findingKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const copy = socialItemCopy(lang, key, rec.params, rec.platform, rec.messageKey);
    items.push({
      id,
      consumer: home.consumer,
      platform: rec.platform,
      priority: rec.priority,
      message: copy.message,
      sourceLabel: copy.sourceLabel,
      destination: SOCIAL_DESTINATION,
      findingKey: rec.findingKey,
      recommendationKey: key,
    });
  }
  return items;
}

// The frozen engine already orders recommendations by priority, so the first eligible item wins.
export function projectSocialIntegration(report: SocialFindingsReport, lang: Lang): Record<SocialConsumer, SocialIntegrationItem | null> {
  const items = eligibleSocialItems(report, lang);
  return {
    hoy: items.find((i) => i.consumer === 'hoy') ?? null,
    plan: items.find((i) => i.consumer === 'plan') ?? null,
  };
}
