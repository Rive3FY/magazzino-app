-- Esegui nel SQL Editor di Supabase.
-- Impedisce che cancellando un'attrezzatura si perdano movimenti e registri.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum = con.conkey[1]
  WHERE con.conrelid = 'public.equipment_movements'::regclass
    AND con.contype = 'f'
    AND att.attname = 'equipment_id'
    AND array_length(con.conkey, 1) = 1
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.equipment_movements DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.equipment_movements
  DROP CONSTRAINT IF EXISTS equipment_movements_equipment_id_fkey;

ALTER TABLE public.equipment_movements
  ADD CONSTRAINT equipment_movements_equipment_id_fkey
  FOREIGN KEY (equipment_id) REFERENCES public.equipment_assets(id)
  ON DELETE RESTRICT;
