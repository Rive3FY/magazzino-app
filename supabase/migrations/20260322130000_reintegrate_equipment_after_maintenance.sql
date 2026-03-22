-- Reintegro attrezzatura dopo manutenzione: aggiornamento anagrafica + nota sul movimento.
-- SECURITY DEFINER evita casi in cui il client riceve "successo" (RETURNING) ma la riga non resta aggiornata (RLS / preferenze REST).

CREATE OR REPLACE FUNCTION public.reintegrate_equipment_after_maintenance(p_equipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.equipment_assets%ROWTYPE;
  open_id uuid;
  mov_id uuid;
  mov_details jsonb;
  uid uuid := auth.uid();
  uemail text;
  disp_name text;
  reint_at text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO r FROM public.equipment_assets WHERE id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'equipment_not_found';
  END IF;

  IF NOT (
    (r.equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (r.equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT em.id INTO open_id
  FROM public.equipment_movements em
  WHERE em.equipment_id = p_equipment_id
    AND em.equipment_area = r.equipment_area
    AND COALESCE(em.status, 'OPEN') = 'OPEN'
  LIMIT 1;

  IF open_id IS NOT NULL THEN
    RAISE EXCEPTION 'open_movement_exists';
  END IF;

  IF r.status = 'AVAILABLE' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'id', r.id,
      'status', 'AVAILABLE',
      'equipment_area', r.equipment_area,
      'noop', true
    );
  END IF;

  IF r.status IS DISTINCT FROM 'MAINTENANCE' THEN
    RAISE EXCEPTION 'invalid_status_for_reintegration';
  END IF;

  UPDATE public.equipment_assets
  SET
    status = 'AVAILABLE',
    dismissed_at = NULL,
    maintenance_note = NULL,
    assigned_to_name = NULL,
    assigned_to_email = NULL,
    assigned_to_badge = NULL,
    assigned_at = NULL
  WHERE id = p_equipment_id;

  reint_at := to_char((clock_timestamp() AT TIME ZONE 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  SELECT em.id, em.details_json INTO mov_id, mov_details
  FROM public.equipment_movements em
  WHERE em.equipment_id = p_equipment_id
    AND em.equipment_area = r.equipment_area
    AND em.resolution_type = 'MAINTENANCE'
    AND em.status = 'CLOSED'
    AND em.closed_at IS NOT NULL
  ORDER BY em.closed_at DESC
  LIMIT 1;

  IF mov_id IS NOT NULL THEN
    uemail := (SELECT u.email::text FROM auth.users u WHERE u.id = uid LIMIT 1);

    SELECT NULLIF(
      trim(both ' ' FROM concat_ws(' ', NULLIF(trim(both ' ' FROM COALESCE(p.first_name, '')), ''), NULLIF(trim(both ' ' FROM COALESCE(p.last_name, '')), ''))),
      ''
    )
    INTO disp_name
    FROM public.profiles p
    WHERE p.id = uid;

    UPDATE public.equipment_movements em
    SET details_json = COALESCE(mov_details, '{}'::jsonb) || jsonb_build_object(
      'maintenance_reintegrated_at', reint_at,
      'maintenance_reintegrated_by', uid,
      'maintenance_reintegrated_by_email', uemail,
      'maintenance_reintegrated_by_name', disp_name
    )
    WHERE em.id = mov_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', r.id,
    'status', 'AVAILABLE',
    'equipment_area', r.equipment_area
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reintegrate_equipment_after_maintenance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reintegrate_equipment_after_maintenance(uuid) TO authenticated;
