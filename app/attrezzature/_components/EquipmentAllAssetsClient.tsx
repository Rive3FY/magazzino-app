"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useAuth } from "../../_lib/hooks/useAuth";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import { useToast } from "../../_lib/ToastContext";
import { fmtDateTime } from "../../_lib/utils";
import {
  EQUIPMENT_AREA_LABELS,
  buildEquipmentStatusUpdate,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_OPTIONS,
  equipmentStatusStyle,
} from "../../_lib/equipment";
import EquipmentStatusManager from "./EquipmentStatusManager";
import EquipmentExcelImportClient from "./EquipmentExcelImportClient";
import ConfirmModal from "../../_components/ConfirmModal";
import RemoteNfcScanModal from "./RemoteNfcScanModal";
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
  warehouse: string;
  shelf: string;
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
  warehouse: "",
  shelf: "",
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

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
      <path d="M10 5h4" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
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

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export default function EquipmentAllAssetsClient({ area, basePath }: Props) {
  const { user, loading: authLoading, approved } = useAuth();
  const access = useIsAdmin();
  const isAdmin = area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;
  const adminLoading = access.loading;
  const toast = useToast();
  const [isMobile, setIsMobile] = useState(false);

  const [rows, setRows] = useState<EquipmentAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | EquipmentStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("ALL");
  const [msg, setMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<EquipmentAssetRow | null>(null);
  const [mobileEditMode, setMobileEditMode] = useState(false);
  const [statusModalRow, setStatusModalRow] = useState<EquipmentAssetRow | null>(null);
  const [formEntries, setFormEntries] = useState<AssetFormState[]>([emptyForm]);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [searchByNfcScanning, setSearchByNfcScanning] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [nfcAssociatingId, setNfcAssociatingId] = useState<string | null>(null);
  const [nfcTagReassign, setNfcTagReassign] = useState<NfcReassignState | null>(null);
  const [remoteScanRow, setRemoteScanRow] = useState<EquipmentAssetRow | null>(null);
  const [remoteScanRows, setRemoteScanRows] = useState<EquipmentAssetRow[] | null>(null);
  const [techSheetBusyId, setTechSheetBusyId] = useState<string | null>(null);
  const [techSheetTargetRow, setTechSheetTargetRow] = useState<EquipmentAssetRow | null>(null);
  const [actionMenuOpenRowId, setActionMenuOpenRowId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const techSheetInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 780px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!actionMenuOpenRowId) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-action-menu]")) setActionMenuOpenRowId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [actionMenuOpenRowId]);

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


  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const c = (row.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [rows]);

  const warehouses = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const w = (row.warehouse ?? "").trim();
      if (w) set.add(w);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (categoryFilter && (row.category ?? "").trim() !== categoryFilter) return false;
      if (warehouseFilter !== "ALL" && warehouseFilter !== "" && (row.warehouse ?? "").trim() !== warehouseFilter) return false;
      if (warehouseFilter === "" && (row.warehouse ?? "").trim() !== "") return false;
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
  }, [q, rows, statusFilter, categoryFilter, warehouseFilter]);

  const ROWS_PER_PAGE = 15;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));

  function goToPage(p: number) {
    const target = Math.max(1, Math.min(totalPages, p));
    setPage(target);
    setPageInput("");
  }

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, categoryFilter, warehouseFilter]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [q, statusFilter, categoryFilter, warehouseFilter]);

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
    if (warehouseFilter !== "ALL") base = base.filter((row) => (row.warehouse ?? "").trim() === warehouseFilter);
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
  }, [q, rows, categoryFilter, warehouseFilter]);

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

  function stopNfcScan() {
    setSearchByNfcScanning(false);
    setMsg(null);
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

  function stopNfcAssociation() {
    setNfcAssociatingId(null);
    setMsg(null);
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
    setMobileEditMode(false);
    setFormEntries([emptyForm]);
    setMsg(null);
  }

  function openCreate() {
    setEditingRow(null);
    setMobileEditMode(true);
    setFormEntries([emptyForm]);
    setMsg(null);
    setModalOpen(true);
  }

  function openEdit(row: EquipmentAssetRow) {
    setEditingRow(row);
    setMobileEditMode(!isMobile);
    setFormEntries([{
      serial_number: row.serial_number ?? "",
      name: row.name ?? "",
      category: row.category ?? "",
      warehouse: row.warehouse ?? "",
      shelf: [row.shelf, row.place].filter(Boolean).join(" · ") || "",
      notes: row.notes ?? "",
    }]);
    setMsg(null);
    setModalOpen(true);
  }

  function applyUpdatedRow(updatedRow: EquipmentAssetRow) {
    setRows((prev) => prev.map((row) => (row.id === updatedRow.id ? updatedRow : row)));
    setEditingRow((prev) => (prev?.id === updatedRow.id ? updatedRow : prev));
  }

  function openTechnicalSheet(row: EquipmentAssetRow) {
    if (!row.technical_sheet_path) {
      toast.error("Nessuna scheda tecnica associata");
      return;
    }
    window.open(`/api/attrezzature/technical-sheet?id=${encodeURIComponent(row.id)}`, "_blank", "noopener,noreferrer");
  }

  function triggerTechnicalSheetUpload(row: EquipmentAssetRow) {
    if (!isAdmin) return;
    setTechSheetTargetRow(row);
    techSheetInputRef.current?.click();
  }

  async function handleTechnicalSheetFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const row = techSheetTargetRow;
    event.target.value = "";
    setTechSheetTargetRow(null);

    if (!file || !row) return;

    if (file.type !== "application/pdf") {
      toast.error("La scheda tecnica deve essere un PDF");
      return;
    }

    setTechSheetBusyId(row.id);
    try {
      const formData = new FormData();
      formData.set("equipmentId", row.id);
      formData.set("file", file);

      const res = await fetch("/api/attrezzature/technical-sheet", {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? "Errore caricamento scheda tecnica");
      }

      if (json.row) {
        applyUpdatedRow(json.row as EquipmentAssetRow);
      } else {
        await loadAssets();
      }

      toast.success(row.technical_sheet_path ? "Scheda tecnica aggiornata" : "Scheda tecnica caricata");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore caricamento scheda tecnica");
    } finally {
      setTechSheetBusyId(null);
    }
  }

  function addFormEntry() {
    setFormEntries((prev) => [...prev, { ...emptyForm }]);
  }

  function removeFormEntry(idx: number) {
    setFormEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveAsset() {
    if (!isAdmin) {
      setMsg("Solo gli admin possono modificare il registro attrezzature.");
      return;
    }

    if (editingRow) {
      const form = formEntries[0];
      const parsed = equipmentAssetSchema.safeParse(form);
      if (!parsed.success) {
        setMsg(parsed.error.issues[0]?.message ?? "Verifica i dati inseriti.");
        return;
      }
      setSaving(true);
      setMsg(null);
      const serial = form.serial_number.trim();
      const payload: Record<string, unknown> = {
        asset_code: serial,
        serial_number: serial,
        name: form.name.trim(),
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
        warehouse: form.warehouse.trim() || null,
        shelf: form.shelf.trim() || null,
        place: null,
        equipment_area: area,
      };
      const result = await supabase.from("equipment_assets").update(payload).eq("id", editingRow.id).eq("equipment_area", area).select("id").single();
      if (result.error) {
        setMsg("Salvataggio non riuscito: " + result.error.message);
        setSaving(false);
        return;
      }
      await writeAuditLog("EQUIPMENT_UPDATED", editingRow.id, payload);
      toast.success("Attrezzatura aggiornata");
      await loadAssets();
      setSaving(false);
      closeModal();
      return;
    }

    const validEntries: AssetFormState[] = [];
    for (const f of formEntries) {
      const r = equipmentAssetSchema.safeParse(f);
      if (r.success) validEntries.push(f);
    }
    if (validEntries.length === 0) {
      const r = equipmentAssetSchema.safeParse(formEntries[0]);
      setMsg(r.success ? "Inserisci almeno un'attrezzatura valida." : (r.error?.issues[0]?.message ?? "Verifica i dati inseriti."));
      return;
    }

    setSaving(true);
    setMsg(null);
    let created = 0;
    for (const form of validEntries) {
      const serial = form.serial_number.trim();
      const payload = {
        asset_code: serial,
        serial_number: serial,
        name: form.name.trim(),
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
        warehouse: form.warehouse.trim() || null,
        shelf: form.shelf.trim() || null,
        place: null,
        equipment_area: area,
      };
      const result = await supabase.from("equipment_assets").insert(payload).select("id").single();
      if (result.error) {
        setMsg(`Salvataggio non riuscito (${serial}): ${result.error.message}`);
        setSaving(false);
        return;
      }
      await writeAuditLog("EQUIPMENT_CREATED", result.data?.id ?? null, payload);
      created++;
    }
    toast.success(created === 1 ? "Attrezzatura creata" : `${created} attrezzature create`);
    await loadAssets();
    setSaving(false);
    closeModal();
  }

  async function changeAssetStatus(row: EquipmentAssetRow, newStatus: EquipmentStatus, maintenanceNote?: string) {
    if (!isAdmin) return;
    setSaving(true);
    setMsg(null);
    const payload = buildEquipmentStatusUpdate(newStatus, maintenanceNote);
    const { error } = await supabase.from("equipment_assets").update(payload).eq("id", row.id).eq("equipment_area", area);
    setSaving(false);
    if (error) {
      setMsg("Errore aggiornamento stato: " + error.message);
      return;
    }
    await writeAuditLog("EQUIPMENT_STATUS_CHANGED", row.id, { status: newStatus });
    toast.success(`Stato aggiornato a ${EQUIPMENT_STATUS_LABELS[newStatus]}`);
    await loadAssets();
    setStatusModalRow(null);
  }

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "single" | "bulk"; row?: EquipmentAssetRow; count?: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const onPage = paginatedRows.map((r) => r.id);
    const allSelected = onPage.length > 0 && onPage.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        onPage.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...onPage]));
    }
  }

  function openDeleteAssetConfirm(row: EquipmentAssetRow) {
    if (!isAdmin) return;
    setDeleteConfirm({ type: "single", row });
  }

  function openDeleteBulkConfirm() {
    if (!isAdmin || selectedIds.size === 0) return;
    setDeleteConfirm({ type: "bulk", count: selectedIds.size });
  }

  async function executeDeleteAssetRow(row: EquipmentAssetRow, silent?: boolean) {
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
    if (!silent) {
      toast.success("Attrezzatura eliminata");
      await loadAssets();
      if (editingRow?.id === row.id) closeModal();
    }
  }

  async function executeBulkDelete() {
    if (!isAdmin || selectedIds.size === 0) return;
    setDeletingBulk(true);
    setMsg(null);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      if (row) await executeDeleteAssetRow(row, true);
    }
    setSelectedIds(new Set());
    setDeletingBulk(false);
    await loadAssets();
    toast.success(`${ids.length} attrezzature eliminate`);
  }

  async function handleDeleteAssetConfirm() {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "single" && deleteConfirm.row) {
      await executeDeleteAssetRow(deleteConfirm.row);
    } else if (deleteConfirm.type === "bulk") {
      await executeBulkDelete();
    }
    setDeleteConfirm(null);
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
    <main className="panel">
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
                <>
                  <button className="btn btnPrimary" onClick={openCreate} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <PlusIcon />
                    Nuova attrezzatura
                  </button>
                  <button className="btn" onClick={() => setExcelImportOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    Importa da Excel
                  </button>
                </>
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
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`all-equipment-warehouse-${area}`}>Magazzino</label>
              <select
                id={`all-equipment-warehouse-${area}`}
                className="input"
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
              >
                <option value="ALL">Tutti i magazzini</option>
                <option value="">Nessuno (senza magazzino)</option>
                {warehouses.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>

          {msg && !modalOpen && <div className="equipmentInlineMessage">{msg}</div>}
        </div>
      </div>

      {(cameraScanning || searchByNfcScanning || !!nfcAssociatingId) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1100,
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
            ) : searchByNfcScanning ? (
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
            ) : (
              <>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Associazione NFC</div>
                <div style={{ padding: 24, background: "#0f172a", borderRadius: 12, marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <SpinnerIcon />
                  <div style={{ fontSize: 14, color: "#94a3b8" }}>Avvicina il telefono al tag NFC</div>
                </div>
                <button type="button" className="btn" onClick={stopNfcAssociation}>
                  Fine
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="equipmentSectionHeader" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div>
            <div className="equipmentSectionTitle">Elenco completo {areaLabel}</div>
            <div className="equipmentSectionHint">{filtered.length} risultati · Pagina {page} di {totalPages}</div>
          </div>
          {(totalPages > 1 || (isAdmin && selectedIds.size > 0)) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              {isAdmin && selectedIds.size > 0 && (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setRemoteScanRows(paginatedRows.filter((r) => selectedIds.has(r.id)))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    📱 Associa NFC (ordine)
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={deletingBulk}
                    onClick={openDeleteBulkConfirm}
                    style={{
                      borderColor: "rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.1)",
                      color: "#991b1b",
                    }}
                  >
                    {deletingBulk ? "Eliminazione…" : `Elimina ${selectedIds.size} selezionate`}
                  </button>
                </>
              )}
              {totalPages > 1 && (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prec
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Pagina {page} di {totalPages}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && goToPage(parseInt(pageInput, 10) || 1)}
                      placeholder="n°"
                      className="input"
                      style={{ width: 52, padding: "6px 8px", fontSize: 13 }}
                    />
                    <button type="button" className="btn" onClick={() => goToPage(parseInt(pageInput, 10) || 1)}>
                      Vai
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Succ →
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div
          className="tableWrap"
          style={{
            overflowX: "auto",
            overflowY: "hidden",
            width: "100%",
            maxWidth: "100%",
            marginTop: 10,
            WebkitOverflowScrolling: "touch",
          }}
        >
          <table className="table equipmentTableCompact" style={{ width: "100%", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "3%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "5%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  {isAdmin && paginatedRows.length > 0 && (
                    <input
                      type="checkbox"
                      checked={paginatedRows.length > 0 && paginatedRows.every((r) => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                      title="Seleziona pagina"
                    />
                  )}
                </th>
                <th>Seriale</th>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Magazzino</th>
                <th>Note</th>
                <th>Stato</th>
                <th>Scaffale</th>
                <th>Assegnata a</th>
                <th>Barcode</th>
                <th>NFC</th>
                <th>Ultimo agg.</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={13}>Nessuna attrezzatura trovata.</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={13}>Caricamento attrezzature...</td>
                </tr>
              )}
              {paginatedRows.map((row) => {
                const assignedTo = [row.assigned_to_name, row.assigned_to_badge ? `Badge ${row.assigned_to_badge}` : null]
                  .filter(Boolean)
                  .join(" · ") || "—";

                return (
                  <tr
                    key={row.id}
                    onClick={() => {
                      if (isMobile) openEdit(row);
                    }}
                    style={isMobile ? { cursor: "pointer" } : undefined}
                    title={isMobile ? "Tocca per aprire il dettaglio" : undefined}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      {isAdmin && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          title="Seleziona"
                        />
                      )}
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{row.serial_number || row.asset_code}</strong>
                      </div>
                    </td>
                    <td>{row.name}</td>
                    <td>{row.category || "—"}</td>
                    <td>{row.warehouse || "—"}</td>
                    <td title={row.notes ?? ""}>{row.notes || "—"}</td>
                    <td><span style={equipmentStatusStyle(row.status)}>{EQUIPMENT_STATUS_LABELS[row.status]}</span></td>
                    <td>{[row.shelf, row.place].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{assignedTo}</td>
                    <td>{row.barcode || "Da generare"}</td>
                    <td>{row.nfc_tag_id || "Non associato"}</td>
                    <td>{fmtDateTime(row.updated_at)}</td>
                    <td onClick={(e) => e.stopPropagation()} data-action-menu>
                      {!isMobile && (
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setActionMenuOpenRowId((id) => (id === row.id ? null : row.id))}
                            title="Azioni"
                            style={{ padding: "6px 10px", minWidth: 36 }}
                          >
                            ⋮
                          </button>
                          {actionMenuOpenRowId === row.id && (
                            <div
                              style={{
                                position: "absolute",
                                right: 0,
                                top: "100%",
                                marginTop: 4,
                                background: "#fff",
                                border: "1px solid rgba(15,23,42,0.12)",
                                borderRadius: 8,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                                zIndex: 60,
                                minWidth: 180,
                                overflow: "hidden",
                              }}
                            >
                              <button
                                type="button"
                                className="btn"
                                style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, display: "flex", alignItems: "center", gap: 8 }}
                                onClick={() => {
                                  setActionMenuOpenRowId(null);
                                  openTechnicalSheet(row);
                                }}
                                disabled={!row.technical_sheet_path || techSheetBusyId === row.id}
                                title={row.technical_sheet_path ? "Apri scheda tecnica" : "Nessuna scheda tecnica associata"}
                              >
                                <FileTextIcon />
                                Scheda tecnica
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, display: "flex", alignItems: "center", gap: 8 }}
                                  onClick={() => {
                                    setActionMenuOpenRowId(null);
                                    triggerTechnicalSheetUpload(row);
                                  }}
                                  disabled={techSheetBusyId === row.id}
                                >
                                  <FileTextIcon />
                                  {techSheetBusyId === row.id ? "Caricamento..." : row.technical_sheet_path ? "Aggiorna scheda" : "Carica scheda"}
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0 }}
                                  onClick={() => {
                                    setActionMenuOpenRowId(null);
                                    setStatusModalRow(row);
                                  }}
                                  disabled={saving}
                                >
                                  Gestisci stato
                                </button>
                              )}
                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    className="btn"
                                    style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, display: "flex", alignItems: "center", gap: 8 }}
                                    onClick={() => {
                                      setActionMenuOpenRowId(null);
                                      void doAssociateNfc(row);
                                    }}
                                    disabled={nfcAssociatingId === row.id}
                                  >
                                    <NfcIcon />
                                    {nfcAssociatingId === row.id ? "NFC..." : row.nfc_tag_id ? "Riassegna NFC" : "Associa NFC"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn"
                                    style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, display: "flex", alignItems: "center", gap: 8 }}
                                    onClick={() => {
                                      setActionMenuOpenRowId(null);
                                      setRemoteScanRow(row);
                                    }}
                                    title="Usa telefono come lettore NFC"
                                  >
                                    <PhoneIcon />
                                    Telefono
                                  </button>
                                </>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0 }}
                                  onClick={() => {
                                    setActionMenuOpenRowId(null);
                                    openEdit(row);
                                  }}
                                >
                                  Modifica
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(totalPages > 1 || (isAdmin && selectedIds.size > 0)) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(15,23,42,0.08)" }}>
            {isAdmin && selectedIds.size > 0 && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setRemoteScanRows(paginatedRows.filter((r) => selectedIds.has(r.id)))}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  📱 Associa NFC (ordine)
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={deletingBulk}
                  onClick={openDeleteBulkConfirm}
                  style={{
                    borderColor: "rgba(239,68,68,0.5)",
                    background: "rgba(239,68,68,0.1)",
                    color: "#991b1b",
                  }}
                >
                  {deletingBulk ? "Eliminazione…" : `Elimina ${selectedIds.size} selezionate`}
                </button>
              </>
            )}
            {totalPages > 1 && (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prec
                </button>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Pagina {page} di {totalPages}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && goToPage(parseInt(pageInput, 10) || 1)}
                    placeholder="n°"
                    className="input"
                    style={{ width: 52, padding: "6px 8px", fontSize: 13 }}
                  />
                  <button type="button" className="btn" onClick={() => goToPage(parseInt(pageInput, 10) || 1)}>
                    Vai
                  </button>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Succ →
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <input
        ref={techSheetInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={handleTechnicalSheetFileChange}
      />

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
            {(() => {
              const showCompactMobileDetail = isMobile && !!editingRow && !mobileEditMode;
              return (
                <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>
                {editingRow
                  ? showCompactMobileDetail
                    ? "Dettaglio attrezzatura"
                    : isAdmin
                      ? "Modifica attrezzatura"
                      : "Dettaglio attrezzatura"
                  : "Nuova attrezzatura"} · <span style={{ opacity: 0.75 }}>{areaLabel}</span>
              </div>
              {editingRow && (
                <span style={equipmentStatusStyle(editingRow.status)}>
                  {EQUIPMENT_STATUS_LABELS[editingRow.status]}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", marginTop: 10 }}>
              <button className="btn" disabled={saving} onClick={closeModal}>
                Chiudi
              </button>

              {isAdmin && showCompactMobileDetail && editingRow && (
                <button className="btn btnPrimary" disabled={saving} onClick={() => setMobileEditMode(true)}>
                  Modifica
                </button>
              )}

              {isAdmin && (!showCompactMobileDetail || !editingRow) && (
                <button className="btn btnPrimary" disabled={saving} onClick={saveAsset}>
                  {saving ? "Salvataggio..." : "Salva"}
                </button>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              {showCompactMobileDetail
                ? `Dettaglio rapido dell'attrezzatura nell'area ${areaLabel}.`
                : isAdmin
                ? `L'attrezzatura restera vincolata in modo permanente all'area ${areaLabel}. Il seriale viene usato come identificativo principale; barcode e NFC si gestiscono dopo.`
                : `Vista di sola lettura dell'attrezzatura nell'area ${areaLabel}.`}
            </div>

            {showCompactMobileDetail && editingRow && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: "1px solid rgba(15,23,42,0.12)",
                  borderRadius: 12,
                  background: "rgba(248,250,252,0.8)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div>
                  <div className="equipmentInfoLabel">Seriale / matricola</div>
                  <div className="equipmentInfoValue">{editingRow.serial_number || editingRow.asset_code}</div>
                </div>
                <div>
                  <div className="equipmentInfoLabel">Nome attrezzatura</div>
                  <div className="equipmentInfoValue">{editingRow.name || "—"}</div>
                </div>
                <div>
                  <div className="equipmentInfoLabel">Categoria</div>
                  <div className="equipmentInfoValue">{editingRow.category || "—"}</div>
                </div>
                <div>
                  <div className="equipmentInfoLabel">Magazzino</div>
                  <div className="equipmentInfoValue">{editingRow.warehouse || "—"}</div>
                </div>
                <div>
                  <div className="equipmentInfoLabel">Scaffale</div>
                  <div className="equipmentInfoValue">{[editingRow.shelf, editingRow.place].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    onClick={() => openTechnicalSheet(editingRow)}
                    disabled={!editingRow.technical_sheet_path || techSheetBusyId === editingRow.id}
                    title={editingRow.technical_sheet_path ? "Apri scheda tecnica" : "Nessuna scheda tecnica associata"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <FileTextIcon />
                    Scheda tecnica
                  </button>
                  {isAdmin && (
                    <button
                      className="btn"
                      onClick={() => triggerTechnicalSheetUpload(editingRow)}
                      disabled={techSheetBusyId === editingRow.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <FileTextIcon />
                      {techSheetBusyId === editingRow.id ? "Caricamento..." : editingRow.technical_sheet_path ? "Aggiorna scheda" : "Carica scheda"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {isMobile && isAdmin && editingRow && mobileEditMode && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: "1px solid rgba(15,23,42,0.12)",
                  borderRadius: 12,
                  background: "rgba(248,250,252,0.8)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 10 }}>
                  Azioni rapide
                </div>
                <div className="equipmentActionGroup">
                  <button
                    className="btn"
                    onClick={() => openTechnicalSheet(editingRow)}
                    disabled={!editingRow.technical_sheet_path || techSheetBusyId === editingRow.id}
                    title={editingRow.technical_sheet_path ? "Apri scheda tecnica" : "Nessuna scheda tecnica associata"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <FileTextIcon />
                    Scheda tecnica
                  </button>
                  {isAdmin && (
                    <button
                      className="btn"
                      onClick={() => triggerTechnicalSheetUpload(editingRow)}
                      disabled={techSheetBusyId === editingRow.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <FileTextIcon />
                      {techSheetBusyId === editingRow.id ? "Caricamento..." : editingRow.technical_sheet_path ? "Aggiorna scheda" : "Carica scheda"}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      className="btn"
                      onClick={() => {
                        setModalOpen(false);
                        setStatusModalRow(editingRow);
                      }}
                      disabled={saving}
                    >
                      Gestisci stato
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      className="btn"
                      onClick={() => void doAssociateNfc(editingRow)}
                      disabled={nfcAssociatingId === editingRow.id}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <NfcIcon />
                      {nfcAssociatingId === editingRow.id ? "NFC..." : editingRow.nfc_tag_id ? "Riassegna NFC" : "Associa NFC"}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      className="btn"
                      onClick={() => setRemoteScanRow(editingRow)}
                      title="Usa telefono come lettore NFC"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <PhoneIcon />
                      Telefono
                    </button>
                  )}
                </div>
              </div>
            )}

            {msg && <div className="equipmentInlineMessage" style={{ marginTop: 12 }}>{msg}</div>}

            {(!showCompactMobileDetail || !editingRow) && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
              {formEntries.map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 14,
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 12,
                    background: "rgba(248,250,252,0.8)",
                    position: "relative",
                  }}
                >
                  {!editingRow && formEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeFormEntry(idx)}
                    aria-label="Rimuovi"
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      width: 28,
                      height: 28,
                      padding: 0,
                      border: "none",
                      background: "rgba(239,68,68,0.15)",
                      color: "#991b1b",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
                  <div className="equipmentFormGrid mobileGrid1" style={{ display: "grid", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <label className="label" htmlFor={`modal-asset-serial-${area}-${idx}`}>Seriale / matricola</label>
                      <input id={`modal-asset-serial-${area}-${idx}`} className="input" value={entry.serial_number} onChange={(e) => setFormEntries((prev) => { const n = [...prev]; n[idx] = { ...n[idx], serial_number: e.target.value }; return n; })} placeholder="Obbligatorio" disabled={!isAdmin || saving} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label className="label" htmlFor={`modal-asset-name-${area}-${idx}`}>Nome attrezzatura</label>
                      <input id={`modal-asset-name-${area}-${idx}`} className="input" value={entry.name} onChange={(e) => setFormEntries((prev) => { const n = [...prev]; n[idx] = { ...n[idx], name: e.target.value }; return n; })} placeholder="Obbligatorio" disabled={!isAdmin || saving} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label className="label" htmlFor={`modal-asset-category-${area}-${idx}`}>Categoria / sottogruppo</label>
                      <input id={`modal-asset-category-${area}-${idx}`} className="input" value={entry.category} onChange={(e) => setFormEntries((prev) => { const n = [...prev]; n[idx] = { ...n[idx], category: e.target.value }; return n; })} placeholder="Es. Braghe 1500kg" disabled={!isAdmin || saving} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label className="label" htmlFor={`modal-asset-warehouse-${area}-${idx}`}>Magazzino</label>
                      <input
                        id={`modal-asset-warehouse-${area}-${idx}`}
                        className="input"
                        type="text"
                        list={`modal-asset-warehouse-list-${area}-${idx}`}
                        value={entry.warehouse}
                        onChange={(e) => setFormEntries((prev) => { const n = [...prev]; n[idx] = { ...n[idx], warehouse: e.target.value }; return n; })}
                        placeholder="Es. Magazzino A, Reparto X..."
                        disabled={!isAdmin || saving}
                      />
                      <datalist id={`modal-asset-warehouse-list-${area}-${idx}`}>
                        {warehouses.map((w) => (
                          <option key={w} value={w} />
                        ))}
                      </datalist>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label className="label" htmlFor={`modal-asset-shelf-${area}-${idx}`}>Scaffale</label>
                      <input id={`modal-asset-shelf-${area}-${idx}`} className="input" value={entry.shelf} onChange={(e) => setFormEntries((prev) => { const n = [...prev]; n[idx] = { ...n[idx], shelf: e.target.value }; return n; })} placeholder="Es. A1, B2 · Ripiano 3..." disabled={!isAdmin || saving} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label className="label" htmlFor={`modal-asset-notes-${area}-${idx}`}>Note</label>
                      <textarea
                        id={`modal-asset-notes-${area}-${idx}`}
                        className="input"
                        value={entry.notes}
                        onChange={(e) => {
                          setFormEntries((prev) => { const n = [...prev]; n[idx] = { ...n[idx], notes: e.target.value }; return n; });
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
                        disabled={!isAdmin || saving}
                        style={{ resize: "none", overflow: "hidden", height: 40, minHeight: 40, width: "100%", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {!editingRow && (
                <button
                  type="button"
                  className="btn"
                  onClick={addFormEntry}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start" }}
                >
                  <PlusIcon />
                  Aggiungi attrezzatura
                </button>
              )}
              </div>
            )}

            {isAdmin && editingRow && !showCompactMobileDetail && (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "1px solid rgba(15,23,42,0.08)",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="btn"
                  style={{
                    borderColor: "rgba(239,68,68,0.5)",
                    background: "rgba(239,68,68,0.1)",
                    color: "#991b1b",
                  }}
                  disabled={saving}
                  onClick={() => editingRow && openDeleteAssetConfirm(editingRow)}
                  title="Elimina attrezzatura"
                >
                  Elimina
                </button>
              </div>
            )}
                </>
              );
            })()}
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

      <EquipmentStatusManager
        asset={statusModalRow}
        isOpen={!!statusModalRow}
        isSaving={saving}
        onClose={() => setStatusModalRow(null)}
        onSubmit={(status, note) => statusModalRow ? changeAssetStatus(statusModalRow, status, note) : undefined}
      />

      {deleteConfirm && (
        <ConfirmModal
          open={!!deleteConfirm}
          title="Eliminare attrezzatura/e"
          message={
            deleteConfirm.type === "single" && deleteConfirm.row
              ? `Eliminare l'attrezzatura ${deleteConfirm.row.serial_number || deleteConfirm.row.asset_code}?\n\nAnche lo storico collegato verrà rimosso.`
              : deleteConfirm.type === "bulk" && deleteConfirm.count
                ? `Eliminare ${deleteConfirm.count} attrezzatura/e selezionate?\n\nAnche lo storico collegato verrà rimosso.`
                : ""
          }
          confirmLabel="Elimina"
          cancelLabel="Annulla"
          danger
          onConfirm={() => void handleDeleteAssetConfirm()}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {excelImportOpen && (
        <EquipmentExcelImportClient
          area={area}
          onClose={() => setExcelImportOpen(false)}
          onSuccess={() => loadAssets()}
        />
      )}

      <RemoteNfcScanModal
        open={!!remoteScanRow || !!(remoteScanRows && remoteScanRows.length > 0)}
        onClose={() => {
          setRemoteScanRow(null);
          setRemoteScanRows(null);
        }}
        context="equipment_associate"
        equipmentId={remoteScanRow?.id}
        equipmentIds={remoteScanRows?.map((r) => r.id)}
        area={area}
        allowMultiple={!!remoteScanRows?.length}
        title={
          remoteScanRows?.length
            ? `Associa NFC a ${remoteScanRows.length} attrezzature (nell'ordine della tabella)`
            : remoteScanRow
              ? `Associa NFC a ${remoteScanRow.serial_number || remoteScanRow.asset_code}`
              : "Usa telefono come lettore NFC"
        }
        onTagReceived={async (nfcTagId, ctx) => {
          const row = ctx?.equipmentId
            ? remoteScanRows?.find((r) => r.id === ctx.equipmentId)
            : remoteScanRow;
          if (row) {
            try {
              await saveNfcAssociation(row, nfcTagId);
              toast.success("NFC associato");
              await loadAssets();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Errore associazione");
            }
          }
        }}
      />
    </main>
  );
}
