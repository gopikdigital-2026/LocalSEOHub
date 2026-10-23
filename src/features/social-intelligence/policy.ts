import type { Freshness, Sufficiency } from './types';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const FRESHNESS_POLICY = {
  freshMaxHours: 24,
  agingMaxHours: 7 * 24,
} as const;

// Whole elapsed days (floor of exact elapsed time); both bounds inclusive: recent <= 7, long inactivity >= 31 (i.e. > 30).
export const RECENCY_POLICY = {
  recentMaxDays: 7,
  longInactivityMinDays: 31,
} as const;

export const FREQUENCY_POLICY = {
  minPosts: 3,
  minSpanDays: 7,
  sufficientPosts: 8,
  sufficientSpanDays: 28,
} as const;

export const COMPLETENESS_POLICY = { sufficientPosts: 5, limitedPosts: 2 } as const;

export const CONTENT_TYPE_POLICY = { sufficientPosts: 8 } as const;

export const ENGAGEMENT_POLICY = {
  minAgeHours: 48,
  limitedPosts: 3,
  sufficientPosts: 10,
  sufficientCoverage: 0.8,
} as const;

export const CROSS_PLATFORM_POLICY = { recencyDifferenceMinDays: 30 } as const;

// Mirrors meta-read MAX_ITEMS / MAX_PAGES; a full window means older content may exist.
export const SYNC_WINDOW = { maxItems: 100, maxPages: 4 } as const;

export function freshnessOf(lastSuccessAt: string | null, evaluatedAtMs: number): { freshness: Freshness; hours: number | null } {
  const ms = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  if (Number.isNaN(ms)) return { freshness: 'UNKNOWN', hours: null };
  const elapsed = Math.max(0, evaluatedAtMs - ms);
  const hours = Math.floor(elapsed / HOUR_MS);
  if (elapsed <= FRESHNESS_POLICY.freshMaxHours * HOUR_MS) return { freshness: 'FRESH', hours };
  if (elapsed <= FRESHNESS_POLICY.agingMaxHours * HOUR_MS) return { freshness: 'AGING', hours };
  return { freshness: 'STALE', hours };
}

export function recencySufficiency(postsWithTimestamp: number): Sufficiency {
  return postsWithTimestamp >= 1 ? 'SUFFICIENT' : 'INSUFFICIENT';
}

export function frequencySufficiency(posts: number, spanDays: number | null): Sufficiency {
  const span = spanDays ?? 0;
  if (posts < FREQUENCY_POLICY.minPosts || span < FREQUENCY_POLICY.minSpanDays) return 'INSUFFICIENT';
  if (posts >= FREQUENCY_POLICY.sufficientPosts && span >= FREQUENCY_POLICY.sufficientSpanDays) return 'SUFFICIENT';
  return 'LIMITED';
}

export function completenessSufficiency(posts: number): Sufficiency {
  if (posts >= COMPLETENESS_POLICY.sufficientPosts) return 'SUFFICIENT';
  if (posts >= COMPLETENESS_POLICY.limitedPosts) return 'LIMITED';
  return 'INSUFFICIENT';
}

export function contentTypeSufficiency(posts: number): Sufficiency {
  return posts >= CONTENT_TYPE_POLICY.sufficientPosts ? 'SUFFICIENT' : 'INSUFFICIENT';
}

export function engagementSufficiency(available: number, eligible: number): Sufficiency {
  if (available >= ENGAGEMENT_POLICY.sufficientPosts && eligible > 0 && available / eligible >= ENGAGEMENT_POLICY.sufficientCoverage) {
    return 'SUFFICIENT';
  }
  if (available >= ENGAGEMENT_POLICY.limitedPosts) return 'LIMITED';
  return 'INSUFFICIENT';
}
