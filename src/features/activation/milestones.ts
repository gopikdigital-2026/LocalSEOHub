import type { BusinessRecord } from '../business-memory/businessRecord';
import type { GoalId } from '../business-memory/types';
import type { ActionSourceType, BusinessAction } from '../actions/types';

export const MILESTONES = [
  'business_created',
  'minimum_profile_completed',
  'onboarding_completed',
  'first_recommendations_generated',
  'first_action_started',
  'first_action_completed',
  'first_value_reached',
] as const;

export type Milestone = (typeof MILESTONES)[number];
export type Milestones = Partial<Record<Milestone, string>>;

export type ActivationEvent =
  | { type: 'onboarding_completed' }
  | { type: 'recommendations_available'; count: number }
  | { type: 'action_started'; action: Pick<BusinessAction, 'sourceType'> }
  | { type: 'action_completed'; action: Pick<BusinessAction, 'sourceType'> };

type ProfileFields = Pick<BusinessRecord, 'name' | 'category' | 'city' | 'primary_goal'>;

/** The minimum data the action engine needs to produce useful, non-generic recommendations. */
export function hasMinimumProfile(b: ProfileFields | null | undefined): boolean {
  return Boolean(b && b.name.trim() && b.category.trim() && b.city.trim() && b.primary_goal);
}

/** Connecting a source is not activation by itself; only actions the user can work on count. */
export function isUsefulAction(a: { sourceType: ActionSourceType }): boolean {
  return a.sourceType !== 'SOURCE_REQUIRED';
}

export function parseMilestones(raw: unknown): Milestones {
  if (!raw || typeof raw !== 'object') return {};
  const out: Milestones = {};
  for (const key of MILESTONES) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'string' && v) out[key] = v;
  }
  return out;
}

/** Returns milestone timestamps newly reached by an event; never re-stamps an existing one. */
export function milestonesFor(
  current: Milestones,
  event: ActivationEvent,
  business: Pick<BusinessRecord, 'id' | 'created_at' | 'onboarding_completed' | 'onboarding_completed_at'> & ProfileFields,
  now: string,
): Milestones {
  const add: Milestones = {};
  const set = (m: Milestone, at: string) => { if (!current[m] && !add[m]) add[m] = at; };
  const onboarded = Boolean(current.onboarding_completed) || business.onboarding_completed;

  if (business.id) set('business_created', business.created_at || now);
  if (hasMinimumProfile(business)) set('minimum_profile_completed', now);
  if (business.onboarding_completed) set('onboarding_completed', business.onboarding_completed_at || now);

  switch (event.type) {
    case 'recommendations_available':
      if (event.count > 0 && onboarded) set('first_recommendations_generated', now);
      break;
    case 'action_started':
    case 'action_completed':
      if (!isUsefulAction(event.action)) break;
      set('first_action_started', now);
      if (event.type === 'action_completed') set('first_action_completed', now);
      if (onboarded && hasMinimumProfile(business)) set('first_value_reached', now);
      break;
  }
  return add;
}

export type ActivationStage = 'unknown' | 'first_plan' | 'activated';

export function activationStage(m: Milestones | null): ActivationStage {
  if (!m) return 'unknown';
  return m.first_value_reached ? 'activated' : 'first_plan';
}

export type TodayState = 'LOADING' | 'ACTIONS' | 'GENERATION_ERROR' | 'NO_DATA' | 'ALL_CAUGHT_UP' | 'NO_CURRENT_ACTIONS';

export function resolveTodayState(input: {
  ready: boolean;
  loading: boolean;
  error: string | null;
  todayCount: number;
  history: Pick<BusinessAction, 'status'>[];
  business: ProfileFields | null;
}): TodayState {
  if (input.todayCount > 0) return 'ACTIONS';
  if (input.error) return 'GENERATION_ERROR';
  if (!input.ready || input.loading) return 'LOADING';
  if (!hasMinimumProfile(input.business)) return 'NO_DATA';
  if (input.history.some((a) => a.status === 'COMPLETED' || a.status === 'DISMISSED')) return 'ALL_CAUGHT_UP';
  return 'NO_CURRENT_ACTIONS';
}

const GOAL_LABELS: Record<'es' | 'en', Record<GoalId, string>> = {
  es: {
    more_calls: 'conseguir más llamadas',
    more_reviews: 'conseguir más reseñas',
    better_local_seo: 'aumentar tu visibilidad local',
    more_bookings: 'conseguir más reservas',
    more_web_visits: 'mejorar tu página web',
    more_followers: 'publicar con más constancia',
    better_reputation: 'mejorar tu reputación',
  },
  en: {
    more_calls: 'getting more calls',
    more_reviews: 'getting more reviews',
    better_local_seo: 'increasing local visibility',
    more_bookings: 'getting more bookings',
    more_web_visits: 'improving your website',
    more_followers: 'posting more consistently',
    better_reputation: 'improving your reputation',
  },
};

export function goalLabel(goal: GoalId | null, lang: 'es' | 'en'): string | null {
  return goal ? GOAL_LABELS[lang][goal] ?? null : null;
}
