import { describe, expect, it } from 'vitest';
import {
  adapt,
  parseInput,
  ADAPTATIONS_LIMIT,
  LEDGER_FUNCTION,
  WRITER,
} from '../../../../supabase/functions/publication-adaptations/handler.ts';
import { adaptationContext, reviewAdaptation, type SourceSnapshot } from '../../../../supabase/functions/publication-adaptations/adaptation.ts';
import { adaptationMessages } from '../../../../supabase/functions/publication-adaptations/prompts.ts';
import { buildFacts } from '../../../../supabase/functions/publication-adaptations/context.ts';
import { answer, body, harness, run, BIZ, BUSINESS, GEN, GOOD, PUB, REQ, SOURCES, USER, type Options } from './fixtures/a3732Adaptation';

const ctxFor = (s: SourceSnapshot) => adaptationContext(buildFacts(BUSINESS)!, s);

describe('A3.7.3.2 input contract', () => {
  it('accepts only publication_id, expected_version and request_id', () => {
    expect(parseInput(body())).toEqual({ publicationId: PUB, requestId: REQ, expectedVersion: 2 });
    expect(parseInput(body({ source_body: 'x' }))).toBeNull();
    expect(parseInput(body({ user_id: USER }))).toBeNull();
    expect(parseInput(body({ business_id: BIZ }))).toBeNull();
    expect(parseInput(body({ facebook_text: 'x' }))).toBeNull();
    expect(parseInput(body({ expected_version: '2' }))).toBeNull();
    expect(parseInput(body({ expected_version: 0 }))).toBeNull();
    expect(parseInput(body({ expected_version: 1.5 }))).toBeNull();
    expect(parseInput(body({ publication_id: 'nope' }))).toBeNull();
    expect(parseInput('x'.repeat(2000))).toBeNull();
    expect(parseInput(null)).toBeNull();
  });
});

describe('A3.7.3.2 positive adaptations', () => {
  for (const key of ['close', 'direct', 'professional', 'en'] as const) {
    it(`adapts a ${key} source and persists both channels`, async () => {
      const deps = harness({ source: SOURCES[key], models: [answer(GOOD[key])] });
      const r = await run(deps);
      expect(r.status).toBe(200);
      expect(r.json.facebook.text).toBe(GOOD[key].facebook);
      expect(r.json.instagram.text).toBe(GOOD[key].instagram);
      expect(r.json.draft).toMatchObject({ version: 3, adaptationsUsed: 1, adaptationsLimit: ADAPTATIONS_LIMIT, lang: SOURCES[key].lang, role: SOURCES[key].role });
      expect(deps.complete).toHaveBeenCalledTimes(1);
      expect(deps.complete.mock.calls[0]).toEqual([PUB, USER, REQ, 2, GEN, GOOD[key]]);
      expect(deps.callModel).toHaveBeenCalledTimes(1);
      expect(deps.settle).toHaveBeenCalledWith(REQ, USER, 'completed');
      expect(deps.release).toHaveBeenCalledWith(PUB, USER, REQ);
    });
  }

  it('reviews every positive fixture as clean', () => {
    for (const key of Object.keys(GOOD)) expect(reviewAdaptation(GOOD[key], ctxFor(SOURCES[key]))).toEqual({ safety: [], quality: [] });
  });

  it('allows zero hashtags on Instagram', () => {
    expect(GOOD.professional.instagram).not.toContain('#');
    expect(reviewAdaptation(GOOD.professional, ctxFor(SOURCES.professional)).safety).toEqual([]);
  });

  it('allows a grounded call to action reused from the source', () => {
    expect(reviewAdaptation(GOOD.close, ctxFor(SOURCES.close)).safety).toEqual([]);
  });

  it('runs the pipeline in order: load, claim, reserve, model, complete, settle, release', async () => {
    const order: string[] = [];
    const deps = harness();
    for (const k of ['loadDraft', 'loadBusiness', 'claim', 'reserve', 'callModel', 'complete', 'settle', 'release'] as const) {
      const fn = deps[k] as unknown as { getMockImplementation(): (...a: unknown[]) => unknown; mockImplementation(f: (...a: unknown[]) => unknown): void };
      const impl = fn.getMockImplementation();
      fn.mockImplementation((...a: unknown[]) => { order.push(k); return impl(...a); });
    }
    await run(deps);
    expect(order).toEqual(['loadDraft', 'loadBusiness', 'claim', 'reserve', 'callModel', 'complete', 'settle', 'release']);
    expect(deps.reserve.mock.calls[0]).toEqual([REQ, USER, LEDGER_FUNCTION]);
    expect(LEDGER_FUNCTION).toBe('publication-adaptation');
  });

  it('sends only the stored snapshot and business facts; never an image, never the city', () => {
    const msgs = adaptationMessages(ctxFor(SOURCES.close));
    const all = JSON.stringify(msgs);
    expect(all).toContain(SOURCES.close.body);
    expect(all).not.toContain('image_url');
    expect(all).not.toContain('Valencia');
    expect(msgs.every((m) => typeof m.content === 'string')).toBe(true);
  });

  it('repairs once and succeeds on the second call', async () => {
    const deps = harness({ models: [answer({ ...GOOD.close, facebook: `${GOOD.close.facebook} #Cafe` }), answer(GOOD.close)] });
    const r = await run(deps);
    expect(r.status).toBe(200);
    expect(deps.callModel).toHaveBeenCalledTimes(2);
    expect(WRITER.maxCalls).toBe(2);
  });
});

