import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { WeeklyContentError, type WeeklyContentErrorCode, type WeeklyDraft } from './model';

type Db = Pick<SupabaseClient, 'from' | 'functions'>;

const COLUMNS = 'id, business_id, week_start, lang, content, generations, attempts, generated_at, edited_at, copied_at, updated_at';

const KNOWN = new Set<WeeklyContentErrorCode>([
  'profile_incomplete', 'limit_reached', 'monthly_limit', 'attempts_exhausted', 'in_progress', 'ai_unavailable', 'generation_failed',
  'premium_required', 'rate_limited', 'unauthorized', 'invalid_week', 'unavailable',
]);

function toDraft(row: unknown): WeeklyDraft | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.content !== 'string' || typeof r.generations !== 'number'
    || typeof r.updated_at !== 'string' || typeof r.week_start !== 'string') return null;
  return r as unknown as WeeklyDraft;
}

export async function loadDraft(businessId: string, week: string, db: Db = supabase): Promise<WeeklyDraft | null> {
  const { data, error } = await db.from('weekly_content_drafts').select(COLUMNS)
    .eq('business_id', businessId).eq('week_start', week).maybeSingle();
  if (error) throw new WeeklyContentError('load_failed');
  return data ? toDraft(data) : null;
}

export type SaveResult = { status: 'saved'; draft: WeeklyDraft } | { status: 'conflict' };

// Guarded by updated_at so an edit never silently overwrites a newer version saved in another tab.
export async function saveContent(draft: WeeklyDraft, content: string, db: Db = supabase): Promise<SaveResult> {
  const { data, error } = await db.from('weekly_content_drafts').update({ content })
    .eq('id', draft.id).eq('updated_at', draft.updated_at).select(COLUMNS).maybeSingle();
  if (error) throw new WeeklyContentError('unavailable');
  const saved = toDraft(data);
  return saved ? { status: 'saved', draft: saved } : { status: 'conflict' };
}

export async function markCopied(draft: WeeklyDraft, db: Db = supabase): Promise<WeeklyDraft | null> {
  const { data, error } = await db.from('weekly_content_drafts').update({ copied_at: new Date().toISOString() })
    .eq('id', draft.id).select(COLUMNS).maybeSingle();
  return error ? null : toDraft(data);
}

async function errorCodeFrom(error: unknown): Promise<WeeklyContentErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as WeeklyContentErrorCode;
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

export async function requestGeneration(
  input: { businessId: string; weekStart: string; lang: 'es' | 'en'; expectedGenerations: number },
  db: Db = supabase,
): Promise<void> {
  const { data, error } = await db.functions.invoke('weekly-content', { body: input });
  if (error) throw new WeeklyContentError(await errorCodeFrom(error));
  const status = (data as { status?: unknown } | null)?.status;
  if (status !== 'generated' && status !== 'stale') throw new WeeklyContentError('unavailable');
}
