import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { resolveBusiness, updateBusinessRecord, importLegacyMemory } from '../businessRepository';
import type { BusinessRecord } from '../businessRecord';

const root = resolve(__dirname, '../../../..');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

// In-memory stand-in for the businesses table that applies the same owner-only rule as RLS.
function createFakeDb(authUid: string, rows: Row[] = []) {
  let seq = 0;
  const visible = () => rows.filter((r) => r.user_id === authUid);
  const db = {
    rows,
    from(table: string) {
      if (table !== 'businesses') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          const filters: [string, unknown][] = [];
          const q = {
            eq(k: string, v: unknown) { filters.push([k, v]); return q; },
            async maybeSingle() {
              const hit = visible().find((r) => filters.every(([k, v]) => r[k] === v));
              return { data: hit ? { ...hit } : null, error: null };
            },
          };
          return q;
        },
        async upsert(row: Row) {
          if (row.user_id !== authUid) return { error: { message: 'row-level security' } };
          if (!rows.some((r) => r.user_id === row.user_id)) {
            seq += 1;
            rows.push({
              id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
              name: '', category: '', city: '', website: '', phone: '', schedule: '', target_audience: '',
              services: [], primary_goal: null, secondary_goals: [],
              onboarding_completed: false, onboarding_completed_at: null, legacy_memory_migrated_at: null,
              ...row,
            });
          }
          return { error: null };
        },
        update(patch: Row) {
          const filters: [string, unknown][] = [];
          const q = {
            eq(k: string, v: unknown) { filters.push([k, v]); return q; },
            select() { return q; },
            async maybeSingle() {
              const hit = visible().find((r) => filters.every(([k, v]) => r[k] === v));
              if (!hit) return { data: null, error: null };
              Object.assign(hit, patch);
              return { data: { ...hit }, error: null };
            },
          };
          return q;
        },
      };
    },
  };
  return db;
}

const asDb = (db: ReturnType<typeof createFakeDb>) => db as unknown as Parameters<typeof resolveBusiness>[1];

describe('resolveBusiness', () => {
  it('creates exactly one business per user with a real UUID', async () => {
    const db = createFakeDb('user-a');
    const first = await resolveBusiness('user-a', asDb(db));
    const again = await resolveBusiness('user-a', asDb(db));
    expect(first.id).toMatch(UUID_RE);
    expect(again.id).toBe(first.id);
    expect(db.rows).toHaveLength(1);
  });

  it('returns the existing business so onboarded users are not re-onboarded', async () => {
    const db = createFakeDb('user-a', [{ id: '5b0d8f3e-2c1a-4e7b-9f00-1a2b3c4d5e6f', user_id: 'user-a', onboarding_completed: true, legacy_memory_migrated_at: null }]);
    const b = await resolveBusiness('user-a', asDb(db));
    expect(b.onboarding_completed).toBe(true);
    expect(db.rows).toHaveLength(1);
  });
});

describe('updateBusinessRecord', () => {
  it('persists changes that survive a reload', async () => {
    const db = createFakeDb('user-a');
    const b = await resolveBusiness('user-a', asDb(db));
    await updateBusinessRecord(b.id, { name: 'Panaderia Sol', city: 'Sevilla' }, asDb(db));
    const reloaded = await resolveBusiness('user-a', asDb(db));
    expect(reloaded.name).toBe('Panaderia Sol');
    expect(reloaded.city).toBe('Sevilla');
  });

  it('rejects placeholder ids', async () => {
    const db = createFakeDb('user-a');
    for (const id of ['default', 'default-business', 'biz-001']) {
      await expect(updateBusinessRecord(id, { name: 'x' }, asDb(db))).rejects.toThrow();
    }
  });

  it("cannot modify another user's business", async () => {
    const other = { id: '5b0d8f3e-2c1a-4e7b-9f00-1a2b3c4d5e6f', user_id: 'user-b', name: 'Ajeno' };
    const db = createFakeDb('user-a', [other]);
    await expect(updateBusinessRecord(other.id, { name: 'Robado' }, asDb(db))).rejects.toThrow();
    expect(other.name).toBe('Ajeno');
  });

  it('writes onboarding answers to the resolved business', async () => {
    const db = createFakeDb('user-a');
    const b = await resolveBusiness('user-a', asDb(db));
    const patch = { name: 'Taller Ruiz', category: 'Taller', city: 'Madrid' };
    await updateBusinessRecord(b.id, { ...patch, onboarding_completed: true }, asDb(db));
    expect(db.rows[0]).toMatchObject({ id: b.id, name: 'Taller Ruiz', onboarding_completed: true });
  });
});

