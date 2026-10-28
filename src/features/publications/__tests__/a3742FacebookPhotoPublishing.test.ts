import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { META_GRAPH_VERSION, PUBLISH_ERRORS, type PreflightRow } from '../../../../supabase/functions/meta-publishing/handler.ts';
import {
  derivePageToken,
  publishFacebookPhoto,
  readBackPermalink,
} from '../../../../supabase/functions/meta-publishing/facebookPhoto.ts';
import {
  ARMED_FLAG,
  ARMED_USERS,
  MAX_IMAGE_BYTES,
  createFacebookPublishHandler,
  imageMatches,
  isArmed,
  type BeginRow,
  type FacebookContext,
  type FacebookPublishDeps,
  type ImageDownload,
} from '../../../../supabase/functions/meta-publishing/facebookPublish.ts';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BIZ = '33333333-3333-4333-8333-333333333333';
const PUB = '44444444-4444-4444-8444-444444444444';
const IMG = '55555555-5555-4555-8555-555555555555';
const PAGE = '1393994523793266';
const PATH = `${USER}/${BIZ}/${PUB}/${IMG}.jpg`;
const USER_TOKEN = 'EAAuserTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PAGE_TOKEN = 'EAApageTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SECRET = 'app-secret-value';
const CAPTION = 'Texto guardado de Facebook v4';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1]);
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const proof = (token: string) => createHmac('sha256', SECRET).update(token).digest('hex');
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Photo = Response | (() => Promise<Response>);
function metaFetch(photo: Photo = res({ id: '900', post_id: `${PAGE}_901` }), opts: { pageId?: string; readBack?: Response | 'throw' } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/photos')) return typeof photo === 'function' ? photo() : photo.clone();
    if (url.searchParams.get('fields') === 'id,access_token') return res({ id: opts.pageId ?? PAGE, access_token: PAGE_TOKEN });
    if (opts.readBack === 'throw') throw new Error('network');
    return opts.readBack ?? res({ id: url.pathname.split('/').pop(), permalink_url: `https://www.facebook.com/${PAGE}/posts/901`, link: 'https://www.facebook.com/photo/?fbid=900' });
    void init;
  });
}
const photoCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => String(c[0]).endsWith('/photos'));

interface Gate {
  owner: string;
  version: number;
  status: 'publishing' | 'succeeded' | 'failed' | 'unknown' | null;
  statusVersion: number | null;
  errorCode: string | null;
  failedAt: string | null;
  permissions: string[];
  tasks: string[];
  connected: boolean;
  log: string[];
}

function gateIssue(g: Gate, userId: string, v: number): string | null {
  if (userId !== g.owner) return 'INVALID_PUBLICATION_STATE';
  if (!g.connected) return 'CHANNEL_NOT_CONNECTED';
  if (g.status === 'succeeded') return 'ALREADY_PUBLISHED';
  if (g.status === 'unknown') return 'PUBLISH_OUTCOME_UNKNOWN';
  if (g.status === 'publishing') return 'PUBLISH_IN_PROGRESS';
  if (v !== g.version) return 'VERSION_CONFLICT';
  if (!['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'].every((p) => g.permissions.includes(p))) return 'PERMISSION_REQUIRED';
  if (!g.tasks.includes('CREATE_CONTENT')) return 'PERMISSION_REQUIRED';
  return null;
}

