-- Trigger per ripristinare lo stato dell'attrezzatura quando un movimento OPEN viene eliminato.
-- Eseguire dopo admin_roles_area_update.sql se necessario.

CREATE OR REPLACE FUNCTION public.on_equipment_movement_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'OPEN' THEN
    UPDATE public.equipment_assets
    SET
      status = 'AVAILABLE',
      assigned_to_name = NULL,
      assigned_to_email = NULL,
      assigned_to_badge = NULL,
      assigned_at = NULL,
      maintenance_note = NULL,
      dismissed_at = NULL
    WHERE id = OLD.equipment_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_equipment_movement_delete ON public.equipment_movements;
CREATE TRIGGER trg_on_equipment_movement_delete
AFTER DELETE ON public.equipment_movements
FOR EACH ROW
EXECUTE FUNCTION public.on_equipment_movement_delete();
