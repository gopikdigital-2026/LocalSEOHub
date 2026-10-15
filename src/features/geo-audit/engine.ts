import { digits, host, serviceList, text, validPhone, validWebsite, type GbpSnapshot } from '../maps-scanner/engine';

export type GeoBlock = 'identity' | 'location' | 'offer' | 'contact' | 'context' | 'web' | 'google' | 'consistency' | 'structured';

export type GeoCriterionId =
  | 'name' | 'activity' | 'description'
  | 'city' | 'address'
  | 'services'
  | 'website' | 'phone' | 'hours'
  | 'audience'
  | 'web_content'
  | 'gbp_category'
  | 'consistency'
  | 'structured_data';

export type GeoStatus = 'ok' | 'improve' | 'unchecked';
export type GeoSource = 'localseohub' | 'website' | 'google';
export type GeoTrust = 'verified' | 'available' | 'unchecked';
export type GeoDetail = 'few_services' | 'short_audience' | 'mismatch' | 'no_source' | 'no_gbp_address';
export type MismatchField = 'name' | 'city' | 'phone' | 'website';

export interface GeoCriterion {
  id: GeoCriterionId;
  block: GeoBlock;
  source: GeoSource;
  weight: number;
  status: GeoStatus;
  points: number;
  trust: GeoTrust;
  detail?: GeoDetail;
  mismatches?: MismatchField[];
}

export type GeoPriorityId =
  | 'complete_identity' | 'add_activity' | 'add_city' | 'add_services' | 'add_website' | 'fix_gbp' | 'connect_gbp'
  | 'align_sources' | 'add_audience' | 'add_phone' | 'add_hours' | 'gbp_category' | 'keep_fresh';

export interface GeoPriority {
  id: GeoPriorityId;
  cta: string;
}

export type GeoBand = 'very_ready' | 'ready' | 'improvable' | 'low';

export interface GeoResult {
  score: number | null;
  band: GeoBand | null;
  coverage: number;
  evaluated: number;
  total: number;
  criteria: GeoCriterion[];
  priorities: GeoPriority[];
  gbpState: GbpSnapshot['state'];
}

export interface GeoProfileInput {
  name?: unknown;
  category?: unknown;
  city?: unknown;
  phone?: unknown;
  website?: unknown;
  schedule?: unknown;
  services?: unknown;
  target_audience?: unknown;
}

export const GEO_BLOCKS: GeoBlock[] = ['identity', 'location', 'offer', 'contact', 'context', 'web', 'google', 'consistency', 'structured'];

// Weights total 100. Identity, location, offer and web carry the most; contact and context are complementary.
export const GEO_WEIGHTS: Record<GeoCriterionId, { block: GeoBlock; source: GeoSource; weight: number }> = {
  name: { block: 'identity', source: 'localseohub', weight: 8 },
  activity: { block: 'identity', source: 'localseohub', weight: 10 },
  description: { block: 'identity', source: 'localseohub', weight: 7 },
  city: { block: 'location', source: 'localseohub', weight: 12 },
  address: { block: 'location', source: 'google', weight: 5 },
  services: { block: 'offer', source: 'localseohub', weight: 17 },
  website: { block: 'contact', source: 'localseohub', weight: 6 },
  phone: { block: 'contact', source: 'localseohub', weight: 4 },
  hours: { block: 'contact', source: 'localseohub', weight: 3 },
  audience: { block: 'context', source: 'localseohub', weight: 7 },
  web_content: { block: 'web', source: 'website', weight: 8 },
  gbp_category: { block: 'google', source: 'google', weight: 4 },
  consistency: { block: 'consistency', source: 'google', weight: 5 },
  structured_data: { block: 'structured', source: 'website', weight: 4 },
};

export const GEO_BANDS: Array<{ min: number; band: GeoBand }> = [
  { min: 90, band: 'very_ready' },
  { min: 75, band: 'ready' },
  { min: 50, band: 'improvable' },
  { min: 0, band: 'low' },
];

export const GEO_ROUTES = { business: '/negocio', sources: '/fuentes', seo: '/herramientas/seo' } as const;

const PRIORITY_ORDER: GeoPriority[] = [
  { id: 'add_activity', cta: GEO_ROUTES.business },
  { id: 'add_city', cta: GEO_ROUTES.business },
  { id: 'add_services', cta: GEO_ROUTES.business },
  { id: 'add_website', cta: GEO_ROUTES.business },
  { id: 'fix_gbp', cta: GEO_ROUTES.sources },
  { id: 'connect_gbp', cta: GEO_ROUTES.sources },
  { id: 'align_sources', cta: GEO_ROUTES.business },
  { id: 'add_audience', cta: GEO_ROUTES.business },
  { id: 'add_phone', cta: GEO_ROUTES.business },
  { id: 'add_hours', cta: GEO_ROUTES.business },
  { id: 'gbp_category', cta: GEO_ROUTES.sources },
];

export const GEO_MAX_PRIORITIES = 5;
export const MIN_SERVICES = 3;
export const MIN_AUDIENCE_CHARS = 10;

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function geoBandFor(score: number): GeoBand {
  return GEO_BANDS.find((b) => score >= b.min)!.band;
}

function criterion(id: GeoCriterionId, status: GeoStatus, extra: Partial<GeoCriterion> = {}, fraction = status === 'ok' ? 1 : 0): GeoCriterion {
  const { block, source, weight } = GEO_WEIGHTS[id];
  const points = status === 'unchecked' ? 0 : Math.round(weight * fraction * 100) / 100;
  const trust: GeoTrust = status === 'unchecked' ? 'unchecked' : source === 'google' ? 'verified' : 'available';
  return { id, block, source, weight, status, points, trust, ...extra };
}

