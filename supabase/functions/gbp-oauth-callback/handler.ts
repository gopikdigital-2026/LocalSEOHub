export interface ConsumedAttempt {
  sourceId: string;
  userId: string;
  businessId: string;
  attemptId: string;
  state: string;
}

export type ConsumeResult =
  | { result: "CONSUMED"; attempt: ConsumedAttempt }
  | { result: "EXPIRED" | "ALREADY_USED" | "NOT_FOUND" };

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export type CompleteResult = "COMPLETED" | "EXPIRED" | "SUPERSEDED" | "INVALID_INPUT";

export type TerminalStatus = "error" | "permissions_required" | "disconnected";

export interface CallbackDeps {
  env(name: string): string | undefined;
  // Single-use: moves the matching attempt to 'exchanging' and drops any previous credentials; throws on failure.
  consumeState(state: string): Promise<ConsumeResult>;
  ownsBusiness(userId: string, businessId: string): Promise<boolean>;
  // Stores the credentials and advances to select_location in one transaction, only for this exact attempt.
  completeAttempt(attempt: ConsumedAttempt, tokens: StoredTokens): Promise<CompleteResult>;
  // Terminal failure for this exact attempt; leaves no credentials behind.
  failAttempt(attempt: ConsumedAttempt, status: TerminalStatus, code: string): Promise<boolean>;
  fetch: typeof fetch;
  now?: () => Date;
}

const STATE_FORMAT = /^[0-9a-f]{64}$/;
// The database refuses expiries beyond 24 h; Google issues ~1 h tokens, so clamping only refreshes earlier.
const MAX_EXPIRES_IN_S = 3600;

export function classifyGoogleAuthError(error: string): { status: TerminalStatus; code: string } {
  switch (error) {
    case "access_denied":
      return { status: "disconnected", code: "GOOGLE_CONSENT_DENIED" };
    case "redirect_uri_mismatch":
      return { status: "error", code: "GOOGLE_REDIRECT_URI_MISMATCH" };
    case "invalid_client":
    case "unauthorized_client":
      return { status: "error", code: "GOOGLE_CLIENT_CONFIGURATION_FAILURE" };
    case "invalid_scope":
      return { status: "error", code: "GOOGLE_SCOPE_REJECTED" };
    default:
      return { status: "error", code: "GOOGLE_AUTHORIZATION_ERROR" };
  }
}

export function classifyTokenExchangeError(error: unknown): string {
  switch (error) {
    case "redirect_uri_mismatch":
      return "GOOGLE_REDIRECT_URI_MISMATCH";
    case "invalid_client":
    case "unauthorized_client":
      return "GOOGLE_CLIENT_CONFIGURATION_FAILURE";
    case "invalid_grant":
      return "OAUTH_CODE_INVALID";
    default:
      return "CODE_EXCHANGE_FAILED";
  }
}

export function classifyAccountDiscovery(status: number): { status: TerminalStatus; code: string } {
  if (status === 401 || status === 403) return { status: "permissions_required", code: "GBP_PERMISSION_DENIED" };
  if (status === 429) return { status: "error", code: "GBP_API_QUOTA_UNAVAILABLE" };
  return { status: "error", code: "ACCOUNT_DISCOVERY_FAILED" };
}

async function readErrorField(res: Response): Promise<unknown> {
  try {
    const body = await res.json();
    return body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  } catch {
    return null;
  }
}

