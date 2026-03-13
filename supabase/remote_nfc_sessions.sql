-- Tabella per sessioni di scansione NFC remota (PC + telefono)
-- Scadenza automatica: le sessioni scadono dopo 15 minuti
CREATE TABLE IF NOT EXISTS public.remote_nfc_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  context text NOT NULL CHECK (context IN ('equipment_associate', 'movement_select')),
  context_data jsonb NOT NULL DEFAULT '{}',
  nfc_tag_id text,
  nfc_tag_ids jsonb NOT NULL DEFAULT '[]',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_remote_nfc_sessions_code ON public.remote_nfc_sessions(code);
CREATE INDEX IF NOT EXISTS idx_remote_nfc_sessions_expires ON public.remote_nfc_sessions(expires_at);

ALTER TABLE public.remote_nfc_sessions ENABLE ROW LEVEL SECURITY;

-- Solo utenti autenticati possono creare sessioni
DROP POLICY IF EXISTS "remote_nfc_sessions_insert_auth" ON public.remote_nfc_sessions;
CREATE POLICY "remote_nfc_sessions_insert_auth" ON public.remote_nfc_sessions
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Solo il creatore può leggere/aggiornare la propria sessione (per polling e submit)
DROP POLICY IF EXISTS "remote_nfc_sessions_select_own" ON public.remote_nfc_sessions;
CREATE POLICY "remote_nfc_sessions_select_own" ON public.remote_nfc_sessions
  FOR SELECT TO authenticated USING (created_by = auth.uid());

DROP POLICY IF EXISTS "remote_nfc_sessions_update_own" ON public.remote_nfc_sessions;
CREATE POLICY "remote_nfc_sessions_update_own" ON public.remote_nfc_sessions
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
