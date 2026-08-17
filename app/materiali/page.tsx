/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { scanFastBarcode, stopFastBarcodeScan, type FastBarcodeReader } from "../_lib/fastBarcodeScanner";
import {
  matchesMaterialSearch,
  materialSearchProbeTerms,
  parseMaterialSearchInput,
} from "../_lib/materialSearch";
import {
  buildMaterialUsedRegisterSheets,
  downloadMaterialUsedRegisterPdf,
} from "../_lib/material-used-register-pdf";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import AdminMaterialsOverviewModal, {
  type MaterialsDashboardStats,
} from "./_components/AdminMaterialsOverviewModal";
import MaterialSearchResultsModal from "./_components/MaterialSearchResultsModal";
import AppScanStatusModal, { waitScanResolveFeedback } from "../_components/AppScanStatusModal";
import type { MovementRow } from "../_lib/types";
import AppSpinner, { AppLoading } from "../_components/AppSpinner";

type Movement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by_name: string | null;
  warehouse: "PRM" | "REALE" | null;
  status?: "OPEN" | "CLOSED" | null;
  returned_qty?: number | null;
  return_note?: string | null;
  referee_email?: string | null;
  referee_name?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  movement_group_id?: string | null;
};

type DashboardMovementEntry = {
  key: string;
  lead: Movement;
  rows: Movement[];
  isGroup: boolean;
  qty: number;
  notes: string;
  warehouses: string;
};

type DbItem = {
  code: string;
  name: string;
  um: string | null;
  matchInfo?: string | null;
};

type ShelfInfo = {
  PRM: string;
  REALE: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

type StockBoth = { PRM: number; REALE: number };

const MAX_MATERIAL_SUGGESTIONS = 250;

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ClearableInput(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  style?: React.CSSProperties;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { id, value, onChange, onClear, placeholder, style, onFocus, onKeyDown } = props;
  const showClear = value.length > 0;

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        className="input"
        type="text"
        value={value}
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
          onClick={() => (onClear ? onClear() : onChange(""))}
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
            zIndex: 2,
          }}
        >
          ×
        </button>
      )}
    </div>
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

function whereLabel(st: StockBoth) {
  const a = st.PRM > 0;
  const b = st.REALE > 0;
  if (a && b) return "Entrambi";
  if (a) return "PRM";
  if (b) return "REALE";
  return "Nessuno";
}

function appendUnique(list: string[], value: string) {
  if (value && !list.includes(value)) list.push(value);
}

