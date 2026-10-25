/*
# A3.7.1 - Publications MVP: data, private image storage and safety foundation

Creates the minimum owner-isolated draft entity for the future Publications tool
(one photo -> proposals -> Facebook/Instagram variants -> publish) and a PRIVATE bucket
for its source photo. Nothing here generates content or publishes anything.

1. New Tables
- `publications` (one draft per photo workflow)
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to the signed-in user, cascades with the account)
  - `business_id` (uuid, business the draft belongs to, must be owned by `user_id`)
  - `status` (text): `draft` (no photo yet) or `image_ready` (one validated photo attached).
    Later phases extend this list with their own migration; no publishing state exists yet.
  - `image_path` (text, object key in the private bucket; never a public or signed URL)
  - `image_mime` (text, `image/jpeg` or `image/png`, detected from file bytes by the server)
  - `image_bytes`, `image_width`, `image_height` (integers, server-measured)
  - `image_uploaded_at` (timestamptz, server time of the current photo)
  - `created_at`, `updated_at`

2. New Storage Bucket
- `publication-images`: PRIVATE (`public = false`), 8 MB per object, JPEG/PNG only.
  Object key: `{user_id}/{business_id}/{publication_id}/{random-uuid}.{jpg|png}`.

3. Security
- RLS enabled on `publications`.
- Signed-in users: SELECT own drafts of businesses they own; INSERT a draft by sending only
  `business_id` (column-level grant). No UPDATE or DELETE grant: photo attach/replace and draft
  deletion go through the `publication-media` server function so the stored photo is never orphaned.
- `anon` has no access at all.
- A trigger (all roles, including the server) rejects a business not owned by the row owner,
  blocks changes to `user_id` / `business_id`, caps open drafts at 20 per user and stamps `updated_at`.
- Check constraints tie `status` to the image fields and force `image_path` to live under
  `{user_id}/{business_id}/{id}/` with a random uuid file name (no traversal, no foreign namespace).
- Storage: the only policy for signed-in users is SELECT on objects in this bucket that are under
  their own `user_id` folder AND are the current photo of one of their drafts. No INSERT, UPDATE or
  DELETE policy exists for signed-in or anonymous users: uploads and deletions are server-side only.

4. Important notes
1. Idempotent: safe to re-run; no existing table or data is modified.
2. Uploaded photos are stored as received (after server validation). Metadata such as EXIF/GPS is
   NOT removed in this phase; normalization belongs to A3.7.2.
3. Deleting a business or account removes draft rows by cascade, but storage objects do not cascade;
   see the A3.7.1 report for the cleanup procedure.
*/

CREATE TABLE IF NOT EXISTS public.publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  image_path text,
  image_mime text,
  image_bytes integer,
  image_width integer,
  image_height integer,
  image_uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publications_status_check CHECK (status IN ('draft', 'image_ready')),
  CONSTRAINT publications_image_consistency CHECK (
    (status = 'draft' AND image_path IS NULL AND image_mime IS NULL AND image_bytes IS NULL
      AND image_width IS NULL AND image_height IS NULL AND image_uploaded_at IS NULL)
    OR
    (status = 'image_ready' AND image_path IS NOT NULL AND image_uploaded_at IS NOT NULL
      AND image_mime IN ('image/jpeg', 'image/png')
      AND image_bytes BETWEEN 1 AND 8388608
      AND image_width BETWEEN 320 AND 8192
      AND image_height BETWEEN 320 AND 8192
      AND image_width::bigint * image_height::bigint <= 40000000)
  ),
  CONSTRAINT publications_image_path_owned CHECK (
    image_path IS NULL OR (
      image_path ~ ('^' || user_id::text || '/' || business_id::text || '/' || id::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$')
      AND (image_mime = 'image/jpeg') = (image_path LIKE '%.jpg')
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS publications_image_path_key
  ON public.publications (image_path) WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS publications_user_created_idx
  ON public.publications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS publications_business_idx
  ON public.publications (business_id);

ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.publications FROM anon;
REVOKE ALL ON public.publications FROM authenticated;
GRANT SELECT ON public.publications TO authenticated;
GRANT INSERT (business_id) ON public.publications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publications TO service_role;

DROP POLICY IF EXISTS "select_own_publications" ON public.publications;
CREATE POLICY "select_own_publications" ON public.publications FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_publications" ON public.publications;
CREATE POLICY "insert_own_publications" ON public.publications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'draft'
    AND image_path IS NULL
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.publications_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'publication_owner_immutable';
    END IF;
  END IF;
  IF NEW.user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = NEW.business_id AND b.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'publication_business_not_owned';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.publications p WHERE p.user_id = NEW.user_id) >= 20 THEN
      RAISE EXCEPTION 'publication_draft_limit';
    END IF;
    NEW.created_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publications_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS publications_guard ON public.publications;
CREATE TRIGGER publications_guard
  BEFORE INSERT OR UPDATE ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.publications_guard();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('publication-images', 'publication-images', false, 8388608, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "publication_images_select_own" ON storage.objects;
CREATE POLICY "publication_images_select_own" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'publication-images'
    AND (storage.foldername(objects.name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.publications p
      WHERE p.image_path = objects.name AND p.user_id = auth.uid()
    )
  );
