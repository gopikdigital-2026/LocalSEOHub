import { mapMetaError, META_GRAPH_VERSION, safeErrorLog, type PublishErrorCode } from "./handler.ts";

export const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const PUBLISH_TIMEOUT_MS = 30_000;
export const READ_TIMEOUT_MS = 8_000;

type Fetch = typeof fetch;

const NUMERIC_ID = /^[0-9]{1,32}$/;
const POST_ID = /^[0-9]{1,32}_[0-9]{1,32}$/;
const PERMALINK = /^https:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9._/-]*$/;

export async function appSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function timed(doFetch: Fetch, url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await doFetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type PageTokenResult = { ok: true; token: string } | { ok: false; code: PublishErrorCode };

export async function derivePageToken(p: { pageId: string; userToken: string; appSecret: string; fetch?: Fetch }): Promise<PageTokenResult> {
  if (!NUMERIC_ID.test(p.pageId)) return { ok: false, code: "CHANNEL_NOT_CONNECTED" };
  const url = new URL(`${GRAPH}/${p.pageId}`);
  url.searchParams.set("fields", "id,access_token");
  url.searchParams.set("appsecret_proof", await appSecretProof(p.userToken, p.appSecret));
  let res: Response;
  try {
    res = await timed(p.fetch ?? fetch, url.toString(), { headers: { Authorization: `Bearer ${p.userToken}` } }, READ_TIMEOUT_MS);
  } catch {
    return { ok: false, code: "META_TEMPORARY_ERROR" };
  }
  const body = await res.json().catch(() => null) as { id?: unknown; access_token?: unknown } | null;
  if (!res.ok) {
    const code = mapMetaError({ status: res.status, body });
    console.log("[meta-publishing]", JSON.stringify({ stage: "page_token", ...safeErrorLog(body, code) }));
    return { ok: false, code: code === "PUBLISH_OUTCOME_UNKNOWN" || code === "META_REJECTED" ? "META_TEMPORARY_ERROR" : code };
  }
  // Meta must echo the bound Page; any other id means the token does not manage this Page.
  if (body?.id !== p.pageId || typeof body.access_token !== "string" || !body.access_token) {
    return { ok: false, code: "PERMISSION_REQUIRED" };
  }
  return { ok: true, token: body.access_token };
}

export type PhotoOutcome =
  | { kind: "succeeded"; photoId: string; postId: string | null }
  | { kind: "failed"; code: PublishErrorCode; sent: boolean }
  | { kind: "unknown" };

export interface PhotoInput {
  pageId: string;
  pageToken: string;
  appSecret: string;
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  caption: string;
  fetch?: Fetch;
  timeoutMs?: number;
}

// Single POST, never retried here. Anything that may have reached Meta without an explicit answer is "unknown".
export async function publishFacebookPhoto(p: PhotoInput): Promise<PhotoOutcome> {
  if (!NUMERIC_ID.test(p.pageId) || !p.pageToken || !p.caption || p.bytes.byteLength === 0) {
    return { kind: "failed", code: "INTERNAL_ERROR", sent: false };
  }
  const form = new FormData();
  form.append("source", new Blob([p.bytes], { type: p.mime }), p.mime === "image/png" ? "photo.png" : "photo.jpg");
  form.append("caption", p.caption);
  form.append("published", "true");
  form.append("appsecret_proof", await appSecretProof(p.pageToken, p.appSecret));

  let res: Response;
  try {
    res = await timed(p.fetch ?? fetch, `${GRAPH}/${p.pageId}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.pageToken}` },
      body: form,
    }, p.timeoutMs ?? PUBLISH_TIMEOUT_MS);
  } catch {
    console.log("[meta-publishing]", JSON.stringify({ stage: "facebook_photo", result: "PUBLISH_OUTCOME_UNKNOWN", transport: true }));
    return { kind: "unknown" };
  }

  const body = await res.json().catch(() => null) as { id?: unknown; post_id?: unknown } | null;
  if (res.ok) {
    if (typeof body?.id === "string" && NUMERIC_ID.test(body.id)) {
      const postId = typeof body.post_id === "string" && POST_ID.test(body.post_id) ? body.post_id : null;
      return { kind: "succeeded", photoId: body.id, postId };
    }
    console.log("[meta-publishing]", JSON.stringify({ stage: "facebook_photo", result: "PUBLISH_OUTCOME_UNKNOWN", malformed: true }));
    return { kind: "unknown" };
  }
  const code = mapMetaError({ status: res.status, body });
  console.log("[meta-publishing]", JSON.stringify({ stage: "facebook_photo", http: res.status, ...safeErrorLog(body, code) }));
  if (code === "PUBLISH_OUTCOME_UNKNOWN" || res.status >= 500) return { kind: "unknown" };
  return { kind: "failed", code, sent: true };
}

export type ReadBack =
  | { verdict: "CONFIRMED"; permalink: string | null }
  | { verdict: "NOT_FOUND" | "TEMPORARY" | "AMBIGUOUS"; permalink: null };

// Optional, after Meta already confirmed creation; its result never changes the creation outcome.
export async function readBackPermalink(p: { objectId: string; pageToken: string; appSecret: string; fetch?: Fetch }): Promise<ReadBack> {
  const isPost = POST_ID.test(p.objectId);
  if (!isPost && !NUMERIC_ID.test(p.objectId)) return { verdict: "AMBIGUOUS", permalink: null };
  const field = isPost ? "permalink_url" : "link";
  const url = new URL(`${GRAPH}/${p.objectId}`);
  url.searchParams.set("fields", `id,${field}`);
  url.searchParams.set("appsecret_proof", await appSecretProof(p.pageToken, p.appSecret));
  let res: Response;
  try {
    res = await timed(p.fetch ?? fetch, url.toString(), { headers: { Authorization: `Bearer ${p.pageToken}` } }, READ_TIMEOUT_MS);
  } catch {
    return { verdict: "TEMPORARY", permalink: null };
  }
  const body = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (res.status === 404 || (body?.error as { code?: unknown } | undefined)?.code === 100) return { verdict: "NOT_FOUND", permalink: null };
  if (!res.ok) return { verdict: res.status >= 500 || res.status === 429 ? "TEMPORARY" : "AMBIGUOUS", permalink: null };
  if (body?.id !== p.objectId) return { verdict: "AMBIGUOUS", permalink: null };
  const link = body[field];
  return { verdict: "CONFIRMED", permalink: typeof link === "string" && link.length <= 512 && PERMALINK.test(link) ? link : null };
}
