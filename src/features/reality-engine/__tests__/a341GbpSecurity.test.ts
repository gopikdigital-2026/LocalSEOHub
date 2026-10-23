import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ensureAccessToken,
  mapTokenEndpointError,
  revokeGoogleToken,
  type CredentialStore,
  type StoredCredentials,
} from '../../../../supabase/functions/gbp-sync/gbpToken.ts';
import { createHandler as createDisconnect, type DisconnectDeps, type ResolveResult } from '../../../../supabase/functions/gbp-disconnect/handler.ts';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');
const migration = src('supabase/migrations/20261019194350_a341_gbp_security_hardening.sql');

const ACCESS = 'ya29.SECRET_ACCESS';
const REFRESH = '1//SECRET_REFRESH';
const NOW = Date.parse('2026-10-20T10:00:00Z');

function memoryStore(initial: StoredCredentials | null) {
  let state = initial ? { ...initial } : null;
  const writes: { access: string; refresh: string | null }[] = [];
  const store: CredentialStore = {
    read: async () => state,
    write: async (access, refresh, expiresAt) => {
      writes.push({ access, refresh });
      state = { accessToken: access, refreshToken: refresh ?? state?.refreshToken ?? null, expiresAt };
      return true;
    },
  };
  return { store, writes, current: () => state };
}

function tokenFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

const deps = (fetchFn: ReturnType<typeof vi.fn>) => ({
  fetch: fetchFn as unknown as typeof fetch,
  clientId: 'cid',
  clientSecret: 'csecret',
  now: () => NOW,
});

