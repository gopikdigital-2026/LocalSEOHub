import { useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks whether we've already fired a signup/login event for this session
  // to avoid double-firing on token refreshes.
  const trackedRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (event === 'SIGNED_IN' && newSession?.user) {
        const uid = newSession.user.id;
        if (trackedRef.current === uid) return; // already tracked this session
        trackedRef.current = uid;

        const createdAt = new Date(newSession.user.created_at).getTime();
        const lastSignIn = new Date(newSession.user.last_sign_in_at ?? newSession.user.created_at).getTime();
        const isNewUser = Math.abs(lastSignIn - createdAt) < 5000;

        track(isNewUser ? 'signup_complete' : 'login_success', {
          method: newSession.user.app_metadata?.provider ?? 'unknown',
        });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = () => supabase.auth.signOut();

  return { user, session, loading, signOut };
}
