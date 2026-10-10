import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requirePremium } from "./entitlement.ts";
import { analyze, corsHeaders } from "./handler.ts";
import type { NetDeps } from "./safeHttp.ts";

const netDeps: NetDeps = {
  resolve: (host, type) => Deno.resolveDns(host, type),
  connect: (ip, port) => Deno.connect({ hostname: ip, port, transport: "tcp" }),
  startTls: (conn, hostname) => Deno.startTls(conn as Deno.TcpConn, { hostname }),
  now: () => Date.now(),
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const access = await requirePremium(req, "analyze-website", corsHeaders);
  if (!access.ok) return access.response;

  try {
    const body = await req.json().catch(() => null);
    return await analyze(body?.url, netDeps);
  } catch (err) {
    console.error("analyze-website failed", err instanceof Error ? err.message : "unknown");
    return new Response(
      JSON.stringify({ error: "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
