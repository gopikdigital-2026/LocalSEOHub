import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as jpeg from 'jpeg-js';
import {
  META_GRAPH_VERSION, instagramReadModel, redact, type PreflightRow,
} from '../../../../supabase/functions/instagram-publishing/shared.ts';
import {
  IG_MAX_RATIO, IG_MAX_WIDTH, IG_MIN_RATIO, buildDerivative, jpegMetadataMarkers, planDerivative, probe,
  type Codecs,
} from '../../../../supabase/functions/instagram-publishing/derivative.ts';
import {
  POLL_INTERVAL_MS, POLL_MAX_CHECKS, createContainer, derivePageToken, publishContainer, waitForContainer,
} from '../../../../supabase/functions/instagram-publishing/graph.ts';
import {
  ARMED_FLAG, ARMED_USERS, SIGNED_URL_TTL_SECONDS, createInstagramPublishHandler, isArmed,
  type BeginRow, type ImageDownload, type InstagramContext, type InstagramPublishDeps, type Stage,
} from '../../../../supabase/functions/instagram-publishing/instagramPublish.ts';

const UPNG = createRequire(import.meta.url)('upng-js') as {
  decode(b: ArrayBuffer): { width: number; height: number };
  toRGBA8(img: unknown): ArrayBuffer[];
  encode(bufs: ArrayBuffer[], w: number, h: number, ps: number): ArrayBuffer;
};

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const MIGRATION = read('supabase/migrations/20261030232253_a3743_instagram_container_state.sql');
const IG_DIR = 'supabase/functions/instagram-publishing';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BIZ = '33333333-3333-4333-8333-333333333333';
const PUB = '44444444-4444-4444-8444-444444444444';
const IMG = '55555555-5555-4555-8555-555555555555';
const ATT = '66666666-6666-4666-8666-666666666666';
const PAGE = '1393994523793266';
const IG = '17841462487279994';
const CONTAINER = '18012345678901234';
const MEDIA = '18098765432109876';
const USER_TOKEN = 'EAAuserTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PAGE_TOKEN = 'EAApageTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SECRET = 'app-secret-value';
const CAPTION = 'Texto guardado de Instagram v4 #local';
const SIGNED_TOKEN = 'eyJsignedDerivativeTokenSECRET123';
const signedUrl = (path: string) => `https://proj.supabase.co/storage/v1/object/sign/instagram-derivatives/${path}?token=${SIGNED_TOKEN}`;
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const PERMALINK = 'https://www.instagram.com/p/ABC123/';
const IG_PERMS = ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'];
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// ---------- real image fixtures ----------
type Px = [number, number, number, number];
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
function pixels(w: number, h: number, fill: (x: number, y: number) => Px) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fill(x, y), (y * w + x) * 4);
  return d;
}
const grey = (): Px => [128, 128, 128, 255];
const segment = (marker: number, payload: Uint8Array) =>
  concat(new Uint8Array([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload);
const tiff = (orientation: number) => concat(
  new Uint8Array([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]),
  ascii('GPS-SECRET-LOCATION'),
);
const exifSegment = (o: number) => segment(0xe1, concat(ascii('Exif\0\0'), tiff(o)));
const xmpSegment = () => segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>XMP-SECRET</x:xmpmeta>'));
const iptcSegment = () => segment(0xed, ascii('Photoshop 3.0\0IPTC-SECRET'));

function makeJpeg(w: number, h: number, fill: (x: number, y: number) => Px = grey, segments: Uint8Array[] = [], comments?: string[]) {
  const enc = new Uint8Array(jpeg.encode({ data: pixels(w, h, fill), width: w, height: h, comments }, 92).data);
  return concat(enc.subarray(0, 2), ...segments, enc.subarray(2));
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (b: Uint8Array) => { let c = 0xffffffff; for (const v of b) c = t[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
const u32be = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const pngChunk = (type: string, data: Uint8Array) => { const td = concat(ascii(type), data); return concat(u32be(data.length), td, u32be(CRC(td))); };

function makePng(w: number, h: number, fill: (x: number, y: number) => Px = grey, chunks: Uint8Array[] = []) {
  const px = pixels(w, h, fill);
  const b = new Uint8Array(UPNG.encode([px.buffer.slice(px.byteOffset, px.byteOffset + px.byteLength)], w, h, 0));
  return concat(b.subarray(0, 33), ...chunks, b.subarray(33));
}

const codecs: Codecs = {
  decodeJpeg(bytes, maxMegapixels) {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: maxMegapixels, maxMemoryUsageInMB: 400 });
    return { width: img.width, height: img.height, data: img.data };
  },
  decodePng(bytes) {
    const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return { width: img.width, height: img.height, data: new Uint8Array(UPNG.toRGBA8(img)[0]) };
  },
  encodeJpeg(image, quality) {
    return new Uint8Array(jpeg.encode({ data: image.data, width: image.width, height: image.height }, quality).data);
  },
};
const decodeOut = (b: Uint8Array) => jpeg.decode(b, { useTArray: true, formatAsRGBA: true });
const pixelAt = (img: { width: number; data: Uint8Array }, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (got: number[], want: number[], tol = 40) => got.every((v, k) => Math.abs(v - want[k]) <= tol);
const has = (hay: Uint8Array, needle: string) => Buffer.from(hay).includes(Buffer.from(needle));

const BASE_JPEG = makeJpeg(800, 600);

// ---------- fake database (mirrors the migration's RPC semantics) ----------
interface Row {
  id: string; owner: string; channel: 'facebook' | 'instagram';
  status: 'publishing' | 'succeeded' | 'failed' | 'unknown';
  stage: Stage; container: string | null; errorCode: string | null; metaObjectId: string | null; startedAt: string;
}
const RANK: Record<Stage, number> = { none: 0, container_requested: 1, container_created: 2, publish_requested: 3 };

function fakeAdvance(rows: Row[], userId: string, attemptId: string, stage: string, containerId: string | null): string {
  const row = rows.find((r) => r.id === attemptId && r.owner === userId);
  if (!row) return 'not_found';
  if (row.channel !== 'instagram') return 'invalid_channel';
  if (row.status !== 'publishing') return 'invalid_transition';
  if (!(stage in RANK) || stage === 'none') return 'invalid_payload';
  if (RANK[stage as Stage] !== RANK[row.stage] + 1) return 'invalid_transition';
  if (stage === 'container_created') { if (!containerId || !/^[0-9]{1,32}$/.test(containerId)) return 'invalid_payload'; }
  else if (containerId !== null) return 'invalid_payload';
  row.stage = stage as Stage;
  if (stage === 'container_created') row.container = containerId;
  return 'ok';
}

interface Gate {
  owner: string; version: number; igAccount: boolean; permissions: string[]; caption: string | null;
  image: { path: string; mime: string } | null; fbStatus: Row['status'] | null; failedAt: string | null;
  rows: Row[]; finishBreaksOnSuccess: boolean;
}
const igRow = (g: Gate) => [...g.rows].reverse().find((r) => r.channel === 'instagram') ?? null;

function igIssue(g: Gate, userId: string, v: number): string | null {
  const row = igRow(g);
  if (userId !== g.owner) return 'INVALID_PUBLICATION_STATE';
  if (!g.igAccount) return 'CHANNEL_NOT_CONNECTED';
  if (row?.status === 'succeeded') return 'ALREADY_PUBLISHED';
  if (row?.status === 'unknown') return 'PUBLISH_OUTCOME_UNKNOWN';
  if (row?.status === 'publishing') return 'PUBLISH_IN_PROGRESS';
  if (v !== g.version) return 'VERSION_CONFLICT';
  if (!g.caption) return 'INVALID_PUBLICATION_STATE';
  if (!g.image) return 'IMAGE_UNAVAILABLE';
  if (!IG_PERMS.every((p) => g.permissions.includes(p))) return 'PERMISSION_REQUIRED';
  return null;
}

interface MetaOpts {
  container?: Response | 'throw';
  statuses?: string[];
  publish?: Response | 'throw';
  listing?: Response;
  pageIg?: string;
}
function metaFetch(o: MetaOpts = {}) {
  const statuses = [...(o.statuses ?? ['FINISHED'])];
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const fields = url.searchParams.get('fields');
    if (init?.method === 'POST' && url.pathname.endsWith(`/${IG}/media`)) {
      if (o.container === 'throw') throw new Error('network reset');
      return (o.container ?? res({ id: CONTAINER })).clone();
    }
    if (init?.method === 'POST' && url.pathname.endsWith(`/${IG}/media_publish`)) {
      if (o.publish === 'throw') throw new Error('network reset');
      return (o.publish ?? res({ id: MEDIA })).clone();
    }
    if (fields === 'id,access_token,instagram_business_account') {
      return res({ id: PAGE, access_token: PAGE_TOKEN, instagram_business_account: { id: o.pageIg ?? IG } });
    }
    if (fields === 'status_code') return res({ status_code: statuses.length > 1 ? statuses.shift() : statuses[0] });
    if (fields === 'id,permalink') return res({ id: MEDIA, permalink: PERMALINK });
    if (fields === 'id,caption,timestamp,permalink') return (o.listing ?? res({ data: [] })).clone();
    return res({ error: { code: 100 } }, 400);
  });
}
type FetchMock = ReturnType<typeof metaFetch>;
const posts = (f: FetchMock) => f.mock.calls.filter((c) => c[1]?.method === 'POST');
const postsTo = (f: FetchMock, suffix: string) => posts(f).filter((c) => new URL(String(c[0])).pathname.endsWith(suffix));

const ARMED_ENV = { [ARMED_FLAG]: 'true', [ARMED_USERS]: USER, META_APP_SECRET: SECRET };

function setup(over: Partial<Gate> = {}, meta: MetaOpts = {}, deps: Partial<InstagramPublishDeps> = {}, env: Record<string, string> = ARMED_ENV) {
  const g: Gate = {
    owner: USER, version: 4, igAccount: true, permissions: [...IG_PERMS], caption: CAPTION,
    image: { path: `${USER}/${BIZ}/${PUB}/${IMG}.jpg`, mime: 'image/jpeg' }, fbStatus: null, failedAt: null,
    rows: [], finishBreaksOnSuccess: false, ...over,
  };
  const fetch = metaFetch(meta);
  const store = new Map<string, Uint8Array>();
  const original: ImageDownload = { ok: true, bytes: BASE_JPEG, contentType: 'image/jpeg' };
  let n = 0;
  const d: InstagramPublishDeps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'other' ? OTHER : jwt ? USER : null)),
    preflight: vi.fn(async (userId: string, _p: string, v: number): Promise<PreflightRow[]> => {
      const row = igRow(g);
      return [
        { channel: 'facebook', issue: g.fbStatus === 'succeeded' ? 'ALREADY_PUBLISHED' : null, draft_version: g.version, attempt_status: g.fbStatus,
          attempt_error_code: null, meta_object_id: null, permalink: null, attempt_updated_at: null, attempt_retryable: false, attempt_verification_required: false },
        { channel: 'instagram', issue: igIssue(g, userId, v), draft_version: g.version, attempt_status: row?.status ?? null,
          attempt_error_code: row?.errorCode ?? null, meta_object_id: row?.metaObjectId ?? null, permalink: null,
          attempt_updated_at: g.failedAt, attempt_retryable: row?.status === 'failed', attempt_verification_required: row?.status === 'unknown' },
      ];
    }),
    context: vi.fn(async (userId: string): Promise<InstagramContext | null> => {
      if (userId !== g.owner) return null;
      const row = igRow(g);
      return {
        pageId: PAGE, igUserId: g.igAccount ? IG : null, igUsername: g.igAccount ? 'localseohub.io' : null, permissions: g.permissions,
        caption: g.caption, version: g.version, draftUpdatedAt: '2026-01-01T00:00:00Z', image: g.image,
        attempt: row ? { id: row.id, status: row.status, externalStage: row.stage, containerStored: row.container !== null, startedAt: row.startedAt } : null,
      };
    }),
    begin: vi.fn(async (userId: string, _p: string, v: number): Promise<BeginRow> => {
      const last = igRow(g);
      const issue = last?.status === 'failed' && userId === g.owner && v === g.version ? null : igIssue(g, userId, v);
      if (issue) return { result: issue, attempt_id: null, draft_version: null, caption: null, image_path: null, image_mime: null, page_id: null, instagram_account_id: null };
      const id = n++ === 0 ? ATT : `${ATT.slice(0, -1)}${n}`;
      g.rows.push({ id, owner: userId, channel: 'instagram', status: 'publishing', stage: 'none', container: null, errorCode: null, metaObjectId: null, startedAt: '2026-11-01T10:00:00Z' });
      return { result: 'OK', attempt_id: id, draft_version: v, caption: g.caption, image_path: g.image?.path ?? null, image_mime: g.image?.mime ?? null, page_id: PAGE, instagram_account_id: IG };
    }),
    advance: vi.fn(async (userId: string, attemptId: string, stage: Exclude<Stage, 'none'>, containerId: string | null) => fakeAdvance(g.rows, userId, attemptId, stage, containerId)),
    finish: vi.fn(async (_u: string, attemptId: string, outcome: 'succeeded' | 'failed' | 'unknown', objectId: string | null, _l: string | null, code: string | null) => {
      const row = g.rows.find((r) => r.id === attemptId);
      if (!row || row.status !== 'publishing') return 'invalid_transition';
      if (outcome === 'succeeded' && (g.finishBreaksOnSuccess || row.stage !== 'publish_requested')) return 'error';
      row.status = outcome;
      row.errorCode = code;
      row.metaObjectId = objectId;
      if (outcome === 'failed') g.failedAt = '2025-06-01T00:00:00Z';
      return 'ok';
    }),
    markStale: vi.fn(async (attemptId: string, staleBefore: string) => {
      const row = g.rows.find((r) => r.id === attemptId);
      if (!row || row.status !== 'publishing' || !(row.startedAt < staleBefore)) return false;
      row.status = 'unknown';
      return true;
    }),
    recordVerification: vi.fn(async (_u: string, attemptId: string, verdict: 'found' | 'absent' | 'inconclusive', mediaId: string | null) => {
      const row = g.rows.find((r) => r.id === attemptId);
      if (!row || row.status !== 'unknown') return 'invalid_transition';
      if (verdict === 'found') { if (row.stage !== 'publish_requested') return 'invalid_payload'; row.status = 'succeeded'; row.metaObjectId = mediaId; }
      if (verdict === 'absent') { row.status = 'failed'; row.errorCode = 'META_TEMPORARY_ERROR'; }
      return 'ok';
    }),
    readUserToken: vi.fn(async () => USER_TOKEN),
    downloadImage: vi.fn(async () => original),
    storeDerivative: vi.fn(async (path: string, bytes: Uint8Array) => { store.set(path, bytes); return true; }),
    signDerivative: vi.fn(async (path: string) => signedUrl(path)),
    removeDerivative: vi.fn(async (path: string) => { store.delete(path); }),
    codecs,
    env: (k: string) => env[k],
    fetch: fetch as unknown as typeof globalThis.fetch,
    sleep: vi.fn(async () => undefined),
    now: () => Date.parse('2026-11-01T10:10:00Z'),
    ...deps,
  };
  const handle = createInstagramPublishHandler(d);
  const call = (body: Record<string, unknown>, jwt = 'jwt') =>
    handle(new Request('http://local/instagram-publishing', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) }));
  const publish = (extra: Record<string, unknown> = {}, jwt?: string) => call({ action: 'instagram_publish', publicationId: PUB, expectedVersion: 4, ...extra }, jwt);
  const status = (jwt?: string) => call({ action: 'instagram_publish_status', publicationId: PUB, expectedVersion: 4 }, jwt);
  const verify = () => call({ action: 'instagram_publish_verify', publicationId: PUB, expectedVersion: 4 });
  return { g, d, fetch, store, call, publish, status, verify };
}
type Setup = ReturnType<typeof setup>;
const noWrites = (s: Setup) => {
  expect(posts(s.fetch)).toHaveLength(0);
  expect(s.d.advance).not.toHaveBeenCalled();
};

