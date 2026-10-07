import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const tracked: { name: string; props: Record<string, unknown> }[] = [];
vi.mock('../../../lib/analytics', () => ({ track: (name: string, props: Record<string, unknown>) => tracked.push({ name, props }) }));
vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import {
  activationStage, goalLabel, hasMinimumProfile, isUsefulAction, milestonesFor, parseMilestones, resolveTodayState,
  type Milestones,
} from '../milestones';
import { loadMilestones, recordMilestones } from '../repository';
import { advanceActivation } from '../service';
import { evaluateBusinessState, prioritize, selectTodayActions } from '../../actions/engine';
import { resumeScreen, initialBusinessData, stepNumber, ONBOARDING_TOTAL_STEPS, hasBusinessBasics } from '../../first-value/onboarding';
import { safeReturnPath, destinationFor } from '../../../app-v2/returnTo';
import type { BusinessRecord } from '../../business-memory/businessRecord';
import type { BusinessAction, SourceSnapshot } from '../../actions/types';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');
const NOW = '2026-03-11T10:00:00.000Z';
const LATER = '2026-03-12T10:00:00.000Z';
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function business(over: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: BIZ, user_id: OWNER, name: 'Taller Ruiz', category: 'Taller', city: 'Sevilla',
    website: '', phone: '', schedule: '', target_audience: '', services: [],
    primary_goal: 'more_calls', secondary_goals: [],
    onboarding_completed: true, onboarding_completed_at: '2026-03-10T09:00:00.000Z', legacy_memory_migrated_at: null,
    created_at: '2026-03-10T08:00:00.000Z', updated_at: '2026-03-10T08:00:00.000Z',
    ...over,
  };
}

function action(ruleId: string, over: Partial<BusinessAction> = {}): BusinessAction {
  return {
    id: `id-${ruleId}`, businessId: BIZ, userId: OWNER, ruleId, actionType: 'other', category: 'content',
    title: ruleId, description: '', reason: '', sourceType: 'GOAL_BASED', sourceReference: '',
    priority: 'MEDIUM', score: 40, impact: 'medium', effortMinutes: 10, status: 'PENDING', dueDate: null,
    metadata: {}, createdAt: NOW, updatedAt: NOW, startedAt: null, completedAt: null, dismissedAt: null,
    ...over,
  };
}

/** Turns engine candidates into persisted-looking actions, the way the provider's sync does. */
function generate(b: BusinessRecord, sources: SourceSnapshot[]): BusinessAction[] {
  return prioritize(evaluateBusinessState(b, sources, [], new Date(NOW)))
    .map((c) => action(c.ruleId, { sourceType: c.sourceType, category: c.category, score: c.score }));
}

type Row = Record<string, unknown>;

// In-memory first_value_progress table that only exposes the signed-in user's rows (mirrors owner RLS).
function createFakeDb(authUid: string, rows: Row[] = []) {
  const writes: { op: string; payload: Row }[] = [];
  const visible = () => rows.filter((r) => r.user_id === authUid);
  return {
    rows,
    writes,
    from() {
      const eqs: [string, unknown][] = [];
      const find = () => visible().filter((r) => eqs.every(([k, v]) => r[k] === v));
      const q = {
        select() { return q; },
        eq(k: string, v: unknown) { eqs.push([k, v]); return q; },
        async maybeSingle() { return { data: find()[0] ?? null, error: null }; },
        update(payload: Row) {
          writes.push({ op: 'update', payload });
          return {
            eq: async (k: string, v: unknown) => {
              visible().filter((r) => r[k] === v).forEach((r) => Object.assign(r, payload));
              return { error: null };
            },
          };
        },
        async insert(payload: Row) {
          if (payload.user_id !== authUid) return { error: { message: 'row violates row-level security policy' } };
          writes.push({ op: 'insert', payload });
          rows.push({ id: `row-${rows.length + 1}`, ...payload });
          return { error: null };
        },
      };
      return q;
    },
  } as unknown as { rows: Row[]; writes: { op: string; payload: Row }[] } & Parameters<typeof loadMilestones>[2];
}

beforeEach(() => { tracked.length = 0; });

// ─── 1. Definition of first value ──────────────────────────────────────────

