const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan'];

function ipv4Octets(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const octets = parts.map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

export function isPrivateAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = ipv4Octets(host);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (host.startsWith('::ffff:')) return true;
    return /^(fc|fd|fe[89ab])/.test(host);
  }
  return false;
}

export function checkPublicUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || !host.includes('.') && !host.includes(':')) return null;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return null;
  if (isPrivateAddress(host)) return null;
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return null;
  return url;
}

export type ResolveHost = (host: string) => Promise<string[] | null>;

export async function resolvesPublicly(url: URL, resolve: ResolveHost): Promise<boolean> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (ipv4Octets(host) || host.includes(':')) return !isPrivateAddress(host);
  const addresses = await resolve(host);
  if (addresses === null) return true;
  return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a));
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchPublic(
  raw: string,
  init: RequestInit,
  deps: { fetch: FetchLike; resolve: ResolveHost },
  maxRedirects = 3,
): Promise<{ response: Response; url: URL }> {
  let current = checkPublicUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!current || !(await resolvesPublicly(current, deps.resolve))) throw new Error('blocked_url');
    const response = await deps.fetch(current.href, { ...init, redirect: 'manual' });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (!location) return { response, url: current };
    current = checkPublicUrl(new URL(location, current).href);
  }
  throw new Error('too_many_redirects');
}

export async function denoResolve(host: string): Promise<string[] | null> {
  const deno = (globalThis as unknown as { Deno?: { resolveDns?: (h: string, t: string) => Promise<string[]> } }).Deno;
  if (!deno?.resolveDns) return null;
  const results = await Promise.allSettled([deno.resolveDns(host, 'A'), deno.resolveDns(host, 'AAAA')]);
  const addresses = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (addresses.length === 0 && results.every((r) => r.status === 'rejected')) {
    const reason = (results[0] as PromiseRejectedResult).reason;
    if (reason instanceof Error && /not supported|permission|NotCapable/i.test(reason.name + reason.message)) return null;
  }
  return addresses;
}
