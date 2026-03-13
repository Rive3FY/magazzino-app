ALTER TABLE public.equipment_assets
  ADD COLUMN IF NOT EXISTS technical_sheet_path text,
  ADD COLUMN IF NOT EXISTS technical_sheet_filename text,
  ADD COLUMN IF NOT EXISTS technical_sheet_content_type text,
  ADD COLUMN IF NOT EXISTS technical_sheet_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS technical_sheet_uploaded_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.equipment_assets.technical_sheet_path IS 'Percorso file della scheda tecnica nello storage Supabase.';
COMMENT ON COLUMN public.equipment_assets.technical_sheet_filename IS 'Nome file originale della scheda tecnica.';
COMMENT ON COLUMN public.equipment_assets.technical_sheet_content_type IS 'Content-Type della scheda tecnica.';
COMMENT ON COLUMN public.equipment_assets.technical_sheet_uploaded_at IS 'Data caricamento scheda tecnica.';
COMMENT ON COLUMN public.equipment_assets.technical_sheet_uploaded_by IS 'Utente che ha caricato o aggiornato la scheda tecnica.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'equipment-technical-sheets',
  'equipment-technical-sheets',
  false,
  20971520,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;
