import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as jpeg from 'jpeg-js';
import type { PreflightRow } from '../../../../supabase/functions/instagram-publishing/shared.ts';
import type { Codecs } from '../../../../supabase/functions/instagram-publishing/derivative.ts';
import { publishContainer } from '../../../../supabase/functions/instagram-publishing/graph.ts';
import {
  ARMED_FLAG, ARMED_USERS, createInstagramPublishHandler,
  type BeginRow, type InstagramContext, type InstagramPublishDeps,
} from '../../../../supabase/functions/instagram-publishing/instagramPublish.ts';
import { APPROVED_TARGET, captionMatches, imageMatchesTarget, isTargetPublication, sha256Hex } from '../../../../supabase/functions/instagram-publishing/publishTarget.ts';
import { createDb, type Db, type Stage } from './gateB4Fix01DbModel';

// A3.7.4.3 GATE B.4 FIX01: publishing-path safety, driven through the real handler with mocked Graph and an
// in-memory database model of the prepared migration. No network, no production database.
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BIZ = '33333333-3333-4333-8333-333333333333';
const PUB = '44444444-4444-4444-8444-444444444444';
const IMG = '55555555-5555-4555-8555-555555555555';
const PAGE = '1393994523793266';
const IG = '17841462487279994';
const CONTAINER = '18012345678901234';
const MEDIA = '18098765432109876';
const CAPTION = 'Texto aprobado para la prueba interna #local';
const PERMALINK = 'https://www.instagram.com/p/ABC123/';
const hex = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const jpegOf = (w: number, h: number, v: number) => {
  const data = new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v));
  return new Uint8Array(jpeg.encode({ data, width: w, height: h }, 92).data);
};
const SOURCE = jpegOf(800, 600, 128);
const OTHER_IMAGE = jpegOf(800, 600, 90);
const codecs: Codecs = {
  decodeJpeg(bytes, maxMegapixels) {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: maxMegapixels, maxMemoryUsageInMB: 400 });
    return { width: img.width, height: img.height, data: img.data };
  },
  decodePng() { throw new Error('png not used'); },
  encodeJpeg(image, quality) {
    return new Uint8Array(jpeg.encode({ data: image.data, width: image.width, height: image.height }, quality).data);
  },
};

const TARGET = { publicationId: PUB, version: 4, captionSha256: hex(CAPTION), imageSha256: hex(SOURCE) };
const ENV: Record<string, string> = {
  [ARMED_FLAG]: 'true', [ARMED_USERS]: USER, META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS: PUB, META_APP_SECRET: 'app-secret-value',
};

type Reply = Response | 'throw' | 'abort';
interface Meta { container?: Reply; publish?: Reply; listing?: Response; onContainer?: () => void }

function metaFetch(m: Meta) {
  const send = (r: Reply) => {
    if (r === 'throw') throw new Error('network reset');
    if (r === 'abort') throw new DOMException('timed out', 'AbortError');
    return r.clone();
  };
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const fields = url.searchParams.get('fields');
    if (init?.method === 'POST' && url.pathname.endsWith(`/${IG}/media`)) {
      m.onContainer?.();
      return send(m.container ?? res({ id: CONTAINER }));
    }
    if (init?.method === 'POST' && url.pathname.endsWith(`/${IG}/media_publish`)) return send(m.publish ?? res({ id: MEDIA }));
    if (fields === 'id,access_token,instagram_business_account') return res({ id: PAGE, access_token: 'EAApageTokenAAAAAAAAAAAAAAAAAAAAAA', instagram_business_account: { id: IG } });
    if (fields === 'status_code') return res({ status_code: 'FINISHED' });
    if (fields === 'id,permalink') return res({ id: MEDIA, permalink: PERMALINK });
    if (fields === 'id,caption,timestamp,permalink') return (m.listing ?? res({ data: [] })).clone();
    return res({ error: { code: 100 } }, 400);
  });
}

