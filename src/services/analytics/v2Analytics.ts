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
