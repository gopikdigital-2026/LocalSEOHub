// Active-business contract shared by the GBP edge functions and the browser business context.
// Pure module: no Deno or browser APIs, so both runtimes can import it.

// Shape check only; ownership against the authenticated user is what authorises an id.
const BUSINESS_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Upper bound for owned-business lookups; above the per-user database limit so ambiguity is always detected. */
export const OWNED_BUSINESS_LOOKUP_LIMIT = 6;

export const BUSINESS_SELECTION_REQUIRED = "BUSINESS_SELECTION_REQUIRED";

export type RequestedBusiness = { ok: true; businessId: string | null } | { ok: false };

export type ActiveBusinessResolution =
  | { kind: "resolved"; businessId: string }
  | { kind: "no_business" }
  | { kind: "selection_required" }
  | { kind: "forbidden" };

/** Absent or null means "no explicit choice"; anything else must be a well-formed identifier. */
export function parseRequestedBusinessId(raw: unknown): RequestedBusiness {
  if (raw === undefined || raw === null) return { ok: true, businessId: null };
  if (typeof raw !== "string" || !BUSINESS_ID_RE.test(raw)) return { ok: false };
  return { ok: true, businessId: raw };
}

/** Keeps only well-formed, distinct ids from an owner-filtered lookup. */
export function ownedBusinessIds(rows: unknown): string[] {
  if (!Array.isArray(rows)) throw new Error("business lookup returned no list");
  const ids = rows
    .map((r) => (r && typeof r === "object" ? (r as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === "string" && BUSINESS_ID_RE.test(id));
  return [...new Set(ids)];
}

/**
 * `ownedIds` must come from a server-side lookup filtered by the authenticated user.
 * An explicit id is only honoured if it is one of them; nonexistent and foreign ids are indistinguishable.
 * Without an explicit id, a single business resolves and several require a selection — never the first one.
 */
export function resolveActiveBusiness(ownedIds: readonly string[], requested: string | null): ActiveBusinessResolution {
  if (requested !== null) {
    return ownedIds.includes(requested) ? { kind: "resolved", businessId: requested } : { kind: "forbidden" };
  }
  if (ownedIds.length === 0) return { kind: "no_business" };
  if (ownedIds.length === 1) return { kind: "resolved", businessId: ownedIds[0] };
  return { kind: "selection_required" };
}

/** Raised by adapters whose contract can only return an id, so handlers can map it to a controlled response. */
export class ActiveBusinessError extends Error {
  constructor(readonly kind: "selection_required" | "forbidden") {
    super(kind);
    this.name = "ActiveBusinessError";
  }
}

/** Adapter helper: id for a resolved business, null when the user has none, typed error otherwise. */
export function businessIdOrThrow(resolution: ActiveBusinessResolution): string | null {
  if (resolution.kind === "resolved") return resolution.businessId;
  if (resolution.kind === "no_business") return null;
  throw new ActiveBusinessError(resolution.kind);
}
