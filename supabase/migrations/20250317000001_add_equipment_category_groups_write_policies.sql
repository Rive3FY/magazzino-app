-- Consenti INSERT e DELETE agli utenti autenticati (l'admin UI è già protetta dall'app)
CREATE POLICY "Allow insert for authenticated" ON equipment_category_groups
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated" ON equipment_category_groups
  FOR DELETE TO authenticated USING (true);
