import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { accountId, locationId } = await req.json();
    if (!accountId || !locationId) {
      return new Response(
        JSON.stringify({ error: "accountId y locationId requeridos" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuario no autenticado" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch stored access token (service_role can read token columns)
    const { data: sourceRow, error: sourceError } = await supabaseAdmin
      .from("connected_sources")
      .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("user_id", user.id)
      .eq("business_id", "default")
      .eq("source_type", "google_business")
      .maybeSingle();

    if (sourceError || !sourceRow?.access_token_encrypted) {
      return new Response(
        JSON.stringify({
          error: "No se encontro un token de acceso. Vuelve a conectar Google Business Profile.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = sourceRow.access_token_encrypted;

    // Fetch location details
    const locationResponse = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${locationId}?readMask=name,title,categories,storefrontAddress,phoneNumbers,websiteUri,regularHours,metadata`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    let profile: Record<string, unknown> = {};
    let recordCount = 0;

    if (locationResponse.ok) {
      const loc = await locationResponse.json();
      profile = {
        name: loc.title ?? null,
        category: loc.categories?.primaryCategory?.displayName ?? null,
        address: loc.storefrontAddress
          ? [
              loc.storefrontAddress.addressLines?.join(", "),
              loc.storefrontAddress.locality,
              loc.storefrontAddress.administrativeArea,
              loc.storefrontAddress.postalCode,
            ]
              .filter(Boolean)
              .join(", ")
          : null,
        phone: loc.phoneNumbers?.primaryPhone ?? null,
        website: loc.websiteUri ?? null,
        hours: loc.regularHours?.periods ?? null,
      };
      recordCount = Object.values(profile).filter(Boolean).length;
    }

    // Fetch reviews count
    let reviewCount = 0;
    try {
      const reviewsResponse = await fetch(
        `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/reviews?pageSize=1`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (reviewsResponse.ok) {
        const reviewData = await reviewsResponse.json();
        reviewCount = reviewData.totalReviewCount ?? 0;
        profile.totalReviews = reviewCount;
        profile.averageRating = reviewData.averageRating ?? null;
      }
    } catch {
      // Reviews API not available — non-fatal
    }

    return new Response(
      JSON.stringify({
        success: true,
        profile,
        recordCount,
        reviewCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: msg, success: false }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
