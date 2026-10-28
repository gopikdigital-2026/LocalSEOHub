import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { loadPublishingCapabilities, startPublishingAccess, type PublishingCapabilities, type PublishingResult } from '../meta-connection/metaPublishingRepository';
import { createActivation, publishingAccessView, type ActivationState } from './model';
import { PUBLISHING_ACCESS_COPY, publishingAccessError } from './copy';

const secondaryBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold border border-v2-border text-v2-text-secondary hover:bg-v2-neutral-100 hover:text-v2-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

export function PublishingAccessControl({ lang, returned }: { lang: 'es' | 'en'; returned: string | null }) {
  const t = PUBLISHING_ACCESS_COPY[lang];
  const [capabilities, setCapabilities] = useState<PublishingResult<PublishingCapabilities> | null>(null);
  const [state, setState] = useState<ActivationState>({ busy: false, error: null });

  const load = async () => {
    setCapabilities(null);
    setCapabilities(await loadPublishingCapabilities());
  };

  useEffect(() => {
    let cancelled = false;
    loadPublishingCapabilities().then((result) => { if (!cancelled) setCapabilities(result); });
    return () => { cancelled = true; };
  }, []);

  const activation = useMemo(() => createActivation({
    start: startPublishingAccess,
    navigate: (url) => window.location.assign(url),
    onChange: setState,
  }), []);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) activation.reset(); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [activation]);

  const view = publishingAccessView(true, capabilities);
  const returnNotice = returned === 'enabled'
    ? (view === 'ready' ? t.returnedEnabled : view === 'needs_activation' ? t.returnedIncomplete : null)
    : returned ? publishingAccessError(returned, lang) : null;
  const notice = state.error ? publishingAccessError(state.error, lang) : returnNotice;
  const noticeIsPositive = !state.error && returned === 'enabled' && view === 'ready';

  return (
    <section className="mt-3 pt-3 border-t border-v2-border" aria-label={t.title}>
      <p className="text-v2-xs font-semibold text-v2-text-primary mb-1">{t.title}</p>

      {view === 'checking' && (
        <p className="flex items-center gap-1.5 text-[11px] text-v2-text-tertiary"><Loader2 size={12} className="animate-spin" />{t.checking}</p>
      )}

      {view === 'unavailable' && (
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-v2-text-secondary">{t.unavailable}</p>
          <button onClick={() => void load()} className="flex items-center gap-1 text-[11px] font-semibold text-v2-primary-600 hover:text-v2-primary-700 transition-colors">
            <RefreshCw size={11} />{t.retry}
          </button>
        </div>
      )}

      {view === 'ready' && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-v2-success-700">
          <ShieldCheck size={13} className="mt-px shrink-0" />{t.ready}
        </p>
      )}

      {view === 'needs_activation' && (
        <>
          <p className="text-[11px] leading-relaxed text-v2-text-secondary mb-2">{t.explain}</p>
          <button onClick={() => void activation.activate()} disabled={state.busy} aria-busy={state.busy} className={secondaryBtn}>
            {state.busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
            {state.busy ? t.activating : t.activate}
          </button>
        </>
      )}

      {notice && (
        <div role="status" className={`flex items-start gap-2 mt-2 p-2.5 rounded-v2-lg ${noticeIsPositive ? 'bg-v2-success-50' : 'bg-v2-warning-50'}`}>
          {noticeIsPositive
            ? <ShieldCheck size={13} className="mt-0.5 shrink-0 text-v2-success-600" />
            : <AlertCircle size={13} className="mt-0.5 shrink-0 text-v2-warning-600" />}
          <p className={`text-[11px] leading-relaxed ${noticeIsPositive ? 'text-v2-success-700' : 'text-v2-warning-700'}`}>{notice}</p>
        </div>
      )}
    </section>
  );
}