describe('importLegacyMemory', () => {
  const legacy = JSON.stringify({ profile: { name: 'Floristeria Ana', city: 'Valencia', category: 'Floristeria' }, goals: [] });
  const storage = (value: string | null) => ({ getItem: () => value });

  it('imports once and never overwrites stored values', async () => {
    const db = createFakeDb('user-a');
    const b = await resolveBusiness('user-a', asDb(db));
    await updateBusinessRecord(b.id, { name: 'Nombre real' }, asDb(db));
    const current = (await resolveBusiness('user-a', asDb(db))) as BusinessRecord;

    const imported = await importLegacyMemory(current, storage(legacy), asDb(db));
    expect(imported.name).toBe('Nombre real');
    expect(imported.legacy_memory_migrated_at).toBeTruthy();

    const changed = JSON.stringify({ profile: { name: 'Otro', city: 'Bilbao' }, goals: [] });
    const second = await importLegacyMemory(imported, storage(changed), asDb(db));
    expect(second.city).toBe(imported.city);
  });

  it('skips demo data', async () => {
    const demo = JSON.stringify({ profile: { id: 'demo-biz-001', name: 'Demo', city: 'Demo' }, goals: [] });
    const db = createFakeDb('user-a');
    const b = await resolveBusiness('user-a', asDb(db));
    const after = await importLegacyMemory(b, storage(demo), asDb(db));
    expect(after.name).not.toBe('Demo');
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe('no placeholder business ids in active code', () => {
  const files = [...walk(resolve(root, 'src')), ...walk(resolve(root, 'supabase/functions'))];
  const allowed = new Set(['src/features/business-memory/legacyMigration.ts']);

  it("never uses 'default', 'default-business' or 'biz-001' as a business id", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(root, f);
      if (allowed.has(rel)) continue;
      const code = readFileSync(f, 'utf8');
      if (/business_?[iI]d\s*[:=]\s*['"]default['"]/.test(code)) offenders.push(`${rel}: business id 'default'`);
      if (/\.eq\(\s*['"]business_id['"]\s*,\s*['"]default['"]/.test(code)) offenders.push(`${rel}: filter 'default'`);
      if (/['"](default-business|biz-001)['"]/.test(code)) offenders.push(`${rel}: placeholder literal`);
    }
    expect(offenders).toEqual([]);
  });

  it('GBP functions resolve the business from the owner record', () => {
    for (const fn of ['gbp-oauth-start', 'gbp-oauth-callback', 'gbp-sync']) {
      const code = readFileSync(resolve(root, `supabase/functions/${fn}/index.ts`), 'utf8');
      expect(code, fn).toMatch(/\.from\("businesses"\)/);
      expect(code, fn).toMatch(/business_id: business\.id|\.eq\("business_id", business\.id\)/);
    }
  });

  it('GBP functions never log or return raw tokens', () => {
    for (const fn of ['gbp-oauth-start', 'gbp-oauth-callback', 'gbp-sync', 'gbp-list-locations']) {
      const code = readFileSync(resolve(root, `supabase/functions/${fn}/index.ts`), 'utf8');
      expect(code, fn).not.toMatch(/console\.\w+\([^)]*(access_token|refresh_token|tokens\b)/);
      expect(code, fn).not.toMatch(/JSON\.stringify\(\{[^}]*(access_token|refresh_token)/);
    }
  });
});
