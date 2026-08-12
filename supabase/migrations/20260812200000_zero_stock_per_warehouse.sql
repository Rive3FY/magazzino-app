-- Conta le quantità 0 per posizione magazzino (PRM e REALE separati).

CREATE OR REPLACE FUNCTION public.materials_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.can_manage_materials() THEN
    RAISE EXCEPTION 'Permesso negato'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'items_count', (SELECT COUNT(*) FROM public.items),
    'excel_codes_distinct', (SELECT COUNT(DISTINCT code) FROM public.excel_live),
    'excel_rows_total', (SELECT COUNT(*) FROM public.excel_live),
    'excel_rows_prm', (SELECT COUNT(*) FROM public.excel_live WHERE warehouse = 'PRM'),
    'excel_rows_reale', (SELECT COUNT(*) FROM public.excel_live WHERE warehouse = 'REALE'),
    'assigned_rows_total', (
      SELECT COUNT(*)
      FROM public.excel_live e
      INNER JOIN public.material_shelves ms
        ON ms.code = e.code AND ms.warehouse = e.warehouse
      WHERE NULLIF(btrim(ms.shelf), '') IS NOT NULL
         OR NULLIF(btrim(COALESCE(ms.place, '')), '') IS NOT NULL
    ),
    'assigned_rows_prm', (
      SELECT COUNT(*)
      FROM public.excel_live e
      INNER JOIN public.material_shelves ms
        ON ms.code = e.code AND ms.warehouse = e.warehouse
      WHERE e.warehouse = 'PRM'
        AND (
          NULLIF(btrim(ms.shelf), '') IS NOT NULL
          OR NULLIF(btrim(COALESCE(ms.place, '')), '') IS NOT NULL
        )
    ),
    'assigned_rows_reale', (
      SELECT COUNT(*)
      FROM public.excel_live e
      INNER JOIN public.material_shelves ms
        ON ms.code = e.code AND ms.warehouse = e.warehouse
      WHERE e.warehouse = 'REALE'
        AND (
          NULLIF(btrim(ms.shelf), '') IS NOT NULL
          OR NULLIF(btrim(COALESCE(ms.place, '')), '') IS NOT NULL
        )
    ),
    'orphan_shelf_rows', (
      SELECT COUNT(*)
      FROM public.material_shelves ms
      LEFT JOIN public.excel_live e
        ON e.code = ms.code AND e.warehouse = ms.warehouse
      WHERE e.code IS NULL
        AND (
          NULLIF(btrim(ms.shelf), '') IS NOT NULL
          OR NULLIF(btrim(COALESCE(ms.place, '')), '') IS NOT NULL
        )
    ),
    'excel_codes_without_item', (
      SELECT COUNT(DISTINCT e.code)
      FROM public.excel_live e
      LEFT JOIN public.items i ON i.code = e.code
      WHERE i.code IS NULL
    ),
    'zero_stock_count', (
      SELECT COUNT(*) FROM public.excel_live WHERE COALESCE(qty_free, 0) = 0
    ),
    'zero_stock_prm', (
      SELECT COUNT(*) FROM public.excel_live WHERE warehouse = 'PRM' AND COALESCE(qty_free, 0) = 0
    ),
    'zero_stock_reale', (
      SELECT COUNT(*) FROM public.excel_live WHERE warehouse = 'REALE' AND COALESCE(qty_free, 0) = 0
    ),
    'negative_stock_count', (
      SELECT COUNT(*) FROM public.excel_live WHERE COALESCE(qty_free, 0) < 0
    ),
    'open_out_movements', (
      SELECT COUNT(*) FROM public.movements WHERE type = 'OUT' AND status = 'OPEN'
    ),
    'pending_excel_requests', (
      SELECT COUNT(*) FROM public.excel_live_requests WHERE status = 'pending'
    ),
    'movements_today', (
      SELECT COUNT(*)
      FROM public.movements
      WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome')
        AND created_at < ((date_trunc('day', now() AT TIME ZONE 'Europe/Rome') + interval '1 day') AT TIME ZONE 'Europe/Rome')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.materials_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materials_dashboard_stats() TO authenticated;
