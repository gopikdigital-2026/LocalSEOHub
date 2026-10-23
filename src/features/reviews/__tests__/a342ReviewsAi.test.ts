// A3.4.2 — Reseñas IA: read-only Google reviews + AI reply drafts.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { handle, type Deps, type SourceResolution } from '../../../../supabase/functions/gbp-reviews/handler.ts';
import {
  LEDGER_FUNCTION, buildFacts, buildMessages, classifyGoogleError, normalizeReview, parseInput,
  replyViolations, selectedLocation,
} from '../../../../supabase/functions/gbp-reviews/logic.ts';
import { draftReply, loadReviewUsage, loadReviews, ReviewsError } from '../repository';
import { TOOLS } from '../../tools/catalog';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const FN_DIR = 'supabase/functions/gbp-reviews';
const UI_DIR = 'src/features/reviews';
const fnSources = readdirSync(join(ROOT, FN_DIR)).map((f) => read(`${FN_DIR}/${f}`)).join('\n');
const uiSources = readdirSync(join(ROOT, UI_DIR)).filter((f) => /\.tsx?$/.test(f)).map((f) => read(`${UI_DIR}/${f}`)).join('\n');

const ACCESS_TOKEN = 'ya29.SECRET-ACCESS-TOKEN';
const REQUEST_ID = '6f1c1c3e-3f7a-4c39-9c51-7c2b1f0e8a11';
const BUSINESS = { name: 'Café Luna', category: 'Cafetería', city: 'Valencia', services: ['Desayunos'], phone: '+34 600 111 222', website: 'https://cafeluna.es' };

const REVIEW_5 = {
  reviewId: 'rev5', reviewer: { displayName: 'Ana' }, starRating: 'FIVE', comment: 'Todo genial',
  createTime: '2025-05-01T10:00:00Z', updateTime: '2025-05-01T10:00:00Z',
};
const REVIEW_ANSWERED = {
  reviewId: 'rev4', reviewer: { displayName: 'Luis' }, starRating: 'FOUR', comment: 'Muy bien',
  createTime: '2025-04-01T10:00:00Z', reviewReply: { comment: 'Gracias Luis', updateTime: '2025-04-02T10:00:00Z' },
};
const REVIEW_NO_TEXT = { reviewId: 'rev3', reviewer: { displayName: 'Marta' }, starRating: 'THREE', createTime: '2025-03-01T10:00:00Z' };

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function googleErr(status: number, gStatus: string, reason?: string, message = 'denied') {
  return jsonRes({ error: { code: status, status: gStatus, message, details: reason ? [{ reason }] : [] } }, status);
}
function req(body: unknown, method = 'POST') {
  return new Request('https://x.test/gbp-reviews', { method, body: method === 'POST' ? JSON.stringify(body) : undefined });
}
const found: SourceResolution = { kind: 'found', sourceId: 'src-1', accountId: 'accounts/111', locationId: 'locations/222', business: BUSINESS };

function makeDeps(over: Partial<Deps> = {}) {
  const logs: Array<[string, unknown]> = [];
  const googleCalls: string[] = [];
  const deps: Deps = {
    authorize: vi.fn(async () => ({ ok: true as const, userId: 'user-a' })),
    resolveSource: vi.fn(async () => found),
    token: vi.fn(async () => ({ ok: true as const, accessToken: ACCESS_TOKEN, refreshed: false })),
    google: vi.fn(async (url: string) => {
      googleCalls.push(url);
      return url.includes('/reviews/') ? jsonRes(REVIEW_5) : jsonRes({ reviews: [REVIEW_5, REVIEW_ANSWERED, REVIEW_NO_TEXT], totalReviewCount: 3, averageRating: 4 });
    }),
    reserve: vi.fn(async () => ({ status: 'reserved' as const })),
    settle: vi.fn(async () => true),
    callModel: vi.fn(async () => ({ ok: true as const, raw: JSON.stringify({ reply: 'Muchas gracias, Ana. Nos alegra mucho que disfrutaras de tu visita a Café Luna.' }) })),
    log: (e, d) => { logs.push([e, d]); },
    ...over,
  };
  return { deps, logs, googleCalls };
}

const listReq = () => req({ action: 'list' });
const draftReq = (reviewId = 'rev5') => req({ action: 'draft', reviewId, requestId: REQUEST_ID, lang: 'es' });

async function body(res: Response) {
  return { status: res.status, json: await res.json(), text: '' };
}

