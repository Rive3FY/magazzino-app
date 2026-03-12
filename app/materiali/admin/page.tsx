"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ScopedRoleAdminUsersClient from "../../_components/ScopedRoleAdminUsersClient";
import { createClient } from "../../_lib/supabase/client";
import { useToast } from "../../_lib/ToastContext";
import { referentSchema } from "../../_lib/validations";
import { fmtDateTime } from "../../_lib/utils";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import type { ReferentRow } from "../../_lib/types";

type TabId = "utenti" | "referenti" | "richieste-excel";

type ExcelLiveRequestRow = {
  id: string;
  movement_id: string;
  code: string;
  warehouse: string;
  delta_free: number;
  requested_by: string | null;
  requested_at: string;
  details_json: {
    material_name?: string;
    out_qty?: number;
    returned_qty?: number;
    return_note?: string | null;
    referent_id?: string | null;
    referent_name?: string | null;
    referent_email?: string | null;
    closed_at?: string;
    closed_by?: string | null;
  } | null;
};

const supabase = createClient();

export default function MaterialiAdminPage() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const { canManageMaterials, loading } = useIsAdmin();
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && ["utenti", "referenti", "richieste-excel"].includes(tabParam) ? tabParam : "utenti");

  const [refRows, setRefRows] = useState<ReferentRow[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refSaving, setRefSaving] = useState(false);
  const [refMsg, setRefMsg] = useState<string | null>(null);
  const [refName, setRefName] = useState("");
  const [refEmail, setRefEmail] = useState("");
  const [refIsActive, setRefIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [excelRequests, setExcelRequests] = useState<ExcelLiveRequestRow[]>([]);
  const [excelRequestsLoading, setExcelRequestsLoading] = useState(true);
  const [excelRequestsMsg, setExcelRequestsMsg] = useState<string | null>(null);
  const [excelRequestsWorking, setExcelRequestsWorking] = useState<string | null>(null);

  useEffect(() => {
    if (tabParam && ["utenti", "referenti", "richieste-excel"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

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

  useEffect(() => {
    if (canManageMaterials && activeTab === "referenti") {
      void loadReferents();
    }
  }, [canManageMaterials, activeTab]);

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
    const refNameValue = ref?.name ?? "";
    const refEmailValue = ref?.email ?? "";
    if (!window.confirm("Eliminare questo referente? Nei movimenti resterà comunque il nome e l'email del referente (impronta storica).")) return;
    setRefSaving(true);
    setRefMsg(null);
    const { error: updateError } = await supabase
      .from("movements")
      .update({ referent_id: null, referee_email: refEmailValue || null, referee_name: refNameValue || null } as never)
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

  async function loadExcelRequests() {
    setExcelRequestsLoading(true);
    setExcelRequestsMsg(null);
    const { data, error } = await supabase
      .from("excel_live_requests")
      .select("id,movement_id,code,warehouse,delta_free,requested_by,requested_at,details_json")
      .eq("status", "pending")
      .order("requested_at", { ascending: false });
    if (error) {
      setExcelRequests([]);
      setExcelRequestsMsg("Errore caricamento richieste.");
    } else {
      setExcelRequests((data ?? []) as ExcelLiveRequestRow[]);
    }
    setExcelRequestsLoading(false);
  }

  useEffect(() => {
    if (canManageMaterials && activeTab === "richieste-excel") {
      void loadExcelRequests();
    }
  }, [canManageMaterials, activeTab]);

  async function approveExcelRequest(req: ExcelLiveRequestRow) {
    setExcelRequestsWorking(req.id);
    setExcelRequestsMsg(null);
    try {
      const d = req.details_json ?? {};
      const { error: insErr } = await supabase.from("excel_live").insert({
        code: req.code,
        warehouse: req.warehouse,
        qty_free: req.delta_free,
        qty_blocked: 0,
        qty_quality: 0,
        row_json: { "Qnt. a Mag. libero": req.delta_free },
      });
      if (insErr) throw insErr;

      const { data: me } = await supabase.auth.getUser();
      const { error: movErr } = await supabase
        .from("movements")
        .update({
          returned_qty: d.returned_qty ?? 0,
          return_note: d.return_note ?? null,
          status: "CLOSED",
          closed_at: new Date().toISOString(),
          closed_by: me?.user?.id ?? d.closed_by ?? null,
          referent_id: d.referent_id ?? null,
          referee_email: d.referent_email ?? null,
          referee_name: d.referent_name ?? null,
        } as never)
        .eq("id", req.movement_id);
      if (movErr) throw movErr;

      const { error: reqErr } = await supabase
        .from("excel_live_requests")
        .update({ status: "approved", reviewed_by: me?.user?.id ?? null, reviewed_at: new Date().toISOString() } as never)
        .eq("id", req.id);
      if (reqErr) throw reqErr;

      toast.success("Richiesta approvata. Riga creata e movimento chiuso.");
      await loadExcelRequests();
    } catch (e: unknown) {
      setExcelRequestsMsg(e instanceof Error ? e.message : "Errore approvazione");
    } finally {
      setExcelRequestsWorking(null);
    }
  }

  async function denyExcelRequest(req: ExcelLiveRequestRow, note?: string) {
    setExcelRequestsWorking(req.id);
    setExcelRequestsMsg(null);
    try {
      const { data: me } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("excel_live_requests")
        .update({
          status: "denied",
          reviewed_by: me?.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          review_note: note ?? null,
        } as never)
        .eq("id", req.id);
      if (error) throw error;
      toast.success("Richiesta negata. Il movimento resta aperto.");
      await loadExcelRequests();
    } catch (e: unknown) {
      setExcelRequestsMsg(e instanceof Error ? e.message : "Errore negazione");
    } finally {
      setExcelRequestsWorking(null);
    }
  }

  if (loading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Materiali - Gestione Admin</div>
        </div>
        <div style={{ padding: 12 }}>Caricamento…</div>
      </main>
    );
  }

  if (!canManageMaterials) {
    return null;
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "utenti", label: "Admin area" },
    { id: "referenti", label: "Referenti" },
    { id: "richieste-excel", label: "Richieste excel" },
  ];

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Materiali - Gestione Admin</div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn ${activeTab === tab.id ? "btnPrimary" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        {activeTab === "utenti" && (
          <ScopedRoleAdminUsersClient
            scope="MATERIALS"
            intro="Da qui puoi scegliere chi gestisce le funzioni admin dell'area Materiali."
          />
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

            <div className="card" style={{ padding: 12 }}>
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
                      {refRows.map((row) => (
                        <tr key={row.id}>
                          <td style={{ fontWeight: 900 }}>{row.name}</td>
                          <td>{row.email}</td>
                          <td>{row.is_active ? "Attivo" : "Non attivo"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn" onClick={() => startEdit(row)}>Modifica</button>
                              <button className="btn" onClick={() => toggleRefActive(row)}>{row.is_active ? "Disattiva" : "Attiva"}</button>
                              <button className="btn" onClick={() => deleteReferent(row.id)} disabled={refSaving}>Elimina</button>
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

        {activeTab === "richieste-excel" && (
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Richieste di aggiunta riga in excel_live</div>
              <button className="btn" onClick={loadExcelRequests}>Aggiorna</button>
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              Quando un operatore chiude un movimento con materiale non presente in excel_live, viene creata una richiesta. Esamina i dettagli e approva o nega.
            </div>
            {excelRequestsMsg && <div style={{ marginBottom: 10, fontWeight: 700 }}>{excelRequestsMsg}</div>}
            {excelRequestsLoading ? (
              <div style={{ padding: 12 }}>Caricamento…</div>
            ) : excelRequests.length === 0 ? (
              <div style={{ padding: 12 }}>Nessuna richiesta in attesa.</div>
            ) : (
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Codice</th>
                      <th>Magazzino</th>
                      <th>Delta</th>
                      <th>Materiale</th>
                      <th>Uscita</th>
                      <th>Rientro</th>
                      <th>Referente</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelRequests.map((req) => {
                      const d = req.details_json ?? {};
                      const busy = excelRequestsWorking === req.id;
                      return (
                        <tr key={req.id}>
                          <td>{fmtDateTime(req.requested_at)}</td>
                          <td style={{ fontWeight: 900 }}>{req.code}</td>
                          <td>{req.warehouse}</td>
                          <td>+{req.delta_free}</td>
                          <td>{d.material_name ?? "-"}</td>
                          <td>{d.out_qty ?? "-"}</td>
                          <td>{d.returned_qty ?? "-"}</td>
                          <td>{d.referent_name ?? d.referent_email ?? "-"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn btnPrimary" disabled={busy} onClick={() => approveExcelRequest(req)}>
                                {busy ? "…" : "Approva"}
                              </button>
                              <button
                                className="btn"
                                disabled={busy}
                                onClick={() => {
                                  const note = window.prompt("Nota per il rifiuto (opzionale):");
                                  denyExcelRequest(req, note ?? undefined);
                                }}
                                style={{ borderColor: "rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.08)", color: "#991b1b" }}
                              >
                                {busy ? "…" : "Nega"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
