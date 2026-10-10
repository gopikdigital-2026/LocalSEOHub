import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { parseBillingStatus, type BillingStatus } from './model';

type Db = Pick<SupabaseClient, 'rpc' | 'functions'>;

export async function fetchBillingStatus(db: Db = supabase): Promise<BillingStatus> {
  const { data, error } = await db.rpc('billing_status');
  if (error) throw new Error('billing_status_failed');
  return parseBillingStatus(data);
}

export async function startTrial(db: Db = supabase): Promise<{ status: BillingStatus; created: boolean; emailNotVerified?: boolean }> {
  const { data, error } = await db.rpc('start_trial');
  if (error) throw new Error('start_trial_failed');
  const raw = data as Record<string, unknown> | null;
  if (raw?.state === 'email_not_verified') {
    return {
      status: { state: 'TRIAL_NOT_STARTED', hasPremium: false, trialStartedAt: null, trialEndsAt: null, subscriptionStatus: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, clockOffsetMs: 0 },
      created: false,
      emailNotVerified: true,
    };
  }
  return { status: parseBillingStatus(data), created: raw?.trial_created === true };
}

export type BillingAction = 'checkout' | 'portal' | 'payment_method' | 'cancel' | 'resume' | 'sync';
export type BillingErrorCode = 'already_subscribed' | 'no_subscription' | 'billing_unavailable' | 'unauthorized' | 'billing_failed';

const KNOWN: ReadonlySet<string> = new Set<BillingErrorCode>([
  'already_subscribed', 'no_subscription', 'billing_unavailable', 'unauthorized', 'billing_failed',
]);

export class BillingActionError extends Error {
  constructor(public code: BillingErrorCode) {
    super(code);
    this.name = 'BillingActionError';
  }
}

async function errorCodeFrom(error: unknown): Promise<BillingErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as BillingErrorCode;
    } catch {
      return 'billing_failed';
    }
  }
  return 'billing_failed';
}

export async function runBillingAction(action: BillingAction, db: Db = supabase): Promise<{ url?: string }> {
  const { data, error } = await db.functions.invoke('stripe-billing', { body: { action } });
  if (error) throw new BillingActionError(await errorCodeFrom(error));
  if (!data || typeof data !== 'object') throw new BillingActionError('billing_failed');
  const url = (data as { url?: unknown }).url;
  if (url === undefined) return {};
  if (typeof url !== 'string' || !/^https:\/\/(checkout|billing)\.stripe\.com\//.test(url)) {
    throw new BillingActionError('billing_failed');
  }
  return { url };
}
