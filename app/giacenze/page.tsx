"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "../_lib/supabase/client";
<a href="/logout" style={{ color: "white" }}>
  🔓 Logout
</a>

const PAGE_SIZE = 25;

type DbItem = {
  code: string;
  name: string;
  um: string | null;
  warehouse: string | null;
  warehouse_desc: string | null;
  qty_free: number | null;
  qty_blocked: number | null;
  qty_quality: number | null;
  initial_qty: number | null;
};

type DbMovement = {
  id: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
};

export default function GiacenzePage() {
  const supabase = createClient();

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<DbItem[]>([]);
  const [count, setCount] = useState(0);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  async function load() {
    setLoading(true);

    // filtro: cerchiamo su code o name
    const search = q.trim();
    let query = supabase.from("items").select("*", { count: "exact" });

    if (search) {
      // OR: code ilike OR name ilike
      query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count: c } = await query
      .order("code", { ascending: true })
      .range(from, to);

    if (error) {
      console.error(error);
      setItems([]);
      setCount(0);
      setStockMap({});
      setLoading(false);
      return;
    }

    const list = (data ?? []) as DbItem[];
    setItems(list);
    setCount(c ?? 0);

    // calcolo stock per SOLO gli item della pagina
    const codes = list.map((i) => i.code);
    if (codes.length === 0) {
      setStockMap({});
      setLoading(false);
      return;
    }

    const { data: movs, error: e2 } = await supabase
      .from("movements")
      .select("id,type,code,qty")
      .in("code", codes);

    if (e2) {
      console.error(e2);
      // se non riesce movimenti, mostriamo solo initial_qty
      const fallback: Record<string, number> = {};
      for (const it of list) fallback[it.code] = Number(it.initial_qty ?? 0);
      setStockMap(fallback);
      setLoading(false);
      return;
    }

    const mlist = (movs ?? []) as DbMovement[];
    const delta: Record<string, number> = {};
    for (const m of mlist) {
      const prev = delta[m.code] ?? 0;
      const v = Number(m.qty ?? 0);
      delta[m.code] = prev + (m.type === "IN" ? v : -v);
    }

    const sm: Record<string, number> = {};
    for (const it of list) {
      sm[it.code] = Number(it.initial_qty ?? 0) + (delta[it.code] ?? 0);
    }
    setStockMap(sm);

    setLoading(false);
  }

  // ricarica quando cambia page o ricerca
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const rows = useMemo(() => {
    return items.map((it) => ({
      ...it,
      stock: stockMap[it.code] ?? Number(it.initial_qty ?? 0),
    }));
  }, [items, stockMap]);

  function exportXlsx() {
    const data = rows.map((r) => ({
      Materiale: r.code,
      "Descrizione Materiale": r.name,
      Magazzino: [r.warehouse, r.warehouse_desc].filter(Boolean).join(" - "),
      UM: r.um ?? "",
      "Qnt. Libero": r.qty_free ?? 0,
      "Qnt. Bloccato": r.qty_blocked ?? 0,
      "Qnt. CQ": r.qty_quality ?? 0,
      "TOTALE (iniziale)": r.initial_qty ?? 0,
      "Giacenza attuale": r.stock ?? 0,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Giacenze");
    XLSX.writeFile(wb, `giacenze_pagina_${page}.xlsx`);
  }

  return (
    <main style={{ fontFamily: "system-ui" }}>
      <h1>📦 Giacenze</h1>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca (codice o descrizione)…"
          style={{
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.10)",
            color: "white",
            outline: "none",
            minWidth: 280,
          }}
        />
        <button
          onClick={() => load()}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.10)",
            color: "white",
            cursor: "pointer",
          }}
        >
          Aggiorna
        </button>
        <button
          onClick={exportXlsx}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.10)",
            color: "white",
            cursor: "pointer",
          }}
        >
          ⬇️ Export pagina
        </button>

        <a href="/movimenti" style={{ alignSelf: "center", color: "white" }}>
          ➕/➖ Movimenti
        </a>
        <a href="/import" style={{ alignSelf: "center", color: "white" }}>
          📥 Import
        </a>
      </div>

      {loading ? (
        <p>Caricamento…</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "rgba(255,255,255,0.85)", borderRadius: 16, overflow: "hidden" }}>
              <thead>
                <tr>
                  {["Materiale", "Descrizione", "Magazzino", "UM", "Libero", "Bloccato", "CQ", "TOTALE", "Attuale"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", color: "#0f172a" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code}>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap", color: "#0f172a" }}>{r.code}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>{r.name}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                      {[r.warehouse, r.warehouse_desc].filter(Boolean).join(" - ")}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>{r.um ?? ""}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>{r.qty_free ?? 0}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>{r.qty_blocked ?? 0}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>{r.qty_quality ?? 0}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>{r.initial_qty ?? 0}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", color: "#0f172a" }}>
                      <b>{r.stock ?? 0}</b>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 12, color: "#0f172a" }}>
                      Nessun risultato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", color: "white" }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.10)",
                color: "white",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                opacity: page <= 1 ? 0.6 : 1,
              }}
            >
              ← Precedente
            </button>

            <span>
              Pagina <b>{page}</b> di <b>{totalPages}</b> · Totale righe: <b>{count}</b>
            </span>

            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.10)",
                color: "white",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                opacity: page >= totalPages ? 0.6 : 1,
              }}
            >
              Successiva →
            </button>
          </div>
        </>
      )}
    </main>
  );
}