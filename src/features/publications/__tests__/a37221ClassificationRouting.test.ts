import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  generate,
  type ModelRequest,
  type ModelResult,
  type ProposalDeps,
  type PublicationRow,
} from '../../../../supabase/functions/publication-proposals/handler.ts';
import { buildEnvelope, buildFacts, insufficiency, parseVisual, visualFailure } from '../../../../supabase/functions/publication-proposals/context.ts';
import { isClaim, safetyIssues } from '../../../../supabase/functions/publication-proposals/safety.ts';
import { normalizeImage } from '../../../../supabase/functions/publication-proposals/normalize.ts';
import { generateProposals } from '../repository';
import { ERROR_TEXT } from '../validation/copy';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PUB = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const BIZ = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
const REQ = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';

const norm = normalizeImage(new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'photo-exif-gps.jpg'))), 'image/jpeg');
if (!norm.ok) throw new Error('fixture did not normalize');
const NORMALIZED = norm.bytes;

const GOPIK = { name: 'Gopik.Digital', category: 'Marketing', city: 'San Pedro de Alcántara', services: [], target_audience: '', primary_goal: '' };
const RETAILER = { name: 'Moda Lía', category: 'Tienda de ropa', city: 'Marbella', services: ['Ropa de mujer'], target_audience: '', primary_goal: '' };
const REALTY = { name: 'Inmobiliaria Costa', category: 'Inmobiliaria', city: 'Marbella', services: ['Venta de viviendas'], target_audience: '', primary_goal: '' };
const SPARSE = { name: 'Negocio Ana', category: '', city: 'Sevilla', services: [], target_audience: '', primary_goal: '' };

const o = (label: string) => ({ label, certainty: 'observed' });
const u = (label: string) => ({ label, certainty: 'uncertain' });
type Item = { label: string; certainty: string } | null;
const vision = (p: Partial<Record<string, unknown>> & { primary_subject?: Item; setting?: Item }) => ({
  usable: true, insufficient_reason: null, primary_subject: o('tienda de ropa'),
  elements: ['camisetas', 'abrigo rojo', 'bolso rojo', 'pantalones'].map(o),
  setting: o('interior de tienda de ropa'), visible_text: [], people_visible: false, not_observed: [], unsafe_to_infer: [],
  business_fit: 'material_mismatch', ...p,
});

const SAFE_ES = {
  proposals: [
    { role: 'direct', body: 'En la imagen se aprecia un interior con prendas expuestas y un abrigo rojo en primer plano. Escríbenos si quieres saber más.', cta: 'Contacta con el negocio para obtener más información.' },
    { role: 'close', body: 'Hay fotos que invitan a pararse un momento: unas camisetas bien colocadas y mucha luz. ¿Qué te transmite esta imagen?', cta: 'Cuéntanos qué te parece' },
    { role: 'professional', body: 'La fotografía muestra un bolso rojo junto a unos pantalones, con una composición limpia y ordenada en el interior.', cta: 'Escríbenos con tus dudas' },
  ],
};

const ok = (v: unknown): ModelResult => ({ ok: true, raw: JSON.stringify(v) });

function setup(business: Record<string, unknown>, models: ModelResult[]) {
  const requests: ModelRequest[] = [];
  const queue = [...models];
  const pub: PublicationRow = { id: PUB, businessId: BIZ, imagePath: `${USER}/${BIZ}/${PUB}/x.jpg`, imageMime: 'image/jpeg', imageBytes: NORMALIZED.length, imageNormalized: true };
  const deps = {
    loadPublication: vi.fn(async () => pub),
    loadBusiness: vi.fn(async () => business),
    claim: vi.fn(async () => 'claimed' as const),
    release: vi.fn(async () => true),
    complete: vi.fn(async () => ({ generationId: 'g1', generatedAt: '2026-10-26T10:00:00Z', generationsUsed: 1 })),
    downloadImage: vi.fn(async () => NORMALIZED),
    reserve: vi.fn(async () => 'reserved' as const),
    settle: vi.fn(async () => true),
    callModel: vi.fn(async (r: ModelRequest) => {
      requests.push(r);
      const next = queue.shift();
      if (!next) throw new Error('unexpected model call');
      return next;
    }),
    log: vi.fn(),
  } satisfies ProposalDeps;
  return { deps, requests };
}

