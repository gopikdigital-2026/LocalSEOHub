import { fireOnce, trackActivation } from '../../lib/pixel';

export function activationKey(userId: string) {
  return `pixel:activation:${userId}`;
}

/** Fed only by a newly persisted first_value_reached; the browser key keeps it to one per user even across businesses. */
export function trackFirstValueActivation(userId: string, store?: Pick<Storage, 'getItem' | 'setItem'> | null): boolean {
  if (!userId) return false;
  return fireOnce(activationKey(userId), () => trackActivation(), store);
}
