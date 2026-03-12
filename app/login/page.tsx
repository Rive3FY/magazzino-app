"use client";

import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { deriveAdminAccess } from "../_lib/admin-access";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [matricola, setMatricola] = useState("");

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [msg, setMsg] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("rememberMe");
    return stored === null ? true : stored === "true";
  });

  // Se già loggato → mando su / o /pending in base ad approved/admin
  // Se in flusso reset password → mando a aggiorna-password
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      if (data.user) {
        try {
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("approved,is_admin,is_super_admin,is_materials_admin,is_equipment_linee_admin,is_equipment_stazioni_admin")
            .eq("id", data.user.id)
            .maybeSingle();

          if (error) throw error;

          const access = deriveAdminAccess({
            approved: !!profile?.approved,
            legacyAdmin: !!profile?.is_admin,
            isSuperAdmin: !!profile?.is_super_admin || !!profile?.is_admin,
            isMaterialsAdmin: !!profile?.is_materials_admin,
            isEquipmentLineeAdmin: !!profile?.is_equipment_linee_admin,
            isEquipmentStazioniAdmin: !!profile?.is_equipment_stazioni_admin,
          });
          if (access.approved || access.isAdmin) window.location.href = "/";
          else window.location.href = "/pending";
          return;
        } catch (e2) {
          try {
            const { data: legacyProfile, error: legacyError } = await supabase
              .from("profiles")
              .select("approved,is_admin")
              .eq("id", data.user.id)
              .maybeSingle();

            if (legacyError) throw legacyError;

            const access = deriveAdminAccess({
              approved: !!legacyProfile?.approved,
              legacyAdmin: !!legacyProfile?.is_admin,
              isSuperAdmin: !!legacyProfile?.is_admin,
            });
            if (access.approved || access.isAdmin) window.location.href = "/";
            else window.location.href = "/pending";
            return;
          } catch {
            console.error("profiles read error:", e2);
            await supabase.auth.signOut();
            if (!alive) return;
            setLoading(false);
            return;
          }
        }
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
    let access = deriveAdminAccess(null);
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("approved,is_admin,is_super_admin,is_materials_admin,is_equipment_linee_admin,is_equipment_stazioni_admin")
        .eq("id", data.user.id)
        .maybeSingle();

      if (error) throw error;

      access = deriveAdminAccess({
        approved: !!profile?.approved,
        legacyAdmin: !!profile?.is_admin,
        isSuperAdmin: !!profile?.is_super_admin || !!profile?.is_admin,
        isMaterialsAdmin: !!profile?.is_materials_admin,
        isEquipmentLineeAdmin: !!profile?.is_equipment_linee_admin,
        isEquipmentStazioniAdmin: !!profile?.is_equipment_stazioni_admin,
      });
    } catch (e2) {
      try {
        const { data: legacyProfile, error: legacyError } = await supabase
          .from("profiles")
          .select("approved,is_admin")
          .eq("id", data.user.id)
          .maybeSingle();

        if (legacyError) throw legacyError;

        access = deriveAdminAccess({
          approved: !!legacyProfile?.approved,
          legacyAdmin: !!legacyProfile?.is_admin,
          isSuperAdmin: !!legacyProfile?.is_admin,
        });
      } catch {
        console.error("profiles read error:", e2);
        await supabase.auth.signOut();
        setMsg("Profilo non disponibile o permessi mancanti. Contatta l'admin.");
        setWorking(false);
        return;
      }
    }

    if (!access.approved && !access.isAdmin) {
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

    const nome = firstName.trim();
    const cognome = lastName.trim();
    const badge = matricola.trim();

    if (!nome || !cognome || !badge) {
      setMsg("Compila nome, cognome e matricola.");
      setWorking(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: nome,
          last_name: cognome,
          badge_number: badge,
        },
      },
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
      <main className="loginPage">
        <div className="loginCardNew">
          <h1 className="loginTitleNew">ACCEDI</h1>
          <div className="loginBodyNew">Caricamento…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="loginPage">
      <div className="loginCardNew">
        <h1 className="loginTitleNew">
          {mode === "login" ? "ACCEDI" : "REGISTRATI"}
        </h1>

        <form
          className="loginFormNew"
          onSubmit={(e) => {
            e.preventDefault();
            if (working) return;
            if (mode === "login") signIn();
            else signUp();
          }}
        >
          <div className="loginInputWrap">
            <span className="loginInputIcon" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <input
              className="loginInputNew"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              disabled={working}
            />
          </div>

          {mode === "signup" && (
            <>
              <div className="loginInputWrap">
                <span className="loginInputIcon" aria-hidden>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  className="loginInputNew"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Nome"
                  autoComplete="given-name"
                  disabled={working}
                />
              </div>
              <div className="loginInputWrap">
                <span className="loginInputIcon" aria-hidden>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  className="loginInputNew"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Cognome"
                  autoComplete="family-name"
                  disabled={working}
                />
              </div>
              <div className="loginInputWrap">
                <span className="loginInputIcon" aria-hidden>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  className="loginInputNew"
                  type="text"
                  value={matricola}
                  onChange={(e) => setMatricola(e.target.value)}
                  placeholder="Matricola"
                  autoComplete="off"
                  disabled={working}
                />
              </div>
            </>
          )}

          <div className="loginInputWrap">
              <span className="loginInputIcon" aria-hidden>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                className="loginInputNew"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={working}
              />
            </div>

          {mode === "login" && (
            <div className="loginOptions">
              <label className="loginRemember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="loginCheckbox"
                />
                <span>Ricordami</span>
              </label>
            </div>
          )}

          <button
            type="submit"
            className="loginBtnPrimary"
            disabled={working}
          >
            {mode === "login"
              ? working ? "Accesso…" : "ACCEDI"
              : working ? "Creazione…" : "REGISTRATI"}
          </button>

          <button
            type="button"
            className="loginBtnSecondary"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMsg(null);
            }}
            disabled={working}
          >
            {mode === "login" ? "REGISTRATI" : "ACCEDI"}
          </button>

          {msg && (
            <div className={`loginMsgNew ${msg.includes("✅") ? "success" : "error"}`}>
              {msg}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}