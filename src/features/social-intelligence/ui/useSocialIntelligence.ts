import { useCallback, useEffect, useRef, useState } from 'react';
import { syncMetaContent } from '../../meta-connection/metaRepository';
import { loadSocialData, type SocialData } from './repository';
import type { RefreshStatus } from './copy';

export type SocialLoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: SocialData; evaluatedAt: string };

export interface SocialRefreshState {
  status: RefreshStatus;
  code: string | null;
  keptPrevious: boolean;
}

const IDLE: SocialRefreshState = { status: 'idle', code: null, keptPrevious: false };

export function useSocialIntelligence(businessId: string | null) {
  const [state, setState] = useState<SocialLoadState>({ kind: 'loading' });
  const [refresh, setRefresh] = useState<SocialRefreshState>(IDLE);
  const request = useRef(0);

  const read = useCallback(async (id: string): Promise<boolean> => {
    const ticket = ++request.current;
    try {
      const data = await loadSocialData(id);
      if (ticket === request.current) setState({ kind: 'ready', data, evaluatedAt: new Date().toISOString() });
      return true;
    } catch {
      return false;
    }
  }, []);

  const load = useCallback(async () => {
    if (!businessId) return;
    setState({ kind: 'loading' });
    setRefresh(IDLE);
    if (!(await read(businessId))) setState({ kind: 'error' });
  }, [businessId, read]);

  useEffect(() => {
    void load();
  }, [load]);

  const runRefresh = useCallback(async () => {
    if (!businessId || refresh.status === 'refreshing') return;
    setRefresh({ status: 'refreshing', code: null, keptPrevious: false });
    const result = await syncMetaContent();
    const code = result.ok ? null : result.code;
    const shouldReload = result.ok || code === 'REAUTH_REQUIRED';
    const reloaded = shouldReload ? await read(businessId) : false;
    // The final status is resolved by the page against the re-evaluated report.
    setRefresh({ status: 'success', code: shouldReload && !reloaded ? 'RELOAD_FAILED' : code, keptPrevious: !reloaded });
  }, [businessId, read, refresh.status]);

  return { state, refresh, reload: load, runRefresh };
}
