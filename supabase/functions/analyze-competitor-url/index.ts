import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un analista de inteligencia competitiva local de élite especializado en SEO, marketing digital y estrategia de contenidos. Recibes el contenido extraído del sitio web de un competidor y debes devolver un JSON estricto (sin texto extra, sin bloques de código, sin markdown exterior) con esta estructura exacta:

{
  "detectedName": "<nombre del negocio o dominio>",
  "detectedThreat": "<high|medium|low>",
  "keywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>", "<kw5>", "<kw6>", "<kw7>", "<kw8>"],
  "activityIndex": {
    "score": <0-100>,
    "seoOptimization": "<Alta|Media|Baja>",
    "contentFreshness": "<Alta|Media|Baja>",
    "onlinePresence": "<Alta|Media|Baja>",
    "callsToAction": "<Presente|Ausente>",
    "summary": "<una frase concisa sobre el nivel de actividad digital>"
  },
  "contentFocus": "<párrafo de 2-3 frases describiendo su enfoque de contenidos local: qué temas prioriza, qué ángulo usa para captar clientes locales, cómo se posiciona en el mercado>",
  "keyReviews": [
    "<reseña simulada 1: escribe como si fuera un cliente real de ese negocio, destacando su punto fuerte percibido, 1-2 frases>",
    "<reseña simulada 2: otro tipo de cliente, perspectiva diferente, 1-2 frases>",
    "<reseña simulada 3: menciona algo específico del negocio que lo haría memorable, 1-2 frases>"
  ],
  "positioningWeaknesses": [
    { "title": "<título corto de la debilidad 1>", "description": "<descripción accionable de 1-2 frases de cómo explotar esta debilidad>", "opportunity": "<palabra clave o acción específica de oportunidad>" },
    { "title": "<título corto de la debilidad 2>", "description": "<descripción accionable>", "opportunity": "<oportunidad específica>" },
    { "title": "<título corto de la debilidad 3>", "description": "<descripción accionable>", "opportunity": "<oportunidad específica>" }
  ],
  "contentRecommendation": {
    "strategy": "<párrafo de 2-3 frases con la estrategia de contenidos recomendada para superar a este rival en búsquedas locales>",
    "actions": [
      "<acción de contenido concreta 1, empieza con verbo de acción>",
      "<acción de contenido concreta 2>",
      "<acción de contenido concreta 3>"
    ],
    "samplePost": "<texto de ejemplo listo para copiar y publicar (Google Business, WhatsApp o redes sociales) que diferencia tu negocio del rival analizado, máx. 3 frases>"
  },
  "content": "<informe táctico completo en Markdown con secciones: ## 1. Perfil del Negocio\\n## 2. Fortalezas Detectadas\\n## 3. Debilidades y Puntos de Ataque\\n## 4. Nivel de Amenaza\\n## 5. Plan de Contraataque (3 acciones)\\n## 6. Plantilla de Respuesta>"
}

Reglas críticas:
- keywords: 6-8 palabras clave SEO reales del sitio (servicios, ubicación, términos frecuentes)
- activityIndex.score: 0-30 presencia muy débil, 31-55 básica, 56-75 moderada, 76-90 fuerte, 91-100 excelente
- detectedThreat: high si score>75 o muchas fortalezas SEO; medium si 40-75; low si <40
- keyReviews: inventa 3 reseñas VEROSÍMILES basadas en lo que el negocio ofrece (como si fueran de Google Maps)
- positioningWeaknesses: identifica gaps reales — keywords no usadas, falta de contenido local, ausencia de schema, sin blog, pocas reseñas visibles, etc.
- contentRecommendation.samplePost: texto directamente usable, que NO mencione al rival por nombre
- Todo en español. El campo "content" usa \\n para saltos de línea (JSON válido).`;

async function fetchPageContent(url: string): Promise<{ title: string; description: string; bodyText: string; h1s: string[]; h2s: string[]; metaKeywords: string }> {
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

    const kwMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)/i);
    const metaKeywords = kwMatch ? kwMatch[1].trim() : "";

    const h1s: string[] = [];
    const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
    let m;
    while ((m = h1Regex.exec(html)) !== null && h1s.length < 5)
      h1s.push(m[1].replace(/<[^>]*>/g, "").trim());

    const h2s: string[] = [];
    const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    while ((m = h2Regex.exec(html)) !== null && h2s.length < 8)
      h2s.push(m[1].replace(/<[^>]*>/g, "").trim());

    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 3000);

    return { title, description, bodyText, h1s, h2s, metaKeywords };
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

    let pageData: { title: string; description: string; bodyText: string; h1s: string[]; h2s: string[]; metaKeywords: string };
    let fetchError = "";
    try {
      pageData = await fetchPageContent(url);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : "No se pudo acceder al sitio";
      pageData = { title: "", description: "", bodyText: "", h1s: [], h2s: [], metaKeywords: "" };
    }

    const userMessage = `**URL del competidor:** ${url}
**Ciudad de referencia:** ${city || "No especificada"}
${fetchError ? `**NOTA:** No se pudo acceder al sitio web (${fetchError}). Simula el análisis basándote en la URL, el dominio y el contexto del sector inferido.` : ""}

**Título de la página:** ${pageData.title || "No detectado"}
**Meta descripción:** ${pageData.description || "No detectada"}
**Meta keywords:** ${pageData.metaKeywords || "No detectadas"}
**Encabezados H1:** ${pageData.h1s.length ? pageData.h1s.join(" | ") : "No detectados"}
**Encabezados H2:** ${pageData.h2s.length ? pageData.h2s.join(" | ") : "No detectados"}
**Contenido visible de la página:**
${pageData.bodyText || "No disponible — analiza por URL"}

Genera el análisis completo siguiendo exactamente el schema JSON del system prompt.`;

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.65,
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
    try { result = JSON.parse(raw); } catch { result = {}; }

    return new Response(
      JSON.stringify({
        content: (result.content as string) ?? "",
        detectedThreat: (result.detectedThreat as string) ?? "medium",
        detectedName: (result.detectedName as string) || pageData.title || url.replace(/https?:\/\/(www\.)?/, "").split("/")[0],
        keywords: Array.isArray(result.keywords) ? result.keywords : [],
        activityIndex: (result.activityIndex as Record<string, unknown>) ?? { score: 50 },
        contentFocus: (result.contentFocus as string) ?? "",
        keyReviews: Array.isArray(result.keyReviews) ? result.keyReviews : [],
        positioningWeaknesses: Array.isArray(result.positioningWeaknesses) ? result.positioningWeaknesses : [],
        contentRecommendation: (result.contentRecommendation as Record<string, unknown>) ?? {},
      }),
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
