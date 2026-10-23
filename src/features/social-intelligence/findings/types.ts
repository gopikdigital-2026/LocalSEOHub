import type { Freshness, SignalEvidence, SignalKey, SignalPlatform, SignalStatus } from '../types';

export type FindingPlatform = SignalPlatform;
export type FindingCategory = 'data_quality' | 'activity' | 'frequency' | 'content' | 'engagement';
export type FindingStatus = 'ACTIVE' | 'INFORMATIONAL' | 'INSUFFICIENT_DATA' | 'NOT_AVAILABLE' | 'STALE';
export type FindingPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FindingSufficiency = 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT' | 'NOT_AVAILABLE';

export type PlatformFindingTopic =
  | 'RECENT_ACTIVITY' | 'INTERMEDIATE_ACTIVITY' | 'LONG_INACTIVITY' | 'NO_CONTENT' | 'RECENCY_INSUFFICIENT'
  | 'FREQUENCY_OBSERVED' | 'FREQUENCY_INSUFFICIENT'
  | 'TEXT_MISSING' | 'CAPTION_MISSING' | 'CONTENT_TYPE_MIX' | 'CONTENT_TYPE_INSUFFICIENT'
  | 'ENGAGEMENT_DATA_AVAILABLE' | 'ENGAGEMENT_METRICS_UNAVAILABLE' | 'ENGAGEMENT_SAMPLE_INSUFFICIENT'
  | 'LIMITED_HISTORY';

export type AccessTopic =
  | 'ACCESS_REAUTH_REQUIRED' | 'ACCESS_RATE_LIMITED' | 'ACCESS_PERMISSION_UNAVAILABLE' | 'ACCESS_SYNC_ERROR'
  | 'ACCESS_NOT_CONNECTED' | 'ACCESS_NOT_LINKED' | 'ACCESS_NEVER_SYNCED';

export type SharedTopic = AccessTopic | 'DATA_STALE';
export type CrossFindingTopic = 'FB_ONLY_RECENT' | 'IG_ONLY_RECENT' | 'RECENCY_DIFFERENCE';
export type FindingTopic = PlatformFindingTopic | SharedTopic | CrossFindingTopic;

export type FindingKey =
  | `FACEBOOK_${PlatformFindingTopic | SharedTopic}`
  | `INSTAGRAM_${PlatformFindingTopic | SharedTopic}`
  | `CROSS_PLATFORM_${CrossFindingTopic | SharedTopic}`;

export type FindingParamValue = string | number | boolean | null | Record<string, number>;
export type FindingParams = Record<string, FindingParamValue>;

// Factual values copied verbatim from one A3.5.4.1 signal's evidence.
export interface FindingEvidence {
  signalKey: SignalKey;
  signalStatus: SignalStatus;
  values: SignalEvidence;
}

export interface GroupedFindingDetail {
  findingKey: FindingKey;
  topic: FindingTopic;
  summaryKey: string;
  params: FindingParams;
  sourceSignals: SignalKey[];
}

export interface SocialFinding {
  findingKey: FindingKey;
  topic: FindingTopic;
  platform: FindingPlatform;
  category: FindingCategory;
  status: FindingStatus;
  priority: FindingPriority;
  titleKey: string;
  summaryKey: string;
  params: FindingParams;
  evidence: FindingEvidence[];
  sourceSignals: SignalKey[];
  sufficiency: FindingSufficiency;
  freshness: Freshness;
  groupedFindings: GroupedFindingDetail[];
  recommendationKeys: RecommendationKey[];
}

export type SafetyClass = 'DIRECT' | 'CONTEXTUAL' | 'UNSUPPORTED';
export type PublishedSafetyClass = Exclude<SafetyClass, 'UNSUPPORTED'>;
export type ActionType = 'REVIEW' | 'PLAN' | 'CREATE' | 'CONNECT' | 'REFRESH_DATA' | 'WAIT_FOR_MORE_DATA';

export type SupportedRecommendationKey =
  | 'REVIEW_POSTS_WITHOUT_TEXT' | 'REVIEW_POSTS_WITHOUT_CAPTION' | 'CONSIDER_NEW_CONTENT'
  | 'REFRESH_DATA' | 'RECONNECT_META' | 'REVIEW_META_PERMISSIONS' | 'CONNECT_PLATFORM'
  | 'RETRY_LATER' | 'WAIT_FOR_MORE_HISTORY';

export type UnsupportedRecommendationKey =
  | 'POST_MORE_OFTEN' | 'SWITCH_TO_REELS' | 'PLATFORM_PERFORMANCE_COMPARISON' | 'SALES_UPLIFT'
  | 'COMPETITOR_COMPARISON' | 'BEST_TIME_TO_POST' | 'FORMAT_ENGAGEMENT_UPLIFT';

export type RecommendationKey = SupportedRecommendationKey | UnsupportedRecommendationKey;

export interface SocialRecommendation {
  recommendationKey: SupportedRecommendationKey;
  findingKey: FindingKey;
  platform: FindingPlatform;
  safetyClass: PublishedSafetyClass;
  priority: FindingPriority;
  messageKey: string;
  params: FindingParams;
  evidenceRefs: SignalKey[];
  actionType: ActionType;
}

export type SignalDisposition = 'FINDING' | 'GROUPED' | 'COVERED' | 'NO_FINDING';

export interface SignalTrace {
  signalKey: SignalKey;
  platform: SignalPlatform;
  signalStatus: SignalStatus;
  disposition: SignalDisposition;
  findingKey: FindingKey | null;
}

export interface SocialFindingsReport {
  engineVersion: string;
  signalsEngineVersion: string;
  evaluatedAt: string;
  findings: SocialFinding[];
  recommendations: SocialRecommendation[];
  trace: SignalTrace[];
}
