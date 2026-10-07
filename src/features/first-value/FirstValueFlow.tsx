import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPendingBusinessName } from '../../App';
import type { BusinessSetupData, FirstValueState } from './types';
import type { GoalId } from '../business-memory/types';
import { createFirstValueRepository, createDefaultState, type FirstValueRepository } from './repository';
import {
  ONBOARDING_TOTAL_STEPS, cleanBusinessData, initialBusinessData, resumeScreen, stepNumber, type OnboardingScreen,
} from './onboarding';
import { useBusiness } from '../business-memory/BusinessContext';
import { goalsToPatch } from '../business-memory/businessRecord';
import { advanceActivation } from '../activation/service';
import { loadMilestones } from '../activation/repository';
import { WelcomeStep, BusinessSetupStep, PrimaryGoalStep, FinishingStep, ErrorRecovery, StepProgress, onboardingCopy } from './steps';
import { trackOnboardingStarted, trackOnboardingStepCompleted } from '../../services/analytics/v2Analytics';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../lib/i18n';
import { LoadingState } from '../../components/ui';

const TEXT = {
  es: {
    noSession: 'Sesión no disponible', noSessionMsg: 'Necesitas iniciar sesión para continuar.', signIn: 'Iniciar sesión',
    loadTitle: 'No se pudo cargar', loadMsg: 'No hemos podido cargar tu negocio. Comprueba tu conexión e inténtalo de nuevo.',
    loading: 'Cargando...',
  },
  en: {
    noSession: 'Session unavailable', noSessionMsg: 'You need to sign in to continue.', signIn: 'Sign in',
    loadTitle: "Couldn't load", loadMsg: "We couldn't load your business. Check your connection and try again.",
    loading: 'Loading...',
  },
};

function FlowShell({ children, screen, lang }: { children: React.ReactNode; screen?: OnboardingScreen; lang: 'es' | 'en' }) {
  const n = screen ? stepNumber(screen) : null;
  return (
    <div className="min-h-screen bg-v2-bg-primary font-v2 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {n !== null && <StepProgress step={n} total={ONBOARDING_TOTAL_STEPS} lang={lang} />}
        {children}
      </div>
    </div>
  );
}

