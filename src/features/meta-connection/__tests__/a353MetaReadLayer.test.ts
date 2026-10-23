import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  createHandler,
  classifyMetaError,
  countOrNull,
  isoOrNull,
  normalizeFacebookPost,
  normalizeInstagramMedia,
  MAX_ITEMS,
  MAX_PAGES,
  SYNC_COOLDOWN_SECONDS,
  type ApplyParams,
  type ClaimResult,
  type ContentItem,
} from '../../../../supabase/functions/meta-read/handler.ts';
import { createHandler as createStart, META_SCOPES } from '../../../../supabase/functions/meta-oauth-start/handler.ts';
import { syncLine } from '../metaSyncStatus';

const SECRET = 'app-secret-value-XYZ';
const USER_TOKEN = 'EAAlongLivedUserToken123';
const PAGE_TOKEN = 'EAApageAccessToken456';
const USER_PROOF = createHmac('sha256', SECRET).update(USER_TOKEN).digest('hex');
const PAGE_PROOF = createHmac('sha256', SECRET).update(PAGE_TOKEN).digest('hex');
const ENV: Record<string, string> = { META_APP_ID: '1234567890', META_APP_SECRET: SECRET };
const PAGE = '111';
const IG = '17841400000000001';
const NOW = new Date('2026-10-22T12:00:00Z');

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const metaError = (code: number, status = 400) => jsonRes({ error: { code, message: 'x', type: 'OAuthException' } }, status);

function spyLogs() {
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
  ];
  return () => spies.flatMap((s) => s.mock.calls.flat()).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
}

afterEach(() => vi.restoreAllMocks());

interface Conn {
  id: string;
  userId: string;
  status: string;
  pageId: string | null;
  igStatus: string;
  igId: string | null;
  tokenExpiresAt: string | null;
  token: string | null;
}

const fbPost = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `${PAGE}_${n}`,
  message: `Post ${n}`,
  created_time: '2026-10-01T10:00:00+0000',
  permalink_url: `https://www.facebook.com/${PAGE}/posts/${n}`,
  status_type: 'added_photos',
  reactions: { data: [], summary: { total_count: n } },
  comments: { data: [], summary: { total_count: 0 } },
  ...extra,
});

const igMedia = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `1790000000000${n}`,
  caption: `Foto ${n}`,
  media_type: 'IMAGE',
  media_product_type: 'FEED',
  permalink: `https://www.instagram.com/p/abc${n}/`,
  timestamp: '2026-10-02T09:30:00+0000',
  like_count: n,
  comments_count: 0,
  ...extra,
});

type Route = (url: URL) => Response | undefined;

