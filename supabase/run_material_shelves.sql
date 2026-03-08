-- Esegui questo script nel SQL Editor di Supabase (Dashboard > SQL Editor > New query)
-- per creare la tabella material_shelves

CREATE TABLE IF NOT EXISTS public.material_shelves (
  code text NOT NULL,
  warehouse text NOT NULL CHECK (warehouse IN ('PRM', 'REALE')),
  shelf text NOT NULL,
  place text,
  PRIMARY KEY (code, warehouse)
);

CREATE INDEX IF NOT EXISTS idx_material_shelves_code ON public.material_shelves (code);
CREATE INDEX IF NOT EXISTS idx_material_shelves_warehouse ON public.material_shelves (warehouse);

ALTER TABLE public.material_shelves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_shelves_select_all" ON public.material_shelves;
CREATE POLICY "material_shelves_select_all"
  ON public.material_shelves FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "material_shelves_insert_admin" ON public.material_shelves;
CREATE POLICY "material_shelves_insert_admin"
  ON public.material_shelves FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "material_shelves_update_admin" ON public.material_shelves;
CREATE POLICY "material_shelves_update_admin"
  ON public.material_shelves FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "material_shelves_delete_admin" ON public.material_shelves;
CREATE POLICY "material_shelves_delete_admin"
  ON public.material_shelves FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Se la tabella esiste già senza place, aggiungila:
ALTER TABLE public.material_shelves ADD COLUMN IF NOT EXISTS place text;

-- NFC tag per associazione
ALTER TABLE public.material_shelves ADD COLUMN IF NOT EXISTS nfc_tag_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_shelves_nfc_tag_id
  ON public.material_shelves (nfc_tag_id)
  WHERE nfc_tag_id IS NOT NULL;

-- Barcode per associazione (scelta principale)
ALTER TABLE public.material_shelves ADD COLUMN IF NOT EXISTS barcode text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_shelves_barcode
  ON public.material_shelves (barcode)
  WHERE barcode IS NOT NULL;
