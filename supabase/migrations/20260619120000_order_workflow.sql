-- S1 · Statut de parcours client (distinct du statut paiement pending/paid/cancelled)
ALTER TABLE mini_nous_orders
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'awaiting_photo';

COMMENT ON COLUMN mini_nous_orders.workflow_status IS
  'awaiting_photo | in_studio | pending_validation | revision_requested | approved | in_production | shipped';

CREATE INDEX IF NOT EXISTS mini_nous_orders_workflow_status_idx
  ON mini_nous_orders (workflow_status);

-- Commandes déjà liées à une génération
UPDATE mini_nous_orders o
SET workflow_status = 'in_studio'
WHERE o.generation_id IS NOT NULL
  AND o.workflow_status = 'awaiting_photo'
  AND o.status = 'paid';
