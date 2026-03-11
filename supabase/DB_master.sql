-- =============================================================================
-- DB_MASTER - Gestionale Magazzino
-- =============================================================================
-- File SQL unico per l'intero database.
--
-- USO: Supabase Dashboard > SQL Editor > incolla e esegui
--
-- Sostituisce tutte le migration in supabase/migrations/. Puoi cancellare
-- quelle vecchie e usare solo questo file. Il sito funzionerà completamente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. SCHEMA BASE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  badge_number text,
  approved boolean DEFAULT false,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.items (
  code text PRIMARY KEY,
  name text,
  um text
);

CREATE TABLE IF NOT EXISTS public.item_stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text REFERENCES public.items(code),
  warehouse text CHECK (warehouse IN ('PRM', 'REALE')),
  qty numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(code, warehouse)
);

CREATE TABLE IF NOT EXISTS public.referents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('IN', 'OUT')),
  code text NOT NULL,
  qty numeric NOT NULL,
  note text,
  warehouse text CHECK (warehouse IN ('PRM', 'REALE')),
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_by_email text,
  status text DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  returned_qty numeric,
  return_note text,
  referent_id uuid REFERENCES public.referents(id),
  referee_email text,
  referee_name text,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id),
  movement_group_id uuid
);

CREATE INDEX IF NOT EXISTS idx_movements_created_at ON public.movements(created_at);
CREATE INDEX IF NOT EXISTS idx_movements_code ON public.movements(code);
CREATE INDEX IF NOT EXISTS idx_movements_status ON public.movements(status);
CREATE INDEX IF NOT EXISTS idx_movements_type ON public.movements(type);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  code text,
  warehouse text,
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  user_name text,
  details_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

CREATE TABLE IF NOT EXISTS public.excel_original (
  code text NOT NULL,
  warehouse text NOT NULL CHECK (warehouse IN ('PRM', 'REALE')),
  qty_free numeric DEFAULT 0,
  qty_blocked numeric DEFAULT 0,
  qty_quality numeric DEFAULT 0,
  row_json jsonb,
  PRIMARY KEY (code, warehouse)
);

CREATE TABLE IF NOT EXISTS public.excel_live (
  code text NOT NULL,
  warehouse text NOT NULL CHECK (warehouse IN ('PRM', 'REALE')),
  qty_free numeric DEFAULT 0,
  qty_blocked numeric DEFAULT 0,
  qty_quality numeric DEFAULT 0,
  initial_qty numeric DEFAULT 0,
  row_json jsonb,
  PRIMARY KEY (code, warehouse)
);

CREATE INDEX IF NOT EXISTS idx_excel_live_code ON public.excel_live(code);
CREATE INDEX IF NOT EXISTS idx_excel_live_warehouse ON public.excel_live(warehouse);

ALTER TABLE movements ADD COLUMN IF NOT EXISTS referee_name text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS movement_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_movements_group_id ON movements(movement_group_id) WHERE movement_group_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 1. FUNZIONE is_admin()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false) = true;
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. RLS - PROFILES
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "Enable read for users" ON profiles;
DROP POLICY IF EXISTS "Enable update for users" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. RLS - ITEMS
-- -----------------------------------------------------------------------------
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "items_select_all" ON items;
DROP POLICY IF EXISTS "items_insert_admin" ON items;
DROP POLICY IF EXISTS "items_update_admin" ON items;
DROP POLICY IF EXISTS "items_upsert_admin" ON items;
CREATE POLICY "items_select_all" ON items FOR SELECT TO authenticated USING (true);
CREATE POLICY "items_insert_admin" ON items FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "items_update_admin" ON items FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- -----------------------------------------------------------------------------
-- 4. RLS - ITEM_STOCKS
-- -----------------------------------------------------------------------------
ALTER TABLE item_stocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "item_stocks_select_all" ON item_stocks;
DROP POLICY IF EXISTS "item_stocks_insert_admin" ON item_stocks;
DROP POLICY IF EXISTS "item_stocks_update_admin" ON item_stocks;
DROP POLICY IF EXISTS "item_stocks_modify_admin" ON item_stocks;
CREATE POLICY "item_stocks_select_all" ON item_stocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_stocks_modify_admin" ON item_stocks FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- -----------------------------------------------------------------------------
-- 5. RLS - MOVEMENTS
-- -----------------------------------------------------------------------------
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "movements_select_all" ON movements;
DROP POLICY IF EXISTS "movements_insert_auth" ON movements;
DROP POLICY IF EXISTS "movements_update_creator_or_admin" ON movements;
DROP POLICY IF EXISTS "movements_delete_admin" ON movements;
DROP POLICY IF EXISTS "movements_select_policy" ON movements;
DROP POLICY IF EXISTS "movements_insert_policy" ON movements;
DROP POLICY IF EXISTS "movements_update_policy" ON movements;
DROP POLICY IF EXISTS "movements_delete_policy" ON movements;
CREATE POLICY "movements_select_all" ON movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "movements_insert_auth" ON movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "movements_update_creator_or_admin" ON movements FOR UPDATE TO authenticated
  USING ((created_by IS NOT NULL AND created_by::text = auth.uid()::text) OR is_admin())
  WITH CHECK ((created_by IS NOT NULL AND created_by::text = auth.uid()::text) OR is_admin());
