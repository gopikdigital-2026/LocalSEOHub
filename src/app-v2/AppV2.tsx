import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShellV2 from './layouts/AppShellV2';
import { useAuth } from '../hooks/useAuth';
import { LoadingState } from '../components/ui';
import { createFirstValueRepository } from '../features/first-value/repository';

const TodayPage = lazy(() => import('./routes/TodayPage'));
const PlaceholderPage = lazy(() => import('./routes/PlaceholderPage'));
const ExecutionPage = lazy(() => import('../features/execution/ExecutionPage'));
const BusinessProfilePage = lazy(() => import('../features/business-memory/BusinessProfilePage'));
const BusinessGoalsPage = lazy(() => import('../features/business-memory/BusinessGoalsPage'));
const BusinessMemoryPage = lazy(() => import('../features/business-memory/BusinessMemoryPage'));
const WeeklySummaryPage = lazy(() => import('../features/business-memory/WeeklySummaryPage'));
const SourceManagerPage = lazy(() => import('../features/reality-engine/SourceManager'));
const FirstValueFlow = lazy(() => import('../features/first-value/FirstValueFlow'));
const BetaLanding = lazy(() => import('../features/first-value/BetaLanding'));

function AuthGate({ children }: { children: React.ReactNode }) {
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

function FirstValueRedirect({ children }: { children: React.ReactNode }) {
  const fvRepo = createFirstValueRepository();
  if (!fvRepo.isCompleted()) {
    return <Navigate to="/app-v2/empezar" replace />;
  }
  return <>{children}</>;
}

export default function AppV2() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-v2-bg-primary flex items-center justify-center font-v2">
        <LoadingState />
      </div>
    }>
      <Routes>
        {/* Beta landing - public, no auth */}
        <Route path="/beta" element={<BetaLanding />} />

        {/* First Value Flow - requires auth but NOT app shell */}
        <Route path="/app-v2/empezar" element={
          <AuthGate><FirstValueFlow /></AuthGate>
        } />

        {/* Main app - requires auth + first value completed */}
        <Route path="/app-v2" element={
          <AuthGate>
            <FirstValueRedirect>
              <AppShellV2 />
            </FirstValueRedirect>
          </AuthGate>
        }>
          <Route index element={<Navigate to="/app-v2/hoy" replace />} />
          <Route path="hoy" element={<TodayPage />} />
          <Route path="plan" element={<PlaceholderPage title="Plan Semanal" description="Aqui encontraras tu plan de acciones organizado por semana." />} />
          <Route path="contenido" element={<PlaceholderPage title="Contenido" description="Gestiona y crea contenido para tus canales desde aqui." />} />
          <Route path="reputacion" element={<PlaceholderPage title="Reputacion" description="Monitoriza y gestiona las resenas y la percepcion online de tu negocio." />} />
          <Route path="visibilidad" element={<PlaceholderPage title="Visibilidad" description="Analiza como apareces en buscadores y mapas." />} />
          <Route path="informes" element={<WeeklySummaryPage />} />
          <Route path="negocio" element={<BusinessProfilePage />} />
          <Route path="negocio/objetivos" element={<BusinessGoalsPage />} />
          <Route path="negocio/memoria" element={<BusinessMemoryPage />} />
          <Route path="fuentes" element={<SourceManagerPage />} />
        </Route>

        {/* Execution page - auth + no shell */}
        <Route path="/app-v2/ejecutar/:recommendationId" element={
          <AuthGate>
            <div className="min-h-screen bg-v2-bg-primary font-v2">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
                <ExecutionPage />
              </div>
            </div>
          </AuthGate>
        } />
      </Routes>
    </Suspense>
  );
}
