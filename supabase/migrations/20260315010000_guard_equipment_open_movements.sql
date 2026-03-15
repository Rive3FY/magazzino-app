-- Impedisce piu' movimenti OPEN sulla stessa attrezzatura.
-- Mantiene la logica attuale, ma sposta il vincolo critico nel database.

CREATE OR REPLACE FUNCTION public.guard_single_open_equipment_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.equipment_id IS NULL OR COALESCE(NEW.status, 'OPEN') <> 'OPEN' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.equipment_id::text),
    hashtext(COALESCE(NEW.equipment_area, ''))
  );

  IF EXISTS (
    SELECT 1
    FROM public.equipment_movements em
    WHERE em.equipment_id = NEW.equipment_id
      AND em.equipment_area = NEW.equipment_area
      AND COALESCE(em.status, 'OPEN') = 'OPEN'
      AND em.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Asset already has an open movement';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_single_open_equipment_movement ON public.equipment_movements;

CREATE TRIGGER trg_guard_single_open_equipment_movement
BEFORE INSERT OR UPDATE ON public.equipment_movements
FOR EACH ROW
EXECUTE FUNCTION public.guard_single_open_equipment_movement();
