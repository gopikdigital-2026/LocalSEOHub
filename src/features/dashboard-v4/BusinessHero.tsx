import { useEffect } from 'react';
import { Edit3, RefreshCw } from 'lucide-react';
import type { ConnectionEntry } from './dashboardV4.types';
import { trackDashboardV4View } from './dashboardV4.analytics';

interface BusinessHeroProps {
  name: string;
  category: string;
  city: string;
  connections: ConnectionEntry[];
  lastGlobalSync: string | null;
  onEdit: () => void;
  onSync: () => void;
}

function timeAgo(timestamp: string | null): string {
  if (!timestamp) return 'Pendiente';
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

const statusStyles: Record<string, string> = {
  connected: 'bg-v2-success-50 text-v2-success-700 border-v2-success-200',
  pending: 'bg-v2-warning-50 text-v2-warning-700 border-v2-warning-200',
  not_connected: 'bg-v2-neutral-100 text-v2-neutral-500 border-v2-neutral-200',
};

const statusLabels: Record<string, string> = {
  connected: 'Conectado',
  pending: 'Pendiente',
  not_connected: 'No conectado',
};

const statusDots: Record<string, string> = {
  connected: 'bg-v2-success-500',
  pending: 'bg-v2-warning-500',
  not_connected: 'bg-v2-neutral-300',
};

export default function BusinessHero({ name, category, city, connections, lastGlobalSync, onEdit, onSync }: BusinessHeroProps) {
  useEffect(() => {
    trackDashboardV4View();
  }, []);

  const initial = name.charAt(0).toUpperCase();

  return (
    <section className="v2-card-lg" aria-label="Informacion del negocio">
      <div className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-8">
        {/* Logo / Initial */}
        <div className="shrink-0 self-center sm:self-start">
          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-v2-primary-50 border-2 border-v2-primary-100 flex items-center justify-center">
            <span className="text-2xl sm:text-3xl font-bold text-v2-primary-600">{initial}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          {/* Name */}
          <h1 className="text-[28px] sm:text-[36px] lg:text-v2-4xl font-bold text-v2-text-primary leading-tight tracking-tight">
            {name}
          </h1>

          {/* Category · City */}
          <p className="mt-1.5 text-v2-base sm:text-v2-lg text-v2-text-secondary">
            {category || 'Sin categoria'}
            {city && <span className="text-v2-neutral-300 mx-2">·</span>}
            {city && <span className="text-v2-text-tertiary">{city}</span>}
          </p>

          {/* Connection badges */}
          <div className="mt-5 flex flex-wrap gap-2 justify-center sm:justify-start" aria-label="Estado de conexiones">
            {connections.map((conn) => (
              <span
                key={conn.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-medium rounded-full border transition-colors duration-v2-normal ${statusStyles[conn.status]}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusDots[conn.status]}`} />
                {conn.label} · {statusLabels[conn.status]}
              </span>
            ))}
          </div>

          {/* Last sync */}
          <p className="mt-4 text-v2-xs text-v2-text-tertiary">
            Ultima sincronizacion: {timeAgo(lastGlobalSync)}
          </p>

          {/* Buttons */}
          <div className="mt-5 flex flex-wrap gap-3 justify-center sm:justify-start">
            <button onClick={onEdit} className="v2-btn-secondary v2-btn-sm">
              <Edit3 size={14} /> Editar empresa
            </button>
            <button onClick={onSync} className="v2-btn-primary v2-btn-sm">
              <RefreshCw size={14} /> Sincronizar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
