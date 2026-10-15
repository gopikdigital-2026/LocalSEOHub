import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requirePremium } from "./entitlement.ts";
import { analyzeCompetitor, corsHeaders, RADAR_LIMITS } from "./handler.ts";
import type { NetDeps } from "./safeHttp.ts";

const netDeps: NetDeps = {
  resolve: (host, type) => Deno.resolveDns(host, type),
  connect: (ip, port) => Deno.connect({ hostname: ip, port, transport: "tcp" }),
  startTls: (conn, hostname) => Deno.startTls(conn as Deno.TcpConn, { hostname }),
  now: () => Date.now(),
};

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const access = await requirePremium(req, "competitor-radar-v2", corsHeaders);
  if (!access.ok) return access.response;

  try {
    if (req.method !== "POST") return jsonError("method_not_allowed", 405);
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > RADAR_LIMITS.MAX_BODY_BYTES) return jsonError("invalid_input", 422);
    const rawBody = await req.text();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    return await analyzeCompetitor(access.userId, rawBody, {
      async loadOwnTerms(userId, businessId) {
        const { data, error } = await admin
          .from("businesses")
          .select("city, services")
          .eq("id", businessId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error("business_lookup_failed");
        if (!data) return null;
        const services = Array.isArray(data.services) ? data.services.filter((s: unknown): s is string => typeof s === "string") : [];
        return { city: typeof data.city === "string" ? data.city : "", services };
      },
      net: netDeps,
    });
  } catch (err: unknown) {
    console.error("competitor-radar-v2 failed", err instanceof Error ? err.message : "unknown");
    return jsonError("unavailable", 503);
  }
});
