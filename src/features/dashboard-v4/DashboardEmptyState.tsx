import { ArrowRight } from 'lucide-react';
import { trackDashboardEmptyStateClick } from './dashboardV4.analytics';

interface DashboardEmptyStateProps {
  onSetup: () => void;
}

export default function DashboardEmptyState({ onSetup }: DashboardEmptyStateProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-v2-primary-50 border-2 border-v2-primary-100 flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl font-bold text-v2-primary-600">L</span>
        </div>
        <h1 className="text-v2-2xl font-bold text-v2-text-primary mb-3">
          Configura tu negocio para comenzar
        </h1>
        <p className="text-v2-base text-v2-text-secondary leading-relaxed mb-8">
          Necesitamos conocer lo esencial de tu empresa para ofrecerte recomendaciones y acciones personalizadas.
        </p>
        <button
          onClick={() => { trackDashboardEmptyStateClick(); onSetup(); }}
          className="v2-btn-primary text-v2-base px-6 py-3"
        >
          Configurar mi negocio <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
