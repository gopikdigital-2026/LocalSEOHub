import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GuardError, createDb, guard, type Attempt, type Channel } from './gateB4Fix01DbModel';

// A3.7.4.3 GATE B.4 FIX01: atomic database rules of the prepared (unapplied) migration, Facebook
// preservation, and historical freeze integrity. Database behaviour is exercised on an in-memory model only.
const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const PREPARED = 'auditoria-a2/gate-b4-fix01-prepared/20261031190000_a3743_gateb4_fix01_publish_safety.sql';
const SQL = read(PREPARED);
const FOUNDATION = read('supabase/migrations/20261028132929_a3741_meta_publishing_security_foundation.sql');
const CONTAINER_STATE = read('supabase/migrations/20261030232253_a3743_instagram_container_state.sql');
const USER = '11111111-1111-4111-8111-111111111111';

function fnBody(src: string, name: string) {
  const start = src.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const at = (d: string) => { const i = src.indexOf(`AS ${d}`, start); return i < 0 ? Infinity : i; };
  const delim = at('$function$') < at('$$') ? '$function$' : '$$';
  const s = src.indexOf(delim, start) + delim.length;
  return src.slice(s, src.indexOf(delim, s));
}
const lines = (body: string) => body.split('\n').map((l) => l.trim()).filter(Boolean);
function lineDiff(before: string[], after: string[]) {
  const added = [...after];
  const removed: string[] = [];
  for (const l of before) {
    const k = added.indexOf(l);
    if (k < 0) removed.push(l); else added.splice(k, 1);
  }
  return { added, removed };
}
const base = (over: Partial<Attempt> = {}): Attempt => ({
  id: 'a', owner: USER, channel: 'instagram', status: 'publishing', stage: 'none', container: null, errorCode: null, retryable: false,
  verificationRequired: false, metaObjectId: null, verificationAttempts: 0, lastVerifiedAt: null, startedAt: '2026-11-01T10:00:00Z', ...over,
});
const raises = (o: Attempt, n: Partial<Attempt>, fixed = true) => {
  try { guard(o, { ...o, ...n }, fixed); return null; } catch (e) { return e instanceof GuardError ? e.message : 'other'; }
};
function igAt(db: ReturnType<typeof createDb>, stage: 'container_created' | 'publish_requested') {
  const { id } = db.begin(USER, 'instagram');
  db.advance(USER, id!, 'container_requested', null);
  db.advance(USER, id!, 'container_created', '18012345678901234');
  if (stage === 'publish_requested') db.advance(USER, id!, 'publish_requested', null);
  return id!;
}

