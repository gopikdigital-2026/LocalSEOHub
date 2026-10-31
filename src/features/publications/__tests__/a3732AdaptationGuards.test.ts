import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { adaptPublication, getChannelDraft, toAdaptationResult, toChannelDraft } from '../../channel-adaptation/repository';
import { ADAPTATION_ERROR_TEXT, INTERNAL_NOTICE, SELECTION_ERROR_TEXT } from '../../channel-adaptation/copy';
import { AdaptationError, ADAPTATIONS_PER_PUBLICATION } from '../../channel-adaptation/types';

const ROOT = join(__dirname, '../../../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const MIGRATION = src('supabase/migrations/20261027165527_a3732_publication_adaptation_engine.sql');
const PANEL = src('src/features/channel-adaptation/ChannelAdaptationPanel.tsx');
const CLIENT = ['repository.ts', 'types.ts', 'copy.ts', 'ChannelAdaptationPanel.tsx'].map((f) => src(`src/features/channel-adaptation/${f}`)).join('\n');
const APP = src('src/App.tsx');

const PUB = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const REQ = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
const GEN = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';

const OK_BODY = {
  ok: true,
  draft: { publicationId: PUB, version: 4, adaptedAt: '2026-10-27T10:00:00Z', adaptationsUsed: 1, adaptationsLimit: 3, lang: 'es', role: 'close' },
  facebook: { text: 'Texto para Facebook.' },
  instagram: { text: 'Texto para Instagram.' },
};

function invokeDb(result: { data: unknown; error: unknown }) {
  const invoke = vi.fn(async (_name: string, _opts: { body: unknown }) => result);
  return { db: { from: vi.fn(), functions: { invoke } } as never, invoke };
}

const serverError = (status: number, body: unknown) => ({ data: null, error: { context: new Response(JSON.stringify(body), { status }) } });

describe('A3.7.3.2 migration security', () => {
  it('registers the publication-adaptation ledger function with a monthly cap of 20 and keeps global at 80', () => {
    expect(MIGRATION).toMatch(/WHEN 'publication-adaptation' THEN 20/);
    expect(MIGRATION).toMatch(/WHEN 'publication-proposals' THEN 20/);
    expect(MIGRATION).toMatch(/'global' THEN 80|ELSE 80|global.*80/);
    expect(MIGRATION).toMatch(/publication_adaptations_used >= 0/);
    expect(MIGRATION).toMatch(/'publication-proposals', 'publication-adaptation'/);
  });

  it('every new function is SECURITY DEFINER with a fixed search_path and executable only by service_role', () => {
    for (const fn of ['claim_publication_adaptation', 'release_publication_adaptation', 'complete_publication_adaptation']) {
      const body = MIGRATION.slice(MIGRATION.indexOf(`FUNCTION public.${fn}(`));
      expect(body.slice(0, 400), fn).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
      expect(MIGRATION).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(MIGRATION).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
    }
    expect(MIGRATION).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|authenticated|PUBLIC)/i);
  });

  it('never grants write access on publication_drafts and never drops or renames anything', () => {
    expect(MIGRATION).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*ON (TABLE )?public\.publication_drafts/i);
    expect(MIGRATION).not.toMatch(/DROP (TABLE|COLUMN)|RENAME|ALTER COLUMN[^;]*TYPE|DISABLE ROW LEVEL SECURITY/i);
    expect(MIGRATION).not.toMatch(/\bBEGIN;|\bCOMMIT;|\bROLLBACK;/);
  });

  it('enforces the per-publication cap of 3 at claim and at completion, and writes both channels in one UPDATE', () => {
    expect(MIGRATION.match(/adaptations_used >= 3/g)).toHaveLength(2);
    const complete = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.complete_publication_adaptation('));
    const update = complete.slice(complete.indexOf('UPDATE public.publication_drafts SET'), complete.indexOf('RETURN jsonb_build_object', complete.indexOf('UPDATE public.publication_drafts SET')));
    for (const col of ['facebook_generated', 'facebook_text', 'instagram_generated', 'instagram_text', 'adapted_at', 'adaptations_used', 'version', 'adaptation_claim_id']) {
      expect(update, col).toContain(col);
    }
    expect(ADAPTATIONS_PER_PUBLICATION).toBe(3);
  });
});

