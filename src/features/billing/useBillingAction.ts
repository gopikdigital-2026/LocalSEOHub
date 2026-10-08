import { useCallback, useEffect, useState } from 'react';
import { BillingActionError, runBillingAction, type BillingAction, type BillingErrorCode } from './repository';

export function useBillingAction(onDone?: () => void) {
  const [pending, setPending] = useState<BillingAction | null>(null);
  const [errorCode, setErrorCode] = useState<BillingErrorCode | null>(null);

  // Returning from Stripe with the back button restores this page from cache with the spinner still on.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setPending(null); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const run = useCallback(async (action: BillingAction) => {
    setPending(action);
    setErrorCode(null);
    let redirecting = false;
    try {
      const { url } = await runBillingAction(action);
      if (url) {
        redirecting = true;
        window.location.assign(url);
        return;
      }
      onDone?.();
    } catch (err) {
      setErrorCode(err instanceof BillingActionError ? err.code : 'billing_failed');
      if (err instanceof BillingActionError && err.code === 'already_subscribed') onDone?.();
    } finally {
      // Keep the button locked while the browser leaves for Stripe so a second click cannot start another session.
      if (!redirecting) setPending(null);
    }
  }, [onDone]);

  return { run, pending, errorCode, clearError: () => setErrorCode(null) };
}
