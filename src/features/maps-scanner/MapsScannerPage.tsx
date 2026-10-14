import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Info, Loader2, Lock, MapPinned, Minus, Plug,
  RefreshCw, ShieldCheck, Store,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBusiness } from '../business-memory/BusinessContext';
import { useBilling } from '../billing/BillingContext';
import { loadSources } from '../reality-engine/repositories';
import { COPY, type MapsCopy } from './copy';
import { normalizeGbp, scan, type Band, type Check, type CheckStatus, type GbpSnapshot } from './engine';

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';
const label = 'text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary';
const card = 'rounded-v2-xl border border-v2-border-light bg-white';

const BAND_STYLE: Record<Band, { text: string; bar: string; chip: string }> = {
  excellent: { text: 'text-v2-success-700', bar: 'bg-v2-success-500', chip: 'bg-v2-success-50 text-v2-success-700 border-v2-success-200' },
  good: { text: 'text-v2-primary-700', bar: 'bg-v2-primary-500', chip: 'bg-v2-primary-50 text-v2-primary-700 border-v2-primary-200' },
  improvable: { text: 'text-v2-warning-700', bar: 'bg-v2-warning-500', chip: 'bg-v2-warning-50 text-v2-warning-700 border-v2-warning-200' },
  incomplete: { text: 'text-v2-error-600', bar: 'bg-v2-error-500', chip: 'bg-v2-error-50 text-v2-error-600 border-v2-error-200' },
};

const STATUS_STYLE: Record<CheckStatus, { icon: JSX.Element; chip: string }> = {
  ok: { icon: <CheckCircle2 size={16} className="text-v2-success-600" />, chip: 'bg-v2-success-50 text-v2-success-700' },
  improve: { icon: <AlertTriangle size={16} className="text-v2-warning-600" />, chip: 'bg-v2-warning-50 text-v2-warning-700' },
  unchecked: { icon: <Minus size={16} className="text-v2-text-tertiary" />, chip: 'bg-v2-neutral-100 text-v2-text-secondary' },
};

