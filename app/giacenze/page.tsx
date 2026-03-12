"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { createClient } from "../_lib/supabase/client";
import { DEFAULT_VISIBLE_EXCEL_COLS, EXCEL_COLS, type ExcelCol } from "../_lib/excel-cols";
import { n, toNumberLoose, sanitizeId, fmtDate } from "../_lib/utils";
import { useAuth } from "../_lib/hooks/useAuth";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import type { WarehouseView, SortDir } from "../_lib/types";

const supabase = createClient();

const PAGE_SIZE = 25;

type DbRow = {
  code: string;
  warehouse: "PRM" | "REALE";
  qty_free: number;
  qty_blocked: number;
  qty_quality: number;
  initial_qty: number;
  row_json: Record<string, any> | null;
  name?: string | null;
  um?: string | null;
  total_count?: number | null;
};

type ColumnViewMode = "filtered" | "full";
type ColumnPreferences = {
  visibleCols: ExcelCol[];
  mode: ColumnViewMode;
};

function getColumnPrefsStorageKey(userId: string) {
  return `giacenze-visible-cols:${userId}`;
}

function normalizeVisibleExcelCols(raw: unknown): ExcelCol[] {
  if (!Array.isArray(raw)) return DEFAULT_VISIBLE_EXCEL_COLS;

  const allowed = new Set<string>(EXCEL_COLS);
  const seen = new Set<string>();
  const normalized = raw
    .map((value) => String(value ?? "").trim())
    .filter((value): value is ExcelCol => {
      if (!value || !allowed.has(value) || seen.has(value)) return false;
      seen.add(value);
      return true;
    });

  return normalized.length > 0 ? normalized : DEFAULT_VISIBLE_EXCEL_COLS;
}

function buildEditExcelState(row: DbRow) {
  const base: Record<string, any> = {};
  const source = row.row_json ?? {};

  for (const col of EXCEL_COLS) {
    base[col] = source[col] ?? "";
  }

  base["Materiale"] = row.code;
  base["Descrizione Materiale"] = row.name ?? base["Descrizione Materiale"] ?? "";
  base["Unità di Misura"] = row.um ?? base["Unità di Misura"] ?? "";
  base["Magazzino"] = row.warehouse ?? base["Magazzino"] ?? "";
  base["Qnt. a Mag. libero"] = row.qty_free ?? base["Qnt. a Mag. libero"] ?? 0;
  base["Qnt. a Mag. bloccato"] = row.qty_blocked ?? base["Qnt. a Mag. bloccato"] ?? 0;
  base["Controllo Qualità Magazzino"] = row.qty_quality ?? base["Controllo Qualità Magazzino"] ?? 0;

  return base;
}

function getExcelCellValue(row: DbRow, col: string) {
  let value: unknown = row.row_json?.[col] ?? "";

  if (col === "Materiale") value = row.code;
  if (col === "Descrizione Materiale") value = row.name ?? value;
  if (col === "Unità di Misura") value = row.um ?? value;
  if (col === "Magazzino") value = row.warehouse ?? value;

  if (col === "Qnt. a Mag. libero") {
    value = Number.isFinite(Number(row.qty_free))
      ? Number(row.qty_free)
      : Number(row.row_json?.["Qnt. a Mag. libero"] ?? 0);
  }

  if (col === "Qnt. a Mag. bloccato") {
    value = Number.isFinite(Number(row.qty_blocked))
      ? Number(row.qty_blocked)
      : Number(row.row_json?.["Qnt. a Mag. bloccato"] ?? 0);
  }

  if (col === "Controllo Qualità Magazzino") {
    value = Number.isFinite(Number(row.qty_quality))
      ? Number(row.qty_quality)
      : Number(row.row_json?.["Controllo Qualità Magazzino"] ?? 0);
  }

  return value;
}

export default function GiacenzePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, approved } = useAuth();
  const { canManageMaterials: isAdmin, loading: adminLoading } = useIsAdmin();

  const urlCode = searchParams.get("code");
  const urlWarehouse = searchParams.get("warehouse") as "PRM" | "REALE" | null;

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

  const [view, setView] = useState<WarehouseView>("REALE");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [sortKey, setSortKey] = useState<string>("Materiale");
  const [sortDir, setSortDir] = useState<SortDir>("none");

  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [columnViewMode, setColumnViewMode] = useState<ColumnViewMode>("full");
  const [configuredVisibleCols, setConfiguredVisibleCols] = useState<ExcelCol[]>(DEFAULT_VISIBLE_EXCEL_COLS);
  const [columnSettingsMsg, setColumnSettingsMsg] = useState<string | null>(null);
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const [columnPrefsReady, setColumnPrefsReady] = useState(false);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const filteredCols = useMemo(() => normalizeVisibleExcelCols(configuredVisibleCols), [configuredVisibleCols]);
  const activeTableCols = useMemo<ExcelCol[]>(
    () => (columnViewMode === "full" ? [...EXCEL_COLS] : filteredCols),
    [columnViewMode, filteredCols]
  );
  const tableMinWidth = Math.max(1180, 240 + activeTableCols.length * 180);

  // Popup
  const [editing, setEditing] = useState<DbRow | null>(null);
  const [editExcel, setEditExcel] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // modalità creazione nuovo materiale
  const [creating, setCreating] = useState(false);

  // quali campi sono sbloccati (uno per volta)
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
const [historyCode, setHistoryCode] = useState<string | null>(null);
const [historyRows, setHistoryRows] = useState<
  Array<{
    id: string;
    created_at: string;
    type: "IN" | "OUT";
    qty: number;
    returned_qty?: number | null;
    note: string | null;
    created_by_name?: string | null;
    created_by_email?: string | null;
    warehouse?: string | null;
  }>
