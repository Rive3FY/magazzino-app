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

-- RLS: lettura per utenti autenticati, scrittura per admin (usa le stesse policy delle altre tabelle attrezzature)
ALTER TABLE equipment_category_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON equipment_category_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all for service role" ON equipment_category_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);
