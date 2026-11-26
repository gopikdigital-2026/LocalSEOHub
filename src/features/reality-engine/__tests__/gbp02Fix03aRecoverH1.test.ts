import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as contract from '../../../../supabase/functions/activeBusiness';
import { createHandler, type RecoverDeps } from '../../../../supabase/functions/gbp-recover-attempt/handler';

// H1 regression: cancel / expiry of a GBP attempt in select_location that already holds credentials.
// The fake database reproduces the live semantics verified on the project database:
//  - BEFORE trigger connected_sources_clear_on_disconnect forgets Vault refs and nulls credentials
//    in the same statement when status becomes 'disconnected' (any failure aborts the statement);
//  - CHECK connected_sources_disconnected_no_credentials is evaluated after the trigger.

const root = resolve(__dirname, '../../../..');
const NOW = new Date('2026-11-26T12:00:00Z');
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
type Row = Record<string, unknown>;
type Fault = 'none' | 'db_error' | 'vault_error' | 'no_trigger';

function credentialedRow(id: string, user: string, business: string, authorizedAgo = 2 * MIN): Row {
  return {
    id, user_id: user, business_id: business, source_type: 'google_business', status: 'connecting',
    external_account_id: 'accounts/123', external_location_id: null,
    access_token_encrypted: `vault:${id}-access`, refresh_token_encrypted: `vault:${id}-refresh`,
    token_expires_at: '2026-11-26T13:00:00Z', last_error: null,
    metadata: { phase: 'select_location', oauth_state: null, authorized_at: ago(authorizedAgo) },
    updated_at: ago(authorizedAgo),
  };
}

function database(initial: Row[], businesses: { id: string; user_id: string }[]) {
  const rows: Row[] = structuredClone(initial);
  const vault = new Set(rows.flatMap((r) => [r.access_token_encrypted, r.refresh_token_encrypted]).filter(Boolean) as string[]);
  const writes: string[] = [];
  let fault: Fault = 'none';
  let beforeUpdate: (() => void) | null = null;

  const runUpdate = (matched: Row[], patch: Row) => {
    if (fault === 'db_error') return { data: null, error: { code: '08006', message: 'connection failure' } };
    const forgotten: string[] = [];
    const next: Row[] = [];
    for (const row of matched) {
      const n: Row = { ...row, ...patch };
      if (fault !== 'no_trigger' && n.status === 'disconnected') {
        if (fault === 'vault_error') return { data: null, error: { code: 'XX000', message: 'vault unavailable' } };
        for (const ref of [row.access_token_encrypted, row.refresh_token_encrypted]) if (ref) forgotten.push(String(ref));
        Object.assign(n, { access_token_encrypted: null, refresh_token_encrypted: null, token_expires_at: null, external_account_id: null, external_location_id: null });
        const meta = { ...((n.metadata ?? {}) as Row) };
        delete meta.oauth_state;
        n.metadata = meta;
      }
      if (n.status === 'disconnected' && (n.access_token_encrypted || n.refresh_token_encrypted || n.token_expires_at)) {
        return { data: null, error: { code: '23514', message: 'violates check constraint "connected_sources_disconnected_no_credentials"' } };
      }
      next.push(n);
    }
    matched.forEach((row, i) => { writes.push(String(row.id)); Object.assign(row, next[i]); });
    forgotten.forEach((ref) => vault.delete(ref));
    return { data: matched.map((r) => ({ id: r.id })), error: null };
  };

  const client = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt === 'mock' ? { id: 'owner' } : null }, error: null }) },
    from(table: string) {
      let data: Row[] = table === 'businesses' ? businesses : rows;
      let patch: Row | null = null;
      const finish = () => (patch ? runUpdate(data, patch) : { data: data.map((r) => structuredClone(r)), error: null });
      const q = {
        select: () => q,
        update(p: Row) { patch = p; beforeUpdate?.(); return q; },
        eq(k: string, v: unknown) { data = data.filter((r) => r[k] === v); return q; },
        limit(n: number) { data = data.slice(0, n); return Promise.resolve(finish()); },
        maybeSingle: async () => ({ data: data.length === 1 ? structuredClone(data[0]) : null, error: data.length > 1 ? { code: 'PGRST116' } : null }),
        then(onFulfilled: (r: ReturnType<typeof finish>) => unknown) { return Promise.resolve(finish()).then(onFulfilled); },
      };
      return q;
    },
  };
  return {
    client, rows, vault, writes,
    setFault: (f: Fault) => { fault = f; },
    onUpdate: (fn: () => void) => { beforeUpdate = fn; },
  };
}

