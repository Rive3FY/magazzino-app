"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../_lib/supabase/client";

export default function AggiornaPasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      if (!data.user) {
        window.location.href = "/login";
        return;
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (password.length < 6) {
      setMsg("La password deve avere almeno 6 caratteri.");
      return;
    }

    if (password !== confirmPassword) {
      setMsg("Le password non coincidono.");
      return;
    }

    setWorking(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMsg(error.message);
      setWorking(false);
      return;
    }

    setMsg("✅ Password aggiornata. Reindirizzamento…");
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  }

  if (loading) {
    return (
      <main className="loginPage">
        <div className="loginCardNew">
          <h1 className="loginTitleNew">AGGIORNA PASSWORD</h1>
          <div className="loginBodyNew">Caricamento…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="loginPage">
      <div className="loginCardNew">
        <h1 className="loginTitleNew">NUOVA PASSWORD</h1>

        <form className="loginFormNew" onSubmit={handleSubmit}>
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
              placeholder="Nuova password"
              autoComplete="new-password"
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
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Conferma password"
              autoComplete="new-password"
              disabled={working}
            />
          </div>

          <button type="submit" className="loginBtnPrimary" disabled={working}>
            {working ? "Salvataggio…" : "SALVA PASSWORD"}
          </button>

          <a href="/login" className="loginBtnSecondary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            Torna al login
          </a>

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
