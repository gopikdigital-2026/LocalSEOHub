import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { ImprovementError, monthKey, type ImprovementDraft, type ImprovementErrorCode, type ImprovementMode } from './model';

type Db = Pick<SupabaseClient, 'from' | 'functions'>;

const COLUMNS = 'id, business_id, semantic_key, kind, mode, lang, content, source_text, versions, generations, attempts, generated_at, edited_at, copied_at, updated_at';

const KNOWN = new Set<ImprovementErrorCode>([
  'profile_incomplete', 'service_not_declared', 'incompatible_action', 'action_closed', 'edited_conflict',
  'limit_reached', 'attempts_exhausted', 'global_limit', 'monthly_limit', 'in_progress', 'ai_unavailable', 'generation_failed',
  'premium_required', 'rate_limited', 'unauthorized', 'invalid_request', 'not_found', 'unavailable',
]);

function toDraft(row: unknown): ImprovementDraft | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.content !== 'string' || typeof r.generations !== 'number'
    || typeof r.updated_at !== 'string' || typeof r.semantic_key !== 'string') return null;
  const versions = Array.isArray(r.versions) ? r.versions.filter((v): v is string => typeof v === 'string') : [];
  return { ...(r as unknown as ImprovementDraft), versions };
}

export async function loadDraft(businessId: string, semanticKey: string, db: Db = supabase): Promise<ImprovementDraft | null> {
  const { data, error } = await db.from('business_improvement_drafts').select(COLUMNS)
    .eq('business_id', businessId).eq('semantic_key', semanticKey).maybeSingle();
  if (error) throw new ImprovementError('load_failed');
  return data ? toDraft(data) : null;
}

export async function loadMonthlyUsage(db: Db = supabase, now: Date = new Date()): Promise<number | null> {
  const { data, error } = await db.from('business_improvement_usage').select('requests')
    .eq('period_start', monthKey(now)).maybeSingle();
  if (error) return null;
  const n = (data as { requests?: unknown } | null)?.requests;
  return typeof n === 'number' ? n : 0;
}

export type SaveResult = { status: 'saved'; draft: ImprovementDraft } | { status: 'conflict' };

// Guarded by updated_at so an edit never silently overwrites a newer version saved in another tab.
export async function saveContent(draft: ImprovementDraft, content: string, db: Db = supabase): Promise<SaveResult> {
  const { data, error } = await db.from('business_improvement_drafts').update({ content })
    .eq('id', draft.id).eq('updated_at', draft.updated_at).select(COLUMNS).maybeSingle();
  if (error) throw new ImprovementError('unavailable');
  const saved = toDraft(data);
  return saved ? { status: 'saved', draft: saved } : { status: 'conflict' };
}

export async function markCopied(draft: ImprovementDraft, db: Db = supabase): Promise<ImprovementDraft | null> {
  const { data, error } = await db.from('business_improvement_drafts').update({ copied_at: new Date().toISOString() })
    .eq('id', draft.id).select(COLUMNS).maybeSingle();
  return error ? null : toDraft(data);
}

export async function errorCodeFrom(error: unknown): Promise<ImprovementErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as ImprovementErrorCode;
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

export interface GenerationRequest {
  businessId: string;
  actionId: string;
  lang: 'es' | 'en';
  mode: ImprovementMode;
  sourceText?: string;
  expectedGenerations: number;
  allowOverwrite: boolean;
}

export async function requestGeneration(input: GenerationRequest, db: Db = supabase): Promise<void> {
  const body = input.mode === 'improve' ? input : { ...input, sourceText: undefined };
  const { data, error } = await db.functions.invoke('business-improvement', { body });
  if (error) throw new ImprovementError(await errorCodeFrom(error));
  const status = (data as { status?: unknown } | null)?.status;
  if (status !== 'generated' && status !== 'stale') throw new ImprovementError('unavailable');
}
