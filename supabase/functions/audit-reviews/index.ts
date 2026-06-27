import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function extractBusinessHint(url: string): string {
  try {
    // Google Maps URLs often contain business name in the path
    // e.g. https://maps.google.com/maps/place/Mi+Negocio+Barcelona/...
    const decoded = decodeURIComponent(url);
    const placeMatch = decoded.match(/\/place\/([^/@]+)/);
    if (placeMatch) {
      return placeMatch[1].replace(/\+/g, ' ').replace(/_/g, ' ');
    }
    const queryMatch = decoded.match(/[?&]q=([^&]+)/);
    if (queryMatch) return queryMatch[1].replace(/\+/g, ' ');
    return '';
  } catch {
    return '';
  }
}

const SYSTEM_PROMPT = `Eres un analista experto en reseñas de negocios locales españoles. Se te proporciona un enlace de Google Maps y/o el nombre del negocio inferido. Tu tarea es generar un análisis de reseñas realista y específico para ese tipo de negocio, basándote en patrones reales de reseñas de Google Maps en España.

El análisis debe ser coherente con el tipo de negocio (peluquería, restaurante, dentista, fontanero, gimnasio, etc.). Devuelve EXACTAMENTE este JSON sin bloques de código ni markdown exterior:

{
  "businessName": "<nombre inferido del negocio o tipo de negocio>",
  "totalReviewsEstimate": <número estimado realista de reseñas, entre 15 y 850>,
  "avgRating": "<ej: 4.2>",
  "sentiment": {
    "positive": <número entero 0-100, porcentaje positivo>,
    "negative": <número entero 0-100, porcentaje negativo — debe sumar 100 con positive>,
    "label": "<Predominantemente Positivo|Mixto|Predominantemente Negativo>",
    "summary": "<2 frases resumiendo el sentimiento general, con tono analítico y específico al negocio>"
  },
  "praised": [
    {
      "concept": "<concepto elogiado 1 — específico, ej: Trato del personal, No genérico>",
      "frequency": "<muy frecuente|frecuente|ocasional>",
      "score": <1-10, relevancia del elogio>,
      "examplePhrase": "<frase de ejemplo que podría aparecer en reseñas reales, en español, entre comillas>"
    },
    { "concept": "...", "frequency": "...", "score": 0, "examplePhrase": "..." },
    { "concept": "...", "frequency": "...", "score": 0, "examplePhrase": "..." }
  ],
  "criticized": [
    {
      "concept": "<concepto criticado 1 — específico al tipo de negocio>",
      "frequency": "<frecuente|ocasional|raro>",
      "severity": <1-10, impacto en la valoración>,
      "examplePhrase": "<frase de ejemplo de crítica real, entre comillas>",
      "improvement": "<sugerencia concreta de mejora en 1 frase>"
    },
    { "concept": "...", "frequency": "...", "severity": 0, "examplePhrase": "...", "improvement": "..." },
    { "concept": "...", "frequency": "...", "severity": 0, "examplePhrase": "...", "improvement": "..." }
  ],
  "competitiveAlert": "<1 frase indicando el riesgo competitivo principal derivado de las críticas>"
}

Reglas:
- praised y criticized deben tener EXACTAMENTE 3 elementos cada uno.
- Los conceptos deben ser específicos del sector, no genéricos. Ejemplos malos: "buen servicio", "mala atención". Ejemplos buenos: "Rapidez en la entrega de pedidos", "Ruido ambiental excesivo en hora punta", "Profesionalidad en diagnósticos".
- positive + negative = 100 siempre.
- avgRating debe ser coherente con el sentimiento (positivo alto → rating 4.0–4.9, mixto → 3.2–4.0, negativo → 2.0–3.2).
- Responde en español.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { mapsUrl } = await req.json();

    if (!mapsUrl?.trim()) {
      return new Response(JSON.stringify({ error: "mapsUrl es requerido" }), {
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

    const businessHint = extractBusinessHint(mapsUrl);

    const userMessage = `Analiza las reseñas de este negocio:

URL de Google Maps: ${mapsUrl}
Nombre/pista inferida del negocio: ${businessHint || "(no detectado — infiere por el contexto de la URL)"}

Genera el análisis de reseñas estructurado en JSON.`;

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
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
