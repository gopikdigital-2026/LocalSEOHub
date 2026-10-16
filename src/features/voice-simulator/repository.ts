import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export const MAX_CUSTOM_CHARS = 800;
export const MIN_CUSTOM_CHARS = 8;

export const SCENARIOS = [
  'general_inquiry', 'price_request', 'price_objection', 'quote_request', 'undecided',
  'booking', 'service_inquiry', 'unhappy_customer', 'follow_up', 'custom',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const FACT_KEYS = [
  'name', 'category', 'city', 'services', 'target_audience', 'primary_goal', 'secondary_goals',
  'website', 'phone', 'schedule',
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export interface Simulation {
  customer: string;
  recommendedResponse: string;
  whyItWorks: string[];
  tip: string;
  factsUsed: FactKey[];
}

export interface SimulatorUsage {
  used: number;
  limit: number;
  globalUsed: number;
  globalLimit: number;
}

export type SimulatorErrorCode =
  | 'profile_incomplete' | 'voice_limit' | 'global_limit' | 'ai_unavailable' | 'ai_busy' | 'ai_timeout'
  | 'generation_failed' | 'premium_required' | 'rate_limited' | 'unauthorized' | 'invalid_input'
  | 'scenario_invalid' | 'custom_empty' | 'custom_too_long' | 'payload_too_large' | 'duplicate_request'
  | 'not_found' | 'unavailable';

export class SimulatorError extends Error {
  constructor(readonly code: SimulatorErrorCode) {
    super(code);
  }
}

type Db = Pick<SupabaseClient, 'rpc' | 'functions'>;

const KNOWN = new Set<SimulatorErrorCode>([
  'profile_incomplete', 'voice_limit', 'global_limit', 'ai_unavailable', 'ai_busy', 'ai_timeout', 'generation_failed',
  'premium_required', 'rate_limited', 'unauthorized', 'invalid_input', 'scenario_invalid', 'custom_empty',
  'custom_too_long', 'payload_too_large', 'duplicate_request', 'not_found', 'unavailable',
]);

const str = (v: unknown): v is string => typeof v === 'string';

function toSimulation(v: unknown): Simulation | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (!str(r.customer) || !r.customer || !str(r.recommendedResponse) || !r.recommendedResponse || !str(r.tip)
    || !Array.isArray(r.whyItWorks) || !r.whyItWorks.every(str)) return null;
  const facts = Array.isArray(r.factsUsed) ? r.factsUsed : [];
  return {
    customer: r.customer,
    recommendedResponse: r.recommendedResponse,
    whyItWorks: r.whyItWorks.slice(0, 4),
    tip: r.tip,
    factsUsed: FACT_KEYS.filter((k) => facts.includes(k)),
  };
}

async function errorCodeFrom(error: unknown): Promise<SimulatorErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as SimulatorErrorCode;
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

export async function loadSimulatorUsage(db: Db = supabase): Promise<SimulatorUsage | null> {
  const { data, error } = await db.rpc('my_ai_usage');
  if (error || !data || typeof data !== 'object') return null;
  const fn = (data as { functions?: Record<string, { used?: unknown; limit?: unknown }> }).functions?.['voice-simulator'];
  const global = (data as { global?: { used?: unknown; limit?: unknown } }).global;
  if (typeof fn?.used !== 'number' || typeof fn.limit !== 'number'
    || typeof global?.used !== 'number' || typeof global.limit !== 'number') return null;
  return { used: fn.used, limit: fn.limit, globalUsed: global.used, globalLimit: global.limit };
}

export async function runSimulation(
  input: { businessId: string; scenario: Scenario; customText: string; lang: 'es' | 'en' },
  db: Db = supabase,
): Promise<Simulation> {
  const body = {
    businessId: input.businessId,
    scenario: input.scenario,
    customText: input.customText.trim(),
    lang: input.lang,
    requestId: crypto.randomUUID(),
  };
  const { data, error } = await db.functions.invoke('voice-simulator-v2', { body });
  if (error) throw new SimulatorError(await errorCodeFrom(error));
  const simulation = (data as { status?: unknown } | null)?.status === 'simulated'
    ? toSimulation((data as { simulation: unknown }).simulation)
    : null;
  if (!simulation) throw new SimulatorError('unavailable');
  return simulation;
}

export function simulationToText(s: Simulation, labels: { customer: string; response: string }): string {
  return `${labels.customer}: ${s.customer}\n\n${labels.response}: ${s.recommendedResponse}`;
}
