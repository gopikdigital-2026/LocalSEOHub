import { TrendingUp, CheckCircle2, Circle, ArrowUpRight } from 'lucide-react';

interface GrowthMilestone {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  date?: string;
}

interface GrowthTimelineProps {
  milestones: GrowthMilestone[];
  overallProgress: number;
  onViewDetails?: () => void;
}

export default function GrowthTimeline({ milestones, overallProgress, onViewDetails }: GrowthTimelineProps) {
  const completedCount = milestones.filter(m => m.completed).length;

  return (
    <section className="v2-card" aria-label="Linea de crecimiento">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-v2-primary-500" />
          <h2 className="text-v2-base font-semibold text-v2-text-primary">Crecimiento</h2>
        </div>
        {onViewDetails && (
          <button onClick={onViewDetails} className="flex items-center gap-1 text-v2-xs text-v2-primary-600 hover:text-v2-primary-700 font-medium transition-colors">
            Ver detalles <ArrowUpRight size={12} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-v2-xs text-v2-text-secondary font-medium">Progreso general</span>
          <span className="text-v2-xs font-bold text-v2-text-primary">{overallProgress}%</span>
        </div>
        <div className="h-2 bg-v2-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-v2-primary-400 to-v2-primary-600 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <p className="text-[11px] text-v2-text-tertiary mt-1.5">
          {completedCount} de {milestones.length} hitos completados
        </p>
      </div>

      {/* Timeline */}
      <div className="relative pl-6 space-y-4">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-1 bottom-1 w-px bg-v2-neutral-200" />

        {milestones.slice(0, 5).map((milestone) => (
          <div key={milestone.id} className="relative flex items-start gap-3">
            {/* Dot */}
            <div className="absolute -left-6 top-0.5">
              {milestone.completed ? (
                <CheckCircle2 size={18} className="text-v2-success-500 bg-white rounded-full" />
              ) : (
                <Circle size={18} className="text-v2-neutral-300 bg-white rounded-full" />
              )}
            </div>

            {/* Content */}
            <div className="min-w-0">
              <p className={`text-v2-sm font-medium ${milestone.completed ? 'text-v2-text-primary' : 'text-v2-text-secondary'}`}>
                {milestone.title}
              </p>
              {milestone.description && (
                <p className="text-[11px] text-v2-text-tertiary mt-0.5">{milestone.description}</p>
              )}
              {milestone.date && (
                <span className="text-[10px] text-v2-text-tertiary">{milestone.date}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export type { GrowthMilestone };
