"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { BrowserMultiFormatReader } from "@zxing/browser";

const PAGE_LIMIT = 300;

type DbItem = {
  code: string;
  name: string;
  um: string | null;
};

type MovementRow = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;

  warehouse: "PRM" | "REALE" | null;

  created_by: string | null;
  created_by_name: string | null;

  status: "OPEN" | "CLOSED" | null;
  returned_qty: number | null;
  return_note: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

type StockRow = {
  code: string;
  warehouse: "PRM" | "REALE";
  qty_free: number;
  qty_blocked: number;
  qty_quality: number;
  initial_qty: number;
  excel: Record<string, any> | null;
};

type WarehouseView = "ALL" | "PRM" | "REALE";

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

function toNumber(v: string) {
  const x = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(x) ? x : NaN;
}

function toIsoStartOfDay(d: string) {
  if (!d) return null;
  return new Date(`${d}T00:00:00.000`).toISOString();
}
function toIsoEndOfDay(d: string) {
  if (!d) return null;
  return new Date(`${d}T23:59:59.999`).toISOString();
}

function sameUser(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a === b;
}

/** pill coerenti “aziendali” */
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
    lineHeight: 1,
  };

  if (kind === "IN") return { ...base, borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.10)" };
  if (kind === "OUT") return { ...base, borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" };

  if (kind === "OPEN") return { ...base, borderColor: "rgba(148,163,184,0.55)", background: "rgba(148,163,184,0.18)" };
  if (kind === "CLOSED") return { ...base, borderColor: "rgba(59,130,246,0.45)", background: "rgba(59,130,246,0.10)" };

  if (kind === "PRM") return { ...base, borderColor: "rgba(2,132,199,0.45)", background: "rgba(2,132,199,0.10)" };
  return { ...base, borderColor: "rgba(99,102,241,0.45)", background: "rgba(99,102,241,0.10)" };
}

function otherWarehouse(w: "PRM" | "REALE") {
  return w === "PRM" ? "REALE" : "PRM";
}

/** ====== EMAIL hook (client) ======
 * Chiama un endpoint tuo server-side, così non esponi chiavi email.
 * Implementazione endpoint: /app/api/movements/closed-email/route.ts (te la preparo dopo se vuoi)
 */
