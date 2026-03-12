"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { deriveAdminAccess, type AdminAccess } from "../admin-access";

export function useIsAdmin(): AdminAccess & { loading: boolean } {
  const [access, setAccess] = useState(() => deriveAdminAccess(null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setAccess(deriveAdminAccess(null));
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("approved,is_admin,is_super_admin,is_materials_admin,is_equipment_linee_admin,is_equipment_stazioni_admin")
          .eq("id", u.user.id)
          .maybeSingle();

        if (error) throw error;

        setAccess(
          deriveAdminAccess({
            approved: !!data?.approved,
            legacyAdmin: !!data?.is_admin,
            isSuperAdmin: !!data?.is_super_admin || !!data?.is_admin,
            isMaterialsAdmin: !!data?.is_materials_admin,
            isEquipmentLineeAdmin: !!data?.is_equipment_linee_admin,
            isEquipmentStazioniAdmin: !!data?.is_equipment_stazioni_admin,
          })
        );
      } catch (error) {
        try {
          const { data, error: legacyError } = await supabase
            .from("profiles")
            .select("approved,is_admin")
            .eq("id", u.user.id)
            .maybeSingle();

          if (legacyError) throw legacyError;

          setAccess(
            deriveAdminAccess({
              approved: !!data?.approved,
              legacyAdmin: !!data?.is_admin,
              isSuperAdmin: !!data?.is_admin,
            })
          );
        } catch (legacyReadError) {
          console.error("load profile roles error:", error, legacyReadError);
          setAccess(deriveAdminAccess(null));
        }
      }

      setLoading(false);
    })();
  }, []);

  return { ...access, loading };
}
