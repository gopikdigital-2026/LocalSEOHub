import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CloudOff, Info, RefreshCw, Share2, Unplug } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { useBusiness } from '../../business-memory/BusinessContext';
import { SOCIAL_UI_COPY, type RefreshStatus, type SocialUiCopy } from './copy';
import { analyseSocialData, buildSocialViewModel, refreshOutcome, type SocialViewModel } from './viewModel';
import { useSocialIntelligence } from './useSocialIntelligence';
import PlatformOverview from './PlatformOverview';
import AttentionSection from './AttentionSection';
import { CoverageSection, KnownSection } from './InsightSections';

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-semibold text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';

function SocialHeader({ copy }: { copy: SocialUiCopy }) {
  return (
    <header>
      <Link to="/herramientas" className="inline-flex items-center gap-1 text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-primary-600 transition-colors">
        <ArrowLeft size={13} aria-hidden="true" /> {copy.back}
      </Link>
      <div className="mt-3 flex items-start gap-3">
        <div className="w-11 h-11 shrink-0 rounded-v2-lg bg-v2-primary-600 text-white flex items-center justify-center shadow-sm">
          <Share2 size={20} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{copy.title}</h1>
          <p className="text-v2-sm text-v2-text-secondary mt-1 max-w-2xl leading-relaxed">{copy.subtitle}</p>
          <p className="mt-2 inline-flex items-start gap-1.5 text-v2-xs text-v2-text-tertiary">
            <Info size={13} aria-hidden="true" className="mt-px shrink-0" /> {copy.sourceNote}
          </p>
        </div>
      </div>
    </header>
  );
}

function SocialLoadingSkeleton({ label }: { label: string }) {
  const block = 'rounded-v2-xl bg-v2-neutral-100 animate-pulse motion-reduce:animate-none';
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-hidden="true">
        <div className={`${block} h-40`} />
        <div className={`${block} h-40`} />
      </div>
      <div className={`${block} h-32`} aria-hidden="true" />
    </div>
  );
}

function Notice({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action: React.ReactNode }) {
  return (
    <div role="status" className="rounded-v2-xl border border-v2-border-light bg-white px-6 py-10 text-center shadow-v2-sm">
      <div className="mx-auto w-12 h-12 rounded-full bg-v2-neutral-100 text-v2-text-secondary flex items-center justify-center" aria-hidden="true">
        {icon}
      </div>
      <h2 className="mt-4 text-v2-lg font-semibold text-v2-text-primary">{title}</h2>
      {body && <p className="mt-1 mx-auto max-w-md text-v2-sm text-v2-text-secondary leading-relaxed">{body}</p>}
      <div className="mt-5 flex justify-center">{action}</div>
    </div>
  );
}

function SocialEmptyState({ copy }: { copy: SocialUiCopy }) {
  return (
    <div data-testid="social-empty">
      <Notice
        icon={<Unplug size={22} />}
        title={copy.emptyTitle}
        body={copy.emptyBody}
        action={<Link to="/fuentes" className={btnPrimary}>{copy.connectCta}</Link>}
      />
      <p className="mt-3 text-center text-v2-xs text-v2-text-tertiary">{copy.emptyNote}</p>
    </div>
  );
}

interface FooterProps {
  copy: SocialUiCopy;
  status: RefreshStatus;
  keptPrevious: boolean;
  onRefresh(): void;
}

function AnalysisDataFooter({ copy, status, keptPrevious, onRefresh }: FooterProps) {
  const refreshing = status === 'refreshing';
  const message = status === 'idle' ? null : copy.refreshState[status];
  const needsSources = status === 'reauth' || status === 'permission';
  return (
    <footer className="rounded-v2-xl border border-v2-border-light bg-white p-5 shadow-v2-sm">
      <h2 className="text-v2-base font-semibold text-v2-text-primary">{copy.dataTitle}</h2>
      <p className="mt-1 text-v2-sm text-v2-text-secondary leading-relaxed">{copy.dataBody}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" className={btnSecondary} onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
          {refreshing ? copy.refreshState.refreshing : copy.refresh}
        </button>
        <p role="status" aria-live="polite" className="text-v2-xs text-v2-text-secondary">
          {message}
          {message && keptPrevious && status !== 'refreshing' && <span className="block text-v2-text-tertiary">{copy.showingLastGood}</span>}
        </p>
        {needsSources && <Link to="/fuentes" className="text-v2-xs font-semibold text-v2-primary-600 hover:underline">{copy.goToSources}</Link>}
      </div>
    </footer>
  );
}

export default function SocialIntelligencePage() {
  const { lang } = useI18n();
  const copy = SOCIAL_UI_COPY[lang];
  const { businessId, loading: businessLoading } = useBusiness();
  const { state, refresh, reload, runRefresh } = useSocialIntelligence(businessId);

  const vm = useMemo<SocialViewModel | null>(() => {
    if (state.kind !== 'ready') return null;
    return buildSocialViewModel(state.data, analyseSocialData(state.data, state.evaluatedAt), lang);
  }, [state, lang]);

  const refreshStatus: RefreshStatus =
    refresh.status === 'idle' || refresh.status === 'refreshing' ? refresh.status : refreshOutcome(refresh.code, vm);
  const refreshing = refreshStatus === 'refreshing';

  let body: React.ReactNode;
  if (!businessId && !businessLoading) {
    body = <Notice icon={<Info size={22} />} title={copy.noBusiness} action={<Link to="/negocio" className={btnPrimary}>{copy.noBusinessCta}</Link>} />;
  } else if (state.kind === 'loading' || !businessId) {
    body = <SocialLoadingSkeleton label={copy.loading} />;
  } else if (state.kind === 'error' || !vm) {
    body = (
      <Notice
        icon={<CloudOff size={22} />}
        title={copy.errorTitle}
        body={copy.errorTemporary}
        action={<button type="button" className={btnPrimary} onClick={() => void reload()}>{copy.retry}</button>}
      />
    );
  } else if (vm.kind === 'empty') {
    body = <SocialEmptyState copy={copy} />;
  } else {
    body = (
      <div aria-busy={refreshing} className={`space-y-8 transition-opacity motion-reduce:transition-none ${refreshing ? 'opacity-60' : ''}`}>
        <PlatformOverview title={copy.overviewTitle} cards={vm.overview} />
        <AttentionSection copy={copy} cards={vm.attention} refreshing={refreshing} onRefresh={() => void runRefresh()} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <KnownSection copy={copy} items={vm.known} />
          <CoverageSection copy={copy} coverage={vm.coverage} />
        </div>
        <AnalysisDataFooter copy={copy} status={refreshStatus} keptPrevious={refresh.keptPrevious} onRefresh={() => void runRefresh()} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SocialHeader copy={copy} />
      {body}
    </div>
  );
}
