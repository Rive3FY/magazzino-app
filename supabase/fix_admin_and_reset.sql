-- =============================================================================
-- FIX: "not_admin" pur essendo admin
-- =============================================================================
-- Esegui nel SQL Editor di Supabase (Dashboard > SQL Editor)
--
-- 1. PRIMA: Verifica chi è admin e quali profili esistono
-- 2. POI: Imposta il primo utente come admin (o sostituisci l'email con la tua)
-- =============================================================================

-- 1. Verifica utenti e profili (copia il risultato per vedere)
SELECT 
  u.id,
  u.email,
  p.is_admin,
  p.approved,
  CASE WHEN p.id IS NULL THEN 'NO PROFILO' ELSE 'OK' END as profilo
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.created_at DESC;

-- 2. Imposta come admin l'utente con questa email (SOSTITUISCI con la tua email)
-- INSERT INTO public.profiles (id, is_admin, approved, updated_at)
-- SELECT id, true, true, now()
-- FROM auth.users
-- WHERE email = 'LA_TUA_EMAIL@esempio.com'  -- <-- SOSTITUISCI QUI
-- ON CONFLICT (id) DO UPDATE SET is_admin = true, approved = true, updated_at = now();

-- 3. Imposta come admin TUTTI gli utenti (sblocca per usarlo)
INSERT INTO public.profiles (id, is_admin, approved, updated_at)
SELECT id, true, true, now()
FROM auth.users
ON CONFLICT (id) DO UPDATE SET is_admin = true, approved = true, updated_at = now();
