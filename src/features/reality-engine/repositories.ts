import { supabase } from '../../lib/supabase';
import type { ConnectedSource, SyncEvent, SyncEventType, SourceType } from './types';
import { isStaleGBPAttempt } from './gbpStatus';

// ─── Load all sources for current user ──────────────────────────────────────

const SOURCE_COLUMNS = 'id, user_id, business_id, source_type, status, external_account_id, external_location_id, token_expires_at, last_sync_at, last_error, metadata, verified_profile, verified_at, created_at, updated_at';

async function fetchSources(businessId: string): Promise<ConnectedSource[]> {
  const { data, error } = await supabase
    .from('connected_sources')
    .select(SOURCE_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });

  if (error) {
    if (import.meta.env.DEV) console.error('[sources] load error:', error);
    throw new Error(error.message);
  }
  return (data ?? []) as ConnectedSource[];
}

export async function loadSources(businessId: string): Promise<ConnectedSource[]> {
  const sources = await fetchSources(businessId);
  const gbp = sources.find((s) => s.source_type === 'google_business');
  if (!gbp || !isStaleGBPAttempt(gbp)) return sources;

  // The server decides from its own timestamps whether the attempt is abandoned and closes it.
  // If that request fails, the card still shows the attempt as expired, never as a spinner.
  const { data, error } = await supabase.functions.invoke('gbp-recover-attempt', {
    body: { action: 'recover', businessId },
  });
  if (error || data?.recovered !== true) return sources;
  return fetchSources(businessId);
}

// ─── Upsert a source ────────────────────────────────────────────────────────

// Google Business Profile and its reviews link are server-owned; only these sources are saved from the browser.
export type ClientOwnedSourceType = 'website' | 'manual';

type ClientPatch = Partial<Pick<ConnectedSource, 'status' | 'last_sync_at' | 'last_error' | 'metadata'>>;

async function updateOwnSource(sourceType: ClientOwnedSourceType, patch: ClientPatch, businessId: string) {
  return supabase
    .from('connected_sources')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('source_type', sourceType)
    .select(SOURCE_COLUMNS);
}

// Saves within the browser's column permissions: update the row, creating a bare one first if missing.
export async function upsertSource(
  sourceType: ClientOwnedSourceType,
  patch: ClientPatch,
  businessId: string
): Promise<ConnectedSource> {
  let result = await updateOwnSource(sourceType, patch, businessId);

  if (!result.error && (result.data ?? []).length === 0) {
    const { error: insertError } = await supabase
      .from('connected_sources')
      .insert({ source_type: sourceType, business_id: businessId });
    if (insertError && insertError.code !== '23505') {
      if (import.meta.env.DEV) console.error('[sources] insert error:', insertError);
      throw new Error(insertError.message);
    }
    result = await updateOwnSource(sourceType, patch, businessId);
  }

  const row = result.data?.[0];
  if (result.error || !row) {
    if (import.meta.env.DEV) console.error('[sources] save error:', result.error);
    throw new Error(result.error?.message ?? 'No se pudo guardar la fuente');
  }

  return row as ConnectedSource;
}

// ─── Delete (disconnect) a source ───────────────────────────────────────────

export async function deleteSource(sourceId: string): Promise<void> {
  const { error } = await supabase
    .from('connected_sources')
    .delete()
    .eq('id', sourceId);

  if (error) {
    if (import.meta.env.DEV) console.error('[sources] delete error:', error);
    throw new Error(error.message);
  }
}

// ─── Sync events ────────────────────────────────────────────────────────────

export async function addSyncEvent(
  sourceId: string,
  sourceType: SourceType,
  eventType: SyncEventType,
  message?: string,
  recordsUpdated = 0,
  errorDetails?: string
): Promise<SyncEvent> {
  const { data, error } = await supabase
    .from('source_sync_events')
    .insert({
      source_id: sourceId,
      source_type: sourceType,
      event_type: eventType,
      message: message ?? null,
      records_updated: recordsUpdated,
      error_details: errorDetails ?? null,
    })
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('[sources] event insert error:', error);
    throw new Error(error.message);
  }

  return data as SyncEvent;
}

export async function loadSyncEvents(limit = 50): Promise<SyncEvent[]> {
  const { data, error } = await supabase
    .from('source_sync_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (import.meta.env.DEV) console.error('[sources] events load error:', error);
    throw new Error(error.message);
  }

  return (data ?? []) as SyncEvent[];
}
