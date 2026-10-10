import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate, type Deps, type Reservation, type ModelResult } from '../../../../supabase/functions/weekly-content/handler.ts';
import {
  MAX_ATTEMPTS, MAX_GENERATIONS, MAX_OUTPUT_TOKENS, MAX_PROVIDER_CALLS, MODEL, buildMessages, chooseTopic, parseModelOutput, sanitizeFacts,
} from '../../../../supabase/functions/weekly-content/logic.ts';
import { attemptsExhausted, missingProfileFields, remainingVersions, validateEdit, weekKey, type WeeklyDraft } from '../model';
import { markCopied, requestGeneration, saveContent } from '../repository';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const USER_A = 'user-a';
const USER_B = 'user-b';
const BIZ_A = '11111111-1111-4111-8111-111111111111';
const BIZ_B = '22222222-2222-4222-8222-222222222222';
const MONDAY = '2026-10-12';
const NOW = new Date(2026, 9, 14, 10, 0, 0);

const COMPLETE = {
  name: 'Panadería Lola', category: 'Panadería artesana', city: 'Sevilla',
  services: ['Pan de masa madre', 'Tartas por encargo'], target_audience: 'Familias del barrio',
  phone: '', schedule: '', website: '',
};

const GOOD_TEXT_ES = 'En Panadería Lola, en Sevilla, preparamos cada día pan de masa madre con calma y buenos ingredientes. '
  + 'Si nunca lo has probado, notarás la diferencia en la corteza y en lo bien que se conserva. '
  + '¿Tienes dudas sobre qué pan elegir para tu familia? Pásate y pregúntanos, te ayudamos encantados.';
const GOOD_TEXT_EN = 'At Panadería Lola in Seville we bake sourdough bread every day, slowly and with simple ingredients. '
  + 'If you have never tried it, you will notice the crust and how well it keeps. '
  + 'Not sure which bread suits your family? Drop by and ask us, we are happy to help.';

const ok = (text: string, hashtags: string[] = ['#Sevilla', '#PanArtesano']): ModelResult =>
  ({ ok: true, raw: JSON.stringify({ text, hashtags }) });

interface Row {
  id: string; user: string; business: string; week: string; generations: number; attempts: number;
  lock: boolean; token: string | null; lockedAt: number; topics: string[]; content: string;
}

const LEASE_MS = 90_000;

// In-memory mirror of reserve/complete/release in the FIX 07.1.1 migration (the real SQL is exercised separately).
function makeDeps(opts: {
  businesses?: Record<string, { owner: string; row: Record<string, unknown> }>;
  model?: () => Promise<ModelResult>; now?: Date; rows?: Map<string, Row>; clock?: { ms: number };
} = {}) {
  const businesses: Record<string, { owner: string; row: Record<string, unknown> }> = opts.businesses ?? { [BIZ_A]: { owner: USER_A, row: COMPLETE }, [BIZ_B]: { owner: USER_B, row: COMPLETE } };
  const rows = opts.rows ?? new Map<string, Row>();
  const clock = opts.clock ?? { ms: 0 };
  const calls = { model: 0, complete: 0, release: 0 };
  let seq = 0;
  const deps: Deps = {
    loadBusiness: async (u, b) => (businesses[b]?.owner === u ? businesses[b].row : null),
    reserve: async (u, b, week, expected): Promise<Reservation> => {
      if (businesses[b]?.owner !== u) return { status: 'not_found' };
      const key = `${b}:${week}`;
      const row = rows.get(key) ?? { id: key, user: u, business: b, week, generations: 0, attempts: 0, lock: false, token: null, lockedAt: 0, topics: [], content: '' };
      rows.set(key, row);
      if (row.generations !== expected) return { status: 'stale', generations: row.generations };
      if (row.generations >= MAX_GENERATIONS) return { status: 'limit', generations: row.generations };
      if (row.lock && clock.ms - row.lockedAt < LEASE_MS) return { status: 'busy', generations: row.generations };
      if (row.attempts >= MAX_ATTEMPTS) return { status: 'attempts', generations: row.generations, attempts: row.attempts };
      Object.assign(row, { lock: true, lockedAt: clock.ms, token: `tok-${u}-${++seq}-${Math.random()}`, attempts: row.attempts + 1 });
      const recent = [...rows.values()].filter((r) => r.business === b && r.week < week).flatMap((r) => r.topics);
      return { status: 'reserved', id: row.id, reservation: row.token!, generations: row.generations, attempts: row.attempts, topics_used: [...row.topics], recent_topics: recent };
    },
    complete: async (id, u, reservation, content, topic) => {
      calls.complete++;
      const row = rows.get(id);
      if (!row || row.user !== u || !row.lock || row.token !== reservation || row.generations >= MAX_GENERATIONS) return false;
      Object.assign(row, { content, generations: row.generations + 1, lock: false, token: null, topics: [...row.topics, topic] });
      return true;
    },
    release: async (id, u, reservation) => {
      calls.release++;
      const row = rows.get(id);
      if (!row || row.user !== u || row.token !== reservation) return false;
      Object.assign(row, { lock: false, token: null });
      return true;
    },
    callModel: async () => { calls.model++; return opts.model ? opts.model() : ok(GOOD_TEXT_ES); },
    now: () => opts.now ?? NOW,
  };
  return { deps, rows, calls, clock };
}

