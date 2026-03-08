"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const [cart, setCart] = useState<CartRow[]>([]);
  const [cartBusy, setCartBusy] = useState(false);

  const [scanMode, setScanMode] = useState<"NORMAL" | "CART" | "QUICK">("NORMAL");

  const [scanPopupOpen, setScanPopupOpen] = useState(false);
  const [scanInfo, setScanInfo] = useState<QuickMaterialInfo | null>(null);
  const [scanQty, setScanQty] = useState("1");

  const [type, setType] = useState<"IN" | "OUT">("OUT");
  const [warehouse, setWarehouse] = useState<"PRM" | "REALE">("PRM");
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
  const scanLockedRef = useRef(false);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState<MovementRow | null>(null);
  const [closingMeta, setClosingMeta] = useState<{ name: string; um: string } | null>(null);

  const [returnQty, setReturnQty] = useState<string>("0");
  const [returnNote, setReturnNote] = useState<string>("");
  const [referents, setReferents] = useState<ReferentRow[]>([]);
  const [selReferentId, setSelReferentId] = useState<string>("");

  const [editRectify, setEditRectify] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);

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
async function handleScannedCode(codeRaw: string) {
  const code = String(codeRaw ?? "").trim();
  if (!code) return;

  const info = await loadMaterialForScan(code, warehouse);
  if (!info) {
    setMsg(`Materiale ${code} non trovato in ${warehouse}.`);
    return;
  }

  setScanInfo(info);
  setScanQty("1");
  setScanPopupOpen(true);
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

  async function loadHistory(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setMsg(null);

    let q = supabase
      .from("movements")
      .select(
        "id,created_at,type,code,qty,note,warehouse,created_by,created_by_name,status,returned_qty,return_note,referent_id,referee_email,referee_name,closed_at,closed_by"
      )
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

      const codes = Array.from(new Set((foundItems ?? []).map((x: any) => x.code).filter(Boolean)));

      if (codes.length === 0) {
        setHistory([]);
        setNameMap({});
        if (silent) setRefreshing(false);
        else setLoading(false);
        return;
      }

      q = q.in("code", codes);
    }

    const { data, error } = await q;

    if (error) {
      console.error("loadHistory error:", error);
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

  async function pickItem(it: DbItem) {
    setPicked(it);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
    setMsg(null);
    setTimeout(() => qtyRef.current?.focus(), 50);
  }

  async function pickItemByCode(codeRaw: string) {
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

    await pickItem(item as DbItem);
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

    stopScan();
    scanLockedRef.current = false;

    setScanning(true);
    await new Promise((r) => setTimeout(r, 200));

    try {
      const videoEl = videoRef.current;
      if (!videoEl) throw new Error("Video non disponibile");

      readerRef.current = new BrowserMultiFormatReader();
      await readerRef.current.decodeFromVideoDevice(undefined, videoEl, async (result) => {
        if (!result) return;
        if (scanLockedRef.current) return;

        const text = String(result.getText?.() ?? "").trim();
        if (!text) return;

        scanLockedRef.current = true;
        stopScan();
        if (scanMode === "NORMAL") {
  await pickItemByCode(text);
} else {
  await handleScannedCode(text);
}
      });
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

    if (type === "OUT") {
      try {
        const live = await getOrCreateExcelLiveRow(picked.code, warehouse);
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

    const payload: Partial<MovementRow> = {
      type,
      code: picked.code,
      qty: qn,
      note: note.trim(),
      created_by: userId,
      created_by_name: fullName,
      warehouse,
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
      warehouse,
      details_json: {
        type,
        qty: qn,
        note: note.trim(),
        status: type === "OUT" ? "OPEN" : "CLOSED",
      },
    });

    try {
      const delta = type === "IN" ? qn : -qn;
      await applyDeltaToExcelLive(picked.code, warehouse, delta);
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
      .select("id,code,warehouse,type,qty")
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
      },
    });

    const code = mov.code;
    const warehouse = mov.warehouse;
    const qty = Math.abs(Number(mov.qty ?? 0));

    const delta = mov.type === "IN" ? -qty : +qty;

    const { data: stock, error: stockError } = await supabase
      .from("excel_live")
      .select("qty_free,row_json")
      .eq("code", code)
      .eq("warehouse", warehouse)
      .single();

    if (stockError || !stock) {
      console.error("Errore lettura giacenza:", stockError);
      return alert("Impossibile leggere la giacenza.");
    }

    const currentQty = Number(stock.qty_free ?? 0);
    const newQty = currentQty + delta;

    const newJson = { ...(stock.row_json ?? {}) };
    newJson["Qnt. a Mag. libero"] = newQty;

    const { error: updateError } = await supabase
      .from("excel_live")
      .update({
        qty_free: newQty,
        row_json: newJson,
      })
      .eq("code", code)
      .eq("warehouse", warehouse);

    if (updateError) {
      console.error("Errore aggiornamento giacenza:", updateError);
      return alert("Errore aggiornamento giacenza.");
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
    setClosing(m);
    setCloseOpen(true);

    setReturnQty(String(n(m.returned_qty)));
    setReturnNote(m.return_note ?? "");
    setSelReferentId(m.referent_id ?? "");
    setEditRectify(false);

    const meta = await loadItemMetaWithFallback(m.code, (m.warehouse ?? null) as any);
    setClosingMeta(meta);
  }

  async function confirmClose() {
    if (!closing) return;

    const st = (closing.status ?? (closing.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
    if (st === "CLOSED") {
      setCloseOpen(false);
      setClosing(null);
      setClosingMeta(null);
      setEditRectify(false);
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

    const ref = referents.find((x) => x.id === selReferentId) ?? null;
    if (!ref?.email) {
      setMsg("Seleziona un referente valido prima di confermare la chiusura.");
      return;
    }

    const closedAtIso = new Date().toISOString();

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
        const wh = (closing.warehouse ?? null) as "PRM" | "REALE" | null;
        if (wh) await applyDeltaToExcelLive(closing.code, wh, r);
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
    setCloseOpen(false);
    setClosing(null);
    setClosingMeta(null);
    setEditRectify(false);

    await loadHistory();
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
            <button className={`btn ${type === "IN" ? "btnPrimary" : ""}`} onClick={() => setType("IN")} type="button">
              Entrata
            </button>
          )}

          <button className={`btn ${type === "OUT" ? "btnPrimary" : ""}`} onClick={() => setType("OUT")} type="button">
            Uscita
          </button>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="label" htmlFor="whMove" style={{ marginBottom: 0 }}>
              Magazzino
            </label>
            <select
              id="whMove"
              name="whMove"
              className="input mobileInputFull"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value as any)}
              style={{ width: 140 }}
            >
              <option value="PRM">PRM</option>
              <option value="REALE">REALE</option>
            </select>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
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
                  const mode = e.target.value as "NORMAL" | "CART" | "QUICK";
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
                <option value="QUICK">Solo lettura (dettaglio)</option>
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

        {scanning && (
          <div style={{ marginTop: 12 }}>
            <video ref={videoRef} style={{ width: "100%", borderRadius: 12, background: "black" }} muted playsInline />
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>Inquadra il codice a barre con la fotocamera.</div>
          </div>
        )}

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
                history.map((m) => {
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

                      <td style={{ fontWeight: 900 }}>{m.code}</td>
                      <td>{nameMap[m.code] ?? "-"}</td>

                      <td>{m.warehouse ? <span style={pillStyle(m.warehouse)}>{m.warehouse}</span> : "-"}</td>

                      <td style={{ fontWeight: 900 }}>
                        {m.type === "IN" ? "+" : "-"}
                        {outAbs}
                      </td>

                      <td>{m.type === "OUT" ? n(m.returned_qty) : "-"}</td>
                      <td style={{ fontWeight: 900 }}>{m.type === "OUT" ? net : "-"}</td>

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
            setClosingMeta(null);
            setMsg(null);
            setEditRectify(false);
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
                setClosingMeta(null);
                setMsg(null);
                setEditRectify(false);
              }}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
              }}
            >
              Chiudi
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingRight: 80 }}>
              <div style={{ fontWeight: 900 }}>
                Dettaglio movimento · <span style={{ opacity: 0.75 }}>{closing.code}</span>{" "}
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
                  <div style={{ gridColumn: "span 3" }}>
                    <label className="label" style={{ marginBottom: 4 }}>Quantità uscita</label>
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>{Math.abs(n(closing.qty))}</div>
                  </div>
                  <div style={{ gridColumn: "span 3" }}>
                    <label className="label" style={{ marginBottom: 4 }}>Quantità rientrata</label>
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>{n(closing.returned_qty)}</div>
                  </div>
                  <div style={{ gridColumn: "span 3" }}>
                    <label className="label" style={{ marginBottom: 4 }}>Quantità netta</label>
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, fontWeight: 900 }}>
                      {Math.max(0, Math.abs(n(closing.qty)) - n(closing.returned_qty))}
                    </div>
                  </div>
                  <div style={{ gridColumn: "span 3" }}>
                    <label className="label" style={{ marginBottom: 4 }}>Chiuso da</label>
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>{closing.closed_by ?? "-"}</div>
                  </div>
                  <div style={{ gridColumn: "span 6" }}>
                    <label className="label" style={{ marginBottom: 4 }}>Nota rientro</label>
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>{closing.return_note ?? "-"}</div>
                  </div>
                  <div style={{ gridColumn: "span 6" }}>
                    <label className="label" style={{ marginBottom: 4 }}>Referente</label>
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      {(closing as any).referee_name || referents.find((r) => r.id === closing.referent_id)?.name || closing.referee_email || "-"}
                    </div>
                  </div>
                  <div style={{ gridColumn: "span 6" }}>
                    <label className="label" style={{ marginBottom: 4 }}>Email referente</label>
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>{closing.referee_email ?? "-"}</div>
                  </div>
                  <div style={{ gridColumn: "span 6" }}>
                    <label className="label" style={{ marginBottom: 4 }}>Data chiusura</label>
                    <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>{closing.closed_at ? fmtDate(closing.closed_at) : "-"}</div>
                  </div>
                </div>
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

                    <button className="btn btnPrimary" type="button" onClick={confirmClose} disabled={!editRectify}>
                      Conferma chiusura
                    </button>
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
                      onChange={(e) => setReturnQty(e.target.value)}
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
      {scanPopupOpen && scanInfo && (
  <div
    onMouseDown={() => {
      setScanPopupOpen(false);
      setScanInfo(null);
    }}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15,23,42,0.35)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 14,
      zIndex: 1000,
    }}
  >
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        width: "min(640px, 100%)",
        background: "white",
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,0.16)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        padding: 12,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 18 }}>
        {scanMode === "QUICK" ? "Dettaglio materiale" : "Aggiungi al carrello"}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div><b>Codice:</b> {scanInfo.code}</div>
        <div><b>Descrizione:</b> {scanInfo.name}</div>
        <div><b>UM:</b> {scanInfo.um ?? "-"}</div>
        <div><b>Magazzino:</b> {scanInfo.warehouse}</div>
        <div><b>Libero:</b> {scanInfo.qtyFree}</div>
        <div><b>Bloccato:</b> {scanInfo.qtyBlocked}</div>
        <div><b>Qualità:</b> {scanInfo.qtyQuality}</div>
      </div>

      {scanMode === "CART" && (
        <div style={{ marginTop: 12 }}>
          <label className="label" htmlFor="scanQty">
            Quantità da prelevare
          </label>
          <input
            id="scanQty"
            className="input"
            value={scanQty}
            onChange={(e) => setScanQty(e.target.value)}
            inputMode="decimal"
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => {
          setScanPopupOpen(false);
          setScanInfo(null);
        }}>
          Chiudi
        </button>

        {scanMode === "CART" && (
          <button className="btn btnPrimary" onClick={addScannedToCart}>
            Aggiungi al carrello
          </button>
        )}
      </div>
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
        <button className="btn" onClick={() => setCartOpen(false)} disabled={cartBusy}>
          Chiudi
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
        Scansiona i materiali in modalità <b>Carrello</b>, imposta la quantità e aggiungili qui.
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
                    <button className="btn" onClick={() => removeCartRow(r.code, r.warehouse)} disabled={cartBusy}>
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

        <button className="btn btnPrimary" onClick={confirmCartPickup} disabled={cartBusy || cart.length === 0} aria-label="Conferma prelievo carrello">
          {cartBusy ? "Salvataggio..." : "Conferma prelievo"}
        </button>
      </div>
    </div>
  </div>
)}
    </main>
  );
}