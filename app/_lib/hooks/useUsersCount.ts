"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useIsAdmin } from "./useIsAdmin";

export function useUsersCount(): number | null {
  const { isAdmin } = useIsAdmin();
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("approved", true);
    setCount((data ?? []).length);
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setCount(null);
      return;
    }

    const supabase = createClient();
    void load();

    const channel = supabase
      .channel("profiles-count-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void load();
      })
      .subscribe();

    const interval = setInterval(load, 120000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [isAdmin, load]);

  return count;
}
