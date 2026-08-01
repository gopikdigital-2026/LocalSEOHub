import type { ActionType, ConfidenceLevel, DataSourceType, ImpactLevel } from '../../domain/types';
import type { GoalId } from '../business-memory/types';
import type { SourceId } from '../reality-engine/types';

export type FirstValueStep =
  | 'welcome'
  | 'business_setup'
  | 'primary_goal'
  | 'source_setup'
  | 'initial_analysis'
  | 'first_recommendation'
  | 'first_execution'
  | 'success';

export const STEP_ORDER: FirstValueStep[] = [
  'welcome',
  'business_setup',
  'primary_goal',
  'source_setup',
  'initial_analysis',
  'first_recommendation',
  'first_execution',
  'success',
];

export interface FirstValueState {
  currentStep: FirstValueStep;
  startedAt: string;
  completedAt: string | null;
  businessData: BusinessSetupData | null;
  selectedGoalId: GoalId | null;
  sourceChoice: SourceChoice | null;
  recommendationId: string | null;
  actionCompleted: boolean;
}

export interface BusinessSetupData {
  name: string;
  category: string;
  city: string;
  website: string;
}

export type SourceChoiceType = 'website_analysis' | 'manual_entry' | 'demo';

export interface SourceChoice {
  type: SourceChoiceType;
  sourceId: SourceId;
  dataSourceType: DataSourceType;
  confidence: ConfidenceLevel;
}

export interface FirstRecommendationData {
  id: string;
  title: string;
  whatHappens: string;
  whyItMatters: string;
  whatWePrepared: string;
  estimatedMinutes: number;
  source: string;
  confidence: ConfidenceLevel;
  impact: ImpactLevel;
  actionType: ActionType;
}
