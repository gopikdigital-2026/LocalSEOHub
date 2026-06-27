import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un Consultor Senior de Negocios y Growth Hacker con más de 15 años de experiencia especializado en retail, restauración y servicios locales. Tu metodología combina análisis estratégico riguroso con tácticas de crecimiento creativas, baratas y de alto impacto.

Cuando recibas los datos de un negocio, debes:
1. Analizar en profundidad el sector, el ticket medio, el producto estrella y el cuello de botella principal.
2. Elaborar un análisis DAFO estratégico hiper-localizado, pensando como si conocieras personalmente ese mercado.
3. Proponer 3 growth hacks ultra-específicos, creativos y baratos de implementar que resuelvan directamente el cuello de botella seleccionado.

IMPORTANTE: Devuelve la respuesta ESTRICTAMENTE en este JSON (sin markdown, sin texto adicional):
{
  "dafo": {
    "f": ["<fortaleza específica 1>", "<fortaleza específica 2>", "<fortaleza específica 3>"],
    "d": ["<debilidad específica 1>", "<debilidad específica 2>", "<debilidad específica 3>"],
    "o": ["<oportunidad específica 1>", "<oportunidad específica 2>", "<oportunidad específica 3>"],
    "a": ["<amenaza específica 1>", "<amenaza específica 2>", "<amenaza específica 3>"]
  },
  "tips": [
    {
      "title": "<nombre del growth hack, máx 6 palabras>",
      "description": "<descripción táctica de 3-4 frases: qué hacer exactamente, cómo implementarlo y por qué funciona>",
      "impact_roi_percentage": <número entero estimado del ROI en %, ej: 18>
    },
    {
      "title": "<nombre del growth hack, máx 6 palabras>",
      "description": "<descripción táctica de 3-4 frases>",
      "impact_roi_percentage": <número entero>
    },
    {
      "title": "<nombre del growth hack, máx 6 palabras>",
      "description": "<descripción táctica de 3-4 frases>",
      "impact_roi_percentage": <número entero>
    }
  ]
}`;

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
    const userMessage = `Analiza este negocio y genera la auditoría estratégica:

- Sector / Tipo de negocio: ${businessType || "Negocio local"}
- Ticket Medio: ${ticketLabel}
- Producto Estrella: ${starProduct || "no indicado"}
- Cuello de botella / Mayor reto: ${mainChallenge || "Atraer nuevos clientes"}

Sé hiper-específico para este sector. Los growth hacks deben resolver directamente el reto "${mainChallenge}".`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
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
        dafo: {
          f: ["Conocimiento profundo del cliente local", "Producto estrella con alta demanda", "Flexibilidad operativa de pyme"],
          d: ["Presencia digital limitada o sin optimizar", "Sin sistema de captación de leads activo", "Procesos poco automatizados"],
          o: ["Mercado local poco digitalizado — ventaja competitiva", "Canales de venta online sin explotar", "Potencial de fidelización por suscripción"],
          a: ["Plataformas digitales con mayor presupuesto publicitario", "Cambio de hábitos hacia el comercio online", "Presión en márgenes por inflación"],
        },
        tips: [
          {
            title: "Activa Google Business al máximo",
            description: "Sube 5 fotos nuevas cada semana, responde cada reseña en menos de 24h y publica un post semanal con oferta concreta. Los perfiles activos reciben hasta 7× más clics. Activa las preguntas y respuestas con las dudas más frecuentes de tus clientes para aparecer en más búsquedas.",
            impact_roi_percentage: 18,
          },
          {
            title: "Tarjeta de fidelización digital",
            description: "Implementa una tarjeta de sellos digital gratuita con apps como Stamp Me o Stocard. Ofrece la 6ª compra a mitad de precio. Fidelizar cuesta 5× menos que captar un cliente nuevo. Añade un incentivo de reactivación automático a los 30 días de inactividad.",
            impact_roi_percentage: 22,
          },
          {
            title: "Bundle premium de producto estrella",
            description: "Combina tu producto estrella con 1-2 complementos de alto margen y véndelo como pack exclusivo a un precio 20-25% superior. Aumenta el ticket medio sin elevar costes operativos. Preséntalo como edición limitada para generar urgencia de compra.",
            impact_roi_percentage: 15,
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
