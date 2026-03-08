"use client";

import { useEffect } from "react";
import { createClient } from "../_lib/supabase/client";

/**
 * Ascolta gli eventi force_logout e disconnette l'utente.
 * Temporaneo - da rimuovere in seguito.
 */
export default function ForceLogoutListener() {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("force-logout-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "force_logout_events" },
        () => {
          supabase.auth.signOut().then(() => {
            window.location.href = "/login";
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
