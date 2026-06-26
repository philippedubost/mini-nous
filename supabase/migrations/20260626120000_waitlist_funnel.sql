-- Liste d'attente (inscriptions quand édition complète)
CREATE TABLE IF NOT EXISTS mini_nous_waitlist (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text NOT NULL,
  face_count integer,
  week_key   text,
  source     text DEFAULT 'landing',
  created_at timestamptz DEFAULT now()
);

-- Un email par semaine (ON CONFLICT DO NOTHING côté serveur)
CREATE UNIQUE INDEX IF NOT EXISTS mini_nous_waitlist_email_week
  ON mini_nous_waitlist(email, week_key);

CREATE INDEX IF NOT EXISTS mini_nous_waitlist_week_key
  ON mini_nous_waitlist(week_key);

-- Événements funnel de conversion
CREATE TABLE IF NOT EXISTS mini_nous_funnel_events (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event      text        NOT NULL,
  session_id text,
  order_id   uuid,
  face_count integer,
  week_key   text,
  metadata   jsonb       DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mini_nous_funnel_events_event
  ON mini_nous_funnel_events(event, created_at DESC);

CREATE INDEX IF NOT EXISTS mini_nous_funnel_events_order
  ON mini_nous_funnel_events(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mini_nous_funnel_events_week
  ON mini_nous_funnel_events(week_key, event)
  WHERE week_key IS NOT NULL;

ALTER TABLE mini_nous_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE mini_nous_funnel_events ENABLE ROW LEVEL SECURITY;
