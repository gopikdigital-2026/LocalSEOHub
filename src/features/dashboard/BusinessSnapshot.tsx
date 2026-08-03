import { Building2, MapPin, Star, MessageSquare, Image } from 'lucide-react';

interface SnapshotStat {
  id: string;
  label: string;
  value: string | number | null;
  icon: 'rating' | 'reviews' | 'photos' | 'location' | 'category';
  change?: string;
}

interface BusinessSnapshotProps {
  businessName: string;
  category: string;
  city: string;
  stats: SnapshotStat[];
}

const iconMap = {
  rating: Star,
  reviews: MessageSquare,
  photos: Image,
  location: MapPin,
  category: Building2,
};

const iconColors = {
  rating: 'text-v2-warning-500 bg-v2-warning-50',
  reviews: 'text-v2-info-600 bg-v2-info-50',
  photos: 'text-v2-success-600 bg-v2-success-50',
  location: 'text-v2-primary-600 bg-v2-primary-50',
  category: 'text-v2-neutral-600 bg-v2-neutral-100',
};

export default function BusinessSnapshot({ businessName, category, city, stats }: BusinessSnapshotProps) {
  const initial = businessName.charAt(0).toUpperCase();

  return (
    <section className="v2-card" aria-label="Snapshot del negocio">
      {/* Business identity */}
      <div className="flex items-center gap-3.5 mb-5 pb-5 border-b border-v2-border-light">
        <div className="w-12 h-12 rounded-full bg-v2-primary-50 border-2 border-v2-primary-100 flex items-center justify-center shrink-0">
          <span className="text-lg font-bold text-v2-primary-600">{initial}</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-v2-base font-semibold text-v2-text-primary truncate">{businessName}</h2>
          <p className="text-v2-xs text-v2-text-secondary truncate">
            {category}{city && ` · ${city}`}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="space-y-3">
        {stats.map((stat) => {
          const Icon = iconMap[stat.icon];
          const colorClasses = iconColors[stat.icon];
          return (
            <div key={stat.id} className="flex items-center gap-3">
              <div className={`shrink-0 w-8 h-8 rounded-v2-md ${colorClasses} flex items-center justify-center`}>
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-v2-xs text-v2-text-tertiary">{stat.label}</span>
              </div>
              <div className="text-right">
                <span className="text-v2-sm font-semibold text-v2-text-primary">
                  {stat.value !== null ? stat.value : '--'}
                </span>
                {stat.change && (
                  <span className="block text-[10px] text-v2-success-600 font-medium">{stat.change}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export type { SnapshotStat };
