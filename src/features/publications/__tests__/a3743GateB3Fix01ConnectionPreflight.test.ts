import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { META_GRAPH_VERSION } from '../../../../supabase/functions/instagram-publishing/shared.ts';
import {
  createConnectionPreflightHandler, isConnectionPreflightRequest, PREFLIGHT_ACTION, PREFLIGHT_TIMEOUT_MS,
  type ConnectionLookup, type ConnectionPreflightDeps,
} from '../../../../supabase/functions/instagram-publishing/connectionPreflight.ts';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const IG_DIR = 'supabase/functions/instagram-publishing';

const USER = 'aabe426e-f079-4db1-835b-17d9d126313e';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PUB_A = '65569535-5d89-4df3-a8d4-c2af6df8606d';
const PUB_D = '875587f5-0137-4477-904c-609e8e406ad6';
const CONN = '44444444-4444-4444-8444-444444444444';
const PAGE = '1393994523793266';
const IG = '17841462487279994';
const APP_ID = '987654321012345';
const APP_SECRET = 'app-secret-value-never-leaks';
const USER_TOKEN = 'EAAuserTOKENvalue1234567890abcdefXYZ';
const PAGE_TOKEN = 'EAApageTOKENvalue1234567890abcdefXYZ';
const FUTURE = Math.floor(Date.UTC(2027, 0, 1) / 1000);
const PAST = Math.floor(Date.UTC(2026, 0, 1) / 1000);
const NOW = Date.UTC(2026, 9, 31, 16, 0, 0);
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Route = 'debug' | 'perms' | 'page' | 'ig' | 'limit';
const ALL_PERMS = ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish', 'business_management'];
const OK: Record<Route, () => Response> = {
  debug: () => res({ data: { app_id: APP_ID, type: 'USER', is_valid: true, expires_at: 0, data_access_expires_at: FUTURE, scopes: ALL_PERMS } }),
  perms: () => res({ data: ALL_PERMS.map((permission) => ({ permission, status: 'granted' })) }),
  page: () => res({ id: PAGE, access_token: PAGE_TOKEN, instagram_business_account: { id: IG } }),
  ig: () => res({ id: IG, username: 'localseohub.io' }),
  limit: () => res({ data: [{ quota_usage: 0, config: { quota_total: 100, quota_duration: 86400 } }] }),
};

function routeOf(url: URL): Route | null {
  const p = url.pathname.replace(`/${META_GRAPH_VERSION}/`, '');
  if (p === 'debug_token') return 'debug';
  if (p === 'me/permissions') return 'perms';
  if (p === PAGE) return 'page';
  if (p === IG) return 'ig';
  if (p === `${IG}/content_publishing_limit`) return 'limit';
  return null;
}

