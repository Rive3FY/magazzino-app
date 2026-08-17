"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "../_lib/supabase/client";
import { clearCachedAdminAccess, deriveAdminAccess, writeCachedAdminAccess } from "../_lib/admin-access";
import AppSpinner, { AppBusyLabel, AppLoading } from "../_components/AppSpinner";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
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
          if (access.approved || access.isAdmin) {
            writeCachedAdminAccess(data.user.id, access);
            const target = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";
            window.location.href = target;
          } else {
            window.location.href = "/pending";
          }
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
            if (access.approved || access.isAdmin) {
              writeCachedAdminAccess(data.user.id, access);
              const target = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";
              window.location.href = target;
            } else {
              window.location.href = "/pending";
            }
            return;
          } catch {
            console.error("profiles read error:", e2);
            await supabase.auth.signOut();
            clearCachedAdminAccess();
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
        clearCachedAdminAccess();
        setMsg("Profilo non disponibile o permessi mancanti. Contatta l'admin.");
        setWorking(false);
        return;
      }
    }

    if (!access.approved && !access.isAdmin) {
      await supabase.auth.signOut();
      clearCachedAdminAccess();
      setMsg("Account creato ✅ ma non ancora approvato dall'admin.");
      setWorking(false);
      return;
    }

    writeCachedAdminAccess(data.user.id, access);
    const target = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";
    window.location.href = target;
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

    const { data: signUpData, error } = await supabase.auth.signUp({
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

    // Con sessione immediata (es. email già confermata): allinea subito `profiles` ai dati del modulo.
    // Con conferma email non c'è sessione: i dati restano nei metadata e /profilo li sincronizza al login.
    const sessionUser = signUpData.session?.user;
    if (sessionUser) {
      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: sessionUser.id,
          first_name: nome,
          last_name: cognome,
          badge_number: badge,
        },
        { onConflict: "id" }
      );
      if (profileErr) console.error("profilo dopo signUp:", profileErr);
    }

    setMsg("Utente creato ✅ In attesa approvazione amministratore.");
    setWorking(false);
    setMode("login");
  }

  if (loading) {
    return (
      <main className="loginPage">
        <div className="loginCardNew">
          <div className="loginLogoWrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 78.86 24.29" aria-label="Terna" width={118} height={36} style={{ display: "block" }}>
              <g fill="#ffffff">
                <path d="M15.15,10.46A46.69,46.69,0,0,0,7.41,8.59L0,14.5H0a41.54,41.54,0,0,1,11.36,1.58Zm.66-1L22.16,0h-4L8.62,7.63a48.33,48.33,0,0,1,7.19,1.85m7-9.46L17.13,10a49.08,49.08,0,0,1,5.69,2.54V0ZM0,8v4.16L5.46,8.33A47.46,47.46,0,0,0,0,8M0,0V5.71L12.14,0ZM0,6.87a48.94,48.94,0,0,1,6.84.48L17.14,0H13.36L0,6.88m22.85,16a40.31,40.31,0,0,0-10.17-5.07l-2.9,5.07H22.86m0-9.08A47.77,47.77,0,0,0,16.59,11l-3.28,5.75a41.9,41.9,0,0,1,9.55,4.68ZM0,15.77v7.11H6.81l3.82-5.7A40.15,40.15,0,0,0,0,15.77"/>
                <path d="M78.78,14.11h-.47c-.47,0-.6-.25-.6-.87V7.37C77.71,5,75.35,4,73.12,4h-.48A5.15,5.15,0,0,0,68.72,5.6a3.74,3.74,0,0,0-.86,2.16.06.06,0,0,0,0,.06.08.08,0,0,0,.06,0h2.41V7.79c.13-1.1,1-1.65,2.25-1.71h.26c1,0,2.38.24,2.38,1.55,0,.8-.47,1.11-1.19,1.28-.5.08-1.17.15-2.07.31h-.18c-2.13.24-4.41.69-4.41,3.57h0c0,2.23,1.86,3.34,3.92,3.34a5.82,5.82,0,0,0,4-1.38c.2,1.05.94,1.38,2,1.38a6.13,6.13,0,0,0,1.52-.26h0a.2.2,0,0,0,.07-.16V14.19a.12.12,0,0,0-.11-.08m-6.48,0c-.89,0-2.33-.33-2.33-1.47,0-1.32,1-1.72,2.07-1.9a8.68,8.68,0,0,0,3.1-.69v1.88c0,1.6-1.73,2.18-2.84,2.18"/>
                <path d="M46.15,12.23H43.84a.17.17,0,0,0-.06.08v.06a2.51,2.51,0,0,1-2.14,1.72,4.21,4.21,0,0,1-.62,0c-2.11,0-3.08-1.59-3.09-3.38h8.54v-.22h0v-.28h0A5.67,5.67,0,0,0,41,4.08c-3.4,0-5.62,2.8-5.62,6.06h0c0,3.53,2.07,6,5.69,6a6.2,6.2,0,0,0,2-.36l.12,0,.09,0h.06a4.79,4.79,0,0,0,3-3.33c0-.19-.11-.16-.11-.16M41,6a3,3,0,0,1,2.89,3h-5.9a3,3,0,0,1,3-3H41"/>
                <path d="M54.85,4.21s0-.08-.09-.11A6.22,6.22,0,0,0,53.9,4a3.7,3.7,0,0,0-3.34,2.53h-.05V4.46a.14.14,0,0,0-.11-.11H48.16v.33h0v11s0,.19.1.19h2.32a.11.11,0,0,0,.08,0,.11.11,0,0,0,0-.08v-.25h0V10.37c0-2.53,1.38-3.93,3.11-3.93a7.93,7.93,0,0,1,1,.1h.07a.11.11,0,0,0,0-.08V4.21"/>
                <path d="M56.21,15.8h2.46V9.09a2.75,2.75,0,0,1,2.49-3h.27c1.48,0,2.19.77,2.23,2.57v7.17h2.51V8C66.17,5.37,64.59,4,62.1,4a4.14,4.14,0,0,0-3.56,2.07h0V4.73h0V4.46h0V4.39H56.19a.09.09,0,0,0,0,.07v.26h0v11h0a.11.11,0,0,0,0,.08"/>
                <path d="M25.4,2.37h4.83V15.64s0,.18.15.18h2.7s.09,0,.09-.18V2.37H38a.13.13,0,0,0,.11-.1V.08a.16.16,0,0,0,0-.07H25.39a.11.11,0,0,0-.1.12V2.29s0,.08.11.08"/>
                <path d="M27.78,17.23a3,3,0,0,1,1,.17,2.35,2.35,0,0,1,.8.52,2.26,2.26,0,0,1,.52.85,3.36,3.36,0,0,1,.19,1.2,3.94,3.94,0,0,1-.15,1.12,2.33,2.33,0,0,1-.47.88,2.18,2.18,0,0,1-.78.59,2.75,2.75,0,0,1-1.11.21H25.39V17.23Zm-.09,4.52a1.54,1.54,0,0,0,.52-.09,1.1,1.1,0,0,0,.44-.28,1.38,1.38,0,0,0,.31-.52,2.18,2.18,0,0,0,.12-.77,3,3,0,0,0-.09-.76,1.54,1.54,0,0,0-.26-.58,1.15,1.15,0,0,0-.5-.36,1.83,1.83,0,0,0-.75-.13h-.87v3.49Z"/>
                <path d="M32.07,18.76v.75h0a1.25,1.25,0,0,1,.21-.35,1.29,1.29,0,0,1,.3-.27,1.19,1.19,0,0,1,.36-.17,1.14,1.14,0,0,1,.41-.07,1.2,1.2,0,0,1,.24,0v1l-.19,0h-.21a1.13,1.13,0,0,0-.51.1,1,1,0,0,0-.34.27,1.38,1.38,0,0,0-.18.41,2.05,2.05,0,0,0,0,.51v1.8H31v-4Z"/>
                <path d="M34.07,18.14v-.91h1.11v.91Zm1.11.62v4H34.07v-4Z"/>
                <path d="M37,22.77l-1.38-4h1.16l.85,2.74h0l.85-2.74h1.09l-1.36,4Z"/>
                <path d="M40.11,18.14v-.91h1.1v.91Zm1.1.62v4h-1.1v-4Z"/>
                <path d="M43.13,18.76v.56h0a1.28,1.28,0,0,1,.55-.51,1.65,1.65,0,0,1,.68-.16,1.83,1.83,0,0,1,.72.12,1,1,0,0,1,.45.34,1.18,1.18,0,0,1,.23.52,3.47,3.47,0,0,1,.07.68v2.46H44.74V20.51a1.44,1.44,0,0,0-.15-.74.6.6,0,0,0-.55-.25.75.75,0,0,0-.65.27,1.44,1.44,0,0,0-.21.88v2.1h-1.1v-4Z"/>
                <path d="M50.47,23.07a1.25,1.25,0,0,1-.28.58,1.55,1.55,0,0,1-.63.45,2.75,2.75,0,0,1-1.1.19,2.47,2.47,0,0,1-.6-.08A1.74,1.74,0,0,1,47.3,24a1.24,1.24,0,0,1-.42-.4,1.17,1.17,0,0,1-.19-.58h1.1a.61.61,0,0,0,.3.43,1.08,1.08,0,0,0,.52.12.8.8,0,0,0,.68-.28,1.09,1.09,0,0,0,.2-.71V22h0a1.16,1.16,0,0,1-.51.47,1.66,1.66,0,0,1-.7.15,1.82,1.82,0,0,1-.77-.16,1.46,1.46,0,0,1-.54-.44,1.65,1.65,0,0,1-.3-.64,2.88,2.88,0,0,1-.1-.78,2.67,2.67,0,0,1,.11-.75,2.28,2.28,0,0,1,.33-.64,1.64,1.64,0,0,1,1.28-.6,1.54,1.54,0,0,1,.7.15,1.2,1.2,0,0,1,.5.5h0v-.54h1v3.76A2.36,2.36,0,0,1,50.47,23.07ZM49,21.73a.89.89,0,0,0,.3-.24,1,1,0,0,0,.17-.36,1.4,1.4,0,0,0,.06-.41,2.35,2.35,0,0,0,0-.47,1.14,1.14,0,0,0-.16-.39.78.78,0,0,0-.29-.28,1,1,0,0,0-.45-.1.77.77,0,0,0-.4.1.83.83,0,0,0-.28.25,1.31,1.31,0,0,0-.16.36,2,2,0,0,0-.05.43,3,3,0,0,0,0,.43,1.13,1.13,0,0,0,.15.39.83.83,0,0,0,.28.28.77.77,0,0,0,.42.11A.76.76,0,0,0,49,21.73Z"/>
                <path d="M57.84,17.23v1H54.92v1.18H57.6v.95H54.92v1.36h3v1H53.7V17.23Z"/>
                <path d="M59.66,18.76v.56h0a1.32,1.32,0,0,1,.54-.51,1.7,1.7,0,0,1,.69-.16,1.87,1.87,0,0,1,.72.12,1,1,0,0,1,.45.34,1.31,1.31,0,0,1,.23.52,3.51,3.51,0,0,1,.06.68v2.46h-1.1V20.51a1.44,1.44,0,0,0-.15-.74.6.6,0,0,0-.55-.25.78.78,0,0,0-.66.27,1.52,1.52,0,0,0-.2.88v2.1h-1.1v-4Z"/>
                <path d="M64.39,21.81a1,1,0,0,0,.72.24,1,1,0,0,0,.57-.16.67.67,0,0,0,.29-.36h1a1.79,1.79,0,0,1-.71,1,2.07,2.07,0,0,1-1.16.31,2.35,2.35,0,0,1-.86-.15,1.76,1.76,0,0,1-.64-.43,1.94,1.94,0,0,1-.41-.66,2.63,2.63,0,0,1-.14-.86,2.32,2.32,0,0,1,.15-.84,1.84,1.84,0,0,1,.41-.67,1.92,1.92,0,0,1,.65-.44,2.07,2.07,0,0,1,.84-.17,1.92,1.92,0,0,1,.89.2,1.77,1.77,0,0,1,.62.53,2.22,2.22,0,0,1,.36.76A2.68,2.68,0,0,1,67,21H64.12A1.16,1.16,0,0,0,64.39,21.81Zm1.25-2.11a.8.8,0,0,0-.6-.22.93.93,0,0,0-.44.09.91.91,0,0,0-.28.22.85.85,0,0,0-.15.28,1.57,1.57,0,0,0,0,.27h1.79A1.31,1.31,0,0,0,65.64,19.7Z"/>
                <path d="M68.71,18.76v.75h0a1.25,1.25,0,0,1,.21-.35,1.53,1.53,0,0,1,.3-.27,1.37,1.37,0,0,1,.37-.17,1.09,1.09,0,0,1,.4-.07,1.2,1.2,0,0,1,.24,0v1l-.19,0h-.2a1.15,1.15,0,0,0-.52.1.89.89,0,0,0-.33.27,1.18,1.18,0,0,0-.19.41,2.67,2.67,0,0,0,0,.51v1.8h-1.1v-4Z"/>
                <path d="M74.26,23.07a1.49,1.49,0,0,1-.28.58,1.7,1.7,0,0,1-.63.45,2.79,2.79,0,0,1-1.1.19,2.62,2.62,0,0,1-.61-.08,1.69,1.69,0,0,1-.55-.23,1.24,1.24,0,0,1-.42-.4,1,1,0,0,1-.19-.58h1.09a.61.61,0,0,0,.3.43,1.11,1.11,0,0,0,.52.12.79.79,0,0,0,.68-.28,1.15,1.15,0,0,0,.21-.71V22h0a1.16,1.16,0,0,1-.51.47,1.65,1.65,0,0,1-.69.15,1.87,1.87,0,0,1-.78-.16,1.51,1.51,0,0,1-.53-.44,1.82,1.82,0,0,1-.31-.64,3.33,3.33,0,0,1-.1-.78,2.36,2.36,0,0,1,.12-.75,1.86,1.86,0,0,1,.33-.64,1.43,1.43,0,0,1,.54-.43,1.58,1.58,0,0,1,.74-.17,1.52,1.52,0,0,1,.69.15,1.15,1.15,0,0,1,.5.5h0v-.54h1v3.76A3,3,0,0,1,74.26,23.07Zm-1.51-1.34a.76.76,0,0,0,.29-.24,1.22,1.22,0,0,0,.18-.36,1.4,1.4,0,0,0,.06-.41,2.34,2.34,0,0,0,0-.47,1.13,1.13,0,0,0-.15-.39.86.86,0,0,0-.29-.28,1,1,0,0,0-.45-.1.72.72,0,0,0-.4.1.75.75,0,0,0-.28.25.9.9,0,0,0-.16.36,1.54,1.54,0,0,0,0,.43,2,2,0,0,0,0,.43,1.13,1.13,0,0,0,.15.39.9.9,0,0,0,.27.28.83.83,0,0,0,.43.11A.8.8,0,0,0,72.75,21.73Z"/>
                <path d="M76.69,24a1.59,1.59,0,0,1-.88.21h-.34l-.34,0v-.91l.32,0a1.82,1.82,0,0,0,.33,0,.44.44,0,0,0,.32-.17.56.56,0,0,0,.1-.33.64.64,0,0,0,0-.24l-1.41-3.77h1.17l.91,2.75h0l.87-2.75h1.14l-1.67,4.51A1.37,1.37,0,0,1,76.69,24Z"/>
              </g>
            </svg>
          </div>
          <div className="loginBodyNew"><AppLoading style={{ color: "rgba(255,255,255,0.85)" }} /></div>
        </div>
      </main>
    );
  }

  return (
    <main className="loginPage">
      {working && (
        <div className="loginRedirectOverlay" aria-live="polite">
          <AppSpinner size={38} />
          <span>Accesso completato, reindirizzamento…</span>
        </div>
      )}
      <div className="loginCardNew">
        <div className="loginLogoWrap">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 78.86 24.29" aria-label="Terna" width={118} height={36} style={{ display: "block" }}>
            <g fill="#ffffff">
              <path d="M15.15,10.46A46.69,46.69,0,0,0,7.41,8.59L0,14.5H0a41.54,41.54,0,0,1,11.36,1.58Zm.66-1L22.16,0h-4L8.62,7.63a48.33,48.33,0,0,1,7.19,1.85m7-9.46L17.13,10a49.08,49.08,0,0,1,5.69,2.54V0ZM0,8v4.16L5.46,8.33A47.46,47.46,0,0,0,0,8M0,0V5.71L12.14,0ZM0,6.87a48.94,48.94,0,0,1,6.84.48L17.14,0H13.36L0,6.88m22.85,16a40.31,40.31,0,0,0-10.17-5.07l-2.9,5.07H22.86m0-9.08A47.77,47.77,0,0,0,16.59,11l-3.28,5.75a41.9,41.9,0,0,1,9.55,4.68ZM0,15.77v7.11H6.81l3.82-5.7A40.15,40.15,0,0,0,0,15.77"/>
              <path d="M78.78,14.11h-.47c-.47,0-.6-.25-.6-.87V7.37C77.71,5,75.35,4,73.12,4h-.48A5.15,5.15,0,0,0,68.72,5.6a3.74,3.74,0,0,0-.86,2.16.06.06,0,0,0,0,.06.08.08,0,0,0,.06,0h2.41V7.79c.13-1.1,1-1.65,2.25-1.71h.26c1,0,2.38.24,2.38,1.55,0,.8-.47,1.11-1.19,1.28-.5.08-1.17.15-2.07.31h-.18c-2.13.24-4.41.69-4.41,3.57h0c0,2.23,1.86,3.34,3.92,3.34a5.82,5.82,0,0,0,4-1.38c.2,1.05.94,1.38,2,1.38a6.13,6.13,0,0,0,1.52-.26h0a.2.2,0,0,0,.07-.16V14.19a.12.12,0,0,0-.11-.08m-6.48,0c-.89,0-2.33-.33-2.33-1.47,0-1.32,1-1.72,2.07-1.9a8.68,8.68,0,0,0,3.1-.69v1.88c0,1.6-1.73,2.18-2.84,2.18"/>
              <path d="M46.15,12.23H43.84a.17.17,0,0,0-.06.08v.06a2.51,2.51,0,0,1-2.14,1.72,4.21,4.21,0,0,1-.62,0c-2.11,0-3.08-1.59-3.09-3.38h8.54v-.22h0v-.28h0A5.67,5.67,0,0,0,41,4.08c-3.4,0-5.62,2.8-5.62,6.06h0c0,3.53,2.07,6,5.69,6a6.2,6.2,0,0,0,2-.36l.12,0,.09,0h.06a4.79,4.79,0,0,0,3-3.33c0-.19-.11-.16-.11-.16M41,6a3,3,0,0,1,2.89,3h-5.9a3,3,0,0,1,3-3H41"/>
              <path d="M54.85,4.21s0-.08-.09-.11A6.22,6.22,0,0,0,53.9,4a3.7,3.7,0,0,0-3.34,2.53h-.05V4.46a.14.14,0,0,0-.11-.11H48.16v.33h0v11s0,.19.1.19h2.32a.11.11,0,0,0,.08,0,.11.11,0,0,0,0-.08v-.25h0V10.37c0-2.53,1.38-3.93,3.11-3.93a7.93,7.93,0,0,1,1,.1h.07a.11.11,0,0,0,0-.08V4.21"/>
              <path d="M56.21,15.8h2.46V9.09a2.75,2.75,0,0,1,2.49-3h.27c1.48,0,2.19.77,2.23,2.57v7.17h2.51V8C66.17,5.37,64.59,4,62.1,4a4.14,4.14,0,0,0-3.56,2.07h0V4.73h0V4.46h0V4.39H56.19a.09.09,0,0,0,0,.07v.26h0v11h0a.11.11,0,0,0,0,.08"/>
              <path d="M25.4,2.37h4.83V15.64s0,.18.15.18h2.7s.09,0,.09-.18V2.37H38a.13.13,0,0,0,.11-.1V.08a.16.16,0,0,0,0-.07H25.39a.11.11,0,0,0-.1.12V2.29s0,.08.11.08"/>
              <path d="M27.78,17.23a3,3,0,0,1,1,.17,2.35,2.35,0,0,1,.8.52,2.26,2.26,0,0,1,.52.85,3.36,3.36,0,0,1,.19,1.2,3.94,3.94,0,0,1-.15,1.12,2.33,2.33,0,0,1-.47.88,2.18,2.18,0,0,1-.78.59,2.75,2.75,0,0,1-1.11.21H25.39V17.23Zm-.09,4.52a1.54,1.54,0,0,0,.52-.09,1.1,1.1,0,0,0,.44-.28,1.38,1.38,0,0,0,.31-.52,2.18,2.18,0,0,0,.12-.77,3,3,0,0,0-.09-.76,1.54,1.54,0,0,0-.26-.58,1.15,1.15,0,0,0-.5-.36,1.83,1.83,0,0,0-.75-.13h-.87v3.49Z"/>
              <path d="M32.07,18.76v.75h0a1.25,1.25,0,0,1,.21-.35,1.29,1.29,0,0,1,.3-.27,1.19,1.19,0,0,1,.36-.17,1.14,1.14,0,0,1,.41-.07,1.2,1.2,0,0,1,.24,0v1l-.19,0h-.21a1.13,1.13,0,0,0-.51.1,1,1,0,0,0-.34.27,1.38,1.38,0,0,0-.18.41,2.05,2.05,0,0,0,0,.51v1.8H31v-4Z"/>
              <path d="M34.07,18.14v-.91h1.11v.91Zm1.11.62v4H34.07v-4Z"/>
              <path d="M37,22.77l-1.38-4h1.16l.85,2.74h0l.85-2.74h1.09l-1.36,4Z"/>
              <path d="M40.11,18.14v-.91h1.1v.91Zm1.1.62v4h-1.1v-4Z"/>
              <path d="M43.13,18.76v.56h0a1.28,1.28,0,0,1,.55-.51,1.65,1.65,0,0,1,.68-.16,1.83,1.83,0,0,1,.72.12,1,1,0,0,1,.45.34,1.18,1.18,0,0,1,.23.52,3.47,3.47,0,0,1,.07.68v2.46H44.74V20.51a1.44,1.44,0,0,0-.15-.74.6.6,0,0,0-.55-.25.75.75,0,0,0-.65.27,1.44,1.44,0,0,0-.21.88v2.1h-1.1v-4Z"/>
              <path d="M50.47,23.07a1.25,1.25,0,0,1-.28.58,1.55,1.55,0,0,1-.63.45,2.75,2.75,0,0,1-1.1.19,2.47,2.47,0,0,1-.6-.08A1.74,1.74,0,0,1,47.3,24a1.24,1.24,0,0,1-.42-.4,1.17,1.17,0,0,1-.19-.58h1.1a.61.61,0,0,0,.3.43,1.08,1.08,0,0,0,.52.12.8.8,0,0,0,.68-.28,1.09,1.09,0,0,0,.2-.71V22h0a1.16,1.16,0,0,1-.51.47,1.66,1.66,0,0,1-.7.15,1.82,1.82,0,0,1-.77-.16,1.46,1.46,0,0,1-.54-.44,1.65,1.65,0,0,1-.3-.64,2.88,2.88,0,0,1-.1-.78,2.67,2.67,0,0,1,.11-.75,2.28,2.28,0,0,1,.33-.64,1.64,1.64,0,0,1,1.28-.6,1.54,1.54,0,0,1,.7.15,1.2,1.2,0,0,1,.5.5h0v-.54h1v3.76A2.36,2.36,0,0,1,50.47,23.07ZM49,21.73a.89.89,0,0,0,.3-.24,1,1,0,0,0,.17-.36,1.4,1.4,0,0,0,.06-.41,2.35,2.35,0,0,0,0-.47,1.14,1.14,0,0,0-.16-.39.78.78,0,0,0-.29-.28,1,1,0,0,0-.45-.1.77.77,0,0,0-.4.1.83.83,0,0,0-.28.25,1.31,1.31,0,0,0-.16.36,2,2,0,0,0-.05.43,3,3,0,0,0,0,.43,1.13,1.13,0,0,0,.15.39.83.83,0,0,0,.28.28.77.77,0,0,0,.42.11A.76.76,0,0,0,49,21.73Z"/>
              <path d="M57.84,17.23v1H54.92v1.18H57.6v.95H54.92v1.36h3v1H53.7V17.23Z"/>
              <path d="M59.66,18.76v.56h0a1.32,1.32,0,0,1,.54-.51,1.7,1.7,0,0,1,.69-.16,1.87,1.87,0,0,1,.72.12,1,1,0,0,1,.45.34,1.31,1.31,0,0,1,.23.52,3.51,3.51,0,0,1,.06.68v2.46h-1.1V20.51a1.44,1.44,0,0,0-.15-.74.6.6,0,0,0-.55-.25.78.78,0,0,0-.66.27,1.52,1.52,0,0,0-.2.88v2.1h-1.1v-4Z"/>
              <path d="M64.39,21.81a1,1,0,0,0,.72.24,1,1,0,0,0,.57-.16.67.67,0,0,0,.29-.36h1a1.79,1.79,0,0,1-.71,1,2.07,2.07,0,0,1-1.16.31,2.35,2.35,0,0,1-.86-.15,1.76,1.76,0,0,1-.64-.43,1.94,1.94,0,0,1-.41-.66,2.63,2.63,0,0,1-.14-.86,2.32,2.32,0,0,1,.15-.84,1.84,1.84,0,0,1,.41-.67,1.92,1.92,0,0,1,.65-.44,2.07,2.07,0,0,1,.84-.17,1.92,1.92,0,0,1,.89.2,1.77,1.77,0,0,1,.62.53,2.22,2.22,0,0,1,.36.76A2.68,2.68,0,0,1,67,21H64.12A1.16,1.16,0,0,0,64.39,21.81Zm1.25-2.11a.8.8,0,0,0-.6-.22.93.93,0,0,0-.44.09.91.91,0,0,0-.28.22.85.85,0,0,0-.15.28,1.57,1.57,0,0,0,0,.27h1.79A1.31,1.31,0,0,0,65.64,19.7Z"/>
              <path d="M68.71,18.76v.75h0a1.25,1.25,0,0,1,.21-.35,1.53,1.53,0,0,1,.3-.27,1.37,1.37,0,0,1,.37-.17,1.09,1.09,0,0,1,.4-.07,1.2,1.2,0,0,1,.24,0v1l-.19,0h-.2a1.15,1.15,0,0,0-.52.1.89.89,0,0,0-.33.27,1.18,1.18,0,0,0-.19.41,2.67,2.67,0,0,0,0,.51v1.8h-1.1v-4Z"/>
              <path d="M74.26,23.07a1.49,1.49,0,0,1-.28.58,1.7,1.7,0,0,1-.63.45,2.79,2.79,0,0,1-1.1.19,2.62,2.62,0,0,1-.61-.08,1.69,1.69,0,0,1-.55-.23,1.24,1.24,0,0,1-.42-.4,1,1,0,0,1-.19-.58h1.09a.61.61,0,0,0,.3.43,1.11,1.11,0,0,0,.52.12.79.79,0,0,0,.68-.28,1.15,1.15,0,0,0,.21-.71V22h0a1.16,1.16,0,0,1-.51.47,1.65,1.65,0,0,1-.69.15,1.87,1.87,0,0,1-.78-.16,1.51,1.51,0,0,1-.53-.44,1.82,1.82,0,0,1-.31-.64,3.33,3.33,0,0,1-.1-.78,2.36,2.36,0,0,1,.12-.75,1.86,1.86,0,0,1,.33-.64,1.43,1.43,0,0,1,.54-.43,1.58,1.58,0,0,1,.74-.17,1.52,1.52,0,0,1,.69.15,1.15,1.15,0,0,1,.5.5h0v-.54h1v3.76A3,3,0,0,1,74.26,23.07Zm-1.51-1.34a.76.76,0,0,0,.29-.24,1.22,1.22,0,0,0,.18-.36,1.4,1.4,0,0,0,.06-.41,2.34,2.34,0,0,0,0-.47,1.13,1.13,0,0,0-.15-.39.86.86,0,0,0-.29-.28,1,1,0,0,0-.45-.1.72.72,0,0,0-.4.1.75.75,0,0,0-.28.25.9.9,0,0,0-.16.36,1.54,1.54,0,0,0,0,.43,2,2,0,0,0,0,.43,1.13,1.13,0,0,0,.15.39.9.9,0,0,0,.27.28.83.83,0,0,0,.43.11A.8.8,0,0,0,72.75,21.73Z"/>
              <path d="M76.69,24a1.59,1.59,0,0,1-.88.21h-.34l-.34,0v-.91l.32,0a1.82,1.82,0,0,0,.33,0,.44.44,0,0,0,.32-.17.56.56,0,0,0,.1-.33.64.64,0,0,0,0-.24l-1.41-3.77h1.17l.91,2.75h0l.87-2.75h1.14l-1.67,4.51A1.37,1.37,0,0,1,76.69,24Z"/>
            </g>
          </svg>
        </div>

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
            <AppBusyLabel busy={working}>
              {mode === "login"
                ? working ? "Accesso…" : "ACCEDI"
                : working ? "Creazione…" : "REGISTRATI"}
            </AppBusyLabel>
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