"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import AppModalFrame from "./AppModalFrame";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import type { RoleScope } from "../_lib/admin-access";

type ScopeKey = Extract<RoleScope, "MATERIALS" | "LINEE" | "STAZIONI">;

type BaseRow = {
  id: string;
  user_id: string;
  email: string | null;
  approved: boolean | null;
  badge_number: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
  profile_updated_at: string | null;
};

type MaterialsRow = BaseRow & { is_materials_admin: boolean | null };
type LineeRow = BaseRow & { is_equipment_linee_admin: boolean | null };
type StazioniRow = BaseRow & { is_equipment_stazioni_admin: boolean | null };
type ScopeRow = MaterialsRow | LineeRow | StazioniRow;

const supabase = createClient();

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [maybe.message, maybe.details, maybe.hint, maybe.code]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => String(v).trim());
    if (parts.length > 0) return parts.join(" | ");
    try {
      const raw = JSON.stringify(error);
      if (raw && raw !== "{}") return raw;
    } catch {
      /* ignore */
    }
  }
  return "Errore sconosciuto";
}

const SCOPE_CONFIG = {
  MATERIALS: {
    listRpc: "admin_list_materials_admins",
    toggleRpc: "set_materials_admin",
    flagKey: "is_materials_admin",
    title: "Admin Materiali",
    enableLabel: "Rendi admin Materiali",
    disableLabel: "Rimuovi admin Materiali",
  },
  LINEE: {
    listRpc: "admin_list_linee_admins",
    toggleRpc: "set_equipment_linee_admin",
    flagKey: "is_equipment_linee_admin",
    title: "Admin Attrezzature Linee",
    enableLabel: "Rendi admin Linee",
    disableLabel: "Rimuovi admin Linee",
  },
  STAZIONI: {
    listRpc: "admin_list_stazioni_admins",
    toggleRpc: "set_equipment_stazioni_admin",
    flagKey: "is_equipment_stazioni_admin",
    title: "Admin Attrezzature Stazioni",
    enableLabel: "Rendi admin Stazioni",
    disableLabel: "Rimuovi admin Stazioni",
  },
} as const;

function getScopeEnabled(row: ScopeRow, scope: ScopeKey) {
  if (scope === "MATERIALS") return !!(row as MaterialsRow).is_materials_admin;
  if (scope === "LINEE") return !!(row as LineeRow).is_equipment_linee_admin;
  return !!(row as StazioniRow).is_equipment_stazioni_admin;
}

type Props = {
  scope: ScopeKey;
  title?: string;
  intro?: string;
};

