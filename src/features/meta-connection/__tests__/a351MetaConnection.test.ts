import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler as createStart, META_SCOPES } from '../../../../supabase/functions/meta-oauth-start/handler.ts';
import { createHandler as createCallback, type Authorization } from '../../../../supabase/functions/meta-oauth-callback/handler.ts';
import { createHandler as createConnection, type Connection, type PageSelection } from '../../../../supabase/functions/meta-connection/handler.ts';
import { metaView, metaErrorMessage, instagramLabel, META_COPY, INSTAGRAM_OUTCOME, type MetaConnectionRow } from '../metaStatus';
import { readCallbackParams } from '../MetaCallbackPage';
import { urlCarriesAuthTokens } from '../../../lib/pixel';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const hex = (s: string) => createHash('sha256').update(s).digest('hex');

const MIGRATION = read('supabase/migrations/20261021191223_a351_meta_connection_foundation.sql');
const SECRET = 'app-secret-value-XYZ';
const LONG_TOKEN = 'EAAlongLivedUserToken123';
const SHORT_TOKEN = 'EAAshortToken456';
const ENV: Record<string, string> = {
  META_APP_ID: '1234567890',
  META_APP_SECRET: SECRET,
  META_REDIRECT_URI: 'https://example.supabase.co/functions/v1/meta-oauth-callback',
  SITE_URL: 'https://localseohub.io',
};
const STATE = 'a'.repeat(64);
const COMPLETION = 'c'.repeat(64);
const BINDING = 'b'.repeat(64);

function logSpies() {
  return [
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'info').mockImplementation(() => undefined),
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
  ];
}
const loggedText = (spies: ReturnType<typeof logSpies>) =>
  spies.flatMap((s) => s.mock.calls.flat()).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');

afterEach(() => vi.restoreAllMocks());

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ── start ──────────────────────────────────────────────────────────────────

function startDeps(over: Partial<Parameters<typeof createStart>[0]> = {}) {
  const begin = vi.fn(async () => 'conn-1');
  const deps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'good' ? 'user-1' : null)),
    getOwnBusinessId: vi.fn(async () => 'biz-1'),
    beginAttempt: begin,
    env: (n: string) => ENV[n],
    ...over,
  };
  return { deps, begin, handle: createStart(deps) };
}
const startReq = (jwt = 'good') => new Request('https://x/meta-oauth-start', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: '{}' });

// ── callback ───────────────────────────────────────────────────────────────

type Graph = (url: string, init?: RequestInit) => Response;

function graphFetch(over: Partial<Record<'short' | 'long' | 'me' | 'perms' | 'accounts', Response>> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl: Graph = (url) => {
    if (url.includes('fb_exchange_token')) return over.long ?? jsonRes({ access_token: LONG_TOKEN, expires_in: 5184000 });
    if (url.includes('/oauth/access_token')) return over.short ?? jsonRes({ access_token: SHORT_TOKEN });
    if (url.includes('/me/permissions')) return over.perms ?? jsonRes({ data: ['pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic'].map((permission) => ({ permission, status: 'granted' })) });
    if (url.includes('/me/accounts')) return over.accounts ?? jsonRes({ data: [{ id: '111', name: 'Panadería Sol' }, { id: '222', name: 'Otra' }] });
    if (url.includes('/me?')) return over.me ?? jsonRes({ id: '999' });
    return jsonRes({ error: { code: 1 } }, 500);
  };
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return impl(String(url), init);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

function callbackDeps(consume: { result: 'unknown' | 'consumed' | 'stale' | 'expired' | 'ok'; connectionId: string | null } = { result: 'ok', connectionId: 'conn-1' }, fetchOver = {}) {
  const g = graphFetch(fetchOver);
  const fail = vi.fn(async () => undefined);
  const stored: Authorization[] = [];
  const consumeState = vi.fn(async () => consume);
  const deps = {
    consumeState,
    failConnection: fail,
    storeAuthorization: vi.fn(async (a: Authorization) => { stored.push(a); return true; }),
    env: (n: string) => ENV[n],
    fetch: g.fetchFn,
    randomToken: () => COMPLETION,
  };
  return { handle: createCallback(deps), fail, stored, calls: g.calls, consumeState };
}
const cbReq = (q: string) => new Request(`https://x/meta-oauth-callback?${q}`);
const location = (res: Response) => res.headers.get('Location') ?? '';

// ── connection ─────────────────────────────────────────────────────────────

const twoPages = [{ id: '111', name: 'Panadería Sol' }, { id: '222', name: 'Otra' }];

function connDeps(opts: {
  conn?: Connection | null;
  complete?: { result: 'unknown' | 'wrong_user' | 'binding_mismatch' | 'expired' | 'stale' | 'ok'; pageCount: number };
  token?: string | null;
  graph?: (url: string, init?: RequestInit) => Response;
  now?: Date;
  env?: Record<string, string>;
  liveState?: boolean;
} = {}) {
  let conn: Connection | null = opts.conn === undefined
    ? { id: 'conn-1', status: 'page_selection_required', availablePages: twoPages, attemptStartedAt: new Date().toISOString(), tokenExpiresAt: null }
    : opts.conn;
  const selections: PageSelection[] = [];
  const fail = vi.fn(async () => undefined);
  const disconnect = vi.fn(async () => undefined);
  const inProgress = () => conn?.status === 'connecting' || conn?.status === 'authorized';
  const cancelAttempt = vi.fn(async () => {
    if (!conn || !inProgress()) return false;
    conn = { ...conn, status: 'disconnected' };
    return true;
  });
  const expireStaleAttempt = vi.fn(async (_id: string, staleBefore: string) => {
    if (!conn || !inProgress()) return false;
    const started = conn.attemptStartedAt ? Date.parse(conn.attemptStartedAt) : NaN;
    if (opts.liveState !== false && Number.isFinite(started) && started >= Date.parse(staleBefore)) return false;
    conn = { ...conn, status: 'error' };
    return true;
  });
  const completeAuthorization = vi.fn(async () => {
    const c = opts.complete ?? { result: 'ok' as const, pageCount: 2 };
    if (c.result === 'ok' && conn) conn = { ...conn, status: 'page_selection_required' };
    return c;
  });
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    (opts.graph ?? (() => jsonRes({ id: '111' })))(String(url), init));
  const env = opts.env ?? ENV;
  const deps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'good' ? 'user-1' : null)),
    getOwnConnection: vi.fn(async () => conn),
    completeAuthorization,
    readToken: vi.fn(async () => (opts.token === undefined ? LONG_TOKEN : opts.token)),
    finishPageSelection: vi.fn(async (s: PageSelection) => { selections.push(s); return true; }),
    failConnection: fail,
    cancelAttempt,
    expireStaleAttempt,
    disconnect,
    env: (n: string) => env[n],
    fetch: fetchFn as unknown as typeof fetch,
    now: () => opts.now ?? new Date(),
  };
  return { handle: createConnection(deps), deps, selections, fail, disconnect, fetchFn, completeAuthorization, cancelAttempt, expireStaleAttempt };
}
const connReq = (body: unknown, jwt = 'good') =>
  new Request('https://x/meta-connection', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) });

