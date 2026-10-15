import { goalLabel } from '../activation/milestones';
import type { GoalId } from '../business-memory/types';
import { MIN_AUDIENCE_CHARS, MIN_SERVICES } from '../geo-audit/engine';
import { serviceList, text, validPhone, validWebsite, type GbpSnapshot } from '../maps-scanner/engine';

export type TwinBlockId = 'identity' | 'location' | 'offer' | 'customer' | 'contact' | 'goals' | 'local' | 'web';
export type TwinFieldId = 'name' | 'activity' | 'city' | 'services' | 'audience' | 'website' | 'phone' | 'hours' | 'primary_goal' | 'gbp';
export type FieldState = 'known' | 'partial' | 'missing';
export type BlockState = 'complete' | 'partial' | 'empty' | 'unchecked';
export type Provenance = 'declared' | 'detected' | 'verified' | 'unchecked';
export type KnowledgeBand = 'very_complete' | 'well_defined' | 'partial' | 'initial';
// Things LocalSEOHub cannot know yet because no source stores them; never counted in the percentage.
export type UnavailableId = 'description' | 'web_analysis' | 'structured_data';

export interface TwinField {
  id: TwinFieldId;
  block: TwinBlockId;
  weight: number;
  state: FieldState;
  points: number;
  provenance: Provenance;
}

export interface TwinBlock {
  id: TwinBlockId;
  state: BlockState;
  fields: TwinFieldId[];
}

export type TwinGapId =
  | 'complete_identity' | 'add_activity' | 'add_city' | 'add_services' | 'add_audience' | 'add_goal' | 'add_phone'
  | 'add_hours' | 'add_website' | 'fix_gbp' | 'connect_gbp' | 'sync_gbp' | 'keep_updated';

export interface TwinGap {
  id: TwinGapId;
  cta: string;
}

export interface TwinValues {
  name: string;
  activity: string;
  city: string;
  services: string[];
  audience: string;
  website: string;
  websiteValid: boolean;
  phone: string;
  hours: string;
  primaryGoal: GoalId | null;
  secondaryGoals: GoalId[];
  gbpAddress: string | null;
  gbpCategory: string | null;
}

export interface DigitalTwin {
  knowledgePercent: number;
  knowledgeBand: KnowledgeBand;
  starting: boolean;
  values: TwinValues;
  fields: TwinField[];
  blocks: TwinBlock[];
  knownFields: TwinFieldId[];
  unknownFields: TwinFieldId[];
  unavailable: UnavailableId[];
  priorities: TwinGap[];
  sourceSummary: { declared: number; detected: number; verified: number; gbpState: GbpSnapshot['state']; gbpLastSyncAt: string | null };
}

export interface TwinProfileInput {
  name?: unknown;
  category?: unknown;
  city?: unknown;
  phone?: unknown;
  website?: unknown;
  schedule?: unknown;
  services?: unknown;
  target_audience?: unknown;
  primary_goal?: unknown;
  secondary_goals?: unknown;
}

// Every weighted field can be filled in by the user in LocalSEOHub or by connecting Google. Total = 100.
export const TWIN_WEIGHTS: Record<TwinFieldId, { block: TwinBlockId; weight: number }> = {
  name: { block: 'identity', weight: 8 },
  activity: { block: 'identity', weight: 10 },
  city: { block: 'location', weight: 12 },
  services: { block: 'offer', weight: 18 },
  audience: { block: 'customer', weight: 10 },
  website: { block: 'contact', weight: 8 },
  phone: { block: 'contact', weight: 6 },
  hours: { block: 'contact', weight: 6 },
  primary_goal: { block: 'goals', weight: 12 },
  gbp: { block: 'local', weight: 10 },
};

export const TWIN_BLOCKS: TwinBlockId[] = ['identity', 'offer', 'customer', 'location', 'contact', 'goals', 'local', 'web'];

export const TWIN_BANDS: Array<{ min: number; band: KnowledgeBand }> = [
  { min: 85, band: 'very_complete' },
  { min: 65, band: 'well_defined' },
  { min: 40, band: 'partial' },
  { min: 0, band: 'initial' },
];

export const TWIN_ROUTES = { business: '/negocio', goals: '/negocio/objetivos', sources: '/fuentes' } as const;

export const TWIN_TOOL_ROUTES = { seo: '/herramientas/seo', maps: '/herramientas/maps', geo: '/herramientas/geo', advisor: '/herramientas/advisor' } as const;

const GAP_ORDER: TwinGap[] = [
  { id: 'add_activity', cta: TWIN_ROUTES.business },
  { id: 'add_city', cta: TWIN_ROUTES.business },
  { id: 'add_services', cta: TWIN_ROUTES.business },
  { id: 'add_audience', cta: TWIN_ROUTES.business },
  { id: 'add_goal', cta: TWIN_ROUTES.goals },
  { id: 'add_phone', cta: TWIN_ROUTES.business },
  { id: 'add_hours', cta: TWIN_ROUTES.business },
  { id: 'add_website', cta: TWIN_ROUTES.business },
  { id: 'fix_gbp', cta: TWIN_ROUTES.sources },
  { id: 'connect_gbp', cta: TWIN_ROUTES.sources },
  { id: 'sync_gbp', cta: TWIN_ROUTES.sources },
];

export const TWIN_MAX_PRIORITIES = 5;

