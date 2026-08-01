import { track } from '../../lib/analytics';
import type { ActionType } from '../../domain/types';
import type { Confidence, DataMode, FirstValueStep, SourceChoiceType } from './types';

// ─── Dedup guard (session-scoped) ───────────────────────────────────────────

const tracked = new Set<string>();

function trackOnce(key: string, fn: () => void) {
  if (tracked.has(key)) return;
  tracked.add(key);
  fn();
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

function ctx2props(ctx: TrackingContext): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (ctx.userId) p.fv_user_id = ctx.userId;
  if (ctx.businessId) p.fv_business_id = ctx.businessId;
  if (ctx.recommendationId) p.recommendation_id = ctx.recommendationId;
  if (ctx.sourceType) p.source_type = ctx.sourceType;
  if (ctx.dataMode) p.data_mode = ctx.dataMode;
  if (ctx.confidence) p.confidence = ctx.confidence;
  return p;
}

export function trackFirstValueStarted(ctx: TrackingContext) {
  trackOnce(`fv_started:${ctx.userId}:${ctx.businessId}`, () =>
    track('first_value_started', ctx2props(ctx))
  );
}

export function trackFirstValueResumed(ctx: TrackingContext, step: FirstValueStep) {
  track('first_value_resumed', { ...ctx2props(ctx), step });
}

export function trackFirstValueStepViewed(ctx: TrackingContext, step: FirstValueStep) {
  track('first_value_step_viewed', { ...ctx2props(ctx), step });
}

export function trackBusinessSetupCompleted(ctx: TrackingContext) {
  trackOnce(`biz_setup:${ctx.userId}:${ctx.businessId}`, () =>
    track('business_setup_completed', ctx2props(ctx))
  );
}

export function trackPrimaryGoalSelected(ctx: TrackingContext, goalId: string) {
  track('primary_goal_selected', { ...ctx2props(ctx), goal_id: goalId });
}

export function trackManualContextCompleted(ctx: TrackingContext) {
  trackOnce(`manual_ctx:${ctx.userId}:${ctx.businessId}`, () =>
    track('manual_context_completed', ctx2props(ctx))
  );
}

export function trackInitialSourceSelected(ctx: TrackingContext, sourceType: SourceChoiceType) {
  track('initial_source_selected', { ...ctx2props(ctx), source_type: sourceType });
}

export function trackInitialSourceConnected(ctx: TrackingContext) {
  track('initial_source_connected', ctx2props(ctx));
}

export function trackInitialAnalysisStarted(ctx: TrackingContext) {
  track('initial_analysis_started', ctx2props(ctx));
}

export function trackInitialAnalysisCompleted(ctx: TrackingContext) {
  track('initial_analysis_completed', ctx2props(ctx));
}

export function trackFirstRecommendationGenerated(ctx: TrackingContext) {
  trackOnce(`fv_rec_gen:${ctx.userId}:${ctx.businessId}`, () =>
    track('first_recommendation_generated', ctx2props(ctx))
  );
}

export function trackFirstRecommendationViewed(ctx: TrackingContext) {
  trackOnce(`fv_rec_viewed:${ctx.userId}:${ctx.businessId}`, () =>
    track('first_recommendation_viewed', ctx2props(ctx))
  );
}

export function trackFirstRecommendationAccepted(ctx: TrackingContext) {
  track('first_recommendation_accepted', ctx2props(ctx));
}

export function trackFirstWorkspaceOpened(ctx: TrackingContext, actionType: ActionType) {
  track('first_workspace_opened', { ...ctx2props(ctx), action_type: actionType });
}

export function trackFirstActionCompleted(ctx: TrackingContext, actionType: ActionType) {
  track('first_action_completed', { ...ctx2props(ctx), action_type: actionType });
}

export function trackFirstValueCompleted(ctx: TrackingContext, timeToFirstValueSeconds: number) {
  trackOnce(`fv_completed:${ctx.userId}:${ctx.businessId}`, () =>
    track('first_value_completed', { ...ctx2props(ctx), time_to_first_value_seconds: timeToFirstValueSeconds })
  );
}

export function trackBetaRequestSuccess() {
  track('beta_request_success', {});
}

export function trackBetaRequestFailed(reason: string) {
  track('beta_request_failed', { failure_reason: reason });
}
