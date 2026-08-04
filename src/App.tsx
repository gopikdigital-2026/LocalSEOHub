import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AppShellV2 from './app-v2/layouts/AppShellV2';
import { useAuth } from './hooks/useAuth';
import { useOnboardingStatus } from './hooks/useOnboardingStatus';
import { AppGuard, OnboardingGuard, useAuthRedirect } from './app-v2/auth';
import { LoadingState } from './components/ui';

// V2 pages (main app)
const TodayPage = lazy(() => import('./app-v2/routes/TodayPage'));
const PlanPage = lazy(() => import('./app-v2/routes/PlanPage'));
const ExecutionPage = lazy(() => import('./features/execution/ExecutionPage'));
const BusinessProfilePage = lazy(() => import('./features/business-memory/BusinessProfilePage'));
const BusinessGoalsPage = lazy(() => import('./features/business-memory/BusinessGoalsPage'));
const BusinessMemoryPage = lazy(() => import('./features/business-memory/BusinessMemoryPage'));
const WeeklySummaryPage = lazy(() => import('./features/business-memory/WeeklySummaryPage'));
const SourceManagerPage = lazy(() => import('./features/reality-engine/SourceManager'));
const FirstValueFlow = lazy(() => import('./features/first-value/FirstValueFlow'));
const BetaLanding = lazy(() => import('./features/first-value/BetaLanding'));

// Public landing pages (marketing/SEO)
const LandingPage = lazy(() => import('./components/LandingPage'));
const LoginModal = lazy(() => import('./components/LoginModal'));
const ContentGeneratorLanding = lazy(() => import('./components/ContentGeneratorLanding'));
const BusinessAuditLanding = lazy(() => import('./components/BusinessAuditLanding'));
const DiagnosticLanding = lazy(() => import('./components/DiagnosticLanding'));
const PotentialLanding = lazy(() => import('./components/PotentialLanding'));
const GrowthPlanLanding = lazy(() => import('./components/GrowthPlanLanding'));
const CopilotLanding = lazy(() => import('./components/CopilotLanding'));
const MetaAdsLanding = lazy(() => import('./components/MetaAdsLanding'));
const AdminDashboard = lazy(() => import('./legacy/components/AdminDashboard'));

const SKELETON = (
  <div className="min-h-screen bg-v2-bg-primary flex items-center justify-center font-v2">
    <LoadingState message="Cargando..." />
  </div>
);

// ─── Temp storage for business name from landing ────────────────────────────

const PENDING_BIZ_KEY = 'pending_business_name';

export function getPendingBusinessName(): string | null {
  const v = sessionStorage.getItem(PENDING_BIZ_KEY);
  if (v) sessionStorage.removeItem(PENDING_BIZ_KEY);
  return v;
}

function savePendingBusinessName(name: string) {
  if (name.trim()) sessionStorage.setItem(PENDING_BIZ_KEY, name.trim());
}

// ─── / Root ─────────────────────────────────────────────────────────────────

function RootRoute() {
  const { status, authenticated } = useOnboardingStatus();
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login');
  const [loginEmail, setLoginEmail] = useState('');

  useEffect(() => {
    if (window.location.hash === '#login') {
      setLoginMode('login');
      setShowLogin(true);
    } else if (window.location.hash === '#registro') {
      setLoginMode('signup');
      setShowLogin(true);
    }
  }, []);

  if (status === 'loading') return SKELETON;

  if (authenticated) {
    if (status === 'completed') return <Navigate to="/hoy" replace />;
    return <Navigate to="/empezar" replace />;
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

// ─── /registro & /login ─────────────────────────────────────────────────────

function AuthRoute({ mode }: { mode: 'login' | 'signup' }) {
  const redirect = useAuthRedirect();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status } = useOnboardingStatus();

  if (status === 'loading') return SKELETON;

  if (redirect) {
    const next = searchParams.get('next');
    if (next && redirect !== '/empezar') {
      return <Navigate to={next} replace />;
    }
    return <Navigate to={redirect} replace />;
  }

  return (
    <Suspense fallback={null}>
      <LoginModal
        onClose={() => navigate('/')}
        initialMode={mode}
      />
    </Suspense>
  );
}

// ─── Admin ──────────────────────────────────────────────────────────────────

function AdminRoute() {
  const { session, loading } = useAuth();
  const ADMIN_EMAILS = ['hola@localseo.es', 'admin@localseo.es'];

  if (loading) return SKELETON;

  if (!session || !ADMIN_EMAILS.includes(session.user.email ?? '')) {
    return <Navigate to="/" replace />;
  }

  return (
    <Suspense fallback={null}>
      <AdminDashboard session={session} />
    </Suspense>
  );
}

// ─── Meta Ads landing ───────────────────────────────────────────────────────

function MetaAdsRoute() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <Suspense fallback={null}>
      <MetaAdsLanding onUnlock={() => setShowLogin(true)} />
      {showLogin && (
        <Suspense fallback={null}>
          <LoginModal onClose={() => setShowLogin(false)} initialMode="signup" />
        </Suspense>
      )}
    </Suspense>
  );
}

