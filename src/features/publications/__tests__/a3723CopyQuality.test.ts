import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { generate, type ClaimStatus, type ModelRequest, type ModelResult, type ProposalDeps, type PublicationRow } from '../../../../supabase/functions/publication-proposals/handler.ts';
import { buildEnvelope, buildFacts, parseVisual } from '../../../../supabase/functions/publication-proposals/context.ts';
import { isClaim, parseProposals, reviewSet } from '../../../../supabase/functions/publication-proposals/safety.ts';
import { isNarrated } from '../../../../supabase/functions/publication-proposals/quality.ts';
import { normalizeImage } from '../../../../supabase/functions/publication-proposals/normalize.ts';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PUB = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const BIZ = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
const REQ = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';

const norm = normalizeImage(new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'photo-exif-gps.jpg'))), 'image/jpeg');
if (!norm.ok) throw new Error('fixture did not normalize');
const NORMALIZED = norm.bytes;

const GOPIK = { name: 'Gopik.Digital', category: 'Marketing', city: 'San Pedro de Alcántara', services: [], target_audience: '', primary_goal: '' };

const o = (label: string) => ({ label, certainty: 'observed' });
const visual = (subject: string, elements: string[], setting: string | null, fit: string) => ({
  usable: true, insufficient_reason: null, primary_subject: o(subject), elements: elements.map(o),
  setting: setting ? o(setting) : null, visible_text: [], people_visible: true, not_observed: [], unsafe_to_infer: [], business_fit: fit,
});
const DESK = (fit = 'plausibly_related') => visual('persona trabajando en un escritorio', ['ordenador portátil', 'cuaderno', 'pluma', 'taza', 'libros'], 'espacio de trabajo', fit);
const DESK_EN = visual('person working at a desk', ['laptop', 'notebook', 'pen', 'mug', 'books'], 'workspace', 'plausibly_related');

const set = (p: [string, string][]) => ({ proposals: (['direct', 'close', 'professional'] as const).map((role, i) => ({ role, body: p[i][0], cta: p[i][1] })) });

// The real CASE 2 output pattern: every proposal narrates the photo, then Gopik.Digital -> marketing -> contact.
const CASE2_OLD = set([
  ['En la imagen se aprecia un ordenador portátil, un cuaderno, una pluma y una taza sobre la mesa. Gopik.Digital trabaja el marketing. Contacta con nosotros.', 'Contacta para más información'],
  ['En la foto vemos un ordenador portátil y unos libros junto a un cuaderno. Gopik.Digital trabaja el marketing. Escríbenos.', 'Escríbenos para más información'],
  ['En la imagen se aprecia un espacio de trabajo con un cuaderno y un ordenador portátil. Gopik.Digital trabaja el marketing.', 'Pide más información'],
]);

const CASE2_GOOD = set([
  ['Lo que cuentas en redes también habla de tu negocio cuando no estás delante. Gopik.Digital se dedica al marketing: si quieres revisar cómo te presentas, escríbenos.', 'Escríbenos y lo revisamos'],
  ['¿Cuántas veces has dejado para mañana actualizar tus redes? Con el día a día pendiente, es algo muy habitual.', 'Cuéntanos qué se te resiste'],
  ['Una presencia digital coherente facilita que quien te busca encuentre información clara. En comunicación, la constancia suele pesar más que una campaña puntual.', 'Consulta tus dudas'],
]);

const CASE2_GOOD_EN = set([
  ['What you share online keeps speaking for your business when you are not there. Gopik.Digital works in marketing: if you want to check how you come across, write to us.', 'Write to us'],
  ['How often do you leave updating your social profiles for tomorrow? With everything else going on, it is very common.', 'Tell us what you find hardest'],
  ['A consistent online presence makes it easier for people to find clear information about a business. In communication, steady effort tends to matter more than a single campaign.', 'Ask us a question'],
]);

const ok = (v: unknown): ModelResult => ({ ok: true, raw: JSON.stringify(v) });