describe('first value definition', () => {
  it('1. minimum profile needs name, category, city and goal; website is optional', () => {
    expect(hasMinimumProfile(business({ website: '' }))).toBe(true);
    expect(hasMinimumProfile(business({ city: '  ' }))).toBe(false);
    expect(hasMinimumProfile(business({ primary_goal: null }))).toBe(false);
    expect(hasMinimumProfile(null)).toBe(false);
  });

  it('2. completing onboarding stamps business, profile and onboarding milestones only', () => {
    const m = milestonesFor({}, { type: 'onboarding_completed' }, business(), NOW);
    expect(Object.keys(m).sort()).toEqual(['business_created', 'minimum_profile_completed', 'onboarding_completed']);
    expect(m.onboarding_completed).toBe('2026-03-10T09:00:00.000Z');
  });

  it('3. recommendations milestone needs at least one action and a finished onboarding', () => {
    expect(milestonesFor({}, { type: 'recommendations_available', count: 0 }, business(), NOW).first_recommendations_generated).toBeUndefined();
    expect(milestonesFor({}, { type: 'recommendations_available', count: 2 }, business({ onboarding_completed: false }), NOW).first_recommendations_generated).toBeUndefined();
    expect(milestonesFor({}, { type: 'recommendations_available', count: 2 }, business(), NOW).first_recommendations_generated).toBe(NOW);
  });

  it('4. starting a useful action reaches first value', () => {
    const m = milestonesFor({}, { type: 'action_started', action: { sourceType: 'GOAL_BASED' } }, business(), NOW);
    expect(m.first_action_started).toBe(NOW);
    expect(m.first_value_reached).toBe(NOW);
    expect(m.first_action_completed).toBeUndefined();
  });

  it('5. a "connect a source" action is never counted as first value', () => {
    expect(isUsefulAction({ sourceType: 'SOURCE_REQUIRED' })).toBe(false);
    const m = milestonesFor({}, { type: 'action_completed', action: { sourceType: 'SOURCE_REQUIRED' } }, business(), NOW);
    expect(m.first_action_started).toBeUndefined();
    expect(m.first_value_reached).toBeUndefined();
  });

  it('6. first value also requires the minimum business profile', () => {
    const m = milestonesFor({}, { type: 'action_completed', action: { sourceType: 'GOAL_BASED' } }, business({ category: '' }), NOW);
    expect(m.first_action_completed).toBe(NOW);
    expect(m.first_value_reached).toBeUndefined();
  });

  it('7. milestones are never re-stamped', () => {
    const current: Milestones = { first_action_started: NOW, first_value_reached: NOW };
    const m = milestonesFor(current, { type: 'action_completed', action: { sourceType: 'GOAL_BASED' } }, business(), LATER);
    expect(m.first_action_started).toBeUndefined();
    expect(m.first_value_reached).toBeUndefined();
    expect(m.first_action_completed).toBe(LATER);
  });

  it('8. stored milestones are parsed defensively', () => {
    expect(parseMilestones(null)).toEqual({});
    expect(parseMilestones({ first_value_reached: NOW, junk: 'x', first_action_started: 3 })).toEqual({ first_value_reached: NOW });
  });
});

// ─── Persistence & analytics ───────────────────────────────────────────────