describe('B.4 FIX01 F1 atomic database transitions (model of the prepared migration)', () => {
  it('record_verification refuses "absent" once publish_requested is stored, and changes nothing', () => {
    const db = createDb(true);
    const id = igAt(db, 'publish_requested');
    db.markStale(id, '2026-11-01T10:08:00Z');
    const before = { ...db.rows[0] };
    expect(db.recordVerification(USER, id, 'absent', null)).toBe('unsafe_absent');
    expect(db.rows[0]).toEqual(before);
    expect(db.begin(USER, 'instagram').result).toBe('PUBLISH_OUTCOME_UNKNOWN');
  });

  it('finish("failed") after publish_requested is stored as blocking UNKNOWN', () => {
    const db = createDb(true);
    const id = igAt(db, 'publish_requested');
    expect(db.finish(USER, id, 'failed', null, 'META_REJECTED')).toBe('ok_unknown');
    expect(db.rows[0]).toMatchObject({ status: 'unknown', errorCode: 'PUBLISH_OUTCOME_UNKNOWN', retryable: false, verificationRequired: true });
    expect(db.begin(USER, 'instagram').result).toBe('PUBLISH_OUTCOME_UNKNOWN');
  });

  it('before publish_requested a definite failure and a verified "absent" stay retryable', () => {
    const db = createDb(true);
    const id = igAt(db, 'container_created');
    expect(db.finish(USER, id, 'failed', null, 'META_TEMPORARY_ERROR')).toBe('ok');
    expect(db.rows[0]).toMatchObject({ status: 'failed', retryable: true });
    const db2 = createDb(true);
    const id2 = igAt(db2, 'container_created');
    db2.markStale(id2, '2026-11-01T10:08:00Z');
    expect(db2.recordVerification(USER, id2, 'absent', null)).toBe('ok');
    expect(db2.rows[0]).toMatchObject({ status: 'failed', retryable: true });
  });

  it('the guard itself rejects any publish_requested -> failed write, even one that bypasses the functions', () => {
    const o = base({ stage: 'publish_requested', status: 'unknown' });
    expect(raises(o, { status: 'failed', verificationAttempts: 1, lastVerifiedAt: 'now' })).toBe('publish_attempt_outcome_unprovable');
    expect(raises(base({ stage: 'publish_requested' }), { status: 'failed' })).toBe('publish_attempt_outcome_unprovable');
    expect(raises(o, { status: 'failed', verificationAttempts: 1, lastVerifiedAt: 'now' }, false)).toBeNull();
  });

  it('after UNKNOWN or FAILED the stage is frozen, so a late publisher cannot reach publish_requested', () => {
    for (const status of ['unknown', 'failed', 'succeeded'] as const) {
      expect(raises(base({ status, stage: 'container_created' }), { stage: 'publish_requested' })).toBe('publish_attempt_stage_frozen');
    }
    const db = createDb(true);
    const id = igAt(db, 'container_created');
    db.markStale(id, '2026-11-01T10:08:00Z');
    expect(db.advance(USER, id, 'publish_requested', null)).toBe('invalid_transition');
  });

  it('no transition resurrects a settled attempt, skips a stage or goes backwards', () => {
    expect(raises(base({ status: 'failed' }), { status: 'publishing' })).toBe('publish_attempt_invalid_transition');
    expect(raises(base({ status: 'succeeded' }), { status: 'unknown' })).toBe('publish_attempt_invalid_transition');
    expect(raises(base({ stage: 'none' }), { stage: 'container_created' })).toBe('publish_attempt_invalid_transition');
    expect(raises(base({ stage: 'container_created' }), { stage: 'container_requested' })).toBe('publish_attempt_stage_backwards');
    expect(raises(base({ status: 'unknown' }), { status: 'failed' })).toBe('publish_attempt_unknown_requires_verification');
    expect(raises(base({ container: '1' }), { container: '2' })).toBe('publish_attempt_container_immutable');
  });

  it('a second attempt cannot start while one is publishing, unknown or succeeded', () => {
    const db = createDb(true);
    const id = db.begin(USER, 'instagram').id!;
    expect(db.begin(USER, 'instagram').result).toBe('PUBLISH_IN_PROGRESS');
    db.finish(USER, id, 'unknown', null, null);
    expect(db.begin(USER, 'instagram').result).toBe('PUBLISH_OUTCOME_UNKNOWN');
    expect(db.rows).toHaveLength(1);
  });

  it('begin refuses an Instagram attempt without an active entitlement; the check is Instagram-only', () => {
    const db = createDb(true);
    db.state.entitled = false;
    expect(db.begin(USER, 'instagram')).toEqual({ result: 'PERMISSION_REQUIRED', id: null });
    expect(db.begin(USER, 'facebook').result).toBe('OK');
    expect(db.rows.map((r) => r.channel)).toEqual(['facebook']);
  });
});