describe('A3.4.1 privileges and RLS (migration)', () => {
  it('revokes every anon privilege on credential tables', () => {
    expect(migration).toContain('REVOKE ALL ON public.connected_sources FROM anon;');
    expect(migration).toContain('REVOKE ALL ON public.source_sync_events FROM anon;');
  });

  it('limits authenticated on sync events to select/insert/delete', () => {
    expect(migration).toContain('REVOKE UPDATE, TRUNCATE, TRIGGER, REFERENCES ON public.source_sync_events FROM authenticated;');
  });

  it('never grants token columns to client roles', () => {
    expect(migration).not.toMatch(/GRANT[^;]*token_encrypted[^;]*TO (anon|authenticated)/);
  });

  it('credential functions are executable only by service_role', () => {
    for (const fn of ['gbp_store_credentials', 'gbp_read_credentials', 'gbp_clear_credentials', 'gbp_credential_invariant_violations']) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
      expect(migration).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[^;]*(anon|authenticated)`));
    }
  });

  it('security definer functions pin an empty search_path', () => {
    const sql = migration.slice(migration.indexOf('*/'));
    const definers = sql.match(/SECURITY DEFINER\s+SET search_path = ''/g) ?? [];
    expect(definers.length).toBe((sql.match(/SECURITY DEFINER/g) ?? []).length);
    expect(definers.length).toBe(9);
  });

  it('stores tokens in Supabase Vault, not with custom crypto or a code key', () => {
    expect(migration).toContain('vault.create_secret');
    expect(migration).toContain('vault.decrypted_secrets');
    expect(migration).not.toMatch(/pgp_sym_encrypt|encrypt_iv|ENCRYPTION_KEY/i);
  });
});

describe('A3.4.1 reset and disconnected invariant', () => {
  it('a disconnected row is stripped of tokens, expiry, oauth_state and Google ids', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.connected_sources_clear_on_disconnect'));
    for (const s of [
      "IF NEW.status = 'disconnected'",
      'NEW.access_token_encrypted := NULL;',
      'NEW.refresh_token_encrypted := NULL;',
      'NEW.token_expires_at := NULL;',
      'NEW.external_account_id := NULL;',
      'NEW.external_location_id := NULL;',
      "- 'oauth_state'",
    ]) expect(fn).toContain(s);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE ON public\.connected_sources[\s\S]*connected_sources_clear_on_disconnect/);
  });

  it('deleting a connection removes its Vault secrets', () => {
    expect(migration).toMatch(/AFTER DELETE ON public\.connected_sources[\s\S]*connected_sources_forget_on_delete/);
  });

  it('existing disconnected rows are cleaned and the invariant is enforced by a constraint', () => {
    expect(migration).toMatch(/UPDATE public\.connected_sources\s+SET status = status\s+WHERE status = 'disconnected'/);
    expect(migration).toContain('connected_sources_disconnected_no_credentials');
    expect(migration).toMatch(/CHECK \(status <> 'disconnected' OR \(\s*access_token_encrypted IS NULL/);
  });

  it('server cannot write credentials onto a disconnected row', () => {
    const fn = migration.slice(migration.indexOf('FUNCTION public.gbp_store_credentials'));
    expect(fn).toContain("v_row.status = 'disconnected'");
  });

  it('abandoned attempts are ended server-side as disconnected (database clears credentials)', () => {
    expect(src('src/features/reality-engine/engine.ts')).not.toContain('resetGBPStatus');
    const recover = src('supabase/functions/gbp-recover-attempt/handler.ts');
    expect(recover).toContain('{ status: "disconnected", code: "ATTEMPT_EXPIRED" }');
    expect(recover).toMatch(/next = row\.status === "connecting" \? \{ status: "disconnected"/);
  });
});

describe('A3.4.1 token refresh helper', () => {
  it('reuses a valid access token without calling Google', async () => {
    const f = tokenFetch(200, {});
    const m = memoryStore({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: new Date(NOW + 3600_000).toISOString() });
    const r = await ensureAccessToken(m.store, deps(f));
    expect(r).toEqual({ ok: true, accessToken: ACCESS, refreshed: false });
    expect(f).not.toHaveBeenCalled();
    expect(m.writes).toHaveLength(0);
  });

  it('refreshes an expired or soon-expiring token and persists it', async () => {
    for (const expiresAt of [new Date(NOW - 1).toISOString(), new Date(NOW + 30_000).toISOString(), null]) {
      const f = tokenFetch(200, { access_token: 'ya29.NEW', expires_in: 3599 });
      const m = memoryStore({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt });
      const r = await ensureAccessToken(m.store, deps(f));
      expect(r).toEqual({ ok: true, accessToken: 'ya29.NEW', refreshed: true });
      expect(m.current()?.expiresAt).toBe(new Date(NOW + 3599_000).toISOString());
      const body = String((f.mock.calls[0] as unknown[])[1] && ((f.mock.calls[0] as unknown[])[1] as RequestInit).body);
      expect(body).toContain('grant_type=refresh_token');
    }
  });

  it('keeps the existing refresh token when Google returns none', async () => {
    const m = memoryStore({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: null });
    await ensureAccessToken(m.store, deps(tokenFetch(200, { access_token: 'ya29.NEW', expires_in: 3600 })));
    expect(m.writes[0].refresh).toBeNull();
    expect(m.current()?.refreshToken).toBe(REFRESH);
  });

  it('stores a rotated refresh token when Google sends one', async () => {
    const m = memoryStore({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: null });
    await ensureAccessToken(m.store, deps(tokenFetch(200, { access_token: 'ya29.NEW', refresh_token: '1//ROTATED' })));
    expect(m.current()?.refreshToken).toBe('1//ROTATED');
  });

  it('an invalid refresh token gives a controlled GBP_AUTH_EXPIRED error', async () => {
    const m = memoryStore({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: null });
    const r = await ensureAccessToken(m.store, deps(tokenFetch(400, { error: 'invalid_grant', error_description: REFRESH })));
    expect(r).toEqual({ ok: false, code: 'GBP_AUTH_EXPIRED', retryable: false });
    expect(JSON.stringify(r)).not.toContain(REFRESH);
    expect(m.writes).toHaveLength(0);
  });

  it('maps quota, outage and network failures', async () => {
    expect(mapTokenEndpointError(429, '')).toMatchObject({ code: 'GBP_QUOTA_EXCEEDED', retryable: true });
    expect(mapTokenEndpointError(503, '')).toMatchObject({ code: 'GBP_API_UNAVAILABLE', retryable: true });
    const m = memoryStore({ accessToken: null, refreshToken: REFRESH, expiresAt: null });
    const boom = vi.fn(async () => { throw new Error(REFRESH); });
    expect(await ensureAccessToken(m.store, deps(boom))).toMatchObject({ code: 'GBP_API_UNAVAILABLE' });
  });

  it('missing connection, missing refresh token and missing config are distinct', async () => {
    const f = tokenFetch(200, {});
    expect(await ensureAccessToken(memoryStore(null).store, deps(f))).toMatchObject({ code: 'NOT_CONNECTED' });
    expect(await ensureAccessToken(memoryStore({ accessToken: ACCESS, refreshToken: null, expiresAt: null }).store, deps(f)))
      .toMatchObject({ code: 'GBP_AUTH_EXPIRED' });
    expect(await ensureAccessToken(memoryStore({ accessToken: null, refreshToken: REFRESH, expiresAt: null }).store, { ...deps(f), clientSecret: undefined }))
      .toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(f).not.toHaveBeenCalled();
  });

  it('revocation posts the token to Google and reports failures without throwing', async () => {
    const ok = tokenFetch(200, {});
    expect(await revokeGoogleToken(REFRESH, ok as unknown as typeof fetch)).toBe(true);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toBe('https://oauth2.googleapis.com/revoke');
    expect(await revokeGoogleToken(REFRESH, tokenFetch(400, 'bad') as unknown as typeof fetch)).toBe(false);
    expect(await revokeGoogleToken(REFRESH, vi.fn(async () => { throw new Error('x'); }) as unknown as typeof fetch)).toBe(false);
    expect(await revokeGoogleToken(null, ok as unknown as typeof fetch)).toBe(false);
  });
});

describe('A3.4.1 gbp-disconnect', () => {
  function setup(opts: { userId?: string | null; resolve?: ResolveResult; revokeStatus?: number | 'throw'; removeOk?: boolean } = {}) {
    const removed: string[] = [];
    const resolveCalls: [string, string | null][] = [];
    const fetchMock = vi.fn(async () => {
      if (opts.revokeStatus === 'throw') throw new Error('network');
      return new Response('{}', { status: opts.revokeStatus ?? 200 });
    });
    const d: DisconnectDeps = {
      getUserId: async () => (opts.userId === undefined ? 'user-a' : opts.userId),
      resolveSource: async (u, b) => {
        resolveCalls.push([u, b]);
        return opts.resolve ?? { kind: 'found', sourceId: 'src-a' };
      },
      credentials: () => ({ read: async () => ({ accessToken: ACCESS, refreshToken: REFRESH, expiresAt: null }), write: async () => true }),
      removeSource: async (_u, s) => {
        removed.push(s);
        return opts.removeOk ?? true;
      },
      fetch: fetchMock as unknown as typeof fetch,
    };
    return { handle: createDisconnect(d), removed, resolveCalls, fetchMock };
  }
  const req = (body: unknown = {}, auth = 'Bearer jwt') =>
    new Request('https://x/functions/v1/gbp-disconnect', {
      method: 'POST',
      headers: auth ? { Authorization: auth } : {},
      body: JSON.stringify(body),
    });

  it('requires a valid JWT', async () => {
    const s = setup({ userId: null });
    const r = await s.handle(req());
    expect(r.status).toBe(401);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(s.removed).toHaveLength(0);
  });

  it('revokes the refresh token at Google and clears credentials', async () => {
    const s = setup();
    const r = await s.handle(req());
    const text = await r.text();
    expect(JSON.parse(text)).toEqual({ success: true, revoked: true, removed: true });
    expect(String((s.fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://oauth2.googleapis.com/revoke');
    expect(String(((s.fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body)).toContain(encodeURIComponent(REFRESH));
    expect(s.removed).toEqual(['src-a']);
    expect(text).not.toContain(REFRESH);
    expect(text).not.toContain(ACCESS);
  });

  it('still clears credentials locally when revocation fails', async () => {
    for (const revokeStatus of [400, 503, 'throw'] as const) {
      const s = setup({ revokeStatus });
      const r = await s.handle(req());
      expect(await r.json()).toEqual({ success: true, revoked: false, removed: true });
      expect(s.removed).toEqual(['src-a']);
    }
  });

  it('resolves the source from the JWT user, never from a client user_id', async () => {
    const s = setup();
    await s.handle(req({ user_id: 'user-b', businessId: 'biz-a' }));
    expect(s.resolveCalls).toEqual([['user-a', 'biz-a']]);
  });

  it("refuses another user's business and touches nothing", async () => {
    const s = setup({ resolve: { kind: 'forbidden' } });
    const r = await s.handle(req({ businessId: 'biz-b' }));
    expect(r.status).toBe(403);
    expect(s.removed).toHaveLength(0);
    expect(s.fetchMock).not.toHaveBeenCalled();
  });

  it('is a no-op success when nothing is connected', async () => {
    const s = setup({ resolve: { kind: 'none' } });
    expect(await (await s.handle(req())).json()).toEqual({ success: true, revoked: false, removed: false });
  });

  it('reports a failure if credentials could not be cleared', async () => {
    const s = setup({ removeOk: false });
    expect((await s.handle(req())).status).toBe(500);
  });

  it('server wiring clears credentials, scopes by user and is JWT-protected', () => {
    const index = src('supabase/functions/gbp-disconnect/index.ts');
    expect(index).toContain('supabaseAdmin.auth.getUser(jwt)');
    expect(index).toContain('rpc("gbp_clear_credentials"');
    expect(index).toMatch(/\.from\("businesses"\)\s*\.select\("id"\)\s*\.eq\("user_id", userId\)/);
    expect(index).toMatch(/\.delete\(\)\s*\.eq\("id", sourceId\)\s*\.eq\("user_id", userId\)/);
    expect(src('supabase/config.toml')).toMatch(/\[functions\.gbp-disconnect\]\s*verify_jwt = true/);
  });

  it('the Fuentes disconnect for Google goes through the server', () => {
    const engine = src('src/features/reality-engine/engine.ts');
    const fn = engine.slice(engine.indexOf('export async function disconnectSource'), engine.indexOf('// ─── Google Business Profile (OAuth)'));
    expect(fn).toContain("invokeEdge('gbp-disconnect'");
    expect(fn).toMatch(/sourceType === 'google_business'/);
  });
});

describe('A3.4.1 shared helper, isolation and secrecy', () => {
  it('token helper copies are byte-identical', () => {
    const a = src('supabase/functions/gbp-sync/gbpToken.ts');
    expect(src('supabase/functions/gbp-list-locations/gbpToken.ts')).toBe(a);
    expect(src('supabase/functions/gbp-disconnect/gbpToken.ts')).toBe(a);
    // A3.4.2: gbp-reviews ships its own copy of the shared helper.
    expect(src('supabase/functions/gbp-reviews/gbpToken.ts')).toBe(a);
  });

  it('gbp-sync and gbp-list-locations refresh through the shared helper and Vault', () => {
    const sync = src('supabase/functions/gbp-sync/index.ts');
    expect(sync).toContain('credentials: (sourceId) => vaultCredentialStore(supabaseAdmin, sourceId)');
    expect(src('supabase/functions/gbp-sync/handler.ts')).toContain('ensureAccessToken(deps.credentials(sourceId)');
    expect(sync).not.toContain('access_token_encrypted');
    expect(src('supabase/functions/gbp-list-locations/handler.ts')).toContain('ensureAccessToken(deps.credentials(source.id)');
    expect(src('supabase/functions/gbp-list-locations/index.ts')).toContain('vaultCredentialStore(supabaseAdmin, sourceId)');
  });

  it('server functions read and write tokens only via Vault RPCs', () => {
    for (const f of ['gbp-sync/index.ts', 'gbp-list-locations/index.ts', 'gbp-disconnect/index.ts', 'gbp-oauth-callback/index.ts', 'gbp-reviews/index.ts', 'gbp-reviews/handler.ts']) {
      expect(src(`supabase/functions/${f}`)).not.toMatch(/token_encrypted/);
    }
  });

  it('the callback keeps the stored refresh token when Google omits it', () => {
    const cb = src('supabase/functions/gbp-oauth-callback/index.ts');
    expect(cb).toContain('rpc("gbp_store_credentials"');
    expect(cb).toContain('p_refresh_token: tokens.refreshToken');
    expect(src('supabase/functions/gbp-oauth-callback/handler.ts'))
      .toMatch(/refreshToken: typeof tokens\.refresh_token === "string" && tokens\.refresh_token \? tokens\.refresh_token : null/);
  });

  it('every GBP lookup is scoped by the JWT user, never a client user_id', () => {
    for (const f of ['gbp-sync/index.ts', 'gbp-list-locations/index.ts', 'gbp-disconnect/index.ts']) {
      const code = src(`supabase/functions/${f}`);
      expect(code).toMatch(/auth\.getUser\(jwt\)/);
      expect(code).not.toMatch(/body\.user_id|\buser_id\b\s*}\s*=\s*await req\.json/);
    }
  });

  it('no GBP log line can carry tokens, codes or secrets', () => {
    const files = [
      'gbp-sync/index.ts', 'gbp-sync/gbpToken.ts', 'gbp-list-locations/handler.ts', 'gbp-list-locations/index.ts',
      'gbp-disconnect/index.ts', 'gbp-disconnect/handler.ts', 'gbp-oauth-callback/index.ts',
    ];
    for (const f of files) {
      const logs = src(`supabase/functions/${f}`).match(/console\.(log|error|warn|info)\([^;]*\);/g) ?? [];
      for (const line of logs) expect(line).not.toMatch(/tokens\.|accessToken|refreshToken|_token|(?<![.\w])code\b|clientSecret|client_secret|\bbody\b|\.text\(\)|creds/i);
    }
  });

  it('the frontend never touches token columns or Vault functions', () => {
    const engine = src('src/features/reality-engine/engine.ts');
    const repo = src('src/features/reality-engine/repositories.ts');
    expect(engine + repo).not.toMatch(/token_encrypted|gbp_read_credentials|gbp_store_credentials|vault/);
  });
});