describe('milestone persistence', () => {
  it('9. merges only new milestones and keeps the earliest timestamp', async () => {
    const db = createFakeDb(OWNER, [{ id: 'r1', user_id: OWNER, business_id: BIZ, milestones: { onboarding_completed: NOW, legacy_flow: true } }]);
    const res = await recordMilestones(OWNER, BIZ, { onboarding_completed: LATER, first_action_started: LATER }, db);
    expect(res.added).toEqual(['first_action_started']);
    expect(db.rows[0].milestones).toEqual({ onboarding_completed: NOW, legacy_flow: true, first_action_started: LATER });
    const again = await recordMilestones(OWNER, BIZ, { first_action_started: LATER }, db);
    expect(again.added).toEqual([]);
    expect(db.writes).toHaveLength(1);
  });

  it('10. creates the progress row for users onboarded before it existed, scoped to the signed-in user', async () => {
    const db = createFakeDb(OWNER, [{ id: 'other', user_id: OTHER, business_id: BIZ, milestones: {} }]);
    const res = await recordMilestones(OWNER, BIZ, { onboarding_completed: NOW }, db);
    expect(res.added).toEqual(['onboarding_completed']);
    expect(db.rows.find((r) => r.id === 'other')?.milestones).toEqual({});
    expect(db.rows.find((r) => r.user_id === OWNER)).toMatchObject({ completed: true, completed_at: NOW });
  });

  it('11. rejects non-UUID business ids', async () => {
    const db = createFakeDb(OWNER);
    await expect(loadMilestones(OWNER, 'default', db)).rejects.toThrow();
    await expect(recordMilestones(OWNER, 'biz', { onboarding_completed: NOW }, db)).rejects.toThrow();
  });

  it('12. funnel events fire once per milestone, with no personal data', async () => {
    const db = createFakeDb(OWNER, [{ id: 'r1', user_id: OWNER, business_id: BIZ, milestones: {} }]);
    const a = action('complete_phone', { category: 'profile', sourceType: 'BUSINESS_PROFILE' });
    const first = await advanceActivation(OWNER, business(), {}, { type: 'action_started', action: a }, a, db, NOW);
    await advanceActivation(OWNER, business(), first.milestones, { type: 'action_started', action: a }, a, db, LATER);
    await advanceActivation(OWNER, business(), {}, { type: 'action_started', action: a }, a, db, LATER);
    const names = tracked.map((t) => t.name);
    expect(names.filter((n) => n === 'first_action_started')).toHaveLength(1);
    expect(names.filter((n) => n === 'first_value_reached')).toHaveLength(1);
    const allowed = ['step', 'goal_id', 'action_rule_id', 'action_category', 'source_type'];
    tracked.forEach((t) => Object.keys(t.props).forEach((k) => expect(allowed).toContain(k)));
    expect(JSON.stringify(tracked)).not.toMatch(/Taller Ruiz|Sevilla|1111/);
  });

  it('13. onboarding_completed is reported by the onboarding flow only, never by a silent backfill', async () => {
    const db = createFakeDb(OWNER, [{ id: 'r1', user_id: OWNER, business_id: BIZ, milestones: {} }]);
    await advanceActivation(OWNER, business(), {}, { type: 'recommendations_available', count: 3 }, null, db, NOW);
    expect(tracked.map((t) => t.name)).not.toContain('onboarding_completed');
    expect(tracked.map((t) => t.name)).toContain('first_recommendations_generated');

    const db2 = createFakeDb(OWNER, [{ id: 'r2', user_id: OWNER, business_id: BIZ, milestones: {} }]);
    tracked.length = 0;
    await advanceActivation(OWNER, business(), {}, { type: 'onboarding_completed' }, null, db2, NOW);
    expect(tracked).toEqual([{ name: 'onboarding_completed', props: { goal_id: 'more_calls' } }]);
  });
});

// ─── Onboarding ────────────────────────────────────────────────────────────

describe('onboarding', () => {
  it('14. has exactly two honest numbered steps', () => {
    expect(ONBOARDING_TOTAL_STEPS).toBe(2);
    expect(stepNumber('business_setup')).toBe(1);
    expect(stepNumber('primary_goal')).toBe(2);
    expect(stepNumber('welcome')).toBeNull();
    expect(stepNumber('finishing')).toBeNull();
  });

  it('15. resumes partially onboarded users at the right step, including old multi-step progress', () => {
    const data = { name: 'Taller', category: 'Taller', city: 'Sevilla', website: '' };
    expect(resumeScreen(null, null, null)).toBe('welcome');
    expect(resumeScreen('business_setup', data, null)).toBe('business_setup');
    expect(resumeScreen('primary_goal', data, null)).toBe('primary_goal');
    expect(resumeScreen('primary_goal', { ...data, city: '' }, 'more_calls')).toBe('business_setup');
    expect(resumeScreen('manual_context', data, null)).toBe('primary_goal');
    expect(resumeScreen('first_recommendation', data, 'more_calls')).toBe('finishing');
  });

  it('16. never asks again for what the business record already knows; saved answers win', () => {
    const b = business({ name: 'Bar Pepe', category: 'Bar', city: 'Cádiz', website: 'https://pepe.es' });
    expect(initialBusinessData(null, b, null)).toEqual({ name: 'Bar Pepe', category: 'Bar', city: 'Cádiz', website: 'https://pepe.es' });
    expect(initialBusinessData({ name: 'Nuevo', category: '', city: '', website: '' }, b, null).name).toBe('Nuevo');
    expect(initialBusinessData(null, business({ name: '' }), 'Desde landing').name).toBe('Desde landing');
    expect(hasBusinessBasics({ name: 'a', category: 'b', city: 'c', website: '' })).toBe(true);
  });

  it('17. the onboarding never requires connecting Google and offers copy in both languages', () => {
    const flow = src('src/features/first-value/FirstValueFlow.tsx');
    const steps = src('src/features/first-value/steps.tsx') + src('src/features/first-value/onboardingCopy.ts');
    expect(flow + steps).not.toMatch(/startGBPConnection|SourceSetupStep|InitialAnalysisStep|demo/i);
    expect(steps).toMatch(/Paso \$\{n\} de \$\{total\}/);
    expect(steps).toMatch(/Step \$\{n\} of \$\{total\}/);
    expect(steps).toMatch(/Lo utilizaremos para priorizar las acciones que más pueden ayudarte/);
    expect(flow).toMatch(/navigate\('\/hoy', \{ replace: true \}\)/);
  });
});