async function run(business: Record<string, unknown>, models: ModelResult[], lang: 'es' | 'en' = 'es') {
  const s = setup(business, models);
  const res = await generate(USER, JSON.stringify({ publication_id: PUB, request_id: REQ, lang }), s.deps);
  const text = await res.text();
  const pipeline = s.deps.log.mock.calls.find((c) => c[0] === 'pipeline')?.[1] as Record<string, unknown> | undefined;
  return { ...s, res, text, json: JSON.parse(text), pipeline };
}

const settled = (deps: ProposalDeps) => (deps.settle as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];

describe('A3.7.2.2.1 CASE 1 routing: a clear photo of a different business is a mismatch, never "not understandable"', () => {
  const variants: [string, Record<string, unknown>][] = [
    ['clean vision answer', {}],
    ['model also set usable=false for the relationship', { usable: false, insufficient_reason: 'no_clear_subject' }],
    ['model set usable=false with reason other', { usable: false, insufficient_reason: 'other' }],
    ['primary subject marked uncertain', { primary_subject: u('tienda de ropa') }],
    ['primary subject label filtered as a claim', { primary_subject: o('ropa a la venta') }],
    ['primary subject label filtered as novelty', { primary_subject: o('nueva colección de ropa') }],
    ['no primary subject, clear setting', { primary_subject: null }],
  ];
  for (const [name, patch] of variants) {
    it(`${name} -> BUSINESS_IMAGE_MISMATCH, vision only, nothing stored`, async () => {
      const { res, json, text, deps, requests, pipeline } = await run(GOPIK, [ok(vision(patch))]);
      expect(res.status).toBe(422);
      expect(json.code).toBe('BUSINESS_IMAGE_MISMATCH');
      expect(json.stage).toBe('business_consistency');
      expect(json.mismatch.businessSummary).toBe('Gopik.Digital (Marketing)');
      expect(requests.map((r) => r.stage)).toEqual(['vision']);
      expect(deps.complete).not.toHaveBeenCalled();
      expect(settled(deps)).toBe('consumed');
      expect(deps.release).toHaveBeenCalledTimes(1);
      expect(pipeline).toMatchObject({ result: 'mismatch', stage: 'business_consistency', consistency: 'MATERIAL_MISMATCH', calls: 1 });
      for (const banned of ['nuestra tienda', 'proposals', 'IMAGE_NOT_UNDERSTANDABLE', 'ropa a la venta']) expect(text).not.toContain(banned);
    });
  }

  it('the English generation routes the same way', async () => {
    const { json } = await run(GOPIK, [ok(vision({ primary_subject: o('clothing store'), setting: o('clothing store interior'), elements: [o('red coat')], usable: false, insufficient_reason: 'other' }))], 'en');
    expect(json.code).toBe('BUSINESS_IMAGE_MISMATCH');
    expect(json.mismatch.message).toMatch(/^The image appears to show “clothing store interior”/);
  });

  it('the vision instructions keep image usability separate from business fit', async () => {
    const { requests } = await run(GOPIK, [ok(vision({}))]);
    expect(String(requests[0].messages[0].content)).toMatch(/usable describes ONLY whether the photo itself can be understood\. A clear photo of a different business or activity is usable=true/);
  });

  it('a filtered subject is withheld from the writer and never becomes a fact', () => {
    const env = buildEnvelope('es', buildFacts(RETAILER)!, parseVisual(JSON.stringify(vision({ primary_subject: o('ropa a la venta'), business_fit: 'consistent' })))!, isClaim);
    expect(env.image.subject).toBe('interior de tienda de ropa');
    expect(JSON.stringify(env)).not.toContain('a la venta');
    expect(env.withheld).toBeGreaterThanOrEqual(1);
  });
});

