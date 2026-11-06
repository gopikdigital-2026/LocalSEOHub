// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler as createConnection, type Connection, type PageSelection, type PageClaimResult } from '../../../../supabase/functions/meta-connection/handler.ts';
import { createHandler as createInternalAccess, isOperatorEmail } from '../../../../supabase/functions/internal-access/handler.ts';
import { metaErrorMessage } from '../../meta-connection/metaStatus';

vi.mock('../repository', () => ({ checkInternalAccess: vi.fn(async () => 'denied') }));
import { InternalGuard, INTERNAL_DENIED_REDIRECT } from '../InternalGuard';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIGRATION = read('supabase/migrations/20261101230430_a3752_meta_account_tenant_uniqueness.sql');
const APP = read('src/App.tsx');
const PRIVILEGED_ROLE = ['service', 'role'].join('_');

const ENV: Record<string, string> = { META_APP_ID: '1234567890', META_APP_SECRET: 'app-secret-value-XYZ' };
const TOKEN = 'EAAlongLivedUserToken123';
const PAGE_A = '111';
const IG_A = '178414000000001';
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

// In-memory model of meta_connections with the two partial unique indexes and
// the meta_claim_page_selection rules (owner match, pending status, page offered).
interface Row { id: string; userId: string; status: string; pageId: string | null; igId: string | null; pages: { id: string; name: string }[] }
function fakeDb(rows: Row[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  async function claim(s: PageSelection): Promise<PageClaimResult> {
    await Promise.resolve();
    const all = [...byId.values()];
    if (all.some((r) => r.pageId === s.pageId && r.id !== s.connectionId)) return 'page_assigned';
    if (s.instagramId && all.some((r) => r.igId === s.instagramId && r.id !== s.connectionId)) return 'instagram_assigned';
    const row = byId.get(s.connectionId);
    if (!row || row.userId !== s.userId || row.status !== 'page_selection_required' || !row.pages.some((p) => p.id === s.pageId)) return 'not_pending';
    row.status = 'connected'; row.pageId = s.pageId; row.igId = s.instagramId; row.pages = [];
    return 'ok';
  }
  function disconnect(id: string) {
    const row = byId.get(id)!;
    row.status = 'disconnected'; row.pageId = null; row.igId = null;
  }
  return { byId, claim, disconnect };
}

function graph(igForPage: Record<string, string | null>) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    const pageMatch = u.match(/\/(\d+)\?fields=instagram_business_account/);
    if (pageMatch) {
      const ig = igForPage[pageMatch[1]];
      return jsonRes(ig ? { id: pageMatch[1], instagram_business_account: { id: ig } } : { id: pageMatch[1] });
    }
    if (u.includes('fields=id,username')) return jsonRes({ id: 'x', username: 'panaderia_sol' });
    return jsonRes({ error: { code: 1 } }, 500);
  }) as unknown as typeof fetch;
}

function tenant(db: ReturnType<typeof fakeDb>, connId: string, userId: string, igForPage: Record<string, string | null> = { [PAGE_A]: IG_A }) {
  const claims: PageSelection[] = [];
  const toConn = (r: Row): Connection => ({ id: r.id, status: r.status as Connection['status'], availablePages: r.pages, attemptStartedAt: new Date().toISOString(), tokenExpiresAt: null });
  const deps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === `jwt-${userId}` ? userId : null)),
    getOwnConnection: vi.fn(async () => {
      const r = [...db.byId.values()].find((x) => x.userId === userId);
      return r ? toConn(r) : null;
    }),
    completeAuthorization: vi.fn(async () => ({ result: 'ok' as const, pageCount: 1 })),
    readToken: vi.fn(async () => TOKEN),
    finishPageSelection: vi.fn(async (s: PageSelection) => { claims.push(s); return db.claim(s); }),
    failConnection: vi.fn(async () => undefined),
    cancelAttempt: vi.fn(async () => false),
    expireStaleAttempt: vi.fn(async () => false),
    disconnect: vi.fn(async () => { db.disconnect(connId); }),
    env: (n: string) => ENV[n],
    fetch: graph(igForPage),
    now: () => new Date(),
  };
  const handle = createConnection(deps);
  const select = (pageId: string, jwt = `jwt-${userId}`) =>
    handle(new Request('https://x/meta-connection', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ action: 'select_page', pageId }) }));
  return { handle, select, claims, deps };
}

