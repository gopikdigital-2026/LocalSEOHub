import { ArrowRight, Clock, CheckCircle2, Target, Check, X, Info, RefreshCw, AlertTriangle, Building2, Loader2 } from 'lucide-react';
import type { DashboardAction } from './types';
import type { TodayState } from '../activation/milestones';
import { OriginLabel } from '../../components/DataIntegrity';
import ImprovementHint from '../improvement/ImprovementHint';

type Lang = 'es' | 'en';

const LABELS = {
  es: {
    heading: 'Misiones de hoy', one: 'misión', many: 'misiones', why: 'Por qué', value: 'Qué ganas',
    priority: 'Prioridad', done: 'Marcar como completada', dismiss: 'Descartar',
    estimate: (m: number) => `Estimado: ~${m} min`, autoClose: 'Se cierra sola al guardar el dato',
    emptyTitle: 'No hay acciones para hoy ahora mismo',
    emptyText: 'Cuando haya algo útil que hacer en tu negocio aparecerá aquí. Mientras tanto puedes revisar tu plan semanal.',
    loading: 'Preparando tus acciones...', retry: 'Reintentar',
    errorTitle: 'No hemos podido preparar tus acciones',
    errorText: 'Tus datos están guardados. Vuelve a intentarlo en unos segundos.',
    noDataTitle: 'Faltan algunos datos de tu negocio',
    noDataText: 'Necesitamos el nombre, la actividad, la ciudad y tu objetivo principal para recomendarte acciones.',
    noDataCta: 'Completar datos',
    caughtUpTitle: 'Estás al día',
    caughtUpText: 'Has resuelto las acciones prioritarias. Te avisaremos aquí cuando haya algo nuevo que merezca tu tiempo.',
    plan: 'Ver el plan', business: 'Revisar Negocio', sources: 'Ver Fuentes', week: 'Ver plan semanal',
    honest: 'Estas acciones salen de los datos de tu negocio y de buenas prácticas. Nunca inventamos cifras.',
  },
  en: {
    heading: "Today's missions", one: 'mission', many: 'missions', why: 'Why', value: 'What you gain',
    priority: 'Priority', done: 'Mark as completed', dismiss: 'Dismiss',
    estimate: (m: number) => `Estimate: ~${m} min`, autoClose: 'Closes on its own once the detail is saved',
    emptyTitle: 'There are no actions for today right now',
    emptyText: 'When there is something useful to do for your business it will show up here. Meanwhile you can review your weekly plan.',
    loading: 'Preparing your actions...', retry: 'Retry',
    errorTitle: "We couldn't prepare your actions",
    errorText: 'Your data is saved. Please try again in a few seconds.',
    noDataTitle: 'Some business details are missing',
    noDataText: 'We need the name, activity, city and your main goal to recommend actions.',
    noDataCta: 'Complete details',
    caughtUpTitle: "You're all caught up",
    caughtUpText: "You've handled the priority actions. We'll show new ones here when something deserves your time.",
    plan: 'See the plan', business: 'Review Business', sources: 'See Sources', week: 'See weekly plan',
    honest: 'These actions come from your business data and best practices. We never make up numbers.',
  },
};

interface TodaysMissionsProps {
  actions: DashboardAction[];
  state: TodayState;
  lang?: Lang;
  onRetry?: () => void;
  onNavigate: (path: string) => void;
  onExecute: (action: DashboardAction) => void;
  onComplete: (action: DashboardAction) => void;
  onDismiss: (action: DashboardAction) => void;
}

const priorityStyle: Record<string, string> = {
  high: 'bg-v2-error-50 text-v2-error-600 border-v2-error-200',
  medium: 'bg-v2-warning-50 text-v2-warning-600 border-v2-warning-200',
  low: 'bg-v2-neutral-50 text-v2-text-secondary border-v2-neutral-200',
};

function Header({ count, l }: { count: number; l: typeof LABELS.es }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-v2-primary-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">{l.heading}</h2>
      </div>
      {count > 0 && (
        <span className="text-v2-xs text-v2-text-tertiary font-medium">
          {count} {count === 1 ? l.one : l.many}
        </span>
      )}
    </div>
  );
}

