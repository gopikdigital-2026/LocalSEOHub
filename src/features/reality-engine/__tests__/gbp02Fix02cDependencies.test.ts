import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as contract from '../../../../supabase/functions/activeBusiness';
import { createHandler as listHandler, type HandlerDeps } from '../../../../supabase/functions/gbp-list-locations/handler';
import { createHandler as recoverHandler, type RecoverDeps } from '../../../../supabase/functions/gbp-recover-attempt/handler';
import { createHandler as callbackHandler, type CallbackDeps } from '../../../../supabase/functions/gbp-oauth-callback/handler';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), event: vi.fn(), deleteSource: vi.fn() }));
vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('../repositories', () => ({ addSyncEvent: mocks.event, deleteSource: mocks.deleteSource, upsertSource: vi.fn() }));
import { disconnectSource } from '../engine';

const root = resolve(__dirname, '../../../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');
const NOW = new Date('2026-11-23T12:00:00Z');
const rows = [
  { id: 'source-a', user_id: 'owner', business_id: 'biz-a', source_type: 'google_business', status: 'connecting', updated_at: '2026-11-23T10:00:00Z', metadata: { oauth_state: 'state-a', oauth_started_at: '2026-11-23T10:00:00Z' } },
  { id: 'source-b', user_id: 'owner', business_id: 'biz-b', source_type: 'google_business', status: 'connecting', updated_at: '2026-11-23T11:00:00Z', metadata: { oauth_state: 'state-b', oauth_started_at: '2026-11-23T11:00:00Z' } },
];
type Row = Record<string, unknown>;

