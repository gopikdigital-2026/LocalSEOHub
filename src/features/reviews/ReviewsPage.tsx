import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowLeft, Info, Link2, Loader2, MapPin, RefreshCw, Star } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { COPY, type ReviewsCopy } from './copy';
import ReviewCard, { type DraftState } from './ReviewCard';
import {
  ReviewsError, draftReply, loadReviewUsage, loadReviews,
  type ReviewUsage, type ReviewsErrorCode, type ReviewsLoad, type ReviewsState,
} from './repository';

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';

type Filter = 'all' | 'unanswered' | 'answered';
type PageData =
  | { kind: 'loading' }
  | { kind: 'error'; code: ReviewsErrorCode }
  | ReviewsLoad;

const EMPTY_DRAFT: DraftState = { text: null, loading: false, error: null };
const CONNECT_STATES = new Set<ReviewsState>(['not_connected']);

function StateCard({ state, t, onRetry }: { state: ReviewsState; t: ReviewsCopy; onRetry(): void }) {
  const s = t.states[state];
  const neutral = !CONNECT_STATES.has(state) && state !== 'no_location';
  return (
    <div
      data-testid="reviews-state"
      data-state={state}
      className={`rounded-v2-xl border p-6 sm:p-8 ${neutral ? 'border-v2-warning-200 bg-v2-warning-50/60' : 'border-v2-border-light bg-white'}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 shrink-0 rounded-v2-lg flex items-center justify-center ${neutral ? 'bg-v2-warning-100 text-v2-warning-700' : 'bg-v2-primary-50 text-v2-primary-600'}`}>
          {neutral ? <AlertTriangle size={18} /> : state === 'no_location' ? <MapPin size={18} /> : <Link2 size={18} />}
        </div>
        <div className="min-w-0">
          <h2 className="text-v2-lg font-semibold text-v2-text-primary">{s.title}</h2>
          <p className="mt-1.5 text-v2-sm text-v2-text-secondary leading-relaxed max-w-2xl">{s.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {s.action === 'reconnect' && (
              <Link to="/fuentes" className={btnPrimary}>{state === 'not_connected' ? t.connectCta : t.reconnectCta}</Link>
            )}
            {s.action === 'select' && <Link to="/fuentes" className={btnPrimary}>{t.selectCta}</Link>}
            {s.action === 'retry' && (
              <button type="button" onClick={onRetry} className={btnSecondary}><RefreshCw size={13} /> {t.retryCta}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const { lang } = useI18n();
  const t = lang === 'en' ? COPY.en : COPY.es;
  const navigate = useNavigate();
  const [data, setData] = useState<PageData>({ kind: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [usage, setUsage] = useState<ReviewUsage | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);

  const refreshUsage = useCallback(async () => {
    const u = await loadReviewUsage();
    setUsage(u);
    setUsageFailed(u === null);
  }, []);

  const load = useCallback(async () => {
    setData({ kind: 'loading' });
    setDrafts({});
    try {
      setData(await loadReviews());
    } catch (e) {
      setData({ kind: 'error', code: e instanceof ReviewsError ? e.code : 'unavailable' });
    }
  }, []);

  useEffect(() => { void load(); void refreshUsage(); }, [load, refreshUsage]);

  const remaining = usage ? Math.max(0, Math.min(usage.limit - usage.used, usage.globalLimit - usage.globalUsed)) : null;
  const atLimit = remaining === 0;
  const anyDrafting = Object.values(drafts).some((d) => d.loading);

  const setDraft = (id: string, patch: Partial<DraftState>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_DRAFT), ...patch } }));

  const generate = async (reviewId: string) => {
    setDraft(reviewId, { loading: true, error: null });
    try {
      const r = await draftReply({ reviewId, lang });
      if (r.kind === 'draft') setDraft(reviewId, { text: r.text, loading: false });
      else setDraft(reviewId, { loading: false, error: t.states[r.state].body });
    } catch (e) {
      setDraft(reviewId, { loading: false, error: t.errors[e instanceof ReviewsError ? e.code : 'unavailable'] });
    } finally {
      void refreshUsage();
    }
  };

  const discard = (id: string) => setDrafts((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });

  const header = (
    <div>
      <Link to="/herramientas" className="inline-flex items-center gap-1 text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-primary-600 transition-colors">
        <ArrowLeft size={13} /> {t.back}
      </Link>
      <div className="mt-3 flex items-start gap-3">
        <div className="w-11 h-11 shrink-0 rounded-v2-lg bg-v2-primary-600 text-white flex items-center justify-center shadow-sm">
          <Star size={20} />
        </div>
        <div>
          <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{t.title}</h1>
          <p className="text-v2-sm text-v2-text-secondary mt-1">{t.subtitle}</p>
        </div>
      </div>
    </div>
  );

  let body;
  if (data.kind === 'loading') {
    body = (
      <div className="flex items-center gap-2 text-v2-sm text-v2-text-secondary py-12 justify-center">
        <Loader2 size={16} className="animate-spin" /> {t.loading}
      </div>
    );
  } else if (data.kind === 'error') {
    body = (
      <div data-testid="reviews-error" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3 text-v2-sm text-v2-error-600">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div>
          {t.errors[data.code]}
          <div className="mt-2 flex flex-wrap gap-2">
            {data.code === 'premium_required' && (
              <button type="button" onClick={() => navigate('/facturacion')} className={btnSecondary}>{t.premiumCta}</button>
            )}
            {data.code !== 'premium_required' && data.code !== 'unauthorized' && (
              <button type="button" onClick={() => void load()} className={btnSecondary}><RefreshCw size={13} /> {t.retryCta}</button>
            )}
          </div>
        </div>
      </div>
    );
  } else if (data.kind === 'state') {
    body = <StateCard state={data.state} t={t} onRetry={() => void load()} />;
  } else if (data.reviews.length === 0) {
    body = (
      <div data-testid="reviews-empty" className="rounded-v2-xl border border-v2-border-light bg-white p-8 text-center">
        <div className="mx-auto w-11 h-11 rounded-full bg-v2-neutral-100 text-v2-text-tertiary flex items-center justify-center"><Star size={20} /></div>
        <h2 className="mt-3 text-v2-lg font-semibold text-v2-text-primary">{t.emptyTitle}</h2>
        <p className="mt-1 text-v2-sm text-v2-text-secondary">{t.emptyBody}</p>
      </div>
    );
  } else {
    const unanswered = data.reviews.filter((r) => !r.ownerReply);
    const answered = data.reviews.filter((r) => r.ownerReply);
    const shown = filter === 'all' ? data.reviews : filter === 'unanswered' ? unanswered : answered;
    const hasGoogleSummary = data.averageRating !== null || data.totalReviewCount !== null;
    const tabs: Array<{ id: Filter; label: string; n: number }> = [
      { id: 'all', label: t.filterAll, n: data.reviews.length },
      { id: 'unanswered', label: t.unanswered, n: unanswered.length },
      { id: 'answered', label: t.answered, n: answered.length },
    ];

    body = (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:order-2">
          <div data-testid="reviews-summary" className="rounded-v2-xl border border-v2-border-light bg-white p-5">
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[[t.loaded, data.reviews.length, 'text-v2-text-primary'], [t.unanswered, unanswered.length, 'text-v2-warning-700'], [t.answered, answered.length, 'text-v2-success-700']].map(([label, n, cls]) => (
                <div key={label as string}>
                  <dd className={`text-v2-2xl font-bold ${cls}`}>{n}</dd>
                  <dt className="mt-0.5 text-[11px] text-v2-text-tertiary leading-tight">{label}</dt>
                </div>
              ))}
            </dl>
            {hasGoogleSummary && (
              <p className="mt-4 border-t border-v2-border-light pt-3 text-v2-xs text-v2-text-secondary">
                {t.googleSummary(data.averageRating !== null ? data.averageRating.toFixed(1) : null, data.totalReviewCount)}
              </p>
            )}
            {!data.complete && <p className="mt-2 text-v2-xs text-v2-text-tertiary">{t.partial(data.reviews.length)}</p>}
          </div>

          <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
            {usage && remaining !== null ? (
              <>
                <p data-testid="reviews-usage" className={`text-v2-sm font-semibold ${atLimit ? 'text-v2-error-600' : 'text-v2-text-primary'}`}>{t.usage(usage.used, usage.limit)}</p>
                <div className="mt-2 h-1.5 rounded-full bg-v2-neutral-100 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${atLimit ? 'bg-v2-error-500' : 'bg-v2-primary-500'}`} style={{ width: `${Math.min(100, usage.limit ? (usage.used / usage.limit) * 100 : 100)}%` }} />
                </div>
                {atLimit && <p className="mt-2 text-v2-xs text-v2-error-600">{usage.used >= usage.limit ? t.errors.review_limit : t.errors.global_limit}</p>}
              </>
            ) : usageFailed ? (
              <p className="text-v2-xs text-v2-text-tertiary">{t.usageUnavailable}</p>
            ) : (
              <div className="h-4 w-40 rounded bg-v2-neutral-100 animate-pulse" />
            )}
            <p className="mt-3 text-[11px] text-v2-text-tertiary leading-relaxed">{t.usageNote}</p>
          </div>

          <p className="flex items-start gap-2 rounded-v2-lg border border-v2-primary-100 bg-v2-primary-50/60 p-3.5 text-v2-xs text-v2-text-secondary leading-relaxed">
            <Info size={14} className="mt-0.5 shrink-0 text-v2-primary-600" /> {t.readOnlyNote}
          </p>
        </aside>

        <section className="lg:col-span-2 lg:order-1 space-y-4">
          <div role="tablist" className="inline-flex rounded-v2-lg border border-v2-border-light bg-white p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={`rounded-v2-md px-3 py-1.5 text-v2-xs font-medium transition-colors ${filter === tab.id ? 'bg-v2-primary-600 text-white' : 'text-v2-text-secondary hover:text-v2-primary-600'}`}
              >
                {tab.label} <span className="opacity-70">{tab.n}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="rounded-v2-xl border border-dashed border-v2-border-light bg-white p-6 text-center text-v2-sm text-v2-text-tertiary">{t.filterEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {shown.map((r) => (
                <ReviewCard
                  key={r.reviewId}
                  review={r}
                  t={t}
                  lang={lang}
                  draft={drafts[r.reviewId]}
                  canDraft={!atLimit && !anyDrafting}
                  onDraft={() => void generate(r.reviewId)}
                  onEdit={(text) => setDraft(r.reviewId, { text })}
                  onDiscard={() => discard(r.reviewId)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {body}
    </div>
  );
}