function LinkButton({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={primary
        ? 'inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-1.5 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors'
        : 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light px-3 py-1.5 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors'}
    >
      {label} {primary && <ArrowRight size={12} />}
    </button>
  );
}

function EmptyBody({ state, l, onRetry, onNavigate }: {
  state: TodayState; l: typeof LABELS.es; onRetry?: () => void; onNavigate: (path: string) => void;
}) {
  if (state === 'LOADING' || state === 'ACTIONS') {
    return (
      <div className="flex flex-col items-center py-8 text-center" role="status" data-today-state="LOADING">
        <Loader2 size={24} className="text-v2-primary-500 animate-spin mb-3" />
        <p className="text-v2-sm text-v2-text-secondary">{l.loading}</p>
      </div>
    );
  }
  const body = {
    GENERATION_ERROR: { icon: <AlertTriangle size={28} className="text-v2-error-400 mb-3" />, title: l.errorTitle, text: l.errorText },
    NO_DATA: { icon: <Building2 size={28} className="text-v2-primary-400 mb-3" />, title: l.noDataTitle, text: l.noDataText },
    ALL_CAUGHT_UP: { icon: <CheckCircle2 size={32} className="text-v2-success-400 mb-3" />, title: l.caughtUpTitle, text: l.caughtUpText },
    NO_CURRENT_ACTIONS: { icon: <CheckCircle2 size={28} className="text-v2-neutral-300 mb-3" />, title: l.emptyTitle, text: l.emptyText },
  }[state];
  return (
    <div className="flex flex-col items-center py-8 text-center" data-today-state={state} role={state === 'GENERATION_ERROR' ? 'alert' : undefined}>
      {body.icon}
      <p className="text-v2-sm font-semibold text-v2-text-primary">{body.title}</p>
      <p className="text-v2-xs text-v2-text-tertiary mt-1 max-w-sm leading-relaxed">{body.text}</p>
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {state === 'GENERATION_ERROR' && onRetry && (
          <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-1.5 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors">
            <RefreshCw size={12} /> {l.retry}
          </button>
        )}
        {state === 'NO_DATA' && <LinkButton primary label={l.noDataCta} onClick={() => onNavigate('/negocio')} />}
        {state === 'ALL_CAUGHT_UP' && (
          <>
            <LinkButton label={l.plan} onClick={() => onNavigate('/plan')} />
            <LinkButton label={l.business} onClick={() => onNavigate('/negocio')} />
            <LinkButton label={l.sources} onClick={() => onNavigate('/fuentes')} />
          </>
        )}
        {state === 'NO_CURRENT_ACTIONS' && <LinkButton label={l.week} onClick={() => onNavigate('/plan')} />}
      </div>
    </div>
  );
}

export default function TodaysMissions({
  actions, state, lang = 'es', onRetry, onNavigate, onExecute, onComplete, onDismiss,
}: TodaysMissionsProps) {
  const l = LABELS[lang];

  if (state !== 'ACTIONS' || actions.length === 0) {
    return (
      <section className="v2-card" aria-label={l.heading}>
        <Header count={0} l={l} />
        <EmptyBody state={state} l={l} onRetry={onRetry} onNavigate={onNavigate} />
      </section>
    );
  }

  return (
    <section className="v2-card" aria-label={l.heading}>
      <Header count={actions.length} l={l} />

      <div className="space-y-3">
        {actions.map((action, idx) => (
          <article
            key={action.id}
            data-testid="today-action"
            className="group relative p-4 rounded-v2-xl border border-v2-border-light hover:border-v2-primary-200 hover:bg-v2-primary-50/30 transition-all duration-200"
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-v2-neutral-100 border border-v2-neutral-200 flex items-center justify-center">
                <span className="text-v2-xs font-bold text-v2-text-secondary">{idx + 1}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityStyle[action.impact]}`}>
                    {l.priority}: {action.priorityLabel}
                  </span>
                  <OriginLabel origin={action.origin} />
                </div>
                <h3 className="text-v2-sm font-semibold text-v2-text-primary">{action.title}</h3>
                <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">{action.explanation}</p>
                <p className="text-v2-xs text-v2-text-secondary mt-2 leading-relaxed">
                  <span className="font-semibold text-v2-text-primary">{l.why}:</span> {action.reason}
                </p>
                {action.value && (
                  <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">
                    <span className="font-semibold text-v2-text-primary">{l.value}:</span> {action.value}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button
                    onClick={() => onExecute(action)}
                    className="inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-1.5 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors"
                  >
                    {action.ctaLabel} <ArrowRight size={12} />
                  </button>
                  {action.canMarkDone ? (
                    <button
                      onClick={() => onComplete(action)}
                      className="inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light px-3 py-1.5 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-success-300 hover:text-v2-success-600 transition-colors"
                    >
                      <Check size={12} /> {l.done}
                    </button>
                  ) : (
                    <span className="text-[11px] text-v2-text-tertiary">{l.autoClose}</span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-v2-text-tertiary ml-auto">
                    <Clock size={11} /> {l.estimate(action.estimatedMinutes)}
                  </span>
                </div>
                {action.improveTo && (
                  <ImprovementHint lang={lang} onClick={() => onNavigate(action.improveTo as string)} />
                )}
              </div>

              <button
                onClick={() => onDismiss(action)}
                aria-label={l.dismiss}
                title={l.dismiss}
                className="shrink-0 p-1.5 rounded-v2-md text-v2-neutral-400 hover:text-v2-text-primary hover:bg-v2-neutral-100 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>

      <p className="flex items-start gap-1.5 mt-4 text-[11px] text-v2-text-tertiary leading-relaxed">
        <Info size={12} className="shrink-0 mt-0.5" /> {l.honest}
      </p>
    </section>
  );
}
