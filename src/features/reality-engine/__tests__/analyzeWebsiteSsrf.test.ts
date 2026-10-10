import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { safeGet, type ByteStream, type NetDeps, type SafeGetOptions } from '../../../../supabase/functions/analyze-website/safeHttp.ts';
import { analyze } from '../../../../supabase/functions/analyze-website/handler.ts';
import { checkUrl, resolvePublicAddresses, type DnsType } from '../../../../supabase/functions/analyze-website/urlSafety.ts';
import type { WebsiteAnalysis } from '../types';

const FN_DIR = join(__dirname, '../../../../supabase/functions');
const AW = join(FN_DIR, 'analyze-website');
const enc = new TextEncoder();

type Reply = string[] | 'hang' | { trickle: string; chunk: number };
type Server = (path: string, host: string) => Reply;
type DnsTable = Record<string, Partial<Record<DnsType, string[] | Error>>>;

const PUBLIC_IP = '93.184.216.34';
const PUBLIC_IP_2 = '151.101.1.1';

function http(status: number, body = '', headers: Record<string, string> = {}): string[] {
  const head = Object.entries({ 'Content-Length': String(enc.encode(body).length), ...headers })
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n');
  return [`HTTP/1.1 ${status} X\r\n${head}\r\n\r\n`, body];
}

function redirect(location: string, status = 301): string[] {
  return http(status, '', { Location: location });
}

function harness(dns: DnsTable, servers: Record<string, Server>, now = () => Date.now()) {
  const connects: Array<{ ip: string; port: number }> = [];
  const tls: string[] = [];
  const requests: string[] = [];
  const streams: Array<{ closed: boolean; bytesServed: number }> = [];

  const resolve = vi.fn(async (host: string, type: DnsType) => {
    const entry = dns[host]?.[type];
    if (entry instanceof Error) throw entry;
    if (!entry) throw Object.assign(new Error('no record'), { name: 'NotFound' });
    return entry;
  });

  const connect = vi.fn(async (ip: string, port: number): Promise<ByteStream> => {
    connects.push({ ip, port });
    const server = servers[ip];
    if (!server) throw new Error('ECONNREFUSED');
    const state = { closed: false, bytesServed: 0 };
    streams.push(state);
    let request = '';
    let queue: Uint8Array[] | null = null;
    let hang = false;
    let wake: (() => void) | null = null;
    return {
      async write(data) {
        request += new TextDecoder().decode(data);
        return data.length;
      },
      async read(buf) {
        if (state.closed) return null;
        if (!queue && !hang) {
          requests.push(request);
          const [line] = request.split('\r\n');
          const path = line.split(' ')[1];
          const host = /\r\nHost: ([^\r]+)/.exec(request)?.[1] ?? '';
          const reply = server(path, host);
          if (reply === 'hang') hang = true;
          else if (Array.isArray(reply)) queue = reply.map((s) => enc.encode(s));
          else {
            const all = enc.encode(reply.trickle);
            queue = [];
            for (let i = 0; i < all.length; i += reply.chunk) queue.push(all.subarray(i, i + reply.chunk));
          }
        }
        if (hang) {
          await new Promise<void>((r) => { wake = r; });
          return null;
        }
        const next = queue!.shift();
        if (!next) return null;
        const n = Math.min(buf.length, next.length);
        buf.set(next.subarray(0, n));
        if (n < next.length) queue!.unshift(next.subarray(n));
        state.bytesServed += n;
        return n;
      },
      close() {
        state.closed = true;
        wake?.();
      },
    };
  });

  const startTls = vi.fn(async (conn: ByteStream, hostname: string) => {
    tls.push(hostname);
    return conn;
  });

  const deps: NetDeps = { resolve, connect, startTls, now };
  return { deps, connects, tls, requests, streams, resolve };
}

const opts = (over: Partial<SafeGetOptions> = {}): SafeGetOptions => ({
  maxBytes: 1024,
  timeoutMs: 2000,
  deadline: Date.now() + 5000,
  ...over,
});

