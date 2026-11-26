import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler, type ConsumeResult, type CompleteResult } from "./handler.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const COMPLETE_RESULTS: CompleteResult[] = ["COMPLETED", "EXPIRED", "SUPERSEDED", "INVALID_INPUT"];

const handle = createHandler({
  env: (name) => Deno.env.get(name),
  async consumeState(state): Promise<ConsumeResult> {
    const { data, error } = await supabaseAdmin.rpc("gbp_consume_oauth_state", { p_state: state });
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (error || !row) throw new Error("consume failed");
    if (row.r_result === "CONSUMED") {
      if (typeof row.r_source_id !== "string" || typeof row.r_user_id !== "string"
        || typeof row.r_business_id !== "string" || typeof row.r_attempt_id !== "string") {
        throw new Error("consume failed");
      }
      return {
        result: "CONSUMED",
        attempt: {
          sourceId: row.r_source_id,
          userId: row.r_user_id,
          businessId: row.r_business_id,
          attemptId: row.r_attempt_id,
          state,
        },
      };
    }
    if (row.r_result === "EXPIRED" || row.r_result === "ALREADY_USED" || row.r_result === "NOT_FOUND") {
      return { result: row.r_result };
    }
    throw new Error("consume failed");
  },
  async ownsBusiness(userId, businessId) {
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("business lookup failed");
    return !!data;
  },
  async completeAttempt(attempt, tokens) {
    // Vault write and phase change commit together, only for this exact attempt.
    const { data, error } = await supabaseAdmin.rpc("gbp_complete_oauth_attempt", {
      p_source_id: attempt.sourceId,
      p_user_id: attempt.userId,
      p_business_id: attempt.businessId,
      p_attempt_id: attempt.attemptId,
      p_state: attempt.state,
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_expires_at: tokens.expiresAt,
    });
    if (error || !COMPLETE_RESULTS.includes(data)) throw new Error("complete failed");
    return data as CompleteResult;
  },
  async failAttempt(attempt, status, code) {
    const { data, error } = await supabaseAdmin.rpc("gbp_fail_oauth_attempt", {
      p_source_id: attempt.sourceId,
      p_user_id: attempt.userId,
      p_business_id: attempt.businessId,
      p_attempt_id: attempt.attemptId,
      p_state: attempt.state,
      p_status: status,
      p_code: code,
    });
    return !error && data === "FAILED";
  },
  fetch: (input, init) => fetch(input, init),
});

Deno.serve(handle);
