"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import {
  clearCachedAdminAccess,
  deriveAdminAccess,
  loadOwnProfileRoleFlags,
  readCachedAdminAccess,
  writeCachedAdminAccess,
  type AdminAccess,
} from "../admin-access";

export function useIsAdmin(): AdminAccess & { loading: boolean } {
  const [access, setAccess] = useState(() => deriveAdminAccess(null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;

    (async () => {
      const cached = readCachedAdminAccess();
      if (cached) {
        setAccess(deriveAdminAccess(cached.flags));
        setLoading(false);
      }

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        clearCachedAdminAccess();
        if (!alive) return;
        setAccess(deriveAdminAccess(null));
        setLoading(false);
        return;
      }

      try {
        const flags = await loadOwnProfileRoleFlags(supabase, u.user.id);
        writeCachedAdminAccess(u.user.id, flags);
        if (!alive) return;
        setAccess(deriveAdminAccess(flags));
      } catch (error) {
        console.error("load profile roles error:", error);
        clearCachedAdminAccess();
        if (!alive) return;
        setAccess(deriveAdminAccess(null));
      }

      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { ...access, loading };
}
