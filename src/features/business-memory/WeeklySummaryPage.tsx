import { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GoalId } from './types';
import { useBusiness } from './BusinessContext';
import { useActions } from '../actions/ActionsContext';
import { CATEGORY_LABELS, actionTarget, buildActionReport, localizeAction, weekStart } from '../actions/engine';
import { goalLabel } from '../activation/milestones';
import { useI18n } from '../../lib/i18n';
import { trackWeeklySummaryView, trackRealDataViewed } from '../../services/analytics/v2Analytics';
import { NoDataState } from '../../components/DataIntegrity';
import { LoadingState } from '../../components/ui';
import WeeklyContentReport from '../weekly-content/WeeklyContentReport';
import { AlertTriangle, ArrowRight, BarChart2, Calendar, CheckCircle2, ClipboardCheck, Clock, ListTodo, RefreshCw, Target, Ban } from 'lucide-react';

const T = {
  es: {
    title: 'Resumen semanal', loading: 'Preparando tu resumen...',
    errorTitle: 'No hemos podido cargar tu resumen', errorText: 'Tus datos están guardados. Inténtalo de nuevo en unos segundos.', retry: 'Reintentar',
    emptyTitle: 'Tu primer informe todavía no está disponible.',
    emptyText: 'Cuando tengas acciones en tu plan, aquí verás lo que has hecho cada semana. Solo mostramos actividad real, nunca cifras inventadas.',
    goPlan: 'Ir a mi plan',
    activity: 'Tu actividad esta semana',
    activityNote: 'Esto es lo que has hecho en LocalSEOHub. No es una medición de resultados en Google ni en tus ventas.',
    executed: 'Acciones hechas por ti', dataDone: 'Datos completados', pending: 'Pendientes', time: 'Tiempo estimado',
    timeNote: 'Estimación según la duración prevista de cada acción hecha.',
    byCategory: 'Por categoría', catLine: (e: number, d: number, p: number) => `${e} hechas · ${d} datos · ${p} pendientes`,
    goal: 'Tu objetivo', goalLine: (c: number, p: number) => `${c} acciones relacionadas cerradas esta semana · ${p} pendientes`,
    goalNote: 'Indica el trabajo dedicado a tu objetivo, no si ya lo has conseguido.', noGoal: 'Aún no has elegido un objetivo principal.', setGoal: 'Elegir objetivo',
    results: 'Resultados externos', notMeasured: 'No medido',
    visits: 'Visitas a tu web', visitsWhy: 'No hay ninguna herramienta de analítica conectada. La conexión con Google Analytics aún no está disponible.',
    bookings: 'Reservas', bookingsWhy: 'No tenemos acceso a tu sistema de reservas.',
    ranking: 'Posición en Google', rankingWhy: 'LocalSEOHub no mide posiciones en los resultados de búsqueda.',
    conversions: 'Clientes y ventas', conversionsWhy: 'No vinculamos tus acciones con clientes o ingresos, así que no podemos atribuirles resultados.',
    next: 'Siguiente acción recomendada', nextEmpty: 'No tienes acciones pendientes. Te avisaremos cuando haya algo nuevo que merezca tu tiempo.', open: 'Abrir',
    dismissed: (n: number) => `${n} descartada${n === 1 ? '' : 's'} por ti esta semana`,
  },
  en: {
    title: 'Weekly summary', loading: 'Preparing your summary...',
    errorTitle: 'We could not load your summary', errorText: 'Your data is saved. Please try again in a few seconds.', retry: 'Retry',
    emptyTitle: 'Your first report is not available yet.',
    emptyText: 'Once you have actions in your plan, you will see what you did each week here. We only show real activity, never made-up numbers.',
    goPlan: 'Go to my plan',
    activity: 'Your activity this week',
    activityNote: 'This is what you did in LocalSEOHub. It is not a measurement of results on Google or in your sales.',
    executed: 'Actions done by you', dataDone: 'Details completed', pending: 'Pending', time: 'Estimated time',
    timeNote: 'Estimate based on the expected duration of each completed action.',
    byCategory: 'By category', catLine: (e: number, d: number, p: number) => `${e} done · ${d} details · ${p} pending`,
    goal: 'Your goal', goalLine: (c: number, p: number) => `${c} related actions closed this week · ${p} pending`,
    goalNote: 'Shows the work put into your goal, not whether you have achieved it.', noGoal: 'You have not chosen a main goal yet.', setGoal: 'Choose goal',
    results: 'External results', notMeasured: 'Not measured',
    visits: 'Website visits', visitsWhy: 'No analytics tool is connected. The Google Analytics connection is not available yet.',
    bookings: 'Bookings', bookingsWhy: 'We do not have access to your booking system.',
    ranking: 'Google ranking', rankingWhy: 'LocalSEOHub does not measure positions in search results.',
    conversions: 'Customers and sales', conversionsWhy: 'We do not link your actions to customers or revenue, so we cannot attribute results to them.',
    next: 'Next recommended action', nextEmpty: 'You have no pending actions. We will let you know when something new deserves your time.', open: 'Open',
    dismissed: (n: number) => `${n} dismissed by you this week`,
  },
};

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
      <div className="flex items-center gap-2 mb-2 text-v2-neutral-500">{icon}<span className="text-v2-xs font-medium text-v2-text-tertiary">{label}</span></div>
      <p className="text-v2-xl font-bold text-v2-text-primary">{value}</p>
      {note && <p className="text-v2-xs text-v2-text-tertiary mt-1 leading-relaxed">{note}</p>}
    </div>
  );
}

