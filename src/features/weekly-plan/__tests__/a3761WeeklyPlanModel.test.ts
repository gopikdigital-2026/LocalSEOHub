import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildActionReport, selectTodayActions } from '../../actions/engine';
import type { BusinessAction } from '../../actions/types';
import { buildWeeklyPlan, scopeActions, selectWeeklyFocus, weekBounds, WEEK_FOCUS_MAX, WEEK_PLAN_MAX, type BuildWeeklyPlanInput } from '../model';
import { WEEKLY_PLAN_COPY } from '../copy';

const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// Wednesday, local time, so the tests do not depend on the runner's time zone.
const NOW = new Date(2026, 2, 11, 10, 0, 0);
const MONDAY = new Date(2026, 2, 9, 0, 0, 0);
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => iso(new Date(NOW.getTime() - n * 86400000));

let seq = 0;
function act(over: Partial<BusinessAction> = {}): BusinessAction {
  seq += 1;
  const id = over.id ?? `a-${String(seq).padStart(3, '0')}`;
  return {
    id, businessId: BIZ, userId: 'u', ruleId: over.ruleId ?? `rule_${id}`, actionType: 'other', category: 'content',
    title: `T ${id}`, description: `D ${id}`, reason: `R ${id}`, sourceType: 'GENERAL_BEST_PRACTICE', sourceReference: '',
    priority: 'MEDIUM', score: 40, impact: 'medium', effortMinutes: 15, status: 'PENDING', dueDate: null,
    metadata: {}, createdAt: daysAgo(20), updatedAt: daysAgo(20), startedAt: null, completedAt: null, dismissedAt: null,
    ...over,
  };
}

const plan = (actions: BusinessAction[], over: Partial<BuildWeeklyPlanInput> = {}) =>
  buildWeeklyPlan({ businessId: BIZ, actions, lang: 'es', access: { hasPremium: true }, now: NOW, ...over });
const ids = (list: { action: BusinessAction }[]) => list.map((i) => i.action.id);

