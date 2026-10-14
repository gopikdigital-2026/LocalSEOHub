import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  generate, type AiOutcome, type Deps, type ModelResult, type ReserveResult,
} from '../../../../supabase/functions/seo-generator-v2/handler.ts';
import {
  FORMATS, LEDGER_FUNCTION, MAX_BODY_BYTES, MAX_TOPIC_CHARS, MODEL, PROVIDER_TIMEOUT_MS, buildMessages, parseInput,
  parseModelOutput, sanitizeFacts, violations,
} from '../../../../supabase/functions/seo-generator-v2/logic.ts';
import { TOOLS } from '../../tools/catalog';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const FN_DIR = join(ROOT, 'supabase/functions');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const migration = src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith('_a242_seo_generator_limits.sql'))}`);
const fnIndex = src('supabase/functions/seo-generator-v2/index.ts');
const fnHandler = src('supabase/functions/seo-generator-v2/handler.ts');
const app = src('src/App.tsx');
const page = src('src/features/seo-generator/SeoGeneratorPage.tsx');
const repo = src('src/features/seo-generator/repository.ts');

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const frontend = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));

const RETIRED = [
  'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content',
  'generate-business-audit', 'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description',
  'generate-geo-audit', 'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
  'simulate-campaign',
];

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const BIZ_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BIZ_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const HAIR = {
  name: 'Peluquería de prueba', category: 'Peluquería', city: 'Marbella', website: '', phone: '', schedule: '',
  target_audience: '', services: ['Coloración'], primary_goal: '',
};

const GOOD_POST = JSON.stringify({
  title: 'Coloración para otoño en Marbella',
  content: 'El otoño es un buen momento para renovar el color de tu pelo. En Peluquería de prueba, en Marbella, te ayudamos a elegir una coloración que encaje contigo y con la nueva temporada. Ven a contarnos qué buscas y lo vemos juntos.',
  cta: 'Pide tu cita y cuéntanos qué color te apetece.',
  keywords: ['coloración en Marbella', 'peluquería en Marbella', 'color de pelo otoño'],
  hashtags: ['#ignored'],
});

const caps: Record<string, number> = { 'weekly-content': 30, 'business-improvement': 30, 'seo-generator': 20, 'business-advisor': 0, 'voice-simulator': 0 };

// In-memory model of reserve_ai_usage/settle_ai_usage semantics (per-user row, idempotent ids, per-fn + global caps).
function ledger() {
  const used = new Map<string, Record<string, number>>();
  const res = new Map<string, { user: string; fn: string; status: string }>();
  const row = (u: string) => {
    if (!used.has(u)) used.set(u, { 'weekly-content': 0, 'business-improvement': 0, 'seo-generator': 0, 'business-advisor': 0, 'voice-simulator': 0 });
    return used.get(u)!;
  };
  const reserve = vi.fn(async (id: string, user: string, fn: string): Promise<ReserveResult> => {
    const cap = caps[fn];
    if (cap === undefined) return { status: 'invalid' };
    if (cap === 0) return { status: 'disabled' };
    const r = row(user);
    const g = Object.values(r).reduce((a, b) => a + b, 0);
    if (r[fn] >= cap) return { status: 'fn_limit', fn_used: r[fn], global_used: g };
    if (g >= 80) return { status: 'global_limit', fn_used: r[fn], global_used: g };
    if (res.has(id)) return { status: 'invalid' };
    res.set(id, { user, fn, status: 'reserved' });
    r[fn] += 1;
    return { status: 'reserved', fn_used: r[fn], global_used: g + 1 };
  });
  const settle = vi.fn(async (id: string, user: string, outcome: AiOutcome) => {
    const r = res.get(id);
    if (!r || r.user !== user || r.status !== 'reserved') return false;
    r.status = outcome;
    if (outcome === 'released') row(user)[r.fn] = Math.max(row(user)[r.fn] - 1, 0);
    return true;
  });
  return { used: row, reserve, settle, res };
}

function deps(over: Partial<Deps> = {}, l = ledger(), model: () => Promise<ModelResult> = async () => ({ ok: true, raw: GOOD_POST })) {
  const businesses: Record<string, { owner: string; row: Record<string, unknown> }> = {
    [BIZ_A]: { owner: USER_A, row: HAIR },
    [BIZ_B]: { owner: USER_B, row: { ...HAIR, name: 'Negocio B' } },
  };
  const d: Deps = {
    loadBusiness: vi.fn(async (u: string, b: string) => (businesses[b]?.owner === u ? businesses[b].row : null)),
    reserve: l.reserve,
    settle: l.settle,
    callModel: vi.fn(model),
    ...over,
  };
  return { d, l };
}

const body = (o: Record<string, unknown> = {}) => JSON.stringify({
  businessId: BIZ_A, requestId: crypto.randomUUID(), format: 'google_post', topic: 'Coloración para otoño', lang: 'es', ...o,
});

const call = async (d: Deps, b = body(), user = USER_A) => {
  const r = await generate(user, b, d);
  return { status: r.status, json: await r.json() };
};

describe('A2.4.2 SEO Generator', () => {
  it('1. /herramientas/seo is mounted inside the AppGuard shell', () => {
    const block = app.match(/<Route element=\{<AppGuard><AppShellV2 \/><\/AppGuard>\}>([\s\S]*?)<\/Route>\n/)![1];
    expect(block).toContain('<Route path="/herramientas/seo" element={<SeoGeneratorPage />} />');
    expect(app.match(/path="\/herramientas\/seo"/g)).toHaveLength(1);
  });

  it('2. the SEO card is available and opens the tool', () => {
    const seo = TOOLS.find((t) => t.id === 'seo')!;
    expect(seo).toMatchObject({ enabled: true, path: '/herramientas/seo' });
    const hub = src('src/features/tools/ToolsPage.tsx');
    expect(hub).toContain("availableStatus: 'Disponible'");
    expect(hub).toContain("openCta: 'Abrir herramienta'");
    expect(hub).toMatch(/<Link\s+to=\{tool\.path\}/);
  });

  it('3. the other six tools remain blocked', () => {
    const others = TOOLS.filter((t) => t.id !== 'seo');
    expect(others).toHaveLength(6);
    expect(others.every((t) => t.enabled === false)).toBe(true);
  });

  it('4 & 30. legacy generate-seo and the 13 other retired functions still answer 410', () => {
    for (const fn of RETIRED) {
      expect(readdirSync(join(FN_DIR, fn))).toEqual(['index.ts']);
      expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410');
    }
    expect(src('supabase/config.toml')).toMatch(/\[functions\.generate-seo\]\nverify_jwt = true/);
  });

  it('5-6. the new function requires auth and entitlement before reading the body', () => {
    expect(src('supabase/config.toml')).toMatch(/\[functions\.seo-generator-v2\]\nverify_jwt = true/);
    const gate = fnIndex.indexOf('requirePremium(req, "seo-generator-v2"');
    expect(gate).toBeGreaterThan(0);
    for (const later of ['req.text()', 'Deno.env.get("LocalSEO_KEY")', 'createClient(', 'fetch(']) {
      expect(fnIndex.indexOf(later)).toBeGreaterThan(gate);
    }
    expect(fnIndex).toContain('if (!access.ok) return access.response;');
    expect(src('supabase/functions/seo-generator-v2/entitlement.ts')).toBe(src('supabase/functions/weekly-content/entitlement.ts'));
  });

  it('7. user_id is never accepted from the client', async () => {
    const { d } = deps();
    const r = await call(d, body({ userId: USER_B }));
    expect(r.status).toBe(422);
    expect(d.reserve).not.toHaveBeenCalled();
    expect(fnIndex).toContain('generate(access.userId, rawBody');
    expect(fnIndex).toMatch(/\.eq\("id", businessId\)\s*\.eq\("user_id", userId\)/);
  });

  it('8-13. caps: seo 20, weekly 30, improvement 30, global 80, advisor 0, voice 0', () => {
    const cap = (fn: string) => Number(migration.match(new RegExp(`WHEN '${fn}' THEN (\\d+)`))![1]);
    expect(cap('seo-generator')).toBe(20);
    expect(cap('weekly-content')).toBe(30);
    expect(cap('business-improvement')).toBe(30);
    expect(cap('global')).toBe(80);
    expect(cap('business-advisor')).toBe(0);
    expect(cap('voice-simulator')).toBe(0);
    expect(migration).toContain("c_global constant integer := public.ai_usage_cap('global')");
    expect(migration).toContain("IF v_fn_cap = 0 THEN\nRETURN jsonb_build_object('status', 'disabled')");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM|_used = 0/i);
    expect(LEDGER_FUNCTION).toBe('seo-generator');
  });

  it('8. the 21st SEO generation of the month is refused with 429 seo_limit', async () => {
    const { d, l } = deps();
    for (let i = 0; i < 20; i++) expect((await call(d)).status).toBe(200);
    const r = await call(d);
    expect(r).toEqual({ status: 429, json: { error: 'seo_limit' } });
    expect(l.used(USER_A)['seo-generator']).toBe(20);
  });

  it('11 & 21. the global cap answers 429 global_limit', async () => {
    const l = ledger();
    Object.assign(l.used(USER_A), { 'weekly-content': 30, 'business-improvement': 30, 'business-advisor': 20 });
    const { d } = deps({}, l);
    expect(await call(d)).toEqual({ status: 429, json: { error: 'global_limit' } });
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('14-15. each generation reserves once before the AI call and success consumes exactly 1', async () => {
    const { d, l } = deps();
    const order: string[] = [];
    (d.reserve as ReturnType<typeof vi.fn>).mockImplementationOnce(async (...a: [string, string, typeof LEDGER_FUNCTION]) => { order.push('reserve'); return l.reserve(...a); });
    (d.callModel as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { order.push('model'); return { ok: true, raw: GOOD_POST }; });
    const r = await call(d);
    expect(r.status).toBe(200);
    expect(order).toEqual(['reserve', 'model']);
    expect(l.used(USER_A)['seo-generator']).toBe(1);
    expect(l.settle).toHaveBeenCalledWith(expect.any(String), USER_A, 'completed');
  });

  it('16 & 24. provider failure releases the reservation and returns no fabricated content', async () => {
    const { d, l } = deps({}, ledger(), async () => ({ ok: false, retryable: true }));
    const r = await call(d);
    expect(r).toEqual({ status: 502, json: { error: 'ai_unavailable', retryable: true } });
    expect(l.used(USER_A)['seo-generator']).toBe(0);
    expect(l.settle).toHaveBeenCalledWith(expect.any(String), USER_A, 'released');
    expect(d.callModel).toHaveBeenCalledTimes(2);
  });

  it('16. a thrown provider error also releases; a billed but rejected output is consumed', async () => {
    const thrown = deps({}, ledger(), async () => { throw new Error('boom'); });
    expect((await call(thrown.d)).status).toBe(502);
    expect(thrown.l.used(USER_A)['seo-generator']).toBe(0);
    const bad = deps({}, ledger(), async () => ({ ok: true, raw: '{"content":"short"}' }));
    expect((await call(bad.d)).json.error).toBe('generation_failed');
    expect(bad.l.used(USER_A)['seo-generator']).toBe(1);
    expect(bad.l.settle).toHaveBeenCalledWith(expect.any(String), USER_A, 'consumed');
  });

  it('17. idempotency: the same requestId never consumes twice', async () => {
    const { d, l } = deps();
    const b = body();
    expect((await call(d, b)).status).toBe(200);
    expect(await call(d, b)).toEqual({ status: 409, json: { error: 'duplicate_request' } });
    expect(l.used(USER_A)['seo-generator']).toBe(1);
    expect(migration).toContain('ON CONFLICT (id) DO NOTHING;\nIF NOT FOUND THEN');
  });

  it('18. concurrent requests cannot exceed the cap (row lock in the database)', async () => {
    const { d, l } = deps();
    const results = await Promise.all(Array.from({ length: 30 }, () => call(d)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(20);
    expect(results.filter((r) => r.status === 429)).toHaveLength(10);
    expect(l.used(USER_A)['seo-generator']).toBe(20);
    expect(migration).toMatch(/WHERE user_id = p_user_id AND period_start = v_period\nFOR UPDATE;/);
  });

  it("19. user A cannot use B's business or consume B's quota", async () => {
    const { d, l } = deps();
    expect(await call(d, body({ businessId: BIZ_B }))).toEqual({ status: 404, json: { error: 'not_found' } });
    expect(l.used(USER_B)['seo-generator']).toBe(0);
    expect(d.reserve).not.toHaveBeenCalled();
    expect(src('supabase/migrations/20261014194508_a2420_generalized_ai_usage_ledger.sql')).toContain('WHERE id = p_reservation_id AND user_id = p_user_id');
  });

  it('20. invalid input returns 422 and never reserves', async () => {
    const { d } = deps();
    for (const b of [
      body({ format: 'blog' }), body({ businessId: 'x' }), body({ requestId: 'nope' }), body({ lang: 'fr' }),
      body({ topic: 5 }), body({ topic: 'a'.repeat(MAX_TOPIC_CHARS + 1) }), '[]', 'not json',
    ]) {
      expect((await call(d, b)).status).toBe(422);
    }
    expect(d.reserve).not.toHaveBeenCalled();
    expect((await call(d, body({ topic: '' }))).status).toBe(200);
  });

  it('payload, output and timeout limits are enforced', async () => {
    const { d } = deps();
    expect((await call(d, body({ topic: 'x'.repeat(MAX_BODY_BYTES) }))).status).toBe(413);
    expect(parseModelOutput('x'.repeat(9000), 'google_post')).toBeNull();
    expect(PROVIDER_TIMEOUT_MS).toBe(20000);
    expect(fnIndex).toContain('setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS)');
    expect(MODEL).toBe('gpt-4o-mini');
  });

  it('22-23. no AI call and no secret in the frontend; the page only talks to seo-generator-v2', () => {
    for (const f of frontend) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/api\.openai\.com|LocalSEO_KEY|reserve_ai_usage|settle_ai_usage|SERVICE_ROLE/);
    }
    expect(repo).toContain("functions.invoke('seo-generator-v2'");
    expect(repo).not.toMatch(/userId|user_id/);
  });

  it('25-27. copy and format changes are local; only generate/another version call the server', () => {
    expect(page.match(/generateSeo\(/g)).toHaveLength(1);
    expect(page).toMatch(/onClick=\{\(\) => setFormat\(f\)\}/);
    expect(page).toMatch(/navigator\.clipboard\.writeText\(resultToText\(result\)\)/);
    const onCopy = page.slice(page.indexOf('const onCopy'), page.indexOf('if (businessLoading)'));
    expect(onCopy).not.toMatch(/generate|invoke|rpc/);
    expect(page.match(/onClick=\{\(\) => void generate\(\)\}/g)).toHaveLength(2);
    expect(page).toContain('t.another');
    expect(repo).toContain('requestId: crypto.randomUUID()');
  });

  it('28-29. works without GBP and never invents missing data', () => {
    const facts = sanitizeFacts(HAIR);
    const input = parseInput(JSON.parse(body())) as { ok: true; input: Parameters<typeof buildMessages>[1] };
    const prompt = buildMessages(facts, input.input)[1].content;
    expect(prompt).not.toMatch(/website|phone|schedule|gbp|google_business/i);
    expect(prompt).toContain('"city":"Marbella"');
    const sys = buildMessages(facts, input.input)[0].content;
    expect(sys).toMatch(/No inventes NUNCA/);
    expect(sys).toMatch(/ignóralos/);
    const invented = (content: string) => violations({ title: '', content, cta: '', keywords: [], hashtags: [] }, facts, 'Coloración para otoño');
    expect(invented('Más de 15 años de experiencia en Marbella.')).not.toEqual([]);
    expect(invented('Coloración por solo 35 € esta semana.')).not.toEqual([]);
    expect(invented('Abrimos de lunes a sábado.')).not.toEqual([]);
    expect(invented('Más de 200 reseñas de cinco estrellas.')).not.toEqual([]);
    expect(invented('Te garantizamos el primer puesto en Google.')).not.toEqual([]);
    expect(invented('Llámanos al 952 123 456.')).not.toEqual([]);
    expect(invented('Ven a por tu coloración en Marbella, la vemos juntos.')).toEqual([]);
    const withPhone = sanitizeFacts({ ...HAIR, phone: '952 123 456' });
    expect(violations({ title: '', content: 'Llámanos al 952 123 456.', cta: '', keywords: [], hashtags: [] }, withPhone, '')).toEqual([]);
  });

  it('output shape: 4 formats, hashtags only for social posts, title required where expected', () => {
    expect(FORMATS).toEqual(['google_post', 'web_text', 'social_post', 'service_description']);
    expect(parseModelOutput(GOOD_POST, 'google_post')!.hashtags).toEqual([]);
    expect(parseModelOutput(GOOD_POST, 'social_post')!.hashtags).toEqual(['#ignored']);
    expect(parseModelOutput(JSON.stringify({ ...JSON.parse(GOOD_POST), title: '' }), 'service_description')).toBeNull();
    expect(page).toContain('t.disclaimer');
    expect(src('src/features/seo-generator/copy.ts')).toContain("disclaimer: 'Contenido generado con IA. Revísalo antes de publicarlo.'");
  });

  it('profile without name/category/city returns 422 profile_incomplete before reserving', async () => {
    const { d } = deps({ loadBusiness: vi.fn(async () => ({ ...HAIR, city: '' })) });
    const r = await call(d);
    expect(r).toEqual({ status: 422, json: { error: 'profile_incomplete', missing: ['city'] } });
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('15. the counter is read from the ledger, not computed in the browser', () => {
    expect(repo).toContain("db.rpc('my_ai_usage')");
    expect(page).toContain('t.usage(usage.used, usage.limit)');
    expect(src('src/features/seo-generator/copy.ts')).toContain('`Generaciones este mes: ${used} / ${limit}`');
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('WHERE m.user_id = auth.uid()');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.my_ai_usage() FROM PUBLIC, anon;');
  });

  it('31-32. weekly-content and business-improvement are untouched and still use the shared ledger', () => {
    expect(src('supabase/functions/weekly-content/index.ts')).toContain('requirePremium(req, "weekly-content"');
    expect(src('supabase/functions/business-improvement/index.ts')).toContain('admin.rpc("settle_ai_usage"');
    expect(fnHandler).not.toMatch(/weekly|improvement/);
  });
});
