import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";
import { vaultCredentialStore } from "./gbpToken.ts";

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
      .select("id, status, metadata")
      .eq("user_id", userId)
      .eq("business_id", businessId)
      .eq("source_type", "google_business")
      .maybeSingle();
    if (error) throw new Error("source lookup failed");
    return data;
  },
  credentials: (sourceId) => vaultCredentialStore(supabaseAdmin, sourceId),
  async updateSource(userId, sourceId, patch) {
    const { data, error } = await supabaseAdmin
      .from("connected_sources")
      .update(patch)
      .eq("id", sourceId)
      .eq("user_id", userId)
      .eq("source_type", "google_business")
      .select("id");
    return !error && Array.isArray(data) && data.length === 1;
  },
  async upsertReviews(userId, businessId, row) {
    const { error } = await supabaseAdmin
      .from("connected_sources")
      .upsert(
        { ...row, user_id: userId, business_id: businessId, source_type: "reviews" },
        { onConflict: "user_id,business_id,source_type" },
      );
    return !error;
  },
  async addEvent(userId, sourceId, type, message, records = 0, errorCode) {
    await supabaseAdmin.from("source_sync_events").insert({
      user_id: userId,
      source_id: sourceId,
      source_type: "google_business",
      event_type: type,
      message,
      records_updated: records,
      error_details: errorCode ?? null,
    });
  },
  fetch: (input, init) => fetch(input, init),
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
