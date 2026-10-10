import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generate, type ActionRow, type Deps, type ModelResult, type Reservation, type ReserveArgs,
} from '../../../../supabase/functions/business-improvement/handler.ts';
import {
  COMPATIBLE_RULES as SERVER_RULES, MAX_ATTEMPTS, MAX_GENERATIONS, MAX_OUTPUT_TOKENS, MAX_PROVIDER_CALLS, MODEL,
  MONTHLY_REQUESTS, buildMessages, declaredText, parseModelOutput, sanitizeFacts, violations,
} from '../../../../supabase/functions/business-improvement/logic.ts';
import {
  COMPATIBLE_RULES, improvementTarget, missingFor, monthKey, offersImprovement, remainingVersions, serviceStillDeclared,
  validateEdit, validateSource, type ImprovementDraft,
} from '../model';
import { loadDraft, markCopied, requestGeneration, saveContent } from '../repository';
import { IMPROVEMENT_COPY } from '../copy';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const USER_A = 'user-a';
const USER_B = 'user-b';
const BIZ_A = '11111111-1111-4111-8111-111111111111';
const BIZ_B = '22222222-2222-4222-8222-222222222222';
const ACT_DESC = 'aaaaaaaa-0000-4000-8000-000000000001';
const ACT_SERVICE = 'aaaaaaaa-0000-4000-8000-000000000002';
const ACT_FAQ = 'aaaaaaaa-0000-4000-8000-000000000003';
const ACT_OTHER = 'aaaaaaaa-0000-4000-8000-000000000004';
const ACT_CLOSED = 'aaaaaaaa-0000-4000-8000-000000000005';
const ACT_DESC_NEW = 'aaaaaaaa-0000-4000-8000-000000000006';
const ACT_B_DESC = 'bbbbbbbb-0000-4000-8000-000000000001';

const PROFILE = {
  name: 'Panadería Lola', category: 'Panadería artesana', city: 'Sevilla',
  services: ['Pan de masa madre', 'Tartas por encargo'], target_audience: 'Familias del barrio',
};

const DESC_ES = 'En Panadería Lola, en Sevilla, elaboramos pan de masa madre y tartas por encargo para las familias del barrio. '
  + 'Trabajamos con calma y con ingredientes sencillos para que cada pieza tenga buen sabor. '
  + 'Si buscas pan artesano en Sevilla o quieres encargar una tarta para una ocasión especial, pásate y te ayudamos a elegir.';
const DESC_EN = 'At Panadería Lola in Seville we bake sourdough bread and make cakes to order for local families. '
  + 'We offer simple, carefully made bread with honest ingredients. '
  + 'If you are looking for artisan bread in Seville or want a cake for a special day, drop by and feel free to ask us.';
const SERVICE_ES = 'Nuestras tartas por encargo se preparan en Panadería Lola, en Sevilla, pensando en celebraciones familiares y en el día a día. '
  + 'Cuéntanos qué te gustaría y te orientamos para elegir la opción que encaje contigo. Pregúntanos sin compromiso.';
const FAQS = {
  faqs: [
    { q: '¿Qué tipo de negocio es Panadería Lola?', a: 'Somos una panadería artesana en Sevilla que elabora pan de masa madre.' },
    { q: '¿Hacéis tartas por encargo?', a: 'Sí, preparamos tartas por encargo. Pregúntanos y te contamos las opciones.' },
    { q: '¿Para quién está pensada la panadería?', a: 'Para las familias del barrio que buscan pan artesano hecho con calma.' },
  ],
};
const INVENTED = 'Desde 1998 somos la mejor panadería de Sevilla, con más de 20 años de experiencia y 4,9 estrellas en reseñas. '
  + 'Pan de masa madre a 3 € y descuentos del 10% cada semana. Llámanos al 954 123 456 y te garantizamos el mejor resultado.';
