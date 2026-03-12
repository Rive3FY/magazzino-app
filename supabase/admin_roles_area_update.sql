BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_materials_admin boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_equipment_linee_admin boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_equipment_stazioni_admin boolean DEFAULT false;

UPDATE public.profiles
SET is_super_admin = true
WHERE COALESCE(is_admin, false) = true
  AND COALESCE(is_super_admin, false) = false;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(is_super_admin, false) OR COALESCE(is_admin, false)
      FROM public.profiles
      WHERE id = auth.uid()
    ),
    false
  ) = true;
$$;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_materials_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_materials_admin FROM public.profiles WHERE id = auth.uid()), false) = true;
$$;
GRANT EXECUTE ON FUNCTION public.is_materials_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_equipment_linee_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_equipment_linee_admin FROM public.profiles WHERE id = auth.uid()), false) = true;
$$;
GRANT EXECUTE ON FUNCTION public.is_equipment_linee_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_equipment_stazioni_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_equipment_stazioni_admin FROM public.profiles WHERE id = auth.uid()), false) = true;
$$;
GRANT EXECUTE ON FUNCTION public.is_equipment_stazioni_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_materials()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin() OR public.is_materials_admin();
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_materials() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_equipment_linee()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin() OR public.is_equipment_linee_admin();
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_equipment_linee() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_equipment_stazioni()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin() OR public.is_equipment_stazioni_admin();
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_equipment_stazioni() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_materials_admin()
    OR public.is_equipment_linee_admin()
    OR public.is_equipment_stazioni_admin();
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "items_insert_admin" ON public.items;
DROP POLICY IF EXISTS "items_update_admin" ON public.items;
CREATE POLICY "items_insert_admin" ON public.items FOR INSERT TO authenticated WITH CHECK (public.can_manage_materials());
CREATE POLICY "items_update_admin" ON public.items FOR UPDATE TO authenticated USING (public.can_manage_materials()) WITH CHECK (public.can_manage_materials());

DROP POLICY IF EXISTS "item_stocks_modify_admin" ON public.item_stocks;
CREATE POLICY "item_stocks_modify_admin" ON public.item_stocks FOR ALL TO authenticated USING (public.can_manage_materials()) WITH CHECK (public.can_manage_materials());

DROP POLICY IF EXISTS "movements_update_creator_or_admin" ON public.movements;
DROP POLICY IF EXISTS "movements_delete_admin" ON public.movements;
CREATE POLICY "movements_update_creator_or_admin" ON public.movements FOR UPDATE TO authenticated
  USING ((created_by IS NOT NULL AND created_by::text = auth.uid()::text) OR public.can_manage_materials())
  WITH CHECK ((created_by IS NOT NULL AND created_by::text = auth.uid()::text) OR public.can_manage_materials());
CREATE POLICY "movements_delete_admin" ON public.movements FOR DELETE TO authenticated USING (public.can_manage_materials());

DROP POLICY IF EXISTS "referents_insert_admin" ON public.referents;
DROP POLICY IF EXISTS "referents_update_admin" ON public.referents;
DROP POLICY IF EXISTS "referents_delete_admin" ON public.referents;
CREATE POLICY "referents_insert_admin" ON public.referents FOR INSERT TO authenticated WITH CHECK (public.can_manage_materials());
CREATE POLICY "referents_update_admin" ON public.referents FOR UPDATE TO authenticated USING (public.can_manage_materials()) WITH CHECK (public.can_manage_materials());
CREATE POLICY "referents_delete_admin" ON public.referents FOR DELETE TO authenticated USING (public.can_manage_materials());

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "excel_live_insert_admin" ON public.excel_live;
DROP POLICY IF EXISTS "excel_live_update_admin" ON public.excel_live;
DROP POLICY IF EXISTS "excel_live_delete_admin" ON public.excel_live;
CREATE POLICY "excel_live_insert_admin" ON public.excel_live FOR INSERT TO authenticated WITH CHECK (public.can_manage_materials());
CREATE POLICY "excel_live_update_admin" ON public.excel_live FOR UPDATE TO authenticated USING (public.can_manage_materials()) WITH CHECK (public.can_manage_materials());
CREATE POLICY "excel_live_delete_admin" ON public.excel_live FOR DELETE TO authenticated USING (public.can_manage_materials());