CREATE POLICY "movements_delete_admin" ON movements FOR DELETE TO authenticated USING (is_admin());

-- -----------------------------------------------------------------------------
-- 6. RLS - REFERENTS
-- -----------------------------------------------------------------------------
ALTER TABLE referents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referents_select_all" ON referents;
DROP POLICY IF EXISTS "referents_insert_admin" ON referents;
DROP POLICY IF EXISTS "referents_update_admin" ON referents;
DROP POLICY IF EXISTS "referents_delete_admin" ON referents;
DROP POLICY IF EXISTS "Allow admin update referents" ON referents;
DROP POLICY IF EXISTS "referents_update_policy" ON referents;
DROP POLICY IF EXISTS "Enable update for admins" ON referents;
CREATE POLICY "referents_select_all" ON referents FOR SELECT TO authenticated USING (true);
CREATE POLICY "referents_insert_admin" ON referents FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "referents_update_admin" ON referents FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "referents_delete_admin" ON referents FOR DELETE TO authenticated USING (is_admin());

-- -----------------------------------------------------------------------------
-- 7. RLS - AUDIT_LOG
-- -----------------------------------------------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert_auth" ON audit_log;
DROP POLICY IF EXISTS "audit_log_select_policy" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert_policy" ON audit_log;
CREATE POLICY "audit_log_select_admin" ON audit_log FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "audit_log_insert_auth" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 8. RLS - EXCEL_LIVE
-- -----------------------------------------------------------------------------
ALTER TABLE excel_live ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "excel_live_select_all" ON excel_live;
DROP POLICY IF EXISTS "excel_live_insert_admin" ON excel_live;
DROP POLICY IF EXISTS "excel_live_update_admin" ON excel_live;
DROP POLICY IF EXISTS "excel_live_delete_admin" ON excel_live;
CREATE POLICY "excel_live_select_all" ON excel_live FOR SELECT TO authenticated USING (true);
CREATE POLICY "excel_live_insert_admin" ON excel_live FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "excel_live_update_admin" ON excel_live FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "excel_live_delete_admin" ON excel_live FOR DELETE TO authenticated USING (is_admin());

-- -----------------------------------------------------------------------------
-- 9. RLS - EXCEL_ORIGINAL
-- -----------------------------------------------------------------------------
ALTER TABLE excel_original ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "excel_original_select_admin" ON excel_original;
DROP POLICY IF EXISTS "excel_original_insert_admin" ON excel_original;
DROP POLICY IF EXISTS "excel_original_update_admin" ON excel_original;
CREATE POLICY "excel_original_select_admin" ON excel_original FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "excel_original_insert_admin" ON excel_original FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "excel_original_update_admin" ON excel_original FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- -----------------------------------------------------------------------------
-- 10. Trigger profilo alla registrazione
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, badge_number)
  VALUES (new.id, COALESCE(new.raw_user_meta_data ->> 'first_name', ''), COALESCE(new.raw_user_meta_data ->> 'last_name', ''), COALESCE(new.raw_user_meta_data ->> 'badge_number', ''));
  RETURN new;
EXCEPTION WHEN unique_violation THEN
  UPDATE public.profiles SET first_name = COALESCE(new.raw_user_meta_data ->> 'first_name', first_name), last_name = COALESCE(new.raw_user_meta_data ->> 'last_name', last_name), badge_number = COALESCE(new.raw_user_meta_data ->> 'badge_number', badge_number) WHERE id = new.id;
  RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 11. Force logout events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.force_logout_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.force_logout_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "force_logout_insert_admin" ON public.force_logout_events;
