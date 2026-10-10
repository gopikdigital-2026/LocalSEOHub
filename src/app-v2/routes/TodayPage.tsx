import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMemoryRepository } from '../../features/business-memory/repository';
import { useBusiness } from '../../features/business-memory/BusinessContext';
import { loadSources as loadConnectedSources } from '../../features/reality-engine/repositories';
import type { ConnectedSource } from '../../features/reality-engine/types';
import type { ConnectionEntry, DashboardAction } from '../../features/dashboard/types';
import { useActions } from '../../features/actions/ActionsContext';
import {
  PRIORITY_LABELS, actionOrigin, actionOutcome, actionTarget, canMarkDone, ctaLabel, localizeAction, openActions,
  selectTodayActions, type ActionLang,
} from '../../features/actions/engine';
import type { BusinessAction } from '../../features/actions/types';
import { trackRecommendationViewed } from '../../services/analytics/v2Analytics';
import { useI18n } from '../../lib/i18n';
import { activationStage, resolveTodayState } from '../../features/activation/milestones';
import { FirstPlanIntro, FirstSuccessNotice } from '../../features/activation/ActivationNotices';
import { AlertTriangle, X } from 'lucide-react';

import DashboardHeader from '../../features/dashboard/DashboardHeader';
import BusinessHealthCard from '../../features/dashboard/BusinessHealthCard';
import TodaysMissions from '../../features/dashboard/TodaysMissions';
import AIInsights from '../../features/dashboard/AIInsights';
import CompetitorAlerts from '../../features/dashboard/CompetitorAlerts';
import GrowthTimeline from '../../features/dashboard/GrowthTimeline';
import type { GrowthMilestone } from '../../features/dashboard/GrowthTimeline';
import QuickActions from '../../features/dashboard/QuickActions';
import type { QuickAction } from '../../features/dashboard/QuickActions';
import BusinessSnapshot from '../../features/dashboard/BusinessSnapshot';
import type { SnapshotStat } from '../../features/dashboard/BusinessSnapshot';
import { PaywallNotice, PlanCard, TrialStartCard } from '../../features/billing/BillingNotices';
import { PremiumRequiredError } from '../../features/billing/model';
import WeeklyContentCard from '../../features/weekly-content/WeeklyContentCard';
import { offersImprovement } from '../../features/improvement/model';

const ACTION_ERRORS = {
  es: {
    start: 'No hemos podido empezar esta acción. Inténtalo de nuevo.',
    complete: 'No hemos podido marcarla como completada. Sigue pendiente; inténtalo de nuevo.',
    dismiss: 'No hemos podido descartarla. Inténtalo de nuevo.',
    locked: 'Para esto necesitas una prueba activa o una suscripción. Tus acciones siguen guardadas.',
    close: 'Cerrar',
  },
  en: {
    start: "We couldn't start this action. Please try again.",
    complete: "We couldn't mark it as completed. It is still pending; please try again.",
    dismiss: "We couldn't dismiss it. Please try again.",
    locked: 'This needs an active trial or subscription. Your actions are still saved.',
    close: 'Close',
  },
};

const PRIORITY_IMPACT = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' } as const;

function toDashboardAction(action: BusinessAction, lang: ActionLang): DashboardAction {
  const copy = localizeAction(action, lang);
  return {
    id: action.id,
    title: copy.title,
    explanation: copy.description,
    reason: copy.reason,
    value: copy.value,
    impact: PRIORITY_IMPACT[action.priority],
    priorityLabel: PRIORITY_LABELS[lang][action.priority],
    estimatedMinutes: action.effortMinutes,
    origin: actionOrigin(action.sourceType),
    ctaLabel: ctaLabel(action, lang),
    canMarkDone: canMarkDone(action),
    improveTo: offersImprovement(action) ? `/ejecutar/${action.id}` : undefined,
  };
}

const SOURCE_LABELS: Record<ActionLang, Record<string, string>> = {
  es: { google_business: 'Google Business', website: 'Sitio web', reviews: 'Reseñas', manual: 'Entrada manual' },
  en: { google_business: 'Google Business', website: 'Website', reviews: 'Reviews', manual: 'Manual entry' },
};

