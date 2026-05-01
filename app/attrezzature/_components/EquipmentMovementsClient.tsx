"use client";

import { QRCodeSVG } from "qrcode.react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { notifyEquipmentMaintenance, notifyEquipmentSync, subscribeEquipmentSync } from "../../_lib/equipmentSync";
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
import { isRelationMissingOrNotExposedError } from "../../_lib/postgrestErrors";
import AppModalFrame from "../../_components/AppModalFrame";
import AppScanStatusModal from "../../_components/AppScanStatusModal";
import ConfirmModal from "../../_components/ConfirmModal";
import { scanFastBarcode, stopFastBarcodeScan, type FastBarcodeReader } from "../../_lib/fastBarcodeScanner";
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

type RemoteEquipmentScanEvent = {
  type?: string;
  rawValue?: string;
  source?: "barcode" | "nfc";
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

type NfcCategoryTagRow = {
  category: string;
};

type CategoryGroupRow = {
  group_name: string;
  category: string;
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

/** Filtri (Categoria, Attrezzatura, Selezione rapida): nascosti per ora. Impostare a true per mostrare. */
const SHOW_EQUIPMENT_FILTERS = false;

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

function normalizeCategoryKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
      <path d="M10 5h4" />
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

/** Esito da usare nei form di chiusura: storico DISMISS non è più selezionabile. */
function resolutionTypeForClosingForm(row: EquipmentMovementRow): EquipmentResolutionType {
  const r = row.resolution_type;
  if (r === "RETURN" || r === "MAINTENANCE") return r;
  return "RETURN";
}

function isOpenMovementConflictError(error: unknown) {
  const message = describeError(error).toLowerCase();
  return message.includes("gia aperto") || message.includes("già aperto") || message.includes("already has an open movement");
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
  const [openHistory, setOpenHistory] = useState<EquipmentMovementRow[]>([]);
  const [groupCategories, setGroupCategories] = useState<string[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroupRow[]>([]);
  const [assetGroupFilter, setAssetGroupFilter] = useState<string>("");
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
  const [remoteScanCode, setRemoteScanCode] = useState<string | null>(null);
  const [remoteScanLoading, setRemoteScanLoading] = useState(false);
  const [remoteScanError, setRemoteScanError] = useState<string | null>(null);
  const [remoteQrVisible, setRemoteQrVisible] = useState(false);
  const [remoteProcessedCount, setRemoteProcessedCount] = useState(0);
  const [categorySelectModalOpen, setCategorySelectModalOpen] = useState(false);
  const [categorySelectModalCategory, setCategorySelectModalCategory] = useState<string | null>(null);
  const [categorySelectModalSelected, setCategorySelectModalSelected] = useState<Set<string>>(new Set());
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
  /** Flusso guidato uscita: 1 = Magazzino, 2 = Attrezzatura, 3 = Dettagli e conferma */
  const [outboundStep, setOutboundStep] = useState<1 | 2 | 3>(1);
  /** Wizard prelievo in popup: quando true il flusso è dentro un modal */
  const [wizardOpen, setWizardOpen] = useState(false);
  /** Se impostato, mostriamo conferma "svuota carrello" prima di cambiare magazzino */
  const [confirmClearCartForWarehouse, setConfirmClearCartForWarehouse] = useState<string | null>(null);
  const [confirmCancelPickupOpen, setConfirmCancelPickupOpen] = useState(false);
  const movementDraftRestoredRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<FastBarcodeReader | null>(null);
  const assetBoxRef = useRef<HTMLDivElement | null>(null);
  const categoryGroupsTableMissingRef = useRef(false);
  const remotePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const cachedWarehouse = localStorage.getItem(`equipment_cart_warehouse_${area}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const normalized = parsed.filter((value) => typeof value === "string");
          setCart(normalized);
          if (normalized.length > 0) {
            setCartOpen(true);
            setScanMode("CART");
            if (cachedWarehouse && typeof cachedWarehouse === "string" && cachedWarehouse.trim()) {
              setWarehouseFilter(cachedWarehouse.trim());
            }
          }
        }
      }
    } catch {}
  }, [area]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = localStorage.getItem(`equipment_movement_draft_${area}`);
      if (!cached) return;
      const draft = JSON.parse(cached) as {
        scanMode?: "NORMAL" | "CART";
        warehouseFilter?: string;
        assetSearch?: string;
        assetCategoryFilter?: string;
        assetGroupFilter?: string;
        cartOpen?: boolean;
        cartNote?: string;
        cartDestination?: string;
        cartInterventionPlanEnabled?: boolean;
        cartInterventionPlanNumber?: string;
        outboundStep?: 1 | 2 | 3;
        wizardOpen?: boolean;
        form?: Partial<MovementFormState>;
      };
      if (draft.scanMode === "NORMAL" || draft.scanMode === "CART") setScanMode(draft.scanMode);
      if (typeof draft.warehouseFilter === "string") setWarehouseFilter(draft.warehouseFilter);
      if (typeof draft.assetSearch === "string") setAssetSearch(draft.assetSearch);
      if (typeof draft.assetCategoryFilter === "string") setAssetCategoryFilter(draft.assetCategoryFilter);
      if (typeof draft.assetGroupFilter === "string") setAssetGroupFilter(draft.assetGroupFilter);
      if (typeof draft.cartOpen === "boolean") setCartOpen(draft.cartOpen);
      if (typeof draft.cartNote === "string") setCartNote(draft.cartNote);
      if (typeof draft.cartDestination === "string") setCartDestination(draft.cartDestination);
      if (typeof draft.cartInterventionPlanEnabled === "boolean") setCartInterventionPlanEnabled(draft.cartInterventionPlanEnabled);
      if (typeof draft.cartInterventionPlanNumber === "string") setCartInterventionPlanNumber(draft.cartInterventionPlanNumber);
      if (draft.outboundStep === 1 || draft.outboundStep === 2 || draft.outboundStep === 3) setOutboundStep(draft.outboundStep);
      if (typeof draft.wizardOpen === "boolean") setWizardOpen(draft.wizardOpen);
      if (draft.form && typeof draft.form === "object") {
        setForm((prev) => ({
          ...prev,
          equipment_id: typeof draft.form.equipment_id === "string" ? draft.form.equipment_id : prev.equipment_id,
          type: draft.form.type === "OUT" ? "OUT" : prev.type,
          note: typeof draft.form.note === "string" ? draft.form.note : prev.note,
          destination: typeof draft.form.destination === "string" ? draft.form.destination : prev.destination,
          assigned_to_name: typeof draft.form.assigned_to_name === "string" ? draft.form.assigned_to_name : prev.assigned_to_name,
          assigned_to_email: typeof draft.form.assigned_to_email === "string" ? draft.form.assigned_to_email : prev.assigned_to_email,
          assigned_to_badge: typeof draft.form.assigned_to_badge === "string" ? draft.form.assigned_to_badge : prev.assigned_to_badge,
        }));
      }
    } catch {}
    finally {
      movementDraftRestoredRef.current = true;
    }
  }, [area]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cart.length === 0) {
      localStorage.removeItem(`equipment_cart_${area}`);
      localStorage.removeItem(`equipment_cart_warehouse_${area}`);
    } else {
      localStorage.setItem(`equipment_cart_${area}`, JSON.stringify(cart));
      if (warehouseFilter) localStorage.setItem(`equipment_cart_warehouse_${area}`, warehouseFilter);
    }
  }, [area, cart, warehouseFilter]);

  const hasEquipmentPersistentDraft =
    warehouseFilter.trim().length > 0 ||
    assetSearch.trim().length > 0 ||
    assetCategoryFilter.trim().length > 0 ||
    assetGroupFilter.trim().length > 0 ||
    form.equipment_id.trim().length > 0 ||
    form.note.trim().length > 0 ||
    form.destination.trim().length > 0 ||
    cart.length > 0 ||
    cartNote.trim().length > 0 ||
    cartDestination.trim().length > 0 ||
    cartInterventionPlanEnabled ||
    cartInterventionPlanNumber.trim().length > 0 ||
    scanMode === "CART" ||
    cartOpen ||
    wizardOpen ||
    outboundStep > 1;

  useEffect(() => {
    if (typeof window === "undefined" || !movementDraftRestoredRef.current) return;
    try {
      if (!hasEquipmentPersistentDraft) {
        localStorage.removeItem(`equipment_movement_draft_${area}`);
        return;
      }
      localStorage.setItem(
        `equipment_movement_draft_${area}`,
        JSON.stringify({
          scanMode,
          warehouseFilter,
          assetSearch,
          assetCategoryFilter,
          assetGroupFilter,
          cartOpen,
          cartNote,
          cartDestination,
          cartInterventionPlanEnabled,
          cartInterventionPlanNumber,
          outboundStep,
          wizardOpen,
          form,
        })
      );
    } catch {}
  }, [
    area,
    scanMode,
    warehouseFilter,
    assetSearch,
    assetCategoryFilter,
    assetGroupFilter,
    cartOpen,
    cartNote,
    cartDestination,
    cartInterventionPlanEnabled,
    cartInterventionPlanNumber,
    outboundStep,
    wizardOpen,
    form,
    hasEquipmentPersistentDraft,
    cart.length,
  ]);

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

    const categoryGroupsPromise = categoryGroupsTableMissingRef.current
      ? Promise.resolve({ data: [], error: { message: "skip" } })
      : supabase.from("equipment_category_groups").select("group_name,category").eq("equipment_area", area).order("group_name").order("category");

    const [assetsRes, historyRes, openRes, groupTagsRes, categoryGroupsRes] = await Promise.all([
      supabase.from("equipment_assets").select("*").eq("equipment_area", area).order("serial_number", { ascending: true }),
      supabase.from("equipment_movements").select("*").eq("equipment_area", area).order("created_at", { ascending: false }).limit(300),
      supabase.from("equipment_movements").select("*").eq("equipment_area", area).eq("status", "OPEN").order("created_at", { ascending: false }),
      supabase.from("equipment_nfc_category_tags").select("category").eq("equipment_area", area),
      categoryGroupsPromise,
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

    if (openRes.error) {
      console.error(openRes.error);
      setOpenHistory([]);
      setMsg((prev) => prev ?? "Errore caricamento movimenti aperti.");
    } else {
      setOpenHistory((openRes.data ?? []) as EquipmentMovementRow[]);
    }

    if (groupTagsRes.error) {
      console.error(groupTagsRes.error);
      setGroupCategories([]);
    } else {
      const categories = Array.from(
        new Set(
          ((groupTagsRes.data ?? []) as NfcCategoryTagRow[])
            .map((row) => row.category?.trim())
            .filter((value): value is string => !!value)
        )
      ).sort();
      setGroupCategories(categories);
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
        // non perdere i gruppi per errori transitori (rete, ecc.)
      }
    } else {
      setCategoryGroups((categoryGroupsRes.data ?? []) as CategoryGroupRow[]);
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
    const channel = supabase
      .channel(`equipment-movements-${area}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipment_movements", filter: `equipment_area=eq.${area}` },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipment_assets", filter: `equipment_area=eq.${area}` },
        () => void loadData()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, area, loadData]);

  useEffect(() => {
    if (!user) return;
    return subscribeEquipmentSync(area, () => void loadData());
  }, [user, area, loadData]);

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
    setForm({
      ...emptyForm,
      ...(profileInfo && {
        assigned_to_name: profileInfo.fullName,
        assigned_to_email: profileInfo.email,
        assigned_to_badge: profileInfo.badge,
      }),
    });
    setAssetSearch("");
    setAssetCategoryFilter("");
    setAssetGroupFilter("");
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

  function switchPickupMode(nextMode: "NORMAL" | "CART") {
    if (nextMode === scanMode) return;
    setScanMode(nextMode);
    setForm((prev) => ({
      ...prev,
      equipment_id: "",
      note: "",
      destination: "",
    }));
    setAssetSearch("");
    setAssetCategoryFilter("");
    setAssetGroupFilter("");
    setAssetOpen(false);
    setAssetActiveIndex(0);
    setCart([]);
    setCartOpen(nextMode === "CART");
    setCartNote("");
    setCartDestination("");
    setCartInterventionPlanEnabled(false);
    setCartInterventionPlanNumber("");
    setScanResult(null);
    setCategorySelectModalOpen(false);
    setCategorySelectModalCategory(null);
    setCategorySelectModalSelected(new Set());
    closeRemoteScanModal();
    setMsg(null);
  }

  function cancelPickupDraft() {
    resetPickupFields();
    setWarehouseFilter("");
    setOutboundStep(1);
    setWizardOpen(false);
    setCategorySelectModalOpen(false);
    setCategorySelectModalCategory(null);
    setCategorySelectModalSelected(new Set());
    setConfirmClearCartForWarehouse(null);
    closeRemoteScanModal();
    setConfirmCancelPickupOpen(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem(`equipment_cart_${area}`);
      localStorage.removeItem(`equipment_cart_warehouse_${area}`);
      localStorage.removeItem(`equipment_movement_draft_${area}`);
    }
  }

  function finalizePickupSuccess() {
    resetPickupFields();
    setWarehouseFilter("");
    setOutboundStep(1);
    setWizardOpen(false);
    setCategorySelectModalOpen(false);
    setCategorySelectModalCategory(null);
    setCategorySelectModalSelected(new Set());
    setConfirmClearCartForWarehouse(null);
    closeRemoteScanModal();
    if (typeof window !== "undefined") {
      localStorage.removeItem(`equipment_cart_${area}`);
      localStorage.removeItem(`equipment_cart_warehouse_${area}`);
      localStorage.removeItem(`equipment_movement_draft_${area}`);
    }
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

  const groupedCategories = useMemo(() => {
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

  const groupNames = useMemo(() => Array.from(new Set(groupedCategories.keys())).sort(), [groupedCategories]);

  const ungroupedCategories = useMemo(() => {
    const inGroup = new Set<string>();
    for (const row of categoryGroups) {
      const cat = (row.category ?? "").trim();
      if (cat) inGroup.add(cat);
    }
    return assetCategories.filter((c) => !inGroup.has(c));
  }, [assetCategories, categoryGroups]);

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
  const hasEquipmentWizardDraft = warehouseSelected || !!selectedAsset || cartItems.length > 0 || outboundStep > 1;

  const assetMatches = useMemo(() => filteredAssets.slice(0, 12), [filteredAssets]);
  const assetActive = useMemo(() => assetMatches[assetActiveIndex] ?? null, [assetActiveIndex, assetMatches]);
  const groupCategorySet = useMemo(
    () => new Set(groupCategories.map((category) => normalizeCategoryKey(category)).filter(Boolean)),
    [groupCategories]
  );
  const categoryAssetCountByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assetsByWarehouse) {
      const key = normalizeCategoryKey(asset.category);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [assetsByWarehouse]);

  const categoryModalAssets = useMemo(() => {
    if (!categorySelectModalCategory || !warehouseFilter) return [];
    const selectedCategoryKey = normalizeCategoryKey(categorySelectModalCategory);
    return assetsByWarehouse.filter((a) => normalizeCategoryKey(a.category) === selectedCategoryKey);
  }, [assetsByWarehouse, categorySelectModalCategory, warehouseFilter]);

  const openMovementAssetIds = useMemo(
    () => new Set(openHistory.map((row) => row.equipment_id)),
    [openHistory]
  );

  function canAddAssetToCart(asset: EquipmentAssetRow): boolean {
    if (asset.status !== "AVAILABLE") return false;
    if (openMovementAssetIds.has(asset.id)) return false;
    if (cart.includes(asset.id)) return false;
    return true;
  }

  const uniqueOpenRows = useMemo(() => {
    const seen = new Set<string>();
    return openHistory.filter((row) => {
      const gid = row.movement_group_id;
      if (gid) {
        if (seen.has(gid)) return false;
        seen.add(gid);
      }
      return true;
    });
  }, [openHistory]);

  const openMovements = useMemo(
    () => uniqueOpenRows.filter((row) => getMovementStatus(row) === "OPEN"),
    [uniqueOpenRows]
  );

  const selectedAssetHasOpenMovement = useMemo(() => {
    if (!selectedAsset) return false;
    return openMovementAssetIds.has(selectedAsset.id);
  }, [openMovementAssetIds, selectedAsset]);

  const scanResultHasOpenMovement = useMemo(() => {
    if (!scanResult) return false;
    return openMovementAssetIds.has(scanResult.asset.id);
  }, [openMovementAssetIds, scanResult]);

  const scanResultAlreadyInCart = useMemo(() => {
    if (!scanResult) return false;
    return cart.includes(scanResult.asset.id);
  }, [cart, scanResult]);

  const scanResultCanPickup = !!scanResult && scanResult.asset.status === "AVAILABLE" && !scanResultHasOpenMovement;

  /** Passo 2 → 3: stessa logica di saveMovement / carrello (solo disponibili, nessun movimento aperto). */
  const selectedAssetEligibleForOutboundStep3 = useMemo(() => {
    if (!selectedAsset) return false;
    return selectedAsset.status === "AVAILABLE" && !openMovementAssetIds.has(selectedAsset.id);
  }, [selectedAsset, openMovementAssetIds]);

  const cartMissingResolvedAssets = useMemo(() => {
    if (cart.length === 0) return false;
    return cartItems.length !== cart.length;
  }, [cart.length, cartItems.length]);

  const ineligibleCartItemsForOutboundStep3 = useMemo(() => {
    return cartItems.filter((a) => a.status !== "AVAILABLE" || openMovementAssetIds.has(a.id));
  }, [cartItems, openMovementAssetIds]);

  const canAdvancePickupWizardToStep3 = useMemo(() => {
    if (scanMode === "NORMAL") {
      if (!form.equipment_id.trim()) return false;
      if (!selectedAsset) return false;
      return selectedAssetEligibleForOutboundStep3;
    }
    if (cart.length === 0) return false;
    if (cartMissingResolvedAssets) return false;
    return ineligibleCartItemsForOutboundStep3.length === 0;
  }, [
    scanMode,
    form.equipment_id,
    selectedAsset,
    selectedAssetEligibleForOutboundStep3,
    cart.length,
    cartMissingResolvedAssets,
    ineligibleCartItemsForOutboundStep3.length,
  ]);

  function advancePickupWizardToStep3() {
    if (scanMode === "NORMAL") {
      if (!form.equipment_id.trim()) {
        setMsg("Seleziona un'attrezzatura prima di continuare.");
        return;
      }
      if (!selectedAsset) {
        setMsg("Attrezzatura non trovata nell'elenco del magazzino selezionato. Ricarica la pagina o scegli di nuovo.");
        return;
      }
      if (selectedAsset.status !== "AVAILABLE") {
        const label = EQUIPMENT_STATUS_LABELS[selectedAsset.status] ?? selectedAsset.status;
        setMsg(
          `Non puoi andare al passo 3: questa attrezzatura non è disponibile per il prelievo (stato: ${label}). Scegli un'altra unità o aggiorna lo stato da Tutte le attrezzature.`
        );
        return;
      }
      if (openMovementAssetIds.has(selectedAsset.id)) {
        setMsg("Non puoi andare al passo 3: c'è già un movimento aperto su questa attrezzatura. Chiudilo prima di prelevare.");
        return;
      }
    } else {
      if (cart.length === 0) {
        setMsg("Aggiungi almeno un'attrezzatura al carrello prima di continuare.");
        return;
      }
      if (cartMissingResolvedAssets) {
        setMsg("Una o più voci del carrello non sono più nell'elenco (magazzino o dati aggiornati). Torna indietro, svuota o ricomponi il carrello.");
        return;
      }
      if (ineligibleCartItemsForOutboundStep3.length > 0) {
        const n = ineligibleCartItemsForOutboundStep3.length;
        const first = ineligibleCartItemsForOutboundStep3[0];
        const code = first.serial_number || first.asset_code || first.name || "—";
        setMsg(
          n === 1
            ? `Non puoi andare al passo 3: ${code} non è disponibile per il prelievo (stato o movimento aperto). Rimuovila dal carrello dal passo 2.`
            : `Non puoi andare al passo 3: ${n} attrezzature nel carrello non sono disponibili per il prelievo. Rimuovile o risolvi i blocchi dal passo 2.`
        );
        return;
      }
    }
    setMsg(null);
    setOutboundStep(3);
  }

  function getResumeOutboundStep(): 1 | 2 | 3 {
    if (outboundStep === 3) {
      if (warehouseSelected && (cartItems.length > 0 || !!selectedAsset)) return 3;
      if (warehouseSelected) return 2;
      return 1;
    }
    if (outboundStep === 2) {
      return warehouseSelected ? 2 : 1;
    }
    return 1;
  }

  useEffect(() => {
    if (!selectedAsset || assetSearch.trim()) return;
    setAssetSearch(`${selectedAsset.serial_number || selectedAsset.asset_code} - ${selectedAsset.name}`);
  }, [selectedAsset, assetSearch]);

  async function checkNfcCategoryTag(nfcTagId: string): Promise<string | null> {
    const normalized = nfcTagId.trim().toLowerCase();
    if (!normalized) return null;
    const { data } = await supabase
      .from("equipment_nfc_category_tags")
      .select("category")
      .eq("equipment_area", area)
      .ilike("nfc_tag_id", normalized)
      .maybeSingle();
    return (data as { category: string } | null)?.category ?? null;
  }

  function canOpenCategorySelection(category: string) {
    const key = normalizeCategoryKey(category);
    if (!key) return false;
    if (groupCategorySet.has(key)) return true;
    return (categoryAssetCountByKey.get(key) ?? 0) > 1;
  }

  function openManualGroupSelection(asset: EquipmentAssetRow): boolean {
    if (scanMode !== "CART") return false;
    const category = (asset.category ?? "").trim();
    if (!category || !groupCategorySet.has(normalizeCategoryKey(category))) return false;
    setCategorySelectModalCategory(category);
    setCategorySelectModalSelected(canAddAssetToCart(asset) ? new Set([asset.id]) : new Set());
    setCategorySelectModalOpen(true);
    setForm((prev) => ({ ...prev, equipment_id: "" }));
    setAssetSearch("");
    setAssetOpen(false);
    setAssetActiveIndex(0);
    setMsg(null);
    return true;
  }

  function openCategoryGroupSelection(category: string) {
    if (scanMode !== "CART") return;
    const normalized = category.trim();
    if (!normalized || !canOpenCategorySelection(normalized)) return;
    setCategorySelectModalCategory(normalized);
    setCategorySelectModalSelected(new Set());
    setCategorySelectModalOpen(true);
    setForm((prev) => ({ ...prev, equipment_id: "" }));
    setAssetSearch("");
    setAssetOpen(false);
    setAssetActiveIndex(0);
    setMsg(null);
  }

  async function applySearchResult(value: string, mode: "barcode" | "nfc") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    if (!warehouseSelected) {
      setMsg("Seleziona prima il magazzino da cui prelevare.");
      return;
    }
    if (mode === "nfc") {
      const category = await checkNfcCategoryTag(value);
      if (category) {
        if (scanMode !== "CART") {
          setMsg("Il tag NFC di gruppo può essere usato solo in modalità Carrello.");
          setScanResult(null);
          return;
        }
        setCategorySelectModalCategory(category);
        setCategorySelectModalSelected(new Set());
        setCategorySelectModalOpen(true);
        setMsg(null);
        setScanResult(null);
        return;
      }
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
    if (openManualGroupSelection(row)) return;
    setForm((prev) => ({ ...prev, equipment_id: row.id }));
    setAssetSearch(`${row.serial_number || row.asset_code} - ${row.name}`);
    setAssetOpen(false);
    setMsg(null);
  }

  function stopCameraScan() {
    stopFastBarcodeScan(videoRef.current, readerRef.current);
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
      const text = await scanFastBarcode(videoEl, {
        onReader: (reader) => {
          readerRef.current = reader;
        },
      });
      stopCameraScan();
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
      await applySearchResult(serialNumber, "nfc");
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
    setMsg(`Attrezzatura aggiunta al carrello. Totale: ${cart.length + 1}.`);
  }

  async function addAssetByNfcToCart(nfcTagId: string) {
    if (scanMode !== "CART") {
      setMsg("La selezione multipla NFC è disponibile solo in modalità Carrello.");
      return;
    }
    if (!warehouseSelected) return;
    const normalized = nfcTagId.trim().toLowerCase();
    if (!normalized) return;
    const category = await checkNfcCategoryTag(nfcTagId);
    if (category) {
      setCategorySelectModalCategory(category);
      setCategorySelectModalSelected(new Set());
      setCategorySelectModalOpen(true);
      closeRemoteScanModal();
      return;
    }
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
    setCart((prev) => (prev.includes(matched.id) ? prev : [...prev, matched.id]));
    setCartOpen(true);
    setScanMode("CART");
    setMsg(`Attrezzatura aggiunta al carrello. Totale: ${cart.length + 1}.`);
  }

  async function addAssetByRemoteScanToCart(rawValue: string, source: "barcode" | "nfc") {
    if (source === "nfc") {
      await addAssetByNfcToCart(rawValue);
      return;
    }
    if (scanMode !== "CART") {
      setMsg("La selezione multipla da telefono è disponibile solo in modalità Carrello.");
      return;
    }
    if (!warehouseSelected) return;
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) return;
    const matched = assetsByWarehouse.find((asset) =>
      [asset.barcode, asset.serial_number, asset.asset_code]
        .filter(Boolean)
        .some((item) => String(item).trim().toLowerCase() === normalized)
    );
    if (!matched) {
      setMsg("Nessuna attrezzatura trovata per questo Barcode/QR nel magazzino selezionato.");
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
    setCart((prev) => (prev.includes(matched.id) ? prev : [...prev, matched.id]));
    setCartOpen(true);
    setScanMode("CART");
    setMsg(`Attrezzatura aggiunta al carrello. Totale: ${cart.length + 1}.`);
  }

  async function handleRemoteEquipmentScanEvent(event: RemoteEquipmentScanEvent) {
    const rawValue = String(event.rawValue ?? "").trim();
    const source = event.source === "barcode" ? "barcode" : "nfc";
    if (!rawValue) return;

    if (scanMode === "CART") {
      await addAssetByRemoteScanToCart(rawValue, source);
      return;
    }

    await applySearchResult(rawValue, source);
  }

  function removeCartItem(id: string) {
    setCart((prev) => prev.filter((item) => item !== id));
  }

  function openRemoteScanModal() {
    void ensureRemoteEquipmentSession(true);
  }

  function closeRemoteScanModal() {
    setRemoteScanOpen(false);
    setRemoteQrVisible(false);
    setRemoteScanCode(null);
    setRemoteScanError(null);
    setRemoteProcessedCount(0);
    if (remotePollRef.current) {
      clearInterval(remotePollRef.current);
      remotePollRef.current = null;
    }
  }

  async function ensureRemoteEquipmentSession(showQr = true) {
    if (!warehouseSelected) {
      setMsg("Seleziona il magazzino prima di usare il telefono.");
      return;
    }

    setRemoteScanOpen(true);
    setRemoteScanError(null);
    if (showQr) setRemoteQrVisible(true);
    if (remoteScanCode) return;

    setRemoteScanLoading(true);
    setRemoteProcessedCount(0);
    try {
      const res = await fetch("/api/attrezzature/remote-nfc-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: "movement_select", area, persistUntilClosed: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRemoteScanError(json.error ?? "Errore creazione sessione telefono");
        return;
      }
      setRemoteScanCode(String(json.code ?? ""));
    } catch (error) {
      setRemoteScanError(error instanceof Error ? error.message : "Errore di rete");
    } finally {
      setRemoteScanLoading(false);
    }
  }

  useEffect(() => {
    if (!remoteScanOpen || !remoteScanCode) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/attrezzature/remote-nfc-session?code=${encodeURIComponent(remoteScanCode)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (json.error) setRemoteScanError(json.error);
          return;
        }

        const entries = (json.nfcTagIds ?? (json.nfcTagId ? [json.nfcTagId] : [])) as Array<string | RemoteEquipmentScanEvent>;
        if (entries.length <= remoteProcessedCount) return;

        for (let i = remoteProcessedCount; i < entries.length; i++) {
          const entry = entries[i];
          if (entry && typeof entry === "object") {
            void handleRemoteEquipmentScanEvent(entry);
          } else if (entry) {
            if (scanMode === "CART") {
              void addAssetByNfcToCart(String(entry));
            } else {
              void applySearchResult(String(entry), "nfc");
            }
          }
        }
        setRemoteProcessedCount(entries.length);
        setRemoteScanError(null);
      } catch {
        // polling silenzioso
      }
    };

    void poll();
    remotePollRef.current = setInterval(poll, 1500);
    return () => {
      if (remotePollRef.current) {
        clearInterval(remotePollRef.current);
        remotePollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteScanOpen, remoteScanCode, remoteProcessedCount]);

  function toggleCategoryModalSelection(id: string) {
    setCategorySelectModalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addCategoryModalSelectedToCart() {
    const toAdd = categoryModalAssets.filter(
      (a) => categorySelectModalSelected.has(a.id) && canAddAssetToCart(a)
    );
    if (toAdd.length === 0) {
      setMsg("Seleziona almeno un'attrezzatura disponibile.");
      return;
    }
    const newIds = toAdd.map((a) => a.id);
    setCart((prev) => {
      const set = new Set(prev);
      newIds.forEach((id) => set.add(id));
      return Array.from(set);
    });
    setCartOpen(true);
    setScanMode("CART");
    setCategorySelectModalOpen(false);
    setCategorySelectModalCategory(null);
    setCategorySelectModalSelected(new Set());
    const total = new Set([...cart, ...newIds]).size;
    setMsg(`${toAdd.length} attrezzatura/e aggiunta/e al carrello. Totale: ${total}.`);
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

    const alreadyOpen = cartItems.filter((item) => openMovementAssetIds.has(item.id));
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

      finalizePickupSuccess();
      toast.success("Prelievo multiplo registrato");
      notifyEquipmentSync(area, "movements-cart-pickup");
      await loadData();
    } catch (error: unknown) {
      console.error("equipment cart close error:", error);
      if (isOpenMovementConflictError(error)) {
        setMsg("Registrazione carrello non riuscita: una o più attrezzature hanno già un movimento aperto.");
      } else {
        const message = describeError(error);
        setMsg("Registrazione carrello non riuscita: " + message);
      }
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
      if (isOpenMovementConflictError(error)) {
        setMsg("Registrazione movimento non riuscita: questa attrezzatura ha già un movimento aperto.");
      } else {
        setMsg("Registrazione movimento non riuscita: " + errMsg);
      }
      setSaving(false);
      return;
    }

    toast.success("Prelievo registrato");
    finalizePickupSuccess();
    notifyEquipmentSync(area, "movements-single-pickup");
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
      notifyEquipmentSync(area, "movements-delete");
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
    setCloseResolutionType(resolutionTypeForClosingForm(row));
    setCloseNote(row.close_note ?? "");

    const initState: GroupEditState = {};
    for (const movement of group) {
      initState[movement.id] = {
        resolutionType: resolutionTypeForClosingForm(movement),
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
      let closedMaintenance = false;
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
        if (resolutionType === "MAINTENANCE") closedMaintenance = true;
      }

      toast.success(targetRows.length > 1 ? "Gruppo chiuso" : "Movimento chiuso");
      if (closedMaintenance) notifyEquipmentMaintenance(area);
      notifyEquipmentSync(area, "movements-close");
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
  const remoteScanUrl =
    remoteScanCode && typeof window !== "undefined"
      ? `${window.location.origin}/attrezzature/scan-remoto?code=${encodeURIComponent(remoteScanCode)}`
      : "";

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

        {!wizardOpen && (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => {
                setWizardOpen(true);
                setOutboundStep(getResumeOutboundStep());
                setMsg(null);
              }}
              style={{ padding: "12px 24px", fontSize: 15, fontWeight: 800 }}
            >
              {hasEquipmentWizardDraft ? "Continua prelievo" : "Avvia prelievo"}
            </button>
          </div>
        )}
      </div>

      {/* Popup wizard prelievo */}
      {wizardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wizard-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 10040,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setWizardOpen(false);
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(920px, calc(100vw - 32px))",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.12)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <h2 id="wizard-title" style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
                Prelievo · Passo {outboundStep}/3
              </h2>
              <button type="button" className="btn" onClick={() => setWizardOpen(false)} aria-label="Chiudi" style={{ padding: "6px 10px" }}>
                ✕
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 20,
                padding: "10px 12px",
                background: "rgba(15,23,42,0.04)",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.08)",
              }}
            >
              {[
                { step: 1 as const, label: "1. Magazzino" },
                { step: 2 as const, label: "2. Attrezzatura" },
                { step: 3 as const, label: "3. Dettagli" },
              ].map(({ step, label }) => (
                <span
                  key={step}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 800,
                    background: outboundStep === step ? "#0f172a" : "transparent",
                    color: outboundStep === step ? "#fff" : outboundStep > step ? "#64748b" : "#94a3b8",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {outboundStep === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label className="label" htmlFor={`move-warehouse-${area}`}>Magazzino prelievo *</label>
                  <select
                    id={`move-warehouse-${area}`}
                    className="input"
                    value={warehouseFilter}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (cart.length > 0 && value !== warehouseFilter) {
                        setConfirmClearCartForWarehouse(value);
                        return;
                      }
                      setWarehouseFilter(value);
                      setForm((prev) => ({ ...prev, equipment_id: "" }));
                      setAssetCategoryFilter("");
                      setAssetGroupFilter("");
                      setAssetSearch("");
                      if (cart.length > 0) {
                        setCart([]);
                        setCartOpen(false);
                      }
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

                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" className="btn" onClick={() => setWizardOpen(false)}>
                      Chiudi
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirmCancelPickupOpen(true)}>
                      Annulla prelievo
                    </button>
                  </div>
                  <button type="button" className="btn btnPrimary" onClick={() => setOutboundStep(2)} disabled={!warehouseSelected}>
                    Avanti →
                  </button>
                </div>
              </div>
            )}

            {outboundStep === 2 && warehouseSelected && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "rgba(15,23,42,0.03)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Magazzino prelievo</div>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>{warehouseFilter}</div>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Modalita attiva</div>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>
                      {scanMode === "CART" ? `Carrello multiplo${cart.length > 0 ? ` (${cart.length})` : ""}` : "Normale"}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor={`move-mode-${area}`}>Modalità uscita</label>
                  <select
                    id={`move-mode-${area}`}
                    className="input"
                    value={scanMode}
                    onChange={(e) => {
                      const nextMode = e.target.value as "NORMAL" | "CART";
                      switchPickupMode(nextMode);
                    }}
                  >
                    <option value="NORMAL">Normale</option>
                    <option value="CART">Carrello multiplo {cart.length > 0 ? `(${cart.length})` : ""}</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" onClick={startCameraScanForSearch} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <BarcodeIcon />
                    Barcode / QR
                  </button>
                  <button className="btn" onClick={searchByNfc} disabled={searchByNfcScanning} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <NfcIcon />
                    {searchByNfcScanning ? "NFC..." : "NFC"}
                  </button>
                  <button className="btn" onClick={openRemoteScanModal} type="button" title="Usa telefono come lettore NFC" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <PhoneIcon />
                    Telefono
                  </button>
                </div>

                {remoteScanOpen && (
                  <div
                    style={{
                      border: "1px solid rgba(14,165,233,0.24)",
                      background: "linear-gradient(135deg, rgba(14,165,233,0.08), rgba(15,23,42,0.02))",
                      borderRadius: 18,
                      padding: 14,
                      display: "grid",
                      gridTemplateColumns: remoteQrVisible && remoteScanUrl ? "auto minmax(0, 1fr)" : "1fr",
                      gap: 14,
                      alignItems: "center",
                    }}
                  >
                    {remoteQrVisible && remoteScanUrl && (
                      <div style={{ padding: 10, borderRadius: 14, background: "#fff", border: "1px solid rgba(15,23,42,0.08)" }}>
                        <QRCodeSVG value={remoteScanUrl} size={132} />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <button
                          type="button"
                          onClick={() => setRemoteQrVisible((prev) => !prev)}
                          title={remoteQrVisible ? "Nascondi QR telefono" : "Mostra QR telefono"}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            border: "2px solid #fff",
                            background: remoteScanCode ? "#22c55e" : "#ef4444",
                            boxShadow: `0 0 0 3px ${remoteScanCode ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}`,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                          aria-label={remoteQrVisible ? "Nascondi QR telefono" : "Mostra QR telefono"}
                        />
                        <div style={{ fontWeight: 900, color: "#0f172a" }}>
                          Telefono {remoteScanCode ? "collegabile" : remoteScanLoading ? "in preparazione" : "non collegato"}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.45 }}>
                        Il PC resta interfaccia principale. Dal telefono puoi leggere NFC, Barcode o QR e inviare l&apos;attrezzatura qui.
                      </div>
                      {remoteScanLoading && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#0284c7" }}>Genero il QR...</div>}
                      {remoteScanError && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#b91c1c" }}>{remoteScanError}</div>}
                      {remoteScanCode && (
                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ borderRadius: 999, background: "#e0f2fe", color: "#075985", padding: "6px 10px", fontSize: 12, fontWeight: 900 }}>
                            Sessione {remoteScanCode}
                          </span>
                          <button type="button" className="btn" onClick={() => setRemoteQrVisible((prev) => !prev)} style={{ padding: "6px 10px", fontSize: 12 }}>
                            {remoteQrVisible ? "Nascondi QR" : "Mostra QR"}
                          </button>
                          <button type="button" className="btn" onClick={closeRemoteScanModal} style={{ padding: "6px 10px", fontSize: 12 }}>
                            Chiudi sessione
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid rgba(15,23,42,0.08)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Oppure selezione manuale</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {assetCategories.length > 0 && (groupNames.length > 0 || ungroupedCategories.length > 0) ? (
                      <>
                        <div>
                          <label className="label" htmlFor={`move-group-wiz-${area}`}>Gruppo categoria</label>
                          <select
                            id={`move-group-wiz-${area}`}
                            className="input"
                            value={assetGroupFilter}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAssetGroupFilter(value);
                              setAssetCategoryFilter("");
                              setForm((prev) => ({ ...prev, equipment_id: "" }));
                              setAssetSearch("");
                              setAssetOpen(false);
                              setMsg(null);
                            }}
                          >
                            <option value="">Tutte le categorie</option>
                            {groupNames.map((gn) => (
                              <option key={gn} value={gn}>{gn}</option>
                            ))}
                            {ungroupedCategories.length > 0 && (
                              <option value="__OTHER__">Altre categorie</option>
                            )}
                          </select>
                        </div>
                        {assetGroupFilter && assetGroupFilter !== "" && (
                          <div>
                            <label className="label" htmlFor={`move-category-wiz-${area}`}>Categoria</label>
                            <select
                              id={`move-category-wiz-${area}`}
                              className="input"
                              value={assetCategoryFilter}
                              onChange={(e) => {
                                const value = e.target.value;
                                setAssetCategoryFilter(value);
                                setForm((prev) => ({ ...prev, equipment_id: "" }));
                                setAssetSearch("");
                                setAssetOpen(false);
                                if (canOpenCategorySelection(value)) openCategoryGroupSelection(value);
                                setMsg(null);
                              }}
                            >
                              <option value="">— Seleziona —</option>
                              {(assetGroupFilter === "__OTHER__" ? ungroupedCategories : (groupedCategories.get(assetGroupFilter) ?? [])).map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </>
                    ) : assetCategories.length > 0 ? (
                      <div>
                        <label className="label" htmlFor={`move-category-wiz-${area}`}>Categoria</label>
                        <select
                          id={`move-category-wiz-${area}`}
                          className="input"
                          value={assetCategoryFilter}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAssetCategoryFilter(value);
                            setForm((prev) => ({ ...prev, equipment_id: "" }));
                            setAssetSearch("");
                            setAssetOpen(false);
                            if (canOpenCategorySelection(value)) openCategoryGroupSelection(value);
                          }}
                        >
                          <option value="">Tutte le categorie</option>
                          {assetCategories.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div ref={assetBoxRef} style={{ position: "relative" }}>
                      <label className="label" htmlFor={`move-search-wiz-${area}`}>Cerca attrezzatura (seriale o nome)</label>
                      <ClearableInput
                        id={`move-search-wiz-${area}`}
                        value={assetSearch}
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
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="label" htmlFor={`move-asset-wiz-${area}`}>Selezione rapida dall&apos;elenco</label>
                      <select
                        id={`move-asset-wiz-${area}`}
                        className="input"
                        value={form.equipment_id}
                        onChange={(e) => {
                          const value = e.target.value;
                          const asset = assetMap.get(value) ?? null;
                          if (asset && openManualGroupSelection(asset)) return;
                          setForm((prev) => ({ ...prev, equipment_id: value }));
                          if (asset) setAssetSearch(`${asset.serial_number || asset.asset_code} - ${asset.name}`);
                        }}
                      >
                        <option value="">Seleziona attrezzatura</option>
                        {filteredAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {(asset.serial_number || asset.asset_code)} - {asset.name}
                            {asset.status === "AVAILABLE" ? " 🟢" : " 🔴"}
                          </option>
                        ))}
                      </select>
                    </div>
                    {scanMode === "CART" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn btnPrimary"
                          onClick={addSelectedToCart}
                          disabled={!form.equipment_id}
                        >
                          Aggiungi selezione
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {SHOW_EQUIPMENT_FILTERS && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <label className="label" htmlFor={`move-category-${area}`}>Categoria</label>
                      <select
                        id={`move-category-${area}`}
                        className="input"
                        value={assetCategoryFilter}
                        onChange={(e) => setAssetCategoryFilter(e.target.value)}
                      >
                        <option value="">Tutte</option>
                        {assetCategories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div ref={assetBoxRef} style={{ position: "relative" }}>
                      <label className="label" htmlFor={`move-search-${area}`}>Attrezzatura</label>
                      <ClearableInput
                        id={`move-search-${area}`}
                        value={assetSearch}
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
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="label" htmlFor={`move-asset-${area}`}>Selezione rapida</label>
                      <select
                        id={`move-asset-${area}`}
                        className="input"
                        value={form.equipment_id}
                        onChange={(e) => {
                          const value = e.target.value;
                          const asset = assetMap.get(value) ?? null;
                          setForm((prev) => ({ ...prev, equipment_id: value }));
                          if (asset) setAssetSearch(`${asset.serial_number || asset.asset_code} - ${asset.name}`);
                        }}
                      >
                        <option value="">Seleziona attrezzatura</option>
                        {filteredAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {(asset.serial_number || asset.asset_code)} - {asset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {selectedAsset && scanMode === "NORMAL" && (
                  <div className="equipmentInfoGrid" style={{ marginTop: 4 }}>
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
                      <div className="equipmentInfoValue">{[selectedAsset.shelf, selectedAsset.place].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <div>
                      <div className="equipmentInfoLabel">Stato corrente</div>
                      <div style={{ marginTop: 4 }}>
                        <span style={equipmentStatusStyle(selectedAsset.status)}>{EQUIPMENT_STATUS_LABELS[selectedAsset.status]}</span>
                      </div>
                    </div>
                  </div>
                )}

                {scanMode === "CART" && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "rgba(15,23,42,0.03)",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>
                      Carrello attuale: {cartItems.length} {cartItems.length === 1 ? "attrezzatura" : "attrezzature"}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>
                      Aggiungi tutte le attrezzature che ti servono, poi passa ai dettagli finali.
                    </div>
                    {cartItems.length > 0 && (
                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        {cartItems.slice(-4).map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              background: "#fff",
                              border: "1px solid rgba(15,23,42,0.08)",
                              fontSize: 13,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ fontWeight: 800 }}>{item.serial_number || item.asset_code}</span>
                              {" · "}
                              <span>{item.name}</span>
                            </div>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: "6px 10px", flexShrink: 0 }}
                              onClick={() => removeCartItem(item.id)}
                            >
                              Rimuovi
                            </button>
                          </div>
                        ))}
                        {cartItems.length > 4 && (
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            ...e altre {cartItems.length - 4} nel carrello
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {scanMode === "NORMAL" && form.equipment_id.trim() && !selectedAsset && (
                  <div style={{ padding: 10, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 12, fontWeight: 700, color: "#b45309" }}>
                    L&apos;attrezzatura selezionata non è più nell&apos;elenco del magazzino. Scegline un&apos;altra o ricarica la pagina.
                  </div>
                )}

                {scanMode === "NORMAL" && selectedAsset && !selectedAssetEligibleForOutboundStep3 && (
                  <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 12, fontWeight: 700, color: "#b91c1c" }}>
                    {selectedAsset.status !== "AVAILABLE" ? (
                      <>
                        Non puoi proseguire: stato attuale{" "}
                        <span style={equipmentStatusStyle(selectedAsset.status)}>{EQUIPMENT_STATUS_LABELS[selectedAsset.status]}</span>
                        . Solo attrezzature disponibili possono essere prelevate.
                      </>
                    ) : (
                      <>Non puoi proseguire: c&apos;è già un movimento aperto su questa attrezzatura. Chiudilo prima di prelevare.</>
                    )}
                  </div>
                )}

                {scanMode === "CART" && cart.length > 0 && cartMissingResolvedAssets && (
                  <div style={{ padding: 10, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 12, fontWeight: 700, color: "#b45309" }}>
                    Il carrello contiene attrezzature non trovate nell&apos;elenco attuale. Rimuovi le voci obsolete o ricomponi il carrello dal passo 2.
                  </div>
                )}

                {scanMode === "CART" && cart.length > 0 && !cartMissingResolvedAssets && ineligibleCartItemsForOutboundStep3.length > 0 && (
                  <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 12, fontWeight: 700, color: "#b91c1c" }}>
                    {ineligibleCartItemsForOutboundStep3.length === 1 ? (
                      <>
                        Una voce nel carrello non è prelevabile (stato o movimento aperto):{" "}
                        <strong>{ineligibleCartItemsForOutboundStep3[0].serial_number || ineligibleCartItemsForOutboundStep3[0].asset_code}</strong>.
                        Rimuovila per continuare.
                      </>
                    ) : (
                      <>
                        {ineligibleCartItemsForOutboundStep3.length} attrezzature nel carrello non sono prelevabili (stato o movimento aperto). Rimuovile dal passo 2 per continuare.
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn" onClick={() => setOutboundStep(1)}>
                    ← Indietro
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmCancelPickupOpen(true)}>
                    Annulla prelievo
                  </button>
                  {scanMode === "CART" && cartItems.length > 0 && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setWizardOpen(false);
                        setCartOpen(true);
                      }}
                    >
                      Apri carrello
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btnPrimary"
                    onClick={advancePickupWizardToStep3}
                    disabled={!canAdvancePickupWizardToStep3}
                  >
                    Avanti → Dettagli e conferma
                  </button>
                </div>
              </div>
            )}

            {outboundStep === 3 && warehouseSelected && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedAsset && scanMode === "NORMAL" && (
                  <div className="equipmentInfoGrid">
                    <div>
                      <div className="equipmentInfoLabel">Seriale</div>
                      <div className="equipmentInfoValue">{selectedAsset.serial_number || selectedAsset.asset_code}</div>
                    </div>
                    <div>
                      <div className="equipmentInfoLabel">Nome</div>
                      <div className="equipmentInfoValue">{selectedAsset.name}</div>
                    </div>
                  </div>
                )}

                {scanMode === "CART" && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "rgba(15,23,42,0.03)",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>
                      Riepilogo carrello: {cartItems.length} {cartItems.length === 1 ? "attrezzatura" : "attrezzature"}
                    </div>
                    {cartItems.length > 0 ? (
                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        {cartItems.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              background: "#fff",
                              border: "1px solid rgba(15,23,42,0.08)",
                              fontSize: 13,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ fontWeight: 800 }}>{item.serial_number || item.asset_code}</span>
                              {" · "}
                              <span>{item.name}</span>
                              {" · "}
                              <span style={{ color: "#64748b" }}>
                                {[item.shelf, item.place].filter(Boolean).join(" · ") || "Senza posizione"}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: "6px 10px", flexShrink: 0 }}
                              onClick={() => removeCartItem(item.id)}
                            >
                              Rimuovi
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
                        Il carrello e vuoto. Torna al passo 2 per aggiungere attrezzature.
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="label" htmlFor={`move-note-${area}`}>Note</label>
                  <ClearableInput
                    id={`move-note-${area}`}
                    value={scanMode === "CART" ? cartNote : form.note}
                    onChange={(value) => {
                      if (scanMode === "CART") setCartNote(value);
                      else setForm((prev) => ({ ...prev, note: value }));
                    }}
                  />
                </div>

                <div>
                  <label className="label" htmlFor={`move-destination-${area}`}>Destinazione *</label>
                  <ClearableInput
                    id={`move-destination-${area}`}
                    value={scanMode === "CART" ? cartDestination : form.destination}
                    onChange={(value) => {
                      if (scanMode === "CART") setCartDestination(value);
                      else setForm((prev) => ({ ...prev, destination: value }));
                    }}
                  />
                </div>

                {scanMode === "CART" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={cartInterventionPlanEnabled}
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
                      disabled={!cartInterventionPlanEnabled}
                      style={{ flex: 1, minWidth: 0, opacity: cartInterventionPlanEnabled ? 1 : 0.6 }}
                    />
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setOutboundStep(2)}>
                    ← Indietro
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmCancelPickupOpen(true)}>
                    Annulla prelievo
                  </button>
                  {scanMode === "CART" ? (
                    <button className="btn btnPrimary" onClick={confirmCartPickup} disabled={cartBusy || cartItems.length === 0 || !cartDestination.trim()} type="button">
                      {cartBusy ? "Salvataggio..." : "Conferma prelievo"}
                    </button>
                  ) : (
                    <button className="btn btnPrimary" onClick={saveMovement} disabled={saving || !form.equipment_id} type="button">
                      {saving ? "Salvataggio..." : "Conferma prelievo"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {msg && <div style={{ marginTop: 12, fontWeight: 800, whiteSpace: "pre-wrap" }}>{msg}</div>}
          </div>
        </div>
      )}

      {scanMode === "CART" && !wizardOpen && (cartOpen || cart.length > 0) && (
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

          <div style={{ marginTop: 12, fontWeight: 800 }}>Righe: {cartItems.length}</div>
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
                          ? `Prelievo multiplo (${openHistory.filter((m) => m.movement_group_id === row.movement_group_id).length} attrezzature)`
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

      <AppScanStatusModal
        open={cameraScanning || searchByNfcScanning}
        mode={cameraScanning ? "barcode" : "nfc"}
        videoRef={videoRef}
        icon={<SpinnerIcon />}
        onClose={cameraScanning ? stopCameraScan : stopNfcScan}
      />

      {scanResult && (
        <AppModalFrame
          open
          title={scanResult.source === "barcode" ? "Scansione Barcode / QR" : "Scansione NFC"}
          subtitle={scanResult.mode === "CART" ? "Aggiunta rapida al carrello" : "Conferma prelievo singolo"}
          onClose={resetScannedSelection}
          width="min(520px, 100%)"
        >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
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
        </AppModalFrame>
      )}

      {closeOpen && closing && (
        <AppModalFrame
          open
          title={closingGroup.length > 1 ? "Dettaglio gruppo / chiusura" : "Dettaglio movimento / chiusura"}
          subtitle={`Area ${areaLabel}`}
          onClose={closeModal}
          width="min(1100px, 100%)"
          headerRight={
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
          }
        >

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
                        Dopo la chiusura lo stato del movimento passa a <b>CHIUSO</b> con l&apos;esito registrato (rientro o manutenzione).
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
                          const rowOpen = getMovementStatus(row) === "OPEN";
                          const state = groupEditState[row.id] ?? {
                            resolutionType: "RETURN" as EquipmentResolutionType,
                            closeNote: "",
                          };
                          return (
                            <tr key={row.id}>
                              <td style={{ fontWeight: 900 }}>{asset?.serial_number || asset?.asset_code || row.equipment_id}</td>
                              <td>{asset?.name || "—"}</td>
                              <td>
                                {rowOpen ? (
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
                                ) : (
                                  <span style={{ fontWeight: 700 }}>
                                    {row.resolution_type ? EQUIPMENT_RESOLUTION_LABELS[row.resolution_type] : "—"}
                                  </span>
                                )}
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
        </AppModalFrame>
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

      {categorySelectModalOpen && categorySelectModalCategory && (
        <AppModalFrame
          open
          title={`Gruppo "${categorySelectModalCategory}"`}
          subtitle="Seleziona le attrezzature da aggiungere al carrello"
          onClose={() => setCategorySelectModalOpen(false)}
          width="min(480px, 100%)"
        >
            {categoryModalAssets.some(canAddAssetToCart) && (
              <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: 12, padding: "6px 10px" }}
                  onClick={() => {
                    const selectable = categoryModalAssets.filter(canAddAssetToCart).map((a) => a.id);
                    setCategorySelectModalSelected((prev) => {
                      const next = new Set(prev);
                      selectable.forEach((id) => next.add(id));
                      return next;
                    });
                  }}
                >
                  Seleziona tutti
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: 12, padding: "6px 10px" }}
                  onClick={() => setCategorySelectModalSelected(new Set())}
                >
                  Deseleziona tutti
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
              {categoryModalAssets.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                  Nessuna attrezzatura in questo gruppo nel magazzino selezionato.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {categoryModalAssets.map((asset) => {
                    const canAdd = canAddAssetToCart(asset);
                    const isSelected = categorySelectModalSelected.has(asset.id);
                    return (
                      <label
                        key={asset.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: isSelected ? "rgba(59,130,246,0.12)" : "transparent",
                          cursor: canAdd ? "pointer" : "not-allowed",
                          opacity: canAdd ? 1 : 0.6,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => canAdd && toggleCategoryModalSelection(asset.id)}
                          disabled={!canAdd}
                          style={{ width: 20, height: 20, accentColor: "var(--primary)" }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {asset.serial_number || asset.asset_code} – {asset.name}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            {asset.status !== "AVAILABLE" && `Stato: ${EQUIPMENT_STATUS_LABELS[asset.status]}`}
                            {asset.status === "AVAILABLE" && cart.includes(asset.id) && "Già nel carrello"}
                            {asset.status === "AVAILABLE" && !cart.includes(asset.id) && history.some((r) => r.equipment_id === asset.id && getMovementStatus(r) === "OPEN") && "Movimento aperto"}
                            {asset.status === "AVAILABLE" && !cart.includes(asset.id) && !history.some((r) => r.equipment_id === asset.id && getMovementStatus(r) === "OPEN") && "Disponibile"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={() => setCategorySelectModalOpen(false)}>
                Annulla
              </button>
              <button
                type="button"
                className="btn btnPrimary"
                onClick={addCategoryModalSelectedToCart}
                disabled={categorySelectModalSelected.size === 0}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                Aggiungi {categorySelectModalSelected.size > 0 ? `(${categorySelectModalSelected.size})` : ""} al carrello
              </button>
            </div>
        </AppModalFrame>
      )}

      <ConfirmModal
        open={confirmClearCartForWarehouse !== null}
        title="Cambia magazzino"
        message="Cambiando magazzino il carrello verrà svuotato. Continuare?"
        confirmLabel="Svuota e cambia"
        cancelLabel="Annulla"
        danger
        onConfirm={() => {
          if (confirmClearCartForWarehouse !== null) {
            setWarehouseFilter(confirmClearCartForWarehouse);
            setForm((prev) => ({ ...prev, equipment_id: "" }));
            setAssetCategoryFilter("");
            setAssetSearch("");
            setCart([]);
            setCartOpen(false);
            setConfirmClearCartForWarehouse(null);
            setMsg(null);
          }
        }}
        onCancel={() => setConfirmClearCartForWarehouse(null)}
      />

      <ConfirmModal
        open={confirmCancelPickupOpen}
        title="Annulla prelievo"
        message="Vuoi annullare il prelievo in preparazione? Verranno rimossi carrello e dati inseriti."
        confirmLabel="Annulla prelievo"
        cancelLabel="Continua modifica"
        danger
        onConfirm={cancelPickupDraft}
        onCancel={() => setConfirmCancelPickupOpen(false)}
      />

    </main>
  );
}
