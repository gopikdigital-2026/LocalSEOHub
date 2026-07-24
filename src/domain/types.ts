// ─── Enums / Unions ─────────────────────────────────────────────────────────

export type RecommendationStatus = 'new' | 'accepted' | 'in_progress' | 'completed' | 'dismissed' | 'expired';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type ImpactLevel = 'high' | 'medium' | 'low';
export type ConfidenceLevel = 'verified' | 'estimated' | 'demo';
export type DataMode = 'real' | 'estimated' | 'demo';

export type DataSourceType = 'google_business' | 'website' | 'reviews' | 'manual' | 'social' | 'internal';
export type DataSourceStatus = 'connected' | 'pending' | 'error' | 'not_connected';

export type ActionType = 'respond_reviews' | 'publish_post' | 'update_description' | 'add_photos' | 'update_hours' | 'create_content' | 'request_reviews' | 'optimize_profile' | 'other';

// ─── Domain Models ──────────────────────────────────────────────────────────

export interface Business {
  id: string;
  name: string;
  city: string;
  category: string;
  website: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataSource {
  id: string;
  type: DataSourceType;
  name: string;
  connected: boolean;
  lastUpdatedAt: string | null;
  status: DataSourceStatus;
  errorMessage?: string;
}

export interface Recommendation {
  id: string;
  businessId: string;
  title: string;
  summary: string;
  explanation: string;
  reason: string;
  source: string;
  sourceType: DataSourceType;
  sourceUpdatedAt: string | null;
  confidence: ConfidenceLevel;
  impact: ImpactLevel;
  estimatedTimeMinutes: number;
  status: RecommendationStatus;
  actionType: ActionType;
  createdAt: string;
  expiresAt?: string;
  dataMode: DataMode;
}

export interface Task {
  id: string;
  recommendationId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: ImpactLevel;
  dueDate?: string;
  completedAt?: string;
  resultSummary?: string;
  dataMode: DataMode;
}

export interface Metric {
  id: string;
  name: string;
  value: number;
  previousValue?: number;
  unit: string;
  source: DataSourceType;
  updatedAt: string;
  confidence: ConfidenceLevel;
  dataMode: DataMode;
}

export interface WeeklyGoal {
  id: string;
  businessId: string;
  title: string;
  description: string;
  weekStart: string;
  dataMode: DataMode;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
}
