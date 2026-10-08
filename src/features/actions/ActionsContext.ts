import { createContext, useContext } from 'react';
import type { BusinessAction } from './types';
import type { Milestones } from '../activation/milestones';

export interface ActionsContextValue {
  actions: BusinessAction[];
  loading: boolean;
  /** True once the first sync attempt for the current business has finished (success or failure). */
  ready: boolean;
  error: string | null;
  /** True when the server says this user has neither an active trial nor a subscription; actions stay readable. */
  locked: boolean;
  milestones: Milestones | null;
  /** Set only after the user's first useful action is confirmed COMPLETED and persisted as a milestone. */
  firstSuccess: BusinessAction | null;
  clearFirstSuccess(): void;
  /** Recommendations closed by the last sync because the data they asked for now exists. */
  recentlyResolved: BusinessAction[];
  clearRecentlyResolved(): void;
  ensureFresh(): Promise<void>;
  refresh(): Promise<void>;
  start(action: BusinessAction): Promise<void>;
  complete(action: BusinessAction): Promise<void>;
  dismiss(action: BusinessAction): Promise<void>;
}

export const ActionsContext = createContext<ActionsContextValue>({
  actions: [],
  loading: false,
  ready: false,
  error: null,
  locked: false,
  milestones: null,
  firstSuccess: null,
  clearFirstSuccess: () => {},
  recentlyResolved: [],
  clearRecentlyResolved: () => {},
  ensureFresh: async () => {},
  refresh: async () => {},
  start: async () => {},
  complete: async () => {},
  dismiss: async () => {},
});

export function useActions() {
  return useContext(ActionsContext);
}