function setup(opts: {
  conns?: Conn[];
  routes?: Route[];
  cooldown?: boolean;
} = {}) {
  const conns: Conn[] = opts.conns ?? [{
    id: 'conn-a', userId: 'user-a', status: 'connected', pageId: PAGE, igStatus: 'connected', igId: IG,
    tokenExpiresAt: '2026-12-01T00:00:00Z', token: USER_TOKEN,
  }];
  const items = new Map<string, Map<string, ContentItem>>();
  const state = new Map<string, { status: string; errorCode: string | null; itemCount: number | null; lastSuccess: boolean }>();
  const applied: ApplyParams[] = [];
  const failed: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const urls: URL[] = [];

  const defaults: Route = (url) => {
    const p = url.pathname.replace(/^\/v25\.0/, '');
    const fields = url.searchParams.get('fields') ?? '';
    if (p === `/${PAGE}` && fields === 'access_token') return jsonRes({ id: PAGE, access_token: PAGE_TOKEN });
    if (p === `/${PAGE}`) return jsonRes({ id: PAGE, name: 'Panadería Sol', category: 'Bakery', fan_count: 120, link: 'https://www.facebook.com/sol' });
    if (p === `/${PAGE}/published_posts`) return jsonRes({ data: [fbPost(1), fbPost(2)] });
    if (p === `/${IG}`) return jsonRes({ id: IG, username: 'panaderiasol', followers_count: 300, media_count: 2 });
    if (p === `/${IG}/media`) return jsonRes({ data: [igMedia(1), igMedia(2)] });
    return undefined;
  };

  const fetchFn = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input));
    urls.push(url);
    for (const r of [...(opts.routes ?? []), defaults]) {
      const res = r(url);
      if (res) return res;
    }
    return metaError(803, 404);
  });

  const handle = createHandler({
    getUserId: async (jwt) => (jwt.startsWith('jwt-') ? jwt.slice(4) : null),
    getOwnConnectionId: async (userId) => conns.find((c) => c.userId === userId)?.id ?? null,
    claim: async (connectionId, userId, cooldownSeconds): Promise<ClaimResult> => {
      expect(cooldownSeconds).toBe(SYNC_COOLDOWN_SECONDS);
      const c = conns.find((x) => x.id === connectionId);
      const none = { pageId: null, instagramStatus: null, instagramAccountId: null, tokenExpiresAt: null };
      if (!c || c.userId !== userId || c.status !== 'connected' || !c.pageId) return { result: 'not_connected', ...none };
      if (opts.cooldown) return { result: 'cooldown', ...none };
      return { result: 'ok', pageId: c.pageId, instagramStatus: c.igStatus, instagramAccountId: c.igId, tokenExpiresAt: c.tokenExpiresAt };
    },
    readToken: async (id) => conns.find((c) => c.id === id)?.token ?? null,
    apply: async (p) => {
      applied.push(p);
      const c = conns.find((x) => x.id === p.connectionId);
      if (!c || c.userId !== p.userId || c.status !== 'connected') return false;
      const expected = p.platform === 'facebook' ? c.pageId : c.igStatus === 'connected' ? c.igId : null;
      const key = `${c.id}:${p.platform}`;
      if (p.status === 'not_linked') {
        if (p.platform !== 'instagram' || expected) return false;
        items.delete(key);
        state.set(key, { status: 'not_linked', errorCode: null, itemCount: null, lastSuccess: false });
        return true;
      }
      if (!expected || p.accountId !== expected) return false;
      const prev = state.get(key);
      if (p.status === 'ok' || p.status === 'empty') {
        const current = items.get(key) ?? new Map();
        const next = new Map<string, ContentItem>();
        for (const i of p.items) next.set(i.external_id, i);
        for (const id of current.keys()) if (!next.has(id)) current.delete(id);
        for (const [id, i] of next) current.set(id, i);
        items.set(key, current);
        state.set(key, { status: current.size ? 'ok' : 'empty', errorCode: null, itemCount: current.size, lastSuccess: true });
        return true;
      }
      state.set(key, { status: p.status, errorCode: p.errorCode, itemCount: prev?.itemCount ?? null, lastSuccess: prev?.lastSuccess ?? false });
      return true;
    },
    failConnection: async (id, status) => {
      failed.push(`${id}:${status}`);
      const c = conns.find((x) => x.id === id);
      if (c) c.status = status;
    },
    env: (n) => ENV[n],
    fetch: fetchFn as unknown as typeof fetch,
    now: () => NOW,
    log: (e) => logs.push(e),
  });

  const sync = (user = 'user-a', body: Record<string, unknown> = { action: 'sync' }) =>
    handle(new Request('https://x/functions/v1/meta-read', {
      method: 'POST',
      headers: { Authorization: `Bearer jwt-${user}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));

  return { handle, sync, conns, items, state, applied, failed, logs, urls, fetchFn };
}

const path = (u: URL) => u.pathname.replace(/^\/v25\.0/, '');

describe('A3.5.3 read layer — Facebook', () => {
  it('reads Page profile and recent posts with real counts', async () => {
    const t = setup();
    const res = await t.sync();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.facebook).toEqual({ status: 'ok', itemCount: 2, errorCode: null });
    const fb = t.applied.find((a) => a.platform === 'facebook')!;
    expect(fb.accountId).toBe(PAGE);
    expect(fb.profile).toMatchObject({ name: 'Panadería Sol', category: 'Bakery', fan_count: 120, followers_count: null });
    expect(fb.items[0]).toEqual({
      external_id: `${PAGE}_1`, content_type: 'photo', text_content: 'Post 1',
      published_at: '2026-10-01T10:00:00.000Z', permalink: `https://www.facebook.com/${PAGE}/posts/1`,
      reaction_count: 1, comment_count: 0,
    });
  });

  it('uses the Page access token with its own appsecret_proof for Page reads', async () => {
    const t = setup();
    await t.sync();
    const tokenCall = t.urls.find((u) => path(u) === `/${PAGE}` && u.searchParams.get('fields') === 'access_token')!;
    expect(tokenCall.searchParams.get('appsecret_proof')).toBe(USER_PROOF);
    const posts = t.urls.find((u) => path(u) === `/${PAGE}/published_posts`)!;
    expect(posts.searchParams.get('appsecret_proof')).toBe(PAGE_PROOF);
    const init = t.fetchFn.mock.calls.find(([u]) => String(u).includes('published_posts'))![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${PAGE_TOKEN}`);
    for (const u of t.urls) expect(u.searchParams.has('access_token')).toBe(false);
  });

  it('Page with no posts is legitimately empty, not an error', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${PAGE}/published_posts` ? jsonRes({ data: [] }) : undefined)] });
    const body = await (await t.sync()).json();
    expect(body.facebook).toEqual({ status: 'empty', itemCount: 0, errorCode: null });
  });

  it('falls back to posts without counts when engagement summaries are denied', async () => {
    const t = setup({
      routes: [(u) => {
        if (path(u) !== `/${PAGE}/published_posts`) return undefined;
        if ((u.searchParams.get('fields') ?? '').includes('reactions')) return metaError(10, 403);
        const { reactions: _r, comments: _c, ...plain } = fbPost(1);
        return jsonRes({ data: [plain] });
      }],
    });
    const body = await (await t.sync()).json();
    expect(body.facebook.status).toBe('ok');
    const basic = t.applied.find((a) => a.platform === 'facebook')!;
    expect(basic.items.every((i) => i.reaction_count === null && i.comment_count === null)).toBe(true);
  });

  it('missing Page token is reported as permission_unavailable', async () => {
    const t = setup({ routes: [(u) => (u.searchParams.get('fields') === 'access_token' ? jsonRes({ id: PAGE }) : undefined)] });
    const body = await (await t.sync()).json();
    expect(body.facebook).toEqual({ status: 'permission_unavailable', itemCount: null, errorCode: 'PAGE_TOKEN_UNAVAILABLE' });
  });
});

