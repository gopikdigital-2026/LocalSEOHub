import { createContext, useContext } from 'react';
import type { BillingStatus } from './model';

export interface BillingContextValue {
  status: BillingStatus | null;
  loading: boolean;
  error: boolean;
  /** Premium is unknown until the server answers; callers treat null as "do not write yet". */
  hasPremium: boolean | null;
  refresh(): Promise<BillingStatus | null>;
  startTrial(): Promise<BillingStatus>;
}

export const BillingContext = createContext<BillingContextValue | null>(null);

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used inside BillingProvider');
  return ctx;
}
