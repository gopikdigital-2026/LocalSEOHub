import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Publication } from '../../publications/types';
import { currentDraft, deriveStage, hasManualEdits, parsePubParam, toResumeCandidates, type DraftState } from '../model';
import { listDraftStates, toDraftState } from '../repository';
import { resolveResume, type ResumeApi } from '../resolve';
import { RESUME } from '../copy';

const ROOT = join(__dirname, '../../../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = src('src/features/publications/validation/PublicationsValidationPage.tsx');
const STEP3 = src('src/features/channel-adaptation/ChannelAdaptationPanel.tsx');
const STEP4 = src('src/features/channel-review/ChannelReviewPanel.tsx');
const PROVIDER = src('src/features/publication-resume/PublicationResumeProvider.tsx');
const BAR = src('src/features/publication-resume/ResumeBar.tsx');
const RESUME_DIR = 'src/features/publication-resume';
const RESUME_SRC = readdirSync(join(ROOT, RESUME_DIR)).filter((f) => /\.tsx?$/.test(f)).map((f) => src(`${RESUME_DIR}/${f}`)).join('\n');
const APP = src('src/App.tsx');

const BIZ = '11111111-1111-4111-8111-111111111111';
const OTHER_BIZ = '22222222-2222-4222-8222-222222222222';
const PUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PUB_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GEN = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
const OLD_GEN = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const IMAGE = { path: 'u/p.jpg', mime: 'image/jpeg' as const, bytes: 1000, width: 800, height: 600, uploadedAt: '2026-10-28T10:00:00Z' };

function pub(id: string, status: Publication['status'], over: Partial<{ businessId: string; updatedAt: string; generationId: string }> = {}): Publication {
  const base = { id, businessId: over.businessId ?? BIZ, createdAt: '2026-10-28T09:00:00Z', updatedAt: over.updatedAt ?? '2026-10-28T10:00:00Z', generationsUsed: 1 };
  if (status === 'draft') return { ...base, status, image: null, proposals: null };
  if (status === 'image_ready') return { ...base, status, image: IMAGE, proposals: null };
  return { ...base, status, image: IMAGE, proposals: { generationId: over.generationId ?? GEN, lang: 'es', generatedAt: '2026-10-28T10:01:00Z', generationsUsed: 1 } };
}

const draft = (publicationId: string, over: Partial<DraftState> = {}): DraftState => ({
  publicationId, sourceGenerationId: GEN, adapted: false, edited: false, updatedAt: '2026-10-28T11:00:00Z', ...over,
});

function api(pubs: Publication[], drafts: DraftState[]): ResumeApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    // Owner-scoped reads: rows outside `pubs` behave like rows hidden by row level security.
    getDraft: vi.fn(async (id: string) => { calls.push(`get:${id}`); return pubs.find((p) => p.id === id) ?? null; }),
    listDrafts: vi.fn(async (b: string) => { calls.push(`list:${b}`); return pubs.filter((p) => p.businessId === b); }),
    listDraftStates: vi.fn(async (ids: string[]) => { calls.push(`drafts:${ids.join(',')}`); return drafts.filter((d) => ids.includes(d.publicationId)); }),
  };
}

describe('A3.7.3.4 URL pointer', () => {
  it('parses an absent, malformed or valid publication id', () => {
    expect(parsePubParam(null)).toEqual({ kind: 'none' });
    expect(parsePubParam('')).toEqual({ kind: 'none' });
    for (const bad of ['123', 'not-a-uuid', `${PUB_A}x`, `'; drop table publications;--`, '../etc']) expect(parsePubParam(bad)).toEqual({ kind: 'invalid' });
    expect(parsePubParam(PUB_A.toUpperCase())).toEqual({ kind: 'id', id: PUB_A });
  });
});

