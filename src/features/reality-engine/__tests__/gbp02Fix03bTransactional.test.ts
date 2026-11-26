import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createHandler as createCallback,
  type CallbackDeps,
  type CompleteResult,
  type ConsumeResult,
} from '../../../../supabase/functions/gbp-oauth-callback/handler.ts';
import {
  ensureAccessToken,
  vaultCredentialStore,
  type CredentialStore,
  type ExpectedCredentials,
  type StoredCredentials,
} from '../../../../supabase/functions/gbp-sync/gbpToken.ts';
import { createSafeCloseHandler, SAFE_CLOSE_CODE } from '../../../../auditoria-a2/gbp02-fix03b/rollback/gbp-oauth-callback-safe-close/handler.ts';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');
const STATE = 'd'.repeat(64);
const ACCESS = 'ya29.FIX03B_ACCESS';
const REFRESH = '1//FIX03B_REFRESH';
const NOW = new Date('2026-11-26T12:00:00Z');
const ATTEMPT = { sourceId: 'src-1', userId: 'user-1', businessId: 'biz-1', attemptId: 'att-1', state: STATE };
const ENV: Record<string, string> = {
  SITE_URL: 'https://localseohub.io', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'client-secret', GOOGLE_REDIRECT_URI: 'https://x/cb',
};
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const errorOf = (res: Response) => new URL(res.headers.get('Location')!).searchParams.get('error');

afterEach(() => vi.restoreAllMocks());

function harness(opts: { consume?: ConsumeResult; complete?: CompleteResult; token?: Record<string, unknown> } = {}) {
  const fail = vi.fn(async () => true);
  const complete = vi.fn(async () => opts.complete ?? 'COMPLETED');
  const consume = vi.fn(async () => opts.consume ?? { result: 'CONSUMED' as const, attempt: ATTEMPT });
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/token')
    ? jsonRes(opts.token ?? { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3599 })
    : jsonRes({ accounts: [{ name: 'accounts/1', accountName: 'Cuenta' }] }));
  const deps: CallbackDeps = {
    env: (n) => ENV[n],
    consumeState: consume,
    ownsBusiness: async () => true,
    completeAttempt: complete,
    failAttempt: fail,
    fetch: fetchFn as unknown as typeof fetch,
    now: () => NOW,
  };
  const call = (q: string) => createCallback(deps)(new Request(`https://x/gbp-oauth-callback?${q}`));
  return { call, fail, complete, consume, fetchFn };
}