const body = (over: Partial<{ businessId: string; weekStart: string; lang: string; expectedGenerations: number }> = {}) =>
  ({ businessId: BIZ_A, weekStart: MONDAY, lang: 'es', expectedGenerations: 0, ...over });

const call = async (deps: Deps, b: unknown, user = USER_A) => {
  const res = await generate(user, b, deps);
  return { status: res.status, json: await res.json() };
};

describe('weekly content: server generation', () => {
  it('1. complete profile generates and saves the first draft', async () => {
    const { deps, rows } = makeDeps();
    const r = await call(deps, body());
    expect(r).toEqual({ status: 200, json: { status: 'generated', generations: 1 } });
    const row = rows.get(`${BIZ_A}:${MONDAY}`)!;
    expect(row.content).toContain('Panadería Lola');
    expect(row.lock).toBe(false);
  });

  it('2. incomplete profile is rejected before any reservation or AI call', async () => {
    const { deps, calls, rows } = makeDeps({ businesses: { [BIZ_A]: { owner: USER_A, row: { ...COMPLETE, city: '', services: [] } } } });
    const r = await call(deps, body());
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: 'profile_incomplete', missing: ['city', 'services'] });
    expect(calls.model).toBe(0);
    expect(rows.size).toBe(0);
    expect(missingProfileFields({ name: 'X', category: '', city: 'Y', services: ['  '] })).toEqual(['category', 'services']);
  });

  it('3. first draft: GBP is not required (only profile fields are used)', async () => {
    const { deps } = makeDeps({ businesses: { [BIZ_A]: { owner: USER_A, row: { name: 'Lola', category: 'Panadería', city: 'Sevilla', services: ['Pan'] } } } });
    expect((await call(deps, body())).status).toBe(200);
    expect(read('supabase/functions/weekly-content/index.ts')).not.toMatch(/gbp|google/i);
  });

  it('4-5. 1st and 2nd regeneration work, then the weekly limit rejects a 4th', async () => {
    const { deps, calls } = makeDeps();
    expect((await call(deps, body())).json.generations).toBe(1);
    expect((await call(deps, body({ expectedGenerations: 1 }))).json.generations).toBe(2);
    expect((await call(deps, body({ expectedGenerations: 2 }))).json.generations).toBe(3);
    const over = await call(deps, body({ expectedGenerations: 3 }));
    expect(over).toEqual({ status: 429, json: { error: 'limit_reached', generations: 3 } });
    expect(calls.model).toBe(3);
  });

  it('6. a reload / second tab with an old counter gets "stale" and consumes nothing', async () => {
    const { deps, calls } = makeDeps();
    await call(deps, body());
    const dup = await call(deps, body({ expectedGenerations: 0 }));
    expect(dup).toEqual({ status: 200, json: { status: 'stale', generations: 1 } });
    expect(calls.model).toBe(1);
  });

  it('7. simultaneous requests: only one reaches the AI, the other gets in_progress', async () => {
    let releaseModel: () => void = () => {};
    const gate = new Promise<void>((r) => { releaseModel = r; });
    const { deps, calls, rows } = makeDeps({ model: async () => { await gate; return ok(GOOD_TEXT_ES); } });
    const first = call(deps, body());
    await new Promise((r) => setTimeout(r, 0));
    const second = await call(deps, body());
    releaseModel();
    expect(second).toEqual({ status: 409, json: { error: 'in_progress' } });
    expect((await first).status).toBe(200);
    expect(calls.model).toBe(1);
    expect(rows.get(`${BIZ_A}:${MONDAY}`)!.generations).toBe(1);
  });

  it('8. user / business isolation: another user cannot generate for my business', async () => {
    const { deps, rows, calls } = makeDeps();
    const r = await call(deps, body({ businessId: BIZ_A }), USER_B);
    expect(r).toEqual({ status: 404, json: { error: 'not_found' } });
    expect(rows.size).toBe(0);
    expect(calls.model).toBe(0);
  });

  it('9. week change: an old week is refused, the new week starts with a fresh quota', async () => {
    const nextWeek = new Date(2026, 9, 20, 10, 0, 0);
    const { deps } = makeDeps({ now: nextWeek });
    expect(await call(deps, body({ weekStart: MONDAY }))).toEqual({ status: 400, json: { error: 'invalid_week' } });
    expect((await call(deps, body({ weekStart: '2026-10-19' }))).json).toEqual({ status: 'generated', generations: 1 });
    expect(weekKey(new Date(2026, 9, 18, 23, 59))).toBe('2026-10-12');
    expect(weekKey(new Date(2026, 9, 19, 0, 1))).toBe('2026-10-19');
  });

  it('10. AI provider error: limited retries, lock released, no quota consumed', async () => {
    const { deps, calls, rows } = makeDeps({ model: async () => ({ ok: false, retryable: true }) });
    const r = await call(deps, body());
    expect(r).toEqual({ status: 502, json: { error: 'ai_unavailable' } });
    expect(calls.model).toBe(MAX_PROVIDER_CALLS);
    expect(calls.release).toBe(1);
    const row = rows.get(`${BIZ_A}:${MONDAY}`)!;
    expect(row).toMatchObject({ generations: 0, lock: false, content: '' });

    const thrown = makeDeps({ model: async () => { throw new Error('network'); } });
    expect((await call(thrown.deps, body())).json).toEqual({ error: 'ai_unavailable' });
    expect(thrown.rows.get(`${BIZ_A}:${MONDAY}`)!.lock).toBe(false);
  });

  it('10b. a failed save releases the lock without consuming quota', async () => {
    const { deps, rows } = makeDeps();
    deps.complete = async () => { throw new Error('db'); };
    expect(await call(deps, body())).toEqual({ status: 500, json: { error: 'save_failed' } });
    expect(rows.get(`${BIZ_A}:${MONDAY}`)!).toMatchObject({ generations: 0, lock: false });
  });

  it('11. invented claims are rejected; nothing is saved and no quota is used', async () => {
    const facts = sanitizeFacts(COMPLETE);
    const invented = [
      'Esta semana tenemos un 20% de descuento en todas las tartas de la casa para celebrar nuestro aniversario en Sevilla.',
      'Somos la panadería número 1 de Sevilla, con más de 500 reseñas de cinco estrellas de vecinos que nos adoran.',
      'Abrimos de 8:00 a 14:00 y puedes llamarnos al 954 123 456 para encargar tu pan de masa madre favorito hoy mismo.',
      'Panadería premiada y certificada, con 20 años de experiencia, pan de masa madre a 3 € la pieza en el centro.',
      'This week only: free delivery and a special offer on sourdough bread from our award-winning Seville bakery shop!',
    ];
    for (const text of invented) expect(parseModelOutput(JSON.stringify({ text, hashtags: [] }), facts)).toEqual({ ok: false, reason: 'claims' });
    expect(parseModelOutput(JSON.stringify({ text: GOOD_TEXT_ES, hashtags: ['#Sevilla'] }), facts).ok).toBe(true);

    const declaredFree = sanitizeFacts({ ...COMPLETE, services: ['Cursos gratuitos de pan'] });
    expect(parseModelOutput(JSON.stringify({ text: `${GOOD_TEXT_ES} Pregunta por los cursos gratuitos de pan.`, hashtags: [] }), declaredFree).ok).toBe(true);

    const { deps, rows } = makeDeps({ model: async () => ok(invented[0], []) });
    expect(await call(deps, body())).toEqual({ status: 502, json: { error: 'generation_failed' } });
    expect(rows.get(`${BIZ_A}:${MONDAY}`)!).toMatchObject({ generations: 0, content: '', lock: false });
  });

  it('11b. malformed or oversized model output is rejected, hashtags are capped', () => {
    const facts = sanitizeFacts(COMPLETE);
    expect(parseModelOutput('not json', facts)).toEqual({ ok: false, reason: 'malformed' });
    expect(parseModelOutput(JSON.stringify({ text: 'corto' }), facts)).toEqual({ ok: false, reason: 'length' });
    expect(parseModelOutput(JSON.stringify({ text: 'a '.repeat(600) }), facts)).toEqual({ ok: false, reason: 'length' });
    const many = parseModelOutput(JSON.stringify({ text: GOOD_TEXT_ES, hashtags: ['#a1', '#b2', '#c3', '#d4', '#e5', '#a1'] }), facts);
    expect(many.ok && many.content.split('#').length - 1).toBe(4);
  });

  it('12. ES / EN: the prompt and output follow the requested language', async () => {
    const facts = sanitizeFacts(COMPLETE);
    const es = buildMessages(facts, 'practical_tip', 'Pan de masa madre', 'es');
    const en = buildMessages(facts, 'practical_tip', 'Pan de masa madre', 'en');
    expect(es[0].content).toMatch(/Usa SOLO los datos del negocio/);
    expect(en[0].content).toMatch(/Use ONLY the business facts/);
    expect(en[1].content).toContain('Declared services: Pan de masa madre; Tartas por encargo');
    const { deps, rows } = makeDeps({ model: async () => ok(GOOD_TEXT_EN, ['#Seville']) });
    expect((await call(deps, body({ lang: 'en' }))).status).toBe(200);
    expect(rows.get(`${BIZ_A}:${MONDAY}`)!.content).toContain('#Seville');
    expect((await call(deps, body({ lang: 'fr', expectedGenerations: 1 }))).status).toBe(400);
  });

  it('13. topics vary within the week and avoid recent weeks', async () => {
    const facts = sanitizeFacts(COMPLETE);
    const t1 = chooseTopic(facts, 's', [], []);
    const t2 = chooseTopic(facts, 's', [t1], []);
    expect(t2).not.toBe(t1);
    const recent = ['service_spotlight', 'practical_tip', 'local_presence'];
    expect(recent).not.toContain(chooseTopic(facts, 'x', [], recent));
    const { deps, rows } = makeDeps();
    await call(deps, body());
    await call(deps, body({ expectedGenerations: 1 }));
    const topics = rows.get(`${BIZ_A}:${MONDAY}`)!.topics;
    expect(new Set(topics).size).toBe(2);
  });

  it('14. input validation rejects forged or malformed requests', async () => {
    const { deps } = makeDeps();
    for (const b of [null, {}, body({ businessId: 'abc' }), body({ expectedGenerations: 9 }), body({ expectedGenerations: 1.5 })]) {
      expect((await call(deps, b)).status).toBe(400);
    }
    expect((await call(deps, body({ weekStart: '2026-10-13' }))).json).toEqual({ error: 'invalid_week' });
  });
});

