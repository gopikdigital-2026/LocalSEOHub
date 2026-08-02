const VIEW_TRACKED = new Set<string>();

function track(event: string, props: Record<string, string | undefined>) {
  try {
    const payload = { event, ...props, timestamp: new Date().toISOString() };
    const win = window as unknown as Record<string, unknown>;
    if (typeof window !== 'undefined' && win.__analytics_queue) {
      (win.__analytics_queue as unknown[]).push(payload);
    }
  } catch { /* silent */ }
}

function trackOnce(event: string, props: Record<string, string | undefined>) {
  if (VIEW_TRACKED.has(event)) return;
  VIEW_TRACKED.add(event);
  track(event, props);
}

export function trackDashboardV4View(businessId?: string) {
  trackOnce('dashboard_v4_view', { business_id: businessId });
}

export function trackDashboardBusinessEditClick(businessId?: string) {
  track('dashboard_business_edit_click', { business_id: businessId });
}

export function trackDashboardSyncClick(businessId?: string) {
  track('dashboard_sync_click', { business_id: businessId });
}

export function trackDashboardPrimaryActionClick(recommendationId: string, actionType: string) {
  track('dashboard_primary_action_click', { recommendation_id: recommendationId, action_type: actionType });
}

export function trackDashboardSecondaryActionClick(recommendationId: string, actionType: string) {
  track('dashboard_secondary_action_click', { recommendation_id: recommendationId, action_type: actionType });
}

export function trackDashboardGrowthDetailsClick() {
  track('dashboard_growth_details_click', {});
}

export function trackDashboardHistoryClick() {
  track('dashboard_history_click', {});
}

export function trackDashboardAutomationClick() {
  track('dashboard_automation_click', {});
}

export function trackDashboardEmptyStateClick() {
  track('dashboard_empty_state_click', {});
}
