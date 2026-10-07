const AUTH_PATHS = ['/login', '/signup', '/registro', '/empezar', '/auth'];

/**
 * Accepts only same-origin, in-app paths. Anything that could leave the site
 * (absolute URLs, protocol-relative `//host`, backslash tricks, schemes) is rejected.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value: string;
  try {
    value = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value.includes('\\') || [...value].some((ch) => ch.charCodeAt(0) < 32)) return null;
  const path = value.split(/[?#]/)[0];
  if (path === '/' || AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return value;
}

/** Onboarding comes first; once done, a validated in-app `next` wins over the default /hoy. */
export function destinationFor(status: string, next: string | null): string {
  if (status !== 'completed') return '/empezar';
  return next ?? '/hoy';
}

export function returnPathFromLocation(search: string): string | null {
  return safeReturnPath(new URLSearchParams(search).get('next'));
}
