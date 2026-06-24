import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT_TEXT = `Eres un consultor experto en SEO Local y Copywriting. Tu objetivo es redactar títulos, descripciones y etiquetas optimizadas para la plataforma elegida, integrando de forma natural la ciudad o región para maximizar el impacto en búsquedas locales.

Responde ESTRICTAMENTE en formato JSON con las siguientes claves:
- título
- descripción (con saltos de línea limpios)
- etiquetas (cadena de etiquetas separadas por comas)`;

const SYSTEM_PROMPT_VISION = `Eres un consultor experto en SEO Local, Copywriting y optimización de imágenes para e-commerce.

Analiza visualmente la imagen del producto provista. Basándote en lo que ves, en el nombre del producto y en la ciudad objetivo, genera un nombre de archivo optimizado para SEO (en minúsculas, separado por guiones y sin caracteres especiales) y un texto alternativo (Alt Text) descriptivo que incluya la localización de forma natural.

Responde ESTRICTAMENTE en formato JSON con las siguientes claves:
- título
- descripción (con saltos de línea limpios)
- etiquetas (cadena de etiquetas separadas por comas)
- nombre_archivo (slug SEO para renombrar la imagen, ej: sillas-madera-artesanal-toledo.jpg)
- alt_text (descripción alt para la imagen, con localización integrada de forma natural)`;

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
        JSON.stringify({ error: "Se requiere una suscripción activa para generar contenido" }),
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
        JSON.stringify({ error: "Se requiere una suscripción activa para generar contenido" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { product, city, platform, keywords, imageBase64, imageMimeType } = await req.json();

    if (!product?.trim()) {
      return new Response(
        JSON.stringify({ error: "El campo 'producto' es obligatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hasImage = typeof imageBase64 === "string" && imageBase64.length > 0;

    const userTextContent = [
      `Producto o servicio: ${product}`,
      city ? `Ciudad / Región objetivo: ${city}` : null,
      platform ? `Plataforma: ${platform}` : null,
      keywords ? `Palabras clave adicionales: ${keywords}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Build the user message — vision or text-only
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } };

    const userContent: ContentPart[] | string = hasImage
      ? [
          { type: "text", text: userTextContent },
          {
            type: "image_url",
            image_url: {
              url: `data:${imageMimeType ?? "image/jpeg"};base64,${imageBase64}`,
              detail: "low",
            },
          },
        ]
      : userTextContent;

    const openAIRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: hasImage ? SYSTEM_PROMPT_VISION : SYSTEM_PROMPT_TEXT,
          },
          { role: "user", content: userContent },
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

    let parsed: {
      título?: string;
      descripción?: string;
      etiquetas?: string;
      nombre_archivo?: string;
      alt_text?: string;
    } = {};

    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ error: "La IA devolvió un formato inválido", raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const title = parsed["título"] ?? "";
    const description = parsed["descripción"] ?? "";
    const tagsRaw = parsed["etiquetas"] ?? "";
    const tags = tagsRaw
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    const imageOptimization = hasImage && (parsed["nombre_archivo"] || parsed["alt_text"])
      ? {
          filename: parsed["nombre_archivo"] ?? "",
          altText: parsed["alt_text"] ?? "",
        }
      : undefined;

    return new Response(
      JSON.stringify({ title, description, tags, imageOptimization }),
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
