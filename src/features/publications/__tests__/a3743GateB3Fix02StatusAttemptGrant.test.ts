import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PreflightRow } from '../../../../supabase/functions/instagram-publishing/shared.ts';
import type { Codecs } from '../../../../supabase/functions/instagram-publishing/derivative.ts';
import {
  ARMED_FLAG, ARMED_PUBLICATIONS, ARMED_USERS, createInstagramPublishHandler,
  type InstagramContext, type InstagramPublishDeps,
} from '../../../../supabase/functions/instagram-publishing/instagramPublish.ts';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const MIGRATIONS = 'supabase/migrations';
const IG_INDEX = 'supabase/functions/instagram-publishing/index.ts';

const USER = 'aabe426e-f079-4db1-835b-17d9d126313e';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BIZ = 'e6014022-370f-4ec0-a340-c7c55f808247';
const PUB_D = '875587f5-0137-4477-904c-609e8e406ad6';
const PUB_X = '99999999-9999-4999-8999-999999999999';
const IMG = 'ba93c54e-c0ee-4fa0-a7b4-8284cddaa808';
const PAGE = '1393994523793266';
const IG = '17841462487279994';
const D_PNG = new Uint8Array(readFileSync(join(ROOT, 'auditoria-a2/gate-b1-assets/a3743-publication-d-test-image.png')));

const GRANTED = ['id', 'status', 'external_stage', 'meta_container_id', 'started_at', 'publication_id', 'user_id', 'channel', 'attempt_number'];

