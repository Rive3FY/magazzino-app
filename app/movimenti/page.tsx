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
};

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

export default function MovimentiPage() {
  const supabase = createClient();

  const [ready, setReady] = useState(false);

  // inserimento movimento
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // utente/permessi
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // filtri storico
  const [dateFrom, setDateFrom] = useState(""); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState("");     // yyyy-mm-dd
  const [typeFilter, setTypeFilter] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [wh, setWh] = useState<string>("ALL");
  const [whOptions, setWhOptions] = useState<Array<{ code: string; label: string }>>([]);

  // autocomplete
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLockedRef = useRef(false);

  // focus quantità
  const qtyRef = useRef<HTMLInputElement | null>(null);

  const [picked, setPicked] = useState<DbItem | null>(null);
  const [suggestions, setSuggestions] = useState<DbItem[]>([]);
  const [stock, setStock] = useState<number | null>(null);

  const [history, setHistory] = useState<DbMovement[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  // carica lista magazzini (da items)
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("items")
        .select("warehouse,warehouse_desc")
        .not("warehouse", "is", null)
        .limit(5000);

      if (!alive) return;

      if (error) {
        console.error("load warehouses error:", error);
        setWhOptions([]);
        return;
      }

      const map = new Map<string, string>();
      for (const r of data ?? []) {
        const code = (r as any).warehouse as string | null;
        const desc = (r as any).warehouse_desc as string | null;
        if (!code) continue;
        map.set(code, [code, desc].filter(Boolean).join(" - "));
      }

      const opts = Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([code, label]) => ({ code, label }));

      setWhOptions(opts);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const initial = Number(item?.initial_qty ?? 0);

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

  // helper: se filtro magazzino e non ho colonna warehouse in movements,
  // filtro tramite items: prendo i codici del magazzino e li applico a movements.
  async function codesForWarehouse(warehouseCode: string): Promise<string[] | null> {
    if (warehouseCode === "ALL") return null;

    const { data, error } = await supabase
      .from("items")
      .select("code")
      .eq("warehouse", warehouseCode)
      .limit(5000);

    if (error) {
      console.error("codesForWarehouse error:", error);
      return [];
    }

    const codes = (data ?? []).map((r) => (r as any).code as string).filter(Boolean);
    return codes;
  }

  async function loadHistory(code?: string) {
    let q = supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,created_by_email")
      .order("created_at", { ascending: false })
      .limit(200);

    if (code) q = q.eq("code", code);

    if (typeFilter !== "ALL") q = q.eq("type", typeFilter);

    if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);

    // filtro magazzino (via items->codes)
    const codes = await codesForWarehouse(wh);
    if (codes && codes.length === 0) {
      setHistory([]);
      setNameMap({});
      return;
    }
    if (codes && codes.length > 0) q = q.in("code", codes);

    const { data, error } = await q;

    if (error) {
      console.error("loadHistory error:", error);
      setHistory([]);
      setNameMap({});
      return;
    }

    const rows = (data ?? []) as DbMovement[];
    setHistory(rows);

    const uniqCodes = Array.from(new Set(rows.map((r) => r.code).filter(Boolean)));
    if (uniqCodes.length === 0) {
      setNameMap({});
      return;
    }

    const { data: itemsData, error: e2 } = await supabase
      .from("items")
      .select("code,name")
      .in("code", uniqCodes);

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
    await computeStockFor(it.code);
    await loadHistory(it.code);
  }

  async function pickItemByCode(scannedCode: string) {
    const code = scannedCode.trim();
    if (!code) return;

    setType("OUT");
    setQty("");

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
    setMsg(null);

    setTimeout(() => {
      const ae = document.activeElement as HTMLElement | null;
      const isTypingElsewhere =
        ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") && ae !== qtyRef.current;
      if (!isTypingElsewhere) qtyRef.current?.focus();
    }, 120);
  }

  async function startScan() {
    setMsg(null);
    setOpen(false);
    scanLockedRef.current = false;
    setScanning(true);

    await new Promise((r) => setTimeout(r, 120));

    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();

    try {
      const videoEl = videoRef.current;
      if (!videoEl) throw new Error("Video non disponibile");

      await readerRef.current.decodeFromVideoDevice(undefined, videoEl, async (result) => {
        if (!result) return;
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
      (readerRef.current as any)?.stopContinuousDecode?.();
    } catch {}
    try {
      const v = videoRef.current;
      const stream = v?.srcObject as MediaStream | null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    } catch {}
    setScanning(false);
  }

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

  // quando cambiano i filtri dello storico, ricarico (se ho picked -> solo quel codice)
  useEffect(() => {
    loadHistory(picked?.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, typeFilter, wh]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  async function save() {
    setMsg(null);

    if (!userId) return setMsg("Devi essere loggato per salvare movimenti.");
    if (!picked) return setMsg("Seleziona un materiale (scrivi per cercare o scansiona).");

    const n = toNumber(qty);
    if (!Number.isFinite(n) || n <= 0) return setMsg("Quantità non valida (deve essere > 0).");

    if (type === "OUT") {
      const current = stock ?? 0;
      if (current - n < 0) {
        return setMsg(`Uscita non possibile: giacenza ${current} → diventerebbe ${current - n}.`);
      }
    }

    const { error } = await supabase.from("movements").insert({
      type,
      code: picked.code,
      qty: n,
      note: note.trim() || null,
      created_by: userId,
      created_by_email: userEmail,
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
    if (!isAdmin) {
      alert("Solo l'admin può eliminare i movimenti.");
      return;
    }

    const ok = confirm("Eliminare questo movimento?");
    if (!ok) return;

    const { error } = await supabase.from("movements").delete().eq("id", id);

    if (error) {
      console.error("DELETE error:", error);
      alert("Non posso eliminare: " + error.message);
      return;
    }

    if (picked) {
      await computeStockFor(picked.code);
      await loadHistory(picked.code);
    } else {
      await loadHistory();
    }
  }

  const active = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Movimenti</div>
        <div className="pageBarRight" style={{ display: "flex", gap: 8 }}>
          <a className="btn" href="/giacenze">Giacenze</a>
          <a className="btn" href="/import">Import</a>
        </div>
      </div>

      {/* FILTRI STORICO (ERP) */}
      <div className="filters" style={{ gridTemplateColumns: "1fr 1fr 1fr 2fr" }}>
        <div className="field">
          <label>Data da</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className="field">
          <label>Data a</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <div className="field">
          <label>Tipo</label>
          <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
            <option value="ALL">Tutti</option>
            <option value="IN">Entrata</option>
            <option value="OUT">Uscita</option>
          </select>
        </div>

        <div className="field">
          <label>Magazzino</label>
          <select className="select" value={wh} onChange={(e) => setWh(e.target.value)}>
            <option value="ALL">Tutti</option>
            {whOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* INSERIMENTO MOVIMENTO */}
      <div className="actionsRow" style={{ borderTop: "1px solid #d9e1ea" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className={`btn ${type === "IN" ? "btnPrimary" : ""}`}
            onClick={() => setType("IN")}
          >
            Entrata
          </button>
          <button
            type="button"
            className={`btn ${type === "OUT" ? "btnPrimary" : ""}`}
            onClick={() => setType("OUT")}
          >
            Uscita
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn" onClick={() => (scanning ? stopScan() : startScan())}>
            {scanning ? "Ferma scanner" : "Scanner"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              stopScan();
              setSearch("");
              setPicked(null);
              setStock(null);
              setSuggestions([]);
              setOpen(false);
              setMsg(null);
              // ricarico storico con filtri correnti
              loadHistory();
            }}
          >
            Pulisci
          </button>
        </div>
      </div>

      {/* Autocomplete materiale */}
      <div className="actionsRow" style={{ position: "relative" }} ref={boxRef}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Materiale (codice o descrizione)</div>
          <input
            className="input"
            value={search}
            onChange={async (e) => {
              const v = e.target.value;
              setSearch(v);
              setOpen(true);
              setPicked(null);
              setStock(null);
              await loadSuggestions(v);
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
                left: 12,
                right: 12,
                top: "100%",
                marginTop: 6,
                background: "white",
                border: "1px solid #d9e1ea",
                borderRadius: 6,
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                overflow: "hidden",
                zIndex: 50,
              }}
            >
              {suggestions.length === 0 ? (
                <div style={{ padding: 10, color: "#1f2937" }}>Nessun risultato</div>
              ) : (
                suggestions.map((it, idx) => (
                  <div
                    key={it.code}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickItem(it);
                    }}
                    style={{
                      padding: "10px 12px",
                      cursor: "pointer",
                      background: idx === activeIndex ? "#f3f6fb" : "white",
                      borderTop: idx === 0 ? "none" : "1px solid #edf2f7",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{it.code}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{it.name}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ width: 160 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Quantità</div>
            <input
              ref={qtyRef}
              className="input"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="es. 5"
            />
          </div>

          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Note (opz.)</div>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="DDT / commessa / cliente" />
          </div>

          <button className="btn btnPrimary" onClick={save}>
            Salva
          </button>
        </div>
      </div>

      {scanning && (
        <div style={{ padding: 12, borderTop: "1px solid #d9e1ea" }}>
          <video ref={videoRef} style={{ width: "100%", borderRadius: 6, background: "black" }} muted playsInline />
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            Inquadra il codice a barre con la fotocamera.
          </div>
        </div>
      )}

      {picked && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid #d9e1ea", color: "#1f2937" }}>
          <b>{picked.code}</b> — {picked.name} · Magazzino:{" "}
          {([picked.warehouse, picked.warehouse_desc].filter(Boolean).join(" - ") || "-")} · UM: {picked.um ?? "-"} ·
          Iniziale: {picked.initial_qty ?? 0} · Giacenza: <b>{stock ?? 0}</b>
        </div>
      )}

      {msg ? (
        <div style={{ padding: "10px 12px", color: msg.includes("✅") ? "#065f46" : "#991b1b", fontWeight: 700 }}>
          {msg}
        </div>
      ) : null}

      {/* STORICO */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid #d9e1ea" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Storico movimenti {picked ? `(solo ${picked.code})` : "(ultimi)"}
          </h2>
          <span style={{ fontSize: 12, color: "#6b7280" }}>{isAdmin ? "Permessi: Admin" : "Permessi: Operatore"}</span>
        </div>
      </div>

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Codice</th>
              <th>Descrizione</th>
              <th>Q.tà</th>
              <th>Note</th>
              <th>Inserito da</th>
              <th>Azioni</th>
            </tr>
          </thead>

          <tbody>
            {!ready ? (
              <tr>
                <td colSpan={8}>Caricamento…</td>
              </tr>
            ) : history.length === 0 ? (
              <tr>
                <td colSpan={8}>Nessun movimento.</td>
              </tr>
            ) : (
              history.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDate(m.created_at)}</td>
                  <td>{m.type === "IN" ? <span className="badgeIn">Entrata</span> : <span className="badgeOut">Uscita</span>}</td>
                  <td>{m.code}</td>
                  <td>{nameMap[m.code] ?? "-"}</td>
                  <td>
                    {m.type === "IN" ? "+" : "-"}
                    {m.qty}
                  </td>
                  <td>{m.note ?? ""}</td>
                  <td>{m.created_by_email ?? "-"}</td>
                  <td>
                    {isAdmin ? (
                      <button className="btn" onClick={() => deleteMovement(m.id)}>
                        Elimina
                      </button>
                    ) : (
                      <span style={{ color: "#6b7280" }}>-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}