"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "./_lib/supabase/client";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Movement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by_email: string | null;
};

type DbItem = {
  code: string;
  name: string;
  um: string | null;
  warehouse: string | null;
  warehouse_desc: string | null;
  initial_qty: number | null;
};

function isSameDay(d: Date, ref: Date) {
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export default function Home() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [itemsCount, setItemsCount] = useState<number>(0);
  const [movements, setMovements] = useState<Movement[]>([]);

  // ---------- SEARCH ----------
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<DbItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [picked, setPicked] = useState<DbItem | null>(null);
  const [stock, setStock] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);

  // ---------- SCANNER ----------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLockedRef = useRef(false);

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

  async function pickItem(it: DbItem) {
    setPicked(it);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
    setMsg(null);
    await computeStockFor(it.code);
  }

  async function pickItemByCode(codeRaw: string) {
    const code = codeRaw.trim();
    if (!code) return;

    setMsg(null);
    setOpen(false);
    setSearch(code);

    const { data: item, error } = await supabase
      .from("items")
      .select("code,name,um,warehouse,warehouse_desc,initial_qty")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error(error);
      setMsg("Errore ricerca articolo: " + error.message);
      setPicked(null);
      setStock(null);
      return;
    }

    if (!item) {
      setMsg(`Codice "${code}" non trovato in anagrafica.`);
      setPicked(null);
      setStock(null);
      setOpen(true);
      await loadSuggestions(code);
      return;
    }

    await pickItem(item as DbItem);
  }

  async function startScan() {
  setMsg(null);
  setOpen(false);

  // sblocca per una nuova scansione
  scanLockedRef.current = false;

  // accendi UI
  setScanning(true);

  // aspetta che il <video> sia renderizzato
  await new Promise((r) => setTimeout(r, 150));

  // ✅ IMPORTANTISSIMO: reader nuovo ad ogni start
  readerRef.current = new BrowserMultiFormatReader();

  // ✅ ignora i primi frame (spesso contengono un risultato vecchio)
  const ignoreUntil = Date.now() + 600;

  try {
    const videoEl = videoRef.current;
    if (!videoEl) throw new Error("Video non disponibile");

    await readerRef.current.decodeFromVideoDevice(undefined, videoEl, async (result) => {
      if (!result) return;

      // ignora risultati subito dopo l'avvio
      if (Date.now() < ignoreUntil) return;

      // evita doppie letture
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
  // ✅ chiudi decoder (compatibile con versioni diverse)
  try {
    (readerRef.current as any)?.reset?.();
  } catch {}
  try {
    (readerRef.current as any)?.stopContinuousDecode?.();
  } catch {}

  // ✅ spegni proprio la camera
  try {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
  } catch {}

  // ✅ IMPORTANTISSIMO: rilascia il reader (così al prossimo start è fresco)
  readerRef.current = null;

  setScanning(false);
}

  function resetSearch() {
  stopScan();

  // ✅ QUESTO è quello che devi aggiungere
  scanLockedRef.current = false;

  setSearch("");
  setSuggestions([]);
  setPicked(null);
  setStock(null);
  setOpen(false);
  setMsg(null);
}

  // Load dashboard data
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const { count: cItems, error: eItems } = await supabase
        .from("items")
        .select("code", { count: "exact", head: true });

      const { data: movs, error: eMovs } = await supabase
        .from("movements")
        .select("id,created_at,type,code,qty,note,created_by_email")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!alive) return;

      if (eItems) console.error(eItems);
      if (eMovs) console.error(eMovs);

      setItemsCount(cItems ?? 0);
      setMovements((movs ?? []) as Movement[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
      stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chiudi dropdown cliccando fuori
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Debounce suggerimenti
  useEffect(() => {
    setActiveIndex(0);
    if (!open) return;

    const t = setTimeout(() => {
      loadSuggestions(search);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const today = new Date();
  const movementsToday = useMemo(
    () => movements.filter((m) => isSameDay(new Date(m.created_at), today)).length,
    [movements]
  );

  const lastMovement = movements[0] ?? null;
  const last10 = movements.slice(0, 10);
  const active = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  return (
    <div>
      

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <div style={{ opacity: 0.85, marginTop: 6 }}>
            Panoramica rapida di anagrafica e operatività.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn btnPrimary" href="/movimenti">
            ➕/➖ Nuovo movimento
          </a>
          <a className="btn" href="/giacenze">
            📦 Vai a giacenze
          </a>
        </div>
      </div>

      {/* ✅ CERCA MATERIALE + BARCODE */}
      <div className="glass" style={{ marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>🔎 Cerca materiale</div>
            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
              Cerca per codice/descrizione oppure scansiona il barcode.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => (scanning ? stopScan() : startScan())}>
              {scanning ? "⏹ Ferma scansione" : "📷 Scansiona barcode"}
            </button>
            <button className="btn" onClick={resetSearch}>
              Pulisci
            </button>
          </div>
        </div>

        <div ref={boxRef} style={{ position: "relative", marginTop: 12 }}>
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
            placeholder="Es. 12345 oppure bullone..."
            style={{ width: "100%" }}
          />

          {open && search.trim() && (
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
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
              Inquadra il codice a barre con la fotocamera.
            </div>
          </div>
        )}

        {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}

        {picked && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
            <div style={{ gridColumn: "span 6" }} className="glass">
              <div style={{ opacity: 0.85, fontSize: 12 }}>Materiale</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{picked.code}</div>
              <div style={{ opacity: 0.9, marginTop: 6 }}>{picked.name}</div>
            </div>

            <div style={{ gridColumn: "span 3" }} className="glass">
              <div style={{ opacity: 0.85, fontSize: 12 }}>Magazzino</div>
              <div style={{ fontSize: 14, fontWeight: 900, marginTop: 8 }}>
                {[picked.warehouse, picked.warehouse_desc].filter(Boolean).join(" - ") || "-"}
              </div>
              <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>
                UM: <b>{picked.um ?? "-"}</b>
              </div>
            </div>

            <div style={{ gridColumn: "span 3" }} className="glass">
              <div style={{ opacity: 0.85, fontSize: 12 }}>Giacenza attuale</div>
              <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>
                {stock === null ? "…" : stock}
              </div>
              <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>
                (iniziale {picked.initial_qty ?? 0} + movimenti)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginTop: 14 }}>
        <div className="glass" style={{ gridColumn: "span 4" }}>
          <div style={{ opacity: 0.85, fontSize: 12 }}>Materiali</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
            {loading ? "…" : itemsCount}
          </div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>Codici in anagrafica</div>
        </div>

        <div className="glass" style={{ gridColumn: "span 4" }}>
          <div style={{ opacity: 0.85, fontSize: 12 }}>Movimenti oggi</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
            {loading ? "…" : movementsToday}
          </div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>
            Entrate/uscite registrate oggi
          </div>
        </div>

        <div className="glass" style={{ gridColumn: "span 4" }}>
          <div style={{ opacity: 0.85, fontSize: 12 }}>Ultimo movimento</div>
          <div style={{ marginTop: 8, fontWeight: 800 }}>
            {loading
              ? "…"
              : lastMovement
              ? `${lastMovement.code} · ${lastMovement.type === "IN" ? "Entrata" : "Uscita"}`
              : "—"}
          </div>
          <div style={{ opacity: 0.85, fontSize: 12, marginTop: 6 }}>
            {loading ? "" : lastMovement ? fmtDate(lastMovement.created_at) : ""}
          </div>
        </div>
      </div>

      {/* Ultimi movimenti */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Ultimi movimenti</h2>
          <a className="btn" href="/movimenti">Vedi tutto</a>
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Codice</th>
                <th>Q.tà</th>
                <th>Note</th>
                <th>Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#0f172a" }}>
                    Caricamento…
                  </td>
                </tr>
              ) : last10.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#0f172a" }}>
                    Nessun movimento.
                  </td>
                </tr>
              ) : (
                last10.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.created_at)}</td>
                    <td>
                      <span className={`badge ${m.type === "IN" ? "badgeIn" : "badgeOut"}`}>
                        {m.type === "IN" ? "Entrata" : "Uscita"}
                      </span>
                    </td>
                    <td>{m.code}</td>
                    <td>{m.type === "IN" ? "+" : "-"}{m.qty}</td>
                    <td>{m.note ?? ""}</td>
                    <td>{m.created_by_email ?? "-"}</td>
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
  );
}