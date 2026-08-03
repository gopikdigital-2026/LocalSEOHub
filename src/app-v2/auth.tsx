import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoadingState } from '../components/ui';
import { createFirstValueRepository } from '../features/first-value/repository';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-v2-bg-primary flex items-center justify-center font-v2">
        <LoadingState message="Cargando sesion..." />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-v2-bg-primary flex items-center justify-center font-v2 px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-v2-xl bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center mx-auto mb-4">
            <span className="text-v2-2xl font-bold text-v2-primary-600">L</span>
          </div>
          <h1 className="text-v2-xl font-bold text-v2-text-primary mb-2">LocalSEOHub 2.0</h1>
          <p className="text-v2-sm text-v2-text-secondary mb-6">
            Inicia sesion para acceder a tu panel de recomendaciones.
          </p>
          <a
            href="/#login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white font-semibold text-v2-sm transition-colors shadow-v2-sm"
          >
            Iniciar sesion
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function FirstValueRedirect({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const [checked, setChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!userId) { setChecked(true); return; }

    const repo = createFirstValueRepository(userId);
    repo.isCompleted().then((done) => {
      setCompleted(done);
      setChecked(true);
    }).catch(() => {
      setLoadError(true);
      setChecked(true);
    });
  }, [userId]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-v2-bg-primary flex items-center justify-center font-v2">
        <LoadingState />
      </div>
    );
  }

  if (loadError) {
    return (
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
  }

  if (!completed) {
    return <Navigate to="/empezar" replace />;
  }

  return <>{children}</>;
}
