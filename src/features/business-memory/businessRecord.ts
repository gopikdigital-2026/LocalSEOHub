import type { BusinessProfile, GoalId, SelectedGoal } from './types';

export interface BusinessRecord {
  id: string;
  user_id: string;
  name: string;
  category: string;
  city: string;
  website: string;
  phone: string;
  schedule: string;
  target_audience: string;
  services: string[];
  primary_goal: GoalId | null;
  secondary_goals: GoalId[];
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  legacy_memory_migrated_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BusinessPatch = Partial<
  Pick<
    BusinessRecord,
    | 'name'
    | 'category'
    | 'city'
    | 'website'
    | 'phone'
    | 'schedule'
    | 'target_audience'
    | 'services'
    | 'primary_goal'
    | 'secondary_goals'
    | 'onboarding_completed'
    | 'onboarding_completed_at'
  >
>;

export const BUSINESS_COLUMNS =
  'id, user_id, name, category, city, website, phone, schedule, target_audience, services, primary_goal, secondary_goals, onboarding_completed, onboarding_completed_at, legacy_memory_migrated_at, created_at, updated_at';

export function toProfile(b: BusinessRecord): BusinessProfile {
  return {
    id: b.id,
    name: b.name,
    category: b.category,
    city: b.city,
    services: b.services ?? [],
    website: b.website,
    phone: b.phone,
    schedule: b.schedule,
    targetAudience: b.target_audience,
    updatedAt: b.updated_at,
  };
}

export function profileToPatch(p: BusinessProfile): BusinessPatch {
  return {
    name: p.name.trim(),
    category: p.category.trim(),
    city: p.city.trim(),
    website: p.website.trim(),
    phone: p.phone.trim(),
    schedule: p.schedule.trim(),
    target_audience: p.targetAudience.trim(),
    services: p.services.map((s) => s.trim()).filter(Boolean),
  };
}

export function toGoals(b: BusinessRecord): SelectedGoal[] {
  const ids = [b.primary_goal, ...(b.secondary_goals ?? [])].filter((g): g is GoalId => !!g);
  return [...new Set(ids)].map((goalId) => ({ goalId, selectedAt: b.updated_at }));
}

export function goalsToPatch(goalIds: GoalId[]): BusinessPatch {
  const unique = [...new Set(goalIds)];
  return { primary_goal: unique[0] ?? null, secondary_goals: unique.slice(1) };
}
