-- Paramètres pipeline globaux (prompts, format) — source unique Supabase
CREATE TABLE IF NOT EXISTS mini_nous_pipeline_settings (
  id text PRIMARY KEY DEFAULT 'global',
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mini_nous_pipeline_settings IS 'Réglages pipeline partagés (prompts fal, aspect ratio, etc.)';
