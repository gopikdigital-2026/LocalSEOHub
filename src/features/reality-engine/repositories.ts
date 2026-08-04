import { supabase } from '../../lib/supabase';
import type { ConnectedSource, SyncEvent, SyncEventType, SourceType } from './types';

// ─── Load all sources for current user ──────────────────────────────────────

export async function loadSources(businessId = 'default'): Promise<ConnectedSource[]> {
  const { data, error } = await supabase
    .from('connected_sources')
    .select('id, user_id, business_id, source_type, status, external_account_id, external_location_id, token_expires_at, last_sync_at, last_error, metadata, created_at, updated_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });

  if (error) {
    if (import.meta.env.DEV) console.error('[sources] load error:', error);
    throw new Error(error.message);
  }

  return (data ?? []) as ConnectedSource[];
}

// ─── Upsert a source ────────────────────────────────────────────────────────

export async function upsertSource(
  sourceType: SourceType,
  patch: Partial<Pick<ConnectedSource, 'status' | 'external_account_id' | 'external_location_id' | 'last_sync_at' | 'last_error' | 'metadata'>>,
  businessId = 'default'
): Promise<ConnectedSource> {
  const { data, error } = await supabase
    .from('connected_sources')
    .upsert(
      {
        source_type: sourceType,
        business_id: businessId,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,business_id,source_type' }
    )
    .select('id, user_id, business_id, source_type, status, external_account_id, external_location_id, token_expires_at, last_sync_at, last_error, metadata, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('[sources] upsert error:', error);
    throw new Error(error.message);
  }

  return data as ConnectedSource;
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
