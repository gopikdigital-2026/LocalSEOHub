import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as jpeg from 'jpeg-js';
import { META_GRAPH_VERSION, type PreflightRow } from '../../../../supabase/functions/instagram-publishing/shared.ts';
import type { Codecs } from '../../../../supabase/functions/instagram-publishing/derivative.ts';
import {
  ARMED_FLAG, ARMED_PUBLICATIONS, ARMED_USERS, createInstagramPublishHandler, isArmed, isAuthorizedToPublish, isPublicationAllowed,
  type BeginRow, type InstagramContext, type InstagramPublishDeps, type Stage,
} from '../../../../supabase/functions/instagram-publishing/instagramPublish.ts';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');

const USER = 'aabe426e-f079-4db1-835b-17d9d126313e';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PUB_A = '65569535-5d89-4df3-a8d4-c2af6df8606d';
const PUB_B = '442059e5-11e4-4bdd-a5bc-c714b0a03b72';
const PUB_C = 'b140fc59-6458-47d7-b695-df8781610ea5';
const PUB_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BIZ = '33333333-3333-4333-8333-333333333333';
const IMG = '55555555-5555-4555-8555-555555555555';
const PAGE = '1393994523793266';
const IG = '17841462487279994';
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const JPEG = (() => {
  const w = 800, h = 600, d = new Uint8Array(w * h * 4).fill(128);
  return new Uint8Array(jpeg.encode({ data: d, width: w, height: h }, 90).data);
})();
const codecs: Codecs = {
  decodeJpeg: (b, mp) => { const i = jpeg.decode(b, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: mp }); return { width: i.width, height: i.height, data: i.data }; },
  decodePng: () => { throw new Error('unused'); },
  encodeJpeg: (img, q) => new Uint8Array(jpeg.encode({ data: img.data, width: img.width, height: img.height }, q).data),
};

const armedFor = (pubs: string | undefined): Record<string, string> => {
  const env: Record<string, string> = { [ARMED_FLAG]: 'true', [ARMED_USERS]: USER, META_APP_SECRET: 'secret' };
  if (pubs !== undefined) env[ARMED_PUBLICATIONS] = pubs;
  return env;
};

interface Row { id: string; status: 'publishing' | 'succeeded' | 'failed' | 'unknown'; stage: Stage; errorCode: string | null }