function setup(over: Partial<Gate> = {}, deps: Partial<FacebookPublishDeps> = {}, env: Record<string, string> = { [ARMED_FLAG]: 'true', [ARMED_USERS]: USER, META_APP_SECRET: SECRET }) {
  const g: Gate = {
    owner: USER, version: 4, status: null, statusVersion: null, errorCode: null, failedAt: null,
    permissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'], tasks: ['CREATE_CONTENT'], connected: true, log: [], ...over,
  };
  const fetch = metaFetch();
  const image: ImageDownload = { ok: true, bytes: JPEG, contentType: 'image/jpeg' };
  const d: FacebookPublishDeps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'other' ? OTHER : jwt ? USER : null)),
    preflight: vi.fn(async (userId: string, _p: string, v: number): Promise<PreflightRow[]> => {
      g.log.push('preflight');
      return [{
        channel: 'facebook', issue: gateIssue(g, userId, v), draft_version: g.version,
        attempt_status: g.status, attempt_error_code: g.errorCode, meta_object_id: null, permalink: null,
        attempt_updated_at: g.failedAt, attempt_retryable: g.status === 'failed', attempt_verification_required: false,
      }];
    }),
    context: vi.fn(async (userId: string): Promise<FacebookContext | null> => (userId !== g.owner ? null : {
      pageId: PAGE, pageName: 'Página Demo', permissions: g.permissions, pageTasks: g.tasks, caption: CAPTION, version: g.version,
      draftUpdatedAt: '2026-01-01T00:00:00Z',
    })),
    begin: vi.fn(async (userId: string, _p: string, v: number): Promise<BeginRow> => {
      g.log.push('begin');
      const issue = g.status === 'failed' && userId === g.owner && v === g.version ? null : gateIssue(g, userId, v);
      if (issue) return { result: issue, attempt_id: null, draft_version: null, caption: null, image_path: null, image_mime: null, page_id: null };
      g.status = 'publishing';
      g.statusVersion = v;
      return { result: 'OK', attempt_id: 'att-1', draft_version: v, caption: CAPTION, image_path: PATH, image_mime: 'image/jpeg', page_id: PAGE };
    }),
    finish: vi.fn(async (_u: string, _a: string, outcome: 'succeeded' | 'failed' | 'unknown', _o: string | null, _l: string | null, code: string | null) => {
      g.log.push(`finish:${outcome}`);
      g.status = outcome;
      g.errorCode = code;
      if (outcome === 'failed') g.failedAt = '2025-06-01T00:00:00Z';
      return 'ok';
    }),
    readUserToken: vi.fn(async () => USER_TOKEN),
    downloadImage: vi.fn(async () => image),
    env: (n: string) => env[n],
    fetch: fetch as unknown as typeof globalThis.fetch,
    ...deps,
  };
  const handle = createFacebookPublishHandler(d);
  const call = (body: Record<string, unknown>, jwt = 'jwt') =>
    handle(new Request('http://local/meta-publishing', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) }));
  const publish = (extra: Record<string, unknown> = {}, jwt?: string) =>
    call({ action: 'facebook_publish', publicationId: PUB, expectedVersion: 4, ...extra }, jwt);
  return { g, d, fetch: (deps.fetch ?? fetch) as unknown as ReturnType<typeof vi.fn>, call, publish };
}

afterEach(() => vi.restoreAllMocks());

