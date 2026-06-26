/*
# Perfiles de usuario y métricas de uso

## Resumen
Crea dos tablas para almacenar datos de perfil de usuario y métricas de uso, con un trigger
que crea automáticamente filas en ambas tablas cuando un nuevo usuario se registra vía Auth.

## Nuevas tablas

### `profiles`
Almacena metadatos del usuario vinculados directamente a `auth.users`:
- `id` (uuid, PK) — mismo UUID que `auth.users.id`
- `email` (text) — email del usuario
- `full_name` (text, nullable) — nombre completo opcional
- `created_at` (timestamptz) — fecha de registro
- `stripe_subscription_status` (text, default 'inactive') — estado de suscripción Stripe
- `stripe_customer_id` (text, nullable) — ID de cliente en Stripe

### `user_usage`
Almacena métricas de uso por usuario (una fila por usuario):
- `user_id` (uuid, PK) — referencia a `profiles.id`
- `total_seo_generations` (integer, default 0) — generaciones SEO realizadas
- `total_images_optimized` (integer, default 0) — imágenes optimizadas
- `total_leads_scanned` (integer, default 0) — leads/directorios escaneados
- `last_active` (timestamptz) — última actividad

## Trigger automático
`handle_new_user()` — se dispara en INSERT sobre `auth.users`. Crea automáticamente
la fila de `profiles` y la de `user_usage` para cada nuevo registro.
También hace backfill de usuarios ya existentes al final del script.

## Seguridad
- RLS habilitado en ambas tablas.
- Políticas `authenticated` con predicado de propiedad (`auth.uid() = id / user_id`).
- El trigger usa SECURITY DEFINER para poder insertar en tablas públicas desde el contexto de auth.
*/

-- ─── profiles ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id                        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                     text,
  full_name                 text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  stripe_subscription_status text NOT NULL DEFAULT 'inactive',
  stripe_customer_id        text
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ─── user_usage ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_usage (
  user_id                  uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_seo_generations    integer NOT NULL DEFAULT 0,
  total_images_optimized   integer NOT NULL DEFAULT 0,
  total_leads_scanned      integer NOT NULL DEFAULT 0,
  last_active              timestamptz DEFAULT now()
);

ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_usage" ON user_usage;
CREATE POLICY "select_own_usage" ON user_usage FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_usage" ON user_usage;
CREATE POLICY "insert_own_usage" ON user_usage FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_usage" ON user_usage;
CREATE POLICY "update_own_usage" ON user_usage FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_usage" ON user_usage;
CREATE POLICY "delete_own_usage" ON user_usage FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── Trigger: auto-crear perfil y uso en cada registro ───────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    ),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_usage (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Backfill: usuarios ya existentes ────────────────────────────────────────

INSERT INTO public.profiles (id, email, full_name, created_at)
SELECT
  id,
  email,
  COALESCE(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name'
  ),
  created_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_usage (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
