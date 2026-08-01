import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FirstValueState, SourceChoice, SourceChoiceType, FirstRecommendationData } from './types';
import { STEP_ORDER } from './types';

import { createFirstValueRepository, advanceStep } from './repository';
import { generateFirstRecommendation, getGoalLabel, computeTimeToFirstValue } from './engine';
import { createLocalRepository as createMemoryRepo } from '../business-memory/repository';
import { registerActionCompleted } from '../business-memory/engine';
import { createRealityRepository } from '../reality-engine/repositories';
import { connectSource } from '../reality-engine/engine';
import {
  WelcomeStep,
  BusinessSetupStep,
  PrimaryGoalStep,
  SourceSetupStep,
  InitialAnalysisStep,
  FirstRecommendationStep,
  FirstValueSuccess,
} from './steps';
import {
  trackFirstValueStarted,
  trackFirstValueStepViewed,
  trackFirstValueCompleted,
  trackBusinessSetupCompleted,
  trackPrimaryGoalSelected,
  trackInitialSourceSelected,
  trackFirstRecommendationViewed,
  trackFirstRecommendationAccepted,
  trackFirstActionCompleted,
} from './analytics';

const fvRepo = createFirstValueRepository();
const memRepo = createMemoryRepo();
const realityRepo = createRealityRepository();

// ─── Progress Indicator ─────────────────────────────────────────────────────

function FirstValueProgress({ currentStep }: { currentStep: string }) {
  const visibleSteps = STEP_ORDER.filter((s) => s !== 'welcome' && s !== 'success');
  const idx = visibleSteps.indexOf(currentStep as any);
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

// ─── Main Flow ──────────────────────────────────────────────────────────────

export default function FirstValueFlow() {
  const navigate = useNavigate();
  const [state, setState] = useState<FirstValueState>(() => fvRepo.load());
  const [recommendation, setRecommendation] = useState<FirstRecommendationData | null>(null);
  const startedRef = useRef(false);

  const save = useCallback((newState: FirstValueState) => {
    setState(newState);
    fvRepo.save(newState);
  }, []);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      if (state.currentStep === 'welcome') {
        trackFirstValueStarted();
      } else {
        trackFirstValueStepViewed(state.currentStep);
      }
    }
  }, []);

  function goTo(step: typeof state.currentStep) {
    const next = advanceStep(state, step);
    save(next);
    trackFirstValueStepViewed(step);
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
            const next = { ...state, currentStep: 'primary_goal' as const, businessData: data };
            save(next);
            // Also save to business memory
            const memState = memRepo.load();
            memRepo.updateProfile({ ...memState.profile, name: data.name, category: data.category, city: data.city, website: data.website });
            trackBusinessSetupCompleted();
            trackFirstValueStepViewed('primary_goal');
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
            const next = { ...state, currentStep: 'source_setup' as const, selectedGoalId: goalId };
            save(next);
            memRepo.setGoals([{ goalId, selectedAt: new Date().toISOString() }]);
            trackPrimaryGoalSelected(goalId);
            trackFirstValueStepViewed('source_setup');
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
            const choice: SourceChoice = buildSourceChoice(choiceType);
            const next = { ...state, currentStep: 'initial_analysis' as const, sourceChoice: choice };
            save(next);
            // Connect source in reality engine
            if (choiceType === 'website_analysis') connectSource(realityRepo, 'website');
            else if (choiceType === 'manual_entry') connectSource(realityRepo, 'manual');
            trackInitialSourceSelected(choiceType);
            trackFirstValueStepViewed('initial_analysis');
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
            // Generate recommendation
            const rec = generateFirstRecommendation({
              business: state.businessData!,
              goalId: state.selectedGoalId!,
              source: state.sourceChoice!,
            });
            setRecommendation(rec);
            const next = { ...state, currentStep: 'first_recommendation' as const, recommendationId: rec.id };
            save(next);
            trackFirstRecommendationViewed(rec.id);
          }}
        />
      </FlowShell>
    );
  }

  // ─── First Recommendation ───────────
  if (state.currentStep === 'first_recommendation') {
    const rec = recommendation ?? generateFirstRecommendation({
      business: state.businessData!,
      goalId: state.selectedGoalId!,
      source: state.sourceChoice!,
    });
    if (!recommendation) setRecommendation(rec);

    return (
      <FlowShell progress={state.currentStep}>
        <FirstRecommendationStep
          recommendation={rec}
          onBack={() => goTo('source_setup')}
          onAccept={() => {
            const next = { ...state, currentStep: 'first_execution' as const };
            save(next);
            trackFirstRecommendationAccepted(rec.id);
            trackFirstValueStepViewed('first_execution');
          }}
        />
      </FlowShell>
    );
  }

  // ─── First Execution ────────────────
  if (state.currentStep === 'first_execution') {
    const rec = recommendation ?? generateFirstRecommendation({
      business: state.businessData!,
      goalId: state.selectedGoalId!,
      source: state.sourceChoice!,
    });
    if (!recommendation) setRecommendation(rec);

    return (
      <FlowShell progress={state.currentStep}>
        <FirstExecutionInline
          recommendation={rec}
          businessName={state.businessData?.name ?? ''}
          onComplete={() => {
            // Register in memory and timeline
            registerActionCompleted(memRepo, rec.title, rec.actionType, rec.impact, rec.estimatedMinutes);
            const next = { ...state, currentStep: 'success' as const, actionCompleted: true, completedAt: new Date().toISOString() };
            save(next);
            const ttfv = computeTimeToFirstValue(state.startedAt);
            trackFirstActionCompleted(rec.id, rec.actionType);
            trackFirstValueCompleted(ttfv);
          }}
        />
      </FlowShell>
    );
  }

  // ─── Success ────────────────────────
  if (state.currentStep === 'success') {
    const rec = recommendation ?? generateFirstRecommendation({
      business: state.businessData!,
      goalId: state.selectedGoalId!,
      source: state.sourceChoice!,
    });
    const ttfv = computeTimeToFirstValue(state.startedAt);

    return (
      <FlowShell>
        <FirstValueSuccess
          goalLabel={getGoalLabel(state.selectedGoalId!)}
          actionTitle={rec.title}
          timeSeconds={ttfv}
          onGoToWeeklyPlan={() => navigate('/app-v2/informes')}
          onGoToToday={() => navigate('/app-v2/hoy')}
        />
      </FlowShell>
    );
  }

  return null;
}

