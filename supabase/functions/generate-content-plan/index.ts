import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un Community Manager experto en viralidad local. Crea un plan de contenidos de 7 días para redes sociales. Cada día debe ser una idea de post o vídeo corto enfocada en atraer clientes de la ciudad especificada hacia el producto. Devuelve un formato JSON limpio con un array de 7 objetos, cada uno con las claves: day, platform, hook, content_idea y local_hashtags.

Reglas:
- "day": número del día (1-7)
- "platform": "Instagram" o "TikTok", alternando entre ambas
- "hook": la primera frase o gancho del post/vídeo, directa y con urgencia o curiosidad
- "content_idea": descripción concreta de la idea de contenido (2-3 frases, específica para producto y ciudad)
- "local_hashtags": array de 2-3 hashtags locales relevantes (sin espacios, incluyen ciudad y/o producto)

Usa el nombre de la ciudad de forma natural en las ideas. Basa las ideas en la descripción SEO del producto si se proporciona.`;

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

    const { product, city, platform, description } = await req.json();

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
      description ? `Descripción SEO del producto:\n${description}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.85,
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

    // Normalise local_hashtags: ensure it's always an array
    const days = (parsed.days as Record<string, unknown>[]).map((d) => ({
      ...d,
      local_hashtags: Array.isArray(d.local_hashtags)
        ? d.local_hashtags
        : typeof d.local_hashtags === "string"
          ? (d.local_hashtags as string).split(/[\s,]+/).filter(Boolean)
          : [],
    }));

    return new Response(
      JSON.stringify({ days }),
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