describe('FIX03B · callback single-use state and atomic completion', () => {
  it('a reused state (ALREADY_USED) is rejected without touching Google or any row', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const q of [`code=x&state=${STATE}`, `error=access_denied&state=${STATE}`]) {
      const h = harness({ consume: { result: 'ALREADY_USED' } });
      expect(errorOf(await h.call(q))).toBe('ATTEMPT_NOT_FOUND');
      expect(h.fetchFn).not.toHaveBeenCalled();
      expect(h.fail).not.toHaveBeenCalled();
      expect(h.complete).not.toHaveBeenCalled();
    }
  });

  it('an expired state is reported as ATTEMPT_EXPIRED; the database already closed the attempt', async () => {
    const h = harness({ consume: { result: 'EXPIRED' } });
    expect(errorOf(await h.call(`code=x&state=${STATE}`))).toBe('ATTEMPT_EXPIRED');
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(h.fail).not.toHaveBeenCalled();
  });

  it('a malformed state never reaches the database', async () => {
    const h = harness();
    expect(errorOf(await h.call('code=x&state=ABC'))).toBe('ATTEMPT_NOT_FOUND');
    expect(errorOf(await h.call(`code=x&state=${'D'.repeat(64)}`))).toBe('ATTEMPT_NOT_FOUND');
    expect(h.consume).not.toHaveBeenCalled();
  });

  it('completion passes the full identity, attempt id and state with both tokens', async () => {
    const h = harness();
    const res = await h.call(`code=x&state=${STATE}`);
    expect(res.headers.get('Location')).toContain('accounts=');
    expect(h.complete).toHaveBeenCalledExactlyOnceWith(ATTEMPT, {
      accessToken: ACCESS, refreshToken: REFRESH, expiresAt: new Date(NOW.getTime() + 3599_000).toISOString(),
    });
    expect(h.fail).not.toHaveBeenCalled();
  });

  it('expires_in is clamped to one hour so the database 24 h bound always holds', async () => {
    const h = harness({ token: { access_token: ACCESS, refresh_token: REFRESH, expires_in: 10 ** 9 } });
    await h.call(`code=x&state=${STATE}`);
    const tokens = (h.complete.mock.calls[0] as unknown[])[1] as { expiresAt: string };
    expect(Date.parse(tokens.expiresAt) - NOW.getTime()).toBe(3600_000);
  });

  it('a missing refresh token fails the attempt instead of reusing a previous authorization', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness({ token: { access_token: ACCESS, expires_in: 3600 } });
    expect(errorOf(await h.call(`code=x&state=${STATE}`))).toBe('CODE_EXCHANGE_FAILED');
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.fail).toHaveBeenCalledExactlyOnceWith(ATTEMPT, 'error', 'CODE_EXCHANGE_FAILED');
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('SUPERSEDED leaves the newer attempt untouched; EXPIRED is reported without a second write', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sup = harness({ complete: 'SUPERSEDED' });
    expect(errorOf(await sup.call(`code=x&state=${STATE}`))).toBe('ATTEMPT_NOT_FOUND');
    expect(sup.fail).not.toHaveBeenCalled();
    const exp = harness({ complete: 'EXPIRED' });
    expect(errorOf(await exp.call(`code=x&state=${STATE}`))).toBe('ATTEMPT_EXPIRED');
    expect(exp.fail).not.toHaveBeenCalled();
  });

  it('the callback adapter reaches rows only through the four authorized server paths', () => {
    const index = src('supabase/functions/gbp-oauth-callback/index.ts');
    const rpcs = [...index.matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(rpcs).toEqual(['gbp_consume_oauth_state', 'gbp_complete_oauth_attempt', 'gbp_fail_oauth_attempt']);
    expect([...index.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual(['businesses']);
  });
});

function casStore(initial: StoredCredentials | null) {
  let current = initial;
  const writes: { access: string; refresh: string | null; expected: ExpectedCredentials }[] = [];
  const store: CredentialStore & { set(c: StoredCredentials | null): void } = {
    read: vi.fn(async () => (current ? { ...current } : null)),
    write: vi.fn(async (access: string, refresh: string | null, expiresAt: string, expected: ExpectedCredentials) => {
      writes.push({ access, refresh, expected });
      if (!current || current.accessToken !== expected.accessToken || current.refreshToken !== expected.refreshToken) return false;
      current = { accessToken: access, refreshToken: refresh ?? current.refreshToken, expiresAt };
      return true;
    }),
    set(c) { current = c; },
  };
  return { store, writes, get: () => current };
}
const tokenFetch = (body: unknown, onCall?: () => void) => vi.fn(async () => { onCall?.(); return jsonRes(body); }) as unknown as typeof fetch;
const NOW_MS = NOW.getTime();

describe('FIX03B · refresh is compare-and-swap against what was read', () => {
  const expired = { accessToken: 'old-a', refreshToken: 'old-r', expiresAt: new Date(NOW_MS - 1000).toISOString() };

  it('passes the pair it read as the expected value', async () => {
    const s = casStore(expired);
    const r = await ensureAccessToken(s.store, { fetch: tokenFetch({ access_token: 'new-a', expires_in: 3600 }), clientId: 'c', clientSecret: 's', now: () => NOW_MS });
    expect(r).toEqual({ ok: true, accessToken: 'new-a', refreshed: true });
    expect(s.writes).toEqual([{ access: 'new-a', refresh: null, expected: { accessToken: 'old-a', refreshToken: 'old-r' } }]);
  });

  it('a late refresh after reconnection never overwrites or uses the old result; it adopts the valid new token', async () => {
    const s = casStore(expired);
    const fresh = { accessToken: 'B-a', refreshToken: 'B-r', expiresAt: new Date(NOW_MS + 30 * 60_000).toISOString() };
    const r = await ensureAccessToken(s.store, {
      fetch: tokenFetch({ access_token: 'A-late', refresh_token: 'A-late-r', expires_in: 3600 }, () => s.store.set(fresh)),
      clientId: 'c', clientSecret: 's', now: () => NOW_MS,
    });
    expect(r).toEqual({ ok: true, accessToken: 'B-a', refreshed: false });
    expect(s.get()).toEqual(fresh);
  });

  it('losing the swap to credentials that also need refresh is retryable, not a disconnect', async () => {
    const s = casStore(expired);
    const other = { accessToken: 'C-a', refreshToken: 'C-r', expiresAt: new Date(NOW_MS - 1).toISOString() };
    const r = await ensureAccessToken(s.store, {
      fetch: tokenFetch({ access_token: 'late', expires_in: 3600 }, () => s.store.set(other)),
      clientId: 'c', clientSecret: 's', now: () => NOW_MS,
    });
    expect(r).toEqual({ ok: false, code: 'GBP_API_UNAVAILABLE', retryable: true });
    expect(s.get()).toEqual(other);
  });

  it('losing the swap because the source was disconnected reports NOT_CONNECTED', async () => {
    const s = casStore(expired);
    const r = await ensureAccessToken(s.store, {
      fetch: tokenFetch({ access_token: 'late', expires_in: 3600 }, () => s.store.set(null)),
      clientId: 'c', clientSecret: 's', now: () => NOW_MS,
    });
    expect(r).toEqual({ ok: false, code: 'NOT_CONNECTED', retryable: false });
  });

  it('the Vault store calls the compare-and-swap RPC, never the blind store', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const ok = await vaultCredentialStore({ rpc }, 'src-9').write('n-a', null, '2026-11-26T13:00:00.000Z', { accessToken: 'o-a', refreshToken: 'o-r' });
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('gbp_refresh_credentials', {
      p_source_id: 'src-9', p_expected_access: 'o-a', p_expected_refresh: 'o-r',
      p_access_token: 'n-a', p_refresh_token: null, p_expires_at: '2026-11-26T13:00:00.000Z',
    });
  });

  it('all four gbpToken copies are byte-identical', () => {
    const hashes = ['gbp-sync', 'gbp-list-locations', 'gbp-disconnect', 'gbp-reviews']
      .map((f) => createHash('sha256').update(src(`supabase/functions/${f}/gbpToken.ts`)).digest('hex'));
    expect(new Set(hashes).size).toBe(1);
  });
});

