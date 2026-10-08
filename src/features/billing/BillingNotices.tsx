import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, CreditCard, Gift, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { useBilling } from './BillingContext';
import { billingCopy } from './billingCopy';
import { canSubscribe, formatBillingDate, needsUpgrade, serverNow, trialCountdown, PRICE_LABEL } from './model';
import { trackPaywallViewed } from './analytics';
import { useBillingAction } from './useBillingAction';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../hooks/useAuth';

const MINUTE = 60 * 1000;

function useMinuteClock() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), MINUTE);
    return () => window.clearInterval(id);
  }, []);
}

/** The single entry point to Stripe Checkout for every in-app upgrade CTA. */
export function SubscribeButton({ className, variant = 'primary' }: { className?: string; variant?: 'primary' | 'link' }) {
  const { refresh } = useBilling();
  const { lang } = useI18n();
  const c = billingCopy(lang);
  const onDone = useCallback(() => { void refresh(); }, [refresh]);
  const { run, pending, errorCode } = useBillingAction(onDone);
  const busy = pending === 'checkout';
  const look = variant === 'link'
    ? 'inline-flex items-center gap-1.5 text-v2-xs font-semibold text-v2-primary-700 hover:text-v2-primary-800 transition-colors whitespace-nowrap disabled:opacity-60'
    : 'inline-flex items-center justify-center gap-2 v2-btn-primary disabled:opacity-60';

  return (
    <div className={variant === 'link' ? 'flex flex-col items-start sm:items-end' : 'w-full'}>
      <button type="button" onClick={() => { void run('checkout'); }} disabled={busy} aria-busy={busy} className={`${look} ${className ?? ''}`}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : variant === 'primary' && <CreditCard size={14} />}
        {busy ? c.openingCheckout : c.subscribe}
      </button>
      {errorCode && (
        <p role="alert" className="mt-2 text-v2-xs text-v2-error-600">
          {c.errors[errorCode]}{' '}
          {(errorCode === 'already_subscribed' || errorCode === 'billing_unavailable') && (
            <Link to="/facturacion" className="font-semibold underline underline-offset-2">{c.viewBilling}</Link>
          )}
        </p>
      )}
    </div>
  );
}

/** Thin status line above every app page; hidden when there is nothing worth saying. */
export function TrialBanner() {
  const { status } = useBilling();
  const { lang } = useI18n();
  const c = billingCopy(lang);
  useMinuteClock();
  if (!status) return null;

  if (status.state === 'TRIAL_ACTIVE' && status.trialEndsAt) {
    const cd = trialCountdown(status.trialEndsAt, serverNow(status));
    const endsLabel = formatBillingDate(status.trialEndsAt, lang, cd.kind === 'today');
    const urgent = cd.kind === 'today';
    return (
      <div className={`mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-v2-lg border px-4 py-3 animate-fade-in
        ${urgent ? 'border-v2-warning-200 bg-v2-warning-50' : 'border-v2-primary-200 bg-v2-primary-50'}`}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Clock size={15} className={urgent ? 'text-v2-warning-600 shrink-0' : 'text-v2-primary-600 shrink-0'} />
          <p className="text-v2-sm text-v2-text-primary">
            <span className="font-semibold">
              {cd.kind === 'days' ? c.daysLeft(cd.days) : cd.kind === 'today' ? c.endsToday : c.ended}
            </span>
            <span className="text-v2-text-secondary"> · {c.endsOn(endsLabel)}</span>
          </p>
        </div>
        <Link to="/facturacion" className="text-v2-xs font-semibold text-v2-primary-700 hover:text-v2-primary-800 transition-colors whitespace-nowrap">
          {c.viewBilling}
        </Link>
      </div>
    );
  }

  if (status.state === 'SUBSCRIPTION_PAST_DUE' || status.state === 'PAYMENT_PENDING' || needsUpgrade(status.state)) {
    const pastDue = status.state === 'SUBSCRIPTION_PAST_DUE';
    const pending = status.state === 'PAYMENT_PENDING';
    const title = pastDue ? c.pastDueTitle : pending ? c.pendingTitle : status.state === 'TRIAL_EXPIRED' ? c.ended : c.canceledTitle;
    return (
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-v2-lg border border-v2-warning-200 bg-v2-warning-50 px-4 py-3 animate-fade-in">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <AlertTriangle size={15} className="text-v2-warning-600 shrink-0" />
          <p className="text-v2-sm font-semibold text-v2-text-primary">{title}</p>
        </div>
        {pending || pastDue ? (
          <Link to="/facturacion" className="text-v2-xs font-semibold text-v2-primary-700 hover:text-v2-primary-800 transition-colors whitespace-nowrap">
            {pending ? c.viewBilling : c.updatePayment}
          </Link>
        ) : (
          <SubscribeButton variant="link" />
        )}
      </div>
    );
  }

  return null;
}

