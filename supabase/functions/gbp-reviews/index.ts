import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requirePremium } from "./entitlement.ts";
import { ensureAccessToken, vaultCredentialStore } from "./gbpToken.ts";
import { corsHeaders, handle, type ReserveResult } from "./handler.ts";
import { MAX_BODY_BYTES, MAX_OUTPUT_TOKENS, MODEL, PROVIDER_TIMEOUT_MS, selectedLocation } from "./logic.ts";

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

  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return jsonError("payload_too_large", 413);
    const apiKey = Deno.env.get("LocalSEO_KEY");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    return await handle(req, {
      authorize: (r, fn) => requirePremium(r, fn, corsHeaders),
      async resolveSource(userId) {
        const { data: business, error } = await admin
          .from("businesses")
          .select("id, name, category, city, services, phone, website")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error("business_lookup_failed");
        if (!business) return { kind: "no_business" };
        const { data: source, error: sourceError } = await admin
          .from("connected_sources")
          .select("id, external_account_id, external_location_id")
          .eq("user_id", userId)
          .eq("business_id", business.id)
          .eq("source_type", "google_business")
          .neq("status", "disconnected")
          .maybeSingle();
        if (sourceError) throw new Error("source_lookup_failed");
        if (!source) return { kind: "not_connected" };
        const loc = selectedLocation(source.external_account_id, source.external_location_id);
        if (!loc) return { kind: "no_location" };
        return { kind: "found", sourceId: source.id, ...loc, business };
      },
      token: (sourceId) =>
        ensureAccessToken(vaultCredentialStore(admin, sourceId), {
          fetch: globalThis.fetch,
          clientId: Deno.env.get("GOOGLE_CLIENT_ID"),
          clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
        }),
      google: (url, accessToken) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
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
              temperature: 0.8,
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
      log(event, detail) {
        console.error(`[gbp-reviews] ${event}`, JSON.stringify(detail));
      },
    });
  } catch (err: unknown) {
    console.error("[gbp-reviews] failed", err instanceof Error ? err.message : "unknown");
    return jsonError("unavailable", 503);
  }
});
