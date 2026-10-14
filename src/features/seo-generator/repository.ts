import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type SeoFormat = 'google_post' | 'web_text' | 'social_post' | 'service_description';

export const SEO_FORMATS: readonly SeoFormat[] = ['google_post', 'web_text', 'social_post', 'service_description'];
export const MAX_TOPIC_CHARS = 200;

export interface SeoResult {
  title: string;
  content: string;
  cta: string;
  keywords: string[];
  hashtags: string[];
}

export interface SeoUsage {
  used: number;
  limit: number;
  globalUsed: number;
  globalLimit: number;
}

export type SeoErrorCode =
  | 'profile_incomplete' | 'seo_limit' | 'global_limit' | 'ai_unavailable' | 'generation_failed'
  | 'premium_required' | 'rate_limited' | 'unauthorized' | 'invalid_input' | 'topic_too_long'
  | 'duplicate_request' | 'not_found' | 'unavailable';

export class SeoError extends Error {
  constructor(readonly code: SeoErrorCode) {
    super(code);
  }
}

type Db = Pick<SupabaseClient, 'rpc' | 'functions'>;

const KNOWN = new Set<SeoErrorCode>([
  'profile_incomplete', 'seo_limit', 'global_limit', 'ai_unavailable', 'generation_failed', 'premium_required',
  'rate_limited', 'unauthorized', 'invalid_input', 'topic_too_long', 'duplicate_request', 'not_found', 'unavailable',
]);

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function toResult(v: unknown): SeoResult | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.title !== 'string' || typeof r.content !== 'string' || !r.content || typeof r.cta !== 'string'
    || !isStringList(r.keywords) || !isStringList(r.hashtags)) return null;
  return { title: r.title, content: r.content, cta: r.cta, keywords: r.keywords, hashtags: r.hashtags };
}

async function errorCodeFrom(error: unknown): Promise<SeoErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as SeoErrorCode;
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

export async function loadSeoUsage(db: Db = supabase): Promise<SeoUsage | null> {
  const { data, error } = await db.rpc('my_ai_usage');
  if (error || !data || typeof data !== 'object') return null;
  const seo = (data as { functions?: Record<string, { used?: unknown; limit?: unknown }> }).functions?.['seo-generator'];
  const global = (data as { global?: { used?: unknown; limit?: unknown } }).global;
  if (typeof seo?.used !== 'number' || typeof seo.limit !== 'number'
    || typeof global?.used !== 'number' || typeof global.limit !== 'number') return null;
  return { used: seo.used, limit: seo.limit, globalUsed: global.used, globalLimit: global.limit };
}

export async function generateSeo(
  input: { businessId: string; format: SeoFormat; topic: string; lang: 'es' | 'en' },
  db: Db = supabase,
): Promise<SeoResult> {
  const body = { ...input, topic: input.topic.trim(), requestId: crypto.randomUUID() };
  const { data, error } = await db.functions.invoke('seo-generator-v2', { body });
  if (error) throw new SeoError(await errorCodeFrom(error));
  const result = (data as { status?: unknown; result?: unknown } | null)?.status === 'generated'
    ? toResult((data as { result: unknown }).result)
    : null;
  if (!result) throw new SeoError('unavailable');
  return result;
}
