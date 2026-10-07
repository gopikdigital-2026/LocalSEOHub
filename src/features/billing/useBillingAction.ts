import { useCallback, useState } from 'react';
import { BillingActionError, runBillingAction, type BillingAction, type BillingErrorCode } from './repository';

export function useBillingAction(onDone?: () => void) {
  const [pending, setPending] = useState<BillingAction | null>(null);
  const [errorCode, setErrorCode] = useState<BillingErrorCode | null>(null);

  const run = useCallback(async (action: BillingAction) => {
    setPending(action);
    setErrorCode(null);
    try {
      const { url } = await runBillingAction(action);
      if (url) {
        window.location.assign(url);
        return;
      }
      onDone?.();
    } catch (err) {
      setErrorCode(err instanceof BillingActionError ? err.code : 'billing_failed');
      if (err instanceof BillingActionError && err.code === 'already_subscribed') onDone?.();
    } finally {
      setPending(null);
    }
  }, [onDone]);

  return { run, pending, errorCode, clearError: () => setErrorCode(null) };
}
