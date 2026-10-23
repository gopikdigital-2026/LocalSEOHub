const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Retired (F-03 Stage 2B): it created users with a pre-confirmed email. Signup now uses
// supabase.auth.signUp with real email confirmation. Never restore the previous source.
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  return new Response(JSON.stringify({ error: 'gone' }), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