describe('A3.7.2.2.1 genuinely insufficient images stay IMAGE_NOT_UNDERSTANDABLE', () => {
  const bad: [string, Record<string, unknown>, string][] = [
    ['nearly blank image', { usable: false, insufficient_reason: 'blank_or_dark', primary_subject: null, setting: null, elements: [] }, 'blank_or_dark'],
    ['blurry image even with guessed labels', { usable: false, insufficient_reason: 'blurry' }, 'blurry'],
    ['unsafe content', { usable: false, insufficient_reason: 'unsafe_content' }, 'unsafe_content'],
    ['no discernible subject', { usable: false, insufficient_reason: 'no_clear_subject', primary_subject: u('algo'), setting: null, elements: [u('forma')] }, 'no_clear_subject'],
    ['usable but nothing observed', { primary_subject: u('algo'), setting: null, elements: [] }, 'no_clear_subject'],
  ];
  for (const [name, patch, reason] of bad) {
    it(name, async () => {
      const { json, requests, deps, pipeline } = await run(GOPIK, [ok(vision(patch))]);
      expect(json.code).toBe('IMAGE_NOT_UNDERSTANDABLE');
      expect(json.reason).toBe(reason);
      expect(json.stage).toBe('vision_usability');
      expect(requests).toHaveLength(1);
      expect(deps.complete).not.toHaveBeenCalled();
      expect(pipeline).toMatchObject({ result: 'insufficient', stage: 'vision_usability', reason });
    });
  }

  it('the usability decision ignores business_fit entirely', () => {
    for (const fit of ['consistent', 'plausibly_related', 'unknown', 'material_mismatch']) {
      expect(insufficiency(parseVisual(JSON.stringify(vision({ business_fit: fit, usable: false, insufficient_reason: 'other' })))!)).toBeNull();
      expect(insufficiency(parseVisual(JSON.stringify(vision({ business_fit: fit, usable: false, insufficient_reason: 'blurry' })))!)).toBe('blurry');
    }
  });
});

describe('A3.7.2.2.1 positive, plausible and unknown controls', () => {
  it('CONSISTENT: clothing retailer + store photo proceeds to safe generation', async () => {
    const { res, json, requests } = await run(RETAILER, [ok(vision({ business_fit: 'consistent' })), ok(SAFE_ES)]);
    expect(res.status).toBe(200);
    expect(json.publication.status).toBe('proposals_ready');
    expect(requests.map((r) => r.stage)).toEqual(['vision', 'writer']);
  });

  it('PLAUSIBLY_RELATED: real estate + home interior is usable and not a mismatch; a listing claim is still rejected', async () => {
    const interior = vision({ primary_subject: o('salón luminoso'), elements: [o('sofá gris')], setting: o('interior de vivienda'), business_fit: 'plausibly_related' });
    const { json, requests } = await run(REALTY, [ok(interior), { ok: true, raw: 'not json' }, { ok: true, raw: 'not json' }]);
    expect(json.code).not.toBe('IMAGE_NOT_UNDERSTANDABLE');
    expect(json.code).not.toBe('BUSINESS_IMAGE_MISMATCH');
    expect(requests.map((r) => r.stage)).toEqual(['vision', 'writer', 'writer']);
    const env = buildEnvelope('es', buildFacts(REALTY)!, parseVisual(JSON.stringify(interior))!, isClaim);
    expect(safetyIssues('Descubre nuestro salón luminoso en Marbella.', env)).toEqual(expect.arrayContaining(['unsupported_possessive', 'location_composition']));
  });

  it('UNKNOWN: sparse business + clear photo is usable and never forced into a mismatch', async () => {
    const { res, requests } = await run(SPARSE, [ok(vision({ usable: false, insufficient_reason: 'other' })), ok(SAFE_ES)]);
    expect(res.status).toBe(200);
    expect(requests.map((r) => r.stage)).toEqual(['vision', 'writer']);
  });
});

describe('A3.7.2.2.1 provider and parser failures are never labelled image incomprehension', () => {
  it('a valid provider answer survives the real parser with its observations intact', () => {
    const v = parseVisual(JSON.stringify(vision({})))!;
    expect(v).not.toBeNull();
    expect(v.elements.map((e) => e.label)).toEqual(['camisetas', 'abrigo rojo', 'bolso rojo', 'pantalones']);
    expect(insufficiency(v)).toBeNull();
  });

  it('malformed provider output -> INVALID_MODEL_OUTPUT at vision_parse, nothing stored', async () => {
    const { json, deps, requests, pipeline } = await run(GOPIK, [{ ok: true, raw: '{"usable": true' }, { ok: true, raw: JSON.stringify({ usable: true }) }]);
    expect(json).toEqual({ ok: false, code: 'INVALID_MODEL_OUTPUT', stage: 'vision_parse' });
    expect(requests).toHaveLength(2);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(settled(deps)).toBe('consumed');
    expect(pipeline).toMatchObject({ result: 'error', stage: 'vision_parse', reason: 'invalid_shape' });
    expect(visualFailure('not json')).toEqual({ stage: 'vision_parse', reason: 'invalid_json' });
  });

  it('a malformed consistency field -> INVALID_MODEL_OUTPUT at business_consistency, not image incomprehension', async () => {
    const broken = { ...vision({}), business_fit: 'unrelated' };
    const { json, deps, pipeline } = await run(GOPIK, [ok(broken), ok(broken)]);
    expect(json).toEqual({ ok: false, code: 'INVALID_MODEL_OUTPUT', stage: 'business_consistency' });
    expect(deps.complete).not.toHaveBeenCalled();
    expect(pipeline).toMatchObject({ stage: 'business_consistency', reason: 'invalid_business_fit' });
  });

  it('provider timeout -> PROVIDER_TIMEOUT at vision_provider', async () => {
    const t: ModelResult = { ok: false, billed: true, failure: 'timeout' };
    const { json, deps } = await run(GOPIK, [t, t]);
    expect(json).toEqual({ ok: false, code: 'PROVIDER_TIMEOUT', stage: 'vision_provider' });
    expect(deps.complete).not.toHaveBeenCalled();
    expect(settled(deps)).toBe('consumed');
  });

  it('provider outage that was never billed releases the reservation', async () => {
    const s: ModelResult = { ok: false, billed: false, failure: 'server' };
    const { json, deps } = await run(GOPIK, [s, s]);
    expect(json).toEqual({ ok: false, code: 'PROVIDER_UNAVAILABLE', stage: 'vision_provider' });
    expect(settled(deps)).toBe('released');
  });

  it('the log carries only stage, codes and counters, never prompts, labels or image data', async () => {
    const { deps } = await run(GOPIK, [ok(vision({}))]);
    const logged = JSON.stringify(deps.log.mock.calls);
    for (const leak of ['data:image', 'base64', 'tienda de ropa', 'Gopik', 'You analyse', 'Bearer']) expect(logged).not.toContain(leak);
  });
});