// ─── Inline Execution (simplified workspace within the flow) ────────────────

import { Check, Copy, Edit3 } from 'lucide-react';
import { Button } from '../../components/ui';
import { DataStatusBadge } from '../../components/data-status';

function FirstExecutionInline({ recommendation, businessName, onComplete }: { recommendation: FirstRecommendationData; businessName: string; onComplete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(() => generateActionContent(recommendation, businessName));
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight mb-2">
        {recommendation.title}
      </h1>
      <div className="flex items-center gap-2 mb-6">
        <DataStatusBadge confidence={recommendation.confidence} />
      </div>

      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-v2-sm font-semibold text-v2-text-primary">Contenido preparado</p>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setEditing(!editing)} className="p-1.5 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400">
              <Edit3 size={14} />
            </button>
            <button onClick={handleCopy} className="p-1.5 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400">
              {copied ? <Check size={14} className="text-v2-success-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-3 text-v2-sm text-v2-text-primary
              leading-relaxed focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10
              resize-y min-h-[140px] transition-all"
          />
        ) : (
          <p className="text-v2-sm text-v2-text-secondary leading-relaxed whitespace-pre-wrap bg-v2-neutral-50 rounded-v2-lg px-4 py-3">
            {content}
          </p>
        )}
      </div>

      <p className="text-v2-xs text-v2-text-tertiary mb-6">
        Puedes copiar este contenido y publicarlo en tu perfil, o marcarlo como completado si ya lo has hecho.
      </p>

      <Button size="lg" onClick={onComplete} icon={<Check size={16} />}>
        Marcar como completada
      </Button>
    </div>
  );
}

function generateActionContent(rec: FirstRecommendationData, businessName: string): string {
  switch (rec.actionType) {
    case 'publish_post':
      return `Novedades en ${businessName}\n\nEste mes queremos compartir las ultimas novedades de nuestro negocio. Trabajamos cada dia para ofrecer el mejor servicio a nuestros clientes.\n\nVisitanos y descubre todo lo que podemos hacer por ti.\n\nTe esperamos.`;
    case 'respond_reviews':
      return `Muchas gracias por tomarte el tiempo de dejarnos tu opinion. En ${businessName} trabajamos cada dia para mejorar y comentarios como el tuyo nos ayudan a seguir creciendo. Esperamos verte pronto.`;
    case 'update_description':
      return `${businessName} es un negocio local comprometido con ofrecer un servicio de calidad. Ubicados en el centro de la ciudad, contamos con anos de experiencia atendiendo a particulares y empresas. Contacta con nosotros para descubrir como podemos ayudarte.`;
    default:
      return `Contenido preparado para ${businessName}. Revisa, edita y publica cuando estes listo.`;
  }
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

// ─── Helper ─────────────────────────────────────────────────────────────────

function buildSourceChoice(type: SourceChoiceType): SourceChoice {
  switch (type) {
    case 'website_analysis':
      return { type, sourceId: 'website', dataSourceType: 'website', confidence: 'estimated' };
    case 'manual_entry':
      return { type, sourceId: 'manual', dataSourceType: 'manual', confidence: 'verified' };
    case 'demo':
      return { type, sourceId: 'manual', dataSourceType: 'manual', confidence: 'demo' };
  }
}
