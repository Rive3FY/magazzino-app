"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
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
import { isRelationMissingOrNotExposedError } from "../../_lib/postgrestErrors";
import EquipmentStatusManager from "./EquipmentStatusManager";
import AppScanStatusModal from "../../_components/AppScanStatusModal";
import ConfirmModal from "../../_components/ConfirmModal";
import type { EquipmentArea, EquipmentAssetRow, EquipmentMovementRow, EquipmentStatus } from "../../_lib/types";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

type NfcCategoryTagRow = {
  nfc_tag_id: string;
  category: string;
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

function EquipmentStatusIcon({ status, size = 16 }: { status: EquipmentStatus; size?: number }) {
  if (status === "AVAILABLE") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="#10b981" fillOpacity="0.14" stroke="#059669" strokeWidth="1.5" />
        <path d="M5 8.2 7 10.2 11 6.2" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "ASSIGNED") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="#3b82f6" fillOpacity="0.14" stroke="#2563eb" strokeWidth="1.5" />
        <path d="M8 4.5v7" stroke="#1d4ed8" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5.5 8h5" stroke="#1d4ed8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "MAINTENANCE") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="#f59e0b" fillOpacity="0.16" stroke="#d97706" strokeWidth="1.5" />
        <path d="M6 10.5 10.5 6" stroke="#b45309" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9.7 5.9a1.1 1.1 0 1 1 1.55-1.55l.35.35a1.1 1.1 0 0 1-1.55 1.55l-.35-.35Z" fill="#b45309" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="#ef4444" fillOpacity="0.14" stroke="#dc2626" strokeWidth="1.5" />
      <path d="M5.5 5.5 10.5 10.5" stroke="#b91c1c" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.5 5.5 5.5 10.5" stroke="#b91c1c" strokeWidth="1.8" strokeLinecap="round" />
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
  const [quickGroupFilter, setQuickGroupFilter] = useState<string>("");
  const [categoryGroups, setCategoryGroups] = useState<{ group_name: string; category: string }[]>([]);
  const [nfcCategoryTags, setNfcCategoryTags] = useState<NfcCategoryTagRow[]>([]);
  const [quickWarehouseFilter, setQuickWarehouseFilter] = useState<string>("ALL");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickPickOpen, setQuickPickOpen] = useState(false);
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
  const quickPickBoxRef = useRef<HTMLDivElement | null>(null);
  const categoryGroupsTableMissingRef = useRef(false);

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

    const categoryGroupsPromise = categoryGroupsTableMissingRef.current
      ? Promise.resolve({ data: [], error: { message: "skip" } })
      : supabase.from("equipment_category_groups").select("group_name,category").eq("equipment_area", area).order("group_name").order("category");

    const [assetsRes, historyRes, categoryGroupsRes, nfcCategoryTagsRes] = await Promise.all([
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
      categoryGroupsPromise,
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

    if (categoryGroupsRes.error) {
      const err = categoryGroupsRes.error;
      if (String((err as { message?: string }).message) === "skip") {
        setCategoryGroups([]);
      } else if (isRelationMissingOrNotExposedError(err)) {
        categoryGroupsTableMissingRef.current = true;
        setCategoryGroups([]);
      } else {
        console.error("equipment_category_groups:", err);
      }
    } else {
      setCategoryGroups((categoryGroupsRes.data ?? []) as { group_name: string; category: string }[]);
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

  const quickCategories = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const c = (row.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [rows]);

  const quickGroupedCategories = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of categoryGroups) {
      const grp = (row.group_name ?? "").trim();
      const cat = (row.category ?? "").trim();
      if (!grp || !cat) continue;
      const list = map.get(grp) ?? [];
      list.push(cat);
      map.set(grp, list);
    }
    for (const [, list] of map) list.sort();
    return map;
  }, [categoryGroups]);

  const quickGroupNames = useMemo(() => Array.from(new Set(quickGroupedCategories.keys())).sort(), [quickGroupedCategories]);

  const quickCategoryToGroup = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of categoryGroups) {
      const grp = (row.group_name ?? "").trim();
      const cat = (row.category ?? "").trim();
      if (!grp || !cat) continue;
      map.set(cat, grp);
    }
    return map;
  }, [categoryGroups]);

  const quickUngroupedCategories = useMemo(() => {
    const inGroup = new Set<string>();
    for (const row of categoryGroups) {
      const cat = (row.category ?? "").trim();
      if (cat) inGroup.add(cat);
    }
    return quickCategories.filter((c) => !inGroup.has(c));
  }, [quickCategories, categoryGroups]);

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
    if (!search) return base;
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

  const [historyDetail, setHistoryDetail] = useState<EquipmentMovementRow | null>(null);
  const [historyDetailAssetsExpanded, setHistoryDetailAssetsExpanded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<EquipmentMovementRow | null>(null);

  const historyDetailGroup = useMemo(() => {
    if (!historyDetail) return [];
    if (!historyDetail.movement_group_id) return [historyDetail];
    return history
      .filter((row) => row.movement_group_id === historyDetail.movement_group_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [history, historyDetail]);

  useEffect(() => {
    setHistoryDetailAssetsExpanded(false);
  }, [historyDetail]);

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

  function applyQuickCategoryTag(category: string) {
    const normalizedCategory = category.trim();
    if (!normalizedCategory) return;
    const linkedGroup = quickCategoryToGroup.get(normalizedCategory) ?? "";
    const nextGroup = linkedGroup || (quickUngroupedCategories.includes(normalizedCategory) ? "__OTHER__" : "");
    const candidates = rows.filter((row) => {
      if ((row.category ?? "").trim() !== normalizedCategory) return false;
      if (quickWarehouseFilter !== "ALL" && (row.warehouse ?? "").trim() !== quickWarehouseFilter) return false;
      return true;
    });
    setQuickGroupFilter(nextGroup);
    setQuickCategoryFilter(normalizedCategory);
    setQuickSelectedId(candidates.length === 1 ? candidates[0].id : "");
    setQuickSearch(candidates.length === 1 ? `${candidates[0].serial_number || candidates[0].asset_code} - ${candidates[0].name}` : normalizedCategory);
    setQuickOpen(false);
    if (candidates.length === 0) {
      setMsg(`Tag NFC gruppo/sottogruppo rilevato: ${normalizedCategory}. Nessuna attrezzatura trovata con i filtri correnti.`);
      return;
    }
    if (candidates.length === 1) {
      setMsg(`Tag NFC gruppo/sottogruppo rilevato: ${normalizedCategory}. Attrezzatura selezionata automaticamente.`);
      return;
    }
    setMsg(`Tag NFC gruppo/sottogruppo rilevato: ${normalizedCategory}. ${candidates.length} attrezzature trovate, selezionane una.`);
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
    setMsg(mode === "barcode" ? "Nessuna attrezzatura trovata per questo barcode." : "Nessuna attrezzatura o sottogruppo associato a questo tag NFC.");
  }

  function pickQuickMatch(row: EquipmentAssetRow) {
    setQuickSelectedId(row.id);
    setQuickSearch(`${row.serial_number || row.asset_code} - ${row.name}`);
    setQuickOpen(false);
    setQuickPickOpen(false);
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
      const target = e.target as Node;
      if (quickBoxRef.current && !quickBoxRef.current.contains(target)) setQuickOpen(false);
      if (quickPickBoxRef.current && !quickPickBoxRef.current.contains(target)) setQuickPickOpen(false);
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
            {EQUIPMENT_STATUS_OPTIONS.filter((status) => status !== "DISMISSED").map((status) => (
              <div key={status} className="equipmentStatCard">
                <div className="equipmentStatLabel">{EQUIPMENT_STATUS_LABELS[status]}</div>
                <div className="equipmentStatValue">{stats[status]}</div>
              </div>
            ))}
          </div>

          <div className="equipmentFilterGrid mobileGrid1">
            {quickGroupNames.length > 0 || quickUngroupedCategories.length > 0 ? (
              <>
                <div style={{ minWidth: 0 }}>
                  <label className="label" htmlFor={`equipment-quick-group-${area}`}>Gruppo categoria</label>
                  <ClearableSelect
                    id={`equipment-quick-group-${area}`}
                    value={quickGroupFilter}
                    onChange={(v) => {
                      setQuickGroupFilter(v);
                      setQuickCategoryFilter("");
                    }}
                    clearValue=""
                  >
                    <option value="">Tutte</option>
                    {quickGroupNames.map((gn) => (
                      <option key={gn} value={gn}>{gn}</option>
                    ))}
                    {quickUngroupedCategories.length > 0 && (
                      <option value="__OTHER__">Altre</option>
                    )}
                  </ClearableSelect>
                </div>
                {quickGroupFilter && (
                  <div style={{ minWidth: 0 }}>
                    <label className="label" htmlFor={`equipment-quick-category-${area}`}>Categoria</label>
                    <ClearableSelect
                      id={`equipment-quick-category-${area}`}
                      value={quickCategoryFilter}
                      onChange={setQuickCategoryFilter}
                      clearValue=""
                    >
                      <option value="">Tutte</option>
                      {(quickGroupFilter === "__OTHER__" ? quickUngroupedCategories : (quickGroupedCategories.get(quickGroupFilter) ?? [])).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </ClearableSelect>
                  </div>
                )}
              </>
            ) : (
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
            )}
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
            <div ref={quickPickBoxRef} style={{ minWidth: 0, position: "relative" }}>
              <label className="label" htmlFor={`equipment-quick-pick-${area}`}>
                Attrezzatura
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <button
                  id={`equipment-quick-pick-${area}`}
                  type="button"
                  className="input"
                  aria-haspopup="listbox"
                  aria-expanded={quickPickOpen}
                  onClick={() => setQuickPickOpen((v) => !v)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  {quickSelected ? (
                    <>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                        <EquipmentStatusIcon status={quickSelected.status} />
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {(quickSelected.serial_number || quickSelected.asset_code) + " - " + quickSelected.name}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                        {EQUIPMENT_STATUS_LABELS[quickSelected.status]}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "#64748b" }}>Seleziona risultato</span>
                  )}
                  <span style={{ color: "#64748b", flexShrink: 0 }}>{quickPickOpen ? "▲" : "▼"}</span>
                </button>
                {quickSelectedId ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setQuickSelectedId("");
                      setQuickPickOpen(false);
                    }}
                    aria-label="Cancella attrezzatura selezionata"
                    style={{ padding: "0 12px", minWidth: 44 }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {quickPickOpen && (
                <div
                  role="listbox"
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
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {quickMatches.length === 0 ? (
                      <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
                    ) : (
                      quickMatches.map((row, idx) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => pickQuickMatch(row)}
                          style={{
                            width: "100%",
                            border: "none",
                            background: quickSelectedId === row.id ? "#eef2ff" : "white",
                            padding: "10px 12px",
                            cursor: "pointer",
                            borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                            textAlign: "left",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <EquipmentStatusIcon status={row.status} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 800, color: "#0f172a" }}>{row.serial_number || row.asset_code}</div>
                              <div style={{ fontSize: 12, color: "#334155" }}>{row.name}</div>
                            </div>
                            <span
                              style={{
                                ...equipmentStatusStyle(row.status),
                                padding: "4px 8px",
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {EQUIPMENT_STATUS_LABELS[row.status]}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
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

      <AppScanStatusModal
        open={cameraScanning || searchByNfcScanning}
        mode={cameraScanning ? "barcode" : "nfc"}
        videoRef={videoRef}
        icon={<SpinnerIcon />}
        onClose={cameraScanning ? stopCameraScan : stopNfcScan}
      />

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
                <button type="button" className="btn" onClick={() => setHistoryDetail(null)}>
                  Chiudi
                </button>
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
                  <span style={equipmentMovementPillStyle(historyDetail.status ?? "OPEN")}>
                    {EQUIPMENT_MOVEMENT_STATUS_LABELS[historyDetail.status ?? "OPEN"]}
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
                      <span style={equipmentMovementPillStyle(historyDetail.status ?? "OPEN")}>
                        {EQUIPMENT_MOVEMENT_STATUS_LABELS[historyDetail.status ?? "OPEN"]}
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
                      {historyDetail.resolution_type ? EQUIPMENT_RESOLUTION_LABELS[historyDetail.resolution_type] : "—"}
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
                    <div style={{ fontWeight: 700 }}>{historyDetail.close_note || "—"}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Data chiusura</div>
                    <div style={{ fontWeight: 700 }}>
                      {historyDetail.closed_at ? fmtDateTime(historyDetail.closed_at) : "Movimento ancora aperto"}
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
                <div style={{ padding: 12, display: "grid", gap: 8 }}>
                  {(historyDetailAssetsExpanded ? historyDetailGroup : historyDetailGroup.slice(0, 4)).map((movement) => {
                    const asset = rows.find((item) => item.id === movement.equipment_id);
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
                          {asset ? `${asset.serial_number || asset.asset_code} - ${asset.name}` : movement.equipment_id}
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
                          {[
                            asset?.barcode ? `Barcode ${asset.barcode}` : null,
                            asset?.nfc_tag_id ? `NFC ${asset.nfc_tag_id}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Nessun identificativo"}
                        </div>
                      </div>
                    );
                  })}
                  {historyDetailGroup.length > 4 && (
                    <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 4 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setHistoryDetailAssetsExpanded((v) => !v)}
                      >
                        {historyDetailAssetsExpanded
                          ? "Mostra meno"
                          : `Mostra tutte (${historyDetailGroup.length})`}
                      </button>
                    </div>
                  )}
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
