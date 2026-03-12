-- Aggiunge la colonna warehouse (Magazzino) a equipment_assets
-- Luogo/magazzino libero, scelto dall'utente (es. "Magazzino A", "Reparto X", ecc.)
ALTER TABLE public.equipment_assets
  ADD COLUMN IF NOT EXISTS warehouse text;

-- Rimuove il vincolo PRM/REALE se era stato applicato in precedenza
ALTER TABLE public.equipment_assets DROP CONSTRAINT IF EXISTS equipment_assets_warehouse_check;

COMMENT ON COLUMN public.equipment_assets.warehouse IS 'Luogo/magazzino di collocazione dell''attrezzatura (scelto dall''utente)';
