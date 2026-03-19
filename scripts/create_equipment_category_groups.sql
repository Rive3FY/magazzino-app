-- Esegui questo script nella Supabase SQL Editor per creare la tabella equipment_category_groups.
-- Risolve gli errori 404 su /rest/v1/equipment_category_groups

-- Gruppi categorie attrezzature: raggruppa le categorie per tipo (es. Trecce di terra, Grilli)
CREATE TABLE IF NOT EXISTS equipment_category_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_area text NOT NULL CHECK (equipment_area IN ('LINEE', 'STAZIONI')),
  group_name text NOT NULL,
  category text NOT NULL,
  sort_order int DEFAULT 0,
  UNIQUE(equipment_area, category)
);

CREATE INDEX IF NOT EXISTS idx_equipment_category_groups_area ON equipment_category_groups(equipment_area);

-- RLS: lettura per utenti autenticati, scrittura per admin
ALTER TABLE equipment_category_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON equipment_category_groups
  FOR SELECT TO authenticated USING (true);

-- INSERT/DELETE solo per super admin, admin legacy o admin attrezzature dell'area riga
CREATE POLICY "equipment_category_groups_insert_scoped_admin" ON equipment_category_groups
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

CREATE POLICY "equipment_category_groups_delete_scoped_admin" ON equipment_category_groups
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

CREATE POLICY "Allow all for service role" ON equipment_category_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);
