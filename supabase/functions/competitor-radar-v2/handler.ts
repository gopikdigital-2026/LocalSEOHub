import { safeGet, type NetDeps } from './safeHttp.ts';
import { checkUrl, SafeFetchError, type FetchErrorCode } from './urlSafety.ts';
import { extractSignals, type OwnTerms, type PageSignals } from './extract.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export const RADAR_LIMITS = {
  MAX_BODY_BYTES: 4 * 1024,
  MAX_URL_CHARS: 2048,
  TOTAL_MS: 20_000,
  PAGE_TIMEOUT_MS: 10_000,
  PAGE_MAX_BYTES: 2 * 1024 * 1024,
  MAX_REDIRECTS: 3,
};

const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RadarErrorCode =
  | FetchErrorCode | 'invalid_input' | 'url_required' | 'url_too_long' | 'not_found' | 'bad_status' | 'unsupported_content';

const STATUS: Record<RadarErrorCode, number> = {
  invalid_input: 422, url_required: 422, url_too_long: 422, invalid_url: 422, blocked: 422, not_found: 404,
  dns_failed: 422, dns_empty: 422, connect_failed: 502, tls_failed: 502, bad_response: 502, timeout: 504,
  too_large: 422, too_many_redirects: 422, redirect_loop: 422, off_site_redirect: 422, bad_status: 422, unsupported_content: 422,
};

export interface RadarDeps {
  loadOwnTerms(userId: string, businessId: string): Promise<OwnTerms | null>;
  net: NetDeps;
}

export interface RadarResult {
  status: 'analyzed';
  fetch: { finalUrl: string; domain: string; https: boolean; redirected: boolean; httpStatus: number; contentType: string; bytes: number; durationMs: number };
  signals: PageSignals;
  analyzedAt: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const fail = (code: RadarErrorCode) => json({ error: code }, STATUS[code]);

// Bare domains get https:// so "competidor.com" works; anything carrying its own scheme is left for checkUrl to judge.
export function normalizeCompetitorUrl(raw: string): string {
  const s = raw.trim();
  return /^[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(s) ? `https://${s}` : s;
}

export async function analyzeCompetitor(userId: string, rawBody: string, deps: RadarDeps): Promise<Response> {
  if (new TextEncoder().encode(rawBody).length > RADAR_LIMITS.MAX_BODY_BYTES) return fail('invalid_input');
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return fail('invalid_input'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid_input');
  const { businessId, url } = body as Record<string, unknown>;
  if (typeof businessId !== 'string' || !UUID.test(businessId)) return fail('invalid_input');
  if (url !== undefined && typeof url !== 'string') return fail('invalid_input');
  if (!url || !url.trim()) return fail('url_required');
  if (url.length > RADAR_LIMITS.MAX_URL_CHARS) return fail('url_too_long');

  let target: URL;
  try {
    target = checkUrl(normalizeCompetitorUrl(url));
  } catch (err) {
    return fail(err instanceof SafeFetchError ? err.code : 'invalid_url');
  }

  const own = await deps.loadOwnTerms(userId, businessId);
  if (!own) return fail('not_found');

  const started = deps.net.now();
  let page;
  try {
    page = await safeGet(target.href, {
      maxBytes: RADAR_LIMITS.PAGE_MAX_BYTES,
      timeoutMs: RADAR_LIMITS.PAGE_TIMEOUT_MS,
      deadline: started + RADAR_LIMITS.TOTAL_MS,
      maxRedirects: RADAR_LIMITS.MAX_REDIRECTS,
      accept: 'text/html,application/xhtml+xml',
    }, deps.net);
  } catch (err) {
    if (err instanceof SafeFetchError) return fail(err.code);
    throw err;
  }

  if (page.status < 200 || page.status >= 300) return json({ error: 'bad_status', httpStatus: page.status }, STATUS.bad_status);
  const contentType = (page.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!HTML_TYPES.includes(contentType)) return fail('unsupported_content');

  const result: RadarResult = {
    status: 'analyzed',
    fetch: {
      finalUrl: page.url.href,
      domain: page.url.hostname.replace(/^www\./, ''),
      https: page.url.protocol === 'https:',
      redirected: page.url.href !== target.href,
      httpStatus: page.status,
      contentType,
      bytes: new TextEncoder().encode(page.body).length,
      durationMs: Math.max(0, deps.net.now() - started),
    },
    signals: extractSignals(page.body, page.url, own),
    analyzedAt: new Date(deps.net.now()).toISOString(),
  };
  return json(result);
}