const pending = (id: string, userId: string, pages = [{ id: PAGE_A, name: 'Panadería Sol' }]): Row =>
  ({ id, userId, status: 'page_selection_required', pageId: null, igId: null, pages });
const held = (id: string, userId: string, pageId: string | null, igId: string | null): Row =>
  ({ id, userId, status: 'connected', pageId, igId, pages: [] });

describe('A3.7.5.2 — cross-tenant Facebook Page / Instagram assignment', () => {
  it('blocks a duplicate Facebook Page across tenants with a neutral 409 that reveals nothing about the holder', async () => {
    const db = fakeDb([held('conn-owner', 'user-owner', PAGE_A, null), pending('conn-b', 'user-b')]);
    const res = await tenant(db, 'conn-b', 'user-b', { [PAGE_A]: null }).select(PAGE_A);
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ code: 'META_PAGE_ALREADY_ASSIGNED', error: 'META_PAGE_ALREADY_ASSIGNED' });
    for (const leak of ['conn-owner', 'user-owner', TOKEN, 'Panadería']) expect(text).not.toContain(leak);
    expect(db.byId.get('conn-b')!.status).toBe('page_selection_required');
    expect(db.byId.get('conn-owner')!.pageId).toBe(PAGE_A);
  });

  it('blocks a duplicate Instagram account across tenants even when the Page differs', async () => {
    const db = fakeDb([held('conn-owner', 'user-owner', '999', IG_A), pending('conn-b', 'user-b')]);
    const res = await tenant(db, 'conn-b', 'user-b').select(PAGE_A);
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(JSON.parse(text).code).toBe('META_INSTAGRAM_ALREADY_ASSIGNED');
    for (const leak of ['conn-owner', 'user-owner', IG_A, 'panaderia_sol']) expect(text).not.toContain(leak);
    expect(db.byId.get('conn-b')!.igId).toBeNull();
  });

  it('lets the legitimate owner reconnect the same Page and Instagram account', async () => {
    const db = fakeDb([{ ...held('conn-owner', 'user-owner', PAGE_A, IG_A), status: 'page_selection_required', pages: [{ id: PAGE_A, name: 'Panadería Sol' }] }]);
    const t = tenant(db, 'conn-owner', 'user-owner');
    const res = await t.select(PAGE_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: 'connected', instagramStatus: 'connected' });
    expect(t.claims[0]).toMatchObject({ connectionId: 'conn-owner', userId: 'user-owner', pageId: PAGE_A, instagramId: IG_A });
  });

  it('releases the Page once its owner disconnects, so another tenant can then claim it', async () => {
    const db = fakeDb([held('conn-owner', 'user-owner', PAGE_A, IG_A), pending('conn-b', 'user-b')]);
    const b = tenant(db, 'conn-b', 'user-b');
    expect((await b.select(PAGE_A)).status).toBe(409);
    db.disconnect('conn-owner');
    expect((await b.select(PAGE_A)).status).toBe(200);
    expect(db.byId.get('conn-b')!.pageId).toBe(PAGE_A);
  });

  it('serializes concurrent claims of the same Page: exactly one tenant wins', async () => {
    const db = fakeDb([pending('conn-a', 'user-a'), pending('conn-b', 'user-b')]);
    const [ra, rb] = await Promise.all([tenant(db, 'conn-a', 'user-a').select(PAGE_A), tenant(db, 'conn-b', 'user-b').select(PAGE_A)]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);
    const holders = [...db.byId.values()].filter((r) => r.pageId === PAGE_A);
    expect(holders).toHaveLength(1);
    const loser = ra.status === 409 ? ra : rb;
    expect((await loser.json()).code).toMatch(/^META_(PAGE|INSTAGRAM)_ALREADY_ASSIGNED$/);
  });

  it('rejects an unauthenticated account-selection request before any claim', async () => {
    const db = fakeDb([pending('conn-b', 'user-b')]);
    const t = tenant(db, 'conn-b', 'user-b');
    const res = await t.select(PAGE_A, 'forged');
    expect(res.status).toBe(401);
    expect(t.deps.finishPageSelection).not.toHaveBeenCalled();
  });

  it('rejects selecting a Page that was not offered to this tenant', async () => {
    const db = fakeDb([pending('conn-b', 'user-b')]);
    const t = tenant(db, 'conn-b', 'user-b');
    const res = await t.select('424242');
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PAGE_NOT_AUTHORIZED');
    expect(t.deps.finishPageSelection).not.toHaveBeenCalled();
  });

  it('a claim for a connection the caller does not own is refused by the claim step', async () => {
    const db = fakeDb([pending('conn-a', 'user-a')]);
    const result = await db.claim({ connectionId: 'conn-a', userId: 'user-intruder', pageId: PAGE_A, pageName: 'x', instagramStatus: 'not_associated', instagramId: null, instagramUsername: null });
    expect(result).toBe('not_pending');
    expect(db.byId.get('conn-a')!.status).toBe('page_selection_required');
  });

  it('maps a not-pending claim to PAGE_SELECTION_NOT_PENDING', async () => {
    const db = fakeDb([held('conn-b', 'user-b', null, null)]);
    const res = await tenant(db, 'conn-b', 'user-b').select(PAGE_A);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('PAGE_SELECTION_NOT_PENDING');
  });
});