DROP POLICY IF EXISTS "force_logout_select_auth" ON public.force_logout_events;
CREATE POLICY "force_logout_insert_admin" ON public.force_logout_events FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "force_logout_select_auth" ON public.force_logout_events FOR SELECT TO authenticated USING (true);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.force_logout_events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 12. Material shelves
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_shelves (
  code text NOT NULL, warehouse text NOT NULL CHECK (warehouse IN ('PRM', 'REALE')), shelf text NOT NULL, place text, nfc_tag_id text, barcode text, PRIMARY KEY (code, warehouse)
);
CREATE INDEX IF NOT EXISTS idx_material_shelves_code ON public.material_shelves (code);
CREATE INDEX IF NOT EXISTS idx_material_shelves_warehouse ON public.material_shelves (warehouse);
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_shelves_nfc_tag_id ON public.material_shelves (nfc_tag_id) WHERE nfc_tag_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_shelves_barcode ON public.material_shelves (barcode) WHERE barcode IS NOT NULL;
ALTER TABLE public.material_shelves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_shelves_select_all" ON public.material_shelves;
DROP POLICY IF EXISTS "material_shelves_insert_admin" ON public.material_shelves;
DROP POLICY IF EXISTS "material_shelves_update_admin" ON public.material_shelves;
DROP POLICY IF EXISTS "material_shelves_delete_admin" ON public.material_shelves;
CREATE POLICY "material_shelves_select_all" ON public.material_shelves FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_shelves_insert_admin" ON public.material_shelves FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "material_shelves_update_admin" ON public.material_shelves FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "material_shelves_delete_admin" ON public.material_shelves FOR DELETE TO authenticated USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 13. Fix returned_qty
-- -----------------------------------------------------------------------------
UPDATE movements SET returned_qty = NULL WHERE status = 'OPEN' AND type = 'OUT' AND returned_qty = 0;
ALTER TABLE movements ALTER COLUMN returned_qty DROP DEFAULT;

