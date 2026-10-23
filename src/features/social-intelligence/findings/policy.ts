import type {
  ActionType,
  FindingCategory,
  FindingPlatform,
  FindingPriority,
  FindingStatus,
  FindingSufficiency,
  FindingTopic,
  RecommendationKey,
  SafetyClass,
} from './types';

export const SOCIAL_FINDINGS_ENGINE_VERSION = 'a3542-1';
export const SUPPORTED_SIGNALS_ENGINE_VERSION = 'a3541-1';

export const PRIORITY_RANK: Record<FindingPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };
export const CATEGORY_RANK: Record<FindingCategory, number> = { data_quality: 0, activity: 1, frequency: 2, content: 3, engagement: 4 };
export const PLATFORM_RANK: Record<FindingPlatform, number> = { facebook: 0, instagram: 1, cross_platform: 2 };

export const lowerPriority = (a: FindingPriority, b: FindingPriority): FindingPriority => (PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b);

interface TopicPolicy {
  category: FindingCategory;
  status: FindingStatus;
  // HIGH is reserved: no a3542-1 rule has evidence strong enough to justify it.
  priority: FindingPriority | ((sufficiency: FindingSufficiency) => FindingPriority);
  recommendations: RecommendationKey[];
}

const completenessPriority = (s: FindingSufficiency): FindingPriority => (s === 'SUFFICIENT' ? 'MEDIUM' : 'LOW');

export const TOPIC_POLICY: Record<FindingTopic, TopicPolicy> = {
  RECENT_ACTIVITY: { category: 'activity', status: 'INFORMATIONAL', priority: 'INFO', recommendations: [] },
  INTERMEDIATE_ACTIVITY: { category: 'activity', status: 'INFORMATIONAL', priority: 'INFO', recommendations: [] },
  LONG_INACTIVITY: { category: 'activity', status: 'ACTIVE', priority: 'MEDIUM', recommendations: ['CONSIDER_NEW_CONTENT'] },
  NO_CONTENT: { category: 'activity', status: 'ACTIVE', priority: 'LOW', recommendations: ['CONSIDER_NEW_CONTENT'] },
  RECENCY_INSUFFICIENT: { category: 'activity', status: 'INSUFFICIENT_DATA', priority: 'INFO', recommendations: ['WAIT_FOR_MORE_HISTORY'] },
  FREQUENCY_OBSERVED: { category: 'frequency', status: 'INFORMATIONAL', priority: 'INFO', recommendations: [] },
  FREQUENCY_INSUFFICIENT: { category: 'frequency', status: 'INSUFFICIENT_DATA', priority: 'INFO', recommendations: ['WAIT_FOR_MORE_HISTORY'] },
  TEXT_MISSING: { category: 'content', status: 'ACTIVE', priority: completenessPriority, recommendations: ['REVIEW_POSTS_WITHOUT_TEXT'] },
  CAPTION_MISSING: { category: 'content', status: 'ACTIVE', priority: completenessPriority, recommendations: ['REVIEW_POSTS_WITHOUT_CAPTION'] },
  CONTENT_TYPE_MIX: { category: 'content', status: 'INFORMATIONAL', priority: 'INFO', recommendations: [] },
  CONTENT_TYPE_INSUFFICIENT: { category: 'content', status: 'INSUFFICIENT_DATA', priority: 'INFO', recommendations: ['WAIT_FOR_MORE_HISTORY'] },
  ENGAGEMENT_DATA_AVAILABLE: { category: 'engagement', status: 'INFORMATIONAL', priority: 'INFO', recommendations: [] },
  ENGAGEMENT_METRICS_UNAVAILABLE: { category: 'engagement', status: 'NOT_AVAILABLE', priority: 'INFO', recommendations: [] },
  ENGAGEMENT_SAMPLE_INSUFFICIENT: { category: 'engagement', status: 'INSUFFICIENT_DATA', priority: 'INFO', recommendations: ['WAIT_FOR_MORE_HISTORY'] },
  LIMITED_HISTORY: { category: 'data_quality', status: 'INSUFFICIENT_DATA', priority: 'INFO', recommendations: ['WAIT_FOR_MORE_HISTORY'] },
  DATA_STALE: { category: 'data_quality', status: 'STALE', priority: 'LOW', recommendations: ['REFRESH_DATA'] },
  ACCESS_REAUTH_REQUIRED: { category: 'data_quality', status: 'NOT_AVAILABLE', priority: 'MEDIUM', recommendations: ['RECONNECT_META'] },
  ACCESS_PERMISSION_UNAVAILABLE: { category: 'data_quality', status: 'NOT_AVAILABLE', priority: 'LOW', recommendations: ['REVIEW_META_PERMISSIONS'] },
  ACCESS_RATE_LIMITED: { category: 'data_quality', status: 'NOT_AVAILABLE', priority: 'INFO', recommendations: ['RETRY_LATER'] },
  ACCESS_SYNC_ERROR: { category: 'data_quality', status: 'NOT_AVAILABLE', priority: 'INFO', recommendations: ['RETRY_LATER'] },
  ACCESS_NOT_CONNECTED: { category: 'data_quality', status: 'NOT_AVAILABLE', priority: 'INFO', recommendations: ['CONNECT_PLATFORM'] },
  ACCESS_NOT_LINKED: { category: 'data_quality', status: 'NOT_AVAILABLE', priority: 'INFO', recommendations: ['CONNECT_PLATFORM'] },
  ACCESS_NEVER_SYNCED: { category: 'data_quality', status: 'NOT_AVAILABLE', priority: 'INFO', recommendations: ['REFRESH_DATA'] },
  FB_ONLY_RECENT: { category: 'activity', status: 'INFORMATIONAL', priority: 'INFO', recommendations: [] },
  IG_ONLY_RECENT: { category: 'activity', status: 'INFORMATIONAL', priority: 'INFO', recommendations: [] },
  RECENCY_DIFFERENCE: { category: 'activity', status: 'INFORMATIONAL', priority: 'INFO', recommendations: [] },
};

