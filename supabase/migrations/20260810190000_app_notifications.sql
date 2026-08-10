-- Notifiche di sistema per admin materiali (app Capacitor / browser).
-- Al tap aprono link al report movimento o alla scheda materiale.

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text NULL,
  code text NULL,
  warehouse text NULL,
  entity_type text NULL,
  entity_id text NULL,
  actor_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NULL
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_created_at
  ON public.app_notifications (created_at DESC);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_notifications_select_materials_admin" ON public.app_notifications;
CREATE POLICY "app_notifications_select_materials_admin"
  ON public.app_notifications
  FOR SELECT
  TO authenticated
  USING (public.can_manage_materials());

DROP POLICY IF EXISTS "app_notifications_insert_auth" ON public.app_notifications;
CREATE POLICY "app_notifications_insert_auth"
  ON public.app_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Realtime: gli admin ricevono l'evento e mostrano la notifica di sistema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications';
  END IF;
END
$$;
