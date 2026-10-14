import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requirePremium } from "./entitlement.ts";
import { advise, corsHeaders, type ReserveResult } from "./handler.ts";
import { MAX_BODY_BYTES, MAX_OUTPUT_TOKENS, MODEL, PROVIDER_TIMEOUT_MS } from "./logic.ts";

const RESERVE_STATUSES = new Set(["reserved", "fn_limit", "global_limit", "disabled", "invalid"]);

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

  const access = await requirePremium(req, "business-advisor-v2", corsHeaders);
  if (!access.ok) return access.response;

  try {
    if (req.method !== "POST") return jsonError("method_not_allowed", 405);
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return jsonError("payload_too_large", 413);
    const rawBody = await req.text();
    const apiKey = Deno.env.get("LocalSEO_KEY");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    return await advise(access.userId, rawBody, {
      async loadContext(userId, businessId) {
        const { data: business, error } = await admin
          .from("businesses")
          .select("name, category, city, website, phone, schedule, target_audience, services, primary_goal, secondary_goals")
          .eq("id", businessId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error("business_lookup_failed");
        if (!business) return null;
        const [progress, actions, sources] = await Promise.all([
          admin.from("first_value_progress").select("manual_context").eq("user_id", userId)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          admin.from("business_actions").select("title, status").eq("business_id", businessId).eq("user_id", userId)
            .order("updated_at", { ascending: false }).limit(30),
          admin.from("connected_sources").select("source_type, status").eq("business_id", businessId).eq("user_id", userId)
            .limit(10),
        ]);
        return {
          business,
          manualContext: progress.error ? null : progress.data?.manual_context ?? null,
          actions: actions.error ? [] : actions.data ?? [],
          sources: sources.error ? [] : sources.data ?? [],
        };
      },
      async reserve(reservationId, userId, fn) {
        const { data, error } = await admin.rpc("reserve_ai_usage", {
          p_reservation_id: reservationId, p_user_id: userId, p_function: fn,
        });
        if (error || !data || typeof data.status !== "string" || !RESERVE_STATUSES.has(data.status)) {
          throw new Error("reserve_failed");
        }
        return data as ReserveResult;
      },
      async settle(reservationId, userId, outcome) {
        const { data, error } = await admin.rpc("settle_ai_usage", {
          p_reservation_id: reservationId, p_user_id: userId, p_outcome: outcome,
        });
        return !error && data === true;
      },
      async callModel(messages) {
        if (!apiKey) return { ok: false, retryable: false };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
        try {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: MODEL,
              temperature: 0.5,
              max_tokens: MAX_OUTPUT_TOKENS,
              response_format: { type: "json_object" },
              messages,
            }),
            signal: ctrl.signal,
          });
          if (!res.ok) return { ok: false, retryable: res.status === 429 || res.status >= 500 };
          const data = await res.json();
          const raw = data?.choices?.[0]?.message?.content;
          return typeof raw === "string" ? { ok: true, raw } : { ok: false, retryable: true };
        } catch {
          return { ok: false, retryable: true };
        } finally {
          clearTimeout(timer);
        }
      },
    });
  } catch (err: unknown) {
    console.error("business-advisor-v2 failed", err instanceof Error ? err.message : "unknown");
    return jsonError("unavailable", 503);
  }
});
