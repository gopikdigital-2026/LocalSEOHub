import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import {
  ActiveBusinessError,
  BUSINESS_SELECTION_REQUIRED,
  OWNED_BUSINESS_LOOKUP_LIMIT,
  businessIdOrThrow,
  ownedBusinessIds,
  parseRequestedBusinessId,
  resolveActiveBusiness,
} from '../../../../supabase/functions/activeBusiness.ts';
import { createHandler as createStart, type StartDeps } from '../../../../supabase/functions/gbp-oauth-start/handler.ts';
import { createHandler as createSync, type SyncDeps } from '../../../../supabase/functions/gbp-sync/handler.ts';
import { createHandler as createDisconnect, type DisconnectDeps, type ResolveResult } from '../../../../supabase/functions/gbp-disconnect/handler.ts';
import { handle as handleReviews, type Deps as ReviewsDeps, type SourceResolution } from '../../../../supabase/functions/gbp-reviews/handler.ts';
import type { CredentialStore } from '../../../../supabase/functions/gbp-sync/gbpToken.ts';
import { resolveBusiness } from '../../business-memory/businessRepository';
import { draftReply, loadReviews, ReviewsError } from '../../reviews/repository';
import { COPY } from '../../reviews/copy';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');

const SOLO = 'user-solo';
const MULTI = 'user-multi';
const OTHER = 'user-other';
const SOLO_BIZ = 'biz-solo';
const BIZ_A = 'biz-a';
const BIZ_B = 'biz-b';
const OTHER_BIZ = 'biz-other';
const GHOST_BIZ = 'biz-ghost';
const GOOGLE_ACCOUNT = 'accounts/123';

const OWNERSHIP: Record<string, string[]> = { [SOLO]: [SOLO_BIZ], [MULTI]: [BIZ_A, BIZ_B], [OTHER]: [OTHER_BIZ] };
const JWT: Record<string, string> = { solo: SOLO, multi: MULTI, other: OTHER };

// Mirrors the server adapters: owned ids come from the server, never from the request.
async function ownBusinessId(userId: string, requested: string | null): Promise<string | null> {
  const owned = ownedBusinessIds((OWNERSHIP[userId] ?? []).map((id) => ({ id })));
  return businessIdOrThrow(resolveActiveBusiness(owned, requested));
}