describe('weekly content: browser data layer', () => {
  const draft: WeeklyDraft = {
    id: 'd1', business_id: BIZ_A, week_start: MONDAY, lang: 'es', content: 'Texto original', generations: 1, attempts: 1,
    generated_at: 'x', edited_at: null, copied_at: null, updated_at: '2026-10-12T10:00:00.000001+00:00',
  };

  function fakeDb(result: { data: unknown; error: unknown }) {
    const update = vi.fn();
    const eq = vi.fn();
    const chain = { eq: (...a: unknown[]) => { eq(...a); return chain; }, select: () => chain, maybeSingle: async () => result };
    const db = { from: () => ({ update: (v: unknown) => { update(v); return chain; } }), functions: { invoke: vi.fn() } };
    return { db: db as never, update, eq };
  }

  it('15. edit persistence: saves only the content, guarded by the version timestamp', async () => {
    const saved = { ...draft, content: 'Mi texto', edited_at: 'now', updated_at: 'later' };
    const { db, update, eq } = fakeDb({ data: saved, error: null });
    expect(await saveContent(draft, 'Mi texto', db)).toEqual({ status: 'saved', draft: saved });
    expect(update).toHaveBeenCalledWith({ content: 'Mi texto' });
    expect(eq).toHaveBeenCalledWith('updated_at', draft.updated_at);

    const conflict = fakeDb({ data: null, error: null });
    expect(await saveContent(draft, 'Mi texto', conflict.db)).toEqual({ status: 'conflict' });
    await expect(saveContent(draft, 'x', fakeDb({ data: null, error: { message: 'boom' } }).db)).rejects.toThrow('unavailable');

    expect(validateEdit('   ')).toBe('empty');
    expect(validateEdit('a'.repeat(2201))).toBe('too_long');
    expect(validateEdit('ok')).toBeNull();
  });

  it('16. copy never changes the text: it only records copied_at', async () => {
    const { db, update } = fakeDb({ data: { ...draft, copied_at: 'now' }, error: null });
    const result = await markCopied(draft, db);
    expect(update).toHaveBeenCalledTimes(1);
    const patch = update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(['copied_at']);
    expect(result?.content).toBe('Texto original');
    expect(remainingVersions(draft)).toBe(2);
  });

  it('maps server errors to safe codes and never exposes raw messages', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'limit_reached' }), { status: 429 }) } });
    await expect(requestGeneration({ businessId: BIZ_A, weekStart: MONDAY, lang: 'es', expectedGenerations: 3 }, { functions: { invoke } } as never))
      .rejects.toMatchObject({ code: 'limit_reached' });
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'SQL: relation x' }), { status: 500 }) } });
    await expect(requestGeneration({ businessId: BIZ_A, weekStart: MONDAY, lang: 'es', expectedGenerations: 0 }, { functions: { invoke } } as never))
      .rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('weekly content: wiring, security and regressions', () => {
  const card = read('src/features/weekly-content/WeeklyContentCard.tsx');
  const hook = read('src/features/weekly-content/useWeeklyContent.ts');
  const index = read('supabase/functions/weekly-content/index.ts');
  const migration = read('supabase/migrations/20261010115224_v071_weekly_content_drafts.sql');

  it('never generates on visit or reload: generation only from a button', () => {
    const effects = hook.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) expect(e).not.toMatch(/generate|requestGeneration/);
    expect(card).toMatch(/onClick=\{\(\) => void generate\(\)\}/);
  });

  it('copy only uses the clipboard and markCopied; card shows week, draft badge and the required intro', () => {
    const onCopy = card.slice(card.indexOf('const onCopy'), card.indexOf('const onAnother'));
    expect(onCopy).toMatch(/navigator\.clipboard\.writeText\(draft\.content\)/);
    expect(onCopy).not.toMatch(/save\(|generate\(/);
    const copy = read('src/features/weekly-content/copy.ts');
    expect(copy).toContain('Cada semana te ayudamos a preparar una publicación para dar visibilidad a tu negocio.');
    expect(copy).toMatch(/Borrador · no publicado/);
    expect(copy).not.toMatch(/publicado con éxito|published successfully/i);
  });

  it('/hoy keeps the missions first and adds the card right after them', () => {
    const today = read('src/app-v2/routes/TodayPage.tsx');
    const missions = today.indexOf('<TodaysMissions');
    const cardPos = today.indexOf('<WeeklyContentCard');
    expect(missions).toBeGreaterThan(-1);
    expect(cardPos).toBeGreaterThan(today.indexOf('<BusinessHealthCard'));
    expect(cardPos).toBeLessThan(today.indexOf('<AIInsights'));
    expect(today.match(/<TodaysMissions[\s\S]*?\/>/)![0]).toMatch(/onExecute=\{onExecute\}[\s\S]*onDismiss=\{onDismiss\}/);
  });

  it('/informes distinguishes prepared, edited and copied without claiming publication or impact', () => {
    expect(read('src/features/business-memory/WeeklySummaryPage.tsx')).toContain('<WeeklyContentReport');
    const report = read('src/features/weekly-content/WeeklyContentReport.tsx');
    expect(report).toMatch(/t\.prepared[\s\S]*t\.edited[\s\S]*t\.copied/);
    expect(read('src/features/weekly-content/copy.ts')).toMatch(/no significa que se haya publicado/);
  });

  it('server function: premium guard first, identical entitlement, no secrets in the browser', () => {
    expect(read('supabase/functions/weekly-content/entitlement.ts')).toBe(read('supabase/functions/analyze-website/entitlement.ts'));
    const guard = index.indexOf('requirePremium(req, "weekly-content"');
    expect(guard).toBeGreaterThan(-1);
    for (const later of ['req.json(', 'fetch(', 'LocalSEO_KEY']) expect(index.indexOf(later)).toBeGreaterThan(guard);
    expect(read('supabase/config.toml')).toMatch(/\[functions\.weekly-content\]\s*\nverify_jwt = true/);
    for (const f of ['WeeklyContentCard.tsx', 'repository.ts', 'useWeeklyContent.ts']) {
      expect(read(`src/features/weekly-content/${f}`)).not.toMatch(/service_role|SERVICE_ROLE|LocalSEO_KEY|OPENAI/i);
    }
    expect(MODEL).toBe('gpt-4o-mini');
    expect(MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(400);
  });

  it('migration: RLS on, no browser insert/delete, writes limited to content and copied_at', () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/REVOKE ALL ON public\.weekly_content_drafts FROM anon;/);
    expect(migration).toMatch(/REVOKE ALL ON public\.weekly_content_drafts FROM authenticated;/);
    expect(migration).toMatch(/GRANT UPDATE \(content, copied_at\)/);
    expect(migration).not.toMatch(/FOR (INSERT|DELETE|ALL)/);
    expect(migration).toMatch(/UNIQUE ?\(business_id, week_start\)/i);
  });
});

