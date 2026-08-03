import { useState, useEffect, useCallback } from 'react';

/**
 * Persists state to localStorage. Reads initial value from storage on mount;
 * syncs on every change. Falls back to defaultValue if storage is unavailable.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage unavailable (private browsing, quota exceeded) — silently ignore
    }
  }, [key, value]);

  // Stable setter — same signature as React.Dispatch<React.SetStateAction<T>>
  const set: React.Dispatch<React.SetStateAction<T>> = useCallback(
    (action) => setValue((prev) => (typeof action === 'function' ? (action as (p: T) => T)(prev) : action)),
    [],
  );

  return [value, set];
}
