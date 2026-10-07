import { ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';
import type { GoalId } from '../business-memory/types';
import { goalLabel } from './milestones';

type Lang = 'es' | 'en';

const TEXT = {
  es: {
    introTitle: 'Ya tenemos tu primer plan',
    introFor: (name: string) => `Hemos preparado estas acciones para ${name}`,
    introGoal: (goal: string) => ` pensando en tu objetivo: ${goal}`,
    introGeneric: 'Hemos preparado estas acciones a partir de los datos de tu negocio',
    introNext: 'Empieza por la primera: es la que más puede ayudarte ahora.',
    successTitle: 'Primera acción completada',
    successText: 'Buen comienzo. Cada acción que completas mejora lo que sabemos de tu negocio y ajusta las siguientes recomendaciones.',
    next: 'Ver siguiente acción', back: 'Volver a Hoy', close: 'Cerrar',
  },
  en: {
    introTitle: 'Your first plan is ready',
    introFor: (name: string) => `We prepared these actions for ${name}`,
    introGoal: (goal: string) => ` with your goal in mind: ${goal}`,
    introGeneric: 'We prepared these actions from your business details',
    introNext: "Start with the first one: it's the one that can help you most right now.",
    successTitle: 'First action completed',
    successText: 'Good start. Every action you complete improves what we know about your business and tunes the next recommendations.',
    next: 'See next action', back: 'Back to Today', close: 'Close',
  },
};

export function FirstPlanIntro({ lang, businessName, goal }: { lang: Lang; businessName: string | null; goal: GoalId | null }) {
  const t = TEXT[lang];
  const name = businessName?.trim() || null;
  const goalText = goalLabel(goal, lang);
  const lead = name ? t.introFor(name) : t.introGeneric;
  return (
    <section className="v2-card border-v2-primary-200 bg-v2-primary-50/40 v2-fade-in" data-testid="first-plan-intro">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-v2-lg bg-v2-primary-100 text-v2-primary-600 flex items-center justify-center shrink-0">
          <Sparkles size={16} />
        </div>
        <div>
          <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.introTitle}</h2>
          <p className="text-v2-sm text-v2-text-secondary mt-1 leading-relaxed">
            {lead}{goalText ? t.introGoal(goalText) : ''}. {t.introNext}
          </p>
        </div>
      </div>
    </section>
  );
}

export function FirstSuccessNotice({ lang, onNext, onBack }: { lang: Lang; onNext: (() => void) | null; onBack: () => void }) {
  const t = TEXT[lang];
  return (
    <section className="v2-card border-v2-success-200 bg-v2-success-50/50 v2-fade-in" role="status" data-testid="first-success">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={22} className="text-v2-success-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.successTitle}</h2>
          <p className="text-v2-sm text-v2-text-secondary mt-1 leading-relaxed">{t.successText}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {onNext && (
              <button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-1.5 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors">
                {t.next} <ArrowRight size={12} />
              </button>
            )}
            <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-1.5 text-v2-xs font-medium text-v2-text-secondary hover:text-v2-text-primary transition-colors">
              {t.back}
            </button>
          </div>
        </div>
        <button onClick={onBack} aria-label={t.close} className="p-1 rounded-v2-md text-v2-neutral-400 hover:text-v2-text-primary hover:bg-white transition-colors">
          <X size={14} />
        </button>
      </div>
    </section>
  );
}
