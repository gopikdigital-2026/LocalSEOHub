// Keep identical in every premium function; a test enforces that the copies match.
export type EntitlementDecision = 'ok' | 'unauthorized' | 'premium_required' | 'rate_limited';

export interface EntitlementDeps {
  resolveUserId(token: string): Promise<string | null>;
  authorize(userId: string, fn: string): Promise<EntitlementDecision>;
}

export type EntitlementResult = { ok: true; userId: string } | { ok: false; response: Response };

export const PREMIUM_RATE_LIMIT = { limit: 30, windowSeconds: 3600 };

const DENIALS: Record<Exclude<EntitlementDecision, 'ok'> | 'unavailable', number> = {
  unauthorized: 401,
  premium_required: 403,
  rate_limited: 429,
  unavailable: 503,
};

const DECISIONS = new Set<string>(['ok', 'unauthorized', 'premium_required', 'rate_limited']);

function deny(code: keyof typeof DENIALS, cors: Record<string, string>): EntitlementResult {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error: code }), {
      status: DENIALS[code],
      headers: { ...cors, 'Content-Type': 'application/json' },
    }),
  };
}

function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  return match ? match[1] : null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createRuntimeEntitlementDeps(
  env: { url?: string; serviceKey?: string },
  fetchImpl: FetchLike = fetch,
): EntitlementDeps {
  const { url, serviceKey } = env;
  if (!url || !serviceKey) throw new Error('entitlement_not_configured');
  return {
    async resolveUserId(token) {
      const res = await fetchImpl(`${url}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
      });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error(`auth_lookup_failed_${res.status}`);
      const body = await res.json();
      return typeof body?.id === 'string' && body.id ? body.id : null;
    },
    async authorize(userId, fn) {
      const res = await fetchImpl(`${url}/rest/v1/rpc/authorize_premium_request`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_function: fn,
          p_limit: PREMIUM_RATE_LIMIT.limit,
          p_window_seconds: PREMIUM_RATE_LIMIT.windowSeconds,
        }),
      });
      if (!res.ok) throw new Error(`entitlement_lookup_failed_${res.status}`);
      const decision = await res.json();
      if (typeof decision !== 'string' || !DECISIONS.has(decision)) throw new Error('entitlement_malformed');
      return decision as EntitlementDecision;
    },
  };
}

function defaultDeps(): EntitlementDeps {
  const env = (globalThis as unknown as { Deno: { env: { get(k: string): string | undefined } } }).Deno.env;
  return createRuntimeEntitlementDeps({ url: env.get('SUPABASE_URL'), serviceKey: env.get('SUPABASE_SERVICE_ROLE_KEY') });
}

export async function requirePremium(
  req: Request,
  fn: string,
  cors: Record<string, string>,
  deps?: EntitlementDeps,
): Promise<EntitlementResult> {
  const token = bearerToken(req);
  if (!token) return deny('unauthorized', cors);
  try {
    const resolved = deps ?? defaultDeps();
    const userId = await resolved.resolveUserId(token);
    if (!userId) return deny('unauthorized', cors);
    const decision = await resolved.authorize(userId, fn);
    if (decision !== 'ok') return deny(decision, cors);
    return { ok: true, userId };
  } catch (err) {
    console.error('entitlement check failed', fn, err instanceof Error ? err.message : 'unknown');
    return deny('unavailable', cors);
  }
}
