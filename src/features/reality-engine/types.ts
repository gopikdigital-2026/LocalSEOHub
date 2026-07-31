import type { DataSourceType, DataSourceStatus, ConfidenceLevel } from '../../domain/types';

// ─── Source Definition ──────────────────────────────────────────────────────

export type SourceId = 'google_business' | 'website' | 'reviews' | 'search_console' | 'analytics' | 'manual';

export type SourceHealth = 'healthy' | 'degraded' | 'error' | 'unknown';

export interface SourceState {
  id: SourceId;
  name: string;
  description: string;
  icon: string;
  status: DataSourceStatus;
  health: SourceHealth;
  connected: boolean;
  lastSync: string | null;
  nextSync: string | null;
  lastError: string | null;
  confidence: ConfidenceLevel;
  permissions: string[];
  dataSourceType: DataSourceType;
}

// ─── Sync State ─────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncEvent {
  id: string;
  sourceId: SourceId;
  timestamp: string;
  status: SyncStatus;
  message: string;
  recordsUpdated?: number;
}

// ─── Reality Engine State ───────────────────────────────────────────────────

export interface RealityState {
  sources: SourceState[];
  syncHistory: SyncEvent[];
  lastGlobalSync: string | null;
}

// ─── Source Registry Entry ──────────────────────────────────────────────────

export interface SourceRegistryEntry {
  id: SourceId;
  name: string;
  description: string;
  icon: string;
  dataSourceType: DataSourceType;
  defaultPermissions: string[];
  connectLabel: string;
  syncIntervalMinutes: number;
}
