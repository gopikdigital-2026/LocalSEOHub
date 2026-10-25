import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { attachImage, createDraft, deleteDraft, getDraft, listDrafts, replaceImage, toPublication } from '../repository';
import { PublicationError } from '../types';

const ROOT = join(__dirname, '../../../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIGRATION = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_a371_publications_data_storage_foundation.sql'))!;
const SQL = src(`supabase/migrations/${MIGRATION}`);
const SQL_CODE = SQL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

const ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const BIZ = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
const DRAFT_ROW = {
  id: ID, business_id: BIZ, status: 'draft', image_path: null, image_mime: null, image_bytes: null,
  image_width: null, image_height: null, image_uploaded_at: null, created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z',
};
const READY_ROW = {
  ...DRAFT_ROW, status: 'image_ready', image_path: `u/${BIZ}/${ID}/r.jpg`, image_mime: 'image/jpeg',
  image_bytes: 1000, image_width: 1080, image_height: 1080, image_uploaded_at: '2026-10-25T10:01:00Z',
};

type Result = { data: unknown; error: { code?: string; message?: string } | null };

function fakeDb(result: Result, invokeResult: { data: unknown; error: unknown } = { data: { ok: true }, error: null }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['insert', 'select', 'eq', 'order', 'update', 'delete', 'upsert']) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return op === 'order' ? Promise.resolve(result) : chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(result);
  const invoke = vi.fn(async (_name: string, _options?: unknown) => invokeResult);
  const db = { from: vi.fn(() => chain), functions: { invoke } };
  return { db: db as never, calls, invoke, from: db.from };
}

const file = (bytes: number, type: string) => new Blob([new Uint8Array(bytes)], { type });
const codeOf = async (p: Promise<unknown>) => p.then(() => 'resolved', (e: unknown) => (e instanceof PublicationError ? e.code : 'other'));

