import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Info, Loader2, Lock, Minus, Network, RefreshCw, Store } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBusiness } from '../business-memory/BusinessContext';
import { useBilling } from '../billing/BillingContext';
import { loadSources } from '../reality-engine/repositories';
import { normalizeGbp, type GbpSnapshot } from '../maps-scanner/engine';
import { COPY } from './copy';
import { buildDigitalTwin, TWIN_TOOL_ROUTES, type KnowledgeBand } from './engine';
import { TwinBlockCard } from './TwinBlockCard';
import { ActionDetail } from '../action-layer/ActionDetail';
import { ACTION_COPY } from '../action-layer/copy';
import { twinActions } from '../action-layer/model';

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';
const label = 'text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary';
const card = 'rounded-v2-xl border border-v2-border-light bg-white';

const BAND_STYLE: Record<KnowledgeBand, { bar: string; chip: string }> = {
  very_complete: { bar: 'bg-v2-success-500', chip: 'bg-v2-success-50 text-v2-success-700 border-v2-success-200' },
  well_defined: { bar: 'bg-v2-primary-500', chip: 'bg-v2-primary-50 text-v2-primary-700 border-v2-primary-200' },
  partial: { bar: 'bg-v2-warning-500', chip: 'bg-v2-warning-50 text-v2-warning-700 border-v2-warning-200' },
  initial: { bar: 'bg-v2-neutral-400', chip: 'bg-v2-neutral-100 text-v2-text-secondary border-v2-border-light' },
};

const TOOL_ORDER = ['seo', 'advisor', 'maps', 'geo'] as const;

