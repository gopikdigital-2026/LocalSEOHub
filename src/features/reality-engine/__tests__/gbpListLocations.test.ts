import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHandler, type HandlerDeps, type SourceRow } from '../../../../supabase/functions/gbp-list-locations/handler.ts';
import { mapGoogleError, needsRefresh, normalizeLocations } from '../../../../supabase/functions/gbp-list-locations/logic.ts';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');

const ACCESS = 'ya29.SECRET_ACCESS_TOKEN';
const REFRESH = '1//SECRET_REFRESH_TOKEN';
const NOW = Date.parse('2026-10-07T10:00:00Z');

const validSource: SourceRow = {
  id: 'src-1',
  access_token_encrypted: ACCESS,
  refresh_token_encrypted: REFRESH,
  token_expires_at: new Date(NOW + 3600_000).toISOString(),
};

function reply(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

function setup(opts: {
  userId?: string | null;
  source?: SourceRow | null;
  google?: (url: string) => Response;
}) {
  const updates: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return reply(200, { access_token: 'ya29.NEW_TOKEN', expires_in: 3600 });
    }
    return opts.google ? opts.google(url) : reply(200, {});
  });
  const deps: HandlerDeps = {
    getUserId: async () => (opts.userId === undefined ? 'user-a' : opts.userId),
    loadSource: async () => ({ row: opts.source === undefined ? validSource : opts.source, failed: false }),
    updateSource: async (_u, _s, patch) => {
      updates.push(patch);
    },
    fetch: fetchMock as unknown as typeof fetch,
    env: (n) => ({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret' } as Record<string, string>)[n],
    now: () => NOW,
  };
  return { handle: createHandler(deps), fetchMock, updates };
}

function request(body: unknown = { accountId: 'accounts/111' }, auth = 'Bearer jwt') {
  return new Request('https://x/functions/v1/gbp-list-locations', {
    method: 'POST',
    headers: auth ? { Authorization: auth, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function call(handle: (r: Request) => Promise<Response>, req: Request) {
  const res = await handle(req);
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text), headers: res.headers };
}

describe('gbp-list-locations: authentication', () => {
  it('rejects a request with no JWT', async () => {
    const { handle, fetchMock } = setup({});
    const r = await call(handle, request(undefined, ''));
    expect(r.status).toBe(401);
    expect(r.json).toMatchObject({ success: false, code: 'NOT_AUTHENTICATED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid JWT', async () => {
    const { handle } = setup({ userId: null });
    const r = await call(handle, request());
    expect(r.status).toBe(401);
    expect(r.json.code).toBe('NOT_AUTHENTICATED');
  });

  it('carries CORS headers on errors', async () => {
    const { handle } = setup({ userId: null });
    const r = await call(handle, request());
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects malformed account ids instead of building arbitrary Google paths', async () => {
    const { handle, fetchMock } = setup({});
    const r = await call(handle, request({ accountId: 'accounts/1/../../x' }));
    expect(r.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('gbp-list-locations: no connection', () => {
  it('returns NOT_CONNECTED when there is no stored connection', async () => {
    const { handle, fetchMock } = setup({ source: null });
    const r = await call(handle, request());
    expect(r.json).toEqual(expect.objectContaining({ success: false, code: 'NOT_CONNECTED', retryable: false }));
    expect(r.json.locations).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('gbp-list-locations: Google errors never fabricate a location', () => {
  it('403 returns GBP_API_UNAVAILABLE', async () => {
    const { handle, updates } = setup({ google: () => reply(403, { error: { status: 'PERMISSION_DENIED', message: 'detail ' + ACCESS } }) });
    const r = await call(handle, request());
    expect(r.json).toMatchObject({ success: false, code: 'GBP_API_UNAVAILABLE', retryable: false });
    expect(r.json.locations).toBeUndefined();
    expect(r.text).not.toContain('detail');
    expect(updates[updates.length - 1]).toMatchObject({ last_error: 'GBP_API_UNAVAILABLE' });
  });

  it('429 returns a retryable quota error', async () => {
    const { handle } = setup({ google: () => reply(429, { error: { status: 'RESOURCE_EXHAUSTED' } }) });
    const r = await call(handle, request());
    expect(r.json).toMatchObject({ success: false, code: 'GBP_QUOTA_EXCEEDED', retryable: true });
    expect(r.json.locations).toBeUndefined();
  });

  it('429 with a zero quota (project not allowlisted) is reported as unavailable, not retryable', () => {
    const e = mapGoogleError(429, '{"error":{"details":[{"metadata":{"quota_limit_value": "0"}}]}}');
    expect(e).toMatchObject({ code: 'GBP_API_UNAVAILABLE', retryable: false });
  });

  it('503 is unavailable but retryable', () => {
    expect(mapGoogleError(503, '')).toMatchObject({ code: 'GBP_API_UNAVAILABLE', retryable: true });
  });

  it('an empty response returns an empty list, never a placeholder', async () => {
    const { handle } = setup({ google: () => reply(200, {}) });
    const r = await call(handle, request());
    expect(r.json).toEqual({ success: true, locations: [], accountsQueried: 1, partial: false });
  });
});

describe('gbp-list-locations: real locations', () => {
  it('returns several real locations across accounts and pages', async () => {
    const { handle } = setup({
      google: (url) => {
        if (url.includes('/v1/accounts?')) return reply(200, { accounts: [{ name: 'accounts/111' }, { name: 'accounts/222' }] });
        if (url.includes('accounts/111/locations') && !url.includes('pageToken')) {
          return reply(200, { locations: [{ name: 'locations/1', title: 'Centro' }], nextPageToken: 'p2' });
        }
        if (url.includes('accounts/111/locations')) return reply(200, { locations: [{ name: 'locations/2', title: 'Norte' }] });
        return reply(200, { locations: [{ name: 'locations/3', title: 'Sur', storefrontAddress: { addressLines: ['Calle 1'], locality: 'Madrid' } }] });
      },
    });
    const r = await call(handle, request({}));
    expect(r.json.success).toBe(true);
    expect(r.json.accountsQueried).toBe(2);
    expect(r.json.locations.map((l: { name: string }) => l.name)).toEqual(['locations/1', 'locations/2', 'locations/3']);
    expect(r.json.locations[2]).toMatchObject({ accountId: 'accounts/222', address: 'Calle 1, Madrid' });
  });

  it('drops placeholder or malformed location names', () => {
    const out = normalizeLocations(
      { locations: [{ name: 'locations/default' }, { name: 'accounts/1/locations/default' }, { name: 'bogus' }, { name: 'locations/9', title: 'Real' }] },
      'accounts/1',
    );
    expect(out.map((l) => l.name)).toEqual(['locations/9']);
  });

  it('source never constructs a /locations/default path', () => {
    for (const f of ['handler.ts', 'logic.ts', 'index.ts']) {
      const code = src(`supabase/functions/gbp-list-locations/${f}`);
      expect(code).not.toMatch(/`[^`]*locations\/default/);
    }
  });
});

describe('gbp-list-locations: token handling', () => {
  it('refreshes an expired access token and stores the new one server-side', async () => {
    const expired = { ...validSource, token_expires_at: new Date(NOW - 1000).toISOString() };
    const { handle, updates } = setup({
      source: expired,
      google: () => reply(200, { locations: [{ name: 'locations/1', title: 'A' }] }),
    });
    const r = await call(handle, request());
    expect(r.json.success).toBe(true);
    expect(updates[0]).toMatchObject({ access_token_encrypted: 'ya29.NEW_TOKEN' });
    expect(r.text).not.toContain('NEW_TOKEN');
  });

  it('reports NOT_CONFIGURED when a refresh is needed but OAuth secrets are missing', async () => {
    const expired = { ...validSource, token_expires_at: null };
    const h = createHandler({
      getUserId: async () => 'user-a',
      loadSource: async () => ({ row: expired, failed: false }),
      updateSource: async () => {},
      fetch: vi.fn() as unknown as typeof fetch,
      env: () => undefined,
    });
    const r = await call(h, request());
    expect(r.json.code).toBe('NOT_CONFIGURED');
  });

  it('no response ever contains the access or refresh token', async () => {
    const scenarios = [
      setup({ google: () => reply(200, { locations: [{ name: 'locations/1', title: 'A' }] }) }),
      setup({ google: () => reply(403, `forbidden ${ACCESS} ${REFRESH}`) }),
      setup({ google: () => reply(429, `quota ${ACCESS}`) }),
      setup({ google: () => reply(500, `boom ${REFRESH}`) }),
      setup({ source: null }),
    ];
    for (const s of scenarios) {
      const r = await call(s.handle, request());
      expect(r.text).not.toContain(ACCESS);
      expect(r.text).not.toContain(REFRESH);
      expect(r.text).not.toMatch(/access_token|refresh_token/);
    }
  });

  it('needsRefresh treats missing or near expiry as stale', () => {
    expect(needsRefresh(null, NOW)).toBe(true);
    expect(needsRefresh(new Date(NOW + 30_000).toISOString(), NOW)).toBe(true);
    expect(needsRefresh(new Date(NOW + 600_000).toISOString(), NOW)).toBe(false);
  });
});

describe('security: tokens and logs', () => {
  it('client column grants on connected_sources exclude token columns', () => {
    const sql = src('supabase/migrations/20260804165058_create_connected_sources_and_sync_events.sql');
    const grants = sql.slice(sql.indexOf('REVOKE ALL ON connected_sources'));
    const selectGrant = grants.slice(grants.indexOf('GRANT SELECT'), grants.indexOf('TO authenticated;'));
    expect(selectGrant).not.toMatch(/token_encrypted/);
    expect(grants.slice(grants.indexOf('GRANT INSERT'), grants.indexOf('GRANT DELETE'))).not.toMatch(/token_encrypted/);
  });

  it('GBP functions never log tokens or raw Google bodies', () => {
    for (const f of ['gbp-oauth-callback', 'gbp-oauth-start', 'gbp-sync', 'gbp-list-locations']) {
      const files = f === 'gbp-list-locations' ? ['index.ts', 'handler.ts', 'logic.ts'] : ['index.ts'];
      for (const file of files) {
        const code = src(`supabase/functions/${f}/${file}`);
        const logs = code.match(/console\.(log|error|warn|info)\([^;]*\);/g) ?? [];
        for (const line of logs) {
          expect(line).not.toMatch(/tokens\.|_token|errBody|\bbody\b|\.text\(\)/i);
        }
      }
    }
  });

  it('frontend never selects token columns', () => {
    const repo = src('src/features/reality-engine/repositories.ts');
    const engine = src('src/features/reality-engine/engine.ts');
    expect(repo + engine).not.toMatch(/token_encrypted/);
  });
});
