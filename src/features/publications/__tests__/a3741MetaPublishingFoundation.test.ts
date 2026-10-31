import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { META_SCOPES } from '../../../../supabase/functions/meta-oauth-start/handler.ts';
import {
  createHandler as createCallback,
  parsePageTasks as callbackPageTasks,
  type Authorization,
  type PublishingConsent,
  type PublishingStoreResult,
} from '../../../../supabase/functions/meta-oauth-callback/handler.ts';
import {
  createHandler as createPublishing,
  deriveCapabilities,
  errorTraits,
  instagramImageIssue,
  isPublishErrorCode,
  mapMetaError,
  parsePageTasks,
  PUBLISH_ERRORS,
  PUBLISHING_SCOPES,
  redact,
  REQUIRED_PERMISSIONS,
  safeErrorLog,
  toReadModel,
  type CapabilityRow,
  type PreflightRow,
  type PublishingDeps,
} from '../../../../supabase/functions/meta-publishing/handler.ts';
import { readPublishingCallbackParams } from '../../meta-connection/MetaCallbackPage';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const hex = (s: string) => createHash('sha256').update(s).digest('hex');

const SQL = read('supabase/migrations/20261028132929_a3741_meta_publishing_security_foundation.sql');
const GUARD_SQL = read('supabase/migrations/20261028133311_a3741_publishing_consent_decline_guard.sql');
const CALLBACK = read('supabase/functions/meta-oauth-callback/handler.ts');
const PUBLISHING = read('supabase/functions/meta-publishing/handler.ts');
const PUBLISHING_INDEX = read('supabase/functions/meta-publishing/index.ts');
const fn = (name: string, source = SQL) => {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  const end = source.indexOf('$$;', start);
  return source.slice(start, end);
};

const USER = '11111111-1111-4111-8111-111111111111';
const PUB = '22222222-2222-4222-8222-222222222222';
const BUSINESS = '33333333-3333-4333-8333-333333333333';
const ENV: Record<string, string> = {
  META_APP_ID: '1234567890',
  META_APP_SECRET: 'app-secret-value-XYZ',
  META_REDIRECT_URI: 'https://example.supabase.co/functions/v1/meta-oauth-callback',
  SITE_URL: 'https://localseohub.io',
};
const TOKEN = 'EAAlongLivedUserToken123456789012345';
const STATE = 'a'.repeat(64);
const COMPLETION = 'c'.repeat(64);
const BINDING = 'b'.repeat(64);

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function publishingDeps(over: Partial<PublishingDeps> = {}) {
  const deps: PublishingDeps = {
    getUserId: vi.fn(async (jwt: string) => (jwt === 'good' ? USER : null)),
    getOwnBusinessId: vi.fn(async () => BUSINESS),
    beginConsent: vi.fn(async () => 'ok' as const),
    completeConsent: vi.fn(async () => ({ result: 'ok' as const, permissions: ['pages_manage_posts'] })),
    capabilities: vi.fn(async (): Promise<CapabilityRow[]> => [
      { channel: 'facebook', issue: null, missing_permissions: [] },
      { channel: 'instagram', issue: 'PERMISSION_REQUIRED', missing_permissions: ['instagram_content_publish'] },
    ]),
    preflight: vi.fn(async (): Promise<PreflightRow[]> => []),
    env: (n: string) => ENV[n],
    randomToken: () => STATE,
    ...over,
  };
  return { deps, handle: createPublishing(deps) };
}
const post = (body: unknown, jwt = 'good') =>
  new Request('https://x/meta-publishing', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) });

function graph(over: { perms?: string[]; accounts?: unknown; meError?: boolean } = {}) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('fb_exchange_token')) return jsonRes({ access_token: TOKEN, expires_in: 5184000 });
    if (u.includes('/oauth/access_token')) return jsonRes({ access_token: 'EAAshort' });
    if (u.includes('/me/permissions')) {
      const granted = over.perms ?? ['pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic', 'pages_manage_posts'];
      return jsonRes({ data: [...granted.map((permission) => ({ permission, status: 'granted' })), { permission: 'instagram_content_publish', status: 'declined' }] });
    }
    if (u.includes('/me/accounts')) return jsonRes(over.accounts ?? { data: [{ id: '111', name: 'Sol', tasks: ['CREATE_CONTENT', 'MODERATE', 'bad'] }] });
    if (u.includes('/me?')) return over.meError ? jsonRes({ error: { code: 190, fbtrace_id: 'TRACE' } }, 400) : jsonRes({ id: '999' });
    return jsonRes({ error: { code: 1 } }, 500);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

function callbackDeps(opts: { publishing?: 'unknown' | 'ok' | 'expired' | 'consumed'; store?: PublishingStoreResult; graph?: Parameters<typeof graph>[0] } = {}) {
  const g = graph(opts.graph);
  const failConnection = vi.fn(async () => undefined);
  const discard = vi.fn(async () => undefined);
  const stored: PublishingConsent[] = [];
  const authorizations: Authorization[] = [];
  const consumeState = vi.fn(async () => ({ result: 'ok' as const, connectionId: 'conn-1' }));
  const deps = {
    consumeState,
    consumePublishingState: vi.fn(async () => ({ result: opts.publishing ?? 'ok', connectionId: opts.publishing === 'unknown' ? null : 'conn-1' })),
    discardPublishingState: discard,
    storePublishingConsent: vi.fn(async (c: PublishingConsent) => { stored.push(c); return opts.store ?? 'ok'; }),
    failConnection,
    storeAuthorization: vi.fn(async (a: Authorization) => { authorizations.push(a); return true; }),
    env: (n: string) => ENV[n],
    fetch: g.fetchFn,
    randomToken: () => COMPLETION,
  };
  return { handle: createCallback(deps), failConnection, discard, stored, authorizations, consumeState, calls: g.calls };
}
const cbReq = (q: string) => new Request(`https://x/meta-oauth-callback?${q}`);
const location = (r: Response) => r.headers.get('Location') ?? '';

