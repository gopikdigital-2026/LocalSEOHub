export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Keep in sync with src/features/reality-engine/gbpStatus.ts.
export const AUTHORIZING_TIMEOUT_MS = 15 * 60 * 1000;
export const SELECTING_TIMEOUT_MS = 30 * 60 * 1000;
export const SYNCING_TIMEOUT_MS = 5 * 60 * 1000;

export const CANCEL_REASONS = new Set(["USER_CANCELLED", "NO_LOCATIONS", "LOCATIONS_UNAVAILABLE"]);

export interface AttemptRow {
  id: string;
  status: string;
  metadata: Record<string, unknown> | null;
  updated_at: string;
}

export interface RecoverDeps {
  getUserId(jwt: string): Promise<string | null>;
  // Throws on lookup failure.
  getOwnBusinessId(userId: string): Promise<string | null>;
  // The caller's own google_business row; throws on lookup failure.
  loadSource(userId: string, businessId: string): Promise<AttemptRow | null>;
  // Applies only if the row still has this status and updated_at (no race with a live attempt).
  updateIfUnchanged(userId: string, row: AttemptRow, patch: Record<string, unknown>): Promise<boolean>;
  now?: () => Date;
}

function ts(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Decides from server-side timestamps whether an in-flight attempt is abandoned, and what it becomes. */
export function staleTransition(row: AttemptRow, nowMs: number): { status: string; code: string } | null {
  const meta = row.metadata ?? {};
  const updated = ts(row.updated_at) ?? nowMs;
  if (row.status === "connecting") {
    if (meta.phase === "select_location") {
      const since = ts(meta.authorized_at) ?? updated;
      return nowMs - since > SELECTING_TIMEOUT_MS ? { status: "disconnected", code: "ATTEMPT_EXPIRED" } : null;
    }
    const since = ts(meta.oauth_started_at) ?? updated;
    return nowMs - since > AUTHORIZING_TIMEOUT_MS ? { status: "disconnected", code: "ATTEMPT_EXPIRED" } : null;
  }
  if (row.status === "syncing") {
    const since = ts(meta.sync_started_at) ?? updated;
    return nowMs - since > SYNCING_TIMEOUT_MS ? { status: "error", code: "SYNC_INTERRUPTED" } : null;
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createHandler(deps: RecoverDeps) {
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    try {
      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return json({ success: false, code: "NOT_AUTHENTICATED" }, 401);

      let body: Record<string, unknown> = {};
      try {
        const parsed = await req.json();
        if (parsed && typeof parsed === "object") body = parsed;
      } catch {
        body = {};
      }
      const action = body.action === "cancel" ? "cancel" : body.action === "recover" ? "recover" : null;
      if (!action) return json({ success: false, code: "INVALID_ACTION" }, 400);
      const requestedBusinessId = typeof body.businessId === "string" && body.businessId ? body.businessId : null;

      const businessId = await deps.getOwnBusinessId(userId);
      if (!businessId || (requestedBusinessId !== null && requestedBusinessId !== businessId)) {
        return json({ success: false, code: "FORBIDDEN" }, 403);
      }

      const row = await deps.loadSource(userId, businessId);
      if (!row) return json({ success: true, recovered: false, status: null });

      let next: { status: string; code: string } | null;
      if (action === "cancel") {
        const reason = typeof body.reason === "string" && CANCEL_REASONS.has(body.reason) ? body.reason : "USER_CANCELLED";
        // Only an attempt that has not reached a sync can be abandoned; a connected profile is never touched here.
        next = row.status === "connecting" ? { status: "disconnected", code: reason } : null;
      } else {
        next = staleTransition(row, now().getTime());
      }
      if (!next) return json({ success: true, recovered: false, status: row.status });

      const at = now().toISOString();
      const applied = await deps.updateIfUnchanged(userId, row, {
        status: next.status,
        last_error: next.code,
        metadata: { phase: next.status === "disconnected" ? "ended" : "failed", ended_at: at },
        updated_at: at,
      });
      if (!applied) return json({ success: true, recovered: false, status: row.status, changed: true });
      console.info("[gbp-recover-attempt] attempt ended:", next.code);
      return json({ success: true, recovered: true, status: next.status, code: next.code });
    } catch {
      console.error("[gbp-recover-attempt] unhandled error");
      return json({ success: false, code: "INTERNAL_ERROR" }, 500);
    }
  };
}
