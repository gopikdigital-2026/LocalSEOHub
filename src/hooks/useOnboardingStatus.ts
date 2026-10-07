import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useBusiness } from '../features/business-memory/BusinessContext';

export type OnboardingStatus = 'loading' | 'not_started' | 'in_progress' | 'completed' | 'error';

interface OnboardingResult {
  status: OnboardingStatus;
  authenticated: boolean;
  userId: string | null;
  sessionLoading: boolean;
}

export function useOnboardingStatus(): OnboardingResult {
  const { userId, authenticated, currentBusiness, businessId, loading, error } = useBusiness();
  const [status, setStatus] = useState<OnboardingStatus>('loading');

  useEffect(() => {
    if (loading) {
      setStatus('loading');
      return;
    }
    if (!userId) {
      setStatus('not_started');
      return;
    }
    if (error || !businessId) {
      setStatus('error');
      return;
    }
    if (currentBusiness?.onboarding_completed) {
      setStatus('completed');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    getOnboardingStatusAsync(userId, businessId).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => { cancelled = true; };
  }, [userId, businessId, currentBusiness?.onboarding_completed, loading, error]);

  return {
    status,
    authenticated,
    userId,
    sessionLoading: loading,
  };
}

export async function getOnboardingStatusAsync(userId: string, businessId: string): Promise<OnboardingStatus> {
  const { data, error } = await supabase
    .from('first_value_progress')
    .select('completed, completed_at, current_step')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.error('[onboarding] status check error:', error);
    return 'error';
  }
  if (!data) return 'not_started';
  if (data.completed === true && data.completed_at !== null) return 'completed';
  return 'in_progress';
}
