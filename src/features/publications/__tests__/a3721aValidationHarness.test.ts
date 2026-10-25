import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { generateProposals } from '../repository';
import type { PublicationErrorCode } from '../types';
import { ERROR_TEXT, ROLE_LABEL, UI, VALIDATION_ROUTE } from '../validation/copy';

const ROOT = join(__dirname, '../../../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = src('src/features/publications/validation/PublicationsValidationPage.tsx');
const COPY = src('src/features/publications/validation/copy.ts');
const APP = src('src/App.tsx');
const HARNESS = PAGE + COPY;

const ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const GEN = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const IMG = { image_path: `u/b/${ID}/x.jpg`, image_mime: 'image/jpeg', image_bytes: 1000, image_width: 800, image_height: 600, image_uploaded_at: 't' };
const READY = {
  id: ID, business_id: 'biz', status: 'proposals_ready', ...IMG, proposal_generation_id: GEN, proposals_lang: 'es',
  proposals_generated_at: 't', proposal_generations_used: 1, created_at: 't', updated_at: 't',
};
const ROWS = ['direct', 'close', 'professional'].map((role, i) => ({
  id: `p${i}`, generation_id: GEN, position: i + 1, role, lang: 'es', body: `  Cuerpo ${i} con espacios  `, cta: `CTA ${i}`,
}));

function fakeDb(invokeResult: { data: unknown; error: unknown }) {
  const chain = (rows: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows, error: null });
    q.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
    return q;
  };
  const invoke = vi.fn(async () => invokeResult);
  const db = {
    from: (t: string) => chain(t === 'publications' ? READY : ROWS),
    functions: { invoke },
  };
  return { db: db as never, invoke };
}

const gateError = (status: number, body: unknown) => ({
  data: null, error: { context: new Response(JSON.stringify(body), { status }) },
});

describe('A3.7.2.1A harness route and discoverability', () => {
  it('route exists, is guarded by the normal app auth guard and lives outside the app shell', () => {
    expect(VALIDATION_ROUTE).toBe('/internal/publications-validation');
    const block = APP.slice(APP.indexOf('path="/internal/publications-validation"'));
    expect(block.slice(0, 300)).toMatch(/<AppGuard>[\s\S]*<PublicationsValidationPage \/>[\s\S]*<\/AppGuard>/);
    const shell = APP.slice(APP.indexOf('<AppShellV2 />'), APP.indexOf('</Route>', APP.indexOf('<AppShellV2 />')));
    expect(shell).not.toMatch(/internal|PublicationsValidation/);
  });

  it('is not linked from sidebar, mobile nav, Herramientas, landing or any other source file', () => {
    const walk = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === '__tests__' ? [] : walk(`${dir}/${e.name}`)) : /\.(tsx?|html)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const refs = walk('src').filter((f) => /internal\/publications-validation|PublicationsValidationPage/.test(src(f)));
    expect(refs.sort()).toEqual([
      'src/App.tsx',
      'src/features/publications/validation/PublicationsValidationPage.tsx',
      'src/features/publications/validation/copy.ts',
    ]);
    for (const f of ['src/app-v2/layouts/AppShellV2.tsx', 'src/features/tools/catalog.ts', 'src/features/tools/ToolsPage.tsx', 'src/components/LandingPage.tsx']) {
      expect(src(f)).not.toMatch(/publicaci|publication/i);
    }
  });

  it('marks the page noindex, nofollow', () => {
    expect(PAGE).toMatch(/meta\.name = 'robots'/);
    expect(PAGE).toMatch(/noindex, nofollow/);
  });

  it('no final customer Publications route or card is introduced', () => {
    expect(APP).not.toMatch(/path="\/(publicaciones|publications|herramientas\/publica)/i);
    expect(APP.replace(/.*PublicationsValidationPage.*|.*publications-validation.*/g, '')).not.toMatch(/publicaciones|publications/i);
  });
});