function normalizeDashboardStats(value: unknown): MaterialsDashboardStats {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const numberValue = (key: keyof MaterialsDashboardStats) => {
    const parsed = Number(source[key] ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    items_count: numberValue("items_count"),
    excel_codes_distinct: numberValue("excel_codes_distinct"),
    excel_rows_total: numberValue("excel_rows_total"),
    excel_rows_prm: numberValue("excel_rows_prm"),
    excel_rows_reale: numberValue("excel_rows_reale"),
    assigned_rows_total: numberValue("assigned_rows_total"),
    assigned_rows_prm: numberValue("assigned_rows_prm"),
    assigned_rows_reale: numberValue("assigned_rows_reale"),
    orphan_shelf_rows: numberValue("orphan_shelf_rows"),
    excel_codes_without_item: numberValue("excel_codes_without_item"),
    zero_stock_count: numberValue("zero_stock_count"),
    zero_stock_prm: numberValue("zero_stock_prm"),
    zero_stock_reale: numberValue("zero_stock_reale"),
    negative_stock_count: numberValue("negative_stock_count"),
    open_out_movements: numberValue("open_out_movements"),
    pending_excel_requests: numberValue("pending_excel_requests"),
    movements_today: numberValue("movements_today"),
  };
}

function shelfMatchLabel(row: any) {
  const wh = String(row?.warehouse ?? "").trim();
  const shelf = String(row?.shelf ?? "").trim();
  const place = String(row?.place ?? "").trim();
  const position = [shelf && shelf !== "—" ? `Scaffale ${shelf}` : "", place ? `Luogo ${place}` : ""].filter(Boolean).join(" · ");
  return [wh, position].filter(Boolean).join(": ");
}

export default function Home() {
  const supabase = createClient();
  const { canManageMaterials, loading: adminAccessLoading } = useIsAdmin();

  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [selectedMovementEntry, setSelectedMovementEntry] = useState<DashboardMovementEntry | null>(null);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<DbItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [searchResultsQuery, setSearchResultsQuery] = useState("");
  const [searchResultsLoading, setSearchResultsLoading] = useState(false);

  const [picked, setPicked] = useState<DbItem | null>(null);
  const [stock, setStock] = useState<StockBoth | null>(null);
  const [shelves, setShelves] = useState<ShelfInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResolving, setScanResolving] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [adminStats, setAdminStats] = useState<MaterialsDashboardStats | null>(null);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);
  const [adminStatsError, setAdminStatsError] = useState<string | null>(null);
  const [adminOverviewOpen, setAdminOverviewOpen] = useState(false);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<FastBarcodeReader | null>(null);

  async function loadSuggestions(text: string): Promise<DbItem[]> {
    const parsed = parseMaterialSearchInput(text);
    if (parsed.terms.length === 0 && !parsed.exactCode) {
      setSuggestions([]);
      return [];
    }

    const maxSuggestions = MAX_MATERIAL_SUGGESTIONS;
    const itemByCode = new Map<string, DbItem>();
    const shelfLabelsByCode = new Map<string, string[]>();
    const shelfFields = ["shelf", "place", "barcode", "nfc_tag_id"] as const;

    const itemQueries = [];
    if (parsed.exactCode) {
      itemQueries.push(
        supabase.from("items").select("code,name,um").eq("code", parsed.exactCode).limit(1)
      );
      itemQueries.push(
        supabase.from("items").select("code,name,um").ilike("code", `%${parsed.exactCode}%`).order("code", { ascending: true }).limit(maxSuggestions)
      );
    }
    const candidateTerms = Array.from(new Set([...parsed.terms, ...materialSearchProbeTerms(text)]));
    for (const term of candidateTerms) {
      itemQueries.push(
        supabase.from("items").select("code,name,um").ilike("code", `%${term}%`).order("code", { ascending: true }).limit(maxSuggestions)
      );
      itemQueries.push(
        supabase.from("items").select("code,name,um").ilike("name", `%${term}%`).order("code", { ascending: true }).limit(maxSuggestions)
      );
    }

    const itemResults = await Promise.all(itemQueries);
    for (const result of itemResults) {
      if (result.error) {
        console.error(result.error);
        continue;
      }
      for (const item of result.data ?? []) {
        const it = item as DbItem;
        if (it.code && matchesMaterialSearch(text, it.code, it.name) && !itemByCode.has(it.code)) {
          itemByCode.set(it.code, it);
        }
      }
    }

    const shelfSearchTerms = parsed.exactCode
      ? [parsed.exactCode, ...parsed.terms.filter((t) => t !== parsed.exactCode)]
      : parsed.terms;

    const shelfQueries = await Promise.all(
      shelfSearchTerms.flatMap((term) =>
        shelfFields.map((field) =>
          supabase
            .from("material_shelves")
            .select("code,warehouse,shelf,place,barcode,nfc_tag_id")
            .ilike(field, `%${term}%`)
            .order("code", { ascending: true })
            .limit(maxSuggestions)
        )
      )
    );

    for (const result of shelfQueries) {
      if (result.error) {
        console.error(result.error);
        continue;
      }

      for (const row of result.data ?? []) {
        const code = String((row as any).code ?? "").trim();
        if (!code) continue;
        const labels = shelfLabelsByCode.get(code) ?? [];
        appendUnique(labels, shelfMatchLabel(row));
        shelfLabelsByCode.set(code, labels);
      }
    }

    const shelfCodes = Array.from(shelfLabelsByCode.keys());
    const missingCodes = shelfCodes.filter((code) => !itemByCode.has(code));
    if (missingCodes.length > 0) {
      const { data, error } = await supabase
        .from("items")
        .select("code,name,um")
        .in("code", missingCodes)
        .order("code", { ascending: true });

      if (error) {
        console.error(error);
      } else {
        for (const item of data ?? []) {
          const it = item as DbItem;
          if (it.code && !itemByCode.has(it.code)) itemByCode.set(it.code, it);
        }
      }
    }

    for (const code of missingCodes) {
      if (!itemByCode.has(code)) itemByCode.set(code, { code, name: code, um: null });
    }

    for (const [code, labels] of shelfLabelsByCode) {
      const item = itemByCode.get(code);
      if (item) item.matchInfo = labels.filter(Boolean).slice(0, 2).join(" · ");
    }

    const next = Array.from(itemByCode.values())
      .sort((a, b) => {
        // Priorità al codice esatto se hai incollato "CODICE — descrizione"
        if (parsed.exactCode) {
          if (a.code === parsed.exactCode && b.code !== parsed.exactCode) return -1;
          if (b.code === parsed.exactCode && a.code !== parsed.exactCode) return 1;
        }
        return a.code.localeCompare(b.code);
      })
      .slice(0, maxSuggestions);
    setSuggestions(next);
    return next;
  }

  async function showAllSearchResults() {
    const query = search.trim();
    if (!query) return;

    setSearchResultsQuery(query);
    setSearchResultsOpen(true);
    setOpen(false);
    setSearchResultsLoading(true);
    try {
      const results = await loadSuggestions(query);
      setSuggestions(results);
    } finally {
      setSearchResultsLoading(false);
    }
  }

  async function computeStockBoth(code: string) {
    const [{ data: liveRows, error: eLive }, { data: shelfRows }] = await Promise.all([
      supabase.from("excel_live").select("warehouse,qty_free,row_json").eq("code", code),
      supabase.from("material_shelves").select("warehouse,shelf,place").eq("code", code),
    ]);

    if (eLive) {
      console.error("excel_live error:", eLive);
      setStock(null);
      setShelves(null);
      return;
    }

    let prmQty = 0;
    let realeQty = 0;
    for (const r of liveRows ?? []) {
      const wh = (r as any).warehouse;
      const q = Number.isFinite(Number((r as any).qty_free))
        ? n((r as any).qty_free)
        : n((r as any).row_json?.["Qnt. a Mag. libero"]);
      if (wh === "PRM") prmQty = q;
      if (wh === "REALE") realeQty = q;
    }

    setStock({ PRM: prmQty, REALE: realeQty });

    const shelfMap: ShelfInfo = { PRM: "", REALE: "" };
    for (const s of shelfRows ?? []) {
      const wh = (s as any).warehouse;
      const sh = (s as any).shelf ?? "";
      const pl = ((s as any).place ?? "").trim();
      const display = [sh, pl].filter(Boolean).join(" · ");
      if (wh === "PRM") shelfMap.PRM = display;
      if (wh === "REALE") shelfMap.REALE = display;
    }
    setShelves(shelfMap);
  }

  async function pickItem(it: DbItem) {
    setPicked(it);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
    setMsg(null);
    await computeStockBoth(it.code);
  }

  function stopScan() {
    stopFastBarcodeScan(videoRef.current, readerRef.current);
    readerRef.current = null;
    setScanning(false);
    setScanResolving(false);
  }

  function itemFromLive(live: { code?: string; row_json?: Record<string, unknown> } | null): DbItem | null {
    if (!live?.code) return null;
    const name = String(live.row_json?.["Descrizione Materiale"] ?? live.code).trim() || live.code;
    return { code: live.code, name, um: null };
  }

  async function resolveScannedValue(raw: string): Promise<DbItem | null> {
    const value = raw.trim();
    if (!value) return null;

    const [{ data: byBarcode }, { data: byNfc }, { data: itemDirect }, { data: liveDirect }] = await Promise.all([
      supabase.from("material_shelves").select("code").eq("barcode", value).maybeSingle(),
      supabase.from("material_shelves").select("code").eq("nfc_tag_id", value).maybeSingle(),
      supabase.from("items").select("code,name,um").eq("code", value).maybeSingle(),
      supabase.from("excel_live").select("code,row_json").eq("code", value).limit(1).maybeSingle(),
    ]);

    const mappedCode =
      String((byBarcode as { code?: string } | null)?.code ?? "").trim() ||
      String((byNfc as { code?: string } | null)?.code ?? "").trim() ||
      value;

    if (mappedCode === value) {
      if (itemDirect?.code) return itemDirect as DbItem;
      return itemFromLive(liveDirect as { code?: string; row_json?: Record<string, unknown> } | null);
    }

    const [{ data: item }, { data: live }] = await Promise.all([
      supabase.from("items").select("code,name,um").eq("code", mappedCode).maybeSingle(),
      supabase.from("excel_live").select("code,row_json").eq("code", mappedCode).limit(1).maybeSingle(),
    ]);

    if (item?.code) return item as DbItem;
    return itemFromLive(live as { code?: string; row_json?: Record<string, unknown> } | null);
  }

  async function pickItemByScan(raw: string) {
    const item = await resolveScannedValue(raw);
    if (!item) {
      setMsg(`Nessun materiale trovato per: ${raw}`);
      setPicked(null);
      setStock(null);
      setShelves(null);
      setSearch(raw);
      setOpen(true);
      await loadSuggestions(raw);
      return;
    }
    await pickItem(item);
  }

  async function startScan() {
    setMsg(null);
    setOpen(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg(
        "La fotocamera richiede HTTPS. Da mobile, se accedi via IP (es. 192.168.x.x) non funziona con http://. " +
          "Usa npm run dev:https sul PC, poi accedi da https://TUO_IP:3000 (accetta il certificato)."
      );
      return;
    }

    stopScan();
    setScanning(true);
    await new Promise((r) => setTimeout(r, 100));

    let videoEl = videoRef.current;
    for (let i = 0; i < 30 && !videoEl; i++) {
      await new Promise((r) => setTimeout(r, 50));
      videoEl = videoRef.current;
    }
    if (!videoEl) {
      setScanning(false);
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
        if (text) await pickItemByScan(text);
        await waitScanResolveFeedback(startedAt);
      } finally {
        setScanning(false);
        setScanResolving(false);
      }
    } catch (e: unknown) {
      console.error(e);
      setMsg("Errore camera/scansione: " + (e instanceof Error ? e.message : "sconosciuto"));
      stopScan();
    }
  }

  function resetSearch() {
    stopScan();
    setSearch("");
    setSuggestions([]);
    setPicked(null);
    setStock(null);
    setShelves(null);
    setOpen(false);
    setMsg(null);
    setActiveIndex(0);
  }

  async function downloadRegistro(rows: MovementRow[]) {
    setRegisterBusy(true);
    setMsg(null);
    try {
      const outs = rows.filter((r) => r.type === "OUT");
      if (outs.length === 0) throw new Error("Nessuna uscita da includere nel registro.");

      const codes = Array.from(new Set(outs.map((r) => r.code).filter(Boolean)));
      const nameMapLocal: Record<string, string> = { ...nameMap };
      const shelvesByCodeWh: Record<string, Partial<Record<"PRM" | "REALE", { shelf: string; place: string }>>> = {};

      if (codes.length > 0) {
        const [{ data: itemsData }, { data: shelfRows }] = await Promise.all([
          supabase.from("items").select("code,name").in("code", codes),
          supabase.from("material_shelves").select("code,warehouse,shelf,place").in("code", codes),
        ]);
        for (const item of itemsData ?? []) {
          const code = String((item as { code?: string }).code ?? "").trim();
          if (code) nameMapLocal[code] = String((item as { name?: string }).name ?? "").trim() || code;
        }
        for (const row of shelfRows ?? []) {
          const code = String((row as { code?: string }).code ?? "").trim();
          const wh = String((row as { warehouse?: string }).warehouse ?? "").trim();
          if (!code || (wh !== "PRM" && wh !== "REALE")) continue;
          if (!shelvesByCodeWh[code]) shelvesByCodeWh[code] = {};
          shelvesByCodeWh[code][wh as "PRM" | "REALE"] = {
            shelf: String((row as { shelf?: string | null }).shelf ?? "").trim(),
            place: String((row as { place?: string | null }).place ?? "").trim(),
          };
        }
      }

      const sheets = buildMaterialUsedRegisterSheets(outs, {
        nameMap: nameMapLocal,
        shelvesByCodeWh,
      });
      await downloadMaterialUsedRegisterPdf(sheets);
    } catch (e: unknown) {
      console.error(e);
      setMsg("Errore scarico registro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRegisterBusy(false);
    }
  }

  useEffect(() => {
    return () => {
      stopFastBarcodeScan(videoRef.current, readerRef.current);
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: movs, error: eMovs } = await supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,created_by_name,warehouse,status,returned_qty,return_note,referee_email,referee_name,closed_at,closed_by,movement_group_id")
      .order("created_at", { ascending: false })
      .limit(100);

    if (eMovs) console.error(eMovs);
    const nextMovements = (movs ?? []) as Movement[];
    setMovements(nextMovements);

    const codes = Array.from(new Set(nextMovements.map((m) => m.code).filter(Boolean)));
    if (codes.length > 0) {
      const { data: itemsData, error: itemsErr } = await supabase.from("items").select("code,name").in("code", codes);
      if (itemsErr) {
        console.error(itemsErr);
        setNameMap({});
      } else {
        const nextNameMap: Record<string, string> = {};
        for (const item of itemsData ?? []) {
          const code = String((item as any).code ?? "");
          if (code) nextNameMap[code] = String((item as any).name ?? "").trim();
        }
        setNameMap(nextNameMap);
      }
    } else {
      setNameMap({});
    }
    setLoading(false);
  }, []);

  const loadAdminStats = useCallback(async () => {
    if (!canManageMaterials) return;
    setAdminStatsLoading(true);
    setAdminStatsError(null);
    try {
      const client = createClient();
      const { data, error } = await client.rpc("materials_dashboard_stats");
      if (error) throw error;
      setAdminStats(normalizeDashboardStats(data));
    } catch (error) {
      console.error("materials_dashboard_stats error:", error);
      setAdminStats(null);
      setAdminStatsError("Statistiche admin non disponibili. Applica la migration KPI su Supabase.");
    } finally {
      setAdminStatsLoading(false);
    }
  }, [canManageMaterials]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (adminAccessLoading) return;
    if (!canManageMaterials) {
      setAdminOverviewOpen(false);
      setAdminStats(null);
      setAdminStatsError(null);
      setAdminStatsLoading(false);
      return;
    }
    if (adminOverviewOpen) void loadAdminStats();
  }, [adminAccessLoading, adminOverviewOpen, canManageMaterials, loadAdminStats]);

  useEffect(() => {
    const client = createClient();
    const channel = client
      .channel("materiali-movements")
      .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, () => {
        void loadData();
        if (canManageMaterials && adminOverviewOpen) void loadAdminStats();
      })
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [adminOverviewOpen, canManageMaterials, loadAdminStats, loadData]);

  useEffect(() => {
    if (!canManageMaterials || !adminOverviewOpen) return;
    const client = createClient();
    const refresh = () => void loadAdminStats();
    const channel = client
      .channel("materiali-admin-kpi")
      .on("postgres_changes", { event: "*", schema: "public", table: "excel_live" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_shelves" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "excel_live_requests" }, refresh)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [adminOverviewOpen, canManageMaterials, loadAdminStats]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (boxRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
    if (!open) return;

    const t = setTimeout(() => {
      loadSuggestions(search);
    }, 220);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const filteredSuggestions = suggestions;

  const lastMovement = movements[0] ?? null;
  const last10 = useMemo(() => {
    const entries: Array<{ key: string; lead: Movement; rows: Movement[] }> = [];
    const groups = new Map<string, { key: string; lead: Movement; rows: Movement[] }>();

    for (const movement of movements) {
      const gid = typeof movement.movement_group_id === "string" && movement.movement_group_id.trim()
        ? movement.movement_group_id
        : null;

      if (!gid) {
        entries.push({
          key: movement.id,
          lead: movement,
          rows: [movement],
        });
        continue;
      }

      const existing = groups.get(gid);
      if (existing) {
        existing.rows.push(movement);
        continue;
      }

      const entry = { key: gid, lead: movement, rows: [movement] };
      groups.set(gid, entry);
      entries.push(entry);
    }

    return entries.slice(0, 10).map((entry) => {
      const isGroup = entry.rows.length > 1;
      const qty = entry.rows.reduce((sum, row) => sum + Math.abs(Number(row.qty ?? 0)), 0);
      const notes = Array.from(new Set(entry.rows.map((row) => (row.note ?? "").trim()).filter(Boolean))).join(" · ");
      const warehouses = Array.from(new Set(entry.rows.map((row) => row.warehouse).filter(Boolean))).join(" + ") || "-";
      return {
        ...entry,
        isGroup,
        qty,
        notes,
        warehouses,
      };
    });
  }, [movements]);
  const where = stock ? whereLabel(stock) : "";
  const movementStatusLabel = useCallback((movement: Movement) => {
    if (movement.type === "IN") return "CHIUSO";
    return movement.status === "CLOSED" ? "CHIUSO" : "APERTO";
  }, []);
  const movementNetQty = useCallback((movement: Movement) => {
    const outQty = Math.abs(n(movement.qty));
    if (movement.type !== "OUT") return outQty;
    return Math.max(0, outQty - n(movement.returned_qty));
  }, []);
  const movementReferent = useCallback((movement: Movement) => {
    const parts = [movement.referee_name, movement.referee_email].map((v) => (v ?? "").trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "-";
  }, []);

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Materiali - Dashboard</div>
      </div>

      <div className="filtersRow" style={{ padding: 12, overflow: open && search.trim() ? "visible" : undefined }}>
        <div style={{ opacity: 0.85, marginBottom: 14 }}>Panoramica rapida di anagrafica e operatività.</div>

        <div className="glass" style={{ marginTop: 14, overflow: open && search.trim() ? "visible" : undefined }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}> Controllo veloce materiale</div>
            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
              Cerca per testo oppure scansiona il QR: vedi inventario PRM/REALE e lo scaffale.
            </div>
          </div>

          <div ref={boxRef} style={{ position: "relative", marginTop: 12 }}>
            <label className="label" htmlFor="searchMaterial" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <SearchIcon />
              Ricerca manuale
            </label>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ClearableInput
                    id="searchMaterial"
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setOpen(true);
                      setPicked(null);
                      setStock(null);
                      setShelves(null);
                      setMsg(null);
                      if (!v.trim()) setSuggestions([]);
                    }}
                    onClear={resetSearch}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void showAllSearchResults();
                        return;
                      }

                      if (!open) return;

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveIndex((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Escape") {
                        setOpen(false);
                      }
                    }}
                    placeholder="Codice, descrizione o posizione..."
                    style={{ width: "100%" }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={() => void startScan()}
                  title="Scansiona QR materiale"
                  aria-label="Scansiona QR materiale"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 46, paddingInline: 12 }}
                >
                  <QrIcon />
                </button>
              </div>

              {open && search.trim() ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: 6,
                    background: "rgba(255,255,255,0.98)",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 14,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.20)",
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                    maxHeight: 280,
                    zIndex: 5,
                  }}
                >
                  {filteredSuggestions.length === 0 ? (
                    <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
                  ) : (
                    <>
                      {filteredSuggestions.map((it, idx) => (
                        <div
                          key={it.code}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            pickItem(it);
                          }}
                          style={{
                            padding: "10px 12px",
                            cursor: "pointer",
                            background: idx === activeIndex ? "#eef2ff" : "white",
                            borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 900, color: "#0f172a" }}>{it.code}</div>
                            <div style={{ fontSize: 12, color: "#334155" }}>{it.name}</div>
                            {it.matchInfo && (
                              <div style={{ fontSize: 12, color: "#0284c7", fontWeight: 700, marginTop: 3 }}>
                                {it.matchInfo}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.8, color: "#0f172a" }}>
                            ↵ seleziona
                          </div>
                        </div>
                      ))}
                      <div style={{ padding: "9px 12px", fontSize: 12, color: "#1d4ed8", background: "#eff6ff", borderTop: "1px solid #bfdbfe", fontWeight: 800 }}>
                        Premi Invio per aprire tutti i risultati
                      </div>
                      {filteredSuggestions.length >= MAX_MATERIAL_SUGGESTIONS && (
                        <div style={{ padding: "10px 12px", fontSize: 12, color: "#475569", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                          Ci sono molti risultati: scrivi qualche carattere in più per affinare la ricerca.
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}

          {picked && stock && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
                  gap: 12,
                }}
              >
                <div className="glass">
                  <div style={{ opacity: 0.85, fontSize: 12 }}>Materiale</div>
                  <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{picked.code}</div>
                  <div style={{ opacity: 0.9, marginTop: 6 }}>{picked.name}</div>
                  <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>
                    UM: <b>{picked.um ?? "-"}</b> · Presente in: <b>{where}</b>
                  </div>
                </div>

                <div className="glass">
                  <div style={{ opacity: 0.85, fontSize: 12 }}>PRM</div>
                  <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stock.PRM}</div>
                  {shelves?.PRM ? (
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: "#0284c7" }}>
                      Scaffale · Luogo: {shelves.PRM}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Posizione non assegnata</div>
                  )}
                </div>

                <div className="glass">
                  <div style={{ opacity: 0.85, fontSize: 12 }}>REALE</div>
                  <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stock.REALE}</div>
                  {shelves?.REALE ? (
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: "#7c3aed" }}>
                      Scaffale · Luogo: {shelves.REALE}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Posizione non assegnata</div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Ultimi movimenti</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canManageMaterials && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setAdminOverviewOpen(true)}
                >
                  Panoramica admin
                </button>
              )}
              <a className="btn btnPrimary" href="/movimenti">Vedi tutto</a>
            </div>
          </div>

          <div className="tableWrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Codice</th>
                  <th>Magazzino</th>
                  <th>Q.tà</th>
                  <th>Note</th>
                  <th>Inserito da</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: "#0f172a" }}>
                      <AppLoading align="start" size={18} />
                    </td>
                  </tr>
                ) : last10.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: "#0f172a" }}>
                      Nessun movimento.
                    </td>
                  </tr>
                ) : (
                  last10.map((entry) => (
                    <tr
                      key={entry.key}
                      onClick={() => setSelectedMovementEntry(entry)}
                      style={{ cursor: "pointer" }}
                      title="Apri il dettaglio movimento"
                    >
                      <td>{fmtDate(entry.lead.created_at)}</td>
                      <td>
                        <span className={entry.lead.type === "IN" ? "badgeIn" : "badgeOut"}>
                          {entry.lead.type === "IN" ? "Entrata" : "Uscita"}
                        </span>
                      </td>
                      <td>{entry.isGroup ? `Prelievo multiplo (${entry.rows.length} articoli)` : entry.lead.code}</td>
                      <td>{entry.warehouses}</td>
                      <td>
                        {entry.lead.type === "IN" ? "+" : "-"}
                        {entry.qty}
                      </td>
                      <td>{entry.notes}</td>
                      <td>{entry.lead.created_by_name ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 12, opacity: 0.8, fontSize: 12 }}>
          Suggerimento: usa “Nuovo movimento” per registrare rapidamente entrate/uscite.
        </div>
      </div>

      {selectedMovementEntry && (
        <div
          onMouseDown={() => setSelectedMovementEntry(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 10050,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(900px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.12)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>
                  {selectedMovementEntry.isGroup
                    ? `Prelievo multiplo (${selectedMovementEntry.rows.length} articoli)`
                    : `Movimento ${selectedMovementEntry.lead.code}`}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                  {fmtDate(selectedMovementEntry.lead.created_at)} · {selectedMovementEntry.lead.type === "IN" ? "Entrata" : "Uscita"}
                </div>
              </div>
              <button className="btn" type="button" onClick={() => setSelectedMovementEntry(null)}>
                Chiudi
              </button>
            </div>

            {selectedMovementEntry.lead.type === "OUT" && (
              <div
                style={{
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(14, 116, 144, 0.22)",
                  background: "linear-gradient(120deg, rgba(240,249,255,0.95) 0%, rgba(236,254,255,0.9) 100%)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 13.5, color: "#0f172a" }}>Registro materiale utilizzato</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: "#64748b", lineHeight: 1.35 }}>
                    Modulo PDF di questo prelievo
                    {selectedMovementEntry.isGroup ? ` · ${selectedMovementEntry.rows.length} articoli` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btnPrimary"
                  disabled={registerBusy}
                  onClick={() => void downloadRegistro(selectedMovementEntry.rows as MovementRow[])}
                  style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  {registerBusy ? (
                    <AppSpinner size={15} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 3v12m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                  {registerBusy ? "Generazione…" : "Scarica registro"}
                </button>
              </div>
            )}

            {selectedMovementEntry.isGroup ? (
              <>
                <div
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    background: "#f8fafc",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Articoli</div>
                    <div style={{ fontWeight: 900 }}>{selectedMovementEntry.rows.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Magazzini</div>
                    <div style={{ fontWeight: 900 }}>{selectedMovementEntry.warehouses}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Quantità totale uscita</div>
                    <div style={{ fontWeight: 900 }}>{selectedMovementEntry.qty}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Inserito da</div>
                    <div style={{ fontWeight: 900 }}>{selectedMovementEntry.lead.created_by_name ?? "-"}</div>
                  </div>
                </div>

                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Codice</th>
                        <th>Descrizione</th>
                        <th>Magazzino</th>
                        <th>Q.tà uscita</th>
                        <th>Q.tà rientro</th>
                        <th>Q.tà netta</th>
                        <th>Stato</th>
                        <th>Referente</th>
                        <th>Nota apertura</th>
                        <th>Nota rientro</th>
                        <th>Inserito da</th>
                        <th>Chiuso da</th>
                        <th>Data chiusura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMovementEntry.rows.map((row) => (
                        <tr key={row.id}>
                          <td style={{ fontWeight: 900 }}>{row.code}</td>
                          <td>{nameMap[row.code] ?? "-"}</td>
                          <td>{row.warehouse ?? "-"}</td>
                          <td>{Math.abs(n(row.qty))}</td>
                          <td>{row.type === "OUT" ? n(row.returned_qty) : "-"}</td>
                          <td>{movementNetQty(row)}</td>
                          <td>{movementStatusLabel(row)}</td>
                          <td>{movementReferent(row)}</td>
                          <td>{row.note ?? "-"}</td>
                          <td>{row.return_note ?? "-"}</td>
                          <td>{row.created_by_name ?? "-"}</td>
                          <td>{row.closed_by ?? "-"}</td>
                          <td>{row.closed_at ? fmtDate(row.closed_at) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="tableWrap">
                <table className="table">
                  <tbody>
                    <tr>
                      <td style={{ width: 220, fontWeight: 800 }}>Codice</td>
                      <td>{selectedMovementEntry.lead.code}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Descrizione</td>
                      <td>{nameMap[selectedMovementEntry.lead.code] ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Tipo</td>
                      <td>{selectedMovementEntry.lead.type === "IN" ? "Entrata" : "Uscita"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Stato</td>
                      <td>{movementStatusLabel(selectedMovementEntry.lead)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Magazzino</td>
                      <td>{selectedMovementEntry.lead.warehouse ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Quantità uscita</td>
                      <td>{Math.abs(n(selectedMovementEntry.lead.qty))}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Quantità rientro</td>
                      <td>{selectedMovementEntry.lead.type === "OUT" ? n(selectedMovementEntry.lead.returned_qty) : "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Quantità netta</td>
                      <td>{movementNetQty(selectedMovementEntry.lead)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Nota apertura</td>
                      <td>{selectedMovementEntry.lead.note ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Nota rientro</td>
                      <td>{selectedMovementEntry.lead.return_note ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Referente</td>
                      <td>{movementReferent(selectedMovementEntry.lead)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Inserito da</td>
                      <td>{selectedMovementEntry.lead.created_by_name ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Chiuso da</td>
                      <td>{selectedMovementEntry.lead.closed_by ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Data chiusura</td>
                      <td>{selectedMovementEntry.lead.closed_at ? fmtDate(selectedMovementEntry.lead.closed_at) : "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {canManageMaterials && (
        <AdminMaterialsOverviewModal
          open={adminOverviewOpen}
          stats={adminStats}
          loading={adminStatsLoading}
          error={adminStatsError}
          lastMovement={lastMovement}
          onClose={() => setAdminOverviewOpen(false)}
          onRefresh={() => void loadAdminStats()}
        />
      )}

      <MaterialSearchResultsModal
        open={searchResultsOpen}
        query={searchResultsQuery}
        results={filteredSuggestions}
        loading={searchResultsLoading}
        maxResults={MAX_MATERIAL_SUGGESTIONS}
        onClose={() => setSearchResultsOpen(false)}
        onSelect={(item) => {
          setSearchResultsOpen(false);
          void pickItem(item);
        }}
      />

      <AppScanStatusModal
        open={scanning}
        mode="barcode"
        phase={scanResolving ? "resolving" : "scanning"}
        videoRef={videoRef}
        onClose={stopScan}
        barcodeTitle="Scanner QR materiale"
        barcodeHint="Inquadra il QR dell'etichetta per vedere subito le quantità in magazzino."
        resolvingHint="Caricamento quantità e ubicazione..."
      />
    </main>
  );
}
