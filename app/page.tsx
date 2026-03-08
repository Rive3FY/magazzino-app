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

type ShelfInfo = {
  PRM: string;
  REALE: string;
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

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
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
  const [shelves, setShelves] = useState<ShelfInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);

  // scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);

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
    const { data: liveRows, error: eLive } = await supabase
      .from("excel_live")
      .select("warehouse,qty_free,row_json")
      .eq("code", code);

    if (eLive) {
      console.error("excel_live error:", eLive);
      setStock(null);
      setShelves(null);
      return;
    }

    let prmQty = 0;
    let realeQty = 0;
    for (const r of liveRows ?? []) {
      const wh = (r as any).warehouse;
      const q = Number.isFinite(Number((r as any).qty_free))
        ? n((r as any).qty_free)
        : n((r as any).row_json?.["Qnt. a Mag. libero"]);
      if (wh === "PRM") prmQty = q;
      if (wh === "REALE") realeQty = q;
    }

    setStock({ PRM: prmQty, REALE: realeQty });

    const { data: shelfRows } = await supabase
      .from("material_shelves")
      .select("warehouse,shelf,place")
      .eq("code", code);

    const shelfMap: ShelfInfo = { PRM: "", REALE: "" };
    for (const s of shelfRows ?? []) {
      const wh = (s as any).warehouse;
      const sh = (s as any).shelf ?? "";
      const pl = ((s as any).place ?? "").trim();
      const display = [sh, pl].filter(Boolean).join(" · ");
      if (wh === "PRM") shelfMap.PRM = display;
      if (wh === "REALE") shelfMap.REALE = display;
    }
    setShelves(shelfMap);
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
      if (text) await pickItemByCode(text);
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
    setShelves(null);
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

  useEffect(() => {
    setIsNfcSupported(typeof (window as any).NDEFReader !== "undefined");
  }, []);

  async function startNfcScan() {
    if (!isNfcSupported) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setMsg(
        isIOS
          ? "NFC non disponibile su iPhone/iPad. Usa barcode o ricerca manuale."
          : "NFC richiede Chrome su Android con HTTPS. Da mobile via IP usa npm run dev:https, poi accedi da https://TUO_IP:3000"
      );
      return;
    }
    setNfcScanning(true);
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
        setMsg("Tag NFC non associato a nessun materiale.");
        return;
      }
      await pickItemByCode((shelf as any).code);
    } catch (e: any) {
      setMsg(e?.message ?? "Errore NFC");
    } finally {
      setNfcScanning(false);
    }
  }

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

    if (warehouseFilter === "PRM" && stock.PRM <= 0) return "In PRM non c’è giacenza.";
    if (warehouseFilter === "REALE" && stock.REALE <= 0) return "In REALE non c’è giacenza.";
    return null;
  }, [picked, stock, warehouseFilter]);

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Dashboard</div>
      </div>

      <div className="filtersRow" style={{ padding: 12 }}>
        <div style={{ opacity: 0.85, marginBottom: 14 }}>Panoramica rapida di anagrafica e operatività.</div>

      {/* ✅ CERCA MATERIALE + BARCODE */}
      <div className="glass" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}> Controllo veloce materiale</div>
            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
              Cerca per codice/descrizione o scansiona. Vedi giacenze PRM/REALE, dove si trova e lo scaffale.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="input mobileInputFull"
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value as any)}
              style={{ width: 170 }}
              aria-label="Filtro magazzino"
            >
              <option value="ALL">Tutti i magazzini</option>
              <option value="PRM">Solo PRM</option>
              <option value="REALE">Solo REALE</option>
            </select>
            <button
              type="button"
              className="btn"
              onClick={() => (scanning ? stopScan() : startScan())}
              disabled={nfcScanning}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <BarcodeIcon />
              {scanning ? "Chiudi camera" : "Barcode"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={startNfcScan}
              disabled={scanning || nfcScanning}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {nfcScanning ? <SpinnerIcon /> : <NfcIcon />}
              {nfcScanning ? "NFC..." : "NFC"}
            </button>
            <button type="button" className="btn" onClick={resetSearch} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SearchIcon />
              Pulisci
            </button>
          </div>
        </div>

        <div ref={boxRef} style={{ position: "relative", marginTop: 12 }}>
          <label className="label" htmlFor="searchMaterial" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <SearchIcon />
            Ricerca manuale
          </label>
          <input
            id="searchMaterial"
            className="input"
            value={search}
            onChange={(e) => {
              const v = e.target.value;
      setSearch(v);
      setOpen(true);
      setPicked(null);
      setStock(null);
      setShelves(null);
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

        <div style={{ marginTop: 12, display: scanning ? "block" : "none" }}>
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
                  UM: <b>{picked.um ?? "-"}</b> · Presente in: <b>{where}</b>
                </div>
              </div>

              <div className="glass">
                <div style={{ opacity: 0.85, fontSize: 12 }}>PRM</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stock.PRM}</div>
                {shelves?.PRM ? (
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: "#0284c7" }}>
                    Scaffale · Luogo: {shelves.PRM}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Posizione non assegnata</div>
                )}
              </div>

              <div className="glass">
                <div style={{ opacity: 0.85, fontSize: 12 }}>REALE</div>
                <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stock.REALE}</div>
                {shelves?.REALE ? (
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: "#7c3aed" }}>
                    Scaffale · Luogo: {shelves.REALE}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Posizione non assegnata</div>
                )}
              </div>
            </div>

            {(shelves?.PRM || shelves?.REALE) && (
              <div
                className="glass"
                style={{
                  marginTop: 12,
                  padding: 14,
                  background: "linear-gradient(135deg, rgba(2,132,199,0.08) 0%, rgba(124,58,237,0.08) 100%)",
                  border: "1px solid rgba(15,23,42,0.1)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>Dove si trova</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 15, fontWeight: 800 }}>
                  {shelves?.PRM && stock && stock.PRM > 0 && (
                    <span>
                      PRM: <span style={{ color: "#0284c7" }}>{shelves.PRM}</span>
                    </span>
                  )}
                  {shelves?.REALE && stock && stock.REALE > 0 && (
                    <span>
                      REALE: <span style={{ color: "#7c3aed" }}>{shelves.REALE}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

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

        <div className="tableWrap" style={{ marginTop: 10 }}>
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
                      <span className={m.type === "IN" ? "badgeIn" : "badgeOut"}>
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
    </main>
  );
}