const post = (url: string, body: unknown, jwt = 'multi') =>
  new Request(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('FIX02B · active-business contract', () => {
  it('a user with one business resolves automatically', () => {
    expect(resolveActiveBusiness([SOLO_BIZ], null)).toEqual({ kind: 'resolved', businessId: SOLO_BIZ });
  });

  it('a user with no business gets no_business, never an invented one', () => {
    expect(resolveActiveBusiness([], null)).toEqual({ kind: 'no_business' });
    expect(businessIdOrThrow({ kind: 'no_business' })).toBeNull();
  });

  it('two businesses without selection require a selection and never pick the first', () => {
    expect(resolveActiveBusiness([BIZ_A, BIZ_B], null)).toEqual({ kind: 'selection_required' });
    expect(() => businessIdOrThrow(resolveActiveBusiness([BIZ_A, BIZ_B], null))).toThrow(ActiveBusinessError);
  });

  it('an explicit owned business is resolved', () => {
    expect(resolveActiveBusiness([BIZ_A, BIZ_B], BIZ_B)).toEqual({ kind: 'resolved', businessId: BIZ_B });
  });

  it('a foreign and a nonexistent business are both forbidden and indistinguishable', () => {
    expect(resolveActiveBusiness([BIZ_A, BIZ_B], OTHER_BIZ)).toEqual({ kind: 'forbidden' });
    expect(resolveActiveBusiness([BIZ_A, BIZ_B], GHOST_BIZ)).toEqual({ kind: 'forbidden' });
    expect(resolveActiveBusiness([SOLO_BIZ], OTHER_BIZ)).toEqual({ kind: 'forbidden' });
    expect(resolveActiveBusiness([], GHOST_BIZ)).toEqual({ kind: 'forbidden' });
  });

  it('rejects malformed identifiers, including a Google account id', () => {
    expect(parseRequestedBusinessId(undefined)).toEqual({ ok: true, businessId: null });
    expect(parseRequestedBusinessId(null)).toEqual({ ok: true, businessId: null });
    expect(parseRequestedBusinessId(BIZ_A)).toEqual({ ok: true, businessId: BIZ_A });
    for (const bad of [GOOGLE_ACCOUNT, 'locations/456', '', 'a'.repeat(65), 42, {}, [BIZ_A], "biz' or 1=1"]) {
      expect(parseRequestedBusinessId(bad)).toEqual({ ok: false });
    }
  });

  it('owned ids ignore duplicates and malformed rows, and fail on a non-list', () => {
    expect(ownedBusinessIds([{ id: BIZ_A }, { id: BIZ_A }, { id: null }, { id: BIZ_B }])).toEqual([BIZ_A, BIZ_B]);
    expect(() => ownedBusinessIds(null)).toThrow();
    expect(OWNED_BUSINESS_LOOKUP_LIMIT).toBeGreaterThan(5);
  });
});

describe('FIX02B · OAuth connection', () => {
  const setup = () => {
    const attempts: { userId: string; businessId: string }[] = [];
    const deps: StartDeps = {
      getUserId: async (jwt) => JWT[jwt] ?? null,
      getOwnBusinessId: ownBusinessId,
      beginAttempt: async (a) => { attempts.push({ userId: a.userId, businessId: a.businessId }); return true; },
      env: (n) => ({ GOOGLE_CLIENT_ID: 'id', GOOGLE_REDIRECT_URI: 'https://localseohub.io/cb' } as Record<string, string>)[n],
      randomState: () => 'state-1',
    };
    const call = (body: unknown, jwt?: string) => createStart(deps)(post('https://x/gbp-oauth-start', body, jwt));
    return { attempts, call };
  };

  it('single business connects without a selection', async () => {
    const { attempts, call } = setup();
    expect((await call({}, 'solo')).status).toBe(200);
    expect(attempts).toEqual([{ userId: SOLO, businessId: SOLO_BIZ }]);
  });

  it('multi business without selection returns the controlled state and writes nothing', async () => {
    const { attempts, call } = setup();
    const res = await call({});
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe(BUSINESS_SELECTION_REQUIRED);
    expect(attempts).toEqual([]);
  });

  it('multi business with an explicit owned business connects that business only', async () => {
    const { attempts, call } = setup();
    expect((await call({ businessId: BIZ_B })).status).toBe(200);
    expect(attempts).toEqual([{ userId: MULTI, businessId: BIZ_B }]);
  });

  it('foreign, nonexistent and Google-account identifiers are rejected', async () => {
    const { attempts, call } = setup();
    for (const businessId of [OTHER_BIZ, GHOST_BIZ, GOOGLE_ACCOUNT]) {
      expect((await call({ businessId })).status).toBe(403);
    }
    expect(attempts).toEqual([]);
  });
});

describe('FIX02B · sync', () => {
  const setup = () => {
    const sources: Record<string, { id: string; status: string; metadata: Record<string, unknown> }> = {
      [`${MULTI}|${BIZ_A}`]: { id: 'src-a', status: 'connected', metadata: { phase: 'select_location' } },
      [`${MULTI}|${BIZ_B}`]: { id: 'src-b', status: 'connected', metadata: { phase: 'select_location' } },
      [`${SOLO}|${SOLO_BIZ}`]: { id: 'src-solo', status: 'connected', metadata: { phase: 'select_location' } },
    };
    const updated: string[] = [];
    const reviewsWrites: string[] = [];
    const store: CredentialStore = {
      read: async () => ({ accessToken: 'ya29.T', refreshToken: '1//R', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
      write: async () => true,
    };
    const deps: SyncDeps = {
      getUserId: async (jwt) => JWT[jwt] ?? null,
      getOwnBusinessId: ownBusinessId,
      loadSource: async (u, b) => sources[`${u}|${b}`] ?? null,
      credentials: () => store,
      updateSource: async (_u, id) => { updated.push(id); return true; },
      upsertReviews: async (u, b) => { reviewsWrites.push(`${u}|${b}`); return true; },
      addEvent: async () => undefined,
      fetch: (async (input: RequestInfo | URL) =>
        String(input).includes('/reviews') ? ok({ totalReviewCount: 3, averageRating: 4 }) : ok({ name: 'locations/456', title: 'Bar' })) as unknown as typeof fetch,
      env: (n) => ({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' } as Record<string, string>)[n],
      now: () => new Date(),
    };
    const call = (body: Record<string, unknown>, jwt?: string) =>
      createSync(deps)(post('https://x/gbp-sync', { accountId: GOOGLE_ACCOUNT, locationId: 'locations/456', locationName: 'Bar', ...body }, jwt));
    return { updated, reviewsWrites, call };
  };

  it('single business syncs without a selection', async () => {
    const { updated, call } = setup();
    expect((await call({}, 'solo')).status).toBe(200);
    expect(updated).toContain('src-solo');
  });

  it('multi business without selection returns the controlled state and touches nothing', async () => {
    const { updated, reviewsWrites, call } = setup();
    const res = await call({});
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe(BUSINESS_SELECTION_REQUIRED);
    expect(updated).toEqual([]);
    expect(reviewsWrites).toEqual([]);
  });

  it('syncing business B never touches business A', async () => {
    const { updated, reviewsWrites, call } = setup();
    expect((await call({ businessId: BIZ_B })).status).toBe(200);
    expect(updated.every((id) => id === 'src-b')).toBe(true);
    expect(updated.length).toBeGreaterThan(0);
    expect(reviewsWrites).toEqual([`${MULTI}|${BIZ_B}`]);
  });

  it('foreign and nonexistent businesses are rejected without writes', async () => {
    const { updated, reviewsWrites, call } = setup();
    expect((await call({ businessId: OTHER_BIZ })).status).toBe(403);
    expect((await call({ businessId: GHOST_BIZ })).status).toBe(403);
    expect((await call({ businessId: GOOGLE_ACCOUNT })).status).toBe(403);
    expect(updated).toEqual([]);
    expect(reviewsWrites).toEqual([]);
  });
});

describe('FIX02B · disconnect', () => {
  const SOURCES: Record<string, string> = { [`${MULTI}|${BIZ_A}`]: 'src-a', [`${MULTI}|${BIZ_B}`]: 'src-b', [`${SOLO}|${SOLO_BIZ}`]: 'src-solo' };
  const setup = () => {
    const removed: string[] = [];
    const deps: DisconnectDeps = {
      getUserId: async (jwt) => JWT[jwt] ?? null,
      resolveSource: async (u, b): Promise<ResolveResult> => {
        const r = resolveActiveBusiness(OWNERSHIP[u] ?? [], b);
        if (r.kind === 'selection_required') return { kind: 'selection_required' };
        if (r.kind !== 'resolved') return { kind: 'forbidden' };
        const id = SOURCES[`${u}|${r.businessId}`];
        return id ? { kind: 'found', sourceId: id } : { kind: 'none' };
      },
      credentials: () => ({ read: async () => null, write: async () => true }),
      removeSource: async (_u, id) => { removed.push(id); return true; },
      fetch: (async () => ok({})) as unknown as typeof fetch,
    };
    const call = (body: unknown, jwt?: string) => createDisconnect(deps)(post('https://x/gbp-disconnect', body, jwt));
    return { removed, call };
  };

  it('single business disconnects without a selection', async () => {
    const { removed, call } = setup();
    expect((await call({}, 'solo')).status).toBe(200);
    expect(removed).toEqual(['src-solo']);
  });

  it('multi business without selection returns the controlled state and removes nothing', async () => {
    const { removed, call } = setup();
    const res = await call({});
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe(BUSINESS_SELECTION_REQUIRED);
    expect(removed).toEqual([]);
  });

  it('disconnecting business A leaves business B connected', async () => {
    const { removed, call } = setup();
    expect((await call({ businessId: BIZ_A })).status).toBe(200);
    expect(removed).toEqual(['src-a']);
  });

  it('foreign, nonexistent and Google-account identifiers are rejected', async () => {
    const { removed, call } = setup();
    for (const businessId of [OTHER_BIZ, GHOST_BIZ, GOOGLE_ACCOUNT]) {
      expect((await call({ businessId })).status).toBe(403);
    }
    expect(removed).toEqual([]);
  });

  it('the server adapter scopes the reviews cleanup to the disconnected business', () => {
    const index = src('supabase/functions/gbp-disconnect/index.ts');
    expect(index).toMatch(/\.eq\("business_id", target\.business_id\)/);
    expect(index).toMatch(/resolveActiveBusiness\(/);
  });
});

describe('FIX02B · reading reviews', () => {
  const setup = () => {
    const resolved: string[] = [];
    const googleUrls: string[] = [];
    const deps: ReviewsDeps = {
      authorize: async (req) => {
        const jwt = req.headers.get('Authorization')?.slice(7) ?? '';
        return JWT[jwt] ? { ok: true, userId: JWT[jwt] } : { ok: false, response: new Response(null, { status: 401 }) };
      },
      resolveSource: async (u, b): Promise<SourceResolution> => {
        const r = resolveActiveBusiness(OWNERSHIP[u] ?? [], b ?? null);
        if (r.kind !== 'resolved') return { kind: r.kind };
        resolved.push(r.businessId);
        return { kind: 'found', sourceId: `src-${r.businessId}`, accountId: GOOGLE_ACCOUNT, locationId: `locations/${r.businessId}`, business: {} };
      },
      token: async () => ({ ok: true, accessToken: 'ya29.T', refreshed: false }),
      google: async (url) => { googleUrls.push(url); return ok({ reviews: [], totalReviewCount: 0 }); },
      reserve: async () => ({ status: 'reserved' }),
      settle: async () => true,
      callModel: async () => ({ ok: false, retryable: false }),
      log: () => undefined,
    };
    const call = (body: unknown, jwt?: string) => handleReviews(post('https://x/gbp-reviews', body, jwt), deps);
    return { resolved, googleUrls, call };
  };

  it('single business lists reviews without a selection', async () => {
    const { resolved, call } = setup();
    expect((await call({ action: 'list' }, 'solo')).status).toBe(200);
    expect(resolved).toEqual([SOLO_BIZ]);
  });

  it('multi business without selection returns the controlled state and never calls Google', async () => {
    const { googleUrls, call } = setup();
    const res = await call({ action: 'list' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'business_selection_required' });
    expect(googleUrls).toEqual([]);
  });

  it('explicit owned business reads only that business location', async () => {
    const { googleUrls, call } = setup();
    expect((await call({ action: 'list', businessId: BIZ_B })).status).toBe(200);
    expect(googleUrls.length).toBeGreaterThan(0);
    expect(googleUrls.every((u) => u.includes(`locations/${BIZ_B}/`))).toBe(true);
  });

  it('foreign and nonexistent businesses return the same not_found answer', async () => {
    const { googleUrls, call } = setup();
    const foreign = await call({ action: 'list', businessId: OTHER_BIZ });
    const ghost = await call({ action: 'list', businessId: GHOST_BIZ });
    expect([foreign.status, ghost.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual(await ghost.json());
    expect((await call({ action: 'list', businessId: GOOGLE_ACCOUNT })).status).toBe(422);
    expect(googleUrls).toEqual([]);
  });

  it('another user cannot read a business they do not own', async () => {
    const { googleUrls, call } = setup();
    expect((await call({ action: 'list', businessId: BIZ_A }, 'other')).status).toBe(404);
    expect(googleUrls).toEqual([]);
  });
});

describe('FIX02B · browser side', () => {
  const invokeWith = (result: { data: unknown; error: unknown }) => {
    const invoke = vi.fn(async () => result);
    return { invoke, db: { functions: { invoke }, rpc: vi.fn() } as unknown as Parameters<typeof loadReviews>[0] };
  };

  it('reviews requests carry the active business when known and stay unchanged otherwise', async () => {
    const a = invokeWith({ data: { status: 'ok', reviews: [] }, error: null });
    await loadReviews(a.db);
    expect(a.invoke).toHaveBeenLastCalledWith('gbp-reviews', { body: { action: 'list' } });
    await loadReviews(a.db, BIZ_B);
    expect(a.invoke).toHaveBeenLastCalledWith('gbp-reviews', { body: { action: 'list', businessId: BIZ_B } });

    const d = invokeWith({ data: { status: 'drafted', draft: 'Gracias', reviewId: 'r1' }, error: null });
    await draftReply({ reviewId: 'r1', lang: 'es', businessId: BIZ_B }, d.db);
    expect((d.invoke.mock.calls[0] as unknown[])[1]).toMatchObject({ body: { action: 'draft', reviewId: 'r1', businessId: BIZ_B } });
  });

  it('the controlled state is surfaced as its own error with copy in both languages', async () => {
    const response = new Response(JSON.stringify({ error: 'business_selection_required' }), { status: 409 });
    const { db } = invokeWith({ data: null, error: { context: response } });
    await expect(loadReviews(db)).rejects.toEqual(new ReviewsError('business_selection_required'));
    expect(COPY.es.errors.business_selection_required).toBeTruthy();
    expect(COPY.en.errors.business_selection_required).toBeTruthy();
  });

  it('server adapters never resolve a business by user alone with maybeSingle', () => {
    for (const p of ['gbp-oauth-start', 'gbp-sync', 'gbp-disconnect', 'gbp-reviews']) {
      const index = src(`supabase/functions/${p}/index.ts`);
      expect(index).toMatch(/limit\(OWNED_BUSINESS_LOOKUP_LIMIT\)/);
      expect(index).toMatch(/resolveActiveBusiness\(/);
    }
  });

  it('no persistent selection storage was introduced', () => {
    const ctx = src('src/features/business-memory/BusinessContext.tsx');
    expect(ctx).not.toMatch(/setItem|sessionStorage|selectedBusinessId/);
  });
});

describe('FIX02B · business context resolution', () => {
  const row = (id: string, user_id: string) => ({
    id, user_id, name: id, category: '', city: '', website: '', phone: '', schedule: '', target_audience: '',
    services: [], primary_goal: null, secondary_goals: [], onboarding_completed: true,
    onboarding_completed_at: null, legacy_memory_migrated_at: null,
  });
  const fakeDb = (uid: string, rows: ReturnType<typeof row>[]) => {
    const upsert = vi.fn(async () => ({ error: null }));
    const db = {
      from: () => ({
        select: () => {
          const filters: [string, unknown][] = [];
          const q = {
            eq(k: string, v: unknown) { filters.push([k, v]); return q; },
            async limit(n: number) {
              const visible = rows.filter((r) => r.user_id === uid && filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
              return { data: visible.slice(0, n), error: null };
            },
          };
          return q;
        },
        upsert,
      }),
    };
    return { upsert, db: db as unknown as Parameters<typeof resolveBusiness>[1] };
  };
  const UA = '00000000-0000-4000-8000-00000000000a';
  const UB = '00000000-0000-4000-8000-00000000000b';
  const UO = '00000000-0000-4000-8000-00000000000c';
  const UGHOST = '00000000-0000-4000-8000-00000000000d';
  const ROWS = [row(UA, MULTI), row(UB, MULTI), row(UO, OTHER)];

  it('one business resolves as before', async () => {
    const { db } = fakeDb(OTHER, ROWS);
    expect((await resolveBusiness(OTHER, db)).id).toBe(UO);
  });

  it('two businesses without selection raise the controlled state and create nothing', async () => {
    const { db, upsert } = fakeDb(MULTI, ROWS);
    const err = await resolveBusiness(MULTI, db).catch((e) => e);
    expect(err).toBeInstanceOf(ActiveBusinessError);
    expect(err.kind).toBe('selection_required');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('an explicit owned business resolves; foreign and nonexistent ones do not', async () => {
    const { db } = fakeDb(MULTI, ROWS);
    expect((await resolveBusiness(MULTI, db, UB)).id).toBe(UB);
    await expect(resolveBusiness(MULTI, db, UO)).rejects.toThrow('No se encontro el negocio');
    await expect(resolveBusiness(MULTI, db, UGHOST)).rejects.toThrow('No se encontro el negocio');
  });
});

describe('FIX02B · F01/F02 preserved', () => {
  it('sync still keeps the failed-review and invalid-profile guards', () => {
    const handler = src('supabase/functions/gbp-sync/handler.ts');
    expect(handler).toMatch(/export function parseLocationProfile/);
    expect(handler).toMatch(/export function parseReviewsSummary/);
  });
});
