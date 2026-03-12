"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  is_super_admin: boolean | null;
  is_materials_admin: boolean | null;
  is_equipment_linee_admin: boolean | null;
  is_equipment_stazioni_admin: boolean | null;
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

type TabId = "utenti" | "referenti" | "audit" | "richieste-excel";

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
  if (row.action === "EQUIPMENT_CREATED" || row.action === "EQUIPMENT_UPDATED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Codice:</b> {String(d.asset_code ?? "-")}</div>
        <div><b>Nome:</b> {String(d.name ?? "-")}</div>
        <div><b>Seriale:</b> {String(d.serial_number ?? "-")}</div>
        <div><b>Categoria:</b> {String(d.category ?? "-")}</div>
        <div><b>Area:</b> {String(d.equipment_area ?? "-")}</div>
      </div>
    );
  }
  if (row.action === "EQUIPMENT_DELETED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Codice:</b> {String(d.asset_code ?? "-")}</div>
        <div><b>Nome:</b> {String(d.name ?? "-")}</div>
        <div><b>Area:</b> {String(d.equipment_area ?? "-")}</div>
        <div><b>Stato:</b> {String(d.status ?? "-")}</div>
      </div>
    );
  }
  if (row.action === "EQUIPMENT_MOVEMENT") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Operazione:</b> {String(d.movement_type ?? "-")}</div>
        <div><b>Stato:</b> {String(d.status ?? "-")}</div>
        <div><b>Esito finale:</b> {String(d.resolution_type ?? "-")}</div>
        <div><b>Area:</b> {String(d.equipment_area ?? "-")}</div>
        <div><b>Assegnatario:</b> {String(d.assigned_to_name ?? "-")}</div>
        <div><b>Nota:</b> {String(d.note ?? "-")}</div>
        <div><b>Destinazione:</b> {String(d.destination ?? "-")}</div>
        <div><b>Piano intervento:</b> {String(d.intervention_plan_number ?? "-")}</div>
        <div><b>Nota chiusura:</b> {String(d.close_note ?? "-")}</div>
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
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && ["utenti", "referenti", "audit", "richieste-excel"].includes(tabParam) ? tabParam : "utenti");

  useEffect(() => {
    if (tabParam && ["utenti", "referenti", "audit", "richieste-excel"].includes(tabParam)) {
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
  const [auditArea, setAuditArea] = useState<"ALL" | "MATERIALI" | "LINEE" | "STAZIONI">("ALL");

  // RICHIESTE EXCEL
  const [excelRequests, setExcelRequests] = useState<ExcelLiveRequestRow[]>([]);
  const [excelRequestsLoading, setExcelRequestsLoading] = useState(true);
  const [excelRequestsMsg, setExcelRequestsMsg] = useState<string | null>(null);
  const [excelRequestsWorking, setExcelRequestsWorking] = useState<string | null>(null);

  // RESET TAG NFC
  const [nfcResetModalOpen, setNfcResetModalOpen] = useState(false);
  const [nfcTagIdInput, setNfcTagIdInput] = useState("");
  const [nfcResetLoading, setNfcResetLoading] = useState(false);
  const [nfcResetMsg, setNfcResetMsg] = useState<string | null>(null);
  const [nfcScanning, setNfcScanning] = useState(false);

  async function guardAdmin() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      window.location.href = "/login";
      return;
    }
    setMyId(u.user.id);
    try {
      const { data: superAdmin, error: superAdminError } = await supabase.rpc("is_super_admin");
      const { data: legacyAdmin, error: legacyAdminError } = await supabase.rpc("is_admin");
      if ((superAdminError && legacyAdminError) || !(superAdmin || legacyAdmin)) {
        window.location.href = "/";
        return;
      }
      setIsAdmin(true);
      setChecking(false);
    } catch (error) {
      console.error(error);
      setChecking(false);
      return;
    }
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

  async function setAreaAdminFlag(
    userId: string,
    rpcName: "set_materials_admin" | "set_equipment_linee_admin" | "set_equipment_stazioni_admin",
    enabled: boolean
  ) {
    setWorkingId(userId);
    const { error } = await supabase.rpc(rpcName, { target_user: userId, enabled });
    if (error) {
      console.error(error);
      setMsg("Errore aggiornamento ruolo area");
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
      const res = await fetch("/api/admin/reset-magazzino", { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      alert("Reset magazzino completato con successo.");
      window.location.reload();
    } catch (e: unknown) {
      alert("Errore reset magazzino: " + (e instanceof Error ? e.message : "sconosciuto"));
    } finally {
      setResetting(false);
    }
  }

  async function handleResetNfcTag() {
    const tagId = nfcTagIdInput.trim();
    if (!tagId) {
      setNfcResetMsg("Inserisci l'ID del tag NFC da resettare.");
      return;
    }
    setNfcResetLoading(true);
    setNfcResetMsg(null);
    try {
      const res = await fetch("/api/admin/reset-nfc-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nfcTagId: tagId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setNfcResetMsg(json.message ?? "Tag NFC resettato.");
      setNfcTagIdInput("");
    } catch (e: unknown) {
      setNfcResetMsg("Errore: " + (e instanceof Error ? e.message : "sconosciuto"));
    } finally {
      setNfcResetLoading(false);
    }
  }

  async function scanNfcForReset() {
    if (!("NDEFReader" in window)) {
      setNfcResetMsg("NFC non disponibile su questo dispositivo (Chrome Android con HTTPS).");
      return;
    }
    setNfcScanning(true);
    setNfcResetMsg(null);
    try {
      const ndef = new NDEFReader();
      await ndef.scan();
      const handler = (event: NDEFReadingEvent) => {
        ndef.removeEventListener("reading", handler);
        const id = event.serialNumber ?? "";
        setNfcTagIdInput(id);
        setNfcScanning(false);
        setNfcResetMsg("Tag letto. Clicca Reset per procedere.");
      };
      ndef.addEventListener("reading", handler);
      setNfcResetMsg("Avvicina il dispositivo al tag NFC...");
    } catch (e: unknown) {
      setNfcResetMsg("Errore lettura NFC: " + (e instanceof Error ? e.message : "sconosciuto"));
      setNfcScanning(false);
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
    let filtered = auditData;
    if (auditArea !== "ALL") {
      filtered = auditData.filter((r) => {
        if (auditArea === "MATERIALI") {
          return r.entity_type === "material" || r.entity_type === "movement";
        }
        if (auditArea === "LINEE" || auditArea === "STAZIONI") {
          const area = r.warehouse ?? (r.details_json as Record<string, unknown>)?.equipment_area;
          return r.entity_type === "equipment_asset" && area === auditArea;
        }
        return true;
      });
    }
    const text = auditQ.trim().toLowerCase();
    if (!text) return filtered;
    return filtered.filter((r) => {
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
    if (isAdmin && activeTab === "richieste-excel") {
      loadExcelRequests();
    }
  }, [isAdmin, activeTab]);

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

  if (checking) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Super Admin</div>
        </div>
        <div style={{ padding: 12 }}>Caricamento…</div>
      </main>
    );
  }

  if (!isAdmin) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "utenti", label: "Utenti" },
    { id: "referenti", label: "Referenti" },
    { id: "richieste-excel", label: "Richieste excel" },
    { id: "audit", label: "Audit Log" },
  ];

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Admin</div>
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
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

        {activeTab === "utenti" && (
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Utenti registrati</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" onClick={loadUsers}>Aggiorna</button>
                <button
                  className="btn"
                  onClick={handleResetMagazzino}
                  disabled={resetting}
                  style={{ borderColor: "rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.10)", color: "#991b1b" }}
                >
                  {resetting ? "Reset…" : "Reset magazzino"}
                </button>
                <button
                  className="btn"
                  onClick={() => { setNfcResetModalOpen(true); setNfcResetMsg(null); setNfcTagIdInput(""); }}
                  title="Rimuovi l'associazione di un tag NFC da attrezzature e scaffali"
                >
                  Reset tag NFC
                </button>
              </div>
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
                    <th>Super</th>
                    <th>Materiali</th>
                    <th>Linee</th>
                    <th>Stazioni</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} style={{ padding: 12 }}>Caricamento…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: 12 }}>Nessun utente</td></tr>
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
                          <td style={{ fontWeight: 800 }}>{u.is_super_admin ? "✅ SI" : "-"}</td>
                          <td style={{ fontWeight: 800 }}>{u.is_materials_admin ? "✅ SI" : "-"}</td>
                          <td style={{ fontWeight: 800 }}>{u.is_equipment_linee_admin ? "✅ SI" : "-"}</td>
                          <td style={{ fontWeight: 800 }}>{u.is_equipment_stazioni_admin ? "✅ SI" : "-"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {u.approved ? (
                                <button className="btn" disabled={busy || isMe} title={isMe ? "Non puoi disapprovare te stesso" : ""} onClick={() => setApproved(u.id, false)}>Disapprova</button>
                              ) : (
                                <button className="btn btnPrimary" disabled={busy} onClick={() => setApproved(u.id, true)}>Approva</button>
                              )}
                              {u.is_super_admin ? (
                                <button className="btn" disabled={busy || isMe} title={isMe ? "Non puoi rimuovere admin a te stesso" : ""} onClick={() => setAdminFlag(u.id, false)}>Rimuovi admin</button>
                              ) : (
                                <button className="btn" disabled={busy} onClick={() => setAdminFlag(u.id, true)}>Rendi super admin</button>
                              )}
                              {u.is_materials_admin ? (
                                <button className="btn" disabled={busy || isMe} onClick={() => setAreaAdminFlag(u.id, "set_materials_admin", false)}>Rimuovi admin Materiali</button>
                              ) : (
                                <button className="btn" disabled={busy} onClick={() => setAreaAdminFlag(u.id, "set_materials_admin", true)}>Admin Materiali</button>
                              )}
                              {u.is_equipment_linee_admin ? (
                                <button className="btn" disabled={busy || isMe} onClick={() => setAreaAdminFlag(u.id, "set_equipment_linee_admin", false)}>Rimuovi admin Linee</button>
                              ) : (
                                <button className="btn" disabled={busy} onClick={() => setAreaAdminFlag(u.id, "set_equipment_linee_admin", true)}>Admin Linee</button>
                              )}
                              {u.is_equipment_stazioni_admin ? (
                                <button className="btn" disabled={busy || isMe} onClick={() => setAreaAdminFlag(u.id, "set_equipment_stazioni_admin", false)}>Rimuovi admin Stazioni</button>
                              ) : (
                                <button className="btn" disabled={busy} onClick={() => setAreaAdminFlag(u.id, "set_equipment_stazioni_admin", true)}>Admin Stazioni</button>
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
                              <Link href={`/movimenti?open=${req.movement_id}`} className="btn" target="_blank" rel="noopener noreferrer">
                                Vedi movimento
                              </Link>
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

        {activeTab === "audit" && (
          <>
            <div className="card" style={{ padding: 12 }}>
              <div className="mobileGrid1" style={{ display: "grid", gridTemplateColumns: "minmax(200px,1fr) minmax(180px,1fr) minmax(180px,1fr) auto", gap: 10, alignItems: "end" }}>
                <div>
                  <label className="label" htmlFor="auditSearch">Cerca</label>
                  <input id="auditSearch" className="input" value={auditQ} onChange={(e) => setAuditQ(e.target.value)} placeholder="Codice, email, azione, dettagli..." />
                </div>
                <div>
                  <label className="label" htmlFor="auditArea">Area</label>
                  <select id="auditArea" className="input" value={auditArea} onChange={(e) => setAuditArea(e.target.value as "ALL" | "MATERIALI" | "LINEE" | "STAZIONI")}>
                    <option value="ALL">Tutte</option>
                    <option value="MATERIALI">Materiali</option>
                    <option value="LINEE">Attrezzature linee</option>
                    <option value="STAZIONI">Attrezzature stazioni</option>
                  </select>
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
                    <option value="EQUIPMENT_CREATED">EQUIPMENT_CREATED</option>
                    <option value="EQUIPMENT_UPDATED">EQUIPMENT_UPDATED</option>
                    <option value="EQUIPMENT_DELETED">EQUIPMENT_DELETED</option>
                    <option value="EQUIPMENT_MOVEMENT">EQUIPMENT_MOVEMENT</option>
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

      {nfcResetModalOpen && (
        <div
          className="modalOverlay"
          onClick={() => setNfcResetModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="nfc-reset-title"
        >
          <div className="modalWindow" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, padding: 20 }}>
            <div id="nfc-reset-title" style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>Reset tag NFC</div>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>
              Inserisci o scansiona l&apos;ID del tag NFC per rimuovere l&apos;associazione da attrezzature e scaffali.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <input
                className="input"
                type="text"
                placeholder="ID tag NFC"
                value={nfcTagIdInput}
                onChange={(e) => setNfcTagIdInput(e.target.value)}
                style={{ flex: 1, minWidth: 180 }}
              />
              <button
                className="btn"
                onClick={scanNfcForReset}
                disabled={nfcScanning}
              >
                {nfcScanning ? "Scansione…" : "Scansiona NFC"}
              </button>
            </div>
            {nfcResetMsg && (
              <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>{nfcResetMsg}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setNfcResetModalOpen(false)}>Chiudi</button>
              <button
                className="btn btnPrimary"
                onClick={handleResetNfcTag}
                disabled={nfcResetLoading || !nfcTagIdInput.trim()}
              >
                {nfcResetLoading ? "Reset…" : "Reset tag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