const UNAVAILABLE: UnavailableId[] = ['description', 'web_analysis', 'structured_data'];

const isGoal = (v: unknown): v is GoalId => typeof v === 'string' && goalLabel(v as GoalId, 'es') !== null;

export function knowledgeBandFor(percent: number): KnowledgeBand {
  return TWIN_BANDS.find((b) => percent >= b.min)!.band;
}

function field(id: TwinFieldId, state: FieldState, provenance: Provenance): TwinField {
  const { block, weight } = TWIN_WEIGHTS[id];
  const points = state === 'known' ? weight : state === 'partial' ? weight / 2 : 0;
  return { id, block, weight, state, points, provenance: state === 'missing' ? 'unchecked' : provenance };
}

const declared = (id: TwinFieldId, ok: boolean) => field(id, ok ? 'known' : 'missing', 'declared');

const graded = (id: TwinFieldId, full: boolean, some: boolean) => field(id, full ? 'known' : some ? 'partial' : 'missing', 'declared');

export function buildDigitalTwin(profile: TwinProfileInput, gbp: GbpSnapshot): DigitalTwin {
  const website = text(profile.website, 200);
  const g = gbp.data;
  const values: TwinValues = {
    name: text(profile.name, 120),
    activity: text(profile.category, 120),
    city: text(profile.city, 120),
    services: serviceList(profile.services),
    audience: text(profile.target_audience, 300),
    website,
    websiteValid: validWebsite(website),
    phone: text(profile.phone, 40),
    hours: text(profile.schedule, 200),
    primaryGoal: isGoal(profile.primary_goal) ? profile.primary_goal : null,
    secondaryGoals: Array.isArray(profile.secondary_goals)
      ? [...new Set(profile.secondary_goals.filter(isGoal))].filter((x) => x !== profile.primary_goal)
      : [],
    gbpAddress: g?.address ?? null,
    gbpCategory: g?.category ?? null,
  };

  // Connected without synced profile data: LocalSEOHub only detects the link, it has no Google data yet.
  const gbpField = g
    ? field('gbp', 'known', 'verified')
    : gbp.state === 'connected'
      ? field('gbp', 'partial', 'detected')
      : field('gbp', 'missing', 'unchecked');

  const fields: TwinField[] = [
    declared('name', values.name.length >= 2),
    declared('activity', values.activity.length >= 3),
    declared('city', !!values.city),
    graded('services', values.services.length >= MIN_SERVICES, values.services.length > 0),
    graded('audience', values.audience.length >= MIN_AUDIENCE_CHARS, !!values.audience),
    declared('website', values.websiteValid),
    declared('phone', validPhone(values.phone)),
    declared('hours', !!values.hours),
    declared('primary_goal', !!values.primaryGoal),
    gbpField,
  ];

  const knowledgePercent = Math.round(fields.reduce((s, f) => s + f.points, 0));

  const blocks: TwinBlock[] = TWIN_BLOCKS.map((id) => {
    const own = fields.filter((f) => f.block === id);
    if (own.length === 0) return { id, state: 'unchecked', fields: [] };
    const state: BlockState = own.every((f) => f.state === 'known') ? 'complete' : own.some((f) => f.state !== 'missing') ? 'partial' : 'empty';
    return { id, state, fields: own.map((f) => f.id) };
  });

  const by = Object.fromEntries(fields.map((f) => [f.id, f])) as Record<TwinFieldId, TwinField>;
  const starting = !values.name || (!values.activity && values.services.length === 0);

  const triggered = new Set<TwinGapId>();
  if (by.activity.state !== 'known') triggered.add('add_activity');
  if (by.city.state !== 'known') triggered.add('add_city');
  if (by.services.state !== 'known') triggered.add('add_services');
  if (by.audience.state !== 'known') triggered.add('add_audience');
  if (by.primary_goal.state !== 'known') triggered.add('add_goal');
  if (by.phone.state !== 'known') triggered.add('add_phone');
  if (by.hours.state !== 'known') triggered.add('add_hours');
  if (by.website.state !== 'known') triggered.add('add_website');
  if (gbp.state === 'error') triggered.add('fix_gbp');
  else if (gbp.state === 'not_connected') triggered.add('connect_gbp');
  else if (!g) triggered.add('sync_gbp');

  const gaps = GAP_ORDER.filter((r) => triggered.has(r.id)).map((r) => ({ ...r }));
  if (starting) gaps.unshift({ id: 'complete_identity', cta: TWIN_ROUTES.business });
  const priorities = gaps.slice(0, TWIN_MAX_PRIORITIES);
  if (priorities.length === 0) priorities.push({ id: 'keep_updated', cta: TWIN_ROUTES.business });

  const count = (p: Provenance) => fields.filter((f) => f.provenance === p).length;

  return {
    knowledgePercent,
    knowledgeBand: knowledgeBandFor(knowledgePercent),
    starting,
    values,
    fields,
    blocks,
    knownFields: fields.filter((f) => f.state === 'known').map((f) => f.id),
    unknownFields: fields.filter((f) => f.state !== 'known').map((f) => f.id),
    unavailable: [...UNAVAILABLE],
    priorities,
    sourceSummary: {
      declared: count('declared'), detected: count('detected'), verified: count('verified'),
      gbpState: gbp.state, gbpLastSyncAt: gbp.lastSyncAt,
    },
  };
}
