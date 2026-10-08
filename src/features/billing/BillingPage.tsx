import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, CreditCard, Info, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useBilling } from './BillingContext';
import { billingCopy, type BillingCopy } from './billingCopy';
import { canSubscribe as canSubscribeIn, formatBillingDate, serverNow, trialCountdown, PRICE_LABEL, type BillingStatus } from './model';
import { useBillingAction } from './useBillingAction';
import { trackPaywallViewed } from './analytics';
import { runBillingAction } from './repository';
import { useI18n, type Lang } from '../../lib/i18n';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState } from '../../components/ui';

const TONE: Record<BillingStatus['state'], string> = {
  TRIAL_NOT_STARTED: 'bg-v2-neutral-100 text-v2-text-secondary',
  TRIAL_ACTIVE: 'bg-v2-primary-50 text-v2-primary-700',
  TRIAL_EXPIRED: 'bg-v2-warning-50 text-v2-warning-700',
  SUBSCRIPTION_ACTIVE: 'bg-v2-success-50 text-v2-success-700',
  SUBSCRIPTION_CANCELING: 'bg-v2-warning-50 text-v2-warning-700',
  SUBSCRIPTION_PAST_DUE: 'bg-v2-error-50 text-v2-error-600',
  SUBSCRIPTION_CANCELED: 'bg-v2-neutral-100 text-v2-text-secondary',
  PAYMENT_PENDING: 'bg-v2-warning-50 text-v2-warning-700',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-v2-border-light last:border-0">
      <dt className="text-v2-sm text-v2-text-secondary">{label}</dt>
      <dd className="text-v2-sm font-medium text-v2-text-primary text-right">{value}</dd>
    </div>
  );
}

function Details({ status, c, lang }: { status: BillingStatus; c: BillingCopy; lang: Lang }) {
  const rows: Array<[string, string]> = [[c.status, c.states[status.state]]];
  if (status.trialEndsAt && (status.state === 'TRIAL_ACTIVE' || status.state === 'TRIAL_EXPIRED')) {
    const cd = trialCountdown(status.trialEndsAt, serverNow(status));
    rows.push([c.trialEnd, formatBillingDate(status.trialEndsAt, lang, cd.kind === 'today')]);
  }
  if (status.currentPeriodEnd && (status.state === 'SUBSCRIPTION_ACTIVE' || status.state === 'SUBSCRIPTION_PAST_DUE')) {
    rows.push([c.nextBilling, formatBillingDate(status.currentPeriodEnd, lang)]);
  }
  if (status.currentPeriodEnd && status.state === 'SUBSCRIPTION_CANCELING') {
    rows.push([c.accessUntil, formatBillingDate(status.currentPeriodEnd, lang)]);
  }
  return <dl className="mt-2">{rows.map(([l, v]) => <Row key={l} label={l} value={v} />)}</dl>;
}