const site = (reply: Server) => harness({ 'shop.com': { A: [PUBLIC_IP] } }, { [PUBLIC_IP]: reply });

async function analyzeJson(url: string, h: ReturnType<typeof harness>) {
  const res = await analyze(url, h.deps);
  return { status: res.status, body: await res.json() };
}

afterEach(() => vi.restoreAllMocks());

describe('A2.2 analyze-website SSRF hardening — URL policy', () => {
  it('1 valid public HTTP site is fetched through the validated IP on port 80', async () => {
    const h = site(() => http(200, '<title>Hola</title>'));
    const res = await safeGet('http://shop.com/', opts(), h.deps);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Hola');
    expect(h.connects).toEqual([{ ip: PUBLIC_IP, port: 80 }]);
    expect(h.tls).toEqual([]);
    expect(h.requests[0]).toMatch(/^GET \/ HTTP\/1\.1\r\nHost: shop\.com\r\n/);
    expect(h.requests[0]).not.toMatch(/cookie|authorization/i);
  });

  it('2 valid HTTPS site verifies TLS against the original hostname over the pinned IP', async () => {
    const h = site(() => http(200, 'ok'));
    const res = await safeGet('https://shop.com/a?b=1', opts(), h.deps);
    expect(res.body).toBe('ok');
    expect(h.connects).toEqual([{ ip: PUBLIC_IP, port: 443 }]);
    expect(h.tls).toEqual(['shop.com']);
    expect(h.requests[0]).toMatch(/^GET \/a\?b=1 HTTP\/1\.1/);
  });

  it.each([
    'file:///etc/passwd', 'ftp://shop.com/', 'gopher://shop.com/', 'javascript:alert(1)', 'data:text/html,hi', 'ws://shop.com/',
  ])('3 rejects disallowed scheme %s', (u) => {
    expect(() => checkUrl(u)).toThrow();
  });

  it.each(['http://user:pw@shop.com/', 'https://user@shop.com/', 'http://shop.com@10.0.0.1/', 'http://:@shop.com/'])(
    '4 rejects credentials %s', (u) => {
      expect(() => checkUrl(u)).toThrow();
    });

  it.each(['http://shop.com:8080/', 'https://shop.com:22/', 'http://shop.com:443/', 'https://shop.com:443/'])(
    '5 rejects explicit ports %s', (u) => {
      expect(() => checkUrl(u)).toThrow();
    });

  it.each(['http://localhost/', 'http://LOCALHOST./', 'http://app.localhost/', 'http://printer.local/', 'http://db.internal/', 'http://intranet/'])(
    '6 rejects localhost and internal names %s', (u) => {
      expect(() => checkUrl(u)).toThrow();
    });

  it.each([
    'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.16.0.1/', 'http://0x7f000001/', 'http://2130706433/',
    'http://0177.0.0.1/', 'http://127.1/', 'http://10.1/', 'http://%31%30.0.0.1/',
  ])('7 rejects private IPv4 in any encoding %s', (u) => {
    expect(() => checkUrl(u)).toThrow();
  });

  it.each(['http://[fd00::1]/', 'http://[fc00::5]/', 'http://[::ffff:10.0.0.1]/', 'http://[2001:db8::1]/'])(
    '8 rejects private IPv6 literals %s', (u) => {
      expect(() => checkUrl(u)).toThrow();
    });

  it('8b DNS answers with private IPv6 are refused', async () => {
    for (const ip of ['fd00::1', 'fe80::1', '::ffff:192.168.0.1', '64:ff9b::a00:1', '2002:a00:1::']) {
      await expect(resolvePublicAddresses('shop.com', async (_h, t) => (t === 'AAAA' ? [ip] : [])))
        .rejects.toMatchObject({ code: 'blocked' });
    }
  });

  it('9 loopback is refused as literal and as DNS answer', async () => {
    expect(() => checkUrl('http://127.0.0.1/')).toThrow();
    expect(() => checkUrl('http://[::1]/')).toThrow();
    const h = harness({ 'shop.com': { A: ['127.0.0.1'], AAAA: ['::1'] } }, { '127.0.0.1': () => http(200, 'x') });
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'blocked' });
    expect(h.connects).toEqual([]);
  });

  it('10 link-local addresses are refused', async () => {
    expect(() => checkUrl('http://169.254.1.1/')).toThrow();
    expect(() => checkUrl('http://[fe80::1]/')).toThrow();
    await expect(resolvePublicAddresses('shop.com', async (_h, t) => (t === 'A' ? ['169.254.10.10'] : [])))
      .rejects.toMatchObject({ code: 'blocked' });
  });

  it('11 cloud metadata endpoints are refused by name and address', async () => {
    for (const u of ['http://169.254.169.254/latest/meta-data', 'http://metadata.google.internal/', 'http://metadata/', 'http://[fd00:ec2::254]/']) {
      expect(() => checkUrl(u)).toThrow();
    }
    const h = harness({ 'shop.com': { A: ['169.254.169.254'] } }, { '169.254.169.254': () => http(200, 'secret') });
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'blocked' });
    expect(h.connects).toEqual([]);
  });

  it('3b ambiguous encodings and malformed URLs are refused', () => {
    for (const u of ['http://shop.com\\@10.0.0.1/', 'http://sho p.com/', 'http://shop.com\t/', 'http://shop..com/', 'http://-shop.com/', 'http://shop.123/', 'http:///shop.com', '', 'x'.repeat(3000)]) {
      expect(() => checkUrl(u), u).toThrow();
    }
  });
});

