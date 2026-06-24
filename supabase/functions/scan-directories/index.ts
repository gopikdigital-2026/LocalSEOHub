import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un experto en SEO local y gestión de citaciones NAP (Name, Address, Phone) para negocios locales en España. Tu objetivo es identificar los 5 directorios más estratégicos para un negocio según su sector y ciudad, y formatear sus datos de negocio exactamente como deben aparecer para garantizar consistencia NAP.

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
{
  "directorios": [
    {
      "id": "slug-unico-sin-espacios",
      "nombre": "Nombre oficial del directorio",
      "url": "URL directa a la página de registro o alta del negocio",
      "relevancia": "Alta",
      "categoria": "Buscadores",
      "razon": "Motivo concreto por el que este directorio es prioritario para este sector y ciudad (1-2 frases, sin rodeos)",
      "nap": {
        "nombre_negocio": "Nombre del negocio tal como debe registrarse en TODOS los directorios (exactamente igual)",
        "direccion": "Dirección completa formateada: Calle Ejemplo 12, 2º A, 28001 Madrid, España",
        "telefono": "Teléfono en formato internacional: +34 600 000 000",
        "descripcion": "Descripción de 150-200 palabras optimizada para SEO local. Menciona el producto/servicio, la ciudad, beneficios para el cliente local y una llamada a la acción.",
        "categoria_sugerida": "La categoría más específica disponible en este directorio para el sector del negocio"
      }
    }
  ]
}

Reglas críticas:
1. Siempre incluye Google Business Profile como primer directorio (es el más importante para SEO local).
2. Prioriza directorios del sector específico si existen (ej: TripAdvisor para hostelería, Idealista para inmobiliaria, Infojobs para RRHH).
3. Incluye al menos un directorio local o de la comunidad autónoma si existe.
4. El campo "nombre_negocio", "direccion" y "telefono" en el NAP deben ser IDÉNTICOS en los 5 directorios para garantizar consistencia SEO.
5. "relevancia" solo puede ser: "Alta", "Media" o "Baja".
6. "categoria" solo puede ser: "Buscadores", "Reseñas", "Directorios ES", "Social", "B2B", "Geolocalización", "Sector".
7. Si no se proporciona nombre/dirección/teléfono, usa placeholders descriptivos con el formato correcto (ej: "[Nombre del negocio]", "[Calle], [Número], [CP] [Ciudad], España", "+34 [teléfono]").`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LocalSEO_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await anonSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: customer } = await serviceSupabase
      .from("stripe_customers")
      .select("customer_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!customer?.customer_id) {
      return new Response(
        JSON.stringify({ error: "Se requiere una suscripción activa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: sub } = await serviceSupabase
      .from("stripe_subscriptions")
      .select("status")
      .eq("customer_id", customer.customer_id)
      .maybeSingle();

    if (sub?.status !== "active" && sub?.status !== "trialing") {
      return new Response(
        JSON.stringify({ error: "Se requiere una suscripción activa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { product, city, businessName, address, phone } = await req.json();

    if (!product?.trim()) {
      return new Response(
        JSON.stringify({ error: "El campo 'producto' es obligatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userPrompt = [
      `Sector / producto o servicio: ${product}`,
      city ? `Ciudad y región del negocio: ${city}` : null,
      businessName ? `Nombre del negocio: ${businessName}` : null,
      address ? `Dirección física: ${address}` : null,
      phone ? `Teléfono de contacto: ${phone}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!openAIRes.ok) {
      const errBody = await openAIRes.text();
      console.error("OpenAI error:", errBody);
      return new Response(
        JSON.stringify({ error: "Error al contactar con OpenAI", details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openAIData = await openAIRes.json();
    const raw = openAIData.choices?.[0]?.message?.content ?? "{}";

    let parsed: { directorios?: unknown[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ error: "La IA devolvió un formato inválido", raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(parsed.directorios) || parsed.directorios.length === 0) {
      return new Response(
        JSON.stringify({ error: "La IA no devolvió directorios", raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ directorios: parsed.directorios }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