describe('weekly selection and priority', () => {
  it('starts with exactly what Hoy shows and continues in engine order', () => {
    const actions = Array.from({ length: 10 }, (_, i) => act({ score: 90 - i * 5 }));
    actions[6] = { ...actions[6], status: 'IN_PROGRESS' };
    const p = plan(actions);
    const today = selectTodayActions(actions).map((a) => a.id);
    expect(ids(p.focus).slice(0, 3)).toEqual(today);
    expect(ids(p.focus)[0]).toBe(actions[6].id);
    const rest = ids(p.focus).slice(3);
    const scores = rest.map((id) => actions.find((a) => a.id === id)!.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('never shows more than five focus actions and eight in total', () => {
    const p = plan(Array.from({ length: 20 }, (_, i) => act({ score: 100 - i })));
    expect(p.focus).toHaveLength(WEEK_FOCUS_MAX);
    expect(p.focus.length + p.later.length).toBe(WEEK_PLAN_MAX);
    const all = [...ids(p.focus), ...ids(p.later)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the stored priority and explains why, where from and roughly how long', () => {
    const [item] = plan([act({ priority: 'HIGH', reason: 'Porque sí', sourceType: 'GOAL_BASED', effortMinutes: 20 })]).focus;
    expect(item.priority).toBe('HIGH');
    expect(item.why).toBe('Porque sí');
    expect(item.sourceLabel).toBe(WEEKLY_PLAN_COPY.es.sourceLabels.GOAL_BASED);
    expect(item.origin).toBe('user_provided');
    expect(item.effort).toEqual({ minutes: 20, isEstimate: true });
  });

  it('uses the localized copy and falls back to an honest source explanation when no reason is stored', () => {
    const copy = { es: { title: 'Hola', description: 'd', reason: '', value: '' }, en: { title: 'Hello', description: 'd', reason: '', value: '' } };
    const a = act({ metadata: { copy }, reason: '' });
    expect(plan([a], { lang: 'en' }).focus[0].title).toBe('Hello');
    expect(plan([a], { lang: 'en' }).focus[0].why).toBe(WEEKLY_PLAN_COPY.en.sourceWhy.GENERAL_BEST_PRACTICE);
  });

  it('hides effort that is outside the stored range instead of inventing one', () => {
    expect(plan([act({ effortMinutes: 0 })]).focus[0].effort).toBeNull();
    expect(plan([act({ effortMinutes: 9999 })]).focus[0].effort).toBeNull();
  });
});

describe('empty and incomplete businesses, missing connections', () => {
  it('returns an empty plan without progress for a business with no actions', () => {
    const p = plan([]);
    expect(p.focus).toEqual([]);
    expect(p.later).toEqual([]);
    expect(p.progress).toEqual({ done: 0, pending: 0, percent: null, addedThisWeek: 0 });
  });

  it('builds a plan from profile gaps alone and never labels them as verified', () => {
    const p = plan([
      act({ ruleId: 'add_business_contact', sourceType: 'BUSINESS_PROFILE', category: 'profile', score: 60 }),
      act({ ruleId: 'add_business_schedule', sourceType: 'BUSINESS_PROFILE', category: 'profile', score: 55 }),
    ]);
    expect(p.focus).toHaveLength(2);
    expect(p.focus.every((i) => i.origin === 'user_provided')).toBe(true);
  });

  it('still offers something doable when only connection actions rank first (no Google, Facebook or Instagram)', () => {
    const p = plan([
      act({ ruleId: 'connect_google_business_profile', sourceType: 'SOURCE_REQUIRED', score: 95 }),
      act({ ruleId: 'fix_source_connection', sourceType: 'SOURCE_REQUIRED', score: 94 }),
      act({ ruleId: 'connect_website_source', sourceType: 'SOURCE_REQUIRED', score: 93 }),
      act({ ruleId: 'create_weekly_post', sourceType: 'GENERAL_BEST_PRACTICE', score: 30 }),
    ]);
    expect(p.focus.slice(0, 3).some((i) => i.sourceType !== 'SOURCE_REQUIRED')).toBe(true);
    const connect = p.focus.find((i) => i.action.ruleId === 'connect_google_business_profile')!;
    expect(connect.origin).toBe('unavailable');
    expect(connect.canMarkDone).toBe(false);
  });
});

describe('completion, dismissal and automatic closing', () => {
  const week = [
    act({ id: 'exec', status: 'COMPLETED', completedAt: daysAgo(1) }),
    act({ id: 'data', status: 'COMPLETED', completedAt: daysAgo(1), sourceType: 'BUSINESS_PROFILE', metadata: { resolved_by: 'condition_met' } }),
    act({ id: 'dism', status: 'DISMISSED', dismissedAt: daysAgo(1) }),
    act({ id: 'auto', status: 'DISMISSED', dismissedAt: daysAgo(1), metadata: { auto_closed: 'no_longer_applies' } }),
    act({ id: 'open' }),
    act({ id: 'old', status: 'COMPLETED', completedAt: daysAgo(10) }),
  ];

  it('separates executed, resolved by data, dismissed and outdated actions', () => {
    const p = plan(week);
    expect(ids(p.executedThisWeek)).toEqual(['exec']);
    expect(ids(p.resolvedThisWeek)).toEqual(['data']);
    expect(ids(p.dismissedThisWeek)).toEqual(['dism']);
    expect(ids(p.outdatedThisWeek)).toEqual(['auto']);
    expect(p.outdatedThisWeek[0].state).toBe('outdated');
    expect(ids(p.focus)).toEqual(['open']);
  });

  it('counts only executed and data-completed actions as progress; dismissed and outdated are excluded', () => {
    const p = plan(week);
    expect(p.progress).toMatchObject({ done: 2, pending: 1, percent: 67 });
  });

  it('matches the progress shown on Hoy, Plan and Informes', () => {
    const r = buildActionReport(scopeActions(BIZ, week), NOW);
    const p = plan(week);
    expect(p.progress.percent).toBe(r.weeklyProgress);
    expect(p.progress.done).toBe(r.executedThisWeek + r.dataCompletedThisWeek);
  });

  it('never lets data gaps or findings be ticked by hand', () => {
    const p = plan([
      act({ sourceType: 'BUSINESS_PROFILE' }), act({ sourceType: 'VERIFIED_FINDING' }), act({ sourceType: 'SOURCE_REQUIRED' }), act({ sourceType: 'GOAL_BASED' }),
    ]);
    const tickable = p.focus.filter((i) => i.canMarkDone).map((i) => i.sourceType);
    expect(tickable).toEqual(['GOAL_BASED']);
    expect(p.focus.every((i) => i.canDismiss)).toBe(true);
  });

  it('reports actions added mid-week so a falling percentage can be explained', () => {
    const p = plan([act({ status: 'COMPLETED', completedAt: daysAgo(1) }), act({ createdAt: daysAgo(0) }), act()]);
    expect(p.progress).toMatchObject({ done: 1, pending: 2, percent: 33, addedThisWeek: 1 });
  });
});

describe('week boundaries', () => {
  it('uses Monday 00:00 local time as the existing app does', () => {
    const { from, to, key } = weekBounds(NOW);
    expect(from.getTime()).toBe(MONDAY.getTime());
    expect(to.getDay()).toBe(1);
    expect(to.getHours()).toBe(0);
    expect(key).toBe('2026-03-09');
  });

  it('switches week between Sunday 23:59 and Monday 00:00', () => {
    expect(weekBounds(new Date(2026, 2, 15, 23, 59)).key).toBe('2026-03-09');
    expect(weekBounds(new Date(2026, 2, 16, 0, 0)).key).toBe('2026-03-16');
  });

  it('keeps the end on Monday 00:00 across a daylight-saving week', () => {
    const { to } = weekBounds(new Date(2026, 2, 25, 12));
    expect([to.getFullYear(), to.getMonth(), to.getDate(), to.getHours()]).toEqual([2026, 2, 30, 0]);
  });

  it('moves last week’s closures out of this week’s groups when the week changes', () => {
    const done = act({ status: 'COMPLETED', completedAt: iso(new Date(2026, 2, 15, 23, 0)) });
    expect(plan([done], { now: new Date(2026, 2, 15, 23, 59) }).executedThisWeek).toHaveLength(1);
    const next = plan([done], { now: new Date(2026, 2, 16, 0, 1) });
    expect(next.executedThisWeek).toHaveLength(0);
    expect(next.progress.percent).toBeNull();
  });
});

describe('business isolation and duplicates', () => {
  it('ignores actions that belong to another business', () => {
    const p = plan([act({ id: 'mine' }), act({ id: 'theirs', businessId: OTHER, score: 99 }), act({ id: 'theirs2', businessId: OTHER, status: 'COMPLETED', completedAt: daysAgo(1) })]);
    expect(ids(p.focus)).toEqual(['mine']);
    expect(p.progress.done).toBe(0);
  });

  it('shows a rule once even if it arrives twice', () => {
    const p = plan([
      act({ id: 'x1', ruleId: 'create_weekly_post', score: 50 }),
      act({ id: 'x1', ruleId: 'create_weekly_post', score: 50 }),
      act({ id: 'x2', ruleId: 'create_weekly_post', score: 45 }),
    ]);
    expect(ids(p.focus)).toEqual(['x1']);
    expect(p.progress.pending).toBe(1);
  });

  it('keeps the newest copy when the same action arrives twice', () => {
    const p = plan([
      act({ id: 'y', updatedAt: daysAgo(3) }),
      act({ id: 'y', status: 'COMPLETED', completedAt: daysAgo(1), updatedAt: daysAgo(1) }),
    ]);
    expect(p.focus).toHaveLength(0);
    expect(ids(p.executedThisWeek)).toEqual(['y']);
  });
});

describe('subscription restrictions', () => {
  const actions = [act({ sourceType: 'GOAL_BASED' })];
  it.each([[false], [null]])('is read-only when premium is %s', (hasPremium) => {
    const p = plan(actions, { access: { hasPremium } });
    expect(p.readOnly).toBe(true);
    expect(p.focus[0].canMarkDone).toBe(false);
    expect(p.focus[0].canDismiss).toBe(false);
    expect(p.focus).toHaveLength(1);
  });
  it('allows actions only with confirmed premium', () => {
    const p = plan(actions, { access: { hasPremium: true } });
    expect(p.readOnly).toBe(false);
    expect(p.focus[0].canMarkDone).toBe(true);
  });
});

describe('determinism and safety', () => {
  it('returns the same plan regardless of input order', () => {
    const actions = Array.from({ length: 12 }, (_, i) => act({ score: 50 + (i % 4) }));
    const a = plan(actions);
    const b = plan([...actions].reverse());
    expect(ids(a.focus)).toEqual(ids(b.focus));
    expect(ids(a.later)).toEqual(ids(b.later));
    expect(selectWeeklyFocus(scopeActions(BIZ, actions)).focus.map((x) => x.id)).toEqual(ids(a.focus));
  });

  it('does not mutate its input', () => {
    const actions = [act(), act({ status: 'COMPLETED', completedAt: daysAgo(1) })];
    const snapshot = JSON.stringify(actions);
    plan(actions);
    expect(JSON.stringify(actions)).toBe(snapshot);
  });

  it('is pure: no database, publishing, demo, AI or network imports', () => {
    for (const file of ['model.ts', 'copy.ts']) {
      const imports = readFileSync(resolve(__dirname, '..', file), 'utf8').split('\n').filter((l) => /^\s*import\b|from '/.test(l)).join('\n');
      expect(imports).not.toMatch(/supabase|publish|meta-connection|instagram|facebook|demo|repository|lib\//i);
      expect(readFileSync(resolve(__dirname, '..', file), 'utf8')).not.toMatch(/functions\.invoke|fetch\(|localStorage/);
    }
  });
});