function setup(env: Record<string, string>, hooks: { onSign?: () => void; onPoll?: () => void } = {}) {
  const rows: Row[] = [];
  const last = () => rows[rows.length - 1] ?? null;
  const issue = (userId: string, v: number) => {
    const r = last();
    if (userId !== USER) return 'INVALID_PUBLICATION_STATE';
    if (r?.status === 'publishing') return 'PUBLISH_IN_PROGRESS';
    if (r?.status === 'unknown') return 'PUBLISH_OUTCOME_UNKNOWN';
    if (r?.status === 'succeeded') return 'ALREADY_PUBLISHED';
    if (v !== 4) return 'VERSION_CONFLICT';
    return null;
  };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const fields = url.searchParams.get('fields');
    if (init?.method === 'POST' && url.pathname.endsWith('/media')) return res({ id: '18012345678901234' });
    if (init?.method === 'POST' && url.pathname.endsWith('/media_publish')) return res({ id: '18098765432109876' });
    if (fields === 'id,access_token,instagram_business_account') return res({ id: PAGE, access_token: 'EAApage', instagram_business_account: { id: IG } });
    if (fields === 'status_code') { hooks.onPoll?.(); return res({ status_code: 'FINISHED' }); }
    if (fields === 'id,permalink') return res({ id: '18098765432109876', permalink: 'https://www.instagram.com/p/X/' });
    if (fields === 'id,caption,timestamp,permalink') return res({ data: [] });
    return res({ error: { code: 100 } }, 400);
  });
  const d: InstagramPublishDeps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'other' ? OTHER : jwt ? USER : null)),
    preflight: vi.fn(async (userId: string, _p: string, v: number): Promise<PreflightRow[]> => [{
      channel: 'instagram', issue: issue(userId, v), draft_version: 4, attempt_status: last()?.status ?? null, attempt_error_code: last()?.errorCode ?? null,
      meta_object_id: null, permalink: null, attempt_updated_at: null, attempt_retryable: last()?.status === 'failed', attempt_verification_required: last()?.status === 'unknown',
    }]),
    context: vi.fn(async (userId: string, p: string): Promise<InstagramContext | null> => (userId !== USER ? null : {
      pageId: PAGE, igUserId: IG, igUsername: 'localseohub.io', permissions: ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'],
      caption: 'caption', version: 4, draftUpdatedAt: '2026-01-01T00:00:00Z', image: { path: `${USER}/${BIZ}/${p}/${IMG}.jpg`, mime: 'image/jpeg' },
      attempt: last() ? { id: last()!.id, status: last()!.status, externalStage: last()!.stage, containerStored: false, startedAt: '2026-11-01T10:00:00Z' } : null,
    })),
    begin: vi.fn(async (userId: string, p: string, v: number): Promise<BeginRow> => {
      const i = issue(userId, v);
      if (i) return { result: i, attempt_id: null, draft_version: null, caption: null, image_path: null, image_mime: null, page_id: null, instagram_account_id: null };
      const id = `66666666-6666-4666-8666-66666666666${rows.length}`;
      rows.push({ id, status: 'publishing', stage: 'none', errorCode: null });
      return { result: 'OK', attempt_id: id, draft_version: v, caption: 'caption', image_path: `${USER}/${BIZ}/${p}/${IMG}.jpg`, image_mime: 'image/jpeg', page_id: PAGE, instagram_account_id: IG };
    }),
    advance: vi.fn(async (_u: string, id: string, stage: Exclude<Stage, 'none'>) => { const r = rows.find((x) => x.id === id)!; r.stage = stage; return 'ok'; }),
    finish: vi.fn(async (_u: string, id: string, outcome: 'succeeded' | 'failed' | 'unknown', _o: string | null, _l: string | null, code: string | null) => {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== 'publishing') return 'invalid_transition';
      r.status = outcome; r.errorCode = code; return 'ok';
    }),
    markStale: vi.fn(async () => false),
    recordVerification: vi.fn(async () => 'ok'),
    readUserToken: vi.fn(async () => 'EAAuser'),
    downloadImage: vi.fn(async () => ({ ok: true as const, bytes: JPEG, contentType: 'image/jpeg' })),
    storeDerivative: vi.fn(async () => true),
    signDerivative: vi.fn(async (path: string) => { hooks.onSign?.(); return `https://proj.supabase.co/storage/v1/object/sign/instagram-derivatives/${path}?token=t`; }),
    removeDerivative: vi.fn(async () => undefined),
    codecs,
    env: (k: string) => env[k],
    fetch: fetch as unknown as typeof globalThis.fetch,
    sleep: vi.fn(async () => undefined),
    now: () => Date.parse('2026-11-01T10:10:00Z'),
  };
  const handle = createInstagramPublishHandler(d);
  const call = (body: Record<string, unknown>, jwt = 'jwt') =>
    handle(new Request('http://local/instagram-publishing', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) }));
  const publish = (publicationId: string, expectedVersion = 4, jwt?: string) => call({ action: 'instagram_publish', publicationId, expectedVersion }, jwt);
  const status = (publicationId: string) => call({ action: 'instagram_publish_status', publicationId, expectedVersion: 4 });
  const verify = (publicationId: string) => call({ action: 'instagram_publish_verify', publicationId, expectedVersion: 4 });
  const graphWrites = () => fetch.mock.calls.filter((c) => c[1]?.method === 'POST');
  return { d, rows, env, fetch, publish, status, verify, graphWrites };
}

const refusedBeforeAnything = (s: ReturnType<typeof setup>) => {
  expect(s.d.begin).not.toHaveBeenCalled();
  expect(s.d.preflight).not.toHaveBeenCalled();
  expect(s.d.readUserToken).not.toHaveBeenCalled();
  expect(s.d.storeDerivative).not.toHaveBeenCalled();
  expect(s.fetch).not.toHaveBeenCalled();
};

describe('B.2 P1 publication allowlist (pure check)', () => {
  it('absent, empty, whitespace, malformed, wildcard and mismatched lists are all refused', () => {
    const cases: (string | undefined)[] = [undefined, '', ' ', ',', '*', 'all', PUB_D.slice(0, -1), `${PUB_D},*`, `${PUB_D},not-a-uuid`, `${PUB_D},`, OTHER.replace(/-/g, '')];
    for (const c of cases) expect(isPublicationAllowed((k) => armedFor(c)[k], PUB_D)).toBe(false);
    expect(isPublicationAllowed((k) => armedFor(PUB_A)[k], PUB_D)).toBe(false);
  });

  it('exact membership is accepted, including case and surrounding spaces', () => {
    expect(isPublicationAllowed((k) => armedFor(PUB_D)[k], PUB_D)).toBe(true);
    expect(isPublicationAllowed((k) => armedFor(` ${PUB_A} , ${PUB_D.toUpperCase()} `)[k], PUB_D)).toBe(true);
  });

  it('combined authorization needs both user arming and publication allowlist; isArmed is unchanged', () => {
    const env = armedFor(PUB_D);
    expect(isArmed((k) => env[k], USER)).toBe(true);
    expect(isAuthorizedToPublish((k) => env[k], USER, PUB_D)).toBe(true);
    expect(isAuthorizedToPublish((k) => env[k], OTHER, PUB_D)).toBe(false);
    expect(isAuthorizedToPublish((k) => ({ ...env, [ARMED_FLAG]: 'false' })[k], USER, PUB_D)).toBe(false);
    expect(isAuthorizedToPublish((k) => ({ ...env, [ARMED_USERS]: '' })[k], USER, PUB_D)).toBe(false);
  });
});

