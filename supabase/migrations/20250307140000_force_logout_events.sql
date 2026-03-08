-- Tabella temporanea per "disconnetti tutti"
-- Solo admin può inserire; tutti gli auth possono leggere (per la subscription)

CREATE TABLE IF NOT EXISTS public.force_logout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.force_logout_events ENABLE ROW LEVEL SECURITY;

-- Solo admin può inserire
CREATE POLICY "force_logout_insert_admin"
  ON public.force_logout_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Tutti gli autenticati possono leggere (per ricevere l'evento via Realtime)
CREATE POLICY "force_logout_select_auth"
  ON public.force_logout_events FOR SELECT
  TO authenticated
  USING (true);

-- Abilita Realtime sulla tabella
-- Crea la publication se non esiste (alcuni setup Supabase potrebbero non averla)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.force_logout_events;
