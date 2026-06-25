CREATE TABLE IF NOT EXISTS trial_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trial_fingerprints_email_idx ON trial_fingerprints (email);
CREATE INDEX IF NOT EXISTS trial_fingerprints_ip_idx ON trial_fingerprints (ip_address);

ALTER TABLE trial_fingerprints ENABLE ROW LEVEL SECURITY;
-- No policies: solo accesible con service_role key desde edge functions
