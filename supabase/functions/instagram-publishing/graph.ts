import { appSecretProof, GRAPH, log, mapMetaError, safeErrorLog, timed, type PublishErrorCode } from "./shared.ts";

export const CREATE_TIMEOUT_MS = 30_000;
export const PUBLISH_TIMEOUT_MS = 30_000;
export const READ_TIMEOUT_MS = 8_000;
export const POLL_MAX_CHECKS = 6;
export const POLL_INTERVAL_MS = 2_000;

type Fetch = typeof fetch;
const NUMERIC_ID = /^[0-9]{1,32}$/;
const PERMALINK = /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._/-]*$/;

interface Auth {
  token: string;
  appSecret: string;
  fetch?: Fetch;
}

async function form(auth: Auth, fields: Record<string, string>): Promise<URLSearchParams> {
  const body = new URLSearchParams(fields);
  body.set("appsecret_proof", await appSecretProof(auth.token, auth.appSecret));
  return body;
}

async function readUrl(auth: Auth, path: string, fields: string): Promise<string> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("appsecret_proof", await appSecretProof(auth.token, auth.appSecret));
  return url.toString();
}

export type PageTokenResult = { ok: true; token: string } | { ok: false; code: PublishErrorCode };

// Also proves the Page is still linked to the expected Instagram professional account.
export async function derivePageToken(p: { pageId: string; igUserId: string; userToken: string; appSecret: string; fetch?: Fetch }): Promise<PageTokenResult> {
  if (!NUMERIC_ID.test(p.pageId) || !NUMERIC_ID.test(p.igUserId)) return { ok: false, code: "CHANNEL_NOT_CONNECTED" };
  let res: Response;
  try {
    const url = await readUrl({ token: p.userToken, appSecret: p.appSecret }, p.pageId, "id,access_token,instagram_business_account");
    res = await timed(p.fetch ?? fetch, url, { headers: { Authorization: `Bearer ${p.userToken}` } }, READ_TIMEOUT_MS);
  } catch {
    return { ok: false, code: "META_TEMPORARY_ERROR" };
  }
  const body = await res.json().catch(() => null) as { id?: unknown; access_token?: unknown; instagram_business_account?: { id?: unknown } } | null;
  if (!res.ok) {
    const code = mapMetaError({ status: res.status, body });
    log({ stage: "page_token", ...safeErrorLog(body, code) });
    return { ok: false, code: code === "PUBLISH_OUTCOME_UNKNOWN" || code === "META_REJECTED" ? "META_TEMPORARY_ERROR" : code };
  }
  if (body?.id !== p.pageId || typeof body.access_token !== "string" || !body.access_token) return { ok: false, code: "PERMISSION_REQUIRED" };
  if (body.instagram_business_account?.id !== p.igUserId) return { ok: false, code: "CHANNEL_NOT_CONNECTED" };
  return { ok: true, token: body.access_token };
}

export type WriteOutcome =
  | { kind: "created"; id: string }
  | { kind: "failed"; code: PublishErrorCode }
  | { kind: "unknown" };

