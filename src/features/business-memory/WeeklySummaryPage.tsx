import { useMemo, useEffect } from 'react';
import type { WeeklySummaryData } from './types';
import { AVAILABLE_GOALS, generateWeeklySummary } from './engine';
import { createLocalRepository } from './repository';
import { trackWeeklySummaryView } from '../../services/analytics/v2Analytics';
import { BarChart2, Clock, Target, TrendingUp, ArrowRight, Calendar } from 'lucide-react';

const repo = createLocalRepository();

const DEMO_SUMMARY: WeeklySummaryData = {
  weekStart: '2026-07-28T00:00:00Z',
  weekEnd: '2026-08-03T23:59:59Z',
  actionsCompleted: 6,
  timeInvestedMinutes: 42,
  goalsProgress: [
    { goalId: 'more_reviews', progress: 75 },
    { goalId: 'better_local_seo', progress: 50 },
  ],
  impactAchieved: { high: 2, medium: 3, low: 1 },
  topRecommendation: 'Mantener la actividad actual para consolidar resultados.',
};

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
      <div className="flex items-center gap-2 mb-2 text-v2-neutral-500">{icon}<span className="text-v2-xs font-medium text-v2-text-tertiary">{label}</span></div>
      <p className="text-v2-xl font-bold text-v2-text-primary">{value}</p>
      {sub && <p className="text-v2-xs text-v2-text-tertiary mt-1">{sub}</p>}
    </div>
  );
}

export default function WeeklySummaryPage() {
  const state = repo.load();
  const liveSummary = useMemo(() => generateWeeklySummary(state), [state]);
  const summary = liveSummary.actionsCompleted > 0 ? liveSummary : DEMO_SUMMARY;

  useEffect(() => { trackWeeklySummaryView(); }, []);

  const weekLabel = `${new Date(summary.weekStart).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${new Date(summary.weekEnd).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          Resumen semanal
        </h1>
        <div className="flex items-center gap-2 mt-2">
          <Calendar size={14} className="text-v2-neutral-400" />
          <p className="text-v2-sm text-v2-text-secondary">{weekLabel}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<TrendingUp size={14} />} label="Acciones" value={String(summary.actionsCompleted)} sub="completadas" />
        <StatCard icon={<Clock size={14} />} label="Tiempo" value={`${summary.timeInvestedMinutes} min`} sub="invertidos" />
        <StatCard icon={<BarChart2 size={14} />} label="Alto impacto" value={String(summary.impactAchieved.high)} sub="acciones" />
        <StatCard icon={<Target size={14} />} label="Objetivos" value={`${summary.goalsProgress.length}`} sub="en progreso" />
      </div>

      {/* Goals progress */}
      {summary.goalsProgress.length > 0 && (
        <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6 space-y-4">
          <h2 className="text-v2-base font-semibold text-v2-text-primary">Progreso de objetivos</h2>
          <div className="space-y-4">
            {summary.goalsProgress.map((gp) => {
              const goalDef = AVAILABLE_GOALS.find((g) => g.id === gp.goalId);
              return (
                <div key={gp.goalId}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-v2-sm text-v2-text-primary font-medium">{goalDef?.label ?? gp.goalId}</span>
                    <span className="text-v2-xs font-semibold text-v2-primary-600">{gp.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-v2-neutral-100 overflow-hidden">
                    <div className="h-full bg-v2-primary-500 rounded-full transition-all duration-500" style={{ width: `${gp.progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Impact breakdown */}
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
        <h2 className="text-v2-base font-semibold text-v2-text-primary mb-4">Impacto conseguido</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-v2-error-400" />
            <span className="text-v2-xs text-v2-text-secondary">Alto: {summary.impactAchieved.high}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-v2-warning-400" />
            <span className="text-v2-xs text-v2-text-secondary">Medio: {summary.impactAchieved.medium}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-v2-neutral-300" />
            <span className="text-v2-xs text-v2-text-secondary">Bajo: {summary.impactAchieved.low}</span>
          </div>
        </div>
      </div>

      {/* Top recommendation for next week */}
      <div className="rounded-v2-xl border border-v2-primary-200 bg-v2-primary-50/50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-v2-lg bg-v2-primary-100 flex items-center justify-center shrink-0">
            <ArrowRight size={16} className="text-v2-primary-600" />
          </div>
          <div>
            <p className="text-v2-xs font-semibold text-v2-primary-600 uppercase tracking-wider mb-1">Proxima semana</p>
            <p className="text-v2-sm text-v2-text-primary leading-relaxed">{summary.topRecommendation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
