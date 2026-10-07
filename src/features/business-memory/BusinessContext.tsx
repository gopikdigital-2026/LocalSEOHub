import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { BusinessPatch, BusinessRecord } from './businessRecord';
import { importLegacyMemory, resolveBusiness, updateBusinessRecord } from './businessRepository';

interface BusinessContextValue {
  currentBusiness: BusinessRecord | null;
  businessId: string | null;
  userId: string | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateBusiness: (patch: BusinessPatch) => Promise<BusinessRecord>;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

function browserStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session, loading: sessionLoading } = useAuth();
  const userId = session?.user?.id ?? null;
  const [currentBusiness, setCurrentBusiness] = useState<BusinessRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (uid: string, isCancelled: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const resolved = await resolveBusiness(uid);
      const migrated = await importLegacyMemory(resolved, browserStorage()).catch(() => resolved);
      if (!isCancelled()) setCurrentBusiness(migrated);
    } catch (e) {
      if (!isCancelled()) {
        setCurrentBusiness(null);
        setError(e instanceof Error ? e.message : 'No se pudo cargar tu negocio');
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) {
      setCurrentBusiness(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    load(userId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [userId, sessionLoading, load]);

  const refresh = useCallback(async () => {
    if (userId) await load(userId, () => false);
  }, [userId, load]);

  const updateBusiness = useCallback(
    async (patch: BusinessPatch) => {
      if (!currentBusiness) throw new Error('No hay negocio cargado');
      const updated = await updateBusinessRecord(currentBusiness.id, patch);
      setCurrentBusiness(updated);
      return updated;
    },
    [currentBusiness],
  );

  return (
    <BusinessContext.Provider
      value={{
        currentBusiness,
        businessId: currentBusiness?.id ?? null,
        userId,
        authenticated: !!session,
        loading: sessionLoading || loading || (!!userId && currentBusiness?.user_id !== userId && !error),
        error,
        refresh,
        updateBusiness,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used inside BusinessProvider');
  return ctx;
}
