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
  async getOwnBusinessId(userId) {
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("business lookup failed");
    return data?.id ?? null;
  },
  async loadSource(userId, businessId) {
    const { data, error } = await supabaseAdmin
      .from("connected_sources")
      .select("id, status, metadata, updated_at")
      .eq("user_id", userId)
      .eq("business_id", businessId)
      .eq("source_type", "google_business")
      .maybeSingle();
    if (error) throw new Error("source lookup failed");
    return data;
  },
  async updateIfUnchanged(userId, row, patch) {
    const { data, error } = await supabaseAdmin
      .from("connected_sources")
      .update(patch)
      .eq("id", row.id)
      .eq("user_id", userId)
      .eq("source_type", "google_business")
      .eq("status", row.status)
      .eq("updated_at", row.updated_at)
      .select("id");
    return !error && Array.isArray(data) && data.length === 1;
  },
});

Deno.serve(handle);
