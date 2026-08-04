import type { FirstValueState, FirstValueStep } from './types';
import { supabase } from '../../lib/supabase';

// ─── Repository Interface ───────────────────────────────────────────────────

export interface FirstValueRepository {
  load(): Promise<FirstValueState | null>;
  save(state: FirstValueState): Promise<void>;
  isCompleted(): Promise<boolean>;
  reset(): Promise<void>;
}

// ─── Default state factory ──────────────────────────────────────────────────

export function createDefaultState(userId: string, businessId: string): FirstValueState {
  return {
    id: null,
    userId,
    businessId,
    currentStep: 'welcome',
    startedAt: new Date().toISOString(),
    completedAt: null,
    businessData: null,
    manualContext: null,
    selectedGoalId: null,
    sourceChoice: null,
    recommendation: null,
    executionPayload: null,
  };
}

// ─── Supabase-backed repository (per user + business) ───────────────────────

export function createFirstValueRepository(userId: string, businessId: string = 'default'): FirstValueRepository {

  async function load(): Promise<FirstValueState | null> {
    const { data, error } = await supabase
      .from('first_value_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error || !data) return null;

    return mapRowToState(data);
  }

  async function save(state: FirstValueState): Promise<void> {
    const row = mapStateToRow(state);

    if (state.id) {
      const { error } = await supabase
        .from('first_value_progress')
        .update(row)
        .eq('id', state.id);

      if (error) {
        if (import.meta.env.DEV) console.error('[FV repo] update error:', error);
        throw new Error(`Save failed: ${error.message}`);
      }

      if (import.meta.env.DEV) console.log('[FV repo] row updated:', state.id, 'step:', state.currentStep, 'completed:', state.completedAt !== null);
    } else {
      const { data, error } = await supabase
        .from('first_value_progress')
        .upsert(row, { onConflict: 'user_id,business_id' })
        .select('id')
        .maybeSingle();

      if (error) {
        if (import.meta.env.DEV) console.error('[FV repo] upsert error:', error);
        throw new Error(`Save failed: ${error.message}`);
      }

      if (data) state.id = data.id;

      if (import.meta.env.DEV) console.log('[FV repo] row upserted:', data?.id, 'step:', state.currentStep, 'completed:', state.completedAt !== null);
    }
  }

  async function isCompleted(): Promise<boolean> {
    const { data, error } = await supabase
      .from('first_value_progress')
      .select('completed, completed_at')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) {
      if (import.meta.env.DEV) console.error('[FV repo] isCompleted error:', error);
      return false;
    }

    const result = data?.completed === true && data?.completed_at !== null;
    if (import.meta.env.DEV) console.log('[FV repo] isCompleted:', result);
    return result;
  }

  async function reset(): Promise<void> {
    const { error } = await supabase
      .from('first_value_progress')
      .delete()
      .eq('user_id', userId)
      .eq('business_id', businessId);

    if (error) {
      if (import.meta.env.DEV) console.error('[FV repo] reset error:', error);
      throw new Error(`Reset failed: ${error.message}`);
    }
  }

  return { load, save, isCompleted, reset };
}

// ─── Step helpers ───────────────────────────────────────────────────────────

export function advanceStep(state: FirstValueState, step: FirstValueStep): FirstValueState {
  return { ...state, currentStep: step, updatedAt: new Date().toISOString() } as FirstValueState & { updatedAt: string };
}

// ─── Row mapping ────────────────────────────────────────────────────────────

interface ProgressRow {
  id: string;
  user_id: string;
  business_id: string;
  current_step: string;
  completed: boolean;
  selected_goal_id: string | null;
  selected_source_type: string | null;
  business_data: unknown;
  manual_context: unknown;
  recommendation_payload: unknown;
  execution_payload: unknown;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

function mapRowToState(row: ProgressRow): FirstValueState {
  return {
    id: row.id,
    userId: row.user_id,
    businessId: row.business_id,
    currentStep: row.current_step as FirstValueStep,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    businessData: row.business_data as FirstValueState['businessData'],
    manualContext: row.manual_context as FirstValueState['manualContext'],
    selectedGoalId: row.selected_goal_id as FirstValueState['selectedGoalId'],
    sourceChoice: row.selected_source_type
      ? { type: row.selected_source_type as FirstValueState['sourceChoice'] extends null ? never : NonNullable<FirstValueState['sourceChoice']>['type'] } as FirstValueState['sourceChoice']
      : null,
    recommendation: row.recommendation_payload as FirstValueState['recommendation'],
    executionPayload: row.execution_payload as FirstValueState['executionPayload'],
  };
}

function mapStateToRow(state: FirstValueState): Record<string, unknown> {
  return {
    user_id: state.userId,
    business_id: state.businessId,
    current_step: state.currentStep,
    completed: state.completedAt !== null,
    selected_goal_id: state.selectedGoalId,
    selected_source_type: state.sourceChoice?.type ?? null,
    business_data: state.businessData,
    manual_context: state.manualContext,
    recommendation_payload: state.recommendation,
    execution_payload: state.executionPayload,
    started_at: state.startedAt,
    completed_at: state.completedAt,
    updated_at: new Date().toISOString(),
  };
}
