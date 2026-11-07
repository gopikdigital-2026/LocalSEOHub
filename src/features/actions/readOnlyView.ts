import type { BusinessRecord } from '../business-memory/businessRecord';
import { planSync } from './engine';
import type { BusinessAction, SourceSnapshot } from './types';

// Read-only accounts cannot persist resolutions, so profile gaps their saved data already fills are hidden in memory only.
export function hideSatisfiedProfileActions(
  business: BusinessRecord,
  sources: SourceSnapshot[],
  saved: BusinessAction[],
  now: Date = new Date(),
): BusinessAction[] {
  const scoped = saved.filter((a) => a.businessId === business.id);
  const satisfied = new Set(
    planSync(business, sources, scoped, now).toResolve
      .filter((r) => r.action.sourceType === 'BUSINESS_PROFILE')
      .map((r) => r.action.id),
  );
  return scoped.filter((a) => !satisfied.has(a.id));
}
