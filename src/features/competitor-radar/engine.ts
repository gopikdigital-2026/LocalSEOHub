import { serviceList, text, validPhone, validWebsite, type GbpSnapshot } from '../maps-scanner/engine';
import type { CompetitorAnalysis } from './types';

export type RadarBlockId = 'identity' | 'services' | 'location' | 'contact' | 'content' | 'seo' | 'local';
export type RowStatus = 'available' | 'opportunity' | 'unchecked';
export type OwnProvenance = 'declared' | 'detected' | 'verified' | 'unchecked';
export type TheirProvenance = 'observed' | 'unchecked';
export type RowValue = string | string[] | number | boolean | null;

export type RadarRowId =
  | 'name' | 'services' | 'services_match' | 'city' | 'phone' | 'website' | 'socials'
  | 'h1' | 'headings' | 'cta' | 'words'
  | 'title' | 'meta_description' | 'canonical' | 'robots' | 'https' | 'viewport' | 'lang'
  | 'schema' | 'local_schema' | 'address' | 'map' | 'gbp';

export interface RadarRow {
  id: RadarRowId;
  block: RadarBlockId;
  yours: { value: RowValue; provenance: OwnProvenance };
  theirs: { value: RowValue; provenance: TheirProvenance };
  status: RowStatus;
}

export interface RadarBlock {
  id: RadarBlockId;
  rows: RadarRow[];
}

export type OpportunityId =
  | 'own_services' | 'own_website' | 'own_city' | 'own_phone'
  | 'their_cta' | 'their_location' | 'their_schema' | 'their_description' | 'their_map';

export interface Opportunity {
  id: OpportunityId;
  cta: string;
  detail: { value?: string; list?: string[] };
}

export interface RadarProfileInput {
  name?: unknown;
  category?: unknown;
  city?: unknown;
  phone?: unknown;
  website?: unknown;
  services?: unknown;
}

export interface RadarComparison {
  blocks: RadarBlock[];
  rows: RadarRow[];
  opportunities: Opportunity[];
  counts: { observed: number; differences: number; opportunities: number };
  own: { name: string; activity: string; city: string; services: string[] };
  competitor: { label: string; domain: string; title: string | null };
}

export const RADAR_BLOCKS: RadarBlockId[] = ['identity', 'services', 'location', 'contact', 'content', 'seo', 'local'];
export const RADAR_MAX_OPPORTUNITIES = 5;
export const RADAR_ROUTES = { business: '/negocio', seo: '/herramientas/seo', geo: '/herramientas/geo', maps: '/herramientas/maps' } as const;

const OWN_UNMEASURED = new Set<RadarRowId>([
  'socials', 'h1', 'headings', 'cta', 'words', 'title', 'meta_description', 'canonical', 'robots', 'https', 'viewport', 'lang',
  'schema', 'local_schema', 'address', 'map', 'gbp',
]);

const present = (v: RowValue) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.length > 0 : v !== null && v !== false);

function statusFor(id: RadarRowId, yours: RowValue, theirs: RowValue): RowStatus {
  if (OWN_UNMEASURED.has(id)) return 'unchecked';
  if (present(yours)) return 'available';
  if (present(theirs)) return 'opportunity';
  return 'unchecked';
}

