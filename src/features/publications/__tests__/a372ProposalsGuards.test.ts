import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { generateProposals, getProposals, toProposal, toPublication } from '../repository';
import { PublicationError } from '../types';

const ROOT = join(__dirname, '../../../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const FN = 'supabase/functions/publication-proposals';
const INDEX = src(`${FN}/index.ts`);
const ENGINE = ['index.ts', 'handler.ts', 'context.ts', 'safety.ts', 'prompts.ts'].map((f) => src(`${FN}/${f}`)).join('\n');
const MIGRATION = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_a372_publication_proposals_engine.sql'))!;
const SQL = src(`supabase/migrations/${MIGRATION}`);
const SQL_CODE = SQL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

const ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const BIZ = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
const GEN = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const READY_ROW = {
  id: ID, business_id: BIZ, status: 'proposals_ready', image_path: 'u/p/x.jpg', image_mime: 'image/jpeg', image_bytes: 1000,
  image_width: 1080, image_height: 1080, image_uploaded_at: '2026-10-25T10:01:00Z', proposal_generation_id: GEN,
  proposals_lang: 'es', proposals_generated_at: '2026-10-25T10:02:00Z', proposal_generations_used: 1,
  created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:02:00Z',
};
const proposalRow = (position: number, role: string, generation_id = GEN) => ({
  id: `p${position}`, generation_id, position, role, lang: 'es', body: 'Texto de propuesta', cta: 'Ven a vernos',
});
const ROWS = [proposalRow(1, 'direct'), proposalRow(2, 'close'), proposalRow(3, 'professional')];

function fakeDb(pubRow: unknown, proposals: unknown[], invokeResult: { data: unknown; error: unknown } = { data: { ok: true }, error: null }) {
  const tables: Record<string, { data: unknown; error: null }> = {
    publications: { data: pubRow, error: null },
    publication_proposals: { data: proposals, error: null },
  };
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'eq']) chain[op] = () => chain;
    chain.order = () => Promise.resolve(tables[table]);
    chain.maybeSingle = () => Promise.resolve(tables[table]);
    return chain;
  });
  const invoke = vi.fn(async () => invokeResult);
  return { db: { from, functions: { invoke } } as never, invoke };
}

