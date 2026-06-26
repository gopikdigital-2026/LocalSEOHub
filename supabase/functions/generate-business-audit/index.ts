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
    const { businessType, avgTicket, starProduct, mainChallenge } = await req.json();

    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ticketLabel = avgTicket ? `${avgTicket}€` : "no indicado";
    const prompt = `Eres un consultor de estrategia empresarial experto en negocios locales y pymes. Genera una auditoría de negocio personalizada.

Datos del negocio:
- Tipo / Sector: ${businessType || "Negocio local"}
- Ticket Medio: ${ticketLabel}
- Producto Estrella: ${starProduct || "no indicado"}
- Mayor reto actual: ${mainChallenge || "Atraer nuevos clientes"}

Devuelve EXACTAMENTE este JSON (sin markdown, sin texto adicional):
{
  "swot": {
    "fortalezas": ["<fortaleza específica 1>", "<fortaleza específica 2>", "<fortaleza específica 3>"],
    "debilidades": ["<debilidad específica 1>", "<debilidad específica 2>", "<debilidad específica 3>"],
    "oportunidades": ["<oportunidad específica 1>", "<oportunidad específica 2>", "<oportunidad específica 3>"],
    "amenazas": ["<amenaza específica 1>", "<amenaza específica 2>", "<amenaza específica 3>"]
  },
  "tips": [
    {
      "title": "<título breve del consejo>",
      "description": "<descripción táctica de 2-3 frases con acciones muy concretas y aplicables>",
      "roi": "<estimación realista como +12% facturación>"
    },
    {
      "title": "<título breve del consejo>",
      "description": "<descripción táctica de 2-3 frases con acciones muy concretas y aplicables>",
      "roi": "<estimación realista>"
    },
    {
      "title": "<título breve del consejo>",
      "description": "<descripción táctica de 2-3 frases con acciones muy concretas y aplicables>",
      "roi": "<estimación realista>"
    }
  ]
}

Los 3 consejos deben ser directamente relevantes para resolver el reto "${mainChallenge}" en el sector "${businessType}". Sé específico y accionable. Responde en español.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.65,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "{}";

    let result: Record<string, unknown> = {};
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      result = {
        swot: {
          fortalezas: ["Conocimiento profundo del sector local", "Atención personalizada al cliente", "Flexibilidad y adaptabilidad operativa"],
          debilidades: ["Presencia digital limitada", "Dependencia de canales tradicionales", "Recursos de marketing escasos"],
          oportunidades: ["Crecimiento del consumo local consciente", "Digitalización accesible para pymes", "Nuevos canales de venta online"],
          amenazas: ["Competencia de grandes plataformas online", "Cambios en hábitos de consumo", "Presión en márgenes por inflación"],
        },
        tips: [
          {
            title: "Domina Google Business Profile",
            description: "Actualiza tu ficha con fotos profesionales, responde a todas las reseñas y publica una novedad semanal. Los perfiles completos reciben hasta 7 veces más clics que los incompletos.",
            roi: "+18% visibilidad local",
          },
          {
            title: "Implementa un programa de fidelización",
            description: "Crea una tarjeta de sellos digital o un descuento exclusivo para clientes recurrentes. Ofrecer un 10% en la quinta compra aumenta la frecuencia de visita sin sacrificar margen.",
            roi: "+22% tasa de retención",
          },
          {
            title: "Crea un pack premium de tu producto estrella",
            description: "Combina tu producto estrella con servicios complementarios en un bundle de valor añadido. Aumenta el precio percibido sin incrementar los costes operativos más de un 15%.",
            roi: "+15% ticket medio",
          },
        ],
      };
    }

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
