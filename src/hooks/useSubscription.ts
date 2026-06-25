import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export type SubscriptionStatus = 'trialing' | 'active' | 'inactive' | 'loading';

export function useSubscription(user: User | null) {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [trialEnd, setTrialEnd] = useState<Date | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setIsActive(false);
      setStatus('inactive');
      setTrialEnd(null);
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
      setIsActive(false);
      setStatus('inactive');
      setTrialEnd(null);
      setLoadingSubscription(false);
      return;
    }

    const { data: sub } = await supabase
      .from('stripe_subscriptions')
      .select('status, trial_end')
      .eq('customer_id', customer.customer_id)
      .maybeSingle();

    const subStatus = sub?.status;
    const active = subStatus === 'active' || subStatus === 'trialing';
    setIsActive(active);
    setStatus(active ? (subStatus as SubscriptionStatus) : 'inactive');
    setTrialEnd(sub?.trial_end ? new Date(sub.trial_end * 1000) : null);
    setLoadingSubscription(false);
  }, [user]);

  useEffect(() => {
    setLoadingSubscription(true);
    fetchStatus();
  }, [fetchStatus]);

  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return { isActive, status, trialEnd, trialDaysLeft, loadingSubscription, refresh: fetchStatus };
}