function CancelDialog({ c, until, busy, onConfirm, onClose }: { c: BillingCopy; until: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-v2-neutral-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="w-full max-w-md rounded-v2-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="cancel-title" className="text-v2-base font-semibold text-v2-text-primary">{c.cancelConfirmTitle}</h2>
          <button onClick={onClose} aria-label={c.keep} className="p-1 rounded-v2-md text-v2-neutral-400 hover:text-v2-text-primary"><X size={16} /></button>
        </div>
        <p className="mt-2 text-v2-sm text-v2-text-secondary leading-relaxed">{c.cancelConfirmBody(until)}</p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="v2-btn-secondary text-v2-sm px-4 py-2">{c.keep}</button>
          <button onClick={onConfirm} disabled={busy} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-v2-lg bg-v2-error-500 hover:bg-v2-error-600 text-white text-v2-sm font-medium transition-colors disabled:opacity-60">
            {busy && <Loader2 size={14} className="animate-spin" />} {c.cancelConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { lang } = useI18n();
  const c = billingCopy(lang);
  const { session } = useAuth();
  const { status, error, loading, refresh } = useBilling();
  const [params, setParams] = useSearchParams();
  const [returned] = useState(() => params.get('checkout'));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const syncedRef = useRef(false);
  const onDone = useCallback(() => { setConfirmCancel(false); void refresh(); }, [refresh]);
  const { run, pending, errorCode, clearError } = useBillingAction(onDone);

  useEffect(() => {
    if (!returned) return;
    setParams({}, { replace: true });
    if (returned === 'cancel' || syncedRef.current) return;
    syncedRef.current = true;
    // Access is never granted from this URL; the server re-reads Stripe and the webhook remains the source of truth.
    runBillingAction('sync').catch(() => {}).finally(() => { void refresh(); });
  }, [returned, setParams, refresh]);

  const userId = session?.user?.id;
  const state = status?.state;
  useEffect(() => {
    if (userId && state && !status?.hasPremium && state !== 'TRIAL_NOT_STARTED') trackPaywallViewed(userId, 'billing_page', state);
  }, [userId, state, status?.hasPremium]);

  if (!status && error) {
    return (
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-8 text-center">
        <AlertTriangle size={28} className="text-v2-warning-500 mx-auto mb-3" />
        <p className="text-v2-sm text-v2-text-secondary mb-4">{c.loadError}</p>
        <button onClick={() => void refresh()} className="v2-btn-primary text-v2-sm px-4 py-2">{c.retry}</button>
      </div>
    );
  }
  if (!status) return <LoadingState />;

  const s = status.state;
  const canSubscribe = canSubscribeIn(s);
  const hasSubscription = s === 'SUBSCRIPTION_ACTIVE' || s === 'SUBSCRIPTION_CANCELING' || s === 'SUBSCRIPTION_PAST_DUE' || s === 'PAYMENT_PENDING';
  const periodEnd = status.currentPeriodEnd ? formatBillingDate(status.currentPeriodEnd, lang) : '';
  const busy = pending !== null;

  const headline = s === 'TRIAL_EXPIRED' ? { t: c.upgradeTitle, b: c.upgradeBody }
    : s === 'SUBSCRIPTION_CANCELED' ? { t: c.canceledTitle, b: c.canceledBody }
    : s === 'SUBSCRIPTION_PAST_DUE' ? { t: c.pastDueTitle, b: c.pastDueBody }
    : s === 'PAYMENT_PENDING' ? { t: c.pendingTitle, b: c.pendingBody }
    : s === 'SUBSCRIPTION_CANCELING' && periodEnd ? { t: c.states.SUBSCRIPTION_CANCELING, b: c.cancelingBody(periodEnd) }
    : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-v2-2xl font-bold text-v2-text-primary">{c.pageTitle}</h1>
        <p className="mt-1 text-v2-sm text-v2-text-secondary">{c.pageSubtitle}</p>
      </header>

      {returned === 'success' && !status.hasPremium && (
        <div role="status" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-primary-200 bg-v2-primary-50 px-4 py-3">
          <Info size={14} className="text-v2-primary-600 mt-0.5 shrink-0" />
          <p className="text-v2-xs text-v2-primary-700">{c.checkoutReturned}</p>
        </div>
      )}
      {returned === 'cancel' && (
        <div role="status" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-border-light bg-white px-4 py-3">
          <Info size={14} className="text-v2-text-tertiary mt-0.5 shrink-0" />
          <p className="text-v2-xs text-v2-text-secondary">{c.checkoutCanceled}</p>
        </div>
      )}
      {errorCode && (
        <div role="alert" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3">
          <AlertTriangle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="flex-1 text-v2-xs text-v2-error-600">{c.errors[errorCode]}</p>
          <button onClick={clearError} aria-label={c.keep} className="text-v2-error-400 hover:text-v2-error-600"><X size={14} /></button>
        </div>
      )}

      {headline && (
        <section className="rounded-v2-xl border border-v2-warning-200 bg-v2-warning-50 p-5">
          <h2 className="text-v2-base font-semibold text-v2-text-primary">{headline.t}</h2>
          <p className="mt-1 text-v2-sm text-v2-text-secondary leading-relaxed">{headline.b}</p>
        </section>
      )}

      <section className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-v2-base font-semibold text-v2-text-primary">{c.plan}</h2>
            <p className="mt-1 text-v2-sm text-v2-text-secondary">{c.planDesc}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-v2-xs font-semibold ${TONE[s]}`}>{c.states[s]}</span>
        </div>
        <p className="mt-4 text-3xl font-bold text-v2-text-primary">
          {PRICE_LABEL[lang].split('/')[0]}<span className="text-v2-sm font-medium text-v2-text-tertiary">{c.perMonth}</span>
        </p>
        <Details status={status} c={c} lang={lang} />

        <div className="mt-6 flex flex-col sm:flex-row flex-wrap gap-3">
          {canSubscribe && (
            <button onClick={() => run('checkout')} disabled={busy} className="inline-flex items-center justify-center gap-2 v2-btn-primary text-v2-sm px-5 py-2.5 disabled:opacity-60">
              {pending === 'checkout' ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} {pending === 'checkout' ? c.openingCheckout : c.subscribe}
            </button>
          )}
          {s === 'SUBSCRIPTION_PAST_DUE' && (
            <button onClick={() => run('payment_method')} disabled={busy} className="inline-flex items-center justify-center gap-2 v2-btn-primary text-v2-sm px-5 py-2.5 disabled:opacity-60">
              {pending === 'payment_method' ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} {c.updatePayment}
            </button>
          )}
          {s === 'SUBSCRIPTION_CANCELING' && (
            <button onClick={() => run('resume')} disabled={busy} className="inline-flex items-center justify-center gap-2 v2-btn-primary text-v2-sm px-5 py-2.5 disabled:opacity-60">
              {pending === 'resume' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {c.resume}
            </button>
          )}
          {hasSubscription && (
            <button onClick={() => run('portal')} disabled={busy} className="inline-flex items-center justify-center gap-2 v2-btn-secondary text-v2-sm px-5 py-2.5 disabled:opacity-60">
              {pending === 'portal' && <Loader2 size={14} className="animate-spin" />} {c.manage}
            </button>
          )}
          {s === 'SUBSCRIPTION_ACTIVE' && (
            <button onClick={() => run('payment_method')} disabled={busy} className="v2-btn-ghost text-v2-sm px-4 py-2.5">{c.updatePayment}</button>
          )}
          {hasSubscription && (
            <button onClick={() => { void run('sync'); }} disabled={busy || loading} className="inline-flex items-center justify-center gap-2 v2-btn-ghost text-v2-sm px-4 py-2.5">
              <RefreshCw size={14} className={pending === 'sync' ? 'animate-spin' : ''} /> {c.refresh}
            </button>
          )}
        </div>

        {s === 'SUBSCRIPTION_ACTIVE' && (
          <button onClick={() => setConfirmCancel(true)} disabled={busy} className="mt-5 text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-error-600 transition-colors">
            {c.cancel}
          </button>
        )}

        <div className="mt-6 pt-4 border-t border-v2-border-light space-y-1.5">
          <p className="flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary"><ShieldCheck size={12} /> {c.secure}</p>
          {s === 'TRIAL_ACTIVE' && <p className="text-v2-xs text-v2-text-tertiary">{c.noCharge}</p>}
          {s === 'TRIAL_ACTIVE' && status.trialEndsAt && (
            <p className="text-v2-xs text-v2-text-tertiary">{c.subscribeDuringTrial(formatBillingDate(status.trialEndsAt, lang))}</p>
          )}
        </div>
      </section>

      {confirmCancel && (
        <CancelDialog c={c} until={periodEnd} busy={pending === 'cancel'} onConfirm={() => run('cancel')} onClose={() => setConfirmCancel(false)} />
      )}
    </div>
  );
}
