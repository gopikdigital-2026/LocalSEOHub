import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Eres un auditor experto en SEO Local y Google Business Profile (GBP). Tu misión es analizar la ficha de un negocio local y devolver un diagnóstico detallado con recomendaciones accionables.

Evalúa los datos del perfil facilitados y devuelve un JSON estricto con:
- "score": número entero entre 0 y 100 que refleja la calidad SEO del perfil (basado en completitud, uso de palabras clave, longitud de descripción, claridad del horario, optimización de categoría, etc.)
- "recommendations": array de objetos con las mejoras concretas, cada uno con:
  - "title": título corto de la tarea (máximo 8 palabras)
  - "priority": nivel de urgencia, exactamente uno de: "high", "medium", "low"
  - "optimized_text": el texto exacto, listo para copiar y pegar directamente en el campo correspondiente del perfil de Google Business Profile. Debe ser natural, incluir palabras clave locales y estar completamente redactado (no es un consejo, es el texto final)

Reglas para el score:
- 0-39: perfil muy incompleto o sin optimización SEO
- 40-69: perfil aceptable con margen de mejora
- 70-100: perfil bien optimizado

Devuelve entre 4 y 8 recomendaciones priorizadas de mayor a menor urgencia. Incluye siempre al menos 2 de prioridad "high", al menos 2 de "medium" y al menos 1 de "low".
Responde ÚNICAMENTE con el JSON, sin texto adicional.`;

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

    const inTrial = Date.now() < new Date(user.created_at).getTime() + 7 * 24 * 60 * 60 * 1000;

    const { data: customer } = await serviceSupabase
      .from("stripe_customers")
      .select("customer_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (customer?.customer_id) {
      const { data: sub } = await serviceSupabase
        .from("stripe_subscriptions")
        .select("status")
        .eq("customer_id", customer.customer_id)
        .maybeSingle();

      if (sub?.status !== "active" && sub?.status !== "trialing" && !inTrial) {
        return new Response(
          JSON.stringify({ error: "Se requiere una suscripción activa" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (!inTrial) {
      return new Response(
        JSON.stringify({ error: "Se requiere una suscripción activa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { businessName, category, description, hours } = await req.json();

    if (!businessName?.trim()) {
      return new Response(
        JSON.stringify({ error: "El nombre del negocio es obligatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userMessage = [
      `Nombre del negocio: ${businessName}`,
      category ? `Categoría principal: ${category}` : "Categoría principal: (no especificada)",
      description ? `Descripción actual: ${description}` : "Descripción actual: (no hay descripción)",
      hours ? `Horario de apertura: ${hours}` : "Horario de apertura: (no especificado)",
    ].join("\n");

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
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

    let parsed: { score?: number; recommendations?: Array<{ title: string; priority: string; optimized_text: string }> } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ error: "La IA devolvió un formato inválido", raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const recommendations = (parsed.recommendations ?? []).map((r, i) => ({
      id: `rec-${i}`,
      title: r.title ?? "",
      priority: ["high", "medium", "low"].includes(r.priority) ? r.priority : "medium",
      optimized_text: r.optimized_text ?? "",
    }));

    return new Response(
      JSON.stringify({ score, recommendations }),
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