>([]);
const [historyLoading, setHistoryLoading] = useState(false);

  // ✅ Scrollbar orizzontale “gemella” (in alto) + tabella
  const tableXRef = useRef<HTMLDivElement | null>(null);
  const topXRef = useRef<HTMLDivElement | null>(null);

  // ✅ sync scroll top <-> table
  useEffect(() => {
    const tableEl = tableXRef.current;
    const topEl = topXRef.current;

    if (!tableEl || !topEl) return;

    let lock = false;

    const syncFromTop = () => {
      if (lock) return;
      lock = true;
      tableEl.scrollLeft = topEl.scrollLeft;
      lock = false;
    };

    const syncFromTable = () => {
      if (lock) return;
      lock = true;
      topEl.scrollLeft = tableEl.scrollLeft;
      lock = false;
    };

    const spacer = topEl.firstElementChild as HTMLDivElement | null;
    if (spacer) spacer.style.width = `${tableEl.scrollWidth}px`;

    topEl.addEventListener("scroll", syncFromTop, { passive: true });
    tableEl.addEventListener("scroll", syncFromTable, { passive: true });

    topEl.scrollLeft = tableEl.scrollLeft;

    return () => {
      topEl.removeEventListener("scroll", syncFromTop);
      tableEl.removeEventListener("scroll", syncFromTable);
    };
  }, [loading, rows.length, view, sortKey, sortDir, page, tableMinWidth]);

  function cycleSort(clickedKey: string) {
    setPage(1);

    if (sortKey !== clickedKey) {
      setSortKey(clickedKey);
      setSortDir("asc");
      return;
    }

    setSortDir((prev) => {
      if (prev === "none") return "asc";
      if (prev === "asc") return "desc";
      return "none";
    });
  }
async function writeAuditLog(payload: {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  code?: string | null;
  warehouse?: string | null;
  details_json?: Record<string, any> | null;
}) {
  try {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user ?? null;

    await supabase.from("audit_log").insert({
      action: payload.action,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id ?? null,
      code: payload.code ?? null,
      warehouse: payload.warehouse ?? null,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      user_name: null,
      details_json: payload.details_json ?? null,
    });
  } catch (e) {
    console.error("audit_log error:", e);
  }
}
  function sortIcon(col: string) {
    if (sortKey !== col || sortDir === "none") return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }
