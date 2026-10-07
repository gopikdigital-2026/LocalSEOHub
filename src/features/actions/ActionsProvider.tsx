import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBusiness } from '../business-memory/BusinessContext';
import { loadSources } from '../reality-engine/repositories';
import {
  trackRecommendationCompleted,
  trackRecommendationDismissed,
  trackRecommendationGenerated,
  trackRecommendationStarted,
} from '../../services/analytics/v2Analytics';
import { loadMilestones } from '../activation/repository';
import { advanceActivation } from '../activation/service';
import type { ActivationEvent, Milestones } from '../activation/milestones';
import { ActionsContext, type ActionsContextValue } from './ActionsContext';
import { openActions } from './engine';
import { syncActions, transitionAction, loadActions } from './repository';
import type { BusinessAction, SourceSnapshot } from './types';
import { useBilling } from '../billing/BillingContext';
import { PremiumRequiredError } from '../billing/model';

function fingerprint(updatedAt: string, sources: SourceSnapshot[]): string {
  return [updatedAt, ...sources.map((s) => `${s.sourceType}:${s.status}:${s.lastSyncAt ?? ''}`).sort()].join('|');
}

export default function ActionsProvider({ children }: { children: React.ReactNode }) {
  const { currentBusiness, userId } = useBusiness();
  const { hasPremium, error: billingError } = useBilling();
  const billingSettled = hasPremium !== null || billingError;
  const canWrite = hasPremium === true;
  const [actions, setActions] = useState<BusinessAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Milestones | null>(null);
  const [firstSuccess, setFirstSuccess] = useState<BusinessAction | null>(null);
  const lastSynced = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const milestonesRef = useRef<Milestones>({});

  const activate = useCallback(async (event: ActivationEvent, action: BusinessAction | null = null) => {
    if (!userId || !currentBusiness?.onboarding_completed) return [];
    try {
      const res = await advanceActivation(userId, currentBusiness, milestonesRef.current, event, action);
      milestonesRef.current = res.milestones;
      setMilestones(res.milestones);
      return res.added;
    } catch (err) {
      if (import.meta.env.DEV) console.error('[activation] milestone save failed:', err);
      return [];
    }
  }, [userId, currentBusiness]);

  const run = useCallback(async (force: boolean) => {
    if (!currentBusiness?.onboarding_completed || !billingSettled) return;
    if (inFlight.current) return inFlight.current;
    const job = (async () => {
      setLoading(true);
      try {
        if (!canWrite) {
          // Without a trial or subscription the plan is shown as it was saved; nothing new is written.
          setActions(await loadActions(currentBusiness.id));
          lastSynced.current = null;
          setError(null);
          return;
        }
        const sources: SourceSnapshot[] = (await loadSources(currentBusiness.id)).map((s) => ({
          sourceType: s.source_type,
          status: s.status,
          lastSyncAt: s.last_sync_at,
          metadata: s.metadata ?? {},
        }));
        const fp = fingerprint(currentBusiness.updated_at, sources);
        if (!force && fp === lastSynced.current) return;
        const result = await syncActions(currentBusiness, sources);
        lastSynced.current = fp;
        result.inserted.forEach(trackRecommendationGenerated);
        setActions(result.actions);
        setError(null);
        void activate({ type: 'recommendations_available', count: openActions(result.actions).length });
      } catch {
        setError('No hemos podido cargar tus acciones. Inténtalo de nuevo en unos segundos.');
      } finally {
        setLoading(false);
        setReadyFor(currentBusiness.id);
        inFlight.current = null;
      }
    })();
    inFlight.current = job;
    return job;
  }, [currentBusiness, activate, billingSettled, canWrite]);

  useEffect(() => {
    if (!currentBusiness) {
      setActions([]);
      setMilestones(null);
      milestonesRef.current = {};
      lastSynced.current = null;
      return;
    }
    run(false);
  }, [currentBusiness, run]);

  const businessKey = currentBusiness?.id ?? null;
  useEffect(() => {
    if (!userId || !businessKey) return;
    let active = true;
    loadMilestones(userId, businessKey)
      .then((m) => { if (active) { milestonesRef.current = m; setMilestones(m); } })
      .catch(() => { if (active) setMilestones(null); });
    return () => { active = false; };
  }, [userId, businessKey]);

  const replace = (updated: BusinessAction) =>
    setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));

  const transition = useCallback(async (action: BusinessAction, to: 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED') => {
    if (!canWrite) throw new PremiumRequiredError();
    const updated = await transitionAction(action.id, to);
    replace(updated);
    if (updated.status !== to) return;
    if (to === 'IN_PROGRESS') {
      trackRecommendationStarted(updated);
      void activate({ type: 'action_started', action: updated }, updated);
    }
    if (to === 'COMPLETED') {
      trackRecommendationCompleted(updated);
      const added = await activate({ type: 'action_completed', action: updated }, updated);
      if (added.includes('first_action_completed')) setFirstSuccess(updated);
    }
    if (to === 'DISMISSED') trackRecommendationDismissed(updated);
    if (to !== 'IN_PROGRESS') await run(true);
  }, [run, activate, canWrite]);

  const value = useMemo<ActionsContextValue>(() => ({
    actions,
    loading,
    ready: readyFor !== null && readyFor === businessKey,
    error,
    locked: hasPremium === false,
    milestones,
    firstSuccess,
    clearFirstSuccess: () => setFirstSuccess(null),
    ensureFresh: () => run(false),
    refresh: () => run(true),
    start: (a) => transition(a, 'IN_PROGRESS'),
    complete: (a) => transition(a, 'COMPLETED'),
    dismiss: (a) => transition(a, 'DISMISSED'),
  }), [actions, loading, readyFor, businessKey, error, hasPremium, milestones, firstSuccess, run, transition]);

  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}
