import type { ActionType, ImpactLevel } from '../../domain/types';

// ─── Business Profile ───────────────────────────────────────────────────────

export interface BusinessProfile {
  id: string;
  name: string;
  category: string;
  city: string;
  services: string[];
  website: string;
  phone: string;
  schedule: string;
  targetAudience: string;
  updatedAt: string;
}

// ─── Business Goals ─────────────────────────────────────────────────────────

export type GoalId =
  | 'more_calls'
  | 'more_reviews'
  | 'better_local_seo'
  | 'more_bookings'
  | 'more_web_visits'
  | 'more_followers'
  | 'better_reputation';

export interface BusinessGoal {
  id: GoalId;
  label: string;
  description: string;
  icon: string;
  relatedActions: ActionType[];
}

export interface SelectedGoal {
  goalId: GoalId;
  selectedAt: string;
}

// ─── Timeline Event ─────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'action_completed' | 'goal_set' | 'profile_updated' | 'insight_generated';
  title: string;
  description?: string;
  actionType?: ActionType;
  impact?: ImpactLevel;
  durationMinutes?: number;
}

// ─── Insight ────────────────────────────────────────────────────────────────

export interface BusinessInsight {
  id: string;
  text: string;
  type: 'positive' | 'neutral' | 'warning';
  generatedAt: string;
  basedOn: string;
}

// ─── Preferences ────────────────────────────────────────────────────────────

export interface BusinessPreference {
  id: string;
  label: string;
  inferredFrom: string;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Weekly Summary ─────────────────────────────────────────────────────────

export interface WeeklySummaryData {
  weekStart: string;
  weekEnd: string;
  actionsCompleted: number;
  timeInvestedMinutes: number;
  goalsProgress: { goalId: GoalId; progress: number }[];
  impactAchieved: { high: number; medium: number; low: number };
  topRecommendation: string;
}

// ─── Memory State ───────────────────────────────────────────────────────────

export interface BusinessMemoryState {
  profile: BusinessProfile;
  goals: SelectedGoal[];
  timeline: TimelineEvent[];
  insights: BusinessInsight[];
  preferences: BusinessPreference[];
  weeklySummaries: WeeklySummaryData[];
}
