"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { notifyEquipmentSync, subscribeEquipmentSync } from "../../_lib/equipmentSync";
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
import { applyEquipmentMaintenanceReintegration } from "../../_lib/equipmentMaintenanceReintegration";
import { buildEquipmentPickupPdfSheet, downloadEquipmentPickupPdf } from "../../_lib/equipment-pickup-pdf";
import EquipmentStatusManager from "./EquipmentStatusManager";
import AppScanStatusModal, { waitScanResolveFeedback } from "../../_components/AppScanStatusModal";
import AppModalFrame from "../../_components/AppModalFrame";
import ConfirmModal from "../../_components/ConfirmModal";
import { scanFastBarcode, stopFastBarcodeScan, type FastBarcodeReader } from "../../_lib/fastBarcodeScanner";
import { matchesMaterialSearch } from "../../_lib/materialSearch";
import type { EquipmentArea, EquipmentAssetRow, EquipmentMovementRow, EquipmentStatus } from "../../_lib/types";
import AppSpinner, { AppLoading } from "../../_components/AppSpinner";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

type NfcCategoryTagRow = {
  nfc_tag_id: string;
  category: string;
};

const supabase = createClient();

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <path d="M15 15h2v2h-2z" />
      <path d="M19 15h2v6h-6v-2" />
      <path d="M13 13h2" />
      <path d="M13 19h2" />
    </svg>
  );
}

function StatusSemaforoIcon({ status }: { status: EquipmentStatus }) {
  const color = status === "AVAILABLE" ? "#22c55e" : status === "MAINTENANCE" ? "#f59e0b" : "#ef4444";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill={color} />
    </svg>
  );
}

function PlusMinusIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14" style={{ opacity: open ? 0 : 1, transition: "opacity .15s ease" }} />
      <path d="M5 12h14" />
    </svg>
  );
}

