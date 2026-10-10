import { Sparkles } from 'lucide-react';
import { IMPROVEMENT_COPY } from './copy';

export default function ImprovementHint({ lang, onClick }: { lang: 'es' | 'en'; onClick: () => void }) {
  const c = IMPROVEMENT_COPY[lang];
  return (
    <div data-testid="improvement-hint" className="mt-3 flex flex-wrap items-center gap-2 rounded-v2-lg border border-v2-primary-100 bg-v2-primary-50/60 px-3 py-2">
      <Sparkles size={12} className="text-v2-primary-500 shrink-0" aria-hidden="true" />
      <span className="text-[11px] text-v2-text-secondary">{c.hint}</span>
      <button
        type="button"
        onClick={onClick}
        className="ml-auto text-[11px] font-semibold text-v2-primary-700 hover:text-v2-primary-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-primary-500 rounded-sm"
      >
        {c.prepare}
      </button>
    </div>
  );
}
