-- Autoriser le pack solo (1 figurine) dans les commandes
ALTER TABLE mini_nous_orders
  DROP CONSTRAINT IF EXISTS mini_nous_orders_pack_type_check;

ALTER TABLE mini_nous_orders
  ADD CONSTRAINT mini_nous_orders_pack_type_check
  CHECK (pack_type IN ('solo', 'duo', 'famille', 'grande_famille'));
