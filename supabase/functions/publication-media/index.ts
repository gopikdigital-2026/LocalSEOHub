import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

const BUCKET = "publication-images";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const handle = createHandler({
  async getUserId(jwt) {
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async getOwnedPublication(userId, publicationId) {
    const { data, error } = await supabaseAdmin
      .from("publications")
      .select("id, business_id, image_path")
      .eq("id", publicationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("publication lookup failed");
    if (!data) return null;
    return { id: data.id, businessId: data.business_id, imagePath: data.image_path };
  },
  async isBusinessOwned(userId, businessId) {
    const { data, error } = await supabaseAdmin
      .from("businesses").select("id").eq("id", businessId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error("business lookup failed");
    return !!data;
  },
  async putObject(path, bytes, mime) {
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "no-store",
    });
    if (error) console.error("[publication-media] upload failed");
    return !error;
  },
  async removeObject(path) {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return !error;
  },
  async setImage(publicationId, expectedPath, image, uploadedAt) {
    let q = supabaseAdmin
      .from("publications")
      .update({
        status: "image_ready",
        image_path: image.path,
        image_mime: image.mime,
        image_bytes: image.bytes,
        image_width: image.width,
        image_height: image.height,
        image_uploaded_at: uploadedAt,
      })
      .eq("id", publicationId);
    q = expectedPath === null ? q.is("image_path", null) : q.eq("image_path", expectedPath);
    const { data, error } = await q.select("id");
    if (error) {
      console.error("[publication-media] save failed:", error.code ?? "unknown");
      return false;
    }
    return Array.isArray(data) && data.length === 1;
  },
  async deletePublication(publicationId, expectedPath) {
    let q = supabaseAdmin.from("publications").delete().eq("id", publicationId);
    q = expectedPath === null ? q.is("image_path", null) : q.eq("image_path", expectedPath);
    const { data, error } = await q.select("id");
    if (error) throw new Error("delete failed");
    return Array.isArray(data) && data.length === 1;
  },
});

Deno.serve(handle);
