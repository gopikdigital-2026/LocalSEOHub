import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useBusiness } from '../business-memory/BusinessContext';
import { resolvePersonalName } from './personalName';

export function usePersonalName(): { name: string | null; loading: boolean } {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.id ?? null;
  const [profileName, setProfileName] = useState<{ userId: string; fullName: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        const fullName = !error && data && typeof data.full_name === 'string' ? data.full_name : null;
        setProfileName({ userId, fullName });
      });
    return () => { cancelled = true; };
  }, [userId]);

  const profileLoaded = !!userId && profileName?.userId === userId;
  const name = user
    ? resolvePersonalName({
        profileFullName: profileLoaded ? profileName.fullName : null,
        userMetadata: user.user_metadata,
        email: user.email,
        businessNames: [currentBusiness?.name],
      })
    : null;

  return { name, loading: !!userId && !profileLoaded };
}
