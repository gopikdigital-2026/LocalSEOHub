import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readConsent, writeConsent, type ConsentDecision } from '../../lib/consent';
import { applyTrackingConsent } from './applyConsent';
import ConsentBanner from './ConsentBanner';

interface ConsentContextValue {
  decision: ConsentDecision | null;
  openPreferences: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used inside ConsentProvider');
  return ctx;
}

export default function ConsentProvider({ children }: { children: ReactNode }) {
  const [decision, setDecision] = useState<ConsentDecision | null>(() => readConsent());
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const decide = useCallback((advertising: boolean) => {
    const wasGranted = readConsent()?.advertising === true;
    const next = writeConsent(advertising);
    setDecision(next);
    setPreferencesOpen(false);
    if (advertising !== wasGranted) applyTrackingConsent(advertising);
  }, []);

  const openPreferences = useCallback(() => setPreferencesOpen(true), []);
  const value = useMemo(() => ({ decision, openPreferences }), [decision, openPreferences]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
      <ConsentBanner
        open={decision === null || preferencesOpen}
        current={decision}
        onAccept={() => decide(true)}
        onReject={() => decide(false)}
        onClose={decision ? () => setPreferencesOpen(false) : undefined}
      />
    </ConsentContext.Provider>
  );
}