describe('A3.7.3.2 copied validators are byte-identical to the frozen A3.7.2 originals', () => {
  for (const f of ['context.ts', 'safety.ts', 'quality.ts', 'relational.ts', 'entitlement.ts']) {
    it(f, () => {
      expect(sha(`supabase/functions/publication-adaptations/${f}`)).toBe(sha(`supabase/functions/publication-proposals/${f}`));
    });
  }

  it('the shared entitlement gate is identical across every AI function', () => {
    const gate = sha('supabase/functions/publication-proposals/entitlement.ts');
    expect(gate).toBe('f948d629f5408537ff9b1c776a5a3ede9d292839923937a69bd5ddf52ea30fd5');
  });

  it('A3.7.3.1 frozen files still match their manifest', () => {
    const manifest = src('auditoria-a2/A3_7_3_1_FREEZE_MANIFEST.md');
    const entries = [...manifest.matchAll(/^\| ((?:supabase|src)\/[^ ]+) \| ([0-9a-f]{64})/gm)];
    expect(entries).toHaveLength(4);
    // A3.7.4.3 GATE A CORRECTION 03: a3731 carries the single authorized A3.7.2 exception for a3721a; nothing else may differ.
    const AUTHORIZED_EXCEPTIONS: Record<string, { was: string; now: string }> = {
      'src/features/publications/__tests__/a3731SelectionFoundation.test.ts': {
        was: '38e88e4f65bbf3f0132bcc8cdef7dabb5a0a94f3fa92e16712789cc605940095',
        now: '4030cdc839d1be813b40ffbd6f7f2e1f88a18fce1c51c3fa487b60861fbe7a8c',
      },
    };
    const excepted: string[] = [];
    for (const [, path, hash] of entries) {
      const exception = AUTHORIZED_EXCEPTIONS[path];
      if (exception) {
        expect(hash, `${path} manifest still proves previous hash`).toBe(exception.was);
        expect(sha(path), path).toBe(exception.now);
        excepted.push(path);
      } else {
        expect(sha(path), path).toBe(hash);
      }
    }
    expect(excepted).toEqual(Object.keys(AUTHORIZED_EXCEPTIONS));
  });
});