afterEach(() => vi.restoreAllMocks());

describe('A3.7.4.3 preflight, ownership and content', () => {
  it('T01 missing instagram_content_publish blocks before any write', async () => {
    const s = setup({ permissions: IG_PERMS.filter((p) => p !== 'instagram_content_publish') });
    const r = await s.publish();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('PERMISSION_REQUIRED');
    expect(s.d.begin).not.toHaveBeenCalled();
    noWrites(s);
    const st = await (await s.status()).json();
    expect(st.permissions.instagram_content_publish).toBe(false);
  });

  it('T02 missing instagram_basic blocks before any write', async () => {
    const s = setup({ permissions: IG_PERMS.filter((p) => p !== 'instagram_basic') });
    expect((await (await s.publish()).json()).code).toBe('PERMISSION_REQUIRED');
    expect(s.d.begin).not.toHaveBeenCalled();
    noWrites(s);
    expect((await (await s.status()).json()).permissions.instagram_basic).toBe(false);
  });

  it('T03 no Instagram account: preflight and Page link both fail closed', async () => {
    const s = setup({ igAccount: false });
    expect((await (await s.publish()).json()).code).toBe('CHANNEL_NOT_CONNECTED');
    noWrites(s);
    const relinked = await derivePageToken({ pageId: PAGE, igUserId: IG, userToken: USER_TOKEN, appSecret: SECRET, fetch: metaFetch({ pageIg: '999' }) as unknown as typeof fetch });
    expect(relinked).toEqual({ ok: false, code: 'CHANNEL_NOT_CONNECTED' });
  });

  it('T04 foreign user cannot read status or publish', async () => {
    const s = setup({}, {}, {}, { ...ARMED_ENV, [ARMED_USERS]: `${USER},${OTHER}` });
    expect((await s.status('other')).status).toBe(404);
    const r = await s.publish({}, 'other');
    expect((await r.json()).code).toBe('INVALID_PUBLICATION_STATE');
    expect(s.d.begin).not.toHaveBeenCalled();
    noWrites(s);
  });

  it('T05 stale draft version is rejected', async () => {
    const s = setup();
    const r = await s.publish({ expectedVersion: 3 });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe('VERSION_CONFLICT');
    noWrites(s);
  });

  it('T06 missing Instagram draft text: no AI, no Facebook fallback, no write', async () => {
    const s = setup({ caption: null });
    expect((await (await s.publish()).json()).code).toBe('INVALID_PUBLICATION_STATE');
    noWrites(s);
    const rows: Row[] = [];
    const blank = setup({ rows }, {}, {
      begin: vi.fn(async () => {
        rows.push({ id: ATT, owner: USER, channel: 'instagram', status: 'publishing', stage: 'none', container: null, errorCode: null, metaObjectId: null, startedAt: '2026-11-01T10:00:00Z' });
        return { result: 'OK', attempt_id: ATT, draft_version: 4, caption: '   ', image_path: `${USER}/${BIZ}/${PUB}/${IMG}.jpg`, image_mime: 'image/jpeg', page_id: PAGE, instagram_account_id: IG };
      }),
    });
    const r = await blank.publish();
    expect((await r.json()).state).toBe('FAILED');
    noWrites(blank);
    expect(read(`${IG_DIR}/index.ts`)).toMatch(/draft\?\.instagram_text|instagram_text/);
    expect(read(`${IG_DIR}/index.ts`)).not.toMatch(/facebook_text/);
  });

  it('T07 image unavailable fails closed before /media', async () => {
    const s = setup({}, {}, { downloadImage: vi.fn(async (): Promise<ImageDownload> => ({ ok: false, reason: 'missing' })) });
    const body = await (await s.publish()).json();
    expect(body.code).toBe('IMAGE_UNAVAILABLE');
    expect(posts(s.fetch)).toHaveLength(0);
    expect(s.g.rows[0].stage).toBe('none');
  });

  it('T08 unsupported image: too small, garbage or non-JPEG/PNG never reaches Meta', async () => {
    expect(buildDerivative(makeJpeg(200, 200), 'image/jpeg', codecs)).toEqual({ ok: false, reason: 'source_too_small' });
    expect(buildDerivative(new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2]), 'image/jpeg', codecs)).toEqual({ ok: false, reason: 'unreadable_header' });
    const tiny = setup({}, {}, { downloadImage: vi.fn(async (): Promise<ImageDownload> => ({ ok: true, bytes: makeJpeg(200, 200), contentType: 'image/jpeg' })) });
    expect((await (await tiny.publish()).json()).code).toBe('IMAGE_UNSUPPORTED');
    expect(posts(tiny.fetch)).toHaveLength(0);
    const gif = setup({ image: { path: `${USER}/${BIZ}/${PUB}/${IMG}.jpg`, mime: 'image/gif' } });
    expect((await (await gif.publish()).json()).state).toBe('FAILED');
    expect(posts(gif.fetch)).toHaveLength(0);
    expect(MIGRATION).toMatch(/instagram_image_derivable[\s\S]*image\/jpeg[\s\S]*image\/png/);
  });
});

