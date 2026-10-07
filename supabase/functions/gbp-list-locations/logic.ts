export type ListLocationsErrorCode =
  | "NOT_AUTHENTICATED"
  | "INVALID_REQUEST"
  | "NOT_CONNECTED"
  | "GBP_AUTH_EXPIRED"
  | "GBP_API_UNAVAILABLE"
  | "GBP_QUOTA_EXCEEDED"
  | "GBP_ERROR"
  | "NOT_CONFIGURED"
  | "INTERNAL_ERROR";

export interface ListLocationsError {
  success: false;
  code: ListLocationsErrorCode;
  message: string;
  retryable: boolean;
}

export interface GbpLocation {
  name: string;
  title: string;
  accountId: string;
  address: string | null;
}

export interface ListLocationsSuccess {
  success: true;
  locations: GbpLocation[];
  accountsQueried: number;
  partial: boolean;
}

const ERROR_MESSAGES: Record<ListLocationsErrorCode, string> = {
  NOT_AUTHENTICATED: "Debes iniciar sesion para ver tus ubicaciones.",
  INVALID_REQUEST: "Solicitud no valida.",
  NOT_CONNECTED: "Google Business Profile no esta conectado. Conectalo desde Fuentes.",
  GBP_AUTH_EXPIRED: "La autorizacion de Google ha caducado. Vuelve a conectar Google Business Profile.",
  GBP_API_UNAVAILABLE:
    "La API de Google Business Profile no esta disponible para esta cuenta todavia (acceso o cuota pendiente de Google). No se han inventado ubicaciones.",
  GBP_QUOTA_EXCEEDED: "Google ha limitado temporalmente las solicitudes. Intentalo de nuevo en unos minutos.",
  GBP_ERROR: "Google devolvio un error al listar las ubicaciones.",
  NOT_CONFIGURED: "La integracion con Google no esta configurada en el servidor.",
  INTERNAL_ERROR: "Error interno al listar las ubicaciones.",
};

const RETRYABLE: Record<ListLocationsErrorCode, boolean> = {
  NOT_AUTHENTICATED: false,
  INVALID_REQUEST: false,
  NOT_CONNECTED: false,
  GBP_AUTH_EXPIRED: false,
  GBP_API_UNAVAILABLE: false,
  GBP_QUOTA_EXCEEDED: true,
  GBP_ERROR: true,
  NOT_CONFIGURED: false,
  INTERNAL_ERROR: true,
};

export function makeError(code: ListLocationsErrorCode): ListLocationsError {
  return { success: false, code, message: ERROR_MESSAGES[code], retryable: RETRYABLE[code] };
}

// Google bodies are inspected only for the status keyword; they are never forwarded or logged.
export function mapGoogleError(status: number, body: string): ListLocationsError {
  const upper = body.toUpperCase();
  if (status === 401) return makeError("GBP_AUTH_EXPIRED");
  if (status === 429 || upper.includes("RESOURCE_EXHAUSTED") || upper.includes("RATE_LIMIT")) {
    // A zero quota means the Google project has not been granted GBP API access yet.
    if (/"QUOTA_LIMIT_VALUE"\s*:\s*"0"/.test(upper)) return makeError("GBP_API_UNAVAILABLE");
    return makeError("GBP_QUOTA_EXCEEDED");
  }
  if (status === 403 || status === 404 || status === 501 || status === 503) {
    const err = makeError("GBP_API_UNAVAILABLE");
    return status === 503 ? { ...err, retryable: true } : err;
  }
  return makeError("GBP_ERROR");
}

export function isValidAccountId(id: unknown): id is string {
  return typeof id === "string" && /^accounts\/[A-Za-z0-9_-]+$/.test(id);
}

export function isRealLocationName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    /^(accounts\/[^/]+\/)?locations\/[^/]+$/.test(name) &&
    !name.endsWith("/locations/default") &&
    name !== "locations/default"
  );
}

interface RawLocation {
  name?: unknown;
  title?: unknown;
  storefrontAddress?: {
    addressLines?: unknown;
    locality?: unknown;
    administrativeArea?: unknown;
    postalCode?: unknown;
  };
}

function formatAddress(addr: RawLocation["storefrontAddress"]): string | null {
  if (!addr) return null;
  const lines = Array.isArray(addr.addressLines) ? addr.addressLines.filter((l) => typeof l === "string") : [];
  const parts = [lines.join(", "), addr.locality, addr.administrativeArea, addr.postalCode].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return parts.length ? parts.join(", ") : null;
}

export function normalizeLocations(raw: unknown, accountId: string): GbpLocation[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { locations?: unknown }).locations;
  if (!Array.isArray(list)) return [];
  const out: GbpLocation[] = [];
  for (const item of list as RawLocation[]) {
    if (!item || !isRealLocationName(item.name)) continue;
    out.push({
      name: item.name,
      title: typeof item.title === "string" && item.title.trim() ? item.title : item.name,
      accountId,
      address: formatAddress(item.storefrontAddress),
    });
  }
  return out;
}

export function needsRefresh(expiresAt: string | null, now: number = Date.now()): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t - now < 60_000;
}
