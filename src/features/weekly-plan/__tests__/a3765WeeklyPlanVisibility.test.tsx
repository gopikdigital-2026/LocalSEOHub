// @vitest-environment jsdom
import { act as reactAct } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessAction } from '../../actions/types';
import type { ActionsContextValue } from '../../actions/ActionsContext';

const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const env = vi.hoisted(() => ({
  lang: 'es' as 'es' | 'en',
  hasPremium: true as boolean | null,
  ctx: null as unknown as ActionsContextValue,
  navigate: vi.fn(),
}));

vi.mock('../../business-memory/BusinessContext', () => ({
  useBusiness: () => ({ currentBusiness: { id: BIZ, onboarding_completed: true, primary_goal: null }, loading: false }),
}));
vi.mock('../../billing/BillingContext', () => ({ useBilling: () => ({ hasPremium: env.hasPremium }) }));
vi.mock('../../billing/BillingNotices', () => ({ PaywallNotice: () => <div data-testid="paywall" /> }));
vi.mock('../../actions/ActionsContext', () => ({ useActions: () => env.ctx }));
vi.mock('../../../lib/i18n', () => ({ useI18n: () => ({ lang: env.lang }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => env.navigate }));

import WeeklyPlanPage from '../WeeklyPlanPage';
import { buildWeeklyPlan, WEEK_FOCUS_MAX } from '../model';
import { openActions, selectTodayActions } from '../../actions/engine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 2, 11, 10, 0, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

let seq = 0;
function action(over: Partial<BusinessAction> = {}): BusinessAction {
  seq += 1;
  const id = over.id ?? `a-${String(seq).padStart(3, '0')}`;
  return {
    id, businessId: BIZ, userId: 'u', ruleId: over.ruleId ?? `rule_${id}`, actionType: 'other', category: 'content',
    title: `Title ${id}`, description: `Desc ${id}`, reason: `Reason ${id}`, sourceType: 'GENERAL_BEST_PRACTICE', sourceReference: '',
    priority: 'MEDIUM', score: 40, impact: 'medium', effortMinutes: 15, status: 'PENDING', dueDate: null,
    metadata: {}, createdAt: daysAgo(20), updatedAt: daysAgo(20), startedAt: null, completedAt: null, dismissedAt: null,
    ...over,
  };
}
const many = (n: number) => Array.from({ length: n }, (_, i) => action({ score: 95 - i * 3, priority: i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MEDIUM' : 'LOW' }));
const plan = (actions: BusinessAction[], hasPremium = true) =>
  buildWeeklyPlan({ businessId: BIZ, actions, lang: 'es', access: { hasPremium }, now: NOW });
const ids = (list: { action: BusinessAction }[]) => list.map((i) => i.action.id);

let root: Root;
let host: HTMLDivElement;

async function render(actions: BusinessAction[]) {
  env.ctx = {
    actions, loading: false, ready: true, error: null, locked: env.hasPremium === false, milestones: null, firstSuccess: null,
    clearFirstSuccess: () => {}, recentlyResolved: [], clearRecentlyResolved: () => {},
    ensureFresh: vi.fn(async () => {}), refresh: vi.fn(async () => {}),
    start: vi.fn(async () => {}), complete: vi.fn(async () => {}), dismiss: vi.fn(async () => {}),
  };
  await reactAct(async () => { root.render(<MemoryRouter><WeeklyPlanPage /></MemoryRouter>); });
}
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const items = () => [...host.querySelectorAll('[data-testid="weekly-item"]')].map((el) => el.querySelector('h3')?.textContent);
const buttons = (label: string) => [...host.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label);
const laterToggle = () => host.querySelector<HTMLButtonElement>('button[aria-controls="weekly-later-list"]');
const openLater = async () => {
  const t = laterToggle();
  if (t) await reactAct(async () => { t.click(); });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  seq = 0;
  env.lang = 'es';
  env.hasPremium = true;
  env.navigate.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  reactAct(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('every open action is reachable (model)', () => {
  it.each([0, 3, 5, 8, 12, 20])('with %i open actions, focus + later contain each exactly once', (n) => {
    const actions = many(n);
    const p = plan(actions);
    const shown = [...ids(p.focus), ...ids(p.later)];
    expect(shown).toHaveLength(n);
    expect(new Set(shown).size).toBe(n);
    expect(new Set(shown)).toEqual(new Set(actions.map((a) => a.id)));
    expect(p.focus).toHaveLength(Math.min(n, WEEK_FOCUS_MAX));
    expect(p.later).toHaveLength(Math.max(0, n - WEEK_FOCUS_MAX));
  });

  it.each([8, 12, 20])('keeps Today-first selection and engine priority order with %i actions', (n) => {
    const actions = many(n);
    actions[n - 1] = { ...actions[n - 1], status: 'IN_PROGRESS' };
    const p = plan(actions);
    const today = selectTodayActions(actions).map((a) => a.id);
    expect(ids(p.focus).slice(0, today.length)).toEqual(today);
    const rest = openActions(actions).map((a) => a.id).filter((id) => !today.includes(id));
    expect([...ids(p.focus).slice(today.length), ...ids(p.later)]).toEqual(rest);
  });

  it('is deterministic for the same input', () => {
    const actions = many(20);
    expect(ids(plan(actions).later)).toEqual(ids(plan([...actions].reverse()).later));
  });

  it('never exposes another business’s actions, however many there are', () => {
    const mine = many(10);
    const theirs = Array.from({ length: 15 }, (_, i) => action({ businessId: OTHER, score: 99 - i }));
    const p = plan([...theirs, ...mine]);
    const shown = [...p.focus, ...p.later].map((i) => i.action);
    expect(shown).toHaveLength(10);
    expect(shown.every((a) => a.businessId === BIZ)).toBe(true);
  });

  it('does not list closed actions as open, and keeps their classifications', () => {
    const actions = [
      ...many(12),
      action({ status: 'COMPLETED', completedAt: daysAgo(1), metadata: {} }),
      action({ status: 'COMPLETED', completedAt: daysAgo(1), metadata: { auto_completed: true } }),
      action({ status: 'DISMISSED', dismissedAt: daysAgo(1) }),
      action({ status: 'DISMISSED', dismissedAt: daysAgo(1), metadata: { auto_closed: true } }),
    ];
    const p = plan(actions);
    expect([...p.focus, ...p.later]).toHaveLength(12);
    expect([...p.focus, ...p.later].every((i) => i.state === 'pending' || i.state === 'in_progress')).toBe(true);
    const closed = [...p.executedThisWeek, ...p.resolvedThisWeek, ...p.dismissedThisWeek, ...p.outdatedThisWeek];
    expect(closed).toHaveLength(4);
    expect(p.dismissedThisWeek.map((i) => i.state)).toEqual(['dismissed']);
    expect(p.outdatedThisWeek.map((i) => i.state)).toEqual(['outdated']);
  });

  it('does not change progress when more actions become visible', () => {
    const actions = [...many(20), action({ status: 'COMPLETED', completedAt: daysAgo(1) })];
    const p = plan(actions);
    expect(p.progress.pending).toBe(20);
    expect(p.progress.done).toBe(1);
  });

  it('read-only accounts get every action without mutation rights', () => {
    const p = plan(many(12), false);
    expect([...p.focus, ...p.later]).toHaveLength(12);
    expect([...p.focus, ...p.later].some((i) => i.canMarkDone || i.canDismiss)).toBe(false);
    expect(p.readOnly).toBe(true);
  });
});

describe('every open action is reachable (page)', () => {
  it.each([0, 3, 5, 8, 12, 20])('renders all %i open actions once the later section is expanded', async (n) => {
    await render(many(n));
    expect(q('later-list')).toBeNull();
    await openLater();
    const shown = items();
    expect(shown).toHaveLength(n);
    expect(new Set(shown).size).toBe(n);
  });

  it.each([0, 3, 5])('shows no later section with %i actions', async (n) => {
    await render(many(n));
    expect(laterToggle()).toBeNull();
    expect(host.textContent).not.toContain('Para después');
  });

  it('starts collapsed and counts the hidden actions in Spanish', async () => {
    await render(many(20));
    const t = laterToggle()!;
    expect(t.textContent?.trim()).toBe('Para después (15)');
    expect(t.getAttribute('aria-expanded')).toBe('false');
  });

  it('counts the hidden actions in English', async () => {
    env.lang = 'en';
    await render(many(12));
    expect(laterToggle()!.textContent?.trim()).toBe('For later (7)');
  });

  it('offers working controls on an action beyond the old eighth position', async () => {
    const actions = many(12);
    await render(actions);
    await openLater();
    const later = q('later-list')!;
    const twelfth = [...later.querySelectorAll('[data-testid="weekly-item"]')].pop()!;
    const done = [...twelfth.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Marcar como hecha')!;
    await reactAct(async () => { done.click(); });
    expect(env.ctx.complete).toHaveBeenCalledTimes(1);
    const target = (env.ctx.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as BusinessAction;
    expect(twelfth.querySelector('h3')?.textContent).toBe(target.title);
    const dismiss = [...twelfth.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Descartar')!;
    await reactAct(async () => { dismiss.click(); });
    expect(env.ctx.dismiss).toHaveBeenCalledWith(target);
  });

  it('read-only accounts can see all twelve actions but cannot change them', async () => {
    env.hasPremium = false;
    await render(many(12));
    await openLater();
    expect(items()).toHaveLength(12);
    expect(buttons('Marcar como hecha')).toHaveLength(0);
    expect(buttons('Descartar')).toHaveLength(0);
    expect(q('read-only-note')).toBeTruthy();
  });
});