function setup(over: Partial<Record<Route, () => Response | Promise<Response>>> = {}, deps: Partial<ConnectionPreflightDeps> = {}) {
  const fetch = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const route = routeOf(new URL(String(input)));
    if (!route) return res({ error: { code: 100 } }, 400);
    return (over[route] ?? OK[route])();
  });
  const lookup: ConnectionLookup = { kind: 'ok', connection: { id: CONN, pageId: PAGE, igUserId: IG, igUsername: 'localseohub.io' } };
  const d = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'owner-jwt' ? USER : jwt === 'other-jwt' ? OTHER : null)),
    internalTestActive: vi.fn(async (u: string) => u === USER),
    connection: vi.fn(async (u: string, p: string): Promise<ConnectionLookup> => (u === USER && p === PUB_D ? lookup : { kind: 'not_found' })),
    readToken: vi.fn(async (id: string) => (id === CONN ? USER_TOKEN : null)),
    env: vi.fn((k: string) => ({ META_APP_ID: APP_ID, META_APP_SECRET: APP_SECRET } as Record<string, string>)[k]),
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => NOW,
    ...deps,
  };
  const handle = createConnectionPreflightHandler(d);
  const call = (body: unknown = { action: PREFLIGHT_ACTION, publicationId: PUB_D }, jwt: string | null = 'owner-jwt') =>
    handle(new Request('http://local/instagram-publishing', {
      method: 'POST',
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
  const run = async (body?: unknown, jwt?: string | null) => {
    const r = await call(body, jwt);
    return { status: r.status, text: await r.clone().text(), body: await r.json() };
  };
  return { d, fetch, run };
}

const SECRETS = [USER_TOKEN, PAGE_TOKEN, APP_SECRET, `${APP_ID}|`, 'appsecret_proof', 'access_token', 'fbtrace', 'Bearer'];
const noSecrets = (text: string) => { for (const s of SECRETS) expect(text).not.toContain(s); };

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('B.3 FIX01 authorization (server-enforced)', () => {
  it('missing or invalid JWT is rejected before any lookup or Graph call', async () => {
    for (const jwt of [null, 'forged-jwt']) {
      const s = setup();
      const r = await s.run(undefined, jwt);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ ok: false, action: PREFLIGHT_ACTION, code: 'AUTH_REQUIRED' });
      expect(s.d.internalTestActive).not.toHaveBeenCalled();
      expect(s.d.connection).not.toHaveBeenCalled();
      expect(s.d.readToken).not.toHaveBeenCalled();
      expect(s.fetch).not.toHaveBeenCalled();
    }
  });

  it('malformed body, unknown keys, non-UUID publication are rejected', async () => {
    const bodies = ['not json', { action: PREFLIGHT_ACTION }, { action: PREFLIGHT_ACTION, publicationId: 'x' },
      { action: PREFLIGHT_ACTION, publicationId: PUB_D, expectedVersion: 3 }, { action: PREFLIGHT_ACTION, publicationId: PUB_D, retry: true },
      { action: 'instagram_publish', publicationId: PUB_D }];
    for (const b of bodies) {
      const s = setup();
      const r = await s.run(b);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_REQUEST');
      expect(s.fetch).not.toHaveBeenCalled();
    }
  });

  it('missing internal test entitlement is rejected before ownership, token or Graph', async () => {
    const s = setup({}, { internalTestActive: vi.fn(async () => false) });
    const r = await s.run();
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('INTERNAL_TEST_REQUIRED');
    expect(s.d.connection).not.toHaveBeenCalled();
    expect(s.d.readToken).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('non-owner (entitled) user cannot check someone else’s publication', async () => {
    const s = setup({}, { internalTestActive: vi.fn(async () => true) });
    const r = await s.run(undefined, 'other-jwt');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('PUBLICATION_NOT_FOUND');
    expect(s.d.connection).toHaveBeenCalledWith(OTHER, PUB_D);
    expect(s.d.readToken).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('wrong business or missing connection is rejected; malformed stored ids fail closed', async () => {
    const s1 = setup({}, { connection: vi.fn(async () => ({ kind: 'not_connected' }) as ConnectionLookup) });
    expect((await s1.run()).body.code).toBe('CHANNEL_NOT_CONNECTED');
    const s2 = setup({}, { connection: vi.fn(async () => ({ kind: 'ok', connection: { id: CONN, pageId: 'abc', igUserId: IG, igUsername: null } }) as ConnectionLookup) });
    expect((await s2.run()).status).toBe(409);
    for (const s of [s1, s2]) { expect(s.d.readToken).not.toHaveBeenCalled(); expect(s.fetch).not.toHaveBeenCalled(); }
  });

  it('missing app credentials give a generic internal error without Graph calls', async () => {
    const s = setup({}, { env: vi.fn(() => undefined) });
    const r = await s.run();
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ok: false, action: PREFLIGHT_ACTION, code: 'INTERNAL_ERROR' });
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('unexpected internal failure returns a generic response with no internal detail', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const s = setup({}, { connection: vi.fn(async () => { throw new Error(`db exploded ${USER_TOKEN}`); }) });
    const r = await s.run();
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ok: false, action: PREFLIGHT_ACTION, code: 'INTERNAL_ERROR' });
    expect(r.text).not.toMatch(/exploded/);
    noSecrets(log.mock.calls.flat().join(' ').replace('Bearer [redacted]', ''));
  });
});

describe('B.3 FIX01 live checks (mocked Graph)', () => {
  it('healthy connection: PASS with verified ids, token, permissions, eligibility and limit', async () => {
    const s = setup();
    const r = await s.run();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true, overall: 'PASS', page_id: PAGE, instagram_account_id: IG, instagram_username: 'localseohub.io',
      token_valid: true, token_expiry: { status: 'never', expires_at: null, data_access_expires_at: new Date(FUTURE * 1000).toISOString() },
      missing_permissions: [], professional: { eligibility: 'pass', subtype: 'not_exposed' },
      publishing_limit: { status: 'pass', quota_usage: 0, quota_total: 100, quota_duration_seconds: 86400 },
      persisted: false, publishing_enabled: false,
    });
    expect(Object.values(r.body.permissions)).toEqual([true, true, true, true]);
    for (const c of Object.values(r.body.checks) as { status: string }[]) expect(c.status).toBe('pass');
    expect(r.body.reasons).toEqual(['SUBTYPE_NOT_EXPOSED']);
    noSecrets(r.text);
  });

  it('finite expiry is reported as valid_until', async () => {
    const s = setup({ debug: () => res({ data: { app_id: APP_ID, is_valid: true, expires_at: FUTURE } }) });
    const r = await s.run();
    expect(r.body.token_expiry).toMatchObject({ status: 'valid_until', expires_at: new Date(FUTURE * 1000).toISOString() });
    expect(r.body.checks.token.status).toBe('pass');
  });

  it('expired, invalid, foreign-app and rejected tokens are confirmed failures', async () => {
    const cases: [Partial<Record<Route, () => Response>>, string][] = [
      [{ debug: () => res({ data: { app_id: APP_ID, is_valid: true, expires_at: PAST } }) }, 'TOKEN_EXPIRED'],
      [{ debug: () => res({ data: { app_id: APP_ID, is_valid: false, expires_at: PAST } }) }, 'TOKEN_INVALID'],
      [{ debug: () => res({ data: { app_id: '111', is_valid: true, expires_at: 0 } }) }, 'TOKEN_APP_MISMATCH'],
      [{ debug: () => res({ error: { code: 1 } }, 500), perms: () => res({ error: { code: 190 } }, 400), page: () => res({ error: { code: 190 } }, 400) }, 'TOKEN_INVALID'],
    ];
    for (const [over, reason] of cases) {
      const r = await setup(over).run();
      expect(r.body.overall).toBe('FAIL');
      expect(r.body.token_valid).toBe(false);
      expect(r.body.checks.token).toEqual({ status: 'fail', reason });
    }
  });

  it('missing Vault credential: FAIL without any Graph call', async () => {
    const s = setup({}, { readToken: vi.fn(async () => null) });
    const r = await s.run();
    expect(r.body.overall).toBe('FAIL');
    expect(r.body.checks.token).toEqual({ status: 'fail', reason: 'TOKEN_UNAVAILABLE' });
    expect(r.body.checks.page.status).toBe('skipped');
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('missing or declined permissions are listed', async () => {
    const s = setup({ perms: () => res({ data: [
      { permission: 'pages_show_list', status: 'granted' }, { permission: 'pages_read_engagement', status: 'granted' },
      { permission: 'instagram_basic', status: 'granted' }, { permission: 'instagram_content_publish', status: 'declined' },
    ] }) });
    const r = await s.run();
    expect(r.body.overall).toBe('FAIL');
    expect(r.body.permissions.instagram_content_publish).toBe(false);
    expect(r.body.missing_permissions).toEqual(['instagram_content_publish']);
    expect(r.body.checks.permissions).toEqual({ status: 'fail', reason: 'PERMISSIONS_MISSING' });
  });

  it('incorrect Page association stops before any Instagram read', async () => {
    const cases: [() => Response, string][] = [
      [() => res({ id: '999', access_token: PAGE_TOKEN, instagram_business_account: { id: IG } }), 'PAGE_MISMATCH'],
      [() => res({ id: PAGE, instagram_business_account: { id: IG } }), 'PAGE_ACCESS_MISSING'],
      [() => res({ id: PAGE, access_token: PAGE_TOKEN }), 'INSTAGRAM_NOT_LINKED'],
      [() => res({ id: PAGE, access_token: PAGE_TOKEN, instagram_business_account: { id: '17841400000000000' } }), 'INSTAGRAM_ACCOUNT_MISMATCH'],
      [() => res({ error: { code: 100, message: `bad ${USER_TOKEN}` } }, 400), 'PAGE_NOT_ACCESSIBLE'],
    ];
    for (const [page, reason] of cases) {
      const s = setup({ page });
      const r = await s.run();
      expect(r.body.overall).toBe('FAIL');
      expect(r.body.checks.page).toEqual({ status: 'fail', reason });
      expect(r.body.instagram_account_id).toBeNull();
      const routes = s.fetch.mock.calls.map((c) => routeOf(new URL(String(c[0]))));
      expect(routes).not.toContain('ig');
      expect(routes).not.toContain('limit');
      noSecrets(r.text);
    }
    expect((await setup({ page: () => res({ id: PAGE, access_token: PAGE_TOKEN }) }).run()).body.professional.eligibility).toBe('fail');
  });

  it('incorrect Instagram account or changed username fails', async () => {
    const wrong = await setup({ ig: () => res({ id: '17841400000000000', username: 'someone' }) }).run();
    expect(wrong.body.checks.instagram_account).toEqual({ status: 'fail', reason: 'INSTAGRAM_ACCOUNT_MISMATCH' });
    expect(wrong.body.instagram_username).toBeNull();
    const renamed = await setup({ ig: () => res({ id: IG, username: 'other.name' }) }).run();
    expect(renamed.body.overall).toBe('FAIL');
    expect(renamed.body.checks.instagram_account).toEqual({ status: 'fail', reason: 'INSTAGRAM_USERNAME_CHANGED' });
  });

  it('eligibility is inconclusive (not failed) when Meta gives no definitive signal; subtype is never claimed', async () => {
    for (const limit of [() => res({ error: { code: 2 } }, 500), () => res({ data: [] })]) {
      const r = await setup({ limit }).run();
      expect(r.body.overall).toBe('INCONCLUSIVE');
      expect(r.body.professional).toMatchObject({ eligibility: 'inconclusive', subtype: 'not_exposed' });
      expect(r.body.checks.publishing_limit.status).toBe('inconclusive');
      expect(r.body.reasons).toEqual(expect.arrayContaining(['ELIGIBILITY_INCONCLUSIVE', 'SUBTYPE_NOT_EXPOSED']));
    }
    const denied = await setup({ limit: () => res({ error: { code: 10 } }, 403) }).run();
    expect(denied.body.overall).toBe('FAIL');
    expect(denied.body.checks.professional_eligibility).toEqual({ status: 'fail', reason: 'PUBLISHING_NOT_ELIGIBLE' });
    const full = await setup({ limit: () => res({ data: [{ quota_usage: 100, config: { quota_total: 100 } }] }) }).run();
    expect(full.body.checks.publishing_limit).toEqual({ status: 'fail', reason: 'PUBLISHING_LIMIT_REACHED' });
    expect(full.body.professional.eligibility).toBe('pass');
  });

  it('debug_token unavailable leaves the token check inconclusive, not failed', async () => {
    const r = await setup({ debug: () => res({ error: { code: 1 } }, 500) }).run();
    expect(r.body.token_valid).toBe('unknown');
    expect(r.body.checks.token).toEqual({ status: 'inconclusive', reason: 'TOKEN_DEBUG_UNAVAILABLE' });
    expect(r.body.overall).toBe('INCONCLUSIVE');
  });

  it('Meta timeout is bounded and reported as META_TIMEOUT / inconclusive', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = setup({}, {
      fetch: vi.fn((_u: string | URL | Request, init?: RequestInit) => new Promise<Response>((_r, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch,
    });
    let done = false;
    const pending = s.run().finally(() => { done = true; });
    for (let i = 0; i < 400 && !done; i++) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(PREFLIGHT_TIMEOUT_MS / 4);
    }
    const r = await pending;
    expect(r.body.overall).toBe('INCONCLUSIVE');
    expect(r.body.checks.token).toEqual({ status: 'inconclusive', reason: 'META_TIMEOUT' });
    expect(r.body.checks.page).toEqual({ status: 'inconclusive', reason: 'META_TIMEOUT' });
    expect(r.body.checks.permissions.status).toBe('inconclusive');
    expect(PREFLIGHT_TIMEOUT_MS).toBe(8000);
  });

  it('raw Graph errors, messages and trace ids never reach the response or logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = () => res({ error: { code: 200, message: `token ${USER_TOKEN} secret ${APP_SECRET}`, fbtrace_id: 'AbCdEf123', error_user_msg: 'x' } }, 403);
    const r = await setup({ debug: err, perms: err, page: err }).run();
    expect(r.text).not.toMatch(/message|error_user_msg|AbCdEf123/);
    noSecrets(r.text);
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).not.toMatch(/AbCdEf123|message|graph\.facebook\.com/);
    for (const s of [USER_TOKEN, PAGE_TOKEN, APP_SECRET]) expect(logged).not.toContain(s);
  });
});

