import { Shield, AlertTriangle, Eye } from 'lucide-react';

interface CompetitorAlert {
  id: string;
  competitorName: string;
  event: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
}

interface CompetitorAlertsProps {
  alerts: CompetitorAlert[];
  onViewAll?: () => void;
}

const severityStyles: Record<string, { dot: string; bg: string }> = {
  high: { dot: 'bg-v2-error-500', bg: 'bg-v2-error-50' },
  medium: { dot: 'bg-v2-warning-500', bg: 'bg-v2-warning-50' },
  low: { dot: 'bg-v2-neutral-400', bg: 'bg-v2-neutral-50' },
};

function formatRelativeTime(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'Hace unos minutos';
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ayer';
  return `Hace ${days} dias`;
}

export default function CompetitorAlerts({ alerts, onViewAll }: CompetitorAlertsProps) {
  return (
    <section className="v2-card" aria-label="Alertas de competidores">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-v2-primary-500" />
          <h2 className="text-v2-base font-semibold text-v2-text-primary">Competidores</h2>
        </div>
        {alerts.length > 0 && (
          <span className="v2-badge bg-v2-error-50 text-v2-error-700 border border-v2-error-200">
            {alerts.length} {alerts.length === 1 ? 'alerta' : 'alertas'}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <Eye size={28} className="text-v2-neutral-300 mb-2" />
          <p className="text-v2-sm text-v2-text-secondary">Sin alertas de competidores</p>
          <p className="text-v2-xs text-v2-text-tertiary mt-1">Conecta tus fuentes para monitorizar la competencia</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {alerts.slice(0, 4).map((alert) => {
            const style = severityStyles[alert.severity];
            return (
              <div key={alert.id} className="flex items-start gap-3 p-3 rounded-v2-lg bg-v2-neutral-25 border border-v2-border-light">
                <div className={`shrink-0 w-7 h-7 rounded-full ${style.bg} flex items-center justify-center mt-0.5`}>
                  <AlertTriangle size={12} className={alert.severity === 'high' ? 'text-v2-error-500' : 'text-v2-warning-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-v2-sm text-v2-text-primary font-medium truncate">{alert.competitorName}</p>
                  <p className="text-v2-xs text-v2-text-secondary mt-0.5">{alert.event}</p>
                  <span className="text-[11px] text-v2-text-tertiary">{formatRelativeTime(alert.timestamp)}</span>
                </div>
                <span className={`shrink-0 w-2 h-2 rounded-full ${style.dot} mt-2`} />
              </div>
            );
          })}

          {onViewAll && alerts.length > 4 && (
            <button onClick={onViewAll} className="w-full text-center text-v2-xs text-v2-primary-600 hover:text-v2-primary-700 font-medium py-2 transition-colors">
              Ver todas las alertas
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export type { CompetitorAlert };
