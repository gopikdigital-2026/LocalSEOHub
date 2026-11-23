import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";
import { vaultCredentialStore } from "./gbpToken.ts";
import { OWNED_BUSINESS_LOOKUP_LIMIT, businessIdOrThrow, ownedBusinessIds, resolveActiveBusiness } from "../activeBusiness.ts";

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
    const { data: businesses, error: businessError } = await supabaseAdmin
      .from("businesses").select("id").eq("user_id", userId).limit(OWNED_BUSINESS_LOOKUP_LIMIT);
    if (businessError) throw new Error("business lookup failed");
    const activeBusinessId = businessIdOrThrow(resolveActiveBusiness(ownedBusinessIds(businesses), businessId));
    if (!activeBusinessId) return { row: null, failed: false };
    const { data, error } = await supabaseAdmin
      .from("connected_sources")
      .select("id")
      .eq("user_id", userId)
      .eq("source_type", "google_business")
      .eq("business_id", activeBusinessId)
      .neq("status", "disconnected")
      .maybeSingle();
    return { row: data ?? null, failed: !!error };
  },
  credentials: (sourceId) => vaultCredentialStore(supabaseAdmin, sourceId),
  async updateSource(userId, sourceId, patch) {
    await supabaseAdmin.from("connected_sources").update(patch).eq("id", sourceId).eq("user_id", userId);
  },
  fetch: (input, init) => fetch(input, init),
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
