import { corsHeaders, errorTraits, isPublishErrorCode, redact, toReadModel, type PreflightRow, type PublishErrorCode } from "./handler.ts";
import { derivePageToken, publishFacebookPhoto, readBackPermalink, type ReadBack } from "./facebookPhoto.ts";

export const FACEBOOK_ACTIONS = new Set(["facebook_publish_status", "facebook_publish"]);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ARMED_FLAG = "META_FACEBOOK_REAL_PUBLISH_ARMED";
export const ARMED_USERS = "META_FACEBOOK_REAL_PUBLISH_USER_IDS";

export interface BeginRow {
  result: string;
  attempt_id: string | null;
  draft_version: number | null;
  caption: string | null;
  image_path: string | null;
  image_mime: string | null;
  page_id: string | null;
}

export interface FacebookContext {
  pageId: string | null;
  pageName: string | null;
  permissions: string[];
  pageTasks: string[];
  caption: string | null;
  version: number | null;
  draftUpdatedAt: string | null;
}

export type ImageDownload = { ok: true; bytes: Uint8Array; contentType: string | null } | { ok: false; reason: "missing" | "too_large" };

export interface FacebookPublishDeps {
  getUserId(jwt: string): Promise<string | null>;
  preflight(userId: string, publicationId: string, expectedVersion: number): Promise<PreflightRow[]>;
  context(userId: string, publicationId: string): Promise<FacebookContext | null>;
  begin(userId: string, publicationId: string, expectedVersion: number): Promise<BeginRow>;
  finish(userId: string, attemptId: string, outcome: "succeeded" | "failed" | "unknown", metaObjectId: string | null, permalink: string | null, errorCode: string | null): Promise<string>;
  readUserToken(userId: string, pageId: string): Promise<string | null>;
  downloadImage(path: string, maxBytes: number): Promise<ImageDownload>;
  env(name: string): string | undefined;
  fetch?: typeof fetch;
}

export type State = "NOT_REQUESTED" | "PUBLISHING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE_ID = /^[0-9]{1,32}$/;
const ALLOWED_KEYS = new Set(["action", "publicationId", "expectedVersion", "retry"]);
const FAILED_CODES = new Set<PublishErrorCode>([
  "REAUTH_REQUIRED", "PERMISSION_REQUIRED", "CHANNEL_NOT_CONNECTED", "IMAGE_UNAVAILABLE",
  "IMAGE_UNSUPPORTED", "META_RATE_LIMITED", "META_TEMPORARY_ERROR", "META_REJECTED", "INTERNAL_ERROR",
]);
const REQUIRED = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"] as const;

const ISSUE_STATUS: Partial<Record<PublishErrorCode, number>> = {
  AUTH_REQUIRED: 401, PERMISSION_REQUIRED: 403, REAUTH_REQUIRED: 403, CHANNEL_NOT_CONNECTED: 409,
  VERSION_CONFLICT: 409, ALREADY_PUBLISHED: 409, PUBLISH_IN_PROGRESS: 409, PUBLISH_OUTCOME_UNKNOWN: 409,
  INVALID_PUBLICATION_STATE: 400, IMAGE_UNAVAILABLE: 422, IMAGE_UNSUPPORTED: 422,
};
const ISSUE_STATE: Partial<Record<PublishErrorCode, State>> = {
  ALREADY_PUBLISHED: "SUCCEEDED", PUBLISH_IN_PROGRESS: "PUBLISHING", PUBLISH_OUTCOME_UNKNOWN: "UNKNOWN",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const fail = (code: PublishErrorCode, state: State, status = ISSUE_STATUS[code] ?? 502) =>
  json({ ok: false, code, state, ...errorTraits(code) }, status);

export function isArmed(env: (name: string) => string | undefined, userId: string): boolean {
  if (env(ARMED_FLAG) !== "true") return false;
  const users = (env(ARMED_USERS) ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => UUID.test(s));
  return users.includes(userId.toLowerCase());
}

export function imageMatches(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length > 8 && sig.every((b, i) => bytes[i] === b);
  }
  return false;
}

function imagePathFor(userId: string, publicationId: string, path: string, mime: string): boolean {
  const m = path.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png)$/);
  return !!m && m[1] === userId && m[3] === publicationId && (m[4] === "jpg") === (mime === "image/jpeg");
}

