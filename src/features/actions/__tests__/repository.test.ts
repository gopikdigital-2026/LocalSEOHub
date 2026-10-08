import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { syncActions, transitionAction, loadActions, getAction } from '../repository';
import { buildActionReport, actionsToTimeline } from '../engine';
import type { BusinessRecord } from '../../business-memory/businessRecord';
import type { SourceSnapshot } from '../types';

const root = resolve(__dirname, '../../../..');
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type Row = Record<string, unknown>;
const OPEN = ['PENDING', 'IN_PROGRESS'];

// In-memory business_actions table enforcing owner RLS and the open-rule unique index.
function createFakeDb(authUid: string, rows: Row[] = []) {
  let seq = 0;
  const visible = () => rows.filter((r) => r.user_id === authUid);
  const matches = (r: Row, eqs: [string, unknown][], ins: [string, unknown[]][]) =>
    eqs.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k]));

  function query(run: (eqs: [string, unknown][], ins: [string, unknown[]][]) => { data: unknown; error: unknown }) {
    const eqs: [string, unknown][] = [];
    const ins: [string, unknown[]][] = [];
    const q = {
      select() { return q; },
      eq(k: string, v: unknown) { eqs.push([k, v]); return q; },
      in(k: string, v: unknown[]) { ins.push([k, v]); return q; },
      order() { return q; },
      limit() { return q; },
      async maybeSingle() {
        const res = run(eqs, ins);
        return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error };
      },
      then(resolve: (v: { data: unknown; error: unknown }) => void) { resolve(run(eqs, ins)); },
    };
    return q;
  }

  return {
    rows,
    from(table: string) {
      if (table !== 'business_actions') throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return query((eqs, ins) => ({ data: visible().filter((r) => matches(r, eqs, ins)).map((r) => ({ ...r })), error: null }));
        },
        insert(list: Row[]) {
          return query(() => {
            const created: Row[] = [];
            for (const row of list) {
              const full: Row = { user_id: authUid, ...row };
              if (full.user_id !== authUid || full.business_id !== BIZ) return { data: null, error: { code: '42501', message: 'row-level security' } };
              if (rows.some((r) => r.business_id === full.business_id && r.rule_id === full.rule_id && OPEN.includes(r.status as string))) {
                return { data: null, error: { code: '23505', message: 'duplicate' } };
              }
              seq += 1;
              const stamp = new Date().toISOString();
              const rec = {
                id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
                created_at: stamp, updated_at: stamp, started_at: null, completed_at: null, dismissed_at: null,
                ...full,
              };
              rows.push(rec);
              created.push({ ...rec });
            }
            return { data: created, error: null };
          });
        },
        update(patch: Row) {
          return query((eqs, ins) => {
            const hits = visible().filter((r) => matches(r, eqs, ins));
            hits.forEach((h) => Object.assign(h, patch));
            return { data: hits.map((h) => ({ ...h })), error: null };
          });
        },
      };
    },
  };
}

