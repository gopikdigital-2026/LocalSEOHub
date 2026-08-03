import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export type SubscriptionStatus = 'trialing' | 'active' | 'inactive' | 'loading';

const TRIAL_DAYS = 7;

function getAccountTrialEnd(user: User): Date | null {
  if (!user.created_at) return null;
  return new Date(new Date(user.created_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

function isInAccountTrial(user: User): boolean {
  const end = getAccountTrialEnd(user);
  return end !== null && end.getTime() > Date.now();
}

export function useSubscription(user: User | null) {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [trialEnd, setTrialEnd] = useState<Date | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<Date | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setIsActive(false);
      setStatus('inactive');
      setTrialEnd(null);
      setCancelAtPeriodEnd(false);
      setCurrentPeriodEnd(null);
      setLoadingSubscription(false);
      return;
    }

    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!customer?.customer_id) {
      // No Stripe customer yet — grant access during account trial period
      const inTrial = isInAccountTrial(user);
      setIsActive(inTrial);
      setStatus(inTrial ? 'trialing' : 'inactive');
      setTrialEnd(inTrial ? getAccountTrialEnd(user) : null);
      setCancelAtPeriodEnd(false);
      setCurrentPeriodEnd(null);
      setLoadingSubscription(false);
      return;
    }

    const { data: sub } = await supabase
      .from('stripe_subscriptions')
      .select('status, trial_end, cancel_at_period_end, current_period_end')
      .eq('customer_id', customer.customer_id)
      .maybeSingle();

    const subStatus = sub?.status;
    const stripeActive = subStatus === 'active' || subStatus === 'trialing';

    // Fall back to account trial if Stripe subscription is not yet active
    const inTrial = !stripeActive && isInAccountTrial(user);
    const active = stripeActive || inTrial;

    setIsActive(active);
    setStatus(active ? (stripeActive ? (subStatus as SubscriptionStatus) : 'trialing') : 'inactive');
    setTrialEnd(
      sub?.trial_end
        ? new Date(sub.trial_end * 1000)
        : inTrial
          ? getAccountTrialEnd(user)
          : null
    );
    setCancelAtPeriodEnd(sub?.cancel_at_period_end ?? false);
    setCurrentPeriodEnd(sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null);
    setLoadingSubscription(false);
  }, [user]);

  useEffect(() => {
    setLoadingSubscription(true);
    fetchStatus();
  }, [fetchStatus]);

  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return { isActive, status, trialEnd, trialDaysLeft, cancelAtPeriodEnd, currentPeriodEnd, loadingSubscription, refresh: fetchStatus };
}