interface Draft { version: number; caption: string; image: { path: string; mime: string } }
interface Hooks {
  beforeAdvance?: (stage: Stage) => Promise<void> | void;
  afterAdvance?: (stage: Stage, result: string) => void;
  beforeMarkStale?: () => Promise<void> | void;
}

function harness(opts: { fixed?: boolean; meta?: Meta; env?: Record<string, string>; deps?: Partial<InstagramPublishDeps>; now?: string } = {}) {
  const db: Db = createDb(opts.fixed ?? true);
  const draft: Draft = { version: 4, caption: CAPTION, image: { path: `${USER}/${BIZ}/${PUB}/${IMG}.jpg`, mime: 'image/jpeg' } };
  const hooks: Hooks = {};
  const store = new Map<string, Uint8Array>();
  const original = { bytes: SOURCE };
  const ent = { results: [] as (boolean | 'throw')[], fallback: true as boolean };
  const meta: Meta = opts.meta ?? {};
  const fetch = metaFetch(meta);
  const env = opts.env ?? ENV;

  const igIssue = (userId: string, v: number): string | null => {
    const row = db.latest('instagram');
    if (userId !== USER) return 'INVALID_PUBLICATION_STATE';
    if (row?.status === 'succeeded') return 'ALREADY_PUBLISHED';
    if (row?.status === 'unknown') return 'PUBLISH_OUTCOME_UNKNOWN';
    if (row?.status === 'publishing') return 'PUBLISH_IN_PROGRESS';
    if (v !== draft.version) return 'VERSION_CONFLICT';
    return null;
  };
  const entitlementActive = vi.fn(async () => {
    const next = ent.results.length ? ent.results.shift()! : ent.fallback;
    if (next === 'throw') throw new Error('rpc down');
    return next;
  });
  const d: InstagramPublishDeps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'other' ? OTHER : USER)),
    target: TARGET,
    entitlementActive,
    preflight: vi.fn(async (userId: string, _p: string, v: number): Promise<PreflightRow[]> => {
      const row = db.latest('instagram');
      return [{
        channel: 'instagram', issue: igIssue(userId, v), draft_version: draft.version, attempt_status: row?.status ?? null,
        attempt_error_code: row?.errorCode ?? null, meta_object_id: row?.metaObjectId ?? null, permalink: null,
        attempt_updated_at: '2025-06-01T00:00:00Z', attempt_retryable: row?.retryable ?? false, attempt_verification_required: row?.verificationRequired ?? false,
      }];
    }),
    context: vi.fn(async (userId: string): Promise<InstagramContext | null> => {
      if (userId !== USER) return null;
      const row = db.latest('instagram');
      return {
        pageId: PAGE, igUserId: IG, igUsername: 'localseohub.io', permissions: [], caption: draft.caption, version: draft.version,
        draftUpdatedAt: '2026-01-01T00:00:00Z', image: { ...draft.image },
        attempt: row ? { id: row.id, status: row.status, externalStage: row.stage, containerStored: row.container !== null, startedAt: row.startedAt } : null,
      };
    }),
    begin: vi.fn(async (userId: string, _p: string, v: number): Promise<BeginRow> => {
      const empty = { attempt_id: null, draft_version: null, caption: null, image_path: null, image_mime: null, page_id: null, instagram_account_id: null };
      if (userId !== USER || v !== draft.version) return { result: 'VERSION_CONFLICT', ...empty };
      const r = db.begin(userId, 'instagram');
      if (r.result !== 'OK') return { result: r.result, ...empty };
      return { result: 'OK', attempt_id: r.id, draft_version: draft.version, caption: draft.caption, image_path: draft.image.path, image_mime: draft.image.mime, page_id: PAGE, instagram_account_id: IG };
    }),
    advance: vi.fn(async (userId: string, attemptId: string, stage: Exclude<Stage, 'none'>, containerId: string | null) => {
      await hooks.beforeAdvance?.(stage);
      const r = db.advance(userId, attemptId, stage, containerId);
      hooks.afterAdvance?.(stage, r);
      return r;
    }),
    finish: vi.fn(async (userId: string, attemptId: string, outcome: 'succeeded' | 'failed' | 'unknown', objectId: string | null, _l: string | null, code: string | null) =>
      db.finish(userId, attemptId, outcome, objectId, code)),
    markStale: vi.fn(async (attemptId: string, staleBefore: string) => {
      await hooks.beforeMarkStale?.();
      return db.markStale(attemptId, staleBefore);
    }),
    recordVerification: vi.fn(async (userId: string, attemptId: string, verdict: 'found' | 'absent' | 'inconclusive', mediaId: string | null) =>
      db.recordVerification(userId, attemptId, verdict, mediaId)),
    readUserToken: vi.fn(async () => 'EAAuserTokenAAAAAAAAAAAAAAAAAAAAAA'),
    downloadImage: vi.fn(async () => ({ ok: true as const, bytes: original.bytes, contentType: 'image/jpeg' })),
    storeDerivative: vi.fn(async (path: string, bytes: Uint8Array) => { store.set(path, bytes); return true; }),
    downloadDerivative: vi.fn(async (path: string) => store.get(path) ?? null),
    signDerivative: vi.fn(async (path: string) => `https://proj.supabase.co/storage/v1/object/sign/instagram-derivatives/${path}?token=t`),
    removeDerivative: vi.fn(async (path: string) => { store.delete(path); }),
    codecs,
    env: (k: string) => env[k],
    fetch: fetch as unknown as typeof globalThis.fetch,
    sleep: vi.fn(async () => undefined),
    now: () => Date.parse(opts.now ?? '2026-11-01T10:10:00Z'),
    ...opts.deps,
  };
  const handle = createInstagramPublishHandler(d);
  const call = async (body: Record<string, unknown>, jwt = 'jwt') => {
    const r = await handle(new Request('http://local/instagram-publishing', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) }));
    return { status: r.status, body: await r.json() as Record<string, unknown> };
  };
  const posts = (suffix: string) => fetch.mock.calls.filter((c) => c[1]?.method === 'POST' && new URL(String(c[0])).pathname.endsWith(suffix)).length;
  return {
    db, draft, hooks, store, original, ent, meta, fetch, deps: d,
    publish: (extra: Record<string, unknown> = {}, jwt?: string) => call({ action: 'instagram_publish', publicationId: PUB, expectedVersion: 4, ...extra }, jwt),
    verify: (jwt?: string) => call({ action: 'instagram_publish_verify', publicationId: PUB, expectedVersion: 4 }, jwt),
    call,
    containers: () => posts(`/${IG}/media`),
    mediaPublishes: () => posts(`/${IG}/media_publish`),
    graphPosts: () => fetch.mock.calls.filter((c) => c[1]?.method === 'POST').length,
  };
}
const ig = (h: ReturnType<typeof harness>) => h.db.latest('instagram');
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
const FOUND = res({ data: [{ id: MEDIA, caption: CAPTION, timestamp: '2026-11-01T10:00:30+0000', permalink: PERMALINK }] });

