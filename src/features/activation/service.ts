import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { BusinessRecord } from '../business-memory/businessRecord';
import type { BusinessAction } from '../actions/types';
import { trackActivationMilestone, trackOnboardingCompleted, type ActivationMilestoneEvent } from '../../services/analytics/v2Analytics';
import { milestonesFor, type ActivationEvent, type Milestone, type Milestones } from './milestones';
import { recordMilestones } from './repository';

type Db = Pick<SupabaseClient, 'from'>;

const FUNNEL_EVENTS: Milestone[] = ['first_recommendations_generated', 'first_action_started', 'first_action_completed', 'first_value_reached'];

/**
 * Persists any milestones the event newly reaches and emits one funnel event per new milestone.
 * Dedup is backed by the stored row, so repeated calls (re-renders, reloads, other tabs) are no-ops.
 */
export async function advanceActivation(
  userId: string,
  business: BusinessRecord,
  current: Milestones,
  event: ActivationEvent,
  action: BusinessAction | null = null,
  db: Db = supabase,
  now: string = new Date().toISOString(),
): Promise<{ milestones: Milestones; added: Milestone[] }> {
  const reached = milestonesFor(current, event, business, now);
  if (Object.keys(reached).length === 0) return { milestones: current, added: [] };
  const result = await recordMilestones(userId, business.id, reached, db);
  // Only the onboarding flow reports completion; backfills for pre-existing users stay silent.
  if (event.type === 'onboarding_completed' && result.added.includes('onboarding_completed')) trackOnboardingCompleted(business.primary_goal ?? null);
  // Backfilled legacy users already acted before recommendations were tracked; that late stamp is history, not funnel progress.
  const alreadyPast = (m: Milestone) =>
    m === 'first_recommendations_generated' && Boolean(current.first_action_started || result.milestones.first_action_started) && !result.added.includes('first_action_started');
  result.added
    .filter((m) => FUNNEL_EVENTS.includes(m) && !alreadyPast(m))
    .forEach((m) => trackActivationMilestone(m as ActivationMilestoneEvent, action));
  return result;
}