export default function WeeklySummaryPage() {
  const navigate = useNavigate();
  const { currentBusiness, loading: businessLoading } = useBusiness();
  const { actions, ready, loading, error, refresh, ensureFresh } = useActions();
  const { lang } = useI18n();
  const t = T[lang];
  const goal = (currentBusiness?.primary_goal as GoalId | null) ?? null;
  const report = useMemo(() => buildActionReport(actions, new Date(), goal), [actions, goal]);
  const hasData = actions.length > 0;

  useEffect(() => { ensureFresh(); }, [ensureFresh]);
  useEffect(() => { trackWeeklySummaryView(); }, []);
  useEffect(() => { if (hasData) trackRealDataViewed('weekly_summary'); }, [hasData]);

  const awaitingFirstSync = Boolean(currentBusiness?.onboarding_completed) && !ready;
  if (businessLoading || ((awaitingFirstSync || loading) && !hasData)) return <LoadingState message={t.loading} />;

  if (error && !hasData) {
    return (
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-8 text-center">
        <AlertTriangle size={32} className="text-v2-warning-500 mx-auto mb-3" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary mb-1">{t.errorTitle}</h2>
        <p className="text-v2-sm text-v2-text-secondary mb-4">{t.errorText}</p>
        <button onClick={() => refresh()} className="inline-flex items-center gap-2 px-4 py-2 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white text-v2-sm font-medium transition-colors">
          <RefreshCw size={14} /> {t.retry}
        </button>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="space-y-6 sm:space-y-8 pb-8">
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{t.title}</h1>
        <NoDataState surface="weekly_summary" icon={<BarChart2 size={20} />} title={t.emptyTitle} description={t.emptyText} primaryLabel={t.goPlan} primaryTo="/plan" />
      </div>
    );
  }

  const locale = lang === 'en' ? 'en-GB' : 'es-ES';
  const from = weekStart();
  const to = new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const goalText = goalLabel(goal, lang);
  const next = report.nextAction;
  const unmeasured = [
    { label: t.visits, why: t.visitsWhy },
    { label: t.bookings, why: t.bookingsWhy },
    { label: t.ranking, why: t.rankingWhy },
    { label: t.conversions, why: t.conversionsWhy },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{t.title}</h1>
        <div className="flex items-center gap-2 mt-2">
          <Calendar size={14} className="text-v2-neutral-400" />
          <p className="text-v2-sm text-v2-text-secondary">{fmt(from)} - {fmt(to)}</p>
        </div>
      </div>

      <section data-testid="action-report" className="space-y-3">
        <div>
          <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.activity}</h2>
          <p className="text-v2-xs text-v2-text-tertiary mt-1">{t.activityNote}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<CheckCircle2 size={14} />} label={t.executed} value={String(report.executedThisWeek)} />
          <Stat icon={<ClipboardCheck size={14} />} label={t.dataDone} value={String(report.dataCompletedThisWeek)} />
          <Stat icon={<ListTodo size={14} />} label={t.pending} value={String(report.pending)} />
          <Stat icon={<Clock size={14} />} label={t.time} value={`~${report.executedMinutesThisWeek} min`} note={t.timeNote} />
        </div>
        {report.dismissedThisWeek > 0 && (
          <p className="flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary"><Ban size={12} /> {t.dismissed(report.dismissedThisWeek)}</p>
        )}
        {report.byCategory.length > 0 && (
          <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
            <p className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider mb-3">{t.byCategory}</p>
            <ul className="divide-y divide-v2-border-light">
              {report.byCategory.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-3 py-2 text-v2-sm">
                  <span className="font-medium text-v2-text-primary">{CATEGORY_LABELS[lang][c.category]}</span>
                  <span className="text-v2-xs text-v2-text-secondary">{t.catLine(c.executed, c.dataCompleted, c.pending)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Target size={16} className="text-v2-primary-500" />
          <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.goal}</h2>
        </div>
        {goalText && report.goalActivity ? (
          <>
            <p className="text-v2-sm font-medium text-v2-text-primary first-letter:uppercase">{goalText}</p>
            <p className="text-v2-sm text-v2-text-secondary mt-1">{t.goalLine(report.goalActivity.closed, report.goalActivity.pending)}</p>
            <p className="text-v2-xs text-v2-text-tertiary mt-2">{t.goalNote}</p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-v2-sm text-v2-text-secondary">{t.noGoal}</p>
            <button onClick={() => navigate('/negocio/objetivos')} className="text-v2-sm font-medium text-v2-primary-600 hover:text-v2-primary-700">{t.setGoal}</button>
          </div>
        )}
      </section>

      <WeeklyContentReport businessId={currentBusiness?.id ?? null} lang={lang} onNavigate={navigate} />

      <section data-testid="external-results" className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
        <h2 className="text-v2-base font-semibold text-v2-text-primary mb-3">{t.results}</h2>
        <ul className="space-y-3">
          {unmeasured.map((m) => (
            <li key={m.label} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-v2-sm font-medium text-v2-text-primary">{m.label}</p>
                <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{m.why}</p>
              </div>
              <span className="shrink-0 rounded-full border border-v2-border-light bg-v2-neutral-50 px-2.5 py-0.5 text-v2-xs font-medium text-v2-text-secondary">{t.notMeasured}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-v2-xl border border-v2-primary-200 bg-v2-primary-50/50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-v2-lg bg-v2-primary-100 flex items-center justify-center shrink-0">
            <ArrowRight size={16} className="text-v2-primary-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-v2-xs font-semibold text-v2-primary-600 uppercase tracking-wider mb-1">{t.next}</p>
            {next ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-v2-sm text-v2-text-primary leading-relaxed">{localizeAction(next, lang).title}</p>
                <button onClick={() => navigate(actionTarget(next))} className="inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-1.5 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors">
                  {t.open} <ArrowRight size={12} />
                </button>
              </div>
            ) : (
              <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{t.nextEmpty}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
