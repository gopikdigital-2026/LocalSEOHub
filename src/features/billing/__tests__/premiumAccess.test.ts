import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  requirePremium,
  createRuntimeEntitlementDeps,
  PREMIUM_RATE_LIMIT,
  type EntitlementDecision,
  type EntitlementDeps,
} from '../../../../supabase/functions/analyze-website/entitlement.ts';
import {
  checkPublicUrl,
  isPrivateAddress,
  resolvePublicAddresses,
} from '../../../../supabase/functions/analyze-website/urlSafety.ts';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const FN_DIR = join(__dirname, '../../../../supabase/functions');
const CORS = { 'Access-Control-Allow-Origin': '*' };

const PREMIUM_FUNCTIONS = ['analyze-website'];

const ENTITLEMENT_COPIES = ['analyze-website', 'weekly-content', 'business-improvement'];

const RETIRED_FUNCTIONS = [
  'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews',
  'execute-tip-content', 'generate-business-audit', 'generate-content-plan',
  'generate-countermeasure', 'generate-gbp-description', 'generate-geo-audit',
  'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
  'simulate-campaign',
];

const read = (fn: string, file = 'index.ts') => readFileSync(join(FN_DIR, fn, file), 'utf8');

function req(headers: Record<string, string> = {}, body?: unknown) {
  return new Request('https://x.test/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function fakeDeps(users: Record<string, string>, decisions: Record<string, EntitlementDecision>) {
  const authorize = vi.fn(async (userId: string) => decisions[userId] ?? 'premium_required');
  const deps: EntitlementDeps = {
    resolveUserId: vi.fn(async (token: string) => users[token] ?? null),
    authorize,
  };
  return { deps, authorize };
}

const USERS = {
  'tok-none': 'u-none',
  'tok-trial': 'u-trial',
  'tok-expired': 'u-expired',
  'tok-paid': 'u-paid',
  'tok-canceled': 'u-canceled',
  'tok-scheduled': 'u-scheduled',
  'tok-busy': 'u-busy',
};
const DECISIONS: Record<string, EntitlementDecision> = {
  'u-none': 'premium_required',
  'u-trial': 'ok',
  'u-expired': 'premium_required',
  'u-paid': 'ok',
  'u-canceled': 'premium_required',
  'u-scheduled': 'ok',
  'u-busy': 'rate_limited',
};

describe('requirePremium (server-side entitlement)', () => {
  let ctx: ReturnType<typeof fakeDeps>;
  beforeEach(() => {
    ctx = fakeDeps(USERS, DECISIONS);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const call = (token?: string, body?: unknown, extra: Record<string, string> = {}) =>
    requirePremium(req(token ? { Authorization: `Bearer ${token}`, ...extra } : extra, body), 'generate-seo', CORS, ctx.deps);

  it('E1 anonymous request without token gets 401 and never reaches the entitlement lookup', async () => {
    const r = await call();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(401);
      expect(await r.response.json()).toEqual({ error: 'unauthorized' });
      expect(r.response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    }
    expect(ctx.authorize).not.toHaveBeenCalled();
  });

  it('E2 anon key or invalid token gets 401', async () => {
    const r = await call('anon-key-jwt');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
    expect(ctx.authorize).not.toHaveBeenCalled();
  });

  it.each([
    ['no trial', 'tok-none', 403],
    ['expired trial', 'tok-expired', 403],
    ['canceled after paid period', 'tok-canceled', 403],
    ['rate limited', 'tok-busy', 429],
  ])('E3 %s is denied', async (_label, token, status) => {
    const r = await call(token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(status);
  });

  it.each([
    ['active trial', 'tok-trial', 'u-trial'],
    ['active subscription', 'tok-paid', 'u-paid'],
    ['scheduled cancellation before period end', 'tok-scheduled', 'u-scheduled'],
  ])('E4 %s is accepted', async (_label, token, userId) => {
    const r = await call(token);
    expect(r).toEqual({ ok: true, userId });
  });

  it('E5 forged client status in body or headers is ignored', async () => {
    const forged = { status: 'active', premium: true, trial_ends_at: '2099-01-01', business_id: 'other', user_id: 'u-paid' };
    const r = await call('tok-none', forged, { 'X-Billing-Status': 'SUBSCRIPTION_ACTIVE', 'X-User-Id': 'u-paid' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
    expect(ctx.authorize).toHaveBeenCalledWith('u-none', 'generate-seo');
  });

  it('E6 backend failure returns 503 with no internals', async () => {
    ctx.deps.authorize = vi.fn(async () => { throw new Error('sk_test_SECRET connection refused db.internal'); });
    const r = await call('tok-paid');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(503);
      const text = await r.response.text();
      expect(text).toBe('{"error":"unavailable"}');
    }
  });

  it('E7 malformed Authorization header is rejected', async () => {
    const r = await requirePremium(req({ Authorization: 'Basic abc' }), 'generate-seo', CORS, ctx.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });
});

describe('createRuntimeEntitlementDeps (HTTP wiring)', () => {
  const env = { url: 'https://proj.supabase.co', serviceKey: 'service-key' };

  it('R1 resolves the user from the token and asks the database, never the client', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/v1/user')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer user-token');
        return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
      }
      expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/authorize_premium_request');
      expect(JSON.parse(String(init?.body))).toEqual({
        p_user_id: 'u1', p_function: 'generate-seo',
        p_limit: PREMIUM_RATE_LIMIT.limit, p_window_seconds: PREMIUM_RATE_LIMIT.windowSeconds,
      });
      return new Response(JSON.stringify('ok'), { status: 200 });
    });
    const deps = createRuntimeEntitlementDeps(env, fetchImpl);
    const r = await requirePremium(req({ Authorization: 'Bearer user-token' }), 'generate-seo', CORS, deps);
    expect(r).toEqual({ ok: true, userId: 'u1' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('R2 anon key token (no user) -> 401 and no paid call', async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => new Response('{"msg":"invalid claim: missing sub claim"}', { status: 403 }));
    const deps = createRuntimeEntitlementDeps(env, fetchImpl);
    const r = await requirePremium(req({ Authorization: 'Bearer anon' }), 'generate-seo', CORS, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('openai'))).toBe(false);
  });

  it('R3 unexpected RPC payload fails closed (503)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/auth/v1/user')
        ? new Response(JSON.stringify({ id: 'u1' }))
        : new Response(JSON.stringify(true)));
    const r = await requirePremium(req({ Authorization: 'Bearer t' }), 'x', CORS, createRuntimeEntitlementDeps(env, fetchImpl));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });

  it('R4 missing configuration throws instead of allowing', () => {
    expect(() => createRuntimeEntitlementDeps({ url: '', serviceKey: 'k' })).toThrow();
  });
});