describe('A3.7.4.3 JPEG derivative (real codecs)', { timeout: 60_000 }, () => {
  it('T09 PNG becomes an opaque JPEG; transparency composited onto white', () => {
    const png = makePng(600, 500, (x) => (x < 300 ? [0, 0, 0, 0] : [0, 120, 255, 255]));
    const out = buildDerivative(png, 'image/png', codecs);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect([out.bytes[0], out.bytes[1]]).toEqual([0xff, 0xd8]);
    expect([out.width, out.height, out.mode]).toEqual([600, 500, 'none']);
    const img = decodeOut(out.bytes);
    expect(near(pixelAt(img, 100, 250), [255, 255, 255])).toBe(true);
    expect(near(pixelAt(img, 500, 250), [0, 120, 255])).toBe(true);
  });

  it('T10 JPEG becomes a compliant derivative: max width 1440, no upscaling, deterministic', () => {
    const big = makeJpeg(1800, 1200);
    const a = buildDerivative(big, 'image/jpeg', codecs);
    const b = buildDerivative(big, 'image/jpeg', codecs);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect([a.width, a.height]).toEqual([IG_MAX_WIDTH, 960]);
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
    expect(a.bytes.byteLength).toBeLessThan(8 * 1024 * 1024);
    const small = buildDerivative(makeJpeg(400, 400), 'image/jpeg', codecs);
    expect(small.ok && [small.width, small.height]).toEqual([400, 400]);
  });

  it('T11 too-tall image is centre-cropped to 4:5 with no bars', () => {
    const tall = makeJpeg(400, 1000, (_x, y) => (y < 300 ? [255, 0, 0, 255] : y < 700 ? [0, 255, 0, 255] : [0, 0, 255, 255]));
    const out = buildDerivative(tall, 'image/jpeg', codecs);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.mode).toBe('tall_center_crop_4x5');
    expect(out.width).toBe(400);
    expect(out.width / out.height).toBeGreaterThanOrEqual(IG_MIN_RATIO);
    const img = decodeOut(out.bytes);
    expect(near(pixelAt(img, 200, 2), [255, 0, 0])).toBe(true);
    expect(near(pixelAt(img, 200, Math.floor(out.height / 2)), [0, 255, 0])).toBe(true);
    expect(near(pixelAt(img, 200, out.height - 3), [0, 0, 255])).toBe(true);
    const c = planDerivative(1086, 1448);
    expect(c?.mode).toBe('tall_center_crop_4x5');
    expect(c && c.width / c.height).toBeGreaterThanOrEqual(IG_MIN_RATIO);
  });

  it('T12 too-wide image is centre-cropped to 1.91:1 with no bars', () => {
    const wide = makeJpeg(2000, 400, (x) => (x < 700 ? [255, 0, 0, 255] : x < 1300 ? [0, 255, 0, 255] : [0, 0, 255, 255]));
    const plan = planDerivative(2000, 400)!;
    expect(plan.mode).toBe('wide_center_crop_191x100');
    expect(plan.crop.x).toBe(Math.floor((2000 - plan.crop.width) / 2));
    const out = buildDerivative(wide, 'image/jpeg', codecs);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.height).toBe(400);
    expect(out.width / out.height).toBeLessThanOrEqual(IG_MAX_RATIO);
    const img = decodeOut(out.bytes);
    expect(near(pixelAt(img, 2, 200), [255, 0, 0])).toBe(true);
    expect(near(pixelAt(img, Math.floor(out.width / 2), 200), [0, 255, 0])).toBe(true);
    expect(near(pixelAt(img, out.width - 3, 200), [0, 0, 255])).toBe(true);
  });

  it('T13 compliant image is not cropped (A and B dimensions included)', () => {
    const out = buildDerivative(BASE_JPEG, 'image/jpeg', codecs);
    expect(out.ok && [out.width, out.height, out.mode]).toEqual([800, 600, 'none']);
    expect(planDerivative(785, 522)).toMatchObject({ mode: 'none', width: 785, height: 522 });
    expect(planDerivative(1175, 655)).toMatchObject({ mode: 'none', width: 1175, height: 655 });
  });

  it('T14 metadata removed, orientation applied, original untouched', () => {
    const src = makeJpeg(400, 600, grey, [exifSegment(6), xmpSegment(), iptcSegment()], ['COMMENT-SECRET']);
    const before = Buffer.from(src);
    expect(probe(src, 'image/jpeg')?.orientation).toBe(6);
    expect(jpegMetadataMarkers(src).length).toBeGreaterThan(0);
    const out = buildDerivative(src, 'image/jpeg', codecs);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect([out.width, out.height]).toEqual([600, 400]);
    expect(jpegMetadataMarkers(out.bytes)).toEqual([]);
    for (const s of ['Exif', 'GPS-SECRET', 'XMP-SECRET', 'IPTC-SECRET', 'COMMENT-SECRET', 'ns.adobe.com']) expect(has(out.bytes, s)).toBe(false);
    expect(Buffer.from(src).equals(before)).toBe(true);
    const png = makePng(500, 400, grey, [pngChunk('eXIf', tiff(1)), pngChunk('tEXt', ascii('Comment\0PNG-SECRET'))]);
    const pngOut = buildDerivative(png, 'image/png', codecs);
    expect(pngOut.ok).toBe(true);
    if (pngOut.ok) {
      expect(jpegMetadataMarkers(pngOut.bytes)).toEqual([]);
      expect(has(pngOut.bytes, 'PNG-SECRET') || has(pngOut.bytes, 'GPS-SECRET')).toBe(false);
    }
  });

  it('T14b derivative fails closed on codec errors and oversize output', () => {
    const throwing: Codecs = { ...codecs, decodeJpeg: () => { throw new Error('bad'); } };
    expect(buildDerivative(BASE_JPEG, 'image/jpeg', throwing)).toEqual({ ok: false, reason: 'decode_failed' });
    const huge: Codecs = { ...codecs, encodeJpeg: () => new Uint8Array(9 * 1024 * 1024) };
    expect(buildDerivative(BASE_JPEG, 'image/jpeg', huge)).toEqual({ ok: false, reason: 'output_too_large' });
    const dirty: Codecs = { ...codecs, encodeJpeg: () => makeJpeg(800, 600, grey, [exifSegment(1)]) };
    expect(buildDerivative(BASE_JPEG, 'image/jpeg', dirty)).toEqual({ ok: false, reason: 'output_verification_failed' });
  });
});

