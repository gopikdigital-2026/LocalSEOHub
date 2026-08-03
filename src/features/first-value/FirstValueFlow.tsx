import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FirstValueState, SourceChoice, SourceChoiceType, ManualContextData } from './types';
import { STEP_ORDER } from './types';
import { createFirstValueRepository, createDefaultState } from './repository';
import { generateFirstRecommendation, getGoalLabel, computeTimeToFirstValue } from './engine';
import { createLocalRepository as createMemoryRepo } from '../business-memory/repository';
import { registerActionCompleted } from '../business-memory/engine';
import {
  WelcomeStep,
  BusinessSetupStep,
  PrimaryGoalStep,
  SourceSetupStep,
  ManualContextStep,
  InitialAnalysisStep,
  FirstRecommendationStep,
  FirstExecutionInline,
  FirstValueSuccess,
  ErrorRecovery,
} from './steps';
import {
  trackFirstValueStarted,
  trackFirstValueResumed,
  trackFirstValueStepViewed,
  trackFirstValueCompleted,
  trackBusinessSetupCompleted,
  trackPrimaryGoalSelected,
  trackManualContextCompleted,
  trackInitialSourceSelected,
  trackInitialAnalysisCompleted,
  trackFirstRecommendationGenerated,
  trackFirstRecommendationViewed,
  trackFirstRecommendationAccepted,
  trackFirstWorkspaceOpened,
  trackFirstActionCompleted,
} from './analytics';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState } from '../../components/ui';

// ─── Progress Indicator ─────────────────────────────────────────────────────

function FirstValueProgress({ currentStep }: { currentStep: string }) {
  const visibleSteps = STEP_ORDER.filter((s) => s !== 'welcome' && s !== 'success');
  const idx = visibleSteps.indexOf(currentStep as typeof visibleSteps[number]);
  if (idx < 0) return null;

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      <span className="text-v2-xs text-v2-text-tertiary font-medium">
        Paso {idx + 1} de {visibleSteps.length}
      </span>
      <div className="flex gap-1">
        {visibleSteps.map((s, i) => (
          <div key={s} className={`w-6 h-1 rounded-full transition-colors ${i <= idx ? 'bg-v2-primary-500' : 'bg-v2-neutral-100'}`} />
        ))}
      </div>
    </div>
  );
}

// ─── Layout Shell ───────────────────────────────────────────────────────────

function FlowShell({ children, progress }: { children: React.ReactNode; progress?: string }) {
  return (
    <div className="min-h-screen bg-v2-bg-primary font-v2 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {progress && <FirstValueProgress currentStep={progress} />}
        {children}
      </div>
    </div>
  );
}

// ─── Source choice builder ──────────────────────────────────────────────────

function buildSourceChoice(type: SourceChoiceType): SourceChoice {
  switch (type) {
    case 'website_analysis':
      return { type, sourceId: 'website', websiteStatus: 'website_provided', dataMode: 'estimated', confidence: 'low' };
    case 'manual_entry':
      return { type, sourceId: 'manual', websiteStatus: null, dataMode: 'manual', confidence: 'medium' };
    case 'demo':
      return { type, sourceId: 'manual', websiteStatus: null, dataMode: 'demo', confidence: 'low' };
  }
}

// ─── Main Flow ──────────────────────────────────────────────────────────────

