import { ArrowRight, Clock, TrendingUp } from 'lucide-react';
import type { DashboardAction } from './dashboardV4.types';
import { DataStatusBadge, DataSourceInfo } from '../../components/data-status';
import { trackDashboardPrimaryActionClick } from './dashboardV4.analytics';

interface TodayPriorityProps {
  action: DashboardAction | null;
  onPrepare: (action: DashboardAction) => void;
}

const impactColors = { high: 'text-v2-error-500', medium: 'text-v2-warning-600', low: 'text-v2-text-tertiary' };
const impactLabels = { high: 'Alto', medium: 'Medio', low: 'Bajo' };

export default function TodayPriority({ action, onPrepare }: TodayPriorityProps) {
  if (!action) {
    return (
      <section className="v2-card" aria-label="Prioridad de hoy">
        <h2 className="text-v2-base font-semibold text-v2-text-primary mb-2">Prioridad de hoy</h2>
        <p className="text-v2-sm text-v2-text-tertiary">
          No hay acciones disponibles. Conecta una fuente de datos para recibir recomendaciones.
        </p>
      </section>
    );
  }

  function handleClick() {
    trackDashboardPrimaryActionClick(action!.id, action!.actionType);
    onPrepare(action!);
  }

  return (
    <section className="v2-card" aria-label="Prioridad de hoy">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Prioridad de hoy</h2>
        <DataStatusBadge confidence={action.confidence} />
      </div>

      <div className="space-y-3">
        <h3 className="text-v2-lg font-semibold text-v2-text-primary">{action.title}</h3>
        <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{action.explanation}</p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          <span className="flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary">
            <Clock size={13} /> {action.estimatedMinutes} min
          </span>
          <span className={`flex items-center gap-1.5 text-v2-xs font-medium ${impactColors[action.impact]}`}>
            <TrendingUp size={13} /> Impacto {impactLabels[action.impact]}
          </span>
          <DataSourceInfo
            source={action.source}
            sourceType="google_business"
            updatedAt={null}
            confidence={action.confidence}
          />
        </div>

        <p className="text-v2-xs text-v2-text-tertiary italic pt-1">
          {action.reason}
        </p>
      </div>

      <div className="mt-5 pt-4 border-t border-v2-border-light">
        <button onClick={handleClick} className="v2-btn-primary">
          {action.ctaLabel} <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
