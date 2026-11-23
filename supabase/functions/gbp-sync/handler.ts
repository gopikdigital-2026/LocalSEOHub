import { type CredentialStore, ensureAccessToken } from "./gbpToken.ts";
import { ActiveBusinessError, BUSINESS_SELECTION_REQUIRED, parseRequestedBusinessId } from "../activeBusiness.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const FAILURE_MESSAGES: Record<string, string> = {
  NOT_CONNECTED: "No hay una autorizacion de Google activa. Pulsa Reintentar conexion.",
  NOT_CONFIGURED: "La integracion con Google no esta disponible ahora mismo.",
  GBP_AUTH_EXPIRED: "Google necesita que vuelvas a dar permiso. Pulsa Reintentar conexion.",
  GBP_PERMISSION_DENIED: "Tu cuenta de Google no tiene permiso para gestionar esta ficha.",
  GBP_API_UNAVAILABLE: "Google no esta disponible ahora mismo. Intentalo de nuevo mas tarde.",
  GBP_QUOTA_EXCEEDED: "Google ha limitado temporalmente las solicitudes. Intentalo en unos minutos.",
  GBP_API_QUOTA_UNAVAILABLE: "Google ha limitado temporalmente las solicitudes. Intentalo en unos minutos.",
  LOCATION_NOT_FOUND: "No encontramos esa ficha en tu cuenta de Google.",
  LOCATION_FETCH_FAILED: "No se pudo leer tu ficha de Google. Intentalo de nuevo.",
  LOCATION_INVALID_RESPONSE: "Google devolvio una respuesta no valida para tu ficha. Intentalo de nuevo.",
  PERSIST_FAILED: "No se pudo guardar la sincronizacion. Intentalo de nuevo.",
  SYNC_FAILED: "No se pudo sincronizar tu ficha de Google. Intentalo de nuevo.",
};

const PERMISSION_CODES = new Set(["GBP_AUTH_EXPIRED", "GBP_PERMISSION_DENIED"]);

export interface SourceRow {
  id: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

export type SyncEventType = "source_sync_started" | "source_sync_completed" | "source_sync_failed";

export interface SyncDeps {
  getUserId(jwt: string): Promise<string | null>;
  // Active business per the shared contract: null when the user has none, ActiveBusinessError when
  // the choice is ambiguous or not owned; throws on lookup failure.
  getOwnBusinessId(userId: string, requestedBusinessId: string | null): Promise<string | null>;
  // Only the caller's own google_business row for their own business; throws on lookup failure.
  loadSource(userId: string, businessId: string): Promise<SourceRow | null>;
  credentials(sourceId: string): CredentialStore;
  updateSource(userId: string, sourceId: string, patch: Record<string, unknown>): Promise<boolean>;
  upsertReviews(userId: string, businessId: string, row: Record<string, unknown>): Promise<boolean>;
  addEvent(userId: string, sourceId: string, type: SyncEventType, message: string, records?: number, errorCode?: string): Promise<void>;
  fetch: typeof fetch;
  env(name: string): string | undefined;
  now?: () => Date;
}

export function parseSelection(body: unknown):
  | { ok: true; accountId: string; locationId: string; locationName: string | null; businessId: string | null }
  | { ok: false } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const accountId = b.accountId;
  const rawLocation = b.locationId;
  const match = typeof rawLocation === "string"
    ? /^(?:accounts\/[A-Za-z0-9_-]{1,64}\/)?(locations\/[A-Za-z0-9_-]{1,64})$/.exec(rawLocation)
    : null;
  const locationId = match?.[1];
  if (typeof accountId !== "string" || !/^accounts\/[A-Za-z0-9_-]{1,64}$/.test(accountId)) return { ok: false };
  if (!locationId || locationId === "locations/default") return { ok: false };
  const locationName = typeof b.locationName === "string" && b.locationName.trim()
    ? b.locationName.trim().slice(0, 200)
    : null;
  const businessId = typeof b.businessId === "string" && b.businessId ? b.businessId : null;
  return { ok: true, accountId, locationId, locationName, businessId };
}

