import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_CHARS = 1500;

export interface AdvisorAction {
  title: string;
  detail: string;
}

export interface AdvisorAnswer {
  answer: string;
  first_step: string;
  actions: AdvisorAction[];
  why: string;
  next_step: string;
  data_note: string;
}

export type ChatTurn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; answer: AdvisorAnswer };

export interface AdvisorUsage {
  used: number;
  limit: number;
  globalUsed: number;
  globalLimit: number;
}

export type AdvisorErrorCode =
  | 'profile_incomplete' | 'advisor_limit' | 'global_limit' | 'ai_unavailable' | 'generation_failed'
  | 'premium_required' | 'rate_limited' | 'unauthorized' | 'invalid_input' | 'question_empty'
  | 'question_too_long' | 'history_too_long' | 'duplicate_request' | 'not_found' | 'unavailable';

export class AdvisorError extends Error {
  constructor(readonly code: AdvisorErrorCode) {
    super(code);
  }
}

type Db = Pick<SupabaseClient, 'rpc' | 'functions'>;

const KNOWN = new Set<AdvisorErrorCode>([
  'profile_incomplete', 'advisor_limit', 'global_limit', 'ai_unavailable', 'generation_failed', 'premium_required',
  'rate_limited', 'unauthorized', 'invalid_input', 'question_empty', 'question_too_long', 'history_too_long',
  'duplicate_request', 'not_found', 'unavailable',
]);

const str = (v: unknown): v is string => typeof v === 'string';

function toAnswer(v: unknown): AdvisorAnswer | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!str(r.answer) || !r.answer || !str(r.first_step) || !str(r.why) || !str(r.next_step) || !str(r.data_note)
    || !Array.isArray(r.actions)) return null;
  const actions: AdvisorAction[] = [];
  for (const a of r.actions) {
    const x = a as Record<string, unknown> | null;
    if (!x || !str(x.title) || !str(x.detail)) return null;
    actions.push({ title: x.title, detail: x.detail });
  }
  return { answer: r.answer, first_step: r.first_step, actions, why: r.why, next_step: r.next_step, data_note: r.data_note };
}

export function answerToText(a: AdvisorAnswer): string {
  return [
    a.answer,
    a.first_step,
    ...a.actions.map((x, i) => `${i + 1}. ${x.title}${x.detail ? ` — ${x.detail}` : ''}`),
    a.why,
    a.next_step,
  ].filter(Boolean).join('\n\n');
}

// Only the last few turns travel to the server, each trimmed, so the request stays small.
export function historyPayload(turns: ChatTurn[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return turns.slice(-MAX_HISTORY_MESSAGES).map((t) => ({
    role: t.role,
    content: (t.role === 'user' ? t.content : answerToText(t.answer)).slice(0, MAX_HISTORY_MESSAGE_CHARS),
  }));
}

async function errorCodeFrom(error: unknown): Promise<AdvisorErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as AdvisorErrorCode;
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

export async function loadAdvisorUsage(db: Db = supabase): Promise<AdvisorUsage | null> {
  const { data, error } = await db.rpc('my_ai_usage');
  if (error || !data || typeof data !== 'object') return null;
  const fn = (data as { functions?: Record<string, { used?: unknown; limit?: unknown }> }).functions?.['business-advisor'];
  const global = (data as { global?: { used?: unknown; limit?: unknown } }).global;
  if (typeof fn?.used !== 'number' || typeof fn.limit !== 'number'
    || typeof global?.used !== 'number' || typeof global.limit !== 'number') return null;
  return { used: fn.used, limit: fn.limit, globalUsed: global.used, globalLimit: global.limit };
}

export async function askAdvisor(
  input: { businessId: string; question: string; history: ChatTurn[]; lang: 'es' | 'en' },
  db: Db = supabase,
): Promise<AdvisorAnswer> {
  const body = {
    businessId: input.businessId,
    question: input.question.trim(),
    history: historyPayload(input.history),
    lang: input.lang,
    requestId: crypto.randomUUID(),
  };
  const { data, error } = await db.functions.invoke('business-advisor-v2', { body });
  if (error) throw new AdvisorError(await errorCodeFrom(error));
  const answer = (data as { status?: unknown } | null)?.status === 'answered'
    ? toAnswer((data as { answer: unknown }).answer)
    : null;
  if (!answer) throw new AdvisorError('unavailable');
  return answer;
}