DROP POLICY IF EXISTS "excel_original_select_admin" ON public.excel_original;
DROP POLICY IF EXISTS "excel_original_insert_admin" ON public.excel_original;
DROP POLICY IF EXISTS "excel_original_update_admin" ON public.excel_original;
CREATE POLICY "excel_original_select_admin" ON public.excel_original FOR SELECT TO authenticated USING (public.can_manage_materials());
CREATE POLICY "excel_original_insert_admin" ON public.excel_original FOR INSERT TO authenticated WITH CHECK (public.can_manage_materials());
CREATE POLICY "excel_original_update_admin" ON public.excel_original FOR UPDATE TO authenticated USING (public.can_manage_materials()) WITH CHECK (public.can_manage_materials());

DROP POLICY IF EXISTS "force_logout_insert_admin" ON public.force_logout_events;
CREATE POLICY "force_logout_insert_admin" ON public.force_logout_events FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "material_shelves_insert_admin" ON public.material_shelves;
DROP POLICY IF EXISTS "material_shelves_update_admin" ON public.material_shelves;
DROP POLICY IF EXISTS "material_shelves_delete_admin" ON public.material_shelves;
CREATE POLICY "material_shelves_insert_admin" ON public.material_shelves FOR INSERT TO authenticated WITH CHECK (public.can_manage_materials());
CREATE POLICY "material_shelves_update_admin" ON public.material_shelves FOR UPDATE TO authenticated USING (public.can_manage_materials()) WITH CHECK (public.can_manage_materials());
CREATE POLICY "material_shelves_delete_admin" ON public.material_shelves FOR DELETE TO authenticated USING (public.can_manage_materials());

DROP POLICY IF EXISTS "excel_live_requests_select_admin" ON public.excel_live_requests;
DROP POLICY IF EXISTS "excel_live_requests_update_admin" ON public.excel_live_requests;
CREATE POLICY "excel_live_requests_select_admin" ON public.excel_live_requests FOR SELECT TO authenticated USING (public.can_manage_materials());
CREATE POLICY "excel_live_requests_update_admin" ON public.excel_live_requests FOR UPDATE TO authenticated USING (public.can_manage_materials()) WITH CHECK (public.can_manage_materials());

DROP POLICY IF EXISTS "import_file_backups_select_admin" ON public.import_file_backups;
DROP POLICY IF EXISTS "import_file_backups_insert_admin" ON public.import_file_backups;
CREATE POLICY "import_file_backups_select_admin" ON public.import_file_backups FOR SELECT TO authenticated USING (public.can_manage_materials());
CREATE POLICY "import_file_backups_insert_admin" ON public.import_file_backups FOR INSERT TO authenticated WITH CHECK (public.can_manage_materials());

DROP POLICY IF EXISTS "equipment_assets_insert_admin" ON public.equipment_assets;
DROP POLICY IF EXISTS "equipment_assets_update_admin" ON public.equipment_assets;
DROP POLICY IF EXISTS "equipment_assets_delete_admin" ON public.equipment_assets;
CREATE POLICY "equipment_assets_insert_admin" ON public.equipment_assets FOR INSERT TO authenticated
  WITH CHECK (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );
CREATE POLICY "equipment_assets_update_admin" ON public.equipment_assets FOR UPDATE TO authenticated
  USING (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  )
  WITH CHECK (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );
CREATE POLICY "equipment_assets_delete_admin" ON public.equipment_assets FOR DELETE TO authenticated
  USING (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );

