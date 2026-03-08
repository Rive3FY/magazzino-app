-- Aggiunge referee_name a movements per conservare il nome del referente anche dopo eliminazione
ALTER TABLE movements ADD COLUMN IF NOT EXISTS referee_name text;