describe('B.4 FIX01 F1 concurrency: verification racing an active publisher', () => {
  async function staleSnapshotRace(fixed: boolean, listing?: Response) {
    const h = harness({ fixed, meta: { listing } });
    const atAdvance = gate();
    const release = gate();
    const applied = gate();
    h.hooks.beforeAdvance = async (s) => { if (s === 'publish_requested') { atAdvance.open(); await release.p; } };
    h.hooks.afterAdvance = (s) => { if (s === 'publish_requested') applied.open(); };
    // Verify reads its snapshot (stage container_created) and only then lets the publisher reach publish_requested.
    h.hooks.beforeMarkStale = async () => { release.open(); await applied.p; };
    const publishing = h.publish();
    await atAdvance.p;
    expect(ig(h)!.stage).toBe('container_created');
    const verified = await h.verify();
    const published = await publishing;
    return { h, verified, published };
  }

  it('reproduces the finding on the pre-FIX01 model: a stale snapshot records "absent" and a retry publishes twice', async () => {
    const { h, verified } = await staleSnapshotRace(false);
    expect(verified.body).toMatchObject({ state: 'FAILED', verdict: 'absent', retryable: true });
    const retry = await h.publish({ retry: true });
    expect(retry.status).toBe(200);
    expect(h.mediaPublishes()).toBe(2);
  });

  it('with the prepared migration the row-locked stage refuses "absent": the attempt stays UNKNOWN and no duplicate is possible', async () => {
    const { h, verified, published } = await staleSnapshotRace(true);
    expect(h.deps.recordVerification).toHaveBeenCalledWith(USER, expect.any(String), 'absent', null, null);
    expect(verified).toMatchObject({ status: 409, body: { code: 'PUBLISH_OUTCOME_UNKNOWN', state: 'UNKNOWN' } });
    expect(published).toMatchObject({ status: 202, body: { code: 'PUBLISH_OUTCOME_UNKNOWN', state: 'UNKNOWN' } });
    expect(ig(h)).toMatchObject({ status: 'unknown', stage: 'publish_requested', retryable: false, verificationRequired: true });
    for (const retry of [true, false]) expect((await h.publish({ retry })).body.code).toBe('PUBLISH_OUTCOME_UNKNOWN');
    expect(h.mediaPublishes()).toBe(1);
    expect(h.db.rows).toHaveLength(1);
  });

  it('after "unsafe_absent" an exact read-only match settles the attempt as SUCCEEDED', async () => {
    const { h, verified } = await staleSnapshotRace(true, FOUND);
    expect(verified.body).toMatchObject({ state: 'SUCCEEDED', verdict: 'found', meta_object_id: MEDIA });
    expect(ig(h)).toMatchObject({ status: 'succeeded', metaObjectId: MEDIA });
    expect(h.mediaPublishes()).toBe(1);
  });

  it('verification that wins before publish_requested freezes the stage: the publisher never sends /media_publish', async () => {
    const h = harness();
    const atAdvance = gate();
    const release = gate();
    h.hooks.beforeAdvance = async (s) => { if (s === 'publish_requested') { atAdvance.open(); await release.p; } };
    const publishing = h.publish();
    await atAdvance.p;
    const verified = await h.verify();
    expect(verified.body).toMatchObject({ state: 'FAILED', verdict: 'absent', retryable: true });
    release.open();
    const published = await publishing;
    expect(published.status).toBe(500);
    expect(h.containers()).toBe(1);
    expect(h.mediaPublishes()).toBe(0);
    expect(ig(h)).toMatchObject({ status: 'failed', stage: 'container_created' });
  });

  it('a non-stale publishing attempt is left alone (PUBLISH_IN_PROGRESS) and the publisher finishes normally', async () => {
    const h = harness({ now: '2026-11-01T10:01:00Z' });
    const atAdvance = gate();
    const release = gate();
    h.hooks.beforeAdvance = async (s) => { if (s === 'publish_requested') { atAdvance.open(); await release.p; } };
    const publishing = h.publish();
    await atAdvance.p;
    expect((await h.verify()).body).toMatchObject({ code: 'PUBLISH_IN_PROGRESS', state: 'PUBLISHING' });
    expect(h.deps.recordVerification).not.toHaveBeenCalled();
    release.open();
    expect((await publishing).body).toMatchObject({ ok: true, state: 'SUCCEEDED' });
    expect(h.mediaPublishes()).toBe(1);
  });

  it('two concurrent publish requests create one attempt, one container and one /media_publish', async () => {
    const h = harness();
    const [a, b] = await Promise.all([h.publish(), h.publish()]);
    expect([a.body.state, b.body.state].sort()).toEqual(['PUBLISHING', 'SUCCEEDED']);
    expect(h.db.rows).toHaveLength(1);
    expect(h.containers()).toBe(1);
    expect(h.mediaPublishes()).toBe(1);
    expect((await h.publish()).body.code).toBe('ALREADY_PUBLISHED');
    expect(h.mediaPublishes()).toBe(1);
  });
});

