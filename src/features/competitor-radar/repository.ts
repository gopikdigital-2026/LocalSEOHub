import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { RADAR_ERROR_CODES, type CompetitorAnalysis, type PageSignals, type RadarErrorCode } from './types';

export class RadarError extends Error {
  constructor(readonly code: RadarErrorCode) {
    super(code);
  }
}

type Db = Pick<SupabaseClient, 'functions'>;

const KNOWN = new Set<string>(RADAR_ERROR_CODES);

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const list = (v: unknown, maxItems: number, maxChars: number): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxChars)).filter((x): x is string => !!x).slice(0, maxItems) : [];
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function toSignals(v: unknown): PageSignals | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  const m = (s.matches ?? {}) as Record<string, unknown>;
  const a = s.schemaAddress && typeof s.schemaAddress === 'object' ? s.schemaAddress as Record<string, unknown> : null;
  const wordCount = num(s.wordCount);
  if (wordCount === null || typeof s.viewport !== 'boolean' || typeof s.hasMap !== 'boolean' || typeof s.localBusinessSchema !== 'boolean') return null;
  const address = a ? { street: str(a.street, 160), locality: str(a.locality, 80), region: str(a.region, 80), postalCode: str(a.postalCode, 20) } : null;
  return {
    title: str(s.title, 200),
    metaDescription: str(s.metaDescription, 300),
    metaRobots: str(s.metaRobots, 100),
    canonical: str(s.canonical, 300),
    lang: str(s.lang, 20),
    viewport: s.viewport,
    brand: str(s.brand, 120),
    h1: list(s.h1, 3, 160),
    h2: list(s.h2, 8, 160),
    wordCount,
    phones: list(s.phones, 3, 25),
    socials: list(s.socials, 10, 20),
    ctas: list(s.ctas, 5, 60),
    hasMap: s.hasMap,
    schemaTypes: list(s.schemaTypes, 10, 60),
    schemaAddress: address && (address.street || address.locality || address.region || address.postalCode) ? address : null,
    schemaServices: list(s.schemaServices, 10, 80),
    localBusinessSchema: s.localBusinessSchema,
    matches: { city: typeof m.city === 'boolean' ? m.city : null, services: list(m.services, 12, 80) },
  };
}

export function toAnalysis(v: unknown): CompetitorAnalysis | null {
  if (!v || typeof v !== 'object' || (v as { status?: unknown }).status !== 'analyzed') return null;
  const r = v as Record<string, unknown>;
  const f = (r.fetch ?? {}) as Record<string, unknown>;
  const signals = toSignals(r.signals);
  const finalUrl = str(f.finalUrl, 2048);
  const domain = str(f.domain, 253);
  const httpStatus = num(f.httpStatus);
  const bytes = num(f.bytes);
  const durationMs = num(f.durationMs);
  const contentType = str(f.contentType, 60);
  const analyzedAt = str(r.analyzedAt, 40);
  if (!signals || !finalUrl || !/^https?:\/\//i.test(finalUrl) || !domain || httpStatus === null || bytes === null
    || durationMs === null || !contentType || typeof f.https !== 'boolean' || typeof f.redirected !== 'boolean'
    || !analyzedAt || Number.isNaN(new Date(analyzedAt).getTime())) return null;
  return {
    fetch: { finalUrl, domain, https: f.https, redirected: f.redirected, httpStatus, contentType, bytes, durationMs },
    signals,
    analyzedAt,
  };
}

async function errorCodeFrom(error: unknown): Promise<RadarErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as RadarErrorCode;
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

export async function analyzeCompetitor(input: { businessId: string; url: string }, db: Db = supabase): Promise<CompetitorAnalysis> {
  const { data, error } = await db.functions.invoke('competitor-radar-v2', { body: { businessId: input.businessId, url: input.url.trim() } });
  if (error) throw new RadarError(await errorCodeFrom(error));
  const result = toAnalysis(data);
  if (!result) throw new RadarError('unavailable');
  return result;
}
