-- Sostituisce INSERT/DELETE aperti a tutti gli authenticated con policy legate ai ruoli attrezzature (come in app/_lib/admin-access).
DROP POLICY IF EXISTS "Allow insert for authenticated" ON equipment_category_groups;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON equipment_category_groups;

CREATE POLICY "equipment_category_groups_insert_scoped_admin"
  ON equipment_category_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND COALESCE(p.approved, false) = true
      AND (
        COALESCE(p.is_super_admin, false)
        OR COALESCE(p.is_admin, false)
        OR (equipment_area = 'LINEE' AND COALESCE(p.is_equipment_linee_admin, false))
        OR (equipment_area = 'STAZIONI' AND COALESCE(p.is_equipment_stazioni_admin, false))
      )
    )
  );

CREATE POLICY "equipment_category_groups_delete_scoped_admin"
  ON equipment_category_groups
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND COALESCE(p.approved, false) = true
      AND (
        COALESCE(p.is_super_admin, false)
        OR COALESCE(p.is_admin, false)
        OR (equipment_area = 'LINEE' AND COALESCE(p.is_equipment_linee_admin, false))
        OR (equipment_area = 'STAZIONI' AND COALESCE(p.is_equipment_stazioni_admin, false))
      )
    )
  );
