import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  getPublicationDraft,
  mapSelectionResponse,
  selectPublicationProposal,
  toDraft,
} from '../drafts/repository';
import { DraftError } from '../drafts/types';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');
const MIGRATIONS = 'supabase/migrations';
const migrationFile = readdirSync(resolve(root, MIGRATIONS)).find((f) => f.includes('a3731_publication_drafts'));
const sql = migrationFile ? src(`${MIGRATIONS}/${migrationFile}`) : '';
const fnBody = sql.slice(sql.indexOf('FUNCTION public.select_publication_proposal'));
const code = sql.replace(/\/\*[\s\S]*?\*\//g, '');

const PUB = '11111111-1111-4111-8111-111111111111';
const GEN = '22222222-2222-4222-8222-222222222222';
const BIZ = '33333333-3333-4333-8333-333333333333';

type DbArg = Parameters<typeof selectPublicationProposal>[3];

function fakeDb(opts: { rpc?: unknown; rpcError?: { code: string } | null; rpcThrows?: boolean; row?: unknown; rowError?: { code: string } | null }) {
  const rpc = vi.fn(() =>
    opts.rpcThrows
      ? Promise.reject(new Error('network'))
      : Promise.resolve({ data: opts.rpc ?? null, error: opts.rpcError ?? null }));
  const eq = vi.fn(() => ({ maybeSingle: () => Promise.resolve({ data: opts.row ?? null, error: opts.rowError ?? null }) }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { rpc, from } as unknown as DbArg, rpc, from, select, eq };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    return e instanceof DraftError ? e.code : 'other';
  }
}

const validRow = {
  publication_id: PUB, business_id: BIZ, source_generation_id: GEN, source_position: 2, source_role: 'close',
  source_lang: 'es', source_body: 'Cuerpo', source_cta: 'CTA', selected_at: '2026-10-27T00:00:00Z', version: 3,
};

describe('A3.7.3.1 migration: publication_drafts table', () => {
  it('is a new migration after a372, not an edit of a371/a372', () => {
    expect(migrationFile).toBeDefined();
    expect(migrationFile! > '20261025161526').toBe(true);
    expect(src(`${MIGRATIONS}/20261025152315_a371_publications_data_storage_foundation.sql`)).not.toContain('publication_drafts');
    expect(src(`${MIGRATIONS}/20261025161526_a372_publication_proposals_engine.sql`)).not.toContain('publication_drafts');
  });

  it('is 1:1 with publications and cascades on delete', () => {
    expect(code).toMatch(/publication_id uuid PRIMARY KEY REFERENCES public\.publications\(id\) ON DELETE CASCADE/);
    expect(code).toMatch(/user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    expect(code).toMatch(/business_id uuid NOT NULL REFERENCES public\.businesses\(id\) ON DELETE CASCADE/);
  });

  it('has snapshot, reserved channel, version and claim columns with constraints', () => {
    for (const col of ['source_generation_id', 'source_position', 'source_role', 'source_lang', 'source_body', 'source_cta',
      'selected_at', 'facebook_generated', 'facebook_text', 'instagram_generated', 'instagram_text', 'adapted_at',
      'version', 'adaptation_claim_id', 'adaptation_claimed_at', 'adaptations_used']) {
      expect(code).toContain(`  ${col} `);
    }
    expect(code).toMatch(/char_length\(source_body\) BETWEEN 1 AND 1000/);
    expect(code).toMatch(/char_length\(source_cta\) BETWEEN 1 AND 120/);
    expect(code).toMatch(/source_position = 1 AND source_role = 'direct'/);
    expect(code).toMatch(/\(adaptation_claim_id IS NULL\) = \(adaptation_claimed_at IS NULL\)/);
  });

  it('enables RLS with owner SELECT only and no browser write path', () => {
    expect(code).toContain('ALTER TABLE public.publication_drafts ENABLE ROW LEVEL SECURITY');
    expect(code).toContain('REVOKE ALL ON public.publication_drafts FROM PUBLIC, anon, authenticated');
    expect(code).toContain('GRANT SELECT ON public.publication_drafts TO authenticated');
    expect(code).toMatch(/FOR SELECT\s+TO authenticated USING \(auth\.uid\(\) = user_id\)/);
    expect(code).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*publication_drafts/);
    expect(code).not.toMatch(/ON public\.publication_drafts FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(code).not.toMatch(/TO anon/);
  });
});

describe('A3.7.3.1 migration: invalidation trigger', () => {
  it('deletes the draft when the generation or the photo changes', () => {
    expect(code).toMatch(/AFTER UPDATE ON public\.publications/);
    expect(code).toMatch(/OLD\.proposal_generation_id IS DISTINCT FROM NEW\.proposal_generation_id/);
    expect(code).toMatch(/OLD\.image_path IS DISTINCT FROM NEW\.image_path/);
    expect(code).toMatch(/DELETE FROM public\.publication_drafts WHERE publication_id = NEW\.id/);
  });

  it('runs as definer with fixed search_path and is not callable as an RPC', () => {
    const trig = code.slice(code.indexOf('FUNCTION public.publication_drafts_invalidate'), code.indexOf('CREATE TRIGGER'));
    expect(trig).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    expect(code).toContain('REVOKE ALL ON FUNCTION public.publication_drafts_invalidate() FROM PUBLIC, anon, authenticated');
  });

  it('does not touch frozen publications triggers, constraints or grants', () => {
    expect(code).not.toMatch(/publications_invalidate_proposals|publications_guard/);
    expect(code).not.toMatch(/ALTER TABLE public\.publications\b/);
    expect(code).not.toMatch(/GRANT[^;]*ON public\.publications\b/);
    expect(code).not.toMatch(/\bDROP (TABLE|COLUMN|FUNCTION)\b/);
  });
});

describe('A3.7.3.1 migration: select_publication_proposal', () => {
  it('is SECURITY DEFINER, uses auth.uid() and is granted to authenticated only', () => {
    expect(fnBody).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    expect(fnBody).toContain('v_uid uuid := auth.uid()');
    expect(code).toContain('REVOKE ALL ON FUNCTION public.select_publication_proposal(uuid, integer, uuid) FROM PUBLIC, anon, authenticated');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.select_publication_proposal(uuid, integer, uuid) TO authenticated');
  });

  it('accepts no owner, tenant or text input from the caller', () => {
    const sig = fnBody.slice(0, fnBody.indexOf(')'));
    expect(sig).toBe('FUNCTION public.select_publication_proposal(\n  p_publication_id uuid, p_position integer, p_expected_generation_id uuid\n');
    expect(fnBody).not.toMatch(/p_user_id|p_business_id|p_body|p_cta/);
  });

  it('locks the owned publication and validates readiness, generation and position', () => {
    expect(fnBody).toMatch(/WHERE id = p_publication_id AND user_id = v_uid\s+FOR UPDATE/);
    expect(fnBody).toContain("v_pub.status <> 'proposals_ready'");
    expect(fnBody).toContain('v_pub.proposal_generation_id <> p_expected_generation_id');
    expect(fnBody).toContain('p_position NOT IN (1, 2, 3)');
    expect(fnBody).toMatch(/position = p_position\s+AND generation_id = v_pub\.proposal_generation_id/);
  });

  it('copies the snapshot from the proposal row server-side', () => {
    expect(fnBody).toContain('v_prop.generation_id, v_prop.position, v_prop.role, v_prop.lang, v_prop.body, v_prop.cta');
    expect(fnBody).toContain('v_pub.id, v_pub.user_id, v_pub.business_id');
  });

  it('is idempotent for the same selection without a version bump', () => {
    const same = fnBody.slice(fnBody.indexOf('v_draft.source_generation_id = v_prop.generation_id'));
    expect(same.slice(0, 250)).toContain("'unchanged', 'version', v_draft.version");
  });

  it('blocks a change while a claim is younger than 3 minutes', () => {
    expect(fnBody).toMatch(/adaptation_claimed_at > now\(\) - interval '3 minutes'[\s\S]{0,80}'busy'/);
    expect(fnBody.indexOf("'unchanged'")).toBeLessThan(fnBody.indexOf("'busy'"));
  });

  it('a changed selection bumps version once and clears channel and adaptation fields', () => {
    const upd = fnBody.slice(fnBody.indexOf('UPDATE public.publication_drafts SET'));
    expect(upd.match(/version = /g)).toHaveLength(1);
    expect(upd).toContain('version = v_draft.version + 1');
    for (const col of ['facebook_generated', 'facebook_text', 'instagram_generated', 'instagram_text', 'adapted_at',
      'adaptation_claim_id', 'adaptation_claimed_at']) {
      expect(upd).toContain(`${col} = NULL`);
    }
    expect(upd).toContain('selected_at = now()');
    expect(upd).not.toContain('adaptations_used');
  });

  it('never calls AI, ledger, storage or Meta', () => {
    expect(code).not.toMatch(/ai_usage|reserve_ai_usage|settle_ai_usage|openai|graph\.facebook|storage\.|net\.http/i);
  });
});

describe('A3.7.3.1 client: selectPublicationProposal', () => {
  it('sends only publication, position and expected generation', async () => {
    const f = fakeDb({ rpc: { result: 'selected', version: 1 } });
    await expect(selectPublicationProposal(PUB, 1, GEN, f.db)).resolves.toEqual({ outcome: 'selected', version: 1 });
    expect(f.rpc).toHaveBeenCalledWith('select_publication_proposal', {
      p_publication_id: PUB, p_position: 1, p_expected_generation_id: GEN,
    });
  });

  it('returns unchanged for an idempotent repeat', async () => {
    const f = fakeDb({ rpc: { result: 'unchanged', version: 4 } });
    await expect(selectPublicationProposal(PUB, 2, GEN, f.db)).resolves.toEqual({ outcome: 'unchanged', version: 4 });
  });

  it.each([
    ['unauthenticated', 'unauthenticated'],
    ['not_found', 'not_found'],
    ['not_ready', 'publication_not_ready'],
    ['stale_generation', 'stale_generation'],
    ['invalid_position', 'invalid_position'],
    ['proposal_not_found', 'proposal_not_found'],
    ['busy', 'busy'],
    ['something_new', 'unknown'],
  ])('maps server result %s to %s', async (result, expected) => {
    const f = fakeDb({ rpc: { result } });
    expect(await codeOf(selectPublicationProposal(PUB, 1, GEN, f.db))).toBe(expected);
  });

  it('rejects invalid input locally without calling the server', async () => {
    const f = fakeDb({ rpc: { result: 'selected', version: 1 } });
    expect(await codeOf(selectPublicationProposal(PUB, 0, GEN, f.db))).toBe('invalid_position');
    expect(await codeOf(selectPublicationProposal(PUB, 4, GEN, f.db))).toBe('invalid_position');
    expect(await codeOf(selectPublicationProposal(PUB, 1.5, GEN, f.db))).toBe('invalid_position');
    expect(await codeOf(selectPublicationProposal('x; drop', 1, GEN, f.db))).toBe('not_found');
    expect(await codeOf(selectPublicationProposal(PUB, 1, 'nope', f.db))).toBe('stale_generation');
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('maps transport failures', async () => {
    expect(await codeOf(selectPublicationProposal(PUB, 1, GEN, fakeDb({ rpcError: { code: '42501' } }).db))).toBe('unauthenticated');
    expect(await codeOf(selectPublicationProposal(PUB, 1, GEN, fakeDb({ rpcError: { code: 'XX000' } }).db))).toBe('unavailable');
    expect(await codeOf(selectPublicationProposal(PUB, 1, GEN, fakeDb({ rpcThrows: true }).db))).toBe('unavailable');
  });

  it('treats malformed success payloads as unknown', () => {
    for (const bad of [null, 'selected', [], { result: 'selected' }, { result: 'selected', version: 0 }, { result: 'unchanged', version: '2' }]) {
      expect(() => mapSelectionResponse(bad)).toThrow(DraftError);
    }
  });
});

describe('A3.7.3.1 client: getPublicationDraft', () => {
  it('reads by publication id and maps the snapshot', async () => {
    const f = fakeDb({ row: validRow });
    const draft = await getPublicationDraft(PUB, f.db);
    expect(f.from).toHaveBeenCalledWith('publication_drafts');
    expect(f.eq).toHaveBeenCalledWith('publication_id', PUB);
    expect(draft).toEqual({
      publicationId: PUB, businessId: BIZ, sourceGenerationId: GEN, sourcePosition: 2, sourceRole: 'close',
      sourceLang: 'es', sourceBody: 'Cuerpo', sourceCta: 'CTA', selectedAt: '2026-10-27T00:00:00Z', version: 3,
    });
  });

  it('does not request owner or channel columns', async () => {
    const f = fakeDb({ row: validRow });
    await getPublicationDraft(PUB, f.db);
    const cols = String((f.select.mock.calls[0] as unknown[])[0]);
    expect(cols).not.toMatch(/user_id|facebook|instagram|claim/);
  });

  it('returns null when there is no draft (missing or foreign)', async () => {
    await expect(getPublicationDraft(PUB, fakeDb({ row: null }).db)).resolves.toBeNull();
  });

  it('rejects malformed rows and maps errors', async () => {
    expect(await codeOf(getPublicationDraft(PUB, fakeDb({ row: { ...validRow, source_position: 7 } }).db))).toBe('unknown');
    expect(await codeOf(getPublicationDraft(PUB, fakeDb({ rowError: { code: 'PGRST301' } }).db))).toBe('unauthenticated');
    expect(await codeOf(getPublicationDraft(PUB, fakeDb({ rowError: { code: '500' } }).db))).toBe('unavailable');
    expect(await codeOf(getPublicationDraft('../etc', fakeDb({ row: validRow }).db))).toBe('not_found');
  });

  it('validates role/position pairing types strictly', () => {
    expect(toDraft({ ...validRow, source_lang: 'fr' })).toBeNull();
    expect(toDraft({ ...validRow, source_body: '' })).toBeNull();
    expect(toDraft({ ...validRow, version: 1.5 })).toBeNull();
  });
});

describe('A3.7.3.1 scope guards', () => {
  const drafts = src('src/features/publications/drafts/repository.ts') + src('src/features/publications/drafts/types.ts');

  it('drafts module has no any, AI, storage, Meta or service role', () => {
    expect(drafts).not.toMatch(/\bany\b/);
    expect(drafts).not.toMatch(/functions\.invoke|openai|\.storage|createSignedUrl|service_role|graph\.facebook|oauth/i);
  });

  it('adds no customer UI, route, catalog or sidebar entry', () => {
    for (const f of ['src/features/tools/catalog.ts', 'src/app-v2/layouts/AppShellV2.tsx', 'src/App.tsx']) {
      expect(src(f)).not.toMatch(/publication_drafts|drafts\/repository|selectPublicationProposal/);
    }
  });

  it('frozen A3.7.2 files still match the freeze manifest', () => {
    const manifest = src('auditoria-a2/A3_7_2_FREEZE_MANIFEST.md');
    const entries = [...manifest.matchAll(/^\| ((?:supabase|src)\/[^ ]+) \| ([0-9a-f]{64})/gm)];
    // A3.7.4.3 GATE A CORRECTION 03: the only authorized exception. The manifest must still prove the original hash.
    const AUTHORIZED_EXCEPTIONS: Record<string, { was: string; now: string }> = {
      'src/features/publications/__tests__/a3721aValidationHarness.test.ts': {
        was: 'c20a942e4e8cad4a2c8514e2e258050bc0bd64ee2deb2c966ffcd7854ee306cc',
        now: '6c32bfcdde9cb03a79eb2e6d109eb4a2c98166094a40b51803fcf2e4891126fd',
      },
    };
    expect(entries.length).toBe(28);
    const excepted: string[] = [];
    for (const [, path, hash] of entries) {
      const actual = createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
      const exception = AUTHORIZED_EXCEPTIONS[path];
      if (exception) {
        expect(hash, `${path} manifest still proves previous hash`).toBe(exception.was);
        expect(actual, path).toBe(exception.now);
        excepted.push(path);
      } else {
        expect(actual, path).toBe(hash);
      }
    }
    expect(excepted).toEqual(Object.keys(AUTHORIZED_EXCEPTIONS));
  });
});
