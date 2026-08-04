import { describe, it, expect } from 'vitest';
import type { OnboardingStatus } from '../../../hooks/useOnboardingStatus';

type UserState = {
  authenticated: boolean;
  onboarding: OnboardingStatus;
};

function resolveRoute(path: string, user: UserState): string {
  // ── Not authenticated ──
  if (!user.authenticated) {
    if (path === '/') return '/';
    if (path === '/signup') return '/signup';
    if (path === '/login') return '/login';
    if (path === '/empezar') return '/signup';
    return `/login?next=${encodeURIComponent(path)}`;
  }

  // ── Authenticated, onboarding incomplete ──
  if (user.onboarding !== 'completed') {
    return '/empezar';
  }

  // ── Authenticated, onboarding complete ──
  if (path === '/' || path === '/signup' || path === '/login' || path === '/empezar') return '/hoy';
  return path;
}

describe('Routing — not authenticated', () => {
  const anon: UserState = { authenticated: false, onboarding: 'not_started' };

  it('/ shows landing', () => {
    expect(resolveRoute('/', anon)).toBe('/');
  });

  it('/signup shows signup', () => {
    expect(resolveRoute('/signup', anon)).toBe('/signup');
  });

  it('/login shows login', () => {
    expect(resolveRoute('/login', anon)).toBe('/login');
  });

  it('/empezar redirects to /signup', () => {
    expect(resolveRoute('/empezar', anon)).toBe('/signup');
  });

  it('/hoy redirects to /login?next=/hoy', () => {
    expect(resolveRoute('/hoy', anon)).toBe('/login?next=%2Fhoy');
  });

  it('/plan redirects to /login?next=/plan', () => {
    expect(resolveRoute('/plan', anon)).toBe('/login?next=%2Fplan');
  });
});

describe('Routing — authenticated, onboarding incomplete', () => {
  const partial: UserState = { authenticated: true, onboarding: 'in_progress' };

  it('/ → /empezar', () => expect(resolveRoute('/', partial)).toBe('/empezar'));
  it('/signup → /empezar', () => expect(resolveRoute('/signup', partial)).toBe('/empezar'));
  it('/login → /empezar', () => expect(resolveRoute('/login', partial)).toBe('/empezar'));
  it('/hoy → /empezar', () => expect(resolveRoute('/hoy', partial)).toBe('/empezar'));
  it('/plan → /empezar', () => expect(resolveRoute('/plan', partial)).toBe('/empezar'));
  it('/empezar stays', () => expect(resolveRoute('/empezar', partial)).toBe('/empezar'));
});

describe('Routing — authenticated, onboarding complete', () => {
  const done: UserState = { authenticated: true, onboarding: 'completed' };

  it('/ → /hoy', () => expect(resolveRoute('/', done)).toBe('/hoy'));
  it('/signup → /hoy', () => expect(resolveRoute('/signup', done)).toBe('/hoy'));
  it('/login → /hoy', () => expect(resolveRoute('/login', done)).toBe('/hoy'));
  it('/empezar → /hoy', () => expect(resolveRoute('/empezar', done)).toBe('/hoy'));
  it('/hoy stays', () => expect(resolveRoute('/hoy', done)).toBe('/hoy'));
  it('/plan stays', () => expect(resolveRoute('/plan', done)).toBe('/plan'));
});

describe('E2E flow scenarios', () => {
  it('1. / → signup → /empezar', () => {
    const anon: UserState = { authenticated: false, onboarding: 'not_started' };
    expect(resolveRoute('/', anon)).toBe('/');
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
    const newUser: UserState = { authenticated: true, onboarding: 'not_started' };
    expect(resolveRoute('/hoy', newUser)).toBe('/empezar');
  });

  it('7. Completed user tries /empezar → /hoy', () => {
    const done: UserState = { authenticated: true, onboarding: 'completed' };
    expect(resolveRoute('/empezar', done)).toBe('/hoy');
  });

  it('8. Refresh /hoy and /plan with session', () => {
    const done: UserState = { authenticated: true, onboarding: 'completed' };
    expect(resolveRoute('/hoy', done)).toBe('/hoy');
    expect(resolveRoute('/plan', done)).toBe('/plan');
  });
});