const SOURCE_TEXT = 'Somos Panadería Lola. Hacemos pan de masa madre desde 2010 en el barrio y también tartas si nos las pides con tiempo.';
const IMPROVED = 'En Panadería Lola hacemos pan de masa madre en el barrio desde 2010. '
  + 'También preparamos tartas si nos las pides con tiempo, para que lleguen listas cuando las necesites.';

const text = (t: string): ModelResult => ({ ok: true, raw: JSON.stringify({ text: t }) });

interface Row {
  id: string; user: string; business: string; key: string; action: string | null; generations: number; attempts: number;
  token: string | null; lockedAt: number | null; content: string; versions: string[]; edited: boolean;
}

interface Act { user: string; business: string; rule_id: string; status: string; metadata: unknown }

const LEASE_MS = 90_000;

// In-memory mirror of reserve/complete/release in the v0.7.2 migration; the SQL itself is checked further down.
function makeDeps(opts: { model?: () => Promise<ModelResult>; businesses?: Record<string, { owner: string; row: Record<string, unknown> }> } = {}) {
  const businesses: Record<string, { owner: string; row: Record<string, unknown> }> = opts.businesses ?? { [BIZ_A]: { owner: USER_A, row: PROFILE }, [BIZ_B]: { owner: USER_A, row: { ...PROFILE, name: 'Taller Ruiz' } } };
  const actions: Record<string, Act> = {
    [ACT_DESC]: { user: USER_A, business: BIZ_A, rule_id: 'optimize_services_keywords', status: 'PENDING', metadata: {} },
    [ACT_SERVICE]: { user: USER_A, business: BIZ_A, rule_id: 'improve_service_description', status: 'IN_PROGRESS', metadata: { evidence: { service: 'Tartas por encargo' } } },
    [ACT_FAQ]: { user: USER_A, business: BIZ_A, rule_id: 'write_faq_answers', status: 'PENDING', metadata: {} },
    [ACT_OTHER]: { user: USER_A, business: BIZ_A, rule_id: 'connect_google_business', status: 'PENDING', metadata: {} },
    [ACT_CLOSED]: { user: USER_A, business: BIZ_A, rule_id: 'optimize_services_keywords', status: 'COMPLETED', metadata: {} },
    [ACT_B_DESC]: { user: USER_A, business: BIZ_B, rule_id: 'optimize_services_keywords', status: 'PENDING', metadata: {} },
  };
  const rows = new Map<string, Row>();
  const usage: Record<string, number> = {};
  const clock = { ms: 0 };
  const calls = { model: 0, complete: 0, release: 0, reserve: 0 };
  let seq = 0;
  const deps: Deps = {
    loadAction: async (u, b, id): Promise<ActionRow | null> => {
      const a = actions[id];
      return a && a.user === u && a.business === b ? { rule_id: a.rule_id, status: a.status, metadata: a.metadata } : null;
    },
    loadBusiness: async (u, b) => (businesses[b]?.owner === u ? businesses[b].row : null),
    reserve: async (r: ReserveArgs): Promise<Reservation> => {
      calls.reserve++;
      if (businesses[r.businessId]?.owner !== r.userId) return { status: 'not_found' };
      const a = actions[r.actionId];
      if (!a || a.user !== r.userId || a.business !== r.businessId) return { status: 'not_found' };
      if (r.semanticKey !== a.rule_id && !r.semanticKey.startsWith(`${a.rule_id}:`)) return { status: 'invalid' };
      if (a.status !== 'PENDING' && a.status !== 'IN_PROGRESS') return { status: 'closed' };
      const key = `${r.businessId}:${r.semanticKey}`;
      const row = rows.get(key) ?? { id: key, user: r.userId, business: r.businessId, key: r.semanticKey, action: null, generations: 0, attempts: 0, token: null, lockedAt: null, content: '', versions: [], edited: false };
      rows.set(key, row);
      if (row.generations !== r.expected) return { status: 'stale', generations: row.generations };
      if (row.generations >= MAX_GENERATIONS) return { status: 'limit', generations: row.generations };
      if (row.lockedAt !== null && clock.ms - row.lockedAt < LEASE_MS) return { status: 'busy', generations: row.generations };
      if (row.attempts >= MAX_ATTEMPTS) return { status: 'attempts', generations: row.generations, attempts: row.attempts };
      if (row.edited && !r.allowOverwrite) return { status: 'edited', generations: row.generations };
      if ((usage[r.userId] ?? 0) >= MONTHLY_REQUESTS) return { status: 'global', generations: row.generations };
      usage[r.userId] = (usage[r.userId] ?? 0) + 1;
      Object.assign(row, { lockedAt: clock.ms, token: `tok-${++seq}`, attempts: row.attempts + 1, action: r.actionId });
      return { status: 'reserved', id: row.id, reservation: row.token!, generations: row.generations, attempts: row.attempts, global_used: usage[r.userId] };
    },
    complete: async (id, u, reservation, content) => {
      calls.complete++;
      const row = rows.get(id);
      if (!row || row.user !== u || row.lockedAt === null || row.token !== reservation || row.generations >= MAX_GENERATIONS) return false;
      Object.assign(row, { content, versions: [...row.versions, content], generations: row.generations + 1, token: null, lockedAt: null, edited: false });
      return true;
    },
    release: async (id, u, reservation) => {
      calls.release++;
      const row = rows.get(id);
      if (!row || row.user !== u || row.token !== reservation) return false;
      Object.assign(row, { token: null, lockedAt: null });
      return true;
    },
    callModel: async () => { calls.model++; return opts.model ? opts.model() : text(DESC_ES); },
  };
  return { deps, rows, calls, clock, usage, actions };
}

