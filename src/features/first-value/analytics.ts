import type { ActionType } from '../../domain/types';
import type { Confidence, DataMode, FirstValueStep, SourceChoiceType } from './types';

// ─── Dedup guard (session-scoped) ───────────────────────────────────────────

const tracked = new Set<string>();

function trackOnce(key: string, fn: () => void) {
  if (tracked.has(key)) return;
  tracked.add(key);
  fn();
}

// ─── Core tracking ──────────────────────────────────────────────────────────

interface EventProps {
  user_id?: string;
  business_id?: string;
  recommendation_id?: string;
  source_type?: string;
  data_mode?: string;
  confidence?: string;
  action_type?: string;
  time_to_first_value_seconds?: number;
  step?: string;
  goal_id?: string;
  session_id?: string;
  [key: string]: string | number | undefined;
}

let sessionId: string | null = null;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return sessionId;
}

function trackV2(event: string, props?: EventProps) {
  try {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
      ...props,
    };
    const existing = JSON.parse(localStorage.getItem('lsh_v2_analytics') ?? '[]');
    existing.push(payload);
    localStorage.setItem('lsh_v2_analytics', JSON.stringify(existing.slice(-500)));
  } catch { /* silent */ }
}

// ─── Context-aware tracking functions ───────────────────────────────────────

interface TrackingContext {
  userId?: string;
  businessId?: string;
  recommendationId?: string;
  sourceType?: SourceChoiceType;
  dataMode?: DataMode;
  confidence?: Confidence;
}

export function trackFirstValueStarted(ctx: TrackingContext) {
  trackOnce(`fv_started:${ctx.userId}:${ctx.businessId}`, () =>
    trackV2('first_value_started', { user_id: ctx.userId, business_id: ctx.businessId })
  );
}

export function trackFirstValueResumed(ctx: TrackingContext, step: FirstValueStep) {
  trackV2('first_value_resumed', { user_id: ctx.userId, business_id: ctx.businessId, step });
}

export function trackFirstValueStepViewed(ctx: TrackingContext, step: FirstValueStep) {
  trackV2('first_value_step_viewed', { user_id: ctx.userId, business_id: ctx.businessId, step });
}

export function trackBusinessSetupCompleted(ctx: TrackingContext) {
  trackOnce(`biz_setup:${ctx.userId}:${ctx.businessId}`, () =>
    trackV2('business_setup_completed', { user_id: ctx.userId, business_id: ctx.businessId })
  );
}

export function trackPrimaryGoalSelected(ctx: TrackingContext, goalId: string) {
  trackV2('primary_goal_selected', { user_id: ctx.userId, business_id: ctx.businessId, goal_id: goalId });
}

export function trackManualContextCompleted(ctx: TrackingContext) {
  trackOnce(`manual_ctx:${ctx.userId}:${ctx.businessId}`, () =>
    trackV2('manual_context_completed', { user_id: ctx.userId, business_id: ctx.businessId })
  );
}

export function trackInitialSourceSelected(ctx: TrackingContext, sourceType: SourceChoiceType) {
  trackV2('initial_source_selected', {
    user_id: ctx.userId,
    business_id: ctx.businessId,
    source_type: sourceType,
  });
}

export function trackInitialSourceConnected(ctx: TrackingContext) {
  trackV2('initial_source_connected', {
    user_id: ctx.userId,
    business_id: ctx.businessId,
    source_type: ctx.sourceType,
    data_mode: ctx.dataMode,
  });
}

export function trackInitialAnalysisStarted(ctx: TrackingContext) {
  trackV2('initial_analysis_started', { user_id: ctx.userId, business_id: ctx.businessId });
}

export function trackInitialAnalysisCompleted(ctx: TrackingContext) {
  trackV2('initial_analysis_completed', { user_id: ctx.userId, business_id: ctx.businessId });
}

export function trackFirstRecommendationGenerated(ctx: TrackingContext) {
  trackOnce(`fv_rec_gen:${ctx.userId}:${ctx.businessId}`, () =>
    trackV2('first_recommendation_generated', {
      user_id: ctx.userId,
      business_id: ctx.businessId,
      recommendation_id: ctx.recommendationId,
      source_type: ctx.sourceType,
      data_mode: ctx.dataMode,
      confidence: ctx.confidence,
    })
  );
}

export function trackFirstRecommendationViewed(ctx: TrackingContext) {
  trackOnce(`fv_rec_viewed:${ctx.userId}:${ctx.businessId}`, () =>
    trackV2('first_recommendation_viewed', {
      user_id: ctx.userId,
      business_id: ctx.businessId,
      recommendation_id: ctx.recommendationId,
    })
  );
}

export function trackFirstRecommendationAccepted(ctx: TrackingContext) {
  trackV2('first_recommendation_accepted', {
    user_id: ctx.userId,
    business_id: ctx.businessId,
    recommendation_id: ctx.recommendationId,
  });
}

export function trackFirstWorkspaceOpened(ctx: TrackingContext, actionType: ActionType) {
  trackV2('first_workspace_opened', {
    user_id: ctx.userId,
    business_id: ctx.businessId,
    recommendation_id: ctx.recommendationId,
    action_type: actionType,
  });
}

export function trackFirstActionCompleted(ctx: TrackingContext, actionType: ActionType) {
  trackV2('first_action_completed', {
    user_id: ctx.userId,
    business_id: ctx.businessId,
    recommendation_id: ctx.recommendationId,
    action_type: actionType,
  });
}

export function trackFirstValueCompleted(ctx: TrackingContext, timeToFirstValueSeconds: number) {
  trackOnce(`fv_completed:${ctx.userId}:${ctx.businessId}`, () =>
    trackV2('first_value_completed', {
      user_id: ctx.userId,
      business_id: ctx.businessId,
      recommendation_id: ctx.recommendationId,
      time_to_first_value_seconds: timeToFirstValueSeconds,
    })
  );
}

export function trackBetaRequestSuccess(email: string) {
  trackV2('beta_request_success', { email });
}

export function trackBetaRequestFailed(email: string, reason: string) {
  trackV2('beta_request_failed', { email, reason });
}
