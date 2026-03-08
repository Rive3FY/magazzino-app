"use client";

import { useEffect } from "react";
import { createClient } from "../_lib/supabase/client";
import { ONLINE_PRESENCE_CHANNEL } from "../_lib/realtime";

/**
 * Traccia la presenza dell'utente nel canale Realtime.
 * Ogni utente loggato viene contato come "online" finché ha l'app aperta.
 */
export default function OnlinePresenceTracker({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase.channel(ONLINE_PRESENCE_CHANNEL, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
      });
    });

    return () => {
      channel.untrack().then(() => {
        supabase.removeChannel(channel);
      });
    };
  }, [userId]);

  return null;
}
