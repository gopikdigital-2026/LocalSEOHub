import { supabase } from '../../lib/supabase';
import type { SourceType, WebsiteAnalysis } from './types';
import { upsertSource, addSyncEvent, deleteSource } from './repositories';

// ─── Website connection ─────────────────────────────────────────────────────

export async function connectWebsite(url: string, businessId = 'default') {
  const source = await upsertSource('website', {
    status: 'connecting',
    metadata: { url },
  }, businessId);

  await addSyncEvent(source.id, 'website', 'source_connect_started', `Analizando ${url}`);

  try {
    const { data, error } = await supabase.functions.invoke('analyze-website', {
      body: { url },
    });

    if (error || !data) {
      const msg = error?.message ?? 'Sin respuesta del servidor';
      await upsertSource('website', {
        status: 'error',
        last_error: msg,
        metadata: { url },
      }, businessId);
      await addSyncEvent(source.id, 'website', 'source_connect_failed', msg, 0, msg);
      return { success: false, error: msg };
    }

    const analysis = data as WebsiteAnalysis;
    await upsertSource('website', {
      status: 'connected',
      last_sync_at: new Date().toISOString(),
      last_error: null,
      metadata: { url, analysis },
    }, businessId);

    const fields = [analysis.title, analysis.metaDescription, analysis.h1].filter(Boolean).length;
    await addSyncEvent(source.id, 'website', 'source_connected', `Sitio analizado: ${fields} campos encontrados`, fields);

    return { success: true, analysis };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    await upsertSource('website', {
      status: 'error',
      last_error: msg,
      metadata: { url },
    }, businessId);
    await addSyncEvent(source.id, 'website', 'source_connect_failed', msg, 0, msg);
    return { success: false, error: msg };
  }
}

// ─── Manual entry ───────────────────────────────────────────────────────────

export async function saveManualEntry(
  entryData: Record<string, string>,
  businessId = 'default'
) {
  const source = await upsertSource('manual', {
    status: 'connected',
    last_sync_at: new Date().toISOString(),
    last_error: null,
    metadata: { ...entryData },
  }, businessId);

  const fields = Object.values(entryData).filter(v => v.trim()).length;
  await addSyncEvent(source.id, 'manual', 'source_connected', `${fields} campos completados`, fields);

  return { success: true };
}

// ─── Disconnect any source ──────────────────────────────────────────────────

export async function disconnectSource(sourceId: string, sourceType: SourceType) {
  await addSyncEvent(sourceId, sourceType, 'source_disconnected', 'Fuente desconectada');
  await deleteSource(sourceId);
}

// ─── Google Business Profile (OAuth) ────────────────────────────────────────

export async function startGBPConnection(): Promise<{ url: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke('gbp-oauth-start', {
    body: {},
  });

  if (error || !data?.url) {
    return { error: error?.message ?? 'No se pudo iniciar la conexion con Google' };
  }

  return { url: data.url };
}

export async function completeGBPConnection(
  code: string,
  state: string,
  businessId = 'default'
): Promise<{ success: boolean; error?: string; accounts?: Array<{ id: string; name: string }> }> {
  const { data, error } = await supabase.functions.invoke('gbp-oauth-callback', {
    body: { code, state },
  });

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Error al completar la autorizacion' };
  }

  if (data.accounts) {
    return { success: true, accounts: data.accounts };
  }

  return { success: false, error: 'Respuesta inesperada del servidor' };
}

export async function selectGBPLocation(
  accountId: string,
  locationId: string,
  locationName: string,
  businessId = 'default'
): Promise<{ success: boolean; error?: string }> {
  const source = await upsertSource('google_business', {
    status: 'syncing',
    external_account_id: accountId,
    external_location_id: locationId,
    metadata: { locationName },
  }, businessId);

  await addSyncEvent(source.id, 'google_business', 'source_sync_started', `Sincronizando ${locationName}`);

  const { data, error } = await supabase.functions.invoke('gbp-sync', {
    body: { accountId, locationId },
  });

  if (error || !data?.success) {
    const msg = error?.message ?? data?.error ?? 'Error de sincronizacion';
    await upsertSource('google_business', {
      status: 'error',
      last_error: msg,
    }, businessId);
    await addSyncEvent(source.id, 'google_business', 'source_sync_failed', msg, 0, msg);
    return { success: false, error: msg };
  }

  await upsertSource('google_business', {
    status: 'connected',
    last_sync_at: new Date().toISOString(),
    last_error: null,
    metadata: { locationName, ...(data.profile ?? {}) },
  }, businessId);

  const recordCount = data.recordCount ?? 0;
  await addSyncEvent(source.id, 'google_business', 'source_sync_completed', `${recordCount} datos importados`, recordCount);

  // Auto-enable reviews since they come from the same GBP connection
  await upsertSource('reviews', {
    status: 'connected',
    external_account_id: accountId,
    external_location_id: locationId,
    last_sync_at: new Date().toISOString(),
    last_error: null,
    metadata: { linkedToGBP: true, reviewCount: data.reviewCount ?? 0 },
  }, businessId);

  return { success: true };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}
