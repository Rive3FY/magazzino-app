"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Warehouse = "PRM" | "REALE";

type DbItem = {
  code: string;
  name: string;
  um: string | null;
};

type DbStockRow = {
  code: string;
  warehouse: Warehouse;
  initial_qty: number | null;
};

type DbMovement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  warehouse: Warehouse | null;
  pending: boolean;
  created_by: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
};

type StockBoth = { PRM: number; REALE: number };

function fmtDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function toNumber(v: string) {
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function whereLabel(st: StockBoth) {
  const a = st.PRM > 0;
  const b = st.REALE > 0;
  if (a && b) return "Entrambi";
  if (a) return "PRM";
  if (b) return "REALE";
  return "Nessuno";
}

export default function MovimentiPage() {
  const supabase = createClient();

  const [ready, setReady] = useState(false);

  // user/admin
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // movimento form
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [warehouse, setWarehouse] = useState<Warehouse>("PRM");
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

  // stock
  const [stock, setStock] = useState<StockBoth | null>(null);

  // storico
  const [history, setHistory] = useState<DbMovement[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  // filtri storico
  const [fFrom, setFFrom] = useState(""); // yyyy-mm-dd
  const [fTo, setFTo] = useState("");
  const [fType, setFType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [fWarehouse, setFWarehouse] = useState<"ALL" | Warehouse>("ALL");
  const [onlyPicked, setOnlyPicked] = useState(false);

  // date helper
  function toIsoStartOfDay(d: string) {
    if (!d) return null;
    return new Date(`${d}T00:00:00.000`).toISOString();
  }
  function toIsoEndOfDay(d: string) {
    if (!d) return null;
    return new Date(`${d}T23:59:59.999`).toISOString();
  }

  // scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLockedRef = useRef(false);

  // modal chiusura
  const [closing, setClosing] = useState<DbMovement | null>(null);
  const [returnQty, setReturnQty] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [busyClose, setBusyClose] = useState(false);

  function openCloseModal(m: DbMovement) {
    setClosing(m);
    setReturnQty("");
    setCloseNote("");
    setMsg(null);
  }

  function closeCloseModal() {
    setClosing(null);
    setReturnQty("");
    setCloseNote("");
    setBusyClose(false);
  }

  function canCloseMovement(m: DbMovement) {
    // admin sempre, altrimenti solo chi ha creato la riga (se created_by c’è)
    if (isAdmin) return true;
    if (!userId) return false;
    if (!m.created_by) return false;
    return m.created_by === userId;
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
      console.error("loadSuggestions error:", {
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
        code: (error as any)?.code,
        raw: error,
      });
      setMsg("Errore ricerca: " + ((error as any)?.message ?? "sconosciuto"));
      setSuggestions([]);
      return;
    }

    setSuggestions((data ?? []) as DbItem[]);
  }

  async function computeStockBoth(code: string) {
    // base (item_stocks)
    const { data: base, error: eBase } = await supabase
      .from("item_stocks")
      .select("code,warehouse,initial_qty")
      .eq("code", code);

    if (eBase) {
      console.error("item_stocks error:", eBase);
      setStock(null);
      return;
    }

    let basePRM = 0;
    let baseREALE = 0;
    for (const r of (base ?? []) as DbStockRow[]) {
      if (r.warehouse === "PRM") basePRM = n(r.initial_qty);
      if (r.warehouse === "REALE") baseREALE = n(r.initial_qty);
    }

    // delta movements
    const { data: movs, error: eMovs } = await supabase
      .from("movements")
      .select("warehouse,type,qty")
      .eq("code", code);

    if (eMovs) {
      console.error("movements stock error:", eMovs);
      setStock({ PRM: basePRM, REALE: baseREALE });
      return;
    }

    let dPRM = 0;
    let dREALE = 0;
    for (const m of movs ?? []) {
      const wh = (m as any).warehouse as Warehouse | null;
      const t = (m as any).type as "IN" | "OUT";
      const q = n((m as any).qty);
      const signed = t === "IN" ? q : -q;
      if (wh === "PRM") dPRM += signed;
      if (wh === "REALE") dREALE += signed;
    }

    setStock({ PRM: basePRM + dPRM, REALE: baseREALE + dREALE });
  }

  async function pickItem(it: DbItem) {
    setPicked(it);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
    setMsg(null);
    await computeStockBoth(it.code);
    setTimeout(() => qtyRef.current?.focus(), 80);
  }

  async function pickItemByCode(codeRaw: string) {
    const code = codeRaw.trim();
    if (!code) return;

    // quando scansiono: di default prelievo (OUT) veloce
    setType("OUT");
    setQty("");
    setMsg(null);

    const { data: item, error } = await supabase
      .from("items")
      .select("code,name,um")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("pickItemByCode error:", error);
      setMsg("Errore ricerca articolo: " + (error as any)?.message);
      return;
    }

    if (!item) {
      setPicked(null);
      setStock(null);
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

    // reset “duro” prima di ripartire (iOS friendly)
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

  function clearAll() {
    stopScan();
    setSearch("");
    setOpen(false);
    setSuggestions([]);
    setPicked(null);
    setStock(null);
    setQty("");
    setNote("");
    setMsg(null);
    // NON cambiamo filtri storico
    loadHistory();
  }

  async function loadHistory() {
    let q = supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,warehouse,pending,created_by,created_by_email,created_by_name")
      .order("created_at", { ascending: false })
      .limit(250);

    // filtri
    const isoFrom = toIsoStartOfDay(fFrom);
    const isoTo = toIsoEndOfDay(fTo);
    if (isoFrom) q = q.gte("created_at", isoFrom);
    if (isoTo) q = q.lte("created_at", isoTo);
    if (fType !== "ALL") q = q.eq("type", fType);
    if (fWarehouse !== "ALL") q = q.eq("warehouse", fWarehouse);

    // SOLO se l’utente lo decide esplicitamente
    if (onlyPicked && picked?.code) q = q.eq("code", picked.code);

    const { data, error } = await q;

    if (error) {
      console.error("loadHistory error:", {
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
        code: (error as any)?.code,
        raw: error,
      });
      setHistory([]);
      setNameMap({});
      return;
    }

    const rows = (data ?? []) as DbMovement[];
    setHistory(rows);

    const codes = Array.from(new Set(rows.map((r) => r.code).filter(Boolean)));
    if (codes.length === 0) {
      setNameMap({});
      return;
    }

    const { data: itemsData, error: e2 } = await supabase
      .from("items")
      .select("code,name")
      .in("code", codes);

    if (e2) {
      console.error("items nameMap error:", e2);
      setNameMap({});
      return;
    }

    const map: Record<string, string> = {};
    for (const it of itemsData ?? []) {
      const c = (it as any).code as string;
      const nme = (it as any).name as string | null;
      if (c) map[c] = nme ?? "";
    }
    setNameMap(map);
  }

  async function save() {
    setMsg(null);

    if (!userId) return setMsg("Devi essere loggato per salvare movimenti.");
    if (!picked) return setMsg("Seleziona un materiale (scrivi per cercare o scansiona).");

    const q = toNumber(qty);
    if (!Number.isFinite(q) || q <= 0) return setMsg("Quantità non valida (deve essere > 0).");

    // blocco uscita sotto zero (per magazzino selezionato)
    if (type === "OUT") {
      const s = stock ?? { PRM: 0, REALE: 0 };
      const current = warehouse === "PRM" ? s.PRM : s.REALE;
      if (current - q < 0) {
        return setMsg(`Uscita non possibile: giacenza ${current} → diventerebbe ${current - q}.`);
      }
    }

    const payload = {
      type,
      code: picked.code,
      qty: q,
      note: note.trim() || null,
      warehouse,
      // se hai trigger DB che imposta pending per OUT, va bene lo stesso; qui lo mettiamo esplicito:
      pending: type === "OUT",
      created_by: userId,
      created_by_email: userEmail,
      created_by_name: userName,
    };

    const { error } = await supabase.from("movements").insert(payload as any);
    if (error) return setMsg("Errore salvataggio: " + (error as any)?.message);

    setQty("");
    setNote("");
    setMsg("Movimento salvato ✅");

    await computeStockBoth(picked.code);
    await loadHistory();

    setTimeout(() => qtyRef.current?.focus(), 80);
  }

  async function deleteMovement(id: string) {
    if (!isAdmin) {
      alert("Solo l'admin può eliminare i movimenti.");
      return;
    }

    const ok = confirm("Eliminare questo movimento?");
    if (!ok) return;

    const { error } = await supabase.from("movements").delete().eq("id", id);
    if (error) {
      alert("Non posso eliminare: " + (error as any)?.message);
      return;
    }

    // aggiorno stock se serve
    if (picked?.code) await computeStockBoth(picked.code);
    await loadHistory();
  }

  async function confirmClose() {
    if (!closing) return;

    const movement = closing;

    // già chiuso → stop
    if (movement.pending !== true) {
      setMsg("Movimento già chiuso.");
      closeCloseModal();
      return;
    }

    // permessi
    if (!canCloseMovement(movement)) {
      setMsg("Non hai i permessi per chiudere questo movimento.");
      closeCloseModal();
      return;
    }

    setBusyClose(true);
    setMsg(null);

    try {
      const retQty = toNumber(returnQty || "0");
      const extraNote = closeNote.trim();

      // 1) eventuale rientro (IN)
      if (Number.isFinite(retQty) && retQty > 0) {
        const { error: insertError } = await supabase.from("movements").insert({
          type: "IN",
          code: movement.code,
          qty: retQty,
          warehouse: movement.warehouse,
          pending: false,
          note: extraNote ? `Rientro: ${extraNote}` : "Rientro",
          created_by: userId,
          created_by_email: userEmail,
          created_by_name: userName,
        } as any);

        if (insertError) throw insertError;
      }

      // 2) chiudo OUT (solo se pending=true)
      const { data, error: updateError } = await supabase
        .from("movements")
        .update({ pending: false })
        .eq("id", movement.id)
        .eq("pending", true)
        .select();

      if (updateError) throw updateError;

      if (!data || data.length === 0) {
        setMsg("Movimento già chiuso da un altro utente.");
        closeCloseModal();
        setBusyClose(false);
        return;
      }

      closeCloseModal();
      setMsg("Movimento chiuso correttamente ✅");

      // refresh
      if (picked?.code) await computeStockBoth(picked.code);
      await loadHistory();
    } catch (err: any) {
      console.error("confirmClose error:", err);
      setMsg("Errore chiusura: " + (err?.message ?? "sconosciuto"));
    } finally {
      setBusyClose(false);
    }
  }

  // init
  useEffect(() => {
    setReady(true);
    loadHistory();

    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;

      const email = u?.email ?? null;
      const uid = u?.id ?? null;

      setUserEmail(email);
      setUserId(uid);

      // nome
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", uid)
          .maybeSingle();

        const first = (prof as any)?.first_name?.trim?.() ?? "";
        const last = (prof as any)?.last_name?.trim?.() ?? "";
        const full = [first, last].filter(Boolean).join(" ").trim();
        setUserName(full || email);
      } else {
        setUserName(email);
      }

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

  // debounce suggestions
  useEffect(() => {
    setActiveIndex(0);
    if (!open) return;

    const t = setTimeout(() => {
      loadSuggestions(search);
    }, 220);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const active = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  const where = stock ? whereLabel(stock) : "";

  // UI helpers
  function rowStyle(m: DbMovement): React.CSSProperties {
    if (m.type === "OUT" && m.pending === true) {
      return {
        background: "#f1f5f9",
        opacity: 0.95,
      };
    }
    return {};
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino · Movimenti</div>
        <div className="pageBarActions">
          <a className="btn" href="/giacenze">Giacenze</a>
          <a className="btn" href="/import">Import</a>
        </div>
      </div>

      {!ready ? (
        <div style={{ padding: 12 }}>Caricamento…</div>
      ) : (
        <>
          {/* FILTRI STORICO */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
              <div style={{ gridColumn: "span 3" }}>
                <label className="label">Data da</label>
                <input className="input" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label">Data a</label>
                <input className="input" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label className="label">Tipo</label>
                <select className="input" value={fType} onChange={(e) => setFType(e.target.value as any)}>
                  <option value="ALL">Tutti</option>
                  <option value="IN">Entrata</option>
                  <option value="OUT">Uscita</option>
                </select>
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label className="label">Magazzino</label>
                <select className="input" value={fWarehouse} onChange={(e) => setFWarehouse(e.target.value as any)}>
                  <option value="ALL">Tutti</option>
                  <option value="PRM">PRM</option>
                  <option value="REALE">REALE</option>
                </select>
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label className="label">Solo selezionato</label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOnlyPicked((v) => !v)}
                  style={{
                    width: "100%",
                    border: onlyPicked ? "1px solid #2563eb" : undefined,
                    background: onlyPicked ? "rgba(37, 99, 235, 0.12)" : undefined,
                    fontWeight: 800,
                  }}
                  title="Mostra solo i movimenti del materiale selezionato (non automatico)"
                >
                  {onlyPicked ? "Attivo" : "Disattivo"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => loadHistory()}>
                Applica filtri
              </button>

              <button
                className="btn"
                onClick={() => {
                  setFFrom("");
                  setFTo("");
                  setFType("ALL");
                  setFWarehouse("ALL");
                  setOnlyPicked(false);
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
              <button
                className={`btn ${type === "IN" ? "btnPrimary" : ""}`}
                onClick={() => setType("IN")}
                type="button"
              >
                Entrata
              </button>

              <button
                className={`btn ${type === "OUT" ? "btnPrimary" : ""}`}
                onClick={() => setType("OUT")}
                type="button"
              >
                Uscita
              </button>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <label className="label" style={{ margin: 0 }}>Magazzino</label>
                <select
                  className="input"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value as Warehouse)}
                  style={{ width: 160 }}
                >
                  <option value="PRM">PRM</option>
                  <option value="REALE">REALE</option>
                </select>
              </div>

              <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn" type="button" onClick={() => (scanning ? stopScan() : startScan())}>
                  {scanning ? "Chiudi camera" : "Scanner"}
                </button>
                <button className="btn" type="button" onClick={clearAll}>
                  Pulisci
                </button>
              </div>
            </div>

            <div ref={boxRef} style={{ position: "relative", marginTop: 12 }}>
              <label className="label">Materiale (codice o descrizione)</label>
              <input
                className="input"
                value={search}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearch(v);
                  setOpen(true);
                  setPicked(null);
                  setStock(null);
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
                <video
                  ref={videoRef}
                  style={{ width: "100%", borderRadius: 12, background: "black" }}
                  muted
                  playsInline
                />
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                  Inquadra il codice a barre con la fotocamera.
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 12 }}>
              <div style={{ gridColumn: "span 8" }}>
                <label className="label">Note (opz.)</label>
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="DDT / commessa / cliente"
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <label className="label">Quantità</label>
                <input
                  ref={qtyRef}
                  className="input"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  inputMode="decimal"
                  placeholder="es. 5"
                />
              </div>

              <div style={{ gridColumn: "span 1", display: "flex", alignItems: "end" }}>
                <button className="btn btnPrimary" onClick={save} style={{ width: "100%" }}>
                  Salva
                </button>
              </div>
            </div>

            {picked && stock && (
              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.95 }}>
                <div>
                  <b>{picked.code}</b> · {picked.name} · UM <b>{picked.um ?? "-"}</b> · Dove: <b>{where}</b>
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span className="badge badgeIn">PRM: {stock.PRM}</span>
                  <span className="badge badgeOut">REALE: {stock.REALE}</span>
                </div>
              </div>
            )}

            {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}
          </div>

          {/* STORICO */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Storico movimenti</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => loadHistory()}>
                  Aggiorna
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Codice</th>
                    <th>Descrizione</th>
                    <th>Magazzino</th>
                    <th>Q.tà</th>
                    <th>Note</th>
                    <th>Inserito da</th>
                    <th>Stato</th>
                    <th>Azioni</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((m) => (
                    <tr key={m.id} style={rowStyle(m)}>
                      <td>{fmtDate(m.created_at)}</td>
                      <td>
                        <span className={`badge ${m.type === "IN" ? "badgeIn" : "badgeOut"}`}>
                          {m.type === "IN" ? "Entrata" : "Uscita"}
                        </span>
                      </td>
                      <td>{m.code}</td>
                      <td>{nameMap[m.code] ?? "-"}</td>
                      <td>{m.warehouse ?? "-"}</td>
                      <td>
                        {m.type === "IN" ? "+" : "-"}
                        {m.qty}
                      </td>
                      <td>{m.note ?? ""}</td>
                      <td>{m.created_by_name ?? m.created_by_email ?? "-"}</td>

                      {/* STATO */}
                      <td>
                        {m.type === "OUT" ? (
                          m.pending === true ? (
                            <span
                              style={{
                                fontSize: 12,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: "#e2e8f0",
                                color: "#334155",
                                fontWeight: 900,
                              }}
                            >
                              Da chiudere
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 12,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: "#dcfce7",
                                color: "#166534",
                                fontWeight: 900,
                              }}
                            >
                              Confermato
                            </span>
                          )
                        ) : (
                          <span style={{ opacity: 0.6 }}>—</span>
                        )}
                      </td>

                      {/* AZIONI */}
                      <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {m.type === "OUT" && m.pending === true && canCloseMovement(m) && (
                          <button
                            onClick={() => openCloseModal(m)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 10,
                              border: "1px solid #2563eb",
                              background: "#dbeafe",
                              color: "#1e40af",
                              cursor: "pointer",
                              fontWeight: 800,
                            }}
                          >
                            Chiudi
                          </button>
                        )}

                        {isAdmin ? (
                          <button
                            onClick={() => deleteMovement(m.id)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 10,
                              border: "1px solid #dc2626",
                              background: "#fee2e2",
                              color: "#991b1b",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            Elimina
                          </button>
                        ) : (
                          <span style={{ opacity: 0.6 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {history.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: 12, color: "#0f172a" }}>
                        Nessun movimento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* MODAL CHIUSURA */}
          {closing && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                zIndex: 999,
              }}
              onMouseDown={(e) => {
                // chiudi cliccando fuori
                if (e.target === e.currentTarget) closeCloseModal();
              }}
            >
              <div
                style={{
                  width: "min(680px, 100%)",
                  background: "white",
                  borderRadius: 16,
                  border: "1px solid rgba(15,23,42,0.12)",
                  boxShadow: "0 30px 90px rgba(0,0,0,0.35)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ fontWeight: 950, color: "#0f172a" }}>Chiudi uscita</div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                    Codice <b>{closing.code}</b> · Magazzino <b>{closing.warehouse ?? "-"}</b> · Q.tà uscita <b>{closing.qty}</b>
                  </div>
                </div>

                <div style={{ padding: 14, display: "grid", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
                      Quantità rientrata (opzionale)
                    </label>
                    <input
                      className="input"
                      value={returnQty}
                      onChange={(e) => setReturnQty(e.target.value)}
                      inputMode="decimal"
                      placeholder="Es. 2"
                      style={{ marginTop: 6 }}
                    />
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                      Se lasci vuoto/0 → chiusura senza rientro.
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
                      Nota chiusura (opzionale)
                    </label>
                    <input
                      className="input"
                      value={closeNote}
                      onChange={(e) => setCloseNote(e.target.value)}
                      placeholder="Es. rientrati 2 pezzi"
                      style={{ marginTop: 6 }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    padding: 14,
                    borderTop: "1px solid #e5e7eb",
                    display: "flex",
                    gap: 10,
                    justifyContent: "flex-end",
                    background: "#f8fafc",
                  }}
                >
                  <button
                    className="btn"
                    onClick={closeCloseModal}
                    disabled={busyClose}
                    style={{ cursor: busyClose ? "not-allowed" : "pointer" }}
                  >
                    Annulla
                  </button>

                  <button
                    onClick={confirmClose}
                    disabled={busyClose}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid #2563eb",
                      background: "#2563eb",
                      color: "white",
                      cursor: busyClose ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      opacity: busyClose ? 0.7 : 1,
                    }}
                  >
                    {busyClose ? "Chiusura..." : "Conferma chiusura"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}