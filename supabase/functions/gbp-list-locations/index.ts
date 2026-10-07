import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const handle = createHandler({
  async getUserId(jwt) {
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async loadSource(userId, businessId) {
    let query = supabaseAdmin
      .from("connected_sources")
      .select("id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("user_id", userId)
      .eq("source_type", "google_business");
    if (businessId) query = query.eq("business_id", businessId);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(1);
    return { row: data?.[0] ?? null, failed: !!error };
  },
  async updateSource(userId, sourceId, patch) {
    await supabaseAdmin.from("connected_sources").update(patch).eq("id", sourceId).eq("user_id", userId);
  },
  fetch: (input, init) => fetch(input, init),
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