export default function FirstValueFlow() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const t = TEXT[lang];
  const copy = onboardingCopy(lang);
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const { currentBusiness, businessId: resolvedBusinessId, updateBusiness, loading: businessLoading, error: businessError } = useBusiness();
  const businessId = resolvedBusinessId ?? '';

  const [state, setState] = useState<FirstValueState | null>(null);
  const [screen, setScreen] = useState<OnboardingScreen>('welcome');
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const repoRef = useRef<FirstValueRepository | null>(null);
  const initRef = useRef(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    if (!userId || !businessId || initRef.current) return;
    initRef.current = true;
    const repo = createFirstValueRepository(userId, businessId);
    repoRef.current = repo;

    repo.load().then((loaded) => {
      const base = loaded ?? createDefaultState(userId, businessId);
      const businessData = initialBusinessData(base.businessData, currentBusiness, getPendingBusinessName());
      const goal = base.selectedGoalId ?? currentBusiness?.primary_goal ?? null;
      setState({ ...base, businessData, selectedGoalId: goal });
      setScreen(resumeScreen(loaded?.currentStep ?? null, businessData, goal));
      trackOnboardingStarted();
    }).catch(() => setLoadFailed(true));
  }, [userId, businessId, currentBusiness]);

  const persist = useCallback(async (next: FirstValueState) => {
    await repoRef.current?.save(next);
    setState(next);
  }, []);

  /** Runs one save; on failure the user stays on the same screen with their input intact. */
  const runStep = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setStepError(null);
    try {
      await work();
    } catch (err) {
      if (import.meta.env.DEV) console.error('[onboarding] save failed:', err);
      setStepError(copy.saveError);
    } finally {
      setBusy(false);
    }
  }, [copy.saveError]);

  const finish = useCallback(async (s: FirstValueState) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setScreen('finishing');
    setStepError(null);
    try {
      const goal = s.selectedGoalId as GoalId;
      const completedAt = new Date().toISOString();
      const updated = await updateBusiness({
        ...(s.businessData ? cleanBusinessData(s.businessData) : {}),
        ...goalsToPatch([goal, ...(currentBusiness?.secondary_goals ?? []).filter((g) => g !== goal)]),
        onboarding_completed: true,
        onboarding_completed_at: currentBusiness?.onboarding_completed_at ?? completedAt,
      });
      await persist({ ...s, currentStep: 'success', completedAt: s.completedAt ?? completedAt });
      try {
        const current = await loadMilestones(userId, updated.id);
        await advanceActivation(userId, updated, current, { type: 'onboarding_completed' });
      } catch (err) {
        if (import.meta.env.DEV) console.error('[onboarding] milestone record failed:', err);
      }
      navigate('/hoy', { replace: true });
    } catch (err) {
      if (import.meta.env.DEV) console.error('[onboarding] finish failed:', err);
      setStepError(copy.finishError);
      finishingRef.current = false;
    }
  }, [updateBusiness, currentBusiness, persist, userId, navigate, copy.finishError]);

  useEffect(() => {
    if (screen === 'finishing' && state && !stepError && !finishingRef.current) void finish(state);
  }, [screen, state, stepError, finish]);

  if (!userId) {
    return (
      <FlowShell lang={lang}>
        <ErrorRecovery lang={lang} title={t.noSession} message={t.noSessionMsg} onRetry={() => navigate('/login?next=%2Fempezar')} />
      </FlowShell>
    );
  }

  if (businessError || loadFailed) {
    return (
      <FlowShell lang={lang}>
        <ErrorRecovery lang={lang} title={t.loadTitle} message={t.loadMsg} onRetry={() => window.location.reload()} />
      </FlowShell>
    );
  }

  if (!state || businessLoading) {
    return (
      <FlowShell lang={lang}>
        <LoadingState message={t.loading} />
      </FlowShell>
    );
  }

  if (screen === 'welcome') {
    return (
      <FlowShell lang={lang}>
        <WelcomeStep lang={lang} onContinue={() => {
          setScreen('business_setup');
          void repoRef.current?.save({ ...state, currentStep: 'business_setup' }).catch(() => {});
        }} />
      </FlowShell>
    );
  }

  if (screen === 'business_setup') {
    return (
      <FlowShell screen={screen} lang={lang}>
        <BusinessSetupStep
          lang={lang}
          busy={busy}
          error={stepError}
          initial={state.businessData}
          onBack={() => { setStepError(null); setScreen('welcome'); }}
          onContinue={(data: BusinessSetupData) => runStep(async () => {
            const clean = cleanBusinessData(data);
            await updateBusiness(clean);
            await persist({ ...state, currentStep: 'primary_goal', businessData: clean });
            trackOnboardingStepCompleted('business_setup');
            setScreen('primary_goal');
          })}
        />
      </FlowShell>
    );
  }

  if (screen === 'primary_goal') {
    return (
      <FlowShell screen={screen} lang={lang}>
        <PrimaryGoalStep
          lang={lang}
          busy={busy}
          error={stepError}
          initial={state.selectedGoalId}
          onBack={() => { setStepError(null); setScreen('business_setup'); }}
          onContinue={(goalId) => runStep(async () => {
            const next = { ...state, currentStep: 'primary_goal' as const, selectedGoalId: goalId };
            await persist(next);
            trackOnboardingStepCompleted('primary_goal', goalId);
            await finish(next);
          })}
        />
      </FlowShell>
    );
  }

  return (
    <FlowShell lang={lang}>
      <FinishingStep lang={lang} error={stepError} onRetry={() => { void finish(state); }} />
    </FlowShell>
  );
}