describe('A2.2 analyze-website SSRF hardening — DNS', () => {
  it('12 a domain with no A/AAAA records fails closed with dns_empty', async () => {
    const h = harness({ 'shop.com': {} }, {});
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'dns_empty' });
    expect(h.connects).toEqual([]);
  });

  it('13 a DNS error fails closed with dns_failed (and a slow resolver times out)', async () => {
    const h = harness({ 'shop.com': { A: new Error('SERVFAIL'), AAAA: [PUBLIC_IP] } }, {});
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'dns_failed' });
    expect(h.connects).toEqual([]);
    await expect(resolvePublicAddresses('shop.com', () => new Promise<string[]>(() => {}), 20))
      .rejects.toMatchObject({ code: 'dns_failed' });
  });

  it('14 a mixed public + private answer is refused entirely', async () => {
    const h = harness({ 'shop.com': { A: [PUBLIC_IP, '10.0.0.7'] } }, { [PUBLIC_IP]: () => http(200, 'x') });
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'blocked' });
    expect(h.connects).toEqual([]);
  });

  it('15 simulated rebinding: the socket goes to the IP validated in the same lookup, never a second answer', async () => {
    let calls = 0;
    const h = harness({}, { [PUBLIC_IP]: () => http(200, 'public'), '127.0.0.1': () => http(200, 'internal') });
    h.deps.resolve = async (_host, type) => {
      if (type !== 'A') return [];
      calls += 1;
      return calls === 1 ? [PUBLIC_IP] : ['127.0.0.1'];
    };
    const res = await safeGet('http://shop.com/', opts(), h.deps);
    expect(res.body).toBe('public');
    expect(h.connects.map((c) => c.ip)).toEqual([PUBLIC_IP]);
    expect(calls).toBe(1);
  });
});