// ═══════════════════════════════════════════════════════════════════════════

describe('A3.5.1 · A. isolated Meta connection model', () => {
  it('uses dedicated meta_ tables and functions, separate from GBP connected_sources', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.meta_connections/);
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.meta_oauth_states/);
    expect(MIGRATION.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/connected_sources/);
    for (const fn of ['meta-oauth-start', 'meta-oauth-callback', 'meta-connection']) {
      const code = read(`supabase/functions/${fn}/handler.ts`) + read(`supabase/functions/${fn}/index.ts`);
      expect(code).not.toMatch(/connected_sources|gbp_|GOOGLE_/);
    }
  });
  it('is independent of the Meta Pixel and advertising consent', () => {
    const dir = 'src/features/meta-connection';
    const ui = readdirSync(join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => read(`${dir}/${f}`)).join('\n');
    expect(ui).not.toMatch(/consent|pixel|fbq/i);
  });
  it('declares the full lifecycle in the database check constraint', () => {
    for (const s of ['disconnected', 'connecting', 'authorized', 'page_selection_required', 'connected', 'error', 'reauth_required']) {
      expect(MIGRATION).toContain(`'${s}'`);
    }
  });
});

describe('A3.5.1 · B/C. start: configuration and authentication', () => {
  it('B. fails truthfully with META_APP_NOT_CONFIGURED when any Meta secret is missing', async () => {
    for (const missing of ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI']) {
      const { handle, begin } = startDeps({ env: (n: string) => (n === missing ? undefined : ENV[n]) });
      const res = await handle(startReq());
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('META_APP_NOT_CONFIGURED');
      expect(begin).not.toHaveBeenCalled();
    }
  });
  it('C. rejects unauthenticated callers', async () => {
    const { handle, begin } = startDeps();
    expect((await handle(startReq('bad'))).status).toBe(401);
    expect(begin).not.toHaveBeenCalled();
  });
  it('C. refuses when the caller owns no business', async () => {
    const { handle } = startDeps({ getOwnBusinessId: vi.fn(async () => null) });
    expect((await handle(startReq())).status).toBe(400);
  });
});