function formatDate(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DigitalTwinPage() {
  const { lang } = useI18n();
  const l = lang === 'en' ? 'en' : 'es';
  const t = COPY[l];
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

  const twin = useMemo(() => (currentBusiness ? buildDigitalTwin(currentBusiness, gbp) : null), [currentBusiness, gbp]);

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
            <Network size={20} />
          </div>
          <div>
            <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{t.title}</h1>
            <p className="text-v2-sm text-v2-text-secondary mt-1">{t.subtitle}</p>
            <p className="text-v2-xs text-v2-text-tertiary mt-0.5 max-w-2xl">{t.definition}</p>
          </div>
        </div>
        {hasPremium && twin && (
          <button type="button" data-testid="twin-refresh" onClick={() => void onRefresh()} disabled={refreshing} className={`${btnSecondary} self-start`}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? t.refreshing : t.refresh}
          </button>
        )}
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

  if (!currentBusiness || !twin) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3 text-v2-sm text-v2-error-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {t.noBusiness}
        </div>
      </div>
    );
  }

  const band = BAND_STYLE[twin.knowledgeBand];
  const syncDate = formatDate(gbp.lastSyncAt, lang);
  const updatedDate = formatDate(currentBusiness.updated_at, lang);
  const v = twin.values;
  const { declared, detected, verified } = twin.sourceSummary;
  const ac = ACTION_COPY[l];
  const actions = new Map(twinActions(twin.priorities).map((a) => [a.id, a]));

  return (
    <div className="space-y-6">
      {header}

      {notice && <p role="status" className={`text-v2-xs ${notice === 'refreshed' ? 'text-v2-success-700' : 'text-v2-error-600'}`}>{t[notice]}</p>}
      {businessError && <p className="text-v2-xs text-v2-error-600">{t.refreshFailed}</p>}
      {sourcesFailed && <p className="text-v2-xs text-v2-warning-700">{t.sourcesFailed}</p>}

      <section data-testid="twin-summary" className={`${card} overflow-hidden`}>
        <div className="grid grid-cols-1 md:grid-cols-5">
          <div className="md:col-span-3 p-5 sm:p-6 bg-gradient-to-br from-v2-primary-50/70 via-white to-white">
            <p className={`${label} text-v2-primary-700`}>{t.twinKicker}</p>
            <p className="mt-2 text-v2-2xl font-bold text-v2-text-primary tracking-tight break-words">{v.name || t.notDefined}</p>
            <p className="mt-1 text-v2-sm text-v2-text-secondary">
              {[v.activity, v.city].filter(Boolean).join(' · ') || t.notDefined}
            </p>
            {updatedDate && <p className="mt-3 text-v2-xs text-v2-text-tertiary">{t.businessUpdated(updatedDate)}</p>}
            {twin.starting && (
              <div data-testid="twin-starting" className="mt-4 rounded-v2-lg border border-v2-warning-200 bg-v2-warning-50 px-3 py-2.5">
                <p className="text-v2-sm font-semibold text-v2-warning-700">{t.startingTitle}</p>
                <p className="text-v2-xs text-v2-warning-700 mt-0.5">{t.startingBody}</p>
              </div>
            )}
          </div>
          <div className="md:col-span-2 p-5 sm:p-6 border-t md:border-t-0 md:border-l border-v2-border-light">
            <p className={label}>{t.knowledgeKicker}</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span data-testid="twin-knowledge" className="text-5xl font-bold tracking-tight text-v2-text-primary">{twin.knowledgePercent}</span>
              <span className="text-v2-xl font-semibold text-v2-text-tertiary">%</span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-v2-neutral-100">
              <div className={`h-full rounded-full ${band.bar} transition-all duration-700`} style={{ width: `${twin.knowledgePercent}%` }} />
            </div>
            <span className={`mt-3 inline-block rounded-full border px-2.5 py-0.5 text-v2-xs font-semibold ${band.chip}`}>{t.bands[twin.knowledgeBand]}</span>
            <p className="mt-3 text-v2-xs text-v2-text-secondary leading-relaxed">{t.knowledgeExplain(twin.knowledgePercent)}</p>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-v2-text-tertiary leading-relaxed">
              <Info size={12} className="mt-0.5 shrink-0" /> <span data-testid="twin-knowledge-note">{t.knowledgeNote}</span>
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="twin-map">
        <h2 id="twin-map" className="text-v2-sm font-semibold text-v2-text-primary mb-3">{t.mapTitle}</h2>
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-v2-primary-200 bg-v2-primary-50 px-4 py-1.5 text-v2-sm font-semibold text-v2-primary-700 shadow-sm">
            <Store size={14} /> {t.center}
          </span>
        </div>
        <div aria-hidden className="hidden lg:block mx-[12.5%] mt-0 h-4 border-x border-t border-v2-border-light rounded-t-v2-lg translate-y-2" />
        <div className="mt-4 lg:mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {twin.blocks.map((b) => <TwinBlockCard key={b.id} block={b} twin={twin} t={t} lang={l} syncDate={syncDate} />)}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <section data-testid="twin-gaps" className={`lg:col-span-3 ${card} p-5`}>
          <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.gapsTitle}</h2>
          <p className="mt-1 text-v2-xs text-v2-text-secondary leading-relaxed">{t.gapsWhy}</p>
          <ol className="mt-4 space-y-2">
            {twin.priorities.map((p, i) => (
              <li key={p.id} data-testid="twin-gap" className="flex items-start gap-3 rounded-v2-lg border border-v2-border-light px-3 py-2.5 hover:border-v2-primary-200 transition-colors">
                <span className="w-6 h-6 shrink-0 rounded-full bg-v2-primary-50 text-v2-primary-700 text-v2-xs font-bold flex items-center justify-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-v2-sm font-medium text-v2-text-primary">{t.gaps[p.id].title}</p>
                  {actions.has(p.id) && <ActionDetail item={actions.get(p.id)!} c={ac} showUsedBy />}
                </div>
                <Link to={p.cta} className="shrink-0 mt-0.5 inline-flex items-center gap-1 text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 hover:gap-1.5 transition-all">
                  {t.gaps[p.id].cta} <ArrowRight size={12} />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <aside className="lg:col-span-2 space-y-6">
          <section data-testid="twin-sources" className={`${card} p-5`}>
            <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.sourcesTitle}</h2>
            <p className="mt-1 text-v2-xs font-medium text-v2-text-secondary">{t.sourceCounts(declared, detected, verified)}</p>
            <dl className="mt-3 space-y-2">
              {(['declared', 'detected', 'verified'] as const).map((k) => (
                <div key={k} className="text-v2-xs">
                  <dt className="font-semibold text-v2-text-primary">{t.provenance[k]}</dt>
                  <dd className="text-v2-text-secondary">{t.provenanceHelp[k]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-v2-xl border border-v2-border-light bg-v2-neutral-50/60 p-5">
            <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.unavailableTitle}</h2>
            <ul className="mt-2 space-y-1.5">
              {twin.unavailable.map((id) => (
                <li key={id} className="flex items-start gap-2 text-v2-xs text-v2-text-secondary">
                  <Minus size={12} className="mt-0.5 shrink-0 text-v2-text-tertiary" /> {t.unavailable[id]}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-v2-xs text-v2-text-tertiary">{t.unavailableNote}</p>
          </section>
        </aside>
      </div>

      <section data-testid="twin-context" className={`${card} p-5`}>
        <h2 className="text-v2-sm font-semibold text-v2-text-primary">{t.contextTitle}</h2>
        <p className="mt-1 text-v2-xs text-v2-text-secondary">{t.contextIntro}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TOOL_ORDER.map((k) => (
            <Link key={k} to={TWIN_TOOL_ROUTES[k]}
              className="group rounded-v2-lg border border-v2-border-light px-3 py-3 hover:border-v2-primary-300 hover:bg-v2-primary-50/40 transition-colors">
              <p className="text-v2-sm font-semibold text-v2-text-primary flex items-center justify-between gap-2">
                {t.tools[k].name} <ArrowRight size={13} className="text-v2-text-tertiary group-hover:text-v2-primary-600 group-hover:translate-x-0.5 transition-all" />
              </p>
              <p className="mt-0.5 text-v2-xs text-v2-text-secondary">{t.tools[k].does}</p>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-v2-text-tertiary">{t.costNote}</p>
      </section>
    </div>
  );
}
