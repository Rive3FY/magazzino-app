-- Sostituzione anagrafica da Excel: cancella gli asset assenti dal file
-- ma conserva movimenti e registri (identity in details_json, poi SET NULL).
-- Gli scaffali materiali (material_shelves) non sono toccati.

ALTER TABLE public.equipment_movements
  ALTER COLUMN equipment_id DROP NOT NULL;

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
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.apply_equipment_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_asset public.equipment_assets%ROWTYPE;
  effective_closed_at timestamptz;
BEGIN
  -- Movimento storico dopo cancellazione anagrafica (ON DELETE SET NULL).
  IF NEW.equipment_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'equipment_id_required';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE solo metadati (destinazione, note, piano, gruppo, details_json): non toccare l'anagrafica.
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.status, 'OPEN') IS NOT DISTINCT FROM COALESCE(OLD.status, 'OPEN')
     AND OLD.equipment_id IS NOT DISTINCT FROM NEW.equipment_id
     AND COALESCE(OLD.type, 'OUT') IS NOT DISTINCT FROM COALESCE(NEW.type, 'OUT')
     AND OLD.resolution_type IS NOT DISTINCT FROM NEW.resolution_type
     AND OLD.closed_at IS NOT DISTINCT FROM NEW.closed_at
     AND OLD.close_note IS NOT DISTINCT FROM NEW.close_note
     AND OLD.closed_by IS NOT DISTINCT FROM NEW.closed_by
  THEN
    RETURN NEW;
  END IF;

  SELECT * INTO current_asset
  FROM public.equipment_assets
  WHERE id = NEW.equipment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'equipment_not_found';
  END IF;

  NEW.equipment_area := current_asset.equipment_area;
  NEW.type := 'OUT';
  NEW.status := COALESCE(NEW.status, 'OPEN');

  IF NEW.status = 'OPEN' THEN
    NEW.resolution_type := NULL;
    NEW.close_note := NULL;
    NEW.closed_at := NULL;
    NEW.closed_by := NULL;
    UPDATE public.equipment_assets
    SET
      status = 'ASSIGNED',
      assigned_to_name = NULLIF(btrim(NEW.assigned_to_name), ''),
      assigned_to_email = NULLIF(lower(btrim(NEW.assigned_to_email)), ''),
      assigned_to_badge = NULLIF(btrim(NEW.assigned_to_badge), ''),
      assigned_at = NEW.created_at,
      maintenance_note = NULL,
      dismissed_at = NULL
    WHERE id = NEW.equipment_id;
  ELSE
    IF NEW.resolution_type IS NULL THEN
      RAISE EXCEPTION 'resolution_type_required';
    END IF;

    effective_closed_at := COALESCE(NEW.closed_at, now());
    NEW.closed_at := effective_closed_at;

    IF NEW.resolution_type = 'RETURN' THEN
      UPDATE public.equipment_assets
      SET
        status = 'AVAILABLE',
        assigned_to_name = NULL,
        assigned_to_email = NULL,
        assigned_to_badge = NULL,
        assigned_at = NULL,
        maintenance_note = NULL
      WHERE id = NEW.equipment_id;
    ELSIF NEW.resolution_type = 'MAINTENANCE' THEN
      UPDATE public.equipment_assets
      SET
        status = 'MAINTENANCE',
        assigned_to_name = NULL,
        assigned_to_email = NULL,
        assigned_to_badge = NULL,
        assigned_at = NULL,
        maintenance_note = NULLIF(btrim(COALESCE(NEW.close_note, '')), ''),
        dismissed_at = NULL
      WHERE id = NEW.equipment_id;
    ELSIF NEW.resolution_type = 'DISMISS' THEN
      UPDATE public.equipment_assets
      SET
        status = 'DISMISSED',
        assigned_to_name = NULL,
        assigned_to_email = NULL,
        assigned_to_badge = NULL,
        assigned_at = NULL,
        dismissed_at = effective_closed_at,
        maintenance_note = NULLIF(btrim(COALESCE(NEW.close_note, '')), '')
      WHERE id = NEW.equipment_id;
    END IF;
  END IF;

  INSERT INTO public.audit_log (
    action,
    entity_type,
    entity_id,
    code,
    warehouse,
    user_id,
    user_email,
    user_name,
    details_json
  )
  VALUES (
    'EQUIPMENT_MOVEMENT',
    'equipment_asset',
    NEW.equipment_id,
    current_asset.asset_code,
    current_asset.equipment_area,
    NEW.created_by,
    NEW.created_by_email,
    NEW.created_by_name,
    jsonb_build_object(
      'equipment_area', NEW.equipment_area,
      'movement_type', NEW.type,
      'status', NEW.status,
      'resolution_type', NEW.resolution_type,
      'note', NEW.note,
      'destination', NEW.destination,
      'intervention_plan_number', NEW.intervention_plan_number,
      'close_note', NEW.close_note,
      'assigned_to_name', NEW.assigned_to_name,
      'assigned_to_email', NEW.assigned_to_email,
      'assigned_to_badge', NEW.assigned_to_badge
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_equipment_movement_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.equipment_id IS NULL THEN
    RETURN OLD;
  END IF;
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
