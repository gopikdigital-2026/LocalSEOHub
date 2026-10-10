import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBusiness } from '../../features/business-memory/BusinessContext';
import { LoadingState } from '../../components/ui';
import { OriginLabel } from '../../components/DataIntegrity';
import type { GoalId } from '../../features/business-memory/types';
import { useActions } from '../../features/actions/ActionsContext';
import {
  CATEGORY_LABELS, PRIORITY_LABELS, actionOrigin, actionOutcome, actionTarget, buildActionReport, canMarkDone, ctaLabel,
  localizeAction, openActions, selectTodayActions, weekStart, type ActionLang,
} from '../../features/actions/engine';
import type { ActionCategory, BusinessAction } from '../../features/actions/types';
import { goalLabel } from '../../features/activation/milestones';
import { useI18n } from '../../lib/i18n';
import { PaywallNotice } from '../../features/billing/BillingNotices';
import { PremiumRequiredError } from '../../features/billing/model';
import ImprovementHint from '../../features/improvement/ImprovementHint';
import { offersImprovement } from '../../features/improvement/model';
import { Target, Check, Clock, ArrowRight, Calendar, Info, AlertTriangle, X, RefreshCw } from 'lucide-react';

const L = {
  es: {
    title: 'Plan semanal', goal: 'Objetivo', progress: 'Progreso esta semana', of: 'de', actions: 'acciones',
    now: 'Para hoy', week: 'Resto de la semana', done: 'Cerradas esta semana', executed: 'Hecha por ti', dataDone: 'Dato completado',
    markDone: 'Marcar como completada', dismiss: 'Descartar', priority: 'Prioridad',
    estimate: (m: number) => `Estimado: ~${m} min`, autoClose: 'Se cierra sola al guardar el dato',
    notice: 'Cada acción indica de dónde sale: tus datos conectados, la información de tu negocio, tu objetivo o una buena práctica general. No inventamos diagnósticos.',
    emptyTitle: 'Aún no tienes un plan', emptyText: 'Completa los datos de tu negocio para recibir tus acciones.', start: 'Completar datos',
    scope: 'Hoy muestra tu prioridad inmediata; el Plan reúne las acciones de toda la semana.',
    errorTitle: 'Error al cargar tu plan', errorText: 'Comprueba tu conexión e inténtalo de nuevo.', retry: 'Reintentar', loading: 'Cargando tu plan...',
    allDone: 'No tienes acciones pendientes esta semana.',
    failStart: 'No hemos podido empezar esta acción. Inténtalo de nuevo.',
    failComplete: 'No hemos podido marcarla como completada. Sigue pendiente; inténtalo de nuevo.',
    failDismiss: 'No hemos podido descartarla. Inténtalo de nuevo.',
    locked: 'Para esto necesitas una prueba activa o una suscripción. Tus acciones siguen guardadas.',
    close: 'Cerrar',
  },
  en: {
    title: 'Weekly plan', goal: 'Goal', progress: 'Progress this week', of: 'of', actions: 'actions',
    now: 'For today', week: 'Rest of the week', done: 'Closed this week', executed: 'Done by you', dataDone: 'Detail completed',
    markDone: 'Mark as completed', dismiss: 'Dismiss', priority: 'Priority',
    estimate: (m: number) => `Estimate: ~${m} min`, autoClose: 'Closes on its own once the detail is saved',
    notice: 'Each action shows where it comes from: your connected data, your business information, your goal or a general best practice. We never make up diagnostics.',
    emptyTitle: 'You do not have a plan yet', emptyText: 'Complete your business details to receive your actions.', start: 'Complete details',
    scope: 'Today shows your immediate priority; the Plan gathers the actions for the whole week.',
    errorTitle: 'Could not load your plan', errorText: 'Check your connection and try again.', retry: 'Retry', loading: 'Loading your plan...',
    allDone: 'You have no pending actions this week.',
    failStart: "We couldn't start this action. Please try again.",
    failComplete: "We couldn't mark it as completed. It is still pending; please try again.",
    failDismiss: "We couldn't dismiss it. Please try again.",
    locked: 'This needs an active trial or subscription. Your actions are still saved.',
    close: 'Close',
  },
};

interface RowProps {
  action: BusinessAction;
  lang: ActionLang;
  onOpen(a: BusinessAction): void;
  onPrepare(a: BusinessAction): void;
  onComplete(a: BusinessAction): void;
  onDismiss(a: BusinessAction): void;
}

