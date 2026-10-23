import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALREADY_CONNECTED, STATE_TTL_MS, createHandler as createStart } from '../../../../supabase/functions/meta-oauth-start/handler.ts';
import { createHandler as createCallback } from '../../../../supabase/functions/meta-oauth-callback/handler.ts';
import { STALE_ATTEMPT_MS, createHandler as createConnection, type Connection } from '../../../../supabase/functions/meta-connection/handler.ts';
import { META_COPY, META_POLL_MS, META_STALE_ATTEMPT_MS, metaErrorMessage, metaView, type MetaConnectionRow } from '../metaStatus';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIGRATION = read('supabase/migrations/20261022152358_a3512_meta_oauth_stuck_connection_recovery.sql');
const CARD = read('src/features/meta-connection/MetaConnectionCard.tsx');
const fnBody = (name: string) => {
  const start = MIGRATION.indexOf(`FUNCTION public.${name}(`);
  return MIGRATION.slice(start, MIGRATION.indexOf('$$;', start));
};

const ENV: Record<string, string> = {
  META_APP_ID: '1234567890',
  META_APP_SECRET: 'app-secret-value-XYZ',
  META_REDIRECT_URI: 'https://example.supabase.co/functions/v1/meta-oauth-callback',
  SITE_URL: 'https://localseohub.io',
};
const STATE = 'a'.repeat(64);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

afterEach(() => vi.restoreAllMocks());

// Simulates the server-side SQL state machine for one user's connection (connection ids are never client-supplied).
function server(initial: Connection | null, opts: { liveState?: boolean } = {}) {
  const rows: Record<string, Connection | null> = { 'user-1': initial, 'user-2': { id: 'conn-other', status: 'connecting', availablePages: [], attemptStartedAt: new Date().toISOString(), tokenExpiresAt: null } };
  const byId = (id: string) => Object.values(rows).find((r) => r?.id === id) ?? null;
  const set = (id: string, status: string) => {
    for (const [u, r] of Object.entries(rows)) if (r?.id === id) rows[u] = { ...r, status };
  };
  const inProgress = (c: Connection | null) => c?.status === 'connecting' || c?.status === 'authorized';
  const cancelAttempt = vi.fn(async (id: string) => {
    if (!inProgress(byId(id))) return false;
    set(id, 'disconnected');
    return true;
  });
  const expireStaleAttempt = vi.fn(async (id: string, staleBefore: string) => {
    const c = byId(id);
    if (!c || !inProgress(c)) return false;
    const started = c.attemptStartedAt ? Date.parse(c.attemptStartedAt) : NaN;
    if (opts.liveState !== false && Number.isFinite(started) && started >= Date.parse(staleBefore)) return false;
    set(id, 'error');
    return true;
  });
  const fail = vi.fn(async () => undefined);
  const disconnect = vi.fn(async () => undefined);
  const readToken = vi.fn(async () => 'EAAtoken');
  const getOwnConnection = vi.fn(async (userId: string) => rows[userId] ?? null);
  const handle = createConnection({
    getUserId: async (jwt) => (jwt === 'good' ? 'user-1' : jwt === 'other' ? 'user-2' : null),
    getOwnConnection,
    completeAuthorization: vi.fn(async () => ({ result: 'unknown' as const, pageCount: 0 })),
    readToken,
    finishPageSelection: vi.fn(async () => true),
    failConnection: fail,
    cancelAttempt,
    expireStaleAttempt,
    disconnect,
    env: (n) => ENV[n],
  });
  return { handle, rows, cancelAttempt, expireStaleAttempt, fail, disconnect, readToken, getOwnConnection };
}
const req = (body: unknown, jwt = 'good') =>
  new Request('https://x/meta-connection', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) });
const conn = (status: string, startedMinutesAgo: number | null = 0): Connection => ({
  id: 'conn-1', status, availablePages: [], attemptStartedAt: startedMinutesAgo === null ? null : minutesAgo(startedMinutesAgo), tokenExpiresAt: null,
});

function startDeps(result: string | null = 'conn-1') {
  const beginAttempt = vi.fn(async () => result);
  const handle = createStart({
    getUserId: async (jwt) => (jwt === 'good' ? 'user-1' : null),
    getOwnBusinessId: async () => 'biz-1',
    beginAttempt,
    env: (n) => ENV[n],
  });
  return { handle, beginAttempt };
}
const startReq = () => new Request('https://x/meta-oauth-start', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: '{}' });

