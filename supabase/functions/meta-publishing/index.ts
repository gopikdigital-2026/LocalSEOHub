import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler, type CapabilityRow, type ConsentBeginResult, type ConsentCompleteResult, type PreflightRow } from "./handler.ts";

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
  async beginConsent(b) {
    const { data, error } = await supabaseAdmin.rpc("meta_begin_publishing_consent", {
      p_user_id: b.userId,
      p_business_id: b.businessId,
      p_state_hash: b.stateHash,
      p_binding_hash: b.bindingHash,
      p_expires_at: b.expiresAt,
    });
    if (error) throw new Error("begin consent failed");
    return data as ConsentBeginResult;
  },
  async completeConsent(userId, completionHash, bindingHash) {
    const { data, error } = await supabaseAdmin.rpc("meta_complete_publishing_consent", {
      p_user_id: userId,
      p_completion_hash: completionHash,
      p_binding_hash: bindingHash,
    });
    if (error) throw new Error("complete consent failed");
    const row = Array.isArray(data) ? data[0] : data;
    return { result: (row?.result ?? "unknown") as ConsentCompleteResult, permissions: row?.permissions ?? [] };
  },
  async capabilities(userId, businessId) {
    const { data, error } = await supabaseAdmin.rpc("meta_publish_capabilities", {
      p_user_id: userId,
      p_business_id: businessId,
    });
    if (error) throw new Error("capabilities failed");
    return (Array.isArray(data) ? data : []) as CapabilityRow[];
  },
  async preflight(userId, publicationId, expectedVersion) {
    const { data, error } = await supabaseAdmin.rpc("publication_publish_preflight", {
      p_user_id: userId,
      p_publication_id: publicationId,
      p_expected_version: expectedVersion,
    });
    if (error) throw new Error("preflight failed");
    return (Array.isArray(data) ? data : []) as PreflightRow[];
  },
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
