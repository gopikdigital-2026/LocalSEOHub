import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BillingContext, type BillingContextValue } from './BillingContext';
import { useAuth } from '../../hooks/useAuth';
import { fetchBillingStatus, startTrial as startTrialRpc } from './repository';
import { serverNow, type BillingStatus } from './model';
import { trackTrialExpired, trackTrialStarted } from './analytics';

const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

export default function BillingProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const userRef = useRef<string | null>(null);
  userRef.current = userId;

  const refresh = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) return null;
    setLoading(true);
    try {
      const next = await fetchBillingStatus();
      if (userRef.current !== uid) return null;
      setStatus(next);
      setError(false);
      if (next.state === 'TRIAL_EXPIRED' && next.trialEndsAt) trackTrialExpired(uid, next.trialEndsAt);
      return next;
    } catch {
      if (userRef.current === uid) setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const startTrial = useCallback(async () => {
    const uid = userRef.current;
    if (!uid) throw new Error('no_session');
    const { status: next, created, emailNotVerified } = await startTrialRpc();
    setStatus(next);
    setError(false);
    if (emailNotVerified) throw new Error('email_not_verified');
    if (created) trackTrialStarted(uid);
    return next;
  }, []);

  useEffect(() => {
    setStatus(null);
    setError(false);
    if (userId) void refresh();
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, refresh]);

  useEffect(() => {
    if (!status || status.state !== 'TRIAL_ACTIVE' || !status.trialEndsAt) return;
    const wait = Date.parse(status.trialEndsAt) - serverNow(status) + 1000;
    if (wait <= 0 || wait > MAX_TIMER_MS) return;
    const timer = window.setTimeout(() => { void refresh(); }, wait);
    return () => window.clearTimeout(timer);
  }, [status, refresh]);

  const value = useMemo<BillingContextValue>(() => ({
    status,
    loading,
    error,
    hasPremium: status ? status.hasPremium : null,
    refresh,
    startTrial,
  }), [status, loading, error, refresh, startTrial]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}
