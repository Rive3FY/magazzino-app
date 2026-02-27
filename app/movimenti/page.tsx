"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMovement,
  deleteMovement,
  getItems,
  getMovements,
  getStockByCode,
} from "../_lib/store";

function fmtDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export default function MovimentiPage() {
  const [items, setItems] = useState<ReturnType<typeof getItems>>([]);
  const [movs, setMovs] = useState<ReturnType<typeof getMovements>>([]);
  const [ready, setReady] = useState(false);

  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // Autocomplete
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  function refreshAll() {
    setItems(getItems());
    setMovs(getMovements());
  }

  useEffect(() => {
    refreshAll();
    setReady(true);
  }, []);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    return items
      .filter((i) => (i.code + " " + i.name).toLowerCase().includes(s))
      .slice(0, 12); // massimo 12 risultati in finestra
  }, [items, search]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const selected = useMemo(
    () => items.find((i) => i.code === code),
    [items, code]
  );

  const selectedStock = useMemo(() => {
    if (!code) return null;
    return getStockByCode(code);
  }, [code, movs]);

  function pickItem(it: { code: string; name: string }) {
    setCode(it.code);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
  }

  // chiudi la finestra se clicchi fuori
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function save() {
    setMsg(null);

    if (!code) return setMsg("Seleziona un Materiale (scrivi e clicca un risultato).");
    const n = Number(qty.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return setMsg("Quantità non valida (deve essere > 0).");

    if (type === "OUT") {
      const current = getStockByCode(code);
      if (current - n < 0) {
        return setMsg(`Uscita non possibile: giacenza ${current} → diventerebbe ${current - n}.`);
      }
    }

    addMovement({ type, code, qty: n, note: note.trim() || undefined });
    setQty("");
    setNote("");
    setMsg("Movimento salvato ✅");
    refreshAll();
  }

  function removeMovement(id: string) {
    deleteMovement(id);
    refreshAll();
  }

  const movFiltered = useMemo(() => {
    if (!code) return movs.slice(0, 200);
    return movs.filter((m) => m.code === code).slice(0, 200);
  }, [movs, code]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100 }}>
      <h1>➕/➖ Movimenti</h1>

      {!ready ? (
        <p>Caricamento…</p>
      ) : items.length === 0 ? (
        <p>
          Nessun articolo trovato. Prima fai <a href="/import">Import Excel</a>.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 12, marginTop: 12, maxWidth: 800 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setType("IN")}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  fontWeight: type === "IN" ? "700" : "400",
                }}
              >
                ➕ Entrata
              </button>
              <button
                onClick={() => setType("OUT")}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  fontWeight: type === "OUT" ? "700" : "400",
                }}
              >
                ➖ Uscita
              </button>
              <a href="/giacenze" style={{ alignSelf: "center" }}>
                📦 Giacenze
              </a>
            </div>

            {/* ✅ AUTOCOMPLETE */}
            <div ref={boxRef} style={{ position: "relative" }}>
              <label>
                Materiale (scrivi per cercare)
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOpen(true);
                    setCode(""); // finché non scegli un risultato, non selezioniamo
                  }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={(e) => {
                    if (!open) return;

                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.min(i + 1, filteredItems.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const it = filteredItems[activeIndex];
                      if (it) pickItem(it);
                    } else if (e.key === "Escape") {
                      setOpen(false);
                    }
                  }}
                  placeholder="es. 12345 oppure bullone..."
                  style={{
                    display: "block",
                    marginTop: 6,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    width: "100%",
                  }}
                />
              </label>

              {open && search.trim() && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: 6,
                    background: "white",
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                    overflow: "hidden",
                    zIndex: 50,
                  }}
                >
                  {filteredItems.length === 0 ? (
                    <div style={{ padding: 12, color: "#666" }}>Nessun risultato</div>
                  ) : (
                    filteredItems.map((it, idx) => (
                      <div
                        key={it.code}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => {
                          // onMouseDown per evitare che blur chiuda prima del click
                          e.preventDefault();
                          pickItem(it);
                        }}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          background: idx === activeIndex ? "#f1f5f9" : "white",
                          borderTop: idx === 0 ? "none" : "1px solid #f0f0f0",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{it.code}</div>
                        <div style={{ fontSize: 12, color: "#555" }}>{it.name}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {selected && (
              <div style={{ color: "#555", fontSize: 14 }}>
                <div>
                  Magazzino:{" "}
                  <b>
                    {[selected.warehouse, selected.warehouseDesc]
                      .filter(Boolean)
                      .join(" - ") || "-"}
                  </b>
                </div>
                <div>
                  UM: <b>{selected.um ?? "-"}</b> · TOTALE iniziale: <b>{selected.initialQty}</b>
                  {selectedStock !== null && (
                    <>
                      {" "}
                      · Giacenza attuale: <b>{selectedStock}</b>
                    </>
                  )}
                </div>
              </div>
            )}

            <label>
              Quantità
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="es. 5"
                style={{
                  display: "block",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  width: "100%",
                }}
              />
            </label>

            <label>
              Note (opzionale)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="es. DDT 123 / commessa / cliente"
                style={{
                  display: "block",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  width: "100%",
                }}
              />
            </label>

            <button
              onClick={save}
              style={{ padding: 12, borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
            >
              Salva movimento
            </button>

            {msg && <p style={{ margin: 0 }}>{msg}</p>}
          </div>

          <h2 style={{ marginTop: 28 }}>📜 Storico movimenti {code ? `(solo ${code})` : "(ultimi)"}</h2>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Data", "Tipo", "Materiale", "Quantità", "Note", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 8,
                        borderBottom: "1px solid #ddd",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movFiltered.map((m) => (
                  <tr key={m.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>
                      {fmtDate(m.date)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {m.type === "IN" ? "Entrata" : "Uscita"}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{m.code}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {m.type === "IN" ? "+" : "-"}
                      {m.qty}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{m.note ?? ""}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      <button
                        onClick={() => removeMovement(m.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          cursor: "pointer",
                        }}
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
                {movFiltered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 12 }}>
                      Nessun movimento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: 24 }}>
            <a href="/">← Home</a>
          </p>
        </>
      )}
    </main>
  );
}