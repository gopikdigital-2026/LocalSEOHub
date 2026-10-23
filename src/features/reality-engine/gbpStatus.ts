import type { ConnectedSource } from './types';

export const LOCATIONS_UNAVAILABLE_MSG =
  'No hemos podido obtener las ubicaciones de Google Business Profile. Tu cuenta no se ha conectado a ningún negocio y no mostraremos datos hasta que podamos leer una ubicación real. Vuelve a intentarlo desde Fuentes más tarde.';

// Accepts only identifiers returned by Google ("locations/123" or "accounts/x/locations/123"), never a synthetic placeholder.
export function isRealLocationName(name: string): boolean {
  return /^(accounts\/[^/]+\/)?locations\/[^/]+$/.test(name) && !name.endsWith('/locations/default');
}

// Mirrors the server timeouts in supabase/functions/gbp-recover-attempt/handler.ts.
export const AUTHORIZING_TIMEOUT_MS = 15 * 60 * 1000;
export const SELECTING_TIMEOUT_MS = 30 * 60 * 1000;
export const SYNCING_TIMEOUT_MS = 5 * 60 * 1000;

function ts(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function gbpPhase(source: ConnectedSource): 'authorizing' | 'select_location' | 'syncing' | null {
  if (source.status === 'syncing') return 'syncing';
  if (source.status !== 'connecting') return null;
  return source.metadata?.phase === 'select_location' ? 'select_location' : 'authorizing';
}

/** An in-flight attempt past its timeout; the server confirms and closes it on the next load. */
export function isStaleGBPAttempt(source: ConnectedSource, now = Date.now()): boolean {
  const phase = gbpPhase(source);
  if (!phase) return false;
  const meta = source.metadata ?? {};
  const updated = ts(source.updated_at) ?? now;
  if (phase === 'syncing') return now - (ts(meta.sync_started_at) ?? updated) > SYNCING_TIMEOUT_MS;
  if (phase === 'select_location') return now - (ts(meta.authorized_at) ?? updated) > SELECTING_TIMEOUT_MS;
  return now - (ts(meta.oauth_started_at) ?? updated) > AUTHORIZING_TIMEOUT_MS;
}

type Lang = 'es' | 'en';

const GBP_ERROR_MESSAGES: Record<string, { es: string; en: string }> = {
  GOOGLE_CONSENT_DENIED: {
    es: 'Cancelaste la autorización en Google. Puedes volver a intentarlo cuando quieras.',
    en: 'You cancelled the authorisation on Google. You can try again whenever you like.',
  },
  GOOGLE_REDIRECT_URI_MISMATCH: {
    es: 'La conexión con Google no está disponible por un problema de configuración. Ya lo estamos revisando.',
    en: 'The Google connection is unavailable because of a configuration problem. We are looking into it.',
  },
  GOOGLE_CLIENT_CONFIGURATION_FAILURE: {
    es: 'La conexión con Google no está disponible por un problema de configuración. Ya lo estamos revisando.',
    en: 'The Google connection is unavailable because of a configuration problem. We are looking into it.',
  },
  NOT_CONFIGURED: {
    es: 'La conexión con Google todavía no está disponible.',
    en: 'The Google connection is not available yet.',
  },
  GBP_PERMISSION_DENIED: {
    es: 'Google no nos dio permiso para gestionar tu ficha. Asegúrate de aceptar todos los permisos y de usar la cuenta que administra tu negocio.',
    en: 'Google did not grant permission to manage your listing. Accept all permissions and use the account that manages your business.',
  },
  GBP_AUTH_EXPIRED: {
    es: 'Google necesita que vuelvas a dar permiso.',
    en: 'Google needs you to grant permission again.',
  },
  GBP_API_QUOTA_UNAVAILABLE: {
    es: 'Google está limitando temporalmente las conexiones. Inténtalo de nuevo en unos minutos.',
    en: 'Google is temporarily limiting connections. Please try again in a few minutes.',
  },
  NO_GBP_ACCOUNTS: {
    es: 'Esta cuenta de Google no administra ninguna ficha de empresa. Prueba con la cuenta que gestiona tu negocio.',
    en: 'This Google account does not manage any business listing. Try the account that manages your business.',
  },
  NO_LOCATIONS: {
    es: 'No encontramos ninguna ficha de empresa en esa cuenta de Google.',
    en: 'We found no business listing in that Google account.',
  },
  LOCATIONS_UNAVAILABLE: {
    es: 'No pudimos leer tus fichas de Google. Inténtalo de nuevo más tarde.',
    en: 'We could not read your Google listings. Please try again later.',
  },
  LOCATION_NOT_FOUND: {
    es: 'No encontramos esa ficha en tu cuenta de Google.',
    en: 'We could not find that listing in your Google account.',
  },
  ATTEMPT_EXPIRED: {
    es: 'El intento de conexión caducó antes de terminar.',
    en: 'The connection attempt expired before it finished.',
  },
  SYNC_INTERRUPTED: {
    es: 'La sincronización se interrumpió antes de terminar.',
    en: 'The sync was interrupted before it finished.',
  },
  USER_CANCELLED: {
    es: 'La conexión se canceló antes de terminar.',
    en: 'The connection was cancelled before it finished.',
  },
};

const GENERIC_ERROR = {
  es: 'No se pudo completar la conexión con Google. Puedes volver a intentarlo.',
  en: 'We could not complete the Google connection. You can try again.',
};

/** Turns a stored or returned error code into a message; never shows raw technical text. */
export function gbpErrorMessage(code: string | null | undefined, lang: Lang = 'es'): string {
  if (code && GBP_ERROR_MESSAGES[code]) return GBP_ERROR_MESSAGES[code][lang];
  return GENERIC_ERROR[lang];
}