function SpinnerIcon() {
  return <AppSpinner size={18} />;
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
  const [nfcCategoryTags, setNfcCategoryTags] = useState<NfcCategoryTagRow[]>([]);
  const [quickWarehouseFilter, setQuickWarehouseFilter] = useState<string>("ALL");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickActiveIndex, setQuickActiveIndex] = useState(0);
  const [categoryResultsName, setCategoryResultsName] = useState<string | null>(null);
  const [suggestionsBox, setSuggestionsBox] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [scanResolving, setScanResolving] = useState(false);
  const [searchByNfcScanning, setSearchByNfcScanning] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pickupPdfBusy, setPickupPdfBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<FastBarcodeReader | null>(null);
  const quickBoxRef = useRef<HTMLDivElement | null>(null);

  const updateSuggestionsBox = useCallback(() => {
    if (!quickBoxRef.current || typeof window === "undefined") return;
    const rect = quickBoxRef.current.getBoundingClientRect();
    const top = rect.bottom + 6;
    const maxHeight = Math.max(160, Math.min(280, window.innerHeight - top - 12));
    setSuggestionsBox({
      left: rect.left,
      top,
      width: rect.width,
      maxHeight,
    });
  }, []);

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

    const [assetsRes, historyRes, nfcCategoryTagsRes] = await Promise.all([
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
      supabase.from("equipment_nfc_category_tags").select("nfc_tag_id,category").eq("equipment_area", area),
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

    if (nfcCategoryTagsRes.error) {
      console.error("equipment_nfc_category_tags:", nfcCategoryTagsRes.error);
      setNfcCategoryTags([]);
    } else {
      setNfcCategoryTags((nfcCategoryTagsRes.data ?? []) as NfcCategoryTagRow[]);
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
    if (!user) return;
    const channel = supabase
      .channel(`equipment-registry-${area}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipment_movements", filter: `equipment_area=eq.${area}` },
        () => void loadAssets()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipment_assets", filter: `equipment_area=eq.${area}` },
        () => void loadAssets()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, area, loadAssets]);

  useEffect(() => {
    if (!user) return;
    return subscribeEquipmentSync(area, () => void loadAssets());
  }, [user, area, loadAssets]);

  async function changeAssetStatus(row: EquipmentAssetRow, newStatus: EquipmentStatus, maintenanceNote?: string) {
    if (!isAdmin) return;
    setStatusChanging(true);
    setMsg(null);

    const { data: openMovement, error: openMovementError } = await supabase
      .from("equipment_movements")
      .select("id")
      .eq("equipment_id", row.id)
      .eq("equipment_area", area)
      .eq("status", "OPEN")
      .limit(1)
      .maybeSingle();

    if (openMovementError) {
      setStatusChanging(false);
      setMsg("Errore verifica movimenti aperti: " + openMovementError.message);
      return;
    }

    if (openMovement && newStatus !== "ASSIGNED") {
      setStatusChanging(false);
      setMsg("Non puoi cambiare manualmente questo stato: l'attrezzatura ha un movimento aperto.");
      return;
    }

    if (row.status === "MAINTENANCE" && newStatus === "AVAILABLE") {
      try {
        await applyEquipmentMaintenanceReintegration(supabase, {
          equipmentId: row.id,
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
          userDisplayName: null,
        });
      } catch (e: unknown) {
        setStatusChanging(false);
        setMsg(e instanceof Error ? e.message : "Reintegro non riuscito.");
        return;
      }
      setStatusChanging(false);
      toast.success(`Stato aggiornato a ${EQUIPMENT_STATUS_LABELS[newStatus]}`);
      notifyEquipmentSync(area, "registry-status-change");
      await loadAssets();
      setStatusModalOpen(false);
      return;
    }

    const payload = buildEquipmentStatusUpdate(newStatus, maintenanceNote);
    const { data: updatedAsset, error } = await supabase
      .from("equipment_assets")
      .update(payload as never)
      .eq("id", row.id)
      .select("id, status")
      .maybeSingle();
    setStatusChanging(false);
    if (error) {
      setMsg("Errore aggiornamento stato: " + error.message);
      return;
    }
    if (!updatedAsset) {
      setMsg("Nessuna riga aggiornata. Verifica permessi o che l'attrezzatura esista ancora.");
      return;
    }
    toast.success(`Stato aggiornato a ${EQUIPMENT_STATUS_LABELS[newStatus]}`);
    notifyEquipmentSync(area, "registry-status-change");
    await loadAssets();
    setStatusModalOpen(false);
  }

  useEffect(() => {
    setIsNfcSupported(typeof NDEFReader !== "undefined");
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  const quickWarehouses = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const w = (row.warehouse ?? "").trim();
      if (w) set.add(w);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (quickWarehouseFilter === "ALL") return rows;
    return rows.filter((row) => (row.warehouse ?? "").trim() === quickWarehouseFilter);
  }, [rows, quickWarehouseFilter]);

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
    const base = filteredRows;
    const search = quickSearch.trim();
    if (!search) return base;
    return base.filter((row) =>
      matchesMaterialSearch(
        search,
        row.serial_number,
        row.asset_code,
        row.name,
        row.category,
        row.assigned_to_name,
        row.assigned_to_badge
      )
    );
  }, [quickSearch, filteredRows]);

  const categorySuggestions = useMemo(() => {
    const search = quickSearch.trim();
    if (!search) return [] as Array<{ category: string; count: number }>;
    const counts = new Map<string, number>();
    for (const row of filteredRows) {
      const category = (row.category ?? "").trim();
      if (!category || !matchesMaterialSearch(search, category)) continue;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    const query = search.toLowerCase();
    return Array.from(counts.entries())
      .sort((a, b) => {
        const aExact = a[0].toLowerCase() === query ? 0 : 1;
        const bExact = b[0].toLowerCase() === query ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a[0].localeCompare(b[0], "it");
      })
      .map(([category, count]) => ({ category, count }));
  }, [quickSearch, filteredRows]);

  const quickSuggestions = useMemo(() => {
    return [
      ...categorySuggestions.map((item) => ({ kind: "category" as const, ...item })),
      ...quickMatches.map((row) => ({ kind: "asset" as const, row })),
    ];
  }, [categorySuggestions, quickMatches]);

  const quickSelected = useMemo(() => {
    if (!quickSelectedId) return null;
    return rows.find((row) => row.id === quickSelectedId) ?? null;
  }, [quickSelectedId, rows]);

  const filteredAssetIds = useMemo(() => new Set(filteredRows.map((r) => r.id)), [filteredRows]);

  const quickActive = useMemo(() => quickSuggestions[quickActiveIndex] ?? null, [quickSuggestions, quickActiveIndex]);
  const categoryResultsRows = useMemo(() => {
    if (!categoryResultsName) return [];
    return filteredRows.filter((row) => (row.category ?? "").trim() === categoryResultsName);
  }, [categoryResultsName, filteredRows]);
  const historyGroupCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of history) {
      if (!row.movement_group_id) continue;
      counts.set(row.movement_group_id, (counts.get(row.movement_group_id) ?? 0) + 1);
    }
    return counts;
  }, [history]);
  const historyGroupSummaryMap = useMemo(() => {
    const summaries = new Map<string, { total: number; closed: number; open: number; latestClosedAt: string | null }>();
    for (const row of history) {
      if (!row.movement_group_id) continue;
      const current = summaries.get(row.movement_group_id) ?? {
        total: 0,
        closed: 0,
        open: 0,
        latestClosedAt: null,
      };
      current.total += 1;
      if ((row.status ?? "OPEN") === "CLOSED") {
        current.closed += 1;
        if (row.closed_at && (!current.latestClosedAt || row.closed_at > current.latestClosedAt)) {
          current.latestClosedAt = row.closed_at;
        }
      } else {
        current.open += 1;
      }
      summaries.set(row.movement_group_id, current);
    }
    return summaries;
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

  const [historyDetail, setHistoryDetail] = useState<EquipmentMovementRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<EquipmentMovementRow | null>(null);

  const historyDetailGroup = useMemo(() => {
    if (!historyDetail) return [];
    if (!historyDetail.movement_group_id) return [historyDetail];
    return history
      .filter((row) => row.movement_group_id === historyDetail.movement_group_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [history, historyDetail]);
  const historyDetailGroupSummary = useMemo(() => {
    const closedRows = historyDetailGroup.filter((row) => (row.status ?? "OPEN") === "CLOSED");
    const latestClosedAt = closedRows
      .map((row) => row.closed_at)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null;
    return {
      total: historyDetailGroup.length,
      closed: closedRows.length,
      open: historyDetailGroup.length - closedRows.length,
      latestClosedAt,
    };
  }, [historyDetailGroup]);
  const historyDetailStatus = historyDetailGroupSummary.open > 0 ? "OPEN" : "CLOSED";

  async function downloadHistoryPickupPdf() {
    if (!historyDetail || historyDetailGroup.length === 0 || pickupPdfBusy) return;
    setPickupPdfBusy(true);
    setMsg(null);
    try {
      const sheet = buildEquipmentPickupPdfSheet(historyDetailGroup, rows);
      await downloadEquipmentPickupPdf(sheet);
      toast.success("Registro PDF scaricato");
    } catch (error) {
      console.error("equipment history PDF error:", error);
      setMsg("Download registro PDF non riuscito.");
    } finally {
      setPickupPdfBusy(false);
    }
  }

  function renderHistoryEquipmentCards(movements: EquipmentMovementRow[]) {
    return movements.map((movement) => {
      const asset = rows.find((item) => item.id === movement.equipment_id);
      const fallbackName = String(movement.details_json?.asset_name ?? "").trim();
      const fallbackCode = String(movement.details_json?.asset_code ?? "").trim();
      return (
        <div
          key={movement.id}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <div style={{ fontWeight: 900 }}>
            {asset
              ? `${asset.serial_number || asset.asset_code} - ${asset.name}`
              : `${fallbackCode || movement.equipment_id}${fallbackName ? ` - ${fallbackName}` : ""}`}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#334155" }}>
            {[
              asset?.warehouse || null,
              asset?.category || null,
              [asset?.shelf, asset?.place].filter(Boolean).join(" · ") || null,
            ]
              .filter(Boolean)
              .join(" · ") || "Nessun dettaglio aggiuntivo"}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
            Seriale: {asset?.serial_number || asset?.asset_code || fallbackCode || "—"}
          </div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid #e2e8f0",
              display: "grid",
              gap: 4,
              fontSize: 12,
              color: "#334155",
            }}
          >
            <div><b>Stato:</b> {EQUIPMENT_MOVEMENT_STATUS_LABELS[movement.status ?? "OPEN"]}</div>
            <div>
              <b>Esito:</b>{" "}
              {movement.resolution_type ? EQUIPMENT_RESOLUTION_LABELS[movement.resolution_type] : "—"}
            </div>
            <div><b>Data rientro:</b> {movement.closed_at ? fmtDateTime(movement.closed_at) : "Ancora fuori"}</div>
            <div><b>Nota rientro:</b> {movement.close_note || "—"}</div>
          </div>
        </div>
      );
    });
  }

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
      notifyEquipmentSync(area, "registry-delete-movement");
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

  function openCategoryResults(category: string) {
    const normalizedCategory = category.trim();
    if (!normalizedCategory) return;
    setCategoryResultsName(normalizedCategory);
    setQuickSearch(normalizedCategory);
    setQuickSelectedId("");
    setQuickOpen(false);
    setMsg(null);
  }

  function applyQuickCategoryTag(category: string) {
    openCategoryResults(category);
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
    if (matched) {
      setQuickSelectedId(matched.id);
      setQuickOpen(false);
      setQuickSearch(`${matched.serial_number || matched.asset_code} - ${matched.name}`);
      setMsg(null);
      return;
    }
    if (mode === "nfc") {
      const categoryTag = nfcCategoryTags.find((row) => String(row.nfc_tag_id ?? "").trim().toLowerCase() === normalized);
      if (categoryTag) {
        applyQuickCategoryTag(categoryTag.category);
        return;
      }
    }
    setQuickSelectedId("");
    setQuickOpen(false);
      setMsg(mode === "barcode" ? "Nessuna attrezzatura trovata per questo QR." : "Nessuna attrezzatura o sottogruppo associato a questo tag NFC.");
  }

  function pickQuickMatch(row: EquipmentAssetRow) {
    setQuickSelectedId(row.id);
    setQuickSearch(`${row.serial_number || row.asset_code} - ${row.name}`);
    setQuickOpen(false);
    setMsg(null);
  }

  function stopCameraScan() {
    stopFastBarcodeScan(videoRef.current, readerRef.current);
    readerRef.current = null;
    setCameraScanning(false);
    setScanResolving(false);
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
      const text = await scanFastBarcode(videoEl, {
        onReader: (reader) => {
          readerRef.current = reader;
        },
      });
      stopFastBarcodeScan(videoEl, readerRef.current);
      readerRef.current = null;
      setScanResolving(true);
      const startedAt = Date.now();
      try {
        if (text) applyQuickResult(text, "barcode");
        await waitScanResolveFeedback(startedAt);
      } finally {
        setCameraScanning(false);
        setScanResolving(false);
      }
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
      const target = e.target as Node;
      if (quickBoxRef.current && !quickBoxRef.current.contains(target)) setQuickOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    if (!quickOpen || !quickSearch.trim()) {
      setSuggestionsBox(null);
      return;
    }
    updateSuggestionsBox();
    window.addEventListener("resize", updateSuggestionsBox);
    window.addEventListener("scroll", updateSuggestionsBox, true);
    return () => {
      window.removeEventListener("resize", updateSuggestionsBox);
      window.removeEventListener("scroll", updateSuggestionsBox, true);
    };
  }, [quickOpen, quickSearch, quickSuggestions.length, updateSuggestionsBox]);

  const areaLabel = EQUIPMENT_AREA_LABELS[area];

  if (authLoading || adminLoading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel}</div>
        </div>
        <div className="card" style={{ padding: 12 }}><AppLoading align="start" /></div>
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
            {EQUIPMENT_STATUS_OPTIONS.filter((status) => status !== "DISMISSED").map((status) => (
              <div key={status} className="equipmentStatCard">
                <div className="equipmentStatLabel">{EQUIPMENT_STATUS_LABELS[status]}</div>
                <div className="equipmentStatValue">{stats[status]}</div>
              </div>
            ))}
          </div>

          <div className="equipmentFilterGrid mobileGrid1" style={{ gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr)" }}>
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
              <label className="label" htmlFor={`equipment-quick-search-${area}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <SearchIcon />
                Ricerca manuale
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                <ClearableInput
                  id={`equipment-quick-search-${area}`}
                  value={quickSearch}
                  placeholder="Seriale, nome o categoria..."
                  onChange={(v) => {
                    setQuickSearch(v);
                    setQuickSelectedId("");
                    setQuickOpen(v.length > 0);
                    setMsg(null);
                  }}
                  onFocus={() => setQuickOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (quickActive?.kind === "category") openCategoryResults(quickActive.category);
                      else if (quickActive?.kind === "asset") pickQuickMatch(quickActive.row);
                      return;
                    }
                    if (!quickOpen) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setQuickActiveIndex((i) => Math.min(i + 1, quickSuggestions.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setQuickActiveIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === "Escape") {
                      setQuickOpen(false);
                    }
                  }}
                  style={{ width: "100%" }}
                />
                </div>
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={() => void startCameraScanForQuickSearch()}
                  title="Scansiona QR attrezzatura"
                  aria-label="Scansiona QR attrezzatura"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 46, paddingInline: 12 }}
                >
                  <QrIcon />
                </button>
              </div>
              {quickOpen && quickSearch.trim() && suggestionsBox && (
                <div
                  style={{
                    position: "fixed",
                    left: suggestionsBox.left,
                    top: suggestionsBox.top,
                    width: suggestionsBox.width,
                    background: "rgba(255,255,255,0.98)",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 14,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.20)",
                    overflow: "hidden",
                    zIndex: 10060,
                  }}
                >
                  {quickSuggestions.length === 0 ? (
                    <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
                  ) : (
                    <>
                      <div style={{ maxHeight: suggestionsBox.maxHeight, overflowY: "auto", overscrollBehavior: "contain" }}>
                      {quickSuggestions.map((item, idx) => (
                        <div
                          key={item.kind === "category" ? `cat-${item.category}` : item.row.id}
                          ref={idx === quickActiveIndex ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                          onMouseEnter={() => setQuickActiveIndex(idx)}
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            if (item.kind === "category") openCategoryResults(item.category);
                            else pickQuickMatch(item.row);
                          }}
                          style={{
                            padding: "10px 12px",
                            cursor: "pointer",
                            background: idx === quickActiveIndex ? "#eef2ff" : "white",
                            borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          {item.kind === "category" ? (
                            <>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 900, color: "#1d4ed8" }}>Categoria · {item.category}</div>
                                <div style={{ fontSize: 12, color: "#334155" }}>{item.count} attrezzature</div>
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.8, color: "#1d4ed8", flexShrink: 0 }}>
                                ↵ apri elenco
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                <span title={EQUIPMENT_STATUS_LABELS[item.row.status]} style={{ flexShrink: 0, display: "flex", filter: `drop-shadow(0 0 5px ${item.row.status === "AVAILABLE" ? "#22c55e" : item.row.status === "MAINTENANCE" ? "#f59e0b" : "#ef4444"})` }}>
                                  <StatusSemaforoIcon status={item.row.status} />
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 900, color: "#0f172a" }}>{item.row.serial_number || item.row.asset_code}</div>
                                  <div style={{ fontSize: 12, color: "#334155" }}>{item.row.name}</div>
                                </div>
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.8, color: "#0f172a", flexShrink: 0 }}>
                                ↵ seleziona
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      </div>
                    </>
                  )}
                </div>
              )}
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
                <div className="equipmentInfoLabel">Identificativo</div>
                <div className="equipmentInfoValue">
                  {quickSelected.serial_number || quickSelected.asset_code || "—"}
                </div>
              </div>
            </div>
          )}

          {msg && <div className="equipmentInlineMessage">{msg}</div>}
        </div>
      </div>

      <AppScanStatusModal
        open={cameraScanning}
        mode="barcode"
        phase={scanResolving ? "resolving" : "scanning"}
        videoRef={videoRef}
        icon={<SpinnerIcon />}
        onClose={stopCameraScan}
        barcodeTitle="Scanner QR"
        barcodeHint="Inquadra il QR code"
        resolvingHint="Apertura attrezzatura..."
      />

      <EquipmentStatusManager
        asset={quickSelected}
        isOpen={!!quickSelected && statusModalOpen}
        isSaving={statusChanging}
        onClose={() => setStatusModalOpen(false)}
        onSubmit={(status, note) => quickSelected ? changeAssetStatus(quickSelected, status, note) : undefined}
      />

      <AppModalFrame
        open={!!categoryResultsName}
        title={categoryResultsName ? `Categoria · ${categoryResultsName}` : "Categoria"}
        subtitle={`${categoryResultsRows.length} attrezzature trovate con questo filtro`}
        onClose={() => setCategoryResultsName(null)}
        width="min(760px, calc(100vw - 24px))"
        headerRight={
          <button className="btn" type="button" onClick={() => setCategoryResultsName(null)}>
            Chiudi
          </button>
        }
      >
        {categoryResultsRows.length === 0 ? (
          <div style={{ padding: 16, color: "#64748b" }}>Nessuna attrezzatura in questa categoria.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {categoryResultsRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  pickQuickMatch(row);
                  setCategoryResultsName(null);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "1px solid rgba(15,23,42,0.10)",
                  background: "#fff",
                  borderRadius: 12,
                  padding: "12px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span title={EQUIPMENT_STATUS_LABELS[row.status]} style={{ flexShrink: 0, display: "flex", filter: `drop-shadow(0 0 5px ${row.status === "AVAILABLE" ? "#22c55e" : row.status === "MAINTENANCE" ? "#f59e0b" : "#ef4444"})` }}>
                  <StatusSemaforoIcon status={row.status} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 900, color: "#0f172a" }}>{row.serial_number || row.asset_code}</span>
                  <span style={{ display: "block", fontSize: 13, color: "#334155", marginTop: 2 }}>{row.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {[row.warehouse, EQUIPMENT_STATUS_LABELS[row.status]].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </AppModalFrame>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
            color: "inherit",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="equipmentSectionTitle">Storico movimenti</div>
            <div className="equipmentSectionHint" style={{ overflow: "visible", whiteSpace: "normal" }}>
              {historyOpen
                ? "Elenco completo dei movimenti dell'area. Le righe aperte restano evidenziate."
                : "Clicca per aprire lo storico movimenti."}
            </div>
          </div>
          <span
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.12)",
              background: historyOpen ? "rgba(15,23,42,0.06)" : "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <PlusMinusIcon open={historyOpen} />
          </span>
        </button>

        {historyOpen && (
        <>
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
                  <td colSpan={isAdmin ? 9 : 8}><AppLoading align="start" size={18} /></td>
                </tr>
              ) : displayHistory.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8}>Nessun movimento disponibile.</td>
                </tr>
              ) : (
                displayHistory.map((row) => {
                  const asset = rows.find((item) => item.id === row.equipment_id);
                  const groupCount = row.movement_group_id ? (historyGroupCountMap.get(row.movement_group_id) ?? 1) : 1;
                  const groupSummary = row.movement_group_id ? historyGroupSummaryMap.get(row.movement_group_id) : null;
                  const status = groupSummary ? (groupSummary.open > 0 ? "OPEN" : "CLOSED") : (row.status ?? "OPEN");
                  const busy = deletingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: status === "OPEN" ? "rgba(148,163,184,0.18)" : "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => setHistoryDetail(row)}
                      title="Tocca per vedere il dettaglio completo"
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
                          ? `Prelievo multiplo (${groupCount} attrezzature) · ${groupSummary?.closed ?? 0} rientrate · ${groupSummary?.open ?? groupCount} fuori`
                          : asset
                            ? `${asset.serial_number || asset.asset_code} - ${asset.name}`
                            : row.equipment_id}
                      </td>
                      <td>
                        {groupCount > 1
                          ? groupSummary?.open
                            ? "Rientro parziale"
                            : "Rientro completato"
                          : row.resolution_type
                            ? EQUIPMENT_RESOLUTION_LABELS[row.resolution_type]
                            : "—"}
                      </td>
                      <td>{row.note || "—"}</td>
                      <td>{groupCount > 1 ? "Vedi dettaglio" : row.close_note || "—"}</td>
                      <td>{row.created_by_name || row.created_by_email || "—"}</td>
                      {isAdmin && (
                        <td onClick={(e) => e.stopPropagation()}>
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
        </>
        )}
      </div>

      {historyDetail && (
        <div
          onMouseDown={() => setHistoryDetail(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 10050,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(1120px, 100%)",
              maxHeight: "88vh",
              background: "white",
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.16)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 4, background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)" }} />

            <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#2563eb" }}>
                    {historyDetailGroup.length > 1 ? `Dettaglio prelievo multiplo (${historyDetailGroup.length} attrezzature)` : "Dettaglio movimento"}
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                    Area {areaLabel}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    onClick={downloadHistoryPickupPdf}
                    disabled={pickupPdfBusy}
                  >
                    {pickupPdfBusy ? "Generazione PDF..." : "Scarica registro PDF"}
                  </button>
                  <button type="button" className="btn" onClick={() => setHistoryDetail(null)}>
                    Chiudi
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>Scheda movimento</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={equipmentMovementPillStyle(historyDetailStatus)}>
                    {EQUIPMENT_MOVEMENT_STATUS_LABELS[historyDetailStatus]}
                  </span>
                  <span style={equipmentMovementPillStyle("OUT")}>{EQUIPMENT_MOVEMENT_LABELS.OUT}</span>
                </div>
              </div>
            </div>

            <div
              className="mobileGrid1"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 14,
                padding: 18,
                background: "#f8fafc",
                maxHeight: "calc(88vh - 150px)",
                overflow: "auto",
              }}
            >
              <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                <div
                  style={{
                    padding: "9px 12px",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#1d4ed8",
                    background: "rgba(59,130,246,0.12)",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Dati movimento
                </div>
                <div
                  style={{
                    padding: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Data inserimento</div>
                    <div style={{ fontWeight: 800 }}>{fmtDateTime(historyDetail.created_at)}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Inserito da</div>
                    <div style={{ fontWeight: 800 }}>{historyDetail.created_by_name || historyDetail.created_by_email || "—"}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Stato</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={equipmentMovementPillStyle(historyDetailStatus)}>
                        {EQUIPMENT_MOVEMENT_STATUS_LABELS[historyDetailStatus]}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Tipo</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={equipmentMovementPillStyle("OUT")}>{EQUIPMENT_MOVEMENT_LABELS.OUT}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                <div
                  style={{
                    padding: "9px 12px",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#1d4ed8",
                    background: "rgba(59,130,246,0.12)",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Assegnazione
                </div>
                <div
                  style={{
                    padding: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Assegnatario</div>
                    <div style={{ fontWeight: 800 }}>
                      {[historyDetail.assigned_to_name, historyDetail.assigned_to_badge ? `Badge ${historyDetail.assigned_to_badge}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                    {historyDetail.assigned_to_email && (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{historyDetail.assigned_to_email}</div>
                    )}
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Destinazione</div>
                    <div style={{ fontWeight: 800 }}>{historyDetail.destination || "—"}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Piano d&apos;intervento</div>
                    <div style={{ fontWeight: 800 }}>{historyDetail.intervention_plan_number || "—"}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Esito finale</div>
                    <div style={{ fontWeight: 800 }}>
                      {historyDetailGroup.length > 1
                        ? historyDetailGroupSummary.open > 0
                          ? `${historyDetailGroupSummary.closed}/${historyDetailGroupSummary.total} rientrate`
                          : `Rientro completato (${historyDetailGroupSummary.total}/${historyDetailGroupSummary.total})`
                        : historyDetail.resolution_type
                          ? EQUIPMENT_RESOLUTION_LABELS[historyDetail.resolution_type]
                          : "—"}
                    </div>
                  </div>
                </div>
              </section>

              <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                <div
                  style={{
                    padding: "9px 12px",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#1d4ed8",
                    background: "rgba(59,130,246,0.12)",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Note e chiusura
                </div>
                <div style={{ padding: 12, display: "grid", gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Note uscita</div>
                    <div style={{ fontWeight: 700 }}>{historyDetail.note || "—"}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Note chiusura</div>
                    <div style={{ fontWeight: 700 }}>
                      {historyDetailGroup.length > 1 ? "Le note sono riportate per ogni attrezzatura." : historyDetail.close_note || "—"}
                    </div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                      {historyDetailGroup.length > 1 && historyDetailGroupSummary.open > 0 ? "Ultimo rientro" : "Data chiusura"}
                    </div>
                    <div style={{ fontWeight: 700 }}>
                      {historyDetailGroup.length > 1
                        ? historyDetailGroupSummary.latestClosedAt
                          ? `${fmtDateTime(historyDetailGroupSummary.latestClosedAt)} · ${historyDetailGroupSummary.closed}/${historyDetailGroupSummary.total} rientrate`
                          : "Nessuna attrezzatura ancora rientrata"
                        : historyDetail.closed_at
                          ? fmtDateTime(historyDetail.closed_at)
                          : "Movimento ancora aperto"}
                    </div>
                  </div>
                </div>
              </section>

              <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                <div
                  style={{
                    padding: "9px 12px",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#1d4ed8",
                    background: "rgba(59,130,246,0.12)",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {historyDetailGroup.length > 1 ? "Attrezzature del gruppo" : "Attrezzatura coinvolta"}
                </div>
                <div style={{ padding: 12, display: "grid", gap: 10 }}>
                  <details
                    open
                    style={{ border: "1px solid #bfdbfe", borderRadius: 10, overflow: "hidden", background: "#fff" }}
                  >
                    <summary style={{ padding: 12, cursor: "pointer", fontWeight: 900, color: "#1d4ed8", background: "#eff6ff" }}>
                      Ancora fuori ({historyDetailGroupSummary.open})
                    </summary>
                    <div style={{ padding: 10, display: "grid", gap: 8 }}>
                      {historyDetailGroupSummary.open > 0
                        ? renderHistoryEquipmentCards(
                            historyDetailGroup.filter((movement) => (movement.status ?? "OPEN") === "OPEN")
                          )
                        : <div style={{ color: "#64748b" }}>Nessuna attrezzatura ancora fuori.</div>}
                    </div>
                  </details>

                  <details
                    style={{ border: "1px solid #bbf7d0", borderRadius: 10, overflow: "hidden", background: "#fff" }}
                  >
                    <summary style={{ padding: 12, cursor: "pointer", fontWeight: 900, color: "#047857", background: "#f0fdf4" }}>
                      Rientrate ({historyDetailGroupSummary.closed})
                    </summary>
                    <div style={{ padding: 10, display: "grid", gap: 8 }}>
                      {historyDetailGroupSummary.closed > 0
                        ? renderHistoryEquipmentCards(
                            historyDetailGroup.filter((movement) => (movement.status ?? "OPEN") === "CLOSED")
                          )
                        : <div style={{ color: "#64748b" }}>Nessuna attrezzatura ancora rientrata.</div>}
                    </div>
                  </details>
                </div>
              </section>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "12px 18px",
                borderTop: "1px solid #e2e8f0",
                background: "#fff",
              }}
            >
              <button type="button" className="btn btnPrimary" onClick={() => setHistoryDetail(null)}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

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
