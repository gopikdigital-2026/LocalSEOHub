import type { GoalId } from './types';

export type LegacyKeyClass = 'A_UI' | 'B_CACHE' | 'C_PERSISTENT' | 'D_DEMO_LEGACY';

export const LEGACY_STORAGE_KEYS: Record<string, { storage: 'local' | 'session'; class: LegacyKeyClass }> = {
  lsh_v2_business_memory: { storage: 'local', class: 'C_PERSISTENT' },
  lang: { storage: 'local', class: 'A_UI' },
  ls_sid: { storage: 'local', class: 'B_CACHE' },
  _ga_intent: { storage: 'local', class: 'A_UI' },
  _ptl_name: { storage: 'local', class: 'D_DEMO_LEGACY' },
};

export const LEGACY_MEMORY_KEY = 'lsh_v2_business_memory';

const KNOWN_GOALS: readonly GoalId[] = [
  'more_calls',
  'more_reviews',
  'better_local_seo',
  'more_bookings',
  'more_web_visits',
  'more_followers',
  'better_reputation',
];

export interface MigratableBusinessFields {
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
}

export type LegacyExtraction =
  | { ok: true; fields: Partial<MigratableBusinessFields> }
  | { ok: false; reason: 'missing' | 'corrupt' | 'demo' | 'empty' };

function cleanText(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Only the user-typed profile and selected goals are migrated. Timeline, insights,
// preferences and weekly summaries were generated locally and their provenance cannot be verified.
export function extractLegacyMemory(raw: string | null): LegacyExtraction {
  if (raw === null) return { ok: false, reason: 'missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'corrupt' };
  const state = parsed as { profile?: Record<string, unknown>; goals?: unknown };
  const profile = state.profile && typeof state.profile === 'object' ? state.profile : {};

  const id = cleanText(profile.id);
  if (id.toLowerCase().startsWith('demo') || profile.isDemo === true) return { ok: false, reason: 'demo' };

  const fields: Partial<MigratableBusinessFields> = {};
  const text: [keyof MigratableBusinessFields, unknown][] = [
    ['name', profile.name],
    ['category', profile.category],
    ['city', profile.city],
    ['website', profile.website],
    ['phone', profile.phone],
    ['schedule', profile.schedule],
    ['target_audience', profile.targetAudience],
  ];
  for (const [key, value] of text) {
    const v = cleanText(value, key === 'target_audience' ? 1000 : 200);
    if (v) (fields as Record<string, unknown>)[key] = v;
  }

  if (Array.isArray(profile.services)) {
    const services = profile.services.map((s) => cleanText(s)).filter(Boolean).slice(0, 50);
    if (services.length) fields.services = services;
  }

  if (Array.isArray(state.goals)) {
    const ids = state.goals
      .map((g) => (g && typeof g === 'object' ? (g as { goalId?: unknown }).goalId : undefined))
      .filter((g): g is GoalId => typeof g === 'string' && (KNOWN_GOALS as readonly string[]).includes(g));
    const unique = [...new Set(ids)];
    if (unique.length) {
      fields.primary_goal = unique[0];
      fields.secondary_goals = unique.slice(1);
    }
  }

  return Object.keys(fields).length ? { ok: true, fields } : { ok: false, reason: 'empty' };
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// Returns only the fields that are still empty in the database, so stored data is never overwritten.
export function planLegacyMerge(
  existing: Partial<MigratableBusinessFields> & { legacy_memory_migrated_at?: string | null },
  legacy: LegacyExtraction,
): Partial<MigratableBusinessFields> | null {
  if (existing.legacy_memory_migrated_at) return null;
  if (!legacy.ok) return {};
  const patch: Partial<MigratableBusinessFields> = {};
  for (const [key, value] of Object.entries(legacy.fields) as [keyof MigratableBusinessFields, unknown][]) {
    if (isEmptyValue(existing[key])) (patch as Record<string, unknown>)[key] = value;
  }
  if (patch.secondary_goals && !isEmptyValue(existing.primary_goal) && patch.primary_goal === undefined) {
    delete patch.secondary_goals;
  }
  return patch;
}

const FORBIDDEN_BUSINESS_IDS = new Set(['default', 'default-business', 'biz-001', 'demo-biz-001']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidBusinessId(id: unknown): id is string {
  return typeof id === 'string' && !FORBIDDEN_BUSINESS_IDS.has(id) && UUID_RE.test(id);
}
