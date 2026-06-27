import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un experto en SEO local y copywriting para Google Business Profile en España. Tu misión es generar una descripción de ficha ultra-optimizada para un negocio local.

Se te proporciona:
- Nombre y tipo de negocio
- Sus puntos elogiados (fortalezas reales percibidas por clientes)
- Sus puntos criticados (debilidades detectadas en reseñas)
- Valoración media

Tu tarea es crear una descripción que:
1. REFUERCE las fortalezas elogiadas (menciónalo de forma natural y creíble)
2. CORRIJA sutilmente cada crítica con una "keyword correctora": si critican lentitud → usa "servicio ágil"; si critican precios → usa "relación calidad-precio inmejorable"; si critican limpieza → usa "instalaciones impolutas"; si critican ruido → usa "ambiente tranquilo y cuidado"; etc. NUNCA menciones la crítica directamente.
3. Incluya palabras clave de búsqueda local (sector + ciudad implícita o genérica)
4. Sea entre 220 y 280 palabras — ni más ni menos
5. Tenga una estructura: gancho inicial + propuesta de valor + servicios clave + diferenciadores correctores + CTA final
6. Suene 100% natural, nada robótico ni corporativo

Devuelve EXACTAMENTE este JSON sin bloques de código ni markdown exterior:

{
  "description": "<descripción completa, 220-280 palabras, en español>",
  "correctedConcepts": [
    { "criticism": "<crítica detectada>", "corrector": "<keyword correctora usada>", "phrase": "<frase exacta de la descripción donde aparece>" },
    ...
  ],
  "seoKeywords": ["<keyword 1>", "<keyword 2>", "<keyword 3>", "<keyword 4>", "<keyword 5>"]
}

Reglas:
- correctedConcepts debe tener una entrada por CADA concepto criticado recibido.
- seoKeywords: 5 palabras clave de búsqueda local específicas del sector, sin mencionar ciudad concreta.
- La descripción debe poder copiarse directamente a Google Business Profile.
- Responde en español.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { businessName, avgRating, praised, criticized } = await req.json();

    if (!businessName || !criticized?.length) {
      return new Response(JSON.stringify({ error: "businessName y criticized son requeridos" }), {
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

    const praisedList = (praised ?? [])
      .map((p: { concept: string; frequency: string }) => `- ${p.concept} (${p.frequency})`)
      .join("\n");

    const criticizedList = (criticized ?? [])
      .map((c: { concept: string; severity: number; improvement: string }) =>
        `- ${c.concept} (severidad ${c.severity}/10) → mejora sugerida: ${c.improvement}`)
      .join("\n");

    const userMessage = `Genera la descripción GBP optimizada para este negocio:

**Nombre del negocio:** ${businessName}
**Valoración media en Google:** ${avgRating ?? "no disponible"}

**Puntos MÁS ELOGIADOS por clientes (REFORZAR):**
${praisedList || "No disponible"}

**Puntos MÁS CRITICADOS (CORREGIR sutilmente con keywords correctoras):**
${criticizedList || "No disponible"}

Genera la descripción de Google Business Profile ultra-optimizada con las correcciones de imagen indicadas.`;

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
    try { result = JSON.parse(raw); } catch { result = {}; }

    return new Response(JSON.stringify(result), {
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