describe('B.4 FIX01 F2 internal-test entitlement on every write boundary', () => {
  it('no entitlement: 403 before any database attempt or Graph write', async () => {
    const h = harness();
    h.ent.fallback = false;
    expect(await h.publish()).toMatchObject({ status: 403, body: { code: 'REAL_PUBLISH_DISABLED', state: 'NOT_REQUESTED' } });
    expect(h.deps.begin).not.toHaveBeenCalled();
    expect(h.graphPosts()).toBe(0);
  });

  it('entitlement check that errors is treated as expired (fail closed)', async () => {
    const h = harness();
    h.ent.results = ['throw'];
    expect((await h.publish()).status).toBe(403);
    expect(h.deps.begin).not.toHaveBeenCalled();
  });

  it('the database refuses to create an Instagram attempt when the entitlement expired after the server check', async () => {
    const h = harness();
    h.db.state.entitled = false;
    expect((await h.publish()).body).toMatchObject({ code: 'PERMISSION_REQUIRED' });
    expect(h.db.rows).toHaveLength(0);
    expect(h.graphPosts()).toBe(0);
  });

  it('expiry after the attempt starts stops the container request', async () => {
    const h = harness();
    h.ent.results = [true, false];
    expect(await h.publish()).toMatchObject({ status: 403, body: { code: 'REAL_PUBLISH_DISABLED', state: 'FAILED' } });
    expect(h.graphPosts()).toBe(0);
    expect(ig(h)).toMatchObject({ status: 'failed', stage: 'none' });
  });

  it('expiry between the container and /media_publish stops the final write', async () => {
    const h = harness();
    h.ent.results = [true, true, 'throw'];
    expect((await h.publish()).body).toMatchObject({ code: 'REAL_PUBLISH_DISABLED', state: 'FAILED' });
    expect(h.containers()).toBe(1);
    expect(h.mediaPublishes()).toBe(0);
    expect(ig(h)).toMatchObject({ status: 'failed', stage: 'container_created' });
  });

  it('a successful publish checks the entitlement before begin, before /media and before /media_publish', async () => {
    const h = harness();
    expect((await h.publish()).body.state).toBe('SUCCEEDED');
    expect(h.deps.entitlementActive).toHaveBeenCalledTimes(3);
  });

  it('an expired entitlement does not block investigating an UNKNOWN attempt', async () => {
    const h = harness({ meta: { publish: res({ error: { code: 1 } }, 500), listing: FOUND } });
    expect((await h.publish()).body.state).toBe('UNKNOWN');
    h.ent.fallback = false;
    h.db.state.entitled = false;
    const calls = h.deps.entitlementActive as ReturnType<typeof vi.fn>;
    const before = calls.mock.calls.length;
    expect((await h.verify()).body).toMatchObject({ state: 'SUCCEEDED', verdict: 'found' });
    expect(calls.mock.calls.length).toBe(before);
    expect(h.mediaPublishes()).toBe(1);
  });
});

