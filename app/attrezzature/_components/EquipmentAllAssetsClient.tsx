"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useAuth } from "../../_lib/hooks/useAuth";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import { useToast } from "../../_lib/ToastContext";
import { fmtDateTime } from "../../_lib/utils";
import {
  EQUIPMENT_AREA_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_OPTIONS,
  equipmentStatusStyle,
} from "../../_lib/equipment";
import { equipmentAssetSchema } from "../../_lib/validations";
import type { EquipmentArea, EquipmentAssetRow, EquipmentStatus } from "../../_lib/types";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

type AssetFormState = {
  serial_number: string;
  name: string;
  category: string;
  notes: string;
};

type NfcReassignState = {
  row: EquipmentAssetRow;
  serialNumber: string;
  existingSerial: string;
  existingArea: EquipmentArea;
};

const supabase = createClient();

const emptyForm: AssetFormState = {
  serial_number: "",
  name: "",
  category: "",
  notes: "",
};

function NfcIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
      <path d="M12 6v12" />
    </svg>
  );
}

export default function EquipmentAllAssetsClient({ area, basePath }: Props) {
  const { user, loading: authLoading, approved } = useAuth();
  const access = useIsAdmin();
  const isAdmin = area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;
  const adminLoading = access.loading;
  const toast = useToast();

  const [rows, setRows] = useState<EquipmentAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | EquipmentStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<EquipmentAssetRow | null>(null);
  const [form, setForm] = useState<AssetFormState>(emptyForm);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [searchByNfcScanning, setSearchByNfcScanning] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [nfcAssociatingId, setNfcAssociatingId] = useState<string | null>(null);
  const [nfcTagReassign, setNfcTagReassign] = useState<NfcReassignState | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (!approved) {
      supabase.auth.signOut();
      window.location.href = "/pending";
    }
  }, [user, approved, authLoading]);

  async function writeAuditLog(action: string, entityId: string | null, details: Record<string, unknown>) {
    try {
      await supabase.from("audit_log").insert({
        action,
        entity_type: "equipment_asset",
        entity_id: entityId,
        code: details.asset_code ?? null,
        warehouse: area,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        user_name: null,
        details_json: details,
      });
    } catch (error) {
      console.error("equipment audit error:", error);
    }
  }

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("equipment_assets")
      .select("*")
      .eq("equipment_area", area)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      setMsg("Errore caricamento attrezzature.");
    } else {
      setRows((data ?? []) as EquipmentAssetRow[]);
    }

    setLoading(false);
  }, [area]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadAssets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadAssets]);

  useEffect(() => {
    setIsNfcSupported(typeof NDEFReader !== "undefined");
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  useEffect(() => {
    if (modalOpen && notesTextareaRef.current) {
      const ta = notesTextareaRef.current;
      ta.style.height = "auto";
      ta.style.height = `${Math.max(40, ta.scrollHeight)}px`;
    }
  }, [modalOpen, form.notes]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const c = (row.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (categoryFilter && (row.category ?? "").trim() !== categoryFilter) return false;
      if (!search) return true;

      return [
        row.serial_number,
        row.name,
        row.category,
        row.assigned_to_name,
        row.assigned_to_badge,
        row.barcode,
        row.nfc_tag_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [q, rows, statusFilter, categoryFilter]);

  const stats = useMemo(() => {
    return EQUIPMENT_STATUS_OPTIONS.reduce<Record<EquipmentStatus, number>>(
      (acc, status) => {
        acc[status] = rows.filter((row) => row.status === status).length;
        return acc;
      },
      {
        AVAILABLE: 0,
        ASSIGNED: 0,
        MAINTENANCE: 0,
        DISMISSED: 0,
      }
    );
  }, [rows]);

  const searchMatches = useMemo(() => {
    const search = q.trim().toLowerCase();
    let base = rows;
    if (categoryFilter) base = base.filter((row) => (row.category ?? "").trim() === categoryFilter);
    if (!search) return base.slice(0, 12);
    return base
      .filter((row) =>
        [
          row.serial_number,
          row.name,
          row.category,
          row.assigned_to_name,
          row.assigned_to_badge,
          row.barcode,
          row.nfc_tag_id,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search))
      )
      .slice(0, 12);
  }, [q, rows, categoryFilter]);

  const searchActive = useMemo(() => searchMatches[searchActiveIndex] ?? null, [searchMatches, searchActiveIndex]);

  function applySearchResult(value: string, mode: "barcode" | "nfc") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    setQ(value.trim());
    const matched = rows.find((row) => {
      if (mode === "barcode") {
        return [row.barcode, row.serial_number, row.asset_code]
          .filter(Boolean)
          .some((item) => String(item).trim().toLowerCase() === normalized);
      }
      return String(row.nfc_tag_id ?? "").trim().toLowerCase() === normalized;
    });
    if (matched) {
      setQ(matched.serial_number || matched.asset_code);
      setSearchOpen(false);
      setMsg(`Attrezzatura trovata: ${matched.serial_number || matched.asset_code}`);
    } else {
      setMsg(mode === "barcode" ? "Nessuna attrezzatura trovata per questo barcode." : "Nessuna attrezzatura associata a questo tag NFC.");
    }
  }

  function pickSearchMatch(row: EquipmentAssetRow) {
    setQ(row.serial_number || row.asset_code);
    setSearchOpen(false);
    setMsg(null);
  }

  function stopCameraScan() {
    try {
      (readerRef.current as { reset?: () => void } | null)?.reset?.();
    } catch {}
    try {
      const video = videoRef.current;
      const stream = video?.srcObject as MediaStream | null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    } catch {}
    readerRef.current = null;
    setCameraScanning(false);
  }

  async function startCameraScanForSearch() {
    setMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg("La fotocamera richiede HTTPS. Usa npm run dev:https e accedi da https://TUO_IP:3000");
      return;
    }

    stopCameraScan();
    setCameraScanning(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    let videoEl = videoRef.current;
    for (let i = 0; i < 30 && !videoEl; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      videoEl = videoRef.current;
    }

    if (!videoEl) {
      setCameraScanning(false);
      setMsg("Video non disponibile. Riprova.");
      return;
    }

    try {
      readerRef.current = new BrowserMultiFormatReader();
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoEl);
      stopCameraScan();
      const text = String(result?.getText?.() ?? "").trim();
      if (text) applySearchResult(text, "barcode");
    } catch (error) {
      stopCameraScan();
      setMsg("Errore camera: " + (error instanceof Error ? error.message : "sconosciuto"));
    }
  }

  async function searchByNfc() {
    if (!isNfcSupported) {
      setMsg(isIOS ? "NFC non disponibile su iPhone/iPad." : "NFC richiede Chrome su Android con HTTPS.");
      return;
    }
    setSearchByNfcScanning(true);
    setMsg(null);
    try {
      const ndef = new NDEFReader();
      await ndef.scan();
      const serialNumber = await new Promise<string>((resolve, reject) => {
        const handler = (event: NDEFReadingEvent) => {
          ndef.removeEventListener("reading", handler);
          resolve(event.serialNumber ?? "");
        };
        ndef.addEventListener("reading", handler);
        setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
      });
      applySearchResult(serialNumber, "nfc");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Errore lettura NFC");
    } finally {
      setSearchByNfcScanning(false);
    }
  }

  async function saveNfcAssociation(row: EquipmentAssetRow, serialNumber: string) {
    await supabase.from("equipment_assets").update({ nfc_tag_id: null }).eq("nfc_tag_id", serialNumber);
    const { error } = await supabase
      .from("equipment_assets")
      .update({ nfc_tag_id: serialNumber })
      .eq("id", row.id)
      .eq("equipment_area", area);

    if (error) throw error;

    await writeAuditLog("EQUIPMENT_UPDATED", row.id, {
      asset_code: row.asset_code,
      serial_number: row.serial_number,
      equipment_area: row.equipment_area,
      nfc_tag_id: serialNumber,
      update_mode: "nfc_association",
    });
  }

  async function doAssociateNfc(row: EquipmentAssetRow, forceReassign = false, knownSerialNumber?: string) {
    if (!isNfcSupported) {
      setMsg(
        isIOS
          ? "NFC non disponibile su iPhone/iPad. Safari non supporta la scansione NFC."
          : "NFC richiede Chrome su Android con HTTPS. Da mobile via IP usa npm run dev:https, poi accedi da https://TUO_IP:3000"
      );
      return;
    }

    setNfcTagReassign(null);
    setNfcAssociatingId(row.id);
    setMsg("Avvicina il dispositivo al tag NFC...");

    try {
      const serialNumber = knownSerialNumber
        ? knownSerialNumber
        : await (async () => {
            const ndef = new NDEFReader();
            await ndef.scan();
            return await new Promise<string>((resolve, reject) => {
              const handler = (event: NDEFReadingEvent) => {
                ndef.removeEventListener("reading", handler);
                resolve(event.serialNumber ?? "");
              };
              ndef.addEventListener("reading", handler);
              setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
            });
          })();

      if (!serialNumber || serialNumber === "unknown") {
        setMsg("Impossibile leggere l'ID del tag. Riprova.");
        return;
      }

      const { data: existing } = await supabase
        .from("equipment_assets")
        .select("id,serial_number,asset_code,equipment_area")
        .eq("nfc_tag_id", serialNumber)
        .maybeSingle();

      if (existing && existing.id !== row.id && !forceReassign) {
        setNfcTagReassign({
          row,
          serialNumber,
          existingSerial: existing.serial_number || existing.asset_code,
          existingArea: existing.equipment_area as EquipmentArea,
        });
        setMsg(null);
        return;
      }

      await saveNfcAssociation(row, serialNumber);
      toast.success("NFC associato");
      setMsg("NFC associato ✅");
      await loadAssets();
    } catch (error) {
      console.error(error);
      setMsg(error instanceof Error ? error.message : "Errore associazione NFC");
    } finally {
      setNfcAssociatingId(null);
    }
  }

  useEffect(() => {
    setSearchActiveIndex(0);
  }, [q]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!searchBoxRef.current) return;
      if (!searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingRow(null);
    setForm(emptyForm);
    setMsg(null);
  }

  function openCreate() {
    setEditingRow(null);
    setForm(emptyForm);
    setMsg(null);
    setModalOpen(true);
  }

  function openEdit(row: EquipmentAssetRow) {
    setEditingRow(row);
    setForm({
      serial_number: row.serial_number ?? "",
      name: row.name ?? "",
      category: row.category ?? "",
      notes: row.notes ?? "",
    });
    setMsg(null);
    setModalOpen(true);
  }

  async function saveAsset() {
    if (!isAdmin) {
      setMsg("Solo gli admin possono modificare il registro attrezzature.");
      return;
    }

    const parsed = equipmentAssetSchema.safeParse(form);
    if (!parsed.success) {
      setMsg(parsed.error.issues[0]?.message ?? "Verifica i dati inseriti.");
      return;
    }

    setSaving(true);
    setMsg(null);

    const serial = form.serial_number.trim();
    const payload = {
      asset_code: serial,
      serial_number: serial,
      name: form.name.trim(),
      category: form.category.trim() || null,
      notes: form.notes.trim() || null,
      equipment_area: area,
    };

    const result = editingRow
      ? await supabase.from("equipment_assets").update(payload).eq("id", editingRow.id).eq("equipment_area", area).select("id").single()
      : await supabase.from("equipment_assets").insert(payload).select("id").single();

    if (result.error) {
      console.error(result.error);
      setMsg("Salvataggio non riuscito: " + result.error.message);
      setSaving(false);
      return;
    }

    const entityId = result.data?.id ?? editingRow?.id ?? null;
    await writeAuditLog(editingRow ? "EQUIPMENT_UPDATED" : "EQUIPMENT_CREATED", entityId, payload);
    toast.success(editingRow ? "Attrezzatura aggiornata" : "Attrezzatura creata");
    await loadAssets();
    setSaving(false);
    closeModal();
  }

  async function deleteAssetRow(row: EquipmentAssetRow) {
    if (!isAdmin) return;
    if (!window.confirm(`Eliminare l'attrezzatura ${row.serial_number || row.asset_code}?\n\nAnche lo storico collegato verrà rimosso.`)) return;

    const { error } = await supabase
      .from("equipment_assets")
      .delete()
      .eq("id", row.id)
      .eq("equipment_area", area);

    if (error) {
      console.error(error);
      setMsg("Eliminazione non riuscita: " + error.message);
      return;
    }

    await writeAuditLog("EQUIPMENT_DELETED", row.id, {
      asset_code: row.asset_code,
      equipment_area: row.equipment_area,
      name: row.name,
      serial_number: row.serial_number,
      status: row.status,
    });
    toast.success("Attrezzatura eliminata");
    await loadAssets();
    if (editingRow?.id === row.id) closeModal();
  }

  async function deleteAsset() {
    if (!editingRow) return;
    await deleteAssetRow(editingRow);
  }

  const areaLabel = EQUIPMENT_AREA_LABELS[area];

  if (authLoading || adminLoading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>Caricamento...</div>
      </main>
    );
  }

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Attrezzature {areaLabel} - Tutte le attrezzature</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="equipmentSectionHeader" style={{ marginBottom: 0 }}>
            <div>
              <div className="equipmentSectionTitle">Tutte le attrezzature {areaLabel}</div>
              <div className="equipmentSectionHint">
                Vista completa del magazzino con ricerca, filtri e gestione anagrafica tramite popup.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div className="equipmentAreaPill">Area fissa: {areaLabel}</div>
              {isAdmin && (
                <button className="btn btnPrimary" onClick={openCreate}>
                  Nuova attrezzatura
                </button>
              )}
            </div>
          </div>

          <div className="equipmentStatsGrid">
            {EQUIPMENT_STATUS_OPTIONS.map((status) => (
              <div key={status} className="equipmentStatCard">
                <div className="equipmentStatLabel">{EQUIPMENT_STATUS_LABELS[status]}</div>
                <div className="equipmentStatValue">{stats[status]}</div>
              </div>
            ))}
          </div>

          <div className="equipmentFilterGrid mobileGrid1">
            <div ref={searchBoxRef} style={{ minWidth: 0, position: "relative" }}>
              <label className="label" htmlFor={`all-equipment-search-${area}`}>Cerca</label>
              <input
                id={`all-equipment-search-${area}`}
                className="input"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (!searchOpen) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchActiveIndex((i) => Math.min(i + 1, searchMatches.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (searchActive) pickSearchMatch(searchActive);
                  } else if (e.key === "Escape") {
                    setSearchOpen(false);
                  }
                }}
                placeholder={`Cerca in ${areaLabel.toLowerCase()} per seriale, nome, assegnatario, barcode o NFC`}
                style={{ width: "100%" }}
              />
              {searchOpen && q.trim() && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: 6,
                    background: "#fff",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 12,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.12)",
                    overflow: "hidden",
                    zIndex: 50,
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                >
                  {searchMatches.length === 0 ? (
                    <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
                  ) : (
                    searchMatches.map((row, idx) => (
                      <div
                        key={row.id}
                        onMouseEnter={() => setSearchActiveIndex(idx)}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          pickSearchMatch(row);
                        }}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          background: idx === searchActiveIndex ? "#eef2ff" : "white",
                          borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                        }}
                      >
                        <div style={{ fontWeight: 900, color: "#0f172a" }}>{row.serial_number || row.asset_code}</div>
                        <div style={{ fontSize: 12, color: "#334155" }}>{row.name}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`all-equipment-category-${area}`}>Categoria</label>
              <select
                id={`all-equipment-category-${area}`}
                className="input"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Tutte le categorie</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`all-equipment-status-${area}`}>Stato</label>
              <select
                id={`all-equipment-status-${area}`}
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "ALL" | EquipmentStatus)}
              >
                <option value="ALL">Tutti gli stati</option>
                {EQUIPMENT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{EQUIPMENT_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
          </div>

          {msg && !modalOpen && <div className="equipmentInlineMessage">{msg}</div>}
          <div style={{ display: cameraScanning ? "block" : "none" }}>
            <video
              ref={videoRef}
              style={{ width: "100%", borderRadius: 12, background: "black" }}
              muted
              playsInline
            />
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
              Inquadra il barcode dell&apos;attrezzatura con la fotocamera.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="equipmentSectionHeader">
          <div>
            <div className="equipmentSectionTitle">Elenco completo {areaLabel}</div>
            <div className="equipmentSectionHint">{filtered.length} risultati visibili</div>
          </div>
        </div>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Seriale</th>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Note</th>
                <th>Stato</th>
                <th>Ubicazione</th>
                <th>Assegnata a</th>
                <th>Barcode</th>
                <th>NFC</th>
                <th>Ultimo aggiornamento</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11}>Nessuna attrezzatura trovata.</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={11}>Caricamento attrezzature...</td>
                </tr>
              )}
              {filtered.map((row) => {
                const location = [row.shelf, row.place].filter(Boolean).join(" · ") || "—";
                const assignedTo = [row.assigned_to_name, row.assigned_to_badge ? `Badge ${row.assigned_to_badge}` : null]
                  .filter(Boolean)
                  .join(" · ") || "—";

                return (
                  <tr key={row.id}>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{row.serial_number || row.asset_code}</strong>
                      </div>
                    </td>
                    <td>{row.name}</td>
                    <td>{row.category || "—"}</td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.notes ?? ""}>{row.notes || "—"}</td>
                    <td><span style={equipmentStatusStyle(row.status)}>{EQUIPMENT_STATUS_LABELS[row.status]}</span></td>
                    <td>{location}</td>
                    <td>{assignedTo}</td>
                    <td>{row.barcode || "Da generare"}</td>
                    <td>{row.nfc_tag_id || "Non associato"}</td>
                    <td>{fmtDateTime(row.updated_at)}</td>
                    <td>
                      <div className="equipmentActionGroup">
                        <Link href={`${basePath}/movimenti?asset=${row.id}`} className="btn">Movimenti</Link>
                        {isAdmin && (
                          <button
                            className="btn"
                            onClick={() => void doAssociateNfc(row)}
                            disabled={nfcAssociatingId === row.id}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <NfcIcon />
                            {nfcAssociatingId === row.id ? "NFC..." : row.nfc_tag_id ? "Riassegna NFC" : "Associa NFC"}
                          </button>
                        )}
                        {isAdmin && <button className="btn" onClick={() => openEdit(row)}>Modifica</button>}
                        {isAdmin && (
                          <button
                            className="btn"
                            onClick={() => void deleteAssetRow(row)}
                            style={{
                              borderColor: "rgba(239,68,68,0.5)",
                              background: "rgba(239,68,68,0.1)",
                              color: "#991b1b",
                            }}
                          >
                            Elimina
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div
          onMouseDown={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 999,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              background: "white",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.16)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              padding: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>
                {editingRow ? "Modifica attrezzatura" : "Nuova attrezzatura"} · <span style={{ opacity: 0.75 }}>{areaLabel}</span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                {isAdmin && editingRow && (
                  <button
                    className="btn"
                    style={{
                      borderColor: "rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.1)",
                      color: "#991b1b",
                    }}
                    disabled={saving}
                    onClick={deleteAsset}
                    title="Elimina attrezzatura"
                  >
                    Elimina
                  </button>
                )}

                <button className="btn" disabled={saving} onClick={closeModal}>
                  Chiudi
                </button>

                <button className="btn btnPrimary" disabled={saving} onClick={saveAsset}>
                  {saving ? "Salvataggio..." : "Salva"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              L&apos;attrezzatura restera vincolata in modo permanente all&apos;area {areaLabel}. Il seriale
              viene usato come identificativo principale; barcode e NFC si gestiscono dopo.
            </div>

            {msg && <div className="equipmentInlineMessage" style={{ marginTop: 12 }}>{msg}</div>}

            <div className="equipmentFormGrid mobileGrid1" style={{ marginTop: 12 }}>
              <div style={{ minWidth: 0 }}>
                <label className="label" htmlFor={`modal-asset-serial-${area}`}>Seriale / matricola</label>
                <input id={`modal-asset-serial-${area}`} className="input" value={form.serial_number} onChange={(e) => setForm((prev) => ({ ...prev, serial_number: e.target.value }))} placeholder="Obbligatorio" />
              </div>
              <div style={{ minWidth: 0 }}>
                <label className="label" htmlFor={`modal-asset-name-${area}`}>Nome attrezzatura</label>
                <input id={`modal-asset-name-${area}`} className="input" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Obbligatorio" />
              </div>
              <div style={{ minWidth: 0 }}>
                <label className="label" htmlFor={`modal-asset-category-${area}`}>Categoria / sottogruppo</label>
                <input id={`modal-asset-category-${area}`} className="input" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Es. Braghe 1500kg" />
              </div>
              <div style={{ minWidth: 0 }}>
                <label className="label" htmlFor={`modal-asset-notes-${area}`}>Note</label>
                <textarea
                  ref={notesTextareaRef}
                  id={`modal-asset-notes-${area}`}
                  className="input"
                  value={form.notes}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, notes: e.target.value }));
                    const ta = e.target;
                    ta.style.height = "auto";
                    ta.style.height = `${Math.max(40, ta.scrollHeight)}px`;
                  }}
                  onFocus={(e) => {
                    const ta = e.target;
                    ta.style.height = "auto";
                    ta.style.height = `${Math.max(40, ta.scrollHeight)}px`;
                  }}
                  rows={1}
                  style={{ resize: "none", overflow: "hidden", height: 40, minHeight: 40, width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {nfcTagReassign && (
        <div className="card" style={{ padding: 12, marginTop: 12, borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)" }}>
          <div className="equipmentSectionHeader">
            <div>
              <div className="equipmentSectionTitle">Tag NFC già associato</div>
              <div className="equipmentSectionHint">
                Il tag letto è già associato a ` {nfcTagReassign.existingSerial} ` nell&apos;area {EQUIPMENT_AREA_LABELS[nfcTagReassign.existingArea]}.
              </div>
            </div>
          </div>
          <div className="equipmentActionGroup">
            <button
              className="btn btnPrimary"
              onClick={() => void doAssociateNfc(nfcTagReassign.row, true, nfcTagReassign.serialNumber)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <NfcIcon />
              Conferma riassegnazione
            </button>
            <button className="btn" onClick={() => setNfcTagReassign(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
