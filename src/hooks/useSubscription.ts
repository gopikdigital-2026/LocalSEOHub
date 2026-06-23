import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

export function useSubscription(user: User | null) {
  const [isActive, setIsActive] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setIsActive(false);
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
      setLoadingSubscription(false);
      return;
    }

    const { data: sub } = await supabase
      .from('stripe_subscriptions')
      .select('status')
      .eq('customer_id', customer.customer_id)
      .maybeSingle();

    setIsActive(sub?.status === 'active' || sub?.status === 'trialing');
    setLoadingSubscription(false);
  }, [user]);

  useEffect(() => {
    setLoadingSubscription(true);
    fetchStatus();
  }, [fetchStatus]);

  return { isActive, loadingSubscription, refresh: fetchStatus };
}
