import React from 'react';
import { Navigate } from 'react-router-dom';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { LoadingState } from '../components/ui';

const SKELETON = (
  <div className="min-h-screen bg-v2-bg-primary flex items-center justify-center font-v2">
    <LoadingState message="Comprobando tu sesion..." />
  </div>
);

const ERROR_SCREEN = (
  <div className="min-h-screen bg-v2-bg-primary flex items-center justify-center font-v2 px-4">
    <div className="text-center max-w-sm">
      <h1 className="text-v2-xl font-bold text-v2-text-primary mb-2">Error de conexion</h1>
      <p className="text-v2-sm text-v2-text-secondary mb-6">
        No se pudo comprobar tu progreso. Comprueba tu conexion e intentalo de nuevo.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center justify-center px-6 py-3 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white font-semibold text-v2-sm transition-colors shadow-v2-sm"
      >
        Reintentar
      </button>
    </div>
  </div>
);

/**
 * Protects app routes (/hoy, /plan, etc.).
 * - Not authenticated → /login?next=<current path>
 * - Authenticated + onboarding incomplete → /empezar
 * - Authenticated + onboarding complete → render children
 */
export function AppGuard({ children }: { children: React.ReactNode }) {
  const { status, authenticated } = useOnboardingStatus();

  if (status === 'loading') return SKELETON;
  if (status === 'error') return ERROR_SCREEN;

  if (!authenticated) {
    const next = window.location.pathname;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (status === 'not_started' || status === 'in_progress') {
    return <Navigate to="/empezar" replace />;
  }

  return <>{children}</>;
}

/**
 * Protects /empezar.
 * - Not authenticated → /registro?next=/empezar
 * - Authenticated + completed → /hoy
 * - Authenticated + not completed → render children
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { status, authenticated } = useOnboardingStatus();

  if (status === 'loading') return SKELETON;
  if (status === 'error') return ERROR_SCREEN;

  if (!authenticated) {
    return <Navigate to="/registro?next=/empezar" replace />;
  }

  if (status === 'completed') {
    return <Navigate to="/hoy" replace />;
  }

  return <>{children}</>;
}

/**
 * For /registro and /login when user is already authenticated.
 * Redirects based on onboarding status.
 */
export function useAuthRedirect(): string | null {
  const { status, authenticated } = useOnboardingStatus();

  if (status === 'loading') return null;
  if (!authenticated) return null;

  if (status === 'completed') return '/hoy';
  return '/empezar';
}