describe('A3.4.2 · access and connection states', () => {
  it('1. rejects unauthenticated requests before touching sources, tokens or Google', async () => {
    const { deps } = makeDeps({ authorize: vi.fn(async () => ({ ok: false as const, response: jsonRes({ error: 'unauthorized' }, 401) })) });
    const res = await handle(listReq(), deps);
    expect(res.status).toBe(401);
    expect(deps.resolveSource).not.toHaveBeenCalled();
    expect(deps.token).not.toHaveBeenCalled();
    expect(deps.google).not.toHaveBeenCalled();
  });

  it('2. disconnected source → not_connected, no token or Google call', async () => {
    const { deps } = makeDeps({ resolveSource: vi.fn(async () => ({ kind: 'not_connected' as const })) });
    const { json } = await body(await handle(listReq(), deps));
    expect(json.status).toBe('not_connected');
    expect(deps.token).not.toHaveBeenCalled();
  });

  it('3. no location → no_location; default/malformed location ids are rejected', async () => {
    const { deps } = makeDeps({ resolveSource: vi.fn(async () => ({ kind: 'no_location' as const })) });
    expect((await body(await handle(listReq(), deps))).json.status).toBe('no_location');
    expect(selectedLocation('accounts/1', 'locations/default')).toBeNull();
    expect(selectedLocation('accounts/1', '../../evil')).toBeNull();
    expect(selectedLocation('accounts/1', 'accounts/1/locations/9')).toEqual({ accountId: 'accounts/1', locationId: 'locations/9' });
  });

  it('4. Google 401 → auth_revoked with sanitized diagnostic', async () => {
    const { deps } = makeDeps({ google: vi.fn(async () => googleErr(401, 'UNAUTHENTICATED')) });
    const { json } = await body(await handle(listReq(), deps));
    expect(json.status).toBe('auth_revoked');
    expect(json.diagnostic).toMatchObject({ httpStatus: 401, googleStatus: 'UNAUTHENTICATED' });
  });

  it('5. refresh path: a refreshed token is used and reported in the diagnostic', async () => {
    const { deps } = makeDeps({ token: vi.fn(async () => ({ ok: true as const, accessToken: ACCESS_TOKEN, refreshed: true })) });
    const { json } = await body(await handle(listReq(), deps));
    expect(json.status).toBe('ok');
    expect(json.diagnostic.tokenRefreshed).toBe(true);
    expect(deps.google).toHaveBeenCalledWith(expect.any(String), ACCESS_TOKEN);
  });

  it('6. refresh failure → auth_expired, Google is never called', async () => {
    const { deps } = makeDeps({ token: vi.fn(async () => ({ ok: false as const, code: 'GBP_AUTH_EXPIRED' as const, retryable: false })) });
    const { json } = await body(await handle(listReq(), deps));
    expect(json.status).toBe('auth_expired');
    expect(json.diagnostic.reason).toBe('GBP_AUTH_EXPIRED');
    expect(deps.google).not.toHaveBeenCalled();
  });

  it('7. 403 → access_denied; 403 SERVICE_DISABLED → api_not_enabled', async () => {
    const { deps } = makeDeps({ google: vi.fn(async () => googleErr(403, 'PERMISSION_DENIED')) });
    expect((await body(await handle(listReq(), deps))).json.status).toBe('access_denied');
    const d2 = makeDeps({ google: vi.fn(async () => googleErr(403, 'PERMISSION_DENIED', 'SERVICE_DISABLED')) });
    expect((await body(await handle(listReq(), d2.deps))).json.status).toBe('api_not_enabled');
  });

  it('8. quota (429 / RESOURCE_EXHAUSTED) → quota_unavailable', async () => {
    const { deps } = makeDeps({ google: vi.fn(async () => googleErr(429, 'RESOURCE_EXHAUSTED', 'RATE_LIMIT_EXCEEDED')) });
    expect((await body(await handle(listReq(), deps))).json.status).toBe('quota_unavailable');
    expect(classifyGoogleError(403, { googleStatus: 'RESOURCE_EXHAUSTED', reason: null, message: '' })).toBe('quota_unavailable');
  });

  it('9. 5xx → google_error, retryable', async () => {
    const { deps } = makeDeps({ google: vi.fn(async () => googleErr(503, 'UNAVAILABLE')) });
    const { json } = await body(await handle(listReq(), deps));
    expect(json).toMatchObject({ status: 'google_error', retryable: true });
  });
});