describe('A3.7.2.2.1 client mapping and harness copy', () => {
  const db = (status: number, payload: unknown) => ({
    functions: { invoke: vi.fn(async () => ({ data: null, error: { context: new Response(JSON.stringify(payload), { status }) } })) },
    from: vi.fn(),
  });
  const err = (status: number, payload: unknown) => generateProposals(PUB, 'es', REQ, db(status, payload) as never).catch((e) => e);

  it('maps each server code to a distinct harness message with a safe diagnostic', async () => {
    const vision1 = await err(502, { ok: false, code: 'INVALID_MODEL_OUTPUT', stage: 'vision_parse' });
    expect(vision1.code).toBe('ai_response_invalid');
    expect(vision1.diagnostic).toEqual({ code: 'INVALID_MODEL_OUTPUT', stage: 'vision_parse' });
    expect((await err(502, { ok: false, code: 'INVALID_MODEL_OUTPUT', stage: 'writer' })).code).toBe('generation_failed');
    const unclear = await err(422, { ok: false, code: 'IMAGE_NOT_UNDERSTANDABLE', stage: 'vision_usability', reason: 'blurry' });
    expect(unclear.code).toBe('image_not_understandable');
    expect(unclear.diagnostic).toEqual({ code: 'IMAGE_NOT_UNDERSTANDABLE', stage: 'vision_usability' });
    const mm = await err(422, { ok: false, code: 'BUSINESS_IMAGE_MISMATCH', stage: 'business_consistency', mismatch: { imageSummary: 'x', businessSummary: 'y', message: 'z' } });
    expect(mm.code).toBe('business_image_mismatch');
    expect(mm.diagnostic.stage).toBe('business_consistency');
    expect((await err(503, { ok: false, code: 'PROVIDER_UNAVAILABLE', stage: 'vision_provider' })).diagnostic).toEqual({ code: 'PROVIDER_UNAVAILABLE', stage: 'vision_provider' });
  });

  it('never accepts free text as a diagnostic', async () => {
    const e = await err(500, { ok: false, code: 'Ignore <script>', stage: 'You analyse one photo' });
    expect(e.code).toBe('unavailable');
    expect(e.diagnostic).toBeUndefined();
  });

  it('uses the specified ES copy and an EN equivalent for every branch', () => {
    expect(ERROR_TEXT.image_not_understandable.es).toBe('No hemos podido entender esta imagen con suficiente seguridad. Prueba con otra fotografía.');
    expect(ERROR_TEXT.ai_response_invalid.es).toBe('No hemos podido completar el análisis de la imagen de forma segura. Inténtalo de nuevo más tarde.');
    expect(ERROR_TEXT.ai_response_invalid.en).toBe('We could not complete the image analysis safely. Please try again later.');
    const texts = new Set(['image_not_understandable', 'business_image_mismatch', 'ai_response_invalid', 'generation_failed'].map((k) => ERROR_TEXT[k as keyof typeof ERROR_TEXT].es));
    expect(texts.size).toBe(4);
  });
});