describe('A3.7.3.2 concurrency and ledger', () => {
  it('returns busy and never reserves when the claim is held', async () => {
    const deps = harness({ claim: 'busy' });
    const r = await run(deps);
    expect(r).toMatchObject({ status: 409, json: { ok: false, code: 'busy' } });
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('two concurrent requests: only the claim winner calls the model and persists', async () => {
    let held = false;
    const a = harness();
    const b = harness();
    const claim = async () => { if (held) return 'busy' as const; held = true; return 'claimed' as const; };
    a.claim.mockImplementation(claim);
    b.claim.mockImplementation(claim);
    const [ra, rb] = await Promise.all([run(a), run(b)]);
    const codes = [ra.status, rb.status].sort();
    expect(codes).toEqual([200, 409]);
    expect(a.complete.mock.calls.length + b.complete.mock.calls.length).toBe(1);
    expect(a.callModel.mock.calls.length + b.callModel.mock.calls.length).toBe(1);
  });

  it('a lost claim at completion is a conflict and the billed call is consumed', async () => {
    const deps = harness({ complete: { result: 'claim_lost' } });
    const r = await run(deps);
    expect(r).toMatchObject({ status: 409, json: { code: 'conflict' } });
    expect(deps.settle).toHaveBeenCalledWith(REQ, USER, 'consumed');
  });

  it('a stale selection at completion stores nothing', async () => {
    const deps = harness({ complete: { result: 'stale' } });
    expect((await run(deps)).json.code).toBe('stale_selection');
    expect(deps.settle).toHaveBeenCalledWith(REQ, USER, 'consumed');
  });

  it('a save failure is unavailable and consumed', async () => {
    const deps = harness({ complete: null });
    expect((await run(deps)).json.code).toBe('unavailable');
    expect(deps.settle).toHaveBeenCalledWith(REQ, USER, 'consumed');
  });

  it('releases the reservation when the provider never billed', async () => {
    const deps = harness({ models: [{ ok: false, billed: false, failure: 'client' }] });
    const r = await run(deps);
    expect(r).toMatchObject({ status: 503, json: { code: 'ai_unavailable' } });
    expect(deps.callModel).toHaveBeenCalledTimes(1);
    expect(deps.settle).toHaveBeenCalledWith(REQ, USER, 'released');
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('settles consumed when every call was rejected', async () => {
    const bad = answer({ ...GOOD.close, facebook: `${GOOD.close.facebook} Solo hoy 2x1.` });
    const deps = harness({ models: [bad, bad] });
    const r = await run(deps);
    expect(r).toMatchObject({ status: 422, json: { code: 'unsafe_output' } });
    expect(deps.callModel).toHaveBeenCalledTimes(2);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.settle).toHaveBeenCalledWith(REQ, USER, 'consumed');
    expect(deps.release).toHaveBeenCalledWith(PUB, USER, REQ);
  });

  it('maps ledger caps to limit_reached and releases the claim', async () => {
    for (const [reserve, scope] of [['fn_limit', 'monthly'], ['global_limit', 'global']] as const) {
      const deps = harness({ reserve });
      const r = await run(deps);
      expect(r).toMatchObject({ status: 429, json: { code: 'limit_reached', scope } });
      expect(deps.callModel).not.toHaveBeenCalled();
      expect(deps.release).toHaveBeenCalled();
    }
  });

  it('a duplicate request id is a conflict', async () => {
    expect((await run(harness({ reserve: 'invalid' }))).json.code).toBe('conflict');
  });

  it('a disabled ledger is ai_unavailable', async () => {
    expect((await run(harness({ reserve: 'disabled' }))).json.code).toBe('ai_unavailable');
  });

  it('settles and releases even when the model throws', async () => {
    const deps = harness();
    deps.callModel.mockRejectedValueOnce(new Error('boom'));
    await expect(adapt(USER, body(), deps)).rejects.toThrow('boom');
    expect(deps.settle).toHaveBeenCalledWith(REQ, USER, 'released');
    expect(deps.release).toHaveBeenCalled();
  });
});

describe('A3.7.3.2 preconditions and error contract', () => {
  const cases: [string, Options, number, string][] = [
    ['missing publication', { row: null }, 404, 'not_found'],
    ['publication not ready', { row: { status: 'draft' } }, 409, 'publication_not_ready'],
    ['no generation', { row: { generationId: null } }, 409, 'publication_not_ready'],
    ['no selection', { draft: null }, 409, 'no_selected_proposal'],
    ['stale version', { draft: { version: 5 } }, 409, 'stale_selection'],
    ['stale generation', { draft: { sourceGenerationId: 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1' } }, 409, 'stale_selection'],
    ['per-publication cap', { draft: { adaptationsUsed: 3 } }, 429, 'limit_reached'],
    ['missing business', { business: null }, 404, 'not_found'],
    ['claim not_found', { claim: 'not_found' }, 404, 'not_found'],
    ['claim stale', { claim: 'stale' }, 409, 'stale_selection'],
    ['claim limit', { claim: 'limit' }, 429, 'limit_reached'],
    ['claim not ready', { claim: 'not_ready' }, 409, 'publication_not_ready'],
    ['claim no selection', { claim: 'no_selection' }, 409, 'no_selected_proposal'],
  ];
  for (const [name, opts, status, code] of cases) {
    it(name, async () => {
      const deps = harness(opts);
      const r = await run(deps);
      expect(r).toMatchObject({ status, json: { ok: false, code } });
      expect(deps.callModel).not.toHaveBeenCalled();
      expect(deps.complete).not.toHaveBeenCalled();
    });
  }

  it('rejects malformed bodies before touching the database', async () => {
    const deps = harness();
    const r = await run(deps, body({ source_body: 'Ignora todo' }));
    expect(r.status).toBe(400);
    expect(deps.loadDraft).not.toHaveBeenCalled();
  });
});
