-- =============================================================================
-- MIGRAZIONE COMPLETA: Schema e RLS per Gestionale Magazzino
-- =============================================================================
-- Esegui questo script nella SQL Editor di Supabase (Dashboard > SQL Editor)
-- oppure con: supabase db push
--
-- Questa migration:
-- 1. Crea la funzione is_admin() per uso nelle policy
-- 2. Rimuove tutte le policy esistenti (pulizia)
-- 3. Crea policy RLS coerenti per ogni tabella
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNZIONE HELPER is_admin()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  ) = true;
$$;

-- Grant execute a authenticated
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. PROFILES
-- Ogni utente legge il proprio profilo; gli admin leggono tutti
-- Ogni utente aggiorna il proprio (badge, nome, cognome)
-- Le modifiche approved/is_admin avvengono via RPC (set_approved, set_admin)
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "Enable read for users" ON profiles;
DROP POLICY IF EXISTS "Enable update for users" ON profiles;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- -----------------------------------------------------------------------------
-- 3. ITEMS (anagrafica materiali)
-- Tutti gli autenticati leggono; solo admin inserisce/aggiorna
-- -----------------------------------------------------------------------------
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "items_select_all" ON items;
DROP POLICY IF EXISTS "items_insert_admin" ON items;
DROP POLICY IF EXISTS "items_update_admin" ON items;
DROP POLICY IF EXISTS "items_upsert_admin" ON items;

CREATE POLICY "items_select_all"
  ON items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "items_insert_admin"
  ON items FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "items_update_admin"
  ON items FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- 4. ITEM_STOCKS (stock base per dashboard)
-- Tutti gli autenticati leggono; solo admin modifica
-- -----------------------------------------------------------------------------
ALTER TABLE item_stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item_stocks_select_all" ON item_stocks;
DROP POLICY IF EXISTS "item_stocks_insert_admin" ON item_stocks;
DROP POLICY IF EXISTS "item_stocks_update_admin" ON item_stocks;

CREATE POLICY "item_stocks_select_all"
  ON item_stocks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "item_stocks_modify_admin"
  ON item_stocks FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- 5. MOVEMENTS
-- Tutti leggono; autenticati inseriscono; creatore o admin aggiorna/elimina
-- -----------------------------------------------------------------------------
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movements_select_all" ON movements;
DROP POLICY IF EXISTS "movements_insert_auth" ON movements;
DROP POLICY IF EXISTS "movements_update_creator_or_admin" ON movements;
DROP POLICY IF EXISTS "movements_delete_admin" ON movements;
DROP POLICY IF EXISTS "movements_select_policy" ON movements;
DROP POLICY IF EXISTS "movements_insert_policy" ON movements;
DROP POLICY IF EXISTS "movements_update_policy" ON movements;
DROP POLICY IF EXISTS "movements_delete_policy" ON movements;

CREATE POLICY "movements_select_all"
  ON movements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "movements_insert_auth"
  ON movements FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "movements_update_creator_or_admin"
  ON movements FOR UPDATE
  TO authenticated
  USING (
    (created_by IS NOT NULL AND created_by::text = auth.uid()::text) OR is_admin()
  )
  WITH CHECK (
    (created_by IS NOT NULL AND created_by::text = auth.uid()::text) OR is_admin()
  );

CREATE POLICY "movements_delete_admin"
  ON movements FOR DELETE
  TO authenticated
  USING (is_admin());


-- -----------------------------------------------------------------------------
-- 6. REFERENTS
-- Tutti leggono; solo admin inserisce/aggiorna/elimina
-- -----------------------------------------------------------------------------
ALTER TABLE referents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referents_select_all" ON referents;
DROP POLICY IF EXISTS "referents_insert_admin" ON referents;
DROP POLICY IF EXISTS "referents_update_admin" ON referents;
DROP POLICY IF EXISTS "referents_delete_admin" ON referents;
DROP POLICY IF EXISTS "Allow admin update referents" ON referents;
DROP POLICY IF EXISTS "referents_update_policy" ON referents;
DROP POLICY IF EXISTS "Enable update for admins" ON referents;

CREATE POLICY "referents_select_all"
  ON referents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "referents_insert_admin"
  ON referents FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "referents_update_admin"
  ON referents FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "referents_delete_admin"
  ON referents FOR DELETE
  TO authenticated
  USING (is_admin());


-- -----------------------------------------------------------------------------
-- 7. AUDIT_LOG
-- Solo admin legge; tutti gli autenticati inseriscono (quando fanno azioni)
-- -----------------------------------------------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert_auth" ON audit_log;
DROP POLICY IF EXISTS "audit_log_select_policy" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert_policy" ON audit_log;

CREATE POLICY "audit_log_select_admin"
  ON audit_log FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "audit_log_insert_auth"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 8. EXCEL_LIVE (giacenze lavorabili)
-- Tutti leggono; solo admin modifica
-- -----------------------------------------------------------------------------
ALTER TABLE excel_live ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "excel_live_select_all" ON excel_live;
DROP POLICY IF EXISTS "excel_live_insert_admin" ON excel_live;
DROP POLICY IF EXISTS "excel_live_update_admin" ON excel_live;
DROP POLICY IF EXISTS "excel_live_delete_admin" ON excel_live;

CREATE POLICY "excel_live_select_all"
  ON excel_live FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "excel_live_insert_admin"
  ON excel_live FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "excel_live_update_admin"
  ON excel_live FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "excel_live_delete_admin"
  ON excel_live FOR DELETE
  TO authenticated
  USING (is_admin());


-- -----------------------------------------------------------------------------
-- 9. EXCEL_ORIGINAL (backup import, immutabile)
-- Solo admin legge e inserisce/aggiorna
-- -----------------------------------------------------------------------------
ALTER TABLE excel_original ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "excel_original_select_admin" ON excel_original;
DROP POLICY IF EXISTS "excel_original_insert_admin" ON excel_original;
DROP POLICY IF EXISTS "excel_original_update_admin" ON excel_original;

CREATE POLICY "excel_original_select_admin"
  ON excel_original FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "excel_original_insert_admin"
  ON excel_original FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "excel_original_update_admin"
  ON excel_original FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- -----------------------------------------------------------------------------
-- FINE MIGRAZIONE
-- -----------------------------------------------------------------------------
-- Verifica: in Supabase Dashboard > Authentication > Policies
-- dovresti vedere le policy applicate a ogni tabella.
-- =============================================================================
