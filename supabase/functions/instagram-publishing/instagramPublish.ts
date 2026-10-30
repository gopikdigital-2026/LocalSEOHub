import {
  corsHeaders, errorTraits, instagramReadModel, isPublishErrorCode, log, redact,
  type PreflightRow, type PublishErrorCode, type State,
} from "./shared.ts";
import { buildDerivative, orientedSize, planDerivative, probe, sourceIssue, type Codecs, type SourceMime } from "./derivative.ts";
import {
  createContainer, derivePageToken, findPublishedMedia, publishContainer, readBackMedia, waitForContainer, type ReadBack,
} from "./graph.ts";

export const INSTAGRAM_ACTIONS = new Set(["instagram_publish_status", "instagram_publish", "instagram_publish_verify"]);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 600;
export const ARMED_FLAG = "META_INSTAGRAM_REAL_PUBLISH_ARMED";
export const ARMED_USERS = "META_INSTAGRAM_REAL_PUBLISH_USER_IDS";
export const STALE_AFTER_MS = 2 * 60 * 1000;

export type Stage = "none" | "container_requested" | "container_created" | "publish_requested";

export interface BeginRow {
  result: string;
  attempt_id: string | null;
  draft_version: number | null;
  caption: string | null;
  image_path: string | null;
  image_mime: string | null;
  page_id: string | null;
  instagram_account_id: string | null;
}

export interface AttemptSummary {
  id: string;
  status: "publishing" | "succeeded" | "failed" | "unknown";
  externalStage: Stage;
  containerStored: boolean;
  startedAt: string;
}

export interface InstagramContext {
  pageId: string | null;
  igUserId: string | null;
  igUsername: string | null;
  permissions: string[];
  caption: string | null;
  version: number | null;
  draftUpdatedAt: string | null;
  image: { path: string; mime: string } | null;
  attempt: AttemptSummary | null;
}

export type ImageDownload = { ok: true; bytes: Uint8Array; contentType: string | null } | { ok: false; reason: "missing" | "too_large" };

export interface InstagramPublishDeps {
  getUserId(jwt: string): Promise<string | null>;
  preflight(userId: string, publicationId: string, expectedVersion: number): Promise<PreflightRow[]>;
  context(userId: string, publicationId: string): Promise<InstagramContext | null>;
  begin(userId: string, publicationId: string, expectedVersion: number): Promise<BeginRow>;
  advance(userId: string, attemptId: string, stage: Exclude<Stage, "none">, containerId: string | null): Promise<string>;
  finish(userId: string, attemptId: string, outcome: "succeeded" | "failed" | "unknown", metaObjectId: string | null, permalink: string | null, errorCode: string | null): Promise<string>;
  markStale(attemptId: string, staleBefore: string): Promise<boolean>;
  recordVerification(userId: string, attemptId: string, verdict: "found" | "absent" | "inconclusive", mediaId: string | null, permalink: string | null): Promise<string>;
  readUserToken(userId: string, pageId: string): Promise<string | null>;
  downloadImage(path: string, maxBytes: number): Promise<ImageDownload>;
  storeDerivative(path: string, bytes: Uint8Array): Promise<boolean>;
  signDerivative(path: string, ttlSeconds: number): Promise<string | null>;
  removeDerivative(path: string): Promise<void>;
  codecs: Codecs;
  env(name: string): string | undefined;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NUMERIC_ID = /^[0-9]{1,32}$/;
const ALLOWED_KEYS = new Set(["action", "publicationId", "expectedVersion", "retry"]);
const FAILED_CODES = new Set<PublishErrorCode>([
  "REAUTH_REQUIRED", "PERMISSION_REQUIRED", "CHANNEL_NOT_CONNECTED", "IMAGE_UNAVAILABLE",
  "IMAGE_UNSUPPORTED", "META_RATE_LIMITED", "META_TEMPORARY_ERROR", "META_REJECTED", "INTERNAL_ERROR",
]);
const REQUIRED = ["pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_content_publish"] as const;

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

// Returns the business id segment when the path belongs to this user and publication.
function originalPathOwner(userId: string, publicationId: string, path: string, mime: string): string | null {
  const m = path.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png)$/);
  return m && m[1] === userId && m[3] === publicationId && (m[4] === "jpg") === (mime === "image/jpeg") ? m[2] : null;
}

