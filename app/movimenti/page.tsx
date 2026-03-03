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

  // chiusura/rettifica
  status: "OPEN" | "CLOSED" | null;
  returned_qty: number | null;
  return_note: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

type WarehouseOpt = { key: "PRM" | "REALE"; label: string };

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

/** Pill “aziendali” uguali, cambiano solo colore */
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

  if (kind === "OPEN") return { ...base, borderColor: "rgba(148,163,184,0.55)", background: "rgba(148,163,184,0.18)" };
  if (kind === "CLOSED") return { ...base, borderColor: "rgba(59,130,246,0.45)", background: "rgba(59,130,246,0.10)" };

  // PRM/REALE: colori “neutri” per non confondere con IN/OUT
  if (kind === "PRM") return { ...base, borderColor: "rgba(2,132,199,0.45)", background: "rgba(2,132,199,0.10)" };
  return { ...base, borderColor: "rgba(99,102,241,0.45)", background: "rgba(99,102,241,0.10)" };
}

export default function MovimentiPage() {
  const supabase = createClient();

  // auth
  const [userId, setUserId] = useState<string | null>(null);
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

  const [fFrom, setFFrom] = useState(""); // yyyy-mm-dd
  const [fTo, setFTo] = useState("");
  const [fType, setFType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [fWarehouse, setFWarehouse] = useState<"ALL" | "PRM" | "REALE">("ALL");

  const warehouses: WarehouseOpt[] = useMemo(
    () => [
      { key: "PRM", label: "PRM" },
      { key: "REALE", label: "REALE" },
    ],
    []
  );

  // scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLockedRef = useRef(false);

  // dettaglio “chiusura”
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [closingBusy, setClosingBusy] = useState(false);

  function canEditRow(m: MovementRow) {
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
      .select(
        "id,created_at,type,code,qty,note,warehouse,created_by,created_by_name,status,returned_qty,return_note,closed_at,closed_by"
      )
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
      setMsg("Errore caricamento storico (loadHistory).");
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

  async function save() {
    setMsg(null);

    if (!userId) return setMsg("Devi essere loggato per salvare movimenti.");
    if (!picked) return setMsg("Seleziona un materiale (scrivi per cercare o scansiona).");

    const q = toNumber(qty);
    if (!Number.isFinite(q) || q <= 0) return setMsg("Quantità non valida (deve essere > 0).");

    const payload: Partial<MovementRow> = {
      type,
      code: picked.code,
      qty: q,
      note: note.trim() || null,
      created_by: userId,
      warehouse,

      // stato: entrate chiuse, uscite aperte
      status: type === "OUT" ? "OPEN" : "CLOSED",
      returned_qty: type === "OUT" ? 0 : null,
      return_note: null,
      closed_at: type === "OUT" ? null : new Date().toISOString(),
      closed_by: type === "OUT" ? null : userId,
    };

    const { error } = await supabase.from("movements").insert(payload as any);
    if (error) return setMsg("Errore salvataggio: " + (error as any)?.message);

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

    const { error } = await supabase.from("movements").delete().eq("id", id);
    if (error) return alert("Non posso eliminare: " + (error as any)?.message);

    if (expandedId === id) setExpandedId(null);

    await loadHistory();
  }

  function openDetail(m: MovementRow) {
    // toggle
    setExpandedId((prev) => (prev === m.id ? null : m.id));

    // prepara input
    setReturnQty(String(n(m.returned_qty)));
    setReturnNote(m.return_note ?? "");
  }

  async function confirmClose(m: MovementRow) {
    if (closingBusy) return;

    const st = (m.status ?? (m.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
    if (m.type !== "OUT") return;
    if (st === "CLOSED") return; // anti richiusura

    const outQty = n(m.qty);
    const r = toNumber(returnQty);

    if (!Number.isFinite(r) || r < 0) {
      setMsg("Quantità rientro non valida (>= 0).");
      return;
    }
    if (r > outQty) {
      setMsg(`Il rientro non può superare l’uscita (${outQty}).`);
      return;
    }

    setClosingBusy(true);
    setMsg(null);

    const updatePayload = {
      returned_qty: r,
      return_note: (returnNote ?? "").trim() || null,
      status: "CLOSED",
      closed_at: new Date().toISOString(),
      closed_by: userId ?? null,
    };

    const { error } = await supabase.from("movements").update(updatePayload as any).eq("id", m.id);

    if (error) {
      setClosingBusy(false);
      setMsg("Errore chiusura: " + (error as any)?.message);
      return;
    }

    // ✅ aggiorna immediato la UI (sparisce “APERTO” e sparisce il dettaglio)
    setHistory((prev) =>
      prev.map((row) => (row.id === m.id ? ({ ...row, ...updatePayload } as MovementRow) : row))
    );

    setMsg("Movimento chiuso ✅");
    setExpandedId(null);
    setClosingBusy(false);

    // 🔁 allinea al server (per sicurezza)
    await loadHistory();
  }

  // init
  useEffect(() => {
    loadHistory();

    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);

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
    });

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
    const t = setTimeout(() => {
      if (open) loadSuggestions(search);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  // se cambi toggle onlyPicked ricarico
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

      {/* FILTRI STORICO */}
      <div className="filtersRow" style={{ padding: 12 }}>
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
              {warehouses.map((w) => (
                <option key={w.key} value={w.key}>{w.label}</option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label className="label">Vista</label>
            <button
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
          <button className="btn" onClick={() => loadHistory()}>Applica filtri</button>
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

          <div style={{ marginLeft: "auto", opacity: 0.75, fontSize: 12, alignSelf: "center" }}>
            Permessi: {isAdmin ? "Admin" : "Operatore"}
          </div>
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
            <select
              className="input"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value as any)}
              style={{ width: 140 }}
              aria-label="Magazzino movimento"
            >
              <option value="PRM">PRM</option>
              <option value="REALE">REALE</option>
            </select>

            <span style={{ opacity: 0.8, fontSize: 12 }}>Magazzino movimento</span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => (scanning ? stopScan() : startScan())}>
              {scanning ? "Chiudi camera" : "Scanner"}
            </button>
            <button className="btn" type="button" onClick={resetSearch}>
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
            <label className="label">Note (opz.)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="DDT / commessa / cliente" />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <label className="label">Quantità</label>
            <input ref={qtyRef} className="input" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="es. 5" />
          </div>

          <div style={{ gridColumn: "span 1", display: "flex", alignItems: "end" }}>
            <button className="btn btnPrimary" onClick={save} style={{ width: "100%" }}>
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
                  <td colSpan={12} style={{ padding: 12, color: "#0f172a" }}>
                    Nessun movimento.
                  </td>
                </tr>
              ) : (
                history.map((m) => {
                  const st = (m.status ?? (m.type === "OUT" ? "OPEN" : "CLOSED")) as "OPEN" | "CLOSED";
                  const isOpenOut = m.type === "OUT" && st === "OPEN";
                  const net = m.type === "OUT" ? Math.max(0, n(m.qty) - n(m.returned_qty)) : null;

                  return (
                    <React.Fragment key={m.id}>
                      <tr
                        onClick={() => {
                          if (!canEditRow(m)) return;
                          openDetail(m);
                        }}
                        style={{
                          cursor: canEditRow(m) ? "pointer" : "default",
                          background: isOpenOut ? "rgba(148,163,184,0.18)" : "transparent",
                        }}
                        title={canEditRow(m) ? "Clicca per dettaglio / chiusura" : ""}
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

                      {/* DETTAGLIO */}
                      {expandedId === m.id && canEditRow(m) && (
                        <tr>
                          <td colSpan={12} style={{ padding: 12, background: "rgba(255,255,255,0.70)" }}>
                            <div
                              style={{
                                border: "1px solid rgba(15,23,42,0.14)",
                                borderRadius: 14,
                                padding: 12,
                                background: "rgba(255,255,255,0.85)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                                <div style={{ fontWeight: 900, color: "#0f172a" }}>
                                  Chiusura uscita · <span style={{ opacity: 0.8 }}>{m.code}</span>
                                </div>

                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                  <button
                                    className="btn"
                                    onClick={() => {
                                      setExpandedId(null);
                                    }}
                                    type="button"
                                    disabled={closingBusy}
                                  >
                                    Annulla
                                  </button>

                                  <button
                                    className="btn btnPrimary"
                                    onClick={() => confirmClose(m)}
                                    type="button"
                                    disabled={closingBusy}
                                  >
                                    {closingBusy ? "Chiusura..." : "Chiudi"}
                                  </button>
                                </div>
                              </div>

                              <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 10 }}>
                                <div style={{ gridColumn: "span 3" }}>
                                  <label className="label" style={{ color: "#0f172a" }}>
                                    Quantità uscita
                                  </label>
                                  <input className="input" value={String(n(m.qty))} disabled />
                                </div>

                                <div style={{ gridColumn: "span 3" }}>
                                  <label className="label" style={{ color: "#0f172a" }}>
                                    Quantità rientro
                                  </label>
                                  <input
                                    className="input"
                                    value={returnQty}
                                    onChange={(e) => setReturnQty(e.target.value)}
                                    inputMode="decimal"
                                    placeholder="0"
                                  />
                                </div>

                                <div style={{ gridColumn: "span 6" }}>
                                  <label className="label" style={{ color: "#0f172a" }}>
                                    Nota rientro (opz.)
                                  </label>
                                  <input
                                    className="input"
                                    value={returnNote}
                                    onChange={(e) => setReturnNote(e.target.value)}
                                    placeholder="Esempio: rientrati 2 pezzi"
                                  />
                                </div>
                              </div>

                              <div style={{ marginTop: 10, fontSize: 12, color: "#0f172a", opacity: 0.8 }}>
                                Dopo la chiusura lo stato passa a <b>CHIUSO</b> e non sarà più modificabile.
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}