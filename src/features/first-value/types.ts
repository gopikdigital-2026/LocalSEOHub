import type { ActionType, ImpactLevel } from '../../domain/types';
import type { GoalId } from '../business-memory/types';
import type { SourceId } from '../reality-engine/types';

// ─── Data transparency ──────────────────────────────────────────────────────

export type DataMode = 'verified' | 'estimated' | 'manual' | 'demo';
export type Confidence = 'high' | 'medium' | 'low';

export type WebsiteSourceStatus = 'website_provided' | 'website_verified';

// ─── Steps ──────────────────────────────────────────────────────────────────

export type FirstValueStep =
  | 'welcome'
  | 'business_setup'
  | 'primary_goal'
  | 'source_setup'
  | 'manual_context'
  | 'initial_analysis'
  | 'first_recommendation'
  | 'first_execution'
  | 'success';

export const STEP_ORDER: FirstValueStep[] = [
  'welcome',
  'business_setup',
  'primary_goal',
  'source_setup',
  'manual_context',
  'initial_analysis',
  'first_recommendation',
  'first_execution',
  'success',
];

// ─── Business setup ─────────────────────────────────────────────────────────

export interface BusinessSetupData {
  name: string;
  category: string;
  city: string;
  website: string;
}

// ─── Manual context ─────────────────────────────────────────────────────────

export interface ManualContextData {
  mainService: string;
  clientType: string;
  mainChannel: string;
  publishFrequency: string;
  receivesReviews: string;
  mainDifficulty: string;
  communicationTone: string;
}

// ─── Source choice ──────────────────────────────────────────────────────────

export type SourceChoiceType = 'website_analysis' | 'manual_entry' | 'demo';

export interface SourceChoice {
  type: SourceChoiceType;
  sourceId: SourceId;
  websiteStatus: WebsiteSourceStatus | null;
  dataMode: DataMode;
  confidence: Confidence;
}

// ─── Recommendation (full persisted) ────────────────────────────────────────

export interface FirstRecommendationData {
  id: string;
  businessId: string;
  userId: string;
  goalId: GoalId;
  title: string;
  description: string;
  reason: string;
  evidenceSummary: string;
  limitations: string;
  actionType: ActionType;
  impact: ImpactLevel;
  estimatedTimeMinutes: number;
  sourceType: SourceChoiceType;
  sourceName: string;
  sourceUpdatedAt: string | null;
  dataMode: DataMode;
  confidence: Confidence;
  preparedContent: PreparedContent;
  status: 'new' | 'accepted' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface PreparedContent {
  title: string;
  body: string;
  callToAction: string;
  personalizedWith: string[];
  missingData: string[];
}

// ─── State (persisted per user+business) ────────────────────────────────────

export interface FirstValueState {
  id: string | null;
  userId: string;
  businessId: string;
  currentStep: FirstValueStep;
  startedAt: string;
  completedAt: string | null;
  businessData: BusinessSetupData | null;
  manualContext: ManualContextData | null;
  selectedGoalId: GoalId | null;
  sourceChoice: SourceChoice | null;
  recommendation: FirstRecommendationData | null;
  executionPayload: ExecutionPayload | null;
}

export interface ExecutionPayload {
  status: 'ready' | 'in_progress' | 'completed';
  startedAt: string | null;
  completedAt: string | null;
  editedContent: string | null;
}
