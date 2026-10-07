import type {
  BusinessMemoryState,
  BusinessProfile,
  TimelineEvent,
  BusinessInsight,
  BusinessPreference,
  WeeklySummaryData,
} from './types';
import { toGoals, toProfile, type BusinessRecord } from './businessRecord';

export interface MemoryRepository {
  load(): BusinessMemoryState;
  addTimelineEvent(event: TimelineEvent): void;
  setInsights(insights: BusinessInsight[]): void;
  setPreferences(preferences: BusinessPreference[]): void;
  addWeeklySummary(summary: WeeklySummaryData): void;
}

type ActivityLog = Pick<BusinessMemoryState, 'timeline' | 'insights' | 'preferences' | 'weeklySummaries'>;

export const ACTIVITY_KEY_PREFIX = 'lsh_v2_activity:';

const EMPTY_ACTIVITY: ActivityLog = { timeline: [], insights: [], preferences: [], weeklySummaries: [] };

function emptyProfile(): BusinessProfile {
  return {
    id: '',
    name: '',
    category: '',
    city: '',
    services: [],
    website: '',
    phone: '',
    schedule: '',
    targetAudience: '',
    updatedAt: new Date().toISOString(),
  };
}

function readActivity(key: string | null): ActivityLog {
  if (!key) return { ...EMPTY_ACTIVITY };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...EMPTY_ACTIVITY };
    const parsed = JSON.parse(raw) as Partial<ActivityLog>;
    return {
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
      weeklySummaries: Array.isArray(parsed.weeklySummaries) ? parsed.weeklySummaries : [],
    };
  } catch {
    return { ...EMPTY_ACTIVITY };
  }
}

function writeActivity(key: string | null, log: ActivityLog): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(log));
  } catch {
    // storage unavailable; the activity log is a device-local cache
  }
}

// Profile and goals always come from the Supabase business record; only the device activity log is cached locally.
export function createMemoryRepository(business: BusinessRecord | null): MemoryRepository {
  const key = business ? `${ACTIVITY_KEY_PREFIX}${business.id}` : null;
  let activity = readActivity(key);

  const persist = (next: ActivityLog) => {
    activity = next;
    writeActivity(key, activity);
  };

  return {
    load() {
      if (key) activity = readActivity(key);
      return {
        profile: business ? toProfile(business) : emptyProfile(),
        goals: business ? toGoals(business) : [],
        ...activity,
      };
    },
    addTimelineEvent(event) {
      persist({ ...activity, timeline: [event, ...activity.timeline].slice(0, 200) });
    },
    setInsights(insights) {
      persist({ ...activity, insights });
    },
    setPreferences(preferences) {
      persist({ ...activity, preferences });
    },
    addWeeklySummary(summary) {
      persist({ ...activity, weeklySummaries: [summary, ...activity.weeklySummaries].slice(0, 52) });
    },
  };
}