describe('A3.5.3 read layer — Instagram', () => {
  it('reads IG profile and media with real like/comment counts', async () => {
    const t = setup();
    const body = await (await t.sync()).json();
    expect(body.instagram).toEqual({ status: 'ok', itemCount: 2, errorCode: null });
    const ig = t.applied.find((a) => a.platform === 'instagram')!;
    expect(ig.accountId).toBe(IG);
    expect(ig.profile).toMatchObject({ username: 'panaderiasol', followers_count: 300, follows_count: null, media_count: 2 });
    expect(ig.items[1]).toEqual({
      external_id: '17900000000002', content_type: 'image', text_content: 'Foto 2',
      published_at: '2026-10-02T09:30:00.000Z', permalink: 'https://www.instagram.com/p/abc2/',
      reaction_count: 2, comment_count: 0,
    });
    const media = t.urls.find((u) => path(u) === `/${IG}/media`)!;
    expect(media.searchParams.get('appsecret_proof')).toBe(USER_PROOF);
  });

  it('IG with no media is empty', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${IG}/media` ? jsonRes({ data: [] }) : undefined)] });
    const body = await (await t.sync()).json();
    expect(body.instagram).toEqual({ status: 'empty', itemCount: 0, errorCode: null });
  });

  it('IG not linked: no IG Graph calls and status not_linked', async () => {
    const t = setup({
      conns: [{ id: 'conn-a', userId: 'user-a', status: 'connected', pageId: PAGE, igStatus: 'not_associated', igId: null, tokenExpiresAt: null, token: USER_TOKEN }],
    });
    const body = await (await t.sync()).json();
    expect(body.instagram).toEqual({ status: 'not_linked', itemCount: null, errorCode: null });
    expect(t.urls.some((u) => path(u).startsWith(`/${IG}`))).toBe(false);
  });

  it('IG id present but IG status not connected is treated as not linked', async () => {
    const t = setup({
      conns: [{ id: 'conn-a', userId: 'user-a', status: 'connected', pageId: PAGE, igStatus: 'permission_unavailable', igId: IG, tokenExpiresAt: null, token: USER_TOKEN }],
    });
    const body = await (await t.sync()).json();
    expect(body.instagram.status).toBe('not_linked');
    expect(t.urls.some((u) => path(u).startsWith(`/${IG}`))).toBe(false);
  });

  it('maps VIDEO/REELS/CAROUSEL media types', () => {
    expect(normalizeInstagramMedia(igMedia(1, { media_type: 'VIDEO', media_product_type: 'REELS' }))!.content_type).toBe('reel');
    expect(normalizeInstagramMedia(igMedia(1, { media_type: 'VIDEO' }))!.content_type).toBe('video');
    expect(normalizeInstagramMedia(igMedia(1, { media_type: 'CAROUSEL_ALBUM' }))!.content_type).toBe('carousel');
    expect(normalizeInstagramMedia(igMedia(1, { media_type: 'NEW_THING' }))!.content_type).toBe('other');
  });
});

describe('A3.5.3 read layer — token expiry and reauth', () => {
  it('expired token_expires_at: no Graph calls, reauth_required, connection marked', async () => {
    const t = setup({
      conns: [{ id: 'conn-a', userId: 'user-a', status: 'connected', pageId: PAGE, igStatus: 'connected', igId: IG, tokenExpiresAt: '2026-10-01T00:00:00Z', token: USER_TOKEN }],
    });
    const res = await t.sync();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('REAUTH_REQUIRED');
    expect(t.fetchFn).not.toHaveBeenCalled();
    expect(t.failed).toEqual(['conn-a:reauth_required']);
    expect(t.applied.map((a) => `${a.platform}:${a.status}`)).toEqual(['facebook:reauth_required', 'instagram:reauth_required']);
  });

  it('Graph code 190 mid-sync: reauth_required, previous data kept but not marked fresh', async () => {
    const t = setup();
    await t.sync();
    expect(t.state.get('conn-a:facebook')).toMatchObject({ status: 'ok', itemCount: 2, lastSuccess: true });
    const t2routes: Route[] = [(u) => (path(u) === `/${PAGE}/published_posts` ? metaError(190, 401) : undefined)];
    const again = setup({ routes: t2routes });
    again.state.set('conn-a:facebook', { status: 'ok', errorCode: null, itemCount: 2, lastSuccess: true });
    const res = await again.sync();
    expect(res.status).toBe(401);
    expect(again.state.get('conn-a:facebook')).toMatchObject({ status: 'reauth_required', errorCode: 'REAUTH_REQUIRED', itemCount: 2 });
    expect(again.applied.every((a) => a.items.length === 0)).toBe(true);
    expect(again.failed).toEqual(['conn-a:reauth_required']);
  });

  it('missing Vault token is reauth_required', async () => {
    const t = setup({
      conns: [{ id: 'conn-a', userId: 'user-a', status: 'connected', pageId: PAGE, igStatus: 'connected', igId: IG, tokenExpiresAt: null, token: null }],
    });
    expect((await t.sync()).status).toBe(401);
    expect(t.fetchFn).not.toHaveBeenCalled();
  });
});

describe('A3.5.3 read layer — errors', () => {
  it('insufficient permission on IG is per-platform and keeps FB ok', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${IG}` ? metaError(10, 403) : undefined)] });
    const body = await (await t.sync()).json();
    expect(body.facebook.status).toBe('ok');
    expect(body.instagram).toEqual({ status: 'permission_unavailable', itemCount: null, errorCode: 'META_PERMISSION_DENIED' });
  });

  it.each([4, 17, 32, 613])('rate limit code %i -> rate_limited', async (code) => {
    const t = setup({ routes: [(u) => (path(u) === `/${PAGE}/published_posts` ? metaError(code) : undefined)] });
    const body = await (await t.sync()).json();
    expect(body.facebook).toEqual({ status: 'rate_limited', itemCount: null, errorCode: 'META_RATE_LIMITED' });
  });

  it('non-array data is malformed', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${IG}/media` ? jsonRes({ data: { nope: 1 } }) : undefined)] });
    const body = await (await t.sync()).json();
    expect(body.instagram).toEqual({ status: 'malformed', itemCount: null, errorCode: 'META_MALFORMED_RESPONSE' });
  });

  it('non-JSON body is malformed', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${PAGE}/published_posts` ? new Response('<html>', { status: 200 }) : undefined)] });
    expect((await (await t.sync()).json()).facebook.status).toBe('malformed');
  });

  it('rows with no valid id are all rejected -> malformed', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${IG}/media` ? jsonRes({ data: [{ id: 'abc' }, { caption: 'x' }] }) : undefined)] });
    expect((await (await t.sync()).json()).instagram.status).toBe('malformed');
  });

  it('account id mismatch in profile response is malformed', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${IG}` ? jsonRes({ id: '999', username: 'other' }) : undefined)] });
    const body = await (await t.sync()).json();
    expect(body.instagram).toEqual({ status: 'malformed', itemCount: null, errorCode: 'META_ACCOUNT_MISMATCH' });
  });

  it('5xx without Meta error body is api_error', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${PAGE}/published_posts` ? new Response('', { status: 502 }) : undefined)] });
    expect((await (await t.sync()).json()).facebook).toEqual({ status: 'api_error', itemCount: null, errorCode: 'META_API_ERROR' });
  });

  it('network failure is api_error', async () => {
    const t = setup({
      routes: [(u) => {
        if (path(u) === `/${IG}/media`) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        return undefined;
      }],
    });
    const body = await (await t.sync()).json();
    expect(body.instagram.status).toBe('api_error');
  });

  it('classifies Meta codes', () => {
    expect(classifyMetaError(190).status).toBe('reauth_required');
    expect(classifyMetaError(200).status).toBe('permission_unavailable');
    expect(classifyMetaError(299).status).toBe('permission_unavailable');
    expect(classifyMetaError(100).errorCode).toBe('META_UNSUPPORTED');
    expect(classifyMetaError(1).status).toBe('api_error');
  });

  it('all error codes fit the stored error_code format', () => {
    for (const c of [190, 4, 10, 100, 1, NaN]) expect(classifyMetaError(c).errorCode).toMatch(/^[A-Z_]{1,64}$/);
  });

  it('cooldown returns 429 without Graph calls', async () => {
    const t = setup({ cooldown: true });
    const res = await t.sync();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('SYNC_COOLDOWN');
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('missing app config returns 503', async () => {
    const t = setup();
    delete ENV.META_APP_SECRET;
    try {
      expect((await t.sync()).status).toBe(503);
    } finally {
      ENV.META_APP_SECRET = SECRET;
    }
  });

  it('rejects unknown actions and unauthenticated calls', async () => {
    const t = setup();
    expect((await t.sync('user-a', { action: 'post' })).status).toBe(400);
    const anon = await t.handle(new Request('https://x', { method: 'POST', body: '{}' }));
    expect(anon.status).toBe(401);
    const pre = await t.handle(new Request('https://x', { method: 'OPTIONS' }));
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('A3.5.3 read layer — pagination', () => {
  it('follows paging.next on graph.facebook.com up to MAX_PAGES', async () => {
    let page = 0;
    const t = setup({
      routes: [(u) => {
        if (path(u) !== `/${IG}/media`) return undefined;
        page++;
        return jsonRes({
          data: Array.from({ length: 10 }, (_, i) => igMedia(page * 100 + i)),
          paging: { next: `https://graph.facebook.com/v25.0/${IG}/media?after=c${page}&access_token=LEAK` },
        });
      }],
    });
    const body = await (await t.sync()).json();
    expect(page).toBe(MAX_PAGES);
    expect(body.instagram.itemCount).toBe(MAX_PAGES * 10);
    const calls = t.urls.filter((u) => path(u) === `/${IG}/media`);
    for (const c of calls) {
      expect(c.searchParams.has('access_token')).toBe(false);
      expect(c.searchParams.get('appsecret_proof')).toBe(USER_PROOF);
    }
  });

  it('stops at MAX_ITEMS', async () => {
    let page = 0;
    const t = setup({
      routes: [(u) => {
        if (path(u) !== `/${IG}/media`) return undefined;
        page++;
        return jsonRes({
          data: Array.from({ length: 60 }, (_, i) => igMedia(page * 1000 + i)),
          paging: { next: `https://graph.facebook.com/v25.0/${IG}/media?after=c${page}` },
        });
      }],
    });
    const body = await (await t.sync()).json();
    expect(page).toBe(2);
    expect(body.instagram.itemCount).toBe(MAX_ITEMS);
  });

  it('stops on a repeated cursor (loop protection)', async () => {
    let page = 0;
    const t = setup({
      routes: [(u) => {
        if (path(u) !== `/${IG}/media`) return undefined;
        page++;
        return jsonRes({ data: [igMedia(page)], paging: { next: `https://graph.facebook.com/v25.0/${IG}/media?after=SAME` } });
      }],
    });
    await t.sync();
    expect(page).toBe(2);
  });

  it('refuses next links to foreign hosts or other edges', async () => {
    for (const next of [
      'https://evil.example.com/v25.0/x/media?after=1',
      `http://graph.facebook.com/v25.0/${IG}/media?after=1`,
      `https://graph.facebook.com/v25.0/${IG}/tags?after=1`,
      'not a url',
    ]) {
      const t = setup({ routes: [(u) => (path(u) === `/${IG}/media` ? jsonRes({ data: [igMedia(1)], paging: { next } }) : undefined)] });
      await t.sync();
      expect(t.urls.filter((u) => u.hostname !== 'graph.facebook.com')).toHaveLength(0);
      expect(t.urls.filter((u) => path(u).startsWith(`/${IG}/`))).toHaveLength(1);
    }
  });

  it('error on a later page fails the platform instead of storing partial data', async () => {
    let page = 0;
    const t = setup({
      routes: [(u) => {
        if (path(u) !== `/${IG}/media`) return undefined;
        page++;
        return page === 1
          ? jsonRes({ data: [igMedia(1)], paging: { next: `https://graph.facebook.com/v25.0/${IG}/media?after=c1` } })
          : metaError(4);
      }],
    });
    const body = await (await t.sync()).json();
    expect(body.instagram.status).toBe('rate_limited');
    expect(t.applied.find((a) => a.platform === 'instagram')!.items).toEqual([]);
  });
});

