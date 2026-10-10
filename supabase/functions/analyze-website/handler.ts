import { safeGet, type NetDeps } from './safeHttp.ts';
import { checkUrl, SafeFetchError, type FetchErrorCode } from './urlSafety.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export const ANALYSIS_LIMITS = {
  TOTAL_MS: 25_000,
  PAGE_TIMEOUT_MS: 10_000,
  SECONDARY_TIMEOUT_MS: 5_000,
  PAGE_MAX_BYTES: 2 * 1024 * 1024,
  ROBOTS_MAX_BYTES: 64 * 1024,
  SITEMAP_MAX_BYTES: 256 * 1024,
  SECONDARY_RESOURCES: ['/robots.txt', '/sitemap.xml'] as const,
};

const FAILURES: Record<FetchErrorCode, { status: number; message: string }> = {
  invalid_url: { status: 400, message: 'La dirección no es válida. Escribe la web completa, por ejemplo https://tunegocio.com' },
  blocked: { status: 400, message: 'Esta dirección no se puede analizar por motivos de seguridad. Usa la web pública de tu negocio.' },
  dns_failed: { status: 422, message: 'No hemos podido comprobar ese dominio. Revisa que esté bien escrito e inténtalo de nuevo.' },
  dns_empty: { status: 422, message: 'Ese dominio no existe o no tiene una web publicada. Revisa que esté bien escrito.' },
  connect_failed: { status: 502, message: 'La web no responde. Comprueba que está publicada e inténtalo más tarde.' },
  tls_failed: { status: 502, message: 'La web no tiene una conexión segura (HTTPS) válida. Revisa su certificado.' },
  bad_response: { status: 502, message: 'La web ha devuelto una respuesta que no podemos leer.' },
  timeout: { status: 504, message: 'La web tarda demasiado en responder. Inténtalo de nuevo más tarde.' },
  too_large: { status: 422, message: 'La página es demasiado grande para analizarla (máximo 2 MB).' },
  too_many_redirects: { status: 422, message: 'La web redirige demasiadas veces. Prueba con la dirección final de tu web.' },
  redirect_loop: { status: 422, message: 'La web redirige en bucle. Prueba con la dirección final de tu web.' },
  off_site_redirect: { status: 422, message: 'La web redirige a otro sitio. Prueba con la dirección final de tu web.' },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function failure(code: FetchErrorCode): Response {
  const f = FAILURES[code];
  return json({ error: f.message, code }, f.status);
}

async function fetchSecondary(origin: URL, path: string, maxBytes: number, deadline: number, deps: NetDeps): Promise<string | null> {
  try {
    const res = await safeGet(`${origin.origin}${path}`, {
      maxBytes,
      timeoutMs: ANALYSIS_LIMITS.SECONDARY_TIMEOUT_MS,
      deadline,
      truncate: true,
      sameSiteAs: origin.hostname,
    }, deps);
    return res.status >= 200 && res.status < 300 ? res.body : null;
  } catch {
    return null;
  }
}

export async function analyze(rawUrl: unknown, deps: NetDeps): Promise<Response> {
  if (!rawUrl || typeof rawUrl !== 'string') return json({ error: 'URL requerida' }, 400);

  let target: URL;
  try {
    target = checkUrl(rawUrl);
  } catch (err) {
    return failure(err instanceof SafeFetchError ? err.code : 'invalid_url');
  }

  const deadline = deps.now() + ANALYSIS_LIMITS.TOTAL_MS;
  let statusCode: number;
  let html: string;
  try {
    const page = await safeGet(target.href, {
      maxBytes: ANALYSIS_LIMITS.PAGE_MAX_BYTES,
      timeoutMs: ANALYSIS_LIMITS.PAGE_TIMEOUT_MS,
      deadline,
      accept: 'text/html,application/xhtml+xml',
    }, deps);
    statusCode = page.status;
    html = page.body;
  } catch (err) {
    if (err instanceof SafeFetchError) return failure(err.code);
    throw err;
  }

  const errors: string[] = statusCode >= 400 ? [`HTTP ${statusCode}`] : [];
  const robots = await fetchSecondary(target, '/robots.txt', ANALYSIS_LIMITS.ROBOTS_MAX_BYTES, deadline, deps);
  const sitemap = await fetchSecondary(target, '/sitemap.xml', ANALYSIS_LIMITS.SITEMAP_MAX_BYTES, deadline, deps);

  return json({
    url: target.href,
    statusCode,
    https: target.protocol === 'https:',
    title: extractTag(html, 'title'),
    metaDescription: extractMeta(html, 'description'),
    h1: extractTag(html, 'h1'),
    hasRobotsTxt: robots !== null && robots.length > 10,
    hasSitemap: sitemap !== null && (sitemap.includes('<urlset') || sitemap.includes('<sitemapindex')),
    canonical: extractLink(html, 'canonical'),
    hasSchema: html.includes('application/ld+json') || html.includes('itemtype=') || html.includes('itemscope'),
    analyzedAt: new Date(deps.now()).toISOString(),
    errors,
    confidence: errors.length > 0 ? 'estimated' : 'verified',
  });
}

function extractTag(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim().replace(/\s+/g, ' ').slice(0, 500) : null;
}

function extractMeta(html: string, name: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i'));
  return match ? match[1].trim().slice(0, 500) : null;
}

function extractLink(html: string, rel: string): string | null {
  const match = html.match(new RegExp(`<link[^>]*rel=["']${rel}["'][^>]*href=["']([^"']*)["']`, 'i'))
    ?? html.match(new RegExp(`<link[^>]*href=["']([^"']*)["'][^>]*rel=["']${rel}["']`, 'i'));
  return match ? match[1].trim() : null;
}
