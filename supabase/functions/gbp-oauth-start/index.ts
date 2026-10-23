import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { attemptRow, createHandler } from "./handler.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const handle = createHandler({
  async getUserId(jwt) {
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async getOwnBusinessId(userId) {
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("business lookup failed");
    return data?.id ?? null;
  },
  async beginAttempt(attempt) {
    const { error } = await supabaseAdmin
      .from("connected_sources")
      .upsert(attemptRow(attempt), { onConflict: "user_id,business_id,source_type" });
    if (error) console.error("[gbp-oauth-start] upsert failed:", error.code ?? "unknown");
    return !error;
  },
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