/** Shown wherever an action would be written while the user has no trial or subscription. */
export function PaywallNotice({ surface }: { surface: string }) {
  const { status } = useBilling();
  const { session } = useAuth();
  const { lang } = useI18n();
  const c = billingCopy(lang);
  const userId = session?.user?.id;
  const state = status?.state ?? null;

  useEffect(() => {
    if (userId && state) trackPaywallViewed(userId, surface, state);
  }, [userId, surface, state]);

  if (!status || status.hasPremium || status.state === 'TRIAL_NOT_STARTED') return null;
  const expired = status.state === 'TRIAL_EXPIRED';
  const canceled = status.state === 'SUBSCRIPTION_CANCELED';

  return (
    <section className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6 shadow-v2-sm animate-fade-in" aria-label={c.upgradeTitle}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-v2-lg bg-v2-primary-50 flex items-center justify-center shrink-0">
          <Lock size={18} className="text-v2-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-v2-base font-semibold text-v2-text-primary">
            {expired ? c.upgradeTitle : canceled ? c.canceledTitle : status.state === 'SUBSCRIPTION_PAST_DUE' ? c.pastDueTitle : c.pendingTitle}
          </h2>
          <p className="mt-1 text-v2-sm text-v2-text-secondary leading-relaxed">
            {expired ? c.upgradeBody : canceled ? c.canceledBody : status.state === 'SUBSCRIPTION_PAST_DUE' ? c.pastDueBody : c.pendingBody}
          </p>
          <p className="mt-2 text-v2-xs text-v2-text-tertiary">{c.paywallAction}</p>
          {canSubscribe(status.state) ? (
            <div className="mt-4 max-w-xs"><SubscribeButton className="text-v2-sm px-4 py-2" /></div>
          ) : (
            <Link to="/facturacion" className="mt-4 inline-flex v2-btn-primary text-v2-sm px-4 py-2">
              {status.state === 'SUBSCRIPTION_PAST_DUE' ? c.updatePayment : c.viewBilling}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** Explicit, card-free trial activation for accounts that finished onboarding before trials existed. */
export function TrialStartCard() {
  const { status, startTrial } = useBilling();
  const { lang } = useI18n();
  const c = billingCopy(lang);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (status?.state !== 'TRIAL_NOT_STARTED') return null;

  const onStart = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await startTrial();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-v2-xl border border-v2-primary-200 bg-gradient-to-br from-v2-primary-50 via-white to-white p-5 sm:p-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-v2-lg bg-v2-primary-600 flex items-center justify-center shrink-0">
          <Gift size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-v2-base font-semibold text-v2-text-primary">{c.startTitle}</h2>
          <p className="mt-1 text-v2-sm text-v2-text-secondary leading-relaxed">{c.startBody}</p>
          {failed && <p role="alert" className="mt-2 text-v2-xs text-v2-error-600">{c.startError}</p>}
          <button onClick={onStart} disabled={busy} className="mt-4 v2-btn-primary text-v2-sm px-4 py-2 disabled:opacity-60">
            {busy ? c.starting : c.startCta}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Sidebar card on Today summarising the single plan and the user's current standing. */
export function PlanCard() {
  const { status } = useBilling();
  const { lang } = useI18n();
  const c = billingCopy(lang);
  if (!status || status.state === 'SUBSCRIPTION_ACTIVE') return null;
  const canceling = status.state === 'SUBSCRIPTION_CANCELING';

  return (
    <section className="relative overflow-hidden rounded-v2-2xl border border-v2-primary-200 bg-gradient-to-br from-v2-primary-50 via-white to-v2-primary-50/50 p-5" aria-label={c.plan}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-v2-primary-100/40 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-v2-primary-600" />
          <h2 className="text-v2-sm font-semibold text-v2-primary-700">{c.plan}</h2>
        </div>
        <p className="text-v2-2xl font-bold text-v2-text-primary">{PRICE_LABEL[lang]}</p>
        <p className="mt-1 mb-4 text-v2-xs text-v2-text-secondary">
          {canceling && status.currentPeriodEnd ? c.cancelingBody(formatBillingDate(status.currentPeriodEnd, lang)) : c.planDesc}
        </p>
        {canSubscribe(status.state) ? (
          <SubscribeButton className="w-full text-v2-xs py-2.5" />
        ) : (
          <Link to="/facturacion" className="w-full inline-flex justify-center v2-btn-primary text-v2-xs py-2.5">
            {status.state === 'SUBSCRIPTION_PAST_DUE' ? c.updatePayment : c.viewBilling}
          </Link>
        )}
        {status.state === 'TRIAL_ACTIVE' && status.trialEndsAt && (
          <p className="mt-2 text-[11px] text-v2-text-tertiary leading-relaxed">
            {c.subscribeDuringTrial(formatBillingDate(status.trialEndsAt, lang))}
          </p>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-v2-text-tertiary">
          <ShieldCheck size={12} /> {c.secure}
        </p>
      </div>
    </section>
  );
}
