/**
 * Day-scoped localStorage cache for AI API responses.
 * A cached result is valid only for the calendar day it was created.
 * Stale entries are pruned automatically on each write.
 */

interface CacheEntry<T> {
  date: string; // YYYY-MM-DD
  data: T;
}

const PREFIX = 'lsh_ai_';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Deterministic 32-bit hash (djb2) → base-36 string, no external deps */
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).padStart(7, '0');
}

function makeCacheKey(namespace: string, inputs: Record<string, string>): string {
  // Sort keys for stable ordering regardless of object insertion order
  const normalized = Object.entries(inputs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
  return PREFIX + djb2(`${namespace}:${todayStr()}:${normalized}`);
}

/** Returns cached result for today's date, or null on miss/expiry. */
export function getAICache<T>(namespace: string, inputs: Record<string, string>): T | null {
  try {
    const key  = makeCacheKey(namespace, inputs);
    const raw  = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (entry.date !== todayStr()) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** Stores a result in the cache, keyed by namespace + inputs + today's date. */
export function setAICache<T>(namespace: string, inputs: Record<string, string>, data: T): void {
  try {
    const key   = makeCacheKey(namespace, inputs);
    const entry: CacheEntry<T> = { date: todayStr(), data };
    localStorage.setItem(key, JSON.stringify(entry));
    pruneStaleEntries();
  } catch {
    // Storage quota exceeded — silently ignore; cache is best-effort
  }
}

/** Removes cache entries from previous days to keep storage lean. */
function pruneStaleEntries(): void {
  try {
    const today   = todayStr();
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        const entry = JSON.parse(localStorage.getItem(k)!);
        if (entry?.date && entry.date !== today) toDelete.push(k);
      } catch {
        toDelete.push(k!);
      }
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Iteration may fail in some environments — silently ignore
  }
}