describe('A3.7.4.3 signed URL handling', () => {
  it('T15 signed URL: private bucket, 600 s TTL, sent only as image_url to /media, redacted', async () => {
    const s = setup();
    const r = await s.publish();
    const text = await r.text();
    expect(SIGNED_URL_TTL_SECONDS).toBe(600);
    expect(s.d.signDerivative).toHaveBeenCalledWith(`${USER}/${BIZ}/${PUB}/${ATT}.jpg`, 600);
    const media = postsTo(s.fetch, `/${IG}/media`);
    expect((media[0][1]!.body as URLSearchParams).get('image_url')).toContain(SIGNED_TOKEN);
    const others = s.fetch.mock.calls.filter((c) => c !== media[0]);
    for (const c of others) expect(String(c[0]) + String(c[1]?.body ?? '')).not.toContain(SIGNED_TOKEN);
    expect(text).not.toContain(SIGNED_TOKEN);
    expect(redact(`fetch ${signedUrl('a/b.jpg')} failed`)).not.toContain(SIGNED_TOKEN);
    expect(redact(`image_url=${encodeURIComponent(signedUrl('a.jpg'))}`)).not.toContain(SIGNED_TOKEN);
    expect(MIGRATION).toMatch(/'instagram-derivatives',\s*'instagram-derivatives',\s*false,\s*8388608/);
    expect(MIGRATION).not.toMatch(/CREATE POLICY/i);
  });

  it('T16 signed URL never logged, persisted or kept; derivative removed after terminal state', async () => {
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const s = setup({}, { publish: 'throw' });
    await s.publish();
    const persisted = JSON.stringify([
      (s.d.advance as ReturnType<typeof vi.fn>).mock.calls, (s.d.finish as ReturnType<typeof vi.fn>).mock.calls, s.g.rows,
    ]);
    expect(persisted).not.toContain(SIGNED_TOKEN);
    expect(persisted).not.toContain('object/sign');
    for (const c of logs.mock.calls) expect(c.join(' ')).not.toContain(SIGNED_TOKEN);
    expect(s.d.removeDerivative).toHaveBeenCalledWith(`${USER}/${BIZ}/${PUB}/${ATT}.jpg`);
    expect(s.store.size).toBe(0);
    for (const f of readdirSync(join(ROOT, 'src/features/instagram-publish'))) {
      if (f.endsWith('.ts') || f.endsWith('.tsx')) expect(read(`src/features/instagram-publish/${f}`)).not.toMatch(/createSignedUrl|signedUrl|image_url/);
    }
    expect(read(`${IG_DIR}/index.ts`)).toMatch(/createSignedUrl\(path, ttl/);
  });
});

describe('A3.7.4.3 container lifecycle (mocked Graph)', () => {
  it('T17 container create success: form POST with proof, token never in URL', async () => {
    const f = metaFetch();
    const out = await createContainer({ token: PAGE_TOKEN, appSecret: SECRET, fetch: f as unknown as typeof fetch, igUserId: IG, imageUrl: 'https://x.test/a.jpg', caption: CAPTION });
    expect(out).toEqual({ kind: 'created', id: CONTAINER });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe(`${GRAPH}/${IG}/media`);
    expect(String(url)).not.toContain(PAGE_TOKEN);
    const body = init!.body as URLSearchParams;
    expect(body.get('caption')).toBe(CAPTION);
    expect(body.get('appsecret_proof')).toBe(createHmac('sha256', SECRET).update(PAGE_TOKEN).digest('hex'));
    expect(body.get('access_token')).toBeNull();
  });

  it('T18 container definite failure: FAILED, no media_publish, no container stored', async () => {
    const s = setup({}, { container: res({ error: { code: 100, message: 'bad' } }, 400) });
    const body = await (await s.publish()).json();
    expect([body.state, body.code]).toEqual(['FAILED', 'META_REJECTED']);
    expect(postsTo(s.fetch, '/media_publish')).toHaveLength(0);
    expect(s.g.rows[0]).toMatchObject({ stage: 'container_requested', container: null, status: 'failed' });
    expect(s.store.size).toBe(0);
  });

  it('T19 container ambiguous (transport, 5xx, malformed): UNKNOWN, verification required', async () => {
    for (const container of ['throw', res({ error: { code: 2 } }, 503), res({ ok: true })] as const) {
      const s = setup({}, { container });
      const r = await s.publish();
      const body = await r.json();
      expect(r.status).toBe(202);
      expect([body.state, body.verification_required, body.retryable]).toEqual(['UNKNOWN', true, false]);
      expect(postsTo(s.fetch, '/media_publish')).toHaveLength(0);
      expect(s.g.rows[0]).toMatchObject({ stage: 'container_requested', container: null, status: 'unknown' });
    }
  });

  it('T20 container id persisted exactly once, before polling', async () => {
    const s = setup();
    await s.publish();
    const calls = (s.d.advance as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[2], c[3]]);
    expect(calls).toEqual([['container_requested', null], ['container_created', CONTAINER], ['publish_requested', null]]);
    expect(s.g.rows[0].container).toBe(CONTAINER);
  });

  it('T21 stage cannot move backwards or skip', () => {
    const rows: Row[] = [{ id: ATT, owner: USER, channel: 'instagram', status: 'publishing', stage: 'container_created', container: CONTAINER, errorCode: null, metaObjectId: null, startedAt: '' }];
    expect(fakeAdvance(rows, USER, ATT, 'container_requested', null)).toBe('invalid_transition');
    rows[0].stage = 'none'; rows[0].container = null;
    expect(fakeAdvance(rows, USER, ATT, 'publish_requested', null)).toBe('invalid_transition');
    expect(MIGRATION).toMatch(/v_new_rank < v_old_rank THEN\s*RAISE EXCEPTION 'publish_attempt_stage_backwards'/);
    expect(MIGRATION).toMatch(/IF v_to <> v_from \+ 1 THEN\s*RETURN 'invalid_transition'/);
    expect(MIGRATION).toMatch(/RAISE EXCEPTION 'publish_attempt_stage_frozen'/);
  });

  it('T22 container id cannot be replaced or erased', () => {
    const rows: Row[] = [{ id: ATT, owner: USER, channel: 'instagram', status: 'publishing', stage: 'container_created', container: CONTAINER, errorCode: null, metaObjectId: null, startedAt: '' }];
    expect(fakeAdvance(rows, USER, ATT, 'container_created', '999')).toBe('invalid_transition');
    expect(fakeAdvance(rows, USER, ATT, 'publish_requested', '999')).toBe('invalid_payload');
    expect(rows[0].container).toBe(CONTAINER);
    expect(MIGRATION).toMatch(/OLD\.meta_container_id IS NOT NULL AND NEW\.meta_container_id IS DISTINCT FROM OLD\.meta_container_id THEN\s*RAISE EXCEPTION 'publish_attempt_container_immutable'/);
    expect(MIGRATION).toMatch(/\^\[0-9\]\{1,32\}\$/);
  });

  it('T23 container not ready: bounded polling, then FAILED/UNKNOWN, never media_publish', async () => {
    const sleep = vi.fn(async () => undefined);
    const f = metaFetch({ statuses: ['IN_PROGRESS'] });
    expect(await waitForContainer({ token: PAGE_TOKEN, appSecret: SECRET, fetch: f as unknown as typeof fetch, containerId: CONTAINER, sleep })).toBe('IN_PROGRESS');
    expect(f).toHaveBeenCalledTimes(POLL_MAX_CHECKS);
    expect(sleep).toHaveBeenCalledTimes(POLL_MAX_CHECKS - 1);
    expect(sleep).toHaveBeenCalledWith(POLL_INTERVAL_MS);
    for (const [st, state, code] of [['IN_PROGRESS', 'FAILED', 'META_TEMPORARY_ERROR'], ['ERROR', 'FAILED', 'META_REJECTED'], ['EXPIRED', 'FAILED', 'META_TEMPORARY_ERROR'], ['PUBLISHED', 'UNKNOWN', 'PUBLISH_OUTCOME_UNKNOWN']]) {
      const s = setup({}, { statuses: [st] });
      const body = await (await s.publish()).json();
      expect([body.state, body.code]).toEqual([state, code]);
      expect(postsTo(s.fetch, '/media_publish')).toHaveLength(0);
      expect(s.g.rows[0]).toMatchObject({ stage: 'container_created', container: CONTAINER });
    }
  });

  it('T24 container ready after polling proceeds to media_publish', async () => {
    const s = setup({}, { statuses: ['IN_PROGRESS', 'FINISHED'] });
    const body = await (await s.publish()).json();
    expect(body.state).toBe('SUCCEEDED');
    expect(s.fetch.mock.calls.filter((c) => new URL(String(c[0])).searchParams.get('fields') === 'status_code')).toHaveLength(2);
  });
});

