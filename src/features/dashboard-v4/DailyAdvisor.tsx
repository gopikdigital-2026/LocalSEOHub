import { Sparkles } from 'lucide-react';
import type { DashboardAction } from './dashboardV4.types';

interface DailyAdvisorProps {
  action: DashboardAction | null;
  onPrepare: (action: DashboardAction) => void;
}

export default function DailyAdvisor({ action, onPrepare }: DailyAdvisorProps) {
  if (!action) return null;

  return (
    <section className="bg-gradient-to-br from-white to-v2-primary-50/30 rounded-v2-2xl border border-v2-border p-5 sm:p-6" aria-label="Consejo del dia">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-v2-primary-500" />
        <h2 className="text-v2-sm font-semibold text-v2-text-primary">Consejo del dia</h2>
      </div>
      <p className="text-v2-sm text-v2-text-secondary leading-relaxed mb-4">
        Te recomendamos: <span className="font-medium text-v2-text-primary">{action.title.toLowerCase()}</span>. {action.explanation}
      </p>
      <button onClick={() => onPrepare(action)} className="v2-btn-primary v2-btn-sm">
        Ver propuesta
      </button>
    </section>
  );
}
