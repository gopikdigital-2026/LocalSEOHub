// GBP-02-FIX03B rollback variant. NOT DEPLOYED. Replaces gbp-oauth-callback only if FIX03B must be withdrawn:
// it never exchanges the code or stores credentials; it burns the state once and closes the attempt safely.
export type ConsumeResult =
  | { result: "CONSUMED"; attempt: { sourceId: string; userId: string; businessId: string; attemptId: string; state: string } }
  | { result: "EXPIRED" | "ALREADY_USED" | "NOT_FOUND" };

export interface SafeCloseDeps {
  env(name: string): string | undefined;
  consumeState(state: string): Promise<ConsumeResult>;
  failAttempt(attempt: Extract<ConsumeResult, { result: "CONSUMED" }>["attempt"], code: string): Promise<boolean>;
}

export const SAFE_CLOSE_CODE = "CONNECTION_TEMPORARILY_UNAVAILABLE";
const STATE_FORMAT = /^[0-9a-f]{64}$/;

export function createSafeCloseHandler(deps: SafeCloseDeps) {
  return async function handle(req: Request): Promise<Response> {
    const siteUrl = deps.env("SITE_URL") || "https://localseohub.io";
    const redirectError = (code: string) =>
      new Response(null, { status: 302, headers: { Location: `${siteUrl}/oauth/google-business/callback?error=${encodeURIComponent(code)}` } });

    const state = req.method === "GET" ? new URL(req.url).searchParams.get("state") : null;
    if (state && STATE_FORMAT.test(state)) {
      try {
        const consumed = await deps.consumeState(state);
        if (consumed.result === "CONSUMED" && !(await deps.failAttempt(consumed.attempt, SAFE_CLOSE_CODE))) {
          console.error("[gbp-oauth-callback] safe close not applied");
        }
      } catch {
        console.error("[gbp-oauth-callback] safe close failed");
      }
    }
    return redirectError(SAFE_CLOSE_CODE);
  };
}