export function compareCompetitor(profile: RadarProfileInput, gbp: GbpSnapshot, analysis: CompetitorAnalysis): RadarComparison {
  const s = analysis.signals;
  const f = analysis.fetch;
  const name = text(profile.name, 120);
  const activity = text(profile.category, 120);
  const city = text(profile.city, 80);
  const services = serviceList(profile.services);
  const phone = text(profile.phone, 40);
  const website = text(profile.website, 200);
  const ownPhone = validPhone(phone) ? phone : null;
  const ownWebsite = validWebsite(website) ? website : null;

  const theirLocation = s.schemaAddress?.locality ?? s.schemaAddress?.region ?? (s.matches.city ? city : null);
  const address = s.schemaAddress ? [s.schemaAddress.street, s.schemaAddress.postalCode, s.schemaAddress.locality, s.schemaAddress.region].filter(Boolean).join(', ') : null;
  const gbpKnown = gbp.state === 'connected' && !!gbp.lastSyncAt && !!gbp.data;
  const gbpValue = gbp.state === 'connected' ? (gbpKnown ? 'connected' : 'connected_no_data') : null;

  const own = (v: RowValue, ok = present(v)): { value: RowValue; provenance: OwnProvenance } =>
    ({ value: ok ? v : null, provenance: ok ? 'declared' : 'unchecked' });
  const unmeasured = { value: null, provenance: 'unchecked' as const };
  const seen = (v: RowValue): { value: RowValue; provenance: TheirProvenance } => ({ value: v, provenance: present(v) ? 'observed' : 'unchecked' });
  // These are facts of the HTTP exchange itself, so a negative value is still an observation.
  const fact = (v: boolean): { value: RowValue; provenance: TheirProvenance } => ({ value: v, provenance: 'observed' });

  const spec: Array<[RadarRowId, RadarBlockId, RadarRow['yours'], RadarRow['theirs']]> = [
    ['name', 'identity', own(name.length >= 2 ? name : null), seen(s.brand)],
    ['services', 'services', own(services), seen(s.schemaServices)],
    ['services_match', 'services', own(services), seen(s.matches.services)],
    ['city', 'location', own(city || null), seen(theirLocation)],
    ['phone', 'contact', own(ownPhone), seen(s.phones)],
    ['website', 'contact', own(ownWebsite), { value: f.domain, provenance: 'observed' }],
    ['socials', 'contact', unmeasured, seen(s.socials)],
    ['h1', 'content', unmeasured, seen(s.h1)],
    ['headings', 'content', unmeasured, seen(s.h2)],
    ['cta', 'content', unmeasured, seen(s.ctas)],
    ['words', 'content', unmeasured, { value: s.wordCount, provenance: 'observed' }],
    ['title', 'seo', unmeasured, seen(s.title)],
    ['meta_description', 'seo', unmeasured, seen(s.metaDescription)],
    ['canonical', 'seo', unmeasured, seen(s.canonical)],
    ['robots', 'seo', unmeasured, seen(s.metaRobots)],
    ['https', 'seo', unmeasured, fact(f.https)],
    ['viewport', 'seo', unmeasured, seen(s.viewport)],
    ['lang', 'seo', unmeasured, seen(s.lang)],
    ['schema', 'local', unmeasured, seen(s.schemaTypes)],
    ['local_schema', 'local', unmeasured, seen(s.localBusinessSchema)],
    ['address', 'local', unmeasured, seen(address)],
    ['map', 'local', unmeasured, seen(s.hasMap)],
    ['gbp', 'local', { value: gbpValue, provenance: gbpKnown ? 'verified' : gbpValue ? 'detected' : 'unchecked' }, unmeasured],
  ];

  const rows: RadarRow[] = spec
    .filter(([id]) => id !== 'services_match' || services.length > 0)
    .map(([id, block, yours, theirs]) => ({ id, block, yours, theirs, status: statusFor(id, yours.value, theirs.value) }));
  const blocks = RADAR_BLOCKS.map((id) => ({ id, rows: rows.filter((r) => r.block === id) }));

  const candidates: Array<Opportunity | null> = [
    services.length === 0 && (s.wordCount > 0 || s.schemaServices.length > 0)
      ? { id: 'own_services', cta: RADAR_ROUTES.business, detail: { list: s.schemaServices } } : null,
    !ownWebsite ? { id: 'own_website', cta: RADAR_ROUTES.business, detail: { value: f.domain } } : null,
    !city && theirLocation ? { id: 'own_city', cta: RADAR_ROUTES.business, detail: { value: theirLocation } } : null,
    !ownPhone && s.phones.length > 0 ? { id: 'own_phone', cta: RADAR_ROUTES.business, detail: {} } : null,
    s.ctas.length > 0 ? { id: 'their_cta', cta: RADAR_ROUTES.seo, detail: { list: s.ctas.slice(0, 2) } } : null,
    city && theirLocation ? { id: 'their_location', cta: RADAR_ROUTES.geo, detail: { value: city } } : null,
    s.schemaTypes.length > 0 ? { id: 'their_schema', cta: RADAR_ROUTES.geo, detail: { list: s.schemaTypes.slice(0, 3) } } : null,
    s.metaDescription ? { id: 'their_description', cta: RADAR_ROUTES.seo, detail: {} } : null,
    s.hasMap ? { id: 'their_map', cta: RADAR_ROUTES.maps, detail: {} } : null,
  ];
  const opportunities = candidates.filter((o): o is Opportunity => o !== null).slice(0, RADAR_MAX_OPPORTUNITIES);

  return {
    blocks,
    rows,
    opportunities,
    counts: {
      observed: rows.filter((r) => r.theirs.provenance === 'observed').length,
      differences: rows.filter((r) => r.status === 'opportunity').length,
      opportunities: opportunities.length,
    },
    own: { name, activity, city, services },
    competitor: { label: s.brand ?? f.domain, domain: f.domain, title: s.title },
  };
}
