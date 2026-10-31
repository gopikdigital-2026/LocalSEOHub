import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import jpeg from "npm:jpeg-js@0.4.4";
import UPNG from "npm:upng-js@2.1.0";
import type { PreflightRow } from "./shared.ts";
import type { Codecs } from "./derivative.ts";
import { createInstagramPublishHandler, type AttemptSummary, type BeginRow, type Stage } from "./instagramPublish.ts";
import { createConnectionPreflightHandler, isConnectionPreflightRequest } from "./connectionPreflight.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ORIGINALS = "publication-images";
const DERIVATIVES = "instagram-derivatives";
const STAGES = new Set<Stage>(["none", "container_requested", "container_created", "publish_requested"]);
const STATUSES = new Set(["publishing", "succeeded", "failed", "unknown"]);

const codecs: Codecs = {
  decodeJpeg(bytes, maxMegapixels) {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: maxMegapixels, maxMemoryUsageInMB: 400 });
    return { width: img.width, height: img.height, data: img.data };
  },
  decodePng(bytes) {
    const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return { width: img.width, height: img.height, data: new Uint8Array(UPNG.toRGBA8(img)[0]) };
  },
  encodeJpeg(image, quality) {
    return new Uint8Array(jpeg.encode({ data: image.data, width: image.width, height: image.height }, quality).data);
  },
};

async function getUserId(jwt: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  return error || !data.user ? null : data.user.id;
}

