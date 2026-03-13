"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useAuth } from "../../_lib/hooks/useAuth";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import { useToast } from "../../_lib/ToastContext";
import { fmtDateTime } from "../../_lib/utils";
import {
  EQUIPMENT_AREA_LABELS,
  EQUIPMENT_MOVEMENT_LABELS,
  EQUIPMENT_MOVEMENT_STATUS_LABELS,
  EQUIPMENT_RESOLUTION_LABELS,
  EQUIPMENT_RESOLUTION_TYPE_OPTIONS,
  EQUIPMENT_STATUS_LABELS,
  equipmentMovementPillStyle,
  equipmentStatusStyle,
} from "../../_lib/equipment";
import { equipmentMovementSchema } from "../../_lib/validations";
import ConfirmModal from "../../_components/ConfirmModal";
import RemoteNfcScanModal from "./RemoteNfcScanModal";
import type {
  EquipmentArea,
  EquipmentAssetRow,
  EquipmentMovementRow,
  EquipmentResolutionType,
} from "../../_lib/types";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

type MovementFormState = {
  equipment_id: string;
  type: "OUT";
  note: string;
  destination: string;
  assigned_to_name: string;
  assigned_to_email: string;
  assigned_to_badge: string;
};

type GroupEditState = Record<
  string,
  {
    resolutionType: EquipmentResolutionType;
    closeNote: string;
  }
>;

type UserProfileInfo = {
  fullName: string;
  badge: string;
  email: string;
};

type ScanResultState = {
  asset: EquipmentAssetRow;
  source: "barcode" | "nfc";
  mode: "NORMAL" | "CART";
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  badge_number: string | null;
};

const supabase = createClient();

const emptyForm: MovementFormState = {
  equipment_id: "",
  type: "OUT",
  note: "",
  destination: "",
  assigned_to_name: "",
  assigned_to_email: "",
  assigned_to_badge: "",
};

function normalizeNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as Record<string, unknown>;
    const parts = [
      maybe.message,
      maybe.details,
      maybe.hint,
      maybe.code,
      maybe.error_description,
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => String(v).trim());
    if (parts.length > 0) return parts.join(" | ");

    try {
      const raw = JSON.stringify(error);
      if (raw && raw !== "{}") return raw;
    } catch {
      /* ignore */
    }
    try {
      const keys = Object.getOwnPropertyNames(error);
      const extras = keys
        .filter((k) => !["message", "details", "hint", "code"].includes(k))
        .map((k) => `${k}: ${String((error as Record<string, unknown>)[k])}`)
        .filter((s) => s.length < 200);
      if (extras.length > 0) return extras.join("; ");
    } catch {
      /* ignore */
    }
  }
  return "errore sconosciuto";
}

