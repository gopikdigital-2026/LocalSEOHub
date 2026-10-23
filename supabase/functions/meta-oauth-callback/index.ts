import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const handle = createHandler({
  async consumeState(stateHash) {
    const { data, error } = await supabaseAdmin.rpc("meta_consume_oauth_state", { p_state_hash: stateHash });
    if (error) throw new Error("consume failed");
    const row = Array.isArray(data) ? data[0] : data;
    return { result: row?.result ?? "unknown", connectionId: row?.connection_id ?? null };
  },
  async failConnection(connectionId, status, code) {
    const { error } = await supabaseAdmin.rpc("meta_fail_connection", {
      p_connection_id: connectionId,
      p_status: status,
      p_code: code,
    });
    if (error) throw new Error("fail write failed");
  },
  async storeAuthorization(a) {
    const { data, error } = await supabaseAdmin.rpc("meta_store_authorization", {
      p_connection_id: a.connectionId,
      p_state_hash: a.stateHash,
      p_access_token: a.accessToken,
      p_expires_at: a.expiresAt,
      p_meta_user_id: a.metaUserId,
      p_permissions: a.permissions,
      p_pages: a.pages,
      p_completion_hash: a.completionHash,
      p_completion_expires_at: a.completionExpiresAt,
    });
    if (error) console.error("[meta-oauth-callback] store failed:", error.code ?? "unknown");
    return !error && data === true;
  },
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
