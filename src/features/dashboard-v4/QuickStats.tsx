import { MapPin, MessageSquare, Star, Calendar, Target } from 'lucide-react';
import type { QuickStatItem } from './dashboardV4.types';
import { DataStatusBadge } from '../../components/data-status';

interface QuickStatsProps {
  stats: QuickStatItem[];
}

const ICONS: Record<string, React.ReactNode> = {
  position: <MapPin size={15} />,
  reviews: <MessageSquare size={15} />,
  rating: <Star size={15} />,
  posts: <Calendar size={15} />,
  competitors: <Target size={15} />,
};

export default function QuickStats({ stats }: QuickStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" aria-label="Estadisticas rapidas">
      {stats.map((stat) => (
        <div key={stat.id} className="bg-white rounded-v2-xl border border-v2-border p-4 flex flex-col gap-2 transition-colors duration-v2-normal hover:border-v2-border-dark">
          <div className="flex items-center gap-2 text-v2-neutral-400">
            {ICONS[stat.id] || <Target size={15} />}
            <span className="text-v2-xs font-medium text-v2-text-tertiary">{stat.label}</span>
          </div>
          {stat.value ? (
            <div className="flex items-baseline gap-2">
              <span className="text-v2-lg font-bold text-v2-text-primary tabular-nums">{stat.value}</span>
              {stat.confidence && <DataStatusBadge confidence={stat.confidence} className="scale-[0.85] origin-left" />}
            </div>
          ) : (
            <span className="text-v2-xs text-v2-neutral-400">
              Conectar fuente
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