async function openHistory(code: string) {
  setHistoryCode(code);
  setHistoryOpen(true);
  setHistoryLoading(true);

  const { data, error } = await supabase
    .from("movements")
    .select("id,created_at,type,qty,returned_qty,note,created_by_name,created_by_email,warehouse")
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("history error:", error);
    setHistoryRows([]);
    setHistoryLoading(false);
    return;
  }

  setHistoryRows((data ?? []) as any[]);
  setHistoryLoading(false);
}

  async function loadImageAsDataUrl(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context non disponibile"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Impossibile caricare l'immagine del banner"));
      img.src = src;
    });
  }

  async function downloadStoricoPDF() {
    if (!historyCode || historyRows.length === 0) return;
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const bannerDataUrl = await loadImageAsDataUrl("/logo.svg");
      const img = new Image();
      img.src = bannerDataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Impossibile leggere il banner"));
      });
      const imgWidth = 120;
      const imgHeight = (img.height * imgWidth) / img.width;
      pdf.addImage(bannerDataUrl, "PNG", 0, 6, imgWidth, imgHeight);
      pdf.setTextColor(20, 20, 20);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Storico materiale", 10, 45);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`Materiale: ${historyCode}`, 10, 52);
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.4);
      pdf.line(10, 56, 200, 56);
      let y = 64;
      const drawTableHeader = () => {
        pdf.setFillColor(242, 242, 242);
        pdf.rect(10, y - 5, 190, 8, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.setTextColor(30, 30, 30);
        pdf.text("Data", 12, y);
        pdf.text("Tipo", 42, y);
        pdf.text("Qta", 72, y);
        pdf.text("Mag.", 92, y);
        pdf.text("Operatore", 112, y);
        pdf.text("Note", 152, y);
        y += 8;
      };
      const drawFooter = () => {
        pdf.setDrawColor(210, 210, 210);
        pdf.line(10, 286, 200, 286);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Generato da: ${user?.email ?? user?.id ?? "-"}`, 10, 290);
        pdf.text(`Pagina ${pdf.getNumberOfPages()}`, 180, 290);
      };
      drawTableHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      historyRows.forEach((r, index) => {
        const date = fmtDate(r.created_at);
        const tipo = r.type === "IN" ? "Entrata" : "Uscita";
        const qtyVal = r.type === "IN"
          ? Math.abs(Number(r.qty ?? 0))
          : Math.max(0, Math.abs(n(r.qty)) - n(r.returned_qty));
        const qta = `${r.type === "IN" ? "+" : "-"}${qtyVal}`;
        const mag = String(r.warehouse ?? "");
        const operatore = String(r.created_by_name ?? r.created_by_email ?? "").slice(0, 22);
        const note = String(r.note ?? "").slice(0, 26);
        if (index % 2 === 0) {
          pdf.setFillColor(250, 250, 250);
          pdf.rect(10, y - 4, 190, 6, "F");
        }
        pdf.setTextColor(35, 35, 35);
        pdf.text(date, 12, y);
        pdf.setFont("helvetica", "normal");
        if (r.type === "IN") pdf.setTextColor(20, 120, 60);
        else pdf.setTextColor(170, 40, 40);
        pdf.text(tipo, 42, y);
        pdf.setTextColor(35, 35, 35);
        pdf.text(qta, 72, y);
        pdf.text(mag, 92, y);
        pdf.text(operatore, 112, y);
        pdf.text(note, 152, y);
        y += 6;
        if (y > 278) {
          drawFooter();
          pdf.addPage();
          y = 20;
          drawTableHeader();
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
        }
      });
      drawFooter();
      pdf.save(`storico_${historyCode}.pdf`);
    } catch (e: any) {
      console.error("PDF error:", e);
      setMsg("Errore generazione PDF: " + (e?.message ?? "sconosciuto"));
    }
  }

  async function load(silent = false) {
  if (silent) {
    setRefreshing(true);
  } else {
    setLoading(true);
  }

  setMsg(null);

  const search = q.trim() || null;
  const offset = (page - 1) * PAGE_SIZE;

  const { data, error } = await supabase.rpc("giacenze_list", {
    p_view: view,
    p_search: search,
    p_sort_key: sortKey,
    p_sort_dir: sortDir,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });

  if (error) {
    console.error("giacenze_list error:", error);
    setRows([]);
    setCount(0);
    if (silent) setRefreshing(false);
    else setLoading(false);
    setMsg("Errore caricamento giacenze. (RPC giacenze_list)");
    return;
  }

  const list = (data ?? []) as DbRow[];
  setRows(list);

  const tc = Number(list?.[0]?.total_count ?? 0);
  setCount(Number.isFinite(tc) && tc > 0 ? tc : list.length);

  if (silent) setRefreshing(false);
  else setLoading(false);
}

  useEffect(() => {
  load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !approved) {
      setColumnPrefsReady(false);
      return;
    }

    const storageKey = getColumnPrefsStorageKey(user.id);
    let loadedPrefs: ColumnPreferences | null = null;

    try {
      const rawPrefs = window.localStorage.getItem(storageKey);
      if (rawPrefs) {
        loadedPrefs = JSON.parse(rawPrefs) as ColumnPreferences;
      }
    } catch {
      loadedPrefs = null;
    }

    setConfiguredVisibleCols(normalizeVisibleExcelCols(loadedPrefs?.visibleCols ?? EXCEL_COLS));
    setColumnViewMode(loadedPrefs?.mode === "filtered" || loadedPrefs?.mode === "full" ? loadedPrefs.mode : "full");
    setColumnPrefsReady(true);
  }, [authLoading, user, approved]);

  useEffect(() => {
    if (!columnPrefsReady || !user?.id) return;

    const storageKey = getColumnPrefsStorageKey(user.id);
    const prefs: ColumnPreferences = {
      visibleCols: normalizeVisibleExcelCols(configuredVisibleCols),
      mode: columnViewMode,
    };

    window.localStorage.setItem(storageKey, JSON.stringify(prefs));
  }, [columnPrefsReady, configuredVisibleCols, columnViewMode, user?.id]);

  // Apri direttamente il materiale da URL (?code=X&warehouse=Y)
  useEffect(() => {
    if (!urlCode || !urlWarehouse || urlWarehouse !== "PRM" && urlWarehouse !== "REALE") return;

    setView(urlWarehouse);
    setQ(urlCode);

    (async () => {
      const { data: live, error } = await supabase
        .from("excel_live")
        .select("code,warehouse,qty_free,qty_blocked,qty_quality,initial_qty,row_json")
        .eq("code", urlCode)
        .eq("warehouse", urlWarehouse)
        .maybeSingle();

      if (error || !live) return;

      const { data: item } = await supabase.from("items").select("name,um").eq("code", urlCode).maybeSingle();

      const row: DbRow = {
        code: live.code,
        warehouse: live.warehouse,
        qty_free: Number(live.qty_free ?? 0),
        qty_blocked: Number(live.qty_blocked ?? 0),
        qty_quality: Number(live.qty_quality ?? 0),
        initial_qty: Number(live.initial_qty ?? 0),
        row_json: live.row_json ?? {},
        name: (item as any)?.name ?? null,
        um: (item as any)?.um ?? null,
      };

      openEdit(row);
      router.replace("/giacenze", { scroll: false });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode, urlWarehouse]);

useEffect(() => {
  if (page === 1 && view === "REALE" && sortKey === "Materiale" && sortDir === "none") return;
  load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [page, view, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [q, view, sortKey, sortDir]);

  useEffect(() => {
  const t = setTimeout(() => {
    load(true);
  }, 250);
  return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [q]);

  const viewRows = useMemo(() => rows, [rows]);

  function openEdit(r: DbRow) {
    setCreating(false);
    setEditing(r);
    setEditExcel(buildEditExcelState(r));
    setUnlocked({});
    setMsg(null);
  }

  function openCreate() {
    if (!isAdmin) return;

    const base: Record<string, any> = {};
    for (const c of EXCEL_COLS) base[c] = "";

    const wh: "PRM" | "REALE" = view === "PRM" ? "PRM" : "REALE";

    base["Magazzino"] = wh;
    base["Qnt. a Mag. libero"] = 0;
    base["Qnt. a Mag. bloccato"] = 0;
    base["Controllo Qualità Magazzino"] = 0;

    setEditing({
      code: "",
      warehouse: wh,
      qty_free: 0,
      qty_blocked: 0,
      qty_quality: 0,
      initial_qty: 0,
      row_json: base,
    });

    setEditExcel(base);
    setUnlocked({});
    setCreating(true);
    setMsg(null);
  }

  function setColumnVisible(col: ExcelCol, visible: boolean) {
    let blocked = false;
    setConfiguredVisibleCols((prev) => {
      if (visible) {
        return normalizeVisibleExcelCols([...prev, col]);
      }
      const next = prev.filter((currentCol) => currentCol !== col);
      if (next.length === 0) {
        blocked = true;
        setColumnSettingsMsg("Mantieni almeno una colonna visibile.");
        return prev;
      }
      return next;
    });
    if (!blocked) {
      setColumnViewMode("filtered");
      setColumnSettingsMsg(null);
    }
  }

  function showAllColumns() {
    setConfiguredVisibleCols([...EXCEL_COLS]);
    setColumnSettingsMsg(null);
  }

  function restoreDefaultColumns() {
    setConfiguredVisibleCols([...DEFAULT_VISIBLE_EXCEL_COLS]);
    setColumnSettingsMsg(null);
  }

  async function saveEdit() {
    if (!editing) return;

    setSaving(true);
    setMsg(null);

    try {
      const qtyFree = toNumberLoose(editExcel["Qnt. a Mag. libero"]);
      const qtyBlocked = toNumberLoose(editExcel["Qnt. a Mag. bloccato"]);
      const qtyQuality = toNumberLoose(editExcel["Controllo Qualità Magazzino"]);
      const initial = qtyFree + qtyBlocked + qtyQuality;

      const code = String(editExcel["Materiale"] ?? editing.code ?? "").trim();
      if (!code) {
        setMsg("Inserisci il codice materiale (Materiale).");
        setSaving(false);
        return;
      }

      // Manteniamo coerenti anche i 3 campi nel JSON
      const nextJson = { ...editExcel };
      nextJson["Materiale"] = code;
      nextJson["Magazzino"] = editing.warehouse;
      nextJson["Qnt. a Mag. libero"] = qtyFree;
      nextJson["Qnt. a Mag. bloccato"] = qtyBlocked;
      nextJson["Controllo Qualità Magazzino"] = qtyQuality;

      const payload = {
        row_json: nextJson,
        qty_free: qtyFree,
        qty_blocked: qtyBlocked,
        qty_quality: qtyQuality,
        initial_qty: initial,
      };

      if (creating) {
        if (!isAdmin) {
          setMsg("Solo admin può creare nuovi materiali.");
          setSaving(false);
          return;
        }

        // items: crea/aggiorna anagrafica minima
        const name = String(nextJson["Descrizione Materiale"] ?? "").trim() || code;
        const um = String(nextJson["Unità di Misura"] ?? "").trim() || null;

        const { error: eItems } = await supabase.from("items").upsert({ code, name, um } as any, { onConflict: "code" });
        if (eItems) {
          setMsg("Errore creazione (items): " + eItems.message);
          setSaving(false);
          return;
        }

        // excel_original (immutabile)
        const { error: eOrig } = await supabase
          .from("excel_original")
          .upsert(
            {
              code,
              warehouse: editing.warehouse,
              ...payload,
            } as any,
            { onConflict: "code,warehouse" }
          );

        if (eOrig) {
          setMsg("Errore creazione (excel_original): " + eOrig.message);
          setSaving(false);
          return;
        }

        // excel_live (lavorabile)
        const { error: eLive } = await supabase
          .from("excel_live")
          .upsert(
            {
              code,
              warehouse: editing.warehouse,
              ...payload,
            } as any,
            { onConflict: "code,warehouse" }
          );

        if (eLive) {
  setMsg("Errore creazione (excel_live): " + eLive.message);
  setSaving(false);
  return;
}
await writeAuditLog({
  action: "MATERIAL_CREATED",
  entity_type: "material",
  code,
  warehouse: editing.warehouse,
  details_json: {
    name: String(nextJson["Descrizione Materiale"] ?? "").trim() || null,
    um: String(nextJson["Unità di Misura"] ?? "").trim() || null,
    qty_free: qtyFree,
    qty_blocked: qtyBlocked,
    qty_quality: qtyQuality,
    initial_qty: initial,
  },
});
      } else {
        // update SOLO live
        const { error } = await supabase
          .from("excel_live")
          .update(payload as any)
          .eq("code", editing.code)
          .eq("warehouse", editing.warehouse);

        if (error) {
          console.error("saveEdit error:", error);
          setMsg("Errore salvataggio: " + ((error as any)?.message ?? "sconosciuto"));
          setSaving(false);
          return;
        }
        await writeAuditLog({
  action: "MATERIAL_UPDATED",
  entity_type: "material",
  code: editing.code,
  warehouse: editing.warehouse,
  details_json: {
    name: String(nextJson["Descrizione Materiale"] ?? "").trim() || null,
    um: String(nextJson["Unità di Misura"] ?? "").trim() || null,
    qty_free: qtyFree,
    qty_blocked: qtyBlocked,
    qty_quality: qtyQuality,
    initial_qty: initial,
  },
});

        // opzionale: se admin cambia descrizione/UM nel popup, aggiorno anche items
        if (isAdmin) {
          const name = String(nextJson["Descrizione Materiale"] ?? "").trim();
          const um = String(nextJson["Unità di Misura"] ?? "").trim();
          if (name || um) {
            await supabase
              .from("items")
              .upsert(
                {
                  code: editing.code,
                  name: name || editing.name || editing.code,
                  um: um || editing.um || null,
                } as any,
                { onConflict: "code" }
              );
          }
        }
      }

      setMsg("Salvato ✅");
      setEditing(null);
      setEditExcel({});
      setUnlocked({});
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow() {
  if (!isAdmin) return;
  if (!editing) return;
  if (creating) return;

  const ok = confirm(`Eliminare questo materiale?\n\nCodice: ${editing.code}\nMagazzino: ${editing.warehouse}`);
  if (!ok) return;

  // Eliminazione lato live (original resta come storico import)
  const { error } = await supabase
    .from("excel_live")
    .delete()
    .eq("code", editing.code)
    .eq("warehouse", editing.warehouse);

  if (error) {
    setMsg("Errore eliminazione: " + error.message);
    return;
  }

  await writeAuditLog({
    action: "MATERIAL_DELETED",
    entity_type: "material",
    code: editing.code,
    warehouse: editing.warehouse,
    details_json: {
      qty_free: editing.qty_free,
      qty_blocked: editing.qty_blocked,
      qty_quality: editing.qty_quality,
      initial_qty: editing.initial_qty,
      row_json: editing.row_json ?? null,
    },
  });

  setMsg("Eliminato ✅");
  setEditing(null);
  setEditExcel({});
  setUnlocked({});
  await load();
}

  function exportXlsx() {
    const data = viewRows.map((r) => {
      const obj: Record<string, any> = {};
      for (const c of activeTableCols) {
        obj[c] = getExcelCellValue(r, c);
      }
      obj["_warehouse"] = r.warehouse;
      return obj;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Giacenze");
    XLSX.writeFile(wb, `giacenze_${view.toLowerCase()}_pagina_${page}.xlsx`);
  }

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      {/* HEADER */}
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Giacenze</div>
      </div>

      {/* FILTRI */}
      <div className="card" style={{ padding: 12 }}>
        <div
          className="mobileGrid1"
          style={{
            display: "grid",
            gridTemplateColumns: "180px minmax(240px,1fr) auto auto auto auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <label className="label" htmlFor="viewSel">
              Magazzino
            </label>
            <select id="viewSel" name="viewSel" className="input" value={view} onChange={(e) => setView(e.target.value as WarehouseView)}>
              <option value="REALE">REALE</option>
              <option value="PRM">PRM</option>
              <option value="TUTTI">TUTTI</option>
            </select>
          </div>

          <div style={{ minWidth: 0 }}>
            <label className="label" htmlFor="qSearch">
              Cerca
            </label>
            <input
              id="qSearch"
              name="qSearch"
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Codice, descrizione, qualunque colonna…"
              style={{ width: "100%", maxWidth: 520 }}
            />
          </div>

          {isAdmin && (
            <button className="btn btnPrimary" onClick={openCreate}>
              Nuovo materiale
            </button>
          )}

          <button className="btn" onClick={() => load()}>
            Aggiorna
          </button>

          <button className="btn" onClick={exportXlsx}>
            Export pagina
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setColumnsPanelOpen((prev) => !prev)}
              aria-expanded={columnsPanelOpen}
              aria-label={columnsPanelOpen ? "Nascondi filtri colonne" : "Mostra filtri colonne"}
              title={columnsPanelOpen ? "Nascondi filtri colonne" : "Mostra filtri colonne"}
              style={{ width: 40, minWidth: 40, padding: "6px 0", justifyContent: "center" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </button>

            <div>
              <div style={{ fontWeight: 900 }}>Filtri colonne</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
              {columnViewMode === "filtered"
                ? `Vista filtrata attiva: ${filteredCols.length} colonne configurate.`
                : `Vista completa attiva: ${EXCEL_COLS.length} colonne visibili.`}
              </div>
            </div>
          </div>
        </div>

        {columnsPanelOpen && (
          <>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Colonne visibili</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setColumnViewMode("filtered")}
                  aria-pressed={columnViewMode === "filtered"}
                  style={{
                    background: columnViewMode === "filtered" ? "rgba(15,23,42,0.10)" : "transparent",
                    borderColor: columnViewMode === "filtered" ? "rgba(15,23,42,0.24)" : "#e2e8f0",
                    fontWeight: columnViewMode === "filtered" ? 900 : 500,
                  }}
                >
                  Vista filtrata
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setColumnViewMode("full")}
                  aria-pressed={columnViewMode === "full"}
                  style={{
                    background: columnViewMode === "full" ? "rgba(15,23,42,0.10)" : "transparent",
                    borderColor: columnViewMode === "full" ? "rgba(15,23,42,0.24)" : "#e2e8f0",
                    fontWeight: columnViewMode === "full" ? 900 : 500,
                  }}
                >
                  Vista completa
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {columnViewMode === "filtered"
                  ? `Usa ${filteredCols.length} colonne configurate.`
                  : `Mostra tutte le ${EXCEL_COLS.length} colonne.`}
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 12,
                background: "rgba(248,250,252,0.9)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>Colonne personali</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Ogni utente puo scegliere liberamente le colonne della vista filtrata. Default: tutte visibili. La scelta viene ricordata per il tuo account su questo dispositivo.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn" onClick={showAllColumns}>
                    Mostra tutte
                  </button>
                  <button type="button" className="btn" onClick={restoreDefaultColumns}>
                    Default: tutte visibili
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                Colonne selezionate: <b>{filteredCols.length}</b> su <b>{EXCEL_COLS.length}</b>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                {EXCEL_COLS.map((col) => {
                  const checked = configuredVisibleCols.includes(col);
                  return (
                    <label
                      key={col}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        border: "1px solid #dbe3ee",
                        borderRadius: 10,
                        background: checked ? "white" : "rgba(255,255,255,0.65)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setColumnVisible(col, e.target.checked)}
                      />
                      <span style={{ fontSize: 13 }}>{col}</span>
                    </label>
                  );
                })}
              </div>

              {columnSettingsMsg && (
                <div style={{ marginTop: 10, fontWeight: 700 }}>{columnSettingsMsg}</div>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Ordinamento: clicca su una colonna → <b>↑</b> (ASC) → <b>↓</b> (DESC) → <b>↕</b> (default).
            </div>
          </>
        )}
      </div>

      {msg && <div style={{ padding: 12, fontWeight: 800 }}>{msg}</div>}

      {loading ? (
        <div style={{ padding: 12 }}>Caricamento…</div>
      ) : (
        <>
          {/* ✅ SCROLLBAR ORIZZONTALE SEMPRE DISPONIBILE - nascosta su mobile */}
          <div
            ref={topXRef}
            className="giacenzeTopScrollBar hideOnMobile"
            style={{
              position: "sticky",
              top: 10,
              zIndex: 30,
              height: 16,
              overflowX: "auto",
              overflowY: "hidden",
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(15,23,42,0.10)",
              borderRadius: 10,
              marginTop: 12,
            }}
          >
            <div style={{ width: tableMinWidth, height: 1 }} />
          </div>

          {/* ✅ TABELLA - scroll interno su mobile */}
          <div
            ref={tableXRef}
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
            <table className="table" style={{ minWidth: tableMinWidth }}>
             <thead>
  <tr>
    <th
      onClick={() => cycleSort("_warehouse")}
      style={{ cursor: "pointer", userSelect: "none" }}
      title="Ordina"
    >
      Warehouse <span style={{ opacity: 0.7 }}>{sortIcon("_warehouse")}</span>
    </th>

    {activeTableCols.map((c) => (
      <th
        key={c}
        onClick={() => cycleSort(c)}
        style={{ cursor: "pointer", userSelect: "none" }}
        title="Ordina"
      >
        {c} <span style={{ opacity: 0.7 }}>{sortIcon(c)}</span>
      </th>
    ))}

    <th>Storico</th>
  </tr>
</thead>

              <tbody>
  {viewRows.map((r, idx) => {
    const zebraBg =
      idx % 2 === 0 ? "rgba(15,23,42,0.03)" : "rgba(15,23,42,0.08)";

    return (
      <tr
        key={`${r.code}__${r.warehouse}`}
        style={{ background: zebraBg, cursor: "pointer" }}
        title="Clicca per aprire e modificare (con matita)"
        onClick={() => openEdit(r)}
      >
        <td style={{ fontWeight: 900 }}>{r.warehouse}</td>

        {activeTableCols.map((c) => (
          <td key={c}>{String(getExcelCellValue(r, c) ?? "")}</td>
        ))}

        <td>
          <button
            className="btn"
            onClick={(e) => {
              e.stopPropagation();
              openHistory(r.code);
            }}
          >
            Storico
          </button>
        </td>
      </tr>
    );
  })}

  {viewRows.length === 0 && (
    <tr>
      <td
        colSpan={2 + activeTableCols.length}
        style={{ padding: 12, color: "#0f172a" }}
      >
        Nessun risultato.
      </td>
    </tr>
  )}
</tbody>
            </table>
          </div>

          {/* PAGINAZIONE */}
          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ opacity: page <= 1 ? 0.6 : 1 }}>
              ← Precedente
            </button>

            <span style={{ opacity: 0.9 }}>
              Pagina <b>{page}</b> di <b>{totalPages}</b> · Totale righe: <b>{count}</b>
            </span>

            {/* Selezione diretta pagina */}
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 9) return true;
                  return p === 1 || p === totalPages || Math.abs(p - page) <= 2;
                })
                .reduce<number[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push(-1); // -1 = ellipsi
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === -1 ? (
                    <span key={`ellipsis-${idx}`} style={{ padding: "0 4px", opacity: 0.6 }}>
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      className="btn"
                      onClick={() => setPage(p)}
                      style={{
                        minWidth: 36,
                        padding: "6px 10px",
                        background: p === page ? "rgba(15,23,42,0.12)" : "transparent",
                        fontWeight: p === page ? 900 : 500,
                        borderColor: p === page ? "rgba(15,23,42,0.3)" : "#e2e8f0",
                      }}
                    >
                      {p}
                    </button>
                  )
                )}
            </div>

            <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ opacity: page >= totalPages ? 0.6 : 1 }}>
              Successiva →
            </button>
          </div>
        </>
      )}

      {/* POPUP EDIT / CREATE */}
      {editing && (
        <div
          onMouseDown={() => {
            if (saving) return;
            setEditing(null);
            setEditExcel({});
            setUnlocked({});
            setCreating(false);
            setMsg(null);
          }}
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
                {creating ? "Nuovo materiale" : "Modifica riga"} · <span style={{ opacity: 0.75 }}>{creating ? "(nuovo)" : editing.code}</span> ·{" "}
                <span style={{ opacity: 0.75 }}>{editing.warehouse}</span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                {isAdmin && !creating && (
                  <button
                    className="btn"
                    style={{
                      borderColor: "rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.1)",
                      color: "#991b1b",
                    }}
                    disabled={saving}
                    onClick={deleteRow}
                    title="Elimina riga"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                )}

                <button
                  className="btn"
                  disabled={saving}
                  onClick={() => {
                    setEditing(null);
                    setEditExcel({});
                    setUnlocked({});
                    setCreating(false);
                    setMsg(null);
                  }}
                >
                  Chiudi
                </button>

                <button className="btn btnPrimary" disabled={saving} onClick={saveEdit}>
                  {saving ? "Salvataggio…" : "Salva"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
  {isAdmin ? (
    <>
      Tutto è bloccato. Premi la <b>matita</b> a destra del campo per sbloccare solo quel campo.
    </>
  ) : (
    <>
      Vista di sola lettura. Solo gli admin possono modificare i campi.
    </>
  )}
</div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
              {EXCEL_COLS.map((c) => {
                const id = sanitizeId(c);

                // Materiale editabile SOLO in creazione
                const isMaterialReadOnly = c === "Materiale" && !creating;

                // regola "sempre bloccati" (ma admin può sbloccarli)
                const isCoreField = c === "Descrizione Materiale" || c === "Unità di Misura";
                const isAlwaysLocked = isCoreField && !isAdmin;

                const computedValue =
                  c === "Materiale"
                    ? creating
                      ? editExcel[c] ?? ""
                      : editing.code
                    : editExcel[c] ?? "";

                const canUnlock = isAdmin && !isMaterialReadOnly && !isAlwaysLocked;
                const isUnlocked = !!unlocked[c];
                const disabled = saving || !canUnlock || !isUnlocked;

                const inputStyle: React.CSSProperties = disabled ? { background: "#f1f5f9", color: "#64748b" } : { background: "white", color: "#0f172a" };

                return (
                  <div key={c} style={{ gridColumn: "span 6" }}>
                    <label className="label" htmlFor={id}>
                      {c}
                    </label>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {c === "Magazzino" && creating ? (
                        <select
                          id={id}
                          name={id}
                          className="input"
                          disabled={disabled}
                          value={String(editExcel[c] ?? editing.warehouse ?? "PRM")}
                          onChange={(e) => {
                            const v = e.target.value as "PRM" | "REALE";
                            setEditExcel((prev) => ({ ...prev, [c]: v }));
                            setEditing((prev) => (prev ? { ...prev, warehouse: v } : prev));
                          }}
                          style={{ flex: 1 }}
                        >
                          <option value="PRM">PRM</option>
                          <option value="REALE">REALE</option>
                        </select>
                      ) : (
                        <input
                          id={id}
                          name={id}
                          className="input"
                          disabled={disabled}
                          value={String(computedValue ?? "")}
                          style={{ ...inputStyle, flex: 1 }}
                          onChange={(e) => {
                            if (disabled) return;
                            const v = e.target.value;
                            setEditExcel((prev) => ({ ...prev, [c]: v }));
                          }}
                        />
                      )}

                      {/* Matita */}
                      <button
                        type="button"
                        className="btn"
                        disabled={!canUnlock || saving}
                        onClick={() => {
                          if (!canUnlock || saving) return;
                          setUnlocked((prev) => ({ ...prev, [c]: !prev[c] }));
                        }}
                        title={canUnlock ? (isUnlocked ? "Blocca campo" : "Modifica campo") : "Campo non modificabile"}
                        style={{
                          width: 44,
                          justifyContent: "center",
                          opacity: canUnlock ? 1 : 0.5,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Nota: se modifichi <b>Qnt. a Mag. libero / bloccato / Controllo Qualità Magazzino</b>, al salvataggio vengono riallineati anche i campi numerici interni.
            </div>
          </div>
        </div>
      )}
      {historyOpen && (
  <div
    onMouseDown={() => {
      setHistoryOpen(false);
      setHistoryCode(null);
      setHistoryRows([]);
    }}
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
        width: "min(1000px, 100%)",
        maxHeight: "85vh",
        overflow: "auto",
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 900 }}>
          Storico materiale · <span style={{ opacity: 0.75 }}>{historyCode}</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={downloadStoricoPDF}
            disabled={historyLoading || historyRows.length === 0}
          >
            PDF
          </button>
          <button
            className="btn"
            onClick={() => {
              setHistoryOpen(false);
              setHistoryCode(null);
              setHistoryRows([]);
            }}
          >
            Chiudi
          </button>
        </div>
      </div>

      <div className="tableWrap" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Q.tà</th>
              <th>Mag.</th>
              <th>Inserito da</th>
              <th>Note</th>
            </tr>
          </thead>

          <tbody>
            {historyLoading ? (
              <tr>
                <td colSpan={6} style={{ padding: 12 }}>
                  Caricamento…
                </td>
              </tr>
            ) : historyRows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 12 }}>
                  Nessun movimento per questo materiale.
                </td>
              </tr>
            ) : (
              historyRows.map((m) => (
                <tr key={m.id}>
                  <td>{m.created_at ? new Date(m.created_at).toLocaleString("it-IT") : "-"}</td>
                  <td>{m.type === "IN" ? "Entrata" : "Uscita"}</td>
                  <td style={{ fontWeight: 900 }}>
                    {m.type === "IN" ? "+" : "-"}
                    {m.type === "IN"
                      ? Math.abs(Number(m.qty ?? 0))
                      : Math.max(0, Math.abs(Number(m.qty ?? 0)) - Number(m.returned_qty ?? 0))}
                  </td>
                  <td>{m.warehouse ?? "-"}</td>
                  <td>{m.created_by_name ?? m.created_by_email ?? "-"}</td>
                  <td>{m.note ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
)}
    </main>
  );
}