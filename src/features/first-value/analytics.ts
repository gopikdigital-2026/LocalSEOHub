import type { ActionType } from '../../domain/types';
import type { FirstValueStep, SourceChoiceType } from './types';
import type { GoalId } from '../business-memory/types';

let tracked = new Set<string>();

function trackOnce(key: string, fn: () => void) {
  if (tracked.has(key)) return;
  tracked.add(key);
  fn();
}

function trackV2(event: string, props?: Record<string, string | number>) {
  try {
    const payload = { event, timestamp: new Date().toISOString(), ...props };
    const existing = JSON.parse(localStorage.getItem('lsh_v2_analytics') ?? '[]');
    existing.push(payload);
    localStorage.setItem('lsh_v2_analytics', JSON.stringify(existing.slice(-500)));
  } catch { /* silent */ }
}

export function trackFirstValueStarted() {
  trackOnce('fv_started', () => trackV2('first_value_started'));
}

export function trackFirstValueStepViewed(step: FirstValueStep | string) {
  trackV2('first_value_step_viewed', { step });
}

export function trackBusinessSetupCompleted() {
  trackOnce('biz_setup', () => trackV2('business_setup_completed'));
}

export function trackPrimaryGoalSelected(goalId: GoalId) {
  trackV2('primary_goal_selected', { goal_id: goalId });
}

export function trackInitialSourceSelected(sourceType: SourceChoiceType) {
  trackV2('initial_source_selected', { source_type: sourceType });
}

export function trackFirstRecommendationViewed(recommendationId: string) {
  trackOnce('fv_rec_viewed', () => trackV2('first_recommendation_viewed', { recommendation_id: recommendationId }));
}

export function trackFirstRecommendationAccepted(recommendationId: string) {
  trackV2('first_recommendation_accepted', { recommendation_id: recommendationId });
}

export function trackFirstActionCompleted(recommendationId: string, actionType: ActionType) {
  trackV2('first_action_completed', { recommendation_id: recommendationId, action_type: actionType });
}

export function trackFirstValueCompleted(timeToFirstValueSeconds: number) {
  trackOnce('fv_completed', () => trackV2('first_value_completed', { time_to_first_value_seconds: timeToFirstValueSeconds }));
}

export function trackFirstValueAbandoned(step: FirstValueStep | string) {
  trackV2('first_value_abandoned', { step });
}
