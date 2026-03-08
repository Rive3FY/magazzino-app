-- Aggiunge nfc_tag_id per associazione tag NFC → materiale + magazzino
-- Un tag può essere associato a un solo materiale/magazzino

ALTER TABLE public.material_shelves ADD COLUMN IF NOT EXISTS nfc_tag_id text;

-- Un tag NFC può essere associato a una sola riga
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_shelves_nfc_tag_id
  ON public.material_shelves (nfc_tag_id)
  WHERE nfc_tag_id IS NOT NULL;
