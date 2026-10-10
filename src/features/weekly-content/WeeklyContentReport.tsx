import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { WEEKLY_COPY } from './copy';
import { hasDraft, weekKey, type WeeklyDraft } from './model';
import { loadDraft } from './repository';

export default function WeeklyContentReport({ businessId, lang, onNavigate }: {
  businessId: string | null; lang: 'es' | 'en'; onNavigate: (path: string) => void;
}) {
  const t = WEEKLY_COPY[lang].report;
  const [draft, setDraft] = useState<WeeklyDraft | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!businessId) return;
    let alive = true;
    setStatus('loading');
    loadDraft(businessId, weekKey())
      .then((d) => { if (alive) { setDraft(d); setStatus('ready'); } })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [businessId]);

  const ready = hasDraft(draft);
  const rows = ready ? [
    { label: t.prepared, value: t.versions(draft.generations), done: true },
    { label: t.edited, value: draft.edited_at ? t.yes : t.no, done: Boolean(draft.edited_at) },
    { label: t.copied, value: draft.copied_at ? t.yes : t.no, done: Boolean(draft.copied_at) },
  ] : [];

  return (
    <section data-testid="weekly-content-report" className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={15} className="text-v2-primary-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.title}</h2>
      </div>
      <p className="text-v2-xs text-v2-text-tertiary leading-relaxed mb-3">{t.note}</p>
      {status === 'loading' && <div className="h-12 rounded-v2-lg bg-v2-neutral-50 animate-pulse" aria-hidden="true" />}
      {status === 'error' && <p role="alert" className="text-v2-xs text-v2-error-600">{t.error}</p>}
      {status === 'ready' && !ready && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-v2-sm text-v2-text-secondary">{t.none}</p>
          <button onClick={() => onNavigate('/hoy')} className="text-v2-sm font-medium text-v2-primary-600 hover:text-v2-primary-700">{t.go}</button>
        </div>
      )}
      {status === 'ready' && ready && (
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {rows.map((r) => (
            <li key={r.label} className="rounded-v2-lg border border-v2-border-light bg-v2-neutral-50/60 px-3 py-2.5">
              <p className="text-v2-xs text-v2-text-tertiary">{r.label}</p>
              <p className={`text-v2-sm font-semibold ${r.done ? 'text-v2-text-primary' : 'text-v2-text-secondary'}`}>{r.value}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
