-- Aggiunge movement_group_id per raggruppare movimenti da prelievo multiplo (carrello)
-- I movimenti con lo stesso group_id appartengono allo stesso prelievo
ALTER TABLE movements ADD COLUMN IF NOT EXISTS movement_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_movements_group_id ON movements(movement_group_id) WHERE movement_group_id IS NOT NULL;