describe('A3.7.3.2 client: minimal request contract', () => {
  it('sends exactly publication_id, expected_version and request_id to publication-adaptations', async () => {
    const { db, invoke } = invokeDb({ data: OK_BODY, error: null });
    const out = await adaptPublication(PUB, 3, REQ, db);
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe('publication-adaptations');
    expect(opts.body).toEqual({ publication_id: PUB, expected_version: 3, request_id: REQ });
    expect(Object.keys(opts.body as object).sort()).toEqual(['expected_version', 'publication_id', 'request_id']);
    expect(out).toMatchObject({ version: 4, adaptationsUsed: 1, adaptationsLimit: 3, facebook: 'Texto para Facebook.', instagram: 'Texto para Instagram.' });
  });

  it('generates a fresh request id per call by default', async () => {
    const { db, invoke } = invokeDb({ data: OK_BODY, error: null });
    await adaptPublication(PUB, 3, undefined, db);
    await adaptPublication(PUB, 3, undefined, db);
    const ids = invoke.mock.calls.map(([, o]) => (o.body as { request_id: string }).request_id);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('the client never sends source text, business, user or channel text', () => {
    const repo = src('src/features/channel-adaptation/repository.ts');
    const call = repo.slice(repo.indexOf('functions.invoke('), repo.indexOf('functions.invoke(') + 200);
    expect(call).not.toMatch(/source|business|user|facebook|instagram|text|body: \{[^}]*,[^}]*,[^}]*,/);
  });

  it('rejects invalid identifiers and versions before calling the server', async () => {
    const { db, invoke } = invokeDb({ data: OK_BODY, error: null });
    await expect(adaptPublication('nope', 1, REQ, db)).rejects.toMatchObject({ code: 'not_found' });
    await expect(adaptPublication(PUB, 0, REQ, db)).rejects.toMatchObject({ code: 'stale_selection' });
    await expect(adaptPublication(PUB, 1.5, REQ, db)).rejects.toMatchObject({ code: 'stale_selection' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('maps every server error code and the limit scope', async () => {
    const codes = ['unauthenticated', 'not_found', 'publication_not_ready', 'no_selected_proposal', 'stale_selection', 'busy',
      'limit_reached', 'ai_unavailable', 'invalid_ai_output', 'unsafe_output', 'conflict', 'unavailable', 'unknown'] as const;
    for (const code of codes) {
      const { db } = invokeDb(serverError(409, { ok: false, code }));
      await expect(adaptPublication(PUB, 2, REQ, db)).rejects.toMatchObject({ code });
    }
    for (const scope of ['publication', 'monthly', 'global'] as const) {
      const { db } = invokeDb(serverError(429, { ok: false, code: 'limit_reached', scope }));
      await expect(adaptPublication(PUB, 2, REQ, db)).rejects.toMatchObject({ code: 'limit_reached', scope });
    }
  });

  it('maps gate responses and unknown bodies safely', async () => {
    const cases: [ReturnType<typeof serverError>, string][] = [
      [serverError(403, { error: 'premium_required' }), 'premium_required'],
      [serverError(429, { error: 'rate_limited' }), 'rate_limited'],
      [serverError(401, { error: 'unauthorized' }), 'unauthenticated'],
      [serverError(500, { error: 'constructor' }), 'unavailable'],
      [serverError(500, { code: '__proto__' }), 'unavailable'],
    ];
    for (const [res, code] of cases) {
      const { db } = invokeDb(res);
      await expect(adaptPublication(PUB, 2, REQ, db)).rejects.toMatchObject({ code });
    }
    const { db } = invokeDb({ data: null, error: new Error('network') });
    await expect(adaptPublication(PUB, 2, REQ, db)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('rejects malformed success bodies instead of rendering them', () => {
    expect(() => toAdaptationResult({ ...OK_BODY, ok: false })).toThrow(AdaptationError);
    expect(() => toAdaptationResult({ ...OK_BODY, facebook: { text: '' } })).toThrow(AdaptationError);
    expect(() => toAdaptationResult({ ...OK_BODY, instagram: 'plain' })).toThrow(AdaptationError);
    expect(() => toAdaptationResult({ ...OK_BODY, draft: { ...OK_BODY.draft, version: 0 } })).toThrow(AdaptationError);
    expect(() => toAdaptationResult({ ...OK_BODY, draft: { ...OK_BODY.draft, role: 'hacker' } })).toThrow(AdaptationError);
  });
});

describe('A3.7.3.2 client: draft reader', () => {
  const ROW = {
    publication_id: PUB, version: 2, source_generation_id: GEN, source_position: 2, source_role: 'close', source_lang: 'es',
    source_body: 'Cuerpo', source_cta: 'Ven', facebook_text: null, instagram_text: null, adapted_at: null, adaptations_used: 0,
  };

  it('parses a stored draft and rejects inconsistent rows', () => {
    expect(toChannelDraft(ROW)).toMatchObject({ version: 2, sourcePosition: 2, facebookText: null, adaptationsUsed: 0 });
    expect(toChannelDraft({ ...ROW, source_position: 4 })).toBeNull();
    expect(toChannelDraft({ ...ROW, adaptations_used: -1 })).toBeNull();
    expect(toChannelDraft({ ...ROW, facebook_text: '' })).toBeNull();
  });

  it('reads publication_drafts with an explicit column list and owner RLS only', async () => {
    const q: Record<string, unknown> = {};
    const select = vi.fn(() => q);
    q.eq = () => q;
    q.maybeSingle = () => Promise.resolve({ data: ROW, error: null });
    const from = vi.fn(() => ({ select }));
    const draft = await getChannelDraft(PUB, { from, functions: {} } as never);
    expect(from).toHaveBeenCalledWith('publication_drafts');
    expect(String((select.mock.calls[0] as unknown[])[0])).not.toContain('*');
    expect(String((select.mock.calls[0] as unknown[])[0])).not.toMatch(/claim/);
    expect(draft?.sourceBody).toBe('Cuerpo');
  });
});

describe('A3.7.3.2 internal harness', () => {
  it('shows the internal notice and the adapt button text', () => {
    expect(INTERNAL_NOTICE).toBe('Validación interna — no es una función para clientes.');
    expect(PANEL).toContain('{INTERNAL_NOTICE}');
    expect(src('src/features/channel-adaptation/copy.ts')).toContain("'Adaptar para Facebook e Instagram'");
  });

  it('is mounted only on the hidden internal route, inside the auth guard, with no new route', () => {
    const block = APP.slice(APP.indexOf('path="/internal/publications-validation"'), APP.indexOf('</AppGuard>', APP.indexOf('path="/internal/publications-validation"')));
    expect(block).toContain('<PublicationsValidationPage />');
    expect(block).toContain('<ChannelAdaptationPanel />');
    expect(APP.match(/ChannelAdaptationPanel/g)).toHaveLength(3);
    expect(APP.match(/<Route [^>]*path=/g)).toHaveLength(34);
  });

  it('is not reachable from customer navigation, Tools or landing', () => {
    for (const f of ['src/app-v2/layouts/AppShellV2.tsx', 'src/features/tools/catalog.ts', 'src/features/tools/ToolsPage.tsx', 'src/components/LandingPage.tsx']) {
      expect(src(f)).not.toMatch(/channel-adaptation|ChannelAdaptation|adaptPublication/);
    }
    const walk = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === '__tests__' ? [] : walk(`${dir}/${e.name}`)) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const refs = walk('src').filter((f) => !f.startsWith('src/features/channel-adaptation/') && /channel-adaptation/.test(src(f)));
    expect(refs).toEqual(['src/App.tsx']);
  });

  it('goes through repositories only and never holds keys, providers or Meta/Google calls', () => {
    expect(PANEL).not.toMatch(/functions\.invoke|\.from\(|\.rpc\(|supabase/);
    expect(CLIENT).not.toMatch(/openai|anthropic|LocalSEO_KEY|service_role|SERVICE_ROLE|graph\.facebook|googleapis|mybusiness|pages_manage_posts|instagram_content_publish|access_token/i);
    expect(CLIENT).not.toMatch(/localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML|\bany\b/);
  });

  it('uses the current business only and has no free-text input', () => {
    expect(PANEL).toMatch(/useBusiness\(\)/);
    expect(PANEL).not.toMatch(/useParams|useSearchParams|<textarea|<input/);
  });

  it('disables actions while busy and at the per-publication limit', () => {
    expect(PANEL).toMatch(/disabled=\{!!busy \|\| limitReached\}/);
    expect(PANEL).toMatch(/if \(!pub \|\| !draft \|\| busy\) return/);
    expect(PANEL).toContain('ADAPTATIONS_PER_PUBLICATION');
  });

  it('renders only mapped error messages in ES and EN', () => {
    expect(PANEL).not.toMatch(/\.message\b|JSON\.stringify/);
    for (const table of [ADAPTATION_ERROR_TEXT, SELECTION_ERROR_TEXT]) {
      for (const [code, text] of Object.entries(table)) {
        expect(text.es.length, code).toBeGreaterThan(5);
        expect(text.en.length, code).toBeGreaterThan(5);
      }
    }
  });

  it('frozen A3.7.2 harness files are untouched', () => {
    expect(sha('src/features/publications/validation/PublicationsValidationPage.tsx')).toBe('1eb1a91eda49dcaaba496acb7072131c153bd022de0e87a637100584c61bbad0'); // A3.7.3.4 RESUME RE-PIN: page reads the single URL-backed publication identity
    expect(sha('src/features/publications/validation/copy.ts')).toBe('faa38cd547814aa9054d73052daf0d2f61062291fa766e88bbbdada209070110');
  });
});
