import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { countChars, isDirty, isEdited, normalizeText, readiness, textIssue } from '../../channel-review/model';
import { getReviewDraft, saveChannelDrafts, toReviewDraft, toSaveResult } from '../../channel-review/repository';
import { CHANNEL_LIMITS, ReviewError, SAVE_RPC, type ReviewDraft } from '../../channel-review/types';
import { REVIEW, REVIEW_ERROR_TEXT } from '../../channel-review/copy';

const ROOT = join(__dirname, '../../../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const MIGRATION = src('supabase/migrations/20261027233150_a3733_publication_channel_review_editing.sql');
const FIRST_APPLY = src('supabase/migrations/20261027233057_a3733_publication_channel_review_editing.sql');
const body = (sql: string) => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
const SAVE_FN = MIGRATION.slice(MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.save_publication_channel_drafts'));
const REVIEW_DIR = 'src/features/channel-review';
const CLIENT_FILES = readdirSync(join(ROOT, REVIEW_DIR)).filter((f) => /\.tsx?$/.test(f));
const CLIENT = CLIENT_FILES.map((f) => src(`${REVIEW_DIR}/${f}`)).join('\n');
const PANEL = src(`${REVIEW_DIR}/ChannelReviewPanel.tsx`);

const PUB = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const GEN = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const OTHER_GEN = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
const FB_GEN = 'Texto generado para Facebook.';
const IG_GEN = 'Texto generado para Instagram.';

const DRAFT: ReviewDraft = {
  publicationId: PUB, version: 2, sourceGenerationId: GEN,
  facebookGenerated: FB_GEN, instagramGenerated: IG_GEN,
  facebookText: FB_GEN, instagramText: IG_GEN, updatedAt: '2026-10-27T23:08:42Z',
};

const ROW = {
  publication_id: PUB, version: 2, source_generation_id: GEN,
  facebook_generated: FB_GEN, instagram_generated: IG_GEN,
  facebook_text: FB_GEN, instagram_text: IG_GEN, updated_at: '2026-10-27T23:08:42Z',
};

const saved = (over: Record<string, unknown> = {}) => ({
  result: 'saved',
  draft: { version: 3, updated_at: '2026-10-27T23:30:00Z', facebook_text: FB_GEN, instagram_text: IG_GEN, facebook_generated: FB_GEN, instagram_generated: IG_GEN, ...over },
});

function rpcDb(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => result);
  const invoke = vi.fn();
  return { db: { from: vi.fn(), rpc, functions: { invoke } } as never, rpc, invoke };
}

function selectDb(result: { data: unknown; error: unknown }) {
  const calls: { table?: string; columns?: string; eq?: [string, unknown] } = {};
  const chain = {
    select: (c: string) => { calls.columns = c; return chain; },
    eq: (k: string, v: unknown) => { calls.eq = [k, v]; return chain; },
    maybeSingle: () => Promise.resolve(result),
  };
  const db = { from: (t: string) => { calls.table = t; return chain; }, rpc: vi.fn() } as never;
  return { db, calls };
}

const lastArgs = (rpc: ReturnType<typeof vi.fn>) => rpc.mock.calls[0][1] as Record<string, unknown>;

describe('A3.7.3.3 load (owner only)', () => {
  it('1. owner loads the draft through an RLS-scoped select by publication id', async () => {
    const { db, calls } = selectDb({ data: ROW, error: null });
    expect(await getReviewDraft(PUB, db)).toEqual(DRAFT);
    expect(calls.table).toBe('publication_drafts');
    expect(calls.eq).toEqual(['publication_id', PUB]);
    expect(calls.columns).not.toMatch(/user_id|business_id/);
  });

  it('2. a non-owner sees no row (RLS) and cannot write (server not_found)', async () => {
    const { db } = selectDb({ data: null, error: null });
    expect(await getReviewDraft(PUB, db)).toBeNull();
    const w = rpcDb({ data: { result: 'not_found' }, error: null });
    await expect(saveChannelDrafts(DRAFT, { kind: 'text', text: 'Hola' }, { kind: 'keep' }, w.db)).rejects.toMatchObject({ code: 'not_found' });
    expect(SAVE_FN).toMatch(/WHERE id = p_publication_id AND user_id = v_uid\s+FOR UPDATE/);
    expect(SAVE_FN).toMatch(/publication_id = v_pub\.id AND user_id = v_uid AND business_id = v_pub\.business_id/);
  });

  it('returns null for drafts that have not been adapted and rejects malformed rows', async () => {
    const { db } = selectDb({ data: { ...ROW, facebook_generated: null }, error: null });
    expect(await getReviewDraft(PUB, db)).toBeNull();
    expect(toReviewDraft({ ...ROW, version: 0 })).toBeNull();
    expect(toReviewDraft({ ...ROW, facebook_text: 42 })).toBeNull();
    const bad = selectDb({ data: null, error: { code: 'X' } });
    await expect(getReviewDraft(PUB, bad.db)).rejects.toMatchObject({ code: 'internal_error' });
  });
});

describe('A3.7.3.3 generated texts are immutable', () => {
  const updateBlock = SAVE_FN.slice(SAVE_FN.indexOf('UPDATE public.publication_drafts SET'), SAVE_FN.indexOf('RETURNING'));

  it('3. facebook_generated is never assigned by the save path', () => {
    expect(updateBlock).not.toMatch(/facebook_generated/);
    expect(MIGRATION).not.toMatch(/facebook_generated\s*=\s*(?!v_draft)/);
  });

  it('4. instagram_generated is never assigned by the save path', () => {
    expect(updateBlock).not.toMatch(/instagram_generated/);
    expect(MIGRATION).not.toMatch(/instagram_generated\s*=\s*(?!v_draft)/);
  });

  it('updates only the final text columns, the version and updated_at', () => {
    const assigned = [...updateBlock.matchAll(/^\s*(\w+)\s*=/gm)].map((m) => m[1]);
    expect(assigned).toEqual(['facebook_text', 'instagram_text', 'version', 'updated_at']);
    expect(MIGRATION).not.toMatch(/ALTER TABLE|CREATE TABLE|DROP |DELETE FROM|INSERT INTO/i);
  });
});

describe('A3.7.3.3 save', () => {
  it('5. a facebook edit is sent and the authoritative result is returned', async () => {
    const { db, rpc } = rpcDb({ data: saved({ facebook_text: 'Nuevo FB' }), error: null });
    const res = await saveChannelDrafts(DRAFT, { kind: 'text', text: 'Nuevo FB' }, { kind: 'keep' }, db);
    expect(rpc).toHaveBeenCalledWith(SAVE_RPC, expect.objectContaining({ p_facebook: 'Nuevo FB', p_instagram: null }));
    expect(res.facebookText).toBe('Nuevo FB');
    expect(res.facebookGenerated).toBe(FB_GEN);
  });

  it('6. an instagram edit is sent and persisted', async () => {
    const { db, rpc } = rpcDb({ data: saved({ instagram_text: 'Nuevo IG #cafe' }), error: null });
    const res = await saveChannelDrafts(DRAFT, { kind: 'keep' }, { kind: 'text', text: 'Nuevo IG #cafe' }, db);
    expect(lastArgs(rpc)).toMatchObject({ p_facebook: null, p_instagram: 'Nuevo IG #cafe' });
    expect(res.instagramText).toBe('Nuevo IG #cafe');
    expect(res.instagramGenerated).toBe(IG_GEN);
  });

  it('7. both edits go in one call and one UPDATE statement (atomic)', async () => {
    const { db, rpc } = rpcDb({ data: saved({ facebook_text: 'A', instagram_text: 'B' }), error: null });
    await saveChannelDrafts(DRAFT, { kind: 'text', text: 'A' }, { kind: 'text', text: 'B' }, db);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(SAVE_FN.match(/UPDATE public\.publication_drafts/g)).toHaveLength(1);
  });

  it('8. the version increments by one on every save', async () => {
    expect(SAVE_FN).toMatch(/version = v_draft\.version \+ 1/);
    const { db } = rpcDb({ data: saved(), error: null });
    expect((await saveChannelDrafts(DRAFT, { kind: 'text', text: 'X' }, { kind: 'keep' }, db)).version).toBe(3);
  });

  it('9. a stale expected version is rejected with STALE_DRAFT and the exact message', async () => {
    expect(SAVE_FN).toMatch(/IF v_draft\.version <> p_expected_version THEN\s+RETURN jsonb_build_object\('result', 'stale_draft'/);
    expect(SAVE_FN).toMatch(/WHERE publication_id = v_pub\.id AND version = p_expected_version/);
    const { db } = rpcDb({ data: { result: 'stale_draft', version: 5 }, error: null });
    await expect(saveChannelDrafts(DRAFT, { kind: 'text', text: 'X' }, { kind: 'keep' }, db)).rejects.toMatchObject({ code: 'stale_draft' });
    expect(REVIEW_ERROR_TEXT.stale_draft.es).toBe('Este borrador ha cambiado desde que lo abriste. Recarga la versión más reciente antes de guardar.');
  });

  it('10. the current version is sent as the expected version and succeeds', async () => {
    const { db, rpc } = rpcDb({ data: saved(), error: null });
    await expect(saveChannelDrafts(DRAFT, { kind: 'text', text: 'X' }, { kind: 'keep' }, db)).resolves.toBeTruthy();
    expect(lastArgs(rpc).p_expected_version).toBe(2);
  });
});

describe('A3.7.3.3 validation', () => {
  it('11. facebook over 5000 characters is rejected without truncation and never sent', async () => {
    const long = 'a'.repeat(5001);
    expect(textIssue('a'.repeat(5000), 'facebook')).toBeNull();
    expect(textIssue(long, 'facebook')).toBe('too_long');
    const { db, rpc } = rpcDb({ data: saved(), error: null });
    await expect(saveChannelDrafts(DRAFT, { kind: 'text', text: long }, { kind: 'keep' }, db)).rejects.toMatchObject({ code: 'invalid_facebook_text', reason: 'too_long' });
    expect(rpc).not.toHaveBeenCalled();
    expect(SAVE_FN).toMatch(/publication_channel_text_issue\(v_fb, 5000\)/);
  });

  it('12. instagram over 2200 characters is rejected', async () => {
    expect(textIssue('a'.repeat(2200), 'instagram')).toBeNull();
    expect(textIssue('a'.repeat(2201), 'instagram')).toBe('too_long');
    const { db } = rpcDb({ data: { result: 'invalid_instagram_text', reason: 'too_long' }, error: null });
    await expect(saveChannelDrafts(DRAFT, { kind: 'keep' }, { kind: 'restore' }, db)).rejects.toMatchObject({ code: 'invalid_instagram_text', reason: 'too_long' });
    expect(SAVE_FN).toMatch(/publication_channel_text_issue\(v_ig, 2200\)/);
    expect(CHANNEL_LIMITS).toEqual({ facebook: 5000, instagram: 2200 });
  });

  it('13. empty or whitespace-only facebook text is rejected', () => {
    expect(textIssue('', 'facebook')).toBe('empty');
    expect(textIssue('  \n\t ', 'facebook')).toBe('empty');
    expect(MIGRATION).toMatch(/btrim\(p_text, E' \\t\\n\\r'\) = '' THEN 'empty'/);
  });

  it('14. empty instagram text is rejected', async () => {
    const { db, rpc } = rpcDb({ data: saved(), error: null });
    await expect(saveChannelDrafts(DRAFT, { kind: 'keep' }, { kind: 'text', text: '   ' }, db)).rejects.toMatchObject({ code: 'invalid_instagram_text', reason: 'empty' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('15. malformed payloads are rejected on both sides', async () => {
    const { db, rpc } = rpcDb({ data: saved(), error: null });
    await expect(saveChannelDrafts(DRAFT, { kind: 'keep' }, { kind: 'keep' }, db)).rejects.toMatchObject({ code: 'invalid_payload' });
    await expect(saveChannelDrafts({ ...DRAFT, publicationId: 'x; drop' }, { kind: 'text', text: 'a' }, { kind: 'keep' }, db)).rejects.toMatchObject({ code: 'not_found' });
    await expect(saveChannelDrafts({ ...DRAFT, version: 1.5 }, { kind: 'text', text: 'a' }, { kind: 'keep' }, db)).rejects.toMatchObject({ code: 'stale_draft' });
    expect(rpc).not.toHaveBeenCalled();
    expect(SAVE_FN).toMatch(/\(p_restore_facebook AND p_facebook IS NOT NULL\)/);
    expect(SAVE_FN).toMatch(/octet_length\(p_facebook\), 0\) > 32768/);
    expect(() => toSaveResult('nope', PUB, GEN)).toThrow(ReviewError);
    expect(() => toSaveResult({ result: 'saved', draft: { version: 'x' } }, PUB, GEN)).toThrow(ReviewError);
    const big = rpcDb({ data: { result: 'payload_too_large' }, error: null });
    await expect(saveChannelDrafts(DRAFT, { kind: 'text', text: 'a' }, { kind: 'keep' }, big.db)).rejects.toMatchObject({ code: 'payload_too_large' });
  });

  it('keeps human business details and rejects markup and control characters', () => {
    for (const ok of ['Menú 12,50 € hasta el 31/10', 'Abrimos 9:00-14:00 · Calle Mayor 3', 'Reserva: 600 123 456', 'https://ejemplo.es/oferta', '2 < 3 y 5 > 4', 'Café ☕ y tarta', 'línea 1\nlínea 2\tfin'])
      expect(textIssue(ok, 'facebook')).toBeNull();
    expect(textIssue('<script>alert(1)</script>', 'facebook')).toBe('markup');
    expect(textIssue('<img src=x onerror=1>', 'instagram')).toBe('markup');
    expect(textIssue('hola\u0007', 'facebook')).toBe('control_chars');
    expect(textIssue('hola\u202Eadios', 'facebook')).toBe('control_chars');
    expect(countChars('☕🍰')).toBe(2);
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('16. protected ids cannot be changed: only six whitelisted arguments are sent', async () => {
    const { db, rpc } = rpcDb({ data: saved(), error: null });
    const hostile = { ...DRAFT, businessId: 'evil', userId: 'evil', __proto__: { isAdmin: true } } as unknown as ReviewDraft;
    await saveChannelDrafts(hostile, { kind: 'text', text: 'X' }, { kind: 'keep' }, db);
    expect(Object.keys(lastArgs(rpc)).sort()).toEqual(['p_expected_version', 'p_facebook', 'p_instagram', 'p_publication_id', 'p_restore_facebook', 'p_restore_instagram']);
    const res = toSaveResult(saved({ publication_id: 'other', source_generation_id: 'other' }), PUB, GEN);
    expect(res.publicationId).toBe(PUB);
    expect(res.sourceGenerationId).toBe(GEN);
    expect(SAVE_FN).not.toMatch(/p_business_id|p_user_id/);
  });
});

describe('A3.7.3.3 restore', () => {
  it('17. restoring facebook sends only the restore flag and copies the generated text server-side', async () => {
    const { db, rpc } = rpcDb({ data: saved({ facebook_text: FB_GEN, instagram_text: 'IG editado' }), error: null });
    const res = await saveChannelDrafts(DRAFT, { kind: 'restore' }, { kind: 'keep' }, db);
    expect(lastArgs(rpc)).toMatchObject({ p_facebook: null, p_restore_facebook: true, p_restore_instagram: false });
    expect(res.facebookText).toBe(FB_GEN);
    expect(res.instagramText).toBe('IG editado');
    expect(SAVE_FN).toMatch(/WHEN p_restore_facebook THEN v_draft\.facebook_generated/);
  });

  it('18. restoring instagram works the same way', async () => {
    const { db, rpc } = rpcDb({ data: saved({ instagram_text: IG_GEN }), error: null });
    await saveChannelDrafts(DRAFT, { kind: 'keep' }, { kind: 'restore' }, db);
    expect(lastArgs(rpc)).toMatchObject({ p_instagram: null, p_restore_instagram: true, p_restore_facebook: false });
    expect(SAVE_FN).toMatch(/WHEN p_restore_instagram THEN v_draft\.instagram_generated/);
  });

  it('19-20. restore and save never call an edge function or AI', async () => {
    const { db, invoke } = rpcDb({ data: saved(), error: null });
    await saveChannelDrafts(DRAFT, { kind: 'restore' }, { kind: 'text', text: 'X' }, db);
    expect(invoke).not.toHaveBeenCalled();
    expect(CLIENT).not.toMatch(/functions\.invoke|fetch\(|openai|gpt-|\/functions\/v1/i);
    expect(MIGRATION).not.toMatch(/openai|http_post|net\.http|pg_net/i);
  });

  it('21-23. no AI, adaptation or proposal usage counters are touched', () => {
    for (const forbidden of ['ai_usage_monthly', 'ai_usage_reservations', 'adaptations_used', 'publication_proposals_used', 'publication_adaptations_used', 'proposal_generations_used', 'adaptation_claim_id ='])
      expect(SAVE_FN).not.toContain(forbidden);
  });
});

describe('A3.7.3.3 derived state', () => {
  it('24. dirty state compares the local text with the last saved text', () => {
    expect(isDirty(FB_GEN, FB_GEN)).toBe(false);
    expect(isDirty(`${FB_GEN}!`, FB_GEN)).toBe(true);
    expect(isDirty('a\r\nb', 'a\nb')).toBe(false);
    expect(PANEL).toMatch(/beforeunload/);
    expect(PANEL).toMatch(/t\('unsaved'\)/);
    expect(REVIEW.unsaved.es).toBe('Cambios sin guardar');
    expect(REVIEW.saved.es).toBe('Guardado');
  });

  it('25. edited vs generated is derived from normalized text', () => {
    expect(isEdited(FB_GEN, FB_GEN)).toBe(false);
    expect(isEdited(`  ${FB_GEN}\r\n`, FB_GEN)).toBe(false);
    expect(isEdited('Otro texto', FB_GEN)).toBe(true);
    expect(REVIEW.edited.es).toBe('Editado por ti');
    expect(REVIEW.generated.es).toBe('Versión generada');
  });

  it('26. readiness is READY only for a current, valid draft', () => {
    expect(readiness(DRAFT, GEN)).toBe('ready');
    expect(readiness(DRAFT, OTHER_GEN)).toBe('not_ready');
    expect(readiness(null, GEN)).toBe('not_ready');
    expect(readiness(DRAFT, null)).toBe('not_ready');
    expect(readiness({ ...DRAFT, instagramText: 'a'.repeat(2201) }, GEN)).toBe('not_ready');
    expect(CLIENT).not.toMatch(/'(published|scheduled|posted)'/i);
    expect(REVIEW.ready.es).toBe('Borrador listo');
    expect(REVIEW.reviewing.es).toBe('Listo para revisar');
  });
});

describe('A3.7.3.3 security and scope', () => {
  it('27. cross-tenant: knowing another publication id, business id and version still yields not_found', async () => {
    expect(SAVE_FN).toMatch(/v_uid uuid := auth\.uid\(\)/);
    expect(SAVE_FN).toMatch(/IF v_uid IS NULL THEN\s+RETURN jsonb_build_object\('result', 'unauthenticated'\)/);
    expect(SAVE_FN).toMatch(/FROM public\.businesses WHERE id = v_pub\.business_id AND user_id = v_uid/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.save_publication_channel_drafts\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_publication_channel_drafts\([^)]*\) TO authenticated;/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.publication_channel_text_issue\(text, integer\) FROM PUBLIC, anon, authenticated;/);
    expect(MIGRATION).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    expect(MIGRATION).not.toMatch(/GRANT [^;]*TO anon/);
    const { db } = rpcDb({ data: { result: 'not_found' }, error: null });
    await expect(saveChannelDrafts({ ...DRAFT, publicationId: 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5', version: 7 }, { kind: 'text', text: 'hack' }, { kind: 'keep' }, db))
      .rejects.toMatchObject({ code: 'not_found' });
    const anon = rpcDb({ data: null, error: { code: '42501', message: 'permission denied for function' } });
    await expect(saveChannelDrafts(DRAFT, { kind: 'text', text: 'x' }, { kind: 'keep' }, anon.db)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('never exposes raw server errors in the interface', () => {
    for (const msg of Object.values(REVIEW_ERROR_TEXT)) {
      expect(msg.es).not.toMatch(/sql|postgres|relation|42501|exception/i);
      expect(msg.en).not.toMatch(/sql|postgres|relation|42501|exception/i);
    }
    expect(PANEL).not.toMatch(/\.message\b/);
  });

  it('28. no Meta Graph calls, tokens or scopes in this phase', () => {
    expect(CLIENT + MIGRATION).not.toMatch(/graph\.facebook|graph\.instagram|access_token|meta_connections|appsecret|vault\./i);
  });

  it('29. there is no publish endpoint or Publicar button', () => {
    expect(CLIENT + MIGRATION).not.toMatch(/\/feed|\/photos|\/media_publish|\/media\b|publish_/i);
    expect(CLIENT).not.toMatch(/Publicar/);
    expect(src('src/App.tsx')).not.toMatch(/publish-publication|media_publish/);
    const fns = readdirSync(join(ROOT, 'supabase/functions'));
    expect(fns.filter((f) => /publish/i.test(f))).toEqual([]);
  });

  describe('migration history: original definition then corrective re-definition', () => {
    const markupRe = (sql: string) => {
      const m = sql.match(/WHEN p_text ~ '([^']+)' THEN 'markup'/);
      expect(m, 'markup clause').not.toBeNull();
      return new RegExp(m![1]);
    };
    const declared = (sql: string) => body(sql).match(/^(CREATE OR REPLACE FUNCTION [\w.]+|REVOKE .*|GRANT .*)/gm);
    const GRANTS = [
      'CREATE OR REPLACE FUNCTION public.publication_channel_text_issue',
      'REVOKE ALL ON FUNCTION public.publication_channel_text_issue(text, integer) FROM PUBLIC, anon, authenticated;',
      'CREATE OR REPLACE FUNCTION public.save_publication_channel_drafts',
      'REVOKE ALL ON FUNCTION public.save_publication_channel_drafts(uuid, integer, text, text, boolean, boolean) FROM PUBLIC, anon, authenticated;',
      'GRANT EXECUTE ON FUNCTION public.save_publication_channel_drafts(uuid, integer, text, text, boolean, boolean) TO authenticated;',
    ];

    it('keeps both migration records, in replay order', () => {
      const a3733 = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.includes('_a3733_')).sort();
      expect(a3733).toEqual([
        '20261027233057_a3733_publication_channel_review_editing.sql',
        '20261027233150_a3733_publication_channel_review_editing.sql',
      ]);
    });

    it('the original records the broad markup rule that was actually applied first', () => {
      expect(FIRST_APPLY).toContain(String.raw`WHEN p_text ~ '<\s*/?\s*[A-Za-z!]' THEN 'markup'`);
      expect(markupRe(FIRST_APPLY).test('a < b')).toBe(true);
    });

    it('the corrective migration carries the final narrow markup rule, shared with the client', () => {
      expect(MIGRATION).toContain(`WHEN p_text ~ '<[/!]?[A-Za-z]' THEN 'markup'`);
      expect(src(`${REVIEW_DIR}/model.ts`)).toContain('const MARKUP_RE = /<[/!]?[A-Za-z]/;');
    });

    it('the corrective migration fully re-declares both functions and their grants, so replay ends on it', () => {
      expect(declared(MIGRATION)).toEqual(GRANTS);
      expect(declared(FIRST_APPLY)).toEqual(GRANTS);
      expect(SAVE_FN).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    });

    it('the two migrations differ only in the markup rule and header notes, never in the save path', () => {
      expect(body(FIRST_APPLY).replace(String.raw`'<\s*/?\s*[A-Za-z!]'`, `'<[/!]?[A-Za-z]'`)).toBe(body(MIGRATION));
    });

    it('the final rule allows harmless text and still rejects tags', () => {
      const final = markupRe(MIGRATION);
      for (const ok of ['a < b', 'Menos de <10€ hoy', '3<4', 'Hoy 2x1 hasta las 14:00']) expect(final.test(ok), ok).toBe(false);
      for (const bad of ['<script>alert(1)</script>', 'x </b>', '<img src=x>', '<!DOCTYPE html>']) expect(final.test(bad), bad).toBe(true);
      for (const t of ['a < b', '<script>', 'x </b>', '<!DOCTYPE html>', '3<4']) expect(textIssue(t, 'facebook') === 'markup', t).toBe(final.test(t));
    });

    it('the final helper keeps the empty, limit, control and bidi rules', () => {
      const helper = MIGRATION.slice(MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.publication_channel_text_issue'), MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.save_publication_channel_drafts'));
      expect(helper).toContain(`btrim(p_text, E' \\t\\n\\r') = '' THEN 'empty'`);
      expect(helper).toContain(`char_length(p_text) > p_max THEN 'too_long'`);
      expect(helper).toContain(`translate(p_text, E'\\t\\n', '') ~ '[[:cntrl:]]'`);
      expect(helper).toContain(String.raw`'[\u200E\u200F\u202A-\u202E\u2066-\u2069]' THEN 'control_chars'`);
      expect(SAVE_FN).toContain('publication_channel_text_issue(v_fb, 5000)');
      expect(SAVE_FN).toContain('publication_channel_text_issue(v_ig, 2200)');
    });
  });

  it('keeps the review folder independent of the frozen adaptation folder', () => {
    expect(CLIENT).not.toMatch(/channel-adaptation|PublicationsValidationPage|internal\/publications-validation/);
  });
});

describe('A3.7.3.3 frozen baselines', () => {
  const PREFIXES: Record<string, string> = {
    'supabase/migrations/20261027165527_a3732_publication_adaptation_engine.sql': '04e4d0af14d2',
    'src/features/channel-adaptation/ChannelAdaptationPanel.tsx': 'f3d7f22da5cf',
    'src/features/channel-adaptation/copy.ts': 'aa04e4767103',
    'src/features/channel-adaptation/repository.ts': 'd4a46bd50d65',
    'src/features/channel-adaptation/types.ts': '2a46a61f1818',
  };

  it('30. frozen A3.7.3.2 client and migration fingerprints are intact', () => {
    for (const [file, prefix] of Object.entries(PREFIXES)) expect(sha(file).slice(0, 12), file).toBe(prefix);
  });
});