const PAGE_COPY = {
  es: {
    m1: 'Datos esenciales completos', m1d: 'Actividad, ciudad, servicios y objetivo',
    m2: 'Primera fuente conectada', m2d: 'Google Business Profile, sitio web o entrada manual',
    m3: 'Primera acción ejecutada', m4: '5 acciones ejecutadas', done: 'Completado',
    edit: 'Editar negocio', sources: 'Revisar fuentes', report: 'Ver informes', add: 'Añadir fuente',
    rating: 'Valoración', reviews: 'Reseñas', photos: 'Fotos', city: 'Ciudad',
  },
  en: {
    m1: 'Essential details complete', m1d: 'Activity, city, services and goal',
    m2: 'First source connected', m2d: 'Google Business Profile, website or manual entry',
    m3: 'First action carried out', m4: '5 actions carried out', done: 'Completed',
    edit: 'Edit business', sources: 'Review sources', report: 'See reports', add: 'Add source',
    rating: 'Rating', reviews: 'Reviews', photos: 'Photos', city: 'City',
  },
};

function sourceToConnection(s: ConnectedSource, lang: ActionLang): ConnectionEntry {
  return {
    id: s.source_type,
    label: SOURCE_LABELS[lang][s.source_type] ?? s.source_type,
    status: s.status === 'connected' ? 'connected' : s.status === 'error' ? 'not_connected' : 'not_connected',
    lastSync: s.last_sync_at,
  };
}

function useDashboardData(lang: ActionLang) {
  const { currentBusiness, businessId } = useBusiness();
  const memoryRepo = useMemo(() => createMemoryRepository(currentBusiness), [currentBusiness]);
  const [connectedSources, setConnectedSources] = useState<ConnectedSource[]>([]);

  useEffect(() => {
    if (!businessId) return;
    loadConnectedSources(businessId).then(setConnectedSources).catch(() => {});
  }, [businessId]);

  const memory = memoryRepo.load();
  const profile = memory.profile;

  const connections: ConnectionEntry[] = connectedSources.length > 0
    ? connectedSources.map((s) => sourceToConnection(s, lang))
    : [
        { id: 'google_business', label: SOURCE_LABELS[lang].google_business, status: 'not_connected', lastSync: null },
        { id: 'website', label: SOURCE_LABELS[lang].website, status: 'not_connected', lastSync: null },
      ];

  return { profile, connections, business: currentBusiness };
}

