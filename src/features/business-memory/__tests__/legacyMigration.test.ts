import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LEGACY_STORAGE_KEYS,
  extractLegacyMemory,
  isValidBusinessId,
  planLegacyMerge,
} from '../legacyMigration';

const root = resolve(__dirname, '../../../..');

const realMemory = JSON.stringify({
  profile: {
    id: 'biz-001',
    name: 'Panaderia Lola',
    category: 'Panaderia',
    city: 'Sevilla',
    services: ['Pan', ' ', 'Tartas'],
    website: 'https://lola.es',
    phone: '600000000',
    schedule: 'L-S 8-14',
    targetAudience: 'Vecinos',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  goals: [{ goalId: 'more_reviews' }, { goalId: 'more_calls' }, { goalId: 'invented_goal' }],
  timeline: [{ id: 't1', title: 'Hecho' }],
  insights: [{ id: 'i1', text: 'Generado' }],
  weeklySummaries: [{ actionsCompleted: 9 }],
});

describe('legacy localStorage classification', () => {
  it('classifies every known key, and only business memory is migrated', () => {
    const persistent = Object.entries(LEGACY_STORAGE_KEYS).filter(([, v]) => v.class === 'C_PERSISTENT').map(([k]) => k);
    expect(persistent).toEqual(['lsh_v2_business_memory']);
  });

  it('every localStorage key used in the app is classified', () => {
    const files = ['src/lib/analytics.ts', 'src/lib/i18n.tsx', 'src/components/PotentialLanding.tsx', 'src/features/business-memory/repository.ts'];
    const literalKeys = new Set<string>();
    for (const f of files) {
      const code = readFileSync(resolve(root, f), 'utf8');
      for (const m of code.matchAll(/localStorage\.(?:get|set)Item\('([^']+)'/g)) literalKeys.add(m[1]);
      for (const m of code.matchAll(/(?:STORAGE_KEY|SESSION_KEY|GOOGLE_INTENT_KEY)\s*=\s*'([^']+)'/g)) literalKeys.add(m[1]);
    }
    for (const k of literalKeys) expect(LEGACY_STORAGE_KEYS[k], k).toBeDefined();
  });
});

describe('extractLegacyMemory', () => {
  it('extracts only user-typed profile fields and known goals', () => {
    const r = extractLegacyMemory(realMemory);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields).toEqual({
      name: 'Panaderia Lola',
      category: 'Panaderia',
      city: 'Sevilla',
      website: 'https://lola.es',
      phone: '600000000',
      schedule: 'L-S 8-14',
      target_audience: 'Vecinos',
      services: ['Pan', 'Tartas'],
      primary_goal: 'more_reviews',
      secondary_goals: ['more_calls'],
    });
    expect(JSON.stringify(r.fields)).not.toMatch(/Generado|Hecho|actionsCompleted/);
  });

  it('does not migrate demo data', () => {
    const demo = JSON.stringify({ profile: { id: 'demo-biz-001', name: 'Demo Cafe' } });
    expect(extractLegacyMemory(demo)).toEqual({ ok: false, reason: 'demo' });
  });

  it('does not migrate the empty default state', () => {
    const empty = JSON.stringify({ profile: { id: 'biz-001', name: '', services: [] }, goals: [] });
    expect(extractLegacyMemory(empty)).toEqual({ ok: false, reason: 'empty' });
  });

  it('handles missing and corrupt storage', () => {
    expect(extractLegacyMemory(null)).toEqual({ ok: false, reason: 'missing' });
    expect(extractLegacyMemory('{not json')).toEqual({ ok: false, reason: 'corrupt' });
  });
});

describe('planLegacyMerge', () => {
  const legacy = extractLegacyMemory(realMemory);

  it('never overwrites values already stored in Supabase', () => {
    const patch = planLegacyMerge({ name: 'Nombre real', city: '', services: [], legacy_memory_migrated_at: null }, legacy);
    expect(patch?.name).toBeUndefined();
    expect(patch?.city).toBe('Sevilla');
    expect(patch?.services).toEqual(['Pan', 'Tartas']);
  });

  it('runs only once', () => {
    expect(planLegacyMerge({ legacy_memory_migrated_at: '2026-10-01T00:00:00Z' }, legacy)).toBeNull();
  });

  it('keeps an existing primary goal and its secondary goals intact', () => {
    const patch = planLegacyMerge({ primary_goal: 'better_local_seo', secondary_goals: [] }, legacy);
    expect(patch?.primary_goal).toBeUndefined();
    expect(patch?.secondary_goals).toBeUndefined();
  });

  it('demo or empty legacy data yields an empty patch', () => {
    expect(planLegacyMerge({}, { ok: false, reason: 'demo' })).toEqual({});
  });
});

describe('business_id', () => {
  it('rejects placeholder and shared identifiers', () => {
    for (const id of ['default', 'default-business', 'biz-001', 'demo-biz-001', 'Panaderia Lola', 'a@b.com', 'locations/123', '']) {
      expect(isValidBusinessId(id), id).toBe(false);
    }
  });

  it('accepts a real uuid', () => {
    expect(isValidBusinessId('5b0d8f3e-2c1a-4e7b-9f00-1a2b3c4d5e6f')).toBe(true);
  });
});

describe('applied business migration SQL', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/20261007162621_create_businesses.sql'), 'utf8');

  it('enables RLS with four owner-scoped policies and no open policies', () => {
    expect(sql).toMatch(/ALTER TABLE businesses ENABLE ROW LEVEL SECURITY/);
    for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toMatch(new RegExp(`ON businesses FOR ${verb}\\s+TO authenticated`));
    }
    expect(sql).not.toMatch(/USING \(true\)|WITH CHECK \(true\)|FOR ALL/);
    expect(sql.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('is non-destructive and idempotent', () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bALTER COLUMN\b/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS businesses/);
    expect(sql).toMatch(/ON CONFLICT \(user_id\) DO NOTHING/);
  });

  it('preserves onboarding completion for existing users', () => {
    expect(sql).toMatch(/fv\.completed,\s*\n\s*fv\.completed_at/);
  });
});
