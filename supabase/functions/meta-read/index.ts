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
    console.error(`[meta-read] ${fn} failed:`, error.code ?? "unknown");
    throw new Error("rpc failed");
  }
  return data;
}

const handle = createHandler({
  async getUserId(jwt) {
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async getOwnConnectionId(userId) {
    const { data: business, error: bErr } = await supabaseAdmin
      .from("businesses").select("id").eq("user_id", userId).maybeSingle();
    if (bErr) throw new Error("business lookup failed");
    if (!business) return null;
    const { data, error } = await supabaseAdmin
      .from("meta_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (error) throw new Error("connection lookup failed");
    return data?.id ?? null;
  },
  async claim(connectionId, userId, cooldownSeconds) {
    const data = await rpc("meta_sync_claim", {
      p_connection_id: connectionId, p_user_id: userId, p_cooldown_seconds: cooldownSeconds,
    });
    const row = Array.isArray(data) ? data[0] : data;
    return {
      result: row?.result === "ok" || row?.result === "cooldown" ? row.result : "not_connected",
      pageId: typeof row?.page_id === "string" ? row.page_id : null,
      instagramStatus: typeof row?.instagram_status === "string" ? row.instagram_status : null,
      instagramAccountId: typeof row?.instagram_account_id === "string" ? row.instagram_account_id : null,
      tokenExpiresAt: typeof row?.token_expires_at === "string" ? row.token_expires_at : null,
    };
  },
  async readToken(connectionId) {
    const data = await rpc("meta_read_token", { p_connection_id: connectionId });
    const row = Array.isArray(data) ? data[0] : data;
    return typeof row?.access_token === "string" && row.access_token ? row.access_token : null;
  },
  async apply(p) {
    const data = await rpc("meta_sync_apply", {
      p_connection_id: p.connectionId,
      p_user_id: p.userId,
      p_platform: p.platform,
      p_account_id: p.accountId,
      p_status: p.status,
      p_error_code: p.errorCode,
      p_profile: p.profile,
      p_items: p.items,
      p_pages_fetched: p.pagesFetched,
    });
    return data === true;
  },
  async failConnection(connectionId, status, code) {
    await rpc("meta_fail_connection", { p_connection_id: connectionId, p_status: status, p_code: code });
  },
  env: (name) => Deno.env.get(name),
});

Deno.serve(handle);