describe('B.4 FIX01 §8 Facebook preservation', () => {
  type Step = (db: ReturnType<typeof createDb>, id: string) => unknown;
  const sequences: Record<string, Step[]> = {
    success: [(db, id) => db.finish(USER, id, 'succeeded', '123_456', null)],
    rejected: [(db, id) => db.finish(USER, id, 'failed', null, 'META_REJECTED')],
    rateLimited: [(db, id) => db.finish(USER, id, 'failed', null, 'META_RATE_LIMITED')],
    temporary: [(db, id) => db.finish(USER, id, 'failed', null, 'META_TEMPORARY_ERROR')],
    badCode: [(db, id) => db.finish(USER, id, 'failed', null, 'NOPE')],
    unknownThenAbsent: [(db, id) => db.finish(USER, id, 'unknown', null, null), (db, id) => db.recordVerification(USER, id, 'absent', null)],
    unknownThenFound: [(db, id) => db.finish(USER, id, 'unknown', null, null), (db, id) => db.recordVerification(USER, id, 'found', '123_456')],
    unknownThenInconclusive: [(db, id) => db.finish(USER, id, 'unknown', null, null), (db, id) => db.recordVerification(USER, id, 'inconclusive', null)],
    advanceRefused: [(db, id) => db.advance(USER, id, 'container_requested', null)],
    markStaleIgnored: [(db, id) => db.markStale(id, '2099-01-01T00:00:00Z')],
    doubleFinish: [(db, id) => db.finish(USER, id, 'succeeded', '1', null), (db, id) => db.finish(USER, id, 'failed', null, 'META_REJECTED')],
  };
  for (const [name, steps] of Object.entries(sequences)) {
    it(`Facebook "${name}": identical results and rows before and after the migration, entitlement irrelevant`, () => {
      const run = (fixed: boolean, entitled: boolean) => {
        const db = createDb(fixed);
        db.state.entitled = entitled;
        const begun = db.begin(USER, 'facebook' as Channel);
        const results = [begun.result, ...steps.map((s) => s(db, begun.id!)), db.begin(USER, 'facebook').result];
        return { results, rows: db.rows.map(({ id: _id, ...r }) => r) };
      };
      const legacy = run(false, true);
      expect(run(true, true)).toEqual(legacy);
      expect(run(true, false)).toEqual(legacy);
      expect(legacy.rows.every((r) => r.stage === 'none')).toBe(true);
    });
  }

  it('Facebook attempts can never reach publish_requested, the only stage the new branches act on', () => {
    expect(raises(base({ channel: 'facebook' }), { stage: 'container_requested' })).toBe('publish_attempt_invalid_transition');
    const db = createDb(true);
    const id = db.begin(USER, 'facebook').id!;
    expect(db.advance(USER, id, 'container_requested', null)).toBe('invalid_channel');
  });

  it('the Facebook function calls only begin and finish, and the Facebook code is byte-identical', () => {
    const fb = read('supabase/functions/meta-publishing/index.ts');
    const rpcs = [...fb.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(rpcs).toContain('publish_attempt_begin');
    expect(rpcs).toContain('publish_attempt_finish');
    for (const f of ['publish_attempt_advance', 'publish_attempt_mark_stale', 'publish_attempt_record_verification', 'internal_test_entitlement_active']) {
      expect(rpcs).not.toContain(f);
    }
    expect(fb).toMatch(/p_channel: "facebook"/);
    const pins: Record<string, string> = {
      'supabase/functions/meta-publishing/index.ts': '027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23',
      'supabase/functions/meta-publishing/handler.ts': 'b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb',
      'supabase/functions/meta-publishing/facebookPublish.ts': '48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd',
      'supabase/functions/meta-publishing/facebookPhoto.ts': '7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a',
    };
    for (const [p, h] of Object.entries(pins)) expect(sha(p), p).toBe(h);
  });

  it('only the two edge functions call the changed database functions', () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (/publish_attempt_(begin|finish|record_verification)/.test(read(p))) callers.push(p);
      }
    };
    walk('src');
    walk('supabase/functions');
    expect(callers.sort()).toEqual(['supabase/functions/instagram-publishing/index.ts', 'supabase/functions/meta-publishing/index.ts']);
  });
});

