import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Actúas como un estratega de guerrilla de marketing local. Analiza el movimiento del competidor que se te proporciona (ej: subida repentina de reseñas, cambio de palabras clave o posts diarios) y genera una contramedida exacta, rápida y económica de implementar para el usuario (ej: enviar un cupón por WhatsApp, publicar un post SEO específico o pedir reseñas a clientes pasados). Devuelve la respuesta en Markdown limpio y estructurado con los puntos: 1. Diagnóstico de la Amenaza, 2. Plan de Acción Inmediato, 3. Plantilla de Texto Lista para Copiar. Responde siempre en español.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { city, rivalName, category, lastMove, threatLevel } = await req.json();

    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cityContext = city ? ` en ${city}` : "";
    const userMessage = `**Ciudad del negocio afectado:** ${city || "No especificada"}
**Competidor detectado:** ${rivalName} (${category})
**Nivel de amenaza:** ${threatLevel === "high" ? "ALTO" : threatLevel === "medium" ? "MEDIO" : "BAJO"}
**Movimiento detectado:** ${lastMove}

Analiza esta situación competitiva${cityContext} y genera la contramedida de guerrilla marketing local siguiendo exactamente la estructura de 3 puntos solicitada. Sé directo, específico y accionable.`;

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
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

    return new Response(JSON.stringify({ content }), {
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
