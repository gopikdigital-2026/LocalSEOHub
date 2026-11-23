import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";
import { vaultCredentialStore } from "./gbpToken.ts";
import { OWNED_BUSINESS_LOOKUP_LIMIT, ownedBusinessIds, resolveActiveBusiness } from "../activeBusiness.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const handle = createHandler({
  async getUserId(jwt) {
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async resolveSource(userId, businessId) {
    const { data: owned, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("user_id", userId)
      .limit(OWNED_BUSINESS_LOOKUP_LIMIT);
    if (businessError) return { kind: "failed" };
    const active = resolveActiveBusiness(ownedBusinessIds(owned), businessId);
    if (active.kind === "selection_required") return { kind: "selection_required" };
    if (active.kind !== "resolved") return { kind: "forbidden" };

    const { data: source, error } = await supabaseAdmin
      .from("connected_sources")
      .select("id")
      .eq("user_id", userId)
      .eq("business_id", active.businessId)
      .eq("source_type", "google_business")
      .maybeSingle();
    if (error) return { kind: "failed" };
    return source ? { kind: "found", sourceId: source.id } : { kind: "none" };
  },
  credentials: (sourceId) => vaultCredentialStore(supabaseAdmin, sourceId),
  async removeSource(userId, sourceId) {
    const { data: target } = await supabaseAdmin
      .from("connected_sources")
      .select("business_id")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    const { error: clearError } = await supabaseAdmin.rpc("gbp_clear_credentials", { p_source_id: sourceId });
    const { error: deleteError } = await supabaseAdmin
      .from("connected_sources")
      .delete()
      .eq("id", sourceId)
      .eq("user_id", userId);
    // The reviews link only exists through Google; the browser may not write it, so it is removed here,
    // scoped to the disconnected business so the owner's other businesses keep theirs.
    if (typeof target?.business_id === "string") {
      await supabaseAdmin
        .from("connected_sources")
        .delete()
        .eq("user_id", userId)
        .eq("business_id", target.business_id)
        .eq("source_type", "reviews");
    }
    return !clearError || !deleteError;
  },
  fetch: (input, init) => fetch(input, init),
});

Deno.serve(handle);
