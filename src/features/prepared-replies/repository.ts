import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  REPLY_CATEGORIES, isBookingMethod,
  type BookingMethod, type ReplyCategory, type ReplyDetails, type ReplyLang, type ReplyOrigin, type SavedReply,
} from './model';

type Db = Pick<SupabaseClient, 'from'>;

const REPLY_COLUMNS = 'id, business_id, category, lang, content, origin, source_fingerprint, version, updated_at';
const DETAIL_COLUMNS = 'business_id, address, booking_method, version';

export class PreparedRepliesError extends Error {
  constructor(public code: 'load_failed' | 'unavailable') {
    super(code);
  }
}

export type SaveOutcome<T> = { status: 'saved'; row: T } | { status: 'conflict' } | { status: 'locked' };

function toReply(row: unknown): SavedReply | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.business_id !== 'string' || typeof r.content !== 'string'
    || typeof r.version !== 'number' || typeof r.updated_at !== 'string'
    || typeof r.source_fingerprint !== 'string'
    || !(REPLY_CATEGORIES as unknown[]).includes(r.category)
    || (r.lang !== 'es' && r.lang !== 'en')
    || (r.origin !== 'template' && r.origin !== 'edited')) return null;
  return r as unknown as SavedReply;
}

function toDetails(row: unknown): ReplyDetails | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.business_id !== 'string' || typeof r.version !== 'number') return null;
  return {
    business_id: r.business_id,
    address: typeof r.address === 'string' ? r.address : null,
    booking_method: isBookingMethod(r.booking_method) ? r.booking_method : null,
    version: r.version,
  };
}

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

function outcomeFromError<T>(error: unknown): SaveOutcome<T> {
  const code = codeOf(error);
  if (code === '23505') return { status: 'conflict' };
  if (code === '42501') return { status: 'locked' };
  throw new PreparedRepliesError('unavailable');
}

export async function loadReplies(businessId: string, lang: ReplyLang, db: Db = supabase): Promise<SavedReply[]> {
  const { data, error } = await db.from('prepared_replies').select(REPLY_COLUMNS)
    .eq('business_id', businessId).eq('lang', lang);
  if (error || !Array.isArray(data)) throw new PreparedRepliesError('load_failed');
  return data.map(toReply).filter((r): r is SavedReply => r !== null);
}

export async function loadDetails(businessId: string, db: Db = supabase): Promise<ReplyDetails | null> {
  const { data, error } = await db.from('prepared_reply_details').select(DETAIL_COLUMNS)
    .eq('business_id', businessId).maybeSingle();
  if (error) throw new PreparedRepliesError('load_failed');
  return data ? toDetails(data) : null;
}

export interface ReplyDraft {
  businessId: string;
  category: ReplyCategory;
  lang: ReplyLang;
  content: string;
  origin: ReplyOrigin;
  fingerprint: string;
}

// Guarded by the row version so a save never silently overwrites a newer one from another tab.
export async function saveReply(draft: ReplyDraft, expected: SavedReply | null, db: Db = supabase): Promise<SaveOutcome<SavedReply>> {
  const fields = { content: draft.content.trim(), origin: draft.origin, source_fingerprint: draft.fingerprint };
  const { data, error } = expected
    ? await db.from('prepared_replies').update(fields)
      .eq('id', expected.id).eq('version', expected.version).select(REPLY_COLUMNS).maybeSingle()
    : await db.from('prepared_replies')
      .insert({ ...fields, business_id: draft.businessId, category: draft.category, lang: draft.lang })
      .select(REPLY_COLUMNS).maybeSingle();
  if (error) return outcomeFromError(error);
  const row = toReply(data);
  return row ? { status: 'saved', row } : { status: 'conflict' };
}

export interface DetailsPatch {
  address?: string | null;
  booking_method?: BookingMethod | null;
}

export async function saveDetails(
  businessId: string, patch: DetailsPatch, expected: ReplyDetails | null, db: Db = supabase,
): Promise<SaveOutcome<ReplyDetails>> {
  const { data, error } = expected
    ? await db.from('prepared_reply_details').update(patch)
      .eq('business_id', businessId).eq('version', expected.version).select(DETAIL_COLUMNS).maybeSingle()
    : await db.from('prepared_reply_details').insert({ ...patch, business_id: businessId })
      .select(DETAIL_COLUMNS).maybeSingle();
  if (error) return outcomeFromError(error);
  const row = toDetails(data);
  return row ? { status: 'saved', row } : { status: 'conflict' };
}
