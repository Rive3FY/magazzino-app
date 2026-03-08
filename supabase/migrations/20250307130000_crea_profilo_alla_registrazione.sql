-- Crea profilo automaticamente alla registrazione
-- Usa raw_user_meta_data da signUp options

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, badge_number)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(new.raw_user_meta_data ->> 'last_name', ''),
    COALESCE(new.raw_user_meta_data ->> 'badge_number', '')
  );
  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    -- Profilo già esistente, aggiorna
    UPDATE public.profiles
    SET
      first_name = COALESCE(new.raw_user_meta_data ->> 'first_name', first_name),
      last_name = COALESCE(new.raw_user_meta_data ->> 'last_name', last_name),
      badge_number = COALESCE(new.raw_user_meta_data ->> 'badge_number', badge_number)
    WHERE id = new.id;
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
