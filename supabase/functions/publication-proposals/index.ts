import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requirePremium } from "./entitlement.ts";
import { BUSINESS_COLUMNS } from "./context.ts";
import { corsHeaders, generate, MAX_BODY_BYTES, MODEL, type ClaimStatus, type ReserveStatus } from "./handler.ts";

const BUCKET = "publication-images";
const CLAIM = new Set<ClaimStatus>(["claimed", "busy", "limit", "stale", "not_found"]);
const RESERVE = new Set<ReserveStatus>(["reserved", "fn_limit", "global_limit", "invalid", "disabled"]);
const MIMES = new Set(["image/jpeg", "image/png"]);

const jsonError = (code: string, status: number) =>
  new Response(JSON.stringify({ ok: false, code }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const access = await requirePremium(req, "publication-proposals", corsHeaders);
  if (!access.ok) return access.response;

  try {
    if (req.method !== "POST") return jsonError("INVALID_REQUEST", 405);
    const declared = Number(req.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return jsonError("INVALID_REQUEST", 400);
    const raw = await req.text().catch(() => null);
    const apiKey = Deno.env.get("LocalSEO_KEY");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    return await generate(access.userId, raw, {
      async loadPublication(userId, publicationId) {
        const { data, error } = await admin
          .from("publications")
          .select("id, business_id, image_path, image_mime, image_bytes, image_normalized")
          .eq("id", publicationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error("publication_lookup_failed");
        if (!data) return null;
        return {
          id: data.id,
          businessId: data.business_id,
          imagePath: typeof data.image_path === "string" ? data.image_path : null,
          imageMime: MIMES.has(data.image_mime) ? data.image_mime : null,
          imageBytes: typeof data.image_bytes === "number" ? data.image_bytes : null,
          imageNormalized: data.image_normalized === true,
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
      async claim(publicationId, userId, claimId, imagePath) {
        const { data, error } = await admin.rpc("claim_publication_generation", {
          p_publication_id: publicationId, p_user_id: userId, p_claim_id: claimId, p_image_path: imagePath,
        });
        if (error || !CLAIM.has(data)) throw new Error("claim_failed");
        return data as ClaimStatus;
      },
      async release(publicationId, userId, claimId) {
        const { data, error } = await admin.rpc("release_publication_generation", {
          p_publication_id: publicationId, p_user_id: userId, p_claim_id: claimId,
        });
        return !error && data === true;
      },
      async complete(publicationId, userId, claimId, imagePath, lang, proposals) {
        const { data, error } = await admin.rpc("complete_publication_generation", {
          p_publication_id: publicationId, p_user_id: userId, p_claim_id: claimId, p_image_path: imagePath, p_lang: lang,
          p_proposals: proposals.map((p) => ({ role: p.role, body: p.body, cta: p.cta })),
        });
        if (error) {
          console.error("[publication-proposals] save failed:", error.code ?? "unknown");
          return null;
        }
        if (!data || typeof data.generation_id !== "string" || typeof data.generated_at !== "string" || typeof data.generations_used !== "number") return null;
        return { generationId: data.generation_id, generatedAt: data.generated_at, generationsUsed: data.generations_used };
      },
      async downloadImage(path) {
        const { data, error } = await admin.storage.from(BUCKET).download(path);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
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
          // A timed-out request may still have been processed and billed upstream.
          return { ok: false, billed: aborted, failure: aborted ? "timeout" : "server" };
        } finally {
          clearTimeout(timer);
        }
      },
      log(event, detail) {
        console.error(`[publication-proposals] ${event}`, JSON.stringify(detail));
      },
    });
  } catch (err: unknown) {
    console.error("[publication-proposals] failed", err instanceof Error ? err.message : "unknown");
    return jsonError("UNKNOWN_ERROR", 500);
  }
});