describe('A3.7.3.4 stage derivation from the server model', () => {
  it('derives every stage from publication status and the current-generation draft', () => {
    expect(deriveStage(pub(PUB_A, 'draft'), null)).toBe('upload');
    expect(deriveStage(pub(PUB_A, 'image_ready'), null)).toBe('generate');
    expect(deriveStage(pub(PUB_A, 'proposals_ready'), null)).toBe('select');
    expect(deriveStage(pub(PUB_A, 'proposals_ready'), draft(PUB_A, { sourceGenerationId: OLD_GEN, adapted: true }))).toBe('select');
    expect(deriveStage(pub(PUB_A, 'proposals_ready'), draft(PUB_A))).toBe('adapt');
    expect(deriveStage(pub(PUB_A, 'proposals_ready'), draft(PUB_A, { adapted: true }))).toBe('review');
  });

  it('ignores a draft that belongs to another publication', () => {
    expect(currentDraft(pub(PUB_A, 'proposals_ready'), draft(PUB_B, { adapted: true }))).toBeNull();
    expect(deriveStage(pub(PUB_A, 'proposals_ready'), draft(PUB_B, { adapted: true }))).toBe('select');
  });

  it('reports manual edits only for a current, adapted draft', () => {
    expect(hasManualEdits(pub(PUB_A, 'proposals_ready'), draft(PUB_A, { adapted: true, edited: true }))).toBe(true);
    expect(hasManualEdits(pub(PUB_A, 'proposals_ready'), draft(PUB_A, { adapted: true }))).toBe(false);
    expect(hasManualEdits(pub(PUB_A, 'proposals_ready'), draft(PUB_A, { sourceGenerationId: OLD_GEN, adapted: true, edited: true }))).toBe(false);
  });

  it('maps draft rows, treating saved text different from the generated text as a manual edit', () => {
    const row = {
      publication_id: PUB_A, source_generation_id: GEN, updated_at: '2026-10-28T11:00:00Z',
      facebook_generated: 'FB', instagram_generated: 'IG', facebook_text: 'FB', instagram_text: 'IG editado',
    };
    expect(toDraftState(row)).toEqual(draft(PUB_A, { adapted: true, edited: true }));
    expect(toDraftState({ ...row, instagram_text: 'IG' })?.edited).toBe(false);
    expect(toDraftState({ ...row, facebook_generated: null, instagram_generated: null, facebook_text: null, instagram_text: null }))
      .toEqual(draft(PUB_A, { adapted: false, edited: false }));
    expect(toDraftState({ ...row, publication_id: 7 })).toBeNull();
  });
});