-- -----------------------------------------------------------------------------
-- 14. Excel live requests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.excel_live_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL REFERENCES public.movements(id) ON DELETE CASCADE,
  code text NOT NULL, warehouse text NOT NULL CHECK (warehouse IN ('PRM', 'REALE')), delta_free numeric NOT NULL,
  requested_by uuid REFERENCES auth.users(id), requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz, review_note text, details_json jsonb
);
CREATE INDEX IF NOT EXISTS idx_excel_live_requests_status ON public.excel_live_requests(status);
CREATE INDEX IF NOT EXISTS idx_excel_live_requests_movement ON public.excel_live_requests(movement_id);
ALTER TABLE public.excel_live_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "excel_live_requests_select_own" ON public.excel_live_requests;
DROP POLICY IF EXISTS "excel_live_requests_select_admin" ON public.excel_live_requests;
DROP POLICY IF EXISTS "excel_live_requests_insert_own" ON public.excel_live_requests;
DROP POLICY IF EXISTS "excel_live_requests_update_admin" ON public.excel_live_requests;
CREATE POLICY "excel_live_requests_select_own" ON public.excel_live_requests FOR SELECT TO authenticated USING (requested_by = auth.uid());
CREATE POLICY "excel_live_requests_select_admin" ON public.excel_live_requests FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "excel_live_requests_insert_own" ON public.excel_live_requests FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());
CREATE POLICY "excel_live_requests_update_admin" ON public.excel_live_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 15. RPC - admin_list_users
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (id uuid, user_id uuid, email text, approved boolean, is_admin boolean, badge_number text, first_name text, last_name text, created_at timestamptz, profile_updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  RETURN QUERY
  SELECT u.id, u.id AS user_id, u.email::text, COALESCE(p.approved, false), COALESCE(p.is_admin, false), p.badge_number, p.first_name, p.last_name, u.created_at, p.updated_at AS profile_updated_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- -----------------------------------------------------------------------------
-- 17. RPC - set_approved
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_approved(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_approved(p_user uuid, p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, approved, updated_at) VALUES (p_user, p_approved, now())
  ON CONFLICT (id) DO UPDATE SET approved = p_approved, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_approved(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 18. RPC - set_admin
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_admin(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_admin(p_user uuid, p_is_admin boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, is_admin, updated_at) VALUES (p_user, p_is_admin, now())
  ON CONFLICT (id) DO UPDATE SET is_admin = p_is_admin, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_admin(uuid, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 19. RPC - admin_grant_admin
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_grant_admin(uuid);
CREATE OR REPLACE FUNCTION public.admin_grant_admin(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, is_admin, updated_at) VALUES (target_user, true, now())
  ON CONFLICT (id) DO UPDATE SET is_admin = true, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_grant_admin(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 20. RPC - admin_revoke_admin
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_revoke_admin(uuid);
CREATE OR REPLACE FUNCTION public.admin_revoke_admin(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE admin_count int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF target_user = auth.uid() THEN RAISE EXCEPTION 'cannot_revoke_self'; END IF;
  SELECT COUNT(*)::int INTO admin_count FROM public.profiles WHERE is_admin = true;
  IF admin_count <= 1 THEN RAISE EXCEPTION 'cannot_remove_last_admin'; END IF;
  UPDATE public.profiles SET is_admin = false, updated_at = now() WHERE id = target_user;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_revoke_admin(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 21. RPC - admin_update_profile
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_update_profile(target_user uuid, p_badge text, p_first_name text, p_last_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.profiles SET badge_number = p_badge, first_name = p_first_name, last_name = p_last_name, updated_at = now() WHERE id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 22. RPC - reset_magazzino
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reset_magazzino();
CREATE OR REPLACE FUNCTION public.reset_magazzino()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  DELETE FROM public.excel_live_requests;
  DELETE FROM public.movements;
  DELETE FROM public.excel_live;
  DELETE FROM public.excel_original;
  DELETE FROM public.audit_log;
  DELETE FROM public.item_stocks;
  DELETE FROM public.items;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reset_magazzino() TO authenticated;

-- -----------------------------------------------------------------------------
-- 23. RPC - giacenze_list
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.giacenze_list(text, text, text, text, int, int);
CREATE OR REPLACE FUNCTION public.giacenze_list(p_view text, p_search text, p_sort_key text, p_sort_dir text, p_limit int, p_offset int)
RETURNS TABLE (code text, warehouse text, qty_free numeric, qty_blocked numeric, qty_quality numeric, initial_qty numeric, row_json jsonb, name text, um text, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_total bigint; v_wh text[];
BEGIN
  v_wh := CASE p_view WHEN 'PRM' THEN ARRAY['PRM'] WHEN 'REALE' THEN ARRAY['REALE'] ELSE ARRAY['PRM','REALE'] END;
  SELECT COUNT(*) INTO v_total FROM public.excel_live e LEFT JOIN public.items i ON i.code = e.code
  WHERE e.warehouse = ANY(v_wh) AND (p_search IS NULL OR p_search = '' OR e.code ILIKE '%'||p_search||'%' OR i.name ILIKE '%'||p_search||'%' OR COALESCE(e.row_json->>'Descrizione Materiale','') ILIKE '%'||p_search||'%');
  RETURN QUERY
  SELECT x.code, x.warehouse, x.qty_free, x.qty_blocked, x.qty_quality, x.initial_qty, x.row_json, x.name, x.um, v_total
  FROM (
    SELECT e.code, e.warehouse, e.qty_free, e.qty_blocked, e.qty_quality, e.initial_qty, e.row_json, i.name, i.um
    FROM public.excel_live e LEFT JOIN public.items i ON i.code = e.code
    WHERE e.warehouse = ANY(v_wh) AND (p_search IS NULL OR p_search = '' OR e.code ILIKE '%'||p_search||'%' OR i.name ILIKE '%'||p_search||'%' OR COALESCE(e.row_json->>'Descrizione Materiale','') ILIKE '%'||p_search||'%')
    ORDER BY
      CASE WHEN p_sort_dir = 'asc' THEN CASE COALESCE(p_sort_key,'') WHEN 'Materiale' THEN e.code WHEN 'Descrizione Materiale' THEN COALESCE(i.name,'') WHEN '_warehouse' THEN e.warehouse WHEN 'Qnt. a Mag. libero' THEN e.qty_free::text WHEN 'Qnt. a Mag. bloccato' THEN e.qty_blocked::text WHEN 'Controllo Qualità Magazzino' THEN e.qty_quality::text ELSE e.code END END ASC NULLS LAST,
      CASE WHEN p_sort_dir = 'desc' THEN CASE COALESCE(p_sort_key,'') WHEN 'Materiale' THEN e.code WHEN 'Descrizione Materiale' THEN COALESCE(i.name,'') WHEN '_warehouse' THEN e.warehouse WHEN 'Qnt. a Mag. libero' THEN e.qty_free::text WHEN 'Qnt. a Mag. bloccato' THEN e.qty_blocked::text WHEN 'Controllo Qualità Magazzino' THEN e.qty_quality::text ELSE e.code END END DESC NULLS LAST,
      e.code
    LIMIT p_limit OFFSET p_offset
  ) x;
END;
$$;
GRANT EXECUTE ON FUNCTION public.giacenze_list(text, text, text, text, int, int) TO authenticated;

-- -----------------------------------------------------------------------------
-- 24. Backup file importati
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_file_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  warehouse text NOT NULL CHECK (warehouse IN ('PRM', 'REALE')),
  original_filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  content_type text,
  file_size bigint,
  row_count integer,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_by_email text
);

CREATE INDEX IF NOT EXISTS idx_import_file_backups_created_at ON public.import_file_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_file_backups_warehouse ON public.import_file_backups(warehouse);

ALTER TABLE public.import_file_backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_file_backups_select_admin" ON public.import_file_backups;
DROP POLICY IF EXISTS "import_file_backups_insert_admin" ON public.import_file_backups;
CREATE POLICY "import_file_backups_select_admin" ON public.import_file_backups FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "import_file_backups_insert_admin" ON public.import_file_backups FOR INSERT TO authenticated WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'import-backups',
  'import-backups',
  false,
  52428800,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 25. Attrezzature - registro interno
-- -----------------------------------------------------------------------------
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
DROP POLICY IF EXISTS "equipment_assets_insert_admin" ON public.equipment_assets;
DROP POLICY IF EXISTS "equipment_assets_update_admin" ON public.equipment_assets;
DROP POLICY IF EXISTS "equipment_assets_delete_admin" ON public.equipment_assets;
CREATE POLICY "equipment_assets_select_all" ON public.equipment_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipment_assets_insert_admin" ON public.equipment_assets FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "equipment_assets_update_admin" ON public.equipment_assets FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "equipment_assets_delete_admin" ON public.equipment_assets FOR DELETE TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.equipment_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  equipment_id uuid NOT NULL REFERENCES public.equipment_assets(id) ON DELETE CASCADE,
  equipment_area text NOT NULL CHECK (equipment_area IN ('LINEE', 'STAZIONI')),
  type text NOT NULL DEFAULT 'OUT' CHECK (type IN ('OUT')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  note text,
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

CREATE INDEX IF NOT EXISTS idx_equipment_movements_area ON public.equipment_movements(equipment_area);
CREATE INDEX IF NOT EXISTS idx_equipment_movements_created_at ON public.equipment_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_movements_equipment_id ON public.equipment_movements(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_movements_status ON public.equipment_movements(status);
CREATE INDEX IF NOT EXISTS idx_equipment_movements_group ON public.equipment_movements(movement_group_id);

ALTER TABLE public.equipment_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_movements_select_all" ON public.equipment_movements;
DROP POLICY IF EXISTS "equipment_movements_insert_auth" ON public.equipment_movements;
DROP POLICY IF EXISTS "equipment_movements_update_creator_or_admin" ON public.equipment_movements;
DROP POLICY IF EXISTS "equipment_movements_delete_admin" ON public.equipment_movements;
CREATE POLICY "equipment_movements_select_all" ON public.equipment_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipment_movements_insert_auth" ON public.equipment_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "equipment_movements_update_creator_or_admin" ON public.equipment_movements FOR UPDATE TO authenticated
  USING ((created_by IS NOT NULL AND created_by::text = auth.uid()::text) OR public.is_admin())
  WITH CHECK ((created_by IS NOT NULL AND created_by::text = auth.uid()::text) OR public.is_admin());
CREATE POLICY "equipment_movements_delete_admin" ON public.equipment_movements FOR DELETE TO authenticated USING (public.is_admin());

DROP FUNCTION IF EXISTS public.touch_equipment_assets_updated_at();
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

DROP FUNCTION IF EXISTS public.apply_equipment_movement();
CREATE OR REPLACE FUNCTION public.apply_equipment_movement()
RETURNS trigger
LANGUAGE plpgsql
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

-- =============================================================================
-- FINE DB_MASTER
-- =============================================================================
