import type { ConnectedSource, SourceRegistryEntry } from './types';
import { gbpPhase, isStaleGBPAttempt } from './gbpStatus';

export type SourceDisplayStatus =
  | 'verified'
  | 'analyzed'
  | 'declared'
  | 'pending'
  | 'in_progress'
  | 'selecting'
  | 'syncing'
  | 'expired'
  | 'permissions'
  | 'error'
  | 'unavailable'
  | 'coming_soon';

type Lang = 'es' | 'en';

export const STATUS_LABELS: Record<Lang, Record<SourceDisplayStatus, string>> = {
  es: {
    verified: 'Conectada y verificada',
    analyzed: 'Analizada',
    declared: 'Datos declarados por ti',
    pending: 'Pendiente de conexión',
    in_progress: 'Conectando…',
    selecting: 'Elige tu ficha',
    syncing: 'Sincronizando…',
    expired: 'Intento caducado',
    permissions: 'Faltan permisos',
    error: 'Error de conexión',
    unavailable: 'No disponible',
    coming_soon: 'Todavía no disponible',
  },
  en: {
    verified: 'Connected and verified',
    analyzed: 'Analysed',
    declared: 'Information you declared',
    pending: 'Not connected yet',
    in_progress: 'Connecting…',
    selecting: 'Choose your listing',
    syncing: 'Syncing…',
    expired: 'Attempt expired',
    permissions: 'Permissions missing',
    error: 'Connection error',
    unavailable: 'Unavailable',
    coming_soon: 'Not available yet',
  },
};

/** States that mean the source currently feeds real or declared data into recommendations. */
export function isActive(status: SourceDisplayStatus): boolean {
  return status === 'verified' || status === 'analyzed' || status === 'declared';
}

/**
 * Sources that depend on Google Business Profile (reviews) only count as connected while
 * that profile is connected; their own row can be stale after a Google error or disconnect.
 */
export function sourceDisplayStatus(
  entry: SourceRegistryEntry,
  source: ConnectedSource | undefined,
  parent: ConnectedSource | undefined,
  now = Date.now(),
): SourceDisplayStatus {
  if (entry.comingSoon) return 'coming_soon';

  if (entry.dependsOn) {
    if (parent?.status === 'error' || parent?.status === 'permissions_required') return 'unavailable';
    if (parent?.status !== 'connected' || !parent.verified_at) return 'pending';
    return source?.status === 'connected' ? 'verified' : 'pending';
  }

  if (entry.id === 'google_business' && source) {
    // An in-flight attempt never shows a spinner past its timeout.
    if (isStaleGBPAttempt(source, now)) return 'expired';
    const phase = gbpPhase(source);
    if (phase === 'select_location') return 'selecting';
    if (phase === 'syncing') return 'syncing';
    if (source.status === 'disconnected' && source.last_error === 'ATTEMPT_EXPIRED') return 'expired';
  }

  switch (source?.status) {
    case 'connected':
      if (entry.id === 'manual') return 'declared';
      if (entry.id === 'website') return 'analyzed';
      // A client-written 'connected' status is not proof; only a server-side sync is.
      return source.verified_at ? 'verified' : 'in_progress';
    case 'error': return 'error';
    case 'connecting':
    case 'syncing': return 'in_progress';
    case 'permissions_required': return 'permissions';
    default: return 'pending';
  }
}
