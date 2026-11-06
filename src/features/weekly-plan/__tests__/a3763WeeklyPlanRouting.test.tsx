// @vitest-environment jsdom
import { act as reactAct } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BusinessAction } from '../../actions/types';
import type { ActionsContextValue } from '../../actions/ActionsContext';

const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const env = vi.hoisted(() => ({
  lang: 'es' as 'es' | 'en',
  status: 'completed' as string,
  authenticated: true,
  hasPremium: true as boolean | null,
  business: null as Record<string, unknown> | null,
  ctx: null as unknown,
  track: vi.fn(),
  location: { pathname: '', search: '', hash: '' },
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: { signOut: async () => ({}), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
}));
vi.mock('../../../hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => ({ status: env.status, authenticated: env.authenticated }),
}));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { email: 'owner@example.com' } }, signOut: async () => {} }),
}));
vi.mock('../../../services/analytics/v2Analytics', () => ({ trackNavigationClick: env.track }));
vi.mock('../../../features/user-identity/UserIdentity', () => ({ default: () => <span /> }));
vi.mock('../../../features/actions/ResolvedActionsNotice', () => ({ default: () => null }));
vi.mock('../../billing/BillingNotices', () => ({
  TrialBanner: () => null,
  PaywallNotice: () => <div data-testid="paywall" />,
}));
vi.mock('../../business-memory/BusinessContext', () => ({
  useBusiness: () => ({ currentBusiness: env.business, loading: false }),
}));
vi.mock('../../billing/BillingContext', () => ({ useBilling: () => ({ hasPremium: env.hasPremium }) }));
vi.mock('../../actions/ActionsContext', () => ({ useActions: () => env.ctx }));
vi.mock('../../../lib/i18n', () => ({ useI18n: () => ({ lang: env.lang }) }));
vi.mock('../../../app-v2/routes/TodayPage', () => ({ default: () => <h1>Hoy page</h1> }));
vi.mock('../../../app-v2/routes/PlanPage', () => ({ default: () => <h1>OLD PLAN PAGE</h1> }));
vi.mock('../../../features/execution/ExecutionPage', () => ({ default: () => <h1>Execution page</h1> }));
vi.mock('../../../features/tools/ToolsPage', () => ({ default: () => <h1>Tools page</h1> }));
vi.mock('../../../components/LoginModal', () => ({ default: () => <h1>Login</h1> }));
vi.mock('../../../features/first-value/FirstValueFlow', () => ({ default: () => <h1>Onboarding</h1> }));

import App from '../../../App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 2, 11, 10, 0, 0);

function action(over: Partial<BusinessAction> = {}): BusinessAction {
  return {
    id: 'a-001', businessId: BIZ, userId: 'u', ruleId: 'rule_a', actionType: 'other', category: 'content',
    title: 'Title A', description: 'Desc A', reason: 'Reason A', sourceType: 'GENERAL_BEST_PRACTICE', sourceReference: '',
    priority: 'HIGH', score: 80, impact: 'medium', effortMinutes: 15, status: 'IN_PROGRESS', dueDate: null,
    metadata: {}, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), startedAt: null, completedAt: null, dismissedAt: null,
    ...over,
  };
}

function ctx(actions: BusinessAction[]): ActionsContextValue {
  return {
    actions, loading: false, ready: true, error: null, locked: false, milestones: null, firstSuccess: null,
    clearFirstSuccess: () => {}, recentlyResolved: [], clearRecentlyResolved: () => {},
    ensureFresh: vi.fn(async () => {}), refresh: vi.fn(async () => {}),
    start: vi.fn(async () => {}), complete: vi.fn(async () => {}), dismiss: vi.fn(async () => {}),
  };
}

function Probe() {
  const l = useLocation();
  env.location = { pathname: l.pathname, search: l.search, hash: l.hash };
  return null;
}

let root: Root;
let host: HTMLDivElement;

async function settle() {
  for (let i = 0; i < 40; i += 1) {
    await reactAct(async () => { await new Promise((r) => setTimeout(r, 5)); });
  }
}