// One POST, never retried here. No answer, a 5xx or a malformed success is "unknown".
async function write(auth: Auth, path: string, fields: Record<string, string>, stage: string, timeoutMs: number): Promise<WriteOutcome> {
  let res: Response;
  try {
    res = await timed(auth.fetch ?? fetch, `${GRAPH}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: await form(auth, fields),
    }, timeoutMs);
  } catch {
    log({ stage, result: "PUBLISH_OUTCOME_UNKNOWN", transport: true });
    return { kind: "unknown" };
  }
  const body = await res.json().catch(() => null) as { id?: unknown } | null;
  if (res.ok) {
    if (typeof body?.id === "string" && NUMERIC_ID.test(body.id)) return { kind: "created", id: body.id };
    log({ stage, result: "PUBLISH_OUTCOME_UNKNOWN", malformed: true });
    return { kind: "unknown" };
  }
  const code = mapMetaError({ status: res.status, body });
  log({ stage, http: res.status, ...safeErrorLog(body, code) });
  if (code === "PUBLISH_OUTCOME_UNKNOWN" || res.status >= 500) return { kind: "unknown" };
  return { kind: "failed", code };
}

export function createContainer(p: Auth & { igUserId: string; imageUrl: string; caption: string; timeoutMs?: number }): Promise<WriteOutcome> {
  if (!NUMERIC_ID.test(p.igUserId) || !p.caption || !/^https:\/\//.test(p.imageUrl)) return Promise.resolve({ kind: "failed", code: "INTERNAL_ERROR" });
  return write(p, `${p.igUserId}/media`, { image_url: p.imageUrl, caption: p.caption }, "ig_container", p.timeoutMs ?? CREATE_TIMEOUT_MS);
}

export function publishContainer(p: Auth & { igUserId: string; containerId: string; timeoutMs?: number }): Promise<WriteOutcome> {
  if (!NUMERIC_ID.test(p.igUserId) || !NUMERIC_ID.test(p.containerId)) return Promise.resolve({ kind: "failed", code: "INTERNAL_ERROR" });
  return write(p, `${p.igUserId}/media_publish`, { creation_id: p.containerId }, "ig_media_publish", p.timeoutMs ?? PUBLISH_TIMEOUT_MS);
}

export type ContainerStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED" | "UNAVAILABLE";

export async function containerStatus(p: Auth & { containerId: string }): Promise<ContainerStatus> {
  if (!NUMERIC_ID.test(p.containerId)) return "UNAVAILABLE";
  try {
    const url = await readUrl(p, p.containerId, "status_code");
    const res = await timed(p.fetch ?? fetch, url, { headers: { Authorization: `Bearer ${p.token}` } }, READ_TIMEOUT_MS);
    const body = await res.json().catch(() => null) as { status_code?: unknown } | null;
    if (!res.ok) return "UNAVAILABLE";
    const s = body?.status_code;
    return s === "FINISHED" || s === "IN_PROGRESS" || s === "ERROR" || s === "EXPIRED" || s === "PUBLISHED" ? s : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

// Bounded: at most POLL_MAX_CHECKS reads. Stops on the first decisive status.
export async function waitForContainer(p: Auth & { containerId: string; sleep?: (ms: number) => Promise<void>; checks?: number }): Promise<ContainerStatus> {
  const sleep = p.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: ContainerStatus = "UNAVAILABLE";
  const checks = Math.min(p.checks ?? POLL_MAX_CHECKS, POLL_MAX_CHECKS);
  for (let k = 0; k < checks; k++) {
    if (k > 0) await sleep(POLL_INTERVAL_MS);
    last = await containerStatus(p);
    if (last !== "IN_PROGRESS" && last !== "UNAVAILABLE") return last;
  }
  return last;
}

export type ReadBack =
  | { verdict: "CONFIRMED"; permalink: string | null }
  | { verdict: "NOT_FOUND" | "TEMPORARY" | "AMBIGUOUS"; permalink: null };

export async function readBackMedia(p: Auth & { mediaId: string }): Promise<ReadBack> {
  if (!NUMERIC_ID.test(p.mediaId)) return { verdict: "AMBIGUOUS", permalink: null };
  let res: Response;
  try {
    const url = await readUrl(p, p.mediaId, "id,permalink");
    res = await timed(p.fetch ?? fetch, url, { headers: { Authorization: `Bearer ${p.token}` } }, READ_TIMEOUT_MS);
  } catch {
    return { verdict: "TEMPORARY", permalink: null };
  }
  const body = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (res.status === 404 || (body?.error as { code?: unknown } | undefined)?.code === 100) return { verdict: "NOT_FOUND", permalink: null };
  if (!res.ok) return { verdict: res.status >= 500 || res.status === 429 ? "TEMPORARY" : "AMBIGUOUS", permalink: null };
  if (body?.id !== p.mediaId) return { verdict: "AMBIGUOUS", permalink: null };
  const link = body.permalink;
  return { verdict: "CONFIRMED", permalink: typeof link === "string" && link.length <= 512 && PERMALINK.test(link) ? link : null };
}

export type RecentMatch = { verdict: "found"; mediaId: string; permalink: string | null } | { verdict: "inconclusive" };

// Read-only: looks for a post with exactly this caption published after the attempt started.
export async function findPublishedMedia(p: Auth & { igUserId: string; caption: string; since: string }): Promise<RecentMatch> {
  if (!NUMERIC_ID.test(p.igUserId)) return { verdict: "inconclusive" };
  const since = Date.parse(p.since);
  try {
    const url = new URL(await readUrl(p, `${p.igUserId}/media`, "id,caption,timestamp,permalink"));
    url.searchParams.set("limit", "25");
    const res = await timed(p.fetch ?? fetch, url.toString(), { headers: { Authorization: `Bearer ${p.token}` } }, READ_TIMEOUT_MS);
    const body = await res.json().catch(() => null) as { data?: unknown } | null;
    if (!res.ok || !Array.isArray(body?.data)) return { verdict: "inconclusive" };
    const matches = (body!.data as Record<string, unknown>[]).filter((m) =>
      typeof m?.id === "string" && NUMERIC_ID.test(m.id) && m.caption === p.caption
      && typeof m.timestamp === "string" && Date.parse(m.timestamp) >= since - 60_000);
    if (matches.length !== 1) return { verdict: "inconclusive" };
    const link = matches[0].permalink;
    return { verdict: "found", mediaId: matches[0].id as string, permalink: typeof link === "string" && link.length <= 512 && PERMALINK.test(link) ? link : null };
  } catch {
    return { verdict: "inconclusive" };
  }
}
