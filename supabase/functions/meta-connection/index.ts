import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  if (error) {
    console.error(`[meta-connection] ${fn} failed:`, error.code ?? "unknown");
    throw new Error("rpc failed");
  }
  return data;
}

const handle = createHandler({
  async getUserId(jwt) {
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async getOwnConnection(userId) {
    const { data: business, error: bErr } = await supabaseAdmin
      .from("businesses").select("id").eq("user_id", userId).maybeSingle();
    if (bErr) throw new Error("business lookup failed");
    if (!business) return null;
    const { data, error } = await supabaseAdmin
      .from("meta_connections")
      .select("id, status, available_pages, attempt_started_at, token_expires_at")
      .eq("user_id", userId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (error) throw new Error("connection lookup failed");
    if (!data) return null;
    const pages = Array.isArray(data.available_pages) ? data.available_pages : [];
    return {
      id: data.id,
      status: data.status,
      availablePages: pages
        .filter((p: { id?: unknown }) => typeof p?.id === "string")
        .map((p: { id: string; name?: unknown }) => ({ id: p.id, name: typeof p.name === "string" ? p.name : "" })),
      attemptStartedAt: data.attempt_started_at,
      tokenExpiresAt: data.token_expires_at,
    };
  },
  async completeAuthorization(userId, completionHash, bindingHash) {
    const data = await rpc("meta_complete_authorization", {
      p_user_id: userId, p_completion_hash: completionHash, p_binding_hash: bindingHash,
    });
    const row = Array.isArray(data) ? data[0] : data;
    return { result: row?.result ?? "unknown", pageCount: Number(row?.page_count ?? 0) };
  },
  async readToken(connectionId) {
    const data = await rpc("meta_read_token", { p_connection_id: connectionId });
    const row = Array.isArray(data) ? data[0] : data;
    return typeof row?.access_token === "string" && row.access_token ? row.access_token : null;
  },
  async finishPageSelection(s) {
    const data = await rpc("meta_finish_page_selection", {
      p_connection_id: s.connectionId,
      p_page_id: s.pageId,
      p_page_name: s.pageName,
      p_instagram_status: s.instagramStatus,
      p_instagram_id: s.instagramId,
      p_instagram_username: s.instagramUsername,
    });
    return data === true;
  },
  async failConnection(connectionId, status, code) {
    await rpc("meta_fail_connection", { p_connection_id: connectionId, p_status: status, p_code: code });
  },
  async cancelAttempt(connectionId) {
    return (await rpc("meta_cancel_attempt", { p_connection_id: connectionId })) === true;
  },
  async expireStaleAttempt(connectionId, staleBefore) {
    return (await rpc("meta_expire_stale_attempt", { p_connection_id: connectionId, p_stale_before: staleBefore })) === true;
  },
  async disconnect(connectionId, revocation) {
    await rpc("meta_disconnect", { p_connection_id: connectionId, p_revocation_status: revocation });
  },
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
