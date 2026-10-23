import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ALREADY_CONNECTED, createHandler } from "./handler.ts";

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
  async beginAttempt(a) {
    const { data, error } = await supabaseAdmin.rpc("meta_begin_attempt", {
      p_user_id: a.userId,
      p_business_id: a.businessId,
      p_state_hash: a.stateHash,
      p_binding_hash: a.bindingHash,
      p_expires_at: a.expiresAt,
    });
    if (error?.message?.includes("META_ALREADY_CONNECTED")) return ALREADY_CONNECTED;
    if (error) console.error("[meta-oauth-start] begin failed:", error.code ?? "unknown");
    return error ? null : (data as string | null);
  },
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