export function classifyLocationFetch(status: number): string {
  if (status === 401) return "GBP_AUTH_EXPIRED";
  if (status === 403) return "GBP_PERMISSION_DENIED";
  if (status === 404) return "LOCATION_NOT_FOUND";
  if (status === 429) return "GBP_API_QUOTA_UNAVAILABLE";
  return "LOCATION_FETCH_FAILED";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const optString = (v: unknown): v is string | null | undefined => v === undefined || v === null || typeof v === "string";
const optObject = (v: unknown): v is Json | null | undefined => v === undefined || v === null || isObject(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((l) => typeof l === "string");

async function readJson(res: Response): Promise<unknown> {
  try {
    return JSON.parse(await res.text());
  } catch {
    return undefined;
  }
}

/** Returns null unless the body is a Location resource for exactly the requested location. */
export function parseLocationProfile(body: unknown, locationId: string): Json | null {
  if (!isObject(body) || typeof body.name !== "string") return null;
  if (body.name !== locationId && !body.name.endsWith(`/${locationId}`)) return null;

  const { title, websiteUri, phoneNumbers, storefrontAddress, categories, regularHours } = body;
  if (!optString(title) || !optString(websiteUri)) return null;
  if (!optObject(phoneNumbers) || !optObject(storefrontAddress) || !optObject(categories) || !optObject(regularHours)) return null;

  const phone = phoneNumbers?.primaryPhone;
  const primaryCategory = categories?.primaryCategory;
  const periods = regularHours?.periods;
  const lines = storefrontAddress?.addressLines;
  if (!optString(phone) || !optObject(primaryCategory)) return null;
  const categoryName = primaryCategory?.displayName;
  if (!optString(categoryName)) return null;
  if (!(periods == null || Array.isArray(periods))) return null;
  if (!(lines == null || isStringArray(lines))) return null;

  const addressParts = storefrontAddress
    ? [lines?.join(", "), storefrontAddress.locality, storefrontAddress.administrativeArea, storefrontAddress.postalCode]
      .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : [];

  return {
    name: title || null,
    category: categoryName || null,
    address: addressParts.length ? addressParts.join(", ") : null,
    phone: phone || null,
    website: websiteUri || null,
    hours: periods ?? null,
  };
}

export type ReviewsResult =
  | { verified: true; count: number; averageRating: number | null }
  | { verified: false; code: string; status: "error" | "permissions_required" };

const reviewsFailure = (code: string): ReviewsResult => ({
  verified: false,
  code,
  status: code === "REVIEWS_PERMISSION_DENIED" ? "permissions_required" : "error",
});

function classifyReviewsFetch(status: number): string {
  if (status === 401 || status === 403) return "REVIEWS_PERMISSION_DENIED";
  if (status === 429) return "REVIEWS_QUOTA_UNAVAILABLE";
  return "REVIEWS_FETCH_FAILED";
}

/** A count is only trusted when Google returned it explicitly; zero is never inferred. */
export function parseReviewsSummary(body: unknown): ReviewsResult {
  if (!isObject(body)) return reviewsFailure("REVIEWS_INVALID_RESPONSE");
  const raw = body.totalReviewCount;
  const count = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) return reviewsFailure("REVIEWS_INVALID_RESPONSE");
  const rating = body.averageRating;
  const averageRating = count > 0 && typeof rating === "number" && Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null;
  return { verified: true, count, averageRating };
}

export function createHandler(deps: SyncDeps) {
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    let userId: string | null = null;
    try {
      userId = jwt ? await deps.getUserId(jwt) : null;
    } catch {
      userId = null;
    }
    if (!userId) return json({ success: false, code: "NOT_AUTHENTICATED", error: "Sesion no valida" }, 401);

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const sel = parseSelection(body);
    if (!sel.ok) return json({ success: false, code: "INVALID_LOCATION", error: "Ubicacion no valida" }, 400);
    const requested = parseRequestedBusinessId((body as Record<string, unknown>).businessId);
    if (!requested.ok) return json({ success: false, code: "FORBIDDEN", error: "Negocio no valido" }, 403);

    let businessId: string | null;
    let source: SourceRow | null;
    try {
      businessId = await deps.getOwnBusinessId(userId, requested.businessId);
      if (!businessId || (sel.businessId !== null && sel.businessId !== businessId)) {
        return json({ success: false, code: "FORBIDDEN", error: "Negocio no valido" }, 403);
      }
      source = await deps.loadSource(userId, businessId);
    } catch (e) {
      if (e instanceof ActiveBusinessError && e.kind === "selection_required") {
        return json({
          success: false,
          code: BUSINESS_SELECTION_REQUIRED,
          error: "Tienes varios negocios. Indica que negocio quieres sincronizar.",
        }, 409);
      }
      if (e instanceof ActiveBusinessError) {
        return json({ success: false, code: "FORBIDDEN", error: "Negocio no valido" }, 403);
      }
      return json({ success: false, code: "INTERNAL_ERROR", error: FAILURE_MESSAGES.SYNC_FAILED }, 500);
    }
    if (!source || source.status === "disconnected") {
      return json({ success: false, code: "NOT_CONNECTED", status: "disconnected", error: FAILURE_MESSAGES.NOT_CONNECTED }, 409);
    }

    const uid = userId;
    const sourceId = source.id;
    const ownerBusinessId = businessId;
    const authorizedAt = source.metadata?.authorized_at ?? null;
    const label = sel.locationName ?? sel.locationId;

    async function fail(code: string): Promise<Response> {
      const status = PERMISSION_CODES.has(code) ? "permissions_required" : "error";
      try {
        await deps.updateSource(uid, sourceId, {
          status,
          last_error: code,
          metadata: { phase: "failed", locationName: sel.ok ? sel.locationName : null, authorized_at: authorizedAt, failed_at: now().toISOString() },
          updated_at: now().toISOString(),
        });
        await deps.addEvent(uid, sourceId, "source_sync_failed", "No se pudo sincronizar la ficha de Google", 0, code);
      } catch {
        console.error("[gbp-sync] failure state write failed");
      }
      console.warn("[gbp-sync] sync ended:", code);
      return json({ success: false, code, status, error: FAILURE_MESSAGES[code] ?? FAILURE_MESSAGES.SYNC_FAILED });
    }

    try {
      const startedAt = now().toISOString();
      const syncing = await deps.updateSource(uid, sourceId, {
        status: "syncing",
        last_error: null,
        external_account_id: sel.accountId,
        external_location_id: sel.locationId,
        metadata: { phase: "syncing", locationName: sel.locationName, authorized_at: authorizedAt, sync_started_at: startedAt },
        updated_at: startedAt,
      });
      if (!syncing) return json({ success: false, code: "INTERNAL_ERROR", error: FAILURE_MESSAGES.SYNC_FAILED }, 500);
      await deps.addEvent(uid, sourceId, "source_sync_started", `Sincronizando ${label}`).catch(() => undefined);

      const token = await ensureAccessToken(deps.credentials(sourceId), {
        fetch: deps.fetch,
        clientId: deps.env("GOOGLE_CLIENT_ID"),
        clientSecret: deps.env("GOOGLE_CLIENT_SECRET"),
        now: () => now().getTime(),
      });
      if (!token.ok) return fail(token.code);

      let locationResponse: Response;
      try {
        locationResponse = await deps.fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${sel.locationId}?readMask=name,title,categories,storefrontAddress,phoneNumbers,websiteUri,regularHours,metadata`,
          { headers: { Authorization: `Bearer ${token.accessToken}` } },
        );
      } catch {
        return fail("LOCATION_FETCH_FAILED");
      }
      if (!locationResponse.ok) {
        await locationResponse.body?.cancel();
        console.error("[gbp-sync] location fetch status:", locationResponse.status);
        return fail(classifyLocationFetch(locationResponse.status));
      }
      const profile = parseLocationProfile(await readJson(locationResponse), sel.locationId);
      if (!profile) {
        console.error("[gbp-sync] location response rejected: not a matching Location resource");
        return fail("LOCATION_INVALID_RESPONSE");
      }
      const recordCount = Object.values(profile).filter(Boolean).length;

      // The profile alone proves the connection; reviews are verified independently.
      let reviews: ReviewsResult;
      try {
        const reviewsResponse = await deps.fetch(
          `https://mybusiness.googleapis.com/v4/${sel.accountId}/${sel.locationId}/reviews?pageSize=1`,
          { headers: { Authorization: `Bearer ${token.accessToken}` } },
        );
        if (reviewsResponse.ok) {
          reviews = parseReviewsSummary(await readJson(reviewsResponse));
        } else {
          await reviewsResponse.body?.cancel();
          console.error("[gbp-sync] reviews fetch status:", reviewsResponse.status);
          reviews = reviewsFailure(classifyReviewsFetch(reviewsResponse.status));
        }
      } catch {
        reviews = reviewsFailure("REVIEWS_FETCH_FAILED");
      }
      if (reviews.verified) {
        profile.totalReviews = reviews.count;
        profile.averageRating = reviews.averageRating;
      }
      const reviewCount = reviews.verified ? reviews.count : null;

      const syncedAt = now().toISOString();
      const connected = await deps.updateSource(uid, sourceId, {
        status: "connected",
        last_error: null,
        verified_profile: profile,
        verified_at: syncedAt,
        last_sync_at: syncedAt,
        metadata: { phase: "connected", locationName: sel.locationName ?? profile.name ?? null, authorized_at: authorizedAt, connected_at: syncedAt },
        updated_at: syncedAt,
      });
      if (!connected) return fail("PERSIST_FAILED");

      // Reviews only become available once Google itself has confirmed the profile above.
      // On failure the stored metadata is left untouched so a previously verified count is never overwritten.
      const reviewsOk = await deps.upsertReviews(uid, ownerBusinessId, reviews.verified
        ? {
          status: "connected",
          external_account_id: sel.accountId,
          external_location_id: sel.locationId,
          last_sync_at: syncedAt,
          last_error: null,
          metadata: { linkedToGBP: true, reviewCount: reviews.count },
          updated_at: syncedAt,
        }
        : {
          status: reviews.status,
          external_account_id: sel.accountId,
          external_location_id: sel.locationId,
          last_error: reviews.code,
          updated_at: syncedAt,
        });
      if (!reviewsOk) console.error("[gbp-sync] reviews link write failed");

      await deps.addEvent(uid, sourceId, "source_sync_completed", `${recordCount} datos importados`, recordCount).catch(() => undefined);

      return json({
        success: true,
        status: "connected",
        profile,
        recordCount,
        reviewCount,
        reviewsStatus: reviews.verified ? "connected" : reviews.status,
        verifiedAt: syncedAt,
      });
    } catch {
      console.error("[gbp-sync] unhandled error");
      return fail("SYNC_FAILED");
    }
  };
}