describe('B.4 FIX01 allowlists are preserved', () => {
  const cases: [string, Record<string, string>, string?][] = [
    ['real publishing switched off', { ...ENV, [ARMED_FLAG]: 'false' }],
    ['user not on the owner allowlist', { ...ENV, [ARMED_USERS]: OTHER }],
    ['publication not on the publication allowlist', { ...ENV, META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS: '77777777-7777-4777-8777-777777777777' }],
    ['other signed-in account', ENV, 'other'],
  ];
  for (const [name, env, jwt] of cases) {
    it(`${name}: publish and verify are refused with no write`, async () => {
      const h = harness({ env });
      expect((await h.publish({}, jwt)).status).toBe(403);
      expect((await h.verify(jwt)).status).toBe(403);
      expect(h.deps.begin).not.toHaveBeenCalled();
      expect(h.graphPosts()).toBe(0);
    });
  }

  it('an allowlisted publication that is not the pinned target is refused', async () => {
    const other = '88888888-8888-4888-8888-888888888888';
    const h = harness({ env: { ...ENV, META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS: `${PUB},${other}` } });
    expect((await h.call({ action: 'instagram_publish', publicationId: other, expectedVersion: 4 })).status).toBe(403);
    expect(h.deps.begin).not.toHaveBeenCalled();
  });
});

