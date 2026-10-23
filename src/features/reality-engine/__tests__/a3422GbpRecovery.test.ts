import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHandler as createStart, type StartDeps, type AttemptStart } from '../../../../supabase/functions/gbp-oauth-start/handler.ts';
import {
  createHandler as createCallback,
  classifyGoogleAuthError,
  classifyTokenExchangeError,
  type CallbackDeps,
  type Attempt,
} from '../../../../supabase/functions/gbp-oauth-callback/handler.ts';
import { createHandler as createSync, parseSelection, type SyncDeps, type SourceRow } from '../../../../supabase/functions/gbp-sync/handler.ts';
import {
  createHandler as createRecover,
  staleTransition,
  type RecoverDeps,
  type AttemptRow,
} from '../../../../supabase/functions/gbp-recover-attempt/handler.ts';
import type { CredentialStore, StoredCredentials } from '../../../../supabase/functions/gbp-sync/gbpToken.ts';
import { sourceDisplayStatus } from '../sourceStatus';
import { isStaleGBPAttempt, gbpErrorMessage } from '../gbpStatus';
import { SOURCE_REGISTRY } from '../registry';
import type { ConnectedSource } from '../types';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');
const migration = src('supabase/migrations/20261021154643_a3422_gbp_server_owned_connection_state.sql');

const USER = 'user-1';
const OTHER_USER = 'user-2';
const BIZ = 'biz-1';
const OTHER_BIZ = 'biz-2';
const SOURCE_ID = 'src-1';
const STATE = 'a'.repeat(64);
const AUTH_CODE = '4/SECRET_AUTH_CODE';
const ACCESS = 'ya29.SECRET_ACCESS';
const REFRESH = '1//SECRET_REFRESH';
const NOW = new Date('2026-10-21T10:00:00Z');
const MIN = 60_000;

const env = (overrides: Record<string, string | undefined> = {}) => (name: string) => ({
  GOOGLE_CLIENT_ID: '527097264879-test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'https://example.supabase.co/functions/v1/gbp-oauth-callback',
  SITE_URL: 'https://localseohub.io',
  ...overrides,
} as Record<string, string | undefined>)[name];

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function logSpies() {
  return [
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'info').mockImplementation(() => undefined),
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
  ];
}
const loggedText = (spies: ReturnType<typeof logSpies>) =>
  spies.flatMap((s) => s.mock.calls.flat()).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');

afterEach(() => vi.restoreAllMocks());

// ─── OAuth start ────────────────────────────────────────────────────────────