function ActionRow({ action, lang, onOpen, onPrepare, onComplete, onDismiss }: RowProps) {
  const l = L[lang];
  const copy = localizeAction(action, lang);
  const outcome = actionOutcome(action);
  const done = outcome === 'executed' || outcome === 'data_completed';
  return (
    <div data-testid="plan-action" className={`rounded-v2-xl border bg-white p-4 sm:p-5 transition-all ${done ? 'border-v2-success-200 bg-v2-success-50/20' : 'border-v2-border-light hover:border-v2-primary-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-v2-lg flex items-center justify-center shrink-0 ${done ? 'bg-v2-success-100 text-v2-success-600' : 'bg-v2-neutral-100 text-v2-neutral-500'}`}>
          {done ? <Check size={16} /> : <Target size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-v2-sm font-semibold text-v2-text-primary">{copy.title}</h3>
            {done && (
              <span className="text-v2-xs font-medium text-v2-success-600 bg-v2-success-50 border border-v2-success-200 rounded-full px-2 py-0.5">
                {outcome === 'executed' ? l.executed : l.dataDone}
              </span>
            )}
          </div>
          <p className="text-v2-xs text-v2-text-tertiary leading-relaxed mb-2">{copy.reason}</p>
          <div className="flex flex-wrap items-center gap-3 text-v2-xs text-v2-text-tertiary">
            <span className="flex items-center gap-1"><Clock size={11} /> {l.estimate(action.effortMinutes)}</span>
            <span className={`font-medium ${action.priority === 'HIGH' ? 'text-v2-error-500' : action.priority === 'MEDIUM' ? 'text-v2-warning-600' : 'text-v2-neutral-500'}`}>
              {l.priority}: {PRIORITY_LABELS[lang][action.priority]}
            </span>
            <OriginLabel origin={actionOrigin(action.sourceType)} />
          </div>
          {!done && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={() => onOpen(action)} className="inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-1.5 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors">
                {ctaLabel(action, lang)} <ArrowRight size={12} />
              </button>
              {canMarkDone(action) ? (
                <button onClick={() => onComplete(action)} className="inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light px-3 py-1.5 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-success-300 hover:text-v2-success-600 transition-colors">
                  <Check size={12} /> {l.markDone}
                </button>
              ) : (
                <span className="text-v2-xs text-v2-text-tertiary">{l.autoClose}</span>
              )}
            </div>
          )}
          {!done && offersImprovement(action) && <ImprovementHint lang={lang} onClick={() => onPrepare(action)} />}
        </div>
        {!done && (
          <button onClick={() => onDismiss(action)} aria-label={l.dismiss} title={l.dismiss} className="shrink-0 p-1.5 rounded-v2-md text-v2-neutral-400 hover:text-v2-text-primary hover:bg-v2-neutral-100 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  );
}

export default function PlanPage() {
  const { currentBusiness, loading: businessLoading } = useBusiness();
  const { lang } = useI18n();
  const l = L[lang];
  const navigate = useNavigate();
  const { actions, loading: actionsLoading, ready, error, ensureFresh, refresh, start, complete, dismiss, locked } = useActions();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => { ensureFresh(); }, [ensureFresh]);

  const { today, rest, closedThisWeek, report } = useMemo(() => {
    const todayList = selectTodayActions(actions);
    const todayIds = new Set(todayList.map((a) => a.id));
    const from = weekStart().getTime();
    return {
      today: todayList,
      rest: openActions(actions).filter((a) => !todayIds.has(a.id)),
      closedThisWeek: actions.filter((a) => {
        const outcome = actionOutcome(a);
        return (outcome === 'executed' || outcome === 'data_completed') && a.completedAt !== null && new Date(a.completedAt).getTime() >= from;
      }),
      report: buildActionReport(actions),
    };
  }, [actions]);

  const restByCategory = useMemo(() => {
    const groups = new Map<ActionCategory, BusinessAction[]>();
    rest.forEach((a) => groups.set(a.category, [...(groups.get(a.category) ?? []), a]));
    return Array.from(groups.entries());
  }, [rest]);

  const awaitingFirstSync = Boolean(currentBusiness?.onboarding_completed) && !ready;
  if (businessLoading || ((awaitingFirstSync || actionsLoading) && actions.length === 0)) {
    return <LoadingState message={l.loading} />;
  }

  if (error && actions.length === 0) {
    return (
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-8 text-center">
        <AlertTriangle size={32} className="text-v2-warning-500 mx-auto mb-3" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary mb-1">{l.errorTitle}</h2>
        <p className="text-v2-sm text-v2-text-secondary mb-4">{l.errorText}</p>
        <button onClick={() => refresh()} className="inline-flex items-center gap-2 px-4 py-2 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white text-v2-sm font-medium transition-colors">
          <RefreshCw size={14} /> {l.retry}
        </button>
      </div>
    );
  }

  const open = today.length + rest.length;
  const closed = report.executedThisWeek + report.dataCompletedThisWeek;
  const total = open + closed;
  const failWith = (fallback: string) => (err: unknown) => setActionError(err instanceof PremiumRequiredError ? l.locked : fallback);
  const handlers = {
    lang,
    onOpen: async (a: BusinessAction) => {
      setActionError(null);
      if (a.status === 'PENDING') {
        try {
          await start(a);
        } catch (err) {
          failWith(l.failStart)(err);
          return;
        }
      }
      navigate(actionTarget(a));
    },
    onPrepare: (a: BusinessAction) => navigate(`/ejecutar/${a.id}`),
    onComplete: (a: BusinessAction) => { setActionError(null); complete(a).catch(failWith(l.failComplete)); },
    onDismiss: (a: BusinessAction) => { setActionError(null); dismiss(a).catch(failWith(l.failDismiss)); },
  };

  if (!currentBusiness?.onboarding_completed && total === 0) {
    return (
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-8 text-center">
        <Target size={32} className="text-v2-neutral-300 mx-auto mb-3" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary mb-1">{l.emptyTitle}</h2>
        <p className="text-v2-sm text-v2-text-secondary mb-4">{l.emptyText}</p>
        <button onClick={() => navigate('/negocio')} className="inline-flex items-center gap-2 px-4 py-2 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white text-v2-sm font-medium transition-colors">
          {l.start} <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  const goal = goalLabel((currentBusiness?.primary_goal as GoalId | null) ?? null, lang);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{l.title}</h1>
        <p className="text-v2-sm text-v2-text-tertiary mt-1">{l.scope}</p>
        {goal && (
          <p className="text-v2-sm text-v2-text-secondary mt-1">
            {l.goal}: <span className="font-medium text-v2-text-primary">{goal}</span>
          </p>
        )}
      </div>
      {locked && <PaywallNotice surface="plan" />}
      {actionError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3">
          <AlertTriangle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="flex-1 text-v2-xs text-v2-error-600">{actionError}</p>
          <button onClick={() => setActionError(null)} aria-label={l.close} className="text-v2-error-400 hover:text-v2-error-600"><X size={14} /></button>
        </div>
      )}

      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-v2-primary-500" />
            <span className="text-v2-sm font-semibold text-v2-text-primary">{l.progress}</span>
          </div>
          <span className="text-v2-xs text-v2-text-tertiary">{closed} {l.of} {total} {l.actions}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-v2-neutral-100 overflow-hidden">
          <div className="h-full rounded-full bg-v2-primary-500 transition-all duration-500" style={{ width: `${report.weeklyProgress ?? 0}%` }} />
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-v2-lg bg-v2-secondary-50/50 border border-v2-border-light">
        <Info size={14} className="text-v2-secondary-500 mt-0.5 shrink-0" />
        <p className="text-v2-xs text-v2-text-secondary">{l.notice}</p>
      </div>

      {open === 0 && <p className="text-v2-sm text-v2-text-secondary">{l.allDone}</p>}

      {today.length > 0 && (
        <Section title={l.now}>
          {today.map((a) => <ActionRow key={a.id} action={a} {...handlers} />)}
        </Section>
      )}

      {restByCategory.length > 0 && (
        <Section title={l.week}>
          {restByCategory.map(([category, items]) => (
            <div key={category} className="space-y-2">
              <p className="text-v2-xs font-medium text-v2-text-secondary">{CATEGORY_LABELS[lang][category]}</p>
              {items.map((a) => <ActionRow key={a.id} action={a} {...handlers} />)}
            </div>
          ))}
        </Section>
      )}

      {closedThisWeek.length > 0 && (
        <Section title={l.done}>
          {closedThisWeek.map((a) => <ActionRow key={a.id} action={a} {...handlers} />)}
        </Section>
      )}
    </div>
  );
}
