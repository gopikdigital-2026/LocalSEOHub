import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Actúas como un analista de inteligencia competitiva local especializado en SEO y marketing digital. Se te proporcionará el contenido HTML extraído del sitio web de un competidor junto con su URL. Tu misión es analizar estratégicamente ese negocio y devolver un informe táctico en Markdown estructurado con exactamente estas secciones:

## 1. Perfil del Negocio
Nombre detectado, tipo de negocio, ubicación si se infiere, servicios principales.

## 2. Fortalezas Detectadas
Qué está haciendo bien este competidor (SEO on-page, presencia digital, propuesta de valor, etc.).

## 3. Debilidades y Puntos de Ataque
Carencias detectadas que tú puedes explotar: keywords ausentes, diseño anticuado, falta de reseñas visibles, sin schema markup, etc.

## 4. Nivel de Amenaza
Clasifica como ALTO, MEDIO o BAJO con justificación breve.

## 5. Plan de Contraataque (3 acciones inmediatas)
Tres acciones concretas, económicas y rápidas de implementar para superar a este competidor.

## 6. Plantilla de Respuesta Lista para Copiar
Un texto corto (post de Google, WhatsApp o email) que el usuario puede copiar y usar hoy mismo para diferenciarse.

Responde siempre en español. Sé directo, específico y accionable.`;

async function fetchPageContent(url: string): Promise<{ title: string; description: string; bodyText: string; h1s: string[]; h2s: string[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CompetitorRadarBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)
      ?? html.match(/<meta[^>]*content=["']([^"']*)[^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : "";

    const h1s: string[] = [];
    const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
    let h1Match;
    while ((h1Match = h1Regex.exec(html)) !== null && h1s.length < 5) {
      h1s.push(h1Match[1].replace(/<[^>]*>/g, "").trim());
    }

    const h2s: string[] = [];
    const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    let h2Match;
    while ((h2Match = h2Regex.exec(html)) !== null && h2s.length < 8) {
      h2s.push(h2Match[1].replace(/<[^>]*>/g, "").trim());
    }

    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const bodyText = stripped.slice(0, 3000);

    return { title, description, bodyText, h1s, h2s };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { url, city } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL requerida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pageData: { title: string; description: string; bodyText: string; h1s: string[]; h2s: string[] };
    let fetchError = "";
    try {
      pageData = await fetchPageContent(url);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : "No se pudo acceder al sitio";
      pageData = { title: "", description: "", bodyText: "", h1s: [], h2s: [] };
    }

    const userMessage = `**URL del competidor:** ${url}
**Ciudad de referencia:** ${city || "No especificada"}
${fetchError ? `**Nota:** No se pudo acceder al sitio (${fetchError}). Analiza basándote solo en la URL y el dominio.` : ""}

**Título de la página:** ${pageData.title || "No detectado"}
**Meta descripción:** ${pageData.description || "No detectada"}
**Encabezados H1:** ${pageData.h1s.length ? pageData.h1s.join(" | ") : "No detectados"}
**Encabezados H2:** ${pageData.h2s.length ? pageData.h2s.join(" | ") : "No detectados"}
**Contenido de la página (fragmento):**
${pageData.bodyText || "No disponible"}

Genera el informe completo de inteligencia competitiva según las instrucciones.`;

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!openAIRes.ok) {
      const errText = await openAIRes.text();
      throw new Error(`OpenAI error ${openAIRes.status}: ${errText}`);
    }

    const data = await openAIRes.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    const threatMatch = content.match(/ALTO|MEDIO|BAJO/i);
    const detectedThreat = threatMatch
      ? (threatMatch[0].toUpperCase() === "ALTO" ? "high" : threatMatch[0].toUpperCase() === "MEDIO" ? "medium" : "low")
      : "medium";

    const nameMatch = pageData.title || url.replace(/https?:\/\/(www\.)?/, "").split("/")[0];

    return new Response(JSON.stringify({ content, detectedThreat, detectedName: nameMatch }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
