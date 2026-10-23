import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createHandler as createStart, META_SCOPES } from '../../../../supabase/functions/meta-oauth-start/handler.ts';
import {
  createHandler as createCallback,
  graphErrorDetail,
  PAGE_PERMISSIONS,
  type Authorization,
} from '../../../../supabase/functions/meta-oauth-callback/handler.ts';
import { metaErrorMessage } from '../metaStatus';

const SECRET = 'app-secret-value-XYZ';
const LONG_TOKEN = 'EAAlongLivedUserToken123';
const SHORT_TOKEN = 'EAAshortToken456';
const AUTH_CODE = 'AQDauthorizationCode789';
const STATE = 'a'.repeat(64);
const COMPLETION = 'c'.repeat(64);
const PROOF = createHmac('sha256', SECRET).update(LONG_TOKEN).digest('hex');
const ENV: Record<string, string> = {
  META_APP_ID: '1234567890',
  META_APP_SECRET: SECRET,
  META_REDIRECT_URI: 'https://example.supabase.co/functions/v1/meta-oauth-callback',
  SITE_URL: 'https://localseohub.io',
};
const ALL = ['pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic'];

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const perms = (granted: string[], declined: string[] = []) => jsonRes({
  data: [...granted.map((permission) => ({ permission, status: 'granted' })), ...declined.map((permission) => ({ permission, status: 'declined' }))],
});

function spyLogs() {
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'info').mockImplementation(() => undefined),
  ];
  return () => spies.flatMap((s) => s.mock.calls.flat()).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
}

afterEach(() => vi.restoreAllMocks());

function callback(over: Partial<Record<'short' | 'long' | 'perms' | 'accounts', Response>> = {}) {
  const fetchFn = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('fb_exchange_token')) return over.long ?? jsonRes({ access_token: LONG_TOKEN, expires_in: 5184000 });
    if (url.includes('/oauth/access_token')) return over.short ?? jsonRes({ access_token: SHORT_TOKEN });
    if (url.includes('/me/permissions')) return over.perms ?? perms(ALL);
    if (url.includes('/me/accounts')) return over.accounts ?? jsonRes({ data: [{ id: '111', name: 'Panadería Sol' }] });
    if (url.includes('/me?')) return jsonRes({ id: '999' });
    return jsonRes({ error: { code: 1 } }, 500);
  });
  const stored: Authorization[] = [];
  const fail = vi.fn(async () => undefined);
  const handle = createCallback({
    consumeState: vi.fn(async () => ({ result: 'ok' as const, connectionId: 'conn-1' })),
    failConnection: fail,
    storeAuthorization: vi.fn(async (a: Authorization) => { stored.push(a); return true; }),
    env: (n: string) => ENV[n],
    fetch: fetchFn as unknown as typeof fetch,
    randomToken: () => COMPLETION,
  });
  return {
    run: async () => (await handle(new Request(`https://x/meta-oauth-callback?state=${STATE}&code=${AUTH_CODE}`))).headers.get('Location') ?? '',
    stored,
    fail,
  };
}

function expectNoSecrets(logs: string) {
  for (const secret of [LONG_TOKEN, SHORT_TOKEN, AUTH_CODE, SECRET, PROOF, STATE, COMPLETION]) expect(logs).not.toContain(secret);
  expect(logs).not.toContain('appsecret_proof');
}

describe('A3.5.2.1 · OAuth dialog requests the page-discovery permissions', () => {
  const start = () => createStart({
    getUserId: vi.fn(async () => 'user-1'),
    getOwnBusinessId: vi.fn(async () => 'biz-1'),
    beginAttempt: vi.fn(async () => 'conn-1'),
    env: (n: string) => ENV[n],
  });

  it('requests exactly pages_show_list, pages_read_engagement, business_management and instagram_basic', async () => {
    const logs = spyLogs();
    const body = await (await start()(new Request('https://x/meta-oauth-start', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: '{}' }))).json();
    const url = new URL(body.url);
    expect(META_SCOPES).toEqual(ALL);
    expect(url.searchParams.get('scope')!.split(',')).toEqual(ALL);
    expect(url.searchParams.get('auth_type')).toBe('rerequest');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.has('config_id')).toBe(false);
    expect(body.url).not.toMatch(/publish|pages_manage|ads_|instagram_manage|instagram_content|pages_messaging/);
    const text = logs();
    expect(text).toContain('business_management');
    expect(text).toContain('rerequest');
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(url.searchParams.get('state')!);
  });

  it('every permission needed to list Pages is requested', () => {
    for (const p of PAGE_PERMISSIONS) expect(META_SCOPES).toContain(p);
  });
});

