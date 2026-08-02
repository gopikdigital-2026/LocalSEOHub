import { Edit3, Sparkles, Target, Zap } from 'lucide-react';
import type { TimelineEvent } from '../business-memory/types';
import { trackDashboardHistoryClick } from './dashboardV4.analytics';

interface RecentActivityTimelineProps {
  events: TimelineEvent[];
  onViewHistory: () => void;
}

function timeAgo(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hace 1 dia';
  return `Hace ${days} dias`;
}

const typeIcons: Record<string, React.ReactNode> = {
  action_completed: <Zap size={12} className="text-v2-success-500" />,
  goal_set: <Target size={12} className="text-v2-primary-500" />,
  profile_updated: <Edit3 size={12} className="text-v2-neutral-500" />,
  insight_generated: <Sparkles size={12} className="text-v2-warning-500" />,
};

export default function RecentActivityTimeline({ events, onViewHistory }: RecentActivityTimelineProps) {
  const items = events.slice(0, 5);

  if (items.length === 0) {
    return (
      <section className="v2-card" aria-label="Actividad reciente">
        <h2 className="text-v2-sm font-semibold text-v2-text-primary mb-3">Actividad reciente</h2>
        <p className="text-v2-xs text-v2-text-tertiary">
          La actividad de tu negocio aparecera aqui a medida que realices acciones.
        </p>
      </section>
    );
  }

  return (
    <section className="v2-card" aria-label="Actividad reciente">
      <h2 className="text-v2-sm font-semibold text-v2-text-primary mb-4">Actividad reciente</h2>

      <div className="space-y-0">
        {items.map((event, i) => (
          <div key={event.id} className="flex items-start gap-3 py-2.5 relative">
            {i < items.length - 1 && (
              <div className="absolute left-[9px] top-9 bottom-0 w-px bg-v2-neutral-100" aria-hidden="true" />
            )}
            <div className="w-5 h-5 rounded-full bg-v2-neutral-50 border border-v2-border-light flex items-center justify-center shrink-0 relative z-10">
              {typeIcons[event.type] || <Zap size={10} className="text-v2-neutral-300" />}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <span className="text-v2-sm text-v2-text-secondary truncate">{event.title}</span>
              <span className="text-v2-xs text-v2-text-tertiary whitespace-nowrap shrink-0">{timeAgo(event.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => { trackDashboardHistoryClick(); onViewHistory(); }}
        className="mt-3 text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 transition-colors"
      >
        Ver historial
      </button>
    </section>
  );
}