export const derivativePath = (userId: string, businessId: string, publicationId: string, attemptId: string) =>
  `${userId}/${businessId}/${publicationId}/${attemptId}.jpg`;

export function createInstagramPublishHandler(deps: InstagramPublishDeps) {
  const now = deps.now ?? Date.now;

  async function derivativeReadiness(image: InstagramContext["image"]) {
    if (!image || (image.mime !== "image/jpeg" && image.mime !== "image/png")) return { ready: false, reason: "image_unavailable" };
    const dl = await deps.downloadImage(image.path, MAX_IMAGE_BYTES);
    if (!dl.ok) return { ready: false, reason: dl.reason === "too_large" ? "source_too_large" : "image_unavailable" };
    if (!imageMatches(dl.bytes, image.mime)) return { ready: false, reason: "signature_mismatch" };
    const src = probe(dl.bytes, image.mime as SourceMime);
    if (!src) return { ready: false, reason: "unreadable_header" };
    const format = image.mime === "image/png" ? "PNG" : "JPEG";
    const issue = sourceIssue(src);
    const display = orientedSize(src.width, src.height, src.orientation);
    const plan = issue ? null : planDerivative(display.width, display.height);
    return {
      ready: !!plan,
      reason: issue ?? (plan ? null : "no_compliant_plan"),
      source_format: format,
      source_width: display.width,
      source_height: display.height,
      orientation: src.orientation,
      output_format: "JPEG",
      output_width: plan?.width ?? null,
      output_height: plan?.height ?? null,
      crop: plan?.mode ?? null,
    };
  }

  async function status(userId: string, publicationId: string, expectedVersion: number) {
    const ctx = await deps.context(userId, publicationId);
    if (!ctx) return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 404);
    const instagram = instagramReadModel(await deps.preflight(userId, publicationId, expectedVersion));
    return json({
      ok: true,
      armed: isArmed(deps.env, userId),
      instagram,
      account: { id: ctx.igUserId, username: ctx.igUsername, subtype_verified: false },
      permissions: Object.fromEntries(REQUIRED.map((p) => [p, ctx.permissions.includes(p)])),
      caption: ctx.caption,
      version: ctx.version,
      derivative: await derivativeReadiness(ctx.image),
      attempt: ctx.attempt
        ? { status: ctx.attempt.status, external_stage: ctx.attempt.externalStage, container_stored: ctx.attempt.containerStored }
        : null,
    });
  }

  async function publish(userId: string, publicationId: string, expectedVersion: number, retry: boolean) {
    if (!isArmed(deps.env, userId)) return json({ ok: false, code: "REAL_PUBLISH_DISABLED", state: "NOT_REQUESTED" }, 403);
    const row = instagramReadModel(await deps.preflight(userId, publicationId, expectedVersion));
    if (row.issue) return fail(row.issue, ISSUE_STATE[row.issue] ?? row.state);

    const lastFailed = row.state === "FAILED";
    if (retry !== lastFailed) return fail("INVALID_PUBLICATION_STATE", row.state, 400);
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
    let mediaSent = false;
    let derivative: string | null = null;

    const close = async (outcome: "succeeded" | "failed" | "unknown", objectId: string | null, permalink: string | null, code: PublishErrorCode | null) => {
      try {
        return (await deps.finish(userId, attemptId, outcome, objectId, permalink, code)) === "ok";
      } catch {
        return false;
      }
    };
    const failed = async (code: PublishErrorCode) => {
      const safe = FAILED_CODES.has(code) ? code : "INTERNAL_ERROR";
      return (await close("failed", null, null, safe)) ? fail(safe, "FAILED") : fail("INTERNAL_ERROR", "PUBLISHING", 500);
    };
    const unknown = async () => {
      await close("unknown", null, null, null);
      return fail("PUBLISH_OUTCOME_UNKNOWN", "UNKNOWN", 202);
    };
    const advance = async (stage: Exclude<Stage, "none">, containerId: string | null) => {
      try {
        return (await deps.advance(userId, attemptId, stage, containerId)) === "ok";
      } catch {
        return false;
      }
    };

    try {
      const pageId = begun.page_id ?? "";
      const igUserId = begun.instagram_account_id ?? "";
      const mime = begun.image_mime ?? "";
      const path = begun.image_path ?? "";
      const caption = begun.caption ?? "";
      if (!NUMERIC_ID.test(pageId) || !NUMERIC_ID.test(igUserId)) return await failed("CHANNEL_NOT_CONNECTED");
      if (!caption.trim()) return await failed("INTERNAL_ERROR");
      const businessId = (mime === "image/jpeg" || mime === "image/png") ? originalPathOwner(userId, publicationId, path, mime) : null;
      if (!businessId) return await failed("IMAGE_UNAVAILABLE");
      const appSecret = deps.env("META_APP_SECRET");
      if (!appSecret) return await failed("INTERNAL_ERROR");

      const userToken = await deps.readUserToken(userId, pageId);
      if (!userToken) return await failed("REAUTH_REQUIRED");
      const page = await derivePageToken({ pageId, igUserId, userToken, appSecret, fetch: deps.fetch });
      if (!page.ok) return await failed(page.code);
      const auth = { token: page.token, appSecret, fetch: deps.fetch };

      const image = await deps.downloadImage(path, MAX_IMAGE_BYTES);
      if (!image.ok) return await failed(image.reason === "too_large" ? "IMAGE_UNSUPPORTED" : "IMAGE_UNAVAILABLE");
      if (image.bytes.byteLength === 0 || !imageMatches(image.bytes, mime) || (image.contentType && image.contentType !== mime)) {
        return await failed("IMAGE_UNSUPPORTED");
      }
      const built = buildDerivative(image.bytes, mime as SourceMime, deps.codecs);
      if (!built.ok) {
        log({ stage: "derivative", result: "IMAGE_UNSUPPORTED", reason: built.reason });
        return await failed("IMAGE_UNSUPPORTED");
      }
      const target = derivativePath(userId, businessId, publicationId, attemptId);
      if (!(await deps.storeDerivative(target, built.bytes))) return await failed("INTERNAL_ERROR");
      derivative = target;
      const imageUrl = await deps.signDerivative(target, SIGNED_URL_TTL_SECONDS);
      if (!imageUrl) return await failed("INTERNAL_ERROR");

      // Write-ahead: the stage is persisted before each external write it describes.
      if (!(await advance("container_requested", null))) return await failed("INTERNAL_ERROR");
      mediaSent = true;
      const container = await createContainer({ ...auth, igUserId, imageUrl, caption });
      if (container.kind === "unknown") return await unknown();
      if (container.kind === "failed") return await failed(container.code);
      if (!(await advance("container_created", container.id))) return await unknown();

      const ready = await waitForContainer({ ...auth, containerId: container.id, sleep: deps.sleep });
      if (ready === "PUBLISHED") return await unknown();
      if (ready === "ERROR") return await failed("META_REJECTED");
      if (ready !== "FINISHED") return await failed("META_TEMPORARY_ERROR");

      if (!(await advance("publish_requested", null))) return await failed("INTERNAL_ERROR");
      const published = await publishContainer({ ...auth, igUserId, containerId: container.id });
      if (published.kind === "unknown") return await unknown();
      if (published.kind === "failed") return await failed(published.code);

      let verification: ReadBack["verdict"] = "AMBIGUOUS";
      let permalink: string | null = null;
      try {
        const read = await readBackMedia({ ...auth, mediaId: published.id });
        verification = read.verdict;
        permalink = read.permalink;
      } catch {
        verification = "TEMPORARY";
      }
      if (!(await close("succeeded", published.id, permalink, null))) return fail("PUBLISH_OUTCOME_UNKNOWN", "UNKNOWN", 202);
      return json({ ok: true, state: "SUCCEEDED", meta_object_id: published.id, permalink, verification });
    } catch (err) {
      log({ stage: "instagram_publish", error: redact(err instanceof Error ? err.message : "unknown") });
      return mediaSent ? await unknown() : await failed("INTERNAL_ERROR");
    } finally {
      if (derivative) await deps.removeDerivative(derivative).catch(() => undefined);
    }
  }

  // Resolves an UNKNOWN (or stale PUBLISHING) attempt. Before media_publish was requested no post can
  // exist, so "absent" is certain; afterwards only an exact read-only match may settle it.
  async function verify(userId: string, publicationId: string) {
    if (!isArmed(deps.env, userId)) return json({ ok: false, code: "REAL_PUBLISH_DISABLED", state: "NOT_REQUESTED" }, 403);
    const ctx = await deps.context(userId, publicationId);
    const attempt = ctx?.attempt;
    if (!ctx || !attempt) return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 404);
    if (attempt.status === "publishing") {
      const staleBefore = new Date(now() - STALE_AFTER_MS).toISOString();
      if (!(await deps.markStale(attempt.id, staleBefore))) return fail("PUBLISH_IN_PROGRESS", "PUBLISHING");
    } else if (attempt.status !== "unknown") {
      return fail("INVALID_PUBLICATION_STATE", attempt.status === "succeeded" ? "SUCCEEDED" : "FAILED", 409);
    }

    if (attempt.externalStage !== "publish_requested") {
      const r = await deps.recordVerification(userId, attempt.id, "absent", null, null);
      return r === "ok" ? json({ ok: true, state: "FAILED", verdict: "absent", retryable: true }) : fail("INTERNAL_ERROR", "UNKNOWN", 500);
    }

    const appSecret = deps.env("META_APP_SECRET");
    const userToken = ctx.pageId ? await deps.readUserToken(userId, ctx.pageId) : null;
    const page = appSecret && userToken && ctx.igUserId
      ? await derivePageToken({ pageId: ctx.pageId!, igUserId: ctx.igUserId, userToken, appSecret, fetch: deps.fetch })
      : null;
    const match = page?.ok && ctx.caption
      ? await findPublishedMedia({ token: page.token, appSecret: appSecret!, fetch: deps.fetch, igUserId: ctx.igUserId!, caption: ctx.caption, since: attempt.startedAt })
      : { verdict: "inconclusive" as const };
    if (match.verdict === "found") {
      const r = await deps.recordVerification(userId, attempt.id, "found", match.mediaId, match.permalink);
      return r === "ok"
        ? json({ ok: true, state: "SUCCEEDED", verdict: "found", meta_object_id: match.mediaId, permalink: match.permalink })
        : fail("INTERNAL_ERROR", "UNKNOWN", 500);
    }
    await deps.recordVerification(userId, attempt.id, "inconclusive", null, null);
    return fail("PUBLISH_OUTCOME_UNKNOWN", "UNKNOWN", 409);
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

      if (action === "instagram_publish_status") return await status(userId, publicationId, expectedVersion);
      if (action === "instagram_publish") return await publish(userId, publicationId, expectedVersion, retry === true);
      if (action === "instagram_publish_verify") return await verify(userId, publicationId);
      return fail("INVALID_PUBLICATION_STATE", "NOT_REQUESTED", 400);
    } catch (err) {
      log({ stage: "instagram", error: redact(err instanceof Error ? err.message : "unknown") });
      return fail("INTERNAL_ERROR", "NOT_REQUESTED", 500);
    }
  };
}