function business(over: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: BIZ, user_id: OWNER, name: 'Panadería Sol', category: 'Panadería', city: 'Valencia',
    website: '', phone: '', schedule: '', target_audience: '', services: [],
    primary_goal: 'more_reviews', secondary_goals: [],
    onboarding_completed: true, onboarding_completed_at: '2026-01-01T00:00:00Z', legacy_memory_migrated_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const NO_SOURCES: SourceSnapshot[] = [];

describe('action repository (persisted business_actions)', () => {
  it('existing onboarded user with no actions gets recommendations persisted against the real business UUID', async () => {
    const db = createFakeDb(OWNER);
    const { actions, inserted } = await syncActions(business(), NO_SOURCES, db as never);
    expect(inserted.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.businessId === BIZ && a.userId === OWNER && a.status === 'PENDING')).toBe(true);
    expect(actions.map((a) => a.ruleId)).toContain('connect_google_business_profile');
  });

  it('re-running sync does not create duplicate open actions', async () => {
    const db = createFakeDb(OWNER);
    await syncActions(business(), NO_SOURCES, db as never);
    const before = db.rows.length;
    const second = await syncActions(business(), NO_SOURCES, db as never);
    expect(second.inserted).toHaveLength(0);
    expect(db.rows.length).toBe(before);
    const keys = db.rows.filter((r) => OPEN.includes(r.status as string)).map((r) => r.rule_id);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('completion persists COMPLETED + completed_at and the action is not recreated immediately', async () => {
    const db = createFakeDb(OWNER);
    const { actions } = await syncActions(business({ services: ['Pan de masa madre'] }), NO_SOURCES, db as never);
    const post = actions.find((a) => a.ruleId === 'create_weekly_post')!;
    const done = await transitionAction(post.id, 'COMPLETED', db as never);
    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt).not.toBeNull();
    const after = await syncActions(business({ services: ['Pan de masa madre'] }), NO_SOURCES, db as never);
    expect(after.inserted.map((a) => a.ruleId)).not.toContain('create_weekly_post');
  });

  it('dismiss persists DISMISSED + dismissed_at and is not recreated immediately', async () => {
    const db = createFakeDb(OWNER);
    const { actions } = await syncActions(business({ services: ['Pan de masa madre'] }), NO_SOURCES, db as never);
    const photos = actions.find((a) => a.ruleId === 'add_recent_photos')!;
    const dismissed = await transitionAction(photos.id, 'DISMISSED', db as never);
    expect(dismissed.status).toBe('DISMISSED');
    expect(dismissed.dismissedAt).not.toBeNull();
    const after = await syncActions(business({ services: ['Pan de masa madre'] }), NO_SOURCES, db as never);
    expect(after.inserted.map((a) => a.ruleId)).not.toContain('add_recent_photos');
  });

  it('start sets IN_PROGRESS and a completed action cannot be moved back', async () => {
    const db = createFakeDb(OWNER);
    const { actions } = await syncActions(business(), NO_SOURCES, db as never);
    const a = actions[0];
    expect((await transitionAction(a.id, 'IN_PROGRESS', db as never)).status).toBe('IN_PROGRESS');
    await transitionAction(a.id, 'COMPLETED', db as never);
    await expect(transitionAction(a.id, 'DISMISSED', db as never)).rejects.toThrow('invalid_transition');
    expect((await transitionAction(a.id, 'COMPLETED', db as never)).status).toBe('COMPLETED');
    expect((await getAction(a.id, db as never))?.status).toBe('COMPLETED');
  });

  it('filling a profile gap closes the open action as completed', async () => {
    const db = createFakeDb(OWNER);
    await syncActions(business(), NO_SOURCES, db as never);
    const { actions } = await syncActions(business({ phone: '600000000', updated_at: '2026-01-02T00:00:00Z' }), NO_SOURCES, db as never);
    const phone = actions.find((a) => a.ruleId === 'add_business_phone')!;
    expect(phone.status).toBe('COMPLETED');
    expect(phone.metadata.resolved_by).toBe('condition_met');
  });

  it('owner isolation: another user cannot see or change the owner actions', async () => {
    const rows: Row[] = [];
    await syncActions(business(), NO_SOURCES, createFakeDb(OWNER, rows) as never);
    const intruder = createFakeDb(OTHER, rows);
    expect(await loadActions(BIZ, intruder as never)).toHaveLength(0);
    await expect(transitionAction(String(rows[0].id), 'COMPLETED', intruder as never)).rejects.toThrow();
    expect(rows[0].status).toBe('PENDING');
  });

  it('rejects placeholder business ids', async () => {
    const db = createFakeDb(OWNER);
    await expect(loadActions('default-business', db as never)).rejects.toThrow();
    await expect(syncActions(business({ id: 'biz-001' }), NO_SOURCES, db as never)).rejects.toThrow();
  });

  it('history and reports come from persisted actions with real counts', async () => {
    const db = createFakeDb(OWNER);
    const { actions } = await syncActions(business(), NO_SOURCES, db as never);
    await transitionAction(actions[0].id, 'COMPLETED', db as never);
    const all = await loadActions(BIZ, db as never);
    const timeline = actionsToTimeline(all);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].type).toBe('action_completed');
    const report = buildActionReport(all);
    expect(report.executedThisWeek).toBe(1);
    expect(report.dataCompletedThisWeek).toBe(0);
    expect(report.pending).toBe(all.length - 1);
    expect(report.weeklyProgress).toBe(Math.round((1 / all.length) * 100));
  });
});

describe('business_actions migration', () => {
  const dir = resolve(root, 'supabase/migrations');
  const file = readdirSync(dir).find((f) => f.endsWith('_create_business_actions.sql'))!;
  const sql = readFileSync(resolve(dir, file), 'utf8');

  it('exists in the repository with RLS and four owner-scoped policies', () => {
    expect(file).toBeTruthy();
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].forEach((verb) => expect(sql).toMatch(new RegExp(`FOR ${verb} TO authenticated`)));
    expect(sql).not.toMatch(/FOR ALL/);
    expect(sql).not.toMatch(/USING \(true\)/);
    expect(sql).toMatch(/auth\.uid\(\) = user_id/);
    expect(sql).toMatch(/REFERENCES businesses\(id\)/);
  });

  it('enforces dedup of open actions at the database level', () => {
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*\(business_id, rule_id\)[\s\S]*WHERE status IN \('PENDING','IN_PROGRESS'\)/);
  });

  it('constrains origins, priorities and statuses', () => {
    expect(sql).toMatch(/VERIFIED_FINDING.*BUSINESS_PROFILE.*GOAL_BASED.*GENERAL_BEST_PRACTICE.*FOLLOW_UP.*SOURCE_REQUIRED/);
    expect(sql).toMatch(/'HIGH','MEDIUM','LOW'/);
    expect(sql).toMatch(/'PENDING','IN_PROGRESS','COMPLETED','DISMISSED'/);
  });
});
