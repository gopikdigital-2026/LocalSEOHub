import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const handle = createHandler({
  env: (name) => Deno.env.get(name),
  async findAttempt(state) {
    const { data, error } = await supabaseAdmin
      .from("connected_sources")
      .select("id, user_id, business_id, metadata")
      .eq("source_type", "google_business")
      .eq("status", "connecting")
      .eq("metadata->>oauth_state", state)
      .maybeSingle();
    if (error) throw new Error("lookup failed");
    if (!data) return null;
    const startedAt = (data.metadata as Record<string, unknown> | null)?.oauth_started_at;
    return {
      id: data.id,
      userId: data.user_id,
      businessId: data.business_id,
      startedAt: typeof startedAt === "string" ? startedAt : null,
    };
  },
  async ownsBusiness(userId, businessId) {
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("business lookup failed");
    return !!data;
  },
  async storeCredentials(sourceId, tokens) {
    // Tokens go to Supabase Vault (encrypted at rest); a missing refresh token keeps the stored one.
    const { data, error } = await supabaseAdmin.rpc("gbp_store_credentials", {
      p_source_id: sourceId,
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_expires_at: tokens.expiresAt,
    });
    return !error && data === true;
  },
  async clearCredentials(sourceId) {
    await supabaseAdmin.rpc("gbp_clear_credentials", { p_source_id: sourceId });
  },
  async updateAttempt(sourceId, patch) {
    const { data, error } = await supabaseAdmin
      .from("connected_sources")
      .update(patch)
      .eq("id", sourceId)
      .eq("source_type", "google_business")
      .eq("status", "connecting")
      .select("id");
    return !error && Array.isArray(data) && data.length === 1;
  },
  fetch: (input, init) => fetch(input, init),
});

Deno.serve(handle);