describe('A3.7.4.1 · A. RLS, ownership and forgery', () => {
  it('attempts table: RLS on, browser SELECT only, owner-scoped, no client writes', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.publication_publish_attempts ENABLE ROW LEVEL SECURITY;/);
    expect(SQL).toMatch(/REVOKE ALL ON public\.publication_publish_attempts FROM anon, authenticated, service_role;/);
    expect(SQL).toMatch(/GRANT SELECT ON public\.publication_publish_attempts TO authenticated;/);
    expect(SQL).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*publication_publish_attempts/);
    expect(SQL).toMatch(/FOR SELECT\s+TO authenticated\s+USING \(auth\.uid\(\) = user_id\s+AND EXISTS \(SELECT 1 FROM public\.businesses b WHERE b\.id = business_id AND b\.user_id = auth\.uid\(\)\)\)/);
    expect(SQL).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)[^;]*publication_publish_attempts|ON public\.publication_publish_attempts FOR (INSERT|UPDATE|DELETE|ALL)/);
  });
  it('consent states are invisible to every API role', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.meta_publishing_consent_states ENABLE ROW LEVEL SECURITY;/);
    expect(SQL).toMatch(/REVOKE ALL ON public\.meta_publishing_consent_states FROM anon, authenticated, service_role;/);
    expect(SQL).not.toMatch(/CREATE POLICY[^;]*meta_publishing_consent_states/);
  });
  it('every new function is SECURITY DEFINER with empty search_path and never executable by browsers', () => {
    const defs = SQL.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) ?? [];
    expect(defs.length).toBe(17);
    expect((SQL.match(/SECURITY DEFINER SET search_path = ''/g) ?? []).length).toBe(17);
    expect(SQL).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|authenticated|PUBLIC)/);
    for (const internal of ['meta_publish_channel_issue', 'publication_publish_gate', 'publish_attempts_guard']) {
      expect(SQL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${internal}\\([^)]*\\) FROM PUBLIC, anon, authenticated, service_role;`));
      expect(SQL).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${internal}\\(`));
    }
    expect(GUARD_SQL).toMatch(/FROM PUBLIC, anon, authenticated;/);
    expect(GUARD_SQL).toMatch(/TO service_role;/);
  });
  it('the guard trigger enforces owner coherence and immutable identity for every writer', () => {
    const guard = fn('publish_attempts_guard');
    expect(guard).toMatch(/publish_attempt_owner_mismatch/);
    expect(guard).toMatch(/p\.user_id = NEW\.user_id AND p\.business_id = NEW\.business_id/);
    expect(guard).toMatch(/publish_attempt_identity_immutable/);
  });
  it('the server resolves the user from the JWT; forged body ids are ignored', async () => {
    const { deps, handle } = publishingDeps();
    const res = await handle(post({ action: 'preflight', publicationId: PUB, expectedVersion: 4, userId: 'attacker', businessId: 'x' }));
    expect(res.status).toBe(200);
    expect(deps.preflight).toHaveBeenCalledWith(USER, PUB, 4);
    expect((await handle(post({ action: 'preflight', publicationId: PUB, expectedVersion: 4 }, 'bad'))).status).toBe(401);
    expect((await (await handle(post({ action: 'capabilities' }, ''))).json()).code).toBe('AUTH_REQUIRED');
  });
  it('the gate rejects a publication not owned by the caller', () => {
    expect(fn('publication_publish_gate')).toMatch(/WHERE p\.id = p_publication_id AND p\.user_id = p_user_id/);
    expect(fn('publish_attempt_begin')).toMatch(/WHERE p\.id = p_publication_id AND p\.user_id = p_user_id\s+FOR UPDATE/);
    expect(fn('publish_attempt_finish')).toMatch(/a\.id = p_attempt_id AND a\.user_id = p_user_id FOR UPDATE/);
  });
  it('no attempt column can hold secrets', () => {
    const table = SQL.slice(SQL.indexOf('CREATE TABLE IF NOT EXISTS public.publication_publish_attempts'), SQL.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS publish_attempts_identity_live'));
    expect(table).not.toMatch(/token|secret|proof|signed|fbtrace|raw|response|oauth/i);
  });
});