// ─── Demo shell ─────────────────────────────────────────────────────────────

function DemoShell() {
  useEffect(() => {
    const DEMO_KEY = 'business_memory_v2';
    if (!localStorage.getItem(DEMO_KEY)) {
      localStorage.setItem(DEMO_KEY, JSON.stringify({
        profile: { name: 'Panaderia Artesana', category: 'Panaderia / Pasteleria', city: 'Madrid', postalCode: '28012', description: 'Panaderia artesana con horno de lena en el centro de Madrid.' },
        goals: [{ id: 'g1', text: 'Aparecer en el top 3 de Google Maps', active: true }],
        history: []
      }));
    }
  }, []);

  return <AppShellV2 />;
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Suspense fallback={SKELETON}>
      <Routes>
        {/* Root */}
        <Route path="/" element={<RootRoute />} />

        {/* Auth pages */}
        <Route path="/registro" element={<AuthRoute mode="signup" />} />
        <Route path="/login" element={<AuthRoute mode="login" />} />

        {/* Public marketing pages */}
        <Route path="/beta" element={<BetaLanding />} />
        <Route path="/generador-contenido-seo" element={<ContentGeneratorLanding />} />
        <Route path="/mas-clientes-google" element={<BusinessAuditLanding />} />
        <Route path="/diagnostico-negocio" element={<DiagnosticLanding />} />
        <Route path="/descubre-tu-potencial" element={<PotentialLanding />} />
        <Route path="/plan-crecimiento-gratis" element={<GrowthPlanLanding />} />
        <Route path="/copiloto-ia" element={<CopilotLanding />} />
        <Route path="/analisis-google-maps" element={<MetaAdsRoute />} />

        {/* Admin */}
        <Route path="/admin" element={<AdminRoute />} />

        {/* Demo (no auth) */}
        <Route element={<DemoShell />}>
          <Route path="/demo" element={<TodayPage />} />
          <Route path="/demo/plan" element={<PlanPage />} />
          <Route path="/demo/negocio" element={<BusinessProfilePage />} />
          <Route path="/demo/fuentes" element={<SourceManagerPage />} />
        </Route>

        {/* Onboarding */}
        <Route path="/empezar" element={
          <OnboardingGuard>
            <Suspense fallback={SKELETON}>
              <FirstValueFlow />
            </Suspense>
          </OnboardingGuard>
        } />

        {/* Main app — requires auth + completed onboarding */}
        <Route element={
          <AppGuard>
            <AppShellV2 />
          </AppGuard>
        }>
          <Route path="/hoy" element={<TodayPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/informes" element={<WeeklySummaryPage />} />
          <Route path="/negocio" element={<BusinessProfilePage />} />
          <Route path="/negocio/objetivos" element={<BusinessGoalsPage />} />
          <Route path="/negocio/memoria" element={<BusinessMemoryPage />} />
          <Route path="/fuentes" element={<SourceManagerPage />} />
        </Route>

        {/* Execution — auth + guard, no shell */}
        <Route path="/ejecutar/:recommendationId" element={
          <AppGuard>
            <div className="min-h-screen bg-v2-bg-primary font-v2">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
                <ExecutionPage />
              </div>
            </div>
          </AppGuard>
        } />

        {/* Legacy redirects */}
        <Route path="/app-v2" element={<Navigate to="/hoy" replace />} />
        <Route path="/app-v2/hoy" element={<Navigate to="/hoy" replace />} />
        <Route path="/app-v2/plan" element={<Navigate to="/plan" replace />} />
        <Route path="/app-v2/empezar" element={<Navigate to="/empezar" replace />} />
        <Route path="/app-v2/informes" element={<Navigate to="/informes" replace />} />
        <Route path="/app-v2/negocio" element={<Navigate to="/negocio" replace />} />
        <Route path="/app-v2/negocio/objetivos" element={<Navigate to="/negocio/objetivos" replace />} />
        <Route path="/app-v2/negocio/memoria" element={<Navigate to="/negocio/memoria" replace />} />
        <Route path="/app-v2/fuentes" element={<Navigate to="/fuentes" replace />} />
        <Route path="/app-v2/ejecutar/:recommendationId" element={<Navigate to="/ejecutar/:recommendationId" replace />} />
        <Route path="/dashboard" element={<Navigate to="/hoy" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
