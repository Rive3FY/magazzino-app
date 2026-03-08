-- Aggiunge la colonna luogo a material_shelves
-- Il magazzino può essere diviso in più luoghi (es. Zona A, Padiglione 2)

ALTER TABLE public.material_shelves ADD COLUMN IF NOT EXISTS place text;