describe('A3.7.4.1 · B. Idempotency', () => {
  it('identity (publication, channel, version) is DB-enforced and server generated', () => {
    expect(SQL).toMatch(/idempotency_key text GENERATED ALWAYS AS \(publication_id::text \|\| ':' \|\| channel \|\| ':v' \|\| draft_version::text\) STORED/);
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS publish_attempts_identity_live\s+ON public\.publication_publish_attempts \(publication_id, channel, draft_version\)\s+WHERE status IN \('publishing', 'succeeded', 'unknown'\)/);
    expect(SQL).toMatch(/publish_attempts_one_active\s+ON public\.publication_publish_attempts \(publication_id, channel\)\s+WHERE status IN \('publishing', 'unknown'\)/);
    expect(SQL).toMatch(/publish_attempts_one_success\s+ON public\.publication_publish_attempts \(publication_id, channel\)\s+WHERE status = 'succeeded'/);
  });
  it('existing attempts map to ALREADY_PUBLISHED / PUBLISH_IN_PROGRESS / PUBLISH_OUTCOME_UNKNOWN before anything else', () => {
    const gate = fn('publication_publish_gate');
    const order = ['ALREADY_PUBLISHED', 'PUBLISH_OUTCOME_UNKNOWN', 'PUBLISH_IN_PROGRESS', "v_pub.status <> 'proposals_ready'"].map((s) => gate.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('A3.7.4.1 · C. Concurrency', () => {
  it('begin locks the publication row, re-checks the gate inside the lock and maps a lost race to PUBLISH_IN_PROGRESS', () => {
    const begin = fn('publish_attempt_begin');
    expect(begin.indexOf('FOR UPDATE')).toBeLessThan(begin.indexOf('publication_publish_gate('));
    expect(begin).toMatch(/EXCEPTION WHEN unique_violation THEN\s+RETURN QUERY SELECT 'PUBLISH_IN_PROGRESS'/);
    expect(SQL).toMatch(/CONSTRAINT publish_attempts_number_key UNIQUE \(publication_id, channel, attempt_number\)/);
  });
  it('stale publishing rows become UNKNOWN, never FAILED, and only after a minimum age', () => {
    const stale = fn('publish_attempt_mark_stale');
    expect(stale).toMatch(/interval '2 minutes'/);
    expect(stale).toMatch(/SET status = 'unknown', error_code = 'PUBLISH_OUTCOME_UNKNOWN'/);
    expect(stale).not.toMatch(/'failed'/);
  });
});

describe('A3.7.4.1 · D. Final draft is the only source of truth', () => {
  it('caption comes from the frozen channel text; the browser never supplies caption text', async () => {
    const begin = fn('publish_attempt_begin');
    expect(begin).toMatch(/CASE p_channel WHEN 'facebook' THEN v_draft\.facebook_text ELSE v_draft\.instagram_text END/);
    expect(begin).not.toMatch(/p_caption|p_text/);
    expect(PUBLISHING).not.toMatch(/body\?\.(caption|text|facebook_text|instagram_text)/);
    expect(PUBLISHING).not.toMatch(/publish_attempt_begin|\/photos|\/media_publish|\/media\b/);
  });
  it('requires generation match, version match and the A3.7.3.3 text validator with 5000/2200', () => {
    const gate = fn('publication_publish_gate');
    expect(gate).toMatch(/v_draft\.source_generation_id IS DISTINCT FROM v_pub\.proposal_generation_id/);
    expect(gate).toMatch(/v_draft\.version <> p_expected_version THEN\s+RETURN 'VERSION_CONFLICT'/);
    expect(gate).toMatch(/publication_channel_text_issue\(v_text, CASE p_channel WHEN 'facebook' THEN 5000 ELSE 2200 END\)/);
    expect(gate).toMatch(/adaptation_claimed_at > now\(\) - interval '3 minutes'/);
  });
  it('a missing or non-integer expected version is a VERSION_CONFLICT before reaching the database', async () => {
    const { deps, handle } = publishingDeps();
    for (const v of [undefined, '4', 0, 1.5]) {
      const res = await handle(post({ action: 'preflight', publicationId: PUB, expectedVersion: v }));
      expect((await res.json()).code).toBe('VERSION_CONFLICT');
    }
    expect(deps.preflight).not.toHaveBeenCalled();
    expect((await (await handle(post({ action: 'preflight', publicationId: 'nope', expectedVersion: 1 }))).json()).code).toBe('INVALID_PUBLICATION_STATE');
  });
  it('image path must belong to the publication and exist in private storage', () => {
    const gate = fn('publication_publish_gate');
    expect(gate).toMatch(/v_pub\.user_id::text \|\| '\/' \|\| v_pub\.business_id::text \|\| '\/'\s+\|\| v_pub\.id::text \|\| '\/\[0-9a-f-\]\{36\}\\\.\(jpg\|png\)\$'/);
    expect(gate).toMatch(/o\.bucket_id = 'publication-images' AND o\.name = v_pub\.image_path/);
    expect(SQL).not.toMatch(/create_signed_url|public = true|getPublicUrl/i);
  });
});

describe('A3.7.4.1 · E. Permissions', () => {
  it('normal connect scopes are unchanged', () => {
    expect(META_SCOPES).toEqual(['pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic']);
    expect(sha('supabase/functions/meta-oauth-start/handler.ts')).toBe('e21d60a580ae1ff7e8775efb721f5b6bacf436946a12177f6a70ad6f8aadc49f');
  });
  it('publishing mode asks only for pages_manage_posts and instagram_content_publish on top of read scopes', () => {
    expect(PUBLISHING_SCOPES).toEqual([...META_SCOPES, 'pages_manage_posts', 'instagram_content_publish']);
    expect(PUBLISHING_SCOPES.join(',')).not.toMatch(/instagram_business_|ads_|instagram_manage|publish_actions/);
    expect(REQUIRED_PERMISSIONS.facebook).toContain('pages_manage_posts');
    expect(REQUIRED_PERMISSIONS.instagram).toContain('instagram_content_publish');
  });
  it('the database requires the same permission sets per channel', () => {
    const issue = fn('meta_publish_channel_issue');
    expect(issue).toMatch(/ARRAY\['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'\]/);
    expect(issue).toMatch(/ARRAY\['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'\]/);
    expect(issue).toMatch(/c\.revocation_status IS NOT NULL\s+OR \(c\.token_expires_at IS NOT NULL AND c\.token_expires_at <= now\(\)\)/);
  });
});

describe('A3.7.4.1 · F. Channel eligibility and capabilities', () => {
  it('Facebook additionally requires the CREATE_CONTENT task on the selected Page', () => {
    expect(fn('meta_publish_channel_issue')).toMatch(/c\.page_tasks IS NULL OR NOT \('CREATE_CONTENT' = ANY \(c\.page_tasks\)\)/);
  });
  it('page tasks parser keeps only well-formed tasks for numeric page ids', () => {
    const data = [{ id: '111', tasks: ['CREATE_CONTENT', 'CREATE_CONTENT', 'bad task', 7] }, { id: 'x', tasks: ['MANAGE'] }, { id: '222' }];
    expect(parsePageTasks(data)).toEqual([{ id: '111', tasks: ['CREATE_CONTENT'] }, { id: '222', tasks: [] }]);
    expect(callbackPageTasks(data).map((p) => p.tasks)).toEqual([['CREATE_CONTENT'], []]);
    expect(parsePageTasks({ data })).toEqual([]);
  });
  it('capabilities are derived per channel, independently, and never stored', () => {
    const caps = deriveCapabilities([
      { channel: 'facebook', issue: null, missing_permissions: [] },
      { channel: 'instagram', issue: 'IMAGE_UNSUPPORTED', missing_permissions: ['ads_management', 'instagram_content_publish'] },
    ]);
    expect(caps.facebook_publish_ready).toBe(true);
    expect(caps.instagram_publish_ready).toBe(false);
    expect(caps.channels[1].missing_permissions).toEqual(['instagram_content_publish']);
    expect(deriveCapabilities([]).facebook_publish_ready).toBe(false);
    expect(deriveCapabilities([{ channel: 'facebook', issue: 'weird', missing_permissions: null }]).channels[0].issue).toBe('INTERNAL_ERROR');
    expect(SQL).not.toMatch(/publish_ready/);
  });
  it('preflight evaluates both channels independently', () => {
    const pre = fn('publication_publish_preflight');
    expect(pre).toMatch(/FROM \(VALUES \('facebook'::text\), \('instagram'::text\)\) AS ch\(name\)/);
    expect(pre).toMatch(/publication_publish_gate\(p_user_id, p_publication_id, ch\.name, p_expected_version\)/);
  });
});

describe('A3.7.4.1 · G. Instagram image eligibility', () => {
  it.each([
    ['image/jpeg', 1080, 1080, null],
    ['image/jpeg', 1080, 1350, null],
    ['image/jpeg', 1910, 1000, null],
    ['image/jpeg', 1000, 1300, 'IMAGE_UNSUPPORTED'],
    ['image/jpeg', 2000, 1000, 'IMAGE_UNSUPPORTED'],
    ['image/png', 1080, 1080, 'IMAGE_UNSUPPORTED'],
    ['image/jpeg', null, 1080, 'IMAGE_UNSUPPORTED'],
  ])('%s %sx%s -> %s', (mime, w, h, expected) => {
    expect(instagramImageIssue(mime as string, w as number | null, h as number | null)).toBe(expected);
  });
  it('the database applies the same rule only to Instagram; PNG stays valid for Facebook', () => {
    const gate = fn('publication_publish_gate');
    expect(gate).toMatch(/IF p_channel = 'instagram' THEN\s+v_ratio := v_pub\.image_width::numeric \/ v_pub\.image_height::numeric;\s+IF v_pub\.image_mime <> 'image\/jpeg' OR v_ratio < 0\.8 OR v_ratio > 1\.91 THEN\s+RETURN 'IMAGE_UNSUPPORTED'/);
    expect(gate).toMatch(/\(jpg\|png\)/);
  });
});

describe('A3.7.4.1 · H. State machine', () => {
  it('only server-owned transitions are allowed', () => {
    const guard = fn('publish_attempts_guard');
    expect(guard).toMatch(/IF NEW\.status <> 'publishing' THEN\s+RAISE EXCEPTION 'publish_attempt_must_start_publishing'/);
    expect(guard).toMatch(/OLD\.status = 'publishing' AND NEW\.status IN \('succeeded', 'failed', 'unknown'\)/);
    expect(guard).toMatch(/OLD\.status = 'unknown'[\s\S]*NEW\.verification_attempts <= OLD\.verification_attempts OR NEW\.last_verified_at IS NULL/);
    expect(guard).toMatch(/publish_attempt_invalid_transition/);
  });
  it('the shape constraint ties each state to its fields', () => {
    expect(SQL).toMatch(/status = 'succeeded' AND meta_object_id IS NOT NULL/);
    expect(SQL).toMatch(/status = 'unknown' AND meta_object_id IS NULL AND permalink IS NULL\s+AND error_code = 'PUBLISH_OUTCOME_UNKNOWN' AND finished_at IS NOT NULL\s+AND NOT retryable AND verification_required/);
    expect(SQL).toMatch(/error_code NOT IN \('PUBLISH_OUTCOME_UNKNOWN', 'ALREADY_PUBLISHED', 'PUBLISH_IN_PROGRESS'\)/);
  });
  it('FAILED is retryable only for transient Meta errors; UNKNOWN becomes FAILED only via verification', () => {
    expect(fn('publish_attempt_finish')).toMatch(/retryable = p_error_code IN \('META_RATE_LIMITED', 'META_TEMPORARY_ERROR'\)/);
    const verify = fn('publish_attempt_record_verification');
    expect(verify).toMatch(/IF v_status <> 'unknown' THEN\s+RETURN 'invalid_transition'/);
    expect(verify).toMatch(/verification_attempts = verification_attempts \+ 1/);
  });
  it('the read model exposes NOT_REQUESTED as absence of a row and hides ids unless SUCCEEDED', () => {
    const base = { draft_version: 4, attempt_error_code: null, meta_object_id: null, permalink: null, attempt_updated_at: null, attempt_retryable: null, attempt_verification_required: null };
    const model = toReadModel([
      { ...base, channel: 'facebook', issue: 'ALREADY_PUBLISHED', attempt_status: 'succeeded', meta_object_id: '1_2', permalink: 'https://www.facebook.com/1/posts/2' },
      { ...base, channel: 'instagram', issue: null, attempt_status: null },
    ]);
    expect(model[0]).toMatchObject({ channel: 'facebook', state: 'SUCCEEDED', can_publish: false, last_attempt: { meta_object_id: '1_2' } });
    expect(model[1]).toMatchObject({ channel: 'instagram', state: 'NOT_REQUESTED', can_publish: true, last_attempt: null });
    const unknown = toReadModel([{ ...base, channel: 'facebook', issue: 'PUBLISH_OUTCOME_UNKNOWN', attempt_status: 'unknown', attempt_error_code: 'PUBLISH_OUTCOME_UNKNOWN', meta_object_id: '9', attempt_verification_required: true }]);
    expect(unknown[0].state).toBe('UNKNOWN');
    expect(unknown[0].last_attempt).toMatchObject({ meta_object_id: null, verification_required: true, retryable: false });
    expect(unknown[0].issue_traits).toEqual({ retryable: false, requires_user_action: false, verification_required: true });
  });
});

describe('A3.7.4.1 · I. Error taxonomy, mapper and redaction', () => {
  it('has exactly the 15 codes, mirrored in the database CHECK', () => {
    const codes = Object.keys(PUBLISH_ERRORS);
    expect(codes).toHaveLength(15);
    for (const c of codes) expect(SQL).toContain(`'${c}'`);
    expect(errorTraits('PUBLISH_OUTCOME_UNKNOWN')).toEqual({ retryable: false, requires_user_action: false, verification_required: true });
    expect(codes.filter((c) => PUBLISH_ERRORS[c as keyof typeof PUBLISH_ERRORS].retryable)).toEqual(['META_RATE_LIMITED', 'META_TEMPORARY_ERROR']);
    expect(isPublishErrorCode('toString')).toBe(false);
  });
  it.each([
    [{ status: 400, body: { error: { code: 4 } } }, 'META_RATE_LIMITED'],
    [{ status: 400, body: { error: { code: 613 } } }, 'META_RATE_LIMITED'],
    [{ status: 429, body: {} }, 'META_RATE_LIMITED'],
    [{ status: 401, body: { error: { code: 190, error_subcode: 463 } } }, 'REAUTH_REQUIRED'],
    [{ status: 403, body: { error: { code: 10 } } }, 'PERMISSION_REQUIRED'],
    [{ status: 403, body: { error: { code: 200 } } }, 'PERMISSION_REQUIRED'],
    [{ status: 400, body: { error: { code: 368 } } }, 'META_REJECTED'],
    [{ status: 400, body: { error: { code: 100 } } }, 'META_REJECTED'],
    [{ status: 400, body: { error: { code: 36003, error_subcode: 2207009 } } }, 'IMAGE_UNSUPPORTED'],
    [{ status: 500, body: { error: { code: 2, is_transient: true } } }, 'META_TEMPORARY_ERROR'],
    [{ status: 502, body: null }, 'PUBLISH_OUTCOME_UNKNOWN'],
    [{ transport: 'timeout' as const }, 'PUBLISH_OUTCOME_UNKNOWN'],
    [{ transport: 'network' as const, sent: false }, 'META_TEMPORARY_ERROR'],
  ])('maps %j -> %s', (input, expected) => {
    expect(mapMetaError(input)).toBe(expected);
  });
  it('redacts tokens, proofs, signed URLs, fbtrace_id and long hashes', () => {
    const raw = `Bearer ${TOKEN} access_token=${TOKEN}&appsecret_proof=${'f'.repeat(64)} https://x.supabase.co/storage/v1/object/sign/publication-images/a.jpg?token=abc "fbtrace_id":"AbC123" ${TOKEN}`;
    const out = redact(raw);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain('f'.repeat(64));
    expect(out).not.toContain('AbC123');
    expect(out).not.toContain('object/sign');
    expect(redact('x'.repeat(1000)).length).toBe(300);
  });
  it('safe error logs carry only numeric codes and the normalized result', () => {
    const log = safeErrorLog({ error: { code: 190, error_subcode: 463, message: `bad ${TOKEN}`, fbtrace_id: 'TRACE' } }, 'REAUTH_REQUIRED');
    expect(log).toEqual({ result: 'REAUTH_REQUIRED', code: 190, subcode: 463 });
  });
  it('responses never echo secrets and unexpected failures become INTERNAL_ERROR', async () => {
    const { handle } = publishingDeps({ capabilities: vi.fn(async () => { throw new Error(`boom ${TOKEN}`); }) });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handle(post({ action: 'capabilities' }));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    spy.mockRestore();
  });
});

describe('A3.7.4.1 · J. Separate publishing consent', () => {
  it('start: authenticated, owner business, hashed single-use state, rerequest, binding returned once', async () => {
    const { deps, handle } = publishingDeps();
    const body = await (await handle(post({ action: 'enable_publishing_start' }))).json();
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v25.0/dialog/oauth');
    expect(url.searchParams.get('scope')).toBe(PUBLISHING_SCOPES.join(','));
    expect(url.searchParams.get('auth_type')).toBe('rerequest');
    expect(url.searchParams.get('redirect_uri')).toBe(ENV.META_REDIRECT_URI);
    const begin = (deps.beginConsent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(begin).toMatchObject({ userId: USER, businessId: BUSINESS, stateHash: hex(STATE), bindingHash: hex(STATE) });
    expect(JSON.stringify(begin)).not.toContain(STATE + '"');
    expect(new Date(begin.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000 + 50);
  });
  it('start refuses when the read-only connection is not healthy', async () => {
    const { handle } = publishingDeps({ beginConsent: vi.fn(async () => 'not_connected' as const) });
    expect((await (await handle(post({ action: 'enable_publishing_start' }))).json()).code).toBe('CHANNEL_NOT_CONNECTED');
  });
  it('complete: hashes completion and binding; mismatches fail closed', async () => {
    const { deps, handle } = publishingDeps();
    const ok = await (await handle(post({ action: 'enable_publishing_complete', completion: COMPLETION, binding: BINDING }))).json();
    expect(ok).toMatchObject({ ok: true, facebook_publish_ready: true, instagram_publish_ready: false });
    expect(deps.completeConsent).toHaveBeenCalledWith(USER, hex(COMPLETION), hex(BINDING));
    expect((await (await handle(post({ action: 'enable_publishing_complete', completion: 'x', binding: BINDING }))).json()).code).toBe('SESSION_MISMATCH');
    const bad = publishingDeps({ completeConsent: vi.fn(async () => ({ result: 'binding_mismatch' as const, permissions: [] })) });
    expect((await (await bad.handle(post({ action: 'enable_publishing_complete', completion: COMPLETION, binding: BINDING }))).json()).code).toBe('SESSION_MISMATCH');
  });
  it('callback: a granted consent re-reads permissions and page tasks with appsecret_proof and stores only granted values', async () => {
    const { handle, stored, failConnection, consumeState, calls } = callbackDeps();
    const res = await handle(cbReq(`state=${STATE}&code=abc`));
    expect(location(res)).toBe(`https://localseohub.io/oauth/meta/callback#publishing_token=${COMPLETION}`);
    expect(consumeState).not.toHaveBeenCalled();
    expect(failConnection).not.toHaveBeenCalled();
    expect(stored[0].permissions).toEqual(['pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic', 'pages_manage_posts']);
    expect(stored[0].pages).toEqual([{ id: '111', name: 'Sol', tasks: ['CREATE_CONTENT', 'MODERATE'] }]);
    expect(stored[0].stateHash).toBe(hex(STATE));
    expect(calls.some((u) => u.includes('/me/accounts?fields=id,name,tasks'))).toBe(true);
    expect(calls.filter((u) => u.includes('/me')).every((u) => u.includes('appsecret_proof='))).toBe(true);
    expect(calls.some((u) => /\/photos|\/media/.test(u))).toBe(false);
  });
  it.each([
    ['error=access_denied', undefined, 'PUBLISHING_CONSENT_DECLINED'],
    ['code=abc', 'declined' as const, 'PUBLISHING_CONSENT_DECLINED'],
    ['code=abc', 'downgrade' as const, 'PUBLISHING_CONSENT_DOWNGRADE'],
    ['code=abc', 'account_mismatch' as const, 'PUBLISHING_ACCOUNT_MISMATCH'],
  ])('callback: %s / store=%s never disconnects the read-only connection', async (q, store, code) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handle, failConnection, discard } = callbackDeps({ store });
    const res = await handle(cbReq(`state=${STATE}&${q}`));
    expect(location(res)).toBe(`https://localseohub.io/oauth/meta/callback?publishing_error=${code}`);
    expect(failConnection).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith(hex(STATE));
    spy.mockRestore();
  });
  it('callback: expired, replayed or Graph-failed consents also leave the connection intact', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    for (const [opts, code] of [[{ publishing: 'expired' as const }, 'OAUTH_STATE_EXPIRED'], [{ publishing: 'consumed' as const }, 'OAUTH_STATE_INVALID'], [{ graph: { meError: true } }, 'REAUTH_REQUIRED']] as const) {
      const { handle, failConnection } = callbackDeps(opts);
      expect(location(await handle(cbReq(`state=${STATE}&code=abc`)))).toContain(`publishing_error=${code}`);
      expect(failConnection).not.toHaveBeenCalled();
    }
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/EAAlong|app-secret/);
    spy.mockRestore();
    log.mockRestore();
  });
  it('callback: an unrelated state falls through to the unchanged read-only flow', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { handle, consumeState, authorizations, stored } = callbackDeps({ publishing: 'unknown' });
    const res = await handle(cbReq(`state=${STATE}&code=abc`));
    expect(consumeState).toHaveBeenCalledWith(hex(STATE));
    expect(location(res)).toBe(`https://localseohub.io/oauth/meta/callback#token=${COMPLETION}`);
    expect(authorizations).toHaveLength(1);
    expect(stored).toHaveLength(0);
    log.mockRestore();
  });
  it('the database never lets a consent weaken or replace a healthy connection without publishing grants', () => {
    const store = fn('meta_store_publishing_consent', GUARD_SQL);
    expect(store).toMatch(/v_conn\.meta_user_id IS DISTINCT FROM p_meta_user_id/);
    expect(store).toMatch(/IF NOT \(v_perms @> v_read\) THEN[\s\S]*RETURN 'downgrade'/);
    expect(store).toMatch(/IF NOT \(v_perms && ARRAY\['pages_manage_posts', 'instagram_content_publish'\]\) THEN[\s\S]*RETURN 'declined'/);
    expect(store).toMatch(/public\.meta_vault_put\(NULL, p_access_token\)/);
    const complete = fn('meta_complete_publishing_consent');
    expect(complete).toMatch(/v_state\.binding_hash <> p_binding_hash/);
    expect(complete).toMatch(/UPDATE public\.meta_publishing_consent_states SET pending_token_ref = NULL[\s\S]*UPDATE public\.meta_connections/);
    expect(complete).toMatch(/AND status = 'connected'/);
    expect(fn('meta_begin_publishing_consent')).toMatch(/p_expires_at > now\(\) \+ interval '15 minutes'/);
    expect(SQL).not.toMatch(/meta_fail_connection/);
    expect(CALLBACK.slice(CALLBACK.indexOf('const handlePublishing'), CALLBACK.indexOf('let connectionId'))).not.toMatch(/failConnection|terminate\(/);
  });
  it('the callback page parses publishing params separately from the read-only token', () => {
    expect(readPublishingCallbackParams('', `#publishing_token=${COMPLETION}`)).toEqual({ completion: COMPLETION, error: null });
    expect(readPublishingCallbackParams('?publishing_error=<x>', '')).toEqual({ completion: null, error: 'UNKNOWN_ERROR' });
    expect(readPublishingCallbackParams('', `#token=${COMPLETION}`)).toBeNull();
  });
  it('page tasks and consent markers reset when the Page changes or the connection leaves connected', () => {
    expect(fn('meta_connections_reset_publishing')).toMatch(/NEW\.status <> 'connected' OR NEW\.page_id IS DISTINCT FROM OLD\.page_id/);
    expect(fn('meta_connections_drop_publishing_consent')).toMatch(/DELETE FROM public\.meta_publishing_consent_states WHERE connection_id = NEW\.id/);
  });
});

describe('A3.7.4.1 · K. Freeze and scope', () => {
  // Authorized A3.7.4.1 test-only re-pins: migration count 55 -> 57 and a3741 migration exclusion (a281, a273, a272);
  // a3733 test 29 now allows exactly the readiness-only meta-publishing function and asserts it calls no Graph publish edge.
  // Authorized A3.7.4.2 re-pins (GATE A): App.tsx mounts the internal Facebook harness on the same hidden route; the four
  // App.tsx hash pins (a281, a273, a272, a3544) follow it; a3733 test 29 allows /photos only in facebookPhoto.ts.
  // A3.7.4.1 "now" values for a281/a273/a272/a3733 were 5dec386e / 2f3281bb / aa4e9524 / 6a528660.
  // Authorized A3.7.4.2 FIX02 re-pins: migration count 57 -> 58 and a3742 migration exclusion (a281, a273, a272);
  // prior GATE A "now" values were 0b69351e / 7b8b10b6 / 5c8006c5.
  // Authorized A3.7.4.2 GATE B.2 FIX03 re-pins: the review editor refreshes the shared publication after a save so the
  // Facebook publish panel never shows a stale version/caption; a3734 follows its context destructuring.
  // Authorized A3.7.4.3 GATE A CORRECTION 02 re-pins: App.tsx mounts the read-only Instagram harness; migration count
  // 58 -> 59 and a3743 exclusion (a281, a273, a272); a3544 follows App.tsx; a3733 test 29 allows instagram-publishing
  // with /media and /media_publish confined to its graph.ts. Prior "now" values for App/a281/a273/a272/a3544/a3733 were
  // 81b0de7c / 4db0f819 / 2ce19c6b / 20296e5b / cf7c8076 / eb212294.
  // Authorized A3.7.4.3 GATE A CORRECTION 03: a3732 records a single was/now exception for a3731, which in turn carries the
  // single A3.7.2 exception for a3721a (route window 300 -> 400). Historical freeze manifests are not rewritten.
  const AUTHORIZED_REPINS: Record<string, { was: string; now: string }> = {
    'src/App.tsx': {
      was: '7902658f9f56ad9db1059bf7111cd3b9ee786256f10b19ff0ac48b3e8d8b94ba',
      now: 'ef7f7cdca4c0c0a952a90cff7e68e427c1decdf2655c68c72d9f1468d2b5029b',
    },
    'src/components/__tests__/a281TrustCleanup.test.ts': {
      was: 'cb6a925ab209873f69222303e0b7afc27a1ebfe0e4aaf3d6eecba3364da36c92',
      now: '67ba5b56ce48065241d41032d74beab25c9960628f64b80c1c41fae667a3f821',
    },
    'src/features/roadmap/__tests__/a273Roadmap.test.ts': {
      was: '1fd5954c53ffa07da661db906f323ede4fffa5509fc66c23e21d2e150cf1fb94',
      now: '1225076b1f1f8a882c844e54541d7052b22f16cb45e94d7025bf7091278e9606',
    },
    'src/features/today-intelligence/__tests__/a272TodayIntelligence.test.ts': {
      was: 'e71fbc7bef4ea63c746bc1ce1b360c8c6529e7c3906b5447d9945a5419fbcf9f',
      now: 'f5b72768a745b70ea7cba7684f41fb0b30aa3e302c0719e5a5f875711b5fedf6',
    },
    // Split so the a3542 isolation guard (no literal reference to that layer outside it) keeps holding.
    ['src/features/social' + '-intelligence/integration/__tests__/a3544SocialIntegration.test.ts']: {
      was: 'e85d466ffe39ff2797ffc9505d44fa5a25261df955d38a465f0d54d9b12c8c08',
      now: 'c1b5c3c207d802e2f84f9c0e6fbe53a95beac5624d93e6fecb0b4b661fbf2290',
    },
    'src/features/publications/__tests__/a3733ChannelReview.test.ts': {
      was: 'd62c66187e16c6200e1327b5709def5e2fe781fd344e2202585560249b8759c9',
      now: '9dc24452f539a7fc0aa0bd4d28f1238babcf8c298b955a48edbb5088eadf7500',
    },
    'src/features/channel-review/ChannelReviewPanel.tsx': {
      was: '5ab5259c24a48072d80535c13d1d4b5a5e5c432a2a66316cd3d4b30efa128989',
      now: '0dc3a0e50b5f61c69d458313a5a7f9a672616af9f81906c32618239b8025f4be',
    },
    'src/features/publication-resume/__tests__/a3734PublicationResume.test.ts': {
      was: '5ca2c7ba3f3c311a94f78565156199efcc6e2c4a95a8bc00583e1fb58ab94cf9',
      now: '7778b24b8cf0e80c07fb33008a751bafd7dbe6c1d18ac395561e7e8ae4df35b1',
    },
    'src/features/publications/__tests__/a3732AdaptationGuards.test.ts': {
      was: 'b0125ea3973b824416fa517f29a6d5958d46d3cb77287d3c801d0cac18c3860b',
      now: '721d76d3dd8ce07f178eaf70b3502db0df64f3f0b3393d1ba0ff96b5aa960ddb',
    },
  };
  it('every A3.7.3.4 frozen file is byte-identical, except the enumerated authorized re-pins', () => {
    const manifest = read('auditoria-a2/A3_7_3_4_FREEZE_MANIFEST.md');
    let checked = 0;
    const repinned: string[] = [];
    for (const line of manifest.split('\n')) {
      const m = line.match(/^\|\s*([^|\s]+\.[a-z]+)\s*\|(.*)$/);
      const hashes = m?.[2].match(/[a-f0-9]{64}/g);
      if (!m || !hashes) continue;
      const recorded = hashes[hashes.length - 1];
      const repin = AUTHORIZED_REPINS[m[1]];
      if (repin) {
        expect(recorded, `${m[1]} manifest still proves previous hash`).toBe(repin.was);
        expect(sha(m[1]), m[1]).toBe(repin.now);
        repinned.push(m[1]);
      } else {
        expect(sha(m[1]), m[1]).toBe(recorded);
      }
      checked++;
    }
    expect(checked).toBe(36);
    expect(repinned.sort()).toEqual(Object.keys(AUTHORIZED_REPINS).sort());
  });
  it('the other frozen Meta handlers are untouched', () => {
    expect(sha('supabase/functions/meta-connection/handler.ts').slice(0, 8)).toBe('57e8341f');
    expect(sha('supabase/functions/meta-read/handler.ts').slice(0, 8)).toBe('987cc94b');
  });
  it('nothing publishes, creates containers, signs URLs or touches App Review', () => {
    for (const src of [PUBLISHING, PUBLISHING_INDEX, CALLBACK, SQL]) {
      expect(src).not.toMatch(/\/photos|media_publish|\/media\?|image_url|createSignedUrl|create_signed_url/);
    }
    expect(read('supabase/config.toml')).toMatch(/\[functions\.meta-publishing\]\nverify_jwt = true/);
  });
  it('the migration is additive: no drops, deletes of business data or rewrites', () => {
    expect(SQL).not.toMatch(/DROP TABLE|DROP COLUMN|ALTER COLUMN|RENAME|TRUNCATE|UPDATE public\.publications|UPDATE public\.publication_drafts/);
    expect(SQL).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK);/m);
  });
});
