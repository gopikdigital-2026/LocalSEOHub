import type { PriorityId } from '../maps-scanner/engine';
import type { TwinGapId } from '../digital-twin/engine';
import type { GeoPriorityId } from '../geo-audit/engine';

export type ActionTool = 'maps' | 'twin' | 'geo';
export type SupportingTool = 'seo' | 'advisor';
export type Consumer = 'seo' | 'advisor' | 'voice' | 'maps' | 'geo' | 'twin';
export type BusinessField = 'name' | 'category' | 'city' | 'services' | 'target_audience' | 'primary_goal' | 'website' | 'phone' | 'schedule';

export type ActionKey =
  | 'identity' | 'activity' | 'city' | 'phone' | 'website' | 'hours' | 'services' | 'audience' | 'goal'
  | 'gbp_connect' | 'gbp_fix' | 'gbp_sync' | 'gbp_category' | 'align_phone' | 'align_website' | 'align_sources'
  | 'reviews' | 'keep_fresh' | 'keep_updated';

export const SUPPORTING_ROUTES: Record<SupportingTool, string> = {
  seo: '/herramientas/seo',
  advisor: '/herramientas/advisor',
};

export const ACTION_DESTINATIONS = ['/negocio', '/negocio/objetivos', '/fuentes', ...Object.values(SUPPORTING_ROUTES)] as const;

// Which tools read each stored business field, taken from their real context builders (see FIELD_EVIDENCE).
export const FIELD_CONSUMERS: Record<BusinessField, Consumer[]> = {
  name: ['seo', 'advisor', 'voice', 'maps', 'geo', 'twin'],
  category: ['seo', 'advisor', 'voice', 'maps', 'geo', 'twin'],
  city: ['seo', 'advisor', 'voice', 'maps', 'geo', 'twin'],
  services: ['seo', 'advisor', 'voice', 'maps', 'geo', 'twin'],
  target_audience: ['seo', 'advisor', 'voice', 'geo', 'twin'],
  primary_goal: ['seo', 'advisor', 'voice', 'twin'],
  website: ['seo', 'advisor', 'voice', 'maps', 'geo', 'twin'],
  phone: ['seo', 'advisor', 'voice', 'maps', 'geo', 'twin'],
  schedule: ['seo', 'advisor', 'voice', 'maps', 'geo', 'twin'],
};

export const FIELD_EVIDENCE: Record<Consumer, string> = {
  seo: 'supabase/functions/seo-generator-v2/logic.ts sanitizeFacts()',
  advisor: 'supabase/functions/business-advisor-v2/logic.ts PROFILE_FIELDS + buildFacts()',
  voice: 'supabase/functions/voice-simulator-v2/logic.ts TEXT_FIELDS + buildFacts()',
  maps: 'src/features/maps-scanner/engine.ts scan()',
  geo: 'src/features/geo-audit/engine.ts geoAudit()',
  twin: 'src/features/digital-twin/engine.ts buildDigitalTwin()',
};

interface ActionSpec {
  field: BusinessField | null;
  supporting: SupportingTool | null;
}

const SPEC: Record<ActionKey, ActionSpec> = {
  identity: { field: 'name', supporting: null },
  activity: { field: 'category', supporting: null },
  city: { field: 'city', supporting: null },
  phone: { field: 'phone', supporting: null },
  website: { field: 'website', supporting: null },
  hours: { field: 'schedule', supporting: null },
  // SEO Generator has a "service_description" format that drafts text for one service.
  services: { field: 'services', supporting: 'seo' },
  // The advisor answers free questions with the stored business context, so it can help think through these.
  audience: { field: 'target_audience', supporting: 'advisor' },
  goal: { field: 'primary_goal', supporting: 'advisor' },
  gbp_connect: { field: null, supporting: null },
  gbp_fix: { field: null, supporting: null },
  gbp_sync: { field: null, supporting: null },
  gbp_category: { field: null, supporting: null },
  align_phone: { field: 'phone', supporting: null },
  align_website: { field: 'website', supporting: null },
  align_sources: { field: null, supporting: null },
  reviews: { field: null, supporting: null },
  keep_fresh: { field: null, supporting: null },
  keep_updated: { field: null, supporting: null },
};

const MAPS_KEYS: Record<PriorityId, ActionKey> = {
  complete_profile: 'identity', add_category: 'activity', add_city: 'city', add_phone: 'phone', fix_gbp: 'gbp_fix',
  connect_gbp: 'gbp_connect', add_schedule: 'hours', add_services: 'services', add_website: 'website',
  align_phone: 'align_phone', align_website: 'align_website', reviews: 'reviews', keep_fresh: 'keep_fresh',
};

const TWIN_KEYS: Record<TwinGapId, ActionKey> = {
  complete_identity: 'identity', add_activity: 'activity', add_city: 'city', add_services: 'services',
  add_audience: 'audience', add_goal: 'goal', add_phone: 'phone', add_hours: 'hours', add_website: 'website',
  fix_gbp: 'gbp_fix', connect_gbp: 'gbp_connect', sync_gbp: 'gbp_sync', keep_updated: 'keep_updated',
};

const GEO_KEYS: Record<GeoPriorityId, ActionKey> = {
  complete_identity: 'identity', add_activity: 'activity', add_city: 'city', add_services: 'services',
  add_website: 'website', fix_gbp: 'gbp_fix', connect_gbp: 'gbp_connect', align_sources: 'align_sources',
  add_audience: 'audience', add_phone: 'phone', add_hours: 'hours', gbp_category: 'gbp_category', keep_fresh: 'keep_fresh',
};

export const MAX_ACTIONS = 5;

export interface ActionItem {
  id: string;
  tool: ActionTool;
  key: ActionKey;
  destination: string;
  supporting: { tool: SupportingTool; route: string } | null;
  usedBy: Consumer[];
  aiCost: 0;
}

function build<T extends string>(tool: ActionTool, keys: Record<T, ActionKey>, priorities: Array<{ id: T; cta: string }>): ActionItem[] {
  const seen = new Set<ActionKey>();
  const out: ActionItem[] = [];
  for (const p of priorities) {
    const key = keys[p.id];
    if (seen.has(key)) continue;
    seen.add(key);
    const spec = SPEC[key];
    // A supporting tool that is already the primary destination would just repeat the same link.
    const supporting = spec.supporting && SUPPORTING_ROUTES[spec.supporting] !== p.cta
      ? { tool: spec.supporting, route: SUPPORTING_ROUTES[spec.supporting] }
      : null;
    out.push({
      id: p.id, tool, key, destination: p.cta, supporting,
      usedBy: spec.field ? FIELD_CONSUMERS[spec.field].filter((c) => c !== tool) : [],
      aiCost: 0,
    });
  }
  return out.slice(0, MAX_ACTIONS);
}

export const mapsActions = (priorities: Array<{ id: PriorityId; cta: string }>) => build('maps', MAPS_KEYS, priorities);
export const twinActions = (priorities: Array<{ id: TwinGapId; cta: string }>) => build('twin', TWIN_KEYS, priorities);
export const geoActions = (priorities: Array<{ id: GeoPriorityId; cta: string }>) => build('geo', GEO_KEYS, priorities);
