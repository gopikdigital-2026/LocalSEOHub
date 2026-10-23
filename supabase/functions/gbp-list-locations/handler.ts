import {
  type GbpLocation,
  type ListLocationsError,
  isValidAccountId,
  makeError,
  mapGoogleError,
  normalizeLocations,
} from "./logic.ts";
import { type CredentialStore, ensureAccessToken } from "./gbpToken.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface SourceRow {
  id: string;
}

export interface HandlerDeps {
  getUserId(jwt: string): Promise<string | null>;
  loadSource(userId: string, businessId: string | null): Promise<{ row: SourceRow | null; failed: boolean }>;
  credentials(sourceId: string): CredentialStore;
  updateSource(userId: string, sourceId: string, patch: Record<string, unknown>): Promise<void>;
  fetch: typeof fetch;
  env(name: string): string | undefined;
  now?: () => number;
}

const MAX_PAGES = 10;
const MAX_ACCOUNTS = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type GoogleResult<T> = { ok: true; data: T } | { ok: false; error: ListLocationsError };

export function createHandler(deps: HandlerDeps) {
  const now = deps.now ?? Date.now;

  async function googleGet<T>(url: string, token: string): Promise<GoogleResult<T>> {
    const res = await deps.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { ok: false, error: mapGoogleError(res.status, await res.text()) };
    return { ok: true, data: (await res.json()) as T };
  }

  async function listAccounts(token: string): Promise<GoogleResult<string[]>> {
    const ids: string[] = [];
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
      url.searchParams.set("pageSize", "20");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const r = await googleGet<{ accounts?: { name?: unknown }[]; nextPageToken?: string }>(url.toString(), token);
      if (!r.ok) return r;
      for (const a of r.data.accounts ?? []) if (isValidAccountId(a?.name)) ids.push(a.name);
      pageToken = r.data.nextPageToken ?? "";
      if (!pageToken || ids.length >= MAX_ACCOUNTS) break;
    }
    return { ok: true, data: ids.slice(0, MAX_ACCOUNTS) };
  }

  async function listLocationsForAccount(accountId: string, token: string): Promise<GoogleResult<GbpLocation[]>> {
    const out: GbpLocation[] = [];
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations`);
      url.searchParams.set("readMask", "name,title,storefrontAddress");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const r = await googleGet<{ locations?: unknown[]; nextPageToken?: string }>(url.toString(), token);
      if (!r.ok) return r;
      out.push(...normalizeLocations(r.data, accountId));
      pageToken = r.data.nextPageToken ?? "";
      if (!pageToken) break;
    }
    return { ok: true, data: out };
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    try {
      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!jwt) return json(makeError("NOT_AUTHENTICATED"), 401);
      const userId = await deps.getUserId(jwt);
      if (!userId) return json(makeError("NOT_AUTHENTICATED"), 401);

      let body: { accountId?: unknown; businessId?: unknown } = {};
      if (req.method === "POST") {
        try {
          body = await req.json();
        } catch {
          body = {};
        }
      }
      if (body.accountId !== undefined && !isValidAccountId(body.accountId)) {
        return json(makeError("INVALID_REQUEST"), 400);
      }
      const businessId = typeof body.businessId === "string" && body.businessId ? body.businessId : null;

      const { row: source, failed } = await deps.loadSource(userId, businessId);
      if (failed) return json(makeError("INTERNAL_ERROR"), 500);
      if (!source) return json(makeError("NOT_CONNECTED"));

      const token = await ensureAccessToken(deps.credentials(source.id), {
        fetch: deps.fetch,
        clientId: deps.env("GOOGLE_CLIENT_ID"),
        clientSecret: deps.env("GOOGLE_CLIENT_SECRET"),
        now,
      });
      if (!token.ok) {
        if (token.code === "GBP_AUTH_EXPIRED") {
          await deps.updateSource(userId, source.id, {
            last_error: token.code,
            updated_at: new Date(now()).toISOString(),
          });
        }
        return json({ ...makeError(token.code), retryable: token.retryable });
      }
      const accessToken = token.accessToken;

      let accountIds: string[];
      if (isValidAccountId(body.accountId)) {
        accountIds = [body.accountId];
      } else {
        const acc = await listAccounts(accessToken);
        if (!acc.ok) return json(acc.error);
        accountIds = acc.data;
      }

      const locations: GbpLocation[] = [];
      let firstError: ListLocationsError | null = null;
      for (const accountId of accountIds) {
        const r = await listLocationsForAccount(accountId, accessToken);
        if (r.ok) locations.push(...r.data);
        else firstError ??= r.error;
      }

      if (firstError && locations.length === 0) {
        await deps.updateSource(userId, source.id, {
          last_error: firstError.code,
          updated_at: new Date(now()).toISOString(),
        });
        return json(firstError);
      }

      return json({ success: true, locations, accountsQueried: accountIds.length, partial: firstError !== null });
    } catch {
      console.error("[gbp-list-locations] unhandled error");
      return json(makeError("INTERNAL_ERROR"), 500);
    }
  };
}
