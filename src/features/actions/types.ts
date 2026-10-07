import type { ActionType, ImpactLevel } from '../../domain/types';

export type ActionSourceType =
  | 'VERIFIED_FINDING'
  | 'BUSINESS_PROFILE'
  | 'GOAL_BASED'
  | 'GENERAL_BEST_PRACTICE'
  | 'FOLLOW_UP'
  | 'SOURCE_REQUIRED';

export type ActionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';

export type ActionCategory = 'profile' | 'goals' | 'content' | 'reputation' | 'visibility' | 'data' | 'follow_up';

export type ActionCta = 'start' | 'prepare' | 'complete' | 'connect' | 'review';

export interface ActionCopy {
  title: string;
  description: string;
  reason: string;
  value: string;
}

export interface ActionCandidate {
  ruleId: string;
  actionType: ActionType;
  category: ActionCategory;
  sourceType: ActionSourceType;
  sourceReference: string;
  impact: ImpactLevel;
  effortMinutes: number;
  cta: ActionCta;
  ctaTo?: string;
  copy: { es: ActionCopy; en: ActionCopy };
}

export interface ScoredCandidate extends ActionCandidate {
  cooldownDays: number;
  score: number;
  priority: ActionPriority;
}

export interface BusinessAction {
  id: string;
  businessId: string;
  userId: string;
  ruleId: string;
  actionType: ActionType;
  category: ActionCategory;
  title: string;
  description: string;
  reason: string;
  sourceType: ActionSourceType;
  sourceReference: string;
  priority: ActionPriority;
  score: number;
  impact: ImpactLevel;
  effortMinutes: number;
  status: ActionStatus;
  dueDate: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
}

export interface SourceSnapshot {
  sourceType: string;
  status: string;
  lastSyncAt: string | null;
  metadata: Record<string, unknown>;
}