async function sendClosedEmail(payload: {
  movement_id: string;
  code: string;
  warehouse: string | null;
  out_qty: number;
  returned_qty: number;
  note: string | null;
  return_note: string | null;
  created_by_name: string | null;
  closed_by: string | null;
}) {
  try {
    await fetch("/api/movements/closed-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // non blocchiamo la chiusura se fallisce la mail
  }
}

export default function MovimentiPage() {
  const supabase = createClient();

  // auth
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // form movimento
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [warehouse, setWarehouse] = useState<"PRM" | "REALE">("PRM");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // autocomplete
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<DbItem[]>([]);
  const [picked, setPicked] = useState<DbItem | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const qtyRef = useRef<HTMLInputElement | null>(null);

  // storico + filtri
  const [history, setHistory] = useState<MovementRow[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [onlyPicked, setOnlyPicked] = useState(false);

  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fType, setFType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [fWarehouse, setFWarehouse] = useState<WarehouseView>("ALL");

  // scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLockedRef = useRef(false);

  // popup dettaglio movimento (come giacenze)
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<MovementRow | null>(null);
  const [detailReturnQty, setDetailReturnQty] = useState("");
  const [detailReturnNote, setDetailReturnNote] = useState("");
  const [detailMsg, setDetailMsg] = useState<string | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);

  // matita (edit) solo dentro popup
  const [editMode, setEditMode] = useState(false);

  function canClose(m: MovementRow) {
    const st = (m.status ?? (m.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
    if (m.type !== "OUT") return false;
    if (st === "CLOSED") return false;
    return isAdmin || sameUser(m.created_by, userId);
  }

  async function loadSuggestions(text: string) {
    const s = text.trim();
    if (!s) {
      setSuggestions([]);
      return;
    }

    const { data, error } = await supabase
      .from("items")
      .select("code,name,um")
      .or(`code.ilike.%${s}%,name.ilike.%${s}%`)
      .order("code", { ascending: true })
      .limit(12);

    if (error) {
      console.error("loadSuggestions error:", error);
      setSuggestions([]);
      return;
    }

    setSuggestions((data ?? []) as DbItem[]);
  }

  async function loadHistory() {
    let q = supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,warehouse,created_by,created_by_name,status,returned_qty,return_note,closed_at,closed_by")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT);

    const isoFrom = toIsoStartOfDay(fFrom);
    const isoTo = toIsoEndOfDay(fTo);
    if (isoFrom) q = q.gte("created_at", isoFrom);
    if (isoTo) q = q.lte("created_at", isoTo);
    if (fType !== "ALL") q = q.eq("type", fType);
    if (fWarehouse !== "ALL") q = q.eq("warehouse", fWarehouse);
    if (onlyPicked && picked?.code) q = q.eq("code", picked.code);

    const { data, error } = await q;

    if (error) {
      console.error("loadHistory error:", error);
      setMsg("Errore caricamento storico. Controlla console.");
      setHistory([]);
      setNameMap({});
      return;
    }

    const rows = (data ?? []) as MovementRow[];
    setHistory(rows);

    const codes = Array.from(new Set(rows.map((r) => r.code).filter(Boolean)));
    if (codes.length === 0) {
      setNameMap({});
      return;
    }

    const { data: itemsData, error: e2 } = await supabase.from("items").select("code,name").in("code", codes);
    if (e2) {
      console.error("items nameMap error:", e2);
      setNameMap({});
      return;
    }

    const map: Record<string, string> = {};
    for (const it of itemsData ?? []) {
      const c = (it as any).code as string;
      const nm = (it as any).name as string | null;
      if (c) map[c] = nm ?? "";
    }
    setNameMap(map);
  }

  async function pickItem(it: DbItem) {
    setPicked(it);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
    setMsg(null);
    setTimeout(() => qtyRef.current?.focus(), 50);
    if (onlyPicked) await loadHistory();
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
        await pickItemByCode(text);
      });
    } catch (e: any) {
      console.error(e);
      setMsg("Errore camera/scansione: " + (e?.message ?? "sconosciuto"));
      stopScan();
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

  /** ====== STOCK HELPERS ======
   *  Se ti serve aggiornare le giacenze “ovviamente”, devi aggiornare item_stocks.
   *  Con RLS attivo è meglio fare via RPC security definer (sql sotto).
   */
  async function getItem(code: string) {
    const { data } = await supabase.from("items").select("code,name,um").eq("code", code).maybeSingle();
    return (data ?? null) as DbItem | null;
  }

  async function getStock(code: string, wh: "PRM" | "REALE") {
    const { data } = await supabase
      .from("item_stocks")
      .select("code,warehouse,qty_free,qty_blocked,qty_quality,initial_qty,excel")
      .eq("code", code)
      .eq("warehouse", wh)
      .maybeSingle();
    return (data ?? null) as StockRow | null;
  }

  async function ensureExcelDefaults(code: string, wh: "PRM" | "REALE") {
    const cur = await getStock(code, wh);
    const other = await getStock(code, otherWarehouse(wh));
    const item = await getItem(code);

    const curExcel = { ...(cur?.excel ?? {}) };
    const otherExcel = { ...(other?.excel ?? {}) };

    // campi che vuoi “ereditare” se mancanti
    const wantText = ["Materiale", "Descrizione Materiale", "Unità di Misura"] as const;

    // Materiale sempre = code
    curExcel["Materiale"] = code;

    // descrizione/um: priorità -> curExcel -> otherExcel -> items
    curExcel["Descrizione Materiale"] =
      String(curExcel["Descrizione Materiale"] ?? "").trim() ||
      String(otherExcel["Descrizione Materiale"] ?? "").trim() ||
      (item?.name ?? "");

    curExcel["Unità di Misura"] =
      String(curExcel["Unità di Misura"] ?? "").trim() ||
      String(otherExcel["Unità di Misura"] ?? "").trim() ||
      (item?.um ?? "");

    // se non esiste stock nel magazzino corrente, crealo
    if (!cur) {
      const base = {
        code,
        warehouse: wh,
        qty_free: 0,
        qty_blocked: 0,
        qty_quality: 0,
        initial_qty: 0,
        excel: curExcel,
      };

      await supabase.from("item_stocks").insert(base as any);
      return base;
    }

    // se esiste, ma mancavano campi, aggiorno excel
    const changed =
      String(cur?.excel?.["Descrizione Materiale"] ?? "").trim() !== String(curExcel["Descrizione Materiale"] ?? "").trim() ||
      String(cur?.excel?.["Unità di Misura"] ?? "").trim() !== String(curExcel["Unità di Misura"] ?? "").trim() ||
      String(cur?.excel?.["Materiale"] ?? "").trim() !== String(curExcel["Materiale"] ?? "").trim();

    if (changed) {
      await supabase.from("item_stocks").update({ excel: curExcel } as any).eq("code", code).eq("warehouse", wh);
    }

    return { ...cur, excel: curExcel } as StockRow;
  }

  async function applyStockDelta(code: string, wh: "PRM" | "REALE", delta: number) {
    // ✅ via RPC se esiste (consigliato per RLS)
    const { data: rpcData, error: rpcErr } = await supabase.rpc("stocks_apply_delta", {
      p_code: code,
      p_warehouse: wh,
      p_delta: delta,
    } as any);

    if (!rpcErr) return rpcData;

    // fallback (solo se RLS lo permette)
    const stock = await ensureExcelDefaults(code, wh);
    const excel = { ...(stock.excel ?? {}) };

    const nextQtyFree = n(stock.qty_free) + delta;
    const nextInitial = n(stock.initial_qty) + delta;

    // riallineo anche una colonna excel tipica
    if (excel) {
      const kFree = "Qnt. a Mag. libero";
      const currentFree = n(excel[kFree]);
      excel[kFree] = currentFree + delta;
    }

    const { error } = await supabase
      .from("item_stocks")
      .update({ qty_free: nextQtyFree, initial_qty: nextInitial, excel } as any)
      .eq("code", code)
      .eq("warehouse", wh);

    if (error) {
      console.error("applyStockDelta fallback error:", error);
    }
  }

  async function saveMovement() {
    setMsg(null);

    if (!userId) return setMsg("Devi essere loggato per salvare movimenti.");
    if (!picked) return setMsg("Seleziona un materiale.");

    const qn = toNumber(qty);
    if (!Number.isFinite(qn) || qn <= 0) return setMsg("Quantità non valida (deve essere > 0).");

    const payload: Partial<MovementRow> = {
      type,
      code: picked.code,
      qty: qn,
      note: note.trim() || null,
      created_by: userId,
      created_by_name: userEmail ?? null,
      warehouse,

      status: type === "OUT" ? "OPEN" : "CLOSED",
      returned_qty: type === "OUT" ? 0 : 0,
      return_note: null,
      closed_at: type === "OUT" ? null : new Date().toISOString(),
      closed_by: type === "OUT" ? null : userId,
    };

    const { error } = await supabase.from("movements").insert(payload as any);
    if (error) return setMsg("Errore salvataggio: " + (error as any)?.message);

    // aggiorno giacenze subito
    const wh = warehouse;
    const delta = type === "IN" ? qn : -qn;
    await applyStockDelta(picked.code, wh, delta);

    setQty("");
    setNote("");
    setMsg("Movimento salvato ✅");

    await loadHistory();
    setTimeout(() => qtyRef.current?.focus(), 80);
  }

  async function deleteMovement(id: string) {
    if (!isAdmin) return alert("Solo l'admin può eliminare i movimenti.");
    const ok = confirm("Eliminare questo movimento?");
    if (!ok) return;

    const row = history.find((h) => h.id === id) ?? null;

    const { error } = await supabase.from("movements").delete().eq("id", id);
    if (error) return alert("Non posso eliminare: " + (error as any)?.message);

    // rollback stock (se posso)
    if (row?.warehouse && row?.code) {
      const delta = row.type === "IN" ? -n(row.qty) : +n(row.qty);
      await applyStockDelta(row.code, row.warehouse, delta);

      // se era OUT chiusa e aveva rientro, allora avevamo già riaggiunto returned_qty: rimuovilo
      const st = (row.status ?? (row.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
      if (row.type === "OUT" && st === "CLOSED" && n(row.returned_qty) > 0) {
        await applyStockDelta(row.code, row.warehouse, -n(row.returned_qty));
      }
    }

    // chiudo popup se stavo guardando quella riga
    if (detailRow?.id === id) {
      setDetailOpen(false);
      setDetailRow(null);
      setEditMode(false);
    }

    await loadHistory();
  }

  function openMovementPopup(m: MovementRow) {
    setDetailRow(m);
    setDetailOpen(true);
    setDetailMsg(null);
    setEditMode(false);

    setDetailReturnQty(String(n(m.returned_qty)));
    setDetailReturnNote(m.return_note ?? "");
  }

  async function confirmCloseFromPopup() {
    if (!detailRow) return;
    if (detailSaving) return;

    const st = (detailRow.status ?? (detailRow.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
    if (st === "CLOSED") {
      setDetailOpen(false);
      setDetailRow(null);
      setEditMode(false);
      return;
    }

    const wh = detailRow.warehouse;
    if (!wh) {
      setDetailMsg("Magazzino mancante sul movimento.");
      return;
    }

    const outQty = n(detailRow.qty);
    const r = toNumber(detailReturnQty);
    if (!Number.isFinite(r) || r < 0) {
      setDetailMsg("Quantità rientro non valida (>= 0).");
      return;
    }
    if (r > outQty) {
      setDetailMsg(`Il rientro non può superare l’uscita (${outQty}).`);
      return;
    }

    setDetailSaving(true);
    setDetailMsg(null);

    const noteText = (detailReturnNote ?? "").trim() || null;
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("movements")
      .update({
        returned_qty: r,
        return_note: noteText,
        status: "CLOSED",
        closed_at: nowIso,
        closed_by: userId ?? null,
      } as any)
      .eq("id", detailRow.id);

    if (error) {
      setDetailSaving(false);
      setDetailMsg("Errore chiusura: " + (error as any)?.message);
      return;
    }

    // ✅ rientro: riaggiungo su stock
    if (r > 0) {
      await applyStockDelta(detailRow.code, wh, r);
    }

    // aggiorno state subito
    setHistory((prev) =>
      prev.map((row) =>
        row.id === detailRow.id
          ? { ...row, returned_qty: r, return_note: noteText, status: "CLOSED", closed_at: nowIso, closed_by: userId ?? null }
          : row
      )
    );

    // email (non blocca)
    sendClosedEmail({
      movement_id: detailRow.id,
      code: detailRow.code,
      warehouse: detailRow.warehouse,
      out_qty: n(detailRow.qty),
      returned_qty: r,
      note: detailRow.note ?? null,
      return_note: noteText,
      created_by_name: detailRow.created_by_name ?? null,
      closed_by: userId ?? null,
    });

    setDetailSaving(false);
    setDetailMsg("Movimento chiuso ✅");

    // chiudo popup
    setTimeout(() => {
      setDetailOpen(false);
      setDetailRow(null);
      setEditMode(false);
      setDetailMsg(null);
    }, 400);

    await loadHistory();
  }

  // init
  useEffect(() => {
    let alive = true;

    (async () => {
      await loadHistory();

      const { data: ud } = await supabase.auth.getUser();
      const uid = ud.user?.id ?? null;
      const email = ud.user?.email ?? null;

      if (!alive) return;

      setUserId(uid);
      setUserEmail(email);

      if (!uid) {
        setIsAdmin(false);
        return;
      }

      const { data: adm, error } = await supabase.rpc("is_admin");
      if (!alive) return;

      if (error) {
        console.error("is_admin rpc error:", error);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(!!adm);
    })();

    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
      alive = false;
      document.removeEventListener("mousedown", onDocMouseDown);
      stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounce suggestions
  useEffect(() => {
    setActiveIndex(0);
    const t = setTimeout(() => {
      if (open) loadSuggestions(search);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  // refresh quando toggle onlyPicked
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyPicked]);

  const active = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Movimenti</div>
        <div className="pageBarActions">
          <a className="btn" href="/giacenze">Giacenze</a>
          <a className="btn" href="/">Dashboard</a>
        </div>
      </div>

      {/* FILTRI */}
      <div className="filtersRow" style={{ padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
          <div style={{ gridColumn: "span 3" }}>
            <label className="label" htmlFor="fFrom">Data da</label>
            <input id="fFrom" name="fFrom" className="input" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label className="label" htmlFor="fTo">Data a</label>
            <input id="fTo" name="fTo" className="input" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="fType">Tipo</label>
            <select id="fType" name="fType" className="input" value={fType} onChange={(e) => setFType(e.target.value as any)}>
              <option value="ALL">Tutti</option>
              <option value="IN">Entrata</option>
              <option value="OUT">Uscita</option>
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="fWarehouse">Magazzino</label>
            <select id="fWarehouse" name="fWarehouse" className="input" value={fWarehouse} onChange={(e) => setFWarehouse(e.target.value as any)}>
              <option value="ALL">Tutti</option>
              <option value="PRM">PRM</option>
              <option value="REALE">REALE</option>
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="onlyPickedBtn">Vista</label>
            <button
              id="onlyPickedBtn"
              type="button"
              className="btn"
              onClick={() => setOnlyPicked((v) => !v)}
              style={{ width: "100%", justifyContent: "center" }}
              title="Mostra solo i movimenti del materiale selezionato (se presente)"
            >
              {onlyPicked ? "Solo selezionato: ON" : "Solo selezionato: OFF"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => loadHistory()}>Applica filtri</button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setFFrom("");
              setFTo("");
              setFType("ALL");
              setFWarehouse("ALL");
              setTimeout(() => loadHistory(), 0);
            }}
          >
            Reset filtri
          </button>

          <div style={{ marginLeft: "auto", opacity: 0.75, fontSize: 12, alignSelf: "center" }}>
            Permessi: {isAdmin ? "Admin" : "Operatore"}
          </div>
        </div>
      </div>

      {/* FORM MOVIMENTO */}
      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className={`btn ${type === "IN" ? "btnPrimary" : ""}`} onClick={() => setType("IN")} type="button">Entrata</button>
          <button className={`btn ${type === "OUT" ? "btnPrimary" : ""}`} onClick={() => setType("OUT")} type="button">Uscita</button>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="label" htmlFor="movWh" style={{ margin: 0 }}>Magazzino</label>
            <select
              id="movWh"
              name="movWh"
              className="input"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value as any)}
              style={{ width: 140 }}
            >
              <option value="PRM">PRM</option>
              <option value="REALE">REALE</option>
            </select>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => (scanning ? stopScan() : startScan())}>
              {scanning ? "Chiudi camera" : "Scanner"}
            </button>
            <button className="btn" type="button" onClick={resetSearch}>Pulisci</button>
          </div>
        </div>

        <div ref={boxRef} style={{ position: "relative", marginTop: 12 }}>
          <label className="label" htmlFor="matSearch">Materiale (codice o descrizione)</label>
          <input
            id="matSearch"
            name="matSearch"
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
            placeholder="Filtra per codice, descrizione…"
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 12 }}>
          <div style={{ gridColumn: "span 8" }}>
            <label className="label" htmlFor="movNote">Note (opz.)</label>
            <input id="movNote" name="movNote" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="DDT / commessa / cliente" />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label className="label" htmlFor="movQty">Quantità</label>
            <input ref={qtyRef} id="movQty" name="movQty" className="input" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="es. 5" />
          </div>

          <div style={{ gridColumn: "span 1", display: "flex", alignItems: "end" }}>
            <button className="btn btnPrimary" onClick={saveMovement} style={{ width: "100%" }} type="button">
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

        {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}
      </div>

      {/* STORICO */}
      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>
            Storico movimenti {onlyPicked && picked ? `(solo ${picked.code})` : "(ultimi)"}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => loadHistory()}>Aggiorna</button>
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
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
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 12, color: "#0f172a" }}>Nessun movimento.</td>
                </tr>
              ) : (
                history.map((m) => {
                  const st = (m.status ?? (m.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
                  const isOpenOut = m.type === "OUT" && st === "OPEN";
                  const net = m.type === "OUT" ? Math.max(0, n(m.qty) - n(m.returned_qty)) : null;

                  return (
                    <tr
                      key={m.id}
                      onClick={() => openMovementPopup(m)}
                      style={{
                        cursor: "pointer",
                        background: isOpenOut ? "rgba(148,163,184,0.18)" : "transparent",
                      }}
                      title="Clicca per dettaglio"
                    >
                      <td>{fmtDate(m.created_at)}</td>

                      <td>
                        <span style={pillStyle(st)}>{st === "OPEN" ? "APERTO" : "CHIUSO"}</span>
                      </td>

                      <td>
                        <span style={pillStyle(m.type)}>{m.type === "IN" ? "ENTRATA" : "USCITA"}</span>
                      </td>

                      <td style={{ fontWeight: 900 }}>{m.code}</td>
                      <td>{nameMap[m.code] ?? "-"}</td>

                      <td>{m.warehouse ? <span style={pillStyle(m.warehouse)}>{m.warehouse}</span> : "-"}</td>

                      <td style={{ fontWeight: 900 }}>
                        {m.type === "IN" ? "+" : "-"}
                        {n(m.qty)}
                      </td>

                      <td>{m.type === "OUT" ? n(m.returned_qty) : "-"}</td>
                      <td style={{ fontWeight: 900 }}>{m.type === "OUT" ? net : "-"}</td>

                      <td>{m.note ?? ""}</td>
                      <td>{m.created_by_name ?? "-"}</td>

                      <td>
                        {isAdmin ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMovement(m.id);
                            }}
                          >
                            Elimina
                          </button>
                        ) : (
                          <span style={{ opacity: 0.6 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* POPUP DETTAGLIO MOVIMENTO (stesso stile Giacenze) */}
      {detailOpen && detailRow && (
        <div
          onMouseDown={() => {
            if (detailSaving) return;
            setDetailOpen(false);
            setDetailRow(null);
            setEditMode(false);
            setDetailMsg(null);
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
                Dettaglio movimento · <span style={{ opacity: 0.75 }}>{detailRow.code}</span>
                {detailRow.warehouse ? <span style={{ marginLeft: 8, ...pillStyle(detailRow.warehouse) }}>{detailRow.warehouse}</span> : null}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={pillStyle((detailRow.status ?? (detailRow.type === "OUT" ? "OPEN" : "CLOSED")) as any)}>
                  {(detailRow.status ?? (detailRow.type === "OUT" ? "OPEN" : "CLOSED")) === "OPEN" ? "APERTO" : "CHIUSO"}
                </span>

                <button
                  className="btn"
                  type="button"
                  disabled={detailSaving}
                  onClick={() => {
                    setDetailOpen(false);
                    setDetailRow(null);
                    setEditMode(false);
                    setDetailMsg(null);
                  }}
                >
                  Chiudi popup
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
              <div style={{ gridColumn: "span 3" }}>
                <label className="label" htmlFor="d_type">Tipo</label>
                <input id="d_type" name="d_type" className="input" disabled value={detailRow.type === "IN" ? "ENTRATA" : "USCITA"} />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label" htmlFor="d_date">Data</label>
                <input id="d_date" name="d_date" className="input" disabled value={fmtDate(detailRow.created_at)} />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label" htmlFor="d_qty">Quantità</label>
                <input
                  id="d_qty"
                  name="d_qty"
                  className="input"
                  disabled
                  value={`${detailRow.type === "IN" ? "+" : "-"}${n(detailRow.qty)}`}
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label" htmlFor="d_by">Inserito da</label>
                <input id="d_by" name="d_by" className="input" disabled value={detailRow.created_by_name ?? "-"} />
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <label className="label" htmlFor="d_note">Note</label>
                <input id="d_note" name="d_note" className="input" disabled value={detailRow.note ?? ""} />
              </div>
            </div>

            {/* CHIUSURA (solo OUT open + permessi) */}
            {detailRow.type === "OUT" && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(15,23,42,0.14)",
                  background: "rgba(255,255,255,0.85)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>Rettifica / Chiusura uscita</div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {/* matita edit mode */}
                    <button
                      className="btn"
                      type="button"
                      disabled={!canClose(detailRow) || detailSaving}
                      onClick={() => setEditMode((v) => !v)}
                      title="Abilita modifica"
                    >
                      ✏️
                    </button>

                    <button
                      className="btn btnPrimary"
                      type="button"
                      disabled={!canClose(detailRow) || !editMode || detailSaving}
                      onClick={confirmCloseFromPopup}
                    >
                      {detailSaving ? "Salvataggio…" : "Conferma chiusura"}
                    </button>
                  </div>
                </div>

                {!canClose(detailRow) && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    Solo il creatore del movimento o l’admin può chiudere questa uscita.
                  </div>
                )}

                {(detailRow.status ?? "OPEN") === "CLOSED" && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    Questo movimento è già <b>CHIUSO</b> e non è più modificabile.
                  </div>
                )}

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "220px 220px 1fr",
                    gap: 10,
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label className="label" htmlFor="d_out">Quantità uscita</label>
                    <input id="d_out" name="d_out" className="input" disabled value={String(n(detailRow.qty))} />
                  </div>

                  <div>
                    <label className="label" htmlFor="d_ret">Quantità rientro</label>
                    <input
                      id="d_ret"
                      name="d_ret"
                      className="input"
                      disabled={!editMode || detailSaving}
                      style={!editMode ? { color: "#64748b", background: "rgba(15,23,42,0.04)" } : undefined}
                      value={detailReturnQty}
                      onChange={(e) => setDetailReturnQty(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="d_ret_note">Nota rientro (opz.)</label>
                    <input
                      id="d_ret_note"
                      name="d_ret_note"
                      className="input"
                      disabled={!editMode || detailSaving}
                      style={!editMode ? { color: "#64748b", background: "rgba(15,23,42,0.04)" } : undefined}
                      value={detailReturnNote}
                      onChange={(e) => setDetailReturnNote(e.target.value)}
                      placeholder="Esempio: rientrati 2 pezzi"
                    />
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                  Premi ✏️ per sbloccare i campi, poi “Conferma chiusura”.
                </div>

                {detailMsg && <div style={{ marginTop: 10, fontWeight: 800 }}>{detailMsg}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}