import { TrendingUp } from 'lucide-react';
import { trackDashboardGrowthDetailsClick } from './dashboardV4.analytics';

interface GrowthScoreSummaryProps {
  hasProfile: boolean;
  onDetails: () => void;
}

export default function GrowthScoreSummary({ hasProfile, onDetails }: GrowthScoreSummaryProps) {
  function handleClick() {
    trackDashboardGrowthDetailsClick();
    onDetails();
  }

  if (!hasProfile) {
    return (
      <section className="v2-card" aria-label="Estado del negocio">
        <h2 className="text-v2-sm font-semibold text-v2-text-primary mb-2">Estado del negocio</h2>
        <p className="text-v2-xs text-v2-text-tertiary">Completa la informacion de tu empresa para conocer su estado general.</p>
      </section>
    );
  }

  return (
    <section className="v2-card" aria-label="Estado del negocio">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-v2-sm font-medium text-v2-text-secondary mb-1">Estado del negocio</h2>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-v2-text-primary tabular-nums">—</span>
            <span className="text-v2-xs text-v2-text-tertiary">/ 100</span>
          </div>
          <p className="text-v2-xs text-v2-text-tertiary mt-2">
            Conecta Google Business para activar el calculo.
          </p>
        </div>
        <div className="w-12 h-12 rounded-full border-[3px] border-v2-neutral-200 flex items-center justify-center">
          <TrendingUp size={16} className="text-v2-neutral-300" />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-v2-border-light">
        <p className="text-v2-xs text-v2-text-tertiary mb-2">Se calculara con:</p>
        <div className="flex flex-wrap gap-1.5">
          {['Perfil Google', 'Publicaciones', 'Resenas', 'SEO Local', 'Actividad'].map((f) => (
            <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-v2-neutral-100 text-v2-text-tertiary font-medium">{f}</span>
          ))}
        </div>
      </div>

      <button onClick={handleClick} className="mt-4 text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 transition-colors">
        Ver detalles
      </button>
    </section>
  );
}