describe('B.4 FIX01 F3-F5 pinned version, caption and image', () => {
  it('the production pins are exactly the approved values and are frozen', () => {
    expect(APPROVED_TARGET).toEqual({
      publicationId: '875587f5-0137-4477-904c-609e8e406ad6', version: 3,
      captionSha256: '537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e',
      imageSha256: '6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7',
    });
    expect(Object.isFrozen(APPROVED_TARGET)).toBe(true);
    expect(isTargetPublication(APPROVED_TARGET, '875587F5-0137-4477-904C-609E8E406AD6')).toBe(true);
    expect(isTargetPublication(APPROVED_TARGET, PUB)).toBe(false);
  });

  it('hash helpers compare real bytes', async () => {
    expect(await sha256Hex(SOURCE)).toBe(hex(SOURCE));
    expect(await captionMatches(TARGET, CAPTION)).toBe(true);
    expect(await captionMatches(TARGET, `${CAPTION} `)).toBe(false);
    expect(await captionMatches(TARGET, null)).toBe(false);
    expect(await imageMatchesTarget(TARGET, SOURCE)).toBe(true);
    expect(await imageMatchesTarget(TARGET, OTHER_IMAGE)).toBe(false);
    expect(await imageMatchesTarget({ ...TARGET, imageSha256: hex(new Uint8Array()) }, new Uint8Array())).toBe(false);
  });

  it('browser-supplied hashes or versions beyond the allowed fields are rejected outright', async () => {
    const h = harness();
    for (const extra of [{ captionSha256: TARGET.captionSha256 }, { imageSha256: TARGET.imageSha256 }, { target: TARGET }]) {
      expect((await h.publish(extra)).status).toBe(400);
    }
    expect(h.deps.begin).not.toHaveBeenCalled();
  });

  it('requested version different from the pinned version: VERSION_CONFLICT before any attempt', async () => {
    const h = harness();
    expect((await h.publish({ expectedVersion: 5 })).body.code).toBe('VERSION_CONFLICT');
    expect(h.deps.begin).not.toHaveBeenCalled();
  });

  it('saved draft moved to another version: refused with no attempt or write', async () => {
    const h = harness();
    h.draft.version = 5;
    expect((await h.publish()).body.code).toBe('VERSION_CONFLICT');
    expect(h.db.rows).toHaveLength(0);
    expect(h.graphPosts()).toBe(0);
  });

  it('edited caption: attempt fails before any Graph write', async () => {
    const h = harness();
    h.draft.caption = `${CAPTION} editado`;
    expect((await h.publish()).body).toMatchObject({ code: 'INTERNAL_ERROR', state: 'FAILED' });
    expect(h.graphPosts()).toBe(0);
  });

  it('substituted original image bytes: IMAGE_UNSUPPORTED before any Graph write', async () => {
    const h = harness();
    h.original.bytes = OTHER_IMAGE;
    expect((await h.publish()).body).toMatchObject({ code: 'IMAGE_UNSUPPORTED', state: 'FAILED' });
    expect(h.graphPosts()).toBe(0);
  });

  const midFlow: [string, (h: ReturnType<typeof harness>) => void][] = [
    ['caption edited', (h) => { h.draft.caption = 'otro texto'; }],
    ['draft version bumped', (h) => { h.draft.version = 5; }],
    ['image path swapped', (h) => { h.draft.image = { path: `${USER}/${BIZ}/${PUB}/99999999-9999-4999-8999-999999999999.jpg`, mime: 'image/jpeg' }; }],
    ['stored derivative replaced', (h) => { for (const k of h.store.keys()) h.store.set(k, OTHER_IMAGE); }],
    ['stored derivative removed', (h) => { h.store.clear(); }],
  ];
  for (const [name, mutate] of midFlow) {
    it(`${name} after validation: no container is requested`, async () => {
      const h = harness();
      (h.deps.signDerivative as ReturnType<typeof vi.fn>).mockImplementationOnce(async (p: string) => { mutate(h); return `https://proj.supabase.co/x/${p}?token=t`; });
      expect((await h.publish()).body).toMatchObject({ code: 'INTERNAL_ERROR', state: 'FAILED' });
      expect(h.graphPosts()).toBe(0);
    });

    it(`${name} after the container: /media_publish is never sent`, async () => {
      const h = harness();
      h.meta.onContainer = () => mutate(h);
      expect((await h.publish()).body).toMatchObject({ code: 'INTERNAL_ERROR', state: 'FAILED' });
      expect(h.containers()).toBe(1);
      expect(h.mediaPublishes()).toBe(0);
      expect(ig(h)).toMatchObject({ status: 'failed', stage: 'container_created' });
    });
  }

  it('the container carries exactly the validated caption and the derivative is removed afterwards', async () => {
    const h = harness();
    expect((await h.publish()).body.state).toBe('SUCCEEDED');
    const body = new URLSearchParams(String(h.fetch.mock.calls.find((c) => String(c[0]).endsWith(`/${IG}/media`))![1]!.body));
    expect(body.get('caption')).toBe(CAPTION);
    expect(h.store.size).toBe(0);
  });
});

