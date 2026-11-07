// @vitest-environment jsdom
import { act as reactAct } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BusinessAction } from '../../actions/types';
import type { ActionsContextValue } from '../../actions/ActionsContext';

const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const env = vi.hoisted(() => ({
  lang: 'es' as 'es' | 'en',
  hasPremium: true as boolean | null,
  business: null as Record<string, unknown> | null,
  businessLoading: false,
  ctx: null as unknown as ActionsContextValue,
  navigate: vi.fn(),
}));

vi.mock('../../business-memory/BusinessContext', () => ({
  useBusiness: () => ({ currentBusiness: env.business, loading: env.businessLoading }),
}));
vi.mock('../../billing/BillingContext', () => ({ useBilling: () => ({ hasPremium: env.hasPremium }) }));
vi.mock('../../billing/BillingNotices', () => ({ PaywallNotice: () => <div data-testid="paywall" /> }));
vi.mock('../../actions/ActionsContext', () => ({ useActions: () => env.ctx }));
vi.mock('../../../lib/i18n', () => ({ useI18n: () => ({ lang: env.lang }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => env.navigate }));

import WeeklyPlanPage from '../WeeklyPlanPage';
import { PremiumRequiredError } from '../../billing/model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Wednesday 11 March 2026, local time.
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

function ctx(over: Partial<ActionsContextValue> = {}): ActionsContextValue {
  return {
    actions: [], loading: false, ready: true, error: null, locked: false, milestones: null, firstSuccess: null,
    clearFirstSuccess: () => {}, recentlyResolved: [], clearRecentlyResolved: () => {},
    ensureFresh: vi.fn(async () => {}), refresh: vi.fn(async () => {}),
    start: vi.fn(async () => {}), complete: vi.fn(async () => {}), dismiss: vi.fn(async () => {}),
    ...over,
  };
}

let root: Root;
let host: HTMLDivElement;

async function render(actions: BusinessAction[], over: Partial<ActionsContextValue> = {}) {
  env.ctx = ctx({ actions, ...over });
  await reactAct(async () => {
    root.render(<MemoryRouter><WeeklyPlanPage /></MemoryRouter>);
  });
}
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const all = (id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];
const text = () => host.textContent ?? '';
const button = (label: string, scope: ParentNode = host) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label);
const click = async (el: Element | undefined | null) => {
  expect(el).toBeTruthy();
  await reactAct(async () => { (el as HTMLElement).click(); });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  seq = 0;
  env.lang = 'es';
  env.hasPremium = true;
  env.businessLoading = false;
  env.business = { id: BIZ, onboarding_completed: true, primary_goal: null };
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

describe('weekly content', () => {
  it('renders title, week, purpose, progress notes and each action’s why, source, priority, effort and state', async () => {
    await render([
      action({ id: 'a-high', priority: 'HIGH', score: 90, reason: 'Porque falta tu horario', sourceType: 'BUSINESS_PROFILE', category: 'data', actionType: 'other' }),
      action({ id: 'a-done', status: 'COMPLETED', completedAt: daysAgo(1) }),
    ]);
    expect(host.querySelector('h1')?.textContent).toBe('Tu plan semanal');
    expect(q('week-range')?.textContent).toBe('Semana del 9 de marzo al 15 de marzo');
    expect(text()).toContain('no resultados de negocio');
    expect(text()).toContain('el porcentaje puede bajar');
    expect(text()).toContain('hora de tu dispositivo');
    const [item] = all('weekly-item');
    expect(item.textContent).toContain('Porque falta tu horario');
    expect(item.querySelector('[data-testid="item-source"]')?.textContent).toBe('Datos de tu negocio');
    expect(item.textContent).toMatch(/Prioridad: \S+/);
    expect(item.querySelector('[data-testid="item-effort"]')?.textContent).toContain('Unos 15 min (estimado)');
    expect(item.querySelector('[data-testid="item-state"]')?.textContent).toBe('Pendiente');
    expect(q('progress-percent')?.textContent).toBe('50%');
    expect(q('progress-count')?.textContent).toBe('1 de 2 tareas cerradas');
  });

  it('hides effort when the stored value is not a valid estimate', async () => {
    await render([action({ effortMinutes: 0 })]);
    expect(q('item-effort')).toBeNull();
  });

  it('labels recommended (open) actions differently from executed ones', async () => {
    await render([action({ status: 'IN_PROGRESS' }), action({ status: 'COMPLETED', completedAt: daysAgo(1) })]);
    expect(all('weekly-item').map((i) => i.getAttribute('data-state'))).toEqual(['in_progress']);
    expect(q('focus-list')?.textContent).toContain('En curso');
    expect(text()).toContain('Hechas por ti');
  });
});

describe('five-action limit and later section', () => {
  it('shows at most five priorities, in rank order, and every other open action behind a collapsed toggle', async () => {
    await render(Array.from({ length: 12 }, (_, i) => action({ score: 95 - i * 5 })));
    const focus = q('focus-list')!.querySelectorAll('[data-testid="weekly-item"]');
    expect(focus).toHaveLength(5);
    expect([...focus].map((f) => f.querySelector('h3')?.textContent)).toEqual(['Title a-001', 'Title a-002', 'Title a-003', 'Title a-004', 'Title a-005']);
    expect(q('later-list')).toBeNull();
    const toggle = button('Para después (7)');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    await click(toggle);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(q('later-list')!.querySelectorAll('[data-testid="weekly-item"]')).toHaveLength(7);
    expect(all('weekly-item')).toHaveLength(12);
  });

  it('has no later section when five or fewer actions exist', async () => {
    await render(Array.from({ length: 5 }, () => action()));
    expect(text()).not.toContain('Para después');
  });
});

describe('empty, loading and error states', () => {
  it('shows loading while the business or first sync is pending', async () => {
    env.businessLoading = true;
    await render([]);
    expect(text()).toContain('Cargando tu semana');
    env.businessLoading = false;
    await render([], { ready: false });
    expect(text()).toContain('Cargando tu semana');
  });

  it('asks to complete the profile when it is incomplete and there are no actions', async () => {
    env.business = { id: BIZ, onboarding_completed: false, primary_goal: null };
    await render([]);
    expect(text()).toContain('Aún no tienes tareas');
    await click(button('Completar datos'));
    expect(env.navigate).toHaveBeenCalledWith('/negocio');
  });

  it('keeps showing actions with a hint when the profile is incomplete', async () => {
    env.business = { id: BIZ, onboarding_completed: false, primary_goal: null };
    await render([action()]);
    expect(q('incomplete-profile')).toBeTruthy();
    expect(all('weekly-item')).toHaveLength(1);
  });

  it('shows no percentage when there is nothing to count', async () => {
    await render([action({ status: 'DISMISSED', dismissedAt: daysAgo(1) })]);
    expect(q('progress-percent')).toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(q('progress-empty')).toBeTruthy();
    expect(q('focus-empty')).toBeTruthy();
  });

  it('handles a business with no actions at all', async () => {
    await render([]);
    expect(q('focus-empty')).toBeTruthy();
    expect(q('activity-empty')).toBeTruthy();
    expect(q('progress-empty')).toBeTruthy();
  });

  it('shows a retry when loading fails', async () => {
    await render([], { error: 'boom' });
    expect(text()).toContain('No hemos podido cargar tu semana');
    await click(button('Reintentar'));
    expect(env.ctx.refresh).toHaveBeenCalled();
  });

  it('points to sources when an action needs a missing connection, without showing platform data', async () => {
    await render([action({ sourceType: 'SOURCE_REQUIRED', ruleId: 'connect_gbp', score: 80 })]);
    expect(q('missing-sources')?.textContent).toContain('Algunas fuentes de datos todavía no están disponibles');
    expect(q('item-source')?.textContent).toBe('Fuente sin conectar');
    await click(button('Ver fuentes'));
    expect(env.navigate).toHaveBeenCalledWith('/fuentes');
  });

  it('shows no connection notice when every action is doable without integrations', async () => {
    await render([action()]);
    expect(q('missing-sources')).toBeNull();
  });
});

describe('localization', () => {
  it('renders English', async () => {
    env.lang = 'en';
    await render([action({ status: 'COMPLETED', completedAt: daysAgo(1) }), action()]);
    expect(host.querySelector('h1')?.textContent).toBe('Your weekly plan');
    expect(q('week-range')?.textContent).toBe('Week of 9 March to 15 March');
    expect(text()).toContain('not business results');
    expect(q('item-effort')?.textContent).toContain('About 15 min (estimate)');
    expect(button('Mark as done')).toBeTruthy();
    expect(text()).not.toContain('Tu plan semanal');
  });
});

describe('subscription restrictions', () => {
  it.each([false, null])('hides completion and dismissal when premium is %s', async (premium) => {
    env.hasPremium = premium;
    await render([action()], { locked: premium === false });
    expect(button('Marcar como hecha')).toBeUndefined();
    expect(button('Descartar')).toBeUndefined();
    expect(Boolean(q('read-only-note'))).toBe(premium === false);
    expect(Boolean(q('paywall'))).toBe(premium === false);
  });

  it('lets a read-only user view an action without starting it', async () => {
    env.hasPremium = false;
    await render([action({ actionType: 'other' })], { locked: true });
    await click(button('Ver'));
    expect(env.ctx.start).not.toHaveBeenCalled();
    expect(env.navigate).toHaveBeenCalledTimes(1);
  });
});

describe('completion and dismissal controls', () => {
  it('completes through the existing provider', async () => {
    const a = action();
    await render([a]);
    await click(button('Marcar como hecha'));
    expect(env.ctx.complete).toHaveBeenCalledWith(a);
    expect(env.ctx.complete).toHaveBeenCalledTimes(1);
  });

  it('dismisses through the existing provider', async () => {
    const a = action();
    await render([a]);
    await click(button('Descartar'));
    expect(env.ctx.dismiss).toHaveBeenCalledWith(a);
  });

  it('starts a pending action before opening it', async () => {
    const a = action();
    await render([a]);
    await click(q('weekly-item')!.querySelector('button.bg-v2-primary-600'));
    expect(env.ctx.start).toHaveBeenCalledWith(a);
    expect(env.navigate).toHaveBeenCalledTimes(1);
  });

  it('offers no manual completion for actions that close on their own', async () => {
    await render([action({ sourceType: 'BUSINESS_PROFILE' })]);
    expect(button('Marcar como hecha')).toBeUndefined();
    expect(text()).toContain('Se cierra sola');
    expect(button('Descartar')).toBeTruthy();
  });

  it('disables the controls while an update is in flight, so a double click cannot send twice', async () => {
    let finish!: () => void;
    const complete = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    await render([action()], { complete });
    const btn = button('Marcar como hecha')!;
    await click(btn);
    expect(btn.disabled).toBe(true);
    await click(btn);
    expect(complete).toHaveBeenCalledTimes(1);
    await reactAct(async () => { finish(); });
    expect(btn.disabled).toBe(false);
  });
});

describe('weekly activity', () => {
  it('separates manual completion, automatic resolution, dismissal and outdated, and counts only the first two', async () => {
    await render([
      action({ id: 'done', status: 'COMPLETED', completedAt: daysAgo(1) }),
      action({ id: 'auto', status: 'COMPLETED', completedAt: daysAgo(1), metadata: { resolved_by: 'condition_met' } }),
      action({ id: 'dis', status: 'DISMISSED', dismissedAt: daysAgo(1) }),
      action({ id: 'old', status: 'DISMISSED', dismissedAt: daysAgo(1), metadata: { auto_closed: 'no_longer_applies' } }),
      action({ id: 'open' }),
    ]);
    const groups = all('activity-group').map((g) => [g.querySelector('h3')?.textContent, [...g.querySelectorAll('li')].map((l) => l.getAttribute('data-state'))]);
    expect(groups).toEqual([
      ['Hechas por ti (1)', ['executed']],
      ['Resueltas al actualizar tus datos (1)', ['data_completed']],
      ['Descartadas por ti (1)· No cuentan en el progreso', ['dismissed']],
      ['Ya no aplican (1)· No cuentan en el progreso', ['outdated']],
    ]);
    expect(q('progress-count')?.textContent).toBe('2 de 3 tareas cerradas');
    expect(q('progress-percent')?.textContent).toBe('67%');
  });

  it('explains new tasks that appeared this week', async () => {
    await render([action({ createdAt: daysAgo(1) }), action({ createdAt: daysAgo(1) })]);
    expect(q('added-note')?.textContent).toBe('Esta semana han aparecido 2 tareas nuevas.');
  });
});

describe('error handling on updates', () => {
  it('shows a retryable message when completion fails and keeps the action pending', async () => {
    await render([action()], { complete: vi.fn(async () => { throw new Error('network'); }) });
    await click(button('Marcar como hecha'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Sigue pendiente');
    expect(q('item-state')?.textContent).toBe('Pendiente');
    await click(button('Cerrar'));
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the subscription message when the server refuses for premium reasons', async () => {
    await render([action()], { dismiss: vi.fn(async () => { throw new PremiumRequiredError(); }) });
    await click(button('Descartar'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('prueba activa o una suscripción');
  });

  it('does not navigate when starting an action fails', async () => {
    await render([action()], { start: vi.fn(async () => { throw new Error('x'); }) });
    await click(q('weekly-item')!.querySelector('button.bg-v2-primary-600'));
    expect(env.navigate).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No hemos podido empezar');
  });
});

describe('business isolation', () => {
  it('never renders actions or activity belonging to another business', async () => {
    await render([
      action({ id: 'mine', title: 'Mine' }),
      action({ id: 'theirs', businessId: OTHER, title: 'Theirs', score: 99 }),
      action({ id: 'theirs-done', businessId: OTHER, title: 'Theirs done', status: 'COMPLETED', completedAt: daysAgo(1) }),
    ]);
    expect(text()).toContain('Mine');
    expect(text()).not.toContain('Theirs');
    expect(q('progress-percent')?.textContent).toBe('0%');
    expect(q('progress-count')?.textContent).toBe('0 de 1 tareas cerradas');
    expect(q('activity-empty')).toBeTruthy();
  });

  it('shows the no-business state rather than any actions when no business is selected', async () => {
    env.business = null;
    await render([action()]);
    expect(all('weekly-item')).toHaveLength(0);
    expect(text()).toContain('Aún no hay ningún negocio');
  });
});

describe('mobile-compatible structure and accessibility', () => {
  it('uses one heading level 1, labelled sections, stacked-then-row controls and no fixed widths', async () => {
    await render(Array.from({ length: 7 }, () => action()));
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelectorAll('section[aria-labelledby]').length).toBeGreaterThanOrEqual(3);
    const controls = q('weekly-item')!.querySelector('button')!.parentElement!;
    expect(controls.className).toContain('flex-col');
    expect(controls.className).toContain('sm:flex-row');
    expect(host.innerHTML).not.toMatch(/\bw-\[\d+px\]|min-w-\[\d+px\]/);
    expect(all('weekly-item').every((i) => i.getAttribute('aria-labelledby'))).toBe(true);
  });

  it('exposes progress as an accessible progress bar when meaningful', async () => {
    await render([action(), action({ status: 'COMPLETED', completedAt: daysAgo(1) })]);
    const bar = host.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
  });
});

describe('static safety', () => {
  const files = ['WeeklyPlanPage.tsx', 'WeeklyPlanItemCard.tsx', 'pageCopy.ts'];
  it('has no publishing, Meta, social, demo or direct database dependencies', () => {
    for (const file of files) {
      const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
      const imports = src.split('\n').filter((l) => /^\s*import\b|from '/.test(l)).join('\n');
      expect(imports).not.toMatch(/supabase|publish|meta-connection|instagram|facebook|social|demo|repository|reality-engine/i);
      expect(src).not.toMatch(/functions\.invoke|fetch\(|localStorage|\.from\('/);
    }
  });

  // A3.7.6.3 AUTHORIZED CHANGE: the page is now mounted, but only through the single /semana route.
  it('is mounted only through the /semana route, never from the navigation shell', () => {
    const app = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');
    const shell = readFileSync(resolve(__dirname, '../../../app-v2/layouts/AppShellV2.tsx'), 'utf8');
    expect(app.match(/WeeklyPlanPage/g)).toHaveLength(3);
    expect(app).toContain('<Route path="/semana" element={<WeeklyPlanPage />} />');
    expect(shell).not.toContain('WeeklyPlanPage');
  });
});