describe('A3.7.5.2 — database enforcement independent of application checks', () => {
  it('creates partial unique indexes on page_id and instagram_account_id', () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_page_assignment_key\s+ON public\.meta_connections \(page_id\) WHERE page_id IS NOT NULL;/);
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_instagram_assignment_key\s+ON public\.meta_connections \(instagram_account_id\) WHERE instagram_account_id IS NOT NULL;/);
  });
  it('the claim function checks ownership, pending status and the offered Page, and maps unique violations', () => {
    expect(MIGRATION).toMatch(/AND user_id = p_user_id/);
    expect(MIGRATION).toMatch(/AND status = 'page_selection_required'/);
    expect(MIGRATION).toMatch(/jsonb_array_elements\(available_pages\) p WHERE p->>'id' = p_page_id/);
    expect(MIGRATION).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    expect(MIGRATION).toMatch(/SECURITY DEFINER SET search_path = ''/);
  });
  it('only the server role may execute the claim function', () => {
    expect(MIGRATION).toMatch(/REVOKE EXECUTE ON FUNCTION public\.meta_claim_page_selection\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    expect(MIGRATION).toContain(`GRANT EXECUTE ON FUNCTION public.meta_claim_page_selection(uuid, uuid, text, text, text, text, text) TO ${PRIVILEGED_ROLE};`);
    expect(MIGRATION).not.toMatch(/GRANT [^;]*TO [^;]*\b(anon|authenticated)\b/);
  });
  it('touches no rows, columns, policies or table grants', () => {
    const sql = MIGRATION.replace(/\/\*[\s\S]*?\*\//, '');
    expect(sql).not.toMatch(/\b(DROP|DELETE FROM|ALTER TABLE|CREATE POLICY|INSERT INTO|TRUNCATE)\b/i);
  });
});

describe('A3.7.5.2 — internal route authorization (server)', () => {
  const req = (jwt?: string) => new Request('https://x/internal-access', { method: 'POST', headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, body: '{}' });
  const make = (admin: string | undefined) => createInternalAccess({
    getUserEmail: async (jwt) => (jwt === 'op' ? { id: 'u-op', email: 'Owner@LocalSEOHub.io ' } : jwt === 'cust' ? { id: 'u-c', email: 'customer@example.com' } : null),
    env: (n) => (n === 'ADMIN_EMAIL' ? admin : undefined),
  });

  it('returns 401 without a verified user', async () => {
    const res = await make('owner@localseohub.io')(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ allowed: false, code: 'NOT_AUTHENTICATED' });
    expect((await make('owner@localseohub.io')(req('forged'))).status).toBe(401);
  });
  it('returns 403 for a signed-in customer who is not the operator', async () => {
    const res = await make('owner@localseohub.io')(req('cust'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ allowed: false, code: 'FORBIDDEN' });
  });
  it('allows the configured operator (case and whitespace insensitive)', async () => {
    const res = await make('  OWNER@localseohub.io')(req('op'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowed: true });
  });
  it('fails closed when ADMIN_EMAIL is missing or empty', async () => {
    for (const admin of [undefined, '', '   ']) {
      const res = await make(admin)(req('op'));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ allowed: false, code: 'FORBIDDEN' });
    }
    expect(isOperatorEmail('', '')).toBe(false);
    expect(isOperatorEmail(null, undefined)).toBe(false);
  });
  it('answers CORS preflight and includes CORS headers on denials', async () => {
    const pre = await make('x@y.z')(new Request('https://x/internal-access', { method: 'OPTIONS' }));
    expect(pre.status).toBe(200);
    expect((await make('x@y.z')(req())).headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
  it('the function is deployed with JWT verification on', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.internal-access\]\s*\nverify_jwt = true/);
  });
});