describe('A3.7.4.2 Facebook transport (mocked)', () => {
  const input = (fetch: ReturnType<typeof vi.fn>) => ({
    pageId: PAGE, pageToken: PAGE_TOKEN, appSecret: SECRET, bytes: JPEG, mime: 'image/jpeg' as const, caption: CAPTION,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });

  it('1. POSTs once to the pinned /{page-id}/photos endpoint', async () => {
    const f = metaFetch();
    await publishFacebookPhoto(input(f));
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GRAPH}/${PAGE}/photos`);
    expect(init.method).toBe('POST');
  });

  it('2. multipart body carries exact bytes, caption, published and appsecret_proof', async () => {
    const f = metaFetch();
    await publishFacebookPhoto(input(f));
    const init = (f.mock.calls[0] as unknown[])[1] as RequestInit;
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const source = form.get('source') as Blob;
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(JPEG);
    expect(source.type).toBe('image/jpeg');
    expect(form.get('caption')).toBe(CAPTION);
    expect(form.get('published')).toBe('true');
    expect(form.get('appsecret_proof')).toBe(proof(PAGE_TOKEN));
    expect([...form.keys()].sort()).toEqual(['appsecret_proof', 'caption', 'published', 'source']);
  });

  it('3. uses the Page token in the Authorization header, never in the URL', async () => {
    const f = metaFetch();
    await publishFacebookPhoto(input(f));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${PAGE_TOKEN}`);
    expect(url).not.toContain(PAGE_TOKEN);
  });

  it('4. parses documented id/post_id only on 2xx', async () => {
    expect(await publishFacebookPhoto(input(metaFetch(res({ id: '900', post_id: `${PAGE}_901`, extra: 'x' }))))).toEqual({ kind: 'succeeded', photoId: '900', postId: `${PAGE}_901` });
    expect(await publishFacebookPhoto(input(metaFetch(res({ id: '900' }))))).toEqual({ kind: 'succeeded', photoId: '900', postId: null });
  });

  it('5. malformed 2xx is UNKNOWN, never SUCCEEDED', async () => {
    expect(await publishFacebookPhoto(input(metaFetch(res({ ok: true }))))).toEqual({ kind: 'unknown' });
    expect(await publishFacebookPhoto(input(metaFetch(new Response('not json', { status: 200 }))))).toEqual({ kind: 'unknown' });
  });

  it.each([
    ['explicit rejection', { error: { code: 100 } }, 400, 'META_REJECTED'],
    ['rate limit', { error: { code: 32 } }, 400, 'META_RATE_LIMITED'],
    ['expired token', { error: { code: 190 } }, 400, 'REAUTH_REQUIRED'],
    ['permission', { error: { code: 200 } }, 403, 'PERMISSION_REQUIRED'],
    ['invalid image', { error: { code: 324 } }, 400, 'IMAGE_UNSUPPORTED'],
    ['transient', { error: { code: 2, is_transient: true } }, 400, 'META_TEMPORARY_ERROR'],
  ])('6. %s → FAILED with normalized code', async (_n, body, status, code) => {
    expect(await publishFacebookPhoto(input(metaFetch(res(body, status))))).toEqual({ kind: 'failed', code, sent: true });
  });

  it('7. ambiguous 5xx is UNKNOWN', async () => {
    expect(await publishFacebookPhoto(input(metaFetch(res({ error: { message: 'oops' } }, 503))))).toEqual({ kind: 'unknown' });
  });

  it('8. possibly-sent transport failure (network/timeout) is UNKNOWN and not retried', async () => {
    const f = metaFetch(() => Promise.reject(new TypeError('reset')));
    expect(await publishFacebookPhoto(input(f))).toEqual({ kind: 'unknown' });
    expect(f).toHaveBeenCalledTimes(1);
    const hang = vi.fn((_u: string, i: RequestInit) => new Promise<Response>((_r, rej) => i.signal?.addEventListener('abort', () => rej(new Error('abort')))));
    expect(await publishFacebookPhoto({ ...input(f), fetch: hang as unknown as typeof fetch, timeoutMs: 20 })).toEqual({ kind: 'unknown' });
    expect(hang).toHaveBeenCalledTimes(1);
  });

  it('9. definitely-not-sent invalid input fails with sent=false and no fetch', async () => {
    const f = metaFetch();
    expect(await publishFacebookPhoto({ ...input(f), caption: '' })).toEqual({ kind: 'failed', code: 'INTERNAL_ERROR', sent: false });
    expect(await publishFacebookPhoto({ ...input(f), pageId: 'abc' })).toEqual({ kind: 'failed', code: 'INTERNAL_ERROR', sent: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('10. logs are redacted: no token, proof, raw message or fbtrace_id', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await publishFacebookPhoto(input(metaFetch(res({ error: { code: 100, message: `bad ${PAGE_TOKEN}`, fbtrace_id: 'TRACE123' } }, 400))));
    const out = log.mock.calls.flat().join(' ');
    expect(out).not.toContain(PAGE_TOKEN);
    expect(out).not.toContain('TRACE123');
    expect(out).not.toContain(proof(PAGE_TOKEN));
    expect(out).not.toContain('bad ');
  });

  it('11. derivePageToken uses the vault user token with proof and requires the bound Page id', async () => {
    const f = metaFetch();
    expect(await derivePageToken({ pageId: PAGE, userToken: USER_TOKEN, appSecret: SECRET, fetch: f as unknown as typeof fetch })).toEqual({ ok: true, token: PAGE_TOKEN });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.pathname).toBe(`/${META_GRAPH_VERSION}/${PAGE}`);
    expect(u.searchParams.get('appsecret_proof')).toBe(proof(USER_TOKEN));
    expect(url).not.toContain(USER_TOKEN);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${USER_TOKEN}`);
  });

  it('12. derivePageToken rejects a different Page id and maps failures', async () => {
    expect(await derivePageToken({ pageId: PAGE, userToken: USER_TOKEN, appSecret: SECRET, fetch: metaFetch(undefined, { pageId: '999' }) as unknown as typeof fetch })).toEqual({ ok: false, code: 'PERMISSION_REQUIRED' });
    const down = vi.fn(async () => { throw new Error('x'); });
    expect(await derivePageToken({ pageId: PAGE, userToken: USER_TOKEN, appSecret: SECRET, fetch: down as unknown as typeof fetch })).toEqual({ ok: false, code: 'META_TEMPORARY_ERROR' });
    const expired = vi.fn(async () => res({ error: { code: 190 } }, 400));
    expect(await derivePageToken({ pageId: PAGE, userToken: USER_TOKEN, appSecret: SECRET, fetch: expired as unknown as typeof fetch })).toEqual({ ok: false, code: 'REAUTH_REQUIRED' });
  });

  it('13. read-back verdicts: CONFIRMED / NOT_FOUND / TEMPORARY / AMBIGUOUS', async () => {
    const rb = (r: Response | 'throw', objectId = `${PAGE}_901`) => readBackPermalink({ objectId, pageToken: PAGE_TOKEN, appSecret: SECRET, fetch: metaFetch(undefined, { readBack: r }) as unknown as typeof fetch });
    expect(await rb(res({ id: `${PAGE}_901`, permalink_url: `https://www.facebook.com/${PAGE}/posts/901` }))).toEqual({ verdict: 'CONFIRMED', permalink: `https://www.facebook.com/${PAGE}/posts/901` });
    expect(await rb(res({ error: { code: 100 } }, 400))).toEqual({ verdict: 'NOT_FOUND', permalink: null });
    expect(await rb('throw')).toEqual({ verdict: 'TEMPORARY', permalink: null });
    expect(await rb(res({ id: 'other' }))).toEqual({ verdict: 'AMBIGUOUS', permalink: null });
  });

  it('14. read-back never trusts a non-facebook.com permalink', async () => {
    const r = await readBackPermalink({ objectId: `${PAGE}_901`, pageToken: PAGE_TOKEN, appSecret: SECRET, fetch: metaFetch(undefined, { readBack: res({ id: `${PAGE}_901`, permalink_url: 'https://evil.example/x' }) }) as unknown as typeof fetch });
    expect(r).toEqual({ verdict: 'CONFIRMED', permalink: null });
  });
});

