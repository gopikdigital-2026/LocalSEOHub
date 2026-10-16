import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { normalizeGbp, scan, type GbpSnapshot, type ProfileInput } from '../../maps-scanner/engine';
import { geoAudit } from '../../geo-audit/engine';
import { buildDigitalTwin, type TwinProfileInput } from '../../digital-twin/engine';
import { sourceDisplayStatus } from '../../reality-engine/sourceStatus';
import { getSourceEntry } from '../../reality-engine/registry';
import type { ConnectedSource, SourceStatus, SourceType } from '../../reality-engine/types';
import { TOOLS } from '../../tools/catalog';
import { COPY as MAPS_COPY } from '../../maps-scanner/copy';
import { COPY as GEO_COPY } from '../../geo-audit/copy';
import { COPY as TWIN_COPY } from '../../digital-twin/copy';
import { COPY as RADAR_COPY } from '../../competitor-radar/copy';
import { COPY as VOICE_COPY } from '../../voice-simulator/copy';
import { COPY as SEO_COPY } from '../../seo-generator/copy';
import { COPY as ADVISOR_COPY } from '../../business-advisor/copy';
import { checkUrl } from '../../../../supabase/functions/analyze-website/urlSafety.ts';
import { NET_LIMITS } from '../../../../supabase/functions/analyze-website/safeHttp.ts';
import {
  simulate, type AiOutcome, type Deps, type ModelResult, type ReserveResult,
} from '../../../../supabase/functions/voice-simulator-v2/handler.ts';
import type { Simulation } from '../../../../supabase/functions/voice-simulator-v2/logic.ts';

// Every fixture below is FIXTURE / MOCK / SIMULATED data. No real Google, Stripe or AI call is made.

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const FN_DIR = join(ROOT, 'supabase/functions');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const frontend = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));

