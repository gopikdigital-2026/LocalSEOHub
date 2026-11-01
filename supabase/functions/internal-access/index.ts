import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(createHandler({
  async getUserEmail(jwt) {
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
  },
  env: (name) => Deno.env.get(name),
}));
