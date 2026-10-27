import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requirePremium } from "./entitlement.ts";
import { BUSINESS_COLUMNS } from "./context.ts";
import { adapt, corsHeaders, fail, MAX_BODY_BYTES, MODEL, type ClaimStatus, type CompleteResult, type ReserveStatus } from "./handler.ts";

const CLAIM = new Set<ClaimStatus>(["claimed", "not_found", "not_ready", "no_selection", "stale", "busy", "limit"]);
const RESERVE = new Set<ReserveStatus>(["reserved", "fn_limit", "global_limit", "invalid", "disabled"]);
const COMPLETE = new Set(["completed", "not_found", "stale", "claim_lost", "limit", "invalid"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const access = await requirePremium(req, "publication-adaptations", corsHeaders);
  if (!access.ok) {
    if (access.response.status === 401) return fail("unauthenticated");
    if (access.response.status === 503) return fail("unavailable");
    return access.response;
  }

  try {
    if (req.method !== "POST") return fail("not_found", { reason: "invalid_request" }, 405);
    const declared = Number(req.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail("not_found", { reason: "invalid_request" }, 400);
    const raw = await req.text().catch(() => null);
    const apiKey = Deno.env.get("LocalSEO_KEY");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    return await adapt(access.userId, raw, {
      async loadDraft(userId, publicationId) {
        const { data: pub, error } = await admin
          .from("publications")
          .select("id, business_id, status, proposal_generation_id")
          .eq("id", publicationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error("publication_lookup_failed");
        if (!pub) return null;
        const { data: d, error: draftError } = await admin
          .from("publication_drafts")
          .select("version, source_generation_id, source_role, source_lang, source_body, source_cta, adaptations_used")
          .eq("publication_id", pub.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (draftError) throw new Error("draft_lookup_failed");
        return {
          publicationId: pub.id,
          businessId: pub.business_id,
          status: pub.status,
          generationId: typeof pub.proposal_generation_id === "string" ? pub.proposal_generation_id : null,
          draft: d
            ? {
              version: d.version, sourceGenerationId: d.source_generation_id, role: d.source_role, lang: d.source_lang,
              body: d.source_body, cta: d.source_cta, adaptationsUsed: d.adaptations_used,
            }
            : null,
        };
      },
      async loadBusiness(userId, businessId) {
        const { data, error } = await admin
          .from("businesses")
          .select(BUSINESS_COLUMNS)
          .eq("id", businessId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error("business_lookup_failed");
        return data;
      },
      async claim(publicationId, userId, claimId, expectedVersion) {
        const { data, error } = await admin.rpc("claim_publication_adaptation", {
          p_publication_id: publicationId, p_user_id: userId, p_claim_id: claimId, p_expected_version: expectedVersion,
        });
        if (error || !CLAIM.has(data)) throw new Error("claim_failed");
        return data as ClaimStatus;
      },
      async release(publicationId, userId, claimId) {
        const { data, error } = await admin.rpc("release_publication_adaptation", {
          p_publication_id: publicationId, p_user_id: userId, p_claim_id: claimId,
        });
        return !error && data === true;
      },
      async complete(publicationId, userId, claimId, expectedVersion, sourceGenerationId, texts) {
        const { data, error } = await admin.rpc("complete_publication_adaptation", {
          p_publication_id: publicationId, p_user_id: userId, p_claim_id: claimId, p_expected_version: expectedVersion,
          p_source_generation_id: sourceGenerationId, p_facebook: texts.facebook, p_instagram: texts.instagram,
        });
        if (error) {
          console.error("[publication-adaptations] save failed:", error.code ?? "unknown");
          return null;
        }
        if (!data || !COMPLETE.has(data.result)) return null;
        if (data.result !== "completed") return { result: data.result } as CompleteResult;
        if (typeof data.version !== "number" || typeof data.adapted_at !== "string" || typeof data.adaptations_used !== "number") return null;
        return { result: "completed", version: data.version, adaptedAt: data.adapted_at, adaptationsUsed: data.adaptations_used };
      },
      async reserve(reservationId, userId, fn) {
        const { data, error } = await admin.rpc("reserve_ai_usage", {
          p_reservation_id: reservationId, p_user_id: userId, p_function: fn,
        });
        if (error || !data || !RESERVE.has(data.status)) throw new Error("reserve_failed");
        return data.status as ReserveStatus;
      },
      async settle(reservationId, userId, outcome) {
        const { data, error } = await admin.rpc("settle_ai_usage", {
          p_reservation_id: reservationId, p_user_id: userId, p_outcome: outcome,
        });
        return !error && data === true;
      },
      async callModel(request) {
        if (!apiKey) return { ok: false, billed: false, failure: "client" };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), request.timeoutMs);
        try {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: MODEL,
              temperature: request.temperature,
              max_tokens: request.maxTokens,
              response_format: { type: "json_schema", json_schema: request.schema },
              messages: request.messages,
            }),
            signal: ctrl.signal,
          });
          if (!res.ok) {
            return { ok: false, billed: false, failure: res.status === 429 ? "rate_limited" : res.status >= 500 ? "server" : "client" };
          }
          const data = await res.json();
          const raw = data?.choices?.[0]?.message?.content;
          return typeof raw === "string" && raw.length > 0 ? { ok: true, raw } : { ok: false, billed: true, failure: "empty" };
        } catch (err) {
          const aborted = err instanceof DOMException && err.name === "AbortError";
          return { ok: false, billed: aborted, failure: aborted ? "timeout" : "server" };
        } finally {
          clearTimeout(timer);
        }
      },
      log(event, detail) {
        console.error(`[publication-adaptations] ${event}`, JSON.stringify(detail));
      },
    });
  } catch (err: unknown) {
    console.error("[publication-adaptations] failed", err instanceof Error ? err.message : "unknown");
    return fail("unknown");
  }
});
