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

const ACCESS_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  premium_required: 'Tu prueba gratuita ha terminado. Activa tu suscripción para analizar tu web.',
  rate_limited: 'Has hecho muchos análisis seguidos. Inténtalo de nuevo en un rato.',
  unavailable: 'El servicio no está disponible ahora mismo. Inténtalo más tarde.',
};

export async function connectWebsite(url: string, businessId: string) {
  const source = await upsertSource('website', {
    status: 'connecting',
    metadata: { url },
  }, businessId);

  await addSyncEvent(source.id, 'website', 'source_connect_started', `Analizando ${url}`);

  try {
    const { data, error } = await invokeEdge<WebsiteAnalysis>('analyze-website', { url });

    if (error || !data) {
      const msg = (error && ACCESS_ERROR_MESSAGES[error]) ?? error ?? 'Sin respuesta del servidor';
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
  businessId: string
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
  if (sourceType === 'google_business') {
    // Revocation and credential removal happen server-side; the browser never sees the tokens.
    const { error } = await invokeEdge('gbp-disconnect', {});
    if (error) throw new Error(error);
    return;
  }
  await deleteSource(sourceId);
}

// ─── Google Business Profile (OAuth) ────────────────────────────────────────

export type GBPStartResult =
  | { status: 'redirect'; url: string }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

export async function startGBPConnection(businessId: string): Promise<GBPStartResult> {
  const { data, error } = await invokeEdge<{ url: string; state: string }>('gbp-oauth-start', { businessId });

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

async function invokeForBody(fnName: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.functions.invoke(fnName, { body });
    if (error) {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (typeof ctx?.json === 'function') {
        const parsed = await ctx.json().catch(() => null);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      }
      return null;
    }
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type GBPSelectResult = { success: true } | { success: false; code: string };

// The server sets syncing, runs the sync and only then marks the profile connected; the browser writes nothing.
export async function selectGBPLocation(
  accountId: string,
  locationId: string,
  locationName: string,
  businessId: string
): Promise<GBPSelectResult> {
  const body = await invokeForBody('gbp-sync', { accountId, locationId, locationName, businessId });
  if (body?.success === true) return { success: true };
  return { success: false, code: typeof body?.code === 'string' ? body.code : 'SYNC_FAILED' };
}

// Ends an unfinished attempt server-side (only while it is still in the authorisation/selection step).
export async function cancelGBPAttempt(businessId: string, reason: 'USER_CANCELLED' | 'NO_LOCATIONS' | 'LOCATIONS_UNAVAILABLE'): Promise<void> {
  await invokeForBody('gbp-recover-attempt', { action: 'cancel', businessId, reason });
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