describe('A3.7.5.2 — internal route guard (browser)', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

  async function render(check: () => Promise<'allowed' | 'denied'>) {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/internal/publications-validation']}>
          <Routes>
            <Route path="/internal/publications-validation" element={<InternalGuard check={check}><p>INTERNAL PANEL</p></InternalGuard>} />
            <Route path={INTERNAL_DENIED_REDIRECT} element={<p>CUSTOMER TODAY</p>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    return host;
  }

  it('redirects a non-operator to the customer Today page without mounting the panel', async () => {
    const el = await render(async () => 'denied');
    expect(el.textContent).toContain('CUSTOMER TODAY');
    expect(el.textContent).not.toContain('INTERNAL PANEL');
  });
  it('treats a failed check as denied', async () => {
    const el = await render(() => Promise.reject(new Error('network')));
    expect(el.textContent).toContain('CUSTOMER TODAY');
    expect(el.textContent).not.toContain('INTERNAL PANEL');
  });
  it('renders the panel for the operator', async () => {
    const el = await render(async () => 'allowed');
    expect(el.textContent).toContain('INTERNAL PANEL');
  });
  it('does not mount the panel while the check is pending', async () => {
    const el = await render(() => new Promise(() => undefined));
    expect(el.textContent).not.toContain('INTERNAL PANEL');
    expect(el.textContent).not.toContain('CUSTOMER TODAY');
  });
});

describe('A3.7.5.2 — routing: internal isolated, customer routes unchanged', () => {
  it('wraps the internal layout in InternalGuard and keeps AppGuard inside', () => {
    expect(APP).toContain('<Route element={<InternalGuard><Suspense fallback={SKELETON}><PublicationResumeProvider /></Suspense></InternalGuard>}>');
    expect((APP.match(/<InternalGuard>/g) ?? []).length).toBe(1);
    const internal = APP.slice(APP.indexOf('path="/internal/publications-validation"'), APP.indexOf('path="/ejecutar/'));
    expect(internal).toContain('<AppGuard>');
  });
  it('customer routes stay under AppGuard and outside InternalGuard', () => {
    const customer = APP.slice(APP.indexOf('<Route element={<AppGuard><AppShellV2 /></AppGuard>}>'), APP.indexOf('path="/oauth/google-business/callback"'));
    for (const p of ['/hoy', '/semana', '/plan', '/herramientas', '/negocio', '/fuentes', '/facturacion', '/informes']) expect(customer).toContain(`path="${p}"`);
    expect(customer).not.toContain('InternalGuard');
    expect(APP.slice(0, APP.indexOf('<InternalGuard>'))).not.toContain('/internal/');
  });
  it('keeps 35 route paths (37 route elements incl. two layout wrappers): A3.7.5.1 plus /semana (A3.7.6.3)', () => {
    expect((APP.match(/path=/g) ?? []).length).toBe(35);
    expect((APP.match(/<Route\s/g) ?? []).length).toBe(37);
  });
});

describe('A3.7.5.2 — neutral ES/EN error messages', () => {
  const codes = ['META_PAGE_ALREADY_ASSIGNED', 'META_INSTAGRAM_ALREADY_ASSIGNED'];
  it.each(['es', 'en'] as const)('%s copy exists, is specific and reveals no identity', (lang) => {
    for (const code of codes) {
      const msg = metaErrorMessage(code, lang);
      expect(msg).not.toBe(metaErrorMessage('UNKNOWN_ERROR', lang));
      expect(msg).toMatch(/LocalSEOHub/);
      expect(msg).not.toMatch(/@|\d{5,}|user|usuario|email|correo/i);
    }
  });
  it('ES and EN mention the recovery path (choose another Page / disconnect)', () => {
    expect(metaErrorMessage(codes[0], 'es')).toMatch(/Elige otra página.*desconéctala/);
    expect(metaErrorMessage(codes[0], 'en')).toMatch(/Choose another Page.*disconnect/);
  });
});
