import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Actúas como un especialista en relaciones públicas y SEO local. Redacta una plantilla de correo persuasiva, profesional y muy atractiva para convencer al dueño del portal web [portal_web] de incluir al negocio del usuario (mencionando su valor único y producto estrella) en su lista o artículo. El objetivo final es ganar un enlace y una citación semántica para que los modelos LLM (ChatGPT, Perplexity) empiecen a recomendar este negocio automáticamente.

Formato de respuesta:
- Escribe directamente el correo en Markdown (usa **negrita** para asunto y partes clave, > para citas si procede)
- Empieza con una línea "**Asunto:** ..." seguida de una línea en blanco
- El cuerpo del correo debe tener 3-4 párrafos bien estructurados: gancho inicial, propuesta de valor, llamada a la acción concreta y cierre profesional
- Usa un tono cálido, directo y persuasivo — nunca genérico ni corporativo frío
- Personaliza en profundidad con el portal, el negocio, el sector y la ciudad
- Al final incluye una sección "**P.D.:**" con un dato de autoridad (ej: número de valoraciones, años de experiencia, o resultado concreto) que refuerce la credibilidad del negocio
- Total: entre 220 y 320 palabras`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { portalName, portalDomain, portalType, businessName, sector, city, starProduct } = await req.json();

    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typeLabels: Record<string, string> = {
      ranking: "lista de clasificación (tipo 'Los mejores de...')",
      blog: "blog de autoridad del sector",
      directory: "directorio de negocios",
      news: "medio de prensa digital local",
    };
    const portalTypeLabel = typeLabels[portalType] ?? "portal de referencia";

    const userMessage = `Portal de destino:
- Nombre del portal: ${portalName}
- Dominio: ${portalDomain}
- Tipo de portal: ${portalTypeLabel}

Negocio que quiere aparecer:
- Nombre del negocio: ${businessName || "Mi negocio"}
- Sector: ${sector || "negocio local"}
- Ciudad: ${city || "España"}
- Producto o servicio estrella: ${starProduct || "no indicado"}

Redacta el pitch de infiltración siguiendo las instrucciones del sistema. Sustituye los marcadores [portal_web] por "${portalName} (${portalDomain})".`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.72,
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const pitch = data.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ pitch }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
