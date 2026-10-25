import { normalizeImage } from "./normalize.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MIN_IMAGE_SIDE = 320;
export const MAX_IMAGE_SIDE = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000;

export type ImageMime = "image/jpeg" | "image/png";
export type MediaAction = "attach" | "replace" | "delete";

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}

export interface StoredImage extends ImageInfo {
  path: string;
  bytes: number;
}

export interface OwnedPublication {
  id: string;
  businessId: string;
  imagePath: string | null;
}

export interface MediaDeps {
  getUserId(jwt: string): Promise<string | null>;
  getOwnedPublication(userId: string, publicationId: string): Promise<OwnedPublication | null>;
  isBusinessOwned(userId: string, businessId: string): Promise<boolean>;
  putObject(path: string, bytes: Uint8Array, mime: ImageMime): Promise<boolean>;
  removeObject(path: string): Promise<boolean>;
  // Conditional write: succeeds only while the row still references expectedPath.
  setImage(publicationId: string, expectedPath: string | null, image: StoredImage, uploadedAt: string): Promise<boolean>;
  deletePublication(publicationId: string, expectedPath: string | null): Promise<boolean>;
  randomId?: () => string;
  now?: () => Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTIONS: readonly MediaAction[] = ["attach", "replace", "delete"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const fail = (code: string, status: number) => json({ ok: false, code }, status);

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function sniffMime(b: Uint8Array): ImageMime | null {
  if (b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 33) return null;
  if (u32(b, 8) !== 13 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  return { width: u32(b, 16), height: u32(b, 20) };
}

// Reads only marker headers; never decodes pixel data.
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    while (marker === 0xff && i + 2 < b.length) {
      i++;
      marker = b[i + 1];
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = u16(b, i + 2);
    if (len < 2) return null;
    if (JPEG_SOF.has(marker)) {
      if (i + 8 >= b.length || len < 7) return null;
      return { height: u16(b, i + 5), width: u16(b, i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

export type InspectResult =
  | { ok: true; image: ImageInfo }
  | { ok: false; code: "FILE_EMPTY" | "UNSUPPORTED_MEDIA_TYPE" | "IMAGE_UNREADABLE" | "IMAGE_DIMENSIONS_OUT_OF_RANGE" };

export function inspectImage(bytes: Uint8Array, declaredMime: string | null): InspectResult {
  if (bytes.length === 0) return { ok: false, code: "FILE_EMPTY" };
  const mime = sniffMime(bytes);
  const declared = (declaredMime ?? "").split(";")[0].trim().toLowerCase();
  if (!mime || declared !== mime) return { ok: false, code: "UNSUPPORTED_MEDIA_TYPE" };
  const size = mime === "image/png" ? pngSize(bytes) : jpegSize(bytes);
  if (!size) return { ok: false, code: "IMAGE_UNREADABLE" };
  const { width, height } = size;
  if (
    width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE ||
    width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    return { ok: false, code: "IMAGE_DIMENSIONS_OUT_OF_RANGE" };
  }
  return { ok: true, image: { mime, width, height } };
}

export function objectPath(userId: string, businessId: string, publicationId: string, randomId: string, mime: ImageMime): string {
  return `${userId}/${businessId}/${publicationId}/${randomId}.${mime === "image/png" ? "png" : "jpg"}`;
}

async function readLimited(req: Request, limit: number): Promise<Uint8Array | "too_large"> {
  const declared = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > limit) return "too_large";
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function createHandler(deps: MediaDeps) {
  const randomId = deps.randomId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date());

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
    if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

    try {
      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return fail("UNAUTHENTICATED", 401);

      const params = new URL(req.url).searchParams;
      const action = params.get("action") as MediaAction | null;
      const publicationId = (params.get("publication_id") ?? "").toLowerCase();
      if (!action || !ACTIONS.includes(action) || !UUID.test(publicationId)) return fail("INVALID_REQUEST", 400);

      const pub = await deps.getOwnedPublication(userId, publicationId);
      if (!pub || !(await deps.isBusinessOwned(userId, pub.businessId))) return fail("NOT_FOUND", 404);

      if (action === "delete") {
        if (!(await deps.deletePublication(pub.id, pub.imagePath))) return fail("CONFLICT", 409);
        if (pub.imagePath && !(await deps.removeObject(pub.imagePath))) {
          console.error("[publication-media] orphaned object after delete");
        }
        return json({ ok: true, deleted: true });
      }

      if (action === "attach" && pub.imagePath) return fail("IMAGE_ALREADY_ATTACHED", 409);
      if (action === "replace" && !pub.imagePath) return fail("NO_IMAGE_TO_REPLACE", 409);

      const body = await readLimited(req, MAX_IMAGE_BYTES);
      if (body === "too_large") return fail("FILE_TOO_LARGE", 413);
      const inspected = inspectImage(body, req.headers.get("Content-Type"));
      if (!inspected.ok) return fail(inspected.code, inspected.code === "UNSUPPORTED_MEDIA_TYPE" ? 415 : inspected.code === "FILE_EMPTY" ? 400 : 422);

      // Only the normalized bytes are ever stored; the raw upload never leaves memory.
      const normalized = normalizeImage(body, inspected.image.mime);
      if (!normalized.ok || normalized.width !== inspected.image.width || normalized.height !== inspected.image.height) {
        return fail("IMAGE_UNREADABLE", 422);
      }

      const id = randomId();
      if (!UUID.test(id)) return fail("UNKNOWN_ERROR", 500);
      const stored: StoredImage = {
        ...inspected.image,
        bytes: normalized.bytes.length,
        path: objectPath(userId, pub.businessId, pub.id, id, inspected.image.mime),
      };

      if (!(await deps.putObject(stored.path, normalized.bytes, stored.mime))) return fail("STORAGE_UNAVAILABLE", 503);

      const uploadedAt = now().toISOString();
      let saved = false;
      try {
        saved = await deps.setImage(pub.id, pub.imagePath, stored, uploadedAt);
      } finally {
        if (!saved && !(await deps.removeObject(stored.path))) {
          console.error("[publication-media] orphaned object after failed save");
        }
      }
      if (!saved) return fail("CONFLICT", 409);

      if (pub.imagePath && !(await deps.removeObject(pub.imagePath))) {
        console.error("[publication-media] orphaned object after replace");
      }

      return json({
        ok: true,
        publication: {
          id: pub.id,
          status: "image_ready",
          image: { mime: stored.mime, bytes: stored.bytes, width: stored.width, height: stored.height, uploadedAt },
        },
      });
    } catch {
      console.error("[publication-media] unhandled error");
      return fail("UNKNOWN_ERROR", 500);
    }
  };
}
