"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "../_lib/supabase/client";

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

    const search = q.trim();
    let query = supabase.from("items").select("*", { count: "exact" });

    if (search) {
      query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count: c } = await query.order("code", { ascending: true }).range(from, to);

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

    const codes = list.map((i) => i.code);
    if (codes.length === 0) {
      setStockMap({});
      setLoading(false);
      return;
    }

    const { data: movs, error: e2 } = await supabase.from("movements").select("id,type,code,qty").in("code", codes);

    if (e2) {
      console.error(e2);
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
    <main className="panel">
      {/* Barra teal stile ERP */}
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Elaborazione giacenze</div>
        <div className="pageBarRight">
          <button className="btn" onClick={() => load()} title="Aggiorna">
            ⟳
          </button>
        </div>
      </div>

      {/* Filtri sopra tabella */}
      <div className="filters">
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>Filtro articoli</label>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtra per codice, descrizione..."
          />
        </div>

        <div className="field">
          <label>&nbsp;</label>
          <button className="btn btnPrimary" onClick={() => load()}>
            Elabora
          </button>
        </div>

        <div className="field">
          <label>&nbsp;</label>
          <button className="btn btnBlue" onClick={() => load()}>
            Aggiorna
          </button>
        </div>

        <div className="field">
          <label>&nbsp;</label>
          <button className="btn btnOrange" onClick={exportXlsx}>
            Esporta
          </button>
        </div>
      </div>

      {/* Riga azioni + paginazione (stile gestionale) */}
      <div className="actionsRow">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn" href="/movimenti">
            Movimenti
          </a>
          <a className="btn" href="/import">
            Import
          </a>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ←
          </button>

          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {page} / {totalPages} · Righe: {count}
          </span>

          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            →
          </button>
        </div>
      </div>

      {/* Tabella */}
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              {["Codice", "Descrizione", "Magazzino", "UM", "Carico", "Scarico", "CQ", "TOTALE", "Giacenza"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9}>Caricamento…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9}>Nessun risultato.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.code}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{[r.warehouse, r.warehouse_desc].filter(Boolean).join(" - ")}</td>
                  <td>{r.um ?? ""}</td>
                  <td>{r.qty_free ?? 0}</td>
                  <td>{r.qty_blocked ?? 0}</td>
                  <td>{r.qty_quality ?? 0}</td>
                  <td style={{ fontWeight: 900 }}>{r.initial_qty ?? 0}</td>
                  <td style={{ fontWeight: 900 }}>{r.stock ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}