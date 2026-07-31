import type { SourceId, SourceState, SyncEvent, SourceHealth } from './types';
import type { RealityRepository } from './repositories';
import type { ConfidenceLevel, DataSourceStatus } from '../../domain/types';
import { getSourceEntry } from './registry';

// ─── Connect a Source ───────────────────────────────────────────────────────

export function connectSource(repo: RealityRepository, sourceId: SourceId): SourceState {
  const entry = getSourceEntry(sourceId);
  const now = new Date().toISOString();

  const patch: Partial<SourceState> = {
    status: 'connected' as DataSourceStatus,
    health: 'healthy' as SourceHealth,
    connected: true,
    lastSync: now,
    nextSync: entry ? new Date(Date.now() + entry.syncIntervalMinutes * 60 * 1000).toISOString() : null,
    lastError: null,
    confidence: 'estimated' as ConfidenceLevel,
    permissions: entry?.defaultPermissions ?? [],
  };

  repo.updateSource(sourceId, patch);

  const syncEvent: SyncEvent = {
    id: `sync-${sourceId}-${Date.now()}`,
    sourceId,
    timestamp: now,
    status: 'success',
    message: `${entry?.name ?? sourceId} conectado correctamente.`,
    recordsUpdated: 0,
  };
  repo.addSyncEvent(syncEvent);

  return { ...repo.getSource(sourceId)! };
}

// ─── Disconnect a Source ────────────────────────────────────────────────────

export function disconnectSource(repo: RealityRepository, sourceId: SourceId): void {
  repo.updateSource(sourceId, {
    status: 'not_connected',
    health: 'unknown',
    connected: false,
    nextSync: null,
    permissions: [],
    confidence: 'demo',
  });
}

// ─── Sync a Source ──────────────────────────────────────────────────────────

export function syncSource(repo: RealityRepository, sourceId: SourceId): SyncEvent {
  const entry = getSourceEntry(sourceId);
  const source = repo.getSource(sourceId);
  const now = new Date().toISOString();

  if (!source || !source.connected) {
    const errorEvent: SyncEvent = {
      id: `sync-${sourceId}-${Date.now()}`,
      sourceId,
      timestamp: now,
      status: 'error',
      message: 'La fuente no esta conectada.',
    };
    repo.addSyncEvent(errorEvent);
    return errorEvent;
  }

  // Simulate successful sync
  repo.updateSource(sourceId, {
    lastSync: now,
    nextSync: entry ? new Date(Date.now() + entry.syncIntervalMinutes * 60 * 1000).toISOString() : null,
    health: 'healthy',
    lastError: null,
    confidence: 'estimated',
  });

  const syncEvent: SyncEvent = {
    id: `sync-${sourceId}-${Date.now()}`,
    sourceId,
    timestamp: now,
    status: 'success',
    message: `${entry?.name ?? sourceId} sincronizado.`,
    recordsUpdated: 0,
  };
  repo.addSyncEvent(syncEvent);

  return syncEvent;
}

// ─── Get Global Health ──────────────────────────────────────────────────────

export function getGlobalHealth(repo: RealityRepository): SourceHealth {
  const state = repo.load();
  const connected = state.sources.filter((s) => s.connected);
  if (connected.length === 0) return 'unknown';
  if (connected.some((s) => s.health === 'error')) return 'error';
  if (connected.some((s) => s.health === 'degraded')) return 'degraded';
  return 'healthy';
}

// ─── Get Confidence for a DataSourceType ────────────────────────────────────

export function getSourceConfidence(repo: RealityRepository, sourceId: SourceId): ConfidenceLevel {
  const source = repo.getSource(sourceId);
  if (!source || !source.connected) return 'demo';
  if (source.health === 'healthy') return 'verified';
  if (source.health === 'degraded') return 'estimated';
  return 'demo';
}

// ─── Format sync time ───────────────────────────────────────────────────────

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Nunca sincronizado';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Ahora mismo';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} ${days === 1 ? 'dia' : 'dias'}`;
}
