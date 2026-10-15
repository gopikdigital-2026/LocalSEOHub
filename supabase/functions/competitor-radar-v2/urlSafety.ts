const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal']);
const BLOCKED_SUFFIXES = [
  '.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.private',
  '.home.arpa', '.arpa', '.test', '.example', '.invalid', '.onion', '.localdomain',
];
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export type DnsType = 'A' | 'AAAA';
export type Resolver = (host: string, type: DnsType) => Promise<string[]>;

export type FetchErrorCode =
  | 'invalid_url' | 'blocked' | 'dns_failed' | 'dns_empty' | 'connect_failed' | 'tls_failed' | 'timeout'
  | 'too_large' | 'too_many_redirects' | 'redirect_loop' | 'off_site_redirect' | 'bad_response';

export class SafeFetchError extends Error {
  constructor(public readonly code: FetchErrorCode) {
    super(code);
  }
}

export function parseIPv4(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

export function parseIPv6(text: string): number[] | null {
  let s = text.toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  if (!/^[0-9a-f:.]+$/.test(s) || s.length > 45) return null;

  let tail: number[] = [];
  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':');
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1);
    if (!s.endsWith('::')) s = s.slice(0, -1);
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toWords = (part: string) => (part === '' ? [] : part.split(':'));
  const head = toWords(halves[0]);
  const rest = halves.length === 2 ? toWords(halves[1]) : [];
  const groups = [...head, ...rest];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  const known = groups.length + tail.length;
  if (halves.length === 1 ? known !== 8 : known > 7) return null;
  const fill = new Array(8 - known).fill(0);
  const words = [...head, ...(halves.length === 2 ? fill : []), ...rest].map((g) => parseInt(g, 16));
  return [...words, ...tail];
}

function isPublicIPv4([a, b, c]: number[]): boolean {
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

// Only global unicast 2000::/3 is accepted; everything outside it (loopback, mapped, ULA, link-local, multicast,
// NAT64) is rejected, plus documentation, IETF/Teredo and 6to4 ranges inside it that can tunnel to other hosts.
function isPublicIPv6(w: number[]): boolean {
  if ((w[0] & 0xe000) !== 0x2000) return false;
  if (w[0] === 0x2001 && w[1] === 0x0db8) return false;
  if (w[0] === 0x2001 && w[1] < 0x0200) return false;
  if (w[0] === 0x2002) return false;
  if ((w[0] & 0xfff0) === 0x3ff0) return false;
  return true;
}

export function isPublicAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(address);
  if (v6 && v6.length === 8) return isPublicIPv6(v6);
  return false;
}

export function isPrivateAddress(address: string): boolean {
  return !isPublicAddress(address);
}

export function checkUrl(raw: unknown): URL {
  const invalid = () => new SafeFetchError('invalid_url');
  const blocked = () => new SafeFetchError('blocked');
  if (typeof raw !== 'string') throw invalid();
  const input = raw.trim();
  if (!input || input.length > MAX_URL_LENGTH || /[\s\\]/.test(input)) throw invalid();
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) throw invalid();
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw invalid();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid();
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(input)?.[1];
  if (!authority) throw invalid();
  if (authority.includes('@') || url.username || url.password) throw blocked();
  // The URL parser drops default ports (":443"), so check the raw authority too.
  if (url.port !== '' || authority.replace(/^\[[^\]]*\]/, '').includes(':')) throw blocked();

  const host = url.hostname;
  if (host.startsWith('[') || parseIPv4(host)) throw blocked();
  if (host.length > 253 || host.endsWith('.') || host.includes('%')) throw invalid();
  const labels = host.split('.');
  if (labels.length < 2) throw blocked();
  if (!labels.every((l) => LABEL.test(l)) || !/[a-z]/.test(labels[labels.length - 1])) throw invalid();
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw blocked();

  url.hash = '';
  return url;
}

export function checkPublicUrl(raw: unknown): URL | null {
  try {
    return checkUrl(raw);
  } catch {
    return null;
  }
}

function isNotFound(reason: unknown): boolean {
  return reason instanceof Error && (reason.name === 'NotFound' || /no record|not found|nxdomain/i.test(reason.message));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SafeFetchError('dns_failed')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function resolvePublicAddresses(host: string, resolve: Resolver, timeoutMs = 3000): Promise<string[]> {
  const results = await Promise.allSettled([
    withTimeout(resolve(host, 'A'), timeoutMs),
    withTimeout(resolve(host, 'AAAA'), timeoutMs),
  ]);
  const addresses: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (!Array.isArray(r.value)) throw new SafeFetchError('dns_failed');
      addresses.push(...r.value);
    } else if (!isNotFound(r.reason)) {
      throw new SafeFetchError('dns_failed');
    }
  }
  if (addresses.length === 0) throw new SafeFetchError('dns_empty');
  for (const a of addresses) {
    if (typeof a !== 'string' || !isPublicAddress(a)) throw new SafeFetchError('blocked');
  }
  return addresses;
}