describe('B.3 FIX01 read-only guarantees', () => {
  it('only GET requests to the five read paths; never /media, /media_publish, /photos or /feed', async () => {
    const s = setup();
    await s.run();
    expect(s.fetch).toHaveBeenCalledTimes(5);
    for (const [u, init] of s.fetch.mock.calls) {
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      const url = new URL(String(u));
      expect(url.origin).toBe('https://graph.facebook.com');
      expect(routeOf(url)).not.toBeNull();
      expect(url.pathname).not.toMatch(/\/media(_publish)?$|\/photos$|\/feed$/);
    }
  });

  it('tokens travel only in the Authorization header (debug_token input excepted); the Page token never leaves memory', async () => {
    const s = setup();
    const r = await s.run();
    for (const [u, init] of s.fetch.mock.calls) {
      const url = new URL(String(u));
      const route = routeOf(url);
      if (route !== 'debug') expect(String(u)).not.toContain(USER_TOKEN);
      expect(String(u)).not.toContain(PAGE_TOKEN);
      expect(String(u)).not.toContain(APP_SECRET);
      expect(url.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (route === 'debug') expect(auth).toBe(`Bearer ${APP_ID}|${APP_SECRET}`);
      else if (route === 'ig' || route === 'limit') expect(auth).toBe(`Bearer ${PAGE_TOKEN}`);
      else expect(auth).toBe(`Bearer ${USER_TOKEN}`);
    }
    noSecrets(r.text);
  });

  it('dependencies are read-only: the handler has no write, upload, attempt or publish capability', () => {
    const src = read(`${IG_DIR}/connectionPreflight.ts`);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.upload\(|\.remove\(|createSignedUrl|\.rpc\(/);
    expect(src.match(/"POST"/g)).toEqual(['"POST"']);
    expect(src).toContain('req.method !== "POST"');
    expect(src).not.toMatch(/method: "POST"|media_publish|\/media"|`\/media|\/photos|\/feed/);
    expect(src).not.toMatch(/publish_attempt|META_INSTAGRAM_REAL_PUBLISH|isArmed|isAuthorizedToPublish|instagramPublish/);
    expect(src).toMatch(/method: "GET"/);
    const index = read(`${IG_DIR}/index.ts`);
    const block = index.slice(index.indexOf('createConnectionPreflightHandler({'), index.indexOf('Deno.serve('));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.upload\(|\.remove\(|storage|createSignedUrl|fetch\(/);
    expect(block.match(/\.rpc\("([a-z_]+)"/g)).toEqual(['.rpc("internal_test_entitlement_active"', '.rpc("meta_read_token"']);
    expect(block).toContain('.from("publications").select("business_id")');
    expect(block).toContain('.from("businesses").select("id")');
    expect(block).toContain('.eq("user_id", userId)');
  });

  it('routing: only POST with the preflight action reaches the read-only handler; everything else keeps the frozen handler', async () => {
    const post = (b: unknown) => new Request('http://x', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b) });
    expect(await isConnectionPreflightRequest(post({ action: PREFLIGHT_ACTION, publicationId: PUB_D }))).toBe(true);
    for (const b of [{ action: 'instagram_publish' }, { action: 'instagram_publish_status' }, { action: 'instagram_publish_verify' }, 'nope', {}]) {
      expect(await isConnectionPreflightRequest(post(b))).toBe(false);
    }
    expect(await isConnectionPreflightRequest(new Request('http://x', { method: 'GET' }))).toBe(false);
    expect(read(`${IG_DIR}/index.ts`)).toContain('if (await isConnectionPreflightRequest(req.clone())) return connectionPreflight(req);\n  return handle(req);');
  });

  it('arming secrets present or absent never change the outcome or enable publishing', async () => {
    const env = vi.fn((k: string) => ({
      META_APP_ID: APP_ID, META_APP_SECRET: APP_SECRET, META_INSTAGRAM_REAL_PUBLISH_ARMED: 'true',
      META_INSTAGRAM_REAL_PUBLISH_USER_IDS: USER, META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS: PUB_D,
    } as Record<string, string>)[k]);
    const armed = setup({}, { env });
    const r = await armed.run();
    expect(r.body.publishing_enabled).toBe(false);
    expect(r.body).not.toHaveProperty('armed');
    expect(r.body).not.toHaveProperty('trigger');
    expect([...new Set(env.mock.calls.map((c) => c[0]))].sort()).toEqual(['META_APP_ID', 'META_APP_SECRET']);
  });

  it('only the requested publication is looked up; nothing about A/B/C/D content is returned', async () => {
    const s = setup();
    const r = await s.run();
    expect(s.d.connection).toHaveBeenCalledTimes(1);
    expect(s.d.connection).toHaveBeenCalledWith(USER, PUB_D);
    expect(r.text).not.toMatch(/caption|image|version|draft|attempt/);
    expect(r.text).not.toContain(PUB_D);
    expect(r.text).not.toContain(PUB_A);
  });
});

describe('B.3 FIX01 browser panel', () => {
  const dir = 'src/features/instagram-publish';
  const client = read(`${dir}/connectionCheck.ts`);
  const panel = read(`${dir}/MetaConnectionCheck.tsx`);
  const harness = read(`${dir}/InstagramPublishHarness.tsx`);

  it('sends only the action and publication id; no Graph, secrets, storage or publish call', () => {
    expect(client).toContain("body: { action: 'instagram_connection_preflight', publicationId }");
    for (const src of [client, panel]) {
      expect(src).not.toMatch(/graph\.facebook\.com|fetch\(|access_token|appsecret|META_|signedUrl|image_url|localStorage|sessionStorage/i);
      expect(src).not.toMatch(/instagram_publish'|instagram_publish_verify|requestInstagramPublish|canTrigger/);
      expect(src).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.upsert\(|\.storage/);
    }
    expect(panel).not.toMatch(/setInterval|setTimeout|useQuery|refetch/);
    expect(panel.match(/checkMetaConnection\(/g)).toHaveLength(1);
  });

  it('the panel mounts inside the existing internal harness without touching the publish trigger', () => {
    expect(harness).toContain("import MetaConnectionCheck from './MetaConnectionCheck';");
    expect(harness.match(/<MetaConnectionCheck publicationId=\{pub\.id\} \/>/g)).toHaveLength(1);
    expect(harness.indexOf('<MetaConnectionCheck')).toBeGreaterThan(harness.indexOf('if (!pub) return null;'));
    expect(harness).toContain("s.armed && s.triggerEnabled && s.canPublish && s.state === 'NOT_REQUESTED' && s.version === version");
    expect(panel).toContain("{running ? t('running') : t('run')}");
    expect(panel.match(/<button /g)).toHaveLength(1);
    expect(read(`${dir}/copy.ts`)).toContain("run: { es: 'Comprobar conexión con Meta'");
    for (const f of readdirSync(join(ROOT, dir))) {
      if (/\.tsx?$/.test(f)) expect(read(`${dir}/${f}`)).not.toMatch(/access_token|appsecret|META_APP_SECRET|META_INSTAGRAM|user_token|page_token/i);
    }
  });

  it('app routing, function config and frozen publishing engine are unchanged', () => {
    expect(sha('src/App.tsx')).toBe('ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b');
    expect(read('supabase/config.toml')).toMatch(/\[functions\.instagram-publishing\]\s*verify_jwt = true/);
    const frozen: Record<string, string> = {
      [`${IG_DIR}/instagramPublish.ts`]: '5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca',
      [`${IG_DIR}/graph.ts`]: '6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a',
      [`${IG_DIR}/shared.ts`]: '2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd',
      [`${IG_DIR}/derivative.ts`]: 'be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa',
      'src/features/instagram-publish/repository.ts': '9b5f26d48f0ab2ea632ebe42d2c2247d49005eca292140ca4ea3d78a1fe190dd',
      'supabase/functions/meta-publishing/index.ts': '027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23',
      'supabase/functions/meta-publishing/facebookPhoto.ts': '7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a',
      'supabase/functions/meta-publishing/facebookPublish.ts': '48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd',
      'supabase/functions/meta-publishing/handler.ts': 'b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb',
    };
    for (const [f, h] of Object.entries(frozen)) expect(sha(f), f).toBe(h);
  });
});
