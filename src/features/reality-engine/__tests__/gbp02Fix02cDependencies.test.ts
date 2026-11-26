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
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
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
  return { deps: captured, changes, dataRows };
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

describe('FIX02C · unchanged OAuth callback association', () => {
  it.each(['a', 'b'])('state-%s stores credentials only for its own source', async (suffix) => {
    const { deps } = adapters<CallbackDeps>('gbp-oauth-callback');
    const store = vi.fn(async () => true);
    const update = vi.fn(async () => true);
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).includes('/token')
      ? { access_token: 'synthetic', expires_in: 3600 }
      : { accounts: [{ name: 'accounts/123' }] })));
    const handle = callbackHandler({ ...deps, storeCredentials: store, updateAttempt: update, fetch: fetchMock as typeof fetch });
    expect((await handle(new Request(`https://x/cb?state=state-${suffix}&code=mock`))).status).toBe(302);
    expect(store).toHaveBeenCalledExactlyOnceWith(`source-${suffix}`, expect.any(Object));
    expect(update).toHaveBeenCalledWith(`source-${suffix}`, expect.any(Object));
  });

  it('unknown state never accesses tokens or changes a source', async () => {
    const { deps } = adapters<CallbackDeps>('gbp-oauth-callback');
    const store = vi.fn();
    const update = vi.fn();
    const fetchMock = vi.fn(() => { throw new Error('Real network forbidden'); });
    const res = await callbackHandler({ ...deps, storeCredentials: store, updateAttempt: update, fetch: fetchMock })(new Request('https://x/cb?state=unknown&code=mock'));
    expect(res.headers.get('Location')).toContain('ATTEMPT_NOT_FOUND');
    expect(store).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
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
