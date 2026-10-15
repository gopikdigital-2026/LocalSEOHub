import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Globe, Loader2, Lock, Radar, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBusiness } from '../business-memory/BusinessContext';
import { useBilling } from '../billing/BillingContext';
import { loadSources } from '../reality-engine/repositories';
import { normalizeGbp, type GbpSnapshot } from '../maps-scanner/engine';
import { COPY } from './copy';
import { compareCompetitor } from './engine';
import { analyzeCompetitor, RadarError } from './repository';
import { RadarResults } from './RadarResults';
import { MAX_URL_CHARS, type CompetitorAnalysis, type RadarErrorCode } from './types';

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors';
const card = 'rounded-v2-xl border border-v2-border-light bg-white';

function formatDate(iso: string, lang: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CompetitorRadarPage() {
  const { lang } = useI18n();
  const l = lang === 'en' ? 'en' : 'es';
  const t = COPY[l];
  const { currentBusiness, loading: businessLoading } = useBusiness();
  const { hasPremium } = useBilling();

  const [gbp, setGbp] = useState<GbpSnapshot>({ state: 'not_connected', lastSyncAt: null, data: null });
  const [url, setUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<RadarErrorCode | null>(null);
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null);

  const businessId = currentBusiness?.id ?? null;

  useEffect(() => {
    if (!businessId || !hasPremium) return;
    let active = true;
    loadSources(businessId)
      .then((sources) => { if (active) setGbp(normalizeGbp(sources.find((s) => s.source_type === 'google_business') ?? null)); })
      .catch(() => { if (active) setGbp({ state: 'not_connected', lastSyncAt: null, data: null }); });
    return () => { active = false; };
  }, [businessId, hasPremium]);

  useEffect(() => {
    setAnalysis(null);
    setError(null);
  }, [businessId]);

  const comparison = useMemo(
    () => (currentBusiness && analysis ? compareCompetitor(currentBusiness, gbp, analysis) : null),
    [currentBusiness, gbp, analysis],
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessId || running) return;
    const value = url.trim();
    if (!value) return setError('url_required');
    if (value.length > MAX_URL_CHARS) return setError('url_too_long');
    setRunning(true);
    setError(null);
    try {
      setAnalysis(await analyzeCompetitor({ businessId, url: value }));
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof RadarError ? err.code : 'unavailable');
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setAnalysis(null);
    setError(null);
    setUrl('');
  };

  if (businessLoading && !currentBusiness) {
    return (
      <div className="flex items-center gap-2 text-v2-sm text-v2-text-secondary py-12 justify-center">
        <Loader2 size={16} className="animate-spin" /> {t.loading}
      </div>
    );
  }

  const header = (
    <div>
      <Link to="/herramientas" className="inline-flex items-center gap-1 text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-primary-600 transition-colors">
        <ArrowLeft size={13} /> {t.back}
      </Link>
      <div className="mt-3 flex items-start gap-3">
        <div className="w-11 h-11 shrink-0 rounded-v2-lg bg-v2-primary-600 text-white flex items-center justify-center shadow-sm">
          <Radar size={20} />
        </div>
        <div>
          <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight uppercase">{t.title}</h1>
          <p className="text-v2-sm text-v2-text-secondary mt-1 max-w-2xl">{t.subtitle}</p>
        </div>
      </div>
    </div>
  );

  if (hasPremium === null) {
    return <div className="space-y-6">{header}<p className="text-v2-sm text-v2-text-secondary">{t.billingUnknown}</p></div>;
  }

  if (!hasPremium) {
    return (
      <div className="space-y-6">
        {header}
        <div className={`${card} p-6 flex flex-col sm:flex-row sm:items-center gap-4`} data-testid="radar-premium-gate">
          <span className="w-10 h-10 shrink-0 rounded-full bg-v2-neutral-100 text-v2-text-secondary flex items-center justify-center"><Lock size={18} /></span>
          <div className="flex-1">
            <p className="text-v2-base font-semibold text-v2-text-primary">{t.premiumTitle}</p>
            <p className="text-v2-sm text-v2-text-secondary mt-0.5">{t.premiumBody}</p>
          </div>
          <Link to="/facturacion" className={btnPrimary}>{t.premiumCta}</Link>
        </div>
      </div>
    );
  }

  if (!currentBusiness) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3 text-v2-sm text-v2-error-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {t.noBusiness}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <form onSubmit={(e) => void onSubmit(e)} className={`${card} p-5 sm:p-6`} data-testid="radar-form" noValidate>
        <label htmlFor="radar-url" className="block text-v2-sm font-semibold text-v2-text-primary">{t.inputLabel}</label>
        <div className="mt-2 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-v2-text-tertiary pointer-events-none" />
            <input
              id="radar-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_URL_CHARS}
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (error) setError(null); }}
              placeholder={t.placeholder}
              disabled={running}
              aria-invalid={!!error}
              className="w-full rounded-v2-lg border border-v2-border bg-white pl-9 pr-3 py-2.5 text-v2-sm text-v2-text-primary placeholder:text-v2-text-tertiary focus:outline-none focus:ring-2 focus:ring-v2-primary-200 focus:border-v2-primary-400 transition-shadow disabled:bg-v2-neutral-50"
            />
          </div>
          <button type="submit" disabled={running} className={btnPrimary} data-testid="radar-submit">
            {running ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {running ? t.analyzing : t.analyze}
          </button>
        </div>
        <p className="mt-2 text-v2-xs text-v2-text-tertiary inline-flex items-center gap-1.5"><ShieldCheck size={12} /> {t.publicOnly} {t.notMeasuredShort}</p>
        {error && (
          <div role="alert" data-testid="radar-error" className="mt-4 flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3 text-v2-sm text-v2-error-600">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {t.errors[error]}
          </div>
        )}
      </form>

      {running && (
        <div className={`${card} p-8 flex flex-col items-center text-center gap-3`} aria-live="polite" data-testid="radar-loading">
          <Loader2 size={22} className="animate-spin text-v2-primary-600" />
          <p className="text-v2-sm font-medium text-v2-text-primary">{t.analyzing}</p>
        </div>
      )}

      {!running && !analysis && (
        <div className={`${card} p-8 sm:p-10 flex flex-col items-center text-center`} data-testid="radar-empty">
          <span className="w-12 h-12 rounded-full bg-v2-primary-50 text-v2-primary-600 flex items-center justify-center"><Radar size={22} /></span>
          <h2 className="mt-4 text-v2-lg font-semibold text-v2-text-primary">{t.emptyTitle}</h2>
          <p className="mt-1 text-v2-sm text-v2-text-secondary max-w-lg">{t.emptyBody}</p>
          <p className="mt-3 text-v2-xs text-v2-text-tertiary">{t.publicOnly}</p>
        </div>
      )}

      {!running && analysis && comparison && (
        <>
          <RadarResults comparison={comparison} analysis={analysis} t={t} dateLabel={formatDate(analysis.analyzedAt, l)} />
          <div className="flex justify-center">
            <button type="button" onClick={reset} className={btnSecondary}><RotateCcw size={13} /> {t.newAnalysis}</button>
          </div>
        </>
      )}
    </div>
  );
}