describe('B.2 P1 server enforcement', () => {
  for (const [label, pubs] of [['absent', undefined], ['empty', ''], ['malformed', 'xyz'], ['mismatched', PUB_A], ['wildcard', '*']] as const) {
    it(`publish and verify refuse with ${label} allowlist before any attempt or external call`, async () => {
      const s = setup(armedFor(pubs));
      const r = await s.publish(PUB_D);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ ok: false, code: 'REAL_PUBLISH_DISABLED', state: 'NOT_REQUESTED' });
      const v = await s.verify(PUB_D);
      expect(v.status).toBe(403);
      refusedBeforeAnything(s);
      expect(s.d.context).not.toHaveBeenCalled();
    });
  }

  it('protected publications A, B and C are refused even when the owner is armed and D is allowlisted', async () => {
    const s = setup(armedFor(PUB_D));
    for (const p of [PUB_A, PUB_B, PUB_C]) {
      const r = await s.publish(p);
      expect(r.status).toBe(403);
      expect((await r.json()).code).toBe('REAL_PUBLISH_DISABLED');
      expect((await s.verify(p)).status).toBe(403);
    }
    refusedBeforeAnything(s);
  });

  it('D-shaped fixture publishes only under mocked arming + allowlist, with exactly one /media and one /media_publish', async () => {
    const s = setup(armedFor(PUB_D));
    const r = await s.publish(PUB_D);
    expect(r.status).toBe(200);
    expect((await r.json()).state).toBe('SUCCEEDED');
    const paths = s.graphWrites().map((c) => new URL(String(c[0])).pathname);
    expect(paths).toEqual([`/${META_GRAPH_VERSION}/${IG}/media`, `/${META_GRAPH_VERSION}/${IG}/media_publish`]);
  });

  it('wrong user is refused before any attempt even with D allowlisted', async () => {
    const s = setup(armedFor(PUB_D));
    expect((await s.publish(PUB_D, 4, 'other')).status).toBe(403);
    refusedBeforeAnything(s);
  });

  it('unauthenticated and invalid publication UUID requests are refused without side effects', async () => {
    const s = setup(armedFor(PUB_D));
    expect((await s.publish(PUB_D, 4, '')).status).toBe(401);
    expect((await s.publish('not-a-uuid')).status).toBe(400);
    expect((await s.publish('*')).status).toBe(400);
    refusedBeforeAnything(s);
  });

  it('wrong draft version is refused by preflight before begin and Graph', async () => {
    const s = setup(armedFor(PUB_D));
    const r = await s.publish(PUB_D, 3);
    expect((await r.json()).code).toBe('VERSION_CONFLICT');
    expect(s.d.begin).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('allowlist removed after validation but before /media: no Graph write, attempt FAILED, derivative removed', async () => {
    const env = armedFor(PUB_D);
    const s = setup(env, { onSign: () => { delete env[ARMED_PUBLICATIONS]; } });
    const r = await s.publish(PUB_D);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, code: 'REAL_PUBLISH_DISABLED', state: 'FAILED' });
    expect(s.graphWrites()).toHaveLength(0);
    expect(s.rows[0].status).toBe('failed');
    expect(s.rows[0].stage).toBe('none');
    expect(s.d.removeDerivative).toHaveBeenCalledTimes(1);
  });

  it('arming flag removed between /media and /media_publish: no /media_publish, attempt FAILED (no post exists)', async () => {
    const env = armedFor(PUB_D);
    const s = setup(env, { onPoll: () => { env[ARMED_FLAG] = 'false'; } });
    const r = await s.publish(PUB_D);
    expect(r.status).toBe(403);
    const paths = s.graphWrites().map((c) => new URL(String(c[0])).pathname);
    expect(paths).toEqual([`/${META_GRAPH_VERSION}/${IG}/media`]);
    expect(s.rows[0].status).toBe('failed');
    expect(s.rows[0].stage).toBe('container_created');
  });

  it('concurrent duplicate requests create a single attempt and a single post', async () => {
    const s = setup(armedFor(PUB_D));
    const results = await Promise.all([s.publish(PUB_D), s.publish(PUB_D), s.publish(PUB_D)]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(bodies.filter((b) => b.state === 'SUCCEEDED')).toHaveLength(1);
    expect(s.rows).toHaveLength(1);
    expect(s.graphWrites().filter((c) => String(c[0]).includes('media_publish'))).toHaveLength(1);
    const again = await (await s.publish(PUB_D)).json();
    expect(again.code).toBe('ALREADY_PUBLISHED');
  });

  it('an UNKNOWN attempt blocks a new publish and verify stays read-only', async () => {
    const s = setup(armedFor(PUB_D));
    s.rows.push({ id: '66666666-6666-4666-8666-666666666669', status: 'unknown', stage: 'publish_requested', errorCode: null });
    expect((await (await s.publish(PUB_D)).json()).code).toBe('PUBLISH_OUTCOME_UNKNOWN');
    await s.verify(PUB_D);
    expect(s.graphWrites()).toHaveLength(0);
    expect(s.d.begin).not.toHaveBeenCalled();
  });

  it('status reports server-authoritative trigger state per publication', async () => {
    const s = setup(armedFor(PUB_D));
    const d = await (await s.status(PUB_D)).json();
    expect(d.armed).toBe(true);
    expect(d.trigger).toEqual({ enabled: true, reason: null });
    const c = await (await s.status(PUB_C)).json();
    expect(c.trigger).toEqual({ enabled: false, reason: 'publication_not_allowed' });
    const off = setup(armedFor(undefined));
    expect((await (await off.status(PUB_D)).json()).trigger.enabled).toBe(false);
    const disarmed = setup({});
    expect((await (await disarmed.status(PUB_D)).json()).trigger).toEqual({ enabled: false, reason: 'not_armed' });
    expect(s.graphWrites()).toHaveLength(0);
  });

  it('disarmed production env (no secrets) makes no Graph writes for any action', async () => {
    const s = setup({});
    for (const p of [PUB_A, PUB_B, PUB_C, PUB_D]) { await s.publish(p); await s.verify(p); await s.status(p); }
    expect(s.graphWrites()).toHaveLength(0);
    expect(s.d.begin).not.toHaveBeenCalled();
  });
});

