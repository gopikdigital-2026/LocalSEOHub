import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useActions } from './ActionsContext';
import { localizeAction } from './engine';
import { useI18n } from '../../lib/i18n';

const COPY = {
  es: {
    title: (n: number) => (n === 1 ? 'Has completado un dato pendiente' : `Has completado ${n} datos pendientes`),
    body: 'Hemos cerrado estas recomendaciones porque ya tenemos la información que pedían:',
    close: 'Cerrar aviso',
  },
  en: {
    title: (n: number) => (n === 1 ? 'You completed a missing detail' : `You completed ${n} missing details`),
    body: 'We closed these recommendations because we now have the information they asked for:',
    close: 'Dismiss notice',
  },
};

const VISIBLE_MS = 12000;

export default function ResolvedActionsNotice() {
  const { recentlyResolved, clearRecentlyResolved } = useActions();
  const { lang } = useI18n();
  const t = COPY[lang === 'en' ? 'en' : 'es'];

  useEffect(() => {
    if (recentlyResolved.length === 0) return;
    const timer = window.setTimeout(clearRecentlyResolved, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [recentlyResolved, clearRecentlyResolved]);

  if (recentlyResolved.length === 0) return null;

  return (
    <div role="status" className="mb-6 rounded-v2-lg border border-v2-success-200 bg-v2-success-50 p-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-v2-success-600" />
        <div className="min-w-0 flex-1">
          <p className="text-v2-sm font-semibold text-v2-success-700">{t.title(recentlyResolved.length)}</p>
          <p className="mt-1 text-v2-sm text-v2-text-secondary">{t.body}</p>
          <ul className="mt-2 space-y-1">
            {recentlyResolved.map((a) => (
              <li key={a.id} className="text-v2-sm text-v2-text-primary">· {localizeAction(a, lang === 'en' ? 'en' : 'es').title}</li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={clearRecentlyResolved}
          aria-label={t.close}
          className="rounded-v2 p-1 text-v2-text-tertiary transition-colors hover:bg-v2-success-200/60 hover:text-v2-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