describe('A3.7.2.1A harness behaviour (static)', () => {
  it('uses only the current user business; no arbitrary business id input', () => {
    expect(PAGE).toMatch(/useBusiness\(\)/);
    expect(PAGE).toMatch(/createDraft\(businessId\)/);
    expect(PAGE).not.toMatch(/business_id|useParams|useSearchParams|searchParams/);
    expect(PAGE).toMatch(/if \(!currentBusiness\) return/);
  });

  it('shows the real JPEG/PNG 8 MB constraint and does not claim HEIC', () => {
    expect(UI.constraints.es).toBe('JPEG o PNG, máximo 8 MB.');
    expect(PAGE).toMatch(/accept="image\/jpeg,image\/png"/);
    expect(HARNESS).not.toMatch(/heic/i);
  });

  it('shows the factual privacy note in both languages', () => {
    expect(UI.privacy.es).toBe('La imagen se procesa de forma privada para generar las propuestas. No se publica en Facebook, Instagram ni Google.');
    expect(UI.privacy.en).toMatch(/not published on Facebook, Instagram or Google/);
  });

  it('goes through the real repository methods only', () => {
    expect(PAGE).toMatch(/from '\.\.\/repository'/);
    for (const fn of ['createDraft', 'attachImage', 'generateProposals', 'deleteDraft']) expect(PAGE).toContain(`${fn}(`);
    expect(HARNESS).not.toMatch(/functions\.invoke|\.from\(|\.rpc\(|\.storage\b|supabase/);
  });

  it('never calls AI providers, Meta or Google, and never holds privileged keys', () => {
    expect(HARNESS).not.toMatch(/openai|api\.openai|anthropic|gemini|fetch\(/i);
    expect(HARNESS).not.toMatch(/graph\.facebook|pages_manage_posts|instagram_content_publish|meta-|googleapis|mybusiness/i);
    expect(HARNESS).not.toMatch(/SERVICE_ROLE|service_role|LocalSEO_KEY|access_token|Authorization|signedUrl|createSignedUrl/i);
  });

  it('does not persist validation state in browser storage', () => {
    expect(PAGE).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('disables actions while busy and respects the 4-generation limit', () => {
    expect(PAGE).toMatch(/disabled=\{!!busy \|\| limitReached\}/);
    expect(PAGE).toMatch(/disabled=\{!file \|\| !!busy\}/);
    expect(PAGE).toMatch(/if \(!pub \|\| busy\) return/);
    expect(PAGE).toMatch(/PUBLICATION_GENERATIONS_LIMIT/);
    expect(PAGE).not.toMatch(/setInterval|setTimeout/);
  });

  it('renders proposal text without rewriting it', () => {
    expect(PAGE).toMatch(/text=\{p\.body\}/);
    expect(PAGE).toMatch(/text=\{p\.cta\}/);
    expect(PAGE).not.toMatch(/\.body\.(trim|replace|slice|substring)|\.cta\.(trim|replace|slice|substring)/);
    expect(Object.keys(ROLE_LABEL)).toEqual(['direct', 'close', 'professional']);
  });

  it('does not ask the user for a prompt, tone or description', () => {
    expect(PAGE).not.toMatch(/<textarea|type="text"/);
    expect(HARNESS).not.toMatch(/Describe the photo|Describe la foto|Choose your tone|tono/i);
  });

  it('delete uses the repository delete path', () => {
    expect(PAGE).toMatch(/await deleteDraft\(pub\.id\)/);
  });
});

describe('A3.7.2.1A error mapping', () => {
  it('maps every stable code to a safe ES and EN message', () => {
    for (const [code, text] of Object.entries(ERROR_TEXT)) {
      expect(text.es.length, code).toBeGreaterThan(5);
      expect(text.en.length, code).toBeGreaterThan(5);
    }
    expect(ERROR_TEXT.image_not_understandable.es).toBe('No hemos podido entender esta imagen con suficiente seguridad. Prueba con otra fotografía.');
    expect(ERROR_TEXT.ai_limit.es).toBe('Has alcanzado el límite de generaciones disponible.');
    expect(ERROR_TEXT.premium_required.es).toBe('Esta prueba requiere una cuenta Premium.');
    expect(ERROR_TEXT.provider_timeout.es).toBe('La generación ha tardado demasiado. Puedes volver a intentarlo.');
  });

  it('renders only the mapped message, never raw error bodies', () => {
    expect(PAGE).toMatch(/ERROR_TEXT\[error\]\[appLang\]/);
    expect(PAGE).not.toMatch(/\.message\b|JSON\.stringify/);
  });

  it('repository maps premium gate, rate limit and provider timeout responses', async () => {
    const cases: [ReturnType<typeof gateError>, PublicationErrorCode][] = [
      [gateError(403, { error: 'premium_required' }), 'premium_required'],
      [gateError(429, { error: 'rate_limited' }), 'rate_limited'],
      [gateError(401, { error: 'unauthorized' }), 'unauthenticated'],
      [gateError(504, { ok: false, code: 'PROVIDER_TIMEOUT' }), 'provider_timeout'],
      [gateError(422, { ok: false, code: 'IMAGE_NOT_UNDERSTANDABLE', message: 'raw' }), 'image_not_understandable'],
      [gateError(429, { ok: false, code: 'AI_LIMIT_REACHED' }), 'ai_limit'],
      [gateError(500, { error: 'constructor' }), 'unavailable'],
    ];
    for (const [res, expected] of cases) {
      const { db } = fakeDb(res);
      await expect(generateProposals(ID, 'es', undefined, db)).rejects.toMatchObject({ code: expected });
    }
  });

  it('returns the server grounding and the stored proposals verbatim', async () => {
    const { db } = fakeDb({ data: { ok: true, grounding: { observed: ['tarta', 7], uncertain: ['mesa'] } }, error: null });
    const out = await generateProposals(ID, 'es', undefined, db);
    expect(out.grounding).toEqual({ observed: ['tarta'], uncertain: ['mesa'] });
    expect(out.proposals.map((p) => p.body)).toEqual(ROWS.map((r) => r.body));
  });

  it('tolerates a missing grounding object', async () => {
    const { db } = fakeDb({ data: { ok: true }, error: null });
    expect((await generateProposals(ID, 'es', undefined, db)).grounding).toEqual({ observed: [], uncertain: [] });
  });
});
