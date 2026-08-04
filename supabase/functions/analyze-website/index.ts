import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "URL requerida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "URL no valida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const errors: string[] = [];
    let statusCode = 0;
    let html = "";

    // Fetch the main page
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(parsedUrl.href, {
        signal: controller.signal,
        headers: {
          "User-Agent": "LocalSEOHub-Analyzer/1.0",
          "Accept": "text/html",
        },
        redirect: "follow",
      });
      clearTimeout(timeout);

      statusCode = response.status;
      html = await response.text();

      if (statusCode >= 400) {
        errors.push(`HTTP ${statusCode}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de conexion";
      errors.push(msg);
      return new Response(
        JSON.stringify({
          url: parsedUrl.href,
          statusCode: 0,
          https: parsedUrl.protocol === "https:",
          title: null,
          metaDescription: null,
          h1: null,
          hasRobotsTxt: false,
          hasSitemap: false,
          canonical: null,
          hasSchema: false,
          analyzedAt: new Date().toISOString(),
          errors: [msg],
          confidence: "estimated",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse HTML content
    const title = extractTag(html, "title");
    const metaDescription = extractMeta(html, "description");
    const h1 = extractTag(html, "h1");
    const canonical = extractLink(html, "canonical");
    const hasSchema =
      html.includes("application/ld+json") ||
      html.includes("itemtype=") ||
      html.includes("itemscope");

    // Check robots.txt
    let hasRobotsTxt = false;
    try {
      const robotsUrl = `${parsedUrl.origin}/robots.txt`;
      const r = await fetch(robotsUrl, {
        headers: { "User-Agent": "LocalSEOHub-Analyzer/1.0" },
      });
      hasRobotsTxt = r.ok && (await r.text()).length > 10;
    } catch {
      // robots.txt not accessible
    }

    // Check sitemap.xml
    let hasSitemap = false;
    try {
      const sitemapUrl = `${parsedUrl.origin}/sitemap.xml`;
      const s = await fetch(sitemapUrl, {
        headers: { "User-Agent": "LocalSEOHub-Analyzer/1.0" },
      });
      if (s.ok) {
        const body = await s.text();
        hasSitemap = body.includes("<urlset") || body.includes("<sitemapindex");
      }
    } catch {
      // sitemap not accessible
    }

    const result = {
      url: parsedUrl.href,
      statusCode,
      https: parsedUrl.protocol === "https:",
      title,
      metaDescription,
      h1,
      hasRobotsTxt,
      hasSitemap,
      canonical,
      hasSchema,
      analyzedAt: new Date().toISOString(),
      errors,
      confidence: errors.length > 0 ? "estimated" : "verified",
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractTag(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = html.match(regex);
  return match ? match[1].trim().replace(/\s+/g, " ").slice(0, 500) : null;
}

function extractMeta(html: string, name: string): string | null {
  const regex = new RegExp(
    `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(regex);
  if (match) return match[1].trim().slice(0, 500);

  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`,
    "i"
  );
  const match2 = html.match(regex2);
  return match2 ? match2[1].trim().slice(0, 500) : null;
}

function extractLink(html: string, rel: string): string | null {
  const regex = new RegExp(
    `<link[^>]*rel=["']${rel}["'][^>]*href=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(regex);
  if (match) return match[1].trim();

  const regex2 = new RegExp(
    `<link[^>]*href=["']([^"']*)["'][^>]*rel=["']${rel}["']`,
    "i"
  );
  const match2 = html.match(regex2);
  return match2 ? match2[1].trim() : null;
}