describe('A3.5.2.1 · page discovery outcomes are truthful', () => {
  it('continues to the existing flow when Meta returns Pages', async () => {
    const logs = spyLogs();
    const c = callback();
    expect(await c.run()).toBe(`https://localseohub.io/oauth/meta/callback#token=${COMPLETION}`);
    expect(c.stored).toHaveLength(1);
    expect(c.stored[0].pages).toEqual([{ id: '111', name: 'Panadería Sol' }]);
    expect(c.stored[0].permissions).toEqual(ALL);
    expect(Object.keys(c.stored[0]).some((k) => /instagram/i.test(k))).toBe(false);
    const text = logs();
    expect(text).toContain('"stage":"page_discovery"');
    expect(text).toContain('"endpoint":"/me/accounts"');
    expect(text).toContain('"pages":1');
    expectNoSecrets(text);
  });

  it('empty list with every permission granted stays NO_AUTHORIZED_PAGES', async () => {
    const logs = spyLogs();
    const c = callback({ accounts: jsonRes({ data: [] }) });
    expect(await c.run()).toContain('error=NO_AUTHORIZED_PAGES');
    expect(c.fail).toHaveBeenCalledWith('conn-1', 'error', 'NO_AUTHORIZED_PAGES');
    expect(c.stored).toHaveLength(0);
    const text = logs();
    expect(text).toContain('"returned":0');
    expect(text).toContain('"missing_permissions":[]');
    expectNoSecrets(text);
  });

  it('empty list with business_management declined is reported as missing permissions', async () => {
    const logs = spyLogs();
    const c = callback({
      perms: perms(['pages_show_list', 'pages_read_engagement', 'instagram_basic'], ['business_management']),
      accounts: jsonRes({ data: [] }),
    });
    expect(await c.run()).toContain('error=META_PERMISSION_UNAVAILABLE');
    expect(c.fail).toHaveBeenCalledWith('conn-1', 'error', 'META_PERMISSION_UNAVAILABLE');
    const text = logs();
    expect(text).toContain('"declined":["business_management"]');
    expect(text).toContain('"missing_permissions":["business_management"]');
  });

  it('empty list with pages_read_engagement never granted is reported as missing permissions', async () => {
    spyLogs();
    const c = callback({ perms: perms(['pages_show_list', 'business_management']), accounts: jsonRes({ data: [] }) });
    expect(await c.run()).toContain('error=META_PERMISSION_UNAVAILABLE');
  });

  it('a declined business_management does not block Pages that Meta still returns', async () => {
    spyLogs();
    const c = callback({ perms: perms(['pages_show_list', 'instagram_basic'], ['business_management']) });
    expect(await c.run()).toContain('#token=');
    expect(c.stored).toHaveLength(1);
  });

  it('a real Graph error is never turned into "no Pages" and its codes are logged', async () => {
    const logs = spyLogs();
    const c = callback({ accounts: jsonRes({ error: { code: 1, error_subcode: 99, type: 'OAuthException', fbtrace_id: 'AbCdEf123', message: `bad ${LONG_TOKEN}` } }, 500) });
    expect(await c.run()).toContain('error=PAGE_DISCOVERY_FAILED');
    const text = logs();
    expect(text).toContain('"code":1');
    expect(text).toContain('"subcode":99');
    expect(text).toContain('"fbtrace_id":"AbCdEf123"');
    expect(text).toContain('"http":500');
    expect(text).not.toContain('NO_AUTHORIZED_PAGES');
    expectNoSecrets(text);
  });

  it('paging is logged as a flag, never as the next URL (which embeds the token)', async () => {
    const logs = spyLogs();
    const next = `https://graph.facebook.com/v25.0/me/accounts?access_token=${LONG_TOKEN}&appsecret_proof=${PROOF}&after=xyz`;
    const c = callback({ accounts: jsonRes({ data: [{ id: '111', name: 'A' }], paging: { next } }) });
    await c.run();
    const text = logs();
    expect(text).toContain('"has_next":true');
    expectNoSecrets(text);
  });

  it('malformed /me/accounts responses are PAGE_DISCOVERY_FAILED', async () => {
    spyLogs();
    expect(await callback({ accounts: jsonRes({ nope: true }) }).run()).toContain('error=PAGE_DISCOVERY_FAILED');
  });

  it('token exchange failures log only the stage and Meta codes', async () => {
    const logs = spyLogs();
    expect(await callback({ long: jsonRes({ error: { code: 100, fbtrace_id: 'T1' } }, 400) }).run()).toContain('error=TOKEN_EXCHANGE_FAILED');
    const text = logs();
    expect(text).toContain('"stage":"token_exchange_long"');
    expect(text).toContain('"code":100');
    expectNoSecrets(text);
  });

  it('graphErrorDetail keeps only whitelisted fields', () => {
    expect(graphErrorDetail({ error: { code: 10, error_subcode: 2, message: 'secret', error_user_msg: 'x', fbtrace_id: 'F' } }))
      .toEqual({ code: 10, subcode: 2, fbtrace_id: 'F' });
    expect(graphErrorDetail(null)).toEqual({});
  });
});

describe('A3.5.2.1 · visible messages distinguish the three failure kinds', () => {
  it.each(['es', 'en'] as const)('%s', (lang) => {
    const none = metaErrorMessage('NO_AUTHORIZED_PAGES', lang);
    const perm = metaErrorMessage('META_PERMISSION_UNAVAILABLE', lang);
    const graph = metaErrorMessage('PAGE_DISCOVERY_FAILED', lang);
    expect(new Set([none, perm, graph]).size).toBe(3);
    expect(perm).toMatch(lang === 'es' ? /empresa/ : /business/);
    expect(graph).toMatch(/Meta/);
    expect(none).toMatch(/Meta/);
  });
});

describe('A3.5.2.1 · Instagram is still verified, never assumed', () => {
  it('the callback does not query or store Instagram; selection reads instagram_business_account', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '../../../..');
    const cb = readFileSync(join(root, 'supabase/functions/meta-oauth-callback/handler.ts'), 'utf8');
    const conn = readFileSync(join(root, 'supabase/functions/meta-connection/handler.ts'), 'utf8');
    expect(cb).not.toContain('instagram_business_account');
    expect(conn).toContain('fields=instagram_business_account');
    expect(conn).toMatch(/let instagramStatus: InstagramStatus = "not_associated"/);
  });
});
