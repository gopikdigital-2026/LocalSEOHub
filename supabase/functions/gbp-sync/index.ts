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

    const { accountId, locationId: rawLocationId, businessId } = await req.json();
    const locMatch = typeof rawLocationId === "string"
      ? /^(?:accounts\/[A-Za-z0-9_-]{1,64}\/)?(locations\/[A-Za-z0-9_-]{1,64})$/.exec(rawLocationId)
      : null;
    const locationId = locMatch?.[1];
    if (
      typeof accountId !== "string" || !/^accounts\/[A-Za-z0-9_-]{1,64}$/.test(accountId) ||
      !locationId || locationId === "locations/default"
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "accountId y locationId requeridos" }),
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

    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (businessError || !business || (businessId != null && businessId !== business.id)) {
      return new Response(
        JSON.stringify({ success: false, error: "Negocio no valido" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: sourceRow, error: sourceError } = await supabaseAdmin
      .from("connected_sources")
      .select("access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("user_id", user.id)
      .eq("business_id", business.id)
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
    } else {
      console.error("[gbp-sync] location fetch failed:", locationResponse.status);
      return new Response(
        JSON.stringify({
          success: false,
          error: locationResponse.status === 401
            ? "La sesion de Google ha caducado. Vuelve a conectar Google Business Profile."
            : "No se pudo leer la ficha de Google. Intentalo de nuevo.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Only this server-side write may mark Google data as verified; clients cannot write these columns.
    const syncedAt = new Date().toISOString();
    const { error: persistError } = await supabaseAdmin
      .from("connected_sources")
      .update({
        verified_profile: profile,
        verified_at: syncedAt,
        last_sync_at: syncedAt,
        external_account_id: accountId,
        external_location_id: locationId,
      })
      .eq("user_id", user.id)
      .eq("business_id", business.id)
      .eq("source_type", "google_business");

    if (persistError) {
      console.error("[gbp-sync] persist failed:", persistError.code);
      return new Response(
        JSON.stringify({ success: false, error: "No se pudo guardar la sincronizacion" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        profile,
        recordCount,
        reviewCount,
        verifiedAt: syncedAt,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.name : "Error interno";
    console.error("[gbp-sync] Unhandled error:", msg);
    return new Response(
      JSON.stringify({ error: "Error interno de sincronizacion", success: false }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