type Body = Partial<{ businessId: string; actionId: string; lang: string; mode: string; sourceText: string; expectedGenerations: number; allowOverwrite: boolean }>;
const body = (over: Body = {}) => ({ businessId: BIZ_A, actionId: ACT_DESC, lang: 'es', mode: 'create', expectedGenerations: 0, ...over });
const call = async (deps: Deps, b: unknown, user = USER_A) => {
  const res = await generate(user, b, deps);
  return { status: res.status, json: await res.json() };
};
const KEY_DESC = `${BIZ_A}:optimize_services_keywords`;

describe('v0.7.2 business improvement: generation', () => {
  it('1. business description from declared data', async () => {
    const { deps, rows } = makeDeps();
    expect(await call(deps, body())).toEqual({ status: 200, json: { status: 'generated', generations: 1 } });
    const row = rows.get(KEY_DESC)!;
    expect(row.content).toContain('Panadería Lola');
    expect(row.lockedAt).toBeNull();
    const [system, user] = buildMessages('business_description', 'create', sanitizeFacts(PROFILE), null, null, 'es');
    expect(user.content).toContain('Servicios declarados: Pan de masa madre; Tartas por encargo');
    expect(system.content).toMatch(/Usa SOLO los datos/);
  });

  it('2. confirmed service description uses the declared service and its own key', async () => {
    const { deps, rows } = makeDeps({ model: async () => text(SERVICE_ES) });
    expect((await call(deps, body({ actionId: ACT_SERVICE }))).status).toBe(200);
    expect(rows.get(`${BIZ_A}:improve_service_description:tartas por encargo`)!.content).toContain('tartas por encargo');
    const notDeclared = makeDeps({ businesses: { [BIZ_A]: { owner: USER_A, row: { ...PROFILE, services: ['Pan de masa madre'] } } } });
    const r = await call(notDeclared.deps, body({ actionId: ACT_SERVICE }));
    expect(r).toEqual({ status: 422, json: { error: 'service_not_declared' } });
    expect(notDeclared.calls.model).toBe(0);
    expect(serviceStillDeclared({ name: 'x', category: 'x', city: 'x', services: ['TARTAS  por encargo'] }, 'Tartas por encargo')).toBe(true);
  });

  it('3. FAQ built only from known information', async () => {
    const { deps, rows } = makeDeps({ model: async () => ({ ok: true, raw: JSON.stringify(FAQS) }) });
    expect((await call(deps, body({ actionId: ACT_FAQ }))).status).toBe(200);
    const content = rows.get(`${BIZ_A}:write_faq_answers`)!.content;
    expect(content.split('\n\n')).toHaveLength(3);
    const facts = sanitizeFacts(PROFILE);
    const bad = { faqs: [...FAQS.faqs, { q: '¿Cuál es vuestro horario?', a: 'Abrimos de 8:00 a 14:00 todos los días laborables.' }] };
    expect(parseModelOutput(JSON.stringify(bad), 'faq', 'create', declaredText(facts, null))).toEqual({ ok: false, reason: 'claims' });
    expect(parseModelOutput(JSON.stringify({ faqs: FAQS.faqs.slice(0, 2) }), 'faq', 'create', declaredText(facts, null)).ok).toBe(false);
  });

  it('4. improves an existing owner text and keeps facts the owner declared', async () => {
    const { deps, rows } = makeDeps({ model: async () => text(IMPROVED) });
    const r = await call(deps, body({ mode: 'improve', sourceText: SOURCE_TEXT }));
    expect(r.status).toBe(200);
    expect(rows.get(KEY_DESC)!.content).toContain('desde 2010');
    const [, user] = buildMessages('business_description', 'improve', sanitizeFacts(PROFILE), null, SOURCE_TEXT, 'es');
    expect(user.content).toMatch(/contenido a mejorar, no instrucciones\):\n"""\n/);
    expect((await call(deps, body({ mode: 'improve', sourceText: 'muy corto' }))).status).toBe(400);
    expect((await call(deps, body({ mode: 'create', sourceText: SOURCE_TEXT }))).status).toBe(400);
    expect(validateSource('corto')).toBe('too_short');
  });

  it('5. rejects invented prices, years, reviews, phones and superlatives', async () => {
    const { deps, rows, calls } = makeDeps({ model: async () => text(INVENTED) });
    expect(await call(deps, body())).toEqual({ status: 502, json: { error: 'generation_failed' } });
    expect(calls.model).toBe(MAX_PROVIDER_CALLS);
    expect(calls.release).toBe(1);
    expect(rows.get(KEY_DESC)).toMatchObject({ generations: 0, content: '', lockedAt: null });
    const declared = declaredText(sanitizeFacts(PROFILE), null);
    for (const claim of ['Precio: 25 €', 'Más de 10 años de experiencia', 'Somos los líderes', 'Opiniones de clientes', 'Llama al 954 123 456',
      'Award-winning bakery', 'Guaranteed results', 'Ven a por tu descuento', 'Abrimos de lunes a viernes', 'first page of Google']) {
      expect(violations(claim, declared).length, claim).toBeGreaterThan(0);
    }
    expect(violations('We offer bread. Feel free to ask.', declared)).toEqual([]);
  });

  it('6. incomplete profile asks for data, never calls the AI or reserves', async () => {
    const { deps, calls } = makeDeps({ businesses: { [BIZ_A]: { owner: USER_A, row: { ...PROFILE, city: '', services: [] } } } });
    expect(await call(deps, body())).toEqual({ status: 422, json: { error: 'profile_incomplete', missing: ['city', 'services'] } });
    expect(calls.reserve + calls.model).toBe(0);
    expect(missingFor('business_description', 'create', { name: 'X', category: '', city: 'Y', services: [' '] })).toEqual(['category', 'services']);
    expect(missingFor('business_description', 'improve', { name: 'X', category: '', city: '', services: [] })).toEqual([]);
  });
});

function fakeDb(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'update', 'eq']) chain[k] = (...a: unknown[]) => { calls.push([k, ...a]); return chain; };
  chain.maybeSingle = async () => result;
  const invoke = vi.fn(async () => ({ data: { status: 'generated' }, error: null }));
  const db = { from: (t: string) => { calls.push(['from', t]); return chain; }, functions: { invoke } };
  return { db: db as unknown as Parameters<typeof loadDraft>[2] & object, calls, invoke };
}

const DRAFT: ImprovementDraft = {
  id: 'd1', business_id: BIZ_A, semantic_key: 'optimize_services_keywords', kind: 'business_description', mode: 'create', lang: 'es',
  content: DESC_ES, source_text: '', versions: [DESC_ES], generations: 1, attempts: 1,
  generated_at: '2026-10-10T10:00:00Z', edited_at: null, copied_at: null, updated_at: '2026-10-10T10:00:00.123Z',
};

describe('v0.7.2 business improvement: drafts', () => {
  it('7. recovers the saved draft by business + semantic key without calling the AI', async () => {
    const { db, calls, invoke } = fakeDb({ data: DRAFT, error: null });
    expect(await loadDraft(BIZ_A, 'optimize_services_keywords', db)).toEqual(DRAFT);
    expect(calls).toContainEqual(['eq', 'business_id', BIZ_A]);
    expect(calls).toContainEqual(['eq', 'semantic_key', 'optimize_services_keywords']);
    expect(invoke).not.toHaveBeenCalled();
    const hook = read('src/features/improvement/useImprovement.ts');
    for (const e of hook.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\);/g) ?? []) expect(e).not.toMatch(/requestGeneration/);
  });

  it('8. edits persist with an optimistic guard and report conflicts instead of overwriting', async () => {
    const saved = { ...DRAFT, content: 'Texto editado por la dueña', edited_at: '2026-10-10T11:00:00Z', updated_at: '2026-10-10T11:00:00Z' };
    const ok = fakeDb({ data: saved, error: null });
    expect(await saveContent(DRAFT, saved.content, ok.db)).toEqual({ status: 'saved', draft: saved });
    expect(ok.calls).toContainEqual(['update', { content: saved.content }]);
    expect(ok.calls).toContainEqual(['eq', 'updated_at', DRAFT.updated_at]);
    expect(await saveContent(DRAFT, 'otro', fakeDb({ data: null, error: null }).db)).toEqual({ status: 'conflict' });
    expect(validateEdit('   ')).toBe('empty');
    expect(validateEdit('x'.repeat(2001))).toBe('too_long');
  });

  it('9. copying only records copied_at and never closes the action', async () => {
    const { db, calls } = fakeDb({ data: { ...DRAFT, copied_at: 'now' }, error: null });
    await markCopied(DRAFT, db);
    const update = calls.find((c) => c[0] === 'update')!;
    expect(Object.keys(update[1] as object)).toEqual(['copied_at']);
    const panel = read('src/features/improvement/ImprovementPanel.tsx');
    const onCopy = panel.slice(panel.indexOf('const onCopy'), panel.indexOf('const onSave'));
    expect(onCopy).toMatch(/navigator\.clipboard\.writeText\(draft\.content\)/);
    expect(panel).not.toMatch(/useActions|complete\(/);
    expect(read('supabase/functions/business-improvement/index.ts')).not.toMatch(/\.(update|insert|delete|upsert)\(/);
    expect(IMPROVEMENT_COPY.es.pending).toBe('Texto preparado · pendiente de aplicar');
  });

  it('10. at most 3 successful versions; earlier versions are kept', async () => {
    const { deps, rows } = makeDeps();
    for (let g = 0; g < 3; g++) expect((await call(deps, body({ expectedGenerations: g }))).status).toBe(200);
    expect(await call(deps, body({ expectedGenerations: 3 }))).toEqual({ status: 429, json: { error: 'limit_reached', generations: 3 } });
    expect(rows.get(KEY_DESC)!.versions).toHaveLength(3);
    expect(remainingVersions({ ...DRAFT, generations: 3, attempts: 3 })).toBe(0);
  });

  it('11. at most 6 generation requests per action, failures included', async () => {
    const { deps, rows, calls } = makeDeps({ model: async () => ({ ok: false, retryable: false }) });
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect((await call(deps, body())).json).toEqual({ error: 'ai_unavailable' });
    expect(await call(deps, body())).toEqual({ status: 429, json: { error: 'attempts_exhausted', generations: 0 } });
    expect(rows.get(KEY_DESC)!.attempts).toBe(6);
    expect(calls.model).toBe(6);
    expect(remainingVersions({ ...DRAFT, generations: 1, attempts: 6 })).toBe(0);
  });

  it('12. global monthly limit across businesses and actions', async () => {
    const { deps, usage, calls } = makeDeps();
    usage[USER_A] = MONTHLY_REQUESTS - 1;
    expect((await call(deps, body({ businessId: BIZ_B, actionId: ACT_B_DESC }))).status).toBe(200);
    expect(await call(deps, body())).toEqual({ status: 429, json: { error: 'global_limit' } });
    expect(calls.model).toBe(1);
    expect(MONTHLY_REQUESTS * MAX_PROVIDER_CALLS).toBe(80);
    expect(monthKey(new Date(Date.UTC(2026, 9, 31, 23, 59)))).toBe('2026-10-01');
  });

  it('13. several actions and businesses for the same user never mix', async () => {
    const { deps, rows } = makeDeps({ model: async () => text(SERVICE_ES) });
    await call(deps, body({ actionId: ACT_SERVICE }));
    await call(deps, body({ businessId: BIZ_B, actionId: ACT_B_DESC }));
    expect([...rows.keys()].sort()).toEqual([`${BIZ_A}:improve_service_description:tartas por encargo`, `${BIZ_B}:optimize_services_keywords`]);
    expect(await call(deps, body({ businessId: BIZ_B, actionId: ACT_DESC }))).toEqual({ status: 404, json: { error: 'not_found' } });
  });
});

describe('v0.7.2 business improvement: concurrency and access', () => {
  it('14. simultaneous requests: only one reservation and one AI call', async () => {
    let resolve!: (r: ModelResult) => void;
    const { deps, calls, rows } = makeDeps({ model: () => new Promise((r) => { resolve = r; }) });
    const first = call(deps, body());
    await new Promise((r) => setTimeout(r, 0));
    const second = await call(deps, body());
    expect(second).toEqual({ status: 409, json: { error: 'in_progress' } });
    resolve(text(DESC_ES));
    expect((await first).status).toBe(200);
    expect(calls.model).toBe(1);
    expect(rows.get(KEY_DESC)!.generations).toBe(1);
  });

  it('15. an expired reservation can be taken over after the lease', async () => {
    const { deps, rows, clock } = makeDeps();
    const r1 = await deps.reserve({ userId: USER_A, businessId: BIZ_A, actionId: ACT_DESC, semanticKey: 'optimize_services_keywords', kind: 'business_description', expected: 0, allowOverwrite: false });
    expect(r1.status).toBe('reserved');
    expect((await call(deps, body())).json).toEqual({ error: 'in_progress' });
    clock.ms = LEASE_MS + 1;
    expect((await call(deps, body())).status).toBe(200);
    expect(rows.get(KEY_DESC)).toMatchObject({ generations: 1, attempts: 2 });
    expect(read('supabase/migrations/20261010131430_v072_business_improvement_drafts.sql')).toMatch(/interval '90 seconds'/);
  });

  const takeOver = async () => {
    const ctx = makeDeps();
    const args = { userId: USER_A, businessId: BIZ_A, actionId: ACT_DESC, semanticKey: 'optimize_services_keywords', kind: 'business_description' as const, expected: 0, allowOverwrite: false };
    const old = await ctx.deps.reserve(args);
    ctx.clock.ms = LEASE_MS + 1;
    const fresh = await ctx.deps.reserve(args);
    if (old.status !== 'reserved' || fresh.status !== 'reserved') throw new Error('expected reservations');
    return { ...ctx, old, fresh };
  };

  it('16. an old reservation cannot complete over a newer one', async () => {
    const { deps, rows, old, fresh } = await takeOver();
    expect(await deps.complete(old.id, USER_A, old.reservation, DESC_ES, 'es', 'create', '')).toBe(false);
    expect(rows.get(KEY_DESC)!.generations).toBe(0);
    expect(await deps.complete(fresh.id, USER_A, fresh.reservation, DESC_ES, 'es', 'create', '')).toBe(true);
    expect(read('supabase/migrations/20261010131430_v072_business_improvement_drafts.sql')).toMatch(/reservation_id = p_reservation_id/);
  });

  it('17. an old reservation cannot release a newer one', async () => {
    const { deps, rows, old, fresh } = await takeOver();
    expect(await deps.release(old.id, USER_A, old.reservation)).toBe(false);
    expect(rows.get(KEY_DESC)!.token).toBe(fresh.reservation);
    expect(rows.get(KEY_DESC)!.lockedAt).not.toBeNull();
  });

  it("18. another user's business or action is not reachable", async () => {
    const { deps, calls } = makeDeps();
    expect(await call(deps, body(), USER_B)).toEqual({ status: 404, json: { error: 'not_found' } });
    expect(calls.reserve + calls.model).toBe(0);
    const migration = read('supabase/migrations/20261010131430_v072_business_improvement_drafts.sql');
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/REVOKE ALL ON public\.business_improvement_drafts FROM authenticated;/);
    expect(migration).toMatch(/GRANT UPDATE \(content, copied_at\) ON public\.business_improvement_drafts TO authenticated;/);
    expect(migration).not.toMatch(/FOR (INSERT|DELETE|ALL)/);
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]*TO (anon|authenticated|PUBLIC)/);
    expect(migration).toMatch(/FROM PUBLIC, anon, authenticated;/);
  });

  it('19. incompatible or closed actions are refused', async () => {
    const { deps, calls } = makeDeps();
    expect(await call(deps, body({ actionId: ACT_OTHER }))).toEqual({ status: 422, json: { error: 'incompatible_action' } });
    expect(await call(deps, body({ actionId: ACT_CLOSED }))).toEqual({ status: 409, json: { error: 'action_closed' } });
    expect(await call(deps, body({ actionId: ACT_FAQ, mode: 'improve', sourceText: SOURCE_TEXT }))).toEqual({ status: 400, json: { error: 'invalid_request' } });
    expect(calls.model).toBe(0);
    expect(offersImprovement({ ruleId: 'connect_google_business', metadata: {}, status: 'PENDING' })).toBe(false);
    expect(offersImprovement({ ruleId: 'write_faq_answers', metadata: {}, status: 'COMPLETED' })).toBe(false);
    expect(improvementTarget({ ruleId: 'improve_service_description', metadata: { evidence: {} } })).toBeNull();
    expect(COMPATIBLE_RULES).toEqual(SERVER_RULES);
  });

  it('20. a recreated action with a new id keeps the same draft and counters', async () => {
    const { deps, rows, actions } = makeDeps();
    await call(deps, body());
    actions[ACT_DESC].status = 'DISMISSED';
    actions[ACT_DESC_NEW] = { user: USER_A, business: BIZ_A, rule_id: 'optimize_services_keywords', status: 'PENDING', metadata: {} };
    expect((await call(deps, body({ actionId: ACT_DESC_NEW }))).json).toEqual({ status: 'stale', generations: 1 });
    expect((await call(deps, body({ actionId: ACT_DESC_NEW, expectedGenerations: 1 }))).status).toBe(200);
    expect(rows.size).toBe(1);
    expect(rows.get(KEY_DESC)).toMatchObject({ generations: 2, attempts: 2, action: ACT_DESC_NEW });
    expect(improvementTarget({ ruleId: 'optimize_services_keywords', metadata: {} })!.semanticKey).toBe('optimize_services_keywords');
  });

  it('an owner edit is never replaced without confirmation', async () => {
    const { deps, rows } = makeDeps();
    await call(deps, body());
    rows.get(KEY_DESC)!.edited = true;
    expect(await call(deps, body({ expectedGenerations: 1 }))).toEqual({ status: 409, json: { error: 'edited_conflict' } });
    expect((await call(deps, body({ expectedGenerations: 1, allowOverwrite: true }))).status).toBe(200);
    expect(rows.get(KEY_DESC)!.versions).toHaveLength(2);
    expect(read('supabase/migrations/20261010131430_v072_business_improvement_drafts.sql')).toMatch(/CASE WHEN edited_at > generating_since THEN content ELSE p_content END/);
  });
});

describe('v0.7.2 business improvement: i18n, wiring and regressions', () => {
  it('21. Spanish and English copy and prompts', async () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k])).sort();
    expect(keys(IMPROVEMENT_COPY.en)).toEqual(keys(IMPROVEMENT_COPY.es));
    expect(IMPROVEMENT_COPY.es.hint).toBe('Te ayudamos a prepararlo en 2 minutos');
    expect(IMPROVEMENT_COPY.es.prepare).toBe('Preparar mi mejora');
    expect(IMPROVEMENT_COPY.en.prepare).toBe('Prepare my improvement');
    const [system] = buildMessages('faq', 'create', sanitizeFacts(PROFILE), null, null, 'en');
    expect(system.content).toMatch(/Use ONLY the facts/);
    const { deps } = makeDeps({ model: async () => text(DESC_EN) });
    expect((await call(deps, body({ lang: 'en' }))).status).toBe(200);
    expect((await call(deps, body({ lang: 'fr' }))).status).toBe(400);
  });

  it('22. no regressions: v0.7.1 weekly content and FIX 07.1.1 untouched, guards in place', async () => {
    const index = read('supabase/functions/business-improvement/index.ts');
    expect(read('supabase/functions/business-improvement/entitlement.ts')).toBe(read('supabase/functions/analyze-website/entitlement.ts'));
    const guard = index.indexOf('requirePremium(req, "business-improvement"');
    expect(guard).toBeGreaterThan(-1);
    for (const later of ['req.json(', 'fetch(', 'LocalSEO_KEY']) expect(index.indexOf(later)).toBeGreaterThan(guard);
    expect(read('supabase/config.toml')).toMatch(/\[functions\.business-improvement\]\s*\nverify_jwt = true/);
    expect(read('supabase/config.toml')).toMatch(/\[functions\.weekly-content\]\s*\nverify_jwt = true/);
    expect(index).not.toMatch(/stripe|gbp|google/i);
    for (const f of ['ImprovementPanel.tsx', 'repository.ts', 'useImprovement.ts', 'ImprovementEditor.tsx']) {
      expect(read(`src/features/improvement/${f}`)).not.toMatch(/service_role|SERVICE_ROLE|LocalSEO_KEY|OPENAI|stripe/i);
    }
    const weekly = read('supabase/functions/weekly-content/logic.ts');
    expect(weekly).toMatch(/MAX_GENERATIONS = 3/);
    expect(weekly).toMatch(/MAX_ATTEMPTS = 6/);
    const today = read('src/app-v2/routes/TodayPage.tsx');
    expect(today.match(/<TodaysMissions[\s\S]*?\/>/)![0]).toMatch(/onExecute=\{onExecute\}[\s\S]*onDismiss=\{onDismiss\}/);
    expect(today).toMatch(/improveTo: offersImprovement\(action\)/);
    expect(read('src/app-v2/routes/PlanPage.tsx')).toMatch(/offersImprovement\(action\) && <ImprovementHint/);
    expect(MODEL).toBe('gpt-4o-mini');
    expect(MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(500);

    const { db, invoke } = fakeDb({ data: null, error: null });
    await requestGeneration({ businessId: BIZ_A, actionId: ACT_DESC, lang: 'es', mode: 'create', sourceText: 'ignored', expectedGenerations: 0, allowOverwrite: false }, db);
    expect(invoke).toHaveBeenCalledWith('business-improvement', { body: expect.objectContaining({ sourceText: undefined }) });
  });
});