describe('FIX 07.1.1: attempt limit and reservation token', () => {
  const KEY_A = `${BIZ_A}:${MONDAY}`;
  const fail: () => Promise<ModelResult> = async () => ({ ok: false, retryable: false });

  it('F1. six failed requests are each counted as one attempt', async () => {
    const { deps, rows } = makeDeps({ model: fail });
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const r = await call(deps, body());
      expect(r.status).toBe(502);
      expect(rows.get(KEY_A)).toMatchObject({ attempts: i, generations: 0, lock: false });
    }
  });

  it('F2. a 7th request is rejected without calling the AI', async () => {
    const { deps, calls, rows } = makeDeps({ model: fail });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await call(deps, body());
    const before = calls.model;
    const r = await call(deps, body());
    expect(r).toEqual({ status: 429, json: { error: 'attempts_exhausted', generations: 0 } });
    expect(calls.model).toBe(before);
    expect(rows.get(KEY_A)!.attempts).toBe(MAX_ATTEMPTS);
  });

  it('F3. three successful versions stay the maximum even with attempts left', async () => {
    const { deps, calls, rows } = makeDeps();
    for (let g = 0; g < MAX_GENERATIONS; g++) expect((await call(deps, body({ expectedGenerations: g }))).status).toBe(200);
    expect(await call(deps, body({ expectedGenerations: 3 }))).toEqual({ status: 429, json: { error: 'limit_reached', generations: 3 } });
    expect(rows.get(KEY_A)).toMatchObject({ generations: 3, attempts: 3 });
    expect(calls.model).toBe(3);
  });

  it('F4. internal retries inside one request consume a single attempt', async () => {
    let n = 0;
    const { deps, calls, rows } = makeDeps({ model: async () => (++n === 1 ? { ok: false, retryable: true } : ok(GOOD_TEXT_ES)) });
    expect((await call(deps, body())).status).toBe(200);
    expect(calls.model).toBe(MAX_PROVIDER_CALLS);
    expect(rows.get(KEY_A)).toMatchObject({ attempts: 1, generations: 1 });

    const failing = makeDeps({ model: async () => ({ ok: false, retryable: true }) });
    expect((await call(failing.deps, body())).status).toBe(502);
    expect(failing.calls.model).toBe(MAX_PROVIDER_CALLS);
    expect(failing.rows.get(KEY_A)!.attempts).toBe(1);
  });

  it('F5. simultaneous requests do not exceed the limits', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    const { deps, calls, rows } = makeDeps({ model: async () => { await gate; return ok(GOOD_TEXT_ES); } });
    const pending = Array.from({ length: 10 }, () => call(deps, body()));
    await new Promise((r) => setTimeout(r, 0));
    open();
    const results = await Promise.all(pending);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect(calls.model).toBe(1);
    expect(rows.get(KEY_A)).toMatchObject({ attempts: 1, generations: 1 });
  });

  it('F6. an expired reservation can be recovered with a fresh token', async () => {
    const { deps, rows, clock } = makeDeps();
    const first = await deps.reserve(USER_A, BIZ_A, MONDAY, 0);
    expect(await call(deps, body())).toEqual({ status: 409, json: { error: 'in_progress' } });
    clock.ms += LEASE_MS + 1;
    const second = await deps.reserve(USER_A, BIZ_A, MONDAY, 0);
    expect(second.status).toBe('reserved');
    if (first.status !== 'reserved' || second.status !== 'reserved') throw new Error('unreachable');
    expect(second.reservation).not.toBe(first.reservation);
    expect(rows.get(KEY_A)!.attempts).toBe(2);
  });

  it('F7. an old request cannot complete a newer reservation', async () => {
    const { deps, rows, clock } = makeDeps();
    const old = await deps.reserve(USER_A, BIZ_A, MONDAY, 0);
    clock.ms += LEASE_MS + 1;
    const fresh = await deps.reserve(USER_A, BIZ_A, MONDAY, 0);
    if (old.status !== 'reserved' || fresh.status !== 'reserved') throw new Error('unreachable');
    expect(await deps.complete(old.id, USER_A, old.reservation, 'viejo', 'practical_tip', 'es')).toBe(false);
    expect(rows.get(KEY_A)).toMatchObject({ generations: 0, lock: true, token: fresh.reservation, content: '' });
    expect(await deps.complete(fresh.id, USER_A, fresh.reservation, 'nuevo', 'practical_tip', 'es')).toBe(true);
    expect(rows.get(KEY_A)).toMatchObject({ generations: 1, lock: false, content: 'nuevo' });
  });

  it('F8. an old request cannot release a newer reservation', async () => {
    const { deps, rows, clock } = makeDeps();
    const old = await deps.reserve(USER_A, BIZ_A, MONDAY, 0);
    clock.ms += LEASE_MS + 1;
    const fresh = await deps.reserve(USER_A, BIZ_A, MONDAY, 0);
    if (old.status !== 'reserved' || fresh.status !== 'reserved') throw new Error('unreachable');
    expect(await deps.release(old.id, USER_A, old.reservation)).toBe(false);
    expect(rows.get(KEY_A)).toMatchObject({ lock: true, token: fresh.reservation });
    expect(await call(deps, body())).toEqual({ status: 409, json: { error: 'in_progress' } });
  });

  it('F9. counters persist across sessions (stored server-side, read back by the browser)', async () => {
    const store = new Map<string, Row>();
    const s1 = makeDeps({ rows: store, model: fail });
    for (let i = 0; i < 4; i++) await call(s1.deps, body());
    const s2 = makeDeps({ rows: store });
    expect((await call(s2.deps, body())).status).toBe(200);
    expect(store.get(KEY_A)).toMatchObject({ attempts: 5, generations: 1 });
    const s3 = makeDeps({ rows: store, model: fail });
    await call(s3.deps, body({ expectedGenerations: 1 }));
    expect((await call(s3.deps, body({ expectedGenerations: 1 }))).json.error).toBe('attempts_exhausted');
    expect(read('src/features/weekly-content/repository.ts')).toMatch(/attempts/);
  });

  it('F10. different users and businesses keep independent limits', async () => {
    const store = new Map<string, Row>();
    const a = makeDeps({ rows: store, model: fail });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await call(a.deps, body());
    expect((await call(a.deps, body())).json.error).toBe('attempts_exhausted');
    const b = makeDeps({ rows: store });
    expect((await call(b.deps, body({ businessId: BIZ_B }), USER_B)).status).toBe(200);
    expect(store.get(`${BIZ_B}:${MONDAY}`)).toMatchObject({ attempts: 1, generations: 1 });
    expect((await call(b.deps, body(), USER_B)).status).toBe(404);
    expect(store.get(KEY_A)!.attempts).toBe(MAX_ATTEMPTS);
  });

  it('browser: attempts drive remaining versions and the exhausted message', () => {
    const base = { generations: 1, attempts: 1 } as WeeklyDraft;
    expect(remainingVersions(base)).toBe(2);
    expect(remainingVersions({ ...base, attempts: 5 })).toBe(1);
    expect(remainingVersions({ ...base, attempts: 6 })).toBe(0);
    expect(attemptsExhausted({ ...base, attempts: 6 })).toBe(true);
    expect(attemptsExhausted(null)).toBe(false);
    const copy = read('src/features/weekly-content/copy.ts');
    expect(copy.match(/attempts_exhausted:/g)).toHaveLength(2);
    expect(read('src/features/weekly-content/WeeklyContentCard.tsx')).toMatch(/attemptsNoDraft/);
  });

  it('migration: token-checked lock, attempt cap, hidden token, service_role only', () => {
    const sql = read('supabase/migrations/20261010122257_fix0711_weekly_content_attempts_and_reservation_token.sql');
    expect(sql).toMatch(/attempts\s*>=\s*6/);
    expect(sql).toMatch(/v_token uuid := gen_random_uuid\(\)/);
    expect(sql).toMatch(/reservation_id\s*=\s*v_token/);
    expect((sql.match(/reservation_id\s*=\s*p_reservation_id/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS[^;]*complete_weekly_content\(uuid, uuid, text, text, text\)/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS[^;]*release_weekly_content\(uuid, uuid\)/i);
    const grant = sql.match(/GRANT SELECT \(([^)]*)\) ON (public\.)?weekly_content_drafts TO authenticated/i);
    expect(grant).not.toBeNull();
    expect(grant![1]).toMatch(/attempts/);
    expect(grant![1]).not.toMatch(/reservation_id/);
    expect(sql).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|authenticated|public)/i);
    expect(sql).toMatch(/GRANT EXECUTE[^;]*TO service_role/i);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY|FOR ALL|DROP TABLE|DROP COLUMN/i);
  });
});