describe('A3.7.3.4 resume scenarios', () => {
  it('A. zero drafts and no id: nothing to choose, Step 1 is the only path', async () => {
    const s = await resolveResume(parsePubParam(null), BIZ, api([], []));
    expect(s).toEqual({ status: 'none', candidates: [] });
  });

  it('B. one draft and no id: listed in the chooser, never auto-selected', async () => {
    const s = await resolveResume(parsePubParam(null), BIZ, api([pub(PUB_A, 'image_ready')], []));
    expect(s.status).toBe('none');
    expect(s).not.toHaveProperty('publication');
    if (s.status === 'none') expect(s.candidates.map((c) => c.id)).toEqual([PUB_A]);
  });

  it('C. multiple drafts: every one listed with stage and activity, no heuristic pick', async () => {
    const pubs = [
      pub(PUB_A, 'image_ready', { updatedAt: '2026-10-28T08:00:00Z' }),
      pub(PUB_B, 'proposals_ready', { updatedAt: '2026-10-28T09:00:00Z' }),
      pub(PUB_C, 'proposals_ready', { updatedAt: '2026-10-28T07:00:00Z' }),
    ];
    const s = await resolveResume(parsePubParam(null), BIZ, api(pubs, [draft(PUB_C, { adapted: true, edited: true, updatedAt: '2026-10-28T12:00:00Z' })]));
    expect(s.status).toBe('none');
    if (s.status !== 'none') return;
    expect(s.candidates).toEqual([
      { id: PUB_C, stage: 'review', lastModified: '2026-10-28T12:00:00Z', edited: true },
      { id: PUB_B, stage: 'select', lastModified: '2026-10-28T09:00:00Z', edited: false },
      { id: PUB_A, stage: 'generate', lastModified: '2026-10-28T08:00:00Z', edited: false },
    ]);
  });

  it('D. a valid owned id resumes exactly that publication and never lists or guesses', async () => {
    const a = api([pub(PUB_A, 'proposals_ready'), pub(PUB_B, 'proposals_ready', { updatedAt: '2030-01-01T00:00:00Z' })], [draft(PUB_A, { adapted: true })]);
    const s = await resolveResume(parsePubParam(PUB_A), BIZ, a);
    expect(s.status).toBe('ready');
    if (s.status === 'ready') {
      expect(s.publication.id).toBe(PUB_A);
      expect(s.draft?.publicationId).toBe(PUB_A);
    }
    expect(a.calls).toEqual([`get:${PUB_A}`, `drafts:${PUB_A}`]);
  });

  it('E. a malformed id is a safe unavailable state with no server call', async () => {
    const a = api([pub(PUB_A, 'image_ready')], []);
    expect(await resolveResume(parsePubParam('nope'), BIZ, a)).toEqual({ status: 'unavailable' });
    expect(a.calls).toEqual([]);
  });

  it('F. another user\'s id is indistinguishable from a missing one', async () => {
    const hidden = await resolveResume(parsePubParam(PUB_B), BIZ, api([pub(PUB_A, 'image_ready')], []));
    const missing = await resolveResume(parsePubParam(PUB_C), BIZ, api([], []));
    expect(hidden).toEqual({ status: 'unavailable' });
    expect(missing).toEqual(hidden);
    expect(RESUME.unavailable.es).not.toMatch(/[0-9a-f]{8}-/);
  });

  it('G. a publication of another owned business is not available in this context and never listed', async () => {
    const pubs = [pub(PUB_A, 'image_ready'), pub(PUB_B, 'image_ready', { businessId: OTHER_BIZ })];
    expect(await resolveResume(parsePubParam(PUB_B), BIZ, api(pubs, []))).toEqual({ status: 'other_business' });
    const list = await resolveResume(parsePubParam(null), BIZ, api(pubs, []));
    if (list.status === 'none') expect(list.candidates.map((c) => c.id)).toEqual([PUB_A]);
    expect(toResumeCandidates(pubs, [], BIZ).map((c) => c.id)).toEqual([PUB_A]);
  });

  it('H. reload while editing: same publication, persisted draft and its manual edits', async () => {
    const s = await resolveResume(parsePubParam(PUB_A), BIZ, api([pub(PUB_A, 'proposals_ready')], [draft(PUB_A, { adapted: true, edited: true })]));
    expect(s.status === 'ready' && [s.publication.id, deriveStage(s.publication, s.draft), hasManualEdits(s.publication, s.draft)]).toEqual([PUB_A, 'review', true]);
  });

  it('I. reload after selection, before adaptation: adapt stage', async () => {
    const s = await resolveResume(parsePubParam(PUB_A), BIZ, api([pub(PUB_A, 'proposals_ready')], [draft(PUB_A)]));
    expect(s.status === 'ready' && deriveStage(s.publication, s.draft)).toBe('adapt');
  });

  it('J. reload after upload, before generation: same publication at the generate stage', async () => {
    const s = await resolveResume(parsePubParam(PUB_A), BIZ, api([pub(PUB_A, 'image_ready')], []));
    expect(s.status === 'ready' && [s.publication.id, deriveStage(s.publication, s.draft)]).toEqual([PUB_A, 'generate']);
  });

  it('a failing server read collapses into the same generic state', async () => {
    const a = api([], []);
    a.getDraft = vi.fn(async () => { throw new Error('boom'); });
    expect(await resolveResume(parsePubParam(PUB_A), BIZ, a)).toEqual({ status: 'unavailable' });
  });
});