describe('A3.7.4.2 orchestration (mocked)', () => {
  it('15. success: preflight → begin → Meta → finish succeeded', async () => {
    const t = setup();
    const r = await t.publish();
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body).toMatchObject({ ok: true, state: 'SUCCEEDED', meta_object_id: `${PAGE}_901`, verification: 'CONFIRMED' });
    expect(body.permalink).toBe(`https://www.facebook.com/${PAGE}/posts/901`);
    expect(t.g.log).toEqual(['preflight', 'begin', 'finish:succeeded']);
    expect(photoCalls(t.fetch)).toHaveLength(1);
  });

  it('16. attempt begins before any Meta call', async () => {
    const t = setup();
    const order: string[] = [];
    (t.d.begin as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { order.push('begin'); return { result: 'OK', attempt_id: 'a', draft_version: 4, caption: CAPTION, image_path: PATH, image_mime: 'image/jpeg', page_id: PAGE }; });
    t.fetch.mockImplementation(async (u: string) => { order.push(String(u).endsWith('/photos') ? 'photo' : 'read'); return String(u).endsWith('/photos') ? res({ id: '900' }) : res({ id: PAGE, access_token: PAGE_TOKEN }); });
    await t.publish();
    expect(order[0]).toBe('begin');
    expect(order).toContain('photo');
  });

  it.each([
    ['VERSION_CONFLICT', {}, { expectedVersion: 3 }],
    ['PERMISSION_REQUIRED', { permissions: ['pages_show_list', 'pages_read_engagement'] }, {}],
    ['PERMISSION_REQUIRED', { tasks: ['ANALYZE'] }, {}],
    ['CHANNEL_NOT_CONNECTED', { connected: false }, {}],
    ['ALREADY_PUBLISHED', { status: 'succeeded' as const }, {}],
    ['PUBLISH_IN_PROGRESS', { status: 'publishing' as const }, {}],
    ['PUBLISH_OUTCOME_UNKNOWN', { status: 'unknown' as const }, {}],
  ])('17. failed preflight %s → no attempt, 0 Meta calls', async (code, over, extra) => {
    const t = setup(over as Partial<Gate>);
    const body = await (await t.publish(extra)).json();
    expect(body.code).toBe(code);
    expect(t.d.begin).not.toHaveBeenCalled();
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('18. explicit Meta rejection → FAILED persisted', async () => {
    const t = setup({}, { fetch: metaFetch(res({ error: { code: 100 } }, 400)) as unknown as typeof fetch });
    const body = await (await t.publish()).json();
    expect(body).toMatchObject({ ok: false, code: 'META_REJECTED', state: 'FAILED' });
    expect(t.g.log[t.g.log.length - 1]).toBe('finish:failed');
  });

  it('19. ambiguous result → UNKNOWN persisted, 202, no second POST', async () => {
    const f = metaFetch(res({}, 502));
    const t = setup({}, { fetch: f as unknown as typeof fetch });
    const r = await t.publish();
    expect(r.status).toBe(202);
    expect((await r.json()).code).toBe('PUBLISH_OUTCOME_UNKNOWN');
    expect(t.g.status).toBe('unknown');
    expect(photoCalls(f)).toHaveLength(1);
  });

  it('20. explicit retry is allowed only from FAILED', async () => {
    const t = setup({ status: 'failed', errorCode: 'META_TEMPORARY_ERROR', failedAt: '2025-06-01T00:00:00Z' });
    expect((await (await t.publish()).json()).code).toBe('INVALID_PUBLICATION_STATE');
    expect((await (await t.publish({ retry: true })).json()).state).toBe('SUCCEEDED');
    expect(photoCalls(t.fetch)).toHaveLength(1);
    const fresh = setup();
    expect((await (await fresh.publish({ retry: true })).json()).code).toBe('INVALID_PUBLICATION_STATE');
    expect(fresh.fetch).not.toHaveBeenCalled();
  });

  it('21. META_REJECTED retry requires a draft saved after the failure', async () => {
    const t = setup({ status: 'failed', errorCode: 'META_REJECTED', failedAt: '2026-06-01T00:00:00Z' });
    expect((await (await t.publish({ retry: true })).json()).code).toBe('META_REJECTED');
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('22. double click → max one Meta POST', async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.publish(), t.publish()]);
    const codes = [(await a.json()), (await b.json())];
    expect(photoCalls(t.fetch)).toHaveLength(1);
    expect(codes.filter((c) => c.ok === true)).toHaveLength(1);
    expect(codes.filter((c) => c.ok !== true).every((c) => ['PUBLISH_IN_PROGRESS', 'ALREADY_PUBLISHED'].includes(c.code))).toBe(true);
  });

  it('23. concurrent requests → max one Meta POST; retry after SUCCEEDED → 0', async () => {
    const t = setup();
    await Promise.all(Array.from({ length: 5 }, () => t.publish()));
    expect(photoCalls(t.fetch)).toHaveLength(1);
    expect((await (await t.publish()).json()).code).toBe('ALREADY_PUBLISHED');
    expect(photoCalls(t.fetch)).toHaveLength(1);
  });

  it('24. exact saved caption is sent; request caption is rejected', async () => {
    const t = setup();
    await t.publish();
    const form = (photoCalls(t.fetch)[0] as unknown[])[1] as RequestInit;
    expect((form.body as FormData).get('caption')).toBe(CAPTION);
    const t2 = setup();
    const r = await t2.publish({ caption: 'HACK' });
    expect(r.status).toBe(400);
    expect(t2.fetch).not.toHaveBeenCalled();
  });

  it('25. browser-supplied pageId / imagePath / token keys are rejected before any work', async () => {
    for (const key of ['pageId', 'imagePath', 'pageToken', 'armed']) {
      const t = setup();
      expect((await t.publish({ [key]: 'x' })).status).toBe(400);
      expect(t.d.preflight).not.toHaveBeenCalled();
    }
  });

  it('26. foreign user (even when allow-listed) cannot publish another owner publication', async () => {
    const t = setup({}, {}, { [ARMED_FLAG]: 'true', [ARMED_USERS]: `${USER},${OTHER}`, META_APP_SECRET: SECRET });
    const body = await (await t.publish({}, 'other')).json();
    expect(body.code).toBe('INVALID_PUBLICATION_STATE');
    expect(t.d.begin).not.toHaveBeenCalled();
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('27. foreign Page: token derivation returning another Page id blocks the POST', async () => {
    const f = metaFetch(undefined, { pageId: '777' });
    const t = setup({}, { fetch: f as unknown as typeof fetch });
    const body = await (await t.publish()).json();
    expect(body.code).toBe('PERMISSION_REQUIRED');
    expect(photoCalls(f)).toHaveLength(0);
    expect(t.g.status).toBe('failed');
  });

  it('28. UNKNOWN on version N blocks publishing version N+1', async () => {
    const t = setup({ status: 'unknown', statusVersion: 3, version: 4 });
    const body = await (await t.publish({ expectedVersion: 4 })).json();
    expect(body).toMatchObject({ code: 'PUBLISH_OUTCOME_UNKNOWN', state: 'UNKNOWN' });
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('29. finish failure after confirmed creation never reports clean success; read-back failure keeps SUCCEEDED', async () => {
    const t = setup({}, { finish: vi.fn(async () => 'error') });
    const r = await t.publish();
    expect(r.status).toBe(202);
    expect((await r.json()).code).toBe('PUBLISH_OUTCOME_UNKNOWN');
    const t2 = setup({}, { fetch: metaFetch(undefined, { readBack: 'throw' }) as unknown as typeof fetch });
    expect(await (await t2.publish()).json()).toMatchObject({ ok: true, state: 'SUCCEEDED', permalink: null, verification: 'TEMPORARY' });
  });
});

describe('A3.7.4.2 private image (mocked)', () => {
  it('30. bucket stays private and nothing creates a public or signed URL', () => {
    expect(read('supabase/migrations/20261025152315_a371_publications_data_storage_foundation.sql')).toMatch(/'publication-images', 'publication-images', false/);
    const srcs = ['supabase/functions/meta-publishing/facebookPublish.ts', 'supabase/functions/meta-publishing/facebookPhoto.ts', 'supabase/functions/meta-publishing/index.ts', 'src/features/facebook-publish/repository.ts'].map(read).join('\n');
    expect(srcs).not.toMatch(/getPublicUrl|createSignedUrl/);
  });

  it('31. image path comes from server begin row and must match user/publication', async () => {
    const t = setup();
    await t.publish();
    expect(t.d.downloadImage).toHaveBeenCalledWith(PATH, MAX_IMAGE_BYTES);
    const bad = setup({}, { begin: vi.fn(async () => ({ result: 'OK', attempt_id: 'a', draft_version: 4, caption: CAPTION, image_path: `${OTHER}/${BIZ}/${PUB}/${IMG}.jpg`, image_mime: 'image/jpeg', page_id: PAGE })) });
    expect((await (await bad.publish()).json()).code).toBe('IMAGE_UNAVAILABLE');
    expect(bad.d.downloadImage).not.toHaveBeenCalled();
    expect(bad.fetch).not.toHaveBeenCalled();
  });

  it('32. missing / oversized / mismatched image → rejected before POST', async () => {
    const cases: [ImageDownload, string][] = [
      [{ ok: false, reason: 'missing' }, 'IMAGE_UNAVAILABLE'],
      [{ ok: false, reason: 'too_large' }, 'IMAGE_UNSUPPORTED'],
      [{ ok: true, bytes: PNG, contentType: 'image/png' }, 'IMAGE_UNSUPPORTED'],
      [{ ok: true, bytes: JPEG, contentType: 'image/png' }, 'IMAGE_UNSUPPORTED'],
      [{ ok: true, bytes: new Uint8Array(MAX_IMAGE_BYTES + 1), contentType: 'image/jpeg' }, 'IMAGE_UNSUPPORTED'],
    ];
    for (const [image, code] of cases) {
      const t = setup({}, { downloadImage: vi.fn(async () => image) });
      expect((await (await t.publish()).json()).code).toBe(code);
      expect(photoCalls(t.fetch)).toHaveLength(0);
    }
  });

  it('33. PNG is valid for Facebook (no Instagram JPEG-only rule); bytes never returned', async () => {
    expect(imageMatches(PNG, 'image/png')).toBe(true);
    expect(imageMatches(JPEG, 'image/jpeg')).toBe(true);
    expect(imageMatches(JPEG, 'image/png')).toBe(false);
    const t = setup();
    const text = await (await t.publish()).text();
    expect(text).not.toMatch(/source|bytes|base64/);
  });
});

describe('A3.7.4.2 real-publish arming gate', () => {
  it('34. OFF by default: no env → REAL_PUBLISH_DISABLED, 0 RPCs, 0 Meta calls', async () => {
    const t = setup({}, {}, { META_APP_SECRET: SECRET });
    const r = await t.publish();
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, code: 'REAL_PUBLISH_DISABLED', state: 'NOT_REQUESTED' });
    expect(t.d.preflight).not.toHaveBeenCalled();
    expect(t.d.begin).not.toHaveBeenCalled();
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('35. requires both the flag and the user allow-list', () => {
    expect(isArmed(() => undefined, USER)).toBe(false);
    expect(isArmed((n) => (n === ARMED_FLAG ? 'true' : undefined), USER)).toBe(false);
    expect(isArmed((n) => (n === ARMED_USERS ? USER : undefined), USER)).toBe(false);
    expect(isArmed((n) => (n === ARMED_FLAG ? 'TRUE' : USER), USER)).toBe(false);
    expect(isArmed((n) => (n === ARMED_FLAG ? 'true' : OTHER), USER)).toBe(false);
    expect(isArmed((n) => (n === ARMED_FLAG ? 'true' : ` ${USER} `), USER)).toBe(true);
  });

  it('36. request parameters cannot arm it', async () => {
    const t = setup({}, {}, { META_APP_SECRET: SECRET });
    for (const extra of [{ armed: true }, { [ARMED_FLAG]: 'true' }, { realPublish: true }]) {
      expect((await t.publish(extra)).status).toBe(400);
    }
    expect((await (await t.publish({ retry: true })).json()).code).toBe('REAL_PUBLISH_DISABLED');
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('37. browser code has no arming switch (URL / localStorage / sessionStorage)', () => {
    const client = ['src/features/facebook-publish/repository.ts', 'src/features/facebook-publish/FacebookPublishHarness.tsx', 'src/features/facebook-publish/copy.ts'].map(read).join('\n');
    expect(client).not.toMatch(/META_FACEBOOK_REAL_PUBLISH|localStorage|sessionStorage|URLSearchParams|location\.search|import\.meta\.env/);
  });

  it('38. automated tests never arm: process env carries no arming flag', () => {
    expect(process.env[ARMED_FLAG]).toBeUndefined();
    expect(process.env[ARMED_USERS]).toBeUndefined();
  });
});

describe('A3.7.4.2 status + boundaries', () => {
  it('39. status reports armed=false, permissions and CREATE_CONTENT without tokens', async () => {
    const t = setup({ permissions: ['pages_show_list', 'pages_read_engagement'], tasks: [] }, {}, { META_APP_SECRET: SECRET });
    const r = await t.call({ action: 'facebook_publish_status', publicationId: PUB, expectedVersion: 4 });
    const text = await r.text();
    const body = JSON.parse(text);
    expect(body).toMatchObject({ ok: true, armed: false, page: { id: PAGE, name: 'Página Demo' }, create_content: false, caption: CAPTION, version: 4 });
    expect(body.permissions).toEqual({ pages_show_list: true, pages_read_engagement: true, pages_manage_posts: false });
    expect(body.facebook).toMatchObject({ channel: 'facebook', can_publish: false, issue: 'PERMISSION_REQUIRED' });
    expect(text).not.toMatch(/EAA|appsecret|access_token/);
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('40. no client-side Graph calls or Meta secrets', () => {
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(join(ROOT, dir), { withFileTypes: true }).forEach((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); } else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    });
    walk('src');
    const all = files.map(read).join('\n');
    expect(all).not.toContain('graph.facebook.com');
    expect(all).not.toMatch(/appsecret|META_APP_SECRET/i);
  });

  it('41. no Instagram publishing endpoints or /feed in the Facebook path', () => {
    const server = read('supabase/functions/meta-publishing/facebookPhoto.ts') + read('supabase/functions/meta-publishing/facebookPublish.ts');
    expect(server).not.toMatch(/media_publish|\/media\b|\/feed\b|attached_media/);
    expect(server).not.toMatch(/for\s*\(|while\s*\(/);
  });

  it('42. reuses the pinned Graph version and the frozen 15-code taxonomy', () => {
    expect(META_GRAPH_VERSION).toBe('v25.0');
    expect(Object.keys(PUBLISH_ERRORS)).toHaveLength(15);
    expect(Object.keys(PUBLISH_ERRORS)).not.toContain('REAL_PUBLISH_DISABLED');
  });

  it('43. harness is mounted on the hidden route only', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/lazy\(\(\) => import\('\.\/features\/facebook-publish\/FacebookPublishHarness'\)\)/);
    expect(app.match(/<FbHarness \/>/g)).toHaveLength(1);
    expect(app).not.toMatch(/path=["'][^"']*facebook/i);
  });

  it('44. unauthenticated and malformed requests are rejected', async () => {
    const t = setup();
    expect((await t.publish({}, '')).status).toBe(401);
    expect((await t.call({ action: 'facebook_publish', publicationId: 'nope', expectedVersion: 4 })).status).toBe(400);
    expect((await (await t.call({ action: 'facebook_publish', publicationId: PUB, expectedVersion: 0 })).json()).code).toBe('VERSION_CONFLICT');
    expect(t.fetch).not.toHaveBeenCalled();
  });
});
