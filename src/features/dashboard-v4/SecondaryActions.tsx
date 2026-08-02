import { ArrowRight, Clock, TrendingUp } from 'lucide-react';
import type { DashboardAction } from './dashboardV4.types';
import { DataStatusBadge } from '../../components/data-status';
import { trackDashboardSecondaryActionClick } from './dashboardV4.analytics';

interface SecondaryActionsProps {
  actions: DashboardAction[];
  onPrepare: (action: DashboardAction) => void;
}

const impactColors = { high: 'text-v2-error-500', medium: 'text-v2-warning-600', low: 'text-v2-text-tertiary' };

export default function SecondaryActions({ actions, onPrepare }: SecondaryActionsProps) {
  if (actions.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Acciones secundarias">
      <h2 className="text-v2-sm font-semibold text-v2-text-primary">Otras acciones recomendadas</h2>
      <div className="space-y-2.5">
        {actions.slice(0, 2).map((action) => (
          <div
            key={action.id}
            className="group bg-white rounded-v2-xl border border-v2-border hover:border-v2-border-dark p-4 transition-all duration-v2-normal"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-v2-sm font-medium text-v2-text-primary truncate">{action.title}</h3>
                  <DataStatusBadge confidence={action.confidence} className="scale-[0.8] origin-left shrink-0" />
                </div>
                <div className="flex items-center gap-3 text-v2-xs text-v2-text-tertiary">
                  <span className="flex items-center gap-1"><Clock size={11} /> {action.estimatedMinutes} min</span>
                  <span className={`flex items-center gap-1 font-medium ${impactColors[action.impact]}`}>
                    <TrendingUp size={11} /> {action.impact === 'high' ? 'Alto' : action.impact === 'medium' ? 'Medio' : 'Bajo'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  trackDashboardSecondaryActionClick(action.id, action.actionType);
                  onPrepare(action);
                }}
                className="shrink-0 p-2 rounded-v2-md text-v2-neutral-400 hover:text-v2-primary-600 hover:bg-v2-primary-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Preparar: ${action.title}`}
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
