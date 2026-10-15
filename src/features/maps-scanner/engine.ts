export type CheckId =
  | 'name' | 'category' | 'city' | 'phone' | 'website' | 'schedule' | 'services'
  | 'gbp_name' | 'gbp_category' | 'gbp_address' | 'gbp_phone' | 'gbp_website' | 'gbp_hours' | 'gbp_reviews';

export type CheckStatus = 'ok' | 'improve' | 'unchecked';
export type CheckSource = 'localseohub' | 'google';
export type Trust = 'verified' | 'available' | 'unchecked';
export type CheckDetail = 'partial_services' | 'phone_mismatch' | 'website_mismatch' | 'no_reviews' | 'has_reviews';

export interface Check {
  id: CheckId;
  source: CheckSource;
  weight: number;
  status: CheckStatus;
  points: number;
  trust: Trust;
  detail?: CheckDetail;
  reviewCount?: number;
}

export type GbpState = 'not_connected' | 'error' | 'connected';

export interface GbpData {
  name?: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  hasHours?: boolean;
  totalReviews?: number;
}

export interface GbpSnapshot {
  state: GbpState;
  lastSyncAt: string | null;
  data: GbpData | null;
}

export interface ProfileInput {
  name?: unknown;
  category?: unknown;
  city?: unknown;
  phone?: unknown;
  website?: unknown;
  schedule?: unknown;
  services?: unknown;
}

export type PriorityId =
  | 'complete_profile' | 'add_category' | 'add_city' | 'add_phone' | 'connect_gbp' | 'fix_gbp' | 'add_schedule'
  | 'add_services' | 'add_website' | 'align_phone' | 'align_website' | 'reviews' | 'keep_fresh';

export interface Priority {
  id: PriorityId;
  cta: string;
}

export type Band = 'excellent' | 'good' | 'improvable' | 'incomplete';

export interface ScanResult {
  score: number | null;
  band: Band | null;
  coverage: number;
  evaluated: number;
  total: number;
  checks: Check[];
  priorities: Priority[];
  gbpState: GbpState;
}

// Weights total 100: 64 for data stored in LocalSEOHub, 36 for data that only a real Google sync can confirm.
export const WEIGHTS: Record<CheckId, number> = {
  name: 8, category: 10, city: 10, phone: 10, website: 8, schedule: 8, services: 10,
  gbp_name: 5, gbp_category: 6, gbp_address: 6, gbp_phone: 6, gbp_website: 5, gbp_hours: 5, gbp_reviews: 3,
};

export const BANDS: Array<{ min: number; band: Band }> = [
  { min: 90, band: 'excellent' },
  { min: 75, band: 'good' },
  { min: 50, band: 'improvable' },
  { min: 0, band: 'incomplete' },
];

export const ROUTES = {
  business: '/negocio',
  sources: '/fuentes',
  seo: '/herramientas/seo',
  advisor: '/herramientas/advisor',
} as const;

const PRIORITY_ORDER: Array<{ id: PriorityId; cta: string }> = [
  { id: 'add_category', cta: ROUTES.business },
  { id: 'add_city', cta: ROUTES.business },
  { id: 'add_phone', cta: ROUTES.business },
  { id: 'fix_gbp', cta: ROUTES.sources },
  { id: 'connect_gbp', cta: ROUTES.sources },
  { id: 'add_schedule', cta: ROUTES.business },
  { id: 'add_services', cta: ROUTES.business },
  { id: 'add_website', cta: ROUTES.business },
  { id: 'align_phone', cta: ROUTES.business },
  { id: 'align_website', cta: ROUTES.business },
  { id: 'reviews', cta: ROUTES.advisor },
];

export const MAX_PRIORITIES = 5;

export const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const digits = (s: string) => s.replace(/\D/g, '');
export const host = (s: string) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
export const validPhone = (s: string) => digits(s).length >= 7;
export const validWebsite = (s: string) => /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(s);

export function serviceList(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.map((s) => text(s, 80)).filter(Boolean))] : [];
}

// Only keys that gbp-sync actually returns are read; anything else in metadata is ignored.
export function normalizeGbp(row: { status?: unknown; last_sync_at?: unknown; metadata?: unknown } | null): GbpSnapshot {
  if (!row) return { state: 'not_connected', lastSyncAt: null, data: null };
  if (row.status === 'error') return { state: 'error', lastSyncAt: null, data: null };
  if (row.status !== 'connected') return { state: 'not_connected', lastSyncAt: null, data: null };
  const lastSyncAt = typeof row.last_sync_at === 'string' && !Number.isNaN(Date.parse(row.last_sync_at)) ? row.last_sync_at : null;
  const m = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  const data: GbpData = {};
  for (const k of ['name', 'category', 'address', 'phone', 'website'] as const) {
    const v = text(m[k]);
    if (v) data[k] = v;
  }
  if ('hours' in m) data.hasHours = Array.isArray(m.hours) && m.hours.length > 0;
  if (typeof m.totalReviews === 'number' && Number.isInteger(m.totalReviews) && m.totalReviews >= 0) data.totalReviews = m.totalReviews;
  // A sync that stored no profile fields gives nothing to verify.
  const synced = lastSyncAt !== null && ['name', 'category', 'address', 'phone', 'website'].some((k) => k in m);
  return { state: 'connected', lastSyncAt, data: synced ? data : null };
}

