import type { InstagramStatus, MetaConnectionStatus } from '../meta-connection/metaStatus';

export type SocialPlatform = 'facebook' | 'instagram';
export type SignalPlatform = SocialPlatform | 'cross_platform';

export type SyncStatus =
  | 'never' | 'ok' | 'empty' | 'not_linked'
  | 'permission_unavailable' | 'reauth_required' | 'rate_limited' | 'malformed' | 'api_error';

export type ContentType =
  | 'post' | 'photo' | 'video' | 'link' | 'status' | 'event'
  | 'image' | 'carousel' | 'reel' | 'other';

export interface SocialConnectionInput {
  status: MetaConnectionStatus;
  instagram_status: InstagramStatus | null;
}

export interface SocialSyncStateInput {
  platform: SocialPlatform;
  status: SyncStatus | string;
  error_code: string | null;
  item_count: number | null;
  pages_fetched: number | null;
  last_success_at: string | null;
}

export interface SocialContentItemInput {
  platform: SocialPlatform;
  external_id: string;
  content_type: ContentType | string;
  text_content: string | null;
  published_at: string | null;
  reaction_count: number | null;
  comment_count: number | null;
}

export interface SocialSnapshot {
  connection: SocialConnectionInput | null;
  syncStates: SocialSyncStateInput[];
  items: SocialContentItemInput[];
}

export type Dimension =
  | 'recency' | 'frequency' | 'activity' | 'content_completeness'
  | 'content_type' | 'engagement_availability' | 'cross_platform' | 'trend';

export type SignalStatus = 'DETECTED' | 'NOT_DETECTED' | 'INSUFFICIENT' | 'NOT_AVAILABLE' | 'STALE';
export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
export type Freshness = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
export type Sufficiency = 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';

export type ReasonCode =
  | 'NOT_CONNECTED' | 'NOT_LINKED' | 'NEVER_SYNCED'
  | 'REAUTH_REQUIRED' | 'RATE_LIMITED' | 'PERMISSION_UNAVAILABLE' | 'SYNC_ERROR'
  | 'STALE_DATA' | 'NO_DATA' | 'NO_TIMESTAMPS' | 'SAMPLE_TOO_SMALL' | 'WINDOW_TOO_SHORT'
  | 'METRICS_NULL' | 'NO_HISTORY';

export type SignalKey =
  | 'FB_RECENT_ACTIVITY' | 'FB_LONG_INACTIVITY' | 'FB_FREQUENCY_OBSERVED' | 'FB_NO_CONTENT'
  | 'FB_CONTENT_TEXT_MISSING' | 'FB_CONTENT_TYPE_VARIETY' | 'FB_ENGAGEMENT_DATA_AVAILABLE' | 'FB_TREND'
  | 'IG_RECENT_ACTIVITY' | 'IG_LONG_INACTIVITY' | 'IG_FREQUENCY_OBSERVED' | 'IG_NO_CONTENT'
  | 'IG_CAPTION_MISSING' | 'IG_CONTENT_TYPE_VARIETY' | 'IG_ENGAGEMENT_DATA_AVAILABLE' | 'IG_TREND'
  | 'FB_ONLY_RECENT_ACTIVITY' | 'IG_ONLY_RECENT_ACTIVITY' | 'PLATFORM_RECENCY_DIFFERENCE';

export interface SignalEvidence {
  lastSuccessAt?: string | null;
  syncStatus?: string | null;
  errorCode?: string | null;
  observedPostCount?: number;
  postsWithTimestamp?: number;
  oldestObservedPostAt?: string | null;
  newestObservedPostAt?: string | null;
  daysSinceLastPost?: number | null;
  thresholdDays?: number;
  observedSpanDays?: number | null;
  medianIntervalDays?: number | null;
  postsPer30Days?: number | null;
  windowTruncated?: boolean;
  sampleSufficiency?: Sufficiency;
  postsWithText?: number;
  postsWithoutText?: number;
  contentTypes?: Record<string, number>;
  distinctContentTypes?: number;
  eligibleEngagementCount?: number;
  availableEngagementCount?: number;
  missingEngagementCount?: number;
  reactionObservedCount?: number;
  reactionNullCount?: number;
  commentObservedCount?: number;
  commentNullCount?: number;
  reactionTotal?: number | null;
  commentTotal?: number | null;
  facebookDaysSinceLastPost?: number | null;
  instagramDaysSinceLastPost?: number | null;
  recencyDifferenceDays?: number | null;
  facebookReason?: ReasonCode | null;
  instagramReason?: ReasonCode | null;
}

export interface SocialSignal {
  signalKey: SignalKey;
  platform: SignalPlatform;
  dimension: Dimension;
  status: SignalStatus;
  lastKnownStatus: SignalStatus | null;
  severity: Severity | null;
  reason: ReasonCode | null;
  freshness: Freshness;
  evidence: SignalEvidence;
  evaluatedAt: string;
}

export type ActivityState = 'no_content' | 'recent' | 'intermediate' | 'old' | 'insufficient_context' | 'not_evaluable';

export interface PlatformAssessment {
  platform: SocialPlatform;
  blockedReason: ReasonCode | null;
  syncStatus: string | null;
  freshness: Freshness;
  lastSuccessAt: string | null;
  hoursSinceSuccess: number | null;
  activityState: ActivityState;
  sufficiency: Record<'recency' | 'frequency' | 'content_completeness' | 'content_type' | 'engagement_availability', Sufficiency>;
}

export interface SocialSignalsReport {
  engineVersion: string;
  evaluatedAt: string;
  platforms: Record<SocialPlatform, PlatformAssessment>;
  signals: SocialSignal[];
}
