/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { BrowserMultiFormatReader } from "@zxing/browser";
import AppScanStatusModal from "../_components/AppScanStatusModal";

type Movement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by_name: string | null;
  warehouse: "PRM" | "REALE" | null;
  status?: "OPEN" | "CLOSED" | null;
  returned_qty?: number | null;
  return_note?: string | null;
  referee_email?: string | null;
  referee_name?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  movement_group_id?: string | null;
};

type DashboardMovementEntry = {
  key: string;
  lead: Movement;
  rows: Movement[];
  isGroup: boolean;
  qty: number;
  notes: string;
  warehouses: string;
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

  const [loading, setLoading] = useState(true);
  const [itemsCount, setItemsCount] = useState<number>(0);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [selectedMovementEntry, setSelectedMovementEntry] = useState<DashboardMovementEntry | null>(null);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    const { count: cItems, error: eItems } = await supabase
      .from("items")
      .select("code", { count: "exact", head: true });

    const { data: movs, error: eMovs } = await supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,created_by_name,warehouse,status,returned_qty,return_note,referee_email,referee_name,closed_at,closed_by,movement_group_id")
      .order("created_at", { ascending: false })
      .limit(100);

    if (eItems) console.error(eItems);
    if (eMovs) console.error(eMovs);

    setItemsCount(cItems ?? 0);
    const nextMovements = (movs ?? []) as Movement[];
    setMovements(nextMovements);

    const codes = Array.from(new Set(nextMovements.map((m) => m.code).filter(Boolean)));
    if (codes.length > 0) {
      const { data: itemsData, error: itemsErr } = await supabase.from("items").select("code,name").in("code", codes);
      if (itemsErr) {
        console.error(itemsErr);
        setNameMap({});
      } else {
        const nextNameMap: Record<string, string> = {};
        for (const item of itemsData ?? []) {
          const code = String((item as any).code ?? "");
          if (code) nextNameMap[code] = String((item as any).name ?? "").trim();
        }
        setNameMap(nextNameMap);
      }
    } else {
      setNameMap({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    return () => stopScan();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("materiali-movements")
      .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, () => void loadData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  useEffect(() => {
    setIsNfcSupported(typeof (window as any).NDEFReader !== "undefined");
  }, []);

  async function startNfcScan() {
    if (!isNfcSupported) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setMsg(
        isIOS
          ? "NFC non disponibile su iPhone/iPad. Usa Barcode / QR o ricerca manuale."
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

  function stopNfcScan() {
    setNfcScanning(false);
  }

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
    if (!open) return;

    const t = setTimeout(() => {
      loadSuggestions(search);
    }, 220);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const filteredSuggestions = useMemo(() => {
    if (warehouseFilter === "ALL") return suggestions;
    return suggestions;
  }, [suggestions, warehouseFilter]);

  const active = useMemo(() => filteredSuggestions[activeIndex], [filteredSuggestions, activeIndex]);

  const movementsToday = useMemo(() => {
    const today = new Date();
    return movements.filter((m) => isSameDay(new Date(m.created_at), today)).length;
  }, [movements]);

  const lastMovement = movements[0] ?? null;
  const last10 = useMemo(() => {
    const entries: Array<{ key: string; lead: Movement; rows: Movement[] }> = [];
    const groups = new Map<string, { key: string; lead: Movement; rows: Movement[] }>();

    for (const movement of movements) {
      const gid = typeof movement.movement_group_id === "string" && movement.movement_group_id.trim()
        ? movement.movement_group_id
        : null;

      if (!gid) {
        entries.push({
          key: movement.id,
          lead: movement,
          rows: [movement],
        });
        continue;
      }

      const existing = groups.get(gid);
      if (existing) {
        existing.rows.push(movement);
        continue;
      }

      const entry = { key: gid, lead: movement, rows: [movement] };
      groups.set(gid, entry);
      entries.push(entry);
    }

    return entries.slice(0, 10).map((entry) => {
      const isGroup = entry.rows.length > 1;
      const qty = entry.rows.reduce((sum, row) => sum + Math.abs(Number(row.qty ?? 0)), 0);
      const notes = Array.from(new Set(entry.rows.map((row) => (row.note ?? "").trim()).filter(Boolean))).join(" · ");
      const warehouses = Array.from(new Set(entry.rows.map((row) => row.warehouse).filter(Boolean))).join(" + ") || "-";
      return {
        ...entry,
        isGroup,
        qty,
        notes,
        warehouses,
      };
    });
  }, [movements]);
  const where = stock ? whereLabel(stock) : "";
  const movementStatusLabel = useCallback((movement: Movement) => {
    if (movement.type === "IN") return "CHIUSO";
    return movement.status === "CLOSED" ? "CHIUSO" : "APERTO";
  }, []);
  const movementNetQty = useCallback((movement: Movement) => {
    const outQty = Math.abs(n(movement.qty));
    if (movement.type !== "OUT") return outQty;
    return Math.max(0, outQty - n(movement.returned_qty));
  }, []);
  const movementReferent = useCallback((movement: Movement) => {
    const parts = [movement.referee_name, movement.referee_email].map((v) => (v ?? "").trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "-";
  }, []);

  const filterHint = useMemo(() => {
    if (!picked || !stock) return null;

    if (warehouseFilter === "PRM" && stock.PRM <= 0) return "In PRM non c’è inventario.";
    if (warehouseFilter === "REALE" && stock.REALE <= 0) return "In REALE non c’è inventario.";
    return null;
  }, [picked, stock, warehouseFilter]);

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Materiali - Dashboard</div>
      </div>

      <div className="filtersRow" style={{ padding: 12 }}>
        <div style={{ opacity: 0.85, marginBottom: 14 }}>Panoramica rapida di anagrafica e operatività.</div>

        <div className="glass" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}> Controllo veloce materiale</div>
              <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
                Cerca per codice/descrizione o scansiona Barcode / QR. Vedi inventario PRM/REALE, dove si trova e lo scaffale.
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
                {scanning ? "Chiudi camera" : "Barcode / QR"}
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

          <AppScanStatusModal
            open={scanning || nfcScanning}
            mode={scanning ? "barcode" : "nfc"}
            videoRef={videoRef}
            icon={<SpinnerIcon />}
            onClose={scanning ? stopScan : stopNfcScan}
            barcodeTitle="Scanner Barcode / QR"
            barcodeHint="Inquadra il barcode o il QR code"
          />

          {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}

          {picked && stock && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
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
                  last10.map((entry) => (
                    <tr
                      key={entry.key}
                      onClick={() => setSelectedMovementEntry(entry)}
                      style={{ cursor: "pointer" }}
                      title="Apri il dettaglio movimento"
                    >
                      <td>{fmtDate(entry.lead.created_at)}</td>
                      <td>
                        <span className={entry.lead.type === "IN" ? "badgeIn" : "badgeOut"}>
                          {entry.lead.type === "IN" ? "Entrata" : "Uscita"}
                        </span>
                      </td>
                      <td>{entry.isGroup ? `Prelievo multiplo (${entry.rows.length} articoli)` : entry.lead.code}</td>
                      <td>{entry.warehouses}</td>
                      <td>
                        {entry.lead.type === "IN" ? "+" : "-"}
                        {entry.qty}
                      </td>
                      <td>{entry.notes}</td>
                      <td>{entry.lead.created_by_name ?? "-"}</td>
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

      {selectedMovementEntry && (
        <div
          onMouseDown={() => setSelectedMovementEntry(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 10050,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(900px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.12)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>
                  {selectedMovementEntry.isGroup
                    ? `Prelievo multiplo (${selectedMovementEntry.rows.length} articoli)`
                    : `Movimento ${selectedMovementEntry.lead.code}`}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                  {fmtDate(selectedMovementEntry.lead.created_at)} · {selectedMovementEntry.lead.type === "IN" ? "Entrata" : "Uscita"}
                </div>
              </div>
              <button className="btn" type="button" onClick={() => setSelectedMovementEntry(null)}>
                Chiudi
              </button>
            </div>

            {selectedMovementEntry.isGroup ? (
              <>
                <div
                  style={{
                    marginBottom: 16,
                    padding: 12,
                    background: "#f8fafc",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Articoli</div>
                    <div style={{ fontWeight: 900 }}>{selectedMovementEntry.rows.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Magazzini</div>
                    <div style={{ fontWeight: 900 }}>{selectedMovementEntry.warehouses}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Quantità totale uscita</div>
                    <div style={{ fontWeight: 900 }}>{selectedMovementEntry.qty}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Inserito da</div>
                    <div style={{ fontWeight: 900 }}>{selectedMovementEntry.lead.created_by_name ?? "-"}</div>
                  </div>
                </div>

                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Codice</th>
                        <th>Descrizione</th>
                        <th>Magazzino</th>
                        <th>Q.tà uscita</th>
                        <th>Q.tà rientro</th>
                        <th>Q.tà netta</th>
                        <th>Stato</th>
                        <th>Referente</th>
                        <th>Nota apertura</th>
                        <th>Nota rientro</th>
                        <th>Inserito da</th>
                        <th>Chiuso da</th>
                        <th>Data chiusura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMovementEntry.rows.map((row) => (
                        <tr key={row.id}>
                          <td style={{ fontWeight: 900 }}>{row.code}</td>
                          <td>{nameMap[row.code] ?? "-"}</td>
                          <td>{row.warehouse ?? "-"}</td>
                          <td>{Math.abs(n(row.qty))}</td>
                          <td>{row.type === "OUT" ? n(row.returned_qty) : "-"}</td>
                          <td>{movementNetQty(row)}</td>
                          <td>{movementStatusLabel(row)}</td>
                          <td>{movementReferent(row)}</td>
                          <td>{row.note ?? "-"}</td>
                          <td>{row.return_note ?? "-"}</td>
                          <td>{row.created_by_name ?? "-"}</td>
                          <td>{row.closed_by ?? "-"}</td>
                          <td>{row.closed_at ? fmtDate(row.closed_at) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="tableWrap">
                <table className="table">
                  <tbody>
                    <tr>
                      <td style={{ width: 220, fontWeight: 800 }}>Codice</td>
                      <td>{selectedMovementEntry.lead.code}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Descrizione</td>
                      <td>{nameMap[selectedMovementEntry.lead.code] ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Tipo</td>
                      <td>{selectedMovementEntry.lead.type === "IN" ? "Entrata" : "Uscita"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Stato</td>
                      <td>{movementStatusLabel(selectedMovementEntry.lead)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Magazzino</td>
                      <td>{selectedMovementEntry.lead.warehouse ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Quantità uscita</td>
                      <td>{Math.abs(n(selectedMovementEntry.lead.qty))}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Quantità rientro</td>
                      <td>{selectedMovementEntry.lead.type === "OUT" ? n(selectedMovementEntry.lead.returned_qty) : "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Quantità netta</td>
                      <td>{movementNetQty(selectedMovementEntry.lead)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Nota apertura</td>
                      <td>{selectedMovementEntry.lead.note ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Nota rientro</td>
                      <td>{selectedMovementEntry.lead.return_note ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Referente</td>
                      <td>{movementReferent(selectedMovementEntry.lead)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Inserito da</td>
                      <td>{selectedMovementEntry.lead.created_by_name ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Chiuso da</td>
                      <td>{selectedMovementEntry.lead.closed_by ?? "-"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 800 }}>Data chiusura</td>
                      <td>{selectedMovementEntry.lead.closed_at ? fmtDate(selectedMovementEntry.lead.closed_at) : "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
