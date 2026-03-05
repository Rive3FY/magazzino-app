"use client";

import { useEffect } from "react";
import { createClient } from "../_lib/supabase/client";

export default function PendingPage() {
  const supabase = createClient();

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        if (!alive) return;
        window.location.href = "/login";
        return;
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("approved")
        .eq("id", user.id)
        .maybeSingle();

      if ((p as any)?.approved) {
        window.location.href = "/";
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  return (
    <main style={{ maxWidth: 520, margin: "40px auto" }}>
      <div className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Account in approvazione</div>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 900 }}>
            Il tuo account è in attesa di approvazione.
          </div>

          <div style={{ marginTop: 8 }}>
            Un amministratore deve autorizzare l'accesso prima di usare il
            gestionale.
          </div>

          <button
            className="btn"
            style={{ marginTop: 14 }}
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            Esci
          </button>
        </div>
      </div>
    </main>
  );
}