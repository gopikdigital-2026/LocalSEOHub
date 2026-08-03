import { Zap, Edit3, RefreshCw, BarChart2, Settings, Plus } from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: 'edit' | 'sync' | 'report' | 'settings' | 'add';
  onClick: () => void;
}

interface QuickActionsProps {
  actions: QuickAction[];
}

const iconMap = {
  edit: Edit3,
  sync: RefreshCw,
  report: BarChart2,
  settings: Settings,
  add: Plus,
};

export default function QuickActions({ actions }: QuickActionsProps) {
  return (
    <section className="v2-card" aria-label="Acciones rapidas">
      <div className="flex items-center gap-2 mb-4">
        <Zap size={16} className="text-v2-primary-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Acciones rapidas</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {actions.map((action) => {
          const Icon = iconMap[action.icon];
          return (
            <button
              key={action.id}
              onClick={action.onClick}
              className="flex flex-col items-center gap-2 p-3.5 rounded-v2-xl border border-v2-border-light hover:border-v2-primary-200 hover:bg-v2-primary-50/40 transition-all duration-200 group"
            >
              <div className="w-9 h-9 rounded-v2-lg bg-v2-neutral-100 group-hover:bg-v2-primary-100 flex items-center justify-center transition-colors">
                <Icon size={16} className="text-v2-text-secondary group-hover:text-v2-primary-600 transition-colors" />
              </div>
              <span className="text-v2-xs font-medium text-v2-text-secondary group-hover:text-v2-text-primary text-center leading-tight transition-colors">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export type { QuickAction };
