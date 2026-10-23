import type { GbpSnapshot } from '../maps-scanner/engine';
import type { TwinProfileInput } from '../digital-twin/engine';
import type { ActionKey } from '../action-layer/model';
import type { ActionStatus, BusinessAction } from '../actions/types';
import { eligibleActions, TODAY_MAX, type TodayAction } from '../today-intelligence/model';

export const PLAN_MAX = 8;
export const NEXT_END = 6;

export type RoadmapPhase = 'now' | 'next' | 'later';

export interface RoadmapItem extends TodayAction {
  position: number;
  phase: RoadmapPhase;
  mission: ActionStatus | null;
}

// Only rules whose firing condition is exactly the canonical gap. Rules covering several fields or a different condition stay unmapped.
export const MISSION_KEYS: Readonly<Record<string, ActionKey>> = {
  add_business_phone: 'phone',
  add_business_website: 'website',
  add_business_schedule: 'hours',
  complete_business_services: 'services',
  define_target_audience: 'audience',
  set_primary_goal: 'goal',
  connect_google_business_profile: 'gbp_connect',
  gbp_get_first_reviews: 'reviews',
};

const STATUS_ORDER: readonly ActionStatus[] = ['IN_PROGRESS', 'PENDING', 'COMPLETED', 'DISMISSED'];

export function missionStatusFor(key: ActionKey, missions: readonly BusinessAction[]): ActionStatus | null {
  const statuses = new Set(missions.filter((m) => MISSION_KEYS[m.ruleId] === key).map((m) => m.status));
  return STATUS_ORDER.find((s) => statuses.has(s)) ?? null;
}

const phaseOf = (position: number): RoadmapPhase => (position < TODAY_MAX ? 'now' : position < NEXT_END ? 'next' : 'later');

// Mission state is attached for display only; which gaps appear is decided by the business and source data alone.
export function buildRoadmap(
  profile: TwinProfileInput,
  gbp: GbpSnapshot,
  gbpKnown: boolean,
  missions: readonly BusinessAction[],
): RoadmapItem[] {
  return eligibleActions(profile, gbp, gbpKnown)
    .slice(0, PLAN_MAX)
    .map((action, position) => ({
      ...action,
      position,
      phase: phaseOf(position),
      mission: missionStatusFor(action.key, missions),
    }));
}
