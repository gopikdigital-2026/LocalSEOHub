import { track } from '../../lib/analytics';
import type { DataMode } from '../../domain/types';

interface V2EventProperties {
  route?: string;
  business_id?: string;
  data_mode?: DataMode;
  recommendation_id?: string;
  device?: 'mobile' | 'tablet' | 'desktop';
  session_id?: string;
  [key: string]: string | number | undefined;
}

function getDevice(): 'mobile' | 'tablet' | 'desktop' {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function getSessionId(): string {
  let sid = sessionStorage.getItem('v2_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('v2_session_id', sid);
  }
  return sid;
}

function trackV2(eventName: string, props: V2EventProperties = {}) {
  track(eventName, {
    ...props,
    device: props.device ?? getDevice(),
    session_id: props.session_id ?? getSessionId(),
  });
}

export function trackAppView(route: string) {
  trackV2('v2_app_view', { route });
}

export function trackTodayView(businessId?: string) {
  trackV2('v2_today_view', { business_id: businessId });
}

export function trackNavigationClick(route: string) {
  trackV2('v2_navigation_click', { route });
}

export function trackBusinessSelectorClick() {
  trackV2('v2_business_selector_click');
}

export function trackSourceConnectClick(sourceType: string) {
  trackV2('v2_source_connect_click', { route: sourceType });
}

export function trackRecommendationView(recommendationId: string, dataMode: DataMode) {
  trackV2('v2_recommendation_view', { recommendation_id: recommendationId, data_mode: dataMode });
}

export function trackRecommendationActionClick(recommendationId: string, dataMode: DataMode) {
  trackV2('v2_recommendation_action_click', { recommendation_id: recommendationId, data_mode: dataMode });
}

export function trackDemoBadgeView() {
  trackV2('v2_demo_badge_view');
}

export function trackOnboardingStart() {
  trackV2('v2_onboarding_start');
}

// ─── Daily Briefing Events ──────────────────────────────────────────────────

export function trackDailyBriefingView(businessId?: string) {
  trackV2('daily_briefing_view', { business_id: businessId });
}

export function trackRecommendationOpen(recommendationId: string, dataMode: DataMode) {
  trackV2('recommendation_open', { recommendation_id: recommendationId, data_mode: dataMode });
}

export function trackRecommendationExecute(recommendationId: string, dataMode: DataMode) {
  trackV2('recommendation_execute', { recommendation_id: recommendationId, data_mode: dataMode });
}

export function trackTaskCompleted(recommendationId: string, timeMinutes: number) {
  trackV2('task_completed', { recommendation_id: recommendationId, route: String(timeMinutes) });
}

export function trackQuickActionClick(actionType: string) {
  trackV2('quick_action_click', { route: actionType });
}

export function trackWeeklyProgressView() {
  trackV2('weekly_progress_view');
}

export function trackTomorrowPreviewView() {
  trackV2('tomorrow_preview_view');
}

// ─── Execution/Workspace Events ─────────────────────────────────────────────

export function trackWorkspaceOpen(recommendationId: string, workspaceType: string) {
  trackV2('workspace_open', { recommendation_id: recommendationId, route: workspaceType });
}

export function trackWorkspaceClose(recommendationId: string) {
  trackV2('workspace_close', { recommendation_id: recommendationId });
}

export function trackWorkspaceComplete(recommendationId: string) {
  trackV2('workspace_complete', { recommendation_id: recommendationId });
}

export function trackContentCopy() {
  trackV2('content_copy');
}

export function trackContentEdit() {
  trackV2('content_edit');
}

export function trackRecommendationVerified(recommendationId: string) {
  trackV2('recommendation_verified', { recommendation_id: recommendationId });
}

export function trackExecutionFinished(recommendationId: string) {
  trackV2('execution_finished', { recommendation_id: recommendationId });
}

// ─── Business Memory Events ─────────────────────────────────────────────────

export function trackBusinessProfileUpdated() {
  trackV2('business_profile_updated');
}

export function trackGoalCreated(goalId: string) {
  trackV2('goal_created', { route: goalId });
}

export function trackGoalCompleted(goalId: string) {
  trackV2('goal_completed', { route: goalId });
}

export function trackTimelineView() {
  trackV2('timeline_view');
}

export function trackWeeklySummaryView() {
  trackV2('weekly_summary_view');
}

export function trackMemoryUpdated() {
  trackV2('memory_updated');
}

export function trackRecommendationPersonalized(recommendationId: string) {
  trackV2('recommendation_personalized', { recommendation_id: recommendationId });
}

// ─── Reality Engine / Source Events ─────────────────────────────────────────

export function trackSourceConnected(sourceId: string) {
  trackV2('source_connected', { route: sourceId });
}

export function trackSourceSync(sourceId: string) {
  trackV2('source_sync', { route: sourceId });
}

export function trackSourceError(sourceId: string) {
  trackV2('source_error', { route: sourceId });
}

export function trackSourceDisconnected(sourceId: string) {
  trackV2('source_disconnected', { route: sourceId });
}
