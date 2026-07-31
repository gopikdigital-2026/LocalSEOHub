import type { RealityState, SourceState, SourceId, SyncEvent } from './types';

const STORAGE_KEY = 'lsh_v2_reality_state';

function getDefaultState(): RealityState {
  return {
    sources: [
      { id: 'google_business', name: 'Google Business Profile', description: 'Perfil de negocio', icon: 'Building2', status: 'not_connected', health: 'unknown', connected: false, lastSync: null, nextSync: null, lastError: null, confidence: 'demo', permissions: [], dataSourceType: 'google_business' },
      { id: 'website', name: 'Sitio web', description: 'Analisis web', icon: 'Globe', status: 'not_connected', health: 'unknown', connected: false, lastSync: null, nextSync: null, lastError: null, confidence: 'demo', permissions: [], dataSourceType: 'website' },
      { id: 'reviews', name: 'Resenas de Google', description: 'Resenas', icon: 'MessageSquare', status: 'not_connected', health: 'unknown', connected: false, lastSync: null, nextSync: null, lastError: null, confidence: 'demo', permissions: [], dataSourceType: 'reviews' },
      { id: 'search_console', name: 'Google Search Console', description: 'Busquedas', icon: 'Search', status: 'not_connected', health: 'unknown', connected: false, lastSync: null, nextSync: null, lastError: null, confidence: 'demo', permissions: [], dataSourceType: 'google_business' },
      { id: 'analytics', name: 'Google Analytics', description: 'Trafico', icon: 'BarChart2', status: 'not_connected', health: 'unknown', connected: false, lastSync: null, nextSync: null, lastError: null, confidence: 'demo', permissions: [], dataSourceType: 'website' },
      { id: 'manual', name: 'Entrada manual', description: 'Datos manuales', icon: 'PenTool', status: 'connected', health: 'healthy', connected: true, lastSync: new Date().toISOString(), nextSync: null, lastError: null, confidence: 'verified', permissions: ['read_write'], dataSourceType: 'manual' },
    ],
    syncHistory: [],
    lastGlobalSync: null,
  };
}

function readState(): RealityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RealityState;
  } catch { /* corrupted - reset */ }
  return getDefaultState();
}

function writeState(state: RealityState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
}

export interface RealityRepository {
  load(): RealityState;
  save(state: RealityState): void;
  getSource(id: SourceId): SourceState | undefined;
  updateSource(id: SourceId, patch: Partial<SourceState>): void;
  addSyncEvent(event: SyncEvent): void;
  getSyncHistory(sourceId?: SourceId): SyncEvent[];
}

export function createRealityRepository(): RealityRepository {
  let state = readState();

  return {
    load() {
      state = readState();
      return state;
    },

    save(newState: RealityState) {
      state = newState;
      writeState(state);
    },

    getSource(id: SourceId) {
      return state.sources.find((s) => s.id === id);
    },

    updateSource(id: SourceId, patch: Partial<SourceState>) {
      state = {
        ...state,
        sources: state.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      };
      writeState(state);
    },

    addSyncEvent(event: SyncEvent) {
      state = {
        ...state,
        syncHistory: [event, ...state.syncHistory].slice(0, 100),
        lastGlobalSync: event.timestamp,
      };
      writeState(state);
    },

    getSyncHistory(sourceId?: SourceId) {
      if (sourceId) return state.syncHistory.filter((e) => e.sourceId === sourceId);
      return state.syncHistory;
    },
  };
}