describe('B.2 P2 controlled trigger (browser source)', () => {
  const repo = read('src/features/instagram-publish/repository.ts');
  const harness = read('src/features/instagram-publish/InstagramPublishHarness.tsx');
  const copy = read('src/features/instagram-publish/copy.ts');

  it('browser never calls verify, Graph, or holds secrets / allowlists / signed URLs', () => {
    for (const src of [repo, harness, copy]) {
      expect(src).not.toMatch(/instagram_publish_verify|graph\.facebook\.com|media_publish|fetch\(|META_|access_token|signedUrl|createSignedUrl|image_url/i);
      expect(src).not.toContain(PUB_A);
      expect(src).not.toContain(PUB_C);
    }
  });

  it('publish request sends only explicit publication id and draft version', () => {
    expect(repo).toContain("invoke({ action: 'instagram_publish', publicationId, expectedVersion })");
    expect(repo).not.toMatch(/retry/);
  });

  it('button enablement derives from server status only and re-fetches before sending', () => {
    expect(repo).toContain('triggerEnabled: trigger.enabled === true');
    expect(harness).toContain("s.armed && s.triggerEnabled && s.canPublish && s.state === 'NOT_REQUESTED' && s.version === version");
    const send = harness.slice(harness.indexOf('const send = async'), harness.indexOf('if (!pub) return null;'));
    expect(send.indexOf('await fetchStatus()')).toBeGreaterThan(-1);
    expect(send.indexOf('await fetchStatus()')).toBeLessThan(send.indexOf('requestInstagramPublish('));
    expect(send).toContain('canTrigger(fresh.status, fresh.version)');
    expect(send).toContain('requestInstagramPublish(pubId, fresh.version)');
    expect(harness).toMatch(/if \(!pubId \|\| sending\) return;/);
  });

  it('App routing for the harness is unchanged (still a single internal mount, no public route)', () => {
    expect(sha('src/App.tsx')).toBe('ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b');
    const app = read('src/App.tsx');
    expect(app.match(/<IgHarness \/>/g)).toHaveLength(1);
  });
});

describe('B.2 Part 1 Facebook freeze', () => {
  it('Facebook publishing files are byte-identical to the frozen A3.7.4.2 state', () => {
    const frozen: Record<string, string> = {
      'supabase/functions/meta-publishing/index.ts': '027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23',
      'supabase/functions/meta-publishing/facebookPhoto.ts': '7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a',
      'supabase/functions/meta-publishing/facebookPublish.ts': '48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd',
      'supabase/functions/meta-publishing/handler.ts': 'b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb',
    };
    for (const [f, h] of Object.entries(frozen)) expect(sha(f)).toBe(h);
  });
});
