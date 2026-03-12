-- =============================================================================
-- DELTA SQL SICURO - Attrezzature Linee / Stazioni (NON cancella dati)
-- =============================================================================
-- USO:
-- Supabase Dashboard > SQL Editor > incolla ed esegui questo file.
--
-- Questo script:
-- - Crea le tabelle equipment_* SOLO se non esistono (CREATE IF NOT EXISTS)
-- - NON fa mai DROP TABLE: i dati esistenti restano intatti
-- - Aggiorna funzioni, trigger e policy in modo sicuro
--
-- Per la PRIMA installazione usa questo script.
-- Per aggiornamenti successivi usa gli script incrementali:
--   - equipment_destination_register_update.sql
--   - fix_equipment_movement_trigger_rls.sql
--   - equipment_movement_delete_trigger.sql
--   - admin_roles_area_update.sql
-- =============================================================================

-- Tabelle: crea solo se non esistono
CREATE TABLE IF NOT EXISTS public.equipment_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  asset_code text NOT NULL UNIQUE,
  serial_number text,
  name text NOT NULL,
  category text,
  brand text,
  model text,
  equipment_area text NOT NULL CHECK (equipment_area IN ('LINEE', 'STAZIONI')),
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'DISMISSED')),
  shelf text,
  place text,
  barcode text,
  nfc_tag_id text,
  notes text,
  assigned_to_name text,
  assigned_to_email text,
  assigned_to_badge text,
  assigned_at timestamptz,
  maintenance_note text,
  dismissed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_equipment_assets_asset_code ON public.equipment_assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_equipment_assets_area ON public.equipment_assets(equipment_area);
CREATE INDEX IF NOT EXISTS idx_equipment_assets_status ON public.equipment_assets(status);
CREATE INDEX IF NOT EXISTS idx_equipment_assets_category ON public.equipment_assets(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_assets_serial_number ON public.equipment_assets(serial_number) WHERE serial_number IS NOT NULL AND btrim(serial_number) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_assets_barcode ON public.equipment_assets(barcode) WHERE barcode IS NOT NULL AND btrim(barcode) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_assets_nfc_tag_id ON public.equipment_assets(nfc_tag_id) WHERE nfc_tag_id IS NOT NULL AND btrim(nfc_tag_id) <> '';

ALTER TABLE public.equipment_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_assets_select_all" ON public.equipment_assets;
CREATE POLICY "equipment_assets_select_all" ON public.equipment_assets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "equipment_assets_insert_admin" ON public.equipment_assets;
CREATE POLICY "equipment_assets_insert_admin" ON public.equipment_assets FOR INSERT TO authenticated
  WITH CHECK (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );
DROP POLICY IF EXISTS "equipment_assets_update_admin" ON public.equipment_assets;
CREATE POLICY "equipment_assets_update_admin" ON public.equipment_assets FOR UPDATE TO authenticated
  USING (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  )
  WITH CHECK (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );
DROP POLICY IF EXISTS "equipment_assets_delete_admin" ON public.equipment_assets;
CREATE POLICY "equipment_assets_delete_admin" ON public.equipment_assets FOR DELETE TO authenticated
  USING (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );

-- equipment_movements: crea solo se non esiste
CREATE TABLE IF NOT EXISTS public.equipment_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  equipment_id uuid NOT NULL REFERENCES public.equipment_assets(id) ON DELETE CASCADE,
  equipment_area text NOT NULL CHECK (equipment_area IN ('LINEE', 'STAZIONI')),
  type text NOT NULL DEFAULT 'OUT' CHECK (type IN ('OUT')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  note text,
  destination text,
  intervention_plan_number text,
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_by_email text,
  assigned_to_name text,
  assigned_to_email text,
  assigned_to_badge text,
  resolution_type text CHECK (resolution_type IN ('RETURN', 'MAINTENANCE', 'DISMISS')),
  close_note text,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id),
  movement_group_id uuid,
  details_json jsonb
);

-- Colonne aggiuntive se mancanti (per DB creati con versioni precedenti)
ALTER TABLE public.equipment_movements ADD COLUMN IF NOT EXISTS destination text;
ALTER TABLE public.equipment_movements ADD COLUMN IF NOT EXISTS intervention_plan_number text;

CREATE INDEX IF NOT EXISTS idx_equipment_movements_area ON public.equipment_movements(equipment_area);
CREATE INDEX IF NOT EXISTS idx_equipment_movements_created_at ON public.equipment_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_movements_equipment_id ON public.equipment_movements(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_movements_status ON public.equipment_movements(status);
CREATE INDEX IF NOT EXISTS idx_equipment_movements_group ON public.equipment_movements(movement_group_id);

ALTER TABLE public.equipment_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_movements_select_all" ON public.equipment_movements;
CREATE POLICY "equipment_movements_select_all" ON public.equipment_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "equipment_movements_insert_auth" ON public.equipment_movements;
CREATE POLICY "equipment_movements_insert_auth" ON public.equipment_movements FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "equipment_movements_update_creator_or_admin" ON public.equipment_movements;
CREATE POLICY "equipment_movements_update_creator_or_admin" ON public.equipment_movements FOR UPDATE TO authenticated
  USING (
    (created_by IS NOT NULL AND created_by::text = auth.uid()::text)
    OR (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  )
  WITH CHECK (
    (created_by IS NOT NULL AND created_by::text = auth.uid()::text)
    OR (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );
DROP POLICY IF EXISTS "equipment_movements_delete_admin" ON public.equipment_movements;
CREATE POLICY "equipment_movements_delete_admin" ON public.equipment_movements FOR DELETE TO authenticated
  USING (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );

-- Funzioni e trigger (aggiornabili senza perdita dati)
CREATE OR REPLACE FUNCTION public.touch_equipment_assets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_equipment_assets_updated_at ON public.equipment_assets;
CREATE TRIGGER trg_touch_equipment_assets_updated_at
BEFORE UPDATE ON public.equipment_assets
FOR EACH ROW
EXECUTE FUNCTION public.touch_equipment_assets_updated_at();

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

DROP TRIGGER IF EXISTS trg_apply_equipment_movement ON public.equipment_movements;
CREATE TRIGGER trg_apply_equipment_movement
BEFORE INSERT OR UPDATE ON public.equipment_movements
FOR EACH ROW
EXECUTE FUNCTION public.apply_equipment_movement();

-- Trigger per ripristinare asset quando si elimina un movimento OPEN
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
