import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type ReviewsState =
  | 'not_connected' | 'no_location' | 'not_configured' | 'auth_expired' | 'auth_revoked' | 'access_denied'
  | 'quota_unavailable' | 'api_not_enabled' | 'location_not_eligible' | 'review_not_found' | 'google_error';

export type ReviewsErrorCode =
  | 'unauthorized' | 'premium_required' | 'rate_limited' | 'review_limit' | 'global_limit' | 'duplicate_request'
  | 'invalid_input' | 'ai_unavailable' | 'generation_failed' | 'not_found' | 'payload_too_large' | 'unavailable';

export interface Review {
  reviewId: string;
  reviewerName: string | null;
  starRating: number | null;
  comment: string | null;
  createTime: string | null;
  updateTime: string | null;
  ownerReply: { comment: string; updateTime: string | null } | null;
}

export type ReviewsLoad =
  | { kind: 'ok'; reviews: Review[]; complete: boolean; totalReviewCount: number | null; averageRating: number | null }
  | { kind: 'state'; state: ReviewsState; retryable: boolean };

export type DraftResult = { kind: 'draft'; text: string } | { kind: 'state'; state: ReviewsState; retryable: boolean };

export interface ReviewUsage {
  used: number;
  limit: number;
  globalUsed: number;
  globalLimit: number;
}

export class ReviewsError extends Error {
  constructor(readonly code: ReviewsErrorCode) {
    super(code);
  }
}

type Db = Pick<SupabaseClient, 'rpc' | 'functions'>;

const STATES = new Set<ReviewsState>([
  'not_connected', 'no_location', 'not_configured', 'auth_expired', 'auth_revoked', 'access_denied',
  'quota_unavailable', 'api_not_enabled', 'location_not_eligible', 'review_not_found', 'google_error',
]);
const ERRORS = new Set<ReviewsErrorCode>([
  'unauthorized', 'premium_required', 'rate_limited', 'review_limit', 'global_limit', 'duplicate_request',
  'invalid_input', 'ai_unavailable', 'generation_failed', 'not_found', 'payload_too_large', 'unavailable',
]);

const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function toReview(v: unknown): Review | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.reviewId !== 'string' || !r.reviewId) return null;
  const stars = typeof r.starRating === 'number' && r.starRating >= 1 && r.starRating <= 5 ? r.starRating : null;
  const reply = r.ownerReply as Record<string, unknown> | null | undefined;
  return {
    reviewId: r.reviewId,
    reviewerName: strOrNull(r.reviewerName),
    starRating: stars,
    comment: strOrNull(r.comment),
    createTime: strOrNull(r.createTime),
    updateTime: strOrNull(r.updateTime),
    ownerReply: reply && typeof reply.comment === 'string' && reply.comment
      ? { comment: reply.comment, updateTime: strOrNull(reply.updateTime) }
      : null,
  };
}

function asState(data: unknown): { kind: 'state'; state: ReviewsState; retryable: boolean } | null {
  const d = data as { status?: unknown; retryable?: unknown } | null;
  if (typeof d?.status === 'string' && STATES.has(d.status as ReviewsState)) {
    return { kind: 'state', state: d.status as ReviewsState, retryable: d.retryable === true };
  }
  return null;
}

async function errorCodeFrom(error: unknown): Promise<ReviewsErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string' && ERRORS.has(body.error)) return body.error as ReviewsErrorCode;
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

export async function loadReviews(db: Db = supabase): Promise<ReviewsLoad> {
  const { data, error } = await db.functions.invoke('gbp-reviews', { body: { action: 'list' } });
  if (error) throw new ReviewsError(await errorCodeFrom(error));
  const state = asState(data);
  if (state) return state;
  const d = data as Record<string, unknown> | null;
  if (d?.status !== 'ok' || !Array.isArray(d.reviews)) throw new ReviewsError('unavailable');
  const reviews = d.reviews.map(toReview).filter((r): r is Review => r !== null);
  return {
    kind: 'ok',
    reviews,
    complete: d.complete === true,
    totalReviewCount: typeof d.totalReviewCount === 'number' ? d.totalReviewCount : null,
    averageRating: typeof d.averageRating === 'number' ? d.averageRating : null,
  };
}

export async function draftReply(
  input: { reviewId: string; lang: 'es' | 'en' },
  db: Db = supabase,
): Promise<DraftResult> {
  const body = { action: 'draft', reviewId: input.reviewId, lang: input.lang, requestId: crypto.randomUUID() };
  const { data, error } = await db.functions.invoke('gbp-reviews', { body });
  if (error) throw new ReviewsError(await errorCodeFrom(error));
  const state = asState(data);
  if (state) return state;
  const d = data as { status?: unknown; draft?: unknown; reviewId?: unknown } | null;
  if (d?.status !== 'drafted' || typeof d.draft !== 'string' || !d.draft.trim() || d.reviewId !== input.reviewId) {
    throw new ReviewsError('unavailable');
  }
  return { kind: 'draft', text: d.draft.trim() };
}

export async function loadReviewUsage(db: Db = supabase): Promise<ReviewUsage | null> {
  const { data, error } = await db.rpc('my_ai_usage');
  if (error || !data || typeof data !== 'object') return null;
  const fn = (data as { functions?: Record<string, { used?: unknown; limit?: unknown }> }).functions?.['review-reply'];
  const global = (data as { global?: { used?: unknown; limit?: unknown } }).global;
  if (typeof fn?.used !== 'number' || typeof fn.limit !== 'number'
    || typeof global?.used !== 'number' || typeof global.limit !== 'number') return null;
  return { used: fn.used, limit: fn.limit, globalUsed: global.used, globalLimit: global.limit };
}
