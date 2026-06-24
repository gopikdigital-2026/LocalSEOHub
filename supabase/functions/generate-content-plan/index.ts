import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un experto en marketing de contenidos para pequeñas empresas locales y comercio electrónico.
Tu tarea es crear un plan de contenidos para redes sociales de 7 días, adaptado específicamente al producto, ciudad y plataforma indicados.

Responde ESTRICTAMENTE con un objeto JSON con la clave "days", que contiene un array de 7 objetos.
Cada objeto debe tener exactamente estas claves:
- "day": número del día (1-7)
- "network": "Instagram" o "TikTok" (alterna entre ambas, empezando por Instagram)
- "idea": idea concreta de contenido (2-3 frases, específica para el producto y ciudad)
- "hook": el gancho o primera frase del post/vídeo (directa, que genere curiosidad o urgencia, en primera persona o dirigida al espectador)
- "hashtag": UN hashtag local relevante (sin espacios, incluye la ciudad o producto, ej: #ToledoConsumoLocal)

El contenido debe ser auténtico, local, atractivo y accionable. Usa el nombre de la ciudad de forma natural.`;

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

    const { product, city, platform } = await req.json();

    if (!product?.trim()) {
      return new Response(
        JSON.stringify({ error: "El campo 'producto' es obligatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userPrompt = [
      `Producto o servicio: ${product}`,
      city ? `Ciudad / Región objetivo: ${city}` : null,
      platform ? `Plataforma principal de venta: ${platform}` : null,
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
        temperature: 0.8,
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

    let parsed: { days?: unknown[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ error: "La IA devolvió un formato inválido", raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(parsed.days) || parsed.days.length === 0) {
      return new Response(
        JSON.stringify({ error: "La IA no devolvió el calendario esperado", raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ days: parsed.days }),
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
