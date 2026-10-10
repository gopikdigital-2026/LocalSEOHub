const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Retired (FIX A2.1): unused by the app. Restore the original source from localseohub-v073.zip and redeploy if needed.
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  return new Response(JSON.stringify({ error: 'gone' }), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