// ─── Today ─────────────────────────────────────────────────────────────────

describe('today', () => {
  const base = { ready: true, loading: false, error: null, todayCount: 0, history: [], business: business() };

  it('18. distinguishes every empty state', () => {
    expect(resolveTodayState({ ...base, todayCount: 2 })).toBe('ACTIONS');
    expect(resolveTodayState({ ...base, error: 'boom' })).toBe('GENERATION_ERROR');
    expect(resolveTodayState({ ...base, ready: false })).toBe('LOADING');
    expect(resolveTodayState({ ...base, business: business({ city: '' }) })).toBe('NO_DATA');
    expect(resolveTodayState({ ...base, history: [{ status: 'COMPLETED' }] })).toBe('ALL_CAUGHT_UP');
    expect(resolveTodayState(base)).toBe('NO_CURRENT_ACTIONS');
  });

  it('19. shows at most three actions and always one that needs no connection when one exists', () => {
    const list = [
      action('gbp_a', { sourceType: 'SOURCE_REQUIRED' }), action('gbp_b', { sourceType: 'SOURCE_REQUIRED' }),
      action('gbp_c', { sourceType: 'SOURCE_REQUIRED' }), action('post', { sourceType: 'GENERAL_BEST_PRACTICE' }),
    ];
    const today = selectTodayActions(list);
    expect(today).toHaveLength(3);
    expect(today.some(isUsefulAction)).toBe(true);
    expect(selectTodayActions(list.slice(0, 3)).every((a) => a.sourceType === 'SOURCE_REQUIRED')).toBe(true);
  });

  it('20. first-use copy is only personalised with real values', () => {
    expect(activationStage(null)).toBe('unknown');
    expect(activationStage({ onboarding_completed: NOW })).toBe('first_plan');
    expect(activationStage({ first_value_reached: NOW })).toBe('activated');
    expect(goalLabel(null, 'es')).toBeNull();
    expect(goalLabel('more_calls', 'en')).toBe('getting more calls');
    const notices = src('src/features/activation/ActivationNotices.tsx');
    expect(notices).toMatch(/Ya tenemos tu primer plan/);
    expect(notices).toMatch(/Primera acción completada/);
    expect(notices).toMatch(/Ver siguiente acción/);
    expect(notices).toMatch(/Volver a Hoy/);
  });

  it('21. no dead ends or false success: Today and Plan never bounce to onboarding, failed saves roll back', () => {
    expect(src('src/app-v2/routes/TodayPage.tsx')).not.toMatch(/'\/empezar'/);
    expect(src('src/app-v2/routes/PlanPage.tsx')).not.toMatch(/'\/empezar'/);
    const exec = src('src/features/execution/ExecutionPage.tsx');
    expect(exec).toMatch(/catch\(\(\) => \{ setExecutionState\(beforeCompletion\); setSaveError\(true\); \}\)/);
    const missions = src('src/features/dashboard/TodaysMissions.tsx');
    expect(missions).toMatch(/Estás al día/);
    ["'/plan'", "'/negocio'", "'/fuentes'"].forEach((p) => expect(missions).toContain(p));
  });
});

// ─── Routing ───────────────────────────────────────────────────────────────

describe('routing', () => {
  it('22. only accepts same-site return paths (no open redirects)', () => {
    expect(safeReturnPath('/plan?week=1')).toBe('/plan?week=1');
    expect(safeReturnPath('%2Fnegocio')).toBe('/negocio');
    ['https://evil.com', '//evil.com', '/\\evil.com', '%2F%2Fevil.com', '%252F%252Fevil.com', 'javascript:alert(1)', '/login', '/', '', null]
      .forEach((bad) => expect(safeReturnPath(bad)).toBeNull());
  });

  it('23. returning users go to their destination; unfinished users resume onboarding first', () => {
    expect(destinationFor('completed', null)).toBe('/hoy');
    expect(destinationFor('completed', '/plan')).toBe('/plan');
    expect(destinationFor('in_progress', '/plan')).toBe('/empezar');
    expect(destinationFor('not_started', null)).toBe('/empezar');
  });
});