describe('FIX03B · prepared SQL (static checks; behaviour verified by the PostgreSQL harness)', () => {
  const m1 = src('auditoria-a2/gbp02-fix03b/migrations/20261126120000_gbp02_fix03b_oauth_transactional.sql');
  const m2 = src('auditoria-a2/gbp02-fix03b/migrations/20261126120100_gbp02_fix03b_revoke_blind_store.sql');
  const fns = ['gbp_consume_oauth_state', 'gbp_complete_oauth_attempt', 'gbp_fail_oauth_attempt', 'gbp_refresh_credentials', 'gbp_store_credentials'];

  it('every RPC is SECURITY DEFINER with an empty search_path and EXECUTE only for service_role', () => {
    for (const fn of fns) {
      const body = m1.slice(m1.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`));
      expect(body.slice(0, body.indexOf('AS $$'))).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
      expect(m1).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(m1).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
    }
    expect(m1).not.toMatch(/GRANT[^;]*TO (anon|authenticated|PUBLIC)/i);
    expect(m1).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
    expect(m1).not.toMatch(/\bDROP\b|\bBEGIN;|\bCOMMIT\b/i);
  });

  it('the prepared migrations live outside supabase/migrations and migration 2 only revokes', () => {
    expect(() => src('supabase/migrations/20261126120000_gbp02_fix03b_oauth_transactional.sql')).toThrow();
    expect(m2.replace(/\/\*[\s\S]*?\*\//g, '').trim()).toBe('REVOKE EXECUTE ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) FROM service_role;');
  });
});

describe('FIX03B · rollback safe-close callback (not deployed)', () => {
  it('burns the state and closes the attempt without contacting Google', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failAttempt = vi.fn(async () => true);
    const consumeState = vi.fn(async (): Promise<ConsumeResult> => ({ result: 'CONSUMED', attempt: ATTEMPT }));
    const handle = createSafeCloseHandler({ env: (n) => ENV[n], consumeState, failAttempt });
    const res = await handle(new Request(`https://x/cb?state=${STATE}&code=secret-code`));
    expect(errorOf(res)).toBe(SAFE_CLOSE_CODE);
    expect(consumeState).toHaveBeenCalledExactlyOnceWith(STATE);
    expect(failAttempt).toHaveBeenCalledExactlyOnceWith(ATTEMPT, SAFE_CLOSE_CODE);
    expect(src('auditoria-a2/gbp02-fix03b/rollback/gbp-oauth-callback-safe-close/handler.ts')).not.toMatch(/fetch\(|googleapis/);

    const bad = createSafeCloseHandler({ env: (n) => ENV[n], consumeState: vi.fn(async () => { throw new Error('down'); }), failAttempt });
    expect(errorOf(await bad(new Request(`https://x/cb?state=${STATE}`)))).toBe(SAFE_CLOSE_CODE);
    const none = vi.fn();
    await createSafeCloseHandler({ env: (n) => ENV[n], consumeState: none, failAttempt })(new Request('https://x/cb?state=bad'));
    expect(none).not.toHaveBeenCalled();
  });
});
