-- Tabella per assegnazione scaffale ai materiali per magazzino
-- Un materiale può avere scaffali diversi in PRM e REALE

CREATE TABLE IF NOT EXISTS public.material_shelves (
  code text NOT NULL,
  warehouse text NOT NULL CHECK (warehouse IN ('PRM', 'REALE')),
  shelf text NOT NULL,
  PRIMARY KEY (code, warehouse)
);

-- Indice per lookup veloce
CREATE INDEX IF NOT EXISTS idx_material_shelves_code ON public.material_shelves (code);
CREATE INDEX IF NOT EXISTS idx_material_shelves_warehouse ON public.material_shelves (warehouse);

ALTER TABLE public.material_shelves ENABLE ROW LEVEL SECURITY;

-- Tutti gli autenticati possono leggere
CREATE POLICY "material_shelves_select_all"
  ON public.material_shelves FOR SELECT
  TO authenticated
  USING (true);

-- Solo admin può inserire/aggiornare/eliminare
CREATE POLICY "material_shelves_insert_admin"
  ON public.material_shelves FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "material_shelves_update_admin"
  ON public.material_shelves FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "material_shelves_delete_admin"
  ON public.material_shelves FOR DELETE
  TO authenticated
  USING (public.is_admin());
