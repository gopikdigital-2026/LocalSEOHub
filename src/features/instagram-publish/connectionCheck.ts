import { supabase } from '../../lib/supabase';

export type CheckStatus = 'pass' | 'fail' | 'inconclusive' | 'skipped';
export type Overall = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
export const CHECK_NAMES = ['token', 'permissions', 'page', 'instagram_account', 'professional_eligibility', 'publishing_limit'] as const;
export type CheckName = (typeof CHECK_NAMES)[number];
const PERMISSIONS = ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'] as const;
const STATUSES: CheckStatus[] = ['pass', 'fail', 'inconclusive', 'skipped'];
const OVERALLS: Overall[] = ['PASS', 'FAIL', 'INCONCLUSIVE'];
const EXPIRY = ['never', 'valid_until', 'expired', 'unknown'] as const;
const CODE = /^[A-Z_]{1,48}$/;

export interface ConnectionCheck {
  overall: Overall;
  checkedAt: string | null;
  tokenValid: boolean | 'unknown';
  expiry: (typeof EXPIRY)[number];
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  permissions: Record<(typeof PERMISSIONS)[number], boolean | null>;
  pageId: string | null;
  accountId: string | null;
  username: string | null;
  eligibility: CheckStatus;
  quotaUsage: number | null;
  quotaTotal: number | null;
  checks: Record<CheckName, { status: CheckStatus; reason: string | null }>;
  reasons: string[];
}

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const id = (v: unknown) => (typeof v === 'string' && /^[0-9]{1,32}$/.test(v) ? v : null);
const code = (v: unknown) => (typeof v === 'string' && CODE.test(v) ? v : null);
const status = (v: unknown): CheckStatus => (STATUSES.includes(v as CheckStatus) ? (v as CheckStatus) : 'inconclusive');

// Read-only server check. Nothing is stored and it never enables publishing.
export async function checkMetaConnection(publicationId: string): Promise<ConnectionCheck | { error: string }> {
  let body: Record<string, unknown> | null = null;
  try {
    const { data, error } = await supabase.functions.invoke('instagram-publishing', {
      body: { action: 'instagram_connection_preflight', publicationId },
    });
    if (error) {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      const parsed = typeof ctx?.json === 'function' ? await ctx.json().catch(() => null) : null;
      return { error: code(obj(parsed).code) ?? 'INTERNAL_ERROR' };
    }
    body = obj(data);
  } catch {
    return { error: 'INTERNAL_ERROR' };
  }
  if (body.ok !== true || !OVERALLS.includes(body.overall as Overall)) return { error: code(body.code) ?? 'INTERNAL_ERROR' };
  const expiry = obj(body.token_expiry);
  const perms = obj(body.permissions);
  const limit = obj(body.publishing_limit);
  const checks = obj(body.checks);
  const tv = body.token_valid;
  return {
    overall: body.overall as Overall,
    checkedAt: str(body.checked_at),
    tokenValid: tv === true || tv === false ? tv : 'unknown',
    expiry: EXPIRY.includes(expiry.status as (typeof EXPIRY)[number]) ? (expiry.status as (typeof EXPIRY)[number]) : 'unknown',
    expiresAt: str(expiry.expires_at),
    dataAccessExpiresAt: str(expiry.data_access_expires_at),
    permissions: Object.fromEntries(PERMISSIONS.map((p) => [p, typeof perms[p] === 'boolean' ? perms[p] : null])) as ConnectionCheck['permissions'],
    pageId: id(body.page_id),
    accountId: id(body.instagram_account_id),
    username: typeof body.instagram_username === 'string' && /^[A-Za-z0-9._]{1,30}$/.test(body.instagram_username) ? body.instagram_username : null,
    eligibility: status(obj(body.professional).eligibility),
    quotaUsage: num(limit.quota_usage),
    quotaTotal: num(limit.quota_total),
    checks: Object.fromEntries(CHECK_NAMES.map((n) => {
      const c = obj(checks[n]);
      return [n, { status: status(c.status), reason: code(c.reason) }];
    })) as ConnectionCheck['checks'],
    reasons: Array.isArray(body.reasons) ? body.reasons.map(code).filter((r): r is string => r !== null) : [],
  };
}
