"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";

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
  updated_by_email: string | null;
  updated_at: string | null;
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

  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // utente loggato (per audit)
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // autocomplete
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [picked, setPicked] = useState<DbItem | null>(null);
  const [suggestions, setSuggestions] = useState<DbItem[]>([]);
  const [stock, setStock] = useState<number | null>(null);

  // storico + mappa code->name
  const [history, setHistory] = useState<DbMovement[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

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
      console.error("Errore suggestions:", error);
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
      console.error("Errore initial qty:", e1);
      setStock(null);
      return;
    }

    const initial = Number(item?.initial_qty ?? 0);

    const { data: movs, error: e2 } = await supabase
      .from("movements")
      .select("type,qty")
      .eq("code", code);

    if (e2) {
      console.error("Errore movements for stock:", e2);
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

  async function loadHistory(code?: string) {
    let q = supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,created_by_email,updated_by_email,updated_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (code) q = q.eq("code", code);

    const { data, error } = await q;

    if (error) {
      console.error("Errore loadHistory:", JSON.stringify(error, null, 2));
      setHistory([]);
      setNameMap({});
      return;
    }

    const rows = (data ?? []) as DbMovement[];
    setHistory(rows);

    // Carico nomi materiali (items) per i codici presenti nello storico
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
      console.error("Errore caricamento nomi:", JSON.stringify(e2, null, 2));
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

  useEffect(() => {
    setReady(true);
    loadHistory();

    // utente loggato per audit
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });

    // click fuori chiude tendina
    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  async function pickItem(it: DbItem) {
    setPicked(it);
    setSearch(`${it.code} — ${it.name}`);
    setOpen(false);
    await computeStockFor(it.code);
    await loadHistory(it.code);
  }

  async function save() {
    setMsg(null);

    if (!picked) return setMsg("Seleziona un materiale (scrivi e scegli dalla lista).");

    const n = toNumber(qty);
    if (!Number.isFinite(n) || n <= 0) return setMsg("Quantità non valida (deve essere > 0).");

    // blocco uscita sotto zero
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

      // audit
      created_by: userId,
      created_by_email: userEmail,
    });

    if (error) return setMsg("Errore salvataggio movimento: " + error.message);

    setQty("");
    setNote("");
    setMsg("Movimento salvato ✅");

    await computeStockFor(picked.code);
    await loadHistory(picked.code);
  }

  const active = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  return (
    <main style={{ fontFamily: "system-ui" }}>
      <h1>➕/➖ Movimenti</h1>

      {!ready ? (
        <p>Caricamento…</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 12, marginTop: 12, maxWidth: 820 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setType("IN")}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: type === "IN" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: type === "IN" ? 800 : 500,
                }}
              >
                ➕ Entrata
              </button>
              <button
                onClick={() => setType("OUT")}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: type === "OUT" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: type === "OUT" ? 800 : 500,
                }}
              >
                ➖ Uscita
              </button>
            </div>

            {/* AUTOCOMPLETE */}
            <div ref={boxRef} style={{ position: "relative" }}>
              <label style={{ color: "white" }}>
                Materiale (scrivi per cercare)
                <input
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
                  placeholder="es. 12345 oppure bullone..."
                  style={{
                    display: "block",
                    marginTop: 6,
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.25)",
                    background: "rgba(255,255,255,0.10)",
                    color: "white",
                    outline: "none",
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
                    background: "rgba(255,255,255,0.92)",
                    border: "1px solid rgba(15,23,42,0.10)",
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
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickItem(it);
                        }}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          background: idx === activeIndex ? "#eef2ff" : "white",
                          borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                        }}
                      >
                        <div style={{ fontWeight: 800, color: "#0f172a" }}>{it.code}</div>
                        <div style={{ fontSize: 12, color: "#334155" }}>{it.name}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {picked && (
              <div style={{ color: "rgba(255,255,255,0.90)", fontSize: 14 }}>
                <div>
                  Magazzino:{" "}
                  <b>
                    {[picked.warehouse, picked.warehouse_desc].filter(Boolean).join(" - ") || "-"}
                  </b>
                </div>
                <div>
                  UM: <b>{picked.um ?? "-"}</b> · Iniziale: <b>{picked.initial_qty ?? 0}</b> · Giacenza attuale:{" "}
                  <b>{stock ?? 0}</b>
                </div>
              </div>
            )}

            <label style={{ color: "white" }}>
              Quantità
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="es. 5"
                style={{
                  display: "block",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(255,255,255,0.10)",
                  color: "white",
                  outline: "none",
                  width: "100%",
                }}
              />
            </label>

            <label style={{ color: "white" }}>
              Note (opzionale)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="es. DDT 123 / commessa / cliente"
                style={{
                  display: "block",
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(255,255,255,0.10)",
                  color: "white",
                  outline: "none",
                  width: "100%",
                }}
              />
            </label>

            <button
              onClick={save}
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.14)",
                color: "white",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Salva movimento
            </button>

            {msg && <p style={{ margin: 0, color: "white" }}>{msg}</p>}
          </div>

          <h2 style={{ marginTop: 26, color: "white" }}>
            📜 Storico movimenti {picked ? `(solo ${picked.code})` : "(ultimi)"}
          </h2>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "rgba(255,255,255,0.85)",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <thead>
                <tr>
                  {["Data", "Tipo", "Codice", "Descrizione", "Quantità", "Note", "Inserito da"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 10,
                        borderBottom: "1px solid #e5e7eb",
                        color: "#0f172a",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id}>
                    <td
                      style={{
                        padding: 10,
                        borderBottom: "1px solid #f1f5f9",
                        color: "#0f172a",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtDate(m.created_at)}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                      {m.type === "IN" ? "Entrata" : "Uscita"}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                      {m.code}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                      {nameMap[m.code] ?? "-"}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                      {m.type === "IN" ? "+" : "-"}
                      {m.qty}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                      {m.note ?? ""}
                    </td>
                    <td
                      style={{
                        padding: 10,
                        borderBottom: "1px solid #f1f5f9",
                        color: "#0f172a",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.created_by_email ?? "-"}
                    </td>
                  </tr>
                ))}

                {history.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: "#0f172a" }}>
                      Nessun movimento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}