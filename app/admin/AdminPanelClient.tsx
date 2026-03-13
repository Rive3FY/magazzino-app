"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import ConfirmModal from "../_components/ConfirmModal";

type Row = {
  Materiale?: any;
  "Descrizione Materiale"?: any;
  Divisione?: any;
  "Descrizione Divisione"?: any;
  Magazzino?: any;
  "Descrizione Magazzino"?: any;
  "Qnt. a Mag. bloccato"?: any;
  "Controllo Qualità Magazzino"?: any;
  "Descrizione Gruppo Merci"?: any;
  "Qnt. a Mag. Libero"?: any;
  UM?: any;
  TOTALE?: any;
  "Qnt. Reale"?: any;
};

type Movement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by_email: string | null;
};

type AdminUserRow = {
  user_id: string;
  email: string | null;
  badge_number: string | null;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
  profile_updated_at: string | null;
};

function toNumber(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = typeof v === "number" ? v : Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export default function AdminPanelClient() {
  const supabase = createClient();

  const [myUserId, setMyUserId] = useState<string | null>(null);

  // IMPORT
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // MOVIMENTI
  const [movMsg, setMovMsg] = useState<string | null>(null);
  const [loadingMov, setLoadingMov] = useState(true);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [codeFilter, setCodeFilter] = useState("");

  // OPERATORI
  const [usersMsg, setUsersMsg] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");

  // MODALE MODIFICA PROFILO
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [editBadge, setEditBadge] = useState("");
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // RESET MAGAZZINO
  const [resetting, setResetting] = useState(false);

  // DISCONNETTI TUTTI (temporaneo)
  const [disconnectingAll, setDisconnectingAll] = useState(false);

  // CONFERMA ELIMINAZIONE MOVIMENTO
  const [deleteMovId, setDeleteMovId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMyUserId(data.user?.id ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMovements() {
    setLoadingMov(true);
    setMovMsg(null);

    let q = supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,created_by_email")
      .order("created_at", { ascending: false })
      .limit(200);

    if (typeFilter !== "ALL") q = q.eq("type", typeFilter);
    if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);

    const c = codeFilter.trim();
    if (c) q = q.ilike("code", `%${c}%`);

    const { data, error } = await q;

    if (error) {
      console.error(error);
      setMovements([]);
      setMovMsg("Errore caricamento movimenti: " + error.message);
      setLoadingMov(false);
      return;
    }

    setMovements((data ?? []) as Movement[]);
    setLoadingMov(false);
  }

  async function loadUsers() {
    setLoadingUsers(true);
    setUsersMsg(null);

    const { data, error } = await supabase.rpc("admin_list_users");

    if (error) {
      console.error(error);
      setUsers([]);
      setUsersMsg("Errore caricamento operatori: " + error.message);
      setLoadingUsers(false);
      return;
    }

    setUsers((data ?? []) as AdminUserRow[]);
    setLoadingUsers(false);
  }

  useEffect(() => {
    loadMovements();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openDeleteMovementConfirm(id: string) {
    setDeleteMovId(id);
  }

  async function executeDeleteMovement(id: string) {
    const { error } = await supabase.from("movements").delete().eq("id", id);

    if (error) {
      alert("Non posso eliminare: " + error.message);
      return;
    }

    setMovMsg("Movimento eliminato ✅");
    await loadMovements();
  }

  async function handleDeleteMovementConfirm() {
    if (!deleteMovId) return;
    await executeDeleteMovement(deleteMovId);
    setDeleteMovId(null);
  }

  async function grantAdmin(userId: string) {
    const ok = confirm("Rendere questo utente ADMIN?");
    if (!ok) return;

    const { error } = await supabase.rpc("admin_grant_admin", { target_user: userId });
    if (error) {
      alert("Errore: " + error.message);
      return;
    }

    setUsersMsg("Admin assegnato ✅");
    await loadUsers();
  }

  async function revokeAdmin(userId: string) {
    const ok = confirm("Revocare ADMIN a questo utente?");
    if (!ok) return;

    const { error } = await supabase.rpc("admin_revoke_admin", { target_user: userId });
    if (error) {
      const msg =
        error.message.includes("cannot_revoke_self")
          ? "Non puoi revocare l’admin a te stesso."
          : error.message.includes("cannot_remove_last_admin")
          ? "Non puoi rimuovere l’ultimo admin."
          : "Errore: " + error.message;
      alert(msg);
      return;
    }

    setUsersMsg("Admin revocato ✅");
    await loadUsers();
  }

  async function deleteUser(userId: string, email: string | null) {
    const ok = confirm(
      `Eliminare definitivamente l'utente ${email ?? userId}?\n\nQuesta azione non può essere annullata.`
    );
    if (!ok) return;

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error ?? "Errore eliminazione utente");
      return;
    }

    setUsersMsg("Utente eliminato ✅");
    await loadUsers();
  }

  function openEdit(u: AdminUserRow) {
    setEditUser(u);
    setEditBadge(u.badge_number ?? "");
    setEditFirst(u.first_name ?? "");
    setEditLast(u.last_name ?? "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editUser) return;

    setEditBusy(true);
    try {
      const { error } = await supabase.rpc("admin_update_profile", {
        target_user: editUser.user_id,
        p_badge: editBadge,
        p_first_name: editFirst,
        p_last_name: editLast,
      });

      if (error) {
        const msg =
          error.message.includes("not_admin")
            ? "Operazione non permessa (non admin)."
            : error.message.includes("profile_not_found")
            ? "Profilo non trovato."
            : "Errore: " + error.message;

        alert(msg);
        return;
      }

      setUsersMsg("Profilo aggiornato ✅");
      setEditOpen(false);
      setEditUser(null);
      await loadUsers();
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDisconnectAll() {
    const ok = confirm("Disconnettere TUTTI gli utenti (incluso te)?");
    if (!ok) return;

    setDisconnectingAll(true);
    try {
      const res = await fetch("/api/admin/force-logout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Errore");
        return;
      }
      alert("Comando inviato. Tutti verranno disconnessi.");
      await supabase.auth.signOut();
      window.location.href = "/login";
    } finally {
      setDisconnectingAll(false);
    }
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

      const res = await fetch("/api/admin/reset-magazzino", { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert("Errore reset magazzino: " + (json.error || res.statusText));
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

  async function onFile(file: File) {
    setImportMsg(null);
    setImportBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

      const items = rows
        .map((r) => {
          const code = String(r["Materiale"] ?? "").trim();
          const name = String(r["Descrizione Materiale"] ?? "").trim();
          if (!code || !name) return null;

          const initial_qty = toNumber(r["TOTALE"]);
          const qty_free = toNumber(r["Qnt. a Mag. Libero"]);
          const qty_blocked = toNumber(r["Qnt. a Mag. bloccato"]);
          const qty_quality = toNumber(r["Controllo Qualità Magazzino"]);

          return {
            code,
            name,
            um: String(r["UM"] ?? "").trim() || null,
            division: String(r["Divisione"] ?? "").trim() || null,
            division_desc: String(r["Descrizione Divisione"] ?? "").trim() || null,
            warehouse: String(r["Magazzino"] ?? "").trim() || null,
            warehouse_desc: String(r["Descrizione Magazzino"] ?? "").trim() || null,
            group_desc: String(r["Descrizione Gruppo Merci"] ?? "").trim() || null,
            qty_free,
            qty_blocked,
            qty_quality,
            initial_qty,
          };
        })
        .filter(Boolean) as any[];

      if (items.length === 0) {
        setImportMsg("Nessuna riga valida trovata. Controlla intestazioni del file.");
        return;
      }

      const { error } = await supabase.from("items").upsert(items, { onConflict: "code" });

      if (error) {
        setImportMsg("Import bloccato ❌. Dettaglio: " + error.message);
        return;
      }

      setImportMsg(`Import completato ✅ (${items.length} righe)`);
    } catch (e: any) {
      setImportMsg("Errore import: " + (e?.message ?? String(e)));
    } finally {
      setImportBusy(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    if (!s) return users;

    return users.filter((u) => {
      const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase();
      return (
        (u.email ?? "").toLowerCase().includes(s) ||
        (u.badge_number ?? "").toLowerCase().includes(s) ||
        full.includes(s)
      );
    });
  }, [users, userSearch]);

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Admin Panel</div>
        <div className="pageBarRight" style={{ display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={handleDisconnectAll}
            disabled={disconnectingAll}
            style={{
              borderColor: "rgba(245,158,11,0.6)",
              background: "rgba(245,158,11,0.12)",
              color: "#92400e",
            }}
          >
            {disconnectingAll ? "..." : "Disconnetti tutti"}
          </button>
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

          <a className="btn" href="/giacenze">Giacenze</a>
          <a className="btn" href="/movimenti">Movimenti</a>
        </div>
      </div>

      <div style={{ padding: 12, borderBottom: "1px solid #d9e1ea" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Operatori (registrati) & ruoli Admin</h2>
          <button className="btn" onClick={loadUsers}>Aggiorna</button>
        </div>

        <div className="filters" style={{ marginTop: 10, gridTemplateColumns: "2fr 1fr" }}>
          <div className="field">
            <label>Cerca (email / badge / nome)</label>
            <input
              className="input"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="es. demo1 / 1024 / Rossi"
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn btnPrimary" onClick={loadUsers}>Ricarica elenco</button>
          </div>
        </div>

        {usersMsg ? (
          <div style={{ marginTop: 10, fontWeight: 800, color: usersMsg.includes("✅") ? "#065f46" : "#991b1b" }}>
            {usersMsg}
          </div>
        ) : null}

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Badge</th>
                <th>Nome</th>
                <th>Admin</th>
                <th>Azione</th>
              </tr>
            </thead>

            <tbody>
              {loadingUsers ? (
                <tr><td colSpan={5}>Caricamento…</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={5}>Nessun operatore.</td></tr>
              ) : (
                filteredUsers.map((u) => {
                  const fullName = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "-";

                  return (
                    <tr key={u.user_id}>
                      <td>{u.email ?? "-"}</td>
                      <td>{u.badge_number ?? "-"}</td>
                      <td>{fullName}</td>
                      <td>{u.is_admin ? "✅" : "—"}</td>
                      <td style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button className="btn" onClick={() => openEdit(u)}>Modifica</button>

                        {u.is_admin ? (
                          u.user_id === myUserId ? (
                            <span style={{ color: "#6b7280", fontSize: 12 }}>Sei tu</span>
                          ) : (
                            <button className="btn" onClick={() => revokeAdmin(u.user_id)}>Revoca Admin</button>
                          )
                        ) : (
                          <button className="btn btnPrimary" onClick={() => grantAdmin(u.user_id)}>Rendi Admin</button>
                        )}

                        {u.user_id !== myUserId && (
                          <button
                            className="btn"
                            onClick={() => deleteUser(u.user_id, u.email)}
                            style={{
                              borderColor: "rgba(239,68,68,0.5)",
                              background: "rgba(239,68,68,0.08)",
                              color: "#991b1b",
                            }}
                          >
                            Elimina
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
          Nota: modifica profilo/ruoli gestiti via RPC. Nessuna password “admin” nel frontend.
        </div>
      </div>

      <div style={{ padding: 12, borderBottom: "1px solid #d9e1ea" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Import anagrafica Excel (solo admin)</h2>

        <div className="filters" style={{ gridTemplateColumns: "2fr 1fr 2fr" }}>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label>Seleziona file</label>
            <input
              className="input"
              type="file"
              accept=".xlsx,.xls"
              disabled={importBusy || resetting}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>

          <div className="field">
            <label>Stato</label>
            <div className="input" style={{ background: "#f8fafc" }}>
              {importBusy ? "Importazione…" : resetting ? "Reset in corso..." : "Pronto"}
            </div>
          </div>
        </div>

        {importMsg ? (
          <div style={{ marginTop: 10, fontWeight: 800, color: importMsg.includes("✅") ? "#065f46" : "#991b1b" }}>
            {importMsg}
          </div>
        ) : null}
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Gestione movimenti (elimina)</h2>
          <button className="btn" onClick={loadMovements}>Aggiorna</button>
        </div>

        <div className="filters" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr" }}>
          <div className="field">
            <label>Data da</label>
            <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>Data a</label>
            <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
              <option value="ALL">Tutti</option>
              <option value="IN">Entrata</option>
              <option value="OUT">Uscita</option>
            </select>
          </div>
          <div className="field">
            <label>Codice</label>
            <input className="input" value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} placeholder="es. 123" />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn btnPrimary" onClick={loadMovements}>Applica</button>
          </div>
        </div>

        {movMsg ? (
          <div style={{ marginTop: 10, fontWeight: 800, color: movMsg.includes("✅") ? "#065f46" : "#991b1b" }}>
            {movMsg}
          </div>
        ) : null}

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Codice</th>
                <th>Q.tà</th>
                <th>Note</th>
                <th>Inserito da</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loadingMov ? (
                <tr><td colSpan={7}>Caricamento…</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={7}>Nessun movimento.</td></tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.created_at)}</td>
                    <td>{m.type === "IN" ? <span className="badgeIn">Entrata</span> : <span className="badgeOut">Uscita</span>}</td>
                    <td>{m.code}</td>
                    <td>{m.type === "IN" ? "+" : "-"}{m.qty}</td>
                    <td>{m.note ?? ""}</td>
                    <td>{m.created_by_email ?? "-"}</td>
                    <td>
                      <button className="btn" onClick={() => openDeleteMovementConfirm(m.id)}>Elimina</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
          La cancellazione è permessa solo agli admin (controllo lato DB).
        </div>
      </div>

      {editOpen && editUser && (
        <div
          onMouseDown={() => {
            if (!editBusy) {
              setEditOpen(false);
              setEditUser(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            zIndex: 999,
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(680px, 96vw)",
              background: "white",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, color: "#111827" }}>Modifica Operatore</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{editUser.email ?? "-"}</div>
              </div>
              <button
                className="btn"
                onClick={() => {
                  if (!editBusy) {
                    setEditOpen(false);
                    setEditUser(null);
                  }
                }}
              >
                Chiudi
              </button>
            </div>

            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              <div className="filters" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div className="field">
                  <label>Badge</label>
                  <input className="input" value={editBadge} onChange={(e) => setEditBadge(e.target.value)} placeholder="es. 014" />
                </div>
                <div className="field">
                  <label>Nome</label>
                  <input className="input" value={editFirst} onChange={(e) => setEditFirst(e.target.value)} placeholder="Nome" />
                </div>
                <div className="field">
                  <label>Cognome</label>
                  <input className="input" value={editLast} onChange={(e) => setEditLast(e.target.value)} placeholder="Cognome" />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  className="btn"
                  disabled={editBusy}
                  onClick={() => {
                    setEditOpen(false);
                    setEditUser(null);
                  }}
                >
                  Annulla
                </button>
                <button className="btn btnPrimary" disabled={editBusy} onClick={saveEdit}>
                  {editBusy ? "Salvataggio…" : "Salva"}
                </button>
              </div>

              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Nota: badge/nome/cognome vengono salvati nel profilo dell’utente.
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteMovId && (
        <ConfirmModal
          open={!!deleteMovId}
          title="Eliminare movimento"
          message="Eliminare questo movimento?"
          confirmLabel="Elimina"
          cancelLabel="Annulla"
          danger
          onConfirm={() => void handleDeleteMovementConfirm()}
          onCancel={() => setDeleteMovId(null)}
        />
      )}
    </main>
  );
}