describe('every premium function enforces entitlement first (source)', () => {
  const reference = read('analyze-website', 'entitlement.ts');

  it('G1 all premium functions ship an identical entitlement helper', () => {
    for (const fn of ENTITLEMENT_COPIES) {
      expect(existsSync(join(FN_DIR, fn, 'entitlement.ts')), fn).toBe(true);
      expect(read(fn, 'entitlement.ts'), fn).toBe(reference);
    }
  });

  it.each(PREMIUM_FUNCTIONS)('G2 %s checks access before body parsing, secrets or outbound calls', (fn) => {
    const src = read(fn);
    const guard = src.indexOf(`requirePremium(req, "${fn}", corsHeaders)`);
    expect(guard, fn).toBeGreaterThan(-1);
    expect(src).toContain('if (!access.ok) return access.response;');
    const handler = src.indexOf('Deno.serve(');
    const after = src.slice(handler);
    const guardInHandler = after.indexOf('requirePremium(');
    for (const marker of ['req.json()', 'fetch(', 'analyze(', 'LocalSEO_KEY', 'LocalSEO_AI', 'GOOGLE_']) {
      const at = after.indexOf(marker);
      if (at !== -1) expect(at, `${fn}: ${marker}`).toBeGreaterThan(guardInHandler);
    }
  });

  it('G3 no premium function still uses the legacy signup-date trial or raw errors', () => {
    for (const fn of PREMIUM_FUNCTIONS) {
      const src = read(fn);
      expect(src, fn).not.toMatch(/inTrial|created_at\)\.getTime\(\)\s*\+/);
      expect(src, fn).not.toMatch(/JSON\.stringify\(\{\s*error:\s*(message|msg|err\.message)\s*\}\)/);
    }
  });

  it('G4 every function directory has a deploy config entry', () => {
    const config = readFileSync(join(FN_DIR, '../config.toml'), 'utf8');
    const dirs = readdirSync(FN_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    for (const d of dirs) expect(config, d).toContain(`[functions.${d}]`);
  });

  it('G6 billing never falls back to a different product price when one is configured', () => {
    const src = read('stripe-billing');
    expect(src).not.toMatch(/LEGACY_PRICE_ID|price_1TcAMB/);
    expect(src).toContain("Deno.env.get('STRIPE_PRICE_ID')?.trim()");
    expect(src).toContain('configured_price_not_found_for_this_stripe_key');
  });

  it('G7 customer lookups only ever use the active (non-archived) customer link', () => {
    for (const fn of ['stripe-billing', 'stripe-webhook']) {
      const src = read(fn);
      const lookups = src.split(".from('stripe_customers')").slice(1).map((s) => s.slice(0, 300));
      const reads = lookups.filter((s) => s.trimStart().startsWith('.select'));
      expect(reads.length).toBeGreaterThan(0);
      for (const r of reads) expect(r).toContain(".is('deleted_at', null)");
    }
  });

  it.each(RETIRED_FUNCTIONS)('G8 retired %s answers 410 without auth, secrets, AI or outbound calls', (fn) => {
    expect(readdirSync(join(FN_DIR, fn))).toEqual(['index.ts']);
    const src = read(fn);
    expect(src).toContain('status: 410');
    expect(src).not.toMatch(/\bimport\b|fetch\(|Deno\.env|req\.json\(|createClient|requirePremium|openai/i);
  });

  it('G5 public signup is rate limited and never rewrites an existing account', () => {
    const src = read('signup-instant');
    expect(src).toContain('consume_rate_limit');
    expect(src).not.toMatch(/updateUserById|listUsers/);
    expect(src).not.toContain('exists: true');
  });
});

describe('analyze-website outbound URL safety', () => {
  it.each([
    'http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://169.254.169.254/latest/meta-data',
    'http://192.168.1.1/', 'http://172.16.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'file:///etc/passwd',
    'http://user:pw@example.com/', 'http://example.com:5432/', 'http://2130706433/', 'http://intranet/',
    'http://db.internal/', 'http://[::ffff:127.0.0.1]/',
  ])('U1 rejects %s', (u) => {
    expect(checkPublicUrl(u)).toBeNull();
  });

  it('U2 accepts normal public sites', () => {
    expect(checkPublicUrl('https://www.example.com/path')?.hostname).toBe('www.example.com');
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it('U3 blocks hosts that resolve to private addresses', async () => {
    await expect(resolvePublicAddresses('evil.com', async (_h, t) => (t === 'A' ? ['10.0.0.1'] : [])))
      .rejects.toMatchObject({ code: 'blocked' });
    await expect(resolvePublicAddresses('ok.com', async (_h, t) => (t === 'A' ? ['93.184.216.34'] : [])))
      .resolves.toEqual(['93.184.216.34']);
  });
});