function formatDate(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function CheckRow({ c, t }: { c: Check; t: MapsCopy }) {
  const s = STATUS_STYLE[c.status];
  const detail = c.detail === 'has_reviews' ? t.details.has_reviews(c.reviewCount ?? 0) : c.detail ? t.details[c.detail] : null;
  return (
    <li data-testid="maps-check" data-status={c.status} className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-v2-sm font-medium text-v2-text-primary">{t.checks[c.id]}</p>
        {detail && <p className="mt-0.5 text-v2-xs text-v2-text-secondary">{detail}</p>}
        <p className="mt-1 text-[11px] text-v2-text-tertiary">
          {t.origin[c.source]} · {t.trust[c.trust]}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.chip}`}>
        {c.status === 'ok' ? '✓ ' : c.status === 'improve' ? '⚠ ' : '— '}{t.status[c.status]}
      </span>
    </li>
  );
}

export default function MapsScannerPage() {
  const { lang } = useI18n();
  const t = lang === 'en' ? COPY.en : COPY.es;
  const { currentBusiness, loading: businessLoading, error: businessError, refresh: refreshBusiness } = useBusiness();
  const { hasPremium } = useBilling();

  const [gbp, setGbp] = useState<GbpSnapshot>({ state: 'not_connected', lastSyncAt: null, data: null });
  const [sourcesFailed, setSourcesFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<'refreshed' | 'refreshFailed' | null>(null);

  const businessId = currentBusiness?.id ?? null;

  const loadGbp = useCallback(async (id: string) => {
    try {
      const sources = await loadSources(id);
      setGbp(normalizeGbp(sources.find((s) => s.source_type === 'google_business') ?? null));
      setSourcesFailed(false);
      return true;
    } catch {
      setGbp({ state: 'not_connected', lastSyncAt: null, data: null });
      setSourcesFailed(true);
      return false;
    }
  }, []);

  useEffect(() => {
    if (businessId && hasPremium) void loadGbp(businessId);
  }, [businessId, hasPremium, loadGbp]);

  const result = useMemo(() => (currentBusiness ? scan(currentBusiness, gbp) : null), [currentBusiness, gbp]);

  const onRefresh = async () => {
    if (!businessId) return;
    setRefreshing(true);
    setNotice(null);
    await refreshBusiness();
    const ok = await loadGbp(businessId);
    setRefreshing(false);
    setNotice(ok ? 'refreshed' : 'refreshFailed');
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
      <div className="mt-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 shrink-0 rounded-v2-lg bg-v2-primary-600 text-white flex items-center justify-center shadow-sm">
            <MapPinned size={20} />
          </div>
          <div>
            <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{t.title}</h1>
            <p className="text-v2-sm text-v2-text-secondary mt-1 max-w-2xl">{t.intro}</p>
          </div>
        </div>
        {hasPremium && result && (
          <button type="button" data-testid="maps-refresh" onClick={() => void onRefresh()} disabled={refreshing} className={`${btnSecondary} self-start`}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? t.refreshing : t.refresh}
          </button>
        )}
      </div>
    </div>
  );

  if (hasPremium === null) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-v2-sm text-v2-text-secondary">{t.billingUnknown}</p>
      </div>
    );
  }

  if (!hasPremium) {
    return (
      <div className="space-y-6">
        {header}
        <div className={`${card} p-6 flex flex-col sm:flex-row sm:items-center gap-4`}>
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

  if (!currentBusiness || !result || (businessError && !currentBusiness)) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3 text-v2-sm text-v2-error-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {t.noBusiness}
        </div>
      </div>
    );
  }

  const local = result.checks.filter((c) => c.source === 'localseohub');
  const google = result.checks.filter((c) => c.source === 'google');
  const style = result.band ? BAND_STYLE[result.band] : null;
  const syncDate = formatDate(gbp.lastSyncAt, lang);
  const updatedDate = formatDate(currentBusiness.updated_at, lang);

  return (
    <div className="space-y-6">
      {header}

      {notice && (
        <p role="status" className={`text-v2-xs ${notice === 'refreshed' ? 'text-v2-success-700' : 'text-v2-error-600'}`}>
          {t[notice]}
        </p>
      )}

      <section data-testid="maps-summary" className={`${card} p-5 sm:p-6`}>
        <p className={`${label} text-v2-primary-700`}>{t.headerKicker}</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 items-center">
          <div>
            {result.score !== null && style ? (
              <>
                <p className="flex items-baseline gap-1">
                  <span data-testid="maps-score" className={`text-5xl font-bold tracking-tight ${style.text}`}>{result.score}</span>
                  <span className="text-v2-base font-medium text-v2-text-tertiary">/100</span>
                </p>
                <span className={`mt-2 inline-block rounded-full border px-2.5 py-0.5 text-v2-xs font-semibold ${style.chip}`}>{t.bands[result.band!]}</span>
              </>
            ) : (
              <p data-testid="maps-insufficient" className="text-v2-sm font-medium text-v2-warning-700">{t.insufficient}</p>
            )}
          </div>
          <div>
            <p className={label}>{t.coverage}</p>
            <p className="mt-1 text-v2-2xl font-bold text-v2-text-primary"><span data-testid="maps-coverage">{result.coverage}</span> %</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-v2-neutral-100">
              <div className="h-full rounded-full bg-v2-primary-500 transition-all duration-700" style={{ width: `${result.coverage}%` }} />
            </div>
            <p className="mt-1.5 text-v2-xs text-v2-text-secondary">{t.coverageNote(result.evaluated, result.total)}</p>
          </div>
          <p className="flex items-start gap-2 rounded-v2-md bg-v2-neutral-50 px-3 py-2.5 text-v2-xs text-v2-text-secondary leading-relaxed">
            <Info size={14} className="mt-0.5 shrink-0 text-v2-text-tertiary" />
            <span data-testid="maps-disclaimer">{t.disclaimer}</span>
          </p>
        </div>
        {updatedDate && <p className="mt-4 text-[11px] text-v2-text-tertiary">{t.profileUpdated(updatedDate)}</p>}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-6">
          <section className={card}>
            <div className="px-4 py-3 border-b border-v2-border-light flex items-start gap-2.5">
              <Store size={16} className="mt-0.5 text-v2-primary-600 shrink-0" />
              <div>
                <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.checklistLocal}</h2>
                <p className="text-v2-xs text-v2-text-secondary">{t.checklistLocalNote}</p>
              </div>
            </div>
            <ul className="divide-y divide-v2-border-light">{local.map((c) => <CheckRow key={c.id} c={c} t={t} />)}</ul>
          </section>

          <section className={card}>
            <div className="px-4 py-3 border-b border-v2-border-light flex items-start gap-2.5">
              <ShieldCheck size={16} className="mt-0.5 text-v2-primary-600 shrink-0" />
              <div>
                <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.checklistGoogle}</h2>
                <p className="text-v2-xs text-v2-text-secondary">{t.checklistGoogleNote}</p>
              </div>
            </div>
            <ul className="divide-y divide-v2-border-light">{google.map((c) => <CheckRow key={c.id} c={c} t={t} />)}</ul>
          </section>
        </div>

        <aside className="lg:col-span-2 space-y-6 lg:sticky lg:top-6">
          <section className={`${card} p-5`}>
            <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.prioritiesTitle}</h2>
            <ol className="mt-3 space-y-2.5">
              {result.priorities.map((p, i) => (
                <li key={p.id} data-testid="maps-priority" className="rounded-v2-lg border border-v2-border-light px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-v2-primary-50 text-v2-primary-700 text-v2-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-v2-sm font-medium text-v2-text-primary leading-snug">{t.priorities[p.id].title}</p>
                      <Link to={p.cta} className="mt-1 inline-flex items-center gap-1 text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 hover:gap-1.5 transition-all">
                        {t.priorities[p.id].cta} <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section data-testid="maps-sources" className={`${card} p-5`}>
            <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.sourcesTitle}</h2>
            <div className="mt-3 flex items-start gap-2.5">
              <Plug size={16} className={`mt-0.5 shrink-0 ${gbp.state === 'connected' ? 'text-v2-success-600' : 'text-v2-text-tertiary'}`} />
              <div className="text-v2-xs text-v2-text-secondary leading-relaxed space-y-1">
                {sourcesFailed ? (
                  <p className="text-v2-error-600">{t.sourcesFailed}</p>
                ) : gbp.state === 'connected' ? (
                  <>
                    <p className="text-v2-sm font-medium text-v2-text-primary">{t.gbpConnected}</p>
                    {syncDate && <p>{t.lastSync(syncDate)}</p>}
                    {!gbp.data && <p>{t.gbpNoSyncData}</p>}
                  </>
                ) : gbp.state === 'error' ? (
                  <p className="text-v2-warning-700">{t.gbpError}</p>
                ) : (
                  <>
                    <p className="text-v2-sm font-medium text-v2-text-primary">{t.gbpNotConnected}</p>
                    <p>{t.gbpNotConnectedBody}</p>
                  </>
                )}
                <Link to="/fuentes" className={`${btnSecondary} mt-2`}>{t.reviewSources}</Link>
              </div>
            </div>
          </section>

          <section className="rounded-v2-xl border border-v2-border-light bg-v2-neutral-50/60 p-5">
            <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.outOfScopeTitle}</h2>
            <ul className="mt-2 space-y-1.5">
              {t.outOfScope.map((s) => (
                <li key={s} className="flex items-start gap-2 text-v2-xs text-v2-text-secondary">
                  <Minus size={12} className="mt-0.5 shrink-0 text-v2-text-tertiary" /> {s}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-v2-text-tertiary">{t.costNote}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