function setup(business: Record<string, unknown>, list: ModelResult[]) {
  const requests: ModelRequest[] = [];
  const models = [...list];
  const pub: PublicationRow = { id: PUB, businessId: BIZ, imagePath: `${USER}/${BIZ}/${PUB}/x.jpg`, imageMime: 'image/jpeg', imageBytes: NORMALIZED.length, imageNormalized: true };
  const deps = {
    loadPublication: vi.fn(async () => pub),
    loadBusiness: vi.fn(async () => business),
    claim: vi.fn(async (): Promise<ClaimStatus> => 'claimed'),
    release: vi.fn(async () => true),
    complete: vi.fn(async () => ({ generationId: 'g1', generatedAt: '2026-10-25T10:00:00Z', generationsUsed: 1 })),
    downloadImage: vi.fn(async () => NORMALIZED),
    reserve: vi.fn(async () => 'reserved' as const),
    settle: vi.fn(async () => true),
    callModel: vi.fn(async (r: ModelRequest) => {
      requests.push(r);
      const next = models.shift();
      if (!next) throw new Error('unexpected model call');
      return next;
    }),
    log: vi.fn(),
  } satisfies ProposalDeps;
  return { deps, requests };
}

async function run(models: ModelResult[], lang: 'es' | 'en' = 'es', business: Record<string, unknown> = GOPIK) {
  const s = setup(business, models);
  const res = await generate(USER, JSON.stringify({ publication_id: PUB, request_id: REQ, lang }), s.deps);
  const text = await res.text();
  return { ...s, res, text, json: JSON.parse(text) };
}

