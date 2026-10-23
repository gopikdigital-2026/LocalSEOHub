import { supabase } from '../../lib/supabase';
import type { MetaConnectionRow, MetaPage } from './metaStatus';
import type { MetaSyncStateRow, SyncResult } from './metaSyncStatus';

const BINDING_KEY = 'lsh_meta_oauth_binding';
const COLUMNS = 'status, page_id, page_name, instagram_status, instagram_username, available_pages, last_error, attempt_started_at, connected_at';

export type MetaResult = { ok: true; status?: string } | { ok: false; code: string };
export type MetaStartResult = { ok: true; url: string } | { ok: false; code: string };

function parsePages(value: unknown): MetaPage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is { id: string; name?: unknown } => !!p && typeof (p as { id?: unknown }).id === 'string')
    .map((p) => ({ id: p.id, name: typeof p.name === 'string' && p.name ? p.name : p.id }));
}

export async function loadMetaConnection(businessId: string): Promise<MetaConnectionRow | null> {
  const { data, error } = await supabase
    .from('meta_connections')
    .select(COLUMNS)
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw new Error('META_LOAD_FAILED');
  if (!data) return null;
  return { ...(data as Omit<MetaConnectionRow, 'available_pages'>), available_pages: parsePages(data.available_pages) };
}

async function invoke(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      const parsed = typeof ctx?.json === 'function' ? await ctx.json().catch(() => null) : null;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    }
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toResult(body: Record<string, unknown> | null): MetaResult {
  if (body?.ok === true) return { ok: true, status: typeof body.status === 'string' ? body.status : undefined };
  return { ok: false, code: typeof body?.code === 'string' ? body.code : 'UNKNOWN_ERROR' };
}

export async function startMetaConnection(): Promise<MetaStartResult> {
  const body = await invoke('meta-oauth-start', {});
  if (typeof body?.url !== 'string' || typeof body.binding !== 'string' || !body.url.startsWith('https://www.facebook.com/')) {
    return { ok: false, code: typeof body?.code === 'string' ? body.code : 'UNKNOWN_ERROR' };
  }
  sessionStorage.setItem(BINDING_KEY, body.binding);
  return { ok: true, url: body.url };
}

export async function completeMetaConnection(completion: string): Promise<MetaResult> {
  const binding = sessionStorage.getItem(BINDING_KEY);
  sessionStorage.removeItem(BINDING_KEY);
  if (!binding) return { ok: false, code: 'SESSION_MISMATCH' };
  return toResult(await invoke('meta-connection', { action: 'complete', completion, binding }));
}

export async function selectMetaPage(pageId: string): Promise<MetaResult> {
  return toResult(await invoke('meta-connection', { action: 'select_page', pageId }));
}

export async function disconnectMeta(): Promise<MetaResult> {
  return toResult(await invoke('meta-connection', { action: 'disconnect' }));
}

export async function recoverMetaConnection(): Promise<MetaResult> {
  return toResult(await invoke('meta-connection', { action: 'recover' }));
}

export async function cancelMetaConnection(): Promise<MetaResult> {
  clearMetaBinding();
  return toResult(await invoke('meta-connection', { action: 'cancel' }));
}

export async function loadMetaSyncState(businessId: string): Promise<MetaSyncStateRow[]> {
  const { data, error } = await supabase
    .from('meta_sync_state')
    .select('platform, status, error_code, item_count, last_success_at, last_attempt_at')
    .eq('business_id', businessId);
  if (error) throw new Error('META_SYNC_LOAD_FAILED');
  return (data ?? []).filter(
    (r): r is MetaSyncStateRow => (r.platform === 'facebook' || r.platform === 'instagram') && typeof r.status === 'string',
  );
}

export async function syncMetaContent(): Promise<SyncResult> {
  const body = await invoke('meta-read', { action: 'sync' });
  if (body?.ok === true) return { ok: true };
  return { ok: false, code: typeof body?.code === 'string' ? body.code : 'UNKNOWN_ERROR' };
}

export function clearMetaBinding(): void {
  sessionStorage.removeItem(BINDING_KEY);
}