function callbackDeps(result: 'unknown' | 'consumed' | 'stale' | 'expired' | 'ok', connectionId: string | null) {
  const fail = vi.fn(async () => undefined);
  const fetchFn = vi.fn(async () => new Response('{}'));
  const storeAuthorization = vi.fn(async () => true);
  const handle = createCallback({
    consumeState: vi.fn(async () => ({ result, connectionId })),
    failConnection: fail,
    storeAuthorization,
    env: (n) => ENV[n],
    fetch: fetchFn as unknown as typeof fetch,
  });
  return { handle, fail, fetchFn, storeAuthorization };
}
const cbReq = (q: string) => new Request(`https://x/meta-oauth-callback?${q}`);

describe('A3.5.1.2 · 1. OAuth started correctly', () => {
  it('returns a Meta dialog URL and a browser binding', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handle, beginAttempt } = startDeps();
    const res = await handle(startReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/www\.facebook\.com\/v25\.0\/dialog\/oauth\?/);
    expect(body.binding).toMatch(/^[a-f0-9]{64}$/);
    expect(beginAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('A3.5.1.2 · 2. manual cancel while connecting', () => {
  it('moves the own attempt to disconnected server-side', async () => {
    const s = server(conn('connecting', 2));
    const body = await (await s.handle(req({ action: 'cancel' }))).json();
    expect(body).toEqual({ ok: true, status: 'disconnected', cancelled: true });
    expect(s.cancelAttempt).toHaveBeenCalledWith('conn-1');
    expect(s.rows['user-1']?.status).toBe('disconnected');
  });
  it('also cancels an attempt stuck in authorized (browser never completed)', async () => {
    const s = server(conn('authorized', 1));
    expect((await (await s.handle(req({ action: 'cancel' }))).json()).cancelled).toBe(true);
  });
  it('is idempotent when there is nothing to cancel', async () => {
    const s = server(null);
    expect(await (await s.handle(req({ action: 'cancel' }))).json()).toEqual({ ok: true, status: 'disconnected', cancelled: false });
    expect(s.cancelAttempt).not.toHaveBeenCalled();
  });
  it('the SQL cancel only acts on connecting/authorized and deletes every pending state', () => {
    const body = fnBody('meta_cancel_attempt');
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("v_status NOT IN ('connecting','authorized')");
    expect(body).toContain("meta_fail_connection(p_connection_id, 'disconnected', 'OAUTH_CANCELLED')");
  });
});

describe('A3.5.1.2 · 3/4. abandoned OAuth and expired state', () => {
  it('an attempt older than TTL + 60 s is expired by recover', async () => {
    const s = server(conn('connecting', 12));
    expect((await (await s.handle(req({ action: 'recover' }))).json()).status).toBe('error');
    expect(s.rows['user-1']?.status).toBe('error');
  });
  it('an attempt whose state already expired is recovered before the time threshold', async () => {
    const s = server(conn('connecting', 10.5), { liveState: false });
    expect((await (await s.handle(req({ action: 'recover' }))).json()).status).toBe('error');
  });
  it('an attempt without a start time is expired', async () => {
    const s = server(conn('connecting', null));
    expect((await (await s.handle(req({ action: 'recover' }))).json()).status).toBe('error');
  });
  it('a live attempt is left alone', async () => {
    const s = server(conn('connecting', 3));
    expect((await (await s.handle(req({ action: 'recover' }))).json()).status).toBe('connecting');
    expect(s.rows['user-1']?.status).toBe('connecting');
  });
  it('the stale policy is exactly state TTL + 60 s on server and client', () => {
    expect(STATE_TTL_MS).toBe(10 * 60 * 1000);
    expect(STALE_ATTEMPT_MS).toBe(STATE_TTL_MS + 60 * 1000);
    expect(META_STALE_ATTEMPT_MS).toBe(STALE_ATTEMPT_MS);
  });
  it('the SQL expiry checks the live OAuth state, not only the clock', () => {
    const body = fnBody('meta_expire_stale_attempt');
    expect(body).toContain("v_conn.status NOT IN ('connecting','authorized')");
    expect(body).toContain('s.consumed_at IS NULL AND s.expires_at > now()');
    expect(body).toContain('s.completion_expires_at > now()');
    expect(body).toContain("meta_fail_connection(p_connection_id, 'error', 'OAUTH_STATE_EXPIRED')");
  });
});

describe('A3.5.1.2 · 5. automatic recovery without reload', () => {
  it('polls every 30 s while an attempt is in progress', () => {
    expect(META_POLL_MS).toBe(30 * 1000);
    expect(CARD).toMatch(/if \(!inProgress\) return;\s+const timer = window\.setInterval\(\(\) => void recheck\(\), META_POLL_MS\)/);
    expect(CARD).toContain('window.clearInterval(timer)');
  });
  it('re-checks when the tab becomes visible or is restored, and clears the stuck busy state', () => {
    expect(CARD).toContain("addEventListener('visibilitychange'");
    expect(CARD).toContain("addEventListener('pageshow'");
    expect(CARD).toContain('if (persisted) setBusy(false)');
    expect(CARD).toContain("removeEventListener('pageshow'");
  });
  it('the UI never shows an attempt past the threshold as connecting', () => {
    const row: MetaConnectionRow = { status: 'connecting', page_id: null, page_name: null, instagram_status: null, instagram_username: null, available_pages: [], last_error: null, attempt_started_at: minutesAgo(11.5), connected_at: null };
    expect(metaView(row).kind).toBe('error');
    expect(metaView({ ...row, attempt_started_at: minutesAgo(5) }).kind).toBe('connecting');
  });
  it('the connecting view always offers a visible exit', () => {
    expect(CARD).toMatch(/view\.kind === 'connecting'\)[\s\S]*?handleCancel\(\)[\s\S]*?t\.cancelConnection/);
    expect(META_COPY.es.connecting).toBe('Conectando…');
    expect(META_COPY.es.cancelConnection).toBe('Cancelar conexión');
    expect(META_COPY.es.retryConnection).toBe('Reintentar conexión');
    expect(META_COPY.en.cancelConnection).toBe('Cancel connection');
  });
});

describe('A3.5.1.2 · 6. retry after cancel, expiry or failure', () => {
  it('a new start is accepted after cancel', async () => {
    const s = server(conn('connecting', 1));
    await s.handle(req({ action: 'cancel' }));
    const { handle } = startDeps('conn-1');
    expect((await handle(startReq())).status).toBe(200);
  });
  it('cancelled, denied and failed attempts show "Reintentar conexión"', () => {
    expect(CARD).toContain("view.errorCode === 'OAUTH_DENIED' || view.errorCode === 'OAUTH_CANCELLED'");
    expect(CARD.match(/t\.retryConnection/g)?.length).toBeGreaterThanOrEqual(2);
    expect(metaErrorMessage('OAUTH_CANCELLED')).toContain('Cancelaste la conexión');
  });
});

describe('A3.5.1.2 · 7/8. callback after cancel or with an expired state', () => {
  it('a callback arriving after cancel finds no state and touches nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handle, fail, fetchFn, storeAuthorization } = callbackDeps('unknown', null);
    const res = await handle(cbReq(`state=${STATE}&code=abc`));
    expect(res.headers.get('Location')).toContain('error=OAUTH_STATE_INVALID');
    expect(fail).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(storeAuthorization).not.toHaveBeenCalled();
  });
  it('a callback for an attempt no longer connecting (stale) does not overwrite it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handle, fail, fetchFn } = callbackDeps('stale', null);
    expect((await handle(cbReq(`state=${STATE}&code=abc`))).headers.get('Location')).toContain('error=OAUTH_STATE_INVALID');
    expect(fail).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('an expired state ends the attempt without exchanging the code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handle, fail, fetchFn } = callbackDeps('expired', 'conn-1');
    expect((await handle(cbReq(`state=${STATE}&code=abc`))).headers.get('Location')).toContain('error=OAUTH_STATE_EXPIRED');
    expect(fail).toHaveBeenCalledWith('conn-1', 'error', 'OAUTH_STATE_EXPIRED');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('access_denied still returns to a retryable disconnected state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handle, fail } = callbackDeps('ok', 'conn-1');
    await handle(cbReq(`state=${STATE}&error=access_denied`));
    expect(fail).toHaveBeenCalledWith('conn-1', 'disconnected', 'OAUTH_DENIED');
  });
});

describe('A3.5.1.2 · 9. per-user isolation', () => {
  it('a client-supplied connection id is ignored; only the caller\'s own row is cancelled', async () => {
    const s = server(conn('connecting', 1));
    await s.handle(req({ action: 'cancel', connectionId: 'conn-other', userId: 'user-2' }));
    expect(s.getOwnConnection).toHaveBeenCalledWith('user-1');
    expect(s.cancelAttempt).toHaveBeenCalledWith('conn-1');
    expect(s.cancelAttempt).not.toHaveBeenCalledWith('conn-other');
    expect(s.rows['user-2']?.status).toBe('connecting');
  });
  it('unauthenticated cancel is rejected without touching anything', async () => {
    const s = server(conn('connecting', 1));
    expect((await s.handle(req({ action: 'cancel' }, 'bad'))).status).toBe(401);
    expect(s.cancelAttempt).not.toHaveBeenCalled();
  });
  it('new functions are executable by service_role only', () => {
    for (const sig of ['meta_cancel_attempt(uuid)', 'meta_expire_stale_attempt(uuid, timestamptz)', 'meta_begin_attempt(uuid, uuid, text, text, timestamptz)']) {
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
      expect(MIGRATION).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`);
    }
    expect(MIGRATION).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|authenticated)/);
  });
});

describe('A3.5.1.2 · 10/11/13. a valid connection is never destroyed', () => {
  it('starting OAuth over a connected connection is rejected with 409 and no URL', async () => {
    const { handle } = startDeps(ALREADY_CONNECTED);
    const res = await handle(startReq());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('ALREADY_CONNECTED');
    expect(body.url).toBeUndefined();
    expect(metaErrorMessage('ALREADY_CONNECTED')).toContain('ya están conectados');
  });
  it('the SQL guard refuses under the row lock, before any state or token is touched', () => {
    const body = fnBody('meta_begin_attempt');
    const guard = body.indexOf("IF v_status = 'connected' THEN");
    expect(guard).toBeGreaterThan(body.indexOf('FOR UPDATE'));
    expect(guard).toBeLessThan(body.indexOf('DELETE FROM public.meta_oauth_states'));
    expect(guard).toBeLessThan(body.indexOf("SET status = 'connecting'"));
    expect(body).toContain("RAISE EXCEPTION 'META_ALREADY_CONNECTED'");
  });
  it('cancel on a connected connection is a no-op: no revocation, no wipe', async () => {
    const s = server({ ...conn('connected', null), tokenExpiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(await (await s.handle(req({ action: 'cancel' }))).json()).toEqual({ ok: true, status: 'connected', cancelled: false });
    expect(s.cancelAttempt).not.toHaveBeenCalled();
    expect(s.disconnect).not.toHaveBeenCalled();
    expect(s.fail).not.toHaveBeenCalled();
    expect(s.readToken).not.toHaveBeenCalled();
  });
  it('recover on a healthy connection never expires it', async () => {
    const s = server({ ...conn('connected', 60), tokenExpiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect((await (await s.handle(req({ action: 'recover' }))).json()).status).toBe('connected');
    expect(s.expireStaleAttempt).not.toHaveBeenCalled();
    expect(s.fail).not.toHaveBeenCalled();
  });
  it('cancel never targets page_selection_required, reauth_required or error rows', async () => {
    for (const status of ['page_selection_required', 'reauth_required', 'error', 'disconnected']) {
      const s = server(conn(status, 1));
      expect((await (await s.handle(req({ action: 'cancel' }))).json()).cancelled).toBe(false);
      expect(s.cancelAttempt).not.toHaveBeenCalled();
    }
  });
});

describe('A3.5.1.2 · 12. two tabs / concurrent starts', () => {
  it('each start issues a distinct state; the older tab\'s callback is rejected without touching the live attempt', async () => {
    const { handle } = startDeps('conn-1');
    const [a, b] = await Promise.all([handle(startReq()), handle(startReq())]);
    const ua = new URL((await a.json()).url).searchParams.get('state');
    const ub = new URL((await b.json()).url).searchParams.get('state');
    expect(ua).not.toBe(ub);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cb = callbackDeps('unknown', null);
    await cb.handle(cbReq(`state=${ua}&code=abc`));
    expect(cb.fail).not.toHaveBeenCalled();
    expect(cb.fetchFn).not.toHaveBeenCalled();
  });
  it('a second tab cancelling after the first finished does not disconnect the connection', async () => {
    const s = server(conn('connected', null));
    expect((await (await s.handle(req({ action: 'cancel' }))).json()).cancelled).toBe(false);
    expect(s.rows['user-1']?.status).toBe('connected');
  });
});
