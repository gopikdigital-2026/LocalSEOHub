import type { FirstValueState, FirstValueStep } from './types';

const STORAGE_KEY = 'lsh_v2_first_value';

function getDefaultState(): FirstValueState {
  return {
    currentStep: 'welcome',
    startedAt: new Date().toISOString(),
    completedAt: null,
    businessData: null,
    selectedGoalId: null,
    sourceChoice: null,
    recommendationId: null,
    actionCompleted: false,
  };
}

export interface FirstValueRepository {
  load(): FirstValueState;
  save(state: FirstValueState): void;
  isCompleted(): boolean;
  reset(): void;
}

export function createFirstValueRepository(): FirstValueRepository {
  function read(): FirstValueState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as FirstValueState;
    } catch { /* corrupted */ }
    return getDefaultState();
  }

  function write(state: FirstValueState): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* silent */ }
  }

  return {
    load() { return read(); },
    save(state: FirstValueState) { write(state); },
    isCompleted() { return read().completedAt !== null; },
    reset() { write(getDefaultState()); },
  };
}

export function advanceStep(state: FirstValueState, step: FirstValueStep): FirstValueState {
  return { ...state, currentStep: step };
}