describe('B.4 FIX01 F6 ambiguous outcomes after /media_publish become UNKNOWN', () => {
  const replies: [string, Reply][] = [
    ['HTTP 429 rate limit', res({ error: { code: 4, message: 'rate' } }, 429)],
    ['HTTP 429 without body', new Response('', { status: 429 })],
    ['temporary 4xx (code 2)', res({ error: { code: 2, is_transient: true } }, 400)],
    ['explicit 400 rejection', res({ error: { code: 100 } }, 400)],
    ['403 permission reply', res({ error: { code: 10 } }, 403)],
    ['HTTP 500', res({ error: { code: 1 } }, 500)],
    ['HTTP 503 non-JSON', new Response('<html>busy</html>', { status: 503 })],
    ['network failure', 'throw'],
    ['timeout', 'abort'],
    ['malformed success body', res({})],
    ['non-numeric id', res({ id: 'abc' })],
    ['non-JSON success', new Response('ok', { status: 200 })],
  ];
  for (const [name, reply] of replies) {
    it(`${name}: UNKNOWN, one /media_publish, no retry possible`, async () => {
      const h = harness({ meta: { publish: reply } });
      expect(await h.publish()).toMatchObject({ status: 202, body: { code: 'PUBLISH_OUTCOME_UNKNOWN', state: 'UNKNOWN' } });
      expect(ig(h)).toMatchObject({ status: 'unknown', stage: 'publish_requested', retryable: false, verificationRequired: true });
      for (const retry of [true, false]) expect((await h.publish({ retry })).body.code).toBe('PUBLISH_OUTCOME_UNKNOWN');
      expect(h.mediaPublishes()).toBe(1);
    });
  }

  it('lost success (post created, recording fails): 202 UNKNOWN and recovery finds the post', async () => {
    const h = harness({ meta: { listing: FOUND } });
    (h.deps.finish as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
    expect(await h.publish()).toMatchObject({ status: 202, body: { state: 'UNKNOWN' } });
    expect(ig(h)).toMatchObject({ status: 'publishing', stage: 'publish_requested' });
    expect((await h.publish({ retry: true })).body.code).toBe('PUBLISH_IN_PROGRESS');
    expect((await h.verify()).body).toMatchObject({ state: 'SUCCEEDED', meta_object_id: MEDIA });
    expect(h.mediaPublishes()).toBe(1);
  });

  it('database failure while recording UNKNOWN still answers 202 and keeps blocking', async () => {
    const h = harness({ meta: { publish: 'throw' } });
    (h.deps.finish as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    expect((await h.publish()).status).toBe(202);
    expect(ig(h)).toMatchObject({ status: 'publishing', stage: 'publish_requested' });
    expect((await h.publish()).body.code).toBe('PUBLISH_IN_PROGRESS');
    expect(h.mediaPublishes()).toBe(1);
  });

  it('the database stores a "failed" report after publish_requested as UNKNOWN (ok_unknown)', async () => {
    const h = harness();
    h.hooks.afterAdvance = (s) => { if (s === 'publish_requested') throw new Error('crash after stage write'); };
    const r = await h.publish();
    expect(r).toMatchObject({ status: 202, body: { code: 'PUBLISH_OUTCOME_UNKNOWN', state: 'UNKNOWN' } });
    expect(ig(h)).toMatchObject({ status: 'unknown', stage: 'publish_requested', retryable: false });
    expect(h.mediaPublishes()).toBe(0);
  });

  it('publishContainer never reports a definite failure once the request was sent', async () => {
    for (const [, reply] of replies) {
      const out = await publishContainer({ token: 't', appSecret: 's', igUserId: IG, containerId: CONTAINER, fetch: metaFetch({ publish: reply }) as unknown as typeof fetch });
      expect(out).toEqual({ kind: 'unknown' });
    }
    const slow = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    expect(await publishContainer({ token: 't', appSecret: 's', igUserId: IG, containerId: CONTAINER, timeoutMs: 5, fetch: slow as unknown as typeof fetch })).toEqual({ kind: 'unknown' });
    expect(slow).toHaveBeenCalledTimes(1);
    expect(await publishContainer({ token: 't', appSecret: 's', igUserId: IG, containerId: CONTAINER, fetch: metaFetch({}) as unknown as typeof fetch })).toEqual({ kind: 'created', id: MEDIA });
    expect(await publishContainer({ token: 't', appSecret: 's', igUserId: 'x', containerId: CONTAINER, fetch: slow as unknown as typeof fetch })).toEqual({ kind: 'failed', code: 'INTERNAL_ERROR' });
    expect(slow).toHaveBeenCalledTimes(1);
  });

});

describe('B.4 FIX01 UNKNOWN recovery', () => {
  it('no exact match: stays UNKNOWN, counts the check, still blocks new attempts', async () => {
    const h = harness({ meta: { publish: res({ error: { code: 1 } }, 500) } });
    await h.publish();
    expect((await h.verify())).toMatchObject({ status: 409, body: { code: 'PUBLISH_OUTCOME_UNKNOWN' } });
    expect(ig(h)).toMatchObject({ status: 'unknown', verificationAttempts: 1 });
    expect((await h.publish({ retry: true })).body.code).toBe('PUBLISH_OUTCOME_UNKNOWN');
    expect(h.mediaPublishes()).toBe(1);
  });

  it('UNKNOWN before /media_publish was ever requested resolves to a safe, single retry', async () => {
    const h = harness({ meta: { container: 'throw' } });
    expect((await h.publish()).body.state).toBe('UNKNOWN');
    expect(ig(h)!.stage).toBe('container_requested');
    expect((await h.verify()).body).toMatchObject({ state: 'FAILED', verdict: 'absent', retryable: true });
    h.meta.container = undefined;
    expect((await h.publish({ retry: true })).body.state).toBe('SUCCEEDED');
    expect(h.mediaPublishes()).toBe(1);
  });

  it('a settled attempt cannot be re-verified', async () => {
    const h = harness();
    await h.publish();
    expect((await h.verify()).status).toBe(409);
  });
});