async function open(path: string, actions: BusinessAction[] = [action()]) {
  env.ctx = ctx(actions);
  await reactAct(async () => {
    root.render(<MemoryRouter initialEntries={[path]}><App /><Probe /></MemoryRouter>);
  });
  await settle();
}

const text = () => host.textContent ?? '';
const navLinks = (label: string) => [...host.querySelectorAll('a')].filter((a) => a.textContent?.trim() === label);
const sidebar = () => host.querySelector('aside nav') as HTMLElement;
const bottomBar = () => host.querySelector('nav[aria-label="Navegacion principal"]') as HTMLElement;
const drawer = () => host.querySelector('[role="dialog"] nav') as HTMLElement;

beforeAll(async () => {
  await Promise.all([import('../WeeklyPlanPage'), import('../../../app-v2/routes/TodayPage'), import('../../../features/execution/ExecutionPage'), import('../../../features/tools/ToolsPage'), import('../../../components/LoginModal'), import('../../../features/first-value/FirstValueFlow')]);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  env.lang = 'es';
  env.status = 'completed';
  env.authenticated = true;
  env.hasPremium = true;
  env.business = { id: BIZ, onboarding_completed: true, primary_goal: null };
  env.track.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  reactAct(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('/semana route', () => {
  it('renders Tu Semana inside the app shell for a signed-in, onboarded owner', async () => {
    await open('/semana');
    expect(env.location.pathname).toBe('/semana');
    expect(host.querySelector('h1')?.textContent).toBe('Tu plan semanal');
    expect(host.querySelector('aside')).toBeTruthy();
    expect(text()).toContain('Title A');
    expect(text()).not.toContain('OLD PLAN PAGE');
  });

  it('sends signed-out visitors to login with /semana as the return path', async () => {
    env.authenticated = false;
    await open('/semana');
    expect(env.location.pathname).toBe('/login');
    expect(env.location.search).toBe(`?next=${encodeURIComponent('/semana')}`);
    expect(text()).not.toContain('Tu plan semanal');
  });

  it('sends owners who have not finished onboarding to /empezar', async () => {
    env.status = 'in_progress';
    await open('/semana');
    expect(env.location.pathname).toBe('/empezar');
    expect(text()).not.toContain('Tu plan semanal');
  });
});

describe('/plan redirect', () => {
  it('redirects /plan to /semana and lands on Tu Semana without looping', async () => {
    await open('/plan');
    expect(env.location.pathname).toBe('/semana');
    expect(host.querySelector('h1')?.textContent).toBe('Tu plan semanal');
    expect(text()).not.toContain('OLD PLAN PAGE');
  });

  it('keeps the query string and hash', async () => {
    await open('/plan?origen=email#acciones');
    expect(env.location).toEqual({ pathname: '/semana', search: '?origen=email', hash: '#acciones' });
  });

  it('still asks signed-out visitors to log in first, returning to /plan (which then redirects)', async () => {
    env.authenticated = false;
    await open('/plan?origen=email');
    expect(env.location.pathname).toBe('/login');
    expect(env.location.search).toBe(`?next=${encodeURIComponent('/plan?origen=email')}`);
  });
});

describe('navigation', () => {
  it('shows "Tu Semana" in Spanish in the sidebar, drawer and bottom bar, pointing to /semana', async () => {
    await open('/hoy');
    for (const nav of [sidebar(), drawer(), bottomBar()]) {
      const link = [...nav.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Tu Semana');
      expect(link?.getAttribute('href')).toBe('/semana');
    }
    expect(navLinks('Plan')).toHaveLength(0);
  });

  it('shows "Your Week" in English', async () => {
    env.lang = 'en';
    await open('/hoy');
    expect(navLinks('Your Week')).toHaveLength(3);
    expect(navLinks('Tu Semana')).toHaveLength(0);
  });

  it('highlights the entry as active on /semana and after the /plan redirect, on desktop and mobile', async () => {
    for (const path of ['/semana', '/plan']) {
      await open(path);
      for (const nav of [sidebar(), drawer(), bottomBar()]) {
        const active = [...nav.querySelectorAll('a[aria-current="page"]')].map((a) => a.textContent?.trim());
        expect(active).toEqual(['Tu Semana']);
      }
    }
  });

  it('is not active on other pages', async () => {
    await open('/hoy');
    const active = [...sidebar().querySelectorAll('a[aria-current="page"]')].map((a) => a.textContent?.trim());
    expect(active).toEqual(['Hoy']);
  });

  it('keeps the five-item mobile bottom bar in the same order', async () => {
    await open('/semana');
    const labels = [...bottomBar().querySelectorAll('a')].map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Hoy', 'Tu Semana', 'Resumen', 'Mi negocio', 'Fuentes']);
  });

  it('keeps the existing analytics identifier "plan" on click', async () => {
    await open('/hoy');
    const link = [...sidebar().querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Tu Semana');
    await reactAct(async () => { link!.click(); });
    await settle();
    expect(env.track).toHaveBeenCalledWith('plan');
    expect(env.location.pathname).toBe('/semana');
  });

  it('has exactly one weekly-plan entry in the menu', () => {
    const shell = readFileSync(resolve(__dirname, '../../../app-v2/layouts/AppShellV2.tsx'), 'utf8');
    expect(shell.match(/id: 'plan'/g)).toHaveLength(1);
    expect(shell).not.toMatch(/path: '\/plan'/);
    expect(shell.match(/path: '\/semana'/g)).toHaveLength(1);
  });
});

describe('business, subscription and action routes', () => {
  it('uses the current business and shows the read-only state without a subscription', async () => {
    env.hasPremium = false;
    await open('/semana');
    expect(host.querySelector('[data-testid="read-only-note"]')).toBeTruthy();
    expect([...host.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Marcar como hecha')).toBe(false);
  });

  it('shows the no-business state when no business is selected', async () => {
    env.business = null;
    await open('/semana');
    expect(text()).toContain('Aún no hay ningún negocio');
    expect(text()).not.toContain('Title A');
  });

  it('opens the existing execution route from an action', async () => {
    await open('/semana');
    const cta = host.querySelector('[data-testid="weekly-item"] button') as HTMLButtonElement;
    await reactAct(async () => { cta.click(); });
    await settle();
    expect(env.location.pathname).toBe('/ejecutar/a-001');
    expect(text()).toContain('Execution page');
  });

  it('follows an action’s own in-app destination when it has one', async () => {
    await open('/semana', [action({ metadata: { cta_to: '/herramientas' } })]);
    const cta = host.querySelector('[data-testid="weekly-item"] button') as HTMLButtonElement;
    await reactAct(async () => { cta.click(); });
    await settle();
    expect(env.location.pathname).toBe('/herramientas');
  });
});

describe('no regressions and no duplicates', () => {
  const app = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');

  it('keeps every other customer route and renders /hoy as before', async () => {
    const shellBlock = app.slice(app.indexOf('<Route element={<AppGuard><AppShellV2 /></AppGuard>}>'), app.indexOf('{/* ── OAuth callbacks'));
    for (const p of ['/hoy', '/herramientas', '/informes', '/negocio', '/negocio/objetivos', '/negocio/memoria', '/fuentes', '/facturacion', '/herramientas/social']) {
      expect(shellBlock).toContain(`path="${p}"`);
    }
    await open('/hoy');
    expect(text()).toContain('Hoy page');
  });

  it('mounts a single weekly-plan screen; the old Plan page is no longer routed', () => {
    expect(app).not.toMatch(/\bPlanPage\b/);
    expect(app).not.toContain("import('./app-v2/routes/PlanPage')");
    expect(app.match(/element=\{<WeeklyPlanPage \/>\}/g)).toHaveLength(1);
    expect(app).toContain('<Route path="/plan" element={<LegacyPlanRedirect />} />');
  });

  it('the redirect is plain client navigation with no data, publishing or demo dependencies', () => {
    const fn = app.slice(app.indexOf('function LegacyPlanRedirect'), app.indexOf('// ─── App'));
    expect(fn).toContain("pathname: '/semana'");
    expect(fn).not.toMatch(/supabase|publish|demo|fetch|invoke/i);
    const shell = readFileSync(resolve(__dirname, '../../../app-v2/layouts/AppShellV2.tsx'), 'utf8');
    expect(shell).not.toMatch(/supabase|publish|instagram|facebook|demo/i);
  });
});
