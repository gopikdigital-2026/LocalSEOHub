import type { BusinessSetupData, FirstValueStep } from './types';
import type { GoalId } from '../business-memory/types';
import type { BusinessRecord } from '../business-memory/businessRecord';

export type OnboardingScreen = 'welcome' | 'business_setup' | 'primary_goal' | 'finishing';

export const ONBOARDING_TOTAL_STEPS = 2;

export function stepNumber(screen: OnboardingScreen): number | null {
  if (screen === 'business_setup') return 1;
  if (screen === 'primary_goal') return 2;
  return null;
}

export function hasBusinessBasics(data: BusinessSetupData | null | undefined): data is BusinessSetupData {
  return Boolean(data && data.name.trim() && data.category.trim() && data.city.trim());
}

export function cleanBusinessData(data: BusinessSetupData): BusinessSetupData {
  return { name: data.name.trim(), category: data.category.trim(), city: data.city.trim(), website: data.website.trim() };
}

/** Earlier versions of the flow had more steps; any of them resumes at the closest remaining one. */
export function resumeScreen(saved: FirstValueStep | null, data: BusinessSetupData | null, goal: GoalId | null): OnboardingScreen {
  if (!saved || saved === 'welcome') return 'welcome';
  if (saved === 'business_setup' || !hasBusinessBasics(data)) return 'business_setup';
  if (saved === 'primary_goal' || !goal) return 'primary_goal';
  return 'finishing';
}

/** Saved answers win; otherwise reuse what the business record already knows so nothing is asked twice. */
export function initialBusinessData(
  saved: BusinessSetupData | null,
  business: Pick<BusinessRecord, 'name' | 'category' | 'city' | 'website'> | null,
  pendingName: string | null,
): BusinessSetupData {
  const pick = (a: string | undefined, b: string | null | undefined) => (a && a.trim() ? a : b ?? '');
  return {
    name: pick(saved?.name, business?.name) || pendingName || '',
    category: pick(saved?.category, business?.category),
    city: pick(saved?.city, business?.city),
    website: pick(saved?.website, business?.website),
  };
}
