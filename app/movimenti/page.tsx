"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { BrowserMultiFormatReader } from "@zxing/browser";

type DbItem = {
  code: string;
  name: string;
  um: string | null;
};

type DbMovement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  warehouse: "PRM" | "REALE" | null;
  pending: boolean | null;
};

type WarehouseKey = "PRM" | "REALE" | "ALL";

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

// date input helper (yyyy-mm-dd)
function toIsoStartOfDay(d: string) {
  if (!d) return null;
  return new Date(`${d}T00:00:00.000`).toISOString();
}
function toIsoEndOfDay(d: string) {
  if (!d) return null;
  return new Date(`${d}T23:59:59.999`).toISOString();
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

  // storico + map code->name
  const [history, setHistory] = useState<DbMovement[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  // filtri storico
  const [fFrom, setFFrom] = useState(""); // yyyy-mm-dd
  const [fTo, setFTo] = useState("");
  const [fType, setFType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [fWarehouse, setFWarehouse] = useState<WarehouseKey>("ALL");
  const [fPending, setFPending] = useState<"ALL" | "PENDING" | "CLOSED">("ALL");

  // scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLockedRef = useRef(false);
  const lastScanRef = useRef<{ code: string; ts: number } | null>(null);

  // MODAL chiusura
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState<DbMovement | null>(null);
  const [returnQty, setReturnQty] = useState(""); // opzionale
  const [closeNote, setCloseNote] = useState(""); // opzionale
  const [busyClose, setBusyClose] = useState(false);

  function openCloseModal(m: DbMovement) {
    setClosing(m);
    setReturnQty("");
    setCloseNote("");
    setCloseOpen(true);
  }

  function closeCloseModal() {
    setCloseOpen(false);
    setClosing(null);
    setReturnQty("");
    setCloseNote("");
    setBusyClose(false);
  }

  // 🔒 può chiudere solo OUT + pending=true
  function canCloseMovement(m: DbMovement) {
    if (m.type !== "OUT") return false;
    if (!m.pending) return false; // già chiuso
    if (isAdmin) return true;
    if (userId && m.created_by && userId === m.created_by) return true;
    return false;
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
      setSuggestions([]);
      setMsg("Errore ricerca: " + ((error as any)?.message ?? "sconosciuto"));
      return;
    }

    setSuggestions((data ?? []) as DbItem[]);
  }

  async function loadHistory() {
    let q = supabase
      .from("movements")
      .select(
        "id,created_at,type,code,qty,note,created_by,created_by_name,created_by_email,warehouse,pending"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    // filtri
    const isoFrom = toIsoStartOfDay(fFrom);
    const isoTo = toIsoEndOfDay(fTo);
    if (isoFrom) q = q.gte("created_at", isoFrom);
    if (isoTo) q = q.lte("created_at", isoTo);
    if (fType !== "ALL") q = q.eq("type", fType);
    if (fWarehouse !== "ALL") q = q.eq("warehouse", fWarehouse);

    if (fPending === "PENDING") q = q.eq("pending", true);
    if (fPending === "CLOSED") q = q.eq("pending", false);

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
      setMsg("Errore storico: " + ((error as any)?.message ?? "sconosciuto"));
      return;
    }

    const rows = (data ?? []) as DbMovement[];
    setHistory(rows);

    // mappa code->name
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
      const n = (it as any).name as string | null;
      if (c) map[c] = n ?? "";
    }
    setNameMap(map);
  }

  async function pickItem(it: DbItem) {
    setPicked(it);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
    setMsg(null);

    // ✅ storico SEMPRE globale (non filtrare per codice)
    await loadHistory();

    setTimeout(() => qtyRef.current?.focus(), 50);
  }

  async function pickItemByCode(scannedCode: string) {
    const code = scannedCode.trim();
    if (!code) return;

    // anti-duplicato
    const prev = lastScanRef.current;
    const now = Date.now();
    if (prev && prev.code === code && now - prev.ts < 1500) return;
    lastScanRef.current = { code, ts: now };

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
      setMsg(`Codice "${code}" non trovato in anagrafica.`);
      setSearch(code);
      setOpen(true);
      await loadSuggestions(code);
      return;
    }

    await pickItem(item as DbItem);
  }

  async function startScan() {
    setMsg(null);
    setOpen(false);

    stopScan();
    scanLockedRef.current = false;

    setScanning(true);
    await new Promise((r) => setTimeout(r, 200));

    readerRef.current = new BrowserMultiFormatReader();

    try {
      const videoEl = videoRef.current;
      if (!videoEl) throw new Error("Video non disponibile");

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

  function clearAll() {
    stopScan();
    setSearch("");
    setOpen(false);
    setSuggestions([]);
    setPicked(null);
    setQty("");
    setNote("");
    setMsg(null);
    loadHistory();
  }

  async function save() {
    setMsg(null);

    if (!userId) return setMsg("Devi essere loggato per salvare movimenti.");
    if (!picked) return setMsg("Seleziona un materiale (scrivi per cercare o scansiona).");

    const nQty = toNumber(qty);
    if (!Number.isFinite(nQty) || nQty <= 0) return setMsg("Quantità non valida (deve essere > 0).");

    // ✅ OUT normale, ma lo salviamo "pending" finché non viene chiuso
    const pending = type === "OUT";

    const payload = {
      type,
      code: picked.code,
      qty: nQty,
      note: note.trim() || null,
      created_by: userId,
      created_by_email: userEmail,
      created_by_name: userName,
      warehouse,
      pending,
    };

    const { error } = await supabase.from("movements").insert(payload);

    if (error) return setMsg("Errore salvataggio: " + (error as any)?.message);

    setQty("");
    setNote("");
    setMsg("Movimento salvato ✅");

    // ✅ storico globale
    await loadHistory();
    setTimeout(() => qtyRef.current?.focus(), 100);
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
      console.error("DELETE error:", error);
      alert("Non posso eliminare: " + (error as any)?.message);
      return;
    }

    await loadHistory();
  }

  async function confirmClose() {
    if (!closing) return;

    // blocco: chiusura solo se pending true
    if (!closing.pending) {
      setMsg("Questo movimento è già stato chiuso.");
      closeCloseModal();
      return;
    }

    if (!canCloseMovement(closing)) {
      setMsg("Non hai i permessi per chiudere questo movimento.");
      closeCloseModal();
      return;
    }

    setBusyClose(true);
    setMsg(null);

    const ret = toNumber(returnQty || "0");
    const extraNote = closeNote.trim();

    try {
      // 1) se rientra qualcosa, aggiungiamo una IN di rientro (stesso magazzino)
      if (Number.isFinite(ret) && ret > 0) {
        const { error: eIns } = await supabase.from("movements").insert({
          type: "IN",
          code: closing.code,
          qty: ret,
          warehouse: closing.warehouse,
          pending: false,
          note: extraNote ? `Rientro parziale: ${extraNote}` : "Rientro parziale",
          created_by: userId,
          created_by_email: userEmail,
          created_by_name: userName,
        });

        if (eIns) throw eIns;
      }

      // 2) chiudiamo la OUT: pending=false + nota append (se vuoi)
      // (non tocchiamo la nota originale se non vuoi “sporcarla”)
      const { error: eUpd } = await supabase
        .from("movements")
        .update({
          pending: false,
          // opzionale: se vuoi salvare che è stata chiusa (senza mettere id in note)
          note: closing.note, // lasciamo invariata
        })
        .eq("id", closing.id)
        .eq("pending", true); // 🔒 evita richiudere 2 volte

      if (eUpd) throw eUpd;

      closeCloseModal();
      setMsg("Movimento chiuso ✅");
      await loadHistory();
    } catch (e: any) {
      console.error("confirmClose error:", e);
      setMsg("Errore chiusura: " + (e?.message ?? "sconosciuto"));
    } finally {
      setBusyClose(false);
    }
  }

  // init
  useEffect(() => {
    setReady(true);
    loadHistory();

    supabase.auth.getUser().then(async ({ data }) => {
      const email = data.user?.email ?? null;
      const uid = data.user?.id ?? null;

      setUserEmail(email);
      setUserId(uid);

      if (!uid) {
        setIsAdmin(false);
        return;
      }

      // prova a prendere nome/cognome dal profilo
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", uid)
          .maybeSingle();

        const fn = (prof as any)?.first_name?.trim?.() ?? "";
        const ln = (prof as any)?.last_name?.trim?.() ?? "";
        const full = [fn, ln].filter(Boolean).join(" ").trim();
        setUserName(full || email);
      } catch {
        setUserName(email);
      }

      const { data: isAdm, error } = await supabase.rpc("is_admin");
      if (error) {
        console.error("is_admin rpc error:", error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!isAdm);
    });

    // click fuori -> chiude dropdown
    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);

    // realtime
    const ch = supabase
      .channel("movements-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movements" },
        () => {
          // ricarica lista mantenendo filtri
          loadHistory();
        }
      )
      .subscribe();

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      stopScan();
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounce suggerimenti
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
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Movimenti</div>
        <div className="pageBarActions">
          <a className="btn" href="/giacenze">
            Giacenze
          </a>
          <a className="btn" href="/import">
            Import
          </a>
        </div>
      </div>

      {!ready ? (
        <div style={{ padding: 12 }}>Caricamento…</div>
      ) : (
        <>
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
                  <option value="PRM">PRM</option>
                  <option value="REALE">REALE</option>
                </select>
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label className="label">Stato</label>
                <select className="input" value={fPending} onChange={(e) => setFPending(e.target.value as any)}>
                  <option value="ALL">Tutti</option>
                  <option value="PENDING">Da chiudere</option>
                  <option value="CLOSED">Confermati</option>
                </select>
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
                  setFPending("ALL");
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

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label className="label" style={{ margin: 0 }}>
                  Magazzino
                </label>
                <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value as any)} style={{ width: 160 }}>
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

            {picked && (
              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.95 }}>
                <div>
                  <b>{picked.code}</b> · {picked.name}
                </div>
                <div style={{ marginTop: 4, opacity: 0.9 }}>
                  UM: <b>{picked.um ?? "-"}</b> · Magazzino selezionato: <b>{warehouse}</b>
                </div>
              </div>
            )}

            {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}
          </div>

          {/* STORICO */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Storico movimenti (ultimi)</div>

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
                  {history.map((m) => {
                    const isPending = m.type === "OUT" && !!m.pending;

                    return (
                      <tr
                        key={m.id}
                        style={{
                          background: isPending ? "#f1f5f9" : "transparent",
                          borderLeft: isPending ? "4px solid #94a3b8" : "4px solid transparent",
                        }}
                      >
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
                            m.pending ? (
                              <span
                                style={{
                                  fontSize: 12,
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  background: "#e2e8f0",
                                  color: "#334155",
                                  fontWeight: 800,
                                  whiteSpace: "nowrap",
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
                                  fontWeight: 800,
                                  whiteSpace: "nowrap",
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
                        <td>
                          {m.type === "OUT" && m.pending ? (
                            canCloseMovement(m) ? (
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
                            ) : (
                              <span style={{ opacity: 0.6 }}>—</span>
                            )
                          ) : isAdmin ? (
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
                    );
                  })}

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
          {closeOpen && closing && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 200,
                padding: 16,
              }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeCloseModal();
              }}
            >
              <div
                style={{
                  width: "min(560px, 100%)",
                  background: "white",
                  borderRadius: 16,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>Chiudi uscita</div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                    {closing.code} · {nameMap[closing.code] ?? ""} · {closing.warehouse ?? "-"}
                  </div>
                </div>

                <div style={{ padding: 14, display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 800 }}>
                    Vuoi registrare un rientro (opzionale)?
                  </div>

                  <label style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>
                    Quantità rientrata (opzionale)
                    <input
                      className="input"
                      value={returnQty}
                      onChange={(e) => setReturnQty(e.target.value)}
                      inputMode="decimal"
                      placeholder="es. 2"
                      style={{ marginTop: 6 }}
                    />
                  </label>

                  <label style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>
                    Nota chiusura (opzionale)
                    <input
                      className="input"
                      value={closeNote}
                      onChange={(e) => setCloseNote(e.target.value)}
                      placeholder="es. rientro parziale / note"
                      style={{ marginTop: 6 }}
                    />
                  </label>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
                    <button
                      onClick={closeCloseModal}
                      className="btn"
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                        color: "#0f172a",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                      disabled={busyClose}
                    >
                      Annulla
                    </button>

                    <button
                      onClick={confirmClose}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid #2563eb",
                        background: "#dbeafe",
                        color: "#1e40af",
                        fontWeight: 900,
                        cursor: "pointer",
                        opacity: busyClose ? 0.7 : 1,
                      }}
                      disabled={busyClose}
                    >
                      {busyClose ? "Salvo..." : "Conferma chiusura"}
                    </button>
                  </div>

                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Dopo la chiusura lo stato diventa <b>Confermato</b> e non sarà più richiudibile.
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}