const handle = createInstagramPublishHandler({
  getUserId,
  async preflight(userId, publicationId, expectedVersion) {
    const { data, error } = await supabaseAdmin.rpc("publication_publish_preflight", {
      p_user_id: userId,
      p_publication_id: publicationId,
      p_expected_version: expectedVersion,
    });
    if (error) throw new Error("preflight failed");
    return (Array.isArray(data) ? data : []) as PreflightRow[];
  },
  async context(userId, publicationId) {
    const { data: pub, error } = await supabaseAdmin
      .from("publications")
      .select("business_id, image_path, image_mime")
      .eq("id", publicationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("publication lookup failed");
    if (!pub) return null;
    const [draft, conn, attempt] = await Promise.all([
      supabaseAdmin.from("publication_drafts").select("instagram_text, version, updated_at")
        .eq("publication_id", publicationId).eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("meta_connections").select("page_id, instagram_account_id, instagram_username, granted_permissions")
        .eq("user_id", userId).eq("business_id", pub.business_id).maybeSingle(),
      supabaseAdmin.from("publication_publish_attempts").select("id, status, external_stage, meta_container_id, started_at")
        .eq("publication_id", publicationId).eq("user_id", userId).eq("channel", "instagram")
        .order("attempt_number", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (draft.error || conn.error || attempt.error) throw new Error("context lookup failed");
    const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const a = attempt.data;
    const summary: AttemptSummary | null = a && STATUSES.has(a.status) && STAGES.has(a.external_stage)
      ? { id: a.id, status: a.status, externalStage: a.external_stage, containerStored: a.meta_container_id !== null, startedAt: a.started_at }
      : null;
    return {
      pageId: conn.data?.page_id ?? null,
      igUserId: conn.data?.instagram_account_id ?? null,
      igUsername: conn.data?.instagram_username ?? null,
      permissions: list(conn.data?.granted_permissions),
      caption: draft.data?.instagram_text ?? null,
      version: typeof draft.data?.version === "number" ? draft.data.version : null,
      draftUpdatedAt: draft.data?.updated_at ?? null,
      image: pub.image_path && pub.image_mime ? { path: pub.image_path, mime: pub.image_mime } : null,
      attempt: summary,
    };
  },
  async begin(userId, publicationId, expectedVersion) {
    const { data, error } = await supabaseAdmin.rpc("publish_attempt_begin", {
      p_user_id: userId,
      p_publication_id: publicationId,
      p_channel: "instagram",
      p_expected_version: expectedVersion,
    });
    if (error) throw new Error("begin attempt failed");
    const row = (Array.isArray(data) ? data[0] : data) as BeginRow | undefined;
    return row ?? { result: "INTERNAL_ERROR", attempt_id: null, draft_version: null, caption: null, image_path: null, image_mime: null, page_id: null, instagram_account_id: null };
  },
  async advance(userId, attemptId, stage, containerId) {
    const { data, error } = await supabaseAdmin.rpc("publish_attempt_advance", {
      p_user_id: userId,
      p_attempt_id: attemptId,
      p_stage: stage,
      p_container_id: containerId,
    });
    if (error) throw new Error("advance attempt failed");
    return typeof data === "string" ? data : "error";
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
  async markStale(attemptId, staleBefore) {
    const { data, error } = await supabaseAdmin.rpc("publish_attempt_mark_stale", { p_attempt_id: attemptId, p_stale_before: staleBefore });
    return !error && data === true;
  },
  async recordVerification(userId, attemptId, verdict, mediaId, permalink) {
    const { data, error } = await supabaseAdmin.rpc("publish_attempt_record_verification", {
      p_user_id: userId,
      p_attempt_id: attemptId,
      p_verdict: verdict,
      p_meta_object_id: mediaId,
      p_permalink: permalink,
    });
    if (error) throw new Error("record verification failed");
    return typeof data === "string" ? data : "error";
  },
  async readUserToken(userId, pageId) {
    const { data: conn, error } = await supabaseAdmin
      .from("meta_connections")
      .select("id, page_id")
      .eq("user_id", userId)
      .eq("status", "connected")
      .eq("instagram_status", "connected")
      .eq("page_id", pageId)
      .maybeSingle();
    if (error || !conn) return null;
    const { data, error: tokenError } = await supabaseAdmin.rpc("meta_read_token", { p_connection_id: conn.id });
    if (tokenError) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return typeof row?.access_token === "string" && row.access_token ? row.access_token : null;
  },
  async downloadImage(path, maxBytes) {
    const { data, error } = await supabaseAdmin.storage.from(ORIGINALS).download(path);
    if (error || !data) return { ok: false, reason: "missing" };
    if (data.size > maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || null };
  },
  async storeDerivative(path, bytes) {
    const { error } = await supabaseAdmin.storage.from(DERIVATIVES).upload(path, new Blob([bytes], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "60",
    });
    return !error;
  },
  // Held in memory only: never persisted, logged or returned to the browser.
  async signDerivative(path, ttlSeconds) {
    const { data, error } = await supabaseAdmin.storage.from(DERIVATIVES).createSignedUrl(path, ttlSeconds);
    return error || !data?.signedUrl ? null : data.signedUrl;
  },
  async removeDerivative(path) {
    await supabaseAdmin.storage.from(DERIVATIVES).remove([path]);
  },
  codecs,
  env: (name) => Deno.env.get(name),
});

// Read-only: SELECTs and the Vault token reader only; no inserts, updates, uploads or Graph writes.
const connectionPreflight = createConnectionPreflightHandler({
  getUserId,
  async internalTestActive(userId) {
    const { data, error } = await supabaseAdmin.rpc("internal_test_entitlement_active", { p_user_id: userId });
    if (error) throw new Error("entitlement lookup failed");
    return data === true;
  },
  async connection(userId, publicationId) {
    const { data: pub, error } = await supabaseAdmin.from("publications").select("business_id")
      .eq("id", publicationId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error("publication lookup failed");
    if (!pub?.business_id) return { kind: "not_found" };
    const { data: biz, error: bizError } = await supabaseAdmin.from("businesses").select("id")
      .eq("id", pub.business_id).eq("user_id", userId).maybeSingle();
    if (bizError) throw new Error("business lookup failed");
    if (!biz) return { kind: "not_found" };
    const { data: conn, error: connError } = await supabaseAdmin.from("meta_connections")
      .select("id, page_id, instagram_account_id, instagram_username")
      .eq("user_id", userId).eq("business_id", biz.id).eq("status", "connected").eq("instagram_status", "connected")
      .maybeSingle();
    if (connError) throw new Error("connection lookup failed");
    if (!conn?.page_id || !conn.instagram_account_id) return { kind: "not_connected" };
    return { kind: "ok", connection: { id: conn.id, pageId: conn.page_id, igUserId: conn.instagram_account_id, igUsername: conn.instagram_username ?? null } };
  },
  async readToken(connectionId) {
    const { data, error } = await supabaseAdmin.rpc("meta_read_token", { p_connection_id: connectionId });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return typeof row?.access_token === "string" && row.access_token ? row.access_token : null;
  },
  env: (name) => Deno.env.get(name),
});

Deno.serve(async (req) => {
  if (await isConnectionPreflightRequest(req.clone())) return connectionPreflight(req);
  return handle(req);
});