describe('A3.4.2 · reviews read layer', () => {
  it('10. zero reviews → ok with empty list (no demo data)', async () => {
    const { deps } = makeDeps({ google: vi.fn(async () => jsonRes({})) });
    const { json } = await body(await handle(listReq(), deps));
    expect(json).toMatchObject({ status: 'ok', reviews: [], complete: true });
  });

  it('11. reviews returned are normalized exactly from Google fields', async () => {
    const { deps } = makeDeps();
    const { json } = await body(await handle(listReq(), deps));
    expect(json.reviews).toHaveLength(3);
    expect(json.reviews[0]).toEqual({
      reviewId: 'rev5', reviewerName: 'Ana', starRating: 5, comment: 'Todo genial',
      createTime: '2025-05-01T10:00:00Z', updateTime: '2025-05-01T10:00:00Z', ownerReply: null,
    });
    expect(json).toMatchObject({ totalReviewCount: 3, averageRating: 4, complete: true });
  });

  it('11b. pagination stops at a later-page error and marks the list incomplete', async () => {
    let n = 0;
    const { deps } = makeDeps({ google: vi.fn(async () => (++n === 1 ? jsonRes({ reviews: [REVIEW_5], nextPageToken: 'p2' }) : googleErr(503, 'UNAVAILABLE'))) });
    const { json } = await body(await handle(listReq(), deps));
    expect(json).toMatchObject({ status: 'ok', complete: false });
    expect(json.reviews).toHaveLength(1);
  });

  it('12. no-comment review keeps comment null and the UI shows the honest label', () => {
    expect(normalizeReview(REVIEW_NO_TEXT)?.comment).toBeNull();
    expect(uiSources).toContain('Esta valoración no incluye comentario.');
  });

  it('13-14. unanswered vs answered reviews', () => {
    expect(normalizeReview(REVIEW_5)?.ownerReply).toBeNull();
    expect(normalizeReview(REVIEW_ANSWERED)?.ownerReply).toEqual({ comment: 'Gracias Luis', updateTime: '2025-04-02T10:00:00Z' });
    expect(uiSources).toContain("statusAnswered: 'Respondida'");
    expect(uiSources).toContain("'Sin responder'");
  });

  it('15. no credentials in responses or logs', async () => {
    for (const google of [undefined, vi.fn(async () => googleErr(403, 'PERMISSION_DENIED', undefined, `bad token ${ACCESS_TOKEN}`))]) {
      const { deps, logs } = makeDeps(google ? { google } : {});
      const res = await handle(listReq(), deps);
      const text = await res.text();
      expect(text).not.toContain(ACCESS_TOKEN);
      expect(JSON.stringify(logs)).not.toContain(ACCESS_TOKEN);
      expect(text).not.toMatch(/refresh_token|client_secret/);
    }
  });

  it('16. tenant isolation: source resolved only from the JWT user, scoped by user and business', async () => {
    const { deps } = makeDeps();
    await handle(req({ action: 'list', userId: 'user-b', sourceId: 'other' }), deps);
    expect(deps.resolveSource).toHaveBeenCalledWith('user-a');
    expect(deps.token).toHaveBeenCalledWith('src-1');
    const index = read(`${FN_DIR}/index.ts`);
    expect(index).toMatch(/\.eq\("user_id", userId\)/);
    expect(index).toMatch(/\.eq\("business_id"/);
    expect(index).toContain('"google_business"');
  });

  it('16b. reviewId and requestId are validated', () => {
    expect(parseInput({ action: 'draft', reviewId: '../x', requestId: REQUEST_ID }).ok).toBe(false);
    expect(parseInput({ action: 'draft', reviewId: 'abc', requestId: 'nope' }).ok).toBe(false);
    expect(parseInput({ action: 'publish' }).ok).toBe(false);
  });
});

describe('A3.4.2 · AI draft', () => {
  it('17. drafts from the review re-read from Google (never client text) and settles completed', async () => {
    const { deps, googleCalls } = makeDeps();
    const { status, json } = await body(await handle(draftReq(), deps));
    expect(status).toBe(200);
    expect(json).toMatchObject({ status: 'drafted', reviewId: 'rev5' });
    expect(googleCalls[0]).toBe('https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews/rev5');
    expect(deps.settle).toHaveBeenCalledWith(REQUEST_ID, 'user-a', 'completed');
  });

  it('17b. unknown review → review_not_found, nothing reserved', async () => {
    const { deps } = makeDeps({ google: vi.fn(async () => googleErr(404, 'NOT_FOUND')) });
    expect((await body(await handle(draftReq('missing'), deps))).json.status).toBe('review_not_found');
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it('18. no fabrication: prompt uses only known facts and the guard rejects invented details', () => {
    const facts = buildFacts({ name: 'Café Luna' });
    const msgs = buildMessages(normalizeReview(REVIEW_NO_TEXT)!, facts, 'es');
    expect(msgs[1].content).toContain('"phone":"UNKNOWN"');
    expect(msgs[0].content).toMatch(/must not be mentioned or invented/);
    expect(msgs[0].content).toMatch(/Never admit legal liability/);
    expect(replyViolations('Gracias. Llámanos al 600 999 888 cuando quieras.', facts)).toContain('phone');
    expect(replyViolations('Gracias, te ofrecemos un descuento en tu próxima visita.', facts)).toContain('promise');
    expect(replyViolations('Gracias, ¿podrías cambiar tu valoración?', facts)).toContain('rating_pressure');
    expect(replyViolations('Escríbenos a hola@x.com, gracias por tu visita.', facts)).toContain('email');
    expect(replyViolations('Gracias por tu visita, [nombre].', facts)).toContain('placeholder');
    expect(replyViolations('Muchas gracias por tu visita, te esperamos pronto.', facts)).toEqual([]);
  });

  it('18b. tone adapts to the rating', () => {
    const facts = buildFacts(BUSINESS);
    const tone = (r: object) => buildMessages(normalizeReview(r)!, facts, 'es')[0].content;
    expect(tone(REVIEW_5)).toContain('5 estrellas');
    expect(tone({ ...REVIEW_5, starRating: 'ONE' })).toMatch(/sin admitir culpa/);
  });

  it('18c. a draft that violates the rules is never returned', async () => {
    const { deps } = makeDeps({ callModel: vi.fn(async () => ({ ok: true as const, raw: JSON.stringify({ reply: 'Te devolvemos el dinero con un reembolso completo.' }) })) });
    const { status, json } = await body(await handle(draftReq(), deps));
    expect(status).toBe(502);
    expect(json.error).toBe('generation_failed');
    expect(deps.settle).toHaveBeenCalledWith(REQUEST_ID, 'user-a', 'consumed');
  });

  it('19. usage is counted under review-reply; provider outage releases the reservation', async () => {
    const { deps } = makeDeps();
    await handle(draftReq(), deps);
    expect(deps.reserve).toHaveBeenCalledWith(REQUEST_ID, 'user-a', 'review-reply');
    expect(LEDGER_FUNCTION).toBe('review-reply');
    const d2 = makeDeps({ callModel: vi.fn(async () => ({ ok: false as const, retryable: false })) });
    const r2 = await body(await handle(draftReq(), d2.deps));
    expect(r2.json.error).toBe('ai_unavailable');
    expect(d2.deps.settle).toHaveBeenCalledWith(REQUEST_ID, 'user-a', 'released');
  });

  it('19b. listing reviews never reserves AI usage', async () => {
    const { deps } = makeDeps();
    await handle(listReq(), deps);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it('20. caps are enforced: function cap, global cap, duplicate request', async () => {
    for (const [status, error, code] of [['fn_limit', 'review_limit', 429], ['global_limit', 'global_limit', 429], ['invalid', 'duplicate_request', 409]] as const) {
      const { deps } = makeDeps({ reserve: vi.fn(async () => ({ status })) });
      const r = await body(await handle(draftReq(), deps));
      expect(r.status).toBe(code);
      expect(r.json.error).toBe(error);
      expect(deps.callModel).not.toHaveBeenCalled();
    }
    const migration = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => f.includes('a342_review_reply_ai_usage'));
    expect(migration).toBeTruthy();
    expect(read(`supabase/migrations/${migration}`)).toMatch(/WHEN 'review-reply' THEN 15/);
  });
});

describe('A3.4.2 · client repository', () => {
  const db = (invoke: unknown, rpc: unknown = null) => ({
    functions: { invoke: vi.fn(async () => invoke) },
    rpc: vi.fn(async () => rpc),
  }) as never;

  it('maps states, reviews and errors without inventing data', async () => {
    expect(await loadReviews(db({ data: { status: 'not_connected', retryable: false }, error: null }))).toEqual({ kind: 'state', state: 'not_connected', retryable: false });
    const ok = await loadReviews(db({ data: { status: 'ok', reviews: [{ reviewId: 'a', starRating: 9 }], complete: true }, error: null }));
    expect(ok).toMatchObject({ kind: 'ok', reviews: [{ reviewId: 'a', starRating: null, reviewerName: null, comment: null }] });
    const err = { context: new Response(JSON.stringify({ error: 'premium_required' }), { status: 402 }) };
    await expect(loadReviews(db({ data: null, error: err }))).rejects.toMatchObject({ code: 'premium_required' });
    await expect(loadReviews(db({ data: { status: 'weird' }, error: null }))).rejects.toBeInstanceOf(ReviewsError);
  });

  it('draft must match the requested review', async () => {
    await expect(draftReply({ reviewId: 'a', lang: 'es' }, db({ data: { status: 'drafted', reviewId: 'b', draft: 'Hola' }, error: null }))).rejects.toBeInstanceOf(ReviewsError);
    expect(await draftReply({ reviewId: 'a', lang: 'es' }, db({ data: { status: 'drafted', reviewId: 'a', draft: ' Gracias ' }, error: null }))).toEqual({ kind: 'draft', text: 'Gracias' });
  });

  it('reads review-reply usage from the shared ledger', async () => {
    const usage = { functions: { 'review-reply': { used: 2, limit: 15 } }, global: { used: 10, limit: 80 } };
    expect(await loadReviewUsage(db(null, { data: usage, error: null }))).toEqual({ used: 2, limit: 15, globalUsed: 10, globalLimit: 80 });
    expect(await loadReviewUsage(db(null, { data: null, error: { message: 'x' } }))).toBeNull();
  });
});

describe('A3.4.2 · UI and read-only guarantees', () => {
  it('21. draft is editable and copyable, labelled as an AI suggestion', () => {
    const card = read(`${UI_DIR}/ReviewCard.tsx`);
    expect(card).toMatch(/<textarea[\s\S]*onChange=\{\(e\) => onEdit\(e\.target\.value\)\}/);
    expect(card).toContain('navigator.clipboard.writeText(draft.text)');
    expect(uiSources).toContain("'Respuesta sugerida por IA'");
    expect(uiSources).toContain("'Preparar respuesta con IA'");
    expect(uiSources).toContain("'Copiar respuesta'");
    expect(uiSources).toContain("'Regenerar'");
    expect(uiSources).not.toMatch(/Respuesta de Google|Respuesta publicada/);
  });

  it('22. no Publish action anywhere in the feature', () => {
    expect(uiSources).not.toMatch(/Publicar en Google|Publish to Google/i);
    expect(uiSources).not.toMatch(/\bpublish(Reply|Review)\b/i);
  });

  it('23. no UpdateReviewReply / DeleteReviewReply call: Google is only read with GET', () => {
    expect(fnSources).not.toMatch(/updateReply|deleteReply|UpdateReviewReply|DeleteReviewReply/);
    expect(fnSources).not.toMatch(/\/reply\b/);
    expect(fnSources).not.toMatch(/method:\s*["'](PUT|PATCH|DELETE)["']/);
    const index = read(`${FN_DIR}/index.ts`);
    expect(index).toMatch(/fetch\(url, \{ headers: \{ Authorization: `Bearer \$\{accessToken\}` \}/);
  });

  it('23b. empty / state copy is truthful and spec-aligned', () => {
    expect(uiSources).toContain('No hemos encontrado reseñas en esta ficha.');
    expect(uiSources).toContain("'Conecta Google Business Profile'");
    expect(uiSources).toContain("'Conectar Google Business Profile'");
    expect(uiSources).toContain("'Seleccionar negocio'");
    expect(uiSources).not.toMatch(/demo|mock|sample review|lorem/i);
  });

  it('24. other tools unaffected; reviews registered once; no Meta events or billing changes', () => {
    expect(TOOLS.map((t) => t.id)).toEqual(['seo', 'maps', 'twin', 'radar', 'geo', 'advisor', 'voice', 'reviews', 'social']);
    const reviews = TOOLS.find((t) => t.id === 'reviews')!;
    expect(reviews.enabled && reviews.path).toBe('/herramientas/resenas');
    expect(reviews.copy.es).toMatchObject({ name: 'Reseñas IA', description: 'Gestiona tus reseñas y prepara respuestas personalizadas con IA.', cta: 'Gestionar reseñas' });
    expect(TOOLS.filter((t) => t.copy.es.cta)).toHaveLength(1);
    expect(read('src/App.tsx').match(/path="\/herramientas\/resenas"/g)).toHaveLength(1);
    expect(uiSources + fnSources).not.toMatch(/fbq|trackMeta|meta-events|stripe/i);
  });

  it('25. edge function is registered with JWT verification and uses only official endpoints', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.gbp-reviews\]\s*\nverify_jwt = true/);
    const hosts = fnSources.match(/https:\/\/[a-z0-9.-]+/g) ?? [];
    for (const h of hosts) expect(['https://mybusiness.googleapis.com', 'https://oauth2.googleapis.com', 'https://api.openai.com']).toContain(h);
  });

  it('rejects non-POST and oversized bodies', async () => {
    const { deps } = makeDeps();
    expect((await handle(req(null, 'GET'), deps)).status).toBe(405);
    expect((await handle(req({ action: 'list', pad: 'x'.repeat(5000) }), deps)).status).toBe(413);
  });
});