const outcome = (deps: ProposalDeps) => (deps.settle as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
const envFor = (business: Record<string, unknown>, v: unknown, lang: 'es' | 'en' = 'es') =>
  buildEnvelope(lang, buildFacts(business)!, parseVisual(JSON.stringify(v))!, isClaim);
const review = (v: unknown, env = envFor(GOPIK, DESK())) => reviewSet(parseProposals(JSON.stringify(v))!, env);
const has = (list: string[], id: string) => list.some((r) => r === id || r.startsWith(`${id}:`));

describe('A3.7.2.3 CASE 2: marketing business + desk photo', () => {
  it('treats the photo as thematic inspiration, not a mismatch', () => {
    expect(envFor(GOPIK, DESK()).image_use).toBe('thematic_inspiration');
  });

  it('the old all-narrated output is factually safe but fails copy quality', () => {
    const r = review(CASE2_OLD);
    expect(r.safety).toEqual([]);
    for (const id of ['image_narration', 'object_enumeration', 'repeated_objects', 'name_repetition', 'generic_cta', 'same_message']) expect(has(r.quality, id)).toBe(true);
  });

  it('accepts a differentiated set in Spanish and English', () => {
    expect(review(CASE2_GOOD)).toEqual({ safety: [], quality: [] });
    expect(review(CASE2_GOOD_EN, envFor(GOPIK, DESK_EN, 'en'))).toEqual({ safety: [], quality: [] });
  });

  it('repairs the old pattern once and stores three proposals', async () => {
    const { res, json, deps, requests } = await run([ok(DESK()), ok(CASE2_OLD), ok(CASE2_GOOD)]);
    expect(res.status).toBe(200);
    expect(json.publication.status).toBe('proposals_ready');
    expect(json.proposals).toHaveLength(3);
    expect(requests.map((r) => r.stage)).toEqual(['vision', 'writer', 'writer']);
    const repair = JSON.stringify(requests[2].messages);
    expect(repair).toContain('image_narration');
    expect(repair).toMatch(/never permits new facts/);
    expect(deps.complete).toHaveBeenCalledTimes(1);
  });

  it('fails closed with a copy-quality code when the repair is still poor, storing nothing', async () => {
    const { res, json, deps, requests, text } = await run([ok(DESK()), ok(CASE2_OLD), ok(CASE2_OLD)]);
    expect(res.status).toBe(422);
    expect(json).toEqual({ ok: false, code: 'PROPOSALS_NOT_DISTINCT', stage: 'copy_quality' });
    expect(requests).toHaveLength(3);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(outcome(deps)).toBe('consumed');
    expect(deps.release).toHaveBeenCalledWith(PUB, USER, REQ);
    expect(text).not.toContain('ordenador');
    const logged = JSON.stringify((deps.log as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain('image_narration');
    expect(logged).not.toContain('ordenador');
    expect(logged).not.toContain('Gopik');
  });

  it('a repair that improves style but invents a relationship or outcome is still rejected for safety', async () => {
    const unsafe = set([
      ['Nuestro ordenador portátil está listo para tu proyecto. Gopik.Digital se dedica al marketing: escríbenos.', 'Escríbenos'],
      CASE2_GOOD.proposals[1] && [CASE2_GOOD.proposals[1].body, CASE2_GOOD.proposals[1].cta],
      ['Con una buena estrategia conseguirás más clientes en poco tiempo.', 'Consulta tus dudas'],
    ] as [string, string][]);
    expect(has(review(unsafe).safety, 'promised_outcome')).toBe(true);
    const { json, deps } = await run([ok(DESK()), ok(CASE2_OLD), ok(unsafe)]);
    expect(json).toEqual({ ok: false, code: 'GENERATION_UNSAFE', stage: 'output_validation' });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('CASE 1 (clothing store photo) still stops at the mismatch with no writer call', async () => {
    const clothing = visual('tienda de ropa', ['camisetas', 'abrigo rojo'], 'interior de tienda de ropa', 'material_mismatch');
    const { json, requests, deps } = await run([ok(clothing)]);
    expect(json.code).toBe('BUSINESS_IMAGE_MISMATCH');
    expect(requests.map((r) => r.stage)).toEqual(['vision']);
    expect(deps.complete).not.toHaveBeenCalled();
  });
});

describe('A3.7.2.3 copy quality rules', () => {
  const env = envFor(GOPIK, DESK());
  const swap = (i: number, body: string, cta?: string) => {
    const p = CASE2_GOOD.proposals.map((x) => ({ ...x }));
    p[i] = { ...p[i], body, cta: cta ?? p[i].cta };
    return { proposals: p };
  };

  it('allows one justified reference to the photo but not systematic narration', () => {
    expect(isNarrated('En la imagen se aprecia un cuaderno abierto.')).toBe(true);
    expect(isNarrated('This photo shows a desk.')).toBe(true);
    expect(isNarrated('Un cuaderno abierto también es una forma de planificar.')).toBe(false);
    expect(review(swap(0, 'En la imagen se aprecia un cuaderno abierto: planificar también es comunicar. Gopik.Digital se dedica al marketing.'), env).quality).toEqual([]);
    const twice = swap(2, 'En la foto vemos una taza junto al cuaderno. Ordenar ideas antes de publicar ayuda a comunicar con claridad.');
    expect(review({ proposals: [swap(0, 'En la imagen se aprecia un cuaderno abierto: planificar también es comunicar.').proposals[0], ...twice.proposals.slice(1)] }, env).quality).toContain('image_narration');
  });

  it('flags enumeration of photo items in one proposal', () => {
    const r = review(swap(2, 'Un ordenador portátil, un cuaderno, una pluma y una taza bastan para empezar a ordenar ideas.'), env);
    expect(r.quality).toContain('object_enumeration:3');
  });

  it('flags duplicated, similar and generic CTAs', () => {
    expect(review(swap(2, CASE2_GOOD.proposals[2].body, 'Escríbenos y lo revisamos'), env).quality).toContain('same_cta:1-3');
    const generic = { proposals: CASE2_GOOD.proposals.map((p, i) => ({ ...p, cta: i === 1 ? p.cta : ['Pide más información', '', 'Escríbenos para saber más'][i] })) };
    expect(review(generic, env).quality).toContain('generic_cta');
  });

  it('flags identical openings and near-duplicate bodies', () => {
    const b = CASE2_GOOD.proposals[0].body;
    const r = review(swap(2, b.replace('escríbenos', 'consúltanos')), env);
    expect(has(r.quality, 'same_opening')).toBe(true);
    expect(has(r.quality, 'too_similar')).toBe(true);
  });

  it('allows the name and city once but not in every proposal', () => {
    const all = { proposals: CASE2_GOOD.proposals.map((p) => ({ ...p, body: `${p.body} Gopik.Digital, San Pedro de Alcántara.` })) };
    const r = review(all, env);
    expect(r.quality).toContain('name_repetition');
    expect(r.quality).toContain('location_repetition');
    expect(review(swap(0, `${CASE2_GOOD.proposals[0].body} Estamos en San Pedro de Alcántara.`), env).quality).toEqual([]);
  });

  it('requires the close proposal to sound conversational', () => {
    expect(review(swap(1, 'Actualizar las redes es una tarea habitual. Muchas empresas lo dejan para más adelante.', 'Escribe a la agencia'), env).quality).toContain('close_not_conversational:2');
  });

  it('rejects invented statistics and promised outcomes in ES and EN', () => {
    const es = review(swap(2, 'Los estudios demuestran que publicar a menudo funciona. Aumenta tus ventas con una estrategia clara.'), env).safety;
    expect(has(es, 'statistic')).toBe(true);
    expect(has(es, 'promised_outcome')).toBe(true);
    const enEnv = envFor(GOPIK, DESK_EN, 'en');
    const p = CASE2_GOOD_EN.proposals.map((x) => ({ ...x }));
    p[2] = { ...p[2], body: 'Studies show that most customers check a business online first. Boost your sales and rank higher with a clear plan.' };
    const en = review({ proposals: p }, enEnv).safety;
    expect(has(en, 'statistic')).toBe(true);
    expect(has(en, 'promised_outcome')).toBe(true);
  });
});

describe('A3.7.2.3 writer instructions', () => {
  it('gives three strategies, the image role and the no-narration rule without a scripted photo sentence', async () => {
    const { requests } = await run([ok(DESK()), ok(CASE2_GOOD)]);
    const system = String(requests[1].messages[0].content);
    for (const angle of ['business_action', 'relatable_conversation', 'useful_context']) expect(system).toContain(angle);
    expect(system).toContain('IMAGE USE: thematic_inspiration');
    expect(system).toMatch(/not a checklist/);
    expect(system).toMatch(/Never enumerate the objects in the photo/);
    expect(system).not.toMatch(/(Describe|Use|Start with)[^.]*En la imagen se aprecia/);
    expect(system).toMatch(/Do not open with a description of the photo \('En la imagen se aprecia/);
    expect(JSON.stringify(requests[1].messages[1].content)).toContain('thematic_inspiration');
  });
});

describe('A3.7.2.3 other business types: abstraction never creates relationships', () => {
  const cases: { name: string; business: Record<string, unknown>; v: unknown; use: string; bad: string; issue: string }[] = [
    { name: 'restaurant + food', business: { name: 'Casa Marta', category: 'Restaurante', city: 'Málaga', services: ['Menú del día'], target_audience: '', primary_goal: '' },
      v: visual('plato de paella', ['paella', 'limón'], 'mesa de restaurante', 'consistent'), use: 'direct_subject', bad: 'Ya disponible nuestra paella con limón para comer hoy en el centro.', issue: 'availability' },
    { name: 'salon + beauty', business: { name: 'Salón Brisa', category: 'Peluquería', city: 'Cádiz', services: ['Corte', 'Color'], target_audience: '', primary_goal: '' },
      v: visual('melena con mechas', ['secador', 'cepillo'], 'interior de peluquería', 'consistent'), use: 'direct_subject', bad: 'Descubre nuestro secador nuevo y ven a probarlo en el salón.', issue: 'novelty' },
    { name: 'real estate + interior', business: { name: 'Inmobiliaria Costa', category: 'Inmobiliaria', city: 'Marbella', services: ['Venta de viviendas'], target_audience: '', primary_goal: '' },
      v: visual('salón luminoso', ['sofá gris', 'ventanal'], 'interior de vivienda', 'plausibly_related'), use: 'thematic_inspiration', bad: 'Vendemos este salón luminoso en Marbella, con un sofá gris incluido.', issue: 'unsupported' },
    { name: 'retailer + store', business: { name: 'Moda Lía', category: 'Tienda de ropa', city: 'Marbella', services: ['Ropa de mujer'], target_audience: '', primary_goal: '' },
      v: visual('abrigo rojo', ['bolso rojo'], 'interior de tienda', 'unknown'), use: 'contextual_support', bad: 'Tenemos este abrigo rojo en Marbella para que lo veas en persona.', issue: 'unsupported' },
    { name: 'trade + work', business: { name: 'Reformas Ruiz', category: 'Reformas', city: 'Granada', services: ['Alicatado'], target_audience: '', primary_goal: '' },
      v: visual('baño reformado', ['azulejos blancos', 'mampara'], 'baño', 'consistent'), use: 'direct_subject', bad: 'Nuestra mampara está disponible para instalar en tu baño esta semana.', issue: 'availability' },
  ];

  for (const c of cases) {
    it(`${c.name}: image role ${c.use}; ownership/availability claims are still flagged`, () => {
      const env = envFor(c.business, c.v);
      expect(env.image_use).toBe(c.use);
      const p = CASE2_GOOD.proposals.map((x) => ({ ...x }));
      p[0] = { ...p[0], body: c.bad };
      const safety = reviewSet(parseProposals(JSON.stringify({ proposals: p }))!, env).safety;
      expect(safety.filter((s) => s.endsWith(':1')), JSON.stringify(safety)).not.toEqual([]);
      expect(safety.filter((s) => s.endsWith(':1')).some((s) => s.includes(c.issue)), JSON.stringify(safety)).toBe(true);
    });
  }
});
