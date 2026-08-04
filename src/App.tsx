import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import AppShellV2 from './app-v2/layouts/AppShellV2';
import { useAuth } from './hooks/useAuth';
import { useOnboardingStatus } from './hooks/useOnboardingStatus';
import { AppGuard, OnboardingGuard, useAuthRedirect } from './app-v2/auth';
import { LoadingState } from './components/ui';

// ─── Product pages ──────────────────────────────────────────────────────────

const TodayPage = lazy(() => import('./app-v2/routes/TodayPage'));
const PlanPage = lazy(() => import('./app-v2/routes/PlanPage'));
const ExecutionPage = lazy(() => import('./features/execution/ExecutionPage'));
const BusinessProfilePage = lazy(() => import('./features/business-memory/BusinessProfilePage'));
const BusinessGoalsPage = lazy(() => import('./features/business-memory/BusinessGoalsPage'));
const BusinessMemoryPage = lazy(() => import('./features/business-memory/BusinessMemoryPage'));
const WeeklySummaryPage = lazy(() => import('./features/business-memory/WeeklySummaryPage'));
const SourceManagerPage = lazy(() => import('./features/reality-engine/SourceManager'));
const FirstValueFlow = lazy(() => import('./features/first-value/FirstValueFlow'));

// ─── Public pages ───────────────────────────────────────────────────────────

const LandingPage = lazy(() => import('./components/LandingPage'));
const LoginModal = lazy(() => import('./components/LoginModal'));

const SKELETON = (
  <div className="min-h-screen bg-v2-bg-primary flex items-center justify-center font-v2">
    <LoadingState message="Cargando..." />
  </div>
);

// ─── Pending business name (landing → onboarding handoff) ───────────────────

const PENDING_BIZ_KEY = 'pending_business_name';

export function getPendingBusinessName(): string | null {
  const v = sessionStorage.getItem(PENDING_BIZ_KEY);
  if (v) sessionStorage.removeItem(PENDING_BIZ_KEY);
  return v;
}

function savePendingBusinessName(name: string) {
  if (name.trim()) sessionStorage.setItem(PENDING_BIZ_KEY, name.trim());
}

// ─── / — Landing (anon only) ────────────────────────────────────────────────

function RootRoute() {
  const { status, authenticated } = useOnboardingStatus();
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login');
  const [loginEmail, setLoginEmail] = useState('');

  useEffect(() => {
    const h = window.location.hash;
    if (h === '#login') { setLoginMode('login'); setShowLogin(true); }
    else if (h === '#registro') { setLoginMode('signup'); setShowLogin(true); }
  }, []);

  if (status === 'loading') return SKELETON;

  if (authenticated) {
    return <Navigate to={status === 'completed' ? '/hoy' : '/empezar'} replace />;
  }

  return (
    <Suspense fallback={null}>
      <LandingPage
        onLoginClick={(email?: string) => {
          if (email) setLoginEmail(email);
          setLoginMode('login');
          setShowLogin(true);
        }}
        onSignupClick={(businessName?: string) => {
          if (businessName) savePendingBusinessName(businessName);
          setLoginMode('signup');
          setShowLogin(true);
        }}
        onSubscribeClick={() => {
          setLoginMode('signup');
          setShowLogin(true);
        }}
      />
      {showLogin && (
        <Suspense fallback={null}>
          <LoginModal
            onClose={() => { setShowLogin(false); setLoginEmail(''); window.history.replaceState(null, '', '/'); }}
            initialMode={loginMode}
            initialEmail={loginEmail}
          />
        </Suspense>
      )}
    </Suspense>
  );
}

// ─── /signup & /login ───────────────────────────────────────────────────────

function AuthRoute({ mode }: { mode: 'login' | 'signup' }) {
  const redirect = useAuthRedirect();
  const navigate = useNavigate();
  const { status } = useOnboardingStatus();

  if (status === 'loading') return SKELETON;

  if (redirect) return <Navigate to={redirect} replace />;

  return (
    <Suspense fallback={null}>
      <LoginModal onClose={() => navigate('/')} initialMode={mode} />
    </Suspense>
  );
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Suspense fallback={SKELETON}>
      <Routes>
        {/* ── Public ── */}
        <Route path="/" element={<RootRoute />} />
        <Route path="/signup" element={<AuthRoute mode="signup" />} />
        <Route path="/login" element={<AuthRoute mode="login" />} />

        {/* ── Onboarding ── */}
        <Route path="/empezar" element={
          <OnboardingGuard>
            <Suspense fallback={SKELETON}>
              <FirstValueFlow />
            </Suspense>
          </OnboardingGuard>
        } />

        {/* ── Main app (auth + onboarding complete) ── */}
        <Route element={<AppGuard><AppShellV2 /></AppGuard>}>
          <Route path="/hoy" element={<TodayPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/informes" element={<WeeklySummaryPage />} />
          <Route path="/negocio" element={<BusinessProfilePage />} />
          <Route path="/negocio/objetivos" element={<BusinessGoalsPage />} />
          <Route path="/negocio/memoria" element={<BusinessMemoryPage />} />
          <Route path="/fuentes" element={<SourceManagerPage />} />
        </Route>

        {/* ── Execution (auth, no shell) ── */}
        <Route path="/ejecutar/:recommendationId" element={
          <AppGuard>
            <div className="min-h-screen bg-v2-bg-primary font-v2">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
                <ExecutionPage />
              </div>
            </div>
          </AppGuard>
        } />

        {/* ── Legacy compatibility redirects ── */}
        <Route path="/registro" element={<Navigate to="/signup" replace />} />
        <Route path="/dashboard" element={<Navigate to="/hoy" replace />} />
        <Route path="/app-v2/*" element={<Navigate to="/hoy" replace />} />

        {/* ── Fallback ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
