import { Sparkles, Lightbulb, ArrowRight } from 'lucide-react';

interface AIInsight {
  id: string;
  title: string;
  description: string;
  category: 'opportunity' | 'warning' | 'tip';
}

interface AIInsightsProps {
  insights: AIInsight[];
  onViewInsight?: (id: string) => void;
}

const categoryStyles: Record<string, { bg: string; icon: string; badge: string }> = {
  opportunity: { bg: 'bg-v2-success-50', icon: 'text-v2-success-600', badge: 'bg-v2-success-50 text-v2-success-700 border-v2-success-200' },
  warning: { bg: 'bg-v2-warning-50', icon: 'text-v2-warning-600', badge: 'bg-v2-warning-50 text-v2-warning-700 border-v2-warning-200' },
  tip: { bg: 'bg-v2-info-50', icon: 'text-v2-info-600', badge: 'bg-v2-info-50 text-v2-info-600 border-v2-info-200' },
};

const categoryLabels: Record<string, string> = {
  opportunity: 'Oportunidad',
  warning: 'Atencion',
  tip: 'Consejo',
};

export default function AIInsights({ insights, onViewInsight }: AIInsightsProps) {
  return (
    <section className="v2-card" aria-label="Insights de IA">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={16} className="text-v2-primary-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Insights de IA</h2>
      </div>

      {insights.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <Lightbulb size={28} className="text-v2-neutral-300 mb-2" />
          <p className="text-v2-sm text-v2-text-tertiary">Los insights apareceran cuando haya datos suficientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => {
            const style = categoryStyles[insight.category];
            return (
              <div
                key={insight.id}
                className="group flex items-start gap-3 p-3.5 rounded-v2-lg border border-v2-border-light hover:border-v2-primary-200 transition-colors cursor-pointer"
                onClick={() => onViewInsight?.(insight.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onViewInsight?.(insight.id)}
              >
                <div className={`shrink-0 w-8 h-8 rounded-v2-md ${style.bg} flex items-center justify-center`}>
                  <Lightbulb size={14} className={style.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-v2-sm font-medium text-v2-text-primary truncate">{insight.title}</h3>
                    <span className={`shrink-0 v2-badge border ${style.badge}`}>{categoryLabels[insight.category]}</span>
                  </div>
                  <p className="text-v2-xs text-v2-text-secondary line-clamp-2">{insight.description}</p>
                </div>
                <ArrowRight size={14} className="shrink-0 self-center text-v2-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export type { AIInsight };
