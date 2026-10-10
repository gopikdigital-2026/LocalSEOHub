import { checkUrl, resolvePublicAddresses, SafeFetchError, type Resolver } from './urlSafety.ts';

export interface ByteStream {
  read(buf: Uint8Array): Promise<number | null>;
  write(data: Uint8Array): Promise<number>;
  close(): void;
}

// connect() receives an already-validated IP literal, so no second DNS lookup can redirect the socket (rebinding).
export interface NetDeps {
  resolve: Resolver;
  connect(ip: string, port: number): Promise<ByteStream>;
  startTls(conn: ByteStream, hostname: string): Promise<ByteStream>;
  now(): number;
}

export interface SafeGetOptions {
  maxBytes: number;
  timeoutMs: number;
  deadline: number;
  maxRedirects?: number;
  truncate?: boolean;
  sameSiteAs?: string;
  accept?: string;
}

export interface SafeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: URL;
  truncated: boolean;
}

export const NET_LIMITS = {
  MAX_REDIRECTS: 3,
  MAX_HEADER_BYTES: 16 * 1024,
  MAX_HEADERS: 100,
  MAX_CONNECT_ATTEMPTS: 2,
  MAX_CHUNK_LINE: 1024,
  READ_CHUNK: 16 * 1024,
};

const USER_AGENT = 'LocalSEOHub-Analyzer/1.0';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HEADER_LINE = /^([!#$%&'*+.^_`|~0-9a-z-]+):[ \t]*(.*?)[ \t]*$/i;

type Race = <T>(p: Promise<T>) => Promise<T>;

class Reader {
  private buf: Uint8Array = new Uint8Array(0);
  private eof = false;

  constructor(private readonly conn: ByteStream, private readonly race: Race) {}

  private async fill(): Promise<boolean> {
    if (this.eof) return false;
    const chunk = new Uint8Array(NET_LIMITS.READ_CHUNK);
    const n = await this.race(this.conn.read(chunk));
    if (!n) {
      this.eof = true;
      return false;
    }
    if (this.buf.length === 0) {
      this.buf = chunk.subarray(0, n);
    } else {
      const merged = new Uint8Array(this.buf.length + n);
      merged.set(this.buf);
      merged.set(chunk.subarray(0, n), this.buf.length);
      this.buf = merged;
    }
    return true;
  }

  private async until(delimiter: number[], max: number): Promise<string> {
    for (;;) {
      const at = indexOf(this.buf, delimiter);
      if (at !== -1 && at <= max) {
        const text = latin1(this.buf.subarray(0, at));
        this.buf = this.buf.subarray(at + delimiter.length);
        return text;
      }
      if (this.buf.length > max + delimiter.length) throw new SafeFetchError('bad_response');
      if (!(await this.fill())) throw new SafeFetchError('bad_response');
    }
  }

  readHead(): Promise<string> {
    return this.until([13, 10, 13, 10], NET_LIMITS.MAX_HEADER_BYTES);
  }

  readLine(max: number): Promise<string> {
    return this.until([13, 10], max);
  }

  async next(max: number): Promise<Uint8Array | null> {
    if (this.buf.length === 0 && !(await this.fill())) return null;
    const n = Math.min(max, this.buf.length);
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
}

class Sink {
  private chunks: Uint8Array[] = [];
  size = 0;
  truncated = false;

  constructor(private readonly max: number, private readonly truncate: boolean) {}

  push(bytes: Uint8Array): boolean {
    const room = this.max - this.size;
    if (bytes.length > room) {
      if (!this.truncate) throw new SafeFetchError('too_large');
      if (room > 0) this.chunks.push(bytes.slice(0, room));
      this.size = this.max;
      this.truncated = true;
      return false;
    }
    this.chunks.push(bytes.slice());
    this.size += bytes.length;
    return true;
  }

  text(): string {
    const all = new Uint8Array(this.size);
    let offset = 0;
    for (const c of this.chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    return new TextDecoder('utf-8').decode(all);
  }
}

function indexOf(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function parseHead(head: string): { status: number; headers: Record<string, string> } {
  const [statusLine, ...lines] = head.split('\r\n');
  const m = /^HTTP\/1\.[01] ([2-5]\d\d)(?: .*)?$/.exec(statusLine);
  if (!m) throw new SafeFetchError('bad_response');
  if (lines.length > NET_LIMITS.MAX_HEADERS) throw new SafeFetchError('bad_response');
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const h = HEADER_LINE.exec(line);
    if (!h) throw new SafeFetchError('bad_response');
    const name = h[1].toLowerCase();
    if (name === 'content-length' && name in headers && headers[name] !== h[2]) throw new SafeFetchError('bad_response');
    headers[name] = name in headers && name !== 'content-length' ? `${headers[name]}, ${h[2]}` : h[2];
  }
  return { status: Number(m[1]), headers };
}

async function readBody(reader: Reader, status: number, headers: Record<string, string>, sink: Sink, maxBytes: number, truncate: boolean) {
  if (status === 204 || status === 304) return;
  const te = headers['transfer-encoding'];
  if (te !== undefined) {
    if (te.trim().toLowerCase() !== 'chunked') throw new SafeFetchError('bad_response');
    for (;;) {
      const size = /^([0-9a-f]{1,8})(?:[ \t]*;.*)?$/i.exec((await reader.readLine(NET_LIMITS.MAX_CHUNK_LINE)).trim());
      if (!size) throw new SafeFetchError('bad_response');
      let left = parseInt(size[1], 16);
      if (left === 0) return;
      while (left > 0) {
        const part = await reader.next(left);
        if (!part) throw new SafeFetchError('bad_response');
        left -= part.length;
        if (!sink.push(part)) return;
      }
      if ((await reader.readLine(0)) !== '') throw new SafeFetchError('bad_response');
    }
  }
  const cl = headers['content-length'];
  if (cl !== undefined) {
    if (!/^\d{1,15}$/.test(cl)) throw new SafeFetchError('bad_response');
    let left = Number(cl);
    if (left > maxBytes && !truncate) throw new SafeFetchError('too_large');
    while (left > 0) {
      const part = await reader.next(left);
      if (!part) throw new SafeFetchError('bad_response');
      left -= part.length;
      if (!sink.push(part)) return;
    }
    return;
  }
  for (;;) {
    const part = await reader.next(NET_LIMITS.READ_CHUNK);
    if (!part || !sink.push(part)) return;
  }
}

async function writeAll(conn: ByteStream, data: Uint8Array, race: Race) {
  let offset = 0;
  while (offset < data.length) {
    const n = await race(conn.write(data.subarray(offset)));
    if (!n || n < 0) throw new SafeFetchError('connect_failed');
    offset += n;
  }
}

type Hop = { kind: 'redirect'; location: string } | { kind: 'response'; status: number; headers: Record<string, string>; body: string; truncated: boolean };

async function requestOnce(url: URL, opts: SafeGetOptions, deps: NetDeps): Promise<Hop> {
  const remaining = opts.deadline - deps.now();
  if (remaining <= 0) throw new SafeFetchError('timeout');

  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SafeFetchError('timeout')), Math.min(opts.timeoutMs, remaining));
  });
  abort.catch(() => {});
  const race: Race = (p) => Promise.race([p, abort]);

  const open: ByteStream[] = [];
  let finished = false;
  const track = (p: Promise<ByteStream>) => {
    p.then((c) => (finished ? c.close() : open.push(c))).catch(() => {});
    return p;
  };

  try {
    const addresses = await race(resolvePublicAddresses(url.hostname, deps.resolve));
    const ordered = [...addresses.filter((a) => !a.includes(':')), ...addresses.filter((a) => a.includes(':'))]
      .slice(0, NET_LIMITS.MAX_CONNECT_ATTEMPTS);
    const port = url.protocol === 'https:' ? 443 : 80;

    let conn: ByteStream | null = null;
    for (const ip of ordered) {
      try {
        conn = await race(track(deps.connect(ip, port)));
        break;
      } catch (err) {
        if (err instanceof SafeFetchError) throw err;
      }
    }
    if (!conn) throw new SafeFetchError('connect_failed');

    if (url.protocol === 'https:') {
      try {
        conn = await race(track(deps.startTls(conn, url.hostname)));
      } catch (err) {
        if (err instanceof SafeFetchError) throw err;
        throw new SafeFetchError('tls_failed');
      }
    }

    const target = url.pathname + url.search;
    if (!/^\/[\x21-\x7e]*$/.test(target)) throw new SafeFetchError('invalid_url');
    const request =
      `GET ${target} HTTP/1.1\r\nHost: ${url.host}\r\nUser-Agent: ${USER_AGENT}\r\n` +
      `Accept: ${opts.accept ?? '*/*'}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`;
    await writeAll(conn, new TextEncoder().encode(request), race);

    const reader = new Reader(conn, race);
    const { status, headers } = parseHead(await reader.readHead());
    if (REDIRECT_STATUSES.has(status) && headers.location) return { kind: 'redirect', location: headers.location };

    const sink = new Sink(opts.maxBytes, !!opts.truncate);
    await readBody(reader, status, headers, sink, opts.maxBytes, !!opts.truncate);
    return { kind: 'response', status, headers, body: sink.text(), truncated: sink.truncated };
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    throw new SafeFetchError('connect_failed');
  } finally {
    finished = true;
    clearTimeout(timer);
    for (const c of open) {
      try {
        c.close();
      } catch {
        // already closed
      }
    }
  }
}

