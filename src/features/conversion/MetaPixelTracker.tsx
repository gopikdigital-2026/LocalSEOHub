import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../../lib/pixel';
import { useAuth } from '../../hooks/useAuth';
import { trackConfirmedRegistration } from './registration';

/** Consent activation sends the first PageView; this sends one per later route change (dropped without consent). */
export function shouldTrackPageView(previousPath: string, nextPath: string): boolean {
  return previousPath !== nextPath;
}

export default function MetaPixelTracker() {
  const { pathname } = useLocation();
  const lastPath = useRef(pathname);
  const { user } = useAuth();

  useEffect(() => {
    if (!shouldTrackPageView(lastPath.current, pathname)) return;
    lastPath.current = pathname;
    trackPageView();
  }, [pathname]);

  useEffect(() => {
    trackConfirmedRegistration(user);
  }, [user]);

  return null;
}