function realAdapter(db: ReturnType<typeof database>): RecoverDeps {
  let captured: RecoverDeps | undefined;
  const code = transformSync(readFileSync(resolve(root, 'supabase/functions/gbp-recover-attempt/index.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  runInNewContext(code, {
    Deno: { env: { get: () => 'test' }, serve: () => undefined },
    require: (name: string) => {
      if (name.startsWith('jsr:')) return {};
      if (name.startsWith('npm:')) return { createClient: () => db.client };
      if (name === '../activeBusiness.ts') return contract;
      if (name === './handler.ts') return { createHandler: (deps: RecoverDeps) => { captured = deps; return () => undefined; } };
      throw new Error(`Unexpected import ${name}`);
    },
    fetch: () => { throw new Error('Real network forbidden'); },
  });
  if (!captured) throw new Error('Adapter not captured');
  return captured;
}

const OWN = [{ id: 'biz-a', user_id: 'owner' }, { id: 'biz-b', user_id: 'owner' }];

function setup(rows: Row[] = [credentialedRow('src-a', 'owner', 'biz-a'), credentialedRow('src-b', 'owner', 'biz-b')], businesses = OWN) {
  const db = database(rows, businesses);
  const deps = realAdapter(db);
  const handle = createHandler({ ...deps, now: () => NOW });
  const call = async (body: Row, jwt = 'mock') => {
    const res = await handle(new Request('https://x/gbp-recover-attempt', {
      method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  const row = (id: string) => db.rows.find((r) => r.id === id)!;
  return { db, deps, call, row };
}

const credentialsOf = (r: Row) => [r.access_token_encrypted, r.refresh_token_encrypted, r.token_expires_at];
const isApplied = (v: unknown) => v === true || v === 'applied';

afterEach(() => vi.restoreAllMocks());

describe('FIX03A · H1 cancel / expiry with credentials (real adapter + DB semantics)', () => {
  it('H1-1 cancel in select_location with credentials disconnects and clears credentials atomically', async () => {
    const t = setup();
    const before = structuredClone(t.row('src-a'));
    const res = await t.call({ action: 'cancel', businessId: 'biz-b' });
    expect(res).toMatchObject({ status: 200, body: { success: true, recovered: true, status: 'disconnected', code: 'USER_CANCELLED' } });
    expect(t.row('src-b').status).toBe('disconnected');
    expect(credentialsOf(t.row('src-b'))).toEqual([null, null, null]);
    expect(t.db.vault.has('vault:src-b-access')).toBe(false);
    expect(t.db.vault.has('vault:src-b-refresh')).toBe(false);
    expect(t.row('src-a')).toEqual(before);
    expect(t.db.vault.has('vault:src-a-access')).toBe(true);
    expect(t.db.writes).toEqual(['src-b']);
  });

  it('H1-2 expiry in select_location with credentials disconnects and clears credentials atomically', async () => {
    const t = setup([credentialedRow('src-a', 'owner', 'biz-a', 31 * MIN), credentialedRow('src-b', 'owner', 'biz-b', 31 * MIN)]);
    const res = await t.call({ action: 'recover', businessId: 'biz-a' });
    expect(res).toMatchObject({ status: 200, body: { success: true, recovered: true, status: 'disconnected', code: 'ATTEMPT_EXPIRED' } });
    expect(credentialsOf(t.row('src-a'))).toEqual([null, null, null]);
    expect(t.db.vault.has('vault:src-a-access')).toBe(false);
    expect(credentialsOf(t.row('src-b'))).not.toContain(null);
    expect(t.db.writes).toEqual(['src-a']);
  });

  it('H1-2b a select_location attempt that has not expired is left untouched', async () => {
    const t = setup();
    const res = await t.call({ action: 'recover', businessId: 'biz-a' });
    expect(res.body).toMatchObject({ success: true, recovered: false, status: 'connecting' });
    expect(t.db.writes).toEqual([]);
  });

  it('H1-3 a credential-clearing failure aborts the transition and is never reported as success', async () => {
    const t = setup();
    const before = structuredClone(t.row('src-b'));
    t.db.setFault('vault_error');
    const res = await t.call({ action: 'cancel', businessId: 'biz-b' });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(t.row('src-b')).toEqual(before);
    expect(t.db.vault.has('vault:src-b-access')).toBe(true);
  });

  it('H1-4 a state-update database error is never reported as success', async () => {
    for (const action of ['cancel', 'recover'] as const) {
      const rows = [credentialedRow('src-a', 'owner', 'biz-a', 31 * MIN)];
      const t = setup(rows, [{ id: 'biz-a', user_id: 'owner' }]);
      t.db.setFault('db_error');
      const res = await t.call({ action });
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
      expect(res.body.recovered).not.toBe(true);
      expect(t.row('src-a')).toEqual(rows[0]);
    }
  });

  it('H1-4b the CHECK constraint would reject the transition without the trigger (premise control)', async () => {
    const t = setup();
    t.db.setFault('no_trigger');
    const res = await t.call({ action: 'cancel', businessId: 'biz-b' });
    expect(res.body.success).toBe(false);
    expect(t.row('src-b').status).toBe('connecting');
  });

  it('H1-5 a repeated cancel is idempotent and performs no further writes', async () => {
    const t = setup();
    expect((await t.call({ action: 'cancel', businessId: 'biz-b' })).body.recovered).toBe(true);
    const again = await t.call({ action: 'cancel', businessId: 'biz-b' });
    expect(again).toMatchObject({ status: 200, body: { success: true, recovered: false, status: 'disconnected' } });
    expect(t.db.writes).toEqual(['src-b']);
  });

  it('H1-5b a concurrent change (0 rows matched) is a conflict, not an error, and writes nothing', async () => {
    const t = setup();
    t.db.onUpdate(() => { t.row('src-b').updated_at = NOW.toISOString(); });
    const res = await t.call({ action: 'cancel', businessId: 'biz-b' });
    expect(res).toMatchObject({ status: 200, body: { success: true, recovered: false, status: 'connecting', changed: true } });
    expect(credentialsOf(t.row('src-b'))).not.toContain(null);
    expect(t.db.writes).toEqual([]);
  });

  it('H1-6 an attempt of another business cannot be cancelled or expired', async () => {
    const t = setup([credentialedRow('src-a', 'owner', 'biz-a', 31 * MIN), credentialedRow('src-x', 'other', 'foreign', 31 * MIN)],
      [{ id: 'biz-a', user_id: 'owner' }, { id: 'foreign', user_id: 'other' }]);
    for (const action of ['cancel', 'recover']) {
      const res = await t.call({ action, businessId: 'foreign' });
      expect(res.status).toBe(403);
    }
    expect(t.db.writes).toEqual([]);
    expect(credentialsOf(t.row('src-x'))).not.toContain(null);
  });

  it('H1-7 an attempt of another user is never mutated by the adapter, even with a known row id', async () => {
    const t = setup([credentialedRow('src-x', 'other', 'biz-a', 31 * MIN)], [{ id: 'biz-a', user_id: 'owner' }]);
    const res = await t.call({ action: 'cancel', businessId: 'biz-a' });
    expect(res.body).toMatchObject({ success: true, recovered: false, status: null });
    const foreign = t.row('src-x');
    const result = await t.deps.updateIfUnchanged('owner', { id: 'src-x', status: 'connecting', metadata: {}, updated_at: String(foreign.updated_at) }, { status: 'disconnected' });
    expect(isApplied(result)).toBe(false);
    expect(t.db.writes).toEqual([]);
    expect(foreign.status).toBe('connecting');
    expect(credentialsOf(foreign)).not.toContain(null);
  });

  it('H1-8 an attempt without credentials keeps the existing cancel behaviour', async () => {
    const plain: Row = { ...credentialedRow('src-a', 'owner', 'biz-a'), access_token_encrypted: null, refresh_token_encrypted: null, token_expires_at: null,
      metadata: { phase: 'authorizing', oauth_state: 's'.repeat(64), oauth_started_at: ago(MIN) } };
    const t = setup([plain], [{ id: 'biz-a', user_id: 'owner' }]);
    const res = await t.call({ action: 'cancel', reason: 'NO_LOCATIONS' });
    expect(res).toMatchObject({ status: 200, body: { success: true, recovered: true, status: 'disconnected', code: 'NO_LOCATIONS' } });
    expect((t.row('src-a').metadata as Row).oauth_state).toBeUndefined();
  });
});
