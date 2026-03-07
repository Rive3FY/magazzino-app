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
  created_by_name: string | null;
  warehouse: "PRM" | "REALE" | null;
};

type DbItem = {
  code: string;
  name: string;
  um: string | null;
};

type DbStock = {
  code: string;
  warehouse: "PRM" | "REALE";
  excel: any;
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

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

type StockBoth = { PRM: number; REALE: number };

function whereLabel(st: StockBoth) {
  const a = st.PRM > 0;
  const b = st.REALE > 0;
  if (a && b) return "Entrambi";
  if (a) return "PRM";
  if (b) return "REALE";
  return "Nessuno";
}

export default function Home() {
  const supabase = createClient();

  // dashboard data
  const [loading, setLoading] = useState(true);
  const [itemsCount, setItemsCount] = useState<number>(0);
  const [movements, setMovements] = useState<Movement[]>([]);

  // search
  const [warehouseFilter, setWarehouseFilter] = useState<"ALL" | "PRM" | "REALE">("ALL");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<DbItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [picked, setPicked] = useState<DbItem | null>(null);
  const [stock, setStock] = useState<StockBoth | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);

  // scanner
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
      .select("code,name,um")
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

  async function computeStockBoth(code: string) {
    // base stock (item_stocks)
    const { data: base, error: eBase } = await supabase
      .from("item_stocks")
.select("code,warehouse,excel")
      .eq("code", code);

    if (eBase) {
      console.error("item_stocks error:", eBase);
      setStock(null);
      return;
    }

    let basePRM = 0;
let baseREALE = 0;

for (const r of (base ?? []) as DbStock[]) {
  const q = Number(r.excel?.["Qnt. a Mag. libero"] ?? 0);

  if (r.warehouse === "PRM") basePRM = q;
  if (r.warehouse === "REALE") baseREALE = q;
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
      const wh = (m as any).warehouse as "PRM" | "REALE" | null;
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
  }

  async function pickItemByCode(codeRaw: string) {
    const code = codeRaw.trim();
    if (!code) return;

    const { data: item, error } = await supabase
      .from("items")
      .select("code,name,um")
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
    setStock(null);
    setOpen(false);
    setMsg(null);
    setActiveIndex(0);
  }

  // dashboard load
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const { count: cItems, error: eItems } = await supabase
        .from("items")
        .select("code", { count: "exact", head: true });

      const { data: movs, error: eMovs } = await supabase
        .from("movements")
        .select("id,created_at,type,code,qty,note,created_by_name,warehouse")
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

  // close dropdown when clicking outside
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
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

  // Applica filtro magazzino ai suggerimenti (in memoria, non cambia query DB)
  const filteredSuggestions = useMemo(() => {
    if (warehouseFilter === "ALL") return suggestions;

    // se l’utente filtra PRM/REALE, facciamo un filtro "soft":
    // mostriamo comunque i suggerimenti, ma quando seleziona calcoliamo e poi gli diciamo “nessuna giacenza” se è vuoto.
    // (Evitiamo 12 query extra per ogni battuta di tastiera.)
    return suggestions;
  }, [suggestions, warehouseFilter]);

  const active = useMemo(() => filteredSuggestions[activeIndex], [filteredSuggestions, activeIndex]);

  const today = new Date();
  const movementsToday = useMemo(
    () => movements.filter((m) => isSameDay(new Date(m.created_at), today)).length,
    [movements]
  );

  const lastMovement = movements[0] ?? null;
  const last10 = movements.slice(0, 10);

  // label “dove” solo se ho già stock
  const where = stock ? whereLabel(stock) : "";

  // quando ho stock e filtro magazzino, mostro un messaggio “coerente”
  const filterHint = useMemo(() => {
    if (!picked || !stock) return null;

    if (warehouseFilter === "PRM" && stock.PRM <= 0) return "⚠️ In PRM non c’è giacenza.";
    if (warehouseFilter === "REALE" && stock.REALE <= 0) return "⚠️ In REALE non c’è giacenza.";
    return null;
  }, [picked, stock, warehouseFilter]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <div style={{ opacity: 0.85, marginTop: 6 }}>Panoramica rapida di anagrafica e operatività.</div>
        </div>

        
      </div>

      {/* ✅ CERCA MATERIALE + BARCODE */}
      <div className="glass" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}> Controllo veloce materiale</div>
            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
              Cerca per codice/descrizione o scansiona. Vedi subito PRM / REALE e dove si trova.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="input"
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value as any)}
              style={{ width: 170 }}
              aria-label="Filtro magazzino"
            >
              <option value="ALL">Tutti i magazzini</option>
              <option value="PRM">Solo PRM</option>
              <option value="REALE">Solo REALE</option>
            </select>

            

            
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
                setActiveIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
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
              {filteredSuggestions.length === 0 ? (
                <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
              ) : (
                filteredSuggestions.map((it, idx) => (
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
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>{it.code}</div>
                      <div style={{ fontSize: 12, color: "#334155" }}>{it.name}</div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8, color: "#0f172a" }}>
                      ↵ seleziona
                    </div>
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

        {picked && stock && (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div className="glass">
                <div style={{ opacity: 0.85, fontSize: 12 }}>Materiale</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{picked.code}</div>
                <div style={{ opacity: 0.9, marginTop: 6 }}>{picked.name}</div>
                <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>
                  UM: <b>{picked.um ?? "-"}</b> · Dove: <b>{where}</b>
                </div>
              </div>

              <div className="glass">
                <div style={{ opacity: 0.85, fontSize: 12 }}>PRM</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stock.PRM}</div>
              </div>

              <div className="glass">
                <div style={{ opacity: 0.85, fontSize: 12 }}>REALE</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stock.REALE}</div>
              </div>
            </div>

            {filterHint && (
              <div style={{ marginTop: 10, fontWeight: 800 }}>{filterHint}</div>
            )}
          </div>
        )}
      </div>

      {/* KPI */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 14,
        }}
      >
        <div className="glass">
          <div style={{ opacity: 0.85, fontSize: 12 }}>Materiali</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
            {loading ? "…" : itemsCount}
          </div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>Codici in anagrafica</div>
        </div>

        <div className="glass">
          <div style={{ opacity: 0.85, fontSize: 12 }}>Movimenti oggi</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
            {loading ? "…" : movementsToday}
          </div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>
            Entrate/uscite registrate oggi
          </div>
        </div>

        <div className="glass">
          <div style={{ opacity: 0.85, fontSize: 12 }}>Ultimo movimento</div>
          <div style={{ marginTop: 8, fontWeight: 800 }}>
            {loading
              ? "…"
              : lastMovement
              ? `${lastMovement.code} · ${lastMovement.type === "IN" ? "Entrata" : "Uscita"} · ${lastMovement.warehouse ?? "-"}`
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
          <a className="btn btnPrimary" href="/movimenti">Vedi tutto</a>
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Codice</th>
                <th>Magazzino</th>
                <th>Q.tà</th>
                <th>Note</th>
                <th>Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, color: "#0f172a" }}>
                    Caricamento…
                  </td>
                </tr>
              ) : last10.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 12, color: "#0f172a" }}>
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
                    <td>{m.warehouse ?? "-"}</td>
                    <td>
                      {m.type === "IN" ? "+" : "-"}
                      {m.qty}
                    </td>
                    <td>{m.note ?? ""}</td>
                    <td>{m.created_by_name ?? "-"}</td>
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