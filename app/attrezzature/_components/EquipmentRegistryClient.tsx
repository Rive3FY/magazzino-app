"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useAuth } from "../../_lib/hooks/useAuth";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import { useToast } from "../../_lib/ToastContext";
import { fmtDateTime, toIsoEndOfDay, toIsoStartOfDay } from "../../_lib/utils";
import {
  EQUIPMENT_AREA_LABELS,
  buildEquipmentStatusUpdate,
  EQUIPMENT_MOVEMENT_LABELS,
  EQUIPMENT_MOVEMENT_STATUS_LABELS,
  EQUIPMENT_RESOLUTION_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_OPTIONS,
  equipmentMovementPillStyle,
  equipmentStatusStyle,
} from "../../_lib/equipment";
import EquipmentStatusManager from "./EquipmentStatusManager";
import ConfirmModal from "../../_components/ConfirmModal";
import type { EquipmentArea, EquipmentAssetRow, EquipmentMovementRow, EquipmentStatus } from "../../_lib/types";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

const supabase = createClient();

function BarcodeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2" y="6" width="2" height="12" />
      <rect x="6" y="6" width="1" height="12" />
      <rect x="9" y="6" width="2" height="12" />
      <rect x="13" y="6" width="1" height="12" />
      <rect x="16" y="6" width="2" height="12" />
      <rect x="20" y="6" width="2" height="12" />
    </svg>
  );
}

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

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "spin 1s linear infinite", transformOrigin: "center" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function ClearableInput(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  const { id, value, onChange, disabled, placeholder, style, onFocus, onKeyDown, type } = props;
  const showClear = !disabled && value.length > 0;

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        className="input"
        type={type ?? "text"}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        style={{
          ...style,
          paddingRight: showClear ? 36 : undefined,
        }}
      />
      {showClear && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Cancella"
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "transparent",
            color: "#64748b",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function ClearableSelect(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  clearValue?: string;
}) {
  const { id, value, onChange, disabled, children, clearValue = "" } = props;
  const showClear = !disabled && value !== clearValue;

  return (
    <div style={{ position: "relative" }}>
      <select
        id={id}
        className="input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingRight: showClear ? 36 : undefined }}
      >
        {children}
      </select>
      {showClear && (
        <button
          type="button"
          onClick={() => onChange(clearValue)}
          aria-label="Cancella"
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "transparent",
            color: "#64748b",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function EquipmentRegistryClient({ area, basePath }: Props) {
  const { user, loading: authLoading, approved } = useAuth();
  const access = useIsAdmin();
  const adminLoading = access.loading;
  const isAdmin = area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;
  const toast = useToast();

  const [rows, setRows] = useState<EquipmentAssetRow[]>([]);
  const [history, setHistory] = useState<EquipmentMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickSearch, setQuickSearch] = useState("");
  const [quickSelectedId, setQuickSelectedId] = useState("");
  const [quickCategoryFilter, setQuickCategoryFilter] = useState<string>("");
  const [quickWarehouseFilter, setQuickWarehouseFilter] = useState<string>("ALL");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickActiveIndex, setQuickActiveIndex] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [cameraScanning, setCameraScanning] = useState(false);
  const [searchByNfcScanning, setSearchByNfcScanning] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const quickBoxRef = useRef<HTMLDivElement | null>(null);

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

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    const [assetsRes, historyRes] = await Promise.all([
      supabase
        .from("equipment_assets")
        .select("*")
        .eq("equipment_area", area)
        .order("created_at", { ascending: false }),
      supabase
        .from("equipment_movements")
        .select("*")
        .eq("equipment_area", area)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (assetsRes.error) {
      console.error(assetsRes.error);
      setRows([]);
      setMsg("Errore caricamento attrezzature.");
    } else {
      setRows((assetsRes.data ?? []) as EquipmentAssetRow[]);
    }

    if (historyRes.error) {
      console.error(historyRes.error);
      setHistory([]);
      setMsg((prev) => prev ?? "Errore caricamento storico movimenti.");
    } else {
      setHistory((historyRes.data ?? []) as EquipmentMovementRow[]);
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

  async function changeAssetStatus(row: EquipmentAssetRow, newStatus: EquipmentStatus, maintenanceNote?: string) {
    if (!isAdmin) return;
    setStatusChanging(true);
    setMsg(null);
    const payload = buildEquipmentStatusUpdate(newStatus, maintenanceNote);
    const { error } = await supabase.from("equipment_assets").update(payload).eq("id", row.id).eq("equipment_area", area);
    setStatusChanging(false);
    if (error) {
      setMsg("Errore aggiornamento stato: " + error.message);
      return;
    }
    toast.success(`Stato aggiornato a ${EQUIPMENT_STATUS_LABELS[newStatus]}`);
    await loadAssets();
    setStatusModalOpen(false);
  }

  useEffect(() => {
    setIsNfcSupported(typeof NDEFReader !== "undefined");
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  const quickCategories = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const c = (row.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [rows]);

  const quickWarehouses = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const w = (row.warehouse ?? "").trim();
      if (w) set.add(w);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    let base = rows;
    if (quickCategoryFilter) base = base.filter((row) => (row.category ?? "").trim() === quickCategoryFilter);
    if (quickWarehouseFilter !== "ALL") base = base.filter((row) => (row.warehouse ?? "").trim() === quickWarehouseFilter);
    return base;
  }, [rows, quickCategoryFilter, quickWarehouseFilter]);

  const stats = useMemo(() => {
    return EQUIPMENT_STATUS_OPTIONS.reduce<Record<EquipmentStatus, number>>(
      (acc, status) => {
        acc[status] = filteredRows.filter((row) => row.status === status).length;
        return acc;
      },
      {
        AVAILABLE: 0,
        ASSIGNED: 0,
        MAINTENANCE: 0,
        DISMISSED: 0,
      }
    );
  }, [filteredRows]);

  const quickMatches = useMemo(() => {
    let base = filteredRows;
    const search = quickSearch.trim().toLowerCase();
    if (!search) return base.slice(0, 12);
    return base
      .filter((row) =>
        [
          row.serial_number,
          row.name,
          row.category,
          row.barcode,
          row.nfc_tag_id,
          row.assigned_to_name,
          row.assigned_to_badge,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search))
      )
      .slice(0, 12);
  }, [quickSearch, filteredRows]);

  const quickSelected = useMemo(() => {
    if (!quickSelectedId) return null;
    return rows.find((row) => row.id === quickSelectedId) ?? null;
  }, [quickSelectedId, rows]);

  const filteredAssetIds = useMemo(() => new Set(filteredRows.map((r) => r.id)), [filteredRows]);

  const quickActive = useMemo(() => quickMatches[quickActiveIndex] ?? null, [quickMatches, quickActiveIndex]);
  const historyGroupCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of history) {
      if (!row.movement_group_id) continue;
      counts.set(row.movement_group_id, (counts.get(row.movement_group_id) ?? 0) + 1);
    }
    return counts;
  }, [history]);
  const displayHistory = useMemo(() => {
    const fromIso = toIsoStartOfDay(historyFrom);
    const toIso = toIsoEndOfDay(historyTo);
    const seen = new Set<string>();
    return history.filter((row) => {
      if (quickWarehouseFilter !== "ALL" && !filteredAssetIds.has(row.equipment_id)) return false;
      if (fromIso && row.created_at < fromIso) return false;
      if (toIso && row.created_at > toIso) return false;
      const gid = row.movement_group_id;
      if (gid) {
        if (seen.has(gid)) return false;
        seen.add(gid);
      }
      return true;
    });
  }, [history, historyFrom, historyTo, quickWarehouseFilter, filteredAssetIds]);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<EquipmentMovementRow | null>(null);

  function openDeleteConfirm(row: EquipmentMovementRow) {
    if (!isAdmin) return;
    setDeleteConfirm(row);
  }

  async function executeDeleteMovement(row: EquipmentMovementRow) {
    setDeletingId(row.id);
    setMsg(null);

    try {
      if (row.movement_group_id) {
        const { error } = await supabase
          .from("equipment_movements")
          .delete()
          .eq("movement_group_id", row.movement_group_id)
          .eq("equipment_area", area);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("equipment_movements")
          .delete()
          .eq("id", row.id)
          .eq("equipment_area", area);
        if (error) throw error;
      }
      toast.success("Movimento eliminato");
      await loadAssets();
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMsg("Eliminazione non riuscita: " + (err?.message ?? "errore sconosciuto"));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    await executeDeleteMovement(deleteConfirm);
    setDeleteConfirm(null);
  }

  function applyQuickResult(value: string, mode: "barcode" | "nfc") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    setQuickSearch(value.trim());
    const matched = rows.find((row) => {
      if (mode === "barcode") {
        return [row.barcode, row.serial_number, row.asset_code]
          .filter(Boolean)
          .some((item) => String(item).trim().toLowerCase() === normalized);
      }
      return String(row.nfc_tag_id ?? "").trim().toLowerCase() === normalized;
    });
    setQuickSelectedId(matched?.id ?? "");
    setQuickOpen(false);
    if (!matched) {
      setMsg(mode === "barcode" ? "Nessuna attrezzatura trovata per questo barcode." : "Nessuna attrezzatura associata a questo tag NFC.");
    } else {
      setQuickSearch(`${matched.serial_number || matched.asset_code} - ${matched.name}`);
      setMsg(null);
    }
  }

  function pickQuickMatch(row: EquipmentAssetRow) {
    setQuickSelectedId(row.id);
    setQuickSearch(`${row.serial_number || row.asset_code} - ${row.name}`);
    setQuickOpen(false);
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

  async function startCameraScanForQuickSearch() {
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
      if (text) applyQuickResult(text, "barcode");
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
      applyQuickResult(serialNumber, "nfc");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Errore lettura NFC");
    } finally {
      setSearchByNfcScanning(false);
    }
  }

  function stopNfcScan() {
    setSearchByNfcScanning(false);
    setMsg(null);
  }

  useEffect(() => {
    setQuickActiveIndex(0);
  }, [quickSearch]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!quickBoxRef.current) return;
      if (!quickBoxRef.current.contains(e.target as Node)) setQuickOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

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
        <div className="pageBarTitle">Attrezzature {areaLabel} - Dashboard</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="equipmentSectionHeader" style={{ marginBottom: 0 }}>
            <div>
              <div className="equipmentSectionTitle">Panoramica {areaLabel}</div>
              <div className="equipmentSectionHint">
                Vista rapida del registro. Per inserimento, modifica e consultazione completa usa la pagina
                ` Tutte le attrezzature`.
              </div>
            </div>
            <div className="equipmentAreaPill">Area fissa: {areaLabel}</div>
          </div>

          <div className="equipmentStatsGrid">
            <div className="equipmentStatCard">
              <div className="equipmentStatLabel">Registrate</div>
              <div className="equipmentStatValue">{filteredRows.length}</div>
            </div>
            {EQUIPMENT_STATUS_OPTIONS.map((status) => (
              <div key={status} className="equipmentStatCard">
                <div className="equipmentStatLabel">{EQUIPMENT_STATUS_LABELS[status]}</div>
                <div className="equipmentStatValue">{stats[status]}</div>
              </div>
            ))}
          </div>

          <div className="equipmentFilterGrid mobileGrid1">
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`equipment-quick-category-${area}`}>Categoria</label>
              <ClearableSelect
                id={`equipment-quick-category-${area}`}
                value={quickCategoryFilter}
                onChange={setQuickCategoryFilter}
                clearValue=""
              >
                <option value="">Tutte</option>
                {quickCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </ClearableSelect>
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`equipment-quick-warehouse-${area}`}>Magazzino</label>
              <ClearableSelect
                id={`equipment-quick-warehouse-${area}`}
                value={quickWarehouseFilter}
                onChange={setQuickWarehouseFilter}
                clearValue="ALL"
              >
                <option value="ALL">Tutti</option>
                <option value="">Nessuno</option>
                {quickWarehouses.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </ClearableSelect>
            </div>
            <div ref={quickBoxRef} style={{ minWidth: 0, position: "relative" }}>
              <label className="label" htmlFor={`equipment-quick-search-${area}`}>
                Controllo veloce
              </label>
              <ClearableInput
                id={`equipment-quick-search-${area}`}
                value={quickSearch}
                placeholder={`Cerca per seriale, nome, barcode o NFC`}
                onChange={(v) => {
                  setQuickSearch(v);
                  setQuickSelectedId("");
                  setQuickOpen(v.length > 0);
                }}
                onFocus={() => setQuickOpen(true)}
                onKeyDown={(e) => {
                  if (!quickOpen) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setQuickActiveIndex((i) => Math.min(i + 1, quickMatches.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setQuickActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    setQuickOpen(false);
                  } else if (e.key === "Escape") {
                    setQuickOpen(false);
                  }
                }}
                style={{ width: "100%" }}
              />
              {quickOpen && quickSearch.trim() && (
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
                  }}
                >
                  {quickMatches.length === 0 ? (
                    <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
                  ) : (
                    quickMatches.map((row, idx) => (
                      <div
                        key={row.id}
                        onMouseEnter={() => setQuickActiveIndex(idx)}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          pickQuickMatch(row);
                        }}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          background: idx === quickActiveIndex ? "#eef2ff" : "white",
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
            <div style={{ minWidth: 0, display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={startCameraScanForQuickSearch} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <BarcodeIcon />
                Barcode
              </button>
              <button className="btn" onClick={searchByNfc} disabled={searchByNfcScanning} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <NfcIcon />
                {searchByNfcScanning ? "NFC..." : "NFC"}
              </button>
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`equipment-quick-pick-${area}`}>
                Attrezzatura
              </label>
              <ClearableSelect
                id={`equipment-quick-pick-${area}`}
                value={quickSelectedId}
                onChange={setQuickSelectedId}
                clearValue=""
              >
                <option value="">Seleziona risultato</option>
                {quickMatches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {(row.serial_number || row.asset_code) + " - " + row.name}
                  </option>
                ))}
              </ClearableSelect>
            </div>
          </div>

          {quickSelected && (
            <div className="equipmentInfoGrid">
              <div>
                <div className="equipmentInfoLabel">Seriale</div>
                <div className="equipmentInfoValue">{quickSelected.serial_number || quickSelected.asset_code}</div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Nome</div>
                <div className="equipmentInfoValue">{quickSelected.name}</div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Note / caratteristiche</div>
                <div className="equipmentInfoValue">{quickSelected.notes || "—"}</div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Stato</div>
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={equipmentStatusStyle(quickSelected.status)}>{EQUIPMENT_STATUS_LABELS[quickSelected.status]}</span>
                  {isAdmin && (
                    <button className="btn" onClick={() => setStatusModalOpen(true)} disabled={statusChanging}>
                      Gestisci stato
                    </button>
                  )}
                </div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Assegnata a</div>
                <div className="equipmentInfoValue">
                  {[quickSelected.assigned_to_name, quickSelected.assigned_to_badge ? `Badge ${quickSelected.assigned_to_badge}` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Scaffale</div>
                <div className="equipmentInfoValue">
                  {[quickSelected.shelf, quickSelected.place].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Identificativi</div>
                <div className="equipmentInfoValue">
                  {[
                    quickSelected.barcode ? `Barcode ${quickSelected.barcode}` : null,
                    quickSelected.nfc_tag_id ? `NFC ${quickSelected.nfc_tag_id}` : null,
                  ].filter(Boolean).join(" · ") || "Nessun identificativo"}
                </div>
              </div>
            </div>
          )}

          {msg && <div className="equipmentInlineMessage">{msg}</div>}
        </div>
      </div>

      {(cameraScanning || searchByNfcScanning) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 10050,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 14,
              padding: 24,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
            }}
          >
            {cameraScanning ? (
              <>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Scanner barcode</div>
                <div style={{ padding: 12, background: "#0f172a", borderRadius: 12, marginBottom: 12 }}>
                  <video ref={videoRef} style={{ width: "100%", maxWidth: 360, borderRadius: 8 }} muted playsInline />
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Inquadra il codice a barre</div>
                </div>
                <button type="button" className="btn" onClick={stopCameraScan}>
                  Fine
                </button>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Scanner NFC</div>
                <div style={{ padding: 24, background: "#0f172a", borderRadius: 12, marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <SpinnerIcon />
                  <div style={{ fontSize: 14, color: "#94a3b8" }}>Avvicina il telefono al tag NFC</div>
                </div>
                <button type="button" className="btn" onClick={stopNfcScan}>
                  Fine
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <EquipmentStatusManager
        asset={quickSelected}
        isOpen={!!quickSelected && statusModalOpen}
        isSaving={statusChanging}
        onClose={() => setStatusModalOpen(false)}
        onSubmit={(status, note) => quickSelected ? changeAssetStatus(quickSelected, status, note) : undefined}
      />

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="equipmentSectionHeader">
          <div>
            <div className="equipmentSectionTitle">Storico movimenti</div>
            <div className="equipmentSectionHint">
              Elenco completo dei movimenti dell&apos;area. Le righe aperte restano evidenziate.
            </div>
          </div>
        </div>

        <div
          className="mobileGrid1"
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr auto",
            gap: 10,
            alignItems: "end",
            marginTop: 10,
          }}
        >
          <div>
            <label className="label" htmlFor={`equipment-history-from-${area}`}>
              Data da
            </label>
            <ClearableInput
              id={`equipment-history-from-${area}`}
              type="date"
              value={historyFrom}
              onChange={setHistoryFrom}
            />
          </div>

          <div>
            <label className="label" htmlFor={`equipment-history-to-${area}`}>
              Data a
            </label>
            <ClearableInput
              id={`equipment-history-to-${area}`}
              type="date"
              value={historyTo}
              onChange={setHistoryTo}
            />
          </div>

          <button
            className="btn"
            onClick={() => {
              setHistoryFrom("");
              setHistoryTo("");
            }}
            type="button"
          >
            Reset
          </button>
        </div>

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Stato</th>
                <th>Tipo</th>
                <th>Attrezzatura</th>
                <th>Esito finale</th>
                <th>Note uscita</th>
                <th>Note chiusura</th>
                <th>Inserito da</th>
                {isAdmin && <th>Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8}>Caricamento...</td>
                </tr>
              ) : displayHistory.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8}>Nessun movimento disponibile.</td>
                </tr>
              ) : (
                displayHistory.map((row) => {
                  const asset = rows.find((item) => item.id === row.equipment_id);
                  const status = row.status ?? "OPEN";
                  const groupCount = row.movement_group_id ? (historyGroupCountMap.get(row.movement_group_id) ?? 1) : 1;
                  const busy = deletingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: status === "OPEN" ? "rgba(148,163,184,0.18)" : "transparent",
                      }}
                    >
                      <td>{fmtDateTime(row.created_at)}</td>
                      <td>
                        <span
                          className={status === "OPEN" ? "openStripe" : ""}
                          style={
                            status === "OPEN"
                              ? (() => {
                                  const s = equipmentMovementPillStyle(status);
                                  const { background, ...rest } = s;
                                  return rest;
                                })()
                              : equipmentMovementPillStyle(status)
                          }
                        >
                          {EQUIPMENT_MOVEMENT_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td><span style={equipmentMovementPillStyle("OUT")}>{EQUIPMENT_MOVEMENT_LABELS.OUT}</span></td>
                      <td style={{ fontWeight: 900 }}>
                        {groupCount > 1
                          ? `Prelievo multiplo (${groupCount} attrezzature)`
                          : asset
                            ? `${asset.serial_number || asset.asset_code} - ${asset.name}`
                            : row.equipment_id}
                      </td>
                      <td>{row.resolution_type ? EQUIPMENT_RESOLUTION_LABELS[row.resolution_type] : "—"}</td>
                      <td>{row.note || "—"}</td>
                      <td>{row.close_note || "—"}</td>
                      <td>{row.created_by_name || row.created_by_email || "—"}</td>
                      {isAdmin && (
                        <td>
                          <button
                            className="btn"
                            disabled={busy}
                            onClick={() => openDeleteConfirm(row)}
                            style={{
                              borderColor: "rgba(239,68,68,0.5)",
                              background: "rgba(239,68,68,0.1)",
                              color: "#991b1b",
                            }}
                          >
                            {busy ? "Eliminazione..." : "Elimina"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirm && (
        <ConfirmModal
          open={!!deleteConfirm}
          title="Eliminare movimento"
          message={
            (() => {
              const asset = rows.find((r) => r.id === deleteConfirm.equipment_id);
              const groupCount = deleteConfirm.movement_group_id ? (historyGroupCountMap.get(deleteConfirm.movement_group_id) ?? 1) : 1;
              const label =
                groupCount > 1
                  ? `Prelievo multiplo (${groupCount} attrezzature)`
                  : asset
                    ? `${asset.serial_number || asset.asset_code} - ${asset.name}`
                    : deleteConfirm.equipment_id;
              return `Eliminare il movimento "${label}"?\n\nLe attrezzature coinvolte torneranno disponibili.`;
            })()
          }
          confirmLabel="Elimina"
          cancelLabel="Annulla"
          danger
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </main>
  );
}