function sameUser(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a === b;
}

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
  style?: Record<string, string | number>;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { id, value, onChange, disabled, placeholder, style, onFocus, onKeyDown } = props;
  const showClear = !disabled && value.length > 0;

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        className="input"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        style={{
          ...style,
          paddingRight: showClear ? 36 : style?.paddingRight,
        }}
      />
      {showClear && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Cancella contenuto"
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

function getMovementStatus(row: EquipmentMovementRow) {
  return row.status ?? "OPEN";
}

function getMovementResolution(row: EquipmentMovementRow) {
  return row.resolution_type ?? "RETURN";
}

export default function EquipmentMovementsClient({ area, basePath }: Props) {
  const searchParams = useSearchParams();
  const { user, loading: authLoading, approved } = useAuth();
  const access = useIsAdmin();
  const isAdmin = area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;
  const toast = useToast();
  const initialAssetId = searchParams.get("asset") ?? "";

  const [assets, setAssets] = useState<EquipmentAssetRow[]>([]);
  const [history, setHistory] = useState<EquipmentMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<"NORMAL" | "CART">("NORMAL");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<string>("");
  const [assetOpen, setAssetOpen] = useState(false);
  const [assetActiveIndex, setAssetActiveIndex] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<string[]>([]);
  const [cartNote, setCartNote] = useState("");
  const [cartDestination, setCartDestination] = useState("");
  const [cartInterventionPlanEnabled, setCartInterventionPlanEnabled] = useState(false);
  const [cartInterventionPlanNumber, setCartInterventionPlanNumber] = useState("");
  const [profileInfo, setProfileInfo] = useState<UserProfileInfo | null>(null);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [searchByNfcScanning, setSearchByNfcScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultState | null>(null);
  const [remoteScanOpen, setRemoteScanOpen] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [form, setForm] = useState<MovementFormState>(() => ({
    ...emptyForm,
    equipment_id: initialAssetId,
  }));
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState<EquipmentMovementRow | null>(null);
  const [closingGroup, setClosingGroup] = useState<EquipmentMovementRow[]>([]);
  const [closeResolutionType, setCloseResolutionType] = useState<EquipmentResolutionType>("RETURN");
  const [closeNote, setCloseNote] = useState("");
  const [groupEditState, setGroupEditState] = useState<GroupEditState>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const assetBoxRef = useRef<HTMLDivElement | null>(null);

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
    try {
      const cached = localStorage.getItem(`equipment_cart_${area}`);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const normalized = parsed.filter((value) => typeof value === "string");
        setCart(normalized);
        if (normalized.length > 0) {
          setCartOpen(true);
          setScanMode("CART");
        }
      }
    } catch {}
  }, [area]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cart.length === 0) localStorage.removeItem(`equipment_cart_${area}`);
    else localStorage.setItem(`equipment_cart_${area}`, JSON.stringify(cart));
  }, [area, cart]);

  useEffect(() => {
    setIsNfcSupported(typeof NDEFReader !== "undefined");
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  const loadCurrentProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("badge_number, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (error) {
      console.error(error);
      return;
    }

    const fullName = `${String(data?.first_name ?? "").trim()} ${String(data?.last_name ?? "").trim()}`.trim();
    const badge = String(data?.badge_number ?? "").trim();
    setProfileInfo({
      fullName,
      badge,
      email: user.email ?? "",
    });
  }, [user]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    const [assetsRes, historyRes] = await Promise.all([
      supabase.from("equipment_assets").select("*").eq("equipment_area", area).order("serial_number", { ascending: true }),
      supabase.from("equipment_movements").select("*").eq("equipment_area", area).order("created_at", { ascending: false }).limit(300),
    ]);

    if (assetsRes.error) {
      console.error(assetsRes.error);
      setAssets([]);
      setMsg("Errore caricamento attrezzature.");
    } else {
      setAssets((assetsRes.data ?? []) as EquipmentAssetRow[]);
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
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadData]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadCurrentProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadCurrentProfile]);

  useEffect(() => {
    if (!profileInfo) return;
    setForm((prev) => ({
      ...prev,
      assigned_to_name: profileInfo.fullName,
      assigned_to_email: profileInfo.email,
      assigned_to_badge: profileInfo.badge,
    }));
  }, [profileInfo]);

  function resetPickupFields() {
    setForm({ ...emptyForm });
    setAssetSearch("");
    setAssetCategoryFilter("");
    setAssetOpen(false);
    setAssetActiveIndex(0);
    setCart([]);
    setCartNote("");
    setCartDestination("");
    setCartInterventionPlanEnabled(false);
    setCartInterventionPlanNumber("");
    setCartOpen(false);
    setScanMode("NORMAL");
    setScanResult(null);
    setMsg(null);
  }

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectedAsset = form.equipment_id ? assetMap.get(form.equipment_id) ?? null : null;
  const cartItems = useMemo(() => cart.map((id) => assetMap.get(id)).filter(Boolean) as EquipmentAssetRow[], [assetMap, cart]);

  const warehouses = useMemo(() => {
    const set = new Set<string>();
    for (const asset of assets) {
      const w = (asset.warehouse ?? "").trim();
      if (w) set.add(w);
    }
    return Array.from(set).sort();
  }, [assets]);

  const assetsByWarehouse = useMemo(() => {
    if (!warehouseFilter) return [];
    return assets.filter((asset) => (asset.warehouse ?? "").trim() === warehouseFilter);
  }, [assets, warehouseFilter]);

  const assetCategories = useMemo(() => {
    const set = new Set<string>();
    for (const asset of assetsByWarehouse) {
      const c = (asset.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  }, [assetsByWarehouse]);

  const filteredAssets = useMemo(() => {
    let base = assetsByWarehouse;
    if (assetCategoryFilter) base = base.filter((asset) => (asset.category ?? "").trim() === assetCategoryFilter);
    const search = assetSearch.trim().toLowerCase();
    if (!search) return base;
    return base.filter((asset) =>
      [asset.serial_number, asset.name, asset.category, asset.barcode, asset.nfc_tag_id, asset.assigned_to_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [assetSearch, assetsByWarehouse, assetCategoryFilter]);

  const warehouseSelected = !!warehouseFilter;

  const assetMatches = useMemo(() => filteredAssets.slice(0, 12), [filteredAssets]);
  const assetActive = useMemo(() => assetMatches[assetActiveIndex] ?? null, [assetActiveIndex, assetMatches]);

  const uniqueHistoryRows = useMemo(() => {
    const seen = new Set<string>();
    return history.filter((row) => {
      const gid = row.movement_group_id;
      if (gid) {
        if (seen.has(gid)) return false;
        seen.add(gid);
      }
      return true;
    });
  }, [history]);

  const openMovements = useMemo(
    () => uniqueHistoryRows.filter((row) => getMovementStatus(row) === "OPEN"),
    [uniqueHistoryRows]
  );

  const selectedAssetHasOpenMovement = useMemo(() => {
    if (!selectedAsset) return false;
    return history.some((row) => row.equipment_id === selectedAsset.id && getMovementStatus(row) === "OPEN");
  }, [history, selectedAsset]);

  const scanResultHasOpenMovement = useMemo(() => {
    if (!scanResult) return false;
    return history.some((row) => row.equipment_id === scanResult.asset.id && getMovementStatus(row) === "OPEN");
  }, [history, scanResult]);

  const scanResultAlreadyInCart = useMemo(() => {
    if (!scanResult) return false;
    return cart.includes(scanResult.asset.id);
  }, [cart, scanResult]);

  const scanResultCanPickup = !!scanResult && scanResult.asset.status === "AVAILABLE" && !scanResultHasOpenMovement;

  useEffect(() => {
    if (!selectedAsset || assetSearch.trim()) return;
    setAssetSearch(`${selectedAsset.serial_number || selectedAsset.asset_code} - ${selectedAsset.name}`);
  }, [selectedAsset, assetSearch]);

  function applySearchResult(value: string, mode: "barcode" | "nfc") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    if (!warehouseSelected) {
      setMsg("Seleziona prima il magazzino da cui prelevare.");
      return;
    }
    setAssetSearch(value.trim());
    const searchBase = warehouseSelected ? assetsByWarehouse : [];
    const matched = searchBase.find((asset) => {
      if (mode === "barcode") {
        return [asset.barcode, asset.serial_number, asset.asset_code]
          .filter(Boolean)
          .some((item) => String(item).trim().toLowerCase() === normalized);
      }
      return String(asset.nfc_tag_id ?? "").trim().toLowerCase() === normalized;
    });
    if (matched) {
      setForm((prev) => ({ ...prev, equipment_id: matched.id }));
      setAssetSearch(`${matched.serial_number || matched.asset_code} - ${matched.name}`);
      setAssetOpen(false);
      setMsg(null);
      setScanResult({ asset: matched, source: mode, mode: scanMode });
    } else {
      setMsg(mode === "barcode" ? "Nessuna attrezzatura trovata per questo barcode nel magazzino selezionato." : "Nessuna attrezzatura associata a questo tag NFC nel magazzino selezionato.");
    }
  }

  function pickAsset(row: EquipmentAssetRow) {
    setForm((prev) => ({ ...prev, equipment_id: row.id }));
    setAssetSearch(`${row.serial_number || row.asset_code} - ${row.name}`);
    setAssetOpen(false);
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

  function restartCartScanner(source: "barcode" | "nfc") {
    setCartOpen(false);
    if (source === "barcode") {
      void startCameraScanForSearch();
      return;
    }
    void searchByNfc();
  }

  function resetScannedSelection() {
    const nextSource = scanResult?.source ?? null;
    const shouldResumeCartScan = scanResult?.mode === "CART";
    setScanResult(null);
    setForm((prev) => ({ ...prev, equipment_id: "" }));
    setAssetSearch("");
    setAssetOpen(false);
    setAssetActiveIndex(0);
    setMsg(null);
    if (shouldResumeCartScan && nextSource) restartCartScanner(nextSource);
  }

  async function confirmScannedSinglePickup() {
    setScanResult(null);
    await saveMovement();
  }

  function addScannedToCartQuick() {
    const nextSource = scanResult?.source ?? null;
    setScanResult(null);
    addSelectedToCart();
    if (nextSource) restartCartScanner(nextSource);
  }

  useEffect(() => {
    setAssetActiveIndex(0);
  }, [assetSearch]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!assetBoxRef.current) return;
      if (!assetBoxRef.current.contains(e.target as Node)) setAssetOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function addSelectedToCart() {
    if (!selectedAsset) {
      setMsg("Seleziona un'attrezzatura prima di aggiungerla al carrello.");
      return;
    }
    if (selectedAsset.status !== "AVAILABLE") {
      setMsg("Puoi aggiungere al carrello solo attrezzature disponibili.");
      return;
    }
    if (selectedAssetHasOpenMovement) {
      setMsg("Questa attrezzatura ha già un movimento aperto.");
      return;
    }
    if (cart.includes(selectedAsset.id)) {
      setMsg("Attrezzatura già presente nel carrello.");
      setCartOpen(true);
      return;
    }
    setCart((prev) => [...prev, selectedAsset.id]);
    setCartOpen(true);
    setForm((prev) => ({ ...prev, equipment_id: "" }));
    setAssetSearch("");
    setAssetOpen(false);
    setAssetActiveIndex(0);
    setScanMode("CART");
    setMsg("Attrezzatura aggiunta al carrello.");
  }

  function addAssetByNfcToCart(nfcTagId: string) {
    if (!warehouseSelected) return;
    const normalized = nfcTagId.trim().toLowerCase();
    if (!normalized) return;
    const matched = assetsByWarehouse.find(
      (a) => String(a.nfc_tag_id ?? "").trim().toLowerCase() === normalized
    );
    if (!matched) {
      setMsg("Nessuna attrezzatura associata a questo tag NFC nel magazzino selezionato.");
      return;
    }
    if (matched.status !== "AVAILABLE") {
      setMsg("L'attrezzatura non è disponibile.");
      return;
    }
    const hasOpen = history.some(
      (row) => row.equipment_id === matched.id && getMovementStatus(row) === "OPEN"
    );
    if (hasOpen) {
      setMsg("Questa attrezzatura ha già un movimento aperto.");
      return;
    }
    if (cart.includes(matched.id)) {
      setMsg("Attrezzatura già nel carrello.");
      setCartOpen(true);
      return;
    }
    setCart((prev) => [...prev, matched.id]);
    setCartOpen(true);
    setScanMode("CART");
    setMsg("Aggiunta al carrello.");
  }

  function removeCartItem(id: string) {
    setCart((prev) => prev.filter((item) => item !== id));
  }

  async function confirmCartPickup() {
    if (!warehouseSelected) {
      setMsg("Seleziona prima il magazzino da cui prelevare.");
      return;
    }
    if (!user?.id) {
      setMsg("Devi essere loggato.");
      return;
    }
    if (cartItems.length === 0) {
      setMsg("Il carrello è vuoto.");
      return;
    }
    if (!cartDestination.trim()) {
      setMsg("La destinazione è obbligatoria.");
      return;
    }
    if (!profileInfo?.fullName || !profileInfo.badge) {
      setMsg("Completa nome, cognome e badge nel profilo prima di usare il carrello.");
      return;
    }

    const unavailable = cartItems.filter((item) => item.status !== "AVAILABLE");
    if (unavailable.length > 0) {
      setMsg("Alcune attrezzature nel carrello non sono più disponibili. Aggiorna e riprova.");
      return;
    }

    const alreadyOpen = cartItems.filter((item) =>
      history.some((row) => row.equipment_id === item.id && getMovementStatus(row) === "OPEN")
    );
    if (alreadyOpen.length > 0) {
      setMsg("Alcune attrezzature nel carrello hanno già un movimento aperto.");
      return;
    }

    setCartBusy(true);
    setMsg(null);

    try {
      const movementGroupId = crypto.randomUUID();
      for (const item of cartItems) {
        const { error } = await supabase.from("equipment_movements").insert({
          equipment_id: item.id,
          equipment_area: area,
          type: "OUT",
          status: "OPEN",
          note: normalizeNullable(cartNote),
          destination: normalizeNullable(cartDestination),
          intervention_plan_number: cartInterventionPlanEnabled ? normalizeNullable(cartInterventionPlanNumber) : null,
          created_by: user.id,
          created_by_name: profileInfo.fullName,
          created_by_email: user.email ?? null,
          assigned_to_name: profileInfo.fullName,
          assigned_to_email: user.email ?? null,
          assigned_to_badge: profileInfo.badge,
          resolution_type: null,
          close_note: null,
          closed_at: null,
          closed_by: null,
          movement_group_id: movementGroupId,
          details_json: {
            asset_code: item.asset_code,
            asset_name: item.name,
            equipment_area: area,
            mode: "cart",
          },
        });
        if (error) throw error;
      }

      resetPickupFields();
      toast.success("Prelievo multiplo registrato");
      await loadData();
    } catch (error: unknown) {
      console.error("equipment cart close error:", error);
      const message = describeError(error);
      setMsg("Registrazione carrello non riuscita: " + message);
    } finally {
      setCartBusy(false);
    }
  }

  async function saveMovement() {
    if (!warehouseSelected) {
      setMsg("Seleziona prima il magazzino da cui prelevare.");
      return;
    }
    if (!selectedAsset) {
      setMsg("Seleziona un'attrezzatura.");
      return;
    }
    if (selectedAsset.status !== "AVAILABLE") {
      setMsg("Puoi aprire un movimento solo su attrezzature disponibili.");
      return;
    }
    if (selectedAssetHasOpenMovement) {
      setMsg("Questa attrezzatura ha già un movimento aperto.");
      return;
    }

    const parsed = equipmentMovementSchema.safeParse(form);
    if (!parsed.success) {
      setMsg(parsed.error.issues[0]?.message ?? "Verifica i dati inseriti.");
      return;
    }

    setSaving(true);
    setMsg(null);

    const { error } = await supabase.from("equipment_movements").insert({
      equipment_id: form.equipment_id,
      equipment_area: area,
      type: "OUT",
      status: "OPEN",
      note: normalizeNullable(form.note),
      destination: normalizeNullable(form.destination),
      created_by: user?.id ?? null,
      created_by_name: profileInfo?.fullName || user?.email || null,
      created_by_email: user?.email ?? null,
      assigned_to_name: normalizeNullable(form.assigned_to_name),
      assigned_to_email: normalizeNullable(form.assigned_to_email),
      assigned_to_badge: normalizeNullable(form.assigned_to_badge),
      resolution_type: null,
      close_note: null,
      closed_at: null,
      closed_by: null,
      movement_group_id: null,
      details_json: {
        asset_code: selectedAsset.asset_code ?? null,
        asset_name: selectedAsset.name ?? null,
        equipment_area: area,
        mode: "single",
      },
    });

    if (error) {
      const errMsg = describeError(error);
      console.error("equipment movement create error:", errMsg, error);
      setMsg("Registrazione movimento non riuscita: " + errMsg);
      setSaving(false);
      return;
    }

    toast.success("Prelievo registrato");
    resetPickupFields();
    await loadData();
    setSaving(false);
  }

  function canEditRow(row: EquipmentMovementRow) {
    return sameUser(row.created_by, user?.id) || isAdmin;
  }

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
      await loadData();
    } catch (error: unknown) {
      const message = describeError(error);
      setMsg("Eliminazione non riuscita: " + message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    await executeDeleteMovement(deleteConfirm);
    if (closing?.id === deleteConfirm.id) closeModal();
    setDeleteConfirm(null);
  }

  function closeModal() {
    setCloseOpen(false);
    setClosing(null);
    setClosingGroup([]);
    setCloseResolutionType("RETURN");
    setCloseNote("");
    setGroupEditState({});
    setMsg(null);
  }

  async function openCloseModal(row: EquipmentMovementRow) {
    setMsg(null);

    let group: EquipmentMovementRow[] = [row];
    if (row.movement_group_id) {
      const { data: groupData, error } = await supabase
        .from("equipment_movements")
        .select("*")
        .eq("movement_group_id", row.movement_group_id)
        .order("created_at", { ascending: true });
      if (!error && groupData?.length) {
        group = groupData as EquipmentMovementRow[];
      }
    }

    setClosing(row);
    setClosingGroup(group);
    setCloseResolutionType(getMovementResolution(row));
    setCloseNote(row.close_note ?? "");

    const initState: GroupEditState = {};
    for (const movement of group) {
      initState[movement.id] = {
        resolutionType: getMovementResolution(movement),
        closeNote: movement.close_note ?? "",
      };
    }
    setGroupEditState(initState);
    setCloseOpen(true);
  }

  async function confirmClose() {
    if (!closing) return;
    const targetRows = closingGroup.length > 1 && closing.movement_group_id ? closingGroup : [closing];

    if (targetRows.some((row) => getMovementStatus(row) === "OPEN" && !canEditRow(row))) {
      setMsg("Solo il creatore del movimento o l'admin può chiudere questa uscita.");
      return;
    }

    const now = new Date().toISOString();
    setSaving(true);
    setMsg(null);

    try {
      for (const row of targetRows) {
        if (getMovementStatus(row) === "CLOSED") continue;
        const resolutionType = targetRows.length > 1 ? groupEditState[row.id]?.resolutionType : closeResolutionType;
        const note = targetRows.length > 1 ? groupEditState[row.id]?.closeNote : closeNote;

        if (!resolutionType) {
          setMsg("Seleziona l'esito finale prima di confermare la chiusura.");
          setSaving(false);
          return;
        }

        const { error } = await supabase
          .from("equipment_movements")
          .update({
            status: "CLOSED",
            resolution_type: resolutionType,
            close_note: normalizeNullable(note ?? ""),
            closed_at: now,
            closed_by: user?.id ?? null,
          } as never)
          .eq("id", row.id);

        if (error) throw error;
      }

      toast.success(targetRows.length > 1 ? "Gruppo chiuso" : "Movimento chiuso");
      await loadData();
      closeModal();
    } catch (error) {
      console.error("equipment movement close error:", error);
      const message = describeError(error);
      const maybeSchemaHint =
        message === "errore sconosciuto"
          ? " Verifica anche di aver eseguito l'ultimo SQL attrezzature, perché la chiusura usa i nuovi campi OPEN/CLOSED."
          : "";
      setMsg("Chiusura movimento non riuscita: " + message + maybeSchemaHint);
    } finally {
      setSaving(false);
    }
  }

  const areaLabel = EQUIPMENT_AREA_LABELS[area];

  if (authLoading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel} - Movimenti</div>
        </div>
        <div className="card" style={{ padding: 12 }}>Caricamento...</div>
      </main>
    );
  }

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Attrezzature {areaLabel} - Movimenti</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="equipmentSectionHeader" style={{ marginBottom: 10 }}>
          <div>
            <div className="equipmentSectionTitle">Uscita attrezzature</div>
            <div className="equipmentSectionHint">
              Stessa logica dei materiali: l&apos;uscita si apre subito e rimane aperta finché non viene chiusa o rettificata.
            </div>
          </div>
          <div className="equipmentAreaPill">Area: {areaLabel}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
          <div className="mobileInputFull" style={{ minWidth: 240 }}>
            <label className="label" htmlFor={`move-warehouse-${area}`}>Magazzino prelievo *</label>
            <select
              id={`move-warehouse-${area}`}
              className="input"
              value={warehouseFilter}
              onChange={(e) => {
                const value = e.target.value;
                setWarehouseFilter(value);
                setForm((prev) => ({ ...prev, equipment_id: "" }));
                setAssetCategoryFilter("");
                setAssetSearch("");
                setCart([]);
                setCartOpen(false);
                setMsg(null);
              }}
            >
              <option value="">— Seleziona magazzino —</option>
              {warehouses.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          {!warehouseSelected && (
            <div style={{ padding: 10, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 12, fontWeight: 700, color: "#b45309" }}>
              Seleziona il magazzino prima di continuare.
            </div>
          )}
          {warehouses.length === 0 && !loading && (
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Nessun magazzino configurato. Assegna un magazzino alle attrezzature in Tutte le attrezzature.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, opacity: warehouseSelected ? 1 : 0.5, pointerEvents: warehouseSelected ? "auto" : "none" }}>
          <div className="mobileInputFull" style={{ minWidth: 240 }}>
            <label className="label" htmlFor={`move-mode-${area}`}>Modalità uscita</label>
            <select
              id={`move-mode-${area}`}
              className="input"
              value={scanMode}
              onChange={(e) => {
                const nextMode = e.target.value as "NORMAL" | "CART";
                setScanMode(nextMode);
                if (nextMode === "CART") setCartOpen(true);
                else setCartOpen(false);
              }}
              disabled={!warehouseSelected}
            >
              <option value="NORMAL">Normale</option>
              <option value="CART">Carrello multiplo {cart.length > 0 ? `(${cart.length})` : ""}</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={startCameraScanForSearch} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} disabled={!warehouseSelected}>
              <BarcodeIcon />
              Barcode
            </button>
            <button className="btn" onClick={searchByNfc} disabled={searchByNfcScanning || !warehouseSelected} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <NfcIcon />
              {searchByNfcScanning ? "NFC..." : "NFC"}
            </button>
            <button className="btn" onClick={() => setRemoteScanOpen(true)} disabled={!warehouseSelected} type="button" title="Usa telefono come lettore NFC" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              📱 Telefono
            </button>
          </div>
        </div>

        <div className="equipmentFilterGrid mobileGrid1" style={{ opacity: warehouseSelected ? 1 : 0.5, pointerEvents: warehouseSelected ? "auto" : "none" }}>
          <div style={{ minWidth: 0 }}>
            <label className="label" htmlFor={`move-category-${area}`}>Categoria</label>
            <select
              id={`move-category-${area}`}
              className="input"
              value={assetCategoryFilter}
              onChange={(e) => setAssetCategoryFilter(e.target.value)}
              disabled={!warehouseSelected}
            >
              <option value="">Tutte</option>
              {assetCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div ref={assetBoxRef} style={{ minWidth: 0, position: "relative" }}>
            <label className="label" htmlFor={`move-search-${area}`}>Attrezzatura</label>
            <ClearableInput
              id={`move-search-${area}`}
              value={assetSearch}
              disabled={!warehouseSelected}
              onChange={(value) => {
                setAssetSearch(value);
                setForm((prev) => ({ ...prev, equipment_id: "" }));
                setAssetOpen(true);
                setMsg(null);
              }}
              onFocus={() => setAssetOpen(true)}
              onKeyDown={(e) => {
                if (!assetOpen) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setAssetActiveIndex((i) => Math.min(i + 1, assetMatches.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setAssetActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (assetActive) pickAsset(assetActive);
                } else if (e.key === "Escape") {
                  setAssetOpen(false);
                }
              }}
            />
            {assetOpen && assetSearch.trim() && (
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
                {assetMatches.length === 0 ? (
                  <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
                ) : (
                  assetMatches.map((asset, idx) => {
                    const ledColor = asset.status === "AVAILABLE" ? "#22c55e" : "#ef4444";
                    return (
                    <div
                      key={asset.id}
                      onMouseEnter={() => setAssetActiveIndex(idx)}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pickAsset(asset);
                      }}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        background: idx === assetActiveIndex ? "#eef2ff" : "white",
                        borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <span
                        title={EQUIPMENT_STATUS_LABELS[asset.status]}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: ledColor,
                          boxShadow: `0 0 6px ${ledColor}`,
                          flexShrink: 0,
                          marginTop: 5,
                        }}
                        aria-hidden
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900, color: "#0f172a" }}>{asset.serial_number || asset.asset_code}</div>
                        <div style={{ fontSize: 12, color: "#334155" }}>{asset.name}</div>
                        {(asset.shelf || asset.place) && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Scaffale: {[asset.shelf, asset.place].filter(Boolean).join(" · ") || "—"}</div>
                        )}
                        {asset.notes && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.notes}</div>
                        )}
                      </div>
                    </div>
                  );
                  })
                )}
              </div>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <label className="label" htmlFor={`move-asset-${area}`}>Selezione rapida</label>
            <select
              id={`move-asset-${area}`}
              className="input"
              value={form.equipment_id}
              disabled={!warehouseSelected}
              onChange={(e) => {
                const value = e.target.value;
                const asset = assetMap.get(value) ?? null;
                setForm((prev) => ({ ...prev, equipment_id: value }));
                if (asset) setAssetSearch(`${asset.serial_number || asset.asset_code} - ${asset.name}`);
              }}
            >
              <option value="">Seleziona attrezzatura</option>
              {filteredAssets.map((asset) => {
                const led = asset.status === "AVAILABLE" ? "🟢" : "🔴";
                const shelfInfo = [asset.shelf, asset.place].filter(Boolean).join(" · ");
                return (
                <option key={asset.id} value={asset.id}>
                  {led} {(asset.serial_number || asset.asset_code)} - {asset.name}
                  {shelfInfo ? ` · Scaffale: ${shelfInfo}` : ""}
                  {asset.notes ? ` · ${asset.notes}` : ""}
                </option>
              );
              })}
            </select>
          </div>

          <div style={{ minWidth: 0 }}>
            <label className="label" htmlFor={`move-note-${area}`}>Note</label>
            <ClearableInput
              id={`move-note-${area}`}
              value={scanMode === "CART" ? cartNote : form.note}
              disabled={!warehouseSelected}
              onChange={(value) => {
                if (scanMode === "CART") setCartNote(value);
                else setForm((prev) => ({ ...prev, note: value }));
              }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <label className="label" htmlFor={`move-destination-${area}`}>Destinazione *</label>
            <ClearableInput
              id={`move-destination-${area}`}
              value={scanMode === "CART" ? cartDestination : form.destination}
              disabled={!warehouseSelected}
              onChange={(value) => {
                if (scanMode === "CART") setCartDestination(value);
                else setForm((prev) => ({ ...prev, destination: value }));
              }}
            />
          </div>

          {scanMode === "CART" && (
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: warehouseSelected ? "pointer" : "not-allowed", margin: 0 }}>
                <input
                  type="checkbox"
                  checked={cartInterventionPlanEnabled}
                  disabled={!warehouseSelected}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setCartInterventionPlanEnabled(checked);
                    if (!checked) setCartInterventionPlanNumber("");
                  }}
                  style={{ width: 18, height: 18, accentColor: "#0f172a" }}
                  aria-label="Inserisci piano di intervento"
                />
                <span className="label" style={{ margin: 0 }}>Piano d&apos;intervento</span>
              </label>
              <ClearableInput
                id={`move-intervention-plan-${area}`}
                value={cartInterventionPlanNumber}
                onChange={setCartInterventionPlanNumber}
                disabled={!cartInterventionPlanEnabled || !warehouseSelected}
                style={{ flex: 1, minWidth: 0, opacity: cartInterventionPlanEnabled ? 1 : 0.6 }}
              />
            </div>
          )}

          <div style={{ minWidth: 0, display: "flex", alignItems: "end" }}>
            {scanMode === "CART" ? (
              <button className="btn btnPrimary" onClick={addSelectedToCart} disabled={!warehouseSelected || !selectedAsset} type="button">
                Aggiungi al carrello
              </button>
            ) : (
              <button className="btn btnPrimary" onClick={saveMovement} disabled={!warehouseSelected || saving || !form.equipment_id} type="button">
                {saving ? "Salvataggio..." : "Conferma prelievo"}
              </button>
            )}
          </div>
        </div>

        {selectedAsset && (
          <div className="equipmentInfoGrid" style={{ marginTop: 12 }}>
            <div>
              <div className="equipmentInfoLabel">Seriale</div>
              <div className="equipmentInfoValue">{selectedAsset.serial_number || selectedAsset.asset_code}</div>
            </div>
            <div>
              <div className="equipmentInfoLabel">Nome</div>
              <div className="equipmentInfoValue">{selectedAsset.name}</div>
            </div>
            <div>
              <div className="equipmentInfoLabel">Scaffale</div>
              <div className="equipmentInfoValue">
                {[selectedAsset.shelf, selectedAsset.place].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div>
              <div className="equipmentInfoLabel">Stato corrente</div>
              <div style={{ marginTop: 4 }}>
                <span style={equipmentStatusStyle(selectedAsset.status)}>{EQUIPMENT_STATUS_LABELS[selectedAsset.status]}</span>
              </div>
            </div>
            <div>
              <div className="equipmentInfoLabel">Assegnata a</div>
              <div className="equipmentInfoValue">
                {[selectedAsset.assigned_to_name, selectedAsset.assigned_to_badge ? `Badge ${selectedAsset.assigned_to_badge}` : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </div>
            </div>
          </div>
        )}

        {msg && <div style={{ marginTop: 12, fontWeight: 800, whiteSpace: "pre-wrap" }}>{msg}</div>}
      </div>

      {scanMode === "CART" && (cartOpen || cart.length > 0) && (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div className="equipmentSectionHeader">
            <div>
              <div className="equipmentSectionTitle">Carrello prelievo multiplo</div>
              <div className="equipmentSectionHint">
                Ogni attrezzatura genera una sua uscita `OPEN`, ma il gruppo rimane collegato per la chiusura successiva.
              </div>
            </div>
          </div>

          <div className="tableWrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Seriale</th>
                  <th>Nome</th>
                  <th>Scaffale</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {cartItems.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Carrello vuoto.</td>
                  </tr>
                ) : (
                  cartItems.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 900 }}>{item.serial_number || item.asset_code}</td>
                      <td>{item.name}</td>
                      <td>{[item.shelf, item.place].filter(Boolean).join(" · ") || "—"}</td>
                      <td><span style={equipmentStatusStyle(item.status)}>{EQUIPMENT_STATUS_LABELS[item.status]}</span></td>
                      <td>
                        <button className="btn" onClick={() => removeCartItem(item.id)} disabled={cartBusy} type="button">
                          Rimuovi
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Righe: {cartItems.length}</div>
            <button className="btn btnPrimary" onClick={confirmCartPickup} disabled={!warehouseSelected || cartBusy || cartItems.length === 0} type="button">
              {cartBusy ? "Salvataggio..." : "Conferma prelievo"}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="equipmentSectionHeader">
          <div>
            <div className="equipmentSectionTitle">Movimenti aperti</div>
            <div className="equipmentSectionHint">
              Le uscite aperte restano qui finché non vengono chiuse o rettificate.
            </div>
          </div>
        </div>

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Stato</th>
                <th>Tipo</th>
                <th>Attrezzatura</th>
                <th>Da</th>
                <th>A</th>
                <th>Assegnatario</th>
                <th>Note</th>
                <th>Inserito da</th>
                {isAdmin && <th>Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9}>Caricamento...</td>
                </tr>
              ) : openMovements.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9}>Nessun movimento aperto.</td>
                </tr>
              ) : (
                openMovements.map((row) => {
                  const asset = assetMap.get(row.equipment_id);
                  const title = row.movement_group_id ? "Clicca per chiudere / rettificare il gruppo" : "Clicca per chiudere / rettificare";
                  const busy = deletingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openCloseModal(row)}
                      style={{ cursor: "pointer", background: "rgba(148,163,184,0.18)" }}
                      title={title}
                    >
                      <td>{fmtDateTime(row.created_at)}</td>
                      <td>
                        <span
                          className="openStripe"
                          style={(() => {
                            const s = equipmentMovementPillStyle("OPEN");
                            const { background, ...rest } = s;
                            return rest;
                          })()}
                        >
                          {EQUIPMENT_MOVEMENT_STATUS_LABELS.OPEN}
                        </span>
                      </td>
                      <td><span style={equipmentMovementPillStyle("OUT")}>{EQUIPMENT_MOVEMENT_LABELS.OUT}</span></td>
                      <td style={{ fontWeight: 900 }}>
                        {row.movement_group_id
                          ? `Prelievo multiplo (${history.filter((m) => m.movement_group_id === row.movement_group_id).length} attrezzature)`
                          : asset
                            ? `${asset.serial_number || asset.asset_code} - ${asset.name}`
                            : row.equipment_id}
                      </td>
                      <td>{asset?.warehouse || "—"}</td>
                      <td>{row.destination || "—"}</td>
                      <td>
                        {[row.assigned_to_name, row.assigned_to_badge ? `Badge ${row.assigned_to_badge}` : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td>{row.note || "—"}</td>
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

      {scanResult && (
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
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  {scanResult.source === "barcode" ? "Scansione barcode" : "Scansione NFC"}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  {scanResult.mode === "CART" ? "Aggiunta rapida al carrello" : "Conferma prelievo singolo"}
                </div>
              </div>
              <span
                title={scanResultCanPickup ? "Disponibile" : "Indisponibile"}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  backgroundColor: scanResultCanPickup ? "#22c55e" : "#ef4444",
                  boxShadow: `0 0 8px ${scanResultCanPickup ? "#22c55e" : "#ef4444"}`,
                  flexShrink: 0,
                  marginTop: 4,
                }}
                aria-hidden
              />
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Attrezzatura</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  {scanResult.asset.serial_number || scanResult.asset.asset_code}
                </div>
                <div style={{ marginTop: 4 }}>
                  {scanResult.asset.name}
                  {scanResult.asset.notes ? ` · ${scanResult.asset.notes}` : ""}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Magazzino</div>
                  <div style={{ fontWeight: 800 }}>{scanResult.asset.warehouse || "—"}</div>
                </div>
                <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Stato</div>
                  <div style={{ fontWeight: 800 }}>{EQUIPMENT_STATUS_LABELS[scanResult.asset.status]}</div>
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${
                    scanResultAlreadyInCart
                      ? "rgba(245,158,11,0.35)"
                      : scanResultCanPickup
                        ? "rgba(34,197,94,0.25)"
                        : "rgba(239,68,68,0.25)"
                  }`,
                  background: scanResultAlreadyInCart
                    ? "rgba(245,158,11,0.10)"
                    : scanResultCanPickup
                      ? "rgba(34,197,94,0.08)"
                      : "rgba(239,68,68,0.08)",
                  fontWeight: 700,
                  color: scanResultAlreadyInCart
                    ? "#b45309"
                    : scanResultCanPickup
                      ? "#166534"
                      : "#991b1b",
                }}
              >
                {scanResultAlreadyInCart
                  ? "Attrezzatura già aggiunta al carrello."
                  : scanResultCanPickup
                  ? "Disponibile per il prelievo."
                  : scanResultHasOpenMovement
                    ? "Indisponibile: attrezzatura con movimento aperto."
                    : "Indisponibile: attrezzatura non disponibile al prelievo."}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={resetScannedSelection}>
                Indietro
              </button>
              {scanResult.mode === "CART" ? (
                <button className="btn btnPrimary" type="button" onClick={addScannedToCartQuick} disabled={!scanResultCanPickup || scanResultAlreadyInCart}>
                  Aggiungi
                </button>
              ) : (
                <button className="btn btnPrimary" type="button" onClick={confirmScannedSinglePickup} disabled={!scanResultCanPickup || saving}>
                  {saving ? "Salvataggio..." : "Conferma prelievo"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {closeOpen && closing && (
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
              position: "relative",
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {closingGroup.length > 1 ? "Dettaglio gruppo / chiusura" : "Dettaglio movimento / chiusura"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {isAdmin && (
                  <button
                    className="btn"
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (!closing) return;
                      openDeleteConfirm(closing);
                    }}
                    style={{
                      borderColor: "rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.1)",
                      color: "#991b1b",
                    }}
                  >
                    Elimina movimento
                  </button>
                )}
                <button className="btn" onClick={closeModal} type="button">Chiudi</button>
              </div>
            </div>

            {closingGroup.length <= 1 && (() => {
              const asset = assetMap.get(closing.equipment_id);
              const status = getMovementStatus(closing);
              return (
                <>
                  <div
                    style={{
                      marginTop: 14,
                      border: "1px solid rgba(59,130,246,0.25)",
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(59,130,246,0.06)",
                    }}
                  >
                    <div style={{ fontWeight: 900, marginBottom: 10 }}>Dettaglio uscita</div>
                    <table className="table" style={{ fontSize: 13, width: "100%" }}>
                      <tbody>
                        {[
                          { label: "Seriale", value: asset?.serial_number || asset?.asset_code || "—" },
                          { label: "Nome", value: asset?.name || "—" },
                          { label: "Stato movimento", value: EQUIPMENT_MOVEMENT_STATUS_LABELS[status] },
                          { label: "Tipo", value: EQUIPMENT_MOVEMENT_LABELS.OUT },
                          { label: "Area", value: EQUIPMENT_AREA_LABELS[closing.equipment_area] },
                          { label: "Assegnatario", value: [closing.assigned_to_name, closing.assigned_to_badge ? `Badge ${closing.assigned_to_badge}` : null].filter(Boolean).join(" · ") || "—" },
                          { label: "Nota uscita", value: closing.note || "—" },
                          { label: "Esito finale", value: closing.resolution_type ? EQUIPMENT_RESOLUTION_LABELS[closing.resolution_type] : "—" },
                          { label: "Nota chiusura", value: closing.close_note || "—" },
                          { label: "Data chiusura", value: closing.closed_at ? fmtDateTime(closing.closed_at) : "—" },
                        ].map((row) => (
                          <tr key={row.label}>
                            <td style={{ width: 220, padding: "8px 12px", fontWeight: 600, color: "#475569" }}>{row.label}</td>
                            <td style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 4 }}>{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {status === "OPEN" && (
                    <div
                      style={{
                        marginTop: 14,
                        border: "1px solid rgba(15,23,42,0.12)",
                        borderRadius: 14,
                        padding: 12,
                        background: "rgba(255,255,255,0.85)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900 }}>Rettifica / Chiusura uscita</div>
                        <button className="btn btnPrimary" type="button" onClick={confirmClose} disabled={saving || !canEditRow(closing)}>
                          {saving ? "Salvataggio..." : "Conferma chiusura"}
                        </button>
                      </div>

                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                        Solo il creatore del movimento o l&apos;admin può chiudere questa uscita.
                      </div>

                      <div className="mobileGrid1" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
                        <div style={{ gridColumn: "span 4" }}>
                          <label className="label" htmlFor="equipmentCloseResolution">
                            Esito finale
                          </label>
                          <select
                            id="equipmentCloseResolution"
                            className="input"
                            value={closeResolutionType}
                            onChange={(e) => setCloseResolutionType(e.target.value as EquipmentResolutionType)}
                            disabled={!canEditRow(closing)}
                          >
                            {EQUIPMENT_RESOLUTION_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{EQUIPMENT_RESOLUTION_LABELS[option]}</option>
                            ))}
                          </select>
                        </div>

                        <div style={{ gridColumn: "span 8" }}>
                          <label className="label" htmlFor="equipmentCloseNote">
                            Nota chiusura
                          </label>
                          <ClearableInput
                            id="equipmentCloseNote"
                            value={closeNote}
                            onChange={setCloseNote}
                            placeholder="Esito finale / nota rettifica"
                            disabled={!canEditRow(closing)}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                        Dopo la chiusura lo stato passa a <b>CHIUSO</b> e l&apos;asset viene aggiornato secondo l&apos;esito scelto.
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {closingGroup.length > 1 && (
              <>
                <div
                  style={{
                    marginTop: 14,
                    border: "1px solid rgba(59,130,246,0.25)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(59,130,246,0.06)",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Dettaglio gruppo</div>
                  <div style={{ fontSize: 13, color: "#475569" }}>
                    Ogni riga nasce come uscita aperta. Compila l&apos;esito di ogni attrezzatura e poi conferma la chiusura del gruppo.
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="tableWrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Seriale</th>
                          <th>Nome</th>
                          <th>Esito finale</th>
                          <th>Nota chiusura</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closingGroup.map((row) => {
                          const asset = assetMap.get(row.equipment_id);
                          const state = groupEditState[row.id] ?? {
                            resolutionType: "RETURN" as EquipmentResolutionType,
                            closeNote: "",
                          };
                          return (
                            <tr key={row.id}>
                              <td style={{ fontWeight: 900 }}>{asset?.serial_number || asset?.asset_code || row.equipment_id}</td>
                              <td>{asset?.name || "—"}</td>
                              <td>
                                <select
                                  className="input"
                                  value={state.resolutionType}
                                  onChange={(e) =>
                                    setGroupEditState((prev) => ({
                                      ...prev,
                                      [row.id]: {
                                        ...state,
                                        resolutionType: e.target.value as EquipmentResolutionType,
                                      },
                                    }))
                                  }
                                  disabled={!canEditRow(row)}
                                >
                                  {EQUIPMENT_RESOLUTION_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{EQUIPMENT_RESOLUTION_LABELS[option]}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <ClearableInput
                                  value={state.closeNote}
                                  onChange={(value) =>
                                    setGroupEditState((prev) => ({
                                      ...prev,
                                      [row.id]: {
                                        ...state,
                                        closeNote: value,
                                      },
                                    }))
                                  }
                                  placeholder="Nota chiusura"
                                  disabled={!canEditRow(row)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 16, padding: 16, border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc" }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Chiusura gruppo</div>
                  <div style={{ fontSize: 13, marginBottom: 12, color: "#64748b" }}>
                    Compila gli esiti nella tabella sopra e conferma la chiusura del gruppo.
                  </div>
                  <button className="btn btnPrimary" type="button" onClick={confirmClose} disabled={saving}>
                    {saving ? "Salvataggio..." : "Conferma chiusura gruppo"}
                  </button>
                </div>
              </>
            )}

            {msg && <div style={{ marginTop: 10, fontWeight: 800, whiteSpace: "pre-wrap" }}>{msg}</div>}
          </div>
        </div>
      )}

      {deleteConfirm && (
        <ConfirmModal
          open={!!deleteConfirm}
          title="Eliminare movimento"
          message={
            (() => {
              const asset = assetMap.get(deleteConfirm.equipment_id);
              const label = deleteConfirm.movement_group_id
                ? `Prelievo multiplo (${history.filter((m) => m.movement_group_id === deleteConfirm.movement_group_id).length} attrezzature)`
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

      <RemoteNfcScanModal
        open={remoteScanOpen}
        onClose={() => setRemoteScanOpen(false)}
        context="movement_select"
        area={area}
        allowMultiple
        title="Aggiungi attrezzature con telefono"
        onTagReceived={(nfcTagId) => {
          addAssetByNfcToCart(nfcTagId);
        }}
      />
    </main>
  );
}