function adapters<T>(slug: string, businesses = [{ id: 'biz-a', user_id: 'owner' }, { id: 'biz-b', user_id: 'owner' }]) {
  const changes: string[] = [];
  const dataRows: Row[] = structuredClone(rows);
  const rpcCalls: { fn: string; args: Row }[] = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
    async rpc(fn: string, args: Row) {
      rpcCalls.push({ fn, args });
      if (fn === 'gbp_consume_oauth_state') {
        const r = dataRows.find((x) => x.status === 'connecting' && (x.metadata as Row)?.oauth_state === args.p_state);
        if (!r) return { data: [{ r_result: 'NOT_FOUND', r_source_id: null, r_user_id: null, r_business_id: null, r_attempt_id: null }], error: null };
        changes.push(String(r.id));
        r.metadata = { ...(r.metadata as Row), oauth_state: undefined, phase: 'exchanging', attempt_id: `attempt-${r.id}` };
        return { data: [{ r_result: 'CONSUMED', r_source_id: r.id, r_user_id: r.user_id, r_business_id: r.business_id, r_attempt_id: `attempt-${r.id}` }], error: null };
      }
      if (fn === 'gbp_complete_oauth_attempt') return { data: 'COMPLETED', error: null };
      if (fn === 'gbp_fail_oauth_attempt') return { data: 'FAILED', error: null };
      return { data: null, error: { code: 'unknown_rpc' } };
    },
    from(table: string) {
      let data: Row[] = table === 'businesses' ? businesses : dataRows;
      let patch: Row | null = null;
      const result = () => {
        if (patch) for (const row of data) { changes.push(String(row.id)); Object.assign(row, patch); }
        return { data: data.map((r) => ({ ...r })), error: null };
      };
      const q = {
        select: () => q,
        update(p: Row) { patch = p; return q; },
        eq(k: string, v: unknown) { data = data.filter((r) => k === 'metadata->>oauth_state' ? (r.metadata as Row)?.oauth_state === v : r[k] === v); return q; },
        neq(k: string, v: unknown) { data = data.filter((r) => r[k] !== v); return q; },
        limit(n: number) { data = data.slice(0, n); return Promise.resolve(result()); },
        maybeSingle: async () => ({ data: data.length === 1 ? { ...data[0] } : null, error: data.length > 1 ? { code: 'multiple' } : null }),
        then(onFulfilled: (r: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(onFulfilled); },
      };
      return q;
    },
  };
  let captured: T | undefined;
  const code = transformSync(source(`supabase/functions/${slug}/index.ts`), { loader: 'ts', format: 'cjs' }).code;
  runInNewContext(code, {
    Deno: { env: { get: () => 'test' }, serve: () => undefined },
    require: (name: string) => {
      if (name.startsWith('jsr:')) return {};
      if (name.startsWith('npm:')) return { createClient: () => db };
      if (name === '../activeBusiness.ts') return contract;
      if (name === './handler.ts') return { createHandler: (deps: T) => { captured = deps; return () => undefined; } };
      if (name === './gbpToken.ts') return { vaultCredentialStore: () => ({}) };
      throw new Error(`Unexpected import ${name}`);
    },
    fetch: () => { throw new Error('Real network forbidden'); },
  });
  if (!captured) throw new Error('Adapter not captured');
  return { deps: captured, changes, dataRows, rpcCalls };
}
const post = (body: unknown) => new Request('https://x/test', { method: 'POST', headers: { Authorization: 'Bearer mock', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('FIX02C · locations with real adapter ownership queries', () => {
  function setup(businesses?: { id: string; user_id: string }[]) {
    const a = adapters<HandlerDeps>('gbp-list-locations', businesses);
    const credentials = vi.fn((id: string) => ({
      read: async () => ({ accessToken: `token-${id}`, refreshToken: null, expiresAt: '2099-01-01T00:00:00Z' }),
      write: async () => true,
    }));
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const token = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ locations: [{ name: token.includes('source-a') ? 'locations/111' : 'locations/222', title: token }] }));
    });
    const handle = listHandler({ ...a.deps, credentials, fetch: fetchMock as typeof fetch });
    return { handle, credentials, fetchMock, changes: a.changes };
  }

  it.each(['biz-a', 'biz-b'])('uses only the credentials and locations of %s', async (businessId) => {
    const { handle, credentials } = setup();
    const res = await handle(post({ businessId, accountId: 'accounts/123' }));
    expect(res.status).toBe(200);
    expect(credentials).toHaveBeenCalledExactlyOnceWith(businessId === 'biz-a' ? 'source-a' : 'source-b');
    expect((await res.json()).locations[0].name).toBe(businessId === 'biz-a' ? 'locations/111' : 'locations/222');
  });

  it('missing selection returns 409 without touching credentials or Google', async () => {
    const { handle, credentials, fetchMock, changes } = setup();
    const res = await handle(post({ accountId: 'accounts/123' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('BUSINESS_SELECTION_REQUIRED');
    expect(credentials).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it('single business is automatic', async () => {
    const { handle, credentials } = setup([{ id: 'biz-a', user_id: 'owner' }]);
    expect((await handle(post({ accountId: 'accounts/123' }))).status).toBe(200);
    expect(credentials).toHaveBeenCalledExactlyOnceWith('source-a');
  });

  it.each(['foreign', 'nonexistent', 'accounts/123'])('rejects %s without credential access', async (businessId) => {
    const { handle, credentials, fetchMock } = setup([{ id: 'biz-a', user_id: 'owner' }, { id: 'foreign', user_id: 'other' }]);
    expect((await handle(post({ businessId }))).status).toBe(403);
    expect(credentials).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('FIX02C · recover and cancel with real adapter mutations', () => {
  it.each(['recover', 'cancel'])('%s changes only selected business B', async (action) => {
    const { deps, changes, dataRows } = adapters<RecoverDeps>('gbp-recover-attempt');
    const originalA = structuredClone(dataRows[0]);
    const handle = recoverHandler({ ...deps, now: () => NOW });
    const res = await handle(post({ action, businessId: 'biz-b' }));
    expect(res.status).toBe(200);
    expect((await res.json()).recovered).toBe(true);
    expect(changes).toEqual(['source-b']);
    expect(dataRows[0]).toEqual(originalA);
  });

  it.each(['recover', 'cancel'])('%s without selection returns 409 with no writes', async (action) => {
    const { deps, changes } = adapters<RecoverDeps>('gbp-recover-attempt');
    const res = await recoverHandler(deps)(post({ action }));
    expect(res.status).toBe(409);
    expect(changes).toEqual([]);
  });

  it('single business recovers automatically', async () => {
    const { deps, changes } = adapters<RecoverDeps>('gbp-recover-attempt', [{ id: 'biz-a', user_id: 'owner' }]);
    expect((await recoverHandler({ ...deps, now: () => NOW })(post({ action: 'recover' }))).status).toBe(200);
    expect(changes).toEqual(['source-a']);
  });

  it.each(['foreign', 'nonexistent', 'accounts/123'])('rejects %s without mutations', async (businessId) => {
    const { deps, changes } = adapters<RecoverDeps>('gbp-recover-attempt', [{ id: 'biz-a', user_id: 'owner' }, { id: 'foreign', user_id: 'other' }]);
    expect((await recoverHandler(deps)(post({ action: 'cancel', businessId }))).status).toBe(403);
    expect(changes).toEqual([]);
  });
});

describe('FIX02C · OAuth callback association (FIX03B consume/complete adapters)', () => {
  const hexState = (suffix: string) => suffix.repeat(64);

  it.each(['a', 'b'])('state-%s stores credentials only for its own source', async (suffix) => {
    const { deps, dataRows, rpcCalls, changes } = adapters<CallbackDeps>('gbp-oauth-callback');
    for (const r of dataRows) (r.metadata as Row).oauth_state = hexState(String(r.business_id).slice(-1));
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).includes('/token')
      ? { access_token: 'synthetic', refresh_token: 'synthetic-r', expires_in: 3600 }
      : { accounts: [{ name: 'accounts/123' }] })));
    const handle = callbackHandler({ ...deps, fetch: fetchMock as typeof fetch });
    const res = await handle(new Request(`https://x/cb?state=${hexState(suffix)}&code=mock`));
    expect(res.headers.get('Location')).toContain('accounts=');
    expect(changes).toEqual([`source-${suffix}`]);
    const completes = rpcCalls.filter((c) => c.fn === 'gbp_complete_oauth_attempt');
    expect(completes).toHaveLength(1);
    expect(completes[0].args).toMatchObject({
      p_source_id: `source-${suffix}`, p_user_id: 'owner', p_business_id: `biz-${suffix}`,
      p_attempt_id: `attempt-source-${suffix}`, p_state: hexState(suffix),
    });
  });

  it('unknown state never accesses tokens or changes a source', async () => {
    const { deps, rpcCalls, changes } = adapters<CallbackDeps>('gbp-oauth-callback');
    const fetchMock = vi.fn(() => { throw new Error('Real network forbidden'); });
    for (const state of ['unknown', 'f'.repeat(64)]) {
      const res = await callbackHandler({ ...deps, fetch: fetchMock })(new Request(`https://x/cb?state=${state}&code=mock`));
      expect(res.headers.get('Location')).toContain('ATTEMPT_NOT_FOUND');
    }
    expect(rpcCalls.map((c) => c.fn)).toEqual(['gbp_consume_oauth_state']);
    expect(changes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('FIX02C · interface disconnect propagation', () => {
  it('passes selected business to GBP disconnect', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await disconnectSource('source-b', 'google_business', 'biz-b');
    expect(mocks.invoke).toHaveBeenLastCalledWith('gbp-disconnect', { body: { businessId: 'biz-b' } });
    expect(source('src/features/reality-engine/SourceManager.tsx')).toContain("source.source_type === 'google_business' ? source.business_id : undefined");
  });

  it('single-business caller without id retains server auto resolution', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await disconnectSource('source-a', 'google_business');
    expect(mocks.invoke).toHaveBeenLastCalledWith('gbp-disconnect', { body: {} });
  });
});