describe('A3.7.4.3 media_publish and UNKNOWN safety (mocked Graph)', () => {
  it('T25 media_publish success: SUCCEEDED with read-only verification', async () => {
    const s = setup();
    const body = await (await s.publish()).json();
    expect(body).toMatchObject({ ok: true, state: 'SUCCEEDED', meta_object_id: MEDIA, permalink: PERMALINK, verification: 'CONFIRMED' });
    expect(posts(s.fetch).map((c) => new URL(String(c[0])).pathname)).toEqual([`/${META_GRAPH_VERSION}/${IG}/media`, `/${META_GRAPH_VERSION}/${IG}/media_publish`]);
    expect((postsTo(s.fetch, '/media_publish')[0][1]!.body as URLSearchParams).get('creation_id')).toBe(CONTAINER);
    expect(s.g.rows[0]).toMatchObject({ status: 'succeeded', stage: 'publish_requested', container: CONTAINER, metaObjectId: MEDIA });
  });

  it('T26 media_publish definite failure: FAILED, evidence kept', async () => {
    const s = setup({}, { publish: res({ error: { code: 100 } }, 400) });
    const body = await (await s.publish()).json();
    expect([body.state, body.code]).toEqual(['FAILED', 'META_REJECTED']);
    expect(s.g.rows[0]).toMatchObject({ stage: 'publish_requested', container: CONTAINER, status: 'failed' });
    expect(postsTo(s.fetch, '/media_publish')).toHaveLength(1);
  });

  it('T27 media_publish ambiguous: UNKNOWN; local finish failure after Meta success is also UNKNOWN', async () => {
    for (const publish of ['throw', res({}, 502)] as const) {
      const s = setup({}, { publish });
      const r = await s.publish();
      expect(r.status).toBe(202);
      expect((await r.json()).state).toBe('UNKNOWN');
      expect(s.g.rows[0]).toMatchObject({ status: 'unknown', stage: 'publish_requested', container: CONTAINER });
    }
    const h = setup({ finishBreaksOnSuccess: true });
    const r = await h.publish();
    expect(r.status).toBe(202);
    expect((await r.json()).code).toBe('PUBLISH_OUTCOME_UNKNOWN');
  });

  it('T28 UNKNOWN blocks blind retry; verification settles only on evidence', async () => {
    const s = setup({}, { publish: 'throw' });
    await s.publish();
    const writes = posts(s.fetch).length;
    for (const retry of [false, true]) {
      const r = await s.publish({ retry });
      expect((await r.json()).code).toBe('PUBLISH_OUTCOME_UNKNOWN');
    }
    expect(posts(s.fetch)).toHaveLength(writes);
    expect(s.d.begin).toHaveBeenCalledTimes(1);
    const inconclusive = await s.verify();
    expect(inconclusive.status).toBe(409);
    expect(s.g.rows[0].status).toBe('unknown');
    const found = setup({}, {
      publish: 'throw',
      listing: res({ data: [{ id: MEDIA, caption: CAPTION, timestamp: '2026-11-01T10:00:30+0000', permalink: PERMALINK }] }),
    });
    await found.publish();
    const settled = await (await found.verify()).json();
    expect(settled).toMatchObject({ state: 'SUCCEEDED', verdict: 'found', meta_object_id: MEDIA });
    expect(posts(found.fetch)).toHaveLength(2);
    const early = setup({}, { container: 'throw' });
    await early.publish();
    const before = early.fetch.mock.calls.length;
    const absent = await (await early.verify()).json();
    expect(absent).toMatchObject({ state: 'FAILED', verdict: 'absent', retryable: true });
    expect(early.fetch.mock.calls.length).toBe(before);
  });

  it('T29 already published blocks a duplicate', async () => {
    const s = setup();
    await s.publish();
    for (const retry of [false, true]) {
      const r = await s.publish({ retry });
      expect((await r.json()).code).toBe('ALREADY_PUBLISHED');
    }
    expect(postsTo(s.fetch, '/media_publish')).toHaveLength(1);
    expect(s.d.begin).toHaveBeenCalledTimes(1);
  });
});