function buildMilestones(t: typeof PAGE_COPY.es, essentials: boolean, connectedCount: number, executed: number): GrowthMilestone[] {
  const m = (id: string, title: string, description: string, completed: boolean): GrowthMilestone =>
    ({ id, title, description, completed, date: completed ? t.done : undefined });
  return [
    m('m-1', t.m1, t.m1d, essentials),
    m('m-2', t.m2, t.m2d, connectedCount > 0),
    m('m-3', t.m3, '', executed > 0),
    m('m-4', t.m4, '', executed >= 5),
  ];
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const t = PAGE_COPY[lang];
  const { profile, connections, business } = useDashboardData(lang);
  const {
    actions: allActions, loading, error, ready, milestones: activation, firstSuccess, clearFirstSuccess,
    ensureFresh, refresh, start, complete, dismiss, locked,
  } = useActions();
  const [actionError, setActionError] = useState<string | null>(null);
  const errors = ACTION_ERRORS[lang];
  const failWith = (fallback: string) => (err: unknown) =>
    setActionError(err instanceof PremiumRequiredError ? errors.locked : fallback);

  useEffect(() => { ensureFresh(); }, [ensureFresh]);

  const today = useMemo(() => selectTodayActions(allActions), [allActions]);
  const pendingCount = openActions(allActions).length;
  const executedActions = allActions.filter((a) => actionOutcome(a) === 'executed').length;
  const essentials = Boolean(business && business.category.trim() && business.city.trim()
    && business.services.some((s) => s.trim()) && business.primary_goal);
  const byId = (id: string) => today.find((a) => a.id === id);
  const todayState = resolveTodayState({ ready, loading, error, todayCount: today.length, history: allActions, business });
  const showIntro = activationStage(activation) === 'first_plan' && todayState === 'ACTIONS' && !firstSuccess;
  const nextAction = today[0] ?? null;

  useEffect(() => { today.forEach((a) => trackRecommendationViewed(a)); }, [today]);

  const onExecute = async (item: DashboardAction) => {
    const action = byId(item.id);
    if (!action) return;
    setActionError(null);
    if (action.status === 'PENDING') {
      try {
        await start(action);
      } catch (err) {
        failWith(errors.start)(err);
        return;
      }
    }
    navigate(actionTarget(action));
  };
  const onComplete = (item: DashboardAction) => {
    const a = byId(item.id);
    if (!a) return;
    setActionError(null);
    complete(a).catch(failWith(errors.complete));
  };
  const onDismiss = (item: DashboardAction) => {
    const a = byId(item.id);
    if (!a) return;
    setActionError(null);
    dismiss(a).catch(failWith(errors.dismiss));
  };

  // No scoring model reads real data yet, so the score stays unavailable instead of a placeholder number.
  const healthScore: number | null = null;
  const connectedCount = connections.filter(c => c.status === 'connected').length;

  const quickActions: QuickAction[] = [
    { id: 'qa-edit', label: t.edit, icon: 'edit', onClick: () => navigate('/negocio') },
    { id: 'qa-sync', label: t.sources, icon: 'sync', onClick: () => navigate('/fuentes') },
    { id: 'qa-report', label: t.report, icon: 'report', onClick: () => navigate('/informes') },
    { id: 'qa-add', label: t.add, icon: 'add', onClick: () => navigate('/fuentes') },
  ];

  const snapshotStats: SnapshotStat[] = [
    { id: 's-rating', label: t.rating, value: null, icon: 'rating' },
    { id: 's-reviews', label: t.reviews, value: null, icon: 'reviews' },
    { id: 's-photos', label: t.photos, value: null, icon: 'photos' },
    { id: 's-location', label: t.city, value: profile.city || '--', icon: 'location' },
  ];

  const milestones = buildMilestones(t, essentials, connectedCount, executedActions);
  const completedMilestones = milestones.filter(m => m.completed).length;
  const overallProgress = Math.round((completedMilestones / milestones.length) * 100);

  return (
    <div className="space-y-6 sm:space-y-8 pb-8 max-w-5xl">
      <DashboardHeader businessName={profile.name} />

      {firstSuccess && (
        <FirstSuccessNotice
          lang={lang}
          onNext={nextAction ? () => { clearFirstSuccess(); navigate(actionTarget(nextAction)); } : null}
          onBack={clearFirstSuccess}
        />
      )}
      {showIntro && <FirstPlanIntro lang={lang} businessName={business?.name ?? null} goal={business?.primary_goal ?? null} />}
      <TrialStartCard />
      {locked && <PaywallNotice surface="today" />}
      {actionError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3">
          <AlertTriangle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="flex-1 text-v2-xs text-v2-error-600">{actionError}</p>
          <button onClick={() => setActionError(null)} aria-label={errors.close} className="text-v2-error-400 hover:text-v2-error-600"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2">
          <TodaysMissions
            actions={today.map((a) => toDashboardAction(a, lang))}
            state={todayState}
            lang={lang}
            onRetry={refresh}
            onNavigate={navigate}
            onExecute={onExecute}
            onComplete={onComplete}
            onDismiss={onDismiss}
          />
        </div>
        <div>
          <BusinessHealthCard
            score={healthScore}
            trend={null}
            connections={connections}
            pendingActions={pendingCount}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2">
          <WeeklyContentCard onNavigate={navigate} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2">
          <AIInsights insights={[]} />
        </div>
        <div>
          <CompetitorAlerts alerts={[]} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2 space-y-5">
          <GrowthTimeline
            milestones={milestones}
            overallProgress={overallProgress}
            onViewDetails={() => navigate('/informes')}
          />
          <QuickActions actions={quickActions} />
        </div>
        <div className="space-y-5">
          <BusinessSnapshot
            businessName={profile.name}
            category={profile.category}
            city={profile.city}
            stats={snapshotStats}
          />
          <PlanCard />
        </div>
      </div>
    </div>
  );
}