const a25Migration = src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith('_a25_gbp_server_verified_profile.sql'))}`);
const sourcesMigration = src('supabase/migrations/20260804165058_create_connected_sources_and_sync_events.sql');
const ledgerSql = src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.includes('a2420_generalized_ai_usage_ledger'))}`);
const capsSql = src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith('_a248_voice_simulator_limits.sql'))}`);
const gbpSync = src('supabase/functions/gbp-sync/index.ts');
const oauthStart = src('supabase/functions/gbp-oauth-start/index.ts');
const oauthCallback = src('supabase/functions/gbp-oauth-callback/index.ts');
const realityEngine = src('src/features/reality-engine/engine.ts');
const repositories = src('src/features/reality-engine/repositories.ts');
const actionsProvider = src('src/features/actions/ActionsProvider.tsx');
const app = src('src/App.tsx');

const RETIRED = [
  'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content',
  'generate-business-audit', 'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description',
  'generate-geo-audit', 'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
  'simulate-campaign',
];
const AI_FUNCTIONS = ['seo-generator-v2', 'business-advisor-v2', 'voice-simulator-v2', 'competitor-radar-v2', 'weekly-content', 'business-improvement', 'analyze-website'];

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const BIZ_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BIZ_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SYNCED = '2026-10-10T09:30:00.000Z';

// FIXTURE profiles.
const FULL = {
  name: 'Gopik.Digital', category: 'Agencia de marketing', city: 'Marbella', phone: '+34 600 123 456',
  website: 'https://www.gopik.digital/', schedule: 'L-V 9:00-18:00', services: ['Diseño web', 'SEO local', 'Redes sociales'],
  target_audience: 'Pequeños negocios locales', primary_goal: 'more_calls', secondary_goals: [],
};
const PARTIAL = { name: 'Gopik.Digital', category: 'Agencia de marketing', city: 'Marbella', services: ['Diseño web'] };
const MINIMAL = { name: 'Gopik', category: '', city: '', services: [] as string[] };
const EMPTY = { name: '', category: '', city: '', services: [] as string[] };
const PROFILES = { FULL, PARTIAL, MINIMAL, EMPTY } as const;

// FIXTURE: row exactly as gbp-sync (service role) writes it.
const TRUSTED_ROW = {
  status: 'connected', verified_at: SYNCED,
  verified_profile: { name: 'Gopik.Digital', category: 'Agencia de marketing', address: 'Calle Mayor 1, Marbella', phone: '+34 600 123 456', website: 'https://www.gopik.digital/', hours: [{ openDay: 'MONDAY' }], totalReviews: 12 },
};
// SIMULATED attack: browser-written status/metadata/last_sync_at with no server snapshot.
const FORGED_ROW = {
  status: 'connected', last_sync_at: new Date().toISOString(), verified_at: null, verified_profile: null,
  metadata: { name: 'Fake', phone: '+34 600 123 456', totalReviews: 999, averageRating: 5 },
};
const NO_GBP: GbpSnapshot = { state: 'not_connected', lastSyncAt: null, data: null };

const row = (source_type: SourceType, status: SourceStatus, verified_at: string | null = null): ConnectedSource => ({
  id: source_type, user_id: USER_A, business_id: BIZ_A, source_type, status, external_account_id: null, external_location_id: null,
  token_expires_at: null, last_sync_at: new Date().toISOString(), last_error: null, metadata: { phone: 'forged' },
  verified_profile: null, verified_at, created_at: '', updated_at: '',
});

const allTrust = (p: ProfileInput, g: GbpSnapshot) => [
  ...scan(p, g).checks.map((c) => c.trust),
  ...geoAudit(p as never, g).criteria.map((c) => c.trust),
  ...buildDigitalTwin(p as TwinProfileInput, g).fields.map((f) => f.provenance),
];

// MOCK ledger reproducing reserve_ai_usage / settle_ai_usage semantics.
const caps: Record<string, number> = { 'weekly-content': 22, 'business-improvement': 18, 'seo-generator': 18, 'business-advisor': 12, 'voice-simulator': 10 };
const GLOBAL = 80;
function ledger() {
  const used = new Map<string, Record<string, number>>();
  const res = new Map<string, { user: string; fn: string; status: string }>();
  const r = (u: string) => {
    if (!used.has(u)) used.set(u, Object.fromEntries(Object.keys(caps).map((k) => [k, 0])));
    return used.get(u)!;
  };
  const reserve = vi.fn(async (id: string, user: string, fn: string): Promise<ReserveResult> => {
    const u = r(user);
    const g = Object.values(u).reduce((a, b) => a + b, 0);
    if (u[fn] >= caps[fn]) return { status: 'fn_limit', fn_used: u[fn], global_used: g };
    if (g >= GLOBAL) return { status: 'global_limit', fn_used: u[fn], global_used: g };
    if (res.has(id)) return { status: 'invalid' };
    res.set(id, { user, fn, status: 'reserved' });
    u[fn] += 1;
    return { status: 'reserved', fn_used: u[fn], global_used: g + 1 };
  });
  const settle = vi.fn(async (id: string, user: string, outcome: AiOutcome) => {
    const x = res.get(id);
    if (!x || x.user !== user || x.status !== 'reserved') return false;
    x.status = outcome;
    if (outcome === 'released') r(user)[x.fn] = Math.max(r(user)[x.fn] - 1, 0);
    return true;
  });
  return { reserve, settle, used: r, res };
}

const GOOD: Simulation = {
  customer: 'Hola, me interesa una web para mi negocio, pero me parece un poco caro. ¿Por qué debería elegiros?',
  recommendedResponse: 'Entiendo tu duda. En Gopik.Digital trabajamos en diseño web y SEO local para pequeños negocios de Marbella. Para darte un precio exacto necesito conocer un poco más lo que necesitas. ¿Me cuentas qué tipo de web buscas?',
  whyItWorks: ['Reconoce la duda del cliente sin discutir.', 'Menciona servicios reales del negocio.', 'Pide información antes de hablar de precio.'],
  tip: 'Si quieres responder más rápido, añade a tu perfil una referencia de precios.',
  factsUsed: ['name', 'city', 'services'],
};
const BIZ = { ...FULL, website: 'https://gopik.digital', phone: '', schedule: '' };

function deps(l = ledger(), model: () => Promise<ModelResult> = async () => ({ ok: true, raw: JSON.stringify(GOOD) })) {
  const owned: Record<string, { owner: string; biz: Record<string, unknown> }> = {
    [BIZ_A]: { owner: USER_A, biz: BIZ },
    [BIZ_B]: { owner: USER_B, biz: { ...BIZ, name: 'Negocio B' } },
  };
  const d: Deps = {
    loadBusiness: vi.fn(async (u: string, b: string) => (owned[b]?.owner === u ? owned[b].biz : null)),
    reserve: l.reserve,
    settle: l.settle,
    callModel: vi.fn(model),
  };
  return { d, l };
}
const body = (o: Record<string, unknown> = {}) => JSON.stringify({
  businessId: BIZ_A, requestId: crypto.randomUUID(), scenario: 'price_objection', customText: '', lang: 'es', ...o,
});
const call = async (d: Deps, b = body(), user = USER_A) => {
  const r = await simulate(user, b, d);
  return { status: r.status, json: await r.json() };
};

describe('A2.5 · source of truth and trust model', () => {
  it('1. GBP fields come only from the server-written snapshot, never from client metadata', () => {
    const g = normalizeGbp(TRUSTED_ROW);
    expect(g.data).toMatchObject({ name: 'Gopik.Digital', phone: '+34 600 123 456', totalReviews: 12 });
    expect(g.lastSyncAt).toBe(SYNCED);
    expect(normalizeGbp({ ...TRUSTED_ROW, metadata: { phone: 'other' } } as never).data?.phone).toBe('+34 600 123 456');
  });

  it('2. manual business data stays declared/available and is never verified', () => {
    for (const p of Object.values(PROFILES)) {
      const s = scan(p, NO_GBP);
      expect(s.checks.filter((c) => c.source === 'localseohub').every((c) => c.trust !== 'verified')).toBe(true);
      expect(allTrust(p, NO_GBP)).not.toContain('verified');
    }
    expect(sourceDisplayStatus(getSourceEntry('manual')!, row('manual', 'connected'), undefined)).toBe('declared');
  });

  it('3. trusted server-synced GBP is shown as verified', () => {
    const g = normalizeGbp(TRUSTED_ROW);
    expect(scan(FULL, g).checks.filter((c) => c.source === 'google' && c.status !== 'unchecked').every((c) => c.trust === 'verified')).toBe(true);
    expect(sourceDisplayStatus(getSourceEntry('google_business')!, row('google_business', 'connected', SYNCED), undefined)).toBe('verified');
  });

  it('4. client-forged connected status + metadata is NOT verified anywhere', () => {
    const g = normalizeGbp(FORGED_ROW);
    expect(g.data).toBeNull();
    expect(g.lastSyncAt).toBeNull();
    expect(allTrust(FULL, g)).not.toContain('verified');
    expect(scan(FULL, g).checks.filter((c) => c.source === 'google').every((c) => c.status === 'unchecked')).toBe(true);
    expect(sourceDisplayStatus(getSourceEntry('google_business')!, row('google_business', 'connected'), undefined)).not.toBe('verified');
    expect(sourceDisplayStatus(getSourceEntry('reviews')!, row('reviews', 'connected'), row('google_business', 'connected'))).toBe('pending');
  });

  it('4b. all four GBP consumers (Maps, GEO, Twin, Radar) read GBP through normalizeGbp only', () => {
    for (const p of ['maps-scanner/MapsScannerPage.tsx', 'geo-audit/GeoAuditPage.tsx', 'digital-twin/DigitalTwinPage.tsx', 'competitor-radar/CompetitorRadarPage.tsx']) {
      const s = src(`src/features/${p}`);
      expect(s).toContain('normalizeGbp(sources.find((s) => s.source_type === \'google_business\') ?? null)');
      expect(s).not.toMatch(/\.metadata\b/);
    }
  });

  it('4c. the actions engine reads GBP findings from verified_profile/verified_at only', () => {
    expect(actionsProvider).toContain("s.source_type === 'google_business'");
    expect(actionsProvider).toContain('lastSyncAt: s.verified_at, metadata: s.verified_profile ?? {}');
  });
});

describe('A2.5 · GBP server sync and graceful degradation', () => {
  it('5. no GBP: tools still produce results; Google checks are unchecked', () => {
    expect(normalizeGbp(null)).toEqual(NO_GBP);
    expect(scan(FULL, NO_GBP).score).not.toBeNull();
    expect(geoAudit(FULL as never, NO_GBP).score).not.toBeNull();
    expect(() => buildDigitalTwin(FULL as TwinProfileInput, NO_GBP)).not.toThrow();
  });

  it('6. empty verified profile yields no Google data', () => {
    expect(normalizeGbp({ status: 'connected', verified_at: SYNCED, verified_profile: {} }).data).toBeNull();
  });

  it('7. stale sync keeps its original timestamp (freshness is never fabricated)', () => {
    const g = normalizeGbp({ ...TRUSTED_ROW, verified_at: '2025-01-01T00:00:00.000Z' });
    expect(g.lastSyncAt).toBe('2025-01-01T00:00:00.000Z');
    expect(normalizeGbp({ ...TRUSTED_ROW, verified_at: 'not a date' }).lastSyncAt).toBeNull();
  });

  it('8. error/expired/disconnected states degrade without verified data', () => {
    expect(normalizeGbp({ ...TRUSTED_ROW, status: 'error' })).toEqual({ state: 'error', lastSyncAt: null, data: null });
    expect(normalizeGbp({ ...TRUSTED_ROW, status: 'disconnected' }).data).toBeNull();
    expect(scan(FULL, normalizeGbp({ ...TRUSTED_ROW, status: 'error' })).priorities.map((p) => p.id)).toContain('fix_gbp');
    expect(gbpSync).toContain('locationResponse.status === 401');
    expect(gbpSync).toMatch(/success: false,\s*error: locationResponse\.status/);
  });

  it('8b. partial GBP config (only a name) evaluates without crashing', () => {
    const g = normalizeGbp({ status: 'connected', verified_at: SYNCED, verified_profile: { name: 'Gopik.Digital' } });
    const s = scan(FULL, g);
    expect(s.checks.find((c) => c.id === 'gbp_name')?.status).toBe('ok');
    expect(s.checks.find((c) => c.id === 'gbp_phone')?.status).toBe('improve');
  });

  it('8c. gbp-sync validates IDs before using them in Google URL paths', () => {
    expect(gbpSync).toContain('/^accounts\\/[A-Za-z0-9_-]{1,64}$/');
    expect(gbpSync).toContain('(locations\\/[A-Za-z0-9_-]{1,64})$/');
    expect(gbpSync).toContain('locationId === "locations/default"');
  });

  it('8d. gbp-sync persists the verified snapshot with the service role, scoped to the caller', () => {
    expect(gbpSync).toContain('verified_profile: profile');
    expect(gbpSync).toContain('verified_at: syncedAt');
    expect(gbpSync).toMatch(/\.eq\("user_id", user\.id\)\s*\.eq\("business_id", business\.id\)\s*\.eq\("source_type", "google_business"\)/);
    expect(gbpSync).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
  });

  it('8e. the client no longer writes Google profile fields or a Google sync time', () => {
    expect(realityEngine).not.toContain('...(data.profile');
    expect(realityEngine).toContain("metadata: { locationName },");
    expect(repositories).toContain('verified_profile, verified_at');
  });
});

describe('A2.5 · website integration', () => {
  it('9. no website: every tool still runs; website check asks to add it', () => {
    const p = { ...FULL, website: '' };
    expect(scan(p, NO_GBP).checks.find((c) => c.id === 'website')?.status).toBe('improve');
    expect(() => geoAudit(p as never, NO_GBP)).not.toThrow();
    expect(() => buildDigitalTwin(p as TwinProfileInput, NO_GBP)).not.toThrow();
  });

  it('10. timeouts and size limits stay in place', () => {
    expect(NET_LIMITS).toBeDefined();
    const aw = src('supabase/functions/analyze-website/handler.ts') + src('supabase/functions/analyze-website/safeHttp.ts');
    expect(aw).toMatch(/2\s*\*\s*1024\s*\*\s*1024|2_?097_?152/);
  });

  it('11. private / metadata / non-http URLs are rejected', () => {
    for (const u of ['http://127.0.0.1/', 'http://10.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'http://localhost/', 'ftp://example.com/']) {
      expect(() => checkUrl(u)).toThrow();
    }
    expect(checkUrl('https://example.com/').hostname).toBe('example.com');
  });

  it('12. SSRF stack is byte-identical in analyze-website and competitor-radar-v2; no new fetch pipeline', () => {
    for (const f of ['safeHttp.ts', 'urlSafety.ts']) {
      expect(src(`supabase/functions/competitor-radar-v2/${f}`)).toBe(src(`supabase/functions/analyze-website/${f}`));
    }
    const fetchers = readdirSync(FN_DIR).filter((d) => existsSync(join(FN_DIR, d, 'safeHttp.ts')));
    expect(fetchers.sort()).toEqual(['analyze-website', 'competitor-radar-v2']);
    expect(gbpSync.match(/fetch\(/g)?.length).toBe(2);
    expect(gbpSync).toContain('https://mybusinessbusinessinformation.googleapis.com/v1/');
    expect(gbpSync).toContain('https://mybusiness.googleapis.com/v4/');
  });
});

describe('A2.5 · business profile fixtures and cross-tool consistency', () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    it(`13-16. ${name} profile runs through Maps, GEO and Twin with and without GBP`, () => {
      for (const g of [NO_GBP, normalizeGbp(TRUSTED_ROW), normalizeGbp(FORGED_ROW)]) {
        expect(() => scan(p, g)).not.toThrow();
        expect(() => geoAudit(p as never, g)).not.toThrow();
        expect(() => buildDigitalTwin(p as TwinProfileInput, g)).not.toThrow();
      }
    });
  }

  it('16b. empty profile yields no score instead of an invented one', () => {
    expect(scan(EMPTY, NO_GBP).score).toBeNull();
    expect(scan(EMPTY, NO_GBP).priorities[0].id).toBe('complete_profile');
  });

  it('17-20. same city, services, phone and schedule reach every tool from the same business record', () => {
    const twin = JSON.stringify(buildDigitalTwin(FULL as TwinProfileInput, NO_GBP));
    for (const v of ['Marbella', 'Diseño web', 'L-V 9:00-18:00']) expect(twin).toContain(v);
    expect(scan(FULL, NO_GBP).checks.find((c) => c.id === 'phone')?.status).toBe('ok');
    for (const p of ['maps-scanner/MapsScannerPage.tsx', 'geo-audit/GeoAuditPage.tsx', 'digital-twin/DigitalTwinPage.tsx']) {
      expect(src(`src/features/${p}`)).toContain('useBusiness()');
    }
  });

  it('21. manual vs GBP conflict is flagged, never silently overwritten', () => {
    const conflict = normalizeGbp({ ...TRUSTED_ROW, verified_profile: { ...TRUSTED_ROW.verified_profile, phone: '+34 999 000 111' } });
    const input = { ...FULL };
    const s = scan(input, conflict);
    expect(s.checks.find((c) => c.id === 'gbp_phone')?.detail).toBe('phone_mismatch');
    expect(s.priorities.map((p) => p.id)).toContain('align_phone');
    expect(input.phone).toBe('+34 600 123 456');
    expect(gbpSync).not.toMatch(/from\("businesses"\)\s*\.update/);
  });

  it('22. GBP freshness shown is the server time, not a client clock', () => {
    expect(normalizeGbp({ ...FORGED_ROW, verified_at: null }).lastSyncAt).toBeNull();
    expect(gbpSync).toContain('last_sync_at: syncedAt');
    expect(realityEngine).toContain('last_sync_at: data.verifiedAt ?? null');
  });
});

describe('A2.5 · isolation, ownership and business cap', () => {
  it('23. user B cannot run a tool on business A', async () => {
    const { d } = deps();
    const r = await call(d, body(), USER_B);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('24. connected_sources and businesses are owner-only for every verb', () => {
    for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) expect(sourcesMigration).toMatch(new RegExp(`FOR ${verb}[\\s\\S]{0,80}auth\\.uid\\(\\) = user_id`));
    const biz = src('supabase/migrations/20261007162621_create_businesses.sql');
    expect(biz).toContain('auth.uid() = user_id');
  });

  it('25. gbp-sync derives the owner from the JWT and rejects a foreign businessId', () => {
    expect(gbpSync).toContain('supabaseAdmin.auth.getUser(jwt)');
    expect(gbpSync).toContain('businessId != null && businessId !== business.id');
  });

  it('26. one business per user is enforced by a unique index (race-safe)', () => {
    expect(src('supabase/migrations/20261007162621_create_businesses.sql')).toContain('CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_id_key ON businesses(user_id)');
  });
});

describe('A2.5 · AI ledger end to end (MOCK ledger, SIMULATED provider)', () => {
  it('27. caps are 22/18/18/12/10 and global 80 in the live cap function', () => {
    for (const [fn, n] of [['weekly-content', 22], ['business-improvement', 18], ['seo-generator', 18], ['business-advisor', 12], ['voice-simulator', 10], ['global', 80]] as const) {
      expect(capsSql).toContain(`WHEN '${fn}' THEN ${n}`);
    }
  });

  it('28. reserve → completed on success', async () => {
    const { d, l } = deps();
    const r = await call(d);
    expect(r.status).toBe(200);
    expect(l.settle).toHaveBeenCalledWith(expect.any(String), USER_A, 'completed');
  });

  it('29. provider failure releases the reservation', async () => {
    const { d, l } = deps(undefined, async () => ({ ok: false, reason: 'error' }));
    await call(d);
    expect([...l.res.values()].every((x) => x.status !== 'reserved')).toBe(true);
  });

  it('30. function limit stops before calling the model', async () => {
    const l = ledger();
    l.used(USER_A)['voice-simulator'] = 10;
    const { d } = deps(l);
    const r = await call(d);
    expect(r.status).toBe(429);
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('31. global limit stops before calling the model', async () => {
    const l = ledger();
    Object.assign(l.used(USER_A), { 'weekly-content': 22, 'business-improvement': 18, 'seo-generator': 18, 'business-advisor': 12, 'voice-simulator': 9 });
    l.used(USER_A)['business-improvement'] = 21;
    const { d } = deps(l);
    const r = await call(d);
    expect(r.status).toBe(429);
    expect(d.callModel).not.toHaveBeenCalled();
  });

  it('32. reservations expire after 10 minutes in SQL', () => {
    expect(ledgerSql).toContain("status = 'reserved' AND created_at < now() - interval '10 minutes'");
  });

  it('33. duplicate request id never charges twice', async () => {
    const { d, l } = deps();
    const b = body();
    await call(d, b);
    await call(d, b);
    expect(l.used(USER_A)['voice-simulator']).toBe(1);
  });

  it('34. concurrent requests never exceed the function cap', async () => {
    const { d, l } = deps();
    await Promise.all(Array.from({ length: 14 }, () => call(d)));
    expect(l.used(USER_A)['voice-simulator']).toBeLessThanOrEqual(10);
    expect(ledgerSql).toContain('FOR UPDATE');
  });

  it('35. cross-user settle is refused', async () => {
    const l = ledger();
    await l.reserve('r1', USER_A, 'voice-simulator');
    expect(await l.settle('r1', USER_B, 'completed')).toBe(false);
    expect(ledgerSql).toContain('WHERE id = p_reservation_id AND user_id = p_user_id');
  });

  it('36. cross-user release is refused; ledger RPCs are service-role only', async () => {
    const l = ledger();
    await l.reserve('r2', USER_A, 'voice-simulator');
    expect(await l.settle('r2', USER_B, 'released')).toBe(false);
    expect(l.used(USER_A)['voice-simulator']).toBe(1);
    expect(ledgerSql).toContain('REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated');
    expect(ledgerSql).toContain('REVOKE ALL ON FUNCTION public.settle_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated');
  });
});

describe('A2.5 · AI failure degradation (SIMULATED provider)', () => {
  const cases: Array<[string, ModelResult, number]> = [
    ['37. provider timeout', { ok: false, reason: 'timeout' }, 504],
    ['38. provider 429', { ok: false, reason: 'rate_limited' }, 503],
    ['40. missing secret', { ok: false, reason: 'not_configured' }, 502],
  ];
  for (const [name, result, status] of cases) {
    it(`${name} returns ${status} and never leaves a reservation open`, async () => {
      const { d, l } = deps(undefined, async () => result);
      const r = await call(d);
      expect(r.status).toBe(status);
      expect(JSON.stringify(r.json)).not.toMatch(/stack|Error:|sk-|Bearer/);
      expect([...l.res.values()].every((x) => x.status !== 'reserved')).toBe(true);
    });
  }

  it('39. malformed model output is rejected, not shown', async () => {
    const { d, l } = deps(undefined, async () => ({ ok: true, raw: 'not json at all' }));
    const r = await call(d);
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(r.json).not.toHaveProperty('simulation');
    expect([...l.res.values()].every((x) => x.status !== 'reserved')).toBe(true);
  });
});

describe('A2.5 · premium entitlement', () => {
  it('41. every AI / fetching Edge Function enforces requirePremium with one shared implementation', () => {
    const impl = src('supabase/functions/voice-simulator-v2/entitlement.ts');
    for (const fn of AI_FUNCTIONS) {
      expect(src(`supabase/functions/${fn}/index.ts`)).toContain('requirePremium(');
      expect(src(`supabase/functions/${fn}/entitlement.ts`)).toBe(impl);
    }
  });

  it('42. frontend gates agree with backend: 5 pages pre-gate, SEO/Advisor surface premium_required', () => {
    for (const p of ['voice-simulator/VoiceSimulatorPage.tsx', 'competitor-radar/CompetitorRadarPage.tsx', 'digital-twin/DigitalTwinPage.tsx', 'maps-scanner/MapsScannerPage.tsx', 'geo-audit/GeoAuditPage.tsx']) {
      expect(src(`src/features/${p}`)).toContain('hasPremium');
    }
    expect(src('src/features/seo-generator/SeoGeneratorPage.tsx')).toContain("error === 'premium_required'");
    expect(src('src/features/business-advisor/AdvisorPage.tsx')).toContain("error === 'premium_required'");
  });
});

describe('A2.5 · onboarding, edit, Fuentes', () => {
  it('43. onboarding writes the cleaned business data to the single business row', () => {
    expect(src('src/features/first-value/FirstValueFlow.tsx')).toContain('await updateBusiness(clean)');
  });

  it('44. Mi negocio edit replaces the in-memory business with the saved row (tools re-render)', () => {
    expect(src('src/features/business-memory/BusinessContext.tsx')).toContain('setCurrentBusiness(updated)');
    expect(src('src/features/business-memory/businessRepository.ts')).toMatch(/\.update\([\s\S]*?\.select\(BUSINESS_COLUMNS\)\s*\.maybeSingle\(\)/);
  });

  it('45. disconnecting removes the row; tools reload sources on mount and fall back to not connected', () => {
    expect(realityEngine).toContain('await deleteSource(sourceId)');
    for (const p of ['maps-scanner/MapsScannerPage.tsx', 'geo-audit/GeoAuditPage.tsx', 'digital-twin/DigitalTwinPage.tsx']) {
      expect(src(`src/features/${p}`)).toContain('await loadSources(id)');
    }
    expect(normalizeGbp(null).state).toBe('not_connected');
  });
});

describe('A2.5 · language', () => {
  const copies = { MAPS_COPY, GEO_COPY, TWIN_COPY, RADAR_COPY, VOICE_COPY, SEO_COPY, ADVISOR_COPY } as Record<string, { es: object; en: object }>;
  it('46. ES and EN expose the same keys for all seven tools', () => {
    for (const c of Object.values(copies)) expect(Object.keys(c.en).sort()).toEqual(Object.keys(c.es).sort());
  });

  it('47. no ES/EN string is empty', () => {
    for (const c of Object.values(copies)) {
      for (const lang of ['es', 'en'] as const) {
        for (const v of Object.values(c[lang])) if (typeof v === 'string') expect(v.trim()).not.toBe('');
      }
    }
  });
});

describe('A2.5 · secrets, legacy, tools, routes', () => {
  const SECRET = /sk_live_|sk_test_|whsec_|GOCSPX-|SUPABASE_SERVICE_ROLE_KEY|"role":"service_role"|AIza[0-9A-Za-z_-]{20}/;

  it('48. no secret in src/', () => {
    for (const f of frontend) expect(readFileSync(f, 'utf8')).not.toMatch(SECRET);
  });

  it('49. no secret in dist/ (when built)', () => {
    const dist = join(ROOT, 'dist');
    if (!existsSync(dist)) return;
    for (const f of walk(dist).filter((x) => /\.(js|html|css|map)$/.test(x))) expect(readFileSync(f, 'utf8')).not.toMatch(SECRET);
  });

  it('50. all fourteen legacy functions remain retired (410)', () => {
    expect(RETIRED).toHaveLength(14);
    for (const fn of RETIRED) expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410');
  });

  it('51. all seven tools remain enabled', () => {
    expect(TOOLS.filter((t) => t.enabled)).toHaveLength(7);
  });

  it('52. tool and source routes exist', () => {
    for (const r of ['/herramientas/seo', '/herramientas/advisor', '/fuentes', '/negocio', '/facturacion']) expect(app).toContain(`"${r}"`);
  });
});

describe('A2.5 · no destructive or out-of-scope change', () => {
  it('53. the A2.5 migration touches no Stripe or billing object', () => {
    expect(a25Migration).not.toMatch(/stripe|subscription|billing/i);
  });

  it('54. Google OAuth configuration is untouched (same env names, same redirect builder)', () => {
    for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']) expect(oauthCallback).toContain(`Deno.env.get("${k}")`);
    expect(oauthStart).toContain('GOOGLE_CLIENT_ID');
  });

  it('55. no AI usage counter is reset', () => {
    expect(a25Migration).not.toMatch(/ai_usage/);
    expect(gbpSync).not.toMatch(/ai_usage/);
  });

  it('56-57. the A2.5 change deletes no business and no source', () => {
    const sql = a25Migration.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sql).not.toMatch(/DROP|DELETE|TRUNCATE|ALTER\s+COLUMN|RENAME/i);
    expect(gbpSync).not.toMatch(/\.delete\(|from\("businesses"\)\s*\.(update|upsert|insert)/);
  });
});

describe('A2.5 · RLS / column privileges and logging', () => {
  it('58. clients can only READ the verified columns', () => {
    expect(a25Migration).toContain('GRANT SELECT (verified_profile, verified_at) ON connected_sources TO authenticated');
    expect(a25Migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|ALL)/i);
  });

  it('59. original column grants never gave clients the token columns', () => {
    const grants = sourcesMigration.slice(sourcesMigration.indexOf('REVOKE ALL ON connected_sources'));
    expect(grants).toContain('REVOKE ALL ON connected_sources FROM authenticated');
    expect(grants.split('GRANT DELETE')[0]).not.toMatch(/access_token_encrypted|refresh_token_encrypted/);
  });

  it('60. GBP functions never log tokens, profiles or raw errors and never echo them to users', () => {
    for (const s of [gbpSync, oauthStart, oauthCallback]) {
      for (const line of s.split('\n').filter((l) => l.includes('console.'))) {
        expect(line).not.toMatch(/access_token|refresh_token|accessToken|tokenData|profile|email|authHeader|jwt|, err\)|\.message/);
      }
    }
    expect(oauthStart).not.toContain('err.message');
    expect(oauthCallback).not.toContain('${googleError}');
  });
});
