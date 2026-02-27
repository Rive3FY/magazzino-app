"use client";

import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

export default function LogoutPage() {
  const [msg, setMsg] = useState("Logout in corso…");

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } finally {
        setMsg("Sei uscito. Reindirizzamento…");
        window.location.replace("/login");
      }
    })();
  }, []);

  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      {msg}
    </main>
  );
}