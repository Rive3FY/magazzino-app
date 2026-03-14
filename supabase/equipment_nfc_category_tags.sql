-- Tag NFC per gruppo/categoria: scansionando il tag si applica il filtro categoria
-- Utile per cavi di messa a terra divisi per tensione (380kV, 150kV, 60kV)
-- dove non si può attaccare NFC direttamente alla treccia

CREATE TABLE IF NOT EXISTS public.equipment_nfc_category_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  nfc_tag_id text NOT NULL,
  category text NOT NULL,
  equipment_area text NOT NULL CHECK (equipment_area IN ('LINEE', 'STAZIONI')),
  UNIQUE(nfc_tag_id, equipment_area)
);

CREATE INDEX IF NOT EXISTS idx_equipment_nfc_category_tags_lookup
  ON public.equipment_nfc_category_tags(equipment_area, nfc_tag_id);

COMMENT ON TABLE public.equipment_nfc_category_tags IS 'Associa tag NFC a categorie: scansionando il tag si filtra per quella categoria (es. 380kV, 150kV, 60kV per cavi terra)';

ALTER TABLE public.equipment_nfc_category_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_nfc_category_tags_select" ON public.equipment_nfc_category_tags;
CREATE POLICY "equipment_nfc_category_tags_select" ON public.equipment_nfc_category_tags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "equipment_nfc_category_tags_insert" ON public.equipment_nfc_category_tags;
CREATE POLICY "equipment_nfc_category_tags_insert" ON public.equipment_nfc_category_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );

DROP POLICY IF EXISTS "equipment_nfc_category_tags_delete" ON public.equipment_nfc_category_tags;
CREATE POLICY "equipment_nfc_category_tags_delete" ON public.equipment_nfc_category_tags
  FOR DELETE TO authenticated
  USING (
    (equipment_area = 'LINEE' AND public.can_manage_equipment_linee())
    OR (equipment_area = 'STAZIONI' AND public.can_manage_equipment_stazioni())
  );
