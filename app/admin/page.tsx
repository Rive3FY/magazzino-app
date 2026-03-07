"use client";

import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

type UserRow = {
  id: string;
  email: string | null;
  approved: boolean | null;
  is_admin: boolean | null;
  badge_number: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
};

export default function AdminPage() {
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function guardAdmin() {
    const { data: u } = await supabase.auth.getUser();

    if (!u.user) {
      window.location.href = "/login";
      return;
    }

    setMyId(u.user.id);

    const { data, error } = await supabase.rpc("is_admin");

    if (error) {
      console.error(error);
      setChecking(false);
      return;
    }

    if (!data) {
      window.location.href = "/";
      return;
    }

    setIsAdmin(true);
    setChecking(false);
  }

  async function loadUsers() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.rpc("admin_list_users");

    if (error) {
      console.error("load users error:", error);
      setMsg("Errore caricamento utenti");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(data ?? []);
    setLoading(false);
  }

  async function setApproved(userId: string, approved: boolean) {
    setWorkingId(userId);

    const { error } = await supabase.rpc("set_approved", {
      p_user: userId,
      p_approved: approved,
    });

    if (error) {
      console.error(error);
      setMsg("Errore approvazione");
      setWorkingId(null);
      return;
    }

    await loadUsers();
    setWorkingId(null);
  }

  async function setAdminFlag(userId: string, makeAdmin: boolean) {
    setWorkingId(userId);

    const { error } = await supabase.rpc("set_admin", {
      p_user: userId,
      p_is_admin: makeAdmin,
    });

    if (error) {
      console.error(error);
      setMsg("Errore admin");
      setWorkingId(null);
      return;
    }

    await loadUsers();
    setWorkingId(null);
  }

  async function handleResetMagazzino() {
    const ok1 = window.confirm(
      "ATTENZIONE:\n\nQuesta operazione cancellerà TUTTI i movimenti, TUTTE le giacenze live e TUTTO l'import Excel originale.\n\nL'operazione è irreversibile.\n\nVuoi continuare?"
    );
    if (!ok1) return;

    const text = window.prompt(
      'Per confermare davvero il reset, scrivi esattamente: RESET MAGAZZINO'
    );

    if (text !== "RESET MAGAZZINO") {
      alert("Conferma non valida. Reset annullato.");
      return;
    }

    try {
      setResetting(true);

      const { error } = await supabase.rpc("reset_magazzino");

      if (error) {
        console.error("reset_magazzino error:", error);
        alert("Errore reset magazzino: " + error.message);
        return;
      }

      alert("Reset magazzino completato con successo.");
      window.location.reload();
    } catch (e: any) {
      console.error(e);
      alert("Errore reset magazzino: " + (e?.message ?? "sconosciuto"));
    } finally {
      setResetting(false);
    }
  }

  useEffect(() => {
    (async () => {
      await guardAdmin();
      await loadUsers();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Admin</div>
        </div>
        <div style={{ padding: 12 }}>Caricamento…</div>
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Admin</div>

        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button
            className="btn"
            onClick={handleResetMagazzino}
            disabled={resetting}
            style={{
              borderColor: "rgba(239,68,68,0.5)",
              background: "rgba(239,68,68,0.10)",
              color: "#991b1b",
            }}
          >
            {resetting ? "Reset in corso..." : "Reset magazzino"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 900 }}>Utenti registrati</div>

          <button className="btn" onClick={loadUsers}>
            Aggiorna
          </button>
        </div>

        {msg && (
          <div style={{ marginBottom: 10, fontWeight: 700 }}>{msg}</div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Badge</th>
                <th>Nome</th>
                <th>Approvato</th>
                <th>Admin</th>
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12 }}>
                    Caricamento…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12 }}>
                    Nessun utente
                  </td>
                </tr>
              ) : (
                rows.map((u) => {
                  const fullName = `${u.first_name ?? ""} ${u.last_name ?? ""}`;
                  const busy = workingId === u.id;
                  const isMe = myId === u.id;

                  return (
                    <tr key={u.id}>
                      <td>{u.email}</td>

                      <td>{u.badge_number ?? "-"}</td>

                      <td>{fullName.trim() || "-"}</td>

                      <td style={{ fontWeight: 800 }}>
                        {u.approved ? "✅ SI" : "⛔ NO"}
                      </td>

                      <td style={{ fontWeight: 800 }}>
                        {u.is_admin ? "✅ SI" : "-"}
                      </td>

                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {u.approved ? (
                            <button
                              className="btn"
                              disabled={busy || isMe}
                              title={isMe ? "Non puoi disapprovare te stesso" : ""}
                              onClick={() => setApproved(u.id, false)}
                            >
                              Disapprova
                            </button>
                          ) : (
                            <button
                              className="btn btnPrimary"
                              disabled={busy}
                              onClick={() => setApproved(u.id, true)}
                            >
                              Approva
                            </button>
                          )}

                          {u.is_admin ? (
                            <button
                              className="btn"
                              disabled={busy || isMe}
                              title={isMe ? "Non puoi rimuovere admin a te stesso" : ""}
                              onClick={() => setAdminFlag(u.id, false)}
                            >
                              Rimuovi admin
                            </button>
                          ) : (
                            <button
                              className="btn"
                              disabled={busy}
                              onClick={() => setAdminFlag(u.id, true)}
                            >
                              Rendi admin
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}