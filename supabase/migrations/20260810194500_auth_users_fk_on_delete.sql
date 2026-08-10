-- Consente l'eliminazione utenti Auth: le FK verso auth.users non devono bloccare il DELETE.
-- profiles.id: CASCADE (la riga profilo sparisce con l'utente)
-- altre colonne: SET NULL (movimenti/audit restano, senza riferimento utente)

DO $$
DECLARE
  r record;
  col record;
  cols text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name,
      con.conkey,
      con.conrelid
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f'
      AND con.confrelid = 'auth.users'::regclass
      AND n.nspname IN ('public', 'storage')
  LOOP
    -- Rendi nullable le colonne FK (tranne profiles.id) così SET NULL è valido
    FOR col IN
      SELECT a.attname, a.attnotnull
      FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = u.attnum
      ORDER BY u.ord
    LOOP
      IF NOT (r.schema_name = 'public' AND r.table_name = 'profiles' AND col.attname = 'id')
         AND col.attnotnull THEN
        EXECUTE format(
          'ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL',
          r.schema_name,
          r.table_name,
          col.attname
        );
      END IF;
    END LOOP;

    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord)
      INTO cols
    FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = u.attnum;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.schema_name,
      r.table_name,
      r.constraint_name
    );

    IF r.schema_name = 'public' AND r.table_name = 'profiles' AND cols = 'id' THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES auth.users(id) ON DELETE CASCADE',
        r.schema_name,
        r.table_name,
        r.constraint_name,
        cols
      );
    ELSE
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES auth.users(id) ON DELETE SET NULL',
        r.schema_name,
        r.table_name,
        r.constraint_name,
        cols
      );
    END IF;
  END LOOP;
END
$$;