describe('A2.2 analyze-website SSRF hardening — redirects', () => {
  it('16 a valid public redirect is followed with a fresh DNS check on the new host', async () => {
    const h = harness(
      { 'shop.com': { A: [PUBLIC_IP] }, 'www.shop.com': { A: [PUBLIC_IP_2] } },
      { [PUBLIC_IP]: () => redirect('https://www.shop.com/inicio'), [PUBLIC_IP_2]: () => http(200, 'final') },
    );
    const res = await safeGet('http://shop.com/', opts(), h.deps);
    expect(res.body).toBe('final');
    expect(res.url.href).toBe('https://www.shop.com/inicio');
    expect(h.resolve.mock.calls.map((c) => c[0])).toContain('www.shop.com');
    expect(h.connects).toEqual([{ ip: PUBLIC_IP, port: 80 }, { ip: PUBLIC_IP_2, port: 443 }]);
  });

  it('17 a redirect to a private IP is blocked before connecting', async () => {
    const h = site(() => redirect('http://10.0.0.1/admin'));
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'blocked' });
    expect(h.connects).toHaveLength(1);
  });

  it('18 a redirect to an internal hostname (or one resolving privately) is blocked', async () => {
    const h = harness(
      { 'shop.com': { A: [PUBLIC_IP] }, 'evil.com': { A: ['192.168.0.10'] } },
      { [PUBLIC_IP]: (p) => (p === '/' ? redirect('http://metadata.google.internal/') : redirect('http://evil.com/')), '192.168.0.10': () => http(200, 'x') },
    );
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'blocked' });
    await expect(safeGet('http://shop.com/b', opts(), h.deps)).rejects.toMatchObject({ code: 'blocked' });
    expect(h.connects.every((c) => c.ip === PUBLIC_IP)).toBe(true);
  });

  it('19 a redirect loop is detected', async () => {
    const h = site((p) => (p === '/a' ? redirect('/b') : redirect('/a')));
    await expect(safeGet('http://shop.com/a', opts(), h.deps)).rejects.toMatchObject({ code: 'redirect_loop' });
  });

  it('20 more than 3 redirects are refused and scheme changes outside http/https are blocked', async () => {
    const h = site((p) => redirect(`/r${Number(p.slice(2) || 0) + 1}`));
    await expect(safeGet('http://shop.com/r0', opts(), h.deps)).rejects.toMatchObject({ code: 'too_many_redirects' });
    expect(h.connects).toHaveLength(4);
    const f = site(() => redirect('file:///etc/passwd'));
    await expect(safeGet('http://shop.com/', opts(), f.deps)).rejects.toThrow();
  });
});

