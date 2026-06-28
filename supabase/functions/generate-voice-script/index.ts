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
    const { businessName, specialty, city, scenario, assistant } = await req.json();

    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const businessLabel  = businessName?.trim()  || "Mi negocio";
    const specialtyLabel = specialty?.trim()      || "establecimiento local";
    const cityLabel      = city?.trim()           || "tu ciudad";
    const scenarioLabel  = scenario               || "Busca un negocio local recomendado";
    const assistantLabel = assistant              || "asistente de voz";

    const systemPrompt = `Eres la voz oficial de ${assistantLabel}, un asistente de conducción inteligente en 2026. Basándote en el perfil del negocio y la consulta del usuario, redacta un monólogo de 30 segundos fluido y conversacional explicando por qué recomiendas (o por qué no puedes recomendar aún debido a falta de datos) este local. El tono debe ser directo, útil y natural (ej: "He encontrado Cafetería Toledo a 2 minutos de tu ruta. Los usuarios destacan que tiene enchufes y el ambiente es calmado para trabajar..."). Devuelve la respuesta en un JSON con la clave "voice_script".`;

    const userPrompt = `Perfil del negocio:
- Nombre: ${businessLabel}
- Especialidad / Tipo: ${specialtyLabel}
- Ciudad: ${cityLabel}

Consulta del conductor: "${scenarioLabel}"

Genera el monólogo de recomendación de voz para este negocio. Sé específico con el nombre y la especialidad. Si los datos son muy genéricos, menciona que el negocio aún no tiene suficiente información indexada y explica qué necesita mejorar.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "{}";

    let parsed: { voice_script?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { voice_script: raw };
    }

    const voice_script = parsed.voice_script ?? raw;

    return new Response(JSON.stringify({ voice_script }), {
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
