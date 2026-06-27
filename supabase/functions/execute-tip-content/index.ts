import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un experto en copywriting persuasivo y marketing local con 15 años de experiencia creando contenido de alto rendimiento para pequeños negocios. Tu especialidad es redactar piezas de comunicación que convierten: correos que se abren, pies de foto que generan interacción y mensajes cortos que disparan ventas recurrentes.

Dado el contexto de un negocio y un consejo de crecimiento específico, genera EXACTAMENTE tres piezas de contenido listas para usar.

Devuelve la respuesta ESTRICTAMENTE en este JSON (sin markdown, sin texto adicional):
{
  "email": {
    "subject": "<asunto del email, máx 60 caracteres, con un gancho emocional o curiosidad>",
    "body": "<cuerpo del email: saludo personalizado, párrafo gancho de 2 frases, propuesta de valor clara, prueba social o urgencia breve, llamada a la acción directa, despedida. Usa líneas cortas y separadas. Máx 200 palabras.>"
  },
  "caption": "<pie de foto optimizado para redes: gancho en la primera línea, descripción de valor, emojis estratégicos, CTA final, 3-5 hashtags relevantes al sector. Máx 150 palabras.>",
  "sms": "<plantilla SMS/WhatsApp: directa, personal, urgente, con CTA y enlace simulado. Máx 160 caracteres. Usa [NOMBRE] como variable de personalización.>"
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { businessType, avgTicket, starProduct, mainChallenge, tipTitle, tipDescription } =
      await req.json();

    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ticketLabel = avgTicket ? `${avgTicket}€` : "no indicado";
    const userMessage = `Genera el contenido promocional para este negocio basándote en el consejo de crecimiento indicado:

DATOS DEL NEGOCIO:
- Sector: ${businessType || "Negocio local"}
- Ticket Medio: ${ticketLabel}
- Producto/Servicio estrella: ${starProduct || "no indicado"}
- Reto principal: ${mainChallenge || "Atraer nuevos clientes"}

CONSEJO DE CRECIMIENTO A EJECUTAR:
- Título: ${tipTitle}
- Descripción táctica: ${tipDescription}

Redacta las tres piezas de contenido (email, pie de foto y SMS/WhatsApp) completamente listas para copiar y usar, hiper-personalizadas para este tipo de negocio y para implementar exactamente este consejo.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.75,
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
        email: {
          subject: `¡Novedad en ${businessType || "nuestro negocio"}! No te lo pierdas`,
          body: `Hola,\n\nTenemos algo especial para ti esta semana.\n\nComo cliente especial, queremos que seas el primero en conocer nuestra nueva oferta en ${starProduct || "nuestros productos"}.\n\nHemos trabajado duro para traerte más valor por el mismo precio — y este mes lo notarás.\n\nHaz clic aquí para ver la oferta →\n\nGracias por confiar en nosotros.\n\nUn saludo`,
        },
        caption: `✨ ¿Sabías que puedes obtener más por menos?\n\nEsta semana tenemos algo especial preparado para ti.\n\n👉 Visítanos y descúbrelo — solo por tiempo limitado.\n\n📍 Encuéntranos en Google Maps\n\n#${(businessType || "negocio").replace(/\s+/g, "").toLowerCase()} #oferta #clientesvip #localfirst`,
        sms: `[NOMBRE], tenemos una oferta exclusiva para ti en ${businessType || "nuestro local"}. Solo hoy. Ver: enlace.com/oferta`,
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
