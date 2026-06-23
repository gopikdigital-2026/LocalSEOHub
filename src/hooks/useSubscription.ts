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
    const { data } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    setIsActive(data?.status === 'active');
    setLoadingSubscription(false);
  }, [user]);

  useEffect(() => {
    setLoadingSubscription(true);
    fetchStatus();
  }, [fetchStatus]);

  return { isActive, loadingSubscription, refresh: fetchStatus };
}
