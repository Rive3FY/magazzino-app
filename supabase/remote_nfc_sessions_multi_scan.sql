-- Aggiunge supporto multi-scan: array di tag invece di singolo
-- Esegui dopo remote_nfc_sessions.sql

ALTER TABLE public.remote_nfc_sessions
  ADD COLUMN IF NOT EXISTS nfc_tag_ids jsonb NOT NULL DEFAULT '[]';

-- Migra dati esistenti: se nfc_tag_id è valorizzato, copialo in nfc_tag_ids
UPDATE public.remote_nfc_sessions
SET nfc_tag_ids = jsonb_build_array(nfc_tag_id)
WHERE nfc_tag_id IS NOT NULL AND nfc_tag_id <> ''
  AND (nfc_tag_ids IS NULL OR nfc_tag_ids = '[]');
