import { scan, type GbpSnapshot } from '../maps-scanner/engine';
import { buildDigitalTwin, type TwinProfileInput } from '../digital-twin/engine';
import { geoAudit } from '../geo-audit/engine';
import {
  ACTION_DESTINATIONS, FIELD_CONSUMERS, geoActions, mapsActions, twinActions,
  type ActionItem, type ActionKey, type ActionTool, type BusinessField, type SupportingTool,
} from '../action-layer/model';

export const TODAY_MAX = 3;

// Upkeep reminders are emitted only when a tool has nothing left to fix, so they are not priorities.
const MAINTENANCE: ReadonlySet<ActionKey> = new Set(['keep_fresh', 'keep_updated']);

// 0 = who the business is, 1 = core data stored in LocalSEOHub, 2 = Google connection, 3 = changes made inside Google.
const TIER: Record<ActionKey, number> = {
  identity: 0, activity: 0, city: 0,
  services: 1, phone: 1, website: 1, hours: 1, audience: 1, goal: 1,
  gbp_connect: 2, gbp_fix: 2, gbp_sync: 2,
  align_phone: 3, align_website: 3, align_sources: 3, gbp_category: 3, reviews: 3,
  keep_fresh: 4, keep_updated: 4,
};

const FIELD: Partial<Record<ActionKey, BusinessField>> = {
  identity: 'name', activity: 'category', city: 'city', services: 'services', phone: 'phone',
  website: 'website', hours: 'schedule', audience: 'target_audience', goal: 'primary_goal',
};

export const KEY_ORDER: readonly ActionKey[] = [
  'identity', 'activity', 'city', 'services', 'phone', 'website', 'hours', 'audience', 'goal',
  'gbp_connect', 'gbp_fix', 'gbp_sync', 'align_phone', 'align_website', 'align_sources', 'gbp_category', 'reviews',
  'keep_fresh', 'keep_updated',
];

const TOOL_ORDER: readonly ActionTool[] = ['maps', 'twin', 'geo'];

export interface TodayAction {
  key: ActionKey;
  destination: string;
  supporting: { tool: SupportingTool; route: string } | null;
  sourceTools: ActionTool[];
  tier: number;
  reach: number;
  bestRank: number;
  aiCost: 0;
}

const reachOf = (key: ActionKey) => (FIELD[key] ? FIELD_CONSUMERS[FIELD[key]!].length : 0);

export function compareToday(a: TodayAction, b: TodayAction): number {
  return a.tier - b.tier
    || b.sourceTools.length - a.sourceTools.length
    || b.reach - a.reach
    || a.bestRank - b.bestRank
    || KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key);
}

export function mergeActions(lists: ActionItem[][]): TodayAction[] {
  const merged = new Map<ActionKey, TodayAction>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      if (MAINTENANCE.has(item.key)) return;
      if (!(ACTION_DESTINATIONS as readonly string[]).includes(item.destination)) return;
      const found = merged.get(item.key);
      if (!found) {
        merged.set(item.key, {
          key: item.key, destination: item.destination, supporting: item.supporting, sourceTools: [item.tool],
          tier: TIER[item.key], reach: reachOf(item.key), bestRank: rank, aiCost: 0,
        });
        return;
      }
      if (!found.sourceTools.includes(item.tool)) found.sourceTools.push(item.tool);
      found.sourceTools.sort((x, y) => TOOL_ORDER.indexOf(x) - TOOL_ORDER.indexOf(y));
      found.bestRank = Math.min(found.bestRank, rank);
      found.supporting ??= item.supporting;
    });
  }
  return [...merged.values()].sort(compareToday);
}

export function rankedTodayActions(profile: TwinProfileInput, gbp: GbpSnapshot): TodayAction[] {
  return mergeActions([
    mapsActions(scan(profile, gbp).priorities),
    twinActions(buildDigitalTwin(profile, gbp).priorities),
    geoActions(geoAudit(profile, gbp).priorities),
  ]);
}

// When the Google source could not be read, its state is unknown, so Google-side actions are withheld rather than guessed.
export const todayActions = (profile: TwinProfileInput, gbp: GbpSnapshot, gbpKnown = true): TodayAction[] =>
  rankedTodayActions(profile, gbp).filter((a) => gbpKnown || a.tier < 2).slice(0, TODAY_MAX);
