import { supabase } from '../../lib/supabase';
import type { SourceType, WebsiteAnalysis } from './types';
import { upsertSource, addSyncEvent, deleteSource } from './repositories';

const GBP_STATE_KEY = 'gbp_oauth_state';

// ─── Invoke helper that extracts real error from non-2xx edge function ──────

async function invokeEdge<T = Record<string, unknown>>(
  fnName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(fnName, { body });

  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError; the real JSON is in context
    if (typeof (error as any).context?.json === 'function') {
      try {
        const json = await (error as any).context.json();
        if (json?.error) return { data: null, error: json.error };
      } catch { /* fall through */ }
    }
    return { data: null, error: error.message ?? 'Error del servidor' };
  }

  if (data?.error) return { data: null, error: data.error };

  return { data: data as T, error: null };
}

// ─── Website connection ─────────────────────────────────────────────────────

export async function connectWebsite(url: string, businessId = 'default') {
  const source = await upsertSource('website', {
    status: 'connecting',
    metadata: { url },
  }, businessId);

  await addSyncEvent(source.id, 'website', 'source_connect_started', `Analizando ${url}`);

  try {
    const { data, error } = await invokeEdge<WebsiteAnalysis>('analyze-website', { url });

    if (error || !data) {
      const msg = error ?? 'Sin respuesta del servidor';
      await upsertSource('website', {
        status: 'error',
        last_error: msg,
        metadata: { url },
      }, businessId);
      await addSyncEvent(source.id, 'website', 'source_connect_failed', msg, 0, msg);
      return { success: false, error: msg };
    }

    await upsertSource('website', {
      status: 'connected',
      last_sync_at: new Date().toISOString(),
      last_error: null,
      metadata: { url, analysis: data },
    }, businessId);

    const fields = [data.title, data.metaDescription, data.h1].filter(Boolean).length;
    await addSyncEvent(source.id, 'website', 'source_connected', `Sitio analizado: ${fields} campos encontrados`, fields);

    return { success: true, analysis: data };
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

export type GBPStartResult =
  | { status: 'redirect'; url: string }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

export async function startGBPConnection(): Promise<GBPStartResult> {
  const { data, error } = await invokeEdge<{ url: string; state: string }>('gbp-oauth-start', {});

  if (error) {
    if (error.includes('pendiente de configuracion') || error.includes('no esta configurado')) {
      return { status: 'not_configured' };
    }
    return { status: 'error', message: error };
  }

  if (!data?.url || !data?.state) {
    return { status: 'error', message: 'Respuesta incompleta del servidor' };
  }

  // Store state in sessionStorage for CSRF validation on callback
  sessionStorage.setItem(GBP_STATE_KEY, data.state);

  return { status: 'redirect', url: data.url };
}

export function clearStoredOAuthState(): void {
  sessionStorage.removeItem(GBP_STATE_KEY);
}

export async function resetGBPStatus(businessId = 'default'): Promise<void> {
  await upsertSource('google_business', {
    status: 'disconnected',
    last_error: null,
    metadata: {},
  }, businessId);
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

  const { data, error } = await invokeEdge<{ success: boolean; error?: string; profile?: Record<string, unknown>; recordCount?: number; reviewCount?: number }>(
    'gbp-sync',
    { accountId, locationId }
  );

  if (error || !data?.success) {
    const msg = error ?? data?.error ?? 'Error de sincronizacion';
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