const grantFiles = () => readdirSync(join(ROOT, MIGRATIONS)).filter((f) => f.endsWith('_a3743_instagram_status_attempt_read_grant.sql'));
const grantSql = () => read(`${MIGRATIONS}/${grantFiles()[0]}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').trim();

const codecs: Codecs = {
  decodeJpeg: () => { throw new Error('decode must not run during status'); },
  decodePng: () => { throw new Error('decode must not run during status'); },
  encodeJpeg: () => { throw new Error('encode must not run during status'); },
};

const okRow = (over: Partial<PreflightRow> = {}): PreflightRow => ({
  channel: 'instagram', issue: null, draft_version: 3, attempt_status: null, attempt_error_code: null,
  meta_object_id: null, permalink: null, attempt_updated_at: null, attempt_retryable: false, attempt_verification_required: false, ...over,
});

const ctxD = (): InstagramContext => ({
  pageId: PAGE, igUserId: IG, igUsername: 'localseohub.io',
  permissions: ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish', 'business_management'],
  caption: 'caption D', version: 3, draftUpdatedAt: '2026-10-31T16:22:09.849195+00:00',
  image: { path: `${USER}/${BIZ}/${PUB_D}/${IMG}.png`, mime: 'image/png' }, attempt: null,
});

function setup(over: Partial<InstagramPublishDeps> = {}, env: Record<string, string> = {}) {
  const fetch = vi.fn(async () => new Response('{}', { status: 400 }));
  const d: InstagramPublishDeps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'owner-jwt' ? USER : jwt === 'other-jwt' ? OTHER : null)),
    preflight: vi.fn(async (): Promise<PreflightRow[]> => [okRow({ channel: 'facebook' }), okRow()]),
    context: vi.fn(async (u: string, p: string) => (u === USER && p === PUB_D ? ctxD() : null)),
    begin: vi.fn(async () => { throw new Error('begin must not run'); }),
    advance: vi.fn(async () => 'error'),
    finish: vi.fn(async () => 'error'),
    markStale: vi.fn(async () => false),
    recordVerification: vi.fn(async () => 'error'),
    readUserToken: vi.fn(async () => null),
    downloadImage: vi.fn(async () => ({ ok: true as const, bytes: D_PNG, contentType: 'image/png' })),
    storeDerivative: vi.fn(async () => false),
    signDerivative: vi.fn(async () => null),
    removeDerivative: vi.fn(async () => undefined),
    codecs,
    env: vi.fn((k: string) => env[k]),
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => Date.UTC(2026, 9, 31, 17, 0, 0),
    ...over,
  };
  const handle = createInstagramPublishHandler(d);
  const run = async (body: unknown, jwt: string | null = 'owner-jwt') => {
    const r = await handle(new Request('http://local/instagram-publishing', {
      method: 'POST',
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      body: JSON.stringify(body),
    }));
    const text = await r.text();
    return { status: r.status, text, body: JSON.parse(text) };
  };
  const noSideEffects = () => {
    for (const f of [d.begin, d.advance, d.finish, d.markStale, d.recordVerification, d.storeDerivative, d.signDerivative, d.removeDerivative, d.readUserToken]) {
      expect(f).not.toHaveBeenCalled();
    }
    expect(fetch).not.toHaveBeenCalled();
  };
  return { d, run, noSideEffects };
}

const status = (publicationId = PUB_D, expectedVersion = 3) => ({ action: 'instagram_publish_status', publicationId, expectedVersion });

describe('B.3 FIX02 migration: exact read-only nine-column grant', () => {
  it('exactly one FIX02 grant migration exists and the total is 60', () => {
    expect(grantFiles()).toHaveLength(1);
    expect(readdirSync(join(ROOT, MIGRATIONS)).filter((f) => f.endsWith('.sql'))).toHaveLength(60);
  });

  it('the only statement is SELECT on the nine authorized columns to service_role', () => {
    const sql = grantSql().replace(/\s+/g, ' ');
    expect(sql).toBe(`GRANT SELECT ( ${GRANTED.join(', ')} ) ON public.publication_publish_attempts TO service_role;`);
  });

  it('grants no write or structural privilege and touches no other role or object', () => {
    const sql = grantSql();
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)\b/i);
    expect(sql).not.toMatch(/\b(anon|authenticated|PUBLIC)\b/);
    expect(sql).not.toMatch(/\b(REVOKE|POLICY|FUNCTION|ALTER|DROP|CREATE|SECURITY|EXECUTE|BEGIN|COMMIT)\b/i);
    expect(sql.match(/;/g)).toHaveLength(1);
  });

  it('covers every column the status lookup selects, filters and orders on', () => {
    const src = read(IG_INDEX);
    const m = src.match(/from\("publication_publish_attempts"\)\.select\("([^"]+)"\)([\s\S]*?)\.maybeSingle\(\)/);
    expect(m).not.toBeNull();
    const used = new Set(m![1].split(',').map((c) => c.trim()));
    for (const [, c] of m![2].matchAll(/\.(?:eq|order)\("([a-z_]+)"/g)) used.add(c);
    expect([...used].sort()).toEqual([...GRANTED].sort());
    expect(src.match(/publication_publish_attempts/g)).toHaveLength(1);
  });

  it('prior migrations (revoke baseline, RLS, guard trigger, RPCs) are byte-identical', () => {
    expect(sha(`${MIGRATIONS}/20261028132929_a3741_meta_publishing_security_foundation.sql`)).toBe('42db6849eabf35b0d4c190b64178d531521d29e7e299fadd11dd90e9615dc79c');
    expect(sha(`${MIGRATIONS}/20261028133311_a3741_publishing_consent_decline_guard.sql`)).toBe('37823afc968af172c784c3babdce917e1836147327582cec95445b639b88a6c1');
    expect(sha(`${MIGRATIONS}/20261029222104_a3742_internal_test_entitlement.sql`)).toBe('9d13d39016055fb143e3d68df0ecb25d568b5c1a6049994b796aea66222385be');
    expect(sha(`${MIGRATIONS}/20261030232253_a3743_instagram_container_state.sql`)).toBe('366493c40ef00561da1830f1ef1aa0f3f37ee46b784476d58371670b64482662');
    const foundation = read(`${MIGRATIONS}/20261028132929_a3741_meta_publishing_security_foundation.sql`);
    expect(foundation).toMatch(/REVOKE ALL ON public\.publication_publish_attempts FROM anon, authenticated, service_role;/);
    expect(foundation).toMatch(/ALTER TABLE public\.publication_publish_attempts ENABLE ROW LEVEL SECURITY;/);
  });
});

describe('B.3 FIX02 status lookup compatibility (mocked, no publishing)', () => {
  it('owner + D v3 returns a correct, not-armed status with no side effects', async () => {
    const s = setup();
    const r = await s.run(status());
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.armed).toBe(false);
    expect(r.body.trigger).toEqual({ enabled: false, reason: 'not_armed' });
    expect(r.body.instagram).toMatchObject({ channel: 'instagram', state: 'NOT_REQUESTED', can_publish: true, issue: null, draft_version: 3, last_attempt: null });
    expect(r.body.version).toBe(3);
    expect(r.body.account).toEqual({ id: IG, username: 'localseohub.io', subtype_verified: false });
    expect(r.body.attempt).toBeNull();
    expect(r.body.derivative).toMatchObject({ ready: true, reason: null, source_format: 'PNG', source_width: 1080, source_height: 1350, output_format: 'JPEG' });
    expect(s.d.preflight).toHaveBeenCalledWith(USER, PUB_D, 3);
    s.noSideEffects();
  });

  it('missing or invalid JWT is rejected before any lookup', async () => {
    for (const jwt of [null, 'forged-jwt']) {
      const s = setup();
      const r = await s.run(status(), jwt);
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('AUTH_REQUIRED');
      expect(s.d.context).not.toHaveBeenCalled();
      expect(s.d.preflight).not.toHaveBeenCalled();
      s.noSideEffects();
    }
  });

  it('non-owner and wrong publication are rejected without status data', async () => {
    for (const [jwt, pub] of [['other-jwt', PUB_D], ['owner-jwt', PUB_X]] as const) {
      const s = setup();
      const r = await s.run(status(pub), jwt);
      expect(r.status).toBe(404);
      expect(r.body.ok).toBe(false);
      expect(r.body.code).toBe('INVALID_PUBLICATION_STATE');
      expect(r.body.instagram).toBeUndefined();
      expect(s.d.preflight).not.toHaveBeenCalled();
      s.noSideEffects();
    }
  });

  it('malformed request fields are rejected', async () => {
    for (const body of [{ ...status(), publicationId: 'x' }, { ...status(), extra: 1 }, { ...status(), expectedVersion: 0 }]) {
      const s = setup();
      const r = await s.run(body);
      expect(r.body.ok).toBe(false);
      expect(s.d.context).not.toHaveBeenCalled();
      s.noSideEffects();
    }
  });
});

describe('B.3 FIX02 database failures remain fail-closed', () => {
  it('attempt lookup permission error (pre-FIX02 42501) yields 500 INTERNAL_ERROR without leaking', async () => {
    const s = setup({ context: vi.fn(async () => { throw new Error('context lookup failed'); }) });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const r = await s.run(status());
    log.mockRestore();
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
    expect(r.text).not.toMatch(/context lookup|permission denied|42501/);
    s.noSideEffects();
  });

  it('preflight RPC error yields 500 INTERNAL_ERROR', async () => {
    const s = setup({ preflight: vi.fn(async () => { throw new Error('preflight failed'); }) });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const r = await s.run(status());
    log.mockRestore();
    expect(r.status).toBe(500);
    expect(r.body.code).toBe('INTERNAL_ERROR');
    s.noSideEffects();
  });

  it('malformed or missing preflight rows never produce a publishable status', async () => {
    for (const rows of [[], [okRow({ channel: 'facebook' })], [okRow({ issue: 'NOT_A_REAL_CODE' })]]) {
      const s = setup({ preflight: vi.fn(async () => rows as PreflightRow[]) });
      const r = await s.run(status());
      expect(r.body.instagram.can_publish).toBe(false);
      expect(r.body.instagram.issue).toBe('INTERNAL_ERROR');
      expect(r.body.trigger.enabled).toBe(false);
      s.noSideEffects();
    }
  });

  it('image download failure reports not-ready instead of passing', async () => {
    const s = setup({ downloadImage: vi.fn(async () => ({ ok: false as const, reason: 'missing' as const })) });
    const r = await s.run(status());
    expect(r.body.derivative).toEqual({ ready: false, reason: 'image_unavailable' });
    expect(r.body.trigger.enabled).toBe(false);
    s.noSideEffects();
  });
});

describe('B.3 FIX02 P1/P2 protections intact', () => {
  it('publish without arming is refused before any attempt or Graph call', async () => {
    const s = setup();
    const r = await s.run({ action: 'instagram_publish', publicationId: PUB_D, expectedVersion: 3 });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('REAL_PUBLISH_DISABLED');
    expect(s.d.preflight).not.toHaveBeenCalled();
    s.noSideEffects();
  });

  it('partial arming (flag + user, no publication allow-list) still refuses publishing', async () => {
    const s = setup({}, { [ARMED_FLAG]: 'true', [ARMED_USERS]: USER });
    const r = await s.run({ action: 'instagram_publish', publicationId: PUB_D, expectedVersion: 3 });
    expect(r.body.code).toBe('REAL_PUBLISH_DISABLED');
    s.noSideEffects();
    const st = await setup({}, { [ARMED_FLAG]: 'true', [ARMED_USERS]: USER }).run(status());
    expect(st.body.trigger).toEqual({ enabled: false, reason: 'publication_not_allowed' });
    expect(ARMED_PUBLICATIONS).toBe('META_INSTAGRAM_REAL_PUBLISH_PUBLICATION_IDS');
  });
});

describe('B.3 FIX02 frozen code untouched', () => {
  const PINS: Record<string, string> = {
    'supabase/functions/instagram-publishing/index.ts': 'f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28',
    'supabase/functions/instagram-publishing/instagramPublish.ts': '5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca',
    'supabase/functions/instagram-publishing/shared.ts': '2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd',
    'supabase/functions/instagram-publishing/derivative.ts': 'be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa',
    'supabase/functions/instagram-publishing/graph.ts': '6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a',
    'supabase/functions/instagram-publishing/connectionPreflight.ts': 'b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db',
    'src/features/instagram-publish/repository.ts': '9b5f26d48f0ab2ea632ebe42d2c2247d49005eca292140ca4ea3d78a1fe190dd',
    'src/features/instagram-publish/InstagramPublishHarness.tsx': '746e94b366d55e755fa5fa0b8e86696931a951bfc4ae8524773b2a0aaa84a42e',
    'src/features/instagram-publish/MetaConnectionCheck.tsx': '67cc7b293a7b2a3cbb35206e7d598141699a55a28ef9b6463c6c04aac2e8a52b',
    'src/features/instagram-publish/connectionCheck.ts': 'd45f107e041088e5ab5242be9d2a03584ed4544b7a3ef5f54332cb5fedf7e3a0',
    'src/features/instagram-publish/copy.ts': 'c5660c551f7a8facf5371399974b2a55072f71eca508119a41cd40ea957b0f9e',
    'supabase/functions/meta-publishing/index.ts': '027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23',
    'supabase/functions/meta-publishing/handler.ts': 'b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb',
    'supabase/functions/meta-publishing/facebookPublish.ts': '48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd',
    'supabase/functions/meta-publishing/facebookPhoto.ts': '7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a',
    'src/App.tsx': 'ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b',
    'supabase/config.toml': 'fc17510c97774a53235bc1872ea46de28c0ba5171ebf7766f4abe8e2f562679a',
  };

  it('Instagram engine, Graph transport, derivative, FIX01 check, Facebook and App are byte-identical', () => {
    for (const [p, h] of Object.entries(PINS)) expect(sha(p), p).toBe(h);
  });

  it('instagram-publishing keeps verify_jwt = true and FIX01 routing', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.instagram-publishing\]\s*\nverify_jwt = true/);
    expect(read(IG_INDEX)).toMatch(/isConnectionPreflightRequest/);
  });

  it('historical Gate A manifest is unchanged and still records the pre-FIX02 test hashes', () => {
    expect(sha('auditoria-a2/A3_7_4_3_GATE_A_MANIFEST.md')).toBe('24c9c054c3fe5f71316b04c8910793bda8696e7b0126952b7bb0c7b6ceab37f4');
    const m = read('auditoria-a2/A3_7_4_3_GATE_A_MANIFEST.md');
    expect(m).toContain('2f4b6d27fd7f1d2f7851251f5a2fc3dfd71f6558be1b7dd9724e1b387d0a0a9a');
    expect(m).toContain('b7705d22de2d2cbab4bbcf06f11d004c0bb11f448fba2701ac944c3ae4e9236e');
  });

  it('the two re-pinned tests change only the count to 60 with the FIX02 annotation', () => {
    for (const p of ['src/components/__tests__/a281TrustCleanup.test.ts', 'src/features/action-layer/__tests__/a33DiagnosticAction.test.ts']) {
      const src = read(p);
      expect(src).toMatch(/\.toHaveLength\(60\); \/\/ A3\.7\.4\.3 GATE B\.3 FIX02 AUTHORIZED RE-PIN/);
      expect(src).not.toMatch(/migrations'\)\)\.filter\(\(f\) => f\.endsWith\('\.sql'\)\)\)\.toHaveLength\(59\)/);
    }
  });
});