// ─── Migration ─────────────────────────────────────────────────────────────

describe('migration', () => {
  it('24. adds milestones without touching access rules and backfills legacy completions', () => {
    const dir = resolve(root, 'supabase/migrations');
    const file = readdirSync(dir).find((f) => f.endsWith('_add_activation_milestones_to_first_value_progress.sql'));
    expect(file).toBeDefined();
    const sql = readFileSync(resolve(dir, file!), 'utf8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '\{\}'/i);
    expect(sql).toMatch(/legacy_flow/);
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|DISABLE ROW LEVEL SECURITY|DELETE FROM|DROP COLUMN/i);
  });
});

// ─── Mandatory scenarios ───────────────────────────────────────────────────

describe('scenario A: user without Google Business Profile', () => {
  it('26. gets real actions they can do and reaches first value', async () => {
    const b = business({ website: '', phone: '' });
    const today = selectTodayActions(generate(b, []));
    expect(today.length).toBeGreaterThan(0);
    expect(today.length).toBeLessThanOrEqual(3);
    const doable = today.find(isUsefulAction);
    expect(doable).toBeDefined();

    const db = createFakeDb(OWNER, [{ id: 'r1', user_id: OWNER, business_id: BIZ, milestones: {} }]);
    let m = (await advanceActivation(OWNER, b, {}, { type: 'onboarding_completed' }, null, db, NOW)).milestones;
    m = (await advanceActivation(OWNER, b, m, { type: 'recommendations_available', count: today.length }, null, db, NOW)).milestones;
    m = (await advanceActivation(OWNER, b, m, { type: 'action_started', action: doable! }, doable!, db, NOW)).milestones;
    m = (await advanceActivation(OWNER, b, m, { type: 'action_completed', action: doable! }, doable!, db, LATER)).milestones;
    expect(activationStage(m)).toBe('activated');
    expect(tracked.map((t) => t.name)).toEqual([
      'onboarding_completed', 'first_recommendations_generated', 'first_action_started', 'first_value_reached', 'first_action_completed',
    ]);
  });
});

describe('scenario B: Google Business Profile unavailable', () => {
  it('27. a failed or pending connection never blocks the first plan', async () => {
    const b = business();
    const sources: SourceSnapshot[] = [{ sourceType: 'google_business', status: 'error', lastSyncAt: null, metadata: {} }];
    const today = selectTodayActions(generate(b, sources));
    expect(today.some(isUsefulAction)).toBe(true);
    expect(resolveTodayState({ ready: true, loading: false, error: null, todayCount: today.length, history: [], business: b })).toBe('ACTIONS');

    const gbpOnly = today.find((a) => a.sourceType === 'SOURCE_REQUIRED') ?? action('connect_gbp', { sourceType: 'SOURCE_REQUIRED' });
    const db = createFakeDb(OWNER, [{ id: 'r1', user_id: OWNER, business_id: BIZ, milestones: {} }]);
    const res = await advanceActivation(OWNER, b, {}, { type: 'action_started', action: gbpOnly }, gbpOnly, db, NOW);
    expect(res.added).not.toContain('first_value_reached');
  });
});

describe('scenario C: existing activated user', () => {
  it('28. is not reset: lands on Today, sees no first-use copy and fires no new funnel events', async () => {
    const legacy = { onboarding_completed: NOW, first_action_started: NOW, first_action_completed: NOW, first_value_reached: NOW, legacy_flow: true };
    const db = createFakeDb(OWNER, [{ id: 'r1', user_id: OWNER, business_id: BIZ, completed: true, completed_at: NOW, milestones: { ...legacy } }]);
    const stored = await loadMilestones(OWNER, BIZ, db);
    expect(activationStage(stored)).toBe('activated');
    expect(destinationFor('completed', null)).toBe('/hoy');

    const a = action('weekly_post', { sourceType: 'GENERAL_BEST_PRACTICE' });
    await advanceActivation(OWNER, business(), stored, { type: 'action_completed', action: a }, a, db, LATER);
    await advanceActivation(OWNER, business(), stored, { type: 'recommendations_available', count: 3 }, null, db, LATER);
    expect(tracked).toEqual([]);
    expect(db.rows[0]).toMatchObject({ completed: true, completed_at: NOW });
    expect((db.rows[0].milestones as Row).first_value_reached).toBe(NOW);
    expect((db.rows[0].milestones as Row).legacy_flow).toBe(true);
  });
});
