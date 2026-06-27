import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Actúas como un analista de inteligencia competitiva local especializado en SEO y marketing digital. Se te proporcionará el contenido HTML extraído del sitio web de un competidor junto con su URL. Tu misión es analizar estratégicamente ese negocio y devolver un JSON estricto (sin markdown exterior, sin texto extra) con esta estructura exacta:

{
  "detectedName": "<nombre del negocio detectado o dominio si no se infiere>",
  "detectedThreat": "<high|medium|low>",
  "keywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>", "<kw5>", "<kw6>", "<kw7>", "<kw8>"],
  "activityIndex": {
    "score": <número entero 0-100>,
    "seoOptimization": "<Alta|Media|Baja>",
    "contentFreshness": "<Alta|Media|Baja>",
    "onlinePresence": "<Alta|Media|Baja>",
    "callsToAction": "<Presente|Ausente>",
    "summary": "<una frase concisa que resume el nivel de actividad digital>"
  },
  "content": "<informe táctico completo en Markdown con estas secciones:\\n## 1. Perfil del Negocio\\n## 2. Fortalezas Detectadas\\n## 3. Debilidades y Puntos de Ataque\\n## 4. Nivel de Amenaza\\n## 5. Plan de Contraataque (3 acciones inmediatas)\\n## 6. Plantilla de Respuesta Lista para Copiar>"
}

Reglas para keywords: extrae entre 6 y 8 palabras clave SEO reales detectadas en la web del competidor (servicios, ubicación, palabras frecuentes). En español.
Reglas para activityIndex.score: 0-30 = presencia digital muy débil, 31-55 = básica, 56-75 = moderada, 76-90 = fuerte, 91-100 = excelente.
Reglas para detectedThreat: high = score>75 o muchas fortalezas, medium = score 40-75, low = score<40.
Responde siempre en español. El campo "content" debe ser Markdown válido embebido como string JSON (escapa los saltos de línea con \\n).`;

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

Devuelve el JSON completo siguiendo exactamente la estructura del system prompt.`;

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        response_format: { type: "json_object" },
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
    const raw = data.choices?.[0]?.message?.content ?? "{}";

    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(raw);
    } catch {
      result = {};
    }

    const content = (result.content as string) ?? "";
    const detectedThreat = (result.detectedThreat as string) ?? "medium";
    const detectedName = (result.detectedName as string) || pageData.title || url.replace(/https?:\/\/(www\.)?/, "").split("/")[0];
    const keywords = Array.isArray(result.keywords) ? (result.keywords as string[]) : [];
    const activityIndex = (result.activityIndex as Record<string, unknown>) ?? { score: 50 };

    return new Response(
      JSON.stringify({ content, detectedThreat, detectedName, keywords, activityIndex }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
