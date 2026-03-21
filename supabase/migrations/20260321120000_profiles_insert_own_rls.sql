-- Consenti a ogni utente autenticato di creare la propria riga in public.profiles
-- (salvataggio su /profilo se manca la riga; upsert dopo signUp con sessione immediata).
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
