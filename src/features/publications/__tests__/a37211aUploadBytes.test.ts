import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FunctionsClient } from '@supabase/functions-js';
import { createHandler, type MediaDeps, type StoredImage } from '../../../../supabase/functions/publication-media/handler.ts';
import { attachImage } from '../repository';
import { PublicationError } from '../types';

const ROOT = join(__dirname, '../../../..');
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));
const UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BIZ = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
const PID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';

const codeOf = (p: Promise<unknown>) => p.then(() => 'resolved', (e: unknown) => (e instanceof PublicationError ? e.code : String(e)));

// Real client repository -> real fetch Request -> real publication-media handler; only storage/DB are in memory.
function harness() {
  const stored: { path?: string; bytes?: Uint8Array; image?: StoredImage } = {};
  let status = 'draft';
  const deps = {
    getUserId: async (jwt: string) => (jwt === 'user-jwt' ? UID : null),
    getOwnedPublication: async (u: string, id: string) => (u === UID && id === PID ? { id: PID, businessId: BIZ, imagePath: stored.path ?? null } : null),
    isBusinessOwned: async (u: string, b: string) => u === UID && b === BIZ,
    putObject: vi.fn(async (path: string, bytes: Uint8Array) => { stored.path = path; stored.bytes = bytes; return true; }),
    removeObject: async () => true,
    setImage: vi.fn(async (_id: string, _exp: string | null, image: StoredImage) => { stored.image = image; status = 'image_ready'; return true; }),
    deletePublication: async () => true,
  } satisfies MediaDeps;
  const handle = createHandler(deps);
  const seenBodies: number[] = [];
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    const req = new Request(url, init);
    seenBodies.push((await req.clone().arrayBuffer()).byteLength);
    return handle(req);
  });
  const row = () => ({
    id: PID, business_id: BIZ, status, image_path: stored.path ?? null, image_mime: stored.image?.mime ?? null,
    image_bytes: stored.image?.bytes ?? null, image_width: stored.image?.width ?? null, image_height: stored.image?.height ?? null,
    image_uploaded_at: stored.image ? '2026-10-25T10:00:00Z' : null, proposal_generation_id: null, proposals_lang: null,
    proposals_generated_at: null, proposal_generations_used: 0, created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z',
  });
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'eq']) chain[op] = () => chain;
  chain.maybeSingle = async () => ({ data: row(), error: null });
  const invoke = vi.fn();
  const db = {
    from: () => chain,
    functions: { invoke },
    auth: { getSession: async () => ({ data: { session: { access_token: 'user-jwt' } }, error: null }) },
  };
  return { db: db as never, fetchFn, deps, stored, seenBodies, invoke };
}

describe('A3.7.2.1A.1 browser File bytes reach publication-media', () => {
  it('root cause: functions.invoke sends no body when a Content-Type header is supplied', async () => {
    let sent: BodyInit | null | undefined = 'unset';
    const client = new FunctionsClient('https://x.test/functions/v1', {
      customFetch: (async (_u: string, init: RequestInit) => { sent = init.body; return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }); }) as never,
    });
    await client.invoke('publication-media', { method: 'POST', body: new File([fixture('photo-exif-gps.jpg')], 'a.jpg', { type: 'image/jpeg' }), headers: { 'Content-Type': 'image/jpeg' } });
    expect(sent).toBeUndefined();
  });

  it('real non-empty JPEG File -> request carries its bytes -> normalized, stored, image_ready', async () => {
    const h = harness();
    const bytes = fixture('photo-exif-gps.jpg');
    const pub = await attachImage(PID, new File([bytes], 'photo.jpg', { type: 'image/jpeg' }), h.db, h.fetchFn as never);
    expect(h.seenBodies).toEqual([bytes.length]);
    expect(h.fetchFn.mock.calls[0][1].headers).toMatchObject({ 'Content-Type': 'image/jpeg', Authorization: 'Bearer user-jwt' });
    expect(pub.status).toBe('image_ready');
    expect(h.stored.image?.mime).toBe('image/jpeg');
    expect(h.stored.bytes!.length).toBeGreaterThan(0);
    expect(h.stored.bytes!.length).toBeLessThan(bytes.length);
    expect(h.stored.path).toMatch(new RegExp(`^${UID}/${BIZ}/${PID}/[0-9a-f-]{36}\\.jpg$`));
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('real non-empty PNG File -> image_ready', async () => {
    const h = harness();
    const bytes = fixture('photo-text-exif.png');
    const pub = await attachImage(PID, new File([bytes], 'photo.png', { type: 'image/png' }), h.db, h.fetchFn as never);
    expect(h.seenBodies).toEqual([bytes.length]);
    expect(pub.status).toBe('image_ready');
    expect(h.stored.image?.mime).toBe('image/png');
  });

  it('zero-byte File is rejected as file_empty and nothing is sent or stored', async () => {
    const h = harness();
    expect(await codeOf(attachImage(PID, new File([], 'empty.jpg', { type: 'image/jpeg' }), h.db, h.fetchFn as never))).toBe('file_empty');
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(h.deps.putObject).not.toHaveBeenCalled();
  });

  it('server still rejects a body-less upload as FILE_EMPTY', async () => {
    const h = harness();
    const handle = createHandler(h.deps);
    const res = await handle(new Request(`https://x.test/publication-media?action=attach&publication_id=${PID}`, {
      method: 'POST', headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'image/jpeg' },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('FILE_EMPTY');
  });

  it('PNG bytes declared as image/jpeg are rejected server-side', async () => {
    const h = harness();
    const png = new File([fixture('photo-text-exif.png')], 'lie.jpg', { type: 'image/jpeg' });
    expect(await codeOf(attachImage(PID, png, h.db, h.fetchFn as never))).toBe('unsupported_media_type');
    expect(h.deps.putObject).not.toHaveBeenCalled();
  });

  it('over 8 MB is rejected before sending', async () => {
    const h = harness();
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    expect(await codeOf(attachImage(PID, big, h.db, h.fetchFn as never))).toBe('file_too_large');
    expect(h.fetchFn).not.toHaveBeenCalled();
  });

  it('upload path never serializes the File as JSON and never calls the AI function', () => {
    const repo = readFileSync(join(ROOT, 'src/features/publications/repository.ts'), 'utf8');
    const upload = repo.slice(repo.indexOf('async function uploadBytes'), repo.indexOf('async function uploadAndReload'));
    expect(upload).toContain('body: file');
    expect(upload).not.toMatch(/JSON\.stringify|FormData|functions\.invoke|publication-proposals/);
  });
});

describe('A3.7.2.1A.1 harness after upload', () => {
  const PAGE = readFileSync(join(ROOT, 'src/features/publications/validation/PublicationsValidationPage.tsx'), 'utf8');

  it('generation only runs from the explicit button, never after upload', () => {
    const upload = PAGE.slice(PAGE.indexOf('const upload'), PAGE.indexOf('const generate'));
    expect(upload).not.toContain('generateProposals');
    expect(PAGE.match(/generateProposals\(/g)).toHaveLength(1);
    expect(PAGE).not.toMatch(/useEffect\([^)]*generate/);
  });

  it('a failed attach deletes the fresh draft', () => {
    const upload = PAGE.slice(PAGE.indexOf('const upload'), PAGE.indexOf('const generate'));
    expect(upload).toMatch(/deleteDraft\(/);
  });
});