function sameSite(host: string, base: string): boolean {
  const strip = (h: string) => h.replace(/^www\./, '');
  return strip(host) === strip(base);
}

export async function safeGet(raw: string, opts: SafeGetOptions, deps: NetDeps): Promise<SafeResponse> {
  const maxRedirects = opts.maxRedirects ?? NET_LIMITS.MAX_REDIRECTS;
  const visited = new Set<string>();
  let current = checkUrl(raw);
  if (opts.sameSiteAs && !sameSite(current.hostname, opts.sameSiteAs)) throw new SafeFetchError('off_site_redirect');

  for (let hop = 0; ; hop++) {
    if (visited.has(current.href)) throw new SafeFetchError('redirect_loop');
    visited.add(current.href);
    const res = await requestOnce(current, opts, deps);
    if (res.kind === 'response') {
      return { status: res.status, headers: res.headers, body: res.body, url: current, truncated: res.truncated };
    }
    if (hop >= maxRedirects) throw new SafeFetchError('too_many_redirects');
    let next: string;
    try {
      next = new URL(res.location, current).href;
    } catch {
      throw new SafeFetchError('invalid_url');
    }
    current = checkUrl(next);
    if (opts.sameSiteAs && !sameSite(current.hostname, opts.sameSiteAs)) throw new SafeFetchError('off_site_redirect');
  }
}
