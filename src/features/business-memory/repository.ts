import type {
  BusinessMemoryState,
  BusinessProfile,
  SelectedGoal,
  TimelineEvent,
  BusinessInsight,
  BusinessPreference,
  WeeklySummaryData,
} from './types';

export interface MemoryRepository {
  load(): BusinessMemoryState;
  save(state: BusinessMemoryState): void;
  updateProfile(profile: BusinessProfile): void;
  setGoals(goals: SelectedGoal[]): void;
  addTimelineEvent(event: TimelineEvent): void;
  setInsights(insights: BusinessInsight[]): void;
  setPreferences(preferences: BusinessPreference[]): void;
  addWeeklySummary(summary: WeeklySummaryData): void;
}

const STORAGE_KEY = 'lsh_v2_business_memory';

function getDefaultState(): BusinessMemoryState {
  return {
    profile: {
      id: 'biz-001',
      name: '',
      category: '',
      city: '',
      services: [],
      website: '',
      phone: '',
      schedule: '',
      targetAudience: '',
      updatedAt: new Date().toISOString(),
    },
    goals: [],
    timeline: [],
    insights: [],
    preferences: [],
    weeklySummaries: [],
  };
}

function readFromStorage(): BusinessMemoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BusinessMemoryState;
  } catch {
    // corrupted data - reset
  }
  return getDefaultState();
}

function writeToStorage(state: BusinessMemoryState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded or unavailable - silent
  }
}

export function createLocalRepository(): MemoryRepository {
  let state = readFromStorage();

  return {
    load() {
      state = readFromStorage();
      return state;
    },

    save(newState: BusinessMemoryState) {
      state = newState;
      writeToStorage(state);
    },

    updateProfile(profile: BusinessProfile) {
      state = { ...state, profile: { ...profile, updatedAt: new Date().toISOString() } };
      writeToStorage(state);
    },

    setGoals(goals: SelectedGoal[]) {
      state = { ...state, goals };
      writeToStorage(state);
    },

    addTimelineEvent(event: TimelineEvent) {
      state = { ...state, timeline: [event, ...state.timeline].slice(0, 200) };
      writeToStorage(state);
    },

    setInsights(insights: BusinessInsight[]) {
      state = { ...state, insights };
      writeToStorage(state);
    },

    setPreferences(preferences: BusinessPreference[]) {
      state = { ...state, preferences };
      writeToStorage(state);
    },

    addWeeklySummary(summary: WeeklySummaryData) {
      state = { ...state, weeklySummaries: [summary, ...state.weeklySummaries].slice(0, 52) };
      writeToStorage(state);
    },
  };
}
