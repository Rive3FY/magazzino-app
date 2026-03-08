"use client";

import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

/**
 * Pagina dedicata al callback del reset password.
 * Supabase reindirizza qui con ?code=xxx. Il client scambia il codice,
 * poi reindirizziamo a /login/aggiorna-password.
 */
export default function ResetPasswordCallbackPage() {
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;

    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    const type = params.get("type");

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (done) return;
        if (err) {
          setError(err.message);
          return;
        }
        window.location.replace("/login/aggiorna-password");
      });
    } else if (tokenHash && type) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "recovery" | "signup" }).then(({ error: err }) => {
        if (done) return;
        if (err) {
          setError(err.message);
          return;
        }
        window.location.replace("/login/aggiorna-password");
      });
    } else {
      setError("Link non valido o scaduto.");
    }

    return () => {
      done = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="loginPage">
      <div className="loginCardNew">
        <h1 className="loginTitleNew">RESET PASSWORD</h1>
        <div className="loginBodyNew">
          {error ? (
            <p style={{ color: "#f87171" }}>{error}</p>
          ) : (
            <p>Reindirizzamento alla pagina di cambio password…</p>
          )}
          {error && (
            <a href="/login" style={{ color: "#14b8a6", marginTop: 12, display: "block" }}>
              Torna al login
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
