ALTER TABLE mini_nous_orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS mini_nous_orders_user_id_idx
  ON mini_nous_orders (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mini_nous_revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES mini_nous_orders(id) ON DELETE CASCADE,
  generation_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved')),
  characters jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  admin_notes text
);

CREATE INDEX IF NOT EXISTS mini_nous_revision_requests_order_id_idx
  ON mini_nous_revision_requests (order_id);

CREATE INDEX IF NOT EXISTS mini_nous_revision_requests_status_idx
  ON mini_nous_revision_requests (status);
