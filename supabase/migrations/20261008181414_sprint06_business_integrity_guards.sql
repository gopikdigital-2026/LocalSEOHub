/*
# Sprint 06 - Business profile integrity guards

## Summary
Adds server-side safety nets so the business profile and recommendation rows stay consistent
no matter which client writes them. No data is deleted or rewritten.

## 1. New function
- `public.set_updated_at()` - trigger function that stamps `updated_at = now()` on every UPDATE.
  SECURITY INVOKER with a fixed `search_path`; not callable as an RPC by design (trigger only).

## 2. Modified tables
- `businesses`: BEFORE UPDATE trigger `businesses_set_updated_at`.
  Length CHECK constraints (match the profile form limits):
  name/category/city <= 200, website <= 500, phone <= 50, schedule <= 500,
  target_audience <= 1000, services <= 30 items.
- `business_actions`: BEFORE UPDATE trigger `business_actions_set_updated_at`.

## 3. Security
- No RLS or policy changes. No grants changed.

## 4. Notes
1. Idempotent: triggers are recreated, constraints are added only if missing.
2. All existing rows were checked and satisfy the new limits.
3. Recommendations rely on `businesses.updated_at` to know when to refresh, so stamping it
   in the database guarantees a refresh after every real profile save.
*/

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS businesses_set_updated_at ON public.businesses;
CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS business_actions_set_updated_at ON public.business_actions;
CREATE TRIGGER business_actions_set_updated_at
  BEFORE UPDATE ON public.business_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_text_lengths_check') THEN
    ALTER TABLE public.businesses ADD CONSTRAINT businesses_text_lengths_check CHECK (
      coalesce(length(name), 0) <= 200
      AND coalesce(length(category), 0) <= 200
      AND coalesce(length(city), 0) <= 200
      AND coalesce(length(website), 0) <= 500
      AND coalesce(length(phone), 0) <= 50
      AND coalesce(length(schedule), 0) <= 500
      AND coalesce(length(target_audience), 0) <= 1000
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_services_count_check') THEN
    ALTER TABLE public.businesses ADD CONSTRAINT businesses_services_count_check CHECK (
      coalesce(array_length(services, 1), 0) <= 30
    );
  END IF;
END $$;