export default function FirstValueFlow() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const businessId = 'default';

  const [state, setState] = useState<FirstValueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const repoRef = useRef(userId ? createFirstValueRepository(userId, businessId) : null);
  const initRef = useRef(false);

  // Load state from Supabase on mount
  useEffect(() => {
    if (!userId || initRef.current) return;
    initRef.current = true;

    const repo = createFirstValueRepository(userId, businessId);
    repoRef.current = repo;

    repo.load().then((loaded) => {
      const ctx = { userId, businessId };
      if (loaded) {
        setState(loaded);
        if (loaded.currentStep !== 'welcome') {
          trackFirstValueResumed(ctx, loaded.currentStep);
        }
      } else {
        const fresh = createDefaultState(userId, businessId);
        setState(fresh);
        trackFirstValueStarted(ctx);
      }
      setLoading(false);
    }).catch(() => {
      setError('No se pudo cargar tu progreso. Comprueba tu conexion e intentalo de nuevo.');
      setLoading(false);
    });
  }, [userId, businessId]);

  const save = useCallback(async (newState: FirstValueState) => {
    setState(newState);
    try {
      await repoRef.current?.save(newState);
    } catch {
      // Save failed — state is in memory, will retry on next action
    }
  }, []);

  const trackCtx = useCallback(() => ({
    userId,
    businessId,
    recommendationId: state?.recommendation?.id,
    sourceType: state?.sourceChoice?.type,
    dataMode: state?.sourceChoice?.dataMode,
    confidence: state?.recommendation?.confidence,
  }), [userId, businessId, state?.recommendation, state?.sourceChoice]);

  if (!userId) {
    return (
      <FlowShell>
        <ErrorRecovery
          title="Sesion no disponible"
          message="Necesitas iniciar sesion para comenzar el proceso."
          onRetry={() => navigate('/#login')}
        />
      </FlowShell>
    );
  }

  if (loading) {
    return (
      <FlowShell>
        <LoadingState message="Cargando tu progreso..." />
      </FlowShell>
    );
  }

  if (error || !state) {
    return (
      <FlowShell>
        <ErrorRecovery
          title="Error al cargar"
          message={error ?? 'No se pudo cargar tu progreso.'}
          onRetry={() => window.location.reload()}
        />
      </FlowShell>
    );
  }

  const memRepo = createMemoryRepo();

  function goTo(step: FirstValueState['currentStep']) {
    if (!state) return;
    const next = { ...state, currentStep: step };
    save(next);
    trackFirstValueStepViewed(trackCtx(), step);
  }

  // ─── Welcome ───────────────────────
  if (state.currentStep === 'welcome') {
    return (
      <FlowShell>
        <WelcomeStep onContinue={() => goTo('business_setup')} />
      </FlowShell>
    );
  }

  // ─── Business Setup ─────────────────
  if (state.currentStep === 'business_setup') {
    return (
      <FlowShell progress={state.currentStep}>
        <BusinessSetupStep
          initial={state.businessData}
          onBack={() => goTo('welcome')}
          onContinue={(data) => {
            const next: FirstValueState = { ...state, currentStep: 'primary_goal', businessData: data };
            save(next);
            const memState = memRepo.load();
            memRepo.updateProfile({ ...memState.profile, name: data.name, category: data.category, city: data.city, website: data.website });
            trackBusinessSetupCompleted(trackCtx());
            trackFirstValueStepViewed(trackCtx(), 'primary_goal');
          }}
        />
      </FlowShell>
    );
  }

  // ─── Primary Goal ───────────────────
  if (state.currentStep === 'primary_goal') {
    return (
      <FlowShell progress={state.currentStep}>
        <PrimaryGoalStep
          initial={state.selectedGoalId}
          onBack={() => goTo('business_setup')}
          onContinue={(goalId) => {
            const next: FirstValueState = { ...state, currentStep: 'source_setup', selectedGoalId: goalId };
            save(next);
            memRepo.setGoals([{ goalId, selectedAt: new Date().toISOString() }]);
            trackPrimaryGoalSelected(trackCtx(), goalId);
            trackFirstValueStepViewed(trackCtx(), 'source_setup');
          }}
        />
      </FlowShell>
    );
  }

  // ─── Source Setup ───────────────────
  if (state.currentStep === 'source_setup') {
    return (
      <FlowShell progress={state.currentStep}>
        <SourceSetupStep
          hasWebsite={!!state.businessData?.website}
          onBack={() => goTo('primary_goal')}
          onContinue={(choiceType: SourceChoiceType) => {
            const choice = buildSourceChoice(choiceType);
            const nextStep = choiceType === 'manual_entry' ? 'manual_context' : 'initial_analysis';
            const next: FirstValueState = { ...state, currentStep: nextStep, sourceChoice: choice };
            save(next);
            trackInitialSourceSelected(trackCtx(), choiceType);
            trackFirstValueStepViewed(trackCtx(), nextStep);
          }}
        />
      </FlowShell>
    );
  }

  // ─── Manual Context ─────────────────
  if (state.currentStep === 'manual_context') {
    return (
      <FlowShell progress={state.currentStep}>
        <ManualContextStep
          initial={state.manualContext}
          onBack={() => goTo('source_setup')}
          onContinue={(data: ManualContextData) => {
            const next: FirstValueState = { ...state, currentStep: 'initial_analysis', manualContext: data };
            save(next);
            trackManualContextCompleted(trackCtx());
            trackFirstValueStepViewed(trackCtx(), 'initial_analysis');
          }}
        />
      </FlowShell>
    );
  }

  // ─── Initial Analysis ───────────────
  if (state.currentStep === 'initial_analysis') {
    return (
      <FlowShell progress={state.currentStep}>
        <InitialAnalysisStep
          businessName={state.businessData?.name ?? 'tu negocio'}
          sourceType={state.sourceChoice?.type ?? 'demo'}
          onComplete={() => {
            // Generate and persist recommendation only if not already generated
            let rec = state.recommendation;
            if (!rec) {
              rec = generateFirstRecommendation({
                userId,
                businessId,
                business: state.businessData!,
                goalId: state.selectedGoalId!,
                source: state.sourceChoice!,
                manualContext: state.manualContext,
              });
              trackFirstRecommendationGenerated({
                ...trackCtx(),
                recommendationId: rec.id,
                confidence: rec.confidence,
                dataMode: rec.dataMode,
              });
            }
            const next: FirstValueState = { ...state, currentStep: 'first_recommendation', recommendation: rec };
            save(next);
            trackInitialAnalysisCompleted(trackCtx());
            trackFirstRecommendationViewed({ ...trackCtx(), recommendationId: rec.id });
          }}
        />
      </FlowShell>
    );
  }

  // ─── First Recommendation ───────────
  if (state.currentStep === 'first_recommendation') {
    if (!state.recommendation) {
      return (
        <FlowShell>
          <ErrorRecovery
            title="Recomendacion no encontrada"
            message="No se encontro la recomendacion guardada. Puedes volver al paso anterior para generarla de nuevo."
            onRetry={() => goTo('initial_analysis')}
            onReset={() => { save(createDefaultState(userId, businessId)); }}
          />
        </FlowShell>
      );
    }

    return (
      <FlowShell progress={state.currentStep}>
        <FirstRecommendationStep
          recommendation={state.recommendation}
          onBack={() => goTo('source_setup')}
          onAccept={() => {
            const next: FirstValueState = {
              ...state,
              currentStep: 'first_execution',
              recommendation: { ...state.recommendation!, status: 'accepted' },
              executionPayload: { status: 'ready', startedAt: null, completedAt: null, editedContent: null },
            };
            save(next);
            trackFirstRecommendationAccepted({ ...trackCtx(), recommendationId: state.recommendation!.id });
            trackFirstWorkspaceOpened({ ...trackCtx(), recommendationId: state.recommendation!.id }, state.recommendation!.actionType);
          }}
        />
      </FlowShell>
    );
  }

  // ─── First Execution ────────────────
  if (state.currentStep === 'first_execution') {
    if (!state.recommendation) {
      return (
        <FlowShell>
          <ErrorRecovery
            title="Recomendacion no encontrada"
            message="El contenido preparado no esta disponible. Puedes reiniciar el proceso."
            onReset={() => { save(createDefaultState(userId, businessId)); }}
          />
        </FlowShell>
      );
    }

    return (
      <FlowShell progress={state.currentStep}>
        <FirstExecutionInline
          recommendation={state.recommendation}
          onComplete={() => {
            const rec = state.recommendation!;
            registerActionCompleted(memRepo, rec.title, rec.actionType, rec.impact, rec.estimatedTimeMinutes);
            const now = new Date().toISOString();
            const next: FirstValueState = {
              ...state,
              currentStep: 'success',
              completedAt: now,
              recommendation: { ...rec, status: 'completed', updatedAt: now },
              executionPayload: { status: 'completed', startedAt: state.executionPayload?.startedAt ?? now, completedAt: now, editedContent: null },
            };
            save(next);
            const ttfv = computeTimeToFirstValue(state.startedAt);
            trackFirstActionCompleted({ ...trackCtx(), recommendationId: rec.id }, rec.actionType);
            trackFirstValueCompleted({ ...trackCtx(), recommendationId: rec.id }, ttfv);
          }}
        />
      </FlowShell>
    );
  }

  // ─── Success ────────────────────────
  if (state.currentStep === 'success') {
    const rec = state.recommendation;
    const ttfv = computeTimeToFirstValue(state.startedAt);

    return (
      <FlowShell>
        <FirstValueSuccess
          goalLabel={getGoalLabel(state.selectedGoalId!)}
          actionTitle={rec?.title ?? 'Accion completada'}
          timeSeconds={ttfv}
          onGoToPlan={() => navigate('/plan')}
          onGoToToday={() => navigate('/hoy')}
        />
      </FlowShell>
    );
  }

  // ─── Unknown step — recovery ────────
  return (
    <FlowShell>
      <ErrorRecovery
        title="Paso no reconocido"
        message="Parece que tu progreso se ha corrompido. Puedes reiniciar el proceso."
        onReset={() => { save(createDefaultState(userId, businessId)); }}
      />
    </FlowShell>
  );
}