describe('A2.2 analyze-website SSRF hardening — size and time limits', () => {
  it('21 an oversized Content-Length is rejected before reading the body', async () => {
    const h = site(() => [`HTTP/1.1 200 OK\r\nContent-Length: 99999999\r\n\r\n`, 'x'.repeat(10)]);
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'too_large' });
    expect(h.streams[0].closed).toBe(true);
  });

  it('22 a body without Content-Length is capped while streaming', async () => {
    const h = site(() => ['HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n', 'y'.repeat(5000)]);
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'too_large' });
  });

  it('23 a stream that lies about its length or uses chunks beyond the cap is cut off', async () => {
    const chunked = site(() => [`HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n`, ...Array(20).fill(`100\r\n${'z'.repeat(256)}\r\n`), '0\r\n\r\n']);
    await expect(safeGet('http://shop.com/', opts(), chunked.deps)).rejects.toMatchObject({ code: 'too_large' });
    const truncated = site(() => ({ trickle: `HTTP/1.1 200 OK\r\n\r\n${'w'.repeat(4000)}`, chunk: 100 }));
    const res = await safeGet('http://shop.com/', opts({ truncate: true }), truncated.deps);
    expect(res.truncated).toBe(true);
    expect(res.body.length).toBe(1024);
    expect(truncated.streams[0].closed).toBe(true);
  });

  it('24 a hanging response hits the per-request timeout and the socket is closed', async () => {
    const h = site(() => 'hang');
    await expect(safeGet('http://shop.com/', opts({ timeoutMs: 40 }), h.deps)).rejects.toMatchObject({ code: 'timeout' });
    expect(h.streams[0].closed).toBe(true);
  });

  it('25 the total deadline bounds the whole chain, including redirects', async () => {
    let t = 0;
    const h = harness(
      { 'shop.com': { A: [PUBLIC_IP] } },
      { [PUBLIC_IP]: (p) => { t += 1000; return p === '/' ? redirect('/next') : http(200, 'late'); } },
      () => t,
    );
    await expect(safeGet('http://shop.com/', opts({ deadline: 500 }), h.deps)).rejects.toMatchObject({ code: 'timeout' });
    const hang = site(() => 'hang');
    await expect(safeGet('http://shop.com/', opts({ timeoutMs: 5000, deadline: Date.now() + 40 }), hang.deps)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('29 a download is cancelled: the connection is closed as soon as the limit trips', async () => {
    const h = site(() => ({ trickle: `HTTP/1.1 200 OK\r\n\r\n${'q'.repeat(200_000)}`, chunk: 512 }));
    await expect(safeGet('http://shop.com/', opts(), h.deps)).rejects.toMatchObject({ code: 'too_large' });
    expect(h.streams[0].closed).toBe(true);
    expect(h.streams[0].bytesServed).toBeLessThan(4096);
  });
});

describe('A2.2 analyze-website SSRF hardening — robots.txt and sitemap.xml', () => {
  it('26 a malicious robots.txt cannot pull the analyzer into the network or off-site', async () => {
    const h = harness(
      { 'shop.com': { A: [PUBLIC_IP] }, 'other.com': { A: [PUBLIC_IP_2] } },
      {
        [PUBLIC_IP]: (p) => (p === '/robots.txt' ? redirect('http://169.254.169.254/latest/meta-data')
          : p === '/sitemap.xml' ? redirect('https://other.com/sitemap.xml') : http(200, '<title>T</title>')),
        [PUBLIC_IP_2]: () => http(200, '<urlset></urlset>'),
      },
    );
    const { status, body } = await analyzeJson('https://shop.com/', h);
    expect(status).toBe(200);
    expect(body.hasRobotsTxt).toBe(false);
    expect(body.hasSitemap).toBe(false);
    expect(h.connects.every((c) => c.ip === PUBLIC_IP)).toBe(true);
  });

  it('27 a malicious sitemap.xml (huge, with internal links) is truncated and never followed', async () => {
    const locs = Array.from({ length: 5000 }, (_, i) => `<url><loc>http://10.0.0.${i % 255}/</loc></url>`).join('');
    const h = site((p) => (p === '/sitemap.xml' ? ['HTTP/1.1 200 OK\r\n\r\n', `<urlset>${locs}</urlset>`] : http(200, 'Sitemap: http://10.0.0.1/s.xml')));
    const { body } = await analyzeJson('https://shop.com/', h);
    expect(body.hasSitemap).toBe(true);
    expect(h.connects).toHaveLength(3);
    expect(h.requests.map((r) => r.split(' ')[1])).toEqual(['/', '/robots.txt', '/sitemap.xml']);
  });

  it('28 a nested sitemap index is not recursed', async () => {
    const index = `<sitemapindex>${Array.from({ length: 1000 }, (_, i) => `<sitemap><loc>https://shop.com/s${i}.xml</loc></sitemap>`).join('')}</sitemapindex>`;
    const h = site((p) => (p === '/sitemap.xml' ? http(200, index) : http(200, 'ok page')));
    const { body } = await analyzeJson('https://shop.com/', h);
    expect(body.hasSitemap).toBe(true);
    expect(h.requests).toHaveLength(3);
  });
});

describe('A2.2 analyze-website SSRF hardening — compatibility and scope', () => {
  const KEYS: Array<keyof WebsiteAnalysis> = ['url', 'statusCode', 'https', 'title', 'metaDescription', 'h1', 'hasRobotsTxt',
    'hasSitemap', 'canonical', 'hasSchema', 'analyzedAt', 'errors', 'confidence'];

  it('30 successful analyses keep the exact response shape; failures keep the { error } shape the app reads', async () => {
    const html = '<html><head><title>Bar Pepe</title><meta name="description" content="Tapas"><link rel="canonical" href="https://shop.com/">'
      + '<script type="application/ld+json">{}</script></head><body><h1>Bienvenidos</h1></body></html>';
    const h = site((p) => (p === '/' ? http(200, html) : p === '/robots.txt' ? http(200, 'User-agent: *\nAllow: /') : http(200, '<urlset></urlset>')));
    const { status, body } = await analyzeJson('https://shop.com/', h);
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([...KEYS].sort());
    expect(body).toMatchObject({ url: 'https://shop.com/', statusCode: 200, https: true, title: 'Bar Pepe', metaDescription: 'Tapas', h1: 'Bienvenidos',
      hasRobotsTxt: true, hasSitemap: true, canonical: 'https://shop.com/', hasSchema: true, errors: [], confidence: 'verified' });

    const notFound = site(() => http(404, 'nope'));
    expect((await analyzeJson('https://shop.com/', notFound)).body).toMatchObject({ statusCode: 404, errors: ['HTTP 404'], confidence: 'estimated' });

    expect(await analyzeJson('', site(() => http(200)))).toMatchObject({ status: 400, body: { error: 'URL requerida' } });
    for (const [url, h2, code] of [
      ['http://10.0.0.1/', site(() => http(200)), 'blocked'],
      ['notaurl', site(() => http(200)), 'invalid_url'],
      ['https://nxdomain.com/', harness({}, {}), 'dns_empty'],
      ['https://down.com/', harness({ 'down.com': { A: [PUBLIC_IP] } }, {}), 'connect_failed'],
    ] as const) {
      const r = await analyzeJson(url, h2);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.body.code).toBe(code);
      expect(typeof r.body.error).toBe('string');
      expect(JSON.stringify(r.body)).not.toMatch(/\d+\.\d+\.\d+\.\d+|stack|ECONN|Error:/);
    }
  });

  it('30b a security block is reported as a security message, not as an SEO finding', async () => {
    const h = site(() => redirect('http://127.0.0.1/'));
    const { status, body } = await analyzeJson('https://shop.com/', h);
    expect(status).toBe(400);
    expect(body).not.toHaveProperty('statusCode');
    expect(body.error).toMatch(/seguridad/);
  });

  it('31 the analyzer never calls AI providers or the global fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await analyzeJson('https://shop.com/', site(() => http(200, 'ok')));
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const file of readdirSync(AW)) {
      const src = readFileSync(join(AW, file), 'utf8');
      expect(src, file).not.toMatch(/openai|anthropic|LocalSEO_AI|LocalSEO_KEY|\bfetch\(/i);
    }
  });

  it('32 the three improvements still share the untouched entitlement guard and do not depend on the analyzer', () => {
    const reference = readFileSync(join(AW, 'entitlement.ts'), 'utf8');
    for (const fn of ['weekly-content', 'business-improvement']) {
      expect(readFileSync(join(FN_DIR, fn, 'entitlement.ts'), 'utf8'), fn).toBe(reference);
      for (const file of readdirSync(join(FN_DIR, fn))) {
        expect(readFileSync(join(FN_DIR, fn, file), 'utf8'), `${fn}/${file}`).not.toMatch(/analyze-website|safeHttp|urlSafety/);
      }
    }
    expect(readFileSync(join(AW, 'index.ts'), 'utf8')).toContain('requirePremium(req, "analyze-website", corsHeaders)');
  });

  it('33 the 14 retired functions are byte-identical to the A2.1 stub', () => {
    const retired = ['analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content', 'generate-business-audit',
      'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description', 'generate-geo-audit', 'generate-pitch',
      'generate-seo', 'generate-voice-script', 'scan-directories', 'simulate-campaign'];
    for (const fn of retired) {
      const hash = createHash('sha256').update(readFileSync(join(FN_DIR, fn, 'index.ts'))).digest('hex');
      expect(hash, fn).toBe('4d44f063412c92ddd48cdd80fe9c3410a96508bfab9c5b26ae03f86b9c8bd71d');
    }
  });
});