describe('A3.7.3.4 draft state read', () => {
  it('reads only the given ids through the signed-in client and fails closed', async () => {
    const inFn = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: vi.fn(() => ({ select: vi.fn(() => ({ in: inFn })) })) };
    expect(await listDraftStates([], db as never)).toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
    await listDraftStates([PUB_A], db as never);
    expect(db.from).toHaveBeenCalledWith('publication_drafts');
    expect(inFn).toHaveBeenCalledWith('publication_id', [PUB_A]);
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: '42501' } }) }) }) };
    await expect(listDraftStates([PUB_A], broken as never)).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('A3.7.3.4 single publication identity', () => {
  it('steps 1-4 all read the one publication held by the resume layer', () => {
    for (const file of [PAGE, STEP3, STEP4]) {
      expect(file).toMatch(/usePublicationResume\(\)/);
      expect(file).not.toMatch(/latestReady|listDrafts/);
    }
    expect(PAGE).toMatch(/const pub = resume\.publication;/);
    expect(STEP3).toMatch(/const \{ publication, refresh \} = usePublicationResume\(\);/);
    expect(STEP4).toMatch(/const \{ publication, revision, setUnsaved \} = usePublicationResume\(\);/);
  });

  it('every step acts on that same id', () => {
    expect(PAGE).toMatch(/generateProposals\(pub\.id, lang\)/);
    expect(PAGE).toMatch(/await deleteDraft\(pub\.id\)/);
    expect(STEP3).toMatch(/selectPublicationProposal\(pub\.id, /);
    expect(STEP3).toMatch(/adaptPublication\(pub\.id, /);
    expect(STEP4).toMatch(/getReviewDraft\(pubId\)/);
    expect(STEP4).toMatch(/saveChannelDrafts\(draft, /);
  });

  it('upload establishes the id and puts it in the URL; the URL is read in one place only', () => {
    expect(PAGE).toMatch(/resume\.adopt\(await attachImage\(target\.id, file\)\)/);
    expect(PROVIDER).toMatch(/useSearchParams\(\)/);
    expect(PROVIDER.match(/next\.set\(PUB_PARAM, id\)/g)).toHaveLength(1);
    for (const file of [PAGE, STEP3, STEP4, BAR]) expect(file).not.toMatch(/useSearchParams|useParams|searchParams|location\.search/);
  });

  it('the hidden harness route renders inside the resume layout route', () => {
    const layout = APP.indexOf('<Route element={<Suspense fallback={SKELETON}><PublicationResumeProvider /></Suspense>}>');
    const route = APP.indexOf('<Route path="/internal/publications-validation"');
    expect(layout).toBeGreaterThan(-1);
    expect(route).toBeGreaterThan(layout);
    expect(APP.indexOf('</Route>', route)).toBeLessThan(APP.indexOf('<Route path=', route + 1));
    expect(PROVIDER).toMatch(/<Outlet \/>/);
  });

  it('the step is derived from the server, never persisted in the browser', () => {
    for (const file of [RESUME_SRC, PAGE, STEP3, STEP4]) expect(file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it('unsaved edits stay truthful: browser exit warning plus in-app switch confirmation', () => {
    expect(STEP4).toMatch(/beforeunload/);
    expect(STEP4).toMatch(/setUnsaved\(anyDirty\)/);
    expect(PROVIDER).toMatch(/window\.confirm\(RESUME\.leaveWarning\[lang\]\)/);
    expect(STEP4).toMatch(/dirtyRef\.current && !window\.confirm/);
  });

  it('the resume layer holds no keys, signed links, storage or provider calls', () => {
    expect(RESUME_SRC).not.toMatch(/service_role|SERVICE_ROLE|createSignedUrl|getPublicUrl|\.storage\b|functions\.invoke|\.rpc\(|fetch\(|openai|graph\.facebook|googleapis/i);
    expect(BAR).not.toMatch(/<img/);
    expect(src(`${RESUME_DIR}/repository.ts`)).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(RESUME_SRC.match(/\.from\(/g)).toHaveLength(1);
  });
});