function check(id: CheckId, source: CheckSource, status: CheckStatus, extra: Partial<Check> = {}, fraction = 1): Check {
  const weight = WEIGHTS[id];
  const points = status === 'ok' ? Math.round(weight * fraction * 100) / 100 : 0;
  const trust: Trust = status === 'unchecked' ? 'unchecked' : source === 'google' ? 'verified' : 'available';
  return { id, source, weight, status, points, trust, ...extra };
}

const present = (ok: boolean): CheckStatus => (ok ? 'ok' : 'improve');

export function bandFor(score: number): Band {
  return BANDS.find((b) => score >= b.min)!.band;
}

export function scan(profile: ProfileInput, gbp: GbpSnapshot): ScanResult {
  const p = {
    name: text(profile.name, 120),
    category: text(profile.category, 120),
    city: text(profile.city, 120),
    phone: text(profile.phone, 40),
    website: text(profile.website, 200),
    schedule: text(profile.schedule, 200),
    services: serviceList(profile.services),
  };

  const checks: Check[] = [
    check('name', 'localseohub', present(p.name.length >= 2)),
    check('category', 'localseohub', present(!!p.category)),
    check('city', 'localseohub', present(!!p.city)),
    check('phone', 'localseohub', present(validPhone(p.phone))),
    check('website', 'localseohub', present(validWebsite(p.website))),
    check('schedule', 'localseohub', present(!!p.schedule)),
    p.services.length === 1
      ? check('services', 'localseohub', 'ok', { detail: 'partial_services' }, 0.5)
      : check('services', 'localseohub', present(p.services.length >= 2)),
  ];

  const g = gbp.data;
  if (!g) {
    for (const id of ['gbp_name', 'gbp_category', 'gbp_address', 'gbp_phone', 'gbp_website', 'gbp_hours', 'gbp_reviews'] as const) {
      checks.push(check(id, 'google', 'unchecked'));
    }
  } else {
    const phoneMismatch = !!g.phone && validPhone(p.phone) && digits(g.phone) !== digits(p.phone);
    const webMismatch = !!g.website && validWebsite(p.website) && host(g.website) !== host(p.website);
    checks.push(
      check('gbp_name', 'google', present(!!g.name)),
      check('gbp_category', 'google', present(!!g.category)),
      check('gbp_address', 'google', present(!!g.address)),
      check('gbp_phone', 'google', present(!!g.phone && !phoneMismatch), phoneMismatch ? { detail: 'phone_mismatch' } : {}),
      check('gbp_website', 'google', present(!!g.website && !webMismatch), webMismatch ? { detail: 'website_mismatch' } : {}),
      g.hasHours === undefined ? check('gbp_hours', 'google', 'unchecked') : check('gbp_hours', 'google', present(g.hasHours)),
      g.totalReviews === undefined
        ? check('gbp_reviews', 'google', 'unchecked')
        : check('gbp_reviews', 'google', present(g.totalReviews > 0), {
          detail: g.totalReviews > 0 ? 'has_reviews' : 'no_reviews', reviewCount: g.totalReviews,
        }),
    );
  }

  const evaluable = checks.filter((c) => c.status !== 'unchecked');
  const coverage = Math.round((evaluable.length / checks.length) * 100);
  const base = { coverage, evaluated: evaluable.length, total: checks.length, checks, gbpState: gbp.state };

  if (!p.name && !p.category) {
    return { ...base, score: null, band: null, priorities: [{ id: 'complete_profile', cta: ROUTES.business }] };
  }

  const max = evaluable.reduce((s, c) => s + c.weight, 0);
  const got = evaluable.reduce((s, c) => s + c.points, 0);
  const score = Math.round((got / max) * 100);

  const byId = Object.fromEntries(checks.map((c) => [c.id, c])) as Record<CheckId, Check>;
  const triggered = new Set<PriorityId>();
  if (byId.category.status === 'improve') triggered.add('add_category');
  if (byId.city.status === 'improve') triggered.add('add_city');
  if (byId.phone.status === 'improve') triggered.add('add_phone');
  if (gbp.state === 'error') triggered.add('fix_gbp');
  if (gbp.state === 'not_connected') triggered.add('connect_gbp');
  if (byId.schedule.status === 'improve') triggered.add('add_schedule');
  if (byId.services.status === 'improve' || byId.services.detail === 'partial_services') triggered.add('add_services');
  if (byId.website.status === 'improve') triggered.add('add_website');
  if (byId.gbp_phone.detail === 'phone_mismatch') triggered.add('align_phone');
  if (byId.gbp_website.detail === 'website_mismatch') triggered.add('align_website');
  if (byId.gbp_reviews.detail === 'no_reviews') triggered.add('reviews');

  const priorities = PRIORITY_ORDER.filter((r) => triggered.has(r.id)).slice(0, MAX_PRIORITIES).map((r) => ({ ...r }));
  if (priorities.length === 0) priorities.push({ id: 'keep_fresh', cta: ROUTES.seo });

  return { ...base, score, band: bandFor(score), priorities };
}