describe('A3.7.1 publications repository', () => {
  it('createDraft inserts only the business id (owner, status and image come from the server)', async () => {
    const { db, calls } = fakeDb({ data: DRAFT_ROW, error: null });
    const pub = await createDraft(BIZ, db);
    expect(calls[0]).toEqual({ op: 'insert', args: [{ business_id: BIZ }] });
    expect(pub).toEqual({ id: ID, businessId: BIZ, status: 'draft', image: null, createdAt: DRAFT_ROW.created_at, updatedAt: DRAFT_ROW.updated_at });
  });

  it('maps draft limit, foreign business and unknown failures to typed codes without raw messages', async () => {
    const limit = fakeDb({ data: null, error: { code: 'P0001', message: 'publication_draft_limit' } });
    expect(await codeOf(createDraft(BIZ, limit.db))).toBe('draft_limit');
    const rls = fakeDb({ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "publications"' } });
    expect(await codeOf(createDraft(BIZ, rls.db))).toBe('business_not_owned');
    const other = fakeDb({ data: null, error: { code: '23514', message: 'violates check constraint publications_path_format' } });
    const err = await createDraft(BIZ, other.db).catch((e: Error) => e);
    expect(err).toBeInstanceOf(PublicationError);
    expect((err as Error).message).toBe('unavailable');
  });

  it('toPublication accepts only consistent rows (discriminated by status)', () => {
    expect(toPublication(READY_ROW)).toMatchObject({ status: 'image_ready', image: { mime: 'image/jpeg', width: 1080 } });
    expect(toPublication({ ...DRAFT_ROW, image_path: 'x' })).toBeNull();
    expect(toPublication({ ...READY_ROW, image_mime: 'image/gif' })).toBeNull();
    expect(toPublication({ ...READY_ROW, image_width: null })).toBeNull();
    expect(toPublication({ ...DRAFT_ROW, status: 'published' })).toBeNull();
    expect(toPublication(null)).toBeNull();
  });

  it('getDraft and listDrafts read through the signed-in client (RLS-scoped) and surface failures', async () => {
    const one = fakeDb({ data: READY_ROW, error: null });
    expect((await getDraft(ID, one.db))?.status).toBe('image_ready');
    expect(await getDraft(ID, fakeDb({ data: null, error: null }).db)).toBeNull();
    expect(await codeOf(getDraft(ID, fakeDb({ data: null, error: { code: 'x' } }).db))).toBe('unavailable');
    const many = fakeDb({ data: [READY_ROW, DRAFT_ROW, { bogus: true }], error: null });
    expect((await listDrafts(BIZ, many.db)).map((p) => p.status)).toEqual(['image_ready', 'draft']);
    expect(await codeOf(listDrafts(BIZ, fakeDb({ data: null, error: { code: 'x' } }).db))).toBe('unavailable');
  });

  it('attachImage prechecks type and size locally and never calls the server for obviously bad files', async () => {
    const { db, invoke } = fakeDb({ data: READY_ROW, error: null });
    expect(await codeOf(attachImage(ID, file(0, 'image/jpeg'), db))).toBe('file_empty');
    expect(await codeOf(attachImage(ID, file(10, 'image/gif'), db))).toBe('unsupported_media_type');
    expect(await codeOf(attachImage(ID, file(10, 'image/heic'), db))).toBe('unsupported_media_type');
    expect(await codeOf(attachImage(ID, file(8 * 1024 * 1024 + 1, 'image/png'), db))).toBe('file_too_large');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('attach/replace send raw bytes to the server function and reload the row', async () => {
    const { db, invoke } = fakeDb({ data: READY_ROW, error: null });
    const f = file(100, 'image/png');
    expect((await attachImage(ID, f, db)).status).toBe('image_ready');
    expect(invoke).toHaveBeenCalledWith(`publication-media?action=attach&publication_id=${ID}`, { method: 'POST', body: f, headers: { 'Content-Type': 'image/png' } });
    await replaceImage(ID, f, db);
    expect(invoke.mock.calls[1][0]).toBe(`publication-media?action=replace&publication_id=${ID}`);
  });

  it('maps server error codes and treats unknown or malformed replies as unavailable', async () => {
    const err = (status: number, body: unknown) => ({ data: null, error: { context: new Response(JSON.stringify(body), { status }) } });
    const run = (r: { data: unknown; error: unknown }) => codeOf(attachImage(ID, file(10, 'image/jpeg'), fakeDb({ data: READY_ROW, error: null }, r).db));
    expect(await run(err(415, { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' }))).toBe('unsupported_media_type');
    expect(await run(err(422, { ok: false, code: 'IMAGE_DIMENSIONS_OUT_OF_RANGE' }))).toBe('image_dimensions_out_of_range');
    expect(await run(err(409, { ok: false, code: 'IMAGE_ALREADY_ATTACHED' }))).toBe('image_already_attached');
    expect(await run(err(404, { ok: false, code: 'NOT_FOUND' }))).toBe('not_found');
    expect(await run(err(500, { ok: false, code: '__proto__' }))).toBe('unavailable');
    expect(await run({ data: { ok: false }, error: null })).toBe('unavailable');
  });

  it('deleteDraft goes through the server so the stored photo is removed with the row', async () => {
    const { db, invoke, from } = fakeDb({ data: null, error: null });
    await deleteDraft(ID, db);
    expect(invoke).toHaveBeenCalledWith(`publication-media?action=delete&publication_id=${ID}`, { method: 'POST' });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('A3.7.1 schema, storage and architecture guards', () => {
  it('publications table: RLS on, read + insert(business_id) only for clients, nothing for anon', () => {
    expect(SQL_CODE).toContain('ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;');
    expect(SQL_CODE).toContain('REVOKE ALL ON public.publications FROM anon;');
    expect(SQL_CODE).toContain('GRANT INSERT (business_id) ON public.publications TO authenticated;');
    expect(SQL_CODE).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*TO authenticated/);
    expect(SQL_CODE).not.toMatch(/TO\s+anon/);
    expect(SQL_CODE).not.toMatch(/FOR ALL/);
    expect(SQL_CODE).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(SQL_CODE).toContain("CHECK (status IN ('draft', 'image_ready'))");
  });

  it('no token, URL or speculative publishing columns', () => {
    const table = SQL_CODE.slice(SQL_CODE.indexOf('CREATE TABLE'), SQL_CODE.indexOf(');', SQL_CODE.indexOf('CREATE TABLE')));
    expect(table).not.toMatch(/token|url|signed|caption|proposal|scheduled|published_at|channel|external_id/i);
  });

  it('bucket is private, JPEG/PNG only, 8 MB; storage grants clients read of the current owned image only', () => {
    expect(SQL_CODE).toMatch(/'publication-images',\s*'publication-images',\s*false,\s*8388608/);
    expect(SQL_CODE).toMatch(/SET public = false/);
    const storagePolicies = SQL_CODE.match(/CREATE POLICY[^;]*ON storage\.objects[^;]*;/g) ?? [];
    expect(storagePolicies).toHaveLength(1);
    expect(storagePolicies[0]).toMatch(/FOR SELECT\s+TO authenticated/);
    expect(storagePolicies[0]).toContain('(storage.foldername(objects.name))[1] = auth.uid()::text');
    expect(storagePolicies[0]).toContain('p.image_path = objects.name');
  });

  it('server function: sign-in required, no signing/public URLs, no AI, no Meta or Google calls', () => {
    const fn = src('supabase/functions/publication-media/index.ts') + src('supabase/functions/publication-media/handler.ts');
    expect(src('supabase/config.toml')).toMatch(/\[functions\.publication-media\]\s*verify_jwt = true/);
    expect(fn).not.toMatch(/createSignedUrl|getPublicUrl|signedUrl/);
    expect(fn).not.toMatch(/openai|anthropic|gemini|graph\.facebook|googleapis|fetch\(/i);
    expect(fn).not.toMatch(/upsert:\s*true/);
    expect(fn).not.toMatch(/error\.message|err\.message/);
  });

  it('client code never holds the service role and never writes storage directly', () => {
    const files = ['repository.ts', 'types.ts'].map((f) => src(`src/features/publications/${f}`)).join('\n');
    expect(files).not.toMatch(/SERVICE_ROLE|service_role/);
    expect(files).not.toMatch(/\.storage\b|createSignedUrl|getPublicUrl|\.upload\(/);
    if (existsSync(join(ROOT, 'dist/assets'))) {
      const assets = readdirSync(join(ROOT, 'dist/assets')).filter((f) => f.endsWith('.js'));
      for (const a of assets) expect(src(`dist/assets/${a}`)).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
    }
  });

  it('no Publications route or UI yet', () => {
    expect(src('src/App.tsx')).not.toMatch(/publicaciones|publications/i);
  });

  it('frozen Meta handlers are byte-identical', () => {
    const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex').slice(0, 8);
    expect(sha('supabase/functions/meta-oauth-start/handler.ts')).toBe('e21d60a5');
    expect(sha('supabase/functions/meta-oauth-callback/handler.ts')).toBe('89ff215b');
    expect(sha('supabase/functions/meta-connection/handler.ts')).toBe('57e8341f');
    expect(sha('supabase/functions/meta-read/handler.ts')).toBe('987cc94b');
  });
});
