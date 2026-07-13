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
        // 10s window to account for edge-function create → signIn latency
        const isNewUser = Math.abs(lastSignIn - createdAt) < 10000;
        const method = newSession.user.app_metadata?.provider ?? 'email';

        // register_success is the canonical funnel event for both email and Google signups
        track(isNewUser ? 'register_success' : 'login_success', { method });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = () => supabase.auth.signOut();

  return { user, session, loading, signOut };
}
