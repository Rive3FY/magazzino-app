"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AuthState = {
  user: User | null;
  loading: boolean;
  approved: boolean | null;
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      setUser(u ?? null);

      if (!u) {
        setApproved(null);
        setLoading(false);
        return;
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("approved")
        .eq("id", u.id)
        .maybeSingle();

      setApproved(!!(p as { approved?: boolean } | null)?.approved);
      setLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) {
        setApproved(null);
        return;
      }
      supabase
        .from("profiles")
        .select("approved")
        .eq("id", u.id)
        .maybeSingle()
        .then(({ data }) => setApproved(!!(data as { approved?: boolean } | null)?.approved));
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading, approved };
}