describe('A3.5.3 read layer — null vs zero and dedup', () => {
  it('keeps real zeros and leaves missing counts null', () => {
    const zero = normalizeFacebookPost(fbPost(0))!;
    expect(zero.reaction_count).toBe(0);
    expect(zero.comment_count).toBe(0);
    const missing = normalizeFacebookPost({ id: `${PAGE}_9` })!;
    expect(missing).toEqual({
      external_id: `${PAGE}_9`, content_type: 'post', text_content: null, published_at: null, permalink: null,
      reaction_count: null, comment_count: null,
    });
    const hidden = normalizeInstagramMedia(igMedia(3, { like_count: undefined }))!;
    expect(hidden.reaction_count).toBeNull();
    expect(hidden.comment_count).toBe(0);
  });

  it('never coerces invalid counts', () => {
    for (const v of [-1, 1.5, '3', null, undefined, NaN, Infinity]) expect(countOrNull(v)).toBeNull();
    expect(countOrNull(0)).toBe(0);
  });

  it('rejects non-https permalinks and invalid dates', () => {
    const item = normalizeInstagramMedia(igMedia(1, { permalink: 'javascript:alert(1)', timestamp: 'yesterday' }))!;
    expect(item.permalink).toBeNull();
    expect(item.published_at).toBeNull();
    expect(isoOrNull('2026-10-02T09:30:00+0000')).toBe('2026-10-02T09:30:00.000Z');
  });

  it('truncates long text to the stored limit', () => {
    expect(normalizeFacebookPost(fbPost(1, { message: 'a'.repeat(6000) }))!.text_content).toHaveLength(5000);
  });

  it('dedups repeated ids within a response and across syncs', async () => {
    const t = setup({ routes: [(u) => (path(u) === `/${IG}/media` ? jsonRes({ data: [igMedia(1), igMedia(1), igMedia(2)] }) : undefined)] });
    const body = await (await t.sync()).json();
    expect(body.instagram.itemCount).toBe(2);
    expect(t.applied.find((a) => a.platform === 'instagram')!.items).toHaveLength(2);
    await t.sync();
    expect(t.items.get('conn-a:instagram')!.size).toBe(2);
  });
});

