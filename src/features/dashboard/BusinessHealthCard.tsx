import { Activity, TrendingUp, TrendingDown, Minus, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionEntry } from './types';

interface BusinessHealthCardProps {
  score: number | null;
  trend: 'up' | 'down' | 'stable';
  connections: ConnectionEntry[];
  pendingActions: number;
}

function ScoreRing({ score }: { score: number | null }) {
  const value = score ?? 0;
  const circumference = 2 * Math.PI * 40;
  const progress = (value / 100) * circumference;
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="40" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-v2-2xl font-bold text-v2-text-primary">
          {score !== null ? score : '--'}
        </span>
        <span className="text-[10px] text-v2-text-tertiary font-medium uppercase tracking-wider">Salud</span>
      </div>
    </div>
  );
}

export default function BusinessHealthCard({ score, trend, connections, pendingActions }: BusinessHealthCardProps) {
  const connectedCount = connections.filter(c => c.status === 'connected').length;
  const totalConnections = connections.length;

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-v2-success-600' : trend === 'down' ? 'text-v2-error-500' : 'text-v2-text-tertiary';
  const trendLabel = trend === 'up' ? 'Mejorando' : trend === 'down' ? 'Bajando' : 'Estable';

  return (
    <section className="v2-card" aria-label="Salud del negocio">
      <div className="flex items-center gap-2 mb-5">
        <Activity size={16} className="text-v2-primary-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Salud del negocio</h2>
      </div>

      <div className="flex items-center gap-6 sm:gap-8">
        <ScoreRing score={score} />

        <div className="flex-1 space-y-4">
          {/* Trend */}
          <div className="flex items-center gap-2">
            <TrendIcon size={14} className={trendColor} />
            <span className={`text-v2-sm font-medium ${trendColor}`}>{trendLabel}</span>
          </div>

          {/* Connections */}
          <div className="flex items-center gap-2">
            {connectedCount > 0 ? (
              <Wifi size={13} className="text-v2-success-500" />
            ) : (
              <WifiOff size={13} className="text-v2-text-tertiary" />
            )}
            <span className="text-v2-xs text-v2-text-secondary">
              {connectedCount}/{totalConnections} fuentes conectadas
            </span>
          </div>

          {/* Pending */}
          {pendingActions > 0 && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-v2-warning-50 border border-v2-warning-200">
              <span className="w-1.5 h-1.5 rounded-full bg-v2-warning-500" />
              <span className="text-[11px] font-medium text-v2-warning-700">
                {pendingActions} {pendingActions === 1 ? 'accion pendiente' : 'acciones pendientes'}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
