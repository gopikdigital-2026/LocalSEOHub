CREATE TABLE IF NOT EXISTS analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text NOT NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  text NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_events_event_name_idx ON analytics_events (event_name);
CREATE INDEX analytics_events_session_id_idx ON analytics_events (session_id);
CREATE INDEX analytics_events_created_at_idx ON analytics_events (created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Anon and authenticated users can insert their own events
CREATE POLICY "insert_analytics_events" ON analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Authenticated users can read only their own events
CREATE POLICY "select_own_analytics_events" ON analytics_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