export function createHandler(deps: CallbackDeps) {
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request): Promise<Response> {
    const siteUrl = deps.env("SITE_URL") || "https://localseohub.io";
    const frontendCallback = `${siteUrl}/oauth/google-business/callback`;
    const redirect = (query: string) =>
      new Response(null, { status: 302, headers: { Location: `${frontendCallback}?${query}` } });
    const redirectError = (code: string) => redirect(`error=${encodeURIComponent(code)}`);

    let attempt: ConsumedAttempt | null = null;

    async function terminate(status: TerminalStatus, code: string): Promise<Response> {
      if (attempt) {
        try {
          const ok = await deps.failAttempt(attempt, status, code);
          if (!ok) console.error("[gbp-oauth-callback] attempt termination not applied");
        } catch {
          console.error("[gbp-oauth-callback] attempt termination failed");
        }
      }
      console.warn("[gbp-oauth-callback] attempt ended:", code);
      return redirectError(code);
    }

    try {
      let code: string | null = null;
      let state: string | null = null;
      let googleError: string | null = null;

      if (req.method === "GET") {
        const url = new URL(req.url);
        code = url.searchParams.get("code");
        state = url.searchParams.get("state");
        googleError = url.searchParams.get("error");
      } else {
        try {
          const body = await req.json();
          code = typeof body?.code === "string" ? body.code : null;
          state = typeof body?.state === "string" ? body.state : null;
        } catch {
          return redirectError("INVALID_REQUEST");
        }
      }

      if (!state) {
        return googleError ? redirectError(classifyGoogleAuthError(googleError).code) : redirectError("MISSING_STATE");
      }
      if (!STATE_FORMAT.test(state)) return redirectError("ATTEMPT_NOT_FOUND");

      // Consuming the state is the only way to reach a row; a second use of the same state finds nothing.
      let consumed: ConsumeResult;
      try {
        consumed = await deps.consumeState(state);
      } catch {
        console.error("[gbp-oauth-callback] attempt lookup failed");
        return redirectError("ATTEMPT_LOOKUP_FAILED");
      }
      if (consumed.result === "EXPIRED") return redirectError("ATTEMPT_EXPIRED");
      if (consumed.result !== "CONSUMED") {
        if (consumed.result === "NOT_FOUND" && googleError) return redirectError(classifyGoogleAuthError(googleError).code);
        return redirectError("ATTEMPT_NOT_FOUND");
      }
      attempt = consumed.attempt;

      if (googleError) {
        const c = classifyGoogleAuthError(googleError);
        return terminate(c.status, c.code);
      }
      if (!code) return terminate("error", "MISSING_CODE");

      const clientId = deps.env("GOOGLE_CLIENT_ID");
      const clientSecret = deps.env("GOOGLE_CLIENT_SECRET");
      const redirectUri = deps.env("GOOGLE_REDIRECT_URI");
      if (!clientId || !clientSecret || !redirectUri) return terminate("error", "NOT_CONFIGURED");

      let owns = false;
      try {
        owns = await deps.ownsBusiness(attempt.userId, attempt.businessId);
      } catch {
        return terminate("error", "BUSINESS_LOOKUP_FAILED");
      }
      if (!owns) return terminate("error", "BUSINESS_NOT_FOUND");

      let tokenResponse: Response;
      try {
        tokenResponse = await deps.fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
      } catch {
        return terminate("error", "CODE_EXCHANGE_FAILED");
      }
      if (!tokenResponse.ok) {
        console.error("[gbp-oauth-callback] token exchange status:", tokenResponse.status);
        return terminate("error", classifyTokenExchangeError(await readErrorField(tokenResponse)));
      }

      const tokens = await tokenResponse.json().catch(() => null);
      // The previous credentials were dropped on consumption, so this authorization must be self-sufficient.
      if (typeof tokens?.access_token !== "string" || !tokens.access_token
        || typeof tokens?.refresh_token !== "string" || !tokens.refresh_token) {
        return terminate("error", "CODE_EXCHANGE_FAILED");
      }
      const accessToken: string = tokens.access_token;
      const refreshToken: string = tokens.refresh_token;
      const expiresIn = Math.min(Number(tokens.expires_in) > 0 ? Number(tokens.expires_in) : MAX_EXPIRES_IN_S, MAX_EXPIRES_IN_S);

      // Account discovery runs before anything is persisted, so its failure leaves nothing to clean up.
      let accountsResponse: Response;
      try {
        accountsResponse = await deps.fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        return terminate("error", "ACCOUNT_DISCOVERY_FAILED");
      }
      if (!accountsResponse.ok) {
        await accountsResponse.body?.cancel();
        console.error("[gbp-oauth-callback] accounts status:", accountsResponse.status);
        const c = classifyAccountDiscovery(accountsResponse.status);
        return terminate(c.status, c.code);
      }

      const accountsData = await accountsResponse.json().catch(() => null);
      const accounts = (Array.isArray(accountsData?.accounts) ? accountsData.accounts : [])
        .filter((a: { name?: unknown }) => typeof a?.name === "string")
        .map((a: { name: string; accountName?: unknown }) => ({
          id: a.name,
          name: typeof a.accountName === "string" && a.accountName ? a.accountName : a.name,
        }));
      if (accounts.length === 0) return terminate("error", "NO_GBP_ACCOUNTS");

      let completed: CompleteResult;
      try {
        completed = await deps.completeAttempt(attempt, {
          accessToken,
          refreshToken,
          expiresAt: new Date(now().getTime() + expiresIn * 1000).toISOString(),
        });
      } catch {
        return terminate("error", "CREDENTIAL_STORE_FAILED");
      }
      if (completed === "COMPLETED") {
        return redirect(`accounts=${encodeURIComponent(JSON.stringify(accounts))}`);
      }
      if (completed === "EXPIRED") {
        console.warn("[gbp-oauth-callback] attempt ended:", "ATTEMPT_EXPIRED");
        return redirectError("ATTEMPT_EXPIRED");
      }
      if (completed === "SUPERSEDED") {
        // Another flow owns the row now; it must not be touched.
        console.warn("[gbp-oauth-callback] attempt ended:", "ATTEMPT_SUPERSEDED");
        return redirectError("ATTEMPT_NOT_FOUND");
      }
      return terminate("error", "CREDENTIAL_STORE_FAILED");
    } catch {
      console.error("[gbp-oauth-callback] unhandled error");
      return terminate("error", "INTERNAL_ERROR");
    }
  };
}
