# Migrazioni Supabase - Gestionale Magazzino

## Come applicare le migration

1. **Da Supabase Dashboard**: Vai su SQL Editor e incolla il contenuto di `20250307000001_schema_and_rls_complete.sql`
2. **Da CLI**: `supabase db push` (se hai configurato il progetto)

## Riepilogo policy RLS

| Tabella | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| **profiles** | Proprio + admin tutti | - | Proprio (badge,nome,cognome) | - |
| **items** | Tutti auth | Solo admin | Solo admin | - |
| **item_stocks** | Tutti auth | Solo admin | Solo admin | Solo admin |
| **movements** | Tutti auth | Tutti auth | Creatore o admin | Solo admin |
| **referents** | Tutti auth | Solo admin | Solo admin | Solo admin |
| **audit_log** | Solo admin | Tutti auth | - | - |
| **excel_live** | Tutti auth | Solo admin | Solo admin | Solo admin |
| **excel_original** | Solo admin | Solo admin | Solo admin | - |

## Funzione is_admin()

La migration crea `public.is_admin()` che legge `profiles.is_admin` per l'utente corrente. Usata in tutte le policy.

## RPC richieste dall'app

Queste funzioni devono esistere nel DB (se non le hai già):

- `is_admin()` → boolean
- `admin_list_users()` → tabella utenti
- `set_approved(p_user uuid, p_approved boolean)`
- `set_admin(p_user uuid, p_is_admin boolean)`
- `admin_grant_admin(target_user uuid)`
- `admin_revoke_admin(target_user uuid)`
- `admin_update_profile(target_user uuid, p_badge text, p_first_name text, p_last_name text)`
- `reset_magazzino()`
- `giacenze_list(p_view, p_search, p_sort_key, p_sort_dir, p_limit, p_offset)` → lista inventario

Se mancano, crea un file di migration separato per le RPC.