export function createFacebookPublishHandler(deps: FacebookPublishDeps) {
  async function status(userId: string, publicationId: string, expectedVersion: number) {
    const ctx = await deps.context(userId, publicationId);
    if (!ctx) return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 404);
    const facebook = toReadModel(await deps.preflight(userId, publicationId, expectedVersion))[0];
    return json({
      ok: true,
      armed: isArmed(deps.env, userId),
      facebook,
      page: { id: ctx.pageId, name: ctx.pageName },
      permissions: Object.fromEntries(REQUIRED.map((p) => [p, ctx.permissions.includes(p)])),
      create_content: ctx.pageTasks.includes("CREATE_CONTENT"),
      caption: ctx.caption,
      version: ctx.version,
    });
  }

  async function publish(userId: string, publicationId: string, expectedVersion: number, retry: boolean) {
    if (!isArmed(deps.env, userId)) {
      return json({ ok: false, code: "REAL_PUBLISH_DISABLED", state: "NOT_REQUESTED" }, 403);
    }
    const row = toReadModel(await deps.preflight(userId, publicationId, expectedVersion))[0];
    const current = row.state as State;
    if (row.issue) return fail(row.issue, ISSUE_STATE[row.issue] ?? current);

    const lastFailed = row.state === "FAILED";
    if (retry !== lastFailed) return fail("INVALID_PUBLICATION_STATE", current, 400);
    if (lastFailed && row.last_attempt?.error_code === "META_REJECTED") {
      const ctx = await deps.context(userId, publicationId);
      const failedAt = Date.parse(row.last_attempt.updated_at ?? "");
      const savedAt = Date.parse(ctx?.draftUpdatedAt ?? "");
      if (!(savedAt > failedAt)) return fail("META_REJECTED", "FAILED", 409);
    }

    const begun = await deps.begin(userId, publicationId, expectedVersion);
    if (begun.result !== "OK" || !begun.attempt_id) {
      const code = isPublishErrorCode(begun.result) ? begun.result : "INTERNAL_ERROR";
      return fail(code, ISSUE_STATE[code] ?? "NOT_REQUESTED");
    }
    const attemptId = begun.attempt_id;
    let sent = false;

    const close = async (outcome: "succeeded" | "failed" | "unknown", objectId: string | null, permalink: string | null, code: PublishErrorCode | null) => {
      try {
        return (await deps.finish(userId, attemptId, outcome, objectId, permalink, code)) === "ok";
      } catch {
        return false;
      }
    };
    const failBeforeSend = async (code: PublishErrorCode) => {
      const safe = FAILED_CODES.has(code) ? code : "INTERNAL_ERROR";
      return (await close("failed", null, null, safe)) ? fail(safe, "FAILED") : fail("INTERNAL_ERROR", "PUBLISHING", 500);
    };
    const unknown = async () => {
      await close("unknown", null, null, null);
      return fail("PUBLISH_OUTCOME_UNKNOWN", "UNKNOWN", 202);
    };

    try {
      const pageId = begun.page_id ?? "";
      const mime = begun.image_mime ?? "";
      const path = begun.image_path ?? "";
      const caption = begun.caption ?? "";
      if (!PAGE_ID.test(pageId)) return await failBeforeSend("CHANNEL_NOT_CONNECTED");
      if (!caption.trim()) return await failBeforeSend("INTERNAL_ERROR");
      if ((mime !== "image/jpeg" && mime !== "image/png") || !imagePathFor(userId, publicationId, path, mime)) {
        return await failBeforeSend("IMAGE_UNAVAILABLE");
      }
      const appSecret = deps.env("META_APP_SECRET");
      if (!appSecret) return await failBeforeSend("INTERNAL_ERROR");

      const userToken = await deps.readUserToken(userId, pageId);
      if (!userToken) return await failBeforeSend("REAUTH_REQUIRED");
      const page = await derivePageToken({ pageId, userToken, appSecret, fetch: deps.fetch });
      if (!page.ok) return await failBeforeSend(page.code);

      const image = await deps.downloadImage(path, MAX_IMAGE_BYTES);
      if (!image.ok) return await failBeforeSend(image.reason === "too_large" ? "IMAGE_UNSUPPORTED" : "IMAGE_UNAVAILABLE");
      if (image.bytes.byteLength === 0 || image.bytes.byteLength > MAX_IMAGE_BYTES) return await failBeforeSend("IMAGE_UNSUPPORTED");
      if (!imageMatches(image.bytes, mime) || (image.contentType && image.contentType !== mime)) {
        return await failBeforeSend("IMAGE_UNSUPPORTED");
      }

      sent = true;
      const outcome = await publishFacebookPhoto({ pageId, pageToken: page.token, appSecret, bytes: image.bytes, mime, caption, fetch: deps.fetch });

      if (outcome.kind === "unknown") return await unknown();
      if (outcome.kind === "failed") {
        const code = FAILED_CODES.has(outcome.code) ? outcome.code : "META_REJECTED";
        return (await close("failed", null, null, code)) ? fail(code, "FAILED") : fail("INTERNAL_ERROR", "PUBLISHING", 500);
      }

      const objectId = outcome.postId ?? outcome.photoId;
      let verification: ReadBack["verdict"] = "AMBIGUOUS";
      let permalink: string | null = null;
      try {
        const read = await readBackPermalink({ objectId, pageToken: page.token, appSecret, fetch: deps.fetch });
        verification = read.verdict;
        permalink = read.permalink;
      } catch {
        verification = "TEMPORARY";
      }
      if (!(await close("succeeded", objectId, permalink, null))) {
        return fail("PUBLISH_OUTCOME_UNKNOWN", "UNKNOWN", 202);
      }
      return json({ ok: true, state: "SUCCEEDED", meta_object_id: objectId, permalink, verification });
    } catch (err) {
      console.error("[meta-publishing] facebook_publish:", redact(err instanceof Error ? err.message : "unknown"));
      return sent ? await unknown() : await failBeforeSend("INTERNAL_ERROR");
    }
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
    try {
      if (req.method !== "POST") return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 405);
      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return fail("AUTH_REQUIRED", "NOT_REQUESTED", 401);

      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      if (!body || Object.keys(body).some((k) => !ALLOWED_KEYS.has(k))) return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 400);
      const { action, publicationId, expectedVersion, retry } = body;
      if (typeof publicationId !== "string" || !UUID.test(publicationId)) return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 400);
      if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
        return fail("VERSION_CONFLICT", "NOT_REQUESTED");
      }
      if (retry !== undefined && typeof retry !== "boolean") return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 400);

      if (action === "facebook_publish_status") return await status(userId, publicationId, expectedVersion);
      if (action === "facebook_publish") return await publish(userId, publicationId, expectedVersion, retry === true);
      return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 400);
    } catch (err) {
      console.error("[meta-publishing] facebook:", redact(err instanceof Error ? err.message : "unknown"));
      return fail("INTERNAL_ERROR", "NOT_REQUESTED", 500);
    }
  };
}
