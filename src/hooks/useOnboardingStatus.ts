import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

export type OnboardingStatus = 'loading' | 'not_started' | 'in_progress' | 'completed' | 'error';

interface OnboardingResult {
  status: OnboardingStatus;
  authenticated: boolean;
  userId: string | null;
  sessionLoading: boolean;
}

export function useOnboardingStatus(): OnboardingResult {
  const { session, loading: sessionLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const [status, setStatus] = useState<OnboardingStatus>('loading');

  useEffect(() => {
    if (sessionLoading) {
      setStatus('loading');
      return;
    }

    if (!userId) {
      setStatus('not_started');
      return;
    }

    let cancelled = false;

    supabase
      .from('first_value_progress')
      .select('completed, completed_at, current_step')
      .eq('user_id', userId)
      .eq('business_id', 'default')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;

        if (error) {
          if (import.meta.env.DEV) console.error('[onboarding] status check error:', error);
          setStatus('error');
          return;
        }

        if (!data) {
          setStatus('not_started');
          return;
        }

        if (data.completed === true && data.completed_at !== null) {
          setStatus('completed');
        } else {
          setStatus('in_progress');
        }
      });

    return () => { cancelled = true; };
  }, [userId, sessionLoading]);

  return {
    status,
    authenticated: !!session,
    userId,
    sessionLoading,
  };
}

export async function getOnboardingStatusAsync(userId: string): Promise<OnboardingStatus> {
  const { data, error } = await supabase
    .from('first_value_progress')
    .select('completed, completed_at, current_step')
    .eq('user_id', userId)
    .eq('business_id', 'default')
    .maybeSingle();

  if (error) return 'error';
  if (!data) return 'not_started';
  if (data.completed === true && data.completed_at !== null) return 'completed';
  return 'in_progress';
}
