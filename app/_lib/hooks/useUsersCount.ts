"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useIsAdmin } from "./useIsAdmin";
import { ONLINE_PRESENCE_CHANNEL } from "../realtime";

/**
 * Restituisce il numero di utenti attualmente online (con l'app aperta).
 * Solo gli admin vedono questo conteggio.
 */
export function useUsersCount(): number | null {
  const { isAdmin } = useIsAdmin();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setCount(null);
      return;
    }

    const supabase = createClient();

    const channel = supabase.channel(ONLINE_PRESENCE_CHANNEL);

    const updateCount = () => {
      const state = channel.presenceState();
      const keys = Object.keys(state);
      setCount(keys.length);
    };

    channel
      .on("presence", { event: "sync" }, updateCount)
      .on("presence", { event: "join" }, updateCount)
      .on("presence", { event: "leave" }, updateCount)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          updateCount();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  return count;
}