function startHarness(overrides: Partial<StartDeps> = {}) {
  const attempts: AttemptStart[] = [];
  const deps: StartDeps = {
    getUserId: async (jwt) => (jwt === 'good' ? USER : null),
    getOwnBusinessId: async () => BIZ,
    beginAttempt: async (a) => { attempts.push(a); return true; },
    env: env(),
    randomState: () => STATE,
    now: () => NOW,
    ...overrides,
  };
  const call = (body: unknown = { businessId: BIZ }, jwt = 'good') =>
    createStart(deps)(new Request('https://x/gbp-oauth-start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  return { attempts, call };
}

describe('A3.4.2.2 OAuth start', () => {
  it('1. sets connecting server-side with offline consent and business.manage', async () => {
    const h = startHarness();
    const res = await h.call();
    expect(res.status).toBe(200);
    const body = await res.json();
    const url = new URL(body.url);
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/business.manage');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe(STATE);
    expect(h.attempts).toEqual([{ userId: USER, businessId: BIZ, state: STATE, startedAt: NOW.toISOString() }]);

    const index = src('supabase/functions/gbp-oauth-start/index.ts');
    expect(index).toContain('attemptRow');
    expect(index).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('2. a new attempt clears a stale last_error and stale ids', async () => {
    const { attemptRow } = await import('../../../../supabase/functions/gbp-oauth-start/handler.ts');
    const row = attemptRow({ userId: USER, businessId: BIZ, state: STATE, startedAt: NOW.toISOString() });
    expect(row).toMatchObject({
      status: 'connecting', last_error: null, external_account_id: null, external_location_id: null,
      metadata: { phase: 'authorizing', oauth_state: STATE, oauth_started_at: NOW.toISOString() },
    });
  });

  it('rejects unauthenticated, foreign-business and failed-write starts', async () => {
    expect((await startHarness().call({ businessId: BIZ }, 'bad')).status).toBe(401);
    expect((await startHarness().call({ businessId: OTHER_BIZ })).status).toBe(403);
    expect((await startHarness({ beginAttempt: async () => false }).call()).status).toBe(500);
    const noEnv = await startHarness({ env: env({ GOOGLE_CLIENT_ID: undefined }) }).call();
    expect(noEnv.status).toBe(503);
  });
});

// ─── OAuth callback ─────────────────────────────────────────────────────────

interface Row { id: string; userId: string; businessId: string; state: string | null; status: string; patches: Record<string, unknown>[] }

function callbackHarness(opts: {
  fetch?: (url: string) => Response | Promise<Response>;
  store?: boolean | 'throw';
  owns?: boolean | 'throw';
  find?: 'throw';
} = {}) {
  const rows: Row[] = [
    { id: SOURCE_ID, userId: USER, businessId: BIZ, state: STATE, status: 'connecting', patches: [] },
    { id: 'src-other', userId: OTHER_USER, businessId: OTHER_BIZ, state: 'b'.repeat(64), status: 'connected', patches: [] },
  ];
  const cleared: string[] = [];
  const stored: string[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (opts.fetch) return opts.fetch(url);
    if (url.includes('oauth2.googleapis.com/token')) return jsonRes({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 });
    if (url.includes('/v1/accounts')) return jsonRes({ accounts: [{ name: 'accounts/123', accountName: 'Mi cuenta' }] });
    return jsonRes({}, 404);
  });
  const deps: CallbackDeps = {
    env: env(),
    findAttempt: async (state) => {
      if (opts.find === 'throw') throw new Error('db down');
      const r = rows.find((x) => x.state === state && x.status === 'connecting');
      return r ? ({ id: r.id, userId: r.userId, businessId: r.businessId, startedAt: NOW.toISOString() } satisfies Attempt) : null;
    },
    ownsBusiness: async (u, b) => {
      if (opts.owns === 'throw') throw new Error('db down');
      return opts.owns ?? (u === USER && b === BIZ);
    },
    storeCredentials: async (id) => {
      if (opts.store === 'throw') throw new Error('vault down');
      stored.push(id);
      return opts.store ?? true;
    },
    clearCredentials: async (id) => { cleared.push(id); },
    updateAttempt: async (id, patch) => {
      const r = rows.find((x) => x.id === id && x.status === 'connecting');
      if (!r) return false;
      r.patches.push(patch);
      r.status = String(patch.status);
      return true;
    },
    fetch: fetchFn as unknown as typeof fetch,
    now: () => NOW,
  };
  const call = (query: string) => createCallback(deps)(new Request(`https://x/gbp-oauth-callback?${query}`));
  const own = () => rows[0];
  return { rows, own, cleared, stored, fetchFn, call };
}

const errorOf = (res: Response) => new URL(res.headers.get('Location')!).searchParams.get('error');

describe('A3.4.2.2 OAuth callback failure recovery', () => {
  it('3. Google cancellation terminates the attempt as disconnected', async () => {
    const h = callbackHarness();
    const res = await h.call(`error=access_denied&state=${STATE}`);
    expect(res.status).toBe(302);
    expect(errorOf(res)).toBe('GOOGLE_CONSENT_DENIED');
    expect(h.own().status).toBe('disconnected');
    expect(h.own().patches[0]).toMatchObject({ last_error: 'GOOGLE_CONSENT_DENIED', metadata: { phase: 'failed', oauth_state: null } });
    expect(h.fetchFn).not.toHaveBeenCalled();
  });

  it('4. every callback error leaves connecting; config errors are classified', async () => {
    expect(classifyGoogleAuthError('redirect_uri_mismatch')).toEqual({ status: 'error', code: 'GOOGLE_REDIRECT_URI_MISMATCH' });
    expect(classifyGoogleAuthError('invalid_client')).toEqual({ status: 'error', code: 'GOOGLE_CLIENT_CONFIGURATION_FAILURE' });
    expect(classifyTokenExchangeError('redirect_uri_mismatch')).toBe('GOOGLE_REDIRECT_URI_MISMATCH');
    expect(classifyTokenExchangeError('invalid_client')).toBe('GOOGLE_CLIENT_CONFIGURATION_FAILURE');

    const scenarios: [string, Parameters<typeof callbackHarness>[0]][] = [
      [`error=redirect_uri_mismatch&state=${STATE}`, {}],
      [`error=invalid_client&state=${STATE}`, {}],
      [`state=${STATE}`, {}],
      [`code=x&state=${STATE}`, { owns: 'throw' }],
      [`code=x&state=${STATE}`, { owns: false }],
      [`code=x&state=${STATE}`, { fetch: () => { throw new Error('net'); } }],
      [`code=x&state=${STATE}`, { fetch: (u) => (u.includes('token') ? jsonRes({ access_token: ACCESS }) : jsonRes({ accounts: [] })) }],
    ];
    for (const [query, opts] of scenarios) {
      const h = callbackHarness(opts);
      const res = await h.call(query);
      expect(res.status).toBe(302);
      expect(errorOf(res)).toBeTruthy();
      expect(h.own().status).not.toBe('connecting');
      expect(['error', 'permissions_required', 'disconnected']).toContain(h.own().status);
    }
  });

  it('5. an invalid or missing state cannot mutate any source', async () => {
    for (const query of ['code=x&state=' + 'b'.repeat(64), 'code=x&state=unknown', 'code=x', 'error=access_denied&state=unknown']) {
      const h = callbackHarness();
      const res = await h.call(query);
      expect(res.status).toBe(302);
      expect(h.rows.every((r) => r.patches.length === 0)).toBe(true);
      expect(h.fetchFn).not.toHaveBeenCalled();
    }
    const lookupDown = callbackHarness({ find: 'throw' });
    expect(errorOf(await lookupDown.call(`code=x&state=${STATE}`))).toBe('ATTEMPT_LOOKUP_FAILED');
    expect(src('supabase/functions/gbp-oauth-callback/index.ts')).toMatch(/\.eq\(["']status["'],\s*["']connecting["']\)/);
  });

  it('6. a code exchange failure terminates the attempt', async () => {
    const h = callbackHarness({ fetch: () => jsonRes({ error: 'invalid_grant' }, 400) });
    const res = await h.call(`code=${encodeURIComponent(AUTH_CODE)}&state=${STATE}`);
    expect(errorOf(res)).toBe('OAUTH_CODE_INVALID');
    expect(h.own().status).toBe('error');
    expect(h.stored).toEqual([]);
  });

  it('7. a credential store failure terminates the attempt and clears partial writes', async () => {
    for (const store of [false, 'throw'] as const) {
      const h = callbackHarness({ store });
      const res = await h.call(`code=x&state=${STATE}`);
      expect(errorOf(res)).toBe('CREDENTIAL_STORE_FAILED');
      expect(h.own().status).toBe('error');
      expect(h.cleared).toEqual([SOURCE_ID]);
    }
  });

  it('8. an account discovery failure terminates the attempt and clears credentials', async () => {
    const cases: [number, string, string][] = [
      [403, 'GBP_PERMISSION_DENIED', 'permissions_required'],
      [429, 'GBP_API_QUOTA_UNAVAILABLE', 'error'],
      [500, 'ACCOUNT_DISCOVERY_FAILED', 'error'],
    ];
    for (const [status, code, rowStatus] of cases) {
      const h = callbackHarness({ fetch: (u) => (u.includes('token') ? jsonRes({ access_token: ACCESS }) : jsonRes({}, status)) });
      const res = await h.call(`code=x&state=${STATE}`);
      expect(errorOf(res)).toBe(code);
      expect(h.own().status).toBe(rowStatus);
      expect(h.cleared).toEqual([SOURCE_ID]);
    }
  });

  it('9. success leaves a valid select_location intermediate state', async () => {
    const h = callbackHarness();
    const res = await h.call(`code=x&state=${STATE}`);
    const loc = new URL(res.headers.get('Location')!);
    expect(loc.pathname).toBe('/oauth/google-business/callback');
    expect(JSON.parse(loc.searchParams.get('accounts')!)).toEqual([{ id: 'accounts/123', name: 'Mi cuenta' }]);
    expect(h.own().status).toBe('connecting');
    expect(h.own().patches.at(-1)).toMatchObject({
      status: 'connecting', last_error: null,
      metadata: { phase: 'select_location', oauth_state: null, authorized_at: NOW.toISOString() },
    });
  });
});

// ─── Client ownership ───────────────────────────────────────────────────────

function clientFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : clientFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('A3.4.2.2 the browser does not own GBP transitions', () => {
  it('10. no client code writes google_business or reviews rows; the DB enforces it', () => {
    const offenders = clientFiles(resolve(root, 'src')).filter((f) => {
      const text = readFileSync(f, 'utf8');
      return /from\(['"]connected_sources['"]\)[\s\S]{0,200}\.(update|upsert|insert)\(/.test(text)
        && /['"](google_business|reviews)['"]/.test(text)
        && !f.endsWith('repositories.ts');
    });
    expect(offenders).toEqual([]);

    const repo = src('src/features/reality-engine/repositories.ts');
    expect(repo).toMatch(/type ClientOwnedSourceType = 'website' \| 'manual'/);
    expect(src('src/features/reality-engine/engine.ts')).not.toContain('resetGBPStatus');
    expect(src('src/features/reality-engine/engine.ts')).not.toMatch(/upsertSource\(['"](google_business|reviews)['"]/);

    expect(migration).toMatch(/CREATE TRIGGER connected_sources_server_owned_gbp\s+BEFORE INSERT OR UPDATE/);
    expect(migration).toMatch(/current_user IN \('anon',\s*'authenticated'\)/);
    expect(migration).toMatch(/ERRCODE\s*=\s*'42501'/);
  });
});

// ─── Location selection ─────────────────────────────────────────────────────

const GOOD_SELECTION = { accountId: 'accounts/123', locationId: 'locations/456', locationName: 'Bar Pepe', businessId: BIZ };

function syncHarness(opts: {
  source?: SourceRow | null;
  fetch?: (url: string) => Response | Promise<Response>;
  creds?: StoredCredentials | null;
  persist?: boolean;
} = {}) {
  const patches: Record<string, unknown>[] = [];
  const reviews: Record<string, unknown>[] = [];
  const events: string[] = [];
  let status = 'connecting';
  const store: CredentialStore = {
    read: async () => (opts.creds === undefined
      ? { accessToken: ACCESS, refreshToken: REFRESH, expiresAt: new Date(NOW.getTime() + 30 * MIN).toISOString() }
      : opts.creds),
    write: async () => true,
  };
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (opts.fetch) return opts.fetch(url);
    if (url.includes('businessinformation')) return jsonRes({ title: 'Bar Pepe', phoneNumbers: { primaryPhone: '600' } });
    if (url.includes('/reviews')) return jsonRes({ totalReviewCount: 12, averageRating: 4.5 });
    return jsonRes({}, 404);
  });
  const deps: SyncDeps = {
    getUserId: async (jwt) => (jwt === 'good' ? USER : null),
    getOwnBusinessId: async () => BIZ,
    loadSource: async (u, b) => (u === USER && b === BIZ
      ? (opts.source === undefined
        ? { id: SOURCE_ID, status, metadata: { phase: 'select_location', authorized_at: NOW.toISOString() } }
        : opts.source)
      : null),
    credentials: () => store,
    updateSource: async (_u, _id, patch) => {
      if (patch.status === 'connected' && opts.persist === false) return false;
      patches.push(patch);
      status = String(patch.status);
      return true;
    },
    upsertReviews: async (_u, _b, row) => { reviews.push(row); return true; },
    addEvent: async (_u, _s, type) => { events.push(type); },
    fetch: fetchFn as unknown as typeof fetch,
    env: env(),
    now: () => NOW,
  };
  const call = (body: unknown = GOOD_SELECTION, jwt = 'good') =>
    createSync(deps)(new Request('https://x/gbp-sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  return { patches, reviews, events, fetchFn, call, status: () => status };
}

describe('A3.4.2.2 location selection', () => {
  it('11. requires an authenticated user', async () => {
    const h = syncHarness();
    expect((await h.call(GOOD_SELECTION, 'bad')).status).toBe(401);
    expect(h.patches).toEqual([]);
  });

  it('12. verifies the business belongs to the caller', async () => {
    const h = syncHarness();
    expect((await h.call({ ...GOOD_SELECTION, businessId: OTHER_BIZ })).status).toBe(403);
    expect(h.patches).toEqual([]);
  });

  it('13. requires a live authorized source', async () => {
    for (const source of [null, { id: SOURCE_ID, status: 'disconnected', metadata: {} }]) {
      const h = syncHarness({ source });
      const res = await h.call();
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('NOT_CONNECTED');
      expect(h.patches).toEqual([]);
    }
  });

  it('14. rejects invalid account and location ids', async () => {
    const bad = [
      { ...GOOD_SELECTION, accountId: 'accounts/../x' },
      { ...GOOD_SELECTION, accountId: 'https://evil' },
      { ...GOOD_SELECTION, locationId: 'locations/default' },
      { ...GOOD_SELECTION, locationId: 'locations/1?x=y' },
      { ...GOOD_SELECTION, locationId: 42 },
    ];
    for (const body of bad) expect(parseSelection(body).ok).toBe(false);
    const h = syncHarness();
    expect((await h.call(bad[0])).status).toBe(400);
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(parseSelection({ ...GOOD_SELECTION, locationId: 'accounts/123/locations/456' })).toMatchObject({ ok: true, locationId: 'locations/456' });
  });

  it('15-17. sets syncing, then connected with verified_at only after Google confirms', async () => {
    const h = syncHarness();
    const res = await h.call();
    const body = await res.json();
    expect(body).toMatchObject({ success: true, status: 'connected', verifiedAt: NOW.toISOString(), reviewCount: 12 });
    expect(h.patches[0]).toMatchObject({ status: 'syncing', external_account_id: 'accounts/123', external_location_id: 'locations/456', metadata: { phase: 'syncing' } });
    expect(h.patches[0]).not.toHaveProperty('verified_at');
    expect(h.patches[1]).toMatchObject({ status: 'connected', verified_at: NOW.toISOString(), verified_profile: { name: 'Bar Pepe' } });
    expect(h.reviews[0]).toMatchObject({ status: 'connected', metadata: { linkedToGBP: true, reviewCount: 12 } });
    expect(h.events).toEqual(['source_sync_started', 'source_sync_completed']);
  });

  it('18. a sync failure sets a recoverable state and never verified_at', async () => {
    const cases: [Parameters<typeof syncHarness>[0], string, string][] = [
      [{ fetch: () => jsonRes({}, 403) }, 'GBP_PERMISSION_DENIED', 'permissions_required'],
      [{ fetch: () => jsonRes({}, 404) }, 'LOCATION_NOT_FOUND', 'error'],
      [{ fetch: () => jsonRes({}, 500) }, 'LOCATION_FETCH_FAILED', 'error'],
      [{ creds: null }, 'NOT_CONNECTED', 'error'],
      [{ persist: false }, 'PERSIST_FAILED', 'error'],
    ];
    for (const [opts, code, rowStatus] of cases) {
      const h = syncHarness(opts);
      const body = await (await h.call()).json();
      expect(body).toMatchObject({ success: false, code, status: rowStatus });
      expect(h.status()).toBe(rowStatus);
      expect(h.patches.some((p) => 'verified_at' in p)).toBe(false);
      expect(h.reviews).toEqual([]);
    }
  });
});

// ─── Stale recovery ─────────────────────────────────────────────────────────

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function recoverHarness(row: AttemptRow | null, applied = true) {
  const updates: Record<string, unknown>[] = [];
  const deps: RecoverDeps = {
    getUserId: async (jwt) => (jwt === 'good' ? USER : null),
    getOwnBusinessId: async () => BIZ,
    loadSource: async () => row,
    updateIfUnchanged: async (_u, _r, patch) => { if (applied) updates.push(patch); return applied; },
    now: () => NOW,
  };
  const call = (body: unknown, jwt = 'good') =>
    createRecover(deps)(new Request('https://x/gbp-recover-attempt', {
      method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body),
    }));
  return { updates, call };
}

describe('A3.4.2.2 stale-state recovery', () => {
  it('19. a stale connecting attempt recovers to disconnected / ATTEMPT_EXPIRED', async () => {
    const stale = { id: SOURCE_ID, status: 'connecting', metadata: { oauth_started_at: ago(16 * MIN) }, updated_at: ago(16 * MIN) };
    expect(staleTransition(stale, NOW.getTime())).toEqual({ status: 'disconnected', code: 'ATTEMPT_EXPIRED' });
    expect(staleTransition({ ...stale, metadata: { oauth_started_at: ago(5 * MIN) } }, NOW.getTime())).toBeNull();
    expect(staleTransition({ ...stale, metadata: { phase: 'select_location', authorized_at: ago(31 * MIN) } }, NOW.getTime()))
      .toEqual({ status: 'disconnected', code: 'ATTEMPT_EXPIRED' });
    // Legacy rows without a phase (the two stuck production rows) still recover.
    expect(staleTransition({ ...stale, metadata: {}, updated_at: ago(60 * MIN) }, NOW.getTime())).not.toBeNull();

    const h = recoverHarness(stale);
    const body = await (await h.call({ action: 'recover', businessId: BIZ })).json();
    expect(body).toMatchObject({ recovered: true, status: 'disconnected', code: 'ATTEMPT_EXPIRED' });
    expect(h.updates[0]).toMatchObject({ status: 'disconnected', last_error: 'ATTEMPT_EXPIRED' });
  });

  it('20. a stale syncing attempt recovers to error / SYNC_INTERRUPTED', async () => {
    const row = { id: SOURCE_ID, status: 'syncing', metadata: { phase: 'syncing', sync_started_at: ago(6 * MIN) }, updated_at: ago(6 * MIN) };
    const body = await (await recoverHarness(row).call({ action: 'recover' })).json();
    expect(body).toMatchObject({ recovered: true, status: 'error', code: 'SYNC_INTERRUPTED' });
  });

  it('recovery never touches connected rows, races, foreign businesses or anonymous callers', async () => {
    const connected = { id: SOURCE_ID, status: 'connected', metadata: {}, updated_at: ago(999 * MIN) };
    expect((await (await recoverHarness(connected).call({ action: 'recover' })).json()).recovered).toBe(false);
    expect((await (await recoverHarness(connected).call({ action: 'cancel' })).json()).recovered).toBe(false);
    const stale = { id: SOURCE_ID, status: 'connecting', metadata: {}, updated_at: ago(60 * MIN) };
    expect((await (await recoverHarness(stale, false).call({ action: 'recover' })).json()).recovered).toBe(false);
    expect((await recoverHarness(stale).call({ action: 'recover', businessId: OTHER_BIZ })).status).toBe(403);
    expect((await recoverHarness(stale).call({ action: 'recover' }, 'bad')).status).toBe(401);
    expect((await recoverHarness(stale).call({ action: 'drop' })).status).toBe(400);
  });

  it('21. the card never spins past a timeout', () => {
    const gbp = SOURCE_REGISTRY.find((e) => e.id === 'google_business')!;
    const base: ConnectedSource = {
      id: SOURCE_ID, user_id: USER, business_id: BIZ, source_type: 'google_business', status: 'connecting',
      external_account_id: null, external_location_id: null, token_expires_at: null, last_sync_at: null,
      last_error: null, metadata: {}, verified_profile: null, verified_at: null, created_at: ago(60 * MIN), updated_at: ago(60 * MIN),
    };
    const now = NOW.getTime();
    expect(sourceDisplayStatus(gbp, { ...base, metadata: { phase: 'authorizing', oauth_started_at: ago(16 * MIN) } }, undefined, now)).toBe('expired');
    expect(sourceDisplayStatus(gbp, { ...base, metadata: { phase: 'authorizing', oauth_started_at: ago(1 * MIN) } }, undefined, now)).toBe('in_progress');
    expect(sourceDisplayStatus(gbp, { ...base, metadata: { phase: 'select_location', authorized_at: ago(1 * MIN) } }, undefined, now)).toBe('selecting');
    expect(sourceDisplayStatus(gbp, { ...base, status: 'syncing', metadata: { phase: 'syncing', sync_started_at: ago(6 * MIN) } }, undefined, now)).toBe('expired');
    expect(sourceDisplayStatus(gbp, { ...base, status: 'disconnected', last_error: 'ATTEMPT_EXPIRED' }, undefined, now)).toBe('expired');
    expect(isStaleGBPAttempt({ ...base, updated_at: ago(60 * MIN) }, now)).toBe(true);

    const page = src('src/features/reality-engine/GBPCallbackPage.tsx');
    expect(page).toContain('Reintentar conexión');
    expect(page).toContain('cancelGBPAttempt');
    expect(src('src/features/reality-engine/repositories.ts')).toContain("'gbp-recover-attempt'");
  });

  it('22. retry starts a clean attempt and errors stay friendly', async () => {
    const card = src('src/features/reality-engine/SourceCard.tsx');
    expect(card).toContain('retryConnection');
    expect(card).toContain('gbpErrorMessage');
    expect(gbpErrorMessage('GOOGLE_REDIRECT_URI_MISMATCH')).not.toMatch(/redirect_uri|GOOGLE_/);
    expect(gbpErrorMessage('SOMETHING_UNKNOWN_42')).not.toContain('SOMETHING_UNKNOWN_42');

    const h = startHarness();
    await h.call();
    const { attemptRow } = await import('../../../../supabase/functions/gbp-oauth-start/handler.ts');
    expect(attemptRow(h.attempts[0])).toMatchObject({ status: 'connecting', last_error: null });
  });
});

// ─── Secrets and isolation ──────────────────────────────────────────────────

describe('A3.4.2.2 security preservation', () => {
  it('23-24. tokens and codes never reach the browser or the logs', async () => {
    const spies = logSpies();
    const outputs: string[] = [];

    const ok = callbackHarness();
    const okRes = await ok.call(`code=${encodeURIComponent(AUTH_CODE)}&state=${STATE}`);
    outputs.push(okRes.headers.get('Location')!, await okRes.text());

    const bad = callbackHarness({ fetch: (u) => (u.includes('token') ? jsonRes({ access_token: ACCESS, refresh_token: REFRESH }) : jsonRes({}, 500)) });
    const badRes = await bad.call(`code=${encodeURIComponent(AUTH_CODE)}&state=${STATE}`);
    outputs.push(badRes.headers.get('Location')!);
    for (const r of [...ok.rows, ...bad.rows]) outputs.push(JSON.stringify(r.patches));

    const sync = syncHarness();
    outputs.push(await (await sync.call()).text());
    outputs.push(JSON.stringify(sync.patches), JSON.stringify(sync.reviews));
    const syncFail = syncHarness({ fetch: () => jsonRes({}, 500) });
    outputs.push(await (await syncFail.call()).text());

    const joined = outputs.join('\n') + loggedText(spies);
    for (const secret of [ACCESS, REFRESH, AUTH_CODE, 'client-secret']) {
      expect(joined).not.toContain(secret);
    }
  });

  it('25-27. no new grants, no anon access, tenant-scoped server queries', () => {
    expect(migration).not.toMatch(/\bGRANT\b/i);
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.connected_sources_server_owned_gbp\(\) FROM PUBLIC, anon, authenticated/);

    for (const fn of ['gbp-sync', 'gbp-recover-attempt']) {
      const index = src(`supabase/functions/${fn}/index.ts`);
      expect(index).toMatch(/\.eq\(["']user_id["'],\s*userId\)/);
      expect(index).toMatch(/\.eq\(["']source_type["'],\s*["']google_business["']\)/);
    }
    expect(src('supabase/config.toml')).toMatch(/\[functions\.gbp-recover-attempt\]\s*\nverify_jwt = true/);
    expect(src('supabase/config.toml')).toMatch(/\[functions\.gbp-sync\]\s*\nverify_jwt = true/);
  });
});