describe('A3.5.3 read layer — isolation and credential protection', () => {
  const two = (): Conn[] => [
    { id: 'conn-a', userId: 'user-a', status: 'connected', pageId: PAGE, igStatus: 'connected', igId: IG, tokenExpiresAt: null, token: USER_TOKEN },
    { id: 'conn-b', userId: 'user-b', status: 'connected', pageId: '222', igStatus: 'connected', igId: '17841400000000002', tokenExpiresAt: null, token: 'EAAotherUserToken' },
  ];

  it('client-supplied Page/IG ids are ignored; only the caller’s own server-stored ids are read', async () => {
    const t = setup({ conns: two() });
    await t.sync('user-a', { action: 'sync', pageId: '222', instagramAccountId: '17841400000000002', connectionId: 'conn-b' });
    expect(t.urls.some((u) => path(u).includes('222') || path(u).includes('17841400000000002'))).toBe(false);
    expect(t.applied.every((a) => a.connectionId === 'conn-a' && a.userId === 'user-a')).toBe(true);
    for (const call of t.fetchFn.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('EAAotherUserToken');
    }
  });

  it('a user without a connection cannot read anyone else', async () => {
    const t = setup({ conns: two() });
    const res = await t.sync('user-c');
    expect(res.status).toBe(409);
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('a non-connected connection is refused', async () => {
    const conns = two();
    conns[0].status = 'reauth_required';
    const t = setup({ conns });
    expect((await t.sync()).status).toBe(409);
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('a connection changed during sync is reported as conflict, nothing stored', async () => {
    const t = setup({ routes: [(u) => {
      if (path(u) === `/${PAGE}/published_posts`) t.conns[0].pageId = '333';
      return undefined;
    }] });
    const body = await (await t.sync()).json();
    expect(body.facebook).toEqual({ status: 'conflict', itemCount: null, errorCode: 'CONNECTION_CHANGED' });
    expect(t.items.get('conn-a:facebook')).toBeUndefined();
  });

  it('no tokens, secret or proofs in responses, stored payloads or logs', async () => {
    const read = spyLogs();
    const scenarios: Route[][] = [
      [],
      [(u) => (path(u) === `/${PAGE}/published_posts` ? metaError(190, 401) : undefined)],
      [(u) => (path(u) === `/${IG}/media` ? new Response('garbage') : undefined)],
    ];
    for (const routes of scenarios) {
      const t = setup({ routes });
      const res = await t.sync();
      const text = await res.text();
      const dump = [text, JSON.stringify(t.applied), JSON.stringify(t.logs), read()].join('\n');
      for (const s of [USER_TOKEN, PAGE_TOKEN, SECRET, USER_PROOF, PAGE_PROOF]) expect(dump).not.toContain(s);
    }
  });

  it('logs carry platform, endpoint, counts, pages, duration and result only', async () => {
    const t = setup();
    await t.sync();
    const media = t.logs.find((l) => l.endpoint === 'ig_media')!;
    expect(Object.keys(media).sort()).toEqual(['durationMs', 'endpoint', 'fn', 'items', 'metaCode', 'pages', 'platform', 'result']);
    expect(media).toMatchObject({ platform: 'instagram', pages: 1, items: 2, result: 'ok', metaCode: null });
    const failing = setup({ routes: [(u) => (path(u) === `/${IG}` ? metaError(10, 403) : undefined)] });
    await failing.sync();
    expect(failing.logs.find((l) => l.endpoint === 'ig_profile')).toMatchObject({ metaCode: 10, result: 'permission_unavailable' });
  });

  it('stores no raw Graph payload fields', async () => {
    const t = setup();
    await t.sync();
    for (const a of t.applied) {
      for (const i of a.items) {
        expect(Object.keys(i).sort()).toEqual(['comment_count', 'content_type', 'external_id', 'permalink', 'published_at', 'reaction_count', 'text_content']);
      }
      expect(JSON.stringify(a.profile)).not.toContain('access_token');
    }
  });
});

describe('A3.5.3 — A3.5.2 contracts preserved', () => {
  it('OAuth scopes are unchanged (four permissions, no new ones)', () => {
    expect([...META_SCOPES].sort()).toEqual(['business_management', 'instagram_basic', 'pages_read_engagement', 'pages_show_list']);
    expect(typeof createStart).toBe('function');
  });

  it('read layer uses only GET reads (no posting or mutations)', async () => {
    const t = setup();
    await t.sync();
    for (const [, init] of t.fetchFn.mock.calls) expect((init as RequestInit | undefined)?.method ?? 'GET').toBe('GET');
    const edges = new Set(t.urls.map((u) => path(u).replace(/\d+/g, ':id')));
    expect([...edges].sort()).toEqual(['/:id', '/:id/media', '/:id/published_posts']);
  });
});

describe('A3.5.3 — UI status never shows stale data as fresh', () => {
  const base = { error_code: null, last_attempt_at: '2026-10-22T10:00:00Z' };

  it('ok shows real count and last sync', () => {
    const l = syncLine({ ...base, platform: 'facebook', status: 'ok', item_count: 12, last_success_at: '2026-10-22T10:00:00Z' }, 'facebook', 'es');
    expect(l).toMatchObject({ tone: 'ok', summary: '12 publicaciones' });
    expect(l.detail).toContain('Última sincronización');
  });

  it('empty is not an error', () => {
    expect(syncLine({ ...base, platform: 'instagram', status: 'empty', item_count: 0, last_success_at: '2026-10-22T10:00:00Z' }, 'instagram', 'en'))
      .toMatchObject({ tone: 'ok', summary: 'No recent posts' });
  });

  it('error after a previous success is labelled as old data, never as last sync', () => {
    const l = syncLine({ ...base, platform: 'facebook', status: 'reauth_required', error_code: 'REAUTH_REQUIRED', item_count: 5, last_success_at: '2026-10-01T10:00:00Z' }, 'facebook', 'en');
    expect(l.tone).toBe('warning');
    expect(l.summary).toBe('You need to reconnect with Meta');
    expect(l.detail).toContain('Data from the last successful sync');
    expect(l.detail).not.toContain('Last sync:');
  });

  it('error with no prior success says no data, no invented count', () => {
    const l = syncLine({ ...base, platform: 'instagram', status: 'rate_limited', item_count: null, last_success_at: null }, 'instagram', 'en');
    expect(l).toEqual({ tone: 'warning', summary: 'Meta is temporarily limiting requests. Try again later', detail: 'No synced data' });
  });

  it('never synced and not linked', () => {
    expect(syncLine(undefined, 'facebook', 'es').summary).toBe('Aún no sincronizado');
    expect(syncLine({ ...base, platform: 'instagram', status: 'not_linked', item_count: null, last_success_at: null }, 'instagram', 'es').summary)
      .toBe('Sin cuenta vinculada');
  });
});
