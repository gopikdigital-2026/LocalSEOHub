import { ArrowRight, Clock, CheckCircle2, Target } from 'lucide-react';
import type { DashboardAction } from './types';

interface TodaysMissionsProps {
  actions: DashboardAction[];
  onExecute: (action: DashboardAction) => void;
}

const impactDot: Record<string, string> = {
  high: 'bg-v2-error-500',
  medium: 'bg-v2-warning-500',
  low: 'bg-v2-neutral-300',
};

export default function TodaysMissions({ actions, onExecute }: TodaysMissionsProps) {
  if (actions.length === 0) {
    return (
      <section className="v2-card" aria-label="Misiones de hoy">
        <div className="flex items-center gap-2 mb-4">
          <Target size={16} className="text-v2-primary-500" />
          <h2 className="text-v2-base font-semibold text-v2-text-primary">Misiones de hoy</h2>
        </div>
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle2 size={32} className="text-v2-success-400 mb-3" />
          <p className="text-v2-sm text-v2-text-secondary">No hay misiones pendientes hoy</p>
          <p className="text-v2-xs text-v2-text-tertiary mt-1">Conecta tus fuentes de datos para recibir recomendaciones</p>
        </div>
      </section>
    );
  }

  return (
    <section className="v2-card" aria-label="Misiones de hoy">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-v2-primary-500" />
          <h2 className="text-v2-base font-semibold text-v2-text-primary">Misiones de hoy</h2>
        </div>
        <span className="text-v2-xs text-v2-text-tertiary font-medium">
          {actions.length} {actions.length === 1 ? 'mision' : 'misiones'}
        </span>
      </div>

      <div className="space-y-3">
        {actions.map((action, idx) => (
          <div
            key={action.id}
            className="group relative flex items-start gap-4 p-4 rounded-v2-xl border border-v2-border-light hover:border-v2-primary-200 hover:bg-v2-primary-50/30 transition-all duration-200 cursor-pointer"
            onClick={() => onExecute(action)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onExecute(action)}
          >
            {/* Order number */}
            <div className="shrink-0 w-8 h-8 rounded-full bg-v2-neutral-100 border border-v2-neutral-200 flex items-center justify-center">
              <span className="text-v2-xs font-bold text-v2-text-secondary">{idx + 1}</span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${impactDot[action.impact]}`} />
                <h3 className="text-v2-sm font-semibold text-v2-text-primary truncate">{action.title}</h3>
              </div>
              <p className="text-v2-xs text-v2-text-secondary line-clamp-2">{action.explanation}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-[11px] text-v2-text-tertiary">
                  <Clock size={11} /> {action.estimatedMinutes} min
                </span>
                <span className="text-[11px] text-v2-text-tertiary">{action.source}</span>
              </div>
            </div>

            {/* Arrow */}
            <div className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight size={16} className="text-v2-primary-500" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
