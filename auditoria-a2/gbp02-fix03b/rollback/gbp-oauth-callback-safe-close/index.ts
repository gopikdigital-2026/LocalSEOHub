// GBP-02-FIX03B rollback variant. NOT DEPLOYED. Requires migration 1 (consume/fail RPCs) to remain applied.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createSafeCloseHandler } from "./handler.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const handle = createSafeCloseHandler({
  env: (name) => Deno.env.get(name),
  async consumeState(state) {
    const { data, error } = await supabaseAdmin.rpc("gbp_consume_oauth_state", { p_state: state });
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (error || !row) throw new Error("consume failed");
    if (row.r_result === "CONSUMED") {
      return {
        result: "CONSUMED",
        attempt: { sourceId: row.r_source_id, userId: row.r_user_id, businessId: row.r_business_id, attemptId: row.r_attempt_id, state },
      };
    }
    return { result: row.r_result === "EXPIRED" || row.r_result === "ALREADY_USED" ? row.r_result : "NOT_FOUND" };
  },
  async failAttempt(attempt, code) {
    const { data, error } = await supabaseAdmin.rpc("gbp_fail_oauth_attempt", {
      p_source_id: attempt.sourceId,
      p_user_id: attempt.userId,
      p_business_id: attempt.businessId,
      p_attempt_id: attempt.attemptId,
      p_state: attempt.state,
      p_status: "error",
      p_code: code,
    });
    return !error && data === "FAILED";
  },
});

Deno.serve(handle);