describe('B.4 FIX01 prepared migration text', () => {
  const FNS = ['publish_attempt_record_verification', 'publish_attempt_finish', 'publish_attempt_begin'];

  it('is prepared outside supabase/migrations, is not applied, and the applied count stays 60', () => {
    expect(sha(PREPARED)).toBe('a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981');
    const applied = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));
    expect(applied).toHaveLength(60);
    expect(existsSync(join(ROOT, 'supabase/migrations/20261031190000_a3743_gateb4_fix01_publish_safety.sql'))).toBe(false);
    expect(applied.every((f) => f < '20261031190000')).toBe(true);
  });

  it('redefines only the three functions and the guard, each SECURITY DEFINER with an empty search_path', () => {
    const defined = [...SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]).sort();
    expect(defined).toEqual([...FNS, 'publish_attempts_guard'].sort());
    expect(SQL).not.toMatch(/publish_attempt_(advance|mark_stale)\(/);
    for (const name of [...FNS, 'publish_attempts_guard']) {
      const head = SQL.slice(SQL.indexOf(`FUNCTION public.${name}(`), SQL.indexOf(`FUNCTION public.${name}(`) + 400);
      expect(head, name).toMatch(/SECURITY DEFINER/);
      expect(head, name).toMatch(/SET search_path (=|TO) ''/);
    }
  });

  it('contains no destructive or transaction statements and grants nothing to anon or authenticated', () => {
    const code = SQL.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\b(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE|COMMIT|ROLLBACK)\b/i);
    expect(code).not.toMatch(/^\s*BEGIN\s*;/im);
    const grants = code.split(';').map((s) => s.trim()).filter((s) => /^GRANT\b/.test(s));
    expect(grants).toHaveLength(3);
    for (const g of grants) expect(g).toMatch(/ TO service_role$/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.publish_attempts_guard\(\) FROM PUBLIC, anon, authenticated, service_role;/);
    for (const sig of ['publish_attempt_begin(uuid, uuid, text, integer)', 'publish_attempt_finish(uuid, uuid, text, text, text, text)', 'publish_attempt_record_verification(uuid, uuid, text, text, text)']) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
      expect(code).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`);
    }
  });

  it('decisions read status and stage under the same row lock', () => {
    for (const name of ['publish_attempt_record_verification', 'publish_attempt_finish']) {
      expect(fnBody(SQL, name)).toMatch(/SELECT a\.status, a\.external_stage INTO v_status, v_stage FROM public\.publication_publish_attempts a\s+WHERE a\.id = p_attempt_id AND a\.user_id = p_user_id FOR UPDATE;/);
    }
    const rv = fnBody(SQL, 'publish_attempt_record_verification');
    expect(rv.indexOf("RETURN 'unsafe_absent'")).toBeLessThan(rv.indexOf("SET status = 'failed'"));
    const begin = fnBody(SQL, 'publish_attempt_begin');
    const lock = begin.indexOf('FOR UPDATE');
    const ent = begin.indexOf("IF p_channel = 'instagram' AND public.internal_test_entitlement_active(p_user_id) IS NOT TRUE THEN");
    expect(lock).toBeGreaterThan(-1);
    expect(ent).toBeGreaterThan(lock);
    expect(ent).toBeLessThan(begin.indexOf('public.publication_publish_gate('));
  });

  it('every change against the applied definitions is the documented, Instagram-stage-scoped addition', () => {
    const rv = lineDiff(lines(fnBody(FOUNDATION, 'publish_attempt_record_verification')), lines(fnBody(SQL, 'publish_attempt_record_verification')));
    expect(rv.removed).toEqual(['DECLARE v_status text;', 'SELECT a.status INTO v_status FROM public.publication_publish_attempts a']);
    expect(rv.added).toEqual([
      'DECLARE v_status text; v_stage text;', 'SELECT a.status, a.external_stage INTO v_status, v_stage FROM public.publication_publish_attempts a',
      "IF v_stage = 'publish_requested' THEN", "RETURN 'unsafe_absent';", 'END IF;',
    ]);
    const fin = lineDiff(lines(fnBody(FOUNDATION, 'publish_attempt_finish')), lines(fnBody(SQL, 'publish_attempt_finish')));
    expect(fin.removed).toEqual(['DECLARE v_status text;', 'SELECT a.status INTO v_status FROM public.publication_publish_attempts a', "IF p_outcome = 'succeeded' THEN"]);
    expect(fin.added).toEqual([
      'DECLARE v_status text; v_stage text;', 'SELECT a.status, a.external_stage INTO v_status, v_stage FROM public.publication_publish_attempts a',
      "IF p_outcome = 'failed' AND v_stage = 'publish_requested' THEN", "RETURN 'ok_unknown';", "ELSIF p_outcome = 'succeeded' THEN",
      'UPDATE public.publication_publish_attempts', "SET status = 'unknown', error_code = 'PUBLISH_OUTCOME_UNKNOWN', retryable = false,",
      'verification_required = true, finished_at = now()', 'WHERE id = p_attempt_id;',
    ]);
    const beg = lineDiff(lines(fnBody(FOUNDATION, 'publish_attempt_begin')), lines(fnBody(SQL, 'publish_attempt_begin')));
    expect(beg.removed).toEqual([]);
    expect(beg.added).toEqual([
      "IF p_channel = 'instagram' AND public.internal_test_entitlement_active(p_user_id) IS NOT TRUE THEN",
      "RETURN QUERY SELECT 'PERMISSION_REQUIRED'::text, NULL::uuid, NULL::integer, NULL::text,", 'END IF;',
      'NULL::text, NULL::text, NULL::text, NULL::text;', 'RETURN;',
    ]);
    const g = lineDiff(lines(fnBody(CONTAINER_STATE, 'publish_attempts_guard')), lines(fnBody(SQL, 'publish_attempts_guard')));
    expect(g.removed).toEqual([]);
    expect(g.added).toEqual(["IF OLD.external_stage = 'publish_requested' AND NEW.status = 'failed' THEN", "RAISE EXCEPTION 'publish_attempt_outcome_unprovable';", 'END IF;']);
  });
});

describe('B.4 FIX01 historical freeze integrity', () => {
  it('all historical audit manifests are byte-identical', () => {
    const manifests: Record<string, string> = {
      A3_7_2_FREEZE_MANIFEST: 'ced8edffe1020456cbe645c62991f310eb910a74d4e29d3fd6a77bba9fba917a',
      A3_7_3_1_FREEZE_MANIFEST: '8c97c60295c66fa9eb53d1c4c5fb7664ac78ff92ece16b8e41fe2e296c0549b6',
      A3_7_3_3_FREEZE_MANIFEST: 'd4a9700687fea40541c1d3e2c474ee671ad2d9219f8b9083d3285d3a195d5862',
      A3_7_3_4_FREEZE_MANIFEST: '81217523283748bf41d917c80591d0277467740b608ed71ddc867982147e6606',
      A3_7_4_1_FREEZE_MANIFEST: 'ee28cd0e9f1a52e75d9e67b49ab3a96ee6d0ce4d10c142cb95efc9313851e907',
      A3_7_4_2_FREEZE_MANIFEST: '34feabd3781ea3fc4e2573d69f53e9a4ca99b802a860bace62d4ea3eef6ce228',
      A3_7_4_2_GATE_A_MANIFEST: '6112bda74721ec6b5e9c363a6d87e47cbe3834a0d58ace20971b0ddcfed7a327',
      A3_7_4_3_GATE_A_MANIFEST: '24c9c054c3fe5f71316b04c8910793bda8696e7b0126952b7bb0c7b6ceab37f4',
      A3_7_4_3_GATE_B1_MANIFEST: '4d2694dd8d7ecd8bbc5af812fbdeb761799254f1dff8b428769b8da2c0554849',
      A3_7_4_3_GATE_B2_PART1_MANIFEST: '6421dc8e521c5568477b446fb5853a965b364156247ca77359e0efaea4764a7b',
      A3_7_4_3_GATE_B2_PART2_MANIFEST: 'cd50db5fc1695b81b375fb90545bdac18992c4b85796a0a30cf1deb1d1505a6b',
      A3_7_4_3_GATE_B3_PART1_MANIFEST: 'c3e887209c503d8c65a314548784cf822e2a778c5ab96812261117eedee1bac8',
      A3_7_4_3_GATE_B3_FIX01_MANIFEST: '2209ac279aa8caf4ad47aeac2f90014a8bd615bffc348b7df133c810a3757411',
      A3_7_4_3_GATE_B3_FIX02_MANIFEST: '5e168ad1a097945e2a6fd3a4fe81df067093c12b1884024029f81182007e7282',
      A3_7_4_3_GATE_B3_FIX02_MANIFEST_FINAL: '0f35d9bb8c24ebeb80eb3aa0f5aad10f15f7b718cf7b41d539e5dae4e4248d5d',
      A3_7_4_3_GATE_B3_FIX02_GO_MANIFEST: '9b312d260174ca9232a165d9a20a8fbc99e0b60a9112b6815ad608d08ef53217',
      A3_7_4_3_GATE_B3_FIX02_FINAL_FREEZE_MANIFEST: '8ebc2b359e84e71109274d453a3c47943180e3b934b53d9abbde451012326050',
      A3_7_4_3_GATE_B4_EVIDENCE_MANIFEST: 'd67a773775e2e5d9c34d1184c271dbf25fbfda73d56702facb6fd628bc380f2d',
      A3_7_4_3_GATE_B4_FIX01_MANIFEST: 'ce255ae3ca2f9f1c3146e86246acec43959b81e719e6b475d6efe245f6f6ae09',
    };
    for (const [name, h] of Object.entries(manifests)) expect(sha(`auditoria-a2/${name}.md`), name).toBe(h);
  });

  it('historical migrations that define the changed functions are byte-identical', () => {
    const pins: Record<string, string> = {
      'supabase/migrations/20261028132929_a3741_meta_publishing_security_foundation.sql': '42db6849eabf35b0d4c190b64178d531521d29e7e299fadd11dd90e9615dc79c',
      'supabase/migrations/20261030232253_a3743_instagram_container_state.sql': '366493c40ef00561da1830f1ef1aa0f3f37ee46b784476d58371670b64482662',
    };
    for (const [p, h] of Object.entries(pins)) expect(sha(p), p).toBe(h);
  });

  it('Instagram files outside the authorized scope are unchanged; authorized files match the FIX01 ledger', () => {
    const pins: Record<string, string> = {
      'supabase/functions/instagram-publishing/shared.ts': '2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd',
      'supabase/functions/instagram-publishing/derivative.ts': 'be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa',
      'supabase/functions/instagram-publishing/connectionPreflight.ts': 'b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db',
      'supabase/functions/instagram-publishing/instagramPublish.ts': 'df94b08fcbd2134d17a85a3ecdaefdfcdda51a36014771585a6510787ad200f1',
      'supabase/functions/instagram-publishing/index.ts': '6312ea2ebf7210d10e0319373d3cf48381e2925b23934a169a65b475334ea675',
      'supabase/functions/instagram-publishing/graph.ts': 'a107c840cba644967c9a911ef923755176de0b7674530372a506bdc1333bb61e',
      'supabase/functions/instagram-publishing/publishTarget.ts': 'd58f363b11e2c02a027da341e0c46c97691fc0490d4435287442b09c16d1040d',
    };
    for (const [p, h] of Object.entries(pins)) expect(sha(p), p).toBe(h);
    expect(readdirSync(join(ROOT, 'supabase/functions/instagram-publishing')).sort()).toEqual(
      ['connectionPreflight.ts', 'derivative.ts', 'graph.ts', 'index.ts', 'instagramPublish.ts', 'publishTarget.ts', 'shared.ts'],
    );
  });

  it('the server pins the approved target and the new helper performs no Graph write', () => {
    expect(read('supabase/functions/instagram-publishing/index.ts')).toMatch(/target: APPROVED_TARGET,/);
    const helper = read('supabase/functions/instagram-publishing/publishTarget.ts');
    expect(helper).not.toMatch(/fetch|\/media|graph\.facebook/);
  });
});
