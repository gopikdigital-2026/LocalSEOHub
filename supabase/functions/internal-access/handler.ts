export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface InternalAccessDeps {
  getUserEmail(jwt: string): Promise<{ id: string; email: string | null } | null>;
  env(name: string): string | undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const normalize = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

// Fails closed: without a configured ADMIN_EMAIL nobody is an operator.
export function isOperatorEmail(email: string | null | undefined, adminEmail: string | undefined): boolean {
  const admin = normalize(adminEmail);
  return admin.length > 0 && normalize(email) === admin;
}

export function createHandler(deps: InternalAccessDeps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
    try {
      const auth = req.headers.get("Authorization");
      const jwt = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
      const user = jwt ? await deps.getUserEmail(jwt) : null;
      if (!user) return json({ allowed: false, code: "NOT_AUTHENTICATED" }, 401);
      if (!isOperatorEmail(user.email, deps.env("ADMIN_EMAIL"))) return json({ allowed: false, code: "FORBIDDEN" }, 403);
      return json({ allowed: true });
    } catch {
      console.error("[internal-access] unhandled error");
      return json({ allowed: false, code: "UNKNOWN_ERROR" }, 500);
    }
  };
}
