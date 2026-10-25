import { describe, expect, it, vi } from 'vitest';
import {
  createHandler,
  inspectImage,
  objectPath,
  sniffMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  MIN_IMAGE_SIDE,
  type MediaDeps,
  type StoredImage,
} from '../../../../supabase/functions/publication-media/handler.ts';
import {
  PUBLICATION_IMAGE_MAX_BYTES,
  PUBLICATION_IMAGE_MAX_PIXELS,
  PUBLICATION_IMAGE_MAX_SIDE,
  PUBLICATION_IMAGE_MIN_SIDE,
} from '../types';

const UA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BA = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
const BB = 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0';
const PA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const PB = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];

function png(width: number, height: number, extra = 16): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(width), ...be32(height), 8, 2, 0, 0, 0, 0, 0, 0, 0,
    ...new Array(extra).fill(0),
  ]);
}

function jpeg(width: number, height: number, { sof = 0xc0, withExif = true } = {}): Uint8Array {
  const app0 = [0xff, 0xe0, ...be16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const app1 = withExif ? [0xff, 0xe1, ...be16(8), 0x45, 0x78, 0x69, 0x66, 0, 0] : [];
  const sofSeg = [0xff, sof, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, 0xff, 0xff, ...sofSeg, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00');
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
const HEIC = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);

interface Row { id: string; userId: string; businessId: string; imagePath: string | null; image?: StoredImage }

function world() {
  const businesses = new Map<string, string>([[BA, UA], [BB, UB]]);
  const pubs = new Map<string, Row>([
    [PA, { id: PA, userId: UA, businessId: BA, imagePath: null }],
    [PB, { id: PB, userId: UB, businessId: BB, imagePath: `${UB}/${BB}/${PB}/99999999-9999-4999-8999-999999999999.png` }],
  ]);
  const objects = new Map<string, Uint8Array>([[pubs.get(PB)!.imagePath!, png(400, 400)]]);
  let n = 0;
  const deps = {
    getUserId: vi.fn(async (jwt: string) => ({ 'tok-a': UA, 'tok-b': UB } as Record<string, string>)[jwt] ?? null),
    getOwnedPublication: vi.fn(async (userId: string, id: string) => {
      const r = pubs.get(id);
      return r && r.userId === userId ? { id: r.id, businessId: r.businessId, imagePath: r.imagePath } : null;
    }),
    isBusinessOwned: vi.fn(async (userId: string, b: string) => businesses.get(b) === userId),
    putObject: vi.fn(async (path: string, bytes: Uint8Array) => {
      if (objects.has(path)) return false;
      objects.set(path, bytes);
      return true;
    }),
    removeObject: vi.fn(async (path: string) => objects.delete(path)),
    setImage: vi.fn(async (id: string, expected: string | null, image: StoredImage) => {
      const r = pubs.get(id);
      if (!r || r.imagePath !== expected) return false;
      r.imagePath = image.path;
      r.image = image;
      return true;
    }),
    deletePublication: vi.fn(async (id: string, expected: string | null) => {
      const r = pubs.get(id);
      if (!r || r.imagePath !== expected) return false;
      pubs.delete(id);
      return true;
    }),
    randomId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    now: () => new Date('2026-10-25T10:00:00Z'),
  } satisfies MediaDeps;
  return { deps, pubs, objects, businesses, handle: createHandler(deps) };
}

function call(
  handle: (r: Request) => Promise<Response>,
  { token = 'tok-a', action = 'attach', id = PA, body, type = 'image/jpeg', method = 'POST', headers = {} as Record<string, string>, extraQuery = '' }:
  { token?: string | null; action?: string; id?: string; body?: Uint8Array; type?: string; method?: string; headers?: Record<string, string>; extraQuery?: string } = {},
) {
  const h: Record<string, string> = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body) h['Content-Type'] = type;
  return handle(new Request(`https://x.test/publication-media?action=${action}&publication_id=${id}${extraQuery}`, { method, headers: h, body: method === 'GET' ? undefined : body }));
}

const read = async (res: Response) => ({ status: res.status, body: await res.json() as Record<string, unknown> });

describe('A3.7.1 image inspection (magic bytes, dimensions, no decoding)', () => {
  it('sniffs JPEG and PNG by signature only', () => {
    expect(sniffMime(jpeg(1080, 1080))).toBe('image/jpeg');
    expect(sniffMime(png(1080, 1080))).toBe('image/png');
    for (const b of [GIF, SVG, HEIC, new Uint8Array([0xff, 0xd8])]) expect(sniffMime(b)).toBeNull();
  });

  it('reads dimensions from PNG IHDR and JPEG SOF (baseline + progressive, skipping APP/EXIF and fill bytes)', () => {
    expect(inspectImage(png(1200, 900), 'image/png')).toEqual({ ok: true, image: { mime: 'image/png', width: 1200, height: 900 } });
    expect(inspectImage(jpeg(1080, 1350), 'image/jpeg')).toEqual({ ok: true, image: { mime: 'image/jpeg', width: 1080, height: 1350 } });
    expect(inspectImage(jpeg(2000, 1000, { sof: 0xc2 }), 'image/jpeg; charset=binary')).toMatchObject({ ok: true, image: { width: 2000 } });
  });

  it('rejects empty, unsupported, mismatched-declaration and disguised files', () => {
    expect(inspectImage(new Uint8Array(0), 'image/jpeg')).toEqual({ ok: false, code: 'FILE_EMPTY' });
    expect(inspectImage(GIF, 'image/gif').ok).toBe(false);
    expect(inspectImage(SVG, 'image/svg+xml')).toEqual({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(inspectImage(HEIC, 'image/heic')).toEqual({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(inspectImage(SVG, 'image/jpeg')).toEqual({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(inspectImage(png(800, 800), 'image/jpeg')).toEqual({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(inspectImage(jpeg(800, 800), null)).toEqual({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('rejects truncated or SOF-less JPEG and malformed PNG as unreadable', () => {
    expect(inspectImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2]), 'image/jpeg')).toEqual({ ok: false, code: 'IMAGE_UNREADABLE' });
    expect(inspectImage(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]), 'image/jpeg')).toEqual({ ok: false, code: 'IMAGE_UNREADABLE' });
    const bad = png(800, 800);
    bad[12] = 0x58;
    expect(inspectImage(bad, 'image/png')).toEqual({ ok: false, code: 'IMAGE_UNREADABLE' });
  });

  it('enforces 320..8192 px per side and a 40 MP ceiling (decompression-bomb guard)', () => {
    const code = (w: number, h: number) => (inspectImage(png(w, h), 'image/png') as { code?: string }).code;
    expect(code(319, 1000)).toBe('IMAGE_DIMENSIONS_OUT_OF_RANGE');
    expect(code(8193, 1000)).toBe('IMAGE_DIMENSIONS_OUT_OF_RANGE');
    expect(code(8000, 8000)).toBe('IMAGE_DIMENSIONS_OUT_OF_RANGE');
    expect(code(0x7fffffff, 0x7fffffff)).toBe('IMAGE_DIMENSIONS_OUT_OF_RANGE');
    expect(inspectImage(png(8000, 5000), 'image/png').ok).toBe(true);
    expect(inspectImage(png(320, 320), 'image/png').ok).toBe(true);
  });

  it('server and client limits are identical', () => {
    expect(MAX_IMAGE_BYTES).toBe(PUBLICATION_IMAGE_MAX_BYTES);
    expect(MAX_IMAGE_BYTES).toBe(8388608);
    expect(MIN_IMAGE_SIDE).toBe(PUBLICATION_IMAGE_MIN_SIDE);
    expect(MAX_IMAGE_SIDE).toBe(PUBLICATION_IMAGE_MAX_SIDE);
    expect(MAX_IMAGE_PIXELS).toBe(PUBLICATION_IMAGE_MAX_PIXELS);
  });

  it('object paths are owner-scoped with a random leaf and a type-derived extension', () => {
    expect(objectPath(UA, BA, PA, '00000000-0000-4000-8000-000000000001', 'image/png')).toBe(`${UA}/${BA}/${PA}/00000000-0000-4000-8000-000000000001.png`);
    expect(objectPath(UA, BA, PA, 'x', 'image/jpeg').endsWith('.jpg')).toBe(true);
  });
});

describe('A3.7.1 publication-media handler security', () => {
  it('answers CORS preflight and rejects non-POST methods', async () => {
    const { handle } = world();
    const pre = await handle(new Request('https://x.test/publication-media', { method: 'OPTIONS' }));
    expect(pre.status).toBe(200);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization, X-Client-Info, Apikey');
    expect((await call(handle, { method: 'GET' })).status).toBe(405);
  });

  it('rejects missing and invalid sessions before touching data', async () => {
    const { handle, deps, objects } = world();
    expect(await read(await call(handle, { token: null, body: jpeg(800, 800) }))).toEqual({ status: 401, body: { ok: false, code: 'UNAUTHENTICATED' } });
    expect((await call(handle, { token: 'forged', body: jpeg(800, 800) })).status).toBe(401);
    expect(deps.getOwnedPublication).not.toHaveBeenCalled();
    expect(objects.size).toBe(1);
  });

  it('rejects unknown actions and non-UUID publication ids', async () => {
    const { handle } = world();
    expect((await call(handle, { action: 'publish', body: jpeg(800, 800) })).status).toBe(400);
    expect((await call(handle, { action: 'sign', body: jpeg(800, 800) })).status).toBe(400);
    expect((await call(handle, { id: '../../etc', body: jpeg(800, 800) })).status).toBe(400);
    expect((await call(handle, { id: `${PA}%2F..`, body: jpeg(800, 800) })).status).toBe(400);
  });

  it('cross-user publication looks identical to a missing one (no enumeration) and writes nothing', async () => {
    const { handle, objects, deps } = world();
    const cross = await read(await call(handle, { id: PB, body: jpeg(800, 800) }));
    const missing = await read(await call(handle, { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', body: jpeg(800, 800) }));
    expect(cross).toEqual({ status: 404, body: { ok: false, code: 'NOT_FOUND' } });
    expect(missing).toEqual(cross);
    expect((await call(handle, { id: PB, action: 'delete' })).status).toBe(404);
    expect((await call(handle, { id: PB, action: 'replace', body: jpeg(800, 800) })).status).toBe(404);
    expect(deps.putObject).not.toHaveBeenCalled();
    expect(objects.size).toBe(1);
  });

  it('refuses when the business is no longer owned by the caller', async () => {
    const { handle, businesses, deps } = world();
    businesses.set(BA, UB);
    expect((await call(handle, { body: jpeg(800, 800) })).status).toBe(404);
    expect(deps.putObject).not.toHaveBeenCalled();
  });

  it.each([
    ['gif', GIF, 'image/gif', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['svg', SVG, 'image/svg+xml', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['heic', HEIC, 'image/heic', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['svg disguised as jpeg', SVG, 'image/jpeg', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['png declared as jpeg', png(800, 800), 'image/jpeg', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['empty', new Uint8Array(0), 'image/jpeg', 400, 'FILE_EMPTY'],
    ['too small', png(100, 100), 'image/png', 422, 'IMAGE_DIMENSIONS_OUT_OF_RANGE'],
    ['pixel bomb header', png(8192, 8192), 'image/png', 422, 'IMAGE_DIMENSIONS_OUT_OF_RANGE'],
  ])('rejects %s without storing anything', async (_n, body, type, status, code) => {
    const { handle, deps, pubs } = world();
    expect(await read(await call(handle, { body, type }))).toEqual({ status, body: { ok: false, code } });
    expect(deps.putObject).not.toHaveBeenCalled();
    expect(pubs.get(PA)!.imagePath).toBeNull();
  });

  it('rejects oversize bodies by declared length and by streamed length', async () => {
    const { handle, deps } = world();
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(jpeg(800, 800));
    expect(await read(await call(handle, { body: big }))).toEqual({ status: 413, body: { ok: false, code: 'FILE_TOO_LARGE' } });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 9; i++) c.enqueue(new Uint8Array(1024 * 1024));
        c.close();
      },
    });
    const res = await handle(new Request(`https://x.test/f?action=attach&publication_id=${PA}`, {
      method: 'POST', headers: { Authorization: 'Bearer tok-a', 'Content-Type': 'image/jpeg' }, body: stream, duplex: 'half',
    } as RequestInit));
    expect(res.status).toBe(413);
    expect(deps.putObject).not.toHaveBeenCalled();
  });

  it('accepts exactly 8 MB', async () => {
    const { handle } = world();
    const exact = new Uint8Array(MAX_IMAGE_BYTES);
    exact.set(jpeg(800, 800));
    expect((await call(handle, { body: exact })).status).toBe(200);
  });

  it('attaches a valid JPEG under a server-chosen owner path and returns metadata only', async () => {
    const { handle, pubs, objects } = world();
    const res = await read(await call(handle, { body: jpeg(1080, 1350), extraQuery: `&path=${UB}/${BB}/x.jpg&user_id=${UB}` }));
    expect(res).toEqual({
      status: 200,
      body: { ok: true, publication: { id: PA, status: 'image_ready', image: { mime: 'image/jpeg', bytes: jpeg(1080, 1350).length, width: 1080, height: 1350, uploadedAt: '2026-10-25T10:00:00.000Z' } } },
    });
    const path = pubs.get(PA)!.imagePath!;
    expect(path).toBe(`${UA}/${BA}/${PA}/00000000-0000-4000-8000-000000000001.jpg`);
    expect(objects.has(path)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/path|url|token|http|sign/i);
  });

  it('a second attach is refused deterministically and stores nothing new', async () => {
    const { handle, objects } = world();
    expect((await call(handle, { body: jpeg(800, 800) })).status).toBe(200);
    const before = objects.size;
    expect(await read(await call(handle, { body: png(900, 900), type: 'image/png' }))).toEqual({ status: 409, body: { ok: false, code: 'IMAGE_ALREADY_ATTACHED' } });
    expect(objects.size).toBe(before);
  });

  it('replace requires an existing image', async () => {
    const { handle } = world();
    expect(await read(await call(handle, { action: 'replace', body: jpeg(800, 800) }))).toEqual({ status: 409, body: { ok: false, code: 'NO_IMAGE_TO_REPLACE' } });
  });

  it('replace swaps the reference, then deletes only the caller\'s old object', async () => {
    const { handle, pubs, objects, deps } = world();
    await call(handle, { body: jpeg(800, 800) });
    const old = pubs.get(PA)!.imagePath!;
    const other = pubs.get(PB)!.imagePath!;
    const res = await call(handle, { action: 'replace', body: png(1200, 1200), type: 'image/png' });
    expect(res.status).toBe(200);
    const next = pubs.get(PA)!.imagePath!;
    expect(next).toMatch(new RegExp(`^${UA}/${BA}/${PA}/[0-9a-f-]{36}\\.png$`));
    expect(objects.has(old)).toBe(false);
    expect(objects.has(next)).toBe(true);
    expect(objects.has(other)).toBe(true);
    expect(deps.removeObject.mock.calls.map((c) => c[0])).toEqual([old]);
    expect(deps.setImage.mock.invocationCallOrder[1]).toBeLessThan(deps.removeObject.mock.invocationCallOrder[0]);
  });

  it('a concurrent replace loses cleanly: its new object is removed and the winner is untouched', async () => {
    const { handle, pubs, objects, deps } = world();
    await call(handle, { body: jpeg(800, 800) });
    deps.getOwnedPublication.mockResolvedValueOnce({ id: PA, businessId: BA, imagePath: `${UA}/${BA}/${PA}/stale.jpg` });
    const current = pubs.get(PA)!.imagePath!;
    expect(await read(await call(handle, { action: 'replace', body: jpeg(900, 900) }))).toEqual({ status: 409, body: { ok: false, code: 'CONFLICT' } });
    expect(pubs.get(PA)!.imagePath).toBe(current);
    expect([...objects.keys()].filter((k) => k.startsWith(`${UA}/`))).toEqual([current]);
  });

  it('a failed or throwing save removes the just-uploaded object (no orphan) and leaks no detail', async () => {
    const { handle, objects, deps } = world();
    deps.setImage.mockResolvedValueOnce(false);
    expect((await call(handle, { body: jpeg(800, 800) })).status).toBe(409);
    deps.setImage.mockRejectedValueOnce(new Error('relation "publications" violates check publications_image_consistency'));
    const res = await read(await call(handle, { body: jpeg(800, 800) }));
    expect(res).toEqual({ status: 500, body: { ok: false, code: 'UNKNOWN_ERROR' } });
    expect([...objects.keys()].some((k) => k.startsWith(`${UA}/`))).toBe(false);
  });

  it('a storage failure returns a generic error and leaves the row unchanged', async () => {
    const { handle, deps, pubs } = world();
    deps.putObject.mockResolvedValueOnce(false);
    expect(await read(await call(handle, { body: jpeg(800, 800) }))).toEqual({ status: 503, body: { ok: false, code: 'STORAGE_UNAVAILABLE' } });
    expect(pubs.get(PA)!.imagePath).toBeNull();
    expect(deps.setImage).not.toHaveBeenCalled();
  });

  it('delete removes the row first, then the owned object; other tenants are untouched', async () => {
    const { handle, pubs, objects, deps } = world();
    await call(handle, { body: jpeg(800, 800) });
    const path = pubs.get(PA)!.imagePath!;
    expect(await read(await call(handle, { action: 'delete' }))).toEqual({ status: 200, body: { ok: true, deleted: true } });
    expect(pubs.has(PA)).toBe(false);
    expect(objects.has(path)).toBe(false);
    expect(pubs.has(PB)).toBe(true);
    expect(objects.size).toBe(1);
    expect(deps.deletePublication.mock.invocationCallOrder[0]).toBeLessThan(deps.removeObject.mock.invocationCallOrder[0]);
    expect((await call(handle, { action: 'delete' })).status).toBe(404);
  });

  it('deleting an image-less draft does not touch storage', async () => {
    const { handle, deps } = world();
    expect((await call(handle, { action: 'delete' })).status).toBe(200);
    expect(deps.removeObject).not.toHaveBeenCalled();
  });

  it('a failed object removal after delete still reports success (row gone, object unreachable) and logs generically', async () => {
    const { handle, deps } = world();
    await call(handle, { body: jpeg(800, 800) });
    deps.removeObject.mockResolvedValueOnce(false);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await call(handle, { action: 'delete' })).status).toBe(200);
    expect(log).toHaveBeenCalledWith('[publication-media] orphaned object after delete');
    log.mockRestore();
  });

  it('rejects a non-UUID random id (path safety)', async () => {
    const { deps } = world();
    const handle = createHandler({ ...deps, randomId: () => '../../x' });
    expect((await call(handle, { body: jpeg(800, 800) })).status).toBe(500);
    expect(deps.putObject).not.toHaveBeenCalled();
  });
});