describe('A3.5.1 · D. start: server-generated state', () => {
  it('stores only hashes of an unpredictable state and binding, with an expiry', async () => {
    const { handle, begin } = startDeps();
    const res = await handle(startReq());
    const body = await res.json();
    const url = new URL(body.url);
    const state = url.searchParams.get('state')!;
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(body.binding).toMatch(/^[a-f0-9]{64}$/);
    expect(body.binding).not.toBe(state);
    const arg = (begin.mock.calls[0] as unknown[])[0] as { stateHash: string; bindingHash: string; expiresAt: string; userId: string };
    expect(arg.userId).toBe('user-1');
    expect(arg.stateHash).toBe(hex(state));
    expect(arg.bindingHash).toBe(hex(body.binding));
    const ttl = Date.parse(arg.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(5 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000);
  });
  it('requests only the minimal read-only scopes and never exposes the app secret', async () => {
    const { handle } = startDeps();
    const body = await (await handle(startReq())).json();
    const url = new URL(body.url);
    expect(url.origin).toBe('https://www.facebook.com');
    expect(url.searchParams.get('scope')).toBe('pages_show_list,pages_read_engagement,business_management,instagram_basic');
    expect(META_SCOPES).toEqual(['pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic']);
    expect(body.url).not.toMatch(/publish|pages_manage|ads_|instagram_manage|instagram_content/);
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });
  it('two attempts produce different states', async () => {
    const a = await (await startDeps().handle(startReq())).json();
    const b = await (await startDeps().handle(startReq())).json();
    expect(new URL(a.url).searchParams.get('state')).not.toBe(new URL(b.url).searchParams.get('state'));
  });
});

describe('A3.5.1 · E/F. callback: state validation', () => {
  it('E. rejects missing or malformed state without touching any connection', async () => {
    for (const q of ['code=abc', 'state=short&code=abc', `state=${'Z'.repeat(64)}&code=abc`]) {
      const { handle, fail, consumeState } = callbackDeps();
      const res = await handle(cbReq(q));
      expect(res.status).toBe(302);
      expect(location(res)).toBe('https://localseohub.io/oauth/meta/callback?error=OAUTH_STATE_INVALID');
      expect(consumeState).not.toHaveBeenCalled();
      expect(fail).not.toHaveBeenCalled();
    }
  });
  it('F. rejects unknown, reused and wrong-user (stale) states and leaves the live attempt alone', async () => {
    for (const result of ['unknown', 'consumed', 'stale'] as const) {
      const { handle, fail, stored } = callbackDeps({ result, connectionId: null });
      const res = await handle(cbReq(`state=${STATE}&code=abc`));
      expect(location(res)).toContain('error=OAUTH_STATE_INVALID');
      expect(fail).not.toHaveBeenCalled();
      expect(stored).toHaveLength(0);
    }
  });
  it('F. an expired state fails the attempt with OAUTH_STATE_EXPIRED', async () => {
    const { handle, fail, calls } = callbackDeps({ result: 'expired', connectionId: 'conn-1' });
    const res = await handle(cbReq(`state=${STATE}&code=abc`));
    expect(location(res)).toContain('error=OAUTH_STATE_EXPIRED');
    expect(fail).toHaveBeenCalledWith('conn-1', 'error', 'OAUTH_STATE_EXPIRED');
    expect(calls).toHaveLength(0);
  });
  it('F. the state is consumed by its hash, never the raw value', async () => {
    const { handle, consumeState } = callbackDeps();
    await handle(cbReq(`state=${STATE}&code=abc`));
    expect(consumeState).toHaveBeenCalledWith(hex(STATE));
  });
  it('F. the database consumes a state once and binds it to its user', () => {
    expect(MIGRATION).toMatch(/consumed_at IS NOT NULL THEN\s+RETURN QUERY SELECT 'consumed'/);
    expect(MIGRATION).toMatch(/v_conn\.user_id <> v_state\.user_id/);
    expect(MIGRATION).toMatch(/state_hash text NOT NULL UNIQUE|state_hash\s+text\s+NOT NULL\s+UNIQUE/);
  });
});

describe('A3.5.1 · G/H. callback: denial, missing code, exchange failures', () => {
  it('G. user denial ends as disconnected with OAUTH_DENIED', async () => {
    const { handle, fail, calls } = callbackDeps();
    const res = await handle(cbReq(`state=${STATE}&error=access_denied&error_reason=user_denied`));
    expect(location(res)).toContain('error=OAUTH_DENIED');
    expect(fail).toHaveBeenCalledWith('conn-1', 'disconnected', 'OAUTH_DENIED');
    expect(calls).toHaveLength(0);
  });
  it('G. a missing code fails the attempt', async () => {
    const { handle, fail } = callbackDeps();
    const res = await handle(cbReq(`state=${STATE}`));
    expect(location(res)).toContain('error=TOKEN_EXCHANGE_FAILED');
    expect(fail).toHaveBeenCalledWith('conn-1', 'error', 'TOKEN_EXCHANGE_FAILED');
  });
  it('G. a non-GET request is rejected', async () => {
    const { handle } = callbackDeps();
    const res = await handle(new Request(`https://x/cb?state=${STATE}&code=a`, { method: 'POST' }));
    expect(location(res)).toContain('error=OAUTH_STATE_INVALID');
  });
  it('H. a failed token exchange is reported without leaking secrets', async () => {
    const spies = logSpies();
    const { handle, fail, stored } = callbackDeps(undefined, { short: jsonRes({ error: { message: 'bad code' } }, 400) });
    const res = await handle(cbReq(`state=${STATE}&code=the-auth-code`));
    expect(location(res)).toContain('error=TOKEN_EXCHANGE_FAILED');
    expect(fail).toHaveBeenCalledWith('conn-1', 'error', 'TOKEN_EXCHANGE_FAILED');
    expect(stored).toHaveLength(0);
    const logs = loggedText(spies);
    expect(logs).not.toContain(SECRET);
    expect(logs).not.toContain('the-auth-code');
  });
  it('H. a failed long-lived exchange is also TOKEN_EXCHANGE_FAILED', async () => {
    const { handle } = callbackDeps(undefined, { long: jsonRes({}, 500) });
    expect(location(await handle(cbReq(`state=${STATE}&code=c`)))).toContain('error=TOKEN_EXCHANGE_FAILED');
  });
  it('H. missing Meta secrets after a valid state fail as META_APP_NOT_CONFIGURED', async () => {
    const d = callbackDeps();
    const handle = createCallback({ consumeState: d.consumeState, failConnection: d.fail, storeAuthorization: vi.fn(), env: (n: string) => (n === 'SITE_URL' ? ENV.SITE_URL : undefined) });
    const res = await handle(cbReq(`state=${STATE}&code=c`));
    expect(location(res)).toContain('error=META_APP_NOT_CONFIGURED');
    expect(d.fail).toHaveBeenCalledWith('conn-1', 'error', 'META_APP_NOT_CONFIGURED');
  });
});

describe('A3.5.1 · I. page discovery outcomes', () => {
  const run = async (over: Record<string, Response>) => {
    const d = callbackDeps(undefined, over);
    const res = await d.handle(cbReq(`state=${STATE}&code=c`));
    return { loc: location(res), ...d };
  };
  it('NO_AUTHORIZED_PAGES when the user manages no Page', async () => {
    const r = await run({ accounts: jsonRes({ data: [] }) });
    expect(r.loc).toContain('error=NO_AUTHORIZED_PAGES');
    expect(r.stored).toHaveLength(0);
    expect(r.fail).toHaveBeenCalledWith('conn-1', 'error', 'NO_AUTHORIZED_PAGES');
  });
  it('META_PERMISSION_UNAVAILABLE when pages_show_list was declined', async () => {
    const r = await run({ perms: jsonRes({ data: [{ permission: 'pages_show_list', status: 'declined' }] }) });
    expect(r.loc).toContain('error=META_PERMISSION_UNAVAILABLE');
  });
  it('META_PERMISSION_UNAVAILABLE on Graph permission errors', async () => {
    const r = await run({ accounts: jsonRes({ error: { code: 200 } }, 403) });
    expect(r.loc).toContain('error=META_PERMISSION_UNAVAILABLE');
  });
  it('META_API_RATE_LIMIT on throttling', async () => {
    const r = await run({ accounts: jsonRes({ error: { code: 4 } }, 400) });
    expect(r.loc).toContain('error=META_API_RATE_LIMIT');
  });
  it('PAGE_DISCOVERY_FAILED on other Graph errors', async () => {
    const r = await run({ accounts: jsonRes({ error: { code: 1 } }, 500) });
    expect(r.loc).toContain('error=PAGE_DISCOVERY_FAILED');
  });
});

describe('A3.5.1 · J. successful authorization keeps credentials server-side', () => {
  it('stores the long-lived token server-side and redirects with only a one-time completion fragment', async () => {
    const spies = logSpies();
    const { handle, stored, calls } = callbackDeps();
    const res = await handle(cbReq(`state=${STATE}&code=c`));
    const loc = location(res);
    expect(loc).toBe(`https://localseohub.io/oauth/meta/callback#token=${COMPLETION}`);
    expect(loc).not.toContain(LONG_TOKEN);
    expect(loc).not.toContain(SHORT_TOKEN);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(stored).toHaveLength(1);
    expect(stored[0].accessToken).toBe(LONG_TOKEN);
    expect(stored[0].completionHash).toBe(hex(COMPLETION));
    expect(stored[0].stateHash).toBe(hex(STATE));
    expect(stored[0].pages).toEqual(twoPages);
    expect(stored[0].permissions).toEqual(['pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic']);
    const logs = loggedText(spies);
    expect(logs).not.toContain(LONG_TOKEN);
    expect(logs).not.toContain(SECRET);
    for (const c of calls.filter((c) => !c.url.includes('/oauth/access_token'))) {
      expect(c.url).not.toContain(LONG_TOKEN);
      expect(c.url).toMatch(/appsecret_proof=[a-f0-9]{64}/);
      expect((c.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${LONG_TOKEN}`);
    }
  });
  it('the completion fragment is suppressed by the existing Pixel URL guard', () => {
    expect(urlCarriesAuthTokens(`#token=${COMPLETION}`)).toBe(true);
  });
  it('tokens are stored in Vault, never as plaintext columns', () => {
    expect(MIGRATION).toMatch(/vault\.create_secret/);
    expect(MIGRATION).toMatch(/user_token_ref = public\.meta_vault_put\(NULL, p_access_token\)/);
    const table = MIGRATION.match(/CREATE TABLE IF NOT EXISTS public\.meta_connections \(([\s\S]*?)\n\);/)![1];
    expect(table).not.toMatch(/access_token|refresh_token/);
    expect(table).toMatch(/user_token_ref text/);
  });
});

describe('A3.5.1 · K. completion binds the authorization to the starting browser session', () => {
  it('rejects malformed input', async () => {
    const { handle, completeAuthorization } = connDeps();
    const res = await handle(connReq({ action: 'complete', completion: 'x', binding: BINDING }));
    expect(res.status).toBe(400);
    expect(completeAuthorization).not.toHaveBeenCalled();
  });
  it('rejects wrong user and wrong binding with 403', async () => {
    for (const result of ['wrong_user', 'binding_mismatch'] as const) {
      const { handle } = connDeps({ complete: { result, pageCount: 0 } });
      const res = await handle(connReq({ action: 'complete', completion: COMPLETION, binding: BINDING }));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('OAUTH_STATE_INVALID');
    }
  });
  it('reports an expired completion', async () => {
    const { handle } = connDeps({ complete: { result: 'expired', pageCount: 0 } });
    const res = await handle(connReq({ action: 'complete', completion: COMPLETION, binding: BINDING }));
    expect((await res.json()).code).toBe('OAUTH_STATE_EXPIRED');
  });
  it('passes only hashes to the database', async () => {
    const { handle, completeAuthorization } = connDeps();
    await handle(connReq({ action: 'complete', completion: COMPLETION, binding: BINDING }));
    expect(completeAuthorization).toHaveBeenCalledWith('user-1', hex(COMPLETION), hex(BINDING));
  });
  it('several Pages require explicit selection', async () => {
    const { handle, selections } = connDeps();
    const body = await (await handle(connReq({ action: 'complete', completion: COMPLETION, binding: BINDING }))).json();
    expect(body.status).toBe('page_selection_required');
    expect(selections).toHaveLength(0);
  });
  it('exactly one Page is auto-selected', async () => {
    const { handle, selections } = connDeps({
      conn: { id: 'conn-1', status: 'authorized', availablePages: [twoPages[0]], attemptStartedAt: null, tokenExpiresAt: null },
      complete: { result: 'ok', pageCount: 1 },
      graph: () => jsonRes({ id: '111' }),
    });
    const body = await (await handle(connReq({ action: 'complete', completion: COMPLETION, binding: BINDING }))).json();
    expect(body.status).toBe('connected');
    expect(selections[0].pageId).toBe('111');
  });
  it('the database fails the attempt and wipes credentials on a wrong-user completion', () => {
    expect(MIGRATION).toMatch(/v_state\.user_id <> p_user_id THEN\s+PERFORM public\.meta_fail_connection\(v_state\.connection_id, 'error', 'SESSION_MISMATCH'\)/);
    expect(MIGRATION).toMatch(/user_token_ref := NULL/);
  });
  it('rejects unauthenticated callers', async () => {
    const { handle } = connDeps();
    expect((await handle(connReq({ action: 'recover' }, 'bad'))).status).toBe(401);
  });
});

describe('A3.5.1 · L. page selection is server-validated', () => {
  it('rejects a Page that was not authorized, without calling Meta', async () => {
    const { handle, fetchFn, selections } = connDeps();
    const res = await handle(connReq({ action: 'select_page', pageId: '333' }));
    expect(res.status).toBe(403);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(selections).toHaveLength(0);
  });
  it('rejects selection when nothing is pending', async () => {
    const { handle } = connDeps({ conn: { id: 'conn-1', status: 'connected', availablePages: [], attemptStartedAt: null, tokenExpiresAt: null } });
    expect((await handle(connReq({ action: 'select_page', pageId: '111' }))).status).toBe(409);
  });
  it('rejects malformed page ids', async () => {
    const { handle } = connDeps();
    expect((await handle(connReq({ action: 'select_page', pageId: '../me' }))).status).toBe(400);
  });
  it('uses the server-verified Page name, not one supplied by the browser', async () => {
    const { handle, selections } = connDeps();
    await handle(connReq({ action: 'select_page', pageId: '222', pageName: 'Injected' }));
    expect(selections[0].pageName).toBe('Otra');
  });
  it('the browser cannot mark a connection connected: no write policies or write grants', () => {
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect((MIGRATION.match(/CREATE POLICY/g) ?? []).length).toBe(1);
    expect(MIGRATION).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO (anon|authenticated)/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON public\.meta_connections FROM anon, authenticated/);
  });
});

describe('A3.5.1 · M. Instagram association outcomes', () => {
  const select = async (graph: (url: string) => Response) => {
    const d = connDeps({ graph });
    const res = await d.handle(connReq({ action: 'select_page', pageId: '111' }));
    return { res, ...d };
  };
  it('INSTAGRAM_CONNECTED', async () => {
    const { selections } = await select((u) => (u.includes('/111?') ? jsonRes({ instagram_business_account: { id: '178' } }) : jsonRes({ id: '178', username: 'panaderiasol' })));
    expect(selections[0]).toMatchObject({ instagramStatus: 'connected', instagramId: '178', instagramUsername: 'panaderiasol' });
  });
  it('NO_INSTAGRAM_ACCOUNT_ASSOCIATED', async () => {
    const { selections } = await select(() => jsonRes({ id: '111' }));
    expect(selections[0].instagramStatus).toBe('not_associated');
  });
  it('INSTAGRAM_NOT_PROFESSIONAL_OR_UNSUPPORTED', async () => {
    const { selections } = await select((u) => (u.includes('/111?') ? jsonRes({ instagram_business_account: { id: '178' } }) : jsonRes({ error: { code: 100 } }, 400)));
    expect(selections[0]).toMatchObject({ instagramStatus: 'unsupported', instagramId: null });
  });
  it('INSTAGRAM_PERMISSION_UNAVAILABLE', async () => {
    const { selections } = await select(() => jsonRes({ error: { code: 10 } }, 403));
    expect(selections[0].instagramStatus).toBe('permission_unavailable');
  });
  it('INSTAGRAM_API_ERROR', async () => {
    const { selections } = await select(() => jsonRes({ error: { code: 1 } }, 500));
    expect(selections[0].instagramStatus).toBe('api_error');
  });
  it('an invalid token moves the connection to reauth_required', async () => {
    const { res, fail, selections } = await select(() => jsonRes({ error: { code: 190 } }, 400));
    expect(res.status).toBe(401);
    expect(fail).toHaveBeenCalledWith('conn-1', 'reauth_required', 'REAUTH_REQUIRED');
    expect(selections).toHaveLength(0);
  });
  it('rate limiting leaves the selection pending', async () => {
    const { res, selections } = await select(() => jsonRes({ error: { code: 17 } }, 400));
    expect(res.status).toBe(429);
    expect(selections).toHaveLength(0);
  });
  it('outcome codes map one-to-one', () => {
    expect(Object.values(INSTAGRAM_OUTCOME).sort()).toEqual([
      'INSTAGRAM_API_ERROR', 'INSTAGRAM_CONNECTED', 'INSTAGRAM_NOT_PROFESSIONAL_OR_UNSUPPORTED',
      'INSTAGRAM_PERMISSION_UNAVAILABLE', 'NO_INSTAGRAM_ACCOUNT_ASSOCIATED',
    ]);
  });
});

describe('A3.5.1 · N. server-owned disconnect', () => {
  const connected: Connection = { id: 'conn-1', status: 'connected', availablePages: [], attemptStartedAt: null, tokenExpiresAt: null };
  it('revokes at Meta and wipes locally', async () => {
    const { handle, disconnect, fetchFn } = connDeps({ conn: connected, graph: () => jsonRes({ success: true }) });
    const body = await (await handle(connReq({ action: 'disconnect' }))).json();
    expect(body.revocation).toBe('revoked');
    expect(disconnect).toHaveBeenCalledWith('conn-1', 'revoked');
    expect((fetchFn.mock.calls[0] as unknown[])[1]).toMatchObject({ method: 'DELETE' });
  });
  it('still disconnects locally when revocation fails', async () => {
    const { handle, disconnect } = connDeps({ conn: connected, graph: () => jsonRes({ error: { code: 1 } }, 500) });
    const res = await handle(connReq({ action: 'disconnect' }));
    expect(res.status).toBe(200);
    expect(disconnect).toHaveBeenCalledWith('conn-1', 'failed');
  });
  it('skips revocation when no credential is available', async () => {
    const { handle, disconnect, fetchFn } = connDeps({ conn: connected, token: null });
    await handle(connReq({ action: 'disconnect' }));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith('conn-1', 'skipped');
  });
  it('only acts on the caller\u2019s own connection and is idempotent', async () => {
    const { handle, disconnect, deps } = connDeps({ conn: null });
    const body = await (await handle(connReq({ action: 'disconnect', connectionId: 'someone-else' }))).json();
    expect(body.ok).toBe(true);
    expect(disconnect).not.toHaveBeenCalled();
    expect(deps.getOwnConnection).toHaveBeenCalledWith('user-1');
  });
  it('the database wipe trigger clears credentials whenever a connection is not active', () => {
    expect(MIGRATION).toMatch(/meta_connections_wipe_inactive/);
    expect(MIGRATION).toMatch(/meta_connections_forget_on_delete/);
  });
});

describe('A3.5.1 · O. no permanent CONNECTING state', () => {
  it('recover fails stale attempts', async () => {
    const { handle, expireStaleAttempt } = connDeps({ conn: { id: 'conn-1', status: 'connecting', availablePages: [], attemptStartedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), tokenExpiresAt: null } });
    const body = await (await handle(connReq({ action: 'recover' }))).json();
    expect(body.status).toBe('error');
    expect(expireStaleAttempt).toHaveBeenCalledWith('conn-1', expect.any(String));
  });
  it('recover leaves a fresh attempt alone', async () => {
    const { handle, fail, expireStaleAttempt } = connDeps({ conn: { id: 'conn-1', status: 'connecting', availablePages: [], attemptStartedAt: new Date().toISOString(), tokenExpiresAt: null } });
    expect((await (await handle(connReq({ action: 'recover' }))).json()).status).toBe('connecting');
    expect(expireStaleAttempt).toHaveBeenCalledTimes(1);
    expect(fail).not.toHaveBeenCalled();
  });
  it('recover marks an expired token as reauth_required', async () => {
    const { handle, fail } = connDeps({ conn: { id: 'conn-1', status: 'connected', availablePages: [], attemptStartedAt: null, tokenExpiresAt: new Date(Date.now() - 1000).toISOString() } });
    expect((await (await handle(connReq({ action: 'recover' }))).json()).status).toBe('reauth_required');
    expect(fail).toHaveBeenCalledWith('conn-1', 'reauth_required', 'REAUTH_REQUIRED');
  });
  it('the UI never shows a stale attempt as connecting', () => {
    const row: MetaConnectionRow = { status: 'connecting', page_id: null, page_name: null, instagram_status: null, instagram_username: null, available_pages: [], last_error: null, attempt_started_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(), connected_at: null };
    expect(metaView(row).kind).toBe('error');
    expect(metaView({ ...row, attempt_started_at: new Date().toISOString() }).kind).toBe('connecting');
    expect(metaView({ ...row, attempt_started_at: null }).kind).toBe('error');
  });
});

describe('A3.5.1 · P. GBP regression: frozen files', () => {
  const FROZEN: Record<string, string> = {
    'supabase/functions/gbp-oauth-start/handler.ts': '991438435abdc920e98fdf830215ed63227d8d2ce697c0ff6c3220bb260130b8',
    'supabase/functions/gbp-oauth-start/index.ts': '8cb979ce494a8ec281ec3b1035b0fa364853baf796b96a0e632ac413eb573464',
    'supabase/functions/gbp-oauth-callback/handler.ts': 'f1a97cb69a9fc33e8dd2da8ccaa99e74979bff474d9f17d6dbe6f07dc13a86a4',
    'supabase/functions/gbp-oauth-callback/index.ts': '90fc20c1f0ca22d56b991c1cd8b38c7c15125167cbae37051b9d4186bf827fae',
    'supabase/functions/gbp-disconnect/handler.ts': '45c1acbed37364c434b9369452d93282a809699b4a7d17bcd5fa535e35b0cf83',
    'supabase/functions/gbp-disconnect/index.ts': '7b28648afd40074e65a9db6d48fb417394981965ecf827edde829d507b9da948',
    'supabase/functions/gbp-sync/handler.ts': 'd0896d0e8a95eb5c56b9e65169323765c456c4b700d677f6144a531f63b407c6',
    'supabase/functions/gbp-sync/index.ts': 'fee680186b7550eeaf7903185f0a8ad6fc7866b65ff71f1ef1aa1ed9d4209ddf',
    'supabase/functions/gbp-recover-attempt/handler.ts': '879ec241a3605e9aa2355a92166f864f3206391c3ac7ffb5cb4111ce1b5cb660',
    'supabase/functions/gbp-recover-attempt/index.ts': '0126d8d56316b163295ee48cd2e43dcae495323f4b7444695a1e49f573b69461',
    'supabase/functions/gbp-list-locations/handler.ts': '222a8836ca24a5f4a7362d67ff36a78ed4789afde1a37e88fb2fa84743af5fc5',
    'supabase/functions/gbp-list-locations/index.ts': '20bc1c331614524766b5c578db31ee7049d3f9db1693af4803488a14c8bc1913',
    'supabase/functions/gbp-reviews/handler.ts': '415883be71ce38ffe72f44051f834af565babb7e27be1cc5afdc8f6ed4adfe3e',
    'supabase/functions/gbp-reviews/index.ts': '19222fb038e8f115f6aba173d96510986b9ea0744e614dd890bfecf6699792ac',
    'src/features/reality-engine/GBPCallbackPage.tsx': 'ec6e9ee8c6e66866b92580042a9e2b98e084d44c56403bee459ff10ef83a5d04',
    'src/features/reality-engine/gbpStatus.ts': '5db8b3c8f2b5bcfc68f9226c2c6642b23f8b5301290c55341d2651237a51e4e3',
    'src/features/reality-engine/engine.ts': '46205263e3a5216b8e2e8d4c454a8af74da95398e78ea260392491e48a91ce20',
    'src/features/reality-engine/SourceCard.tsx': 'a0535ea61b40845930935fcfefc699267aeb827dfc2d7b696e88d0fd0a9cf026',
    'src/features/reality-engine/registry.ts': '2186e0b5e36fa20dde9b80e7e00580331b10d47fc4d7f5ecbde022370a611b8f',
    'src/features/reality-engine/sourceStatus.ts': 'f5d9531241a2660ffa3322acdb9ce32d7247a4a906a7d47492125fb3f01bcbf0',
  };
  for (const [file, hash] of Object.entries(FROZEN)) {
    it(`${file} is byte-identical`, () => expect(sha(file)).toBe(hash));
  }
  it('the sources page keeps the GBP card flow and only adds the Meta card', () => {
    const sm = read('src/features/reality-engine/SourceManager.tsx');
    expect(sm).toMatch(/if \(entry\.id === 'google_business'\) handleGBPConnect\(\);/);
    expect(sm).toMatch(/isValidWebsite\(normalizedUrl\)/);
    expect(sm).toMatch(/<MetaConnectionCard businessId=\{businessId\} lang=\{lang\} \/>/);
  });
  it('GBP edge function config is unchanged and the Meta functions are declared', () => {
    const cfg = read('supabase/config.toml');
    expect(cfg).toMatch(/\[functions\.gbp-oauth-callback\]\nverify_jwt = false/);
    expect(cfg).toMatch(/\[functions\.meta-oauth-start\]\nverify_jwt = true/);
    expect(cfg).toMatch(/\[functions\.meta-oauth-callback\]\nverify_jwt = false/);
    expect(cfg).toMatch(/\[functions\.meta-connection\]\nverify_jwt = true/);
  });
});

describe('A3.5.1 · Q. Pixel, consent and legal regression', () => {
  const FROZEN: Record<string, string> = {
    'src/lib/pixel.ts': '5ee468b48878b198d926818620c2c608874ecede64be475048e89cf189131fca',
    'src/lib/consent.ts': 'b3f4f9b1c3b459174d846bc8d5385fa0dfe5c2fff435af2bca485ed5dcf825f4',
    'src/lib/clarity.ts': 'f79e1a351b1f0257e01eb2b8f3d80235b7357426a9a590e4bb2a12e0e7463fa4',
    'src/features/consent/applyConsent.ts': '14ef4ff9cb6f126badff95f46a3d171dc721f5d0fa413d4791c3a5ad102afb0a',
    'src/features/consent/ConsentProvider.tsx': '8400cdb5595e0b7c16fd83870392baed025ea58c43fd30298dd4c66f6110e276',
    'src/features/consent/ConsentBanner.tsx': 'cdba49993e0b57651f32d32c649fd2947e7b2158f189219d7289f3f574e86e20',
    'src/features/conversion/MetaPixelTracker.tsx': '3eaa425c5675920d0e174afad65a7e86be7c93617a18d24319572434e716667b',
    'src/main.tsx': '29616ccff5de6172aaf8a733d33979d9f7f7530e4710700c3c9bac58f3acbbd6',
    'index.html': '3685d485eca934fccb55486cd9a8470404078813d22cb8552a73d963aef5b649',
    'src/features/legal/PrivacyPolicyPage.tsx': 'b44eabfaf318c5ee00452bfc8fc874ea843c2af5bfbcc8dd60089aaf03783961',
    'src/features/legal/DataDeletionPage.tsx': '2ec986ce36728496da3afb29ed05ed3a32dddd35277cb8b7e8fa378e528361ef',
    'src/features/legal/TermsPage.tsx': '5b43eaa92827fad628049597d5e62e55f41dd55c9458b914dc27a3d6e6ed6564',
  };
  for (const [file, hash] of Object.entries(FROZEN)) {
    it(`${file} is byte-identical`, () => expect(sha(file)).toBe(hash));
  }
});

describe('A3.5.1 · R. RLS, /fuentes copy and the callback page', () => {
  it('RLS is on, the owner can only read their own row, and token columns are not readable', () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.meta_connections ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/ALTER TABLE public\.meta_oauth_states ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/FOR SELECT\s+TO authenticated\s+USING \(auth\.uid\(\) = user_id\)/);
    const grant = MIGRATION.match(/GRANT SELECT \(([^)]*)\) ON public\.meta_connections TO authenticated/)![1];
    expect(grant).not.toMatch(/user_token_ref|meta_user_id/);
    expect(MIGRATION).not.toMatch(/GRANT[^;]*meta_oauth_states[^;]*TO (anon|authenticated)/);
  });
  it('every privileged function is SECURITY DEFINER, pinned search_path, and not callable from the browser', () => {
    const fns = [...MIGRATION.matchAll(/CREATE OR REPLACE FUNCTION public\.(meta_\w+)\(/g)].map((m) => m[1]);
    expect(fns.length).toBeGreaterThanOrEqual(13);
    for (const fn of fns) {
      expect(MIGRATION).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
      expect(MIGRATION).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO (anon|authenticated|PUBLIC)`));
    }
    expect((MIGRATION.match(/SECURITY DEFINER SET search_path = ''/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });
  it('the browser reads only non-secret columns', () => {
    const repo = read('src/features/meta-connection/metaRepository.ts');
    expect(repo).not.toMatch(/user_token_ref|meta_user_id|access_token/);
    expect(repo).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
  it('the card copy is exactly as specified', () => {
    const t = META_COPY.es;
    expect(t.title).toBe('Facebook e Instagram');
    expect(t.description).toBe('Conecta los perfiles sociales de tu negocio para que LocalSEOHub pueda analizar tu presencia y ayudarte a mejorarla.');
    expect(t.connect).toBe('Conecta Facebook e Instagram');
    expect(t.connecting).toBe('Conectando…');
    expect(t.selectPage).toBe('Selecciona la página de tu negocio');
    expect(t.noProfessional).toBe('No hay una cuenta profesional asociada');
    expect(t.failed).toBe('No se pudo completar la conexión');
    expect(t.reauth).toBe('Vuelve a conectar tu cuenta');
    expect(t.unavailable).toBe('La conexión con Meta todavía no está disponible.');
    expect(instagramLabel('connected', 'panaderiasol')).toBe('@panaderiasol');
    expect(instagramLabel('not_associated', null)).toBe('No hay una cuenta profesional asociada');
  });
  it('every taxonomy code has a human message', () => {
    for (const code of ['OAUTH_DENIED', 'OAUTH_STATE_INVALID', 'OAUTH_STATE_EXPIRED', 'TOKEN_EXCHANGE_FAILED', 'META_APP_NOT_CONFIGURED',
      'META_PERMISSION_UNAVAILABLE', 'META_API_RATE_LIMIT', 'PAGE_DISCOVERY_FAILED', 'NO_AUTHORIZED_PAGES', 'INSTAGRAM_DISCOVERY_FAILED',
      'REAUTH_REQUIRED', 'UNKNOWN_ERROR']) {
      if (code !== 'UNKNOWN_ERROR') expect(metaErrorMessage(code)).not.toBe(metaErrorMessage('UNKNOWN_ERROR'));
      expect(metaErrorMessage(code, 'en').length).toBeGreaterThan(10);
    }
    expect(metaErrorMessage('NOT_A_CODE')).toBe(metaErrorMessage('UNKNOWN_ERROR'));
  });
  it('no fake metrics or tokens are rendered by the card', () => {
    const card = read('src/features/meta-connection/MetaConnectionCard.tsx');
    expect(card).not.toMatch(/followers|seguidores|likes|reach|alcance|token/i);
  });
  it('the callback page accepts only a well-formed completion and sanitises error codes', () => {
    expect(readCallbackParams('', `#token=${COMPLETION}`)).toEqual({ completion: COMPLETION, error: null });
    expect(readCallbackParams('', '#token=abc')).toEqual({ completion: null, error: null });
    expect(readCallbackParams('?error=OAUTH_DENIED', '')).toEqual({ completion: null, error: 'OAUTH_DENIED' });
    expect(readCallbackParams('?error=<script>', '')).toEqual({ completion: null, error: 'UNKNOWN_ERROR' });
  });
  it('the callback route exists outside the app shell, behind the sign-in guard', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/<Route path="\/oauth\/meta\/callback" element=\{\s*<AppGuard>\s*<Suspense fallback=\{SKELETON\}>\s*<MetaCallbackPage \/>/);
  });
});
