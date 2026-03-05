"use client";

import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [msg, setMsg] = useState<string | null>(null);

  // Se già loggato → mando su / o /pending in base ad approved/admin
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      if (data.user) {
        const { data: p, error: e2 } = await supabase
          .from("profiles")
          .select("approved,is_admin")
          .eq("id", data.user.id)
          .maybeSingle();

        // se non riesco a leggere il profilo: logout e torno al login
        if (e2) {
          console.error("profiles read error:", e2);
          await supabase.auth.signOut();
          if (!alive) return;
          setLoading(false);
          return;
        }

        const approved = !!p?.approved;
        const admin = !!p?.is_admin;

        if (approved || admin) window.location.href = "/";
        else window.location.href = "/pending";
        return;
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn() {
    setMsg(null);
    setWorking(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMsg(error.message);
      setWorking(false);
      return;
    }

    if (!data.session || !data.user) {
      setMsg("Accesso non completato. Controlla email/password o configurazione Supabase.");
      setWorking(false);
      return;
    }

    // Controllo approved/admin sul profilo (own-only, quindi ok)
    const { data: p, error: e2 } = await supabase
      .from("profiles")
      .select("approved,is_admin")
      .eq("id", data.user.id)
      .maybeSingle();

    if (e2) {
      console.error("profiles read error:", e2);
      await supabase.auth.signOut();
      setMsg("Profilo non disponibile o permessi mancanti. Contatta l'admin.");
      setWorking(false);
      return;
    }

    const approved = !!p?.approved;
    const admin = !!p?.is_admin;

    if (!approved && !admin) {
      await supabase.auth.signOut();
      setMsg("Account creato ✅ ma non ancora approvato dall'admin.");
      setWorking(false);
      return;
    }

    window.location.href = "/";
  }

  async function signUp() {
  setMsg(null);
  setWorking(true);

  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) {
    setMsg(error.message);
    setWorking(false);
    return;
  }

  setMsg("Utente creato ✅ In attesa approvazione amministratore.");
  setWorking(false);
  setMode("login");
}

  if (loading) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto" }}>
        <div className="panel">
          <div className="pageBar">
            <div className="pageBarTitle">Accesso</div>
          </div>
          <div style={{ padding: 12 }}>Caricamento…</div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto" }}>
      <div className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">{mode === "login" ? "Accesso" : "Crea utente"}</div>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn ${mode === "login" ? "btnPrimary" : ""}`}
              onClick={() => setMode("login")}
              disabled={working}
            >
              Entra
            </button>

            <button
              type="button"
              className={`btn ${mode === "signup" ? "btnPrimary" : ""}`}
              onClick={() => setMode("signup")}
              disabled={working}
            >
              Crea utente
            </button>
          </div>

          <form
            style={{ marginTop: 14, display: "grid", gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (working) return;
              if (mode === "login") signIn();
              else signUp();
            }}
          >
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome.cognome@azienda.it"
                autoComplete="email"
                disabled={working}
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={working}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btnPrimary" type="submit" disabled={working}>
                {mode === "login" ? (working ? "Accesso…" : "Entra") : working ? "Creazione…" : "Crea utente"}
              </button>
            </div>

            {msg && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: msg.includes("✅") ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
                  color: msg.includes("✅") ? "#065f46" : "#991b1b",
                  fontWeight: 800,
                }}
              >
                {msg}
              </div>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}