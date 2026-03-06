"use client";

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

  referent_id: string | null;
  referee_email: string | null;

  closed_at: string | null;
  closed_by: string | null;
};

type ReferentRow = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
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

function toNumber(v: any) {
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

/** Pill “aziendali” tutti uguali, cambiano solo colore */
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

  if (kind === "IN") return { ...base, borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.10)" };
  if (kind === "OUT") return { ...base, borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" };

  if (kind === "OPEN") return { ...base, borderColor: "rgba(245,158,11,0.55)", background: "rgba(245,158,11,0.12)" };
  if (kind === "CLOSED") return { ...base, borderColor: "rgba(59,130,246,0.45)", background: "rgba(59,130,246,0.10)" };

  if (kind === "PRM") return { ...base, borderColor: "rgba(2,132,199,0.45)", background: "rgba(2,132,199,0.10)" };
  return { ...base, borderColor: "rgba(99,102,241,0.45)", background: "rgba(99,102,241,0.10)" };
}

/** Matita “stile giacenze” (SVG inline, niente immagini esterne) */
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

type ExcelLiveRow = {
  code: string;
  warehouse: "PRM" | "REALE";
  qty_free: number | null;
  qty_blocked: number | null;
  qty_quality: number | null;
  row_json: Record<string, any> | null;
};

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
  const [loading, setLoading] = useState(true);

  const [fFrom, setFFrom] = useState(""); // yyyy-mm-dd
  const [fTo, setFTo] = useState("");
  const [fType, setFType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [fWarehouse, setFWarehouse] = useState<"ALL" | "PRM" | "REALE">("ALL");

  // scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLockedRef = useRef(false);

  // popup dettaglio/chiusura
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState<MovementRow | null>(null);
  const [closingMeta, setClosingMeta] = useState<{ name: string; um: string } | null>(null);

  // rettifica (campi)
  const [returnQty, setReturnQty] = useState<string>("0");
  const [returnNote, setReturnNote] = useState<string>("");
  const [referents, setReferents] = useState<ReferentRow[]>([]);
  const [selReferentId, setSelReferentId] = useState<string>("");

  // “matita” per sbloccare SOLO i campi di rettifica
  const [editRectify, setEditRectify] = useState(false);

  function canEditRow(m: MovementRow) {
    const st = (m.status ?? (m.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
    if (m.type !== "OUT") return false;
    if (st === "CLOSED") return false;
    return isAdmin || sameUser(m.created_by, userId);
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

  function escapeIlike(v: string) {
  // Escape per ILIKE: % e _ sono wildcard, \ è escape
  // Inoltre togliamo apici/backtick che possono rompere il parser del filtro
  return v
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/['"`]/g, " ")
    .trim();
}

async function loadSuggestions(text: string) {
  const s = String(text ?? "").trim();
  if (!s) {
    setSuggestions([]);
    return;
  }

  try {
    // 1) query per codice
    const q1 = await supabase
      .from("items")
      .select("code,name,um")
      .ilike("code", `%${s}%`)
      .order("code", { ascending: true })
      .limit(12);

    // 2) query per descrizione
    const q2 = await supabase
      .from("items")
      .select("code,name,um")
      .ilike("name", `%${s}%`)
      .order("code", { ascending: true })
      .limit(12);

    // Debug “grezzo” (qui vediamo se è RLS: di solito q1.status=401/403 o error con message)
    if (q1.error || q2.error) {
      console.error("loadSuggestions raw:", {
        q1: { status: (q1 as any).status, error: q1.error, dataLen: q1.data?.length ?? 0 },
        q2: { status: (q2 as any).status, error: q2.error, dataLen: q2.data?.length ?? 0 },
      });
      setSuggestions([]);
      return;
    }

    // merge univoco per code
    const map = new Map<string, DbItem>();
    for (const it of (q1.data ?? []) as any[]) map.set(it.code, it as DbItem);
    for (const it of (q2.data ?? []) as any[]) map.set(it.code, it as DbItem);

    setSuggestions(Array.from(map.values()).slice(0, 12));
  } catch (e: any) {
    console.error("loadSuggestions catch:", e);
    setSuggestions([]);
  }
}

  async function loadHistory() {
    setLoading(true);
    setMsg(null);

    let q = supabase
      .from("movements")
      .select(
        "id,created_at,type,code,qty,note,warehouse,created_by,created_by_name,status,returned_qty,return_note,referent_id,referee_email,closed_at,closed_by"
      )
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT);

    const isoFrom = toIsoStartOfDay(fFrom);
    const isoTo = toIsoEndOfDay(fTo);
    if (isoFrom) q = q.gte("created_at", isoFrom);
    if (isoTo) q = q.lte("created_at", isoTo);
    if (fType !== "ALL") q = q.eq("type", fType);
    if (fWarehouse !== "ALL") q = q.eq("warehouse", fWarehouse);

    const { data, error } = await q;

    if (error) {
      console.error("loadHistory error:", error);
      setHistory([]);
      setNameMap({});
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as MovementRow[];
    setHistory(rows);

    const codes = Array.from(new Set(rows.map((r) => r.code).filter(Boolean)));
    if (codes.length === 0) {
      setNameMap({});
      setLoading(false);
      return;
    }

    const { data: itemsData, error: e2 } = await supabase.from("items").select("code,name").in("code", codes);
    if (e2) {
      console.error("items nameMap error:", e2);
      setNameMap({});
      setLoading(false);
      return;
    }

    const map: Record<string, string> = {};
    for (const it of itemsData ?? []) {
      const c = (it as any).code as string;
      const nm = (it as any).name as string | null;
      if (c) map[c] = nm ?? "";
    }
    setNameMap(map);
    setLoading(false);
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

  async function getOrCreateExcelLiveRow(code: string, wh: "PRM" | "REALE") {
    // Se manca la riga in excel_live, proviamo a copiarla da excel_original.
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

    // Preferiamo qty_free se presente, altrimenti JSON
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

    const qn = toNumber(qty);
    if (!Number.isFinite(qn) || qn <= 0) {
      return setMsg("Quantità non valida.");
    }

    // recupera nome utente
    const { data: prof } = await supabase.from("profiles").select("first_name,last_name").eq("id", userId).maybeSingle();

    const fullName =
      `${String((prof as any)?.first_name ?? "").trim()} ${String((prof as any)?.last_name ?? "").trim()}`.trim() || null;

    // -------------------------
    // SALVA MOVIMENTO
    // -------------------------
    const payload: Partial<MovementRow> = {
      type,
      code: picked.code,
      qty: qn,
      note: note.trim() || null,
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

    // -------------------------
    // AGGIORNA EXCEL LIVE
    // -------------------------
    try {
      const delta = type === "IN" ? qn : -qn;
      await applyDeltaToExcelLive(picked.code, warehouse, delta);
    } catch (e: any) {
      console.error("excel_live update error:", e);
      // Non blocchiamo l'utente, ma lo avvisiamo chiaramente
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

  async function deleteMovement(id: string) {
  if (!isAdmin) return alert("Solo l'admin può eliminare i movimenti.");
  const ok = confirm("Eliminare questo movimento?");
  if (!ok) return;

  // 1️⃣ Leggo il movimento
  const { data: mov, error: readError } = await supabase
    .from("movements")
    .select("id,code,warehouse,type,qty")
    .eq("id", id)
    .single();

  if (readError || !mov) {
    console.error("Errore lettura movimento:", readError);
    return alert("Impossibile leggere il movimento.");
  }

  const code = mov.code;
  const warehouse = mov.warehouse;
  const qty = Math.abs(Number(mov.qty ?? 0));

  // 2️⃣ Calcolo il delta inverso
  const delta = mov.type === "IN"
    ? -qty   // se era +10 → diventa -10
    : +qty;  // se era -10 → diventa +10

  // 3️⃣ Leggo la giacenza corrente
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

  // 4️⃣ Aggiorno la giacenza
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

  // 5️⃣ Elimino il movimento
  const { error: deleteError } = await supabase
    .from("movements")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("Errore eliminazione:", deleteError);
    return alert("Non posso eliminare: " + deleteError.message);
  }

  // refresh UI
  if (closing?.id === id) {
    setCloseOpen(false);
    setClosing(null);
    setClosingMeta(null);
    setEditRectify(false);
  }

  await loadHistory();
}

  // fallback: se items ha name/um vuoti, prova a prenderli dall’altro magazzino (excel_live.row_json)
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
      } as any)
      .eq("id", closing.id);

    if (error) {
      setMsg("Errore chiusura: " + (error as any)?.message);
      return;
    }

    // Aggiorna giacenza: rientro = aumenta il libero
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
            }
          : row
      )
    );

    // email hook (non blocca)
    try {
      await supabase.functions.invoke("send_close_email", {
        body: {
          movement_id: closing.id,
          code: closing.code,
          warehouse: closing.warehouse,
          out_qty: outQty,
          returned_qty: r,
          net_qty: Math.max(0, outQty - r),
          return_note: (returnNote ?? "").trim() || null,
          referent_name: ref?.name ?? null,
          referent_email: ref?.email ?? null,
          closed_by: userEmail ?? null,
        },
      });
    } catch {}

    setMsg("Movimento chiuso ✅");
    setCloseOpen(false);
    setClosing(null);
    setClosingMeta(null);
    setEditRectify(false);

    await loadHistory();
  }

  // init
  useEffect(() => {
    (async () => {
      await loadHistory();
      await loadReferents();

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setUserId(uid);
      setUserEmail(userData.user?.email ?? null);

      if (!uid) {
        setIsAdmin(false);
        return;
      }

      const { data: isAdm, error } = await supabase.rpc("is_admin");
      if (error) {
        console.error("is_admin rpc error:", error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!isAdm);
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
  }, []);

  // realtime: aggiorna lista quando cambia movements (senza dipendenze “strane”)
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

  // debounce suggestions
  useEffect(() => {
    setActiveIndex(0);
    const t = setTimeout(() => {
      if (open) loadSuggestions(search);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const active = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <style jsx global>{`
        .openStripe {
          background: repeating-linear-gradient(
            135deg,
            rgba(250, 204, 21, 0.38) 0px,
            rgba(250, 204, 21, 0.38) 10px,
            rgba(148, 163, 184, 0.22) 10px,
            rgba(148, 163, 184, 0.22) 20px
          ) !important;
          background-size: 200% 200% !important;
          animation: stripeMove 1.2s linear infinite !important;
        }
        @keyframes stripeMove {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: -100% 50%;
          }
        }
      `}</style>

      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Movimenti</div>
      </div>

      {/* FILTRI STORICO */}
      <div className="filtersRow" style={{ padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
          <div style={{ gridColumn: "span 3" }}>
            <label className="label" htmlFor="fFrom">
              Data da
            </label>
            <input id="fFrom" name="fFrom" className="input" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label className="label" htmlFor="fTo">
              Data a
            </label>
            <input id="fTo" name="fTo" className="input" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="fType">
              Tipo
            </label>
            <select id="fType" name="fType" className="input" value={fType} onChange={(e) => setFType(e.target.value as any)}>
              <option value="ALL">Tutti</option>
              <option value="IN">Entrata</option>
              <option value="OUT">Uscita</option>
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="fWh">
              Magazzino
            </label>
            <select id="fWh" name="fWh" className="input" value={fWarehouse} onChange={(e) => setFWarehouse(e.target.value as any)}>
              <option value="ALL">Tutti</option>
              <option value="PRM">PRM</option>
              <option value="REALE">REALE</option>
            </select>
          </div>

          <div style={{ gridColumn: "span 2", display: "flex", alignItems: "end", gap: 10 }}>
            <button className="btn" onClick={loadHistory} style={{ width: "100%", justifyContent: "center" }}>
              Applica filtri
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            className="btn"
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

          <div style={{ marginLeft: "auto", opacity: 0.75, fontSize: 12, alignSelf: "center" }}>Permessi: {isAdmin ? "Admin" : "Operatore"}</div>
        </div>
      </div>

      {/* FORM MOVIMENTO */}
      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className={`btn ${type === "IN" ? "btnPrimary" : ""}`} onClick={() => setType("IN")} type="button">
            Entrata
          </button>
          <button className={`btn ${type === "OUT" ? "btnPrimary" : ""}`} onClick={() => setType("OUT")} type="button">
            Uscita
          </button>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="label" htmlFor="whMove" style={{ marginBottom: 0 }}>
              Magazzino
            </label>
            <select id="whMove" name="whMove" className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value as any)} style={{ width: 140 }}>
              <option value="PRM">PRM</option>
              <option value="REALE">REALE</option>
            </select>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => (scanning ? stopScan() : startScan())}>
              {scanning ? "Chiudi camera" : "Scanner"}
            </button>
            <button className="btn" type="button" onClick={resetSearch}>
              Babbà
            </button>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 12 }}>
          <div style={{ gridColumn: "span 8" }}>
            <label className="label" htmlFor="noteMove">
              Note (opz.)
            </label>
            <input id="noteMove" name="noteMove" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="DDT / commessa / cliente" />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label className="label" htmlFor="qtyMove">
              Quantità
            </label>
            <input ref={qtyRef} id="qtyMove" name="qtyMove" className="input" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="es. 5" />
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

      {/* STORICO */}
      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Storico movimenti</div>
          <button className="btn" onClick={loadHistory}>
            Aggiorna
          </button>
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
              {loading ? (
                <tr>
                  <td colSpan={12} style={{ padding: 12, color: "#0f172a" }}>
                    Caricamento…
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 12, color: "#0f172a" }}>
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
                      onClick={() => {
                        if (!canEditRow(m)) return;
                        openCloseModal(m);
                      }}
                      style={{
                        cursor: canEditRow(m) ? "pointer" : "default",
                        background: isOpenOut ? "rgba(148,163,184,0.18)" : "transparent",
                      }}
                      title={canEditRow(m) ? "Clicca per chiudere / rettificare" : ""}
                    >
                      <td>{fmtDate(m.created_at)}</td>

                      <td>
                        <span className={st === "OPEN" ? "openStripe" : ""} style={pillStyle(st)}>
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

                      <td>
                        {isAdmin ? (
                          <button
                            className="btn"
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

      {/* POPUP DETTAGLIO / CHIUSURA */}
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
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>
                Dettaglio movimento · <span style={{ opacity: 0.75 }}>{closing.code}</span>{" "}
                {closing.warehouse ? <span style={{ marginLeft: 8, ...pillStyle(closing.warehouse) }}>{closing.warehouse}</span> : null}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ ...pillStyle((closing.status ?? "OPEN") as any) }}>
                  {(closing.status ?? (closing.type === "OUT" ? "OPEN" : "CLOSED")) === "OPEN" ? "APERTO" : "CHIUSO"}
                </span>

                <button
                  className="btn"
                  onClick={() => {
                    setCloseOpen(false);
                    setClosing(null);
                    setClosingMeta(null);
                    setMsg(null);
                    setEditRectify(false);
                  }}
                >
                  Chiudi
                </button>
              </div>
            </div>

            {/* Riga info */}
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
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
                <input id="mvQty" name="mvQty" className="input" value={String(closing.type === "OUT" ? -Math.abs(n(closing.qty)) : Math.abs(n(closing.qty)))} disabled />
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

            {/* Sezione rettifica/chiusura per OUT OPEN */}
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
                      {selReferentId ? `Email: ${referents.find((x) => x.id === selReferentId)?.email ?? "-"}` : "Seleziona il referente per associarlo alla chiusura."}
                    </div>
                  </div>

                  <div style={{ gridColumn: "span 6" }}>
                    <label className="label" htmlFor="netInfo">
                      Quantità netta (uscita - rientro)
                    </label>
                    <input id="netInfo" name="netInfo" className="input" value={String(Math.max(0, Math.abs(n(closing.qty)) - n(toNumber(returnQty))))} disabled />
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                  Dopo la chiusura lo stato passa a <b>CHIUSO</b> e non sarà più modificabile.
                </div>
              </div>
            )}

            {/* Meta materiale */}
            <div style={{ marginTop: 12, opacity: 0.85, fontSize: 12 }}>
              {closingMeta ? (
                <>
                  <b>{closingMeta.name}</b> · UM: <b>{closingMeta.um}</b>
                </>
              ) : (
                <span>—</span>
              )}
            </div>

            {msg && <div style={{ marginTop: 10, fontWeight: 800, whiteSpace: "pre-wrap" }}>{msg}</div>}
          </div>
        </div>
      )}
    </main>
  );
}