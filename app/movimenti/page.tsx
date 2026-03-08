"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "../_lib/supabase/client";
import { BrowserMultiFormatReader } from "@zxing/browser";
import jsPDF from "jspdf";
import { fmtDate, n, toNumber, toIsoStartOfDay, toIsoEndOfDay } from "../_lib/utils";
import { useAuth } from "../_lib/hooks/useAuth";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { movementNoteSchema } from "../_lib/validations";
import type { CartRow, QuickMaterialInfo, DbItem, MovementRow, ReferentRow, ExcelLiveRow } from "../_lib/types";

const PAGE_LIMIT = 300;

function sameUser(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a === b;
}

function pillStyle(kind: "IN" | "OUT" | "OPEN" | "CLOSED" | "PRM" | "REALE") {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(15,23,42,0.12)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.2,
    background: "rgba(255,255,255,0.85)",
    color: "#0f172a",
    whiteSpace: "nowrap",
  };

  if (kind === "IN") {
    return {
      ...base,
      borderColor: "rgba(16,185,129,0.35)",
      background: "rgba(16,185,129,0.10)",
    };
  }

  if (kind === "OUT") {
    return {
      ...base,
      borderColor: "rgba(239,68,68,0.35)",
      background: "rgba(239,68,68,0.10)",
    };
  }

  if (kind === "OPEN") {
    return {
      ...base,
      borderColor: "rgba(245,158,11,0.55)",
      background: "rgba(245,158,11,0.12)",
    };
  }

  if (kind === "CLOSED") {
    return {
      ...base,
      borderColor: "rgba(59,130,246,0.45)",
      background: "rgba(59,130,246,0.10)",
    };
  }

  if (kind === "PRM") {
    return {
      ...base,
      borderColor: "rgba(2,132,199,0.45)",
      background: "rgba(2,132,199,0.10)",
    };
  }

  return {
    ...base,
    borderColor: "rgba(99,102,241,0.45)",
    background: "rgba(99,102,241,0.10)",
  };
}

function PencilIcon({ muted }: { muted?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ opacity: muted ? 0.45 : 1 }}>
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
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

function AddIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function MovimentiPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;

  const urlOpenId = searchParams.get("open");

  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartRow[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cached = localStorage.getItem("magazzino_cart");
      if (!cached) return [];
      const parsed = JSON.parse(cached);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (r: any) =>
          r &&
          typeof r.code === "string" &&
          typeof r.warehouse === "string" &&
          (r.warehouse === "PRM" || r.warehouse === "REALE") &&
          typeof r.qtyPick === "number" &&
          r.qtyPick > 0
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cart.length === 0) {
      localStorage.removeItem("magazzino_cart");
    } else {
      localStorage.setItem("magazzino_cart", JSON.stringify(cart));
    }
  }, [cart]);

  useEffect(() => {
    if (cart.length > 0) {
      setScanMode("CART");
      setCartOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cartBusy, setCartBusy] = useState(false);
  const [cartManualCode, setCartManualCode] = useState("");
  const [cartSuggestions, setCartSuggestions] = useState<DbItem[]>([]);
  const [cartManualOpen, setCartManualOpen] = useState(false);
  const [cartManualActiveIndex, setCartManualActiveIndex] = useState(0);
  const cartManualRef = useRef<HTMLDivElement | null>(null);
  const [cartNfcScanning, setCartNfcScanning] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);

  const [scanMode, setScanMode] = useState<"NORMAL" | "CART">("NORMAL");

  const [scanPopupOpen, setScanPopupOpen] = useState(false);
  const [scanInfo, setScanInfo] = useState<QuickMaterialInfo | null>(null);
  const [scanQty, setScanQty] = useState("1");
  const [scanSource, setScanSource] = useState<"barcode" | "nfc" | null>(null);

  const [type, setType] = useState<"IN" | "OUT">("OUT");
  const [warehouse, setWarehouse] = useState<"PRM" | "REALE" | "MISTO">("PRM");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<DbItem[]>([]);
  const [picked, setPicked] = useState<DbItem | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const qtyRef = useRef<HTMLInputElement | null>(null);

  const [history, setHistory] = useState<MovementRow[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fType, setFType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [fWarehouse, setFWarehouse] = useState<"ALL" | "PRM" | "REALE">("ALL");
  const [fMaterial, setFMaterial] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState<MovementRow | null>(null);
  const [closingGroup, setClosingGroup] = useState<MovementRow[]>([]);
  const [closingMeta, setClosingMeta] = useState<{ name: string; um: string } | null>(null);
  const [editingMovementId, setEditingMovementId] = useState<string | null>(null);
  const [selectedClosedRowId, setSelectedClosedRowId] = useState<string | null>(null);

  const [returnQty, setReturnQty] = useState<string>("0");
  const [returnToPrm, setReturnToPrm] = useState<string>("0");
  const [returnToReale, setReturnToReale] = useState<string>("0");
  const [returnNote, setReturnNote] = useState<string>("");
  const [referents, setReferents] = useState<ReferentRow[]>([]);
  const [selReferentId, setSelReferentId] = useState<string>("");

  const [editRectify, setEditRectify] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);

  const [warehouseChoicePopup, setWarehouseChoicePopup] = useState<{
    mode: "BOTH" | "PRM_ONLY" | "REALE_ONLY" | "NONE";
    code: string;
    name: string;
    um: string | null;
    prmFree: number;
    realeFree: number;
    prmShelf: string;
    realeShelf: string;
    prmPlace?: string;
    realePlace?: string;
    forCart?: boolean;
  } | null>(null);

  const [shelfInfoPopup, setShelfInfoPopup] = useState<{
    code: string;
    name: string;
    items: { warehouse: "PRM" | "REALE"; shelf: string; place?: string | null }[];
  } | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCode, setHistoryCode] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<
    Array<{
      id: string;
      created_at: string;
      type: "IN" | "OUT";
      qty: number;
      note: string | null;
      created_by_name?: string | null;
      created_by_email?: string | null;
      warehouse?: string | null;
    }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  function canEditRow(m: MovementRow) {
    const st = (m.status ?? (m.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
    if (m.type !== "OUT") return false;
    if (st === "CLOSED") return false;
    return isAdmin || sameUser(m.created_by, userId);
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
      await supabase.from("audit_log").insert({
        action: payload.action,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id ?? null,
        code: payload.code ?? null,
        warehouse: payload.warehouse ?? null,
        user_id: userId ?? null,
        user_email: userEmail ?? null,
        user_name: null,
        details_json: payload.details_json ?? null,
      });
    } catch (e) {
      console.error("audit_log error:", e);
    }
  }

  async function loadReferents() {
    const { data, error } = await supabase
      .from("referents")
      .select("id,name,email,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("loadReferents error:", error);
      setReferents([]);
      return;
    }

    setReferents((data ?? []) as ReferentRow[]);
  }
//NFC 
async function loadMaterialForScan(code: string, wh: "PRM" | "REALE"): Promise<QuickMaterialInfo | null> {
  const { data: stock, error: stockErr } = await supabase
    .from("excel_live")
    .select("code,warehouse,qty_free,qty_blocked,qty_quality")
    .eq("code", code)
    .eq("warehouse", wh)
    .maybeSingle();

  if (stockErr) {
    console.error("loadMaterialForScan stock error:", stockErr);
    return null;
  }

  if (!stock) return null;

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("code,name,um")
    .eq("code", code)
    .maybeSingle();

  if (itemErr) {
    console.error("loadMaterialForScan item error:", itemErr);
  }

  return {
    code,
    warehouse: wh,
    name: String((item as any)?.name ?? "").trim() || code,
    um: (item as any)?.um ?? null,
    qtyFree: Number((stock as any)?.qty_free ?? 0),
    qtyBlocked: Number((stock as any)?.qty_blocked ?? 0),
    qtyQuality: Number((stock as any)?.qty_quality ?? 0),
  };
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

  async function downloadRegistroPDF(rows: MovementRow[]) {
    try {
      const pdf = new jsPDF("p", "mm", "a4");

      const bannerDataUrl = await loadImageAsDataUrl("/banner_terna.png");

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
      pdf.text("Registro Movimenti Magazzino", 10, 45);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);

      const periodo =
        fFrom || fTo
          ? `Periodo: ${fFrom || "..."} - ${fTo || "..."}`
          : "Periodo: tutti i movimenti filtrati";

      pdf.text(periodo, 10, 52);

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
        pdf.text("Materiale", 42, y);
        pdf.text("Tipo", 92, y);
        pdf.text("Qta", 112, y);
        pdf.text("Mag.", 126, y);
        pdf.text("Operatore", 142, y);

        y += 8;
      };

      const drawFooter = () => {
        pdf.setDrawColor(210, 210, 210);
        pdf.line(10, 286, 200, 286);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Generato da: ${userEmail ?? userId ?? "-"}`, 10, 290);
        pdf.text(`Pagina ${pdf.getNumberOfPages()}`, 180, 290);
      };

      drawTableHeader();

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);

      rows.forEach((r, index) => {
        const date = fmtDate(r.created_at);
        const code = String(r.code).slice(0, 24);
        const tipo = r.type === "IN" ? "Entrata" : "Uscita";
        const qtyVal = r.type === "IN"
          ? Math.abs(Number(r.qty ?? 0))
          : Math.max(0, Math.abs(n(r.qty)) - n(r.returned_qty));
        const qta = `${r.type === "IN" ? "+" : "-"}${qtyVal}`;
        const mag = String(r.warehouse ?? "");
        const operatore = String(r.created_by_name ?? r.created_by ?? "").slice(0, 26);

        if (index % 2 === 0) {
          pdf.setFillColor(250, 250, 250);
          pdf.rect(10, y - 4, 190, 6, "F");
        }

        pdf.setTextColor(35, 35, 35);
        pdf.text(date, 12, y);

        pdf.setFont("courier", "normal");
        pdf.text(code, 42, y);

        pdf.setFont("helvetica", "normal");
        if (r.type === "IN") {
          pdf.setTextColor(20, 120, 60);
        } else {
          pdf.setTextColor(170, 40, 40);
        }

        pdf.text(tipo, 92, y);
        pdf.text(qta, 112, y);

        pdf.setTextColor(35, 35, 35);
        pdf.text(mag, 126, y);
        pdf.text(operatore, 142, y);

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
      pdf.save("registro_movimenti.pdf");
    } catch (e: any) {
      console.error("PDF error:", e);
      setMsg("Errore generazione PDF: " + (e?.message ?? "sconosciuto"));
    }
  }

  async function loadSuggestions(text: string) {
    const s = String(text ?? "").trim();
    if (!s) {
      setSuggestions([]);
      return;
    }

    try {
      const q1 = await supabase.from("items").select("code,name,um").ilike("code", `%${s}%`).order("code", { ascending: true }).limit(12);

      const q2 = await supabase.from("items").select("code,name,um").ilike("name", `%${s}%`).order("code", { ascending: true }).limit(12);

      if (q1.error || q2.error) {
        console.error("loadSuggestions raw:", {
          q1: { status: (q1 as any).status, error: q1.error, dataLen: q1.data?.length ?? 0 },
          q2: { status: (q2 as any).status, error: q2.error, dataLen: q2.data?.length ?? 0 },
        });
        setSuggestions([]);
        return;
      }

      const map = new Map<string, DbItem>();
      for (const it of (q1.data ?? []) as any[]) map.set(it.code, it as DbItem);
      for (const it of (q2.data ?? []) as any[]) map.set(it.code, it as DbItem);

      setSuggestions(Array.from(map.values()).slice(0, 12));
    } catch (e: any) {
      console.error("loadSuggestions catch:", e);
      setSuggestions([]);
    }
  }

  async function loadCartSuggestions(text: string) {
    const s = String(text ?? "").trim();
    if (s.length < 2) {
      setCartSuggestions([]);
      return;
    }
    try {
      const q1 = await supabase.from("items").select("code,name,um").ilike("code", `%${s}%`).order("code", { ascending: true }).limit(20);
      const q2 = await supabase.from("items").select("code,name,um").ilike("name", `%${s}%`).order("code", { ascending: true }).limit(20);
      if (q1.error || q2.error) {
        setCartSuggestions([]);
        return;
      }
      const map = new Map<string, DbItem>();
      for (const it of (q1.data ?? []) as any[]) map.set(it.code, it as DbItem);
      for (const it of (q2.data ?? []) as any[]) map.set(it.code, it as DbItem);
      const items = Array.from(map.values()).slice(0, 20);

      const codes = items.map((x) => x.code).filter(Boolean);
      if (codes.length === 0) {
        setCartSuggestions([]);
        return;
      }

      const whFilter = warehouse === "MISTO" ? ["PRM", "REALE"] : [warehouse];
      const { data: stockRows } = await supabase
        .from("excel_live")
        .select("code,warehouse,qty_free")
        .in("code", codes)
        .in("warehouse", whFilter)
        .gt("qty_free", 0);

      const codesWithStock = new Set<string>();
      for (const r of stockRows ?? []) {
        const c = (r as any).code;
        if (c) codesWithStock.add(c);
      }

      const filtered = items.filter((it) => codesWithStock.has(it.code));
      setCartSuggestions(filtered.slice(0, 12));
      setCartManualActiveIndex(0);
    } catch (e: any) {
      console.error("loadCartSuggestions catch:", e);
      setCartSuggestions([]);
    }
  }

  async function loadHistory(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setMsg(null);

    const baseColumns = "id,created_at,type,code,qty,note,warehouse,created_by,created_by_name,status,returned_qty,return_note,referent_id,referee_email,referee_name,closed_at,closed_by";

    let q = supabase
      .from("movements")
      .select(`${baseColumns},movement_group_id`)
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT);

    const isoFrom = toIsoStartOfDay(fFrom);
    const isoTo = toIsoEndOfDay(fTo);

    if (isoFrom) q = q.gte("created_at", isoFrom);
    if (isoTo) q = q.lte("created_at", isoTo);
    if (fType !== "ALL") q = q.eq("type", fType);
    if (fWarehouse !== "ALL") q = q.eq("warehouse", fWarehouse);

    const materialSearch = fMaterial.trim();
    const shouldFilterMaterial = materialSearch.length >= 2;
    let materialCodes: string[] = [];

    if (shouldFilterMaterial) {
      const { data: foundItems, error: itemsErr } = await supabase
        .from("items")
        .select("code")
        .or(`code.ilike.%${materialSearch}%,name.ilike.%${materialSearch}%`)
        .limit(300);

      if (itemsErr) {
        console.error("items filter error:", itemsErr);
        setHistory([]);
        setNameMap({});
        if (silent) setRefreshing(false);
        else setLoading(false);
        return;
      }

      materialCodes = Array.from(new Set((foundItems ?? []).map((x: any) => x.code).filter(Boolean)));

      if (materialCodes.length === 0) {
        setHistory([]);
        setNameMap({});
        if (silent) setRefreshing(false);
        else setLoading(false);
        return;
      }

      q = q.in("code", materialCodes);
    }

    let { data, error } = await q;

    if (error) {
      const errMsg = String((error as any)?.message ?? (error as any)?.code ?? "");
      const looksLikeColumnError = errMsg.includes("movement_group_id") || errMsg.includes("column") || errMsg.includes("PGRST") || errMsg === "";
      if (looksLikeColumnError) {
        let qFallback = supabase.from("movements").select(baseColumns).order("created_at", { ascending: false }).limit(PAGE_LIMIT);
        if (isoFrom) qFallback = qFallback.gte("created_at", isoFrom);
        if (isoTo) qFallback = qFallback.lte("created_at", isoTo);
        if (fType !== "ALL") qFallback = qFallback.eq("type", fType);
        if (fWarehouse !== "ALL") qFallback = qFallback.eq("warehouse", fWarehouse);
        if (shouldFilterMaterial && materialCodes.length > 0) qFallback = qFallback.in("code", materialCodes);
        const retry = await qFallback;
        if (!retry.error) {
          data = (retry.data ?? []).map((r: Record<string, unknown>) => ({ ...r, movement_group_id: null })) as typeof data;
          error = null;
        }
      }
    }

    if (error) {
      console.error("loadHistory error:", (error as any)?.message ?? error);
      setHistory([]);
      setNameMap({});
      if (silent) setRefreshing(false);
      else setLoading(false);
      return;
    }

    const rows = (data ?? []) as MovementRow[];
    setHistory(rows);

    const codes = Array.from(new Set(rows.map((r) => r.code).filter(Boolean)));
    if (codes.length === 0) {
      setNameMap({});
      if (silent) setRefreshing(false);
      else setLoading(false);
      return;
    }

    const { data: itemsData, error: e2 } = await supabase.from("items").select("code,name").in("code", codes);

    if (e2) {
      console.error("items nameMap error:", e2);
      setNameMap({});
      if (silent) setRefreshing(false);
      else setLoading(false);
      return;
    }

    const map: Record<string, string> = {};
    for (const it of itemsData ?? []) {
      const c = (it as any).code as string;
      const nm = (it as any).name as string | null;
      if (c) map[c] = nm ?? "";
    }

    setNameMap(map);

    if (silent) setRefreshing(false);
    else setLoading(false);
  }

  async function pickItem(it: DbItem, forCart = false) {
    if (type === "OUT") {
      try {
        const { data: prmLive } = await supabase.from("excel_live").select("qty_free,row_json").eq("code", it.code).eq("warehouse", "PRM").maybeSingle();
        const { data: realeLive } = await supabase.from("excel_live").select("qty_free,row_json").eq("code", it.code).eq("warehouse", "REALE").maybeSingle();
        const { data: prmOrig } = await supabase.from("excel_original").select("qty_free,row_json").eq("code", it.code).eq("warehouse", "PRM").maybeSingle();
        const { data: realeOrig } = await supabase.from("excel_original").select("qty_free,row_json").eq("code", it.code).eq("warehouse", "REALE").maybeSingle();
        const prmRow = prmLive ?? prmOrig;
        const realeRow = realeLive ?? realeOrig;
        const prmFree = prmRow ? (Number.isFinite(Number(prmRow.qty_free)) ? n(prmRow.qty_free) : n((prmRow.row_json as any)?.["Qnt. a Mag. libero"] ?? 0)) : 0;
        const realeFree = realeRow ? (Number.isFinite(Number(realeRow.qty_free)) ? n(realeRow.qty_free) : n((realeRow.row_json as any)?.["Qnt. a Mag. libero"] ?? 0)) : 0;
        const { data: shelfRows } = await supabase.from("material_shelves").select("warehouse,shelf,place").eq("code", it.code);
        const prmShelfRow = (shelfRows ?? []).find((r: any) => r.warehouse === "PRM");
        const realeShelfRow = (shelfRows ?? []).find((r: any) => r.warehouse === "REALE");
        const prmShelf = prmShelfRow?.shelf ?? "";
        const realeShelf = realeShelfRow?.shelf ?? "";
        const prmPlace = (prmShelfRow?.place ?? "").trim() || undefined;
        const realePlace = (realeShelfRow?.place ?? "").trim() || undefined;

        const hasPrm = prmFree > 0;
        const hasReale = realeFree > 0;

        const popupData = { code: it.code, name: it.name, um: it.um ?? null, prmFree, realeFree, prmShelf, realeShelf, prmPlace, realePlace, forCart };
        if (!hasPrm && !hasReale) {
          setWarehouseChoicePopup({ mode: "NONE", ...popupData });
          setSearch(`${it.code} — ${it.name}`);
          setOpen(false);
          setMsg(null);
          return;
        }
        if (hasPrm && !hasReale) {
          setWarehouseChoicePopup({ mode: "PRM_ONLY", ...popupData });
          setSearch(`${it.code} — ${it.name}`);
          setOpen(false);
          setMsg(null);
          return;
        }
        if (!hasPrm && hasReale) {
          setWarehouseChoicePopup({ mode: "REALE_ONLY", ...popupData });
          setSearch(`${it.code} — ${it.name}`);
          setOpen(false);
          setMsg(null);
          return;
        }
        if (hasPrm && hasReale) {
          setWarehouseChoicePopup({ mode: "BOTH", ...popupData });
          setSearch(`${it.code} — ${it.name}`);
          setOpen(false);
          setMsg(null);
          return;
        }
      } catch (e) {
        console.error("warehouse choice check:", e);
      }
    }
    setPicked(it);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
    setMsg(null);
    setTimeout(() => qtyRef.current?.focus(), 50);
  }

  async function confirmWarehouseChoice(wh: "PRM" | "REALE" | "MISTO") {
    if (!warehouseChoicePopup) return;
    const popup = warehouseChoicePopup;
    setWarehouseChoicePopup(null);
    setMsg(null);

    if (popup.forCart) {
      const whPick = wh === "MISTO" ? "PRM" : wh;
      const info = await loadMaterialForScan(popup.code, whPick);
      if (info) {
        setScanInfo(info);
        setScanQty("1");
        setScanSource(null);
        setCartOpen(true);
      } else {
        setMsg(`Materiale non disponibile in ${whPick}.`);
      }
      return;
    }

    setWarehouse(wh);
    setPicked({ code: popup.code, name: popup.name, um: popup.um });
    setTimeout(() => qtyRef.current?.focus(), 50);
  }

  async function pickItemByCode(codeRaw: string, forCart = false) {
    const code = codeRaw.trim();
    if (!code) return;

    const { data: item, error } = await supabase.from("items").select("code,name,um").eq("code", code).maybeSingle();

    if (error) {
      console.error("pickItemByCode error:", error);
      setMsg("Errore ricerca articolo: " + (error as any)?.message);
      return;
    }

    if (!item) {
      setPicked(null);
      setMsg(`Codice "${code}" non trovato in anagrafica.`);
      setSearch(code);
      setOpen(true);
      await loadSuggestions(code);
      return;
    }

    await pickItem(item as DbItem, forCart);
  }

  function stopScan() {
    try {
      (readerRef.current as any)?.reset?.();
    } catch {}

    try {
      (readerRef.current as any)?.stopContinuousDecode?.();
    } catch {}

    try {
      const v = videoRef.current;
      const stream = v?.srcObject as MediaStream | null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    } catch {}

    readerRef.current = null;
    setScanning(false);
  }

  async function startScan() {
    setMsg(null);
    setOpen(false);
    setScanPopupOpen(false);
    setScanInfo(null);

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
      readerRef.current = new BrowserMultiFormatReader();
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoEl);
      stopScan();
      const text = String(result?.getText?.() ?? "").trim();
      if (text) {
        await pickItemByCode(text, scanMode === "CART");
      }
    } catch (e: any) {
      console.error(e);
      setMsg("Errore camera/scansione: " + (e?.message ?? "sconosciuto"));
      stopScan();
    }
  }
  function addScannedToCart() {
  if (!scanInfo) return;

  const qn = toNumber(scanQty);
  if (!Number.isFinite(qn) || qn <= 0) {
    setMsg("Quantità non valida.");
    return;
  }

  if (qn > scanInfo.qtyFree) {
    setMsg(`Quantità superiore alla disponibilità (${scanInfo.qtyFree}).`);
    return;
  }

  setCart((prev) => {
    const idx = prev.findIndex(
      (r) => r.code === scanInfo.code && r.warehouse === scanInfo.warehouse
    );

    if (idx === -1) {
      return [
        ...prev,
        {
          code: scanInfo.code,
          name: scanInfo.name,
          um: scanInfo.um,
          warehouse: scanInfo.warehouse,
          qtyAvailable: scanInfo.qtyFree,
          qtyPick: qn,
        },
      ];
    }

    const copy = [...prev];
    const nextQty = copy[idx].qtyPick + qn;

    if (nextQty > copy[idx].qtyAvailable) {
      setMsg(`Totale richiesto superiore alla disponibilità (${copy[idx].qtyAvailable}).`);
      return prev;
    }

    copy[idx] = { ...copy[idx], qtyPick: nextQty };
    return copy;
  });

  setScanPopupOpen(false);
  setScanInfo(null);
  setScanQty("1");
  setMsg(null);
  setCartOpen(true);
  setScanSource(null);
}
  async function startCartNfcScan() {
    if (!isNfcSupported) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setMsg(
        isIOS
          ? "NFC non disponibile su iPhone/iPad. Usa barcode o manuale."
          : "NFC richiede Chrome su Android con HTTPS. Da mobile via IP usa npm run dev:https, poi accedi da https://TUO_IP:3000"
      );
      return;
    }
    setCartOpen(false);
    setScanInfo(null);
    setScanSource("nfc");
    setCartNfcScanning(true);
    setMsg(null);
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      const serialNumber = await new Promise<string>((resolve, reject) => {
        const handler = (event: any) => {
          ndef.removeEventListener("reading", handler);
          resolve(event.serialNumber ?? "unknown");
        };
        ndef.addEventListener("reading", handler);
        setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
      });
      if (!serialNumber || serialNumber === "unknown") {
        setMsg("Impossibile leggere l'ID del tag. Riprova.");
        return;
      }
      const { data: shelf } = await supabase.from("material_shelves").select("code,warehouse").eq("nfc_tag_id", serialNumber).maybeSingle();
      if (!shelf) {
        setMsg(`Tag NFC non associato a nessun materiale.`);
        return;
      }
      await pickItemByCode((shelf as any).code, true);
    } catch (e: any) {
      setMsg(e?.message ?? "Errore NFC");
    } finally {
      setCartNfcScanning(false);
    }
  }
  function stopNfcScan() {
    setCartNfcScanning(false);
    setScanInfo(null);
    setScanSource(null);
    if (cart.length > 0) setCartOpen(true);
  }
  async function addCartManualByCode(code: string) {
    const c = String(code ?? "").trim();
    if (!c) return;
    setMsg(null);
    setCartManualCode("");
    setCartSuggestions([]);
    setCartManualOpen(false);
    await pickItemByCode(c, true);
  }
  async function addCartManual() {
    const code = cartManualCode.trim();
    if (!code) {
      setMsg("Inserisci il codice materiale.");
      return;
    }
    await addCartManualByCode(code);
  }
function removeCartRow(code: string, wh: "PRM" | "REALE") {
  setCart((prev) => prev.filter((r) => !(r.code === code && r.warehouse === wh)));
}
async function confirmCartPickup() {
  if (!userId) {
    setMsg("Devi essere loggato.");
    return;
  }

  if (cart.length === 0) {
    setMsg("Il carrello è vuoto.");
    return;
  }

  const noteParsed = movementNoteSchema.safeParse({ note: note.trim() });
  if (!noteParsed.success) {
    setMsg(noteParsed.error.flatten().formErrors[0] ?? "Le note sono obbligatorie.");
    return;
  }

  setCartBusy(true);
  setMsg(null);

  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("first_name,last_name")
      .eq("id", userId)
      .maybeSingle();

    const fullName =
      `${String((prof as any)?.first_name ?? "").trim()} ${String((prof as any)?.last_name ?? "").trim()}`.trim() || null;

    const movementGroupId = crypto.randomUUID();

    for (const row of cart) {
      const payload: Partial<MovementRow> = {
        type: "OUT",
        code: row.code,
        qty: row.qtyPick,
        note: note.trim(),
        created_by: userId,
        created_by_name: fullName,
        warehouse: row.warehouse,
        status: "OPEN",
        returned_qty: 0,
        return_note: null,
        closed_at: null,
        closed_by: null,
        referent_id: null,
        referee_email: null,
        movement_group_id: movementGroupId,
      };

      const { error } = await supabase.from("movements").insert(payload as any);
      if (error) throw error;

      await applyDeltaToExcelLive(row.code, row.warehouse, -row.qtyPick);

      await writeAuditLog({
        action: "MOVEMENT_CREATED",
        entity_type: "movement",
        code: row.code,
        warehouse: row.warehouse,
        details_json: {
          type: "OUT",
          qty: row.qtyPick,
          note: note.trim(),
          mode: "cart",
        },
      });
    }

    setCart([]);
    setCartOpen(false);
    setScanMode("NORMAL");
    setMsg("Prelievo multiplo salvato ✅");
    await loadHistory();
  } catch (e: any) {
    console.error("confirmCartPickup error:", e);
    setMsg("Errore salvataggio carrello: " + (e?.message ?? "sconosciuto"));
  } finally {
    setCartBusy(false);
  }
}
  function resetSearch() {
    stopScan();
    setSearch("");
    setSuggestions([]);
    setPicked(null);
    setOpen(false);
    setMsg(null);
    setActiveIndex(0);
    setWarehouseChoicePopup(null);
    setShelfInfoPopup(null);
  }

  async function getOrCreateExcelLiveRow(code: string, wh: "PRM" | "REALE") {
    const { data: live, error: eLive } = await supabase
      .from("excel_live")
      .select("code,warehouse,qty_free,qty_blocked,qty_quality,row_json")
      .eq("code", code)
      .eq("warehouse", wh)
      .maybeSingle();

    if (eLive) throw eLive;
    if (live) return live as ExcelLiveRow;

    const { data: orig, error: eOrig } = await supabase
      .from("excel_original")
      .select("code,warehouse,qty_free,qty_blocked,qty_quality,row_json")
      .eq("code", code)
      .eq("warehouse", wh)
      .maybeSingle();

    if (eOrig) throw eOrig;
    if (!orig) return null;

    const ins = orig as any;
    const { data: created, error: eIns } = await supabase
      .from("excel_live")
      .insert({
        code: ins.code,
        warehouse: ins.warehouse,
        qty_free: ins.qty_free ?? 0,
        qty_blocked: ins.qty_blocked ?? 0,
        qty_quality: ins.qty_quality ?? 0,
        row_json: ins.row_json ?? {},
      })
      .select("code,warehouse,qty_free,qty_blocked,qty_quality,row_json")
      .maybeSingle();

    if (eIns) throw eIns;
    return (created ?? null) as ExcelLiveRow | null;
  }

  async function applyDeltaToExcelLive(code: string, wh: "PRM" | "REALE", deltaFree: number) {
    const live = await getOrCreateExcelLiveRow(code, wh);
    if (!live) {
      throw new Error(`Riga non trovata in excel_live (né in excel_original) per ${code} ${wh}. Importa l'Excel prima.`);
    }

    const rowJson = { ...(live.row_json ?? {}) };
    const currentFromJson = n(rowJson["Qnt. a Mag. libero"]);
    const currentFree = Number.isFinite(Number(live.qty_free)) ? n(live.qty_free) : currentFromJson;
    const base = Number.isFinite(currentFree) ? currentFree : currentFromJson;
    const next = base + deltaFree;

    rowJson["Qnt. a Mag. libero"] = next;

    const { error: eUp } = await supabase
      .from("excel_live")
      .update({
        qty_free: next,
        row_json: rowJson,
      })
      .eq("code", code)
      .eq("warehouse", wh);

    if (eUp) throw eUp;
  }

  async function saveMovement() {
    setMsg(null);

    if (!userId) return setMsg("Devi essere loggato per salvare movimenti.");
    if (!picked) return setMsg("Seleziona un materiale.");
    if (!isAdmin && type === "IN") return setMsg("Solo i tecnici/admin possono fare entrate.");

    const noteParsed = movementNoteSchema.safeParse({ note: note.trim() });
    if (!noteParsed.success) return setMsg(noteParsed.error.flatten().formErrors[0] ?? "Le note sono obbligatorie.");

    const qn = toNumber(qty);
    if (!Number.isFinite(qn) || qn <= 0) {
      return setMsg("Quantità non valida.");
    }

    if (type === "OUT" && warehouse === "MISTO") {
      try {
        const livePRM = await getOrCreateExcelLiveRow(picked.code, "PRM");
        const liveREALE = await getOrCreateExcelLiveRow(picked.code, "REALE");
        const prmFree = livePRM ? (Number.isFinite(Number(livePRM.qty_free)) ? n(livePRM.qty_free) : n((livePRM.row_json as any)?.["Qnt. a Mag. libero"] ?? 0)) : 0;
        const realeFree = liveREALE ? (Number.isFinite(Number(liveREALE.qty_free)) ? n(liveREALE.qty_free) : n((liveREALE.row_json as any)?.["Qnt. a Mag. libero"] ?? 0)) : 0;
        const totalAvailable = prmFree + realeFree;
        if (totalAvailable < qn) {
          return setMsg(`Quantità insufficiente. Disponibile: PRM ${prmFree} + REALE ${realeFree} = ${totalAvailable}, richiesta: ${qn}.`);
        }
        const fromPRM = Math.min(prmFree, qn);
        const fromREALE = qn - fromPRM;

        const { data: prof } = await supabase.from("profiles").select("first_name,last_name").eq("id", userId).maybeSingle();
        const fullName = `${String((prof as any)?.first_name ?? "").trim()} ${String((prof as any)?.last_name ?? "").trim()}`.trim() || null;

        if (fromPRM > 0) {
          const payloadPRM: Partial<MovementRow> = {
            type: "OUT",
            code: picked.code,
            qty: fromPRM,
            note: note.trim(),
            created_by: userId,
            created_by_name: fullName,
            warehouse: "PRM",
            status: "OPEN",
            returned_qty: 0,
            return_note: null,
            closed_at: null,
            closed_by: null,
            referent_id: null,
            referee_email: null,
          };
          const { error: e1 } = await supabase.from("movements").insert(payloadPRM as any);
          if (e1) return setMsg("Errore salvataggio movimento PRM: " + e1.message);
          await writeAuditLog({ action: "MOVEMENT_CREATED", entity_type: "movement", code: picked.code, warehouse: "PRM", details_json: { type: "OUT", qty: fromPRM, note: note.trim(), status: "OPEN" } });
          await applyDeltaToExcelLive(picked.code, "PRM", -fromPRM);
        }
        if (fromREALE > 0) {
          const payloadREALE: Partial<MovementRow> = {
            type: "OUT",
            code: picked.code,
            qty: fromREALE,
            note: note.trim(),
            created_by: userId,
            created_by_name: fullName,
            warehouse: "REALE",
            status: "OPEN",
            returned_qty: 0,
            return_note: null,
            closed_at: null,
            closed_by: null,
            referent_id: null,
            referee_email: null,
          };
          const { error: e2 } = await supabase.from("movements").insert(payloadREALE as any);
          if (e2) return setMsg("Errore salvataggio movimento REALE: " + e2.message);
          await writeAuditLog({ action: "MOVEMENT_CREATED", entity_type: "movement", code: picked.code, warehouse: "REALE", details_json: { type: "OUT", qty: fromREALE, note: note.trim(), status: "OPEN" } });
          await applyDeltaToExcelLive(picked.code, "REALE", -fromREALE);
        }

        setQty("");
        setNote("");
        setMsg(`Prelievo misto salvato ✅ (PRM: ${fromPRM}, REALE: ${fromREALE})`);
        const shelfItems: { warehouse: "PRM" | "REALE"; shelf: string; place?: string | null }[] = [];
        if (fromPRM > 0) {
          const { data: prmRow } = await supabase.from("material_shelves").select("shelf,place").eq("code", picked.code).eq("warehouse", "PRM").maybeSingle();
          if (prmRow?.shelf) shelfItems.push({ warehouse: "PRM", shelf: (prmRow as any).shelf, place: (prmRow as any).place });
        }
        if (fromREALE > 0) {
          const { data: realeRow } = await supabase.from("material_shelves").select("shelf,place").eq("code", picked.code).eq("warehouse", "REALE").maybeSingle();
          if (realeRow?.shelf) shelfItems.push({ warehouse: "REALE", shelf: (realeRow as any).shelf, place: (realeRow as any).place });
        }
        if (shelfItems.length > 0) setShelfInfoPopup({ code: picked.code, name: picked.name ?? "", items: shelfItems });
        await loadHistory();
        setTimeout(() => qtyRef.current?.focus(), 80);
        return;
      } catch (e: any) {
        return setMsg(e?.message ?? "Errore prelievo misto.");
      }
    }

    if (type === "OUT") {
      try {
        const live = await getOrCreateExcelLiveRow(picked.code, warehouse as "PRM" | "REALE");
        if (!live) {
          return setMsg(`Materiale ${picked.code} non trovato in ${warehouse}. Importa l'Excel prima.`);
        }
        const rowJson = { ...(live.row_json ?? {}) };
        const currentFromJson = n(rowJson["Qnt. a Mag. libero"]);
        const currentFree = Number.isFinite(Number(live.qty_free)) ? n(live.qty_free) : currentFromJson;
        if (currentFree < qn) {
          return setMsg(
            `Quantità insufficiente. Disponibile: ${currentFree}, richiesta: ${qn}.`
          );
        }
      } catch (e: any) {
        return setMsg(e?.message ?? "Errore verifica giacenza.");
      }
    }

    const { data: prof } = await supabase.from("profiles").select("first_name,last_name").eq("id", userId).maybeSingle();

    const fullName =
      `${String((prof as any)?.first_name ?? "").trim()} ${String((prof as any)?.last_name ?? "").trim()}`.trim() || null;

    const wh = warehouse === "MISTO" ? "PRM" : warehouse;
    const payload: Partial<MovementRow> = {
      type,
      code: picked.code,
      qty: qn,
      note: note.trim(),
      created_by: userId,
      created_by_name: fullName,
      warehouse: wh,
      status: type === "OUT" ? "OPEN" : "CLOSED",
      returned_qty: 0,
      return_note: null,
      closed_at: type === "OUT" ? null : new Date().toISOString(),
      closed_by: type === "OUT" ? null : userId,
      referent_id: null,
      referee_email: null,
    };

    const { error } = await supabase.from("movements").insert(payload as any);
    if (error) return setMsg("Errore salvataggio movimento: " + error.message);

    await writeAuditLog({
      action: "MOVEMENT_CREATED",
      entity_type: "movement",
      code: picked.code,
      warehouse: wh,
      details_json: {
        type,
        qty: qn,
        note: note.trim(),
        status: type === "OUT" ? "OPEN" : "CLOSED",
      },
    });

    try {
      const delta = type === "IN" ? qn : -qn;
      await applyDeltaToExcelLive(picked.code, wh, delta);
    } catch (e: any) {
      console.error("excel_live update error:", e);
      setMsg(
        "Movimento salvato ✅\n\n⚠️ Attenzione: non sono riuscito ad aggiornare excel_live (giacenze). " +
          (e?.message ?? "Errore sconosciuto")
      );
      setQty("");
      setNote("");
      await loadHistory();
      setTimeout(() => qtyRef.current?.focus(), 80);
      return;
    }

    setQty("");
    setNote("");
    setMsg("Movimento salvato ✅");

    if (type === "OUT") {
      const { data: shelfRow } = await supabase.from("material_shelves").select("warehouse,shelf,place").eq("code", picked.code).eq("warehouse", wh).maybeSingle();
      if (shelfRow?.shelf) {
        setShelfInfoPopup({
          code: picked.code,
          name: picked.name ?? "",
          items: [{ warehouse: wh, shelf: (shelfRow as any).shelf, place: (shelfRow as any).place }],
        });
      }
    }

    await loadHistory();
    setTimeout(() => qtyRef.current?.focus(), 80);
  }

  async function openHistory(code: string) {
    setHistoryCode(code);
    setHistoryOpen(true);
    setHistoryLoading(true);

    const { data, error } = await supabase
      .from("movements")
      .select("id,created_at,type,qty,note,created_by_name,created_by_email,warehouse")
      .eq("code", code)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("history error:", error);
      setHistoryRows([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryRows((data ?? []) as any);
    setHistoryLoading(false);
  }

  async function deleteMovement(id: string, skipConfirm?: boolean) {
    if (!isAdmin) return alert("Solo l'admin può eliminare i movimenti.");

    if (!skipConfirm) {
      const ok = confirm("Eliminare questo movimento?");
      if (!ok) return;
    }

    const { data: mov, error: readError } = await supabase
      .from("movements")
      .select("id,code,warehouse,type,qty,returned_qty")
      .eq("id", id)
      .single();

    if (readError || !mov) {
      console.error("Errore lettura movimento:", readError);
      return alert("Impossibile leggere il movimento.");
    }

    await writeAuditLog({
      action: "MOVEMENT_DELETED",
      entity_type: "movement",
      entity_id: mov.id,
      code: mov.code,
      warehouse: mov.warehouse,
      details_json: {
        type: mov.type,
        qty: mov.qty,
        returned_qty: mov.returned_qty,
      },
    });

    const code = mov.code;
    const warehouse = mov.warehouse;
    if (!warehouse) {
      return alert("Movimento senza magazzino, impossibile ripristinare la giacenza.");
    }
    const qty = Math.abs(Number(mov.qty ?? 0));
    const returnedQty = n(mov.returned_qty);

    const delta =
      mov.type === "IN"
        ? -qty
        : +(qty - returnedQty);

    try {
      await applyDeltaToExcelLive(code, warehouse as "PRM" | "REALE", delta);
    } catch (e: any) {
      console.error("Errore ripristino giacenza:", e);
      return alert("Errore ripristino giacenza: " + (e?.message ?? "sconosciuto"));
    }

    const { error: deleteError } = await supabase.from("movements").delete().eq("id", id);

    if (deleteError) {
      console.error("Errore eliminazione:", deleteError);
      return alert("Non posso eliminare: " + deleteError.message);
    }

    if (closing?.id === id) {
      setCloseOpen(false);
      setClosing(null);
      setClosingMeta(null);
      setEditRectify(false);
    }

    await loadHistory();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!isAdmin) return;
    const allSelected = history.length > 0 && history.every((m) => selectedIds.has(m.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map((m) => m.id)));
    }
  }

  async function deleteSelectedMovements() {
    if (!isAdmin || selectedIds.size === 0) return;
    const ok = confirm(`Eliminare ${selectedIds.size} movimento/i selezionato/i?`);
    if (!ok) return;
    setDeletingBulk(true);
    setMsg(null);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await deleteMovement(id, true);
    }
    setSelectedIds(new Set());
    setDeletingBulk(false);
    setMsg(`${ids.length} movimento/i eliminato/i.`);
    await loadHistory();
  }

  async function loadItemMetaWithFallback(code: string, wh: "PRM" | "REALE" | null) {
    const { data: it, error: e1 } = await supabase.from("items").select("code,name,um").eq("code", code).maybeSingle();
    if (e1) console.error("meta items error:", e1);

    const name1 = String((it as any)?.name ?? "").trim();
    const um1 = String((it as any)?.um ?? "").trim();

    if (name1 || um1) return { name: name1 || "-", um: um1 || "-" };

    const other = wh === "PRM" ? "REALE" : "PRM";
    const { data: s2, error: e2 } = await supabase
      .from("excel_live")
      .select("row_json")
      .eq("code", code)
      .eq("warehouse", other)
      .maybeSingle();

    if (e2) console.error("meta excel_live error:", e2);

    const ex = (((s2 as any)?.row_json ?? {}) as Record<string, any>) || {};
    const name2 = String(ex["Descrizione Materiale"] ?? ex["Descrizione"] ?? "").trim();
    const um2 = String(ex["Unità di Misura"] ?? ex["UM"] ?? "").trim();

    return { name: name2 || "-", um: um2 || "-" };
  }

  async function openCloseModal(m: MovementRow) {
    setMsg(null);
    setEditingMovementId(null);

    let group: MovementRow[] = [m];
    if ((m as any).movement_group_id) {
      const { data: groupData } = await supabase
        .from("movements")
        .select("id,created_at,type,code,qty,note,warehouse,created_by,created_by_name,status,returned_qty,return_note,referent_id,referee_email,referee_name,closed_at,closed_by,movement_group_id")
        .eq("movement_group_id", (m as any).movement_group_id)
        .order("created_at", { ascending: true });
      if (groupData?.length) group = groupData as MovementRow[];
    }

    setClosing(m);
    setClosingGroup(group);
    setCloseOpen(true);
    setSelectedClosedRowId(null);

    const r = n(m.returned_qty);
    setReturnQty(String(r));
    const wh = m.warehouse ?? "PRM";
    setReturnToPrm(wh === "PRM" ? String(r) : "0");
    setReturnToReale(wh === "REALE" ? String(r) : "0");
    setReturnNote(m.return_note ?? "");
    setSelReferentId(m.referent_id ?? "");
    setEditRectify(false);

    const meta = await loadItemMetaWithFallback(m.code, (m.warehouse ?? null) as any);
    setClosingMeta(meta);
  }

  function startEditGroupItem(mov: MovementRow) {
    setSelectedClosedRowId(null);
    setEditingMovementId(mov.id);
    const r = n(mov.returned_qty);
    setReturnQty(String(r));
    const wh = mov.warehouse ?? "PRM";
    setReturnToPrm(wh === "PRM" ? String(r) : "0");
    setReturnToReale(wh === "REALE" ? String(r) : "0");
    setReturnNote(mov.return_note ?? "");
    setSelReferentId(mov.referent_id ?? "");
    setEditRectify(true);
    setClosing(mov);
    loadItemMetaWithFallback(mov.code, (mov.warehouse ?? null) as any).then(setClosingMeta);
  }

  async function confirmRectify() {
    if (!closing || !editingMovementId) return;
    const mov = closingGroup.find((m) => m.id === editingMovementId);
    if (!mov) return;

    const outQty = Math.abs(n(mov.qty));
    const r = toNumber(returnQty);
    if (!Number.isFinite(r) || r < 0) {
      setMsg("Quantità rientro non valida (>= 0).");
      return;
    }
    if (r > outQty) {
      setMsg(`Il rientro non può superare l'uscita (${outQty}).`);
      return;
    }
    const rPrm = toNumber(returnToPrm);
    const rReale = toNumber(returnToReale);
    if (r > 0 && (rPrm < 0 || rReale < 0 || Math.abs(rPrm + rReale - r) > 0.001)) {
      setMsg("Rientro in PRM + Rientro in REALE deve essere uguale alla quantità rientro.");
      return;
    }

    const { error } = await supabase
      .from("movements")
      .update({
        returned_qty: r,
        return_note: (returnNote ?? "").trim() || null,
      } as any)
      .eq("id", mov.id);

    if (error) {
      setMsg("Errore salvataggio rettifica: " + (error as any)?.message);
      return;
    }

    setMsg(null);
    setClosingGroup((prev) =>
      prev.map((row) =>
        row.id === mov.id
          ? { ...row, returned_qty: r, return_note: (returnNote ?? "").trim() || null }
          : row
      )
    );
    setHistory((prev) =>
      prev.map((row) =>
        row.id === mov.id
          ? { ...row, returned_qty: r, return_note: (returnNote ?? "").trim() || null }
          : row
      )
    );
    setEditingMovementId(null);
    setEditRectify(false);
    setClosing(closingGroup[0] ?? mov);
    setMsg("Rettifica salvata. Conferma tutti gli articoli, poi seleziona il referente e chiudi il gruppo.");
  }

  async function confirmClose() {
    if (!closing) return;

    const isGroup = closingGroup.length > 1 && (closing as any).movement_group_id;
    const openInGroup = closingGroup.filter((m) => (m.status ?? "OPEN") === "OPEN");

    if (isGroup && openInGroup.length > 0) {
      const needsRettifica = openInGroup.filter((m) => m.returned_qty === null || m.returned_qty === undefined);
      if (needsRettifica.length > 0) {
        setMsg("Non puoi chiudere finché non hai confermato la rettifica di tutti gli articoli. Clicca \"Rettifica\" su ogni articolo aperto e salva le quantità.");
        return;
      }
    }

    const st = (closing.status ?? (closing.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
    if (st === "CLOSED" && !isGroup) {
      setCloseOpen(false);
      setClosing(null);
      setClosingMeta(null);
      setEditRectify(false);
      return;
    }

    const ref = referents.find((x) => x.id === selReferentId) ?? null;
    if (!ref?.email) {
      setMsg("Seleziona un referente valido prima di confermare la chiusura.");
      return;
    }

    const closedAtIso = new Date().toISOString();

    if (isGroup) {
      for (const mov of closingGroup) {
        const outQty = Math.abs(n(mov.qty));
        const r = n(mov.returned_qty) ?? 0;
        const rPrm = mov.warehouse === "PRM" ? r : 0;
        const rReale = mov.warehouse === "REALE" ? r : 0;

        const { error } = await supabase
          .from("movements")
          .update({
            status: "CLOSED",
            closed_at: closedAtIso,
            closed_by: userId ?? null,
            referent_id: ref?.id ?? null,
            referee_email: ref?.email ?? null,
            referee_name: ref?.name ?? null,
          } as any)
          .eq("id", mov.id);

        if (error) {
          setMsg("Errore chiusura: " + (error as any)?.message);
          return;
        }

        try {
          if (r > 0) {
            if (rPrm > 0) await applyDeltaToExcelLive(mov.code, "PRM", rPrm);
            if (rReale > 0) await applyDeltaToExcelLive(mov.code, "REALE", rReale);
          }
        } catch (e: any) {
          console.error("excel_live return update error:", e);
          setMsg("Chiusura salvata ✅\n\n⚠️ Errore aggiornamento excel_live per " + mov.code);
          setCloseOpen(false);
          setClosing(null);
          setClosingGroup([]);
          setClosingMeta(null);
          setEditRectify(false);
          await loadHistory();
          return;
        }

        await writeAuditLog({
          action: "MOVEMENT_CLOSED",
          entity_type: "movement",
          entity_id: mov.id,
          code: mov.code,
          warehouse: mov.warehouse,
          details_json: {
            type: mov.type,
            out_qty: outQty,
            returned_qty: r,
            net_qty: Math.max(0, outQty - r),
            return_note: mov.return_note,
            referent_id: ref?.id ?? null,
            referent_name: ref?.name ?? null,
            referent_email: ref?.email ?? null,
            closed_at: closedAtIso,
          },
        });
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: { user } } = await supabase.auth.getUser();
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send_close_email`;
        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            movements: closingGroup.map((mov) => {
              const outQty = Math.abs(n(mov.qty));
              const r = n(mov.returned_qty) ?? 0;
              return {
                movement_id: mov.id,
                code: mov.code,
                warehouse: mov.warehouse,
                out_qty: outQty,
                returned_qty: r,
                net_qty: Math.max(0, outQty - r),
                return_note: mov.return_note ?? null,
                type: mov.type,
              };
            }),
            referent_name: ref?.name ?? null,
            referent_email: ref?.email ?? null,
            closed_by: user?.email ?? null,
            closed_at: closedAtIso,
          }),
        });
      } catch (_e) {}

      setMsg("Prelievo multiplo chiuso ✅");
      setCloseOpen(false);
      setClosing(null);
      setClosingGroup([]);
      setClosingMeta(null);
      setEditRectify(false);
      setEditingMovementId(null);
      await loadHistory();
      return;
    }

    const outQty = Math.abs(n(closing.qty));
    const r = toNumber(returnQty);

    if (!Number.isFinite(r) || r < 0) {
      setMsg("Quantità rientro non valida (>= 0).");
      return;
    }

    if (r > outQty) {
      setMsg(`Il rientro non può superare l’uscita (${outQty}).`);
      return;
    }

    const rPrm = toNumber(returnToPrm);
    const rReale = toNumber(returnToReale);
    if (r > 0 && (rPrm < 0 || rReale < 0 || Math.abs(rPrm + rReale - r) > 0.001)) {
      setMsg("Rientro in PRM + Rientro in REALE deve essere uguale alla quantità rientro.");
      return;
    }

    const { error } = await supabase
      .from("movements")
      .update({
        returned_qty: r,
        return_note: (returnNote ?? "").trim() || null,
        status: "CLOSED",
        closed_at: closedAtIso,
        closed_by: userId ?? null,
        referent_id: ref?.id ?? null,
        referee_email: ref?.email ?? null,
        referee_name: ref?.name ?? null,
      } as any)
      .eq("id", closing.id);

    if (error) {
      setMsg("Errore chiusura: " + (error as any)?.message);
      return;
    }

    try {
      if (r > 0) {
        if (rPrm > 0) await applyDeltaToExcelLive(closing.code, "PRM", rPrm);
        if (rReale > 0) await applyDeltaToExcelLive(closing.code, "REALE", rReale);
      }
    } catch (e: any) {
      console.error("excel_live return update error:", e);
      setMsg(
        "Chiusura salvata ✅\n\n⚠️ Attenzione: non sono riuscito ad aggiornare excel_live (rientro). " +
          (e?.message ?? "Errore sconosciuto")
      );
      setCloseOpen(false);
      setClosing(null);
      setClosingMeta(null);
      setEditRectify(false);
      await loadHistory();
      return;
    }

    setHistory((prev) =>
      prev.map((row) =>
        row.id === closing.id
          ? {
              ...row,
              returned_qty: r,
              return_note: (returnNote ?? "").trim() || null,
              status: "CLOSED",
              closed_at: closedAtIso,
              closed_by: userId ?? null,
              referent_id: ref?.id ?? null,
              referee_email: ref?.email ?? null,
              referee_name: ref?.name ?? null,
            }
          : row
      )
    );

    await writeAuditLog({
      action: "MOVEMENT_CLOSED",
      entity_type: "movement",
      entity_id: closing.id,
      code: closing.code,
      warehouse: closing.warehouse,
      details_json: {
        type: closing.type,
        out_qty: outQty,
        returned_qty: r,
        return_to_prm: rPrm,
        return_to_reale: rReale,
        net_qty: Math.max(0, outQty - r),
        return_note: (returnNote ?? "").trim() || null,
        referent_id: ref?.id ?? null,
        referent_name: ref?.name ?? null,
        referent_email: ref?.email ?? null,
        closed_at: closedAtIso,
      },
    });

    let emailFailed = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send_close_email`;
      const body = {
        movement_id: closing.id,
        code: closing.code,
        warehouse: closing.warehouse,
        out_qty: outQty,
        returned_qty: r,
        net_qty: Math.max(0, outQty - r),
        return_note: (returnNote ?? "").trim() || null,
        referent_name: ref.name,
        referent_email: ref.email,
        closed_by: userEmail ?? null,
        closed_at: closedAtIso,
        type: closing.type,
      };
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const respData = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        emailFailed = true;
        const errMsg =
          typeof respData?.error === "string"
            ? respData.error
            : respData?.error?.message ?? (respData?.error ? JSON.stringify(respData.error) : resp.statusText || "Errore sconosciuto");
        console.warn("Email non inviata:", errMsg);
        setMsg(`Movimento chiuso ✅ (email non inviata: ${errMsg})`);
      }
    } catch (e: any) {
      emailFailed = true;
      console.warn("Email non inviata:", e?.message ?? e);
      setMsg("Movimento chiuso ✅ (email non inviata: " + (e?.message ?? "errore di rete") + ")");
    }
    if (!emailFailed) setMsg("Movimento chiuso ✅");

    await loadHistory();

    if (closingGroup.length > 1 && (closing as any).movement_group_id) {
      const { data: groupData } = await supabase
        .from("movements")
        .select("id,created_at,type,code,qty,note,warehouse,created_by,created_by_name,status,returned_qty,return_note,referent_id,referee_email,referee_name,closed_at,closed_by,movement_group_id")
        .eq("movement_group_id", (closing as any).movement_group_id)
        .order("created_at", { ascending: true });
      if (groupData?.length) {
        setClosingGroup(groupData as MovementRow[]);
        setClosing(groupData[0] as MovementRow);
        setEditingMovementId(null);
        setEditRectify(false);
        const first = groupData[0] as MovementRow;
        loadItemMetaWithFallback(first.code, (first.warehouse ?? null) as any).then(setClosingMeta);
      } else {
        setCloseOpen(false);
        setClosing(null);
        setClosingGroup([]);
        setClosingMeta(null);
        setEditRectify(false);
        setEditingMovementId(null);
      }
    } else {
      setCloseOpen(false);
      setClosing(null);
      setClosingGroup([]);
      setClosingMeta(null);
      setEditRectify(false);
      setEditingMovementId(null);
    }
  }

  useEffect(() => {
    (async () => {
      await loadHistory();
      await loadReferents();
      if (!userId || !isAdmin) setType("OUT");
    })();

    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAdmin]);

  useEffect(() => {
    setIsNfcSupported(typeof (window as any).NDEFReader !== "undefined");
  }, []);

  useEffect(() => {
    if (!cartOpen) {
      setCartManualOpen(false);
      setCartSuggestions([]);
      return;
    }
    if (!cartManualOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (cartManualRef.current && !cartManualRef.current.contains(e.target as Node)) {
        setCartManualOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [cartOpen, cartManualOpen]);

  // Apri direttamente il movimento da URL (?open=id)
  useEffect(() => {
    if (!urlOpenId) return;

    (async () => {
      const { data: m, error } = await supabase
        .from("movements")
        .select("id,created_at,type,code,qty,note,warehouse,created_by,created_by_name,status,returned_qty,return_note,referent_id,referee_email,referee_name,closed_at,closed_by")
        .eq("id", urlOpenId)
        .maybeSingle();

      if (error || !m) {
        router.replace("/movimenti", { scroll: false });
        return;
      }

      await openCloseModal(m as MovementRow);
      router.replace("/movimenti", { scroll: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOpenId]);

  useEffect(() => {
    const channel = supabase
      .channel("movements-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, async () => {
        if (closeOpen) return;
        await loadHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeOpen]);

  useEffect(() => {
    setActiveIndex(0);

    const t = setTimeout(() => {
      if (open) loadSuggestions(search);
    }, 220);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  useEffect(() => {
    const text = fMaterial.trim();

    const t = setTimeout(() => {
      if (!text) {
        loadHistory(true);
        return;
      }

      if (text.length >= 2) {
        loadHistory(true);
      }
    }, 180);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fFrom, fTo, fType, fWarehouse, fMaterial]);

  const active = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  const displayHistory = useMemo(() => {
    const seen = new Set<string>();
    return history.filter((row) => {
      const gid = (row as any).movement_group_id;
      if (gid) {
        if (seen.has(gid)) return false;
        seen.add(gid);
      }
      return true;
    });
  }, [history]);

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Movimenti</div>
      </div>

      <div className="filtersRow" style={{ padding: 12 }}>
        <div
          className="mobileGrid1"
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr 1.2fr 1.2fr 2.6fr auto auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div className="filterDateWrap">
            <label className="label" htmlFor="fFrom">
              Data da
            </label>
            <input id="fFrom" name="fFrom" className="input mobileInputFull" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </div>

          <div className="filterDateWrap">
            <label className="label" htmlFor="fTo">
              Data a
            </label>
            <input id="fTo" name="fTo" className="input mobileInputFull" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </div>

          <div>
            <label className="label" htmlFor="fType">
              Tipo
            </label>
            <select id="fType" name="fType" className="input" value={fType} onChange={(e) => setFType(e.target.value as any)}>
              <option value="ALL">Tutti</option>
              <option value="IN">Entrata</option>
              <option value="OUT">Uscita</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="fWh">
              Magazzino
            </label>
            <select id="fWh" name="fWh" className="input" value={fWarehouse} onChange={(e) => setFWarehouse(e.target.value as any)}>
              <option value="ALL">Tutti</option>
              <option value="PRM">PRM</option>
              <option value="REALE">REALE</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="fMaterial">
              Materiale
            </label>
            <input
              id="fMaterial"
              name="fMaterial"
              className="input"
              value={fMaterial}
              onChange={(e) => setFMaterial(e.target.value)}
              placeholder="Cerca per codice o descrizione..."
            />
          </div>

          <button
            className="btn"
            onClick={() => {
              setFFrom("");
              setFTo("");
              setFType("ALL");
              setFWarehouse("ALL");
              setFMaterial("");
              setTimeout(() => loadHistory(true), 0);
            }}
          >
            Reset
          </button>

          <button className="btn" onClick={() => downloadRegistroPDF(history)}>
            PDF
          </button>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            Ricerca automatica attiva · scrivi almeno 2 caratteri nel campo materiale
            {refreshing ? " · aggiornamento..." : ""}
          </div>

          <div style={{ opacity: 0.75, fontSize: 12 }}>Permessi: {isAdmin ? "Admin" : "Operatore"}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="mobileFlexCol" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {isAdmin && (
            <button
              className={`btn ${type === "IN" ? "btnPrimary" : ""}`}
              onClick={() => {
                setType("IN");
                if (warehouse === "MISTO") setWarehouse("PRM");
              }}
              type="button"
            >
              Entrata
            </button>
          )}

          <button className={`btn ${type === "OUT" ? "btnPrimary" : ""}`} onClick={() => setType("OUT")} type="button">
            Uscita
          </button>

          {type === "IN" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label className="label" htmlFor="whMove" style={{ marginBottom: 0 }}>
                Magazzino
              </label>
              <select
                id="whMove"
                name="whMove"
                className="input mobileInputFull"
                value={warehouse === "MISTO" ? "PRM" : warehouse}
                onChange={(e) => setWarehouse(e.target.value as "PRM" | "REALE")}
                style={{ width: 140 }}
              >
                <option value="PRM">PRM</option>
                <option value="REALE">REALE</option>
              </select>
            </div>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            {scanMode === "CART" && (
              <button
                className={`btn ${cartOpen ? "btnPrimary" : ""}`}
                type="button"
                onClick={() => setCartOpen((o) => !o)}
                aria-label={cartOpen ? "Chiudi carrello" : "Apri carrello"}
                title={cartOpen ? "Chiudi carrello" : "Apri carrello"}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <CartIcon />
                <span>Carrello</span>
                {cart.length > 0 && (
                  <span style={{ background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: "2px 6px", fontSize: 11, fontWeight: 800 }}>
                    {cart.length}
                  </span>
                )}
              </button>
            )}
            <button className="btn" type="button" onClick={() => (scanning ? stopScan() : startScan())} aria-label={scanning ? "Ferma scansione barcode" : "Avvia scansione barcode"}>
              {scanning ? "Chiudi camera" : "Scanner"}
            </button>

            <button className="btn" type="button" onClick={resetSearch}>
              Pulisci
            </button>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <label className="label" htmlFor="scanModeSelect" style={{ marginBottom: 0 }}>
                Modalità scanner
              </label>
              <select
                id="scanModeSelect"
                className="input mobileInputFull"
                value={scanMode}
                onChange={(e) => {
                  const mode = e.target.value as "NORMAL" | "CART";
                  setScanMode(mode);

                  if (mode === "CART") {
                    setScanPopupOpen(false);
                    setScanInfo(null);
                    setCartOpen(true);
                    setMsg(null);
                  } else {
                    setCartOpen(false);
                  }
                }}
              >
                <option value="NORMAL">Inserimento singolo</option>
                <option value="CART">Carrello multiplo</option>
              </select>
            </div>
          </div>
        </div>

        <div ref={boxRef} style={{ position: "relative", marginTop: 12 }}>
          <label className="label" htmlFor="searchItem">
            Materiale (codice o descrizione)
          </label>
          <input
            id="searchItem"
            name="searchItem"
            className="input"
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              setOpen(true);
              setPicked(null);
              setMsg(null);
              if (!v.trim()) setSuggestions([]);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open) return;

              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (active) pickItem(active);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Filtra per codice, descrizione..."
          />

          {open && search.trim() && (
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
              {suggestions.length === 0 ? (
                <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
              ) : (
                suggestions.map((it, idx) => (
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
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>{it.code}</div>
                    <div style={{ fontSize: 12, color: "#334155" }}>{it.name}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Video spostato nel popup scanner */}

        <div className="mobileFormRow" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 12 }}>
          <div style={{ gridColumn: "span 8" }}>
            <label className="label" htmlFor="noteMove">
              Note *
            </label>
            <input id="noteMove" name="noteMove" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="DDT / commessa / cliente (obbligatorio)" required />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label className="label" htmlFor="qtyMove">
              Quantità
            </label>
            <input
              ref={qtyRef}
              id="qtyMove"
              name="qtyMove"
              className="input"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="es. 5"
            />
          </div>

          <div style={{ gridColumn: "span 1", display: "flex", alignItems: "end" }}>
            <button className="btn btnPrimary" onClick={saveMovement} style={{ width: "100%" }}>
              Salva
            </button>
          </div>
        </div>

        {picked && (
          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.95 }}>
            <div>
              <b>{picked.code}</b> · {picked.name}
            </div>
            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
              UM: <b>{picked.um ?? "-"}</b>
            </div>
          </div>
        )}

        {msg && <div style={{ marginTop: 10, fontWeight: 800, whiteSpace: "pre-wrap" }}>{msg}</div>}
      </div>

      {warehouseChoicePopup && (
        <div
          onMouseDown={() => {
            const wasForCart = warehouseChoicePopup.forCart;
            const hadCart = cart.length > 0;
            setWarehouseChoicePopup(null);
            setPicked(null);
            setSearch("");
            if (wasForCart && hadCart) setCartOpen(true);
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
              width: "min(420px, 100%)",
              background: "white",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.16)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  {warehouseChoicePopup.code} · {warehouseChoicePopup.name}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    marginTop: 4,
                    color: warehouseChoicePopup.mode === "NONE" ? "#dc2626" : "#64748b",
                    fontWeight: warehouseChoicePopup.mode === "NONE" ? 700 : 400,
                  }}
                >
                  {warehouseChoicePopup.mode === "NONE" &&
                    "⚠️ Nessuna quantità disponibile in PRM né REALE."}
                  {warehouseChoicePopup.mode === "PRM_ONLY" &&
                    "Materiale presente solo in magazzino PRM."}
                  {warehouseChoicePopup.mode === "REALE_ONLY" &&
                    "Materiale presente solo in magazzino REALE."}
                  {warehouseChoicePopup.mode === "BOTH" &&
                    "Materiale presente in entrambi i magazzini. Scegli da dove prelevare:"}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setWarehouseChoicePopup(null);
                  setPicked(null);
                  setSearch("");
                  if (warehouseChoicePopup.forCart && cart.length > 0) setCartOpen(true);
                }}
              >
                Chiudi
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 120px", padding: 12, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", opacity: warehouseChoicePopup.prmFree > 0 ? 1 : 0.7 }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>PRM</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{warehouseChoicePopup.prmFree}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>disponibili</div>
                {(warehouseChoicePopup.prmShelf || warehouseChoicePopup.prmPlace) && (
                  <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700, color: "#0284c7" }}>
                    {[warehouseChoicePopup.prmShelf && `Scaffale: ${warehouseChoicePopup.prmShelf}`, warehouseChoicePopup.prmPlace && `Luogo: ${warehouseChoicePopup.prmPlace}`].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <div style={{ flex: "1 1 120px", padding: 12, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", opacity: warehouseChoicePopup.realeFree > 0 ? 1 : 0.7 }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>REALE</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{warehouseChoicePopup.realeFree}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>disponibili</div>
                {(warehouseChoicePopup.realeShelf || warehouseChoicePopup.realePlace) && (
                  <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700, color: "#7c3aed" }}>
                    {[warehouseChoicePopup.realeShelf && `Scaffale: ${warehouseChoicePopup.realeShelf}`, warehouseChoicePopup.realePlace && `Luogo: ${warehouseChoicePopup.realePlace}`].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              {warehouseChoicePopup.mode === "NONE" && (
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Nessuna azione disponibile. Chiudi e verifica che il materiale sia stato importato.
                </div>
              )}
              {warehouseChoicePopup.mode === "PRM_ONLY" && (
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={() => confirmWarehouseChoice("PRM")}
                  style={{ width: "100%" }}
                >
                  Preleva da PRM ({warehouseChoicePopup.prmFree} disponibili)
                </button>
              )}
              {warehouseChoicePopup.mode === "REALE_ONLY" && (
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={() => confirmWarehouseChoice("REALE")}
                  style={{ width: "100%" }}
                >
                  Preleva da REALE ({warehouseChoicePopup.realeFree} disponibili)
                </button>
              )}
              {warehouseChoicePopup.mode === "BOTH" && (
                <>
                  {!warehouseChoicePopup.forCart && (
                    <button
                      type="button"
                      className="btn btnPrimary"
                      onClick={() => confirmWarehouseChoice("MISTO")}
                      style={{ width: "100%" }}
                    >
                      Prelievo misto (PRM prima)
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => confirmWarehouseChoice("PRM")}
                    style={{ width: "100%" }}
                  >
                    Solo da PRM ({warehouseChoicePopup.prmFree} disponibili)
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => confirmWarehouseChoice("REALE")}
                    style={{ width: "100%" }}
                  >
                    Solo da REALE ({warehouseChoicePopup.realeFree} disponibili)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {shelfInfoPopup && (
        <div
          onMouseDown={() => setShelfInfoPopup(null)}
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
              width: "min(400px, 100%)",
              background: "white",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.16)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Posizione materiale</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  <b>{shelfInfoPopup.code}</b> · {shelfInfoPopup.name}
                </div>
              </div>
              <button type="button" className="btn" onClick={() => setShelfInfoPopup(null)}>
                Chiudi
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
              {shelfInfoPopup.items.map((it) => (
                <div
                  key={it.warehouse}
                  style={{
                    padding: 12,
                    background: it.warehouse === "PRM" ? "rgba(2,132,199,0.08)" : "rgba(124,58,237,0.08)",
                    borderRadius: 8,
                    border: `1px solid ${it.warehouse === "PRM" ? "rgba(2,132,199,0.25)" : "rgba(124,58,237,0.25)"}`,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Magazzino {it.warehouse}</div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {[it.shelf && `Scaffale ${it.shelf}`, it.place && `Luogo ${it.place}`].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Storico movimenti</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isAdmin && selectedIds.size > 0 && (
              <button
                className="btn"
                onClick={deleteSelectedMovements}
                disabled={deletingBulk}
                style={{ background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.4)" }}
              >
                {deletingBulk ? "Eliminazione…" : `Elimina ${selectedIds.size} selezionati`}
              </button>
            )}
            <button className="btn" onClick={() => loadHistory()} style={{ justifyContent: "center" }}>
              Applica filtri
            </button>
          </div>
        </div>

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={history.length > 0 && history.every((m) => selectedIds.has(m.id))}
                      onChange={toggleSelectAll}
                      title="Seleziona tutti"
                      aria-label="Seleziona tutti i movimenti"
                    />
                  </th>
                )}
                <th>Data</th>
                <th>Stato</th>
                <th>Tipo</th>
                <th>Codice</th>
                <th>Descrizione</th>
                <th>Mag.</th>
                <th>Q.tà</th>
                <th>Rientro</th>
                <th>Netta</th>
                <th>Note</th>
                <th>Inserito da</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 12 : 11} style={{ padding: 12, color: "#0f172a" }}>
                    Caricamento…
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 12 : 11} style={{ padding: 12, color: "#0f172a" }}>
                    Nessun movimento.
                  </td>
                </tr>
              ) : (
                displayHistory.map((m) => {
                  const gid = (m as any).movement_group_id;
                  const groupCount = gid ? history.filter((r) => (r as any).movement_group_id === gid).length : 1;
                  const st = (m.status ?? (m.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
                  const isOpenOut = m.type === "OUT" && st === "OPEN";
                  const outAbs = Math.abs(n(m.qty));
                  const net = m.type === "OUT" ? Math.max(0, outAbs - n(m.returned_qty)) : null;

                  return (
                    <tr
                      key={m.id}
                      onClick={() => openCloseModal(m)}
                      style={{
                        cursor: "pointer",
                        background: isOpenOut ? "rgba(148,163,184,0.18)" : "transparent",
                      }}
                      title={canEditRow(m) ? "Clicca per chiudere / rettificare" : "Clicca per vedere il dettaglio"}
                    >
                      {isAdmin && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(m.id)}
                            onChange={() => toggleSelect(m.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Seleziona movimento ${m.code}`}
                          />
                        </td>
                      )}
                      <td>{fmtDate(m.created_at)}</td>

                      <td>
                        <span
                          className={st === "OPEN" ? "openStripe" : ""}
                          style={st === "OPEN" ? (() => { const s = pillStyle(st); const { background, ...rest } = s; return rest; })() : pillStyle(st)}
                        >
                          {st === "OPEN" ? "APERTO" : "CHIUSO"}
                        </span>
                      </td>

                      <td>
                        <span style={pillStyle(m.type)}>{m.type === "IN" ? "ENTRATA" : "USCITA"}</span>
                      </td>

                      <td style={{ fontWeight: 900 }}>
                        {groupCount > 1 ? `Prelievo multiplo (${groupCount} articoli)` : m.code}
                      </td>
                      <td>{groupCount > 1 ? `${nameMap[m.code] ?? m.code} (+${groupCount - 1} altri)` : (nameMap[m.code] ?? "-")}</td>

                      <td>{groupCount > 1 ? "-" : (m.warehouse ? <span style={pillStyle(m.warehouse)}>{m.warehouse}</span> : "-")}</td>

                      <td style={{ fontWeight: 900 }}>
                        {groupCount > 1 ? "-" : `${m.type === "IN" ? "+" : "-"}${outAbs}`}
                      </td>

                      <td>{groupCount > 1 ? "-" : (m.type === "OUT" ? n(m.returned_qty) : "-")}</td>
                      <td style={{ fontWeight: 900 }}>{groupCount > 1 ? "-" : (m.type === "OUT" ? net : "-")}</td>

                      <td>{m.note ?? ""}</td>
                      <td>{m.created_by_name ?? "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {closeOpen && closing && (
        <div
          onMouseDown={() => {
            if (editRectify) return;
            setCloseOpen(false);
            setClosing(null);
            setClosingGroup([]);
            setClosingMeta(null);
            setMsg(null);
            setEditRectify(false);
            setEditingMovementId(null);
            setSelectedClosedRowId(null);
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
            <button
              className="btn"
              onClick={() => {
                setCloseOpen(false);
                setClosing(null);
                setClosingGroup([]);
                setClosingMeta(null);
                setMsg(null);
                setEditRectify(false);
                setEditingMovementId(null);
                setSelectedClosedRowId(null);
              }}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
              }}
            >
              Chiudi
            </button>

            {closingGroup.length > 1 && (
              <div style={{ marginBottom: 16, padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Prelievo multiplo · {closingGroup.length} articoli</div>
                <div className="tableWrap">
                  <table className="table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Codice</th>
                        <th>Descrizione</th>
                        <th>Mag.</th>
                        <th>Q.tà</th>
                        <th>Q.tà rett.</th>
                        <th>Stato</th>
                        <th>Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closingGroup.map((mov) => {
                        const st = (mov.status ?? "OPEN") as "OPEN" | "CLOSED";
                        const isEditing = editingMovementId === mov.id;
                        const isSelected = selectedClosedRowId === mov.id;
                        const rettified = mov.returned_qty !== null && mov.returned_qty !== undefined;
                        const isClosed = st === "CLOSED";
                        return (
                          <tr
                            key={mov.id}
                            style={{
                              background: isEditing ? "#eef2ff" : isSelected ? "#e0f2fe" : undefined,
                              cursor: isClosed ? "pointer" : undefined,
                            }}
                            onClick={isClosed ? () => setSelectedClosedRowId((prev) => (prev === mov.id ? null : mov.id)) : undefined}
                          >
                            <td style={{ fontWeight: 900 }}>{mov.code}</td>
                            <td>{nameMap[mov.code] ?? "-"}</td>
                            <td>{mov.warehouse ? <span style={pillStyle(mov.warehouse)}>{mov.warehouse}</span> : "-"}</td>
                            <td>{Math.abs(n(mov.qty))}</td>
                            <td>{rettified ? n(mov.returned_qty) : "—"}</td>
                            <td>
                              <span style={pillStyle(st)}>{st === "OPEN" ? "APERTO" : "CHIUSO"}</span>
                            </td>
                            <td onClick={(e) => !isClosed && e.stopPropagation()}>
                              {st === "OPEN" ? (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => startEditGroupItem(mov)}
                                  style={{ padding: "4px 10px", fontSize: 12 }}
                                >
                                  {isEditing ? "In modifica" : "Rettifica"}
                                </button>
                              ) : (
                                <span style={{ fontSize: 12, color: "#64748b" }}>
                                  {isSelected ? "Clicca per chiudere dettaglio" : "Clicca per dettaglio"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                  {closingGroup.some((m) => (m.status ?? "OPEN") === "CLOSED")
                    ? "Clicca su una riga chiusa per vedere il dettaglio completo."
                    : "Conferma la rettifica di ogni articolo (quantità rientro). Poi seleziona il referente e chiudi tutto in un unico invio."}
                </div>
                {selectedClosedRowId && (() => {
                  const mov = closingGroup.find((m) => m.id === selectedClosedRowId);
                  if (!mov) return null;
                  const net = Math.max(0, Math.abs(n(mov.qty)) - n(mov.returned_qty));
                  const detailRows = [
                    { label: "Codice", value: mov.code },
                    { label: "Descrizione", value: nameMap[mov.code] ?? "-" },
                    { label: "Magazzino uscita", value: mov.warehouse ?? "-" },
                    { label: "Quantità uscita", value: String(Math.abs(n(mov.qty))) },
                    { label: "Quantità rientrata", value: String(n(mov.returned_qty)) },
                    { label: "Quantità netta (specifica rimanente)", value: String(net), highlight: true },
                    { label: "Magazzino rientro", value: mov.warehouse ?? "-" },
                    { label: "Nota rientro", value: mov.return_note ?? "-" },
                    { label: "Referente", value: (mov as any).referee_name || referents.find((r) => r.id === mov.referent_id)?.name || mov.referee_email || "-" },
                    { label: "Email referente", value: mov.referee_email ?? "-" },
                    { label: "Chiuso da", value: mov.closed_by ?? "-" },
                    { label: "Data chiusura", value: mov.closed_at ? fmtDate(mov.closed_at) : "-" },
                  ];
                  return (
                    <div style={{ marginTop: 12, padding: 12, background: "#f0f9ff", borderRadius: 10, border: "1px solid #bae6fd" }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>Dettaglio rettifica · {mov.code}</div>
                      <table className="table" style={{ fontSize: 13, width: "100%" }}>
                        <tbody>
                          {detailRows.map((row, i) => (
                            <tr
                              key={i}
                              style={{
                                cursor: "default",
                                background: row.highlight ? "rgba(59,130,246,0.08)" : undefined,
                              }}
                            >
                              <td style={{ width: 200, padding: "6px 10px", fontWeight: 600, color: "#475569" }}>{row.label}</td>
                              <td style={{ padding: "6px 10px" }}>{row.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingRight: 80 }}>
              <div style={{ fontWeight: 900 }}>
                {closingGroup.length > 1 && editingMovementId ? "Rettifica articolo · " : "Dettaglio movimento · "}
                <span style={{ opacity: 0.75 }}>{closing.code}</span>{" "}
                {closing.warehouse ? <span style={{ marginLeft: 8, ...pillStyle(closing.warehouse) }}>{closing.warehouse}</span> : null}
              </div>

              <span
                className={(closing.status ?? (closing.type === "OUT" ? "OPEN" : "CLOSED")) === "OPEN" ? "openStripe" : ""}
                style={(() => {
                  const st = (closing.status ?? (closing.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
                  const s = pillStyle(st);
                  if (st === "OPEN") {
                    const { background, ...rest } = s;
                    return rest;
                  }
                  return s;
                })()}
              >
                {(closing.status ?? (closing.type === "OUT" ? "OPEN" : "CLOSED")) === "OPEN" ? "APERTO" : "CHIUSO"}
              </span>
            </div>

            {(closingGroup.length <= 1 || editingMovementId) && (
            <>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
              <div style={{ gridColumn: "span 12" }}>
                <label className="label" htmlFor="mvMaterial">
                  Materiale
                </label>
                <input
                  id="mvMaterial"
                  name="mvMaterial"
                  className="input"
                  value={closingMeta ? `${closingMeta.name}${closingMeta.um ? ` · UM: ${closingMeta.um}` : ""}` : "-"}
                  disabled
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label" htmlFor="mvType">
                  Tipo
                </label>
                <input id="mvType" name="mvType" className="input" value={closing.type === "IN" ? "ENTRATA" : "USCITA"} disabled />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label" htmlFor="mvDate">
                  Data
                </label>
                <input id="mvDate" name="mvDate" className="input" value={fmtDate(closing.created_at)} disabled />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label" htmlFor="mvQty">
                  Quantità
                </label>
                <input
                  id="mvQty"
                  name="mvQty"
                  className="input"
                  value={String(closing.type === "OUT" ? -Math.abs(n(closing.qty)) : Math.abs(n(closing.qty)))}
                  disabled
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label" htmlFor="mvBy">
                  Inserito da
                </label>
                <input id="mvBy" name="mvBy" className="input" value={closing.created_by_name ?? "-"} disabled />
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <label className="label" htmlFor="mvNote">
                  Note
                </label>
                <input id="mvNote" name="mvNote" className="input" value={closing.note ?? ""} disabled />
              </div>
            </div>

            {closing.type === "OUT" && (closing.status ?? "OPEN") === "CLOSED" && (
              <div
                style={{
                  marginTop: 14,
                  border: "1px solid rgba(59,130,246,0.25)",
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(59,130,246,0.06)",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Dettaglio rettifica / chiusura</div>
                <table className="table" style={{ fontSize: 13, width: "100%" }}>
                  <tbody>
                    {[
                      { label: "Codice", value: closing.code },
                      { label: "Descrizione", value: closingMeta ? closingMeta.name : (nameMap[closing.code] ?? "-") },
                      { label: "Unità di misura", value: closingMeta?.um ?? "-" },
                      { label: "Magazzino uscita", value: closing.warehouse ?? "-" },
                      { label: "Quantità uscita", value: String(Math.abs(n(closing.qty))) },
                      { label: "Quantità rientrata", value: String(n(closing.returned_qty)) },
                      { label: "Quantità netta (specifica rimanente)", value: String(Math.max(0, Math.abs(n(closing.qty)) - n(closing.returned_qty))), highlight: true },
                      { label: "Magazzino rientro", value: closing.warehouse ?? "-" },
                      { label: "Nota rientro", value: closing.return_note ?? "-" },
                      { label: "Referente", value: (closing as any).referee_name || referents.find((r) => r.id === closing.referent_id)?.name || closing.referee_email || "-" },
                      { label: "Email referente", value: closing.referee_email ?? "-" },
                      { label: "Chiuso da", value: closing.closed_by ?? "-" },
                      { label: "Data chiusura", value: closing.closed_at ? fmtDate(closing.closed_at) : "-" },
                    ].map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          cursor: "default",
                          background: row.highlight ? "rgba(59,130,246,0.12)" : undefined,
                        }}
                      >
                        <td style={{ width: 220, padding: "8px 12px", fontWeight: 600, color: "#475569" }}>{row.label}</td>
                        <td style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 4 }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {closing.type === "OUT" && (closing.status ?? "OPEN") === "OPEN" && (
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

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setEditRectify((v) => !v)}
                      title={editRectify ? "Blocca campi" : "Sblocca campi"}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <PencilIcon />
                      {editRectify ? "Blocca" : "Modifica"}
                    </button>

                    {closingGroup.length > 1 && editingMovementId ? (
                      <button className="btn btnPrimary" type="button" onClick={confirmRectify} disabled={!editRectify}>
                        Conferma rettifica
                      </button>
                    ) : (
                      <button className="btn btnPrimary" type="button" onClick={confirmClose} disabled={!editRectify}>
                        Conferma chiusura
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  Solo il creatore del movimento o l’admin può chiudere questa uscita.{" "}
                  {editRectify ? "Compila i campi e poi conferma." : "Premi la matita per sbloccare i campi."}
                </div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
                  <div style={{ gridColumn: "span 3" }}>
                    <label className="label" htmlFor="outQtyAbs">
                      Quantità uscita
                    </label>
                    <input id="outQtyAbs" name="outQtyAbs" className="input" value={String(Math.abs(n(closing.qty)))} disabled />
                  </div>

                  <div style={{ gridColumn: "span 3" }}>
                    <label className="label" htmlFor="retQty">
                      Quantità rientro
                    </label>
                    <input
                      id="retQty"
                      name="retQty"
                      className="input"
                      value={returnQty}
                      onChange={(e) => {
                        const v = e.target.value;
                        setReturnQty(v);
                        const r = toNumber(v);
                        const wh = closing?.warehouse ?? "PRM";
                        if (Number.isFinite(r) && r >= 0) {
                          setReturnToPrm(wh === "PRM" ? v : "0");
                          setReturnToReale(wh === "REALE" ? v : "0");
                        }
                      }}
                      inputMode="decimal"
                      disabled={!editRectify}
                      style={!editRectify ? { background: "#f8fafc", color: "#64748b" } : undefined}
                      placeholder="0"
                    />
                  </div>

                  <div style={{ gridColumn: "span 6" }}>
                    <label className="label" htmlFor="retNote">
                      Nota rientro (opz.)
                    </label>
                    <input
                      id="retNote"
                      name="retNote"
                      className="input"
                      value={returnNote}
                      onChange={(e) => setReturnNote(e.target.value)}
                      disabled={!editRectify}
                      style={!editRectify ? { background: "#f8fafc", color: "#64748b" } : undefined}
                      placeholder="Esempio: rientrati 2 pezzi"
                    />
                  </div>

                  {toNumber(returnQty) > 0 && (
                    <>
                      <div style={{ gridColumn: "span 12", fontSize: 13, color: "#64748b", marginTop: 4 }}>
                        Ripartisci il rientro tra i magazzini (la somma deve essere uguale alla quantità rientro):
                      </div>
                      <div style={{ gridColumn: "span 3" }}>
                        <label className="label" htmlFor="retPrm">
                          Rientro in PRM
                        </label>
                        <input
                          id="retPrm"
                          name="retPrm"
                          className="input"
                          value={returnToPrm}
                          onChange={(e) => {
                            const v = e.target.value;
                            setReturnToPrm(v);
                            const r = toNumber(returnQty);
                            const p = toNumber(v);
                            if (Number.isFinite(r) && Number.isFinite(p) && p >= 0 && p <= r) {
                              setReturnToReale(String(Math.max(0, r - p)));
                            }
                          }}
                          inputMode="decimal"
                          disabled={!editRectify}
                          style={!editRectify ? { background: "#f8fafc", color: "#64748b" } : undefined}
                          placeholder="0"
                        />
                      </div>
                      <div style={{ gridColumn: "span 3" }}>
                        <label className="label" htmlFor="retReale">
                          Rientro in REALE
                        </label>
                        <input
                          id="retReale"
                          name="retReale"
                          className="input"
                          value={returnToReale}
                          onChange={(e) => {
                            const v = e.target.value;
                            setReturnToReale(v);
                            const r = toNumber(returnQty);
                            const re = toNumber(v);
                            if (Number.isFinite(r) && Number.isFinite(re) && re >= 0 && re <= r) {
                              setReturnToPrm(String(Math.max(0, r - re)));
                            }
                          }}
                          inputMode="decimal"
                          disabled={!editRectify}
                          style={!editRectify ? { background: "#f8fafc", color: "#64748b" } : undefined}
                          placeholder="0"
                        />
                      </div>
                    </>
                  )}

                  <div style={{ gridColumn: "span 6" }}>
                    <label className="label" htmlFor="refSel">
                      Referente
                    </label>
                    <select
                      id="refSel"
                      name="refSel"
                      className="input"
                      value={selReferentId}
                      onChange={(e) => setSelReferentId(e.target.value)}
                      disabled={!editRectify}
                      style={!editRectify ? { background: "#f8fafc", color: "#64748b" } : undefined}
                    >
                      <option value="">— Seleziona referente —</option>
                      {referents.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                      {selReferentId
                        ? `Email: ${referents.find((x) => x.id === selReferentId)?.email ?? "-"}`
                        : "Seleziona il referente per associarlo alla chiusura."}
                    </div>
                  </div>

                  <div style={{ gridColumn: "span 6" }}>
                    <label className="label" htmlFor="netInfo">
                      Quantità netta (uscita - rientro)
                    </label>
                    <input
                      id="netInfo"
                      name="netInfo"
                      className="input"
                      value={String(Math.max(0, Math.abs(n(closing.qty)) - n(toNumber(returnQty))))}
                      disabled
                    />
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                  Dopo la chiusura lo stato passa a <b>CHIUSO</b> e non sarà più modificabile.
                </div>
              </div>
            )}
            </>
            )}

            {closingGroup.length > 1 && !editingMovementId && (() => {
              const openInGroup = closingGroup.filter((m) => (m.status ?? "OPEN") === "OPEN");
              const allRettified = openInGroup.length > 0 && openInGroup.every((m) => m.returned_qty !== null && m.returned_qty !== undefined);
              if (allRettified) {
                return (
                  <div style={{ marginTop: 16, padding: 16, border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc" }}>
                    <div style={{ fontWeight: 900, marginBottom: 10 }}>Chiusura gruppo</div>
                    <div style={{ fontSize: 13, marginBottom: 12, color: "#64748b" }}>
                      Tutti gli articoli sono stati rettificati. Seleziona il referente e conferma per chiudere il prelievo multiplo.
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 200 }}>
                        <label className="label" htmlFor="refSelGroup">Referente</label>
                        <select
                          id="refSelGroup"
                          className="input"
                          value={selReferentId}
                          onChange={(e) => setSelReferentId(e.target.value)}
                        >
                          <option value="">— Seleziona referente —</option>
                          {referents.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ alignSelf: "flex-end" }}>
                        <button className="btn btnPrimary" type="button" onClick={confirmClose}>
                          Conferma chiusura gruppo
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div style={{ marginTop: 16, padding: 16, textAlign: "center", color: "#64748b", fontSize: 14 }}>
                  Seleziona un articolo dalla tabella sopra e clicca &quot;Rettifica&quot; per confermare le quantità. Poi potrai chiudere tutto in un unico invio.
                </div>
              );
            })()}

            {msg && <div style={{ marginTop: 10, fontWeight: 800, whiteSpace: "pre-wrap" }}>{msg}</div>}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>
                Storico materiale · <span style={{ opacity: 0.75 }}>{historyCode}</span>
              </div>

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
                          {Math.abs(Number(m.qty ?? 0))}
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
      {(scanning || cartNfcScanning || (scanInfo && scanMode === "CART")) && (
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
        maxWidth: scanning ? 420 : cartNfcScanning ? 420 : 640,
        width: "100%",
        boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
      }}
    >
      {scanning ? (
        <>
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Scanner barcode</div>
          <div style={{ padding: 12, background: "#0f172a", borderRadius: 12, marginBottom: 12 }}>
            <video ref={videoRef} style={{ width: "100%", maxWidth: 360, borderRadius: 8 }} muted playsInline />
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Inquadra il codice a barre</div>
          </div>
          <button type="button" className="btn" onClick={() => { stopScan(); setScanInfo(null); if (cart.length > 0) setCartOpen(true); }}>
            Fine
          </button>
        </>
      ) : cartNfcScanning ? (
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
      ) : scanInfo && scanMode === "CART" ? (
        <>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Aggiungi al carrello</div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div><b>Codice:</b> {scanInfo.code}</div>
            <div><b>Descrizione:</b> {scanInfo.name}</div>
            <div><b>UM:</b> {scanInfo.um ?? "-"}</div>
            <div><b>Magazzino:</b> {scanInfo.warehouse}</div>
            <div><b>Libero:</b> {scanInfo.qtyFree}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="label" htmlFor="scanQty">Quantità da prelevare</label>
            <input id="scanQty" className="input" value={scanQty} onChange={(e) => setScanQty(e.target.value)} inputMode="decimal" />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => { stopScan(); setScanInfo(null); setScanSource(null); if (cart.length > 0) setCartOpen(true); }}>
              Chiudi
            </button>
            <button className="btn btnPrimary" onClick={addScannedToCart}>
              Aggiungi
            </button>
          </div>
        </>
      ) : null}
    </div>
  </div>
)}
{cartOpen && (
  <div
    onMouseDown={() => {
      if (cartBusy) return;
      setCartOpen(false);
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
        width: "min(900px, 100%)",
        maxHeight: "85vh",
        overflow: "auto",
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        padding: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 900 }}>Carrello prelievo</div>
        <button className="btn" onClick={() => setCartOpen(false)} disabled={cartBusy} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CloseIcon />
          Chiudi
        </button>
      </div>

      <div style={{ marginTop: 10, marginBottom: 12, padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
        <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 13 }}>Aggiungi materiali</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Puoi aggiungere più materiali usando barcode, NFC o inserimento manuale.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="btn"
            onClick={() => { setCartOpen(false); startScan(); }}
            disabled={cartBusy}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <BarcodeIcon />
            Barcode
          </button>
          <button
            type="button"
            className="btn"
            onClick={startCartNfcScan}
            disabled={cartBusy || cartNfcScanning}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {cartNfcScanning ? <SpinnerIcon /> : <NfcIcon />}
            {cartNfcScanning ? "NFC..." : "NFC"}
          </button>
          <div ref={cartManualRef} style={{ display: "flex", gap: 6, alignItems: "flex-start", flex: 1, minWidth: 200, position: "relative" }}>
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <input
                type="text"
                className="input"
                placeholder="Cerca codice o descrizione (min. 2 caratteri)"
                value={cartManualCode}
                onChange={(e) => {
                  const v = e.target.value;
                  setCartManualCode(v);
                  setCartManualOpen(true);
                  loadCartSuggestions(v);
                }}
                onFocus={() => {
                  setCartManualOpen(true);
                  if (cartManualCode.trim().length >= 2) loadCartSuggestions(cartManualCode);
                }}
                onKeyDown={(e) => {
                  if (!cartManualOpen || cartSuggestions.length === 0) {
                    if (e.key === "Enter") addCartManual();
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCartManualActiveIndex((i) => Math.min(i + 1, cartSuggestions.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCartManualActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const sel = cartSuggestions[cartManualActiveIndex];
                    if (sel) addCartManualByCode(sel.code);
                  } else if (e.key === "Escape") {
                    setCartManualOpen(false);
                  }
                }}
                style={{ width: "100%" }}
              />
              {cartManualOpen && cartManualCode.trim().length >= 2 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: 4,
                    background: "#fff",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 10,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                    overflow: "hidden",
                    zIndex: 100,
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                >
                  {cartSuggestions.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 13, color: "#64748b" }}>Nessun materiale con giacenza</div>
                  ) : (
                    cartSuggestions.map((it, idx) => (
                      <div
                        key={it.code}
                        onMouseEnter={() => setCartManualActiveIndex(idx)}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          addCartManualByCode(it.code);
                        }}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          background: idx === cartManualActiveIndex ? "#eef2ff" : "white",
                          borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                        }}
                      >
                        <div style={{ fontWeight: 900, color: "#0f172a" }}>{it.code}</div>
                        <div style={{ fontSize: 12, color: "#334155" }}>{it.name}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button type="button" className="btn btnPrimary" onClick={addCartManual} disabled={cartBusy} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AddIcon />
              Aggiungi
            </button>
          </div>
        </div>
      </div>

      <div className="tableWrap" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Codice</th>
              <th>Descrizione</th>
              <th>Mag.</th>
              <th>Disponibile</th>
              <th>Da prelevare</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {cart.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 12 }}>
                  Carrello vuoto.
                </td>
              </tr>
            ) : (
              cart.map((r) => (
                <tr key={`${r.code}__${r.warehouse}`}>
                  <td style={{ fontWeight: 900 }}>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.warehouse}</td>
                  <td>{r.qtyAvailable}</td>
                  <td style={{ fontWeight: 900 }}>{r.qtyPick}</td>
                  <td>
                    <button className="btn" onClick={() => removeCartRow(r.code, r.warehouse)} disabled={cartBusy} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <TrashIcon />
                      Rimuovi
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="label" htmlFor="cartNote">
          Note *
        </label>
        <input
          id="cartNote"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="DDT / commessa / cliente (obbligatorio)"
          style={{ maxWidth: 400 }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800 }}>
          Righe: {cart.length}
        </div>

        <button className="btn btnPrimary" onClick={confirmCartPickup} disabled={cartBusy || cart.length === 0} aria-label="Conferma prelievo carrello" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {cartBusy ? <SpinnerIcon /> : <CheckIcon />}
          {cartBusy ? "Salvataggio..." : "Conferma prelievo"}
        </button>
      </div>
    </div>
  </div>
)}
    </main>
  );
}