import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requirePremium } from "./entitlement.ts";
import { corsHeaders, generate, type Reservation } from "./handler.ts";
import { MAX_OUTPUT_TOKENS, MODEL, PROVIDER_TIMEOUT_MS } from "./logic.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const access = await requirePremium(req, "weekly-content", corsHeaders);
  if (!access.ok) return access.response;

  try {
    if (req.method !== "POST") throw new Error("method_not_allowed");
    const body = await req.json().catch(() => null);
    const apiKey = Deno.env.get("LocalSEO_KEY");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    return await generate(access.userId, body, {
      async loadBusiness(userId, businessId) {
        const { data, error } = await admin
          .from("businesses")
          .select("name, category, city, services, target_audience")
          .eq("id", businessId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error("business_lookup_failed");
        return data;
      },
      async reserve(userId, businessId, week, expected) {
        const { data, error } = await admin.rpc("reserve_weekly_content", {
          p_user_id: userId, p_business_id: businessId, p_week_start: week, p_expected_generations: expected,
        });
        if (error || !data || typeof data.status !== "string") throw new Error("reserve_failed");
        return data as Reservation;
      },
      async complete(id, userId, content, topic, lang) {
        const { data, error } = await admin.rpc("complete_weekly_content", {
          p_id: id, p_user_id: userId, p_content: content, p_topic: topic, p_lang: lang,
        });
        return !error && data === true;
      },
      async release(id, userId) {
        await admin.rpc("release_weekly_content", { p_id: id, p_user_id: userId });
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
      now: () => new Date(),
    });
  } catch (err: unknown) {
    console.error("weekly-content failed", err instanceof Error ? err.message : "unknown");
    return new Response(JSON.stringify({ error: "unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
