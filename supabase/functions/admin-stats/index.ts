import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TRIAL_DAYS = 7;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await anonSupabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If ADMIN_EMAIL secret is configured, restrict access to that email only
    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    if (adminEmail && user.email !== adminEmail) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all data in parallel
    const [profilesRes, customersRes, subscriptionsRes, funnelRes] = await Promise.all([
      serviceSupabase
        .from("profiles")
        .select("id, email, full_name, created_at, user_usage(total_seo_generations, total_images_optimized, total_leads_scanned, last_active)")
        .order("created_at", { ascending: false }),
      serviceSupabase
        .from("stripe_customers")
        .select("user_id, customer_id")
        .is("deleted_at", null),
      serviceSupabase
        .from("stripe_subscriptions")
        .select("customer_id, status"),
      serviceSupabase.rpc("get_funnel_stats"),
    ]);

    const profiles = profilesRes.data ?? [];
    const customers = customersRes.data ?? [];
    const subscriptions = subscriptionsRes.data ?? [];
    const funnel = funnelRes.data ?? {};

    const customerMap = new Map<string, string>(
      customers.map((c: { user_id: string; customer_id: string }) => [c.user_id, c.customer_id])
    );
    const subMap = new Map<string, string>(
      subscriptions.map((s: { customer_id: string; status: string }) => [s.customer_id, s.status])
    );

    const enriched = profiles.map((p: {
      id: string;
      email: string | null;
      full_name: string | null;
      created_at: string;
      user_usage: { total_seo_generations: number; total_images_optimized: number; total_leads_scanned: number; last_active: string | null } | null;
    }) => {
      const customerId = customerMap.get(p.id);
      const stripeStatus = customerId ? subMap.get(customerId) : null;
      const isStripeActive = stripeStatus === "active" || stripeStatus === "trialing";
      const inAccountTrial =
        !isStripeActive &&
        Date.now() - new Date(p.created_at).getTime() < TRIAL_DAYS * 24 * 60 * 60 * 1000;

      let displayStatus: string;
      if (stripeStatus === "active") displayStatus = "active";
      else if (stripeStatus === "trialing") displayStatus = "trialing";
      else if (inAccountTrial) displayStatus = "trial";
      else displayStatus = "free";

      const usage = Array.isArray(p.user_usage) ? p.user_usage[0] : p.user_usage;

      return {
        id: p.id,
        email: p.email ?? "",
        full_name: p.full_name ?? "",
        created_at: p.created_at,
        stripe_status: displayStatus,
        usage: usage ?? {
          total_seo_generations: 0,
          total_images_optimized: 0,
          total_leads_scanned: 0,
          last_active: null,
        },
      };
    });

    const totalUsers = enriched.length;
    const activeSubscriptions = enriched.filter((u) => u.stripe_status === "active").length;
    const trialUsers = enriched.filter(
      (u) => u.stripe_status === "trialing" || u.stripe_status === "trial"
    ).length;
    const estimatedMRR = parseFloat((activeSubscriptions * 9.99).toFixed(2));
    const conversionRate =
      totalUsers > 0 ? parseFloat(((activeSubscriptions / totalUsers) * 100).toFixed(1)) : 0;

    return new Response(
      JSON.stringify({
        kpis: { totalUsers, activeSubscriptions, trialUsers, estimatedMRR, conversionRate },
        users: enriched,
        funnel,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Admin stats error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
