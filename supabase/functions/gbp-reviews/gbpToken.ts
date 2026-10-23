// Shared GBP credential lifecycle. Byte-identical copies live in each GBP function folder.

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const REFRESH_MARGIN_MS = 60_000;

export type TokenErrorCode =
  | "NOT_CONNECTED"
  | "NOT_CONFIGURED"
  | "GBP_AUTH_EXPIRED"
  | "GBP_API_UNAVAILABLE"
  | "GBP_QUOTA_EXCEEDED";

export interface StoredCredentials {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
}

export interface CredentialStore {
  read(): Promise<StoredCredentials | null>;
  // A null refresh token keeps the one already stored.
  write(accessToken: string, refreshToken: string | null, expiresAt: string): Promise<boolean>;
}

export interface TokenDeps {
  fetch: typeof fetch;
  clientId: string | undefined;
  clientSecret: string | undefined;
  now?: () => number;
}

export type TokenResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; code: TokenErrorCode; retryable: boolean };

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export function tokenNeedsRefresh(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t - now < REFRESH_MARGIN_MS;
}

function fail(code: TokenErrorCode, retryable = false): TokenResult {
  return { ok: false, code, retryable };
}

// Google's body is inspected for the error keyword only; it is never returned or logged.
export function mapTokenEndpointError(status: number, body: string): TokenResult {
  const upper = body.toUpperCase();
  if (status === 429 || upper.includes("RATE_LIMIT") || upper.includes("RESOURCE_EXHAUSTED")) {
    return fail("GBP_QUOTA_EXCEEDED", true);
  }
  if (status === 400 || status === 401 || upper.includes("INVALID_GRANT")) return fail("GBP_AUTH_EXPIRED");
  return fail("GBP_API_UNAVAILABLE", status >= 500);
}

export async function ensureAccessToken(store: CredentialStore, deps: TokenDeps): Promise<TokenResult> {
  const now = deps.now ?? Date.now;
  const creds = await store.read();
  if (!creds || (!creds.accessToken && !creds.refreshToken)) return fail("NOT_CONNECTED");

  if (creds.accessToken && !tokenNeedsRefresh(creds.expiresAt, now())) {
    return { ok: true, accessToken: creds.accessToken, refreshed: false };
  }
  if (!creds.refreshToken) return fail("GBP_AUTH_EXPIRED");
  if (!deps.clientId || !deps.clientSecret) return fail("NOT_CONFIGURED");

  let res: Response;
  try {
    res = await deps.fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    return fail("GBP_API_UNAVAILABLE", true);
  }
  if (!res.ok) return mapTokenEndpointError(res.status, await res.text().catch(() => ""));

  const data = await res.json().catch(() => null);
  if (typeof data?.access_token !== "string" || !data.access_token) return fail("GBP_API_UNAVAILABLE", true);
  const expiresIn = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600;
  const expiresAt = new Date(now() + expiresIn * 1000).toISOString();
  const newRefresh = typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null;

  const saved = await store.write(data.access_token, newRefresh, expiresAt);
  if (!saved) return fail("NOT_CONNECTED");
  return { ok: true, accessToken: data.access_token, refreshed: true };
}

export async function revokeGoogleToken(token: string | null, fetchFn: typeof fetch): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetchFn(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

export function vaultCredentialStore(admin: RpcClient, sourceId: string): CredentialStore {
  return {
    async read() {
      const { data, error } = await admin.rpc("gbp_read_credentials", { p_source_id: sourceId });
      if (error || !Array.isArray(data) || data.length === 0) return null;
      const row = data[0] as { access_token: string | null; refresh_token: string | null; token_expires_at: string | null };
      return { accessToken: row.access_token, refreshToken: row.refresh_token, expiresAt: row.token_expires_at };
    },
    async write(accessToken, refreshToken, expiresAt) {
      const { data, error } = await admin.rpc("gbp_store_credentials", {
        p_source_id: sourceId,
        p_access_token: accessToken,
        p_refresh_token: refreshToken,
        p_expires_at: expiresAt,
      });
      return !error && data === true;
    },
  };
}
