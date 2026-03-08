-- Aggiunge barcode per associazione codice a barre → materiale + magazzino
-- Un barcode può essere associato a un solo materiale/magazzino (scelta principale)

ALTER TABLE public.material_shelves ADD COLUMN IF NOT EXISTS barcode text;

-- Un barcode può essere associato a una sola riga
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_shelves_barcode
  ON public.material_shelves (barcode)
  WHERE barcode IS NOT NULL;
