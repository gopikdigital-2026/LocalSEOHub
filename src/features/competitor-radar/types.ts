import type { PageSignals } from '../../../supabase/functions/competitor-radar-v2/extract';

export type { PageSignals };

export interface CompetitorFetch {
  finalUrl: string;
  domain: string;
  https: boolean;
  redirected: boolean;
  httpStatus: number;
  contentType: string;
  bytes: number;
  durationMs: number;
}

export interface CompetitorAnalysis {
  fetch: CompetitorFetch;
  signals: PageSignals;
  analyzedAt: string;
}

export type RadarErrorCode =
  | 'invalid_input' | 'url_required' | 'url_too_long' | 'invalid_url' | 'blocked' | 'not_found' | 'dns_failed'
  | 'dns_empty' | 'connect_failed' | 'tls_failed' | 'bad_response' | 'timeout' | 'too_large' | 'too_many_redirects'
  | 'redirect_loop' | 'off_site_redirect' | 'bad_status' | 'unsupported_content' | 'premium_required'
  | 'rate_limited' | 'unauthorized' | 'unavailable';

export const RADAR_ERROR_CODES: readonly RadarErrorCode[] = [
  'invalid_input', 'url_required', 'url_too_long', 'invalid_url', 'blocked', 'not_found', 'dns_failed', 'dns_empty',
  'connect_failed', 'tls_failed', 'bad_response', 'timeout', 'too_large', 'too_many_redirects', 'redirect_loop',
  'off_site_redirect', 'bad_status', 'unsupported_content', 'premium_required', 'rate_limited', 'unauthorized', 'unavailable',
];

export const MAX_URL_CHARS = 2048;