const present = (ok: boolean): GeoStatus => (ok ? 'ok' : 'improve');

// Only pairs where both sides really exist are compared; anything else is left out.
function compare(p: { name: string; city: string; phone: string; website: string }, g: NonNullable<GbpSnapshot['data']>) {
  const pairs: Array<[MismatchField, boolean]> = [];
  if (p.name && g.name) pairs.push(['name', fold(g.name).includes(fold(p.name)) || fold(p.name).includes(fold(g.name))]);
  if (p.city && g.address) pairs.push(['city', fold(g.address).includes(fold(p.city))]);
  if (validPhone(p.phone) && g.phone) pairs.push(['phone', digits(g.phone).slice(-9) === digits(p.phone).slice(-9)]);
  if (validWebsite(p.website) && g.website) pairs.push(['website', host(g.website) === host(p.website)]);
  return { compared: pairs.length, mismatches: pairs.filter(([, ok]) => !ok).map(([f]) => f) };
}

export function geoAudit(profile: GeoProfileInput, gbp: GbpSnapshot): GeoResult {
  const p = {
    name: text(profile.name, 120),
    activity: text(profile.category, 120),
    city: text(profile.city, 120),
    phone: text(profile.phone, 40),
    website: text(profile.website, 200),
    hours: text(profile.schedule, 200),
    services: serviceList(profile.services),
    audience: text(profile.target_audience, 300),
  };
  const g = gbp.data;

  const servicesCriterion = p.services.length >= MIN_SERVICES
    ? criterion('services', 'ok')
    : p.services.length > 0
      ? criterion('services', 'improve', { detail: 'few_services' }, 0.5)
      : criterion('services', 'improve');

  const audienceCriterion = p.audience.length >= MIN_AUDIENCE_CHARS
    ? criterion('audience', 'ok')
    : p.audience
      ? criterion('audience', 'improve', { detail: 'short_audience' }, 0.5)
      : criterion('audience', 'improve');

  let consistency: GeoCriterion;
  if (!g) {
    consistency = criterion('consistency', 'unchecked');
  } else {
    const c = compare(p, g);
    consistency = c.compared === 0
      ? criterion('consistency', 'unchecked', { detail: 'no_source' })
      : c.mismatches.length
        ? criterion('consistency', 'improve', { detail: 'mismatch', mismatches: c.mismatches })
        : criterion('consistency', 'ok');
  }

  const criteria: GeoCriterion[] = [
    criterion('name', present(p.name.length >= 2)),
    criterion('activity', present(p.activity.length >= 3)),
    // No description field exists in LocalSEOHub and no website text is stored.
    criterion('description', 'unchecked', { detail: 'no_source' }),
    criterion('city', present(!!p.city)),
    g ? criterion('address', present(!!g.address), g.address ? {} : { detail: 'no_gbp_address' }) : criterion('address', 'unchecked'),
    servicesCriterion,
    criterion('website', present(validWebsite(p.website))),
    criterion('phone', present(validPhone(p.phone))),
    criterion('hours', present(!!p.hours)),
    audienceCriterion,
    // Website analysis is not persisted anywhere, so web content and structured data stay unchecked.
    criterion('web_content', 'unchecked', { detail: 'no_source' }),
    g ? criterion('gbp_category', present(!!g.category)) : criterion('gbp_category', 'unchecked'),
    consistency,
    criterion('structured_data', 'unchecked', { detail: 'no_source' }),
  ];

  const evaluable = criteria.filter((c) => c.status !== 'unchecked');
  const coverage = Math.round((evaluable.length / criteria.length) * 100);
  const base = { coverage, evaluated: evaluable.length, total: criteria.length, criteria, gbpState: gbp.state };

  if (!p.name || (!p.activity && p.services.length === 0)) {
    return { ...base, score: null, band: null, priorities: [{ id: 'complete_identity', cta: GEO_ROUTES.business }] };
  }

  const max = evaluable.reduce((s, c) => s + c.weight, 0);
  const got = evaluable.reduce((s, c) => s + c.points, 0);
  const score = Math.round((got / max) * 100);

  const by = Object.fromEntries(criteria.map((c) => [c.id, c])) as Record<GeoCriterionId, GeoCriterion>;
  const triggered = new Set<GeoPriorityId>();
  if (by.activity.status === 'improve') triggered.add('add_activity');
  if (by.city.status === 'improve') triggered.add('add_city');
  if (by.services.status === 'improve') triggered.add('add_services');
  if (by.website.status === 'improve') triggered.add('add_website');
  if (gbp.state === 'error') triggered.add('fix_gbp');
  if (gbp.state === 'not_connected') triggered.add('connect_gbp');
  if (by.consistency.status === 'improve') triggered.add('align_sources');
  if (by.audience.status === 'improve') triggered.add('add_audience');
  if (by.phone.status === 'improve') triggered.add('add_phone');
  if (by.hours.status === 'improve') triggered.add('add_hours');
  if (by.gbp_category.status === 'improve') triggered.add('gbp_category');

  const priorities = PRIORITY_ORDER.filter((r) => triggered.has(r.id)).slice(0, GEO_MAX_PRIORITIES).map((r) => ({ ...r }));
  if (priorities.length === 0) priorities.push({ id: 'keep_fresh', cta: GEO_ROUTES.seo });

  return { ...base, score, band: geoBandFor(score), priorities };
}
