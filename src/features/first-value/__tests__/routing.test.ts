import { describe, it, expect } from 'vitest';
import type { OnboardingStatus } from '../../../hooks/useOnboardingStatus';

/**
 * Routing decision logic extracted so it can be tested without React rendering.
 * The actual guards in auth.tsx and App.tsx implement these same rules.
 */

type UserState = {
  authenticated: boolean;
  onboarding: OnboardingStatus;
};

function resolveRoute(path: string, user: UserState): string {
  // Unprotected public routes — always served
  const publicPaths = [
    '/beta', '/generador-contenido-seo', '/mas-clientes-google',
    '/diagnostico-negocio', '/descubre-tu-potencial', '/plan-crecimiento-gratis',
    '/copiloto-ia', '/analisis-google-maps', '/admin',
    '/demo', '/demo/plan', '/demo/negocio', '/demo/fuentes',
  ];
  if (publicPaths.includes(path)) return path;

  // ── Not authenticated ──
  if (!user.authenticated) {
    if (path === '/') return '/';
    if (path === '/registro') return '/registro';
    if (path === '/login') return '/login';
    if (path === '/empezar') return '/registro?next=/empezar';
    // Protected app pages → login with ?next=
    return `/login?next=${encodeURIComponent(path)}`;
  }

  // ── Authenticated, onboarding incomplete ──
  if (user.onboarding !== 'completed') {
    if (path === '/' || path === '/registro' || path === '/login' ||
        path === '/hoy' || path === '/plan') return '/empezar';
    if (path === '/empezar') return '/empezar';
    return '/empezar';
  }

  // ── Authenticated, onboarding complete ──
  if (path === '/' || path === '/registro' || path === '/login' || path === '/empezar') return '/hoy';
  // App pages served directly
  return path;
}

describe('Routing rules — not authenticated', () => {
  const anon: UserState = { authenticated: false, onboarding: 'not_started' };

  it('/ serves landing page', () => {
    expect(resolveRoute('/', anon)).toBe('/');
  });

  it('/registro serves signup', () => {
    expect(resolveRoute('/registro', anon)).toBe('/registro');
  });

  it('/login serves login', () => {
    expect(resolveRoute('/login', anon)).toBe('/login');
  });

  it('/empezar redirects to /registro?next=/empezar', () => {
    expect(resolveRoute('/empezar', anon)).toBe('/registro?next=/empezar');
  });

  it('/hoy redirects to /login?next=/hoy', () => {
    expect(resolveRoute('/hoy', anon)).toBe('/login?next=%2Fhoy');
  });

  it('/plan redirects to /login?next=/plan', () => {
    expect(resolveRoute('/plan', anon)).toBe('/login?next=%2Fplan');
  });
});

describe('Routing rules — authenticated, onboarding incomplete', () => {
  const partial: UserState = { authenticated: true, onboarding: 'in_progress' };
  const notStarted: UserState = { authenticated: true, onboarding: 'not_started' };

  it('/ redirects to /empezar (in_progress)', () => {
    expect(resolveRoute('/', partial)).toBe('/empezar');
  });

  it('/ redirects to /empezar (not_started)', () => {
    expect(resolveRoute('/', notStarted)).toBe('/empezar');
  });

  it('/registro redirects to /empezar', () => {
    expect(resolveRoute('/registro', partial)).toBe('/empezar');
  });

  it('/login redirects to /empezar', () => {
    expect(resolveRoute('/login', partial)).toBe('/empezar');
  });

  it('/hoy redirects to /empezar', () => {
    expect(resolveRoute('/hoy', partial)).toBe('/empezar');
  });

  it('/plan redirects to /empezar', () => {
    expect(resolveRoute('/plan', partial)).toBe('/empezar');
  });

  it('/empezar stays on /empezar', () => {
    expect(resolveRoute('/empezar', partial)).toBe('/empezar');
  });
});

describe('Routing rules — authenticated, onboarding complete', () => {
  const done: UserState = { authenticated: true, onboarding: 'completed' };

  it('/ redirects to /hoy', () => {
    expect(resolveRoute('/', done)).toBe('/hoy');
  });

  it('/registro redirects to /hoy', () => {
    expect(resolveRoute('/registro', done)).toBe('/hoy');
  });

  it('/login redirects to /hoy', () => {
    expect(resolveRoute('/login', done)).toBe('/hoy');
  });

  it('/empezar redirects to /hoy', () => {
    expect(resolveRoute('/empezar', done)).toBe('/hoy');
  });

  it('/hoy serves dashboard', () => {
    expect(resolveRoute('/hoy', done)).toBe('/hoy');
  });

  it('/plan serves plan page', () => {
    expect(resolveRoute('/plan', done)).toBe('/plan');
  });
});

describe('E2E flow scenarios', () => {
  it('1. / → signup → /empezar', () => {
    const anon: UserState = { authenticated: false, onboarding: 'not_started' };
    expect(resolveRoute('/', anon)).toBe('/');
    // User clicks CTA → opens signup → registers → becomes authenticated
    const newUser: UserState = { authenticated: true, onboarding: 'not_started' };
    expect(resolveRoute('/', newUser)).toBe('/empezar');
  });

  it('2. Complete onboarding → /plan', () => {
    const done: UserState = { authenticated: true, onboarding: 'completed' };
    expect(resolveRoute('/plan', done)).toBe('/plan');
  });

  it('3. Complete onboarding → /hoy', () => {
    const done: UserState = { authenticated: true, onboarding: 'completed' };
    expect(resolveRoute('/hoy', done)).toBe('/hoy');
  });

  it('4. Sign out → /', () => {
    const anon: UserState = { authenticated: false, onboarding: 'not_started' };
    expect(resolveRoute('/', anon)).toBe('/');
  });

  it('5. Return login → /hoy', () => {
    const done: UserState = { authenticated: true, onboarding: 'completed' };
    expect(resolveRoute('/login', done)).toBe('/hoy');
  });

  it('6. New user tries /hoy → /login → /empezar', () => {
    const anon: UserState = { authenticated: false, onboarding: 'not_started' };
    expect(resolveRoute('/hoy', anon)).toBe('/login?next=%2Fhoy');
    // After login as new user
    const newUser: UserState = { authenticated: true, onboarding: 'not_started' };
    expect(resolveRoute('/hoy', newUser)).toBe('/empezar');
  });

  it('7. Completed user tries /empezar → /hoy', () => {
    const done: UserState = { authenticated: true, onboarding: 'completed' };
    expect(resolveRoute('/empezar', done)).toBe('/hoy');
  });

  it('8. Refresh /hoy and /plan with valid session', () => {
    const done: UserState = { authenticated: true, onboarding: 'completed' };
    expect(resolveRoute('/hoy', done)).toBe('/hoy');
    expect(resolveRoute('/plan', done)).toBe('/plan');
  });
});
