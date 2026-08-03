import { track } from '../../lib/analytics';
import type { DataMode } from '../../domain/types';

// ─── Dedup guard for view events (fires once per route per session) ─────────

const viewedPages = new Set<string>();

function trackViewOnce(eventName: string, props: Record<string, unknown> = {}) {
  const key = `${eventName}:${props.route ?? props.business_id ?? ''}`;
  if (viewedPages.has(key)) return;
  viewedPages.add(key);
  track(eventName, props);
}

// ─── App-level events ───────────────────────────────────────────────────────

export function trackTodayView(businessId?: string) {
  trackViewOnce('v2_today_view', { business_id: businessId });
}

export function trackNavigationClick(route: string) {
  track('v2_navigation_click', { route });
}

export function trackBusinessSelectorClick() {
  track('v2_business_selector_click', {});
}

export function trackSourceConnectClick(sourceType: string) {
  track('v2_source_connect_click', { source_type: sourceType });
}

export function trackRecommendationView(recommendationId: string, dataMode: DataMode) {
  track('v2_recommendation_view', { recommendation_id: recommendationId, data_mode: dataMode });
}

export function trackRecommendationActionClick(recommendationId: string, dataMode: DataMode) {
  track('v2_recommendation_action_click', { recommendation_id: recommendationId, data_mode: dataMode });
}

export function trackDemoBadgeView() {
  trackViewOnce('v2_demo_badge_view', {});
}

export function trackOnboardingStart() {
  track('v2_onboarding_start', {});
}

// ─── Daily Briefing Events ──────────────────────────────────────────────────

export function trackDailyBriefingView(businessId?: string) {
  trackViewOnce('daily_briefing_view', { business_id: businessId });
}

export function trackRecommendationOpen(recommendationId: string, dataMode: DataMode) {
  track('recommendation_open', { recommendation_id: recommendationId, data_mode: dataMode });
}

export function trackRecommendationExecute(recommendationId: string, dataMode: DataMode) {
  track('recommendation_execute', { recommendation_id: recommendationId, data_mode: dataMode });
}

export function trackTaskCompleted(recommendationId: string, timeMinutes: number) {
  track('task_completed', { recommendation_id: recommendationId, time_minutes: timeMinutes });
}

export function trackQuickActionClick(actionType: string) {
  track('quick_action_click', { action_type: actionType });
}

export function trackWeeklyProgressView() {
  trackViewOnce('weekly_progress_view', {});
}

export function trackTomorrowPreviewView() {
  trackViewOnce('tomorrow_preview_view', {});
}

// ─── Execution/Workspace Events ─────────────────────────────────────────────

export function trackWorkspaceOpen(recommendationId: string, workspaceType: string) {
  track('workspace_open', { recommendation_id: recommendationId, workspace_type: workspaceType });
}

export function trackWorkspaceClose(recommendationId: string) {
  track('workspace_close', { recommendation_id: recommendationId });
}

export function trackWorkspaceComplete(recommendationId: string) {
  track('workspace_complete', { recommendation_id: recommendationId });
}

export function trackContentCopy() {
  track('content_copy', {});
}

export function trackContentEdit() {
  track('content_edit', {});
}

export function trackRecommendationVerified(recommendationId: string) {
  track('recommendation_verified', { recommendation_id: recommendationId });
}

export function trackExecutionFinished(recommendationId: string) {
  track('execution_finished', { recommendation_id: recommendationId });
}

// ─── Business Memory Events ─────────────────────────────────────────────────

export function trackBusinessProfileUpdated() {
  track('business_profile_updated', {});
}

export function trackGoalCreated(goalId: string) {
  track('goal_created', { goal_id: goalId });
}

export function trackGoalCompleted(goalId: string) {
  track('goal_completed', { goal_id: goalId });
}

export function trackTimelineView() {
  trackViewOnce('timeline_view', {});
}

export function trackWeeklySummaryView() {
  trackViewOnce('weekly_summary_view', {});
}

export function trackMemoryUpdated() {
  track('memory_updated', {});
}

export function trackRecommendationPersonalized(recommendationId: string) {
  track('recommendation_personalized', { recommendation_id: recommendationId });
}

// ─── Reality Engine / Source Events ─────────────────────────────────────────

export function trackSourceConnected(sourceId: string) {
  track('source_connected', { source_id: sourceId });
}

export function trackSourceSync(sourceId: string) {
  track('source_sync', { source_id: sourceId });
}

export function trackSourceError(sourceId: string) {
  track('source_error', { source_id: sourceId });
}

export function trackSourceDisconnected(sourceId: string) {
  track('source_disconnected', { source_id: sourceId });
}

// ─── Dashboard Events ───────────────────────────────────────────────────────

export function trackDashboardOpen(businessId?: string) {
  trackViewOnce('dashboard_open', { business_id: businessId });
}

export function trackDashboardActionClick(recommendationId: string, actionType: string) {
  track('dashboard_action_click', { recommendation_id: recommendationId, action_type: actionType });
}

export function trackDashboardBusinessEdit() {
  track('dashboard_business_edit', {});
}

export function trackDashboardGrowthDetails() {
  track('dashboard_growth_details', {});
}

export function trackDashboardWorkspaceOpen(recommendationId: string) {
  track('dashboard_workspace_open', { recommendation_id: recommendationId });
}

export function trackBusinessHeaderView() {
  trackViewOnce('business_header_view', {});
}

export function trackBusinessEditClick() {
  track('business_edit_click', {});
}

export function trackBusinessSyncClick() {
  track('business_sync_click', {});
}
