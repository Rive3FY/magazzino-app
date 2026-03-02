"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { BrowserMultiFormatReader } from "@zxing/browser";

type DbItem = {
  code: string;
  name: string;
  um: string | null;
  warehouse: string | null;
  warehouse_desc: string | null;
  initial_qty: number | null;
};

type DbMovement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by_email: string | null;
  created_by_name: string | null; // ✅
  warehouse: string | null;
};

type WarehouseOpt = { key: string; label: string };

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
  const [isAdmin, setIsAdmin] = useState(false);

  // movimento form
  const [type, setType] = useState<"IN" | "OUT">("IN");
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
  const [stock, setStock] = useState<number | null>(null);

  // storico
  const [history, setHistory] = useState<DbMovement[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  // filtri storico
  const [fFrom, setFFrom] = useState(""); // yyyy-mm-dd
  const [fTo, setFTo] = useState("");
  const [fType, setFType] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [fWarehouse, setFWarehouse] = useState<string>("ALL");
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);

  // scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLockedRef = useRef(false);
  const lastScanRef = useRef<{ code: string; ts: number } | null>(null);

  async function loadSuggestions(text: string) {
    const s = text.trim();
    if (!s) {
      setSuggestions([]);
      return;
    }

    const { data, error } = await supabase
      .from("items")
      .select("code,name,um,warehouse,warehouse_desc,initial_qty")
      .or(`code.ilike.%${s}%,name.ilike.%${s}%`)
      .order("code", { ascending: true })
      .limit(12);

    if (error) {
      console.error(error);
      setSuggestions([]);
      return;
    }

    setSuggestions((data ?? []) as DbItem[]);
  }

  async function computeStockFor(code: string) {
    const { data: item, error: e1 } = await supabase
      .from("items")
      .select("initial_qty")
      .eq("code", code)
      .single();

    if (e1) {
      console.error(e1);
      setStock(null);
      return;
    }

    const initial = Number((item as any)?.initial_qty ?? 0);

    const { data: movs, error: e2 } = await supabase
      .from("movements")
      .select("type,qty")
      .eq("code", code);

    if (e2) {
      console.error(e2);
      setStock(initial);
      return;
    }

    let delta = 0;
    for (const m of movs ?? []) {
      const v = Number((m as any).qty ?? 0);
      delta += (m as any).type === "IN" ? v : -v;
    }

    setStock(initial + delta);
  }

  async function loadWarehouses() {
    const { data, error } = await supabase.from("items").select("warehouse,warehouse_desc").limit(1000);

    if (error) {
      console.error("loadWarehouses:", error);
      setWarehouses([]);
      return;
    }

    const map = new Map<string, string>();
    for (const r of data ?? []) {
      const w = (r as any).warehouse as string | null;
      const d = (r as any).warehouse_desc as string | null;
      if (!w) continue;
      const label = [w, d].filter(Boolean).join(" - ");
      map.set(w, label || w);
    }

    const opts: WarehouseOpt[] = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, label]) => ({ key, label }));

    setWarehouses(opts);
  }

  async function loadHistory(code?: string) {
    let q = supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,created_by_email,created_by_name,warehouse") // ✅
      .order("created_at", { ascending: false })
      .limit(200);

    if (code) q = q.eq("code", code);

    // filtri
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
      return;
    }

    const rows = (data ?? []) as DbMovement[];
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

    await computeStockFor(it.code);
    await loadHistory(it.code);

    setTimeout(() => qtyRef.current?.focus(), 50);
  }

  async function pickItemByCode(scannedCode: string) {
    const code = scannedCode.trim();
    if (!code) return;

    const prev = lastScanRef.current;
    const now = Date.now();
    if (prev && prev.code === code && now - prev.ts < 1500) return;
    lastScanRef.current = { code, ts: now };

    setType("OUT");
    setQty("");
    setMsg(null);

    const { data: item, error } = await supabase
      .from("items")
      .select("code,name,um,warehouse,warehouse_desc,initial_qty")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("pickItemByCode error:", error);
      setMsg("Errore ricerca articolo: " + error.message);
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

    setTimeout(() => {
      const ae = document.activeElement as HTMLElement | null;
      const typing = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
      if (!typing) qtyRef.current?.focus();
    }, 120);
  }

  async function startScan() {
    setMsg(null);
    setOpen(false);

    scanLockedRef.current = false;

    setScanning(true);
    await new Promise((r) => setTimeout(r, 120));

    readerRef.current = new BrowserMultiFormatReader();
    const ignoreUntil = Date.now() + 600;

    try {
      const videoEl = videoRef.current;
      if (!videoEl) throw new Error("Video non disponibile");

      await readerRef.current.decodeFromVideoDevice(undefined, videoEl, async (result) => {
        if (!result) return;
        if (Date.now() < ignoreUntil) return;
        if (scanLockedRef.current) return;

        scanLockedRef.current = true;
        const text = result.getText();

        stopScan();
        await pickItemByCode(text);
      });
    } catch (e: any) {
      console.error(e);
      setMsg("Errore camera/scansione: " + (e?.message ?? "sconosciuto"));
      setScanning(false);
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
    setStock(null);
    setQty("");
    setNote("");
    setMsg(null);
    loadHistory();
  }

  async function save() {
    setMsg(null);

    if (!userId) return setMsg("Devi essere loggato per salvare movimenti.");
    if (!picked) return setMsg("Seleziona un materiale (scrivi per cercare o scansiona).");

    const n = toNumber(qty);
    if (!Number.isFinite(n) || n <= 0) return setMsg("Quantità non valida (deve essere > 0).");

    if (type === "OUT") {
      const current = stock ?? 0;
      if (current - n < 0) return setMsg(`Uscita non possibile: giacenza ${current} → diventerebbe ${current - n}.`);
    }

    const wh = picked.warehouse ?? "UNKNOWN";

    // ✅ prende Nome Cognome dalla tabella profiles
    let createdByName: string | null = null;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", userId)
        .maybeSingle();

      const first = profile?.first_name?.trim() ?? "";
      const last = profile?.last_name?.trim() ?? "";
      const full = `${first} ${last}`.trim();
      if (full) createdByName = full;
    } catch {}

    if (!createdByName) createdByName = userEmail; // fallback

    const { error } = await supabase.from("movements").insert({
      type,
      code: picked.code,
      qty: n,
      note: note.trim() || null,
      created_by: userId,
      created_by_email: userEmail,
      created_by_name: createdByName, // ✅
      warehouse: wh,
    });

    if (error) return setMsg("Errore salvataggio: " + error.message);

    setQty("");
    setNote("");
    setMsg("Movimento salvato ✅");

    await computeStockFor(picked.code);
    await loadHistory(picked.code);

    setTimeout(() => qtyRef.current?.focus(), 100);
  }

  async function deleteMovement(id: string) {
    if (!isAdmin) return alert("Solo l'admin può eliminare i movimenti.");

    const ok = confirm("Eliminare questo movimento?");
    if (!ok) return;

    const { error } = await supabase.from("movements").delete().eq("id", id);
    if (error) return alert("Non posso eliminare: " + error.message);

    if (picked) {
      await computeStockFor(picked.code);
      await loadHistory(picked.code);
    } else {
      await loadHistory();
    }
  }

  // init
  useEffect(() => {
    setReady(true);
    loadWarehouses();
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

      const { data: isAdm, error } = await supabase.rpc("is_admin");
      if (error) {
        console.error("is_admin rpc error:", error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!isAdm);
    });
    // 🔹 REALTIME MOVEMENTS (NUOVO BLOCCO)
useEffect(() => {
  const channel = supabase
    .channel("movements-live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "movements" },
      async () => {
        await loadHistory(picked?.code);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "movements" },
      async () => {
        await loadHistory(picked?.code);
      }
    )
    .subscribe((status) => {
      console.log("Realtime status:", status);
    });

  return () => {
    supabase.removeChannel(channel);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [picked?.code, fFrom, fTo, fType, fWarehouse]);

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

              <div style={{ gridColumn: "span 4" }}>
                <label className="label">Magazzino</label>
                <select className="input" value={fWarehouse} onChange={(e) => setFWarehouse(e.target.value)}>
                  <option value="ALL">Tutti</option>
                  {warehouses.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => loadHistory(picked?.code)}>
                Applica filtri
              </button>
              <button
                className="btn"
                onClick={() => {
                  setFFrom("");
                  setFTo("");
                  setFType("ALL");
                  setFWarehouse("ALL");
                  setTimeout(() => loadHistory(picked?.code), 0);
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
                <div style={{ marginTop: 4 }}>
                  Magazzino: <b>{[picked.warehouse, picked.warehouse_desc].filter(Boolean).join(" - ") || "-"}</b> · UM:{" "}
                  <b>{picked.um ?? "-"}</b> · Iniziale: <b>{picked.initial_qty ?? 0}</b> · Giacenza: <b>{stock ?? 0}</b>
                </div>
              </div>
            )}

            {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}
          </div>

          {/* STORICO */}
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Storico movimenti {picked ? `(solo ${picked.code})` : "(ultimi)"}</div>
              <button className="btn" onClick={() => loadHistory(picked?.code)}>
                Aggiorna
              </button>
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
                    <th>Azioni</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtDate(m.created_at)}</td>
                      <td>
                        <span className={`badge ${m.type === "IN" ? "badgeIn" : "badgeOut"}`}>{m.type === "IN" ? "Entrata" : "Uscita"}</span>
                      </td>
                      <td>{m.code}</td>
                      <td>{nameMap[m.code] ?? "-"}</td>
                      <td>{m.warehouse ?? "-"}</td>
                      <td>
                        {m.type === "IN" ? "+" : "-"}
                        {m.qty}
                      </td>
                      <td>{m.note ?? ""}</td>

                      {/* ✅ QUI MOSTRA NOME */}
                      <td>{m.created_by_name ?? m.created_by_email ?? "-"}</td>

                      <td>
                        {isAdmin ? (
                          <button className="btn" onClick={() => deleteMovement(m.id)}>
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
                      <td colSpan={9} style={{ padding: 12, color: "#0f172a" }}>
                        Nessun movimento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}