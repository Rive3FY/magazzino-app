"use client";

import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { useToast } from "../_lib/ToastContext";
import { referentSchema } from "../_lib/validations";
import { fmtDateTime } from "../_lib/utils";
import type { ReferentRow } from "../_lib/types";

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

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  code: string | null;
  warehouse: string | null;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  details_json: Record<string, unknown> | null;
};

type TabId = "utenti" | "referenti" | "audit";

function renderAuditDetails(row: { action: string; details_json: Record<string, unknown> | null }) {
  const d = row.details_json ?? {};

  if (row.action === "MOVEMENT_CREATED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Tipo:</b> {String(d.type ?? "-")}</div>
        <div><b>Quantità:</b> {String(d.qty ?? "-")}</div>
        <div><b>Stato:</b> {String(d.status ?? "-")}</div>
        <div><b>Nota:</b> {String(d.note ?? "-")}</div>
      </div>
    );
  }
  if (row.action === "MOVEMENT_DELETED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Tipo:</b> {String(d.type ?? "-")}</div>
        <div><b>Quantità:</b> {String(d.qty ?? "-")}</div>
      </div>
    );
  }
  if (row.action === "MOVEMENT_CLOSED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Tipo:</b> {String(d.type ?? "-")}</div>
        <div><b>Uscita:</b> {String(d.out_qty ?? "-")}</div>
        <div><b>Rientro:</b> {String(d.returned_qty ?? "-")}</div>
        <div><b>Netta:</b> {String(d.net_qty ?? "-")}</div>
        <div><b>Referente:</b> {String(d.referent_name ?? "-")}</div>
        <div><b>Email referente:</b> {String(d.referent_email ?? "-")}</div>
        <div><b>Nota rientro:</b> {String(d.return_note ?? "-")}</div>
      </div>
    );
  }
  if (row.action === "MATERIAL_CREATED" || row.action === "MATERIAL_UPDATED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Descrizione:</b> {String(d.name ?? "-")}</div>
        <div><b>UM:</b> {String(d.um ?? "-")}</div>
        <div><b>Libero:</b> {String(d.qty_free ?? "-")}</div>
        <div><b>Bloccato:</b> {String(d.qty_blocked ?? "-")}</div>
        <div><b>Qualità:</b> {String(d.qty_quality ?? "-")}</div>
        <div><b>Totale iniziale:</b> {String(d.initial_qty ?? "-")}</div>
      </div>
    );
  }
  if (row.action === "MATERIAL_DELETED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Libero:</b> {String(d.qty_free ?? "-")}</div>
        <div><b>Bloccato:</b> {String(d.qty_blocked ?? "-")}</div>
        <div><b>Qualità:</b> {String(d.qty_quality ?? "-")}</div>
        <div><b>Totale iniziale:</b> {String(d.initial_qty ?? "-")}</div>
      </div>
    );
  }
  return (
    <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.35, fontFamily: "monospace" }}>
      {JSON.stringify(d ?? {}, null, 2)}
    </pre>
  );
}

export default function AdminPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const toast = useToast();

  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && ["utenti", "referenti", "audit"].includes(tabParam) ? tabParam : "utenti");

  useEffect(() => {
    if (tabParam && ["utenti", "referenti", "audit"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  // UTENTI
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // REFERENTI
  const [refRows, setRefRows] = useState<ReferentRow[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refSaving, setRefSaving] = useState(false);
  const [refMsg, setRefMsg] = useState<string | null>(null);
  const [refName, setRefName] = useState("");
  const [refEmail, setRefEmail] = useState("");
  const [refIsActive, setRefIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // AUDIT
  const [auditData, setAuditData] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditMsg, setAuditMsg] = useState<string | null>(null);
  const [auditQ, setAuditQ] = useState("");
  const [auditAction, setAuditAction] = useState("ALL");

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
      console.error(error);
      setMsg("Errore caricamento utenti");
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  }

  async function setApproved(userId: string, approved: boolean) {
    setWorkingId(userId);
    const { error } = await supabase.rpc("set_approved", { p_user: userId, p_approved: approved });
    if (error) {
      console.error(error);
      setMsg("Errore approvazione");
    } else {
      await loadUsers();
    }
    setWorkingId(null);
  }

  async function setAdminFlag(userId: string, makeAdmin: boolean) {
    setWorkingId(userId);
    const { error } = await supabase.rpc("set_admin", { p_user: userId, p_is_admin: makeAdmin });
    if (error) {
      console.error(error);
      setMsg("Errore admin");
    } else {
      await loadUsers();
    }
    setWorkingId(null);
  }

  async function deleteUser(userId: string, email: string | null) {
    if (!window.confirm(`Eliminare definitivamente l'utente ${email ?? userId}?\n\nQuesta azione non può essere annullata.`)) return;
    setDeletingId(userId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Errore eliminazione utente");
        return;
      }
      toast.success("Utente eliminato");
      await loadUsers();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleResetMagazzino() {
    const ok1 = window.confirm(
      "ATTENZIONE:\n\nQuesta operazione cancellerà TUTTI i movimenti, TUTTE le giacenze live e TUTTO l'import Excel originale.\n\nL'operazione è irreversibile.\n\nVuoi continuare?"
    );
    if (!ok1) return;
    const text = window.prompt('Per confermare davvero il reset, scrivi esattamente: RESET MAGAZZINO');
    if (text !== "RESET MAGAZZINO") {
      alert("Conferma non valida. Reset annullato.");
      return;
    }
    try {
      setResetting(true);
      const { error } = await supabase.rpc("reset_magazzino");
      if (error) throw error;
      alert("Reset magazzino completato con successo.");
      window.location.reload();
    } catch (e: unknown) {
      alert("Errore reset magazzino: " + (e instanceof Error ? e.message : "sconosciuto"));
    } finally {
      setResetting(false);
    }
  }

  async function loadReferents() {
    setRefLoading(true);
    setRefMsg(null);
    const { data, error } = await supabase
      .from("referents")
      .select("id,name,email,is_active")
      .order("name", { ascending: true });
    if (error) {
      console.error(error);
      setRefRows([]);
      setRefMsg("Errore caricamento referenti.");
    } else {
      setRefRows((data ?? []) as ReferentRow[]);
    }
    setRefLoading(false);
  }

  function resetRefForm() {
    setRefName("");
    setRefEmail("");
    setRefIsActive(true);
    setEditingId(null);
  }

  function startEdit(r: ReferentRow) {
    setEditingId(r.id);
    setRefName(r.name ?? "");
    setRefEmail(r.email ?? "");
    setRefIsActive(!!r.is_active);
    setRefMsg(null);
  }

  async function saveReferent() {
    setRefMsg(null);
    const parsed = referentSchema.safeParse({
      name: refName.trim(),
      email: refEmail.trim().toLowerCase(),
      is_active: refIsActive,
    });
    if (!parsed.success) {
      setRefMsg(parsed.error.flatten().formErrors[0] ?? "Dati non validi.");
      return;
    }
    const { name: cleanName, email: cleanEmail } = parsed.data;
    setRefSaving(true);
    try {
      if (editingId) {
        const { data: updated, error } = await supabase
          .from("referents")
          .update({ name: cleanName, email: cleanEmail, is_active: refIsActive })
          .eq("id", editingId)
          .select();
        if (error) throw error;
        if (!updated?.length) {
          setRefMsg("Nessuna riga aggiornata.");
          return;
        }
        toast.success("Referente aggiornato");
      } else {
        const { data: inserted, error } = await supabase
          .from("referents")
          .insert({ name: cleanName, email: cleanEmail, is_active: refIsActive })
          .select();
        if (error) throw error;
        if (!inserted?.length) {
          setRefMsg("Referente non creato.");
          return;
        }
        toast.success("Referente creato");
      }
      resetRefForm();
      await loadReferents();
    } catch (e: unknown) {
      setRefMsg(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setRefSaving(false);
    }
  }

  async function toggleRefActive(r: ReferentRow) {
    const { error } = await supabase.from("referents").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) {
      toast.error("Errore aggiornamento stato referente.");
      return;
    }
    toast.success("Stato aggiornato");
    await loadReferents();
  }

  async function deleteReferent(id: string) {
    const ref = refRows.find((r) => r.id === id);
    const refName = ref?.name ?? "";
    const refEmail = ref?.email ?? "";
    if (!window.confirm("Eliminare questo referente? Nei movimenti resterà comunque il nome e l'email del referente (impronta storica).")) return;
    setRefSaving(true);
    setRefMsg(null);
    const { error: updateError } = await supabase
      .from("movements")
      .update({ referent_id: null, referee_email: refEmail || null, referee_name: refName || null } as never)
      .eq("referent_id", id);
    if (updateError) {
      setRefMsg("Errore scollegamento movimenti: " + updateError.message);
      setRefSaving(false);
      return;
    }
    const { error } = await supabase.from("referents").delete().eq("id", id);
    if (error) {
      setRefMsg("Errore eliminazione referente: " + error.message);
      setRefSaving(false);
      return;
    }
    toast.success("Referente eliminato");
    if (editingId === id) resetRefForm();
    await loadReferents();
    setRefSaving(false);
  }

  async function loadAudit() {
    setAuditLoading(true);
    setAuditMsg(null);
    let query = supabase
      .from("audit_log")
      .select("id,created_at,action,entity_type,entity_id,code,warehouse,user_id,user_email,user_name,details_json")
      .order("created_at", { ascending: false })
      .limit(500);
    if (auditAction !== "ALL") query = query.eq("action", auditAction);
    const { data, error } = await query;
    if (error) {
      setAuditData([]);
      setAuditMsg("Errore caricamento audit log.");
    } else {
      setAuditData((data ?? []) as AuditRow[]);
    }
    setAuditLoading(false);
  }

  const auditRows = (() => {
    const text = auditQ.trim().toLowerCase();
    if (!text) return auditData;
    return auditData.filter((r) => {
      const blob = [r.action, r.entity_type, r.entity_id, r.code, r.warehouse, r.user_email, r.user_name, JSON.stringify(r.details_json ?? {})].join(" ").toLowerCase();
      return blob.includes(text);
    });
  })();

  useEffect(() => {
    (async () => {
      await guardAdmin();
    })();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && activeTab === "referenti") {
      loadReferents();
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (isAdmin && activeTab === "audit") {
      loadAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeTab, auditAction]);

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

  const tabs: { id: TabId; label: string }[] = [
    { id: "utenti", label: "Utenti" },
    { id: "referenti", label: "Referenti" },
    { id: "audit", label: "Audit Log" },
  ];

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Admin</div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn ${activeTab === t.id ? "btnPrimary" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            className="btn"
            onClick={handleResetMagazzino}
            disabled={resetting}
            style={{ borderColor: "rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.10)", color: "#991b1b" }}
          >
            {resetting ? "Reset…" : "Reset magazzino"}
          </button>
        </div>
      </div>

      <div style={{ padding: 12 }}>
        {activeTab === "utenti" && (
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Utenti registrati</div>
              <button className="btn" onClick={loadUsers}>Aggiorna</button>
            </div>
            {msg && <div style={{ marginBottom: 10, fontWeight: 700 }}>{msg}</div>}
            <div className="tableWrap">
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
                    <tr><td colSpan={6} style={{ padding: 12 }}>Caricamento…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 12 }}>Nessun utente</td></tr>
                  ) : (
                    rows.map((u) => {
                      const fullName = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
                      const busy = workingId === u.id;
                      const isMe = myId === u.id;
                      return (
                        <tr key={u.id}>
                          <td>{u.email}</td>
                          <td>{u.badge_number ?? "-"}</td>
                          <td>{fullName || "-"}</td>
                          <td style={{ fontWeight: 800 }}>{u.approved ? "✅ SI" : "⛔ NO"}</td>
                          <td style={{ fontWeight: 800 }}>{u.is_admin ? "✅ SI" : "-"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {u.approved ? (
                                <button className="btn" disabled={busy || isMe} title={isMe ? "Non puoi disapprovare te stesso" : ""} onClick={() => setApproved(u.id, false)}>Disapprova</button>
                              ) : (
                                <button className="btn btnPrimary" disabled={busy} onClick={() => setApproved(u.id, true)}>Approva</button>
                              )}
                              {u.is_admin ? (
                                <button className="btn" disabled={busy || isMe} title={isMe ? "Non puoi rimuovere admin a te stesso" : ""} onClick={() => setAdminFlag(u.id, false)}>Rimuovi admin</button>
                              ) : (
                                <button className="btn" disabled={busy} onClick={() => setAdminFlag(u.id, true)}>Rendi admin</button>
                              )}
                              {!isMe && (
                                <button
                                  className="btn"
                                  disabled={deletingId === u.id}
                                  onClick={() => deleteUser(u.id, u.email)}
                                  style={{ borderColor: "rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.08)", color: "#991b1b" }}
                                >
                                  {deletingId === u.id ? "Eliminazione…" : "Elimina"}
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

        {activeTab === "referenti" && (
          <>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>{editingId ? "Modifica referente" : "Nuovo referente"}</div>
              <div className="mobileGrid1" style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr auto", gap: 10, alignItems: "end" }}>
                <div>
                  <label className="label" htmlFor="refName">Nome e cognome</label>
                  <input id="refName" className="input" value={refName} onChange={(e) => setRefName(e.target.value)} placeholder="Es. Mario Rossi" />
                </div>
                <div>
                  <label className="label" htmlFor="refEmail">Email</label>
                  <input id="refEmail" className="input" value={refEmail} onChange={(e) => setRefEmail(e.target.value)} placeholder="Es. mario.rossi@azienda.it" />
                </div>
                <div>
                  <label className="label" htmlFor="refActive">Stato</label>
                  <select id="refActive" className="input" value={refIsActive ? "true" : "false"} onChange={(e) => setRefIsActive(e.target.value === "true")}>
                    <option value="true">Attivo</option>
                    <option value="false">Non attivo</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btnPrimary" onClick={saveReferent} disabled={refSaving}>{refSaving ? "Salvataggio..." : editingId ? "Salva" : "Crea"}</button>
                  <button className="btn" onClick={resetRefForm} disabled={refSaving}>Pulisci</button>
                </div>
              </div>
              {refMsg && <div style={{ marginTop: 10, fontWeight: 800 }}>{refMsg}</div>}
            </div>

            <div className="card" style={{ padding: 12, marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Elenco referenti</div>
              {refLoading ? (
                <div style={{ padding: 12 }}>Caricamento…</div>
              ) : refRows.length === 0 ? (
                <div style={{ padding: 12 }}>Nessun referente.</div>
              ) : (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th>Stato</th>
                        <th>Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refRows.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 900 }}>{r.name}</td>
                          <td>{r.email}</td>
                          <td>{r.is_active ? "Attivo" : "Non attivo"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn" onClick={() => startEdit(r)}>Modifica</button>
                              <button className="btn" onClick={() => toggleRefActive(r)}>{r.is_active ? "Disattiva" : "Attiva"}</button>
                              <button className="btn" onClick={() => deleteReferent(r.id)} disabled={refSaving}>Elimina</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "audit" && (
          <>
            <div className="card" style={{ padding: 12 }}>
              <div className="mobileGrid1" style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 220px auto", gap: 10, alignItems: "end" }}>
                <div>
                  <label className="label" htmlFor="auditSearch">Cerca</label>
                  <input id="auditSearch" className="input" value={auditQ} onChange={(e) => setAuditQ(e.target.value)} placeholder="Codice, email, azione, dettagli..." />
                </div>
                <div>
                  <label className="label" htmlFor="auditAction">Azione</label>
                  <select id="auditAction" className="input" value={auditAction} onChange={(e) => setAuditAction(e.target.value)}>
                    <option value="ALL">Tutte</option>
                    <option value="MOVEMENT_CREATED">MOVEMENT_CREATED</option>
                    <option value="MOVEMENT_DELETED">MOVEMENT_DELETED</option>
                    <option value="MOVEMENT_CLOSED">MOVEMENT_CLOSED</option>
                    <option value="MATERIAL_CREATED">MATERIAL_CREATED</option>
                    <option value="MATERIAL_UPDATED">MATERIAL_UPDATED</option>
                    <option value="MATERIAL_DELETED">MATERIAL_DELETED</option>
                  </select>
                </div>
                <div>
                  <button className="btn" onClick={loadAudit}>Aggiorna</button>
                </div>
              </div>
              {auditMsg && <div style={{ marginTop: 10, fontWeight: 800 }}>{auditMsg}</div>}
            </div>

            <div className="card" style={{ padding: 12, marginTop: 12 }}>
              {auditLoading ? (
                <div style={{ padding: 12 }}>Caricamento…</div>
              ) : auditRows.length === 0 ? (
                <div style={{ padding: 12 }}>Nessun record.</div>
              ) : (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Azione</th>
                        <th>Entità</th>
                        <th>Codice</th>
                        <th>Mag.</th>
                        <th>Utente</th>
                        <th className="auditDetailCol">Dettaglio operazione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((r) => (
                        <tr key={r.id}>
                          <td>{fmtDateTime(r.created_at)}</td>
                          <td style={{ fontWeight: 900 }}>{r.action}</td>
                          <td>{r.entity_type}</td>
                          <td style={{ fontWeight: 900 }}>{r.code ?? "-"}</td>
                          <td>{r.warehouse ?? "-"}</td>
                          <td>{r.user_name ?? r.user_email ?? "-"}</td>
                          <td>{renderAuditDetails(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