describe('A3.7.4.3 channel isolation and boundaries', () => {
  it('T30 Facebook and Instagram are independent channels', async () => {
    const s = setup({ fbStatus: 'succeeded' });
    const body = await (await s.publish()).json();
    expect(body.state).toBe('SUCCEEDED');
    expect(s.fetch.mock.calls.some((c) => /\/(photos|feed)$/.test(new URL(String(c[0])).pathname))).toBe(false);
    const model = instagramReadModel([
      { channel: 'facebook', issue: 'ALREADY_PUBLISHED', draft_version: 3, attempt_status: 'succeeded', attempt_error_code: null, meta_object_id: 'x', permalink: null, attempt_updated_at: null, attempt_retryable: false, attempt_verification_required: false },
      { channel: 'instagram', issue: null, draft_version: 3, attempt_status: null, attempt_error_code: null, meta_object_id: null, permalink: null, attempt_updated_at: null, attempt_retryable: null, attempt_verification_required: null },
    ]);
    expect([model.state, model.can_publish]).toEqual(['NOT_REQUESTED', true]);
    expect(read(`${IG_DIR}/index.ts`)).toMatch(/p_channel: "instagram"/);
  });

  it('T31 a Facebook attempt cannot acquire container fields', () => {
    const rows: Row[] = [{ id: ATT, owner: USER, channel: 'facebook', status: 'publishing', stage: 'none', container: null, errorCode: null, metaObjectId: null, startedAt: '' }];
    expect(fakeAdvance(rows, USER, ATT, 'container_requested', null)).toBe('invalid_channel');
    expect(rows[0]).toMatchObject({ stage: 'none', container: null });
    expect(MIGRATION).toMatch(/channel = 'facebook' AND external_stage = 'none' AND meta_container_id IS NULL/);
    expect(MIGRATION).toMatch(/NEW\.channel <> 'instagram' OR v_new_rank <> v_old_rank \+ 1/);
    expect(MIGRATION).toMatch(/IF v_channel <> 'instagram' THEN\s*RETURN 'invalid_channel'/);
  });

  it('T32 a foreign user cannot advance an attempt; RPC is service-role only', () => {
    const rows: Row[] = [{ id: ATT, owner: USER, channel: 'instagram', status: 'publishing', stage: 'none', container: null, errorCode: null, metaObjectId: null, startedAt: '' }];
    expect(fakeAdvance(rows, OTHER, ATT, 'container_requested', null)).toBe('not_found');
    expect(rows[0].stage).toBe('none');
    expect(MIGRATION).toMatch(/WHERE a\.id = p_attempt_id AND a\.user_id = p_user_id/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.publish_attempt_advance\(uuid, uuid, text, text\) FROM PUBLIC, anon, authenticated/);
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.publish_attempt_advance\(uuid, uuid, text, text\) TO service_role/);
    expect(MIGRATION).toMatch(/SECURITY DEFINER\s*SET search_path TO ''/);
  });

  it('T33 the browser never holds a Meta token', async () => {
    const s = setup();
    const st = await (await s.status()).text();
    expect(st).not.toMatch(/EAA|access_token|appsecret/);
    for (const f of readdirSync(join(ROOT, 'src/features/instagram-publish'))) {
      if (!/\.tsx?$/.test(f)) continue;
      const src = read(`src/features/instagram-publish/${f}`);
      expect(src).not.toMatch(/access_token|appsecret|META_APP_SECRET|META_INSTAGRAM|user_token|page_token/i);
    }
  });

  it('T34 the browser makes no Graph write and has no publish control', () => {
    const repo = read('src/features/instagram-publish/repository.ts');
    const harness = read('src/features/instagram-publish/InstagramPublishHarness.tsx');
    for (const src of [repo, harness, read('src/features/instagram-publish/copy.ts')]) {
      expect(src).not.toMatch(/graph\.facebook\.com|media_publish|\/media\b|fetch\(/);
    }
    expect(repo).not.toMatch(/'instagram_publish'|instagram_publish_verify/);
    expect(repo.match(/^export (async )?function \w+/gm)).toEqual(['export async function getInstagramStatus']);
    expect(harness).toMatch(/type="button" disabled aria-disabled="true"/);
    expect(harness).not.toMatch(/onClick=\{[^}]*publish/i);
    const app = read('src/App.tsx');
    expect(app).toContain("const IgHarness = lazy(() => import('./features/instagram-publish/InstagramPublishHarness'));");
    expect(app.match(/<FbHarness \/>/g)).toHaveLength(1);
    expect(app.match(/<IgHarness \/>/g)).toHaveLength(1);
    expect(app).not.toMatch(/path="[^"]*(facebook|instagram)/i);
  });

  it('T35 Instagram arming absent or Facebook-only fails closed', async () => {
    const envs: Record<string, string>[] = [
      { META_APP_SECRET: SECRET },
      { [ARMED_FLAG]: 'true', META_APP_SECRET: SECRET },
      { [ARMED_FLAG]: 'true', [ARMED_USERS]: OTHER, META_APP_SECRET: SECRET },
      { [ARMED_FLAG]: 'false', [ARMED_USERS]: USER, META_APP_SECRET: SECRET },
      { META_FACEBOOK_REAL_PUBLISH_ARMED: 'true', META_FACEBOOK_REAL_PUBLISH_USER_IDS: USER, META_APP_SECRET: SECRET },
    ];
    for (const env of envs) {
      const s = setup({}, {}, {}, env);
      const r = await s.publish();
      expect(r.status).toBe(403);
      expect((await r.json()).code).toBe('REAL_PUBLISH_DISABLED');
      expect((await s.verify()).status).toBe(403);
      expect(s.d.preflight).not.toHaveBeenCalled();
      expect(s.d.begin).not.toHaveBeenCalled();
      expect(s.fetch).not.toHaveBeenCalled();
      expect((await (await s.status()).json()).armed).toBe(false);
    }
    expect([ARMED_FLAG, ARMED_USERS]).toEqual(['META_INSTAGRAM_REAL_PUBLISH_ARMED', 'META_INSTAGRAM_REAL_PUBLISH_USER_IDS']);
    expect(isArmed((k) => ARMED_ENV[k as keyof typeof ARMED_ENV], USER)).toBe(true);
    for (const f of readdirSync(join(ROOT, IG_DIR))) expect(read(`${IG_DIR}/${f}`)).not.toMatch(/META_FACEBOOK_REAL_PUBLISH/);
  });

  it('T36 Facebook regression: frozen files byte-identical, Facebook gate clause unchanged', () => {
    const frozen: Record<string, string> = {
      'supabase/functions/meta-publishing/facebookPhoto.ts': '7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a',
      'supabase/functions/meta-publishing/facebookPublish.ts': '48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd',
      'supabase/functions/meta-publishing/handler.ts': 'b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb',
      'supabase/functions/meta-publishing/index.ts': '027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23',
      'src/features/facebook-publish/FacebookPublishHarness.tsx': '78cc2a49ef4d599b0858a99674fc30a07a440644b4e87ffb8827b03708647a1b',
      'src/features/facebook-publish/copy.ts': 'e47fa991449289ca8986828f168c4e052bdfb67877ea7aa6c263d29aeb70ce20',
      'src/features/facebook-publish/repository.ts': '4242ea4c38c91b010a1bfd1d624f71c0edd2fc7e076cea32df127bc7f3a4ba20',
      'src/features/channel-review/ChannelReviewPanel.tsx': '0dc3a0e50b5f61c69d458313a5a7f9a672616af9f81906c32618239b8025f4be',
      'src/features/publication-resume/PublicationResumeProvider.tsx': 'd8af68702d5b54e4f62d8720a05e190a6c2bbbc31fa2f699feb0741aa6f6c499',
      'src/features/publishing-access/copy.ts': 'a692420d0e89f09798ddca65ceae7c318637cec30221bb4179da7c9b0954972c',
      'src/features/publishing-access/model.ts': '9a208058c363b88b707c964ae5e9ff09f9098338deb21de80ba2adf5753c1d39',
      'src/features/publishing-access/PublishingAccessControl.tsx': 'a383269fed1986ad2ba1ab4a53b7e1d20a20d0f21b8e8e5a695a76d7798eadf0',
      'src/features/meta-connection/metaPublishingRepository.ts': '132b1fa4ffcb8a29afe7e048e40e97c4ba1c580359ad682d6aad21eeaa55b360',
      'src/features/publications/validation/PublicationsValidationPage.tsx': '1eb1a91eda49dcaaba496acb7072131c153bd022de0e87a637100584c61bbad0',
      'src/features/publications/__tests__/a3742FacebookPhotoPublishing.test.ts': '8542f77b8bab82646f484036ef2cbda02cb92521aa165aa8ff1b55e556f66cad',
      // A3.7.4.3 GATE A CORRECTION 03 RE-PIN (was 170e4828; CORRECTION 02 was e7674f8f): only AUTHORIZED_REPINS entries changed, now including a3732.
      'src/features/publications/__tests__/a3741MetaPublishingFoundation.test.ts': 'f137e0a69c496c509b2a3dcaf16df05746992112446c7ea15d79619a10a0f61d',
    };
    for (const [p, h] of Object.entries(frozen)) expect([p, sha(p)]).toEqual([p, h]);
    expect(MIGRATION).toContain("publication_channel_text_issue(v_text, CASE p_channel WHEN 'facebook' THEN 5000 ELSE 2200 END)");
    expect(MIGRATION).toMatch(/IF p_channel = 'instagram' THEN\s*IF NOT public\.instagram_image_derivable/);
    expect(read('supabase/config.toml')).toMatch(/\[functions\.instagram-publishing\]\s*verify_jwt = true/);
  });
});

describe('A3.7.4.3 transport extras', () => {
  it('T37 publishContainer rejects non-numeric container ids without a request', async () => {
    const f = metaFetch();
    expect(await publishContainer({ token: PAGE_TOKEN, appSecret: SECRET, fetch: f as unknown as typeof fetch, igUserId: IG, containerId: 'abc' })).toEqual({ kind: 'failed', code: 'INTERNAL_ERROR' });
    expect(f).not.toHaveBeenCalled();
  });

  it('T38 a stale PUBLISHING attempt before media_publish verifies as absent without any Graph call', async () => {
    const s = setup();
    s.g.rows.push({ id: ATT, owner: USER, channel: 'instagram', status: 'publishing', stage: 'container_created', container: CONTAINER, errorCode: null, metaObjectId: null, startedAt: '2026-11-01T10:00:00Z' });
    const body = await (await s.verify()).json();
    expect(body).toMatchObject({ state: 'FAILED', verdict: 'absent', retryable: true });
    expect(s.fetch).not.toHaveBeenCalled();
    expect(s.g.rows[0]).toMatchObject({ container: CONTAINER, stage: 'container_created' });
  });
});
