-- Inventario completo con filtro opzionale per assegnazione scaffale.

DROP FUNCTION IF EXISTS public.giacenze_list(text, text, text, text, int, int);
DROP FUNCTION IF EXISTS public.giacenze_list(text, text, text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.giacenze_list(
  p_view text,
  p_search text,
  p_sort_key text,
  p_sort_dir text,
  p_shelf_filter text,
  p_limit int,
  p_offset int
)
RETURNS TABLE (
  code text,
  warehouse text,
  qty_free numeric,
  qty_blocked numeric,
  qty_quality numeric,
  initial_qty numeric,
  row_json jsonb,
  name text,
  um text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_wh text[];
BEGIN
  v_wh := CASE p_view
    WHEN 'PRM' THEN ARRAY['PRM']
    WHEN 'REALE' THEN ARRAY['REALE']
    ELSE ARRAY['PRM', 'REALE']
  END;

  SELECT COUNT(*) INTO v_total
  FROM public.excel_live e
  LEFT JOIN public.material_shelves ms
    ON ms.code = e.code AND ms.warehouse = e.warehouse
  LEFT JOIN public.items i ON i.code = e.code
  WHERE e.warehouse = ANY (v_wh)
    AND (
      COALESCE(p_shelf_filter, 'ALL') NOT IN ('WITH', 'WITHOUT')
      OR (
        p_shelf_filter = 'WITH'
        AND ms.code IS NOT NULL
        AND (
          NULLIF(btrim(COALESCE(ms.shelf, '')), '') IS NOT NULL
          OR NULLIF(btrim(COALESCE(ms.place, '')), '') IS NOT NULL
        )
      )
      OR (
        p_shelf_filter = 'WITHOUT'
        AND (
          ms.code IS NULL
          OR (
            NULLIF(btrim(COALESCE(ms.shelf, '')), '') IS NULL
            AND NULLIF(btrim(COALESCE(ms.place, '')), '') IS NULL
          )
        )
      )
    )
    AND (
      p_search IS NULL
      OR p_search = ''
      OR e.code ILIKE '%' || p_search || '%'
      OR i.name ILIKE '%' || p_search || '%'
      OR COALESCE(e.row_json->>'Descrizione Materiale', '') ILIKE '%' || p_search || '%'
    );

  RETURN QUERY
  SELECT
    x.code, x.warehouse, x.qty_free, x.qty_blocked, x.qty_quality,
    x.initial_qty, x.row_json, x.name, x.um, v_total
  FROM (
    SELECT
      e.code, e.warehouse, e.qty_free, e.qty_blocked, e.qty_quality,
      e.initial_qty, e.row_json, i.name, i.um
    FROM public.excel_live e
    LEFT JOIN public.material_shelves ms
      ON ms.code = e.code AND ms.warehouse = e.warehouse
    LEFT JOIN public.items i ON i.code = e.code
    WHERE e.warehouse = ANY (v_wh)
      AND (
        COALESCE(p_shelf_filter, 'ALL') NOT IN ('WITH', 'WITHOUT')
        OR (
          p_shelf_filter = 'WITH'
          AND ms.code IS NOT NULL
          AND (
            NULLIF(btrim(COALESCE(ms.shelf, '')), '') IS NOT NULL
            OR NULLIF(btrim(COALESCE(ms.place, '')), '') IS NOT NULL
          )
        )
        OR (
          p_shelf_filter = 'WITHOUT'
          AND (
            ms.code IS NULL
            OR (
              NULLIF(btrim(COALESCE(ms.shelf, '')), '') IS NULL
              AND NULLIF(btrim(COALESCE(ms.place, '')), '') IS NULL
            )
          )
        )
      )
      AND (
        p_search IS NULL
        OR p_search = ''
        OR e.code ILIKE '%' || p_search || '%'
        OR i.name ILIKE '%' || p_search || '%'
        OR COALESCE(e.row_json->>'Descrizione Materiale', '') ILIKE '%' || p_search || '%'
      )
    ORDER BY
      CASE WHEN p_sort_dir = 'asc' THEN
        CASE COALESCE(p_sort_key, '')
          WHEN 'Materiale' THEN e.code
          WHEN 'Descrizione Materiale' THEN COALESCE(i.name, '')
          WHEN '_warehouse' THEN e.warehouse
          WHEN 'Qnt. a Mag. libero' THEN e.qty_free::text
          WHEN 'Qnt. a Mag. bloccato' THEN e.qty_blocked::text
          WHEN 'Controllo Qualità Magazzino' THEN e.qty_quality::text
          ELSE e.code
        END
      END ASC NULLS LAST,
      CASE WHEN p_sort_dir = 'desc' THEN
        CASE COALESCE(p_sort_key, '')
          WHEN 'Materiale' THEN e.code
          WHEN 'Descrizione Materiale' THEN COALESCE(i.name, '')
          WHEN '_warehouse' THEN e.warehouse
          WHEN 'Qnt. a Mag. libero' THEN e.qty_free::text
          WHEN 'Qnt. a Mag. bloccato' THEN e.qty_blocked::text
          WHEN 'Controllo Qualità Magazzino' THEN e.qty_quality::text
          ELSE e.code
        END
      END DESC NULLS LAST,
      e.code
    LIMIT p_limit OFFSET p_offset
  ) x;
END;
$$;

REVOKE ALL ON FUNCTION public.giacenze_list(text, text, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.giacenze_list(text, text, text, text, text, int, int) TO authenticated;
