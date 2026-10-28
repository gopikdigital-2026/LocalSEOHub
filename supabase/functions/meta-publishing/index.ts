import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler, type CapabilityRow, type ConsentBeginResult, type ConsentCompleteResult, type PreflightRow } from "./handler.ts";
import { createFacebookPublishHandler, FACEBOOK_ACTIONS, type BeginRow } from "./facebookPublish.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function getUserId(jwt: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  return error || !data.user ? null : data.user.id;
}

async function preflight(userId: string, publicationId: string, expectedVersion: number) {
  const { data, error } = await supabaseAdmin.rpc("publication_publish_preflight", {
    p_user_id: userId,
    p_publication_id: publicationId,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error("preflight failed");
  return (Array.isArray(data) ? data : []) as PreflightRow[];
}

const env = (name: string) => Deno.env.get(name);

const handle = createHandler({
  getUserId,
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
  preflight,
  env,
});

const handleFacebook = createFacebookPublishHandler({
  getUserId,
  preflight,
  async context(userId, publicationId) {
    const { data: pub, error } = await supabaseAdmin
      .from("publications")
      .select("business_id")
      .eq("id", publicationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("publication lookup failed");
    if (!pub) return null;
    const [draft, conn] = await Promise.all([
      supabaseAdmin.from("publication_drafts").select("facebook_text, version, updated_at")
        .eq("publication_id", publicationId).eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("meta_connections").select("page_id, page_name, granted_permissions, page_tasks")
        .eq("user_id", userId).eq("business_id", pub.business_id).maybeSingle(),
    ]);
    if (draft.error || conn.error) throw new Error("context lookup failed");
    const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return {
      pageId: conn.data?.page_id ?? null,
      pageName: conn.data?.page_name ?? null,
      permissions: list(conn.data?.granted_permissions),
      pageTasks: list(conn.data?.page_tasks),
      caption: draft.data?.facebook_text ?? null,
      version: typeof draft.data?.version === "number" ? draft.data.version : null,
      draftUpdatedAt: draft.data?.updated_at ?? null,
    };
  },
  async begin(userId, publicationId, expectedVersion) {
    const { data, error } = await supabaseAdmin.rpc("publish_attempt_begin", {
      p_user_id: userId,
      p_publication_id: publicationId,
      p_channel: "facebook",
      p_expected_version: expectedVersion,
    });
    if (error) throw new Error("begin attempt failed");
    const row = (Array.isArray(data) ? data[0] : data) as BeginRow | undefined;
    return row ?? { result: "INTERNAL_ERROR", attempt_id: null, draft_version: null, caption: null, image_path: null, image_mime: null, page_id: null };
  },
  async finish(userId, attemptId, outcome, metaObjectId, permalink, errorCode) {
    const { data, error } = await supabaseAdmin.rpc("publish_attempt_finish", {
      p_user_id: userId,
      p_attempt_id: attemptId,
      p_outcome: outcome,
      p_meta_object_id: metaObjectId,
      p_permalink: permalink,
      p_error_code: errorCode,
    });
    if (error) throw new Error("finish attempt failed");
    return typeof data === "string" ? data : "error";
  },
  async readUserToken(userId, pageId) {
    const { data: conn, error } = await supabaseAdmin
      .from("meta_connections")
      .select("id, page_id")
      .eq("user_id", userId)
      .eq("status", "connected")
      .eq("page_id", pageId)
      .maybeSingle();
    if (error || !conn) return null;
    const { data, error: tokenError } = await supabaseAdmin.rpc("meta_read_token", { p_connection_id: conn.id });
    if (tokenError) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return typeof row?.access_token === "string" && row.access_token ? row.access_token : null;
  },
  async downloadImage(path, maxBytes) {
    const { data, error } = await supabaseAdmin.storage.from("publication-images").download(path);
    if (error || !data) return { ok: false, reason: "missing" };
    if (data.size > maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || null };
  },
  env,
});

async function route(req: Request): Promise<Response> {
  if (req.method === "POST") {
    const peek = await req.clone().json().catch(() => null) as { action?: unknown } | null;
    if (typeof peek?.action === "string" && FACEBOOK_ACTIONS.has(peek.action)) return handleFacebook(req);
  }
  return handle(req);
}

Deno.serve(route);