export default function ScopedRoleAdminUsersClient({ scope, title, intro }: Props) {
  const access = useIsAdmin();
  const config = SCOPE_CONFIG[scope];
  const [rows, setRows] = useState<ScopeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<ScopeRow | null>(null);
  const [editBadge, setEditBadge] = useState("");
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const canManageScope =
    scope === "MATERIALS"
      ? access.canManageMaterials
      : scope === "LINEE"
      ? access.canManageEquipmentLinee
      : access.canManageEquipmentStazioni;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMyId(data.user?.id ?? null);
    });
  }, []);

  async function loadRows() {
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase.rpc(config.listRpc);
    if (error) {
      const errMsg = describeError(error);
      console.error("ScopedRoleAdmin RPC error:", errMsg, error);
      setRows([]);
      const hint =
        errMsg.includes("Could not find the function") || (error as { code?: string })?.code === "PGRST202"
          ? " Esegui lo script SQL admin_roles_area_update.sql sul database."
          : "";
      setMsg("Errore caricamento utenti: " + errMsg + hint);
    } else {
      setRows((data ?? []) as ScopeRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!canManageScope) return;
    void loadRows();
  }, [canManageScope, scope]);

  function openEdit(row: ScopeRow) {
    setEditRow(row);
    setEditBadge(row.badge_number ?? "");
    setEditFirst(row.first_name ?? "");
    setEditLast(row.last_name ?? "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return;
    setEditBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("admin_update_profile", {
      target_user: editRow.user_id,
      p_badge: editBadge.trim(),
      p_first_name: editFirst.trim(),
      p_last_name: editLast.trim(),
    });
    if (error) {
      setMsg("Errore aggiornamento profilo: " + error.message);
      setEditBusy(false);
      return;
    }
    setEditOpen(false);
    setEditRow(null);
    await loadRows();
    setEditBusy(false);
  }

  async function toggleScopeAdmin(userId: string, enabled: boolean) {
    setWorkingId(userId);
    setMsg(null);
    const { error } = await supabase.rpc(config.toggleRpc, { target_user: userId, enabled });
    if (error) {
      const errMsg = describeError(error);
      console.error("ScopedRoleAdmin toggle RPC error:", errMsg, error);
      setMsg("Errore aggiornamento ruolo: " + errMsg);
    } else {
      await loadRows();
    }
    setWorkingId(null);
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim().toLowerCase();
      return (
        (row.email ?? "").toLowerCase().includes(query) ||
        (row.badge_number ?? "").toLowerCase().includes(query) ||
        fullName.includes(query)
      );
    });
  }, [rows, search]);

  if (access.loading) {
    return <div style={{ padding: 12 }}>Caricamento…</div>;
  }

  if (!canManageScope) {
    return <div style={{ padding: 12 }}>Accesso non consentito.</div>;
  }

  return (
    <>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--panel)",
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 15,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          <span>{title ?? config.title}</span>
          <span style={{ fontSize: 18, color: "var(--muted)", transition: "transform 0.2s", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}>
            ▼
          </span>
        </button>
        {!collapsed && (
          <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
            {intro ? <div style={{ marginBottom: 10, color: "#64748b", fontSize: 13 }}>{intro}</div> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <input
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per email, badge o nome"
                style={{ minWidth: 200, flex: "1 1 200px" }}
              />
              <button className="btn" onClick={loadRows}>Aggiorna</button>
            </div>
            {msg ? <div style={{ marginBottom: 10, fontWeight: 700 }}>{msg}</div> : null}
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Badge</th>
                    <th>Nome</th>
                    <th>Approvato</th>
                    <th>Ruolo</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} style={{ padding: 12 }}>Caricamento…</td></tr>
                  ) : filteredRows.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 12 }}>Nessun utente</td></tr>
                  ) : (
                    filteredRows.map((row) => {
                      const enabled = getScopeEnabled(row, scope);
                      const busy = workingId === row.id;
                      const isMe = myId === row.user_id;
                      return (
                        <tr key={row.id}>
                          <td>{row.email ?? "-"}</td>
                          <td>{row.badge_number ?? "-"}</td>
                          <td>{`${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "-"}</td>
                          <td style={{ fontWeight: 800 }}>{row.approved ? "SI" : "NO"}</td>
                          <td style={{ fontWeight: 800 }}>{enabled ? "ATTIVO" : "-"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn" onClick={() => openEdit(row)}>Modifica profilo</button>
                              {enabled ? (
                                <button
                                  className="btn"
                                  disabled={busy || isMe}
                                  title={isMe ? "Non puoi rimuovere da solo il tuo ruolo da questa pagina." : ""}
                                  onClick={() => toggleScopeAdmin(row.user_id, false)}
                                >
                                  {config.disableLabel}
                                </button>
                              ) : (
                                <button className="btn btnPrimary" disabled={busy} onClick={() => toggleScopeAdmin(row.user_id, true)}>
                                  {config.enableLabel}
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
        )}
      </div>

      {editOpen && editRow ? (
        <AppModalFrame
          open
          title="Modifica Operatore"
          subtitle={editRow.email ?? "-"}
          onClose={() => {
            if (!editBusy) {
              setEditOpen(false);
              setEditRow(null);
            }
          }}
          width="min(680px, 96vw)"
          headerRight={
            <button
              className="btn"
              onClick={() => {
                if (!editBusy) {
                  setEditOpen(false);
                  setEditRow(null);
                }
              }}
            >
              Chiudi
            </button>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
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
                    setEditRow(null);
                  }}
                >
                  Annulla
                </button>
                <button className="btn btnPrimary" disabled={editBusy} onClick={saveEdit}>
                  {editBusy ? "Salvataggio…" : "Salva"}
                </button>
              </div>
          </div>
        </AppModalFrame>
      ) : null}
    </>
  );
}