describe('A3.7.2 edge function guards', () => {
  it('runs the premium gate before reading the body, env or secrets', () => {
    const gate = INDEX.indexOf('requirePremium(req, "publication-proposals"');
    expect(gate).toBeGreaterThan(0);
    for (const later of ['req.text(', 'Deno.env.get(', 'createClient(']) expect(INDEX.indexOf(later)).toBeGreaterThan(gate);
    expect(INDEX.indexOf('req.method === "OPTIONS"')).toBeLessThan(gate);
  });

  it('ships the shared entitlement module verbatim and requires a JWT', () => {
    expect(src(`${FN}/entitlement.ts`)).toBe(src('supabase/functions/weekly-content/entitlement.ts'));
    expect(src('supabase/config.toml')).toMatch(/\[functions\.publication-proposals\]\nverify_jwt = true/);
  });

  it('uses only the existing OpenAI secret with structured outputs', () => {
    expect(INDEX).toContain('Deno.env.get("LocalSEO_KEY")');
    expect(INDEX).toContain('type: "json_schema"');
    expect(INDEX).toContain('AbortController');
    const hosts = [...ENGINE.matchAll(/https:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]);
    expect(new Set(hosts)).toEqual(new Set(['https://api.openai.com']));
  });

  it('never calls Meta or Google and never reads Business Memory, reviews or GBP data', () => {
    expect(ENGINE).not.toMatch(/graph\.facebook|instagram\.com|googleapis|mybusiness/i);
    expect(ENGINE).not.toMatch(/from\("(business_memory|gbp_[a-z_]+|meta_[a-z_]+|reviews?)"\)/);
    expect(ENGINE).toContain('.select(BUSINESS_COLUMNS)');
  });

  it('never logs or returns provider errors, images or the API key', () => {
    expect(INDEX).not.toMatch(/console\.[a-z]+\([^)]*(res\.text|await res\.json|apiKey|dataUrl|messages)/);
    expect(INDEX).not.toMatch(/JSON\.stringify\(\{[^}]*(error\.message|err\.message|detail)/);
    expect(ENGINE).not.toMatch(/hashtags?\s*:/i);
  });

  it('has no publishing, scheduling or channel fields', () => {
    expect(SQL_CODE).not.toMatch(/\b(scheduled_at|published_at|publish_at|instagram_media_id|meta_post_id|story|reel|hashtags)\b/i);
  });
});

describe('A3.7.2 migration', () => {
  it('locks proposals to owner read-only; writes only through service functions', () => {
    expect(SQL_CODE).toMatch(/ALTER TABLE public\.publication_proposals ENABLE ROW LEVEL SECURITY/);
    expect(SQL_CODE).toMatch(/GRANT SELECT ON public\.publication_proposals TO authenticated;/);
    expect(SQL_CODE).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*publication_proposals TO[^;]*authenticated/);
    expect(SQL_CODE).toMatch(/FOR SELECT\s+TO authenticated\s+USING \(auth\.uid\(\) = user_id\)/);
    for (const fn of ['claim_publication_generation', 'release_publication_generation', 'complete_publication_generation']) {
      expect(SQL_CODE).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
      expect(SQL_CODE).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`));
    }
  });

  it('adds a conservative cap of 20 and keeps every other cap and the global 80', () => {
    const caps = Object.fromEntries([...SQL_CODE.matchAll(/WHEN '([a-z-]+)' THEN (\d+)/g)].map((m) => [m[1], Number(m[2])]));
    expect(caps).toEqual({
      'weekly-content': 22, 'business-improvement': 18, 'seo-generator': 18, 'business-advisor': 12,
      'voice-simulator': 10, 'review-reply': 15, 'publication-proposals': 20, global: 80,
    });
  });

  it('invalidates proposals when the image changes and caps generations', () => {
    expect(SQL_CODE).toMatch(/publications_invalidate_proposals/);
    expect(SQL_CODE).toMatch(/proposal_generations_used\s+BETWEEN 0 AND 4|proposal_generations_used\s*<=\s*4/);
    expect(SQL_CODE).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
  });
});

describe('A3.7.2 client repository', () => {
  it('maps a proposals_ready row', () => {
    const pub = toPublication(READY_ROW);
    expect(pub?.status).toBe('proposals_ready');
    if (pub?.status !== 'proposals_ready') return;
    expect(pub.proposals).toEqual({ generationId: GEN, lang: 'es', generatedAt: READY_ROW.proposals_generated_at, generationsUsed: 1 });
    expect(toPublication({ ...READY_ROW, proposal_generation_id: null })).toBeNull();
    expect(toPublication({ ...READY_ROW, proposal_generations_used: undefined })).toBeNull();
  });

  it('rejects malformed proposal rows', () => {
    expect(toProposal(ROWS[0])?.role).toBe('direct');
    expect(toProposal({ ...ROWS[0], role: 'close' })).toBeNull();
    expect(toProposal({ ...ROWS[0], position: 4 })).toBeNull();
    expect(toProposal({ ...ROWS[0], lang: 'fr' })).toBeNull();
  });

  it('never returns a mixed or partial set', async () => {
    expect(await getProposals(ID, fakeDb(READY_ROW, ROWS).db)).toHaveLength(3);
    expect(await getProposals(ID, fakeDb(READY_ROW, []).db)).toEqual([]);
    await expect(getProposals(ID, fakeDb(READY_ROW, ROWS.slice(0, 2)).db)).rejects.toThrow(PublicationError);
    await expect(getProposals(ID, fakeDb(READY_ROW, [ROWS[0], ROWS[1], proposalRow(3, 'professional', 'other')]).db)).rejects.toThrow(PublicationError);
  });

  it('generates through the edge function with a request id and reloads the stored set', async () => {
    const { db, invoke } = fakeDb(READY_ROW, ROWS);
    const out = await generateProposals(ID, 'es', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', db);
    expect(invoke).toHaveBeenCalledWith('publication-proposals', {
      method: 'POST', body: { publication_id: ID, request_id: 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', lang: 'es' },
    });
    expect(out.proposals.map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it('maps stable server codes and hides everything else', async () => {
    const err = (code: string) => ({ data: null, error: { context: new Response(JSON.stringify({ ok: false, code })) } });
    const cases: [string, string][] = [
      ['REGENERATION_LIMIT_REACHED', 'regeneration_limit'], ['IMAGE_NOT_UNDERSTANDABLE', 'image_not_understandable'],
      ['AI_LIMIT_REACHED', 'ai_limit'], ['GENERATION_UNSAFE', 'generation_failed'], ['GENERATION_IN_PROGRESS', 'generation_in_progress'],
      ['PROVIDER_TIMEOUT', 'unavailable'], ['__proto__', 'unavailable'],
    ];
    for (const [code, expected] of cases) {
      const { db } = fakeDb(READY_ROW, ROWS, err(code));
      await expect(generateProposals(ID, 'es', undefined, db)).rejects.toMatchObject({ code: expected });
    }
  });
});
