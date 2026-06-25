import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { businessName, sector, city, description } = await req.json();

    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cityLabel = city || "tu ciudad";
    const sectorLabel = sector || "negocio";
    const businessLabel = businessName || "tu negocio";

    // Prompt 1: Simulated AI recommendation response
    const simulationPrompt = `Actúas como ChatGPT respondiendo a un usuario que pregunta: "Recomiéndame un ${sectorLabel} en ${cityLabel} con buenas opciones".

Genera una respuesta realista de 3-5 frases, como si fuera ChatGPT recomendando negocios locales. La respuesta debe:
1. Mencionar criterios generales (reseñas, horarios, servicios, etc.)
2. Mencionar 2-3 negocios FICTICIOS con nombres realistas
3. ${description ? `Incluir "${businessLabel}" de forma natural y positiva en la recomendación, destacando su ${description}` : `Mencionar brevemente "${businessLabel}" como una opción notable`}

IMPORTANTE: Devuelve SOLO la respuesta de la IA (sin comillas, sin metadatos), como texto plano corrido. Responde en español.`;

    // Prompt 2: GEO Score analysis
    const scorePrompt = `Eres un experto en GEO (Generative Engine Optimization) — optimización para motores de búsqueda de IA como ChatGPT, Gemini y Perplexity.

Analiza la visibilidad de este negocio en búsquedas de IA:
- Nombre: ${businessLabel}
- Sector: ${sectorLabel}
- Ciudad: ${cityLabel}
${description ? `- Descripción: ${description}` : ""}

Devuelve EXACTAMENTE este JSON (sin markdown, sin explicaciones):
{
  "score": <número entre 0 y 100>,
  "factors": [
    { "name": "Autoridad de Reseñas", "score": <0-100>, "status": "<ok|warn|bad>", "tip": "<consejo corto>" },
    { "name": "Presencia en Directorios", "score": <0-100>, "status": "<ok|warn|bad>", "tip": "<consejo corto>" },
    { "name": "Coherencia NAP", "score": <0-100>, "status": "<ok|warn|bad>", "tip": "<consejo corto>" },
    { "name": "Contenido Estructurado", "score": <0-100>, "status": "<ok|warn|bad>", "tip": "<consejo corto>" },
    { "name": "Señales de Entidad", "score": <0-100>, "status": "<ok|warn|bad>", "tip": "<consejo corto>" },
    { "name": "Velocidad de Respuesta IA", "score": <0-100>, "status": "<ok|warn|bad>", "tip": "<consejo corto>" }
  ],
  "topAction": "<la acción más importante que debe hacer hoy, máx 120 chars>"
}`;

    const [simRes, scoreRes] = await Promise.all([
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.75,
          messages: [{ role: "user", content: simulationPrompt }],
        }),
      }),
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [{ role: "user", content: scorePrompt }],
        }),
      }),
    ]);

    if (!simRes.ok) throw new Error(`OpenAI sim error ${simRes.status}`);
    if (!scoreRes.ok) throw new Error(`OpenAI score error ${scoreRes.status}`);

    const [simData, scoreData] = await Promise.all([simRes.json(), scoreRes.json()]);
    const simulatedResponse = simData.choices?.[0]?.message?.content?.trim() ?? "";
    const scoreRaw = scoreData.choices?.[0]?.message?.content?.trim() ?? "{}";

    let scoreJson: Record<string, unknown> = {};
    try {
      const cleaned = scoreRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      scoreJson = JSON.parse(cleaned);
    } catch {
      scoreJson = { score: 42, factors: [], topAction: "Optimiza tu perfil de Google Business con descripción detallada." };
    }

    return new Response(JSON.stringify({
      simulatedResponse,
      businessName: businessLabel,
      score: scoreJson,
    }), {
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