DROP POLICY IF EXISTS "equipment_movements_update_creator_or_admin" ON public.equipment_movements;
DROP POLICY IF EXISTS "equipment_movements_delete_admin" ON public.equipment_movements;
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
CREATE POLICY "equipment_movements_delete_admin" ON public.equipment_movements FOR DELETE TO authenticated
  USING (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  approved boolean,
  is_super_admin boolean,
  is_materials_admin boolean,
  is_equipment_linee_admin boolean,
  is_equipment_stazioni_admin boolean,
  badge_number text,
  first_name text,
  last_name text,
  created_at timestamptz,
  profile_updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.id AS user_id,
    u.email::text,
    COALESCE(p.approved, false),
    COALESCE(p.is_super_admin, false) OR COALESCE(p.is_admin, false),
    COALESCE(p.is_materials_admin, false),
    COALESCE(p.is_equipment_linee_admin, false),
    COALESCE(p.is_equipment_stazioni_admin, false),
    p.badge_number,
    p.first_name,
    p.last_name,
    u.created_at,
    p.updated_at AS profile_updated_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_materials_admins();
CREATE OR REPLACE FUNCTION public.admin_list_materials_admins()
RETURNS TABLE (id uuid, user_id uuid, email text, approved boolean, is_materials_admin boolean, badge_number text, first_name text, last_name text, created_at timestamptz, profile_updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_materials() THEN RAISE EXCEPTION 'not_admin'; END IF;
  RETURN QUERY
  SELECT u.id, u.id AS user_id, u.email::text, COALESCE(p.approved, false), COALESCE(p.is_materials_admin, false), p.badge_number, p.first_name, p.last_name, u.created_at, p.updated_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_materials_admins() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_linee_admins();
CREATE OR REPLACE FUNCTION public.admin_list_linee_admins()
RETURNS TABLE (id uuid, user_id uuid, email text, approved boolean, is_equipment_linee_admin boolean, badge_number text, first_name text, last_name text, created_at timestamptz, profile_updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_equipment_linee() THEN RAISE EXCEPTION 'not_admin'; END IF;
  RETURN QUERY
  SELECT u.id, u.id AS user_id, u.email::text, COALESCE(p.approved, false), COALESCE(p.is_equipment_linee_admin, false), p.badge_number, p.first_name, p.last_name, u.created_at, p.updated_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_linee_admins() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_stazioni_admins();
CREATE OR REPLACE FUNCTION public.admin_list_stazioni_admins()
RETURNS TABLE (id uuid, user_id uuid, email text, approved boolean, is_equipment_stazioni_admin boolean, badge_number text, first_name text, last_name text, created_at timestamptz, profile_updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_equipment_stazioni() THEN RAISE EXCEPTION 'not_admin'; END IF;
  RETURN QUERY
  SELECT u.id, u.id AS user_id, u.email::text, COALESCE(p.approved, false), COALESCE(p.is_equipment_stazioni_admin, false), p.badge_number, p.first_name, p.last_name, u.created_at, p.updated_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_stazioni_admins() TO authenticated;

DROP FUNCTION IF EXISTS public.set_approved(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_approved(p_user uuid, p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, approved, updated_at) VALUES (p_user, p_approved, now())
  ON CONFLICT (id) DO UPDATE SET approved = p_approved, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_approved(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.set_admin(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_admin(p_user uuid, p_is_admin boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, is_admin, is_super_admin, updated_at) VALUES (p_user, p_is_admin, p_is_admin, now())
  ON CONFLICT (id) DO UPDATE SET is_admin = p_is_admin, is_super_admin = p_is_admin, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_admin(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_grant_admin(uuid);
CREATE OR REPLACE FUNCTION public.admin_grant_admin(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, is_admin, is_super_admin, updated_at) VALUES (target_user, true, true, now())
  ON CONFLICT (id) DO UPDATE SET is_admin = true, is_super_admin = true, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_grant_admin(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_revoke_admin(uuid);
CREATE OR REPLACE FUNCTION public.admin_revoke_admin(target_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE admin_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF target_user = auth.uid() THEN RAISE EXCEPTION 'cannot_revoke_self'; END IF;
  SELECT COUNT(*)::int INTO admin_count FROM public.profiles WHERE COALESCE(is_super_admin, false) = true OR COALESCE(is_admin, false) = true;
  IF admin_count <= 1 THEN RAISE EXCEPTION 'cannot_remove_last_admin'; END IF;
  UPDATE public.profiles SET is_admin = false, is_super_admin = false, updated_at = now() WHERE id = target_user;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_revoke_admin(uuid) TO authenticated;

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

DROP FUNCTION IF EXISTS public.set_materials_admin(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_materials_admin(target_user uuid, enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_materials() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, is_materials_admin, updated_at) VALUES (target_user, enabled, now())
  ON CONFLICT (id) DO UPDATE SET is_materials_admin = enabled, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_materials_admin(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.set_equipment_linee_admin(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_equipment_linee_admin(target_user uuid, enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_equipment_linee() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, is_equipment_linee_admin, updated_at) VALUES (target_user, enabled, now())
  ON CONFLICT (id) DO UPDATE SET is_equipment_linee_admin = enabled, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_equipment_linee_admin(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.set_equipment_stazioni_admin(uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_equipment_stazioni_admin(target_user uuid, enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_equipment_stazioni() THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.profiles (id, is_equipment_stazioni_admin, updated_at) VALUES (target_user, enabled, now())
  ON CONFLICT (id) DO UPDATE SET is_equipment_stazioni_admin = enabled, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_equipment_stazioni_admin(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.reset_magazzino();
CREATE OR REPLACE FUNCTION public.reset_magazzino()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
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

COMMIT;
