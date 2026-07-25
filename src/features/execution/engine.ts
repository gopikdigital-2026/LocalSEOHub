import type { Recommendation, ActionType } from '../../domain/types';
import type { ExecutionState, ExecutionStatus, ExecutionHistoryEntry } from './types';

function createHistoryEntry(status: ExecutionStatus, label: string): ExecutionHistoryEntry {
  return { status, timestamp: new Date().toISOString(), label };
}

export function createExecutionState(recommendation: Recommendation): ExecutionState {
  return {
    recommendationId: recommendation.id,
    status: 'new',
    startedAt: null,
    completedAt: null,
    verifiedAt: null,
    history: [createHistoryEntry('new', 'Recomendacion creada')],
  };
}

export function advanceExecution(state: ExecutionState, to: ExecutionStatus): ExecutionState {
  const labels: Record<ExecutionStatus, string> = {
    new: 'Recomendacion creada',
    ready: 'Contenido preparado',
    running: 'Ejecucion iniciada',
    completed: 'Accion completada',
    verified: 'Resultado verificado',
  };

  const now = new Date().toISOString();
  const entry = createHistoryEntry(to, labels[to]);

  return {
    ...state,
    status: to,
    startedAt: to === 'running' && !state.startedAt ? now : state.startedAt,
    completedAt: to === 'completed' ? now : state.completedAt,
    verifiedAt: to === 'verified' ? now : state.verifiedAt,
    history: [...state.history, entry],
  };
}

export function resolveWorkspaceId(actionType: ActionType): string {
  const mapping: Record<ActionType, string> = {
    respond_reviews: 'review',
    publish_post: 'post',
    update_description: 'profile',
    add_photos: 'profile',
    update_hours: 'profile',
    create_content: 'content',
    request_reviews: 'review',
    optimize_profile: 'profile',
    other: 'content',
  };
  return mapping[actionType];
}
