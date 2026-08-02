import { ExternalLink } from 'lucide-react';
import { trackDashboardAutomationClick } from './dashboardV4.analytics';

interface AutomationSummaryProps {
  onManage: () => void;
}

export default function AutomationSummary({ onManage }: AutomationSummaryProps) {
  return (
    <section className="v2-card" aria-label="Automatizaciones">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-v2-sm font-semibold text-v2-text-primary">Automatizaciones</h2>
          <p className="text-v2-xs text-v2-text-tertiary mt-0.5">No tienes automatizaciones activas.</p>
        </div>
        <button
          onClick={() => { trackDashboardAutomationClick(); onManage(); }}
          className="text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 transition-colors flex items-center gap-1"
        >
          Gestionar <ExternalLink size={11} />
        </button>
      </div>
    </section>
  );
}