export function topicPriority(topic: FindingTopic, sufficiency: FindingSufficiency): FindingPriority {
  const p = TOPIC_POLICY[topic].priority;
  return typeof p === 'function' ? p(sufficiency) : p;
}

interface RecommendationDefinition {
  safetyClass: SafetyClass;
  actionType: ActionType | null;
  maxPriority: FindingPriority;
  paramFields: string[];
  missingData?: string;
}

export const RECOMMENDATION_CATALOG: Record<RecommendationKey, RecommendationDefinition> = {
  REVIEW_POSTS_WITHOUT_TEXT: { safetyClass: 'DIRECT', actionType: 'REVIEW', maxPriority: 'MEDIUM', paramFields: ['postsWithoutText', 'observedPostCount'] },
  REVIEW_POSTS_WITHOUT_CAPTION: { safetyClass: 'DIRECT', actionType: 'REVIEW', maxPriority: 'MEDIUM', paramFields: ['postsWithoutText', 'observedPostCount'] },
  CONSIDER_NEW_CONTENT: { safetyClass: 'CONTEXTUAL', actionType: 'PLAN', maxPriority: 'LOW', paramFields: ['daysSinceLastPost', 'observedPostCount'] },
  REFRESH_DATA: { safetyClass: 'DIRECT', actionType: 'REFRESH_DATA', maxPriority: 'LOW', paramFields: ['lastSuccessAt'] },
  RECONNECT_META: { safetyClass: 'DIRECT', actionType: 'CONNECT', maxPriority: 'MEDIUM', paramFields: [] },
  REVIEW_META_PERMISSIONS: { safetyClass: 'DIRECT', actionType: 'CONNECT', maxPriority: 'LOW', paramFields: [] },
  CONNECT_PLATFORM: { safetyClass: 'CONTEXTUAL', actionType: 'CONNECT', maxPriority: 'INFO', paramFields: [] },
  RETRY_LATER: { safetyClass: 'DIRECT', actionType: 'WAIT_FOR_MORE_DATA', maxPriority: 'INFO', paramFields: [] },
  WAIT_FOR_MORE_HISTORY: { safetyClass: 'DIRECT', actionType: 'WAIT_FOR_MORE_DATA', maxPriority: 'INFO', paramFields: [] },

  POST_MORE_OFTEN: { safetyClass: 'UNSUPPORTED', actionType: null, maxPriority: 'INFO', paramFields: [], missingData: 'No benchmark or outcome data links posting frequency to results.' },
  SWITCH_TO_REELS: { safetyClass: 'UNSUPPORTED', actionType: null, maxPriority: 'INFO', paramFields: [], missingData: 'No reach or per-format performance data.' },
  PLATFORM_PERFORMANCE_COMPARISON: { safetyClass: 'UNSUPPORTED', actionType: null, maxPriority: 'INFO', paramFields: [], missingData: 'Recency differences are not performance metrics.' },
  SALES_UPLIFT: { safetyClass: 'UNSUPPORTED', actionType: null, maxPriority: 'INFO', paramFields: [], missingData: 'No sales or conversion data.' },
  COMPETITOR_COMPARISON: { safetyClass: 'UNSUPPORTED', actionType: null, maxPriority: 'INFO', paramFields: [], missingData: 'No competitor social data.' },
  BEST_TIME_TO_POST: { safetyClass: 'UNSUPPORTED', actionType: null, maxPriority: 'INFO', paramFields: [], missingData: 'No audience activity or timing data.' },
  FORMAT_ENGAGEMENT_UPLIFT: { safetyClass: 'UNSUPPORTED', actionType: null, maxPriority: 'INFO', paramFields: [], missingData: 'No sufficient engagement sample or causal data.' },
};
