import type { ActionType } from '../../domain/types';

export type ExecutionStatus = 'new' | 'ready' | 'running' | 'completed' | 'verified';

export interface ExecutionState {
  recommendationId: string;
  status: ExecutionStatus;
  startedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  history: ExecutionHistoryEntry[];
}

export interface ExecutionHistoryEntry {
  status: ExecutionStatus;
  timestamp: string;
  label: string;
}

export interface WorkspaceConfig {
  actionType: ActionType;
  title: string;
  description: string;
  component: string;
}

export interface PreparedContent {
  title?: string;
  body: string;
  metadata?: Record<string, string>;
}

export interface ReviewItem {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  suggestedResponse: string;
}

export interface PostDraft {
  title: string;
  body: string;
  callToAction?: string;
}

export interface ProfileOptimization {
  field: string;
  current: string;
  proposed: string;